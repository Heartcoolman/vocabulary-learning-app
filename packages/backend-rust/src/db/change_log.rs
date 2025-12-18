use sqlx::sqlite::SqliteRow;
use sqlx::{Row, Sqlite, SqlitePool, Transaction};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeOperation {
    Insert,
    Update,
    Delete,
}

impl ChangeOperation {
    pub const fn as_str(self) -> &'static str {
        match self {
            ChangeOperation::Insert => "INSERT",
            ChangeOperation::Update => "UPDATE",
            ChangeOperation::Delete => "DELETE",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChangeLogEntry {
    pub id: i64,
    pub operation: String,
    pub table_name: String,
    pub row_id: String,
    pub old_data: Option<String>,
    pub new_data: Option<String>,
    pub timestamp: i64,
    pub synced: bool,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ChangeLogEntryInput {
    pub operation: ChangeOperation,
    pub table_name: String,
    pub row_id: String,
    pub old_data: Option<String>,
    pub new_data: Option<String>,
    pub timestamp: i64,
    pub idempotency_key: Option<String>,
    pub tx_id: Option<String>,
    pub tx_seq: Option<i64>,
    pub tx_committed: bool,
}

#[derive(Clone)]
pub struct SqliteChangeLogManager {
    pool: SqlitePool,
}

impl SqliteChangeLogManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn log_change_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        entry: &ChangeLogEntryInput,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO "_changelog" (
              "operation",
              "table_name",
              "row_id",
              "old_data",
              "new_data",
              "timestamp",
              "idempotency_key",
              "tx_id",
              "tx_seq",
              "tx_committed"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(entry.operation.as_str())
        .bind(&entry.table_name)
        .bind(&entry.row_id)
        .bind(&entry.old_data)
        .bind(&entry.new_data)
        .bind(entry.timestamp)
        .bind(&entry.idempotency_key)
        .bind(&entry.tx_id)
        .bind(entry.tx_seq)
        .bind(if entry.tx_committed { 1 } else { 0 })
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    pub async fn log_changes_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        entries: &[ChangeLogEntryInput],
    ) -> Result<(), sqlx::Error> {
        for entry in entries {
            self.log_change_tx(tx, entry).await?;
        }
        Ok(())
    }

    pub async fn get_unsynced_count(&self) -> Result<u64, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "_changelog" WHERE "synced" = 0"#)
            .fetch_one(&self.pool)
            .await?;
        Ok(count.max(0) as u64)
    }

    pub async fn fetch_unsynced_changes(&self, limit: u32) -> Result<Vec<ChangeLogEntry>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
              "id",
              "operation",
              "table_name",
              "row_id",
              "old_data",
              "new_data",
              "timestamp",
              "synced",
              "idempotency_key"
            FROM "_changelog"
            WHERE "synced" = 0
            ORDER BY "timestamp" ASC, "id" ASC
            LIMIT ?
            "#,
        )
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_changelog_row).collect())
    }

    pub async fn mark_synced(&self, ids: &[i64]) -> Result<(), sqlx::Error> {
        if ids.is_empty() {
            return Ok(());
        }

        let mut qb = sqlx::QueryBuilder::<Sqlite>::new(
            r#"UPDATE "_changelog" SET "synced" = 1 WHERE "id" IN ("#,
        );
        let mut separated = qb.separated(", ");
        for id in ids {
            separated.push_bind(*id);
        }
        qb.push(")");

        qb.build().execute(&self.pool).await?;
        Ok(())
    }
}

fn map_changelog_row(row: SqliteRow) -> ChangeLogEntry {
    ChangeLogEntry {
        id: row.try_get("id").unwrap_or_default(),
        operation: row.try_get("operation").unwrap_or_default(),
        table_name: row.try_get("table_name").unwrap_or_default(),
        row_id: row.try_get("row_id").unwrap_or_default(),
        old_data: row.try_get("old_data").ok(),
        new_data: row.try_get("new_data").ok(),
        timestamp: row.try_get("timestamp").unwrap_or_default(),
        synced: row.try_get::<i64, _>("synced").unwrap_or_default() == 1,
        idempotency_key: row.try_get("idempotency_key").ok(),
    }
}

