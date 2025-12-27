use crate::db::DatabaseProxy;
use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use sqlx::PgPool;
use tracing::{debug, info};

#[derive(Debug, Default)]
struct CleanupStats {
    expired_sessions: i64,
    duration_secs: f64,
}

pub async fn cleanup_expired_sessions(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let start = Instant::now();
    debug!("Starting session cleanup cycle");

    let pool = db.pool();

    let mut stats = CleanupStats::default();

    let deleted = delete_expired_sessions(pool).await?;
    stats.expired_sessions = deleted;

    stats.duration_secs = start.elapsed().as_secs_f64();

    info!(
        expired_sessions = stats.expired_sessions,
        duration_secs = format!("{:.2}", stats.duration_secs),
        "Session cleanup completed"
    );

    Ok(())
}

async fn delete_expired_sessions(pool: &PgPool) -> Result<i64, super::WorkerError> {
    let now = Utc::now();

    let result = sqlx::query(
        r#"
        DELETE FROM "sessions"
        WHERE "expiresAt" < $1
        "#)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() as i64)
}
