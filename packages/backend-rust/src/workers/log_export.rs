use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgRow;
use sqlx::Row;
use tokio::fs;

use crate::db::DatabaseProxy;
use crate::workers::WorkerError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportedLog {
    id: String,
    level: String,
    message: String,
    module: Option<String>,
    source: String,
    context: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
    request_id: Option<String>,
    user_id: Option<String>,
    client_ip: Option<String>,
    user_agent: Option<String>,
    app: Option<String>,
    env: Option<String>,
    timestamp: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportCheckpoint {
    last_exported_at: String,
    last_id: Option<String>,
}

pub async fn export_system_logs(
    db: Arc<DatabaseProxy>,
    export_dir: &str,
) -> Result<(), WorkerError> {
    let export_dir = PathBuf::from(export_dir);
    fs::create_dir_all(&export_dir)
        .await
        .map_err(|e| WorkerError::Custom(format!("create export dir: {e}")))?;

    let checkpoint_path = export_dir.join("checkpoint.json");
    let lookback_hours: i64 = std::env::var("LOG_EXPORT_LOOKBACK_HOURS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(24)
        .max(1);

    let (mut last_exported, mut last_id) = load_checkpoint(&checkpoint_path)
        .await
        .unwrap_or_else(|| (Utc::now() - Duration::hours(lookback_hours), String::new()));

    let batch_size: i64 = std::env::var("LOG_EXPORT_BATCH_SIZE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1000)
        .clamp(1, 5000);

    let mut logs = Vec::new();
    loop {
        let rows = sqlx::query(
            r#"SELECT "id","level"::text,"message","module","source"::text,"context","error",
                      "requestId","userId","clientIp","userAgent","app","env","timestamp"
               FROM "system_logs"
               WHERE ("timestamp", "id"::text) > ($1, $2)
               ORDER BY "timestamp" ASC, "id" ASC
               LIMIT $3"#,
        )
        .bind(last_exported)
        .bind(&last_id)
        .bind(batch_size)
        .fetch_all(db.pool())
        .await
        .map_err(WorkerError::Database)?;

        if rows.is_empty() {
            break;
        }

        for row in rows {
            match parse_log_row(&row) {
                Ok((entry, ts, id)) => {
                    last_exported = ts;
                    last_id = id;
                    logs.push(entry);
                }
                Err(e) => tracing::warn!(error = %e, "skipping invalid log row"),
            }
        }

        if logs.len() >= 10000 {
            break;
        }
    }

    if logs.is_empty() {
        tracing::debug!("no new logs to export");
        return Ok(());
    }

    let now = Utc::now();
    let file_name = format!(
        "system_logs-{}-{}.json",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_millis() % 1000
    );
    let payload = serde_json::to_string_pretty(&logs)
        .map_err(|e| WorkerError::Custom(format!("serialize logs: {e}")))?;

    fs::write(export_dir.join(&file_name), payload)
        .await
        .map_err(|e| WorkerError::Custom(format!("write log file: {e}")))?;

    save_checkpoint(&checkpoint_path, last_exported, &last_id).await?;

    tracing::info!(count = logs.len(), file = %file_name, "exported system logs");
    Ok(())
}

fn parse_log_row(row: &PgRow) -> Result<(ExportedLog, DateTime<Utc>, String), WorkerError> {
    let timestamp: DateTime<Utc> = row
        .try_get::<DateTime<Utc>, _>("timestamp")
        .map_err(|e| WorkerError::Custom(format!("invalid timestamp: {e}")))?;

    let id: String = row
        .try_get("id")
        .map_err(|e| WorkerError::Custom(format!("invalid id: {e}")))?;

    let entry = ExportedLog {
        id: id.clone(),
        level: row.try_get("level").unwrap_or_default(),
        message: row.try_get("message").unwrap_or_default(),
        module: row.try_get("module").ok(),
        source: row.try_get("source").unwrap_or_default(),
        context: row.try_get("context").ok(),
        error: row.try_get("error").ok(),
        request_id: row.try_get("requestId").ok(),
        user_id: row.try_get("userId").ok(),
        client_ip: row.try_get("clientIp").ok(),
        user_agent: row.try_get("userAgent").ok(),
        app: row.try_get("app").ok(),
        env: row.try_get("env").ok(),
        timestamp: timestamp.to_rfc3339(),
    };

    Ok((entry, timestamp, id))
}

async fn load_checkpoint(path: &Path) -> Option<(DateTime<Utc>, String)> {
    let contents = fs::read_to_string(path).await.ok()?;
    let checkpoint: ExportCheckpoint = serde_json::from_str(&contents).ok()?;
    let ts = DateTime::parse_from_rfc3339(&checkpoint.last_exported_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))?;
    Some((ts, checkpoint.last_id.unwrap_or_default()))
}

async fn save_checkpoint(path: &Path, timestamp: DateTime<Utc>, last_id: &str) -> Result<(), WorkerError> {
    let checkpoint = ExportCheckpoint {
        last_exported_at: timestamp.to_rfc3339(),
        last_id: Some(last_id.to_string()),
    };
    let payload = serde_json::to_string_pretty(&checkpoint)
        .map_err(|e| WorkerError::Custom(format!("serialize checkpoint: {e}")))?;
    fs::write(path, payload)
        .await
        .map_err(|e| WorkerError::Custom(format!("write checkpoint: {e}")))?;
    Ok(())
}
