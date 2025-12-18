use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Extension;
use axum::{Json, Router};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::sync::RwLock;
use tracing::warn;
use uuid::Uuid;

use crate::db::state_machine::DatabaseState;
use crate::middleware::RequestDbState;
use crate::response::{json_error, AppError};
use crate::services::llm_provider::{ChatMessage, LLMProvider};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmConfigSummaryDto {
    enabled: bool,
    provider: String,
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
    timeout: i64,
    max_retries: i64,
    temperature: f64,
    max_tokens: i64,
    api_key_set: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerStatusDto {
    enabled: bool,
    auto_analysis_enabled: bool,
    is_running: bool,
    schedule: String,
    pending_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigResponseDto {
    config: LlmConfigSummaryDto,
    worker: WorkerStatusDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthDto {
    status: String,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuggestionsQuery {
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApproveBody {
    selected_items: serde_json::Value,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RejectBody {
    notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestionListDto {
    items: Vec<StoredSuggestionDto>,
    total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingCountDto {
    count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TriggerDto {
    suggestion_id: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredSuggestionDto {
    id: String,
    week_start: String,
    week_end: String,
    stats_snapshot: serde_json::Value,
    raw_response: String,
    parsed_suggestion: serde_json::Value,
    status: String,
    reviewed_by: Option<String>,
    reviewed_at: Option<String>,
    review_notes: Option<String>,
    applied_items: Option<Vec<String>>,
    created_at: String,
}

#[derive(Default)]
struct LlmAdvisorStore {
    is_running: RwLock<bool>,
}

static LLM_ADVISOR_STORE: OnceLock<Arc<LlmAdvisorStore>> = OnceLock::new();

fn store() -> Arc<LlmAdvisorStore> {
    LLM_ADVISOR_STORE
        .get_or_init(|| Arc::new(LlmAdvisorStore::default()))
        .clone()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config", get(get_config))
        .route("/health", get(get_health))
        .route("/suggestions", get(list_suggestions))
        .route("/suggestions/:id", get(get_suggestion))
        .route("/suggestions/:id/approve", post(approve_suggestion))
        .route("/suggestions/:id/reject", post(reject_suggestion))
        .route("/trigger", post(trigger_analysis))
        .route("/latest", get(get_latest))
        .route("/pending-count", get(get_pending_count))
}

fn env_string(key: &str) -> Option<String> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn env_bool(key: &str) -> Option<bool> {
    let value = std::env::var(key).ok()?;
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    match normalized.as_str() {
        "1" | "true" | "yes" | "y" | "on" => Some(true),
        "0" | "false" | "no" | "n" | "off" => Some(false),
        _ => None,
    }
}

fn env_i64(key: &str) -> Option<i64> {
    env_string(key)?.parse::<i64>().ok()
}

fn env_f64(key: &str) -> Option<f64> {
    env_string(key)?.parse::<f64>().ok()
}

fn llm_default_model(provider: &str) -> &'static str {
    match provider {
        "openai" => "gpt-4o-mini",
        "anthropic" => "claude-3-haiku-20240307",
        "ollama" => "llama3.2",
        "custom" => "default",
        _ => "gpt-4o-mini",
    }
}

fn llm_default_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("https://api.openai.com/v1"),
        "anthropic" => Some("https://api.anthropic.com/v1"),
        "ollama" => Some("http://localhost:11434/api"),
        "custom" => None,
        _ => Some("https://api.openai.com/v1"),
    }
}

fn llm_config_summary() -> LlmConfigSummaryDto {
    let enabled = env_bool("LLM_ADVISOR_ENABLED").unwrap_or(false);
    let provider = env_string("LLM_PROVIDER").unwrap_or_else(|| "openai".to_string()).to_ascii_lowercase();
    let model = env_string("LLM_MODEL").unwrap_or_else(|| llm_default_model(&provider).to_string());
    let api_key = env_string("LLM_API_KEY").unwrap_or_default();
    let base_url = env_string("LLM_BASE_URL").or_else(|| llm_default_base_url(&provider).map(|v| v.to_string()));

    let timeout = env_i64("LLM_TIMEOUT").unwrap_or(60_000);
    let max_retries = env_i64("LLM_MAX_RETRIES").unwrap_or(2);
    let temperature = env_f64("LLM_TEMPERATURE").unwrap_or(0.3);
    let max_tokens = env_i64("LLM_MAX_TOKENS").unwrap_or(4096);

    LlmConfigSummaryDto {
        enabled,
        provider,
        model,
        base_url,
        timeout,
        max_retries,
        temperature,
        max_tokens,
        api_key_set: !api_key.is_empty(),
    }
}

fn schedule_config() -> (bool, String) {
    let auto_analysis_enabled = env_string("LLM_AUTO_ANALYSIS")
        .map(|v| v.trim().to_ascii_lowercase() != "false")
        .unwrap_or(true);
    let schedule = env_string("LLM_WEEKLY_CRON").unwrap_or_else(|| "0 4 * * 0".to_string());
    (auto_analysis_enabled, schedule)
}

fn llm_config_valid(summary: &LlmConfigSummaryDto) -> (bool, String) {
    if !summary.enabled {
        return (true, "LLM 顾问未启用".to_string());
    }
    if summary.model.trim().is_empty() {
        return (false, "LLM_MODEL 未设置".to_string());
    }
    if summary.provider != "ollama" && !summary.api_key_set {
        return (false, "LLM_API_KEY 未设置".to_string());
    }
    (true, "配置有效".to_string())
}

async fn require_user(
    state: &AppState,
    request_state: Option<Extension<RequestDbState>>,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser, DatabaseState), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let db_state = request_state
        .map(|Extension(value)| value.0)
        .unwrap_or(DatabaseState::Normal);

    let proxy = state
        .db_proxy()
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), db_state, &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    Ok((proxy, user, db_state))
}

async fn require_admin_user(
    state: &AppState,
    request_state: Option<Extension<RequestDbState>>,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser, DatabaseState), AppError> {
    let (proxy, user, db_state) = require_user(state, request_state, headers).await?;
    if user.role != "ADMIN" {
        return Err(json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "权限不足，需要管理员权限"));
    }
    Ok((proxy, user, db_state))
}

fn format_sqlite_datetime_iso(raw: &str) -> String {
    let ms = crate::auth::parse_sqlite_datetime_ms(raw).unwrap_or_else(|| Utc::now().timestamp_millis());
    crate::auth::format_timestamp_ms_iso_millis(ms).unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn json_from_sqlite(raw: Option<String>) -> serde_json::Value {
    let Some(raw) = raw else {
        return serde_json::Value::Null;
    };
    if raw.trim().is_empty() {
        return serde_json::Value::Null;
    }
    serde_json::from_str(&raw).unwrap_or(serde_json::Value::String(raw))
}

fn parse_string_array(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

fn extract_suggestion_ids(parsed: &serde_json::Value) -> HashSet<String> {
    let mut out = HashSet::new();
    let Some(suggestions) = parsed.get("suggestions").and_then(|v| v.as_array()) else {
        return out;
    };
    for item in suggestions {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            out.insert(id.to_string());
        }
    }
    out
}

async fn count_pending(proxy: &crate::db::DatabaseProxy, state: DatabaseState) -> Result<i64, AppError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(0);
        };
        let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions" WHERE "status" = 'pending'"#)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);
        Ok(count)
    } else {
        let Some(pool) = primary else {
            return Ok(0);
        };
        let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions" WHERE "status" = 'pending'"#)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);
        Ok(count)
    }
}

async fn get_config(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user, db_state) = require_admin_user(&state, request_state, &headers).await?;
    let config = llm_config_summary();
    let (auto_analysis_enabled, schedule) = schedule_config();
    let pending_count = count_pending(proxy.as_ref(), db_state).await.unwrap_or(0);
    let is_running = *store().is_running.read().await;

    Ok(Json(SuccessResponse {
        success: true,
        data: ConfigResponseDto {
            config: config.clone(),
            worker: WorkerStatusDto {
                enabled: config.enabled,
                auto_analysis_enabled,
                is_running,
                schedule,
                pending_count,
            },
        },
    }))
}

async fn get_health(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user, _db_state) = require_admin_user(&state, request_state, &headers).await?;
    let config = llm_config_summary();
    if !config.enabled {
        return Ok(Json(SuccessResponse {
            success: true,
            data: HealthDto {
                status: "disabled".to_string(),
                message: "LLM 顾问未启用".to_string(),
            },
        }));
    }

    let (valid, message) = llm_config_valid(&config);
    Ok(Json(SuccessResponse {
        success: true,
        data: HealthDto {
            status: if valid { "healthy" } else { "unhealthy" }.to_string(),
            message: if valid { "LLM 配置已就绪（未执行网络探测）" } else { message.as_str() }.to_string(),
        },
    }))
}

