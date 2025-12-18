use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use chrono::Utc;
use sqlx::sqlite::{SqliteRow, SqliteValueRef};
use sqlx::{Column, Row, Sqlite, SqlitePool, TypeInfo, ValueRef};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

use crate::db::change_log::{ChangeLogEntryInput, ChangeOperation, SqliteChangeLogManager};
use crate::db::config::DualWriteConfig;
use crate::db::fencing::FencingManager;
use crate::db::schema_registry::{is_valid_identifier, SchemaRegistry, TableSchema};
use crate::db::state_machine::DatabaseState;
use crate::db::type_mapper::{pg_json_to_sqlite, sqlite_json_to_pg, PgBindValue, SqliteBindValue};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WriteOperation {
    Insert {
        table: String,
        data: Map<String, Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
    Update {
        table: String,
        r#where: Map<String, Value>,
        data: Map<String, Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
    Delete {
        table: String,
        r#where: Map<String, Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
    Upsert {
        table: String,
        r#where: Map<String, Value>,
        create: Map<String, Value>,
        update: Map<String, Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
}

impl WriteOperation {
    pub fn operation_id(&self) -> &str {
        match self {
            WriteOperation::Insert { operation_id, .. }
            | WriteOperation::Update { operation_id, .. }
            | WriteOperation::Delete { operation_id, .. }
            | WriteOperation::Upsert { operation_id, .. } => operation_id,
        }
    }

    pub fn is_critical(&self) -> bool {
        match self {
            WriteOperation::Insert { critical, .. }
            | WriteOperation::Update { critical, .. }
            | WriteOperation::Delete { critical, .. }
            | WriteOperation::Upsert { critical, .. } => critical.unwrap_or(false),
        }
    }

    pub fn timestamp_ms(&self) -> Option<u64> {
        match self {
            WriteOperation::Insert { timestamp_ms, .. }
            | WriteOperation::Update { timestamp_ms, .. }
            | WriteOperation::Delete { timestamp_ms, .. }
            | WriteOperation::Upsert { timestamp_ms, .. } => *timestamp_ms,
        }
    }
}

#[derive(Debug, Clone)]
pub struct WriteResult {
    pub written_to: &'static str,
    pub async_fallback_pending: bool,
}

#[derive(Clone)]
pub struct DualWriteManager {
    primary: sqlx::PgPool,
    fallback: SqlitePool,
    registry: Arc<SchemaRegistry>,
    changelog: SqliteChangeLogManager,
    pending_store: crate::db::pending_writes::SqlitePendingWriteStore,
    fencing: Arc<FencingManager>,
    config: DualWriteConfig,
    pending_fallback_writes: Arc<Mutex<HashMap<String, WriteOperation>>>,
    syncing_queue: Arc<Mutex<VecDeque<QueuedWrite>>>,
    queue_processing: Arc<Mutex<bool>>,
    last_state: Arc<RwLock<DatabaseState>>,
}

struct QueuedWrite {
    op: WriteOperation,
    sender: tokio::sync::oneshot::Sender<Result<WriteResult, DualWriteError>>,
}

impl DualWriteManager {
    pub fn new(
        primary: sqlx::PgPool,
        fallback: SqlitePool,
        registry: Arc<SchemaRegistry>,
        fencing: Arc<FencingManager>,
        config: DualWriteConfig,
    ) -> Self {
        let changelog = SqliteChangeLogManager::new(fallback.clone());
        let pending_store = crate::db::pending_writes::SqlitePendingWriteStore::new(fallback.clone());

        Self {
            primary,
            fallback,
            registry,
            changelog,
            pending_store,
            fencing,
            config,
            pending_fallback_writes: Arc::new(Mutex::new(HashMap::new())),
            syncing_queue: Arc::new(Mutex::new(VecDeque::new())),
            queue_processing: Arc::new(Mutex::new(false)),
            last_state: Arc::new(RwLock::new(DatabaseState::Normal)),
        }
    }

    pub async fn initialize(&self) {
        if !self.config.recover_pending_writes_on_init {
            return;
        }

        let pending = match self.pending_store.get_all().await {
            Ok(items) => items,
            Err(err) => {
                tracing::warn!(error = %err, "failed to load pending writes");
                return;
            }
        };

        if pending.is_empty() {
            return;
        }

        let mut cache = self.pending_fallback_writes.lock().await;
        for item in pending {
            if let Ok(op) = serde_json::from_value::<WriteOperation>(item.operation_data) {
                cache.insert(op.operation_id().to_string(), op);
            }
        }
        drop(cache);

        self.retry_pending_writes_in_background();
    }

    pub async fn on_state_changed(&self, state: DatabaseState) {
        let mut last = self.last_state.write().await;
        let prev = *last;
        *last = state;
        drop(last);

        if prev == DatabaseState::Syncing && state == DatabaseState::Normal {
            self.process_syncing_queue().await;
        }
    }

    pub async fn write(&self, state: DatabaseState, operation: WriteOperation) -> Result<WriteResult, DualWriteError> {
        let operation = self.normalize_operation(operation)?;

        if state == DatabaseState::Unavailable {
            return Err(DualWriteError::Unavailable);
        }

        if state != DatabaseState::Degraded && self.fencing.enabled() && !self.fencing.has_valid_lock() {
            return Err(DualWriteError::FencingBlocked);
        }

        if state == DatabaseState::Syncing {
            return self.queue_write(operation).await;
        }

        match state {
            DatabaseState::Normal => self.write_normal(operation).await,
            DatabaseState::Degraded => self.write_degraded(operation).await,
            DatabaseState::Syncing => unreachable!(),
            DatabaseState::Unavailable => unreachable!(),
        }
    }

    fn normalize_operation(&self, operation: WriteOperation) -> Result<WriteOperation, DualWriteError> {
        match operation {
            WriteOperation::Insert {
                table,
                mut data,
                operation_id,
                timestamp_ms,
                critical,
            } => {
                let schema = self.table_schema(&table)?;
                ensure_primary_key_defaults(schema, &mut data);
                apply_updated_at(schema, &mut data, false);
                Ok(WriteOperation::Insert {
                    table,
                    data,
                    operation_id,
                    timestamp_ms,
                    critical,
                })
            }
            WriteOperation::Upsert {
                table,
                r#where,
                mut create,
                update,
                operation_id,
                timestamp_ms,
                critical,
            } => {
                let schema = self.table_schema(&table)?;
                ensure_primary_key_defaults(schema, &mut create);
                apply_updated_at(schema, &mut create, false);

                let mut update = update;
                apply_updated_at(schema, &mut update, true);
                Ok(WriteOperation::Upsert {
                    table,
                    r#where,
                    create,
                    update,
                    operation_id,
                    timestamp_ms,
                    critical,
                })
            }
            WriteOperation::Update {
                table,
                r#where,
                mut data,
                operation_id,
                timestamp_ms,
                critical,
            } => {
                let schema = self.table_schema(&table)?;
                apply_updated_at(schema, &mut data, true);
                Ok(WriteOperation::Update {
                    table,
                    r#where,
                    data,
                    operation_id,
                    timestamp_ms,
                    critical,
                })
            }
            other => Ok(other),
        }
    }

    async fn queue_write(&self, op: WriteOperation) -> Result<WriteResult, DualWriteError> {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        {
            let mut queue = self.syncing_queue.lock().await;
            queue.push_back(QueuedWrite { op, sender });
        }

        receiver
            .await
            .map_err(|_| DualWriteError::QueueDropped)?
    }

    async fn process_syncing_queue(&self) {
        let mut processing = self.queue_processing.lock().await;
        if *processing {
            return;
        }
        *processing = true;
        drop(processing);

        loop {
            let item = { self.syncing_queue.lock().await.pop_front() };
            let Some(item) = item else { break };

            let result = self.write_normal(item.op.clone()).await;
            let _ = item.sender.send(result);
        }

        let mut processing = self.queue_processing.lock().await;
        *processing = false;
    }

    async fn write_normal(&self, mut operation: WriteOperation) -> Result<WriteResult, DualWriteError> {
        if self.fencing.enabled() && !self.fencing.has_valid_lock() {
            return Err(DualWriteError::FencingBlocked);
        }

        let timestamp_ms = operation.timestamp_ms().unwrap_or_else(now_ms);
        operation.set_timestamp_ms(timestamp_ms);

        self.execute_on_primary(&operation).await?;

        let should_sync = self.config.sync_write_to_fallback
            || (self.config.sync_critical_writes && operation.is_critical());

        if should_sync {
            if let Err(err) = self.execute_on_fallback(&operation, false).await {
                tracing::warn!(error = %err, op_id = operation.operation_id(), "sync write to fallback failed");
                self.add_pending_write(&operation).await;
                self.retry_write_async(operation.clone());

                return Ok(WriteResult {
                    written_to: "primary",
                    async_fallback_pending: true,
                });
            }

            return Ok(WriteResult {
                written_to: "both",
                async_fallback_pending: false,
            });
        }

        self.add_pending_write(&operation).await;
        self.retry_write_async(operation);

        Ok(WriteResult {
            written_to: "primary",
            async_fallback_pending: true,
        })
    }

    async fn write_degraded(&self, mut operation: WriteOperation) -> Result<WriteResult, DualWriteError> {
        let timestamp_ms = operation.timestamp_ms().unwrap_or_else(now_ms);
        operation.set_timestamp_ms(timestamp_ms);
        self.execute_on_fallback(&operation, true).await?;

        Ok(WriteResult {
            written_to: "fallback",
            async_fallback_pending: false,
        })
    }

    async fn execute_on_primary(&self, operation: &WriteOperation) -> Result<(), DualWriteError> {
        match operation {
            WriteOperation::Insert { table, data, .. } => {
                let schema = self.table_schema(table)?;
                execute_pg_insert(&self.primary, schema, data).await?;
            }
            WriteOperation::Update { table, r#where, data, .. } => {
                let schema = self.table_schema(table)?;
                execute_pg_update(&self.primary, schema, r#where, data).await?;
            }
            WriteOperation::Delete { table, r#where, .. } => {
                let schema = self.table_schema(table)?;
                execute_pg_delete(&self.primary, schema, r#where).await?;
            }
            WriteOperation::Upsert { table, r#where, create, update, .. } => {
                let schema = self.table_schema(table)?;
                execute_pg_upsert(&self.primary, schema, r#where, create, update).await?;
            }
        }
        Ok(())
    }

    async fn execute_on_fallback(&self, operation: &WriteOperation, record_changelog: bool) -> Result<(), DualWriteError> {
        let mut tx = self.fallback.begin().await?;

        let (_table, schema) = match operation {
            WriteOperation::Insert { table, .. }
            | WriteOperation::Update { table, .. }
            | WriteOperation::Delete { table, .. }
            | WriteOperation::Upsert { table, .. } => (table.as_str(), self.table_schema(table)?),
        };

        match operation {
            WriteOperation::Insert { data, .. } => {
                execute_sqlite_insert(&mut tx, schema, data).await?;
            }
            WriteOperation::Update { r#where, data, .. } => {
                execute_sqlite_update(&mut tx, schema, r#where, data).await?;
            }
            WriteOperation::Delete { r#where, .. } => {
                execute_sqlite_delete(&mut tx, schema, r#where).await?;
            }
            WriteOperation::Upsert { r#where, create, update, .. } => {
                execute_sqlite_upsert(&mut tx, schema, r#where, create, update).await?;
            }
        }

        if record_changelog {
            let entry = build_changelog_entry(operation, schema, &mut tx).await?;
            self.changelog.log_change_tx(&mut tx, &entry).await?;
        }

        tx.commit().await?;
        Ok(())
    }

    fn table_schema(&self, table: &str) -> Result<&TableSchema, DualWriteError> {
        if !is_valid_identifier(table) {
            return Err(DualWriteError::InvalidIdentifier(table.to_string()));
        }
        self.registry
            .get_by_table_name(table)
            .ok_or_else(|| DualWriteError::UnknownTable(table.to_string()))
    }

    fn retry_pending_writes_in_background(&self) {
        let manager = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = manager.retry_pending_writes().await;
        });
    }

    async fn retry_pending_writes(&self) -> Result<(), DualWriteError> {
        let keys: Vec<String> = {
            let pending = self.pending_fallback_writes.lock().await;
            pending.keys().cloned().collect()
        };

        for key in keys {
            let op = {
                let pending = self.pending_fallback_writes.lock().await;
                pending.get(&key).cloned()
            };
            let Some(op) = op else { continue };

            if self.execute_on_fallback(&op, false).await.is_ok() {
                self.pending_store.remove(&key).await.ok();
                let mut pending = self.pending_fallback_writes.lock().await;
                pending.remove(&key);
            }
        }

        Ok(())
    }

    async fn add_pending_write(&self, operation: &WriteOperation) {
        {
            let mut pending = self.pending_fallback_writes.lock().await;
            pending.insert(operation.operation_id().to_string(), operation.clone());
        }
        let _ = self.pending_store.save(operation.operation_id(), &serde_json::to_value(operation).unwrap_or(Value::Null)).await;
    }

    fn retry_write_async(&self, operation: WriteOperation) {
        let manager = self.clone();
        tokio::spawn(async move {
            let mut attempt = 0u32;
            while attempt < manager.config.max_async_retries {
                attempt += 1;
                if manager.execute_on_fallback(&operation, false).await.is_ok() {
                    manager.pending_store.remove(operation.operation_id()).await.ok();
                    let mut pending = manager.pending_fallback_writes.lock().await;
                    pending.remove(operation.operation_id());
                    return;
                }
                tokio::time::sleep(manager.config.async_retry_delay).await;
            }
        });
    }
}

impl WriteOperation {
    fn set_timestamp_ms(&mut self, ts: u64) {
        match self {
            WriteOperation::Insert { timestamp_ms, .. }
            | WriteOperation::Update { timestamp_ms, .. }
            | WriteOperation::Delete { timestamp_ms, .. }
            | WriteOperation::Upsert { timestamp_ms, .. } => {
                *timestamp_ms = Some(ts);
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DualWriteError {
    #[error("database unavailable")]
    Unavailable,
    #[error("write rejected: fencing lock lost")]
    FencingBlocked,
    #[error("write queue dropped")]
    QueueDropped,
    #[error("invalid identifier: {0}")]
    InvalidIdentifier(String),
    #[error("unknown table: {0}")]
    UnknownTable(String),
    #[error("unknown column: {0}")]
    UnknownColumn(String),
    #[error("invalid write operation: {0}")]
    InvalidOperation(String),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error("type mapping error: {0}")]
    TypeMapping(String),
    #[error("changelog build error: {0}")]
    ChangeLog(String),
}

async fn execute_pg_insert(pool: &sqlx::PgPool, schema: &TableSchema, data: &Map<String, Value>) -> Result<(), DualWriteError> {
    let mut columns: Vec<&String> = data.keys().collect();
    columns.sort();
    if columns.is_empty() {
        return Err(DualWriteError::InvalidOperation("insert requires at least one column".to_string()));
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("INSERT INTO ");
    push_pg_ident(&mut qb, &schema.table_name)?;
    qb.push(" (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_pg_ident(&mut qb, col)?;
    }
    qb.push(") VALUES (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        let field = schema
            .fields
            .iter()
            .find(|f| &f.name == *col)
            .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
        push_pg_value(&mut qb, data.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
    }
    qb.push(")");
    qb.build().execute(pool).await?;
    Ok(())
}

async fn execute_pg_update(
    pool: &sqlx::PgPool,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
    data: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    let mut columns: Vec<&String> = data.keys().collect();
    columns.sort();
    if columns.is_empty() {
        return Err(DualWriteError::InvalidOperation("update requires at least one column".to_string()));
    }
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("update requires where clause".to_string()));
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("UPDATE ");
    push_pg_ident(&mut qb, &schema.table_name)?;
    qb.push(" SET ");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_pg_ident(&mut qb, col)?;
        qb.push(" = ");
        let field = schema
            .fields
            .iter()
            .find(|f| &f.name == *col)
            .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
        push_pg_value(&mut qb, data.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
    }
    qb.push(" WHERE ");
    push_pg_where(&mut qb, schema, where_clause)?;
    qb.build().execute(pool).await?;
    Ok(())
}

async fn execute_pg_delete(
    pool: &sqlx::PgPool,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("delete requires where clause".to_string()));
    }
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("DELETE FROM ");
    push_pg_ident(&mut qb, &schema.table_name)?;
    qb.push(" WHERE ");
    push_pg_where(&mut qb, schema, where_clause)?;
    qb.build().execute(pool).await?;
    Ok(())
}

async fn execute_pg_upsert(
    pool: &sqlx::PgPool,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
    create: &Map<String, Value>,
    update: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("upsert requires where clause".to_string()));
    }
    let mut data = create.clone();
    for (k, v) in where_clause.iter() {
        data.entry(k.clone()).or_insert_with(|| v.clone());
    }

    let mut columns: Vec<&String> = data.keys().collect();
    columns.sort();

    let mut conflict_keys: Vec<&String> = where_clause.keys().collect();
    conflict_keys.sort();

    if columns.is_empty() {
        return Err(DualWriteError::InvalidOperation("upsert requires create data".to_string()));
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("INSERT INTO ");
    push_pg_ident(&mut qb, &schema.table_name)?;
    qb.push(" (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_pg_ident(&mut qb, col)?;
    }
    qb.push(") VALUES (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        let field = schema
            .fields
            .iter()
            .find(|f| &f.name == *col)
            .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
        push_pg_value(&mut qb, data.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
    }
    qb.push(") ON CONFLICT (");
    for (idx, key) in conflict_keys.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_pg_ident(&mut qb, key)?;
    }
    let mut update_cols: Vec<&String> = update.keys().collect();
    update_cols.sort();
    if update_cols.is_empty() {
        qb.push(" DO NOTHING");
    } else {
        qb.push(" DO UPDATE SET ");
        for (idx, col) in update_cols.iter().enumerate() {
            if idx > 0 { qb.push(", "); }
            push_pg_ident(&mut qb, col)?;
            qb.push(" = ");
            let field = schema
                .fields
                .iter()
                .find(|f| &f.name == *col)
                .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
            push_pg_value(&mut qb, update.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
        }
    }

    qb.build().execute(pool).await?;
    Ok(())
}

async fn execute_sqlite_insert(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    schema: &TableSchema,
    data: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    let mut columns: Vec<&String> = data.keys().collect();
    columns.sort();
    if columns.is_empty() {
        return Err(DualWriteError::InvalidOperation("insert requires at least one column".to_string()));
    }

    let mut qb = sqlx::QueryBuilder::<Sqlite>::new("INSERT INTO ");
    push_sqlite_ident(&mut qb, &schema.table_name)?;
    qb.push(" (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_sqlite_ident(&mut qb, col)?;
    }
    qb.push(") VALUES (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        let field = schema
            .fields
            .iter()
            .find(|f| &f.name == *col)
            .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
        push_sqlite_value(&mut qb, data.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
    }
    qb.push(")");
    qb.build().execute(&mut **tx).await?;
    Ok(())
}

async fn execute_sqlite_update(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
    data: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    let mut columns: Vec<&String> = data.keys().collect();
    columns.sort();
    if columns.is_empty() {
        return Err(DualWriteError::InvalidOperation("update requires at least one column".to_string()));
    }
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("update requires where clause".to_string()));
    }

    let mut qb = sqlx::QueryBuilder::<Sqlite>::new("UPDATE ");
    push_sqlite_ident(&mut qb, &schema.table_name)?;
    qb.push(" SET ");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_sqlite_ident(&mut qb, col)?;
        qb.push(" = ");
        let field = schema
            .fields
            .iter()
            .find(|f| &f.name == *col)
            .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
        push_sqlite_value(&mut qb, data.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
    }
    qb.push(" WHERE ");
    push_sqlite_where(&mut qb, schema, where_clause)?;
    qb.build().execute(&mut **tx).await?;
    Ok(())
}

async fn execute_sqlite_delete(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("delete requires where clause".to_string()));
    }
    let mut qb = sqlx::QueryBuilder::<Sqlite>::new("DELETE FROM ");
    push_sqlite_ident(&mut qb, &schema.table_name)?;
    qb.push(" WHERE ");
    push_sqlite_where(&mut qb, schema, where_clause)?;
    qb.build().execute(&mut **tx).await?;
    Ok(())
}

async fn execute_sqlite_upsert(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
    create: &Map<String, Value>,
    update: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("upsert requires where clause".to_string()));
    }
    let mut data = create.clone();
    for (k, v) in where_clause.iter() {
        data.entry(k.clone()).or_insert_with(|| v.clone());
    }

    let mut columns: Vec<&String> = data.keys().collect();
    columns.sort();
    let mut conflict_keys: Vec<&String> = where_clause.keys().collect();
    conflict_keys.sort();

    if columns.is_empty() {
        return Err(DualWriteError::InvalidOperation("upsert requires create data".to_string()));
    }

    let mut qb = sqlx::QueryBuilder::<Sqlite>::new("INSERT INTO ");
    push_sqlite_ident(&mut qb, &schema.table_name)?;
    qb.push(" (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_sqlite_ident(&mut qb, col)?;
    }
    qb.push(") VALUES (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        let field = schema
            .fields
            .iter()
            .find(|f| &f.name == *col)
            .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
        push_sqlite_value(&mut qb, data.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
    }
    qb.push(") ON CONFLICT (");
    for (idx, key) in conflict_keys.iter().enumerate() {
        if idx > 0 { qb.push(", "); }
        push_sqlite_ident(&mut qb, key)?;
    }
    let mut update_cols: Vec<&String> = update.keys().collect();
    update_cols.sort();
    if update_cols.is_empty() {
        qb.push(" DO NOTHING");
    } else {
        qb.push(" DO UPDATE SET ");
        for (idx, col) in update_cols.iter().enumerate() {
            if idx > 0 { qb.push(", "); }
            push_sqlite_ident(&mut qb, col)?;
            qb.push(" = ");
            let field = schema
                .fields
                .iter()
                .find(|f| &f.name == *col)
                .ok_or_else(|| DualWriteError::UnknownColumn((*col).clone()))?;
            push_sqlite_value(&mut qb, update.get(*col).unwrap_or(&Value::Null), &field.prisma_type)?;
        }
    }

    qb.build().execute(&mut **tx).await?;
    Ok(())
}

async fn build_changelog_entry(
    operation: &WriteOperation,
    schema: &TableSchema,
    tx: &mut sqlx::Transaction<'_, Sqlite>,
) -> Result<ChangeLogEntryInput, DualWriteError> {
    let (change_op, table_name, row_id) = match operation {
        WriteOperation::Insert { table, data, .. } => {
            (ChangeOperation::Insert, table.as_str(), extract_row_id(schema, data, None)?)
        }
        WriteOperation::Update { table, r#where, .. } => {
            (ChangeOperation::Update, table.as_str(), r#where.clone())
        }
        WriteOperation::Delete { table, r#where, .. } => {
            (ChangeOperation::Delete, table.as_str(), r#where.clone())
        }
        WriteOperation::Upsert { table, r#where, create, .. } => {
            (ChangeOperation::Update, table.as_str(), extract_row_id(schema, create, Some(r#where))?)
        }
    };

    let row_id_json = Value::Object(row_id);
    let row_id_str = serde_json::to_string(&row_id_json).map_err(|e| DualWriteError::ChangeLog(e.to_string()))?;

    let new_data = match change_op {
        ChangeOperation::Delete => None,
        _ => {
            let row = fetch_sqlite_row_json(tx, table_name, schema, &row_id_json)
                .await?
                .ok_or_else(|| DualWriteError::ChangeLog("failed to load written row".to_string()))?;
            Some(serde_json::to_string(&Value::Object(row)).map_err(|e| DualWriteError::ChangeLog(e.to_string()))?)
        }
    };

    Ok(ChangeLogEntryInput {
        operation: change_op,
        table_name: schema.table_name.clone(),
        row_id: row_id_str,
        old_data: None,
        new_data,
        timestamp: operation.timestamp_ms().unwrap_or_else(now_ms) as i64,
        idempotency_key: Some(format!("{}:{}", schema.table_name, operation.operation_id())),
        tx_id: None,
        tx_seq: None,
        tx_committed: true,
    })
}

fn extract_row_id(
    schema: &TableSchema,
    data: &Map<String, Value>,
    where_clause: Option<&Map<String, Value>>,
) -> Result<Map<String, Value>, DualWriteError> {
    if let Some(where_clause) = where_clause {
        return Ok(where_clause.clone());
    }

    if !schema.primary_key.is_empty() {
        let mut row = Map::new();
        for key in &schema.primary_key {
            if let Some(value) = data.get(key) {
                row.insert(key.clone(), value.clone());
            }
        }
        if !row.is_empty() {
            return Ok(row);
        }
    }

    let mut fallback = Map::new();
    for key in ["id", "uuid", "_id", "ID"] {
        if let Some(value) = data.get(key) {
            fallback.insert(key.to_string(), value.clone());
            return Ok(fallback);
        }
    }

    Err(DualWriteError::ChangeLog("unable to extract row id".to_string()))
}

fn ensure_primary_key_defaults(schema: &TableSchema, data: &mut Map<String, Value>) {
    if schema.primary_key.is_empty() {
        return;
    }

    for pk in &schema.primary_key {
        let needs_value = match data.get(pk) {
            None => true,
            Some(Value::Null) => true,
            _ => false,
        };

        if !needs_value {
            continue;
        }

        let Some(field) = schema.fields.iter().find(|f| &f.name == pk) else {
            continue;
        };

        if !field.has_default {
            continue;
        }

        match field.prisma_type.as_str() {
            "String" => {
                data.insert(pk.clone(), Value::String(Uuid::new_v4().to_string()));
            }
            "DateTime" => {
                data.insert(pk.clone(), Value::String(Utc::now().to_rfc3339()));
            }
            _ => {}
        }
    }
}

fn apply_updated_at(schema: &TableSchema, data: &mut Map<String, Value>, force: bool) {
    let Some(field) = schema.fields.iter().find(|f| f.is_updated_at) else {
        return;
    };

    let needs_value = force
        || match data.get(&field.name) {
            None => true,
            Some(Value::Null) => true,
            _ => false,
        };

    if !needs_value {
        return;
    }

    data.insert(field.name.clone(), Value::String(Utc::now().to_rfc3339()));
}

async fn fetch_sqlite_row_json(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    table: &str,
    schema: &TableSchema,
    row_id: &Value,
) -> Result<Option<Map<String, Value>>, DualWriteError> {
    let where_clause = row_id.as_object().ok_or_else(|| DualWriteError::ChangeLog("rowId is not object".to_string()))?;

    let mut qb = sqlx::QueryBuilder::<Sqlite>::new("SELECT * FROM ");
    push_sqlite_ident(&mut qb, table)?;
    qb.push(" WHERE ");
    push_sqlite_where(&mut qb, schema, where_clause)?;
    qb.push(" LIMIT 1");

    let row: Option<SqliteRow> = qb.build().fetch_optional(&mut **tx).await?;
    Ok(row.map(|r| sqlite_row_to_json(&r)))
}

fn sqlite_row_to_json(row: &SqliteRow) -> Map<String, Value> {
    let mut map = Map::new();
    for column in row.columns() {
        let name = column.name();
        let raw: SqliteValueRef<'_> = match row.try_get_raw(name) {
            Ok(raw) => raw,
            Err(_) => continue,
        };

        if raw.is_null() {
            map.insert(name.to_string(), Value::Null);
            continue;
        }

        let value = match raw.type_info().name() {
            "INTEGER" => row
                .try_get::<i64, _>(name)
                .ok()
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "REAL" => row
                .try_get::<f64, _>(name)
                .ok()
                .and_then(|v| serde_json::Number::from_f64(v).map(Value::Number))
                .unwrap_or(Value::Null),
            "BLOB" => row
                .try_get::<Vec<u8>, _>(name)
                .ok()
                .map(|v| Value::String(encode_hex(&v)))
                .unwrap_or(Value::Null),
            _ => row
                .try_get::<String, _>(name)
                .ok()
                .map(Value::String)
                .unwrap_or(Value::Null),
        };

        map.insert(name.to_string(), value);
    }
    map
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len().saturating_mul(2));
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn push_pg_ident(builder: &mut sqlx::QueryBuilder<sqlx::Postgres>, name: &str) -> Result<(), DualWriteError> {
    if !is_valid_identifier(name) {
        return Err(DualWriteError::InvalidIdentifier(name.to_string()));
    }
    builder.push("\"");
    builder.push(name);
    builder.push("\"");
    Ok(())
}

fn push_sqlite_ident(builder: &mut sqlx::QueryBuilder<Sqlite>, name: &str) -> Result<(), DualWriteError> {
    if !is_valid_identifier(name) {
        return Err(DualWriteError::InvalidIdentifier(name.to_string()));
    }
    builder.push("\"");
    builder.push(name);
    builder.push("\"");
    Ok(())
}

fn push_pg_value(
    builder: &mut sqlx::QueryBuilder<sqlx::Postgres>,
    value: &Value,
    prisma_type: &str,
) -> Result<(), DualWriteError> {
    let bind = sqlite_json_to_pg(value, prisma_type).map_err(|err| DualWriteError::TypeMapping(err.to_string()))?;
    match bind {
        PgBindValue::String(v) => builder.push_bind(v),
        PgBindValue::I32(v) => builder.push_bind(v),
        PgBindValue::I64(v) => builder.push_bind(v),
        PgBindValue::F64(v) => builder.push_bind(v),
        PgBindValue::Bool(v) => builder.push_bind(v),
        PgBindValue::DateTime(v) => builder.push_bind(v),
        PgBindValue::Json(v) => builder.push_bind(v),
        PgBindValue::StringArray(v) => builder.push_bind(v),
        PgBindValue::I32Array(v) => builder.push_bind(v),
    };
    Ok(())
}

fn push_sqlite_value(
    builder: &mut sqlx::QueryBuilder<Sqlite>,
    value: &Value,
    prisma_type: &str,
) -> Result<(), DualWriteError> {
    let bind = pg_json_to_sqlite(value, prisma_type).map_err(|err| DualWriteError::TypeMapping(err.to_string()))?;
    match bind {
        SqliteBindValue::Text(v) => builder.push_bind(v),
        SqliteBindValue::Integer(v) => builder.push_bind(v),
        SqliteBindValue::Real(v) => builder.push_bind(v),
        SqliteBindValue::Blob(v) => builder.push_bind(v),
    };
    Ok(())
}

fn push_pg_where(
    builder: &mut sqlx::QueryBuilder<sqlx::Postgres>,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("where clause cannot be empty".to_string()));
    }
    for (idx, (col, value)) in where_clause.iter().enumerate() {
        if idx > 0 { builder.push(" AND "); }
        push_pg_ident(builder, col)?;
        builder.push(" = ");
        let field = schema
            .fields
            .iter()
            .find(|f| f.name == col.as_str())
            .ok_or_else(|| DualWriteError::UnknownColumn(col.clone()))?;
        push_pg_value(builder, value, &field.prisma_type)?;
    }
    Ok(())
}

fn push_sqlite_where(
    builder: &mut sqlx::QueryBuilder<Sqlite>,
    schema: &TableSchema,
    where_clause: &Map<String, Value>,
) -> Result<(), DualWriteError> {
    if where_clause.is_empty() {
        return Err(DualWriteError::InvalidOperation("where clause cannot be empty".to_string()));
    }
    for (idx, (col, value)) in where_clause.iter().enumerate() {
        if idx > 0 { builder.push(" AND "); }
        push_sqlite_ident(builder, col)?;
        builder.push(" = ");
        let field = schema
            .fields
            .iter()
            .find(|f| f.name == col.as_str())
            .ok_or_else(|| DualWriteError::UnknownColumn(col.clone()))?;
        push_sqlite_value(builder, value, &field.prisma_type)?;
    }
    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
