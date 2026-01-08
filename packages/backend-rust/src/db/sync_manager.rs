use std::collections::HashSet;
use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use serde_json::{Map, Value};
use sqlx::{PgPool, Postgres, Row, SqlitePool};

use crate::db::change_log::{ChangeLogEntry, SqliteChangeLogManager};
use crate::db::conflict_resolver::{ConflictWinner, ConflictResolver};
use crate::db::schema_registry::{is_valid_identifier, SchemaRegistry, TableSchema};
use crate::db::type_mapper::{sqlite_json_to_pg, PgBindValue};
use crate::db::config::SyncConfig;

#[derive(Debug, Clone)]
pub struct SyncErrorEntry {
    pub change_id: i64,
    pub error: String,
}

#[derive(Debug, Clone)]
pub struct SyncResult {
    pub success: bool,
    pub synced_count: u64,
    pub conflict_count: u64,
    pub errors: Vec<SyncErrorEntry>,
    pub duration_ms: u64,
    pub pending_conflicts: u64,
}

#[derive(Clone)]
pub struct SyncManager {
    primary: PgPool,
    fallback: SqlitePool,
    registry: Arc<SchemaRegistry>,
    conflict_resolver: ConflictResolver,
    changelog: SqliteChangeLogManager,
    config: SyncConfig,
}

impl SyncManager {
    pub fn new(
        primary: PgPool,
        fallback: SqlitePool,
        registry: Arc<SchemaRegistry>,
        conflict_resolver: ConflictResolver,
        config: SyncConfig,
    ) -> Self {
        let changelog = SqliteChangeLogManager::new(fallback.clone());
        Self {
            primary,
            fallback,
            registry,
            conflict_resolver,
            changelog,
            config,
        }
    }