async fn list_suggestions(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Query(query): Query<SuggestionsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user, db_state) = require_admin_user(&state, request_state, &headers).await?;

    if let Some(status) = query.status.as_deref() {
        let valid = ["pending", "approved", "rejected", "partial"];
        if !valid.contains(&status) {
            return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "status 参数无效"));
        }
    }

    let limit = query.limit.unwrap_or(20).max(1).min(100);
    let offset = query.offset.unwrap_or(0).max(0);

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    let (items, total) = if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Json(SuccessResponse {
                success: true,
                data: SuggestionListDto { items: Vec::new(), total: 0 },
            }));
        };

        let total: i64 = if let Some(status) = query.status.as_deref() {
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions" WHERE "status" = ?"#)
                .bind(status)
                .fetch_one(&pool)
                .await
                .unwrap_or(0)
        } else {
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions""#)
                .fetch_one(&pool)
                .await
                .unwrap_or(0)
        };

        let rows = if let Some(status) = query.status.as_deref() {
            sqlx::query(
                r#"
                SELECT
                    "id",
                    "weekStart" as "weekStart",
                    "weekEnd" as "weekEnd",
                    "statsSnapshot" as "statsSnapshot",
                    "rawResponse" as "rawResponse",
                    "parsedSuggestion" as "parsedSuggestion",
                    "status" as "status",
                    "reviewedBy" as "reviewedBy",
                    "reviewedAt" as "reviewedAt",
                    "reviewNotes" as "reviewNotes",
                    "appliedItems" as "appliedItems",
                    "createdAt" as "createdAt"
                FROM "llm_advisor_suggestions"
                WHERE "status" = ?
                ORDER BY "createdAt" DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await
            .unwrap_or_default()
        } else {
            sqlx::query(
                r#"
                SELECT
                    "id",
                    "weekStart" as "weekStart",
                    "weekEnd" as "weekEnd",
                    "statsSnapshot" as "statsSnapshot",
                    "rawResponse" as "rawResponse",
                    "parsedSuggestion" as "parsedSuggestion",
                    "status" as "status",
                    "reviewedBy" as "reviewedBy",
                    "reviewedAt" as "reviewedAt",
                    "reviewNotes" as "reviewNotes",
                    "appliedItems" as "appliedItems",
                    "createdAt" as "createdAt"
                FROM "llm_advisor_suggestions"
                ORDER BY "createdAt" DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await
            .unwrap_or_default()
        };

        let items = rows
            .into_iter()
            .map(|row| {
                let id: String = row.try_get("id").unwrap_or_default();
                let week_start_raw: String = row.try_get("weekStart").unwrap_or_default();
                let week_end_raw: String = row.try_get("weekEnd").unwrap_or_default();
                let stats_snapshot_raw: Option<String> = row.try_get("statsSnapshot").ok();
                let raw_response: String = row.try_get("rawResponse").unwrap_or_default();
                let parsed_suggestion_raw: Option<String> = row.try_get("parsedSuggestion").ok();
                let status: String = row.try_get("status").unwrap_or_else(|_| "pending".to_string());
                let reviewed_by: Option<String> = row.try_get("reviewedBy").ok();
                let reviewed_at_raw: Option<String> = row.try_get("reviewedAt").ok();
                let review_notes: Option<String> = row.try_get("reviewNotes").ok();
                let applied_items_raw: Option<String> = row.try_get("appliedItems").ok();
                let created_at_raw: String = row.try_get("createdAt").unwrap_or_default();

                let stats_snapshot = json_from_sqlite(stats_snapshot_raw);
                let parsed_suggestion = json_from_sqlite(parsed_suggestion_raw);
                let applied_items_json = json_from_sqlite(applied_items_raw);
                let applied_items = if applied_items_json.is_null() {
                    None
                } else {
                    Some(parse_string_array(&applied_items_json))
                };

                StoredSuggestionDto {
                    id,
                    week_start: format_sqlite_datetime_iso(&week_start_raw),
                    week_end: format_sqlite_datetime_iso(&week_end_raw),
                    stats_snapshot,
                    raw_response,
                    parsed_suggestion,
                    status,
                    reviewed_by,
                    reviewed_at: reviewed_at_raw.map(|raw| format_sqlite_datetime_iso(&raw)),
                    review_notes,
                    applied_items,
                    created_at: format_sqlite_datetime_iso(&created_at_raw),
                }
            })
            .collect::<Vec<_>>();

        (items, total)
    } else {
        let Some(pool) = primary else {
            return Ok(Json(SuccessResponse {
                success: true,
                data: SuggestionListDto { items: Vec::new(), total: 0 },
            }));
        };

        let total: i64 = if let Some(status) = query.status.as_deref() {
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions" WHERE "status" = $1"#)
                .bind(status)
                .fetch_one(&pool)
                .await
                .unwrap_or(0)
        } else {
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions""#)
                .fetch_one(&pool)
                .await
                .unwrap_or(0)
        };

        let rows = if let Some(status) = query.status.as_deref() {
            sqlx::query(
                r#"
                SELECT
                    "id",
                    "weekStart" as "weekStart",
                    "weekEnd" as "weekEnd",
                    "statsSnapshot" as "statsSnapshot",
                    "rawResponse" as "rawResponse",
                    "parsedSuggestion" as "parsedSuggestion",
                    "status" as "status",
                    "reviewedBy" as "reviewedBy",
                    "reviewedAt" as "reviewedAt",
                    "reviewNotes" as "reviewNotes",
                    "appliedItems" as "appliedItems",
                    "createdAt" as "createdAt"
                FROM "llm_advisor_suggestions"
                WHERE "status" = $1
                ORDER BY "createdAt" DESC
                LIMIT $2 OFFSET $3
                "#,
            )
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await
            .unwrap_or_default()
        } else {
            sqlx::query(
                r#"
                SELECT
                    "id",
                    "weekStart" as "weekStart",
                    "weekEnd" as "weekEnd",
                    "statsSnapshot" as "statsSnapshot",
                    "rawResponse" as "rawResponse",
                    "parsedSuggestion" as "parsedSuggestion",
                    "status" as "status",
                    "reviewedBy" as "reviewedBy",
                    "reviewedAt" as "reviewedAt",
                    "reviewNotes" as "reviewNotes",
                    "appliedItems" as "appliedItems",
                    "createdAt" as "createdAt"
                FROM "llm_advisor_suggestions"
                ORDER BY "createdAt" DESC
                LIMIT $1 OFFSET $2
                "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await
            .unwrap_or_default()
        };

        let items = rows
            .into_iter()
            .map(|row| {
                let id: String = row.try_get("id").unwrap_or_default();
                let week_start: chrono::NaiveDateTime = row.try_get("weekStart").unwrap_or_else(|_| Utc::now().naive_utc());
                let week_end: chrono::NaiveDateTime = row.try_get("weekEnd").unwrap_or_else(|_| Utc::now().naive_utc());
                let stats_snapshot: serde_json::Value = row.try_get("statsSnapshot").unwrap_or(serde_json::Value::Null);
                let raw_response: String = row.try_get("rawResponse").unwrap_or_default();
                let parsed_suggestion: serde_json::Value = row.try_get("parsedSuggestion").unwrap_or(serde_json::Value::Null);
                let status: String = row.try_get("status").unwrap_or_else(|_| "pending".to_string());
                let reviewed_by: Option<String> = row.try_get("reviewedBy").ok();
                let reviewed_at: Option<chrono::NaiveDateTime> = row.try_get("reviewedAt").ok();
                let review_notes: Option<String> = row.try_get("reviewNotes").ok();
                let applied_items_val: Option<serde_json::Value> = row.try_get("appliedItems").ok();
                let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());

                StoredSuggestionDto {
                    id,
                    week_start: crate::auth::format_naive_datetime_iso_millis(week_start),
                    week_end: crate::auth::format_naive_datetime_iso_millis(week_end),
                    stats_snapshot,
                    raw_response,
                    parsed_suggestion,
                    status,
                    reviewed_by,
                    reviewed_at: reviewed_at.map(crate::auth::format_naive_datetime_iso_millis),
                    review_notes,
                    applied_items: applied_items_val.map(|v| parse_string_array(&v)),
                    created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
                }
            })
            .collect::<Vec<_>>();

        (items, total)
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: SuggestionListDto { items, total },
    }))
}

