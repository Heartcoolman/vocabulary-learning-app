use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::response::AppError;
use crate::state::AppState;

const OTA_SOCKET_PATH_ENV: &str = "OTA_SOCKET_PATH";
const OTA_STATUS_FILE_ENV: &str = "OTA_STATUS_FILE";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OTAUpdateStatus {
    pub stage: String,
    pub progress: u8,
    pub message: String,
    pub error: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
struct RawOTAUpdateStatus {
    stage: Option<String>,
    progress: Option<u8>,
    message: Option<String>,
    error: Option<String>,
    timestamp: Option<String>,
}

fn now_iso8601() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn env_required(key: &'static str) -> Result<String, AppError> {
    std::env::var(key).map_err(|_| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "OTA_NOT_CONFIGURED",
            format!("{key} 未配置"),
        )
    })
}

#[cfg(unix)]
fn trigger_update_socket_blocking(socket_path: String) -> Result<(), std::io::Error> {
    use std::io::Write;
    use std::os::unix::net::UnixStream;

    let mut stream = UnixStream::connect(socket_path)?;
    stream.write_all(b"update\n")?;
    stream.flush()?;
    Ok(())
}

#[cfg(not(unix))]
fn trigger_update_socket_blocking(_socket_path: String) -> Result<(), std::io::Error> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Unix sockets are not supported on this platform",
    ))
}

pub async fn trigger_update(State(_state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let socket_path = env_required(OTA_SOCKET_PATH_ENV)?;

    let result = tokio::task::spawn_blocking(move || trigger_update_socket_blocking(socket_path))
        .await
        .map_err(|_| {
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "OTA_THREAD_ERROR",
                "触发 OTA 更新失败",
            )
        })?;

    result.map_err(|_| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "OTA_SOCKET_ERROR",
            "OTA 更新服务不可用",
        )
    })?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "triggered": true }
    })))
}

pub async fn get_update_status(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let status_file = env_required(OTA_STATUS_FILE_ENV)?;

    let contents = match tokio::fs::read_to_string(&status_file).await {
        Ok(s) => s,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            let status = OTAUpdateStatus {
                stage: "idle".to_string(),
                progress: 0,
                message: String::new(),
                error: None,
                timestamp: now_iso8601(),
            };
            return Ok(Json(serde_json::json!({
                "success": true,
                "data": status
            })));
        }
        Err(_) => {
            return Err(json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "OTA_STATUS_UNAVAILABLE",
                "读取 OTA 状态失败",
            ));
        }
    };

    let raw: RawOTAUpdateStatus = serde_json::from_str(&contents).map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "OTA_STATUS_INVALID",
            "OTA 状态文件内容无效",
        )
    })?;

    let mut stage = raw.stage.unwrap_or_else(|| "idle".to_string());
    if stage.trim().is_empty() {
        stage = "idle".to_string();
    }

    let status = OTAUpdateStatus {
        stage,
        progress: raw.progress.unwrap_or(0).min(100),
        message: raw.message.unwrap_or_default(),
        error: raw.error,
        timestamp: raw.timestamp.unwrap_or_else(now_iso8601),
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": status
    })))
}
