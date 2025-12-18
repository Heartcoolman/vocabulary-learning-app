use sqlx::sqlite::SqliteRow;
use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone)]
pub struct PendingWrite {
    pub operation_id: String,
    pub operation_data: serde_json::Value,
    pub created_at: Option<String>,
}

#[derive(Clone)]
pub struct SqlitePendingWriteStore {
    pool: SqlitePool,
}

impl SqlitePendingWriteStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save(&self, operation_id: &str, operation_data: &serde_json::Value) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO "_pending_writes" ("operation_id", "operation_data", "created_at")
            VALUES (?, ?, CURRENT_TIMESTAMP)
            "#,
        )
        .bind(operation_id)
        .bind(operation_data.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn remove(&self, operation_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(r#"DELETE FROM "_pending_writes" WHERE "operation_id" = ?"#)
            .bind(operation_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_all(&self) -> Result<Vec<PendingWrite>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT "operation_id", "operation_data", "created_at"
            FROM "_pending_writes"
            ORDER BY "created_at" ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().filter_map(map_pending_row).collect())
    }

    pub async fn count(&self) -> Result<u64, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "_pending_writes""#)
            .fetch_one(&self.pool)
            .await?;
        Ok(count.max(0) as u64)
    }

    pub async fn clear(&self) -> Result<(), sqlx::Error> {
        sqlx::query(r#"DELETE FROM "_pending_writes""#)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

fn map_pending_row(row: SqliteRow) -> Option<PendingWrite> {
    let operation_id: String = row.try_get("operation_id").ok()?;
    let raw: String = row.try_get("operation_data").ok()?;
    let operation_data: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let created_at: Option<String> = row.try_get("created_at").ok();

    Some(PendingWrite {
        operation_id,
        operation_data,
        created_at,
    })
}