async fn get_suggestion(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user, db_state) = require_admin_user(&state, request_state, &headers).await?;
    let suggestion = select_suggestion(proxy.as_ref(), db_state, &id).await?;
    let Some(suggestion) = suggestion else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"));
    };
    Ok(Json(SuccessResponse { success: true, data: suggestion }))
}

async fn select_suggestion(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    id: &str,
) -> Result<Option<StoredSuggestionDto>, AppError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT
                "id",
                "weekStart" as "weekStart",
                "weekEnd" as "weekEnd",
                "statsSnapshot" as "statsSnapshot",
                "rawResponse" as "rawResponse",
                "parsedSuggestion" as "parsedSuggestion",
                "status" as "status",
                "reviewedBy" as "reviewedBy",
                "reviewedAt" as "reviewedAt",
                "reviewNotes" as "reviewNotes",
                "appliedItems" as "appliedItems",
                "createdAt" as "createdAt"
            FROM "llm_advisor_suggestions"
            WHERE "id" = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        let Some(row) = row else {
            return Ok(None);
        };

        let id: String = row.try_get("id").unwrap_or_default();
        let week_start_raw: String = row.try_get("weekStart").unwrap_or_default();
        let week_end_raw: String = row.try_get("weekEnd").unwrap_or_default();
        let stats_snapshot_raw: Option<String> = row.try_get("statsSnapshot").ok();
        let raw_response: String = row.try_get("rawResponse").unwrap_or_default();
        let parsed_suggestion_raw: Option<String> = row.try_get("parsedSuggestion").ok();
        let status: String = row.try_get("status").unwrap_or_else(|_| "pending".to_string());
        let reviewed_by: Option<String> = row.try_get("reviewedBy").ok();
        let reviewed_at_raw: Option<String> = row.try_get("reviewedAt").ok();
        let review_notes: Option<String> = row.try_get("reviewNotes").ok();
        let applied_items_raw: Option<String> = row.try_get("appliedItems").ok();
        let created_at_raw: String = row.try_get("createdAt").unwrap_or_default();

        let stats_snapshot = json_from_sqlite(stats_snapshot_raw);
        let parsed_suggestion = json_from_sqlite(parsed_suggestion_raw);
        let applied_items_json = json_from_sqlite(applied_items_raw);
        let applied_items = if applied_items_json.is_null() {
            None
        } else {
            Some(parse_string_array(&applied_items_json))
        };

        Ok(Some(StoredSuggestionDto {
            id,
            week_start: format_sqlite_datetime_iso(&week_start_raw),
            week_end: format_sqlite_datetime_iso(&week_end_raw),
            stats_snapshot,
            raw_response,
            parsed_suggestion,
            status,
            reviewed_by,
            reviewed_at: reviewed_at_raw.map(|raw| format_sqlite_datetime_iso(&raw)),
            review_notes,
            applied_items,
            created_at: format_sqlite_datetime_iso(&created_at_raw),
        }))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT
                "id",
                "weekStart" as "weekStart",
                "weekEnd" as "weekEnd",
                "statsSnapshot" as "statsSnapshot",
                "rawResponse" as "rawResponse",
                "parsedSuggestion" as "parsedSuggestion",
                "status" as "status",
                "reviewedBy" as "reviewedBy",
                "reviewedAt" as "reviewedAt",
                "reviewNotes" as "reviewNotes",
                "appliedItems" as "appliedItems",
                "createdAt" as "createdAt"
            FROM "llm_advisor_suggestions"
            WHERE "id" = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        let Some(row) = row else {
            return Ok(None);
        };

        let id: String = row.try_get("id").unwrap_or_default();
        let week_start: chrono::NaiveDateTime = row.try_get("weekStart").unwrap_or_else(|_| Utc::now().naive_utc());
        let week_end: chrono::NaiveDateTime = row.try_get("weekEnd").unwrap_or_else(|_| Utc::now().naive_utc());
        let stats_snapshot: serde_json::Value = row.try_get("statsSnapshot").unwrap_or(serde_json::Value::Null);
        let raw_response: String = row.try_get("rawResponse").unwrap_or_default();
        let parsed_suggestion: serde_json::Value = row.try_get("parsedSuggestion").unwrap_or(serde_json::Value::Null);
        let status: String = row.try_get("status").unwrap_or_else(|_| "pending".to_string());
        let reviewed_by: Option<String> = row.try_get("reviewedBy").ok();
        let reviewed_at: Option<chrono::NaiveDateTime> = row.try_get("reviewedAt").ok();
        let review_notes: Option<String> = row.try_get("reviewNotes").ok();
        let applied_items_val: Option<serde_json::Value> = row.try_get("appliedItems").ok();
        let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());

        Ok(Some(StoredSuggestionDto {
            id,
            week_start: crate::auth::format_naive_datetime_iso_millis(week_start),
            week_end: crate::auth::format_naive_datetime_iso_millis(week_end),
            stats_snapshot,
            raw_response,
            parsed_suggestion,
            status,
            reviewed_by,
            reviewed_at: reviewed_at.map(crate::auth::format_naive_datetime_iso_millis),
            review_notes,
            applied_items: applied_items_val.map(|v| parse_string_array(&v)),
            created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        }))
    }
}

