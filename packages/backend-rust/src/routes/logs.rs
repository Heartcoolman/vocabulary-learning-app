use std::collections::HashMap;
use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::Request;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
}

#[derive(Debug, Deserialize)]
struct ErrorInfo {
    message: String,
    #[serde(default)]
    stack: Option<String>,
    name: String,
}

#[derive(Debug, Deserialize)]
struct LogEntry {
    level: LogLevel,
    msg: String,
    time: String,
    app: String,
    env: String,
    #[serde(default)]
    module: Option<String>,
    #[serde(default)]
    context: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    err: Option<ErrorInfo>,
}

#[derive(Debug, Deserialize)]
struct BatchLogsRequest {
    logs: Vec<LogEntry>,
}

#[derive(Debug, Serialize)]
struct BatchLogsResponse {
    success: bool,
    received: usize,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    timestamp: String,
}

pub async fn ingest(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
) -> Response {
    let user = if let (Some(token), Some(proxy)) = (crate::auth::extract_token(req.headers()), state.db_proxy()) {
        crate::auth::verify_request_token(proxy.as_ref(), &token).await.ok()
    } else {
        None
    };

    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return json_error(
                axum::http::StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "无效请求",
            )
            .into_response();
        }
    };

    let payload: BatchLogsRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "error": "日志格式无效",
                })),
            )
                .into_response();
        }
    };

    if payload.logs.len() > 100 {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "error": "日志格式无效",
            })),
        )
            .into_response();
    }

    let received = payload.logs.len();

    if payload.logs.iter().any(|entry| {
        if entry.msg.len() > 10_000 || entry.app.len() > 100 || entry.env.len() > 50 {
            return true;
        }
        if let Some(module) = entry.module.as_ref() {
            if module.len() > 100 {
                return true;
            }
        }
        if let Some(err) = entry.err.as_ref() {
            if err.message.len() > 5_000 || err.name.len() > 200 {
                return true;
            }
            if let Some(stack) = err.stack.as_ref() {
                if stack.len() > 10_000 {
                    return true;
                }
            }
        }
        false
    }) {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "error": "日志格式无效",
            })),
        )
            .into_response();
    }

    let user_agent = parts
        .headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown");

    let client_ip = addr.ip().to_string();
    let user_id = user.as_ref().map(|u| u.id.as_str()).unwrap_or("anonymous");
    let username = user.as_ref().map(|u| u.username.as_str()).unwrap_or("anonymous");

    for entry in payload.logs {
        let mut ctx = serde_json::Map::new();
        ctx.insert("clientIp".to_string(), serde_json::Value::String(client_ip.clone()));
        ctx.insert("userAgent".to_string(), serde_json::Value::String(user_agent.to_string()));
        ctx.insert("originalTime".to_string(), serde_json::Value::String(entry.time.clone()));
        ctx.insert("frontendApp".to_string(), serde_json::Value::String(entry.app.clone()));
        ctx.insert("frontendEnv".to_string(), serde_json::Value::String(entry.env.clone()));
        if let Some(module) = entry.module.clone() {
            ctx.insert("frontendModule".to_string(), serde_json::Value::String(module));
        }
        ctx.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        ctx.insert("username".to_string(), serde_json::Value::String(username.to_string()));

        if let Some(extra) = entry.context.clone() {
            for (key, value) in extra {
                ctx.insert(key, value);
            }
        }

        let error_json = entry.err.as_ref().map(|err| {
            serde_json::json!({
                "message": err.message,
                "stack": err.stack,
                "name": err.name,
            })
        });

        if let Some(ref err) = entry.err {
            ctx.insert(
                "frontendError".to_string(),
                serde_json::json!({
                    "message": err.message,
                    "stack": err.stack,
                    "name": err.name,
                }),
            );
        }

        let ctx_str = serde_json::Value::Object(ctx.clone()).to_string();
        match entry.level {
            LogLevel::Trace => tracing::trace!(context = %ctx_str, "{}", entry.msg),
            LogLevel::Debug => tracing::debug!(context = %ctx_str, "{}", entry.msg),
            LogLevel::Info => tracing::info!(context = %ctx_str, "{}", entry.msg),
            LogLevel::Warn => tracing::warn!(context = %ctx_str, "{}", entry.msg),
            LogLevel::Error | LogLevel::Fatal => tracing::error!(context = %ctx_str, "{}", entry.msg),
        }

        // Write to database
        if let Some(ref proxy) = state.db_proxy() {
            let pool = proxy.pool();
            let log_id = uuid::Uuid::new_v4().to_string();
            let level_str = match entry.level {
                LogLevel::Trace => "TRACE",
                LogLevel::Debug => "DEBUG",
                LogLevel::Info => "INFO",
                LogLevel::Warn => "WARN",
                LogLevel::Error => "ERROR",
                LogLevel::Fatal => "FATAL",
            };
            let context_json = serde_json::Value::Object(ctx);
            let timestamp = chrono::DateTime::parse_from_rfc3339(&entry.time)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            if let Err(e) = sqlx::query(
                r#"INSERT INTO "system_logs" ("id", "level", "message", "module", "source", "context", "error", "userId", "clientIp", "userAgent", "app", "env", "timestamp")
                   VALUES ($1, $2::"LogLevel", $3, $4, 'FRONTEND'::"LogSource", $5, $6, $7, $8, $9, $10, $11, $12)"#
            )
            .bind(&log_id)
            .bind(level_str)
            .bind(&entry.msg)
            .bind(&entry.module)
            .bind(&context_json)
            .bind(&error_json)
            .bind(if user_id == "anonymous" { None } else { Some(user_id) })
            .bind(&client_ip)
            .bind(user_agent)
            .bind(&entry.app)
            .bind(&entry.env)
            .bind(timestamp)
            .execute(pool)
            .await
            {
                tracing::error!("Failed to write log to database: {}", e);
            }
        }
    }

    (
        axum::http::StatusCode::ACCEPTED,
        Json(BatchLogsResponse {
            success: true,
            received,
        }),
    )
        .into_response()
}

pub async fn health() -> Response {
    Json(HealthResponse {
        status: "ok",
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
    .into_response()
}