    pub async fn pending_conflict_ids(&self) -> Result<HashSet<i64>, sqlx::Error> {
        let rows = sqlx::query(r#"SELECT "change_id" FROM "_sync_conflicts" WHERE "resolved_at" IS NULL"#)
            .fetch_all(&self.fallback)
            .await?;
        let mut ids = HashSet::new();
        for row in rows {
            if let Ok(id) = row.try_get::<i64, _>("change_id") {
                ids.insert(id);
            }
        }
        Ok(ids)
    }

    pub async fn sync(&self) -> SyncResult {
        let start = Instant::now();
        let mut synced_count = 0u64;
        let mut conflict_count = 0u64;
        let mut pending_conflicts = 0u64;
        let mut errors: Vec<SyncErrorEntry> = Vec::new();

        let mut pending_conflict_ids = match self.pending_conflict_ids().await {
            Ok(ids) => ids,
            Err(err) => {
                errors.push(SyncErrorEntry {
                    change_id: 0,
                    error: format!("failed to load pending conflicts: {err}"),
                });
                HashSet::new()
            }
        };

        loop {
            let changes = match self
                .changelog
                .fetch_unsynced_changes(self.config.batch_size)
                .await
            {
                Ok(changes) => changes,
                Err(err) => {
                    errors.push(SyncErrorEntry {
                        change_id: 0,
                        error: format!("failed to read changelog: {err}"),
                    });
                    break;
                }
            };

            if changes.is_empty() {
                break;
            }

            let mut to_mark_synced: Vec<i64> = Vec::new();

            for change in changes {
                if pending_conflict_ids.contains(&change.id) {
                    continue;
                }

                let mut attempt = 0u32;
                let mut applied = false;

                while attempt < self.config.retry_count && !applied {
                    match self.apply_change(&change).await {
                        Ok(result) => {
                            applied = true;

                            if result.conflict {
                                conflict_count = conflict_count.saturating_add(1);
                            }

                            if result.pending_conflict {
                                pending_conflicts = pending_conflicts.saturating_add(1);
                                pending_conflict_ids.insert(change.id);
                            } else if result.mark_synced {
                                to_mark_synced.push(change.id);
                                synced_count = synced_count.saturating_add(1);
                            }
                        }
                        Err(err) => {
                            attempt = attempt.saturating_add(1);
                            if attempt >= self.config.retry_count {
                                errors.push(SyncErrorEntry {
                                    change_id: change.id,
                                    error: err.to_string(),
                                });
                            }
                        }
                    }
                }
            }

            if let Err(err) = self.changelog.mark_synced(&to_mark_synced).await {
                errors.push(SyncErrorEntry {
                    change_id: 0,
                    error: format!("failed to mark synced: {err}"),
                });
                break;
            }
        }

        SyncResult {
            success: errors.is_empty() && pending_conflicts == 0,
            synced_count,
            conflict_count,
            errors,
            duration_ms: start.elapsed().as_millis() as u64,
            pending_conflicts,
        }
    }

    async fn apply_change(&self, change: &ChangeLogEntry) -> Result<ApplyChangeResult, SyncApplyError> {
        let row_id_value: Value = serde_json::from_str(&change.row_id).map_err(SyncApplyError::InvalidRowId)?;
        let row_id = row_id_value
            .as_object()
            .ok_or(SyncApplyError::RowIdNotObject)?;

        if row_id.get("_batch").and_then(Value::as_bool) == Some(true) {
            return self.apply_batch_change(&change.table_name, change, row_id).await;
        }

        let schema = self.validate_table(&change.table_name)?;
        self.validate_columns(schema, row_id.keys())?;

        match change.operation.as_str() {
            "INSERT" => self.apply_insert(&change.table_name, change, row_id, schema).await,
            "UPDATE" => self.apply_update(&change.table_name, change, row_id, schema).await,
            "DELETE" => self.apply_delete(&change.table_name, row_id).await,
            other => Err(SyncApplyError::UnknownOperation(other.to_string())),
        }
    }

    async fn apply_batch_change(
        &self,
        table_name: &str,
        change: &ChangeLogEntry,
        row_id: &Map<String, Value>,
    ) -> Result<ApplyChangeResult, SyncApplyError> {
        let schema = self.validate_table(table_name)?;
        let where_value = row_id
            .get("where")
            .ok_or_else(|| SyncApplyError::MissingField("where"))?;
        let where_obj = where_value
            .as_object()
            .ok_or_else(|| SyncApplyError::InvalidWhere)?;

        self.validate_columns(schema, where_obj.keys())?;

        match change.operation.as_str() {
            "UPDATE" => {
                let Some(new_data_raw) = &change.new_data else {
                    return Err(SyncApplyError::MissingField("newData"));
                };
                let new_data: Value =
                    serde_json::from_str(new_data_raw).map_err(SyncApplyError::InvalidNewData)?;
                let data_obj = new_data
                    .get("data")
                    .and_then(Value::as_object)
                    .ok_or(SyncApplyError::BatchDataMissing)?;

                self.validate_columns(schema, data_obj.keys())?;

                let mut qb = sqlx::QueryBuilder::<Postgres>::new("UPDATE ");
                push_ident(&mut qb, table_name)?;
                qb.push(" SET ");

                let mut set = qb.separated(", ");
                for (column, value) in data_obj.iter() {
                    push_column_assignment(&mut set, schema, column, value)?;
                }

                qb.push(" WHERE ");
                let mut where_sep = qb.separated(" AND ");
                for (column, value) in where_obj.iter() {
                    push_where_condition(&mut where_sep, schema, column, value)?;
                }

                qb.build().execute(&self.primary).await?;
                Ok(ApplyChangeResult::synced())
            }
            "DELETE" => {
                let mut qb = sqlx::QueryBuilder::<Postgres>::new("DELETE FROM ");
                push_ident(&mut qb, table_name)?;
                qb.push(" WHERE ");
                let mut where_sep = qb.separated(" AND ");
                for (column, value) in where_obj.iter() {
                    push_where_condition(&mut where_sep, schema, column, value)?;
                }
                qb.build().execute(&self.primary).await?;
                Ok(ApplyChangeResult::synced())
            }
            other => Err(SyncApplyError::UnknownOperation(other.to_string())),
        }
    }

    async fn apply_insert(
        &self,
        table_name: &str,
        change: &ChangeLogEntry,
        row_id: &Map<String, Value>,
        schema: &TableSchema,
    ) -> Result<ApplyChangeResult, SyncApplyError> {
        let Some(new_data_raw) = &change.new_data else {
            return Err(SyncApplyError::MissingField("newData"));
        };
        let new_data_value: Value =
            serde_json::from_str(new_data_raw).map_err(SyncApplyError::InvalidNewData)?;
        let new_data = new_data_value
            .as_object()
            .ok_or(SyncApplyError::NewDataNotObject)?;

        let existing = self.fetch_existing_row(table_name, row_id).await?;
        if let Some(existing) = existing {
            let resolution =
                self.resolve_conflict(change.id, table_name, &change.row_id, new_data, Some(&existing))
                    .await?;
            if resolution.pending_conflict {
                return Ok(resolution);
            }

            self.apply_upsert(table_name, schema, row_id, &resolution.final_data).await?;
            return Ok(resolution.with_conflict());
        }

        self.apply_upsert(table_name, schema, row_id, new_data).await?;
        Ok(ApplyChangeResult::synced())
    }

    async fn apply_update(
        &self,
        table_name: &str,
        change: &ChangeLogEntry,
        row_id: &Map<String, Value>,
        schema: &TableSchema,
    ) -> Result<ApplyChangeResult, SyncApplyError> {
        let Some(new_data_raw) = &change.new_data else {
            return Err(SyncApplyError::MissingField("newData"));
        };
        let new_data_value: Value =
            serde_json::from_str(new_data_raw).map_err(SyncApplyError::InvalidNewData)?;
        let new_data = new_data_value
            .as_object()
            .ok_or(SyncApplyError::NewDataNotObject)?;

        let existing = self.fetch_existing_row(table_name, row_id).await?;
        if let Some(existing) = existing {
            let resolution =
                self.resolve_conflict(change.id, table_name, &change.row_id, new_data, Some(&existing))
                    .await?;
            if resolution.pending_conflict {
                return Ok(resolution);
            }

            self.apply_upsert(table_name, schema, row_id, &resolution.final_data).await?;
            return Ok(resolution);
        }

        self.apply_upsert(table_name, schema, row_id, new_data).await?;
        Ok(ApplyChangeResult::synced())
    }

    async fn apply_delete(
        &self,
        table_name: &str,
        row_id: &Map<String, Value>,
    ) -> Result<ApplyChangeResult, SyncApplyError> {
        let schema = self.validate_table(table_name)?;
        self.validate_columns(schema, row_id.keys())?;

        let mut qb = sqlx::QueryBuilder::<Postgres>::new("DELETE FROM ");
        push_ident(&mut qb, table_name)?;
        qb.push(" WHERE ");

        let mut where_sep = qb.separated(" AND ");
        for (column, value) in row_id.iter() {
            push_where_condition(&mut where_sep, schema, column, value)?;
        }

        qb.build().execute(&self.primary).await?;
        Ok(ApplyChangeResult::synced())
    }

    async fn fetch_existing_row(
        &self,
        table_name: &str,
        row_id: &Map<String, Value>,
    ) -> Result<Option<Map<String, Value>>, SyncApplyError> {
        let schema = self.validate_table(table_name)?;
        self.validate_columns(schema, row_id.keys())?;

        let mut qb = sqlx::QueryBuilder::<Postgres>::new("SELECT to_jsonb(t) FROM ");
        push_ident_with_alias(&mut qb, table_name, "t")?;
        qb.push(" WHERE ");
        let mut where_sep = qb.separated(" AND ");
        for (column, value) in row_id.iter() {
            push_where_condition(&mut where_sep, schema, column, value)?;
        }
        qb.push(" LIMIT 1");

        let result: Option<sqlx::types::Json<Value>> = qb
            .build_query_scalar::<sqlx::types::Json<Value>>()
            .fetch_optional(&self.primary)
            .await?;

        Ok(result.and_then(|json| json.0.as_object().cloned()))
    }

    async fn resolve_conflict(
        &self,
        change_id: i64,
        table_name: &str,
        row_id_raw: &str,
        sqlite_data: &Map<String, Value>,
        postgres_data: Option<&Map<String, Value>>,
    ) -> Result<ApplyChangeResult, SyncApplyError> {
        let resolution = self
            .conflict_resolver
            .resolve(table_name, row_id_raw, sqlite_data, postgres_data);

        if let Some(record) = &resolution.conflict_record {
            self.persist_conflict(change_id, record, resolution.resolved).await?;
        }

        if !resolution.resolved {
            return Ok(ApplyChangeResult {
                mark_synced: false,
                conflict: true,
                pending_conflict: true,
                final_data: resolution.final_data,
            });
        }

        Ok(ApplyChangeResult {
            mark_synced: true,
            conflict: matches!(resolution.winner, ConflictWinner::Postgres),
            pending_conflict: false,
            final_data: resolution.final_data,
        })
    }

    async fn persist_conflict(
        &self,
        change_id: i64,
        record: &crate::db::conflict_resolver::ConflictRecord,
        resolved: bool,
    ) -> Result<(), SyncApplyError> {
        let local_data = serde_json::to_string(&record.sqlite_data).unwrap_or_default();
        let remote_data = serde_json::to_string(&record.postgres_data).unwrap_or_default();
        let resolved_at = if resolved {
            Some(Utc::now().to_rfc3339())
        } else {
            None
        };

        let mut tx = self.fallback.begin().await?;
        sqlx::query(r#"DELETE FROM "_sync_conflicts" WHERE "change_id" = ?"#)
            .bind(change_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO "_sync_conflicts" (
              "change_id",
              "table_name",
              "row_id",
              "local_data",
              "remote_data",
              "resolution",
              "resolved_at"
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(change_id)
        .bind(&record.table_name)
        .bind(&record.row_id)
        .bind(local_data)
        .bind(remote_data)
        .bind(record.resolution)
        .bind(resolved_at)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn apply_upsert(
        &self,
        table_name: &str,
        schema: &TableSchema,
        row_id: &Map<String, Value>,
        data: &Map<String, Value>,
    ) -> Result<(), SyncApplyError> {
        let mut merged = data.clone();
        for (key, value) in row_id.iter() {
            merged.entry(key.clone()).or_insert_with(|| value.clone());
        }

        let mut columns: Vec<&String> = merged
            .keys()
            .filter(|k| schema.fields.iter().any(|f| &f.name == *k))
            .collect();
        columns.sort();

        let mut conflict_keys: Vec<&String> = row_id.keys().collect();
        conflict_keys.sort();

        if columns.is_empty() {
            return Ok(());
        }

        let mut qb = sqlx::QueryBuilder::<Postgres>::new("INSERT INTO ");
        push_ident(&mut qb, table_name)?;
        qb.push(" (");
        let mut col_sep = qb.separated(", ");
        for column in &columns {
            push_ident_raw(&mut col_sep, column)?;
        }
        qb.push(") VALUES (");
        let mut val_sep = qb.separated(", ");
        for column in &columns {
            let value = merged.get(*column).unwrap_or(&Value::Null);
            let field = schema
                .fields
                .iter()
                .find(|f| f.name == **column)
                .ok_or_else(|| SyncApplyError::UnknownColumn((*column).clone()))?;
            push_pg_value(&mut val_sep, value, &field.prisma_type)?;
        }
        qb.push(") ON CONFLICT (");
        let mut key_sep = qb.separated(", ");
        for key in &conflict_keys {
            push_ident_raw(&mut key_sep, key)?;
        }
        qb.push(")");

        let update_columns: Vec<&String> = columns
            .iter()
            .copied()
            .filter(|c| !row_id.contains_key(*c))
            .collect();

        if update_columns.is_empty() {
            qb.push(" DO NOTHING");
        } else {
            qb.push(" DO UPDATE SET ");
            let mut upd = qb.separated(", ");
            for column in update_columns {
                push_ident_raw(&mut upd, column)?;
                upd.push(" = EXCLUDED.");
                push_ident_raw(&mut upd, column)?;
            }
        }

        qb.build().execute(&self.primary).await?;
        Ok(())
    }

    fn validate_table(&self, table_name: &str) -> Result<&TableSchema, SyncApplyError> {
        if !is_valid_identifier(table_name) {
            return Err(SyncApplyError::InvalidIdentifier(table_name.to_string()));
        }
        self.registry
            .get_by_table_name(table_name)
            .ok_or_else(|| SyncApplyError::UnknownTable(table_name.to_string()))
    }

    fn validate_columns<'a, I>(&self, schema: &TableSchema, columns: I) -> Result<(), SyncApplyError>
    where
        I: IntoIterator<Item = &'a String>,
    {
        for column in columns {
            if !is_valid_identifier(column) {
                return Err(SyncApplyError::InvalidIdentifier(column.clone()));
            }
            if !schema.fields.iter().any(|f| f.name == *column) {
                return Err(SyncApplyError::UnknownColumn(column.clone()));
            }
        }
        Ok(())
    }
}

#[derive(Debug)]
struct ApplyChangeResult {
    mark_synced: bool,
    conflict: bool,
    pending_conflict: bool,
    final_data: Map<String, Value>,
}

impl ApplyChangeResult {
    fn synced() -> Self {
        Self {
            mark_synced: true,
            conflict: false,
            pending_conflict: false,
            final_data: Map::new(),
        }
    }

    fn with_conflict(mut self) -> Self {
        self.conflict = true;
        self
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SyncApplyError {
    #[error("invalid rowId json: {0}")]
    InvalidRowId(#[source] serde_json::Error),
    #[error("invalid newData json: {0}")]
    InvalidNewData(#[source] serde_json::Error),
    #[error("rowId must be an object")]
    RowIdNotObject,
    #[error("newData must be an object")]
    NewDataNotObject,
    #[error("batch change missing data payload")]
    BatchDataMissing,
    #[error("invalid WHERE clause")]
    InvalidWhere,
    #[error("missing required field: {0}")]
    MissingField(&'static str),
    #[error("unknown operation: {0}")]
    UnknownOperation(String),
    #[error("invalid identifier: {0}")]
    InvalidIdentifier(String),
    #[error("unknown table: {0}")]
    UnknownTable(String),
    #[error("unknown column: {0}")]
    UnknownColumn(String),
    #[error("type mapping error: {0}")]
    TypeMapping(String),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

fn push_ident(builder: &mut sqlx::QueryBuilder<Postgres>, name: &str) -> Result<(), SyncApplyError> {
    if !is_valid_identifier(name) {
        return Err(SyncApplyError::InvalidIdentifier(name.to_string()));
    }
    builder.push("\"");
    builder.push(name);
    builder.push("\"");
    Ok(())
}

fn push_ident_with_alias(
    builder: &mut sqlx::QueryBuilder<Postgres>,
    name: &str,
    alias: &str,
) -> Result<(), SyncApplyError> {
    push_ident(builder, name)?;
    builder.push(" ");
    builder.push(alias);
    Ok(())
}

fn push_ident_raw<'qb, 'args: 'qb>(
    builder: &mut sqlx::query_builder::Separated<'qb, 'args, Postgres, &'static str>,
    name: &str,
) -> Result<(), SyncApplyError> {
    if !is_valid_identifier(name) {
        return Err(SyncApplyError::InvalidIdentifier(name.to_string()));
    }
    builder.push("\"");
    builder.push(name);
    builder.push("\"");
    Ok(())
}

fn push_where_condition<'qb, 'args: 'qb>(
    builder: &mut sqlx::query_builder::Separated<'qb, 'args, Postgres, &'static str>,
    schema: &TableSchema,
    column: &str,
    value: &Value,
) -> Result<(), SyncApplyError> {
    let field = schema
        .fields
        .iter()
        .find(|f| f.name == column)
        .ok_or_else(|| SyncApplyError::UnknownColumn(column.to_string()))?;

    push_ident_raw(builder, column)?;
    builder.push(" = ");
    push_pg_bind_value(builder, value, &field.prisma_type)?;
    Ok(())
}

fn push_column_assignment<'qb, 'args: 'qb>(
    builder: &mut sqlx::query_builder::Separated<'qb, 'args, Postgres, &'static str>,
    schema: &TableSchema,
    column: &str,
    value: &Value,
) -> Result<(), SyncApplyError> {
    push_ident_raw(builder, column)?;
    builder.push(" = ");

    let field = schema
        .fields
        .iter()
        .find(|f| f.name == column)
        .ok_or_else(|| SyncApplyError::UnknownColumn(column.to_string()))?;

    push_pg_bind_value(builder, value, &field.prisma_type)?;
    Ok(())
}

fn push_pg_value<'qb, 'args: 'qb>(
    builder: &mut sqlx::query_builder::Separated<'qb, 'args, Postgres, &'static str>,
    value: &Value,
    prisma_type: &str,
) -> Result<(), SyncApplyError> {
    push_pg_bind_value(builder, value, prisma_type)
}

fn push_pg_bind_value<'qb, 'args: 'qb>(
    builder: &mut sqlx::query_builder::Separated<'qb, 'args, Postgres, &'static str>,
    value: &Value,
    prisma_type: &str,
) -> Result<(), SyncApplyError> {
    let bind = sqlite_json_to_pg(value, prisma_type).map_err(|err| SyncApplyError::TypeMapping(err.to_string()))?;
    match bind {
        PgBindValue::String(v) => {
            builder.push_bind(v);
        }
        PgBindValue::I32(v) => {
            builder.push_bind(v);
        }
        PgBindValue::I64(v) => {
            builder.push_bind(v);
        }
        PgBindValue::F64(v) => {
            builder.push_bind(v);
        }
        PgBindValue::Bool(v) => {
            builder.push_bind(v);
        }
        PgBindValue::DateTime(v) => {
            builder.push_bind(v);
        }
        PgBindValue::Json(v) => {
            builder.push_bind(v);
        }
        PgBindValue::StringArray(v) => {
            builder.push_bind(v);
        }
        PgBindValue::I32Array(v) => {
            builder.push_bind(v);
        }
    }
    Ok(())
}