async fn approve_suggestion(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<ApproveBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_admin_user(&state, request_state, &headers).await?;

    let selected_items = payload.selected_items.as_array().cloned().ok_or_else(|| {
        json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "selectedItems 必须是数组")
    })?;
    let selected_items = selected_items
        .into_iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect::<Vec<_>>();

    let suggestion = select_suggestion(proxy.as_ref(), db_state, &id).await?;
    let Some(suggestion) = suggestion else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"));
    };

    if suggestion.status != "pending" {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", format!("建议状态不允许审批: {}", suggestion.status)));
    }

    let valid_ids = extract_suggestion_ids(&suggestion.parsed_suggestion);
    let invalid: Vec<String> = selected_items
        .iter()
        .filter(|id| !valid_ids.contains(*id))
        .cloned()
        .collect();
    if !invalid.is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", format!("无效的建议项: {}", invalid.join(", "))));
    }

    let status = if selected_items.is_empty() {
        "rejected".to_string()
    } else if selected_items.len() == valid_ids.len() {
        "approved".to_string()
    } else {
        "partial".to_string()
    };

    let updated = update_suggestion_review(
        proxy.as_ref(),
        db_state,
        &id,
        &status,
        Some(&user.id),
        payload.notes.as_deref(),
        Some(&selected_items),
    )
    .await?;

    Ok(Json(SuccessResponse { success: true, data: updated }))
}

async fn reject_suggestion(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<RejectBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_admin_user(&state, request_state, &headers).await?;

    let suggestion = select_suggestion(proxy.as_ref(), db_state, &id).await?;
    let Some(suggestion) = suggestion else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"));
    };
    if suggestion.status != "pending" {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", format!("建议状态不允许拒绝: {}", suggestion.status)));
    }

    let updated = update_suggestion_review(
        proxy.as_ref(),
        db_state,
        &id,
        "rejected",
        Some(&user.id),
        payload.notes.as_deref(),
        Some(&Vec::new()),
    )
    .await?;

    Ok(Json(SuccessResponse { success: true, data: updated }))
}

async fn update_suggestion_review(
    proxy: &crate::db::DatabaseProxy,
    db_state: DatabaseState,
    id: &str,
    status: &str,
    reviewed_by: Option<&str>,
    notes: Option<&str>,
    applied_items: Option<&Vec<String>>,
) -> Result<StoredSuggestionDto, AppError> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(id.to_string()));

        let mut data = serde_json::Map::new();
        data.insert("status".to_string(), serde_json::Value::String(status.to_string()));
        if let Some(reviewed_by) = reviewed_by {
            data.insert("reviewedBy".to_string(), serde_json::Value::String(reviewed_by.to_string()));
        }
        data.insert("reviewedAt".to_string(), serde_json::Value::String(now_iso.clone()));
        if let Some(notes) = notes {
            data.insert("reviewNotes".to_string(), serde_json::Value::String(notes.to_string()));
        } else {
            data.insert("reviewNotes".to_string(), serde_json::Value::Null);
        }
        if let Some(items) = applied_items {
            data.insert(
                "appliedItems".to_string(),
                serde_json::Value::Array(items.iter().map(|v| serde_json::Value::String(v.clone())).collect()),
            );
        }
        data.insert("updatedAt".to_string(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "llm_advisor_suggestions".to_string(),
            r#where: where_clause,
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy
            .write_operation(db_state, op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
        };
        let now = Utc::now().naive_utc();
        sqlx::query(
            r#"
            UPDATE "llm_advisor_suggestions"
            SET
                "status" = $1,
                "reviewedBy" = $2,
                "reviewedAt" = $3,
                "reviewNotes" = $4,
                "appliedItems" = $5,
                "updatedAt" = $6
            WHERE "id" = $7
            "#,
        )
        .bind(status)
        .bind(reviewed_by)
        .bind(Some(now))
        .bind(notes)
        .bind(applied_items.map(|items| {
            serde_json::Value::Array(items.iter().map(|v| serde_json::Value::String(v.clone())).collect())
        }))
        .bind(now)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    }

    select_suggestion(proxy, db_state, id)
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WeeklyStatsSnapshot {
    period: PeriodSnapshot,
    learning: LearningSnapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PeriodSnapshot {
    start: String,
    end: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningSnapshot {
    total_answers: i64,
    avg_accuracy: f64,
    avg_response_time: f64,
}

fn build_heuristic_suggestion(stats: &WeeklyStatsSnapshot) -> serde_json::Value {
    let mut suggestions = Vec::new();
    let mut concerns = Vec::new();
    let mut key_findings = Vec::new();

    key_findings.push(format!("本周总答题数：{}", stats.learning.total_answers));
    key_findings.push(format!("平均正确率：{:.1}%", stats.learning.avg_accuracy * 100.0));
    key_findings.push(format!("平均响应时间：{:.0}ms", stats.learning.avg_response_time));

    if stats.learning.total_answers < 20 {
        concerns.push("样本量较小，建议仅参考低风险调整".to_string());
    }

    if stats.learning.avg_accuracy < 0.65 {
        concerns.push("平均正确率偏低".to_string());
        suggestions.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "type": "threshold",
            "target": "hint_level",
            "currentValue": 1,
            "suggestedValue": 2,
            "reason": "近期平均正确率偏低，适当提高提示可降低挫败感",
            "expectedImpact": "提升正确率与学习连贯性",
            "risk": "low",
            "priority": 1
        }));
    }

    if stats.learning.avg_response_time > 8000.0 {
        concerns.push("平均响应时间偏长".to_string());
        suggestions.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "type": "threshold",
            "target": "difficulty",
            "currentValue": 2,
            "suggestedValue": 1,
            "reason": "响应时间偏长可能表示认知负荷较高，建议短期降低难度",
            "expectedImpact": "提升节奏与稳定性",
            "risk": "low",
            "priority": 2
        }));
    }

    let data_quality = if stats.learning.total_answers >= 50 {
        "sufficient"
    } else if stats.learning.total_answers >= 10 {
        "limited"
    } else {
        "insufficient"
    };

    let confidence = if stats.learning.total_answers >= 200 {
        0.8
    } else if stats.learning.total_answers >= 50 {
        0.7
    } else if stats.learning.total_answers >= 10 {
        0.6
    } else {
        0.4
    };

    serde_json::json!({
        "analysis": {
            "summary": "基于本周学习数据生成的启发式建议（Rust 本地计算）",
            "keyFindings": key_findings,
            "concerns": concerns,
        },
        "suggestions": suggestions,
        "confidence": confidence,
        "dataQuality": data_quality,
        "nextReviewFocus": "关注正确率、响应时间与疲劳信号的变化"
    })
}

async fn trigger_analysis(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user, db_state) = require_admin_user(&state, request_state, &headers).await?;

    let config = llm_config_summary();
    if !config.enabled {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "LLM 顾问未启用，请设置 LLM_ADVISOR_ENABLED=true"));
    }
    let (valid, message) = llm_config_valid(&config);
    if !valid {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", message));
    }

    {
        let store = store();
        let mut guard = store.is_running.write().await;
        if *guard {
            return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "分析正在进行中，请稍后再试"));
        }
        *guard = true;
    }

    let result = trigger_analysis_inner(proxy.as_ref(), db_state).await;

    {
        let store = store();
        let mut guard = store.is_running.write().await;
        *guard = false;
    }

    result
}

async fn trigger_analysis_inner(
    proxy: &crate::db::DatabaseProxy,
    db_state: DatabaseState,
) -> Result<impl IntoResponse, AppError> {
    let suggestion_id = Uuid::new_v4().to_string();

    let end = Utc::now();
    let start = end - chrono::Duration::days(7);
    let start_iso = start.to_rfc3339_opts(SecondsFormat::Millis, true);
    let end_iso = end.to_rfc3339_opts(SecondsFormat::Millis, true);

    let (total_answers, avg_accuracy, avg_rt) = compute_weekly_learning_stats(proxy, db_state, start, end).await?;

    let stats = WeeklyStatsSnapshot {
        period: PeriodSnapshot { start: start_iso.clone(), end: end_iso.clone() },
        learning: LearningSnapshot {
            total_answers,
            avg_accuracy,
            avg_response_time: avg_rt,
        },
    };

    let (parsed_suggestion, raw_response) = build_suggestion(&stats).await;
    let stats_snapshot = serde_json::to_value(&stats).unwrap_or(serde_json::Value::Null);

    insert_suggestion(
        proxy,
        db_state,
        &suggestion_id,
        &start_iso,
        &end_iso,
        &stats_snapshot,
        &raw_response,
        &parsed_suggestion,
    )
    .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: TriggerDto {
            suggestion_id,
            message: "分析已完成".to_string(),
        },
    }))
}

async fn build_suggestion(stats: &WeeklyStatsSnapshot) -> (serde_json::Value, String) {
    let llm = LLMProvider::from_env();
    if llm.is_available() {
        match build_llm_suggestion(&llm, stats).await {
            Ok((parsed, raw)) => return (parsed, raw),
            Err(e) => warn!(error = %e, "LLM call failed, falling back to heuristic"),
        }
    }
    (build_heuristic_suggestion(stats), "Generated by Rust heuristic advisor".to_string())
}

async fn build_llm_suggestion(
    llm: &LLMProvider,
    stats: &WeeklyStatsSnapshot,
) -> Result<(serde_json::Value, String), crate::services::llm_provider::LLMError> {
    let system_prompt = r#"你是一个学习数据分析顾问。基于提供的周度学习统计数据，生成分析建议。
请以 JSON 格式输出，包含以下字段：
{
  "analysis": {
    "summary": "简要总结",
    "keyFindings": ["发现1", "发现2"],
    "concerns": ["问题1", "问题2"]
  },
  "suggestions": [
    {
      "id": "唯一ID",
      "type": "threshold",
      "target": "参数名",
      "currentValue": 当前值,
      "suggestedValue": 建议值,
      "reason": "原因",
      "expectedImpact": "预期效果",
      "risk": "low/medium/high",
      "priority": 1
    }
  ],
  "confidence": 0.0-1.0,
  "dataQuality": "sufficient/limited/insufficient",
  "nextReviewFocus": "下周关注点"
}"#;

    let user_prompt = format!(
        "分析周期: {} 至 {}\n总答题数: {}\n平均正确率: {:.1}%\n平均响应时间: {:.0}ms",
        stats.period.start,
        stats.period.end,
        stats.learning.total_answers,
        stats.learning.avg_accuracy * 100.0,
        stats.learning.avg_response_time
    );

    let messages = [
        ChatMessage { role: "system".into(), content: system_prompt.into() },
        ChatMessage { role: "user".into(), content: user_prompt },
    ];

    let response = llm.chat(&messages).await?;
    let raw = response.first_content().unwrap_or_default().to_string();
    let parsed = parse_llm_response(&raw);
    Ok((parsed, raw))
}

fn parse_llm_response(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with("```json") {
        trimmed.strip_prefix("```json").and_then(|s| s.strip_suffix("```")).unwrap_or(trimmed)
    } else if trimmed.starts_with("```") {
        trimmed.strip_prefix("```").and_then(|s| s.strip_suffix("```")).unwrap_or(trimmed)
    } else {
        trimmed
    };
    serde_json::from_str(json_str.trim()).unwrap_or_else(|_| serde_json::json!({
        "analysis": { "summary": raw, "keyFindings": [], "concerns": [] },
        "suggestions": [],
        "confidence": 0.5,
        "dataQuality": "limited",
        "nextReviewFocus": ""
    }))
}

async fn compute_weekly_learning_stats(
    proxy: &crate::db::DatabaseProxy,
    db_state: DatabaseState,
    start: chrono::DateTime<Utc>,
    end: chrono::DateTime<Utc>,
) -> Result<(i64, f64, f64), AppError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok((0, 0.0, 0.0));
        };
        let start_s = start.format("%Y-%m-%d %H:%M:%S").to_string();
        let end_s = end.format("%Y-%m-%d %H:%M:%S").to_string();
        let row = sqlx::query(
            r#"
            SELECT
                COUNT(*) as "total",
                SUM(CASE WHEN "isCorrect" != 0 THEN 1 ELSE 0 END) as "correct",
                AVG(CASE WHEN "responseTime" IS NOT NULL AND "responseTime" > 0 THEN "responseTime" END) as "avg_rt"
            FROM "answer_records"
            WHERE "timestamp" >= ? AND "timestamp" <= ?
            "#,
        )
        .bind(start_s)
        .bind(end_s)
        .fetch_one(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        let total: i64 = row.try_get("total").unwrap_or(0);
        let correct: i64 = row.try_get("correct").unwrap_or(0);
        let avg_rt: Option<f64> = row.try_get("avg_rt").ok();
        let accuracy = if total > 0 { (correct.max(0) as f64) / (total as f64) } else { 0.0 };
        Ok((total, accuracy, avg_rt.unwrap_or(0.0)))
    } else {
        let Some(pool) = primary else {
            return Ok((0, 0.0, 0.0));
        };
        let row = sqlx::query(
            r#"
            SELECT
                COUNT(*) as "total",
                SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END) as "correct",
                AVG(NULLIF("responseTime", 0)) as "avg_rt"
            FROM "answer_records"
            WHERE "timestamp" >= $1 AND "timestamp" <= $2
            "#,
        )
        .bind(start.naive_utc())
        .bind(end.naive_utc())
        .fetch_one(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        let total: i64 = row.try_get("total").unwrap_or(0);
        let correct: i64 = row.try_get("correct").unwrap_or(0);
        let avg_rt: Option<f64> = row.try_get("avg_rt").ok();
        let accuracy = if total > 0 { (correct.max(0) as f64) / (total as f64) } else { 0.0 };
        Ok((total, accuracy, avg_rt.unwrap_or(0.0)))
    }
}

async fn insert_suggestion(
    proxy: &crate::db::DatabaseProxy,
    db_state: DatabaseState,
    id: &str,
    week_start_iso: &str,
    week_end_iso: &str,
    stats_snapshot: &serde_json::Value,
    raw_response: &str,
    parsed_suggestion: &serde_json::Value,
) -> Result<(), AppError> {
    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".to_string(), serde_json::Value::String(id.to_string()));
        data.insert(
            "weekStart".to_string(),
            serde_json::Value::String(week_start_iso.to_string()),
        );
        data.insert(
            "weekEnd".to_string(),
            serde_json::Value::String(week_end_iso.to_string()),
        );
        data.insert("statsSnapshot".to_string(), stats_snapshot.clone());
        data.insert(
            "rawResponse".to_string(),
            serde_json::Value::String(raw_response.to_string()),
        );
        data.insert("parsedSuggestion".to_string(), parsed_suggestion.clone());
        data.insert("status".to_string(), serde_json::Value::String("pending".to_string()));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "llm_advisor_suggestions".to_string(),
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy
            .write_operation(db_state, op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
        return Ok(());
    }

    let Some(pool) = proxy.primary_pool().await else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
    };

    let week_start = chrono::DateTime::parse_from_rfc3339(week_start_iso)
        .map(|dt| dt.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let week_end = chrono::DateTime::parse_from_rfc3339(week_end_iso)
        .map(|dt| dt.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "llm_advisor_suggestions" ("id", "weekStart", "weekEnd", "statsSnapshot", "rawResponse", "parsedSuggestion", "status")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id)
    .bind(week_start)
    .bind(week_end)
    .bind(stats_snapshot)
    .bind(raw_response)
    .bind(parsed_suggestion)
    .bind("pending")
    .execute(&pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    Ok(())
}

async fn get_latest(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user, db_state) = require_admin_user(&state, request_state, &headers).await?;
    let suggestion = select_latest(proxy.as_ref(), db_state).await?;
    Ok(Json(SuccessResponse { success: true, data: suggestion }))
}

async fn select_latest(
    proxy: &crate::db::DatabaseProxy,
    db_state: DatabaseState,
) -> Result<Option<StoredSuggestionDto>, AppError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT "id" FROM "llm_advisor_suggestions"
            ORDER BY "createdAt" DESC
            LIMIT 1
            "#,
        )
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        let Some(row) = row else { return Ok(None) };
        let id: String = row.try_get("id").unwrap_or_default();
        select_suggestion(proxy, db_state, &id).await
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT "id" FROM "llm_advisor_suggestions"
            ORDER BY "createdAt" DESC
            LIMIT 1
            "#,
        )
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        let Some(row) = row else { return Ok(None) };
        let id: String = row.try_get("id").unwrap_or_default();
        select_suggestion(proxy, db_state, &id).await
    }
}

async fn get_pending_count(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user, db_state) = require_admin_user(&state, request_state, &headers).await?;
    let count = count_pending(proxy.as_ref(), db_state).await.unwrap_or(0);
    Ok(Json(SuccessResponse { success: true, data: PendingCountDto { count } }))
}
