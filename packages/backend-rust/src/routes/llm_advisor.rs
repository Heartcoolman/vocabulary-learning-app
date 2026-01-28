use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::sync::RwLock;
use tracing::warn;
use uuid::Uuid;

use crate::response::{json_error, AppError};
use crate::services::amas_config::AMASConfigService;
use crate::services::llm_provider::{ChatMessage, LLMProvider};
use crate::state::AppState;

const VALID_SUGGESTION_TARGETS: &[(&str, &str)] = &[
    (
        "consecutiveCorrectThreshold",
        "连续正确阈值：连续答对多少次后提升掌握等级",
    ),
    (
        "consecutiveWrongThreshold",
        "连续错误阈值：连续答错多少次后降低掌握等级",
    ),
    (
        "difficultyAdjustmentInterval",
        "难度调整间隔：多少次答题后重新评估难度",
    ),
    (
        "priorityWeightNewWord",
        "新词优先级权重：新单词在选词中的权重占比",
    ),
    (
        "priorityWeightErrorRate",
        "错误率优先级权重：高错误率单词的权重占比",
    ),
    (
        "priorityWeightOverdueTime",
        "逾期时间优先级权重：逾期复习单词的权重占比",
    ),
    (
        "priorityWeightWordScore",
        "单词分数优先级权重：单词综合分数的权重占比",
    ),
    (
        "scoreWeightAccuracy",
        "准确率分数权重：准确率在分数计算中的权重",
    ),
    (
        "scoreWeightSpeed",
        "速度分数权重：响应速度在分数计算中的权重",
    ),
    (
        "scoreWeightStability",
        "稳定性分数权重：答题稳定性在分数计算中的权重",
    ),
    (
        "scoreWeightProficiency",
        "熟练度分数权重：熟练程度在分数计算中的权重",
    ),
    (
        "speedThresholdExcellent",
        "速度阈值-优秀：响应时间(ms)低于此值为优秀",
    ),
    (
        "speedThresholdGood",
        "速度阈值-良好：响应时间(ms)低于此值为良好",
    ),
    (
        "speedThresholdAverage",
        "速度阈值-一般：响应时间(ms)低于此值为一般",
    ),
    (
        "speedThresholdSlow",
        "速度阈值-较慢：响应时间(ms)高于此值为较慢",
    ),
    (
        "newWordRatioDefault",
        "默认新词比例：正常情况下新词占比(0.0-1.0)",
    ),
    (
        "newWordRatioHighAccuracy",
        "高正确率新词比例：正确率高时增加新词占比",
    ),
    (
        "newWordRatioLowAccuracy",
        "低正确率新词比例：正确率低时减少新词占比",
    ),
    (
        "newWordRatioHighAccuracyThreshold",
        "高正确率阈值：正确率高于此值时启用高正确率新词比例(0.0-1.0)",
    ),
    (
        "newWordRatioLowAccuracyThreshold",
        "低正确率阈值：正确率低于此值时启用低正确率新词比例(0.0-1.0)",
    ),
    (
        "thompsonContextBins",
        "Thompson上下文分桶数：上下文维度离散化的桶数量(>=2)",
    ),
    (
        "thompsonContextWeight",
        "Thompson上下文权重：上下文采样在最终策略中的权重(0.0-1.0)",
    ),
];

fn valid_target_set() -> HashSet<&'static str> {
    VALID_SUGGESTION_TARGETS
        .iter()
        .map(|(name, _)| *name)
        .collect()
}

fn is_thompson_context_target(target: &str) -> bool {
    matches!(target, "thompsonContextBins" | "thompsonContextWeight")
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    skipped_items: Option<Vec<SkippedItem>>,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ApplyResult {
    applied: Vec<String>,
    skipped: Vec<SkippedItem>,
    failed: Vec<FailedItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkippedItem {
    id: String,
    target: String,
    reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FailedItem {
    id: String,
    target: String,
    error: String,
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
    let provider = env_string("LLM_PROVIDER")
        .unwrap_or_else(|| "openai".to_string())
        .to_ascii_lowercase();
    let model = env_string("LLM_MODEL").unwrap_or_else(|| llm_default_model(&provider).to_string());
    let api_key = env_string("LLM_API_KEY").unwrap_or_default();
    let base_url = env_string("LLM_BASE_URL")
        .or_else(|| llm_default_base_url(&provider).map(|v| v.to_string()));

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
        .map(|v| !v.trim().eq_ignore_ascii_case("false"))
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
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    Ok((proxy, user))
}

async fn require_admin_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let (proxy, user) = require_user(state, headers).await?;
    if user.role != "ADMIN" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "权限不足，需要管理员权限",
        ));
    }
    Ok((proxy, user))
}

fn parse_string_array(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
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

#[derive(Debug, Clone)]
struct SuggestionItem {
    id: String,
    target: String,
    current_value: f64,
    suggested_value: f64,
    reason: String,
}

fn extract_selected_suggestions(
    parsed: &serde_json::Value,
    selected_ids: &[String],
) -> Vec<SuggestionItem> {
    let Some(suggestions) = parsed.get("suggestions").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let selected_set: HashSet<&str> = selected_ids.iter().map(|s| s.as_str()).collect();
    suggestions
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            if !selected_set.contains(id) {
                return None;
            }
            Some(SuggestionItem {
                id: id.to_string(),
                target: item.get("target")?.as_str()?.to_string(),
                current_value: item.get("currentValue")?.as_f64()?,
                suggested_value: item.get("suggestedValue")?.as_f64()?,
                reason: item
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("LLM建议")
                    .to_string(),
            })
        })
        .collect()
}

async fn apply_suggestions_to_config(
    proxy: &crate::db::DatabaseProxy,
    suggestions: &[SuggestionItem],
    changed_by: &str,
    suggestion_id: &str,
) -> Result<ApplyResult, AppError> {
    let mut result = ApplyResult::default();

    if suggestions.is_empty() {
        return Ok(result);
    }

    let pool = proxy.pool();

    let metrics_before = collect_current_metrics(pool).await;
    let needs_algorithm_config = suggestions
        .iter()
        .any(|item| !is_thompson_context_target(item.target.as_str()));
    let config_id: Option<String> = if needs_algorithm_config {
        let config_row =
            sqlx::query(r#"SELECT "id" FROM "algorithm_configs" WHERE "isDefault" = true LIMIT 1"#)
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    tracing::error!(error = %e, "Failed to query default config");
                    json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")
                })?;

        let config_id: String = match config_row {
            Some(row) => row.try_get("id").unwrap_or_default(),
            None => {
                let first_row = sqlx::query(
                    r#"SELECT "id" FROM "algorithm_configs" ORDER BY "createdAt" ASC LIMIT 1"#,
                )
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    tracing::error!(error = %e, "Failed to query first config");
                    json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")
                })?;
                match first_row {
                    Some(row) => row.try_get("id").unwrap_or_default(),
                    None => {
                        tracing::warn!(
                            "No algorithm_configs found, skipping algorithm-config suggestions"
                        );
                        String::new()
                    }
                }
            }
        };

        if config_id.is_empty() {
            tracing::warn!("Empty config_id, skipping algorithm-config suggestions");
            None
        } else {
            Some(config_id)
        }
    } else {
        None
    };

    let valid_targets = valid_target_set();
    let mut amas_service: Option<AMASConfigService> = None;

    for item in suggestions {
        if !valid_targets.contains(item.target.as_str()) {
            result.skipped.push(SkippedItem {
                id: item.id.clone(),
                target: item.target.clone(),
                reason: "不支持的参数名".to_string(),
            });
            tracing::info!(
                suggestion_id = %suggestion_id,
                target = %item.target,
                "Skipped invalid suggestion target"
            );
            continue;
        }

        if is_thompson_context_target(item.target.as_str()) {
            let service =
                amas_service.get_or_insert_with(|| AMASConfigService::new(Arc::new(proxy.clone())));
            let current_config = match service.get_config().await {
                Ok(config) => config,
                Err(e) => {
                    result.failed.push(FailedItem {
                        id: item.id.clone(),
                        target: item.target.clone(),
                        error: e.to_string(),
                    });
                    tracing::error!(
                        error = %e,
                        suggestion_id = %suggestion_id,
                        target = %item.target,
                        "Failed to read AMAS config"
                    );
                    continue;
                }
            };

            let real_current_value = match item.target.as_str() {
                "thompsonContextBins" => current_config.thompson_context.bins as f64,
                "thompsonContextWeight" => current_config.thompson_context.weight,
                _ => item.current_value,
            };

            let change_reason = format!("LLM建议审批: {}", item.reason);
            let update_result = service
                .update_thompson_context(
                    &item.target,
                    item.suggested_value,
                    changed_by,
                    &change_reason,
                    Some(suggestion_id),
                )
                .await;

            match update_result {
                Ok(()) => {
                    result.applied.push(item.id.clone());
                    if let Err(e) = crate::db::operations::insert_suggestion_effect_tracking(
                        proxy,
                        suggestion_id,
                        &item.id,
                        &item.target,
                        real_current_value,
                        item.suggested_value,
                        &metrics_before,
                    )
                    .await
                    {
                        tracing::warn!(error = %e, "Failed to insert suggestion effect tracking");
                    }

                    tracing::info!(
                        suggestion_id = %suggestion_id,
                        target = %item.target,
                        old = real_current_value,
                        new = item.suggested_value,
                        "Applied LLM suggestion to AMAS config"
                    );
                }
                Err(e) => {
                    result.failed.push(FailedItem {
                        id: item.id.clone(),
                        target: item.target.clone(),
                        error: e.to_string(),
                    });
                    tracing::error!(
                        error = %e,
                        suggestion_id = %suggestion_id,
                        target = %item.target,
                        "Failed to apply LLM suggestion to AMAS config"
                    );
                }
            }
            continue;
        }

        let Some(config_id) = config_id.as_ref() else {
            result.skipped.push(SkippedItem {
                id: item.id.clone(),
                target: item.target.clone(),
                reason: "缺少算法配置".to_string(),
            });
            tracing::warn!(
                suggestion_id = %suggestion_id,
                target = %item.target,
                "Skipped suggestion without algorithm config"
            );
            continue;
        };

        let field = item.target.as_str();

        let current_val_row = sqlx::query(&format!(
            r#"SELECT "{}" as "val" FROM "algorithm_configs" WHERE "id" = $1"#,
            field
        ))
        .bind(config_id)
        .fetch_optional(pool)
        .await;

        let real_current_value: f64 = match &current_val_row {
            Ok(Some(row)) => {
                if item.target.starts_with("newWordRatio") {
                    row.try_get::<f64, _>("val").unwrap_or(item.current_value)
                } else {
                    row.try_get::<i32, _>("val")
                        .map(|v| v as f64)
                        .unwrap_or(item.current_value)
                }
            }
            _ => item.current_value,
        };

        let sql = format!(
            r#"UPDATE "algorithm_configs" SET "{}" = $1, "updatedAt" = $2 WHERE "id" = $3"#,
            field
        );
        let now = Utc::now().naive_utc();
        let update_result = if item.target.starts_with("newWordRatio") {
            sqlx::query(&sql)
                .bind(item.suggested_value)
                .bind(now)
                .bind(config_id)
                .execute(pool)
                .await
        } else {
            let int_value = item.suggested_value.round() as i32;
            sqlx::query(&sql)
                .bind(int_value)
                .bind(now)
                .bind(config_id)
                .execute(pool)
                .await
        };

        match update_result {
            Ok(_) => {
                result.applied.push(item.id.clone());
                let history_id = Uuid::new_v4().to_string();
                let change_reason = format!("LLM建议审批: {}", item.reason);
                let prev_val = serde_json::json!({ &item.target: real_current_value });
                let new_val = serde_json::json!({ &item.target: item.suggested_value });
                if let Err(e) = sqlx::query(
                    r#"
                    INSERT INTO "config_history"
                      ("id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp")
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    "#,
                )
                .bind(&history_id)
                .bind(config_id)
                .bind(changed_by)
                .bind(&change_reason)
                .bind(&prev_val)
                .bind(&new_val)
                .bind(now)
                .execute(pool)
                .await
                {
                    tracing::error!(error = %e, target = %item.target, "Failed to insert config history");
                }

                if let Err(e) = crate::db::operations::insert_suggestion_effect_tracking(
                    proxy,
                    suggestion_id,
                    &item.id,
                    &item.target,
                    real_current_value,
                    item.suggested_value,
                    &metrics_before,
                )
                .await
                {
                    tracing::warn!(error = %e, "Failed to insert suggestion effect tracking");
                }

                tracing::info!(
                    suggestion_id = %suggestion_id,
                    target = %item.target,
                    old = real_current_value,
                    new = item.suggested_value,
                    "Applied LLM suggestion to config"
                );
            }
            Err(e) => {
                result.failed.push(FailedItem {
                    id: item.id.clone(),
                    target: item.target.clone(),
                    error: e.to_string(),
                });
                tracing::error!(
                    error = %e,
                    suggestion_id = %suggestion_id,
                    target = %item.target,
                    "Failed to apply LLM suggestion"
                );
            }
        }
    }

    Ok(result)
}

async fn collect_current_metrics(pool: &sqlx::PgPool) -> serde_json::Value {
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) as total_answers,
            SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END) as correct,
            AVG(NULLIF("responseTime", 0))::float8 as avg_rt
        FROM "answer_records"
        WHERE "timestamp" >= NOW() - INTERVAL '7 days'
        "#,
    )
    .fetch_one(pool)
    .await;

    match row {
        Ok(r) => {
            let total: i64 = r.try_get("total_answers").unwrap_or(0);
            let correct: i64 = r.try_get("correct").unwrap_or(0);
            let avg_rt: Option<f64> = r.try_get("avg_rt").ok();
            let accuracy = if total > 0 {
                correct as f64 / total as f64
            } else {
                0.0
            };
            serde_json::json!({
                "totalAnswers": total,
                "accuracy": accuracy,
                "avgResponseTime": avg_rt.unwrap_or(0.0),
                "capturedAt": Utc::now().to_rfc3339()
            })
        }
        Err(_) => serde_json::json!({ "error": "failed to collect metrics" }),
    }
}

async fn count_pending(proxy: &crate::db::DatabaseProxy) -> Result<i64, AppError> {
    let pool = proxy.pool();
    let count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "llm_advisor_suggestions" WHERE "status" = 'pending'"#,
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    Ok(count)
}

async fn get_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let config = llm_config_summary();
    let (auto_analysis_enabled, schedule) = schedule_config();
    let pending_count = count_pending(proxy.as_ref()).await.unwrap_or(0);
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
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_admin_user(&state, &headers).await?;
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
            message: if valid {
                "LLM 配置已就绪（未执行网络探测）"
            } else {
                message.as_str()
            }
            .to_string(),
        },
    }))
}

async fn list_suggestions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SuggestionsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if let Some(status) = query.status.as_deref() {
        let valid = ["pending", "approved", "rejected", "partial"];
        if !valid.contains(&status) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "status 参数无效",
            ));
        }
    }

    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = query.offset.unwrap_or(0).max(0);

    let pool = proxy.pool();

    let total: i64 = if let Some(status) = query.status.as_deref() {
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions" WHERE "status" = $1"#)
            .bind(status)
            .fetch_one(pool)
            .await
            .unwrap_or(0)
    } else {
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "llm_advisor_suggestions""#)
            .fetch_one(pool)
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
        .fetch_all(pool)
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
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    };

    let items = rows
        .into_iter()
        .map(|row| {
            let id: String = row.try_get("id").unwrap_or_default();
            let week_start: chrono::NaiveDateTime = row
                .try_get("weekStart")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            let week_end: chrono::NaiveDateTime = row
                .try_get("weekEnd")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            let stats_snapshot: serde_json::Value = row
                .try_get("statsSnapshot")
                .unwrap_or(serde_json::Value::Null);
            let raw_response: String = row.try_get("rawResponse").unwrap_or_default();
            let parsed_suggestion: serde_json::Value = row
                .try_get("parsedSuggestion")
                .unwrap_or(serde_json::Value::Null);
            let status: String = row
                .try_get("status")
                .unwrap_or_else(|_| "pending".to_string());
            let reviewed_by: Option<String> = row.try_get("reviewedBy").ok();
            let reviewed_at: Option<chrono::NaiveDateTime> = row.try_get("reviewedAt").ok();
            let review_notes: Option<String> = row.try_get("reviewNotes").ok();
            let applied_items_val: Option<serde_json::Value> = row.try_get("appliedItems").ok();
            let created_at: chrono::NaiveDateTime = row
                .try_get("createdAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());

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
                skipped_items: None,
                created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
            }
        })
        .collect::<Vec<_>>();

    Ok(Json(SuccessResponse {
        success: true,
        data: SuggestionListDto { items, total },
    }))
}

async fn get_suggestion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let suggestion = select_suggestion(proxy.as_ref(), &id).await?;
    let Some(suggestion) = suggestion else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"));
    };
    Ok(Json(SuccessResponse {
        success: true,
        data: suggestion,
    }))
}

async fn select_suggestion(
    proxy: &crate::db::DatabaseProxy,
    id: &str,
) -> Result<Option<StoredSuggestionDto>, AppError> {
    let pool = proxy.pool();
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
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let id: String = row.try_get("id").unwrap_or_default();
    let week_start: chrono::NaiveDateTime = row
        .try_get("weekStart")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let week_end: chrono::NaiveDateTime = row
        .try_get("weekEnd")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let stats_snapshot: serde_json::Value = row
        .try_get("statsSnapshot")
        .unwrap_or(serde_json::Value::Null);
    let raw_response: String = row.try_get("rawResponse").unwrap_or_default();
    let parsed_suggestion: serde_json::Value = row
        .try_get("parsedSuggestion")
        .unwrap_or(serde_json::Value::Null);
    let status: String = row
        .try_get("status")
        .unwrap_or_else(|_| "pending".to_string());
    let reviewed_by: Option<String> = row.try_get("reviewedBy").ok();
    let reviewed_at: Option<chrono::NaiveDateTime> = row.try_get("reviewedAt").ok();
    let review_notes: Option<String> = row.try_get("reviewNotes").ok();
    let applied_items_val: Option<serde_json::Value> = row.try_get("appliedItems").ok();
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());

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
        skipped_items: None,
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
    }))
}

async fn approve_suggestion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<ApproveBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_admin_user(&state, &headers).await?;

    let selected_items = payload.selected_items.as_array().cloned().ok_or_else(|| {
        json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "selectedItems 必须是数组",
        )
    })?;
    let selected_items = selected_items
        .into_iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect::<Vec<_>>();

    let suggestion = select_suggestion(proxy.as_ref(), &id).await?;
    let Some(suggestion) = suggestion else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"));
    };

    if suggestion.status != "pending" {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("建议状态不允许审批: {}", suggestion.status),
        ));
    }

    let valid_ids = extract_suggestion_ids(&suggestion.parsed_suggestion);
    let invalid: Vec<String> = selected_items
        .iter()
        .filter(|id| !valid_ids.contains(*id))
        .cloned()
        .collect();
    if !invalid.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("无效的建议项: {}", invalid.join(", ")),
        ));
    }

    let status = if selected_items.is_empty() {
        "rejected".to_string()
    } else if selected_items.len() == valid_ids.len() {
        "approved".to_string()
    } else {
        "partial".to_string()
    };

    let mut apply_result = ApplyResult::default();

    if !selected_items.is_empty() {
        let items_to_apply =
            extract_selected_suggestions(&suggestion.parsed_suggestion, &selected_items);
        match apply_suggestions_to_config(proxy.as_ref(), &items_to_apply, &user.id, &id).await {
            Ok(result) => {
                if !result.skipped.is_empty() {
                    tracing::warn!(
                        suggestion_id = %id,
                        skipped_count = result.skipped.len(),
                        "Some suggestion items were skipped due to invalid targets"
                    );
                }
                apply_result = result;
            }
            Err(e) => {
                tracing::warn!(error = ?e, "Failed to apply suggestions to config");
            }
        }
    }

    let mut all_skipped = apply_result.skipped;
    for failed in apply_result.failed {
        all_skipped.push(SkippedItem {
            id: failed.id,
            target: failed.target,
            reason: format!("应用失败: {}", failed.error),
        });
    }
    let skipped_items = if all_skipped.is_empty() {
        None
    } else {
        Some(all_skipped)
    };

    let updated = update_suggestion_review(
        proxy.as_ref(),
        &id,
        &status,
        Some(&user.id),
        payload.notes.as_deref(),
        Some(&apply_result.applied),
        skipped_items,
    )
    .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: updated,
    }))
}

async fn reject_suggestion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<RejectBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_admin_user(&state, &headers).await?;

    let suggestion = select_suggestion(proxy.as_ref(), &id).await?;
    let Some(suggestion) = suggestion else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"));
    };
    if suggestion.status != "pending" {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("建议状态不允许拒绝: {}", suggestion.status),
        ));
    }

    let updated = update_suggestion_review(
        proxy.as_ref(),
        &id,
        "rejected",
        Some(&user.id),
        payload.notes.as_deref(),
        Some(&Vec::new()),
        None,
    )
    .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: updated,
    }))
}

async fn update_suggestion_review(
    proxy: &crate::db::DatabaseProxy,
    id: &str,
    status: &str,
    reviewed_by: Option<&str>,
    notes: Option<&str>,
    applied_items: Option<&Vec<String>>,
    skipped_items: Option<Vec<SkippedItem>>,
) -> Result<StoredSuggestionDto, AppError> {
    let pool = proxy.pool();
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
        serde_json::Value::Array(
            items
                .iter()
                .map(|v| serde_json::Value::String(v.clone()))
                .collect(),
        )
    }))
    .bind(now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    let mut dto = select_suggestion(proxy, id)
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "建议不存在"))?;
    dto.skipped_items = skipped_items;
    Ok(dto)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WeeklyStatsSnapshot {
    period: PeriodSnapshot,
    users: UsersSnapshot,
    learning: LearningSnapshot,
    state_distribution: StateDistributionSnapshot,
    alerts: AlertsSnapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PeriodSnapshot {
    start: String,
    end: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsersSnapshot {
    total: i64,
    active_this_week: i64,
    new_this_week: i64,
    churned: i64,
    #[serde(skip_serializing_if = "is_zero")]
    prev_week_active: i64,
}

fn is_zero(v: &i64) -> bool {
    *v == 0
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningSnapshot {
    total_answers: i64,
    avg_accuracy: f64,
    avg_response_time: f64,
    avg_session_duration: f64,
    total_words_learned: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateDistributionSnapshot {
    fatigue: ThreeTierDistribution,
    motivation: ThreeTierDistribution,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreeTierDistribution {
    low: i64,
    mid: i64,
    high: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertsSnapshot {
    low_accuracy_user_ratio: f64,
    high_fatigue_user_ratio: f64,
    low_motivation_user_ratio: f64,
    churn_rate: f64,
}

fn build_heuristic_suggestion(stats: &WeeklyStatsSnapshot) -> serde_json::Value {
    let mut suggestions = Vec::new();
    let mut concerns = Vec::new();
    let mut key_findings = Vec::new();

    key_findings.push(format!("本周活跃用户: {}人", stats.users.active_this_week));
    key_findings.push(format!("新增用户: {}人", stats.users.new_this_week));
    key_findings.push(format!("本周总答题数: {}", stats.learning.total_answers));
    key_findings.push(format!(
        "平均正确率: {:.1}%",
        stats.learning.avg_accuracy * 100.0
    ));
    key_findings.push(format!(
        "学习单词数: {}",
        stats.learning.total_words_learned
    ));

    if stats.learning.total_answers < 20 {
        concerns.push("样本量较小，建议仅参考低风险调整".to_string());
    }

    if stats.alerts.churn_rate > 0.1 {
        concerns.push(format!(
            "用户流失率较高: {:.1}%",
            stats.alerts.churn_rate * 100.0
        ));
        suggestions.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "type": "threshold",
            "target": "newWordRatioDefault",
            "currentValue": 0.3,
            "suggestedValue": 0.2,
            "reason": "流失率偏高，建议降低新词比例减轻学习压力",
            "expectedImpact": "提升用户留存",
            "risk": "low",
            "priority": 1
        }));
    }

    if stats.alerts.high_fatigue_user_ratio > 0.2 {
        concerns.push(format!(
            "高疲劳用户占比: {:.1}%",
            stats.alerts.high_fatigue_user_ratio * 100.0
        ));
        suggestions.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "type": "threshold",
            "target": "consecutiveCorrectThreshold",
            "currentValue": 3,
            "suggestedValue": 2,
            "reason": "高疲劳用户较多，建议降低连续正确阈值加快掌握进度",
            "expectedImpact": "降低疲劳累积，提升成就感",
            "risk": "low",
            "priority": 2
        }));
    }

    if stats.alerts.low_motivation_user_ratio > 0.2 {
        concerns.push(format!(
            "低动机用户占比: {:.1}%",
            stats.alerts.low_motivation_user_ratio * 100.0
        ));
    }

    if stats.learning.avg_accuracy < 0.65 {
        concerns.push("平均正确率偏低".to_string());
        suggestions.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "type": "threshold",
            "target": "priorityWeightErrorRate",
            "currentValue": 0.3,
            "suggestedValue": 0.4,
            "reason": "正确率偏低，建议提高错误率权重以优先复习易错词",
            "expectedImpact": "提升正确率与学习连贯性",
            "risk": "low",
            "priority": 3
        }));
    }

    if stats.learning.avg_response_time > 8000.0 {
        concerns.push("平均响应时间偏长".to_string());
        suggestions.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "type": "threshold",
            "target": "speedThresholdAverage",
            "currentValue": 5000,
            "suggestedValue": 6000,
            "reason": "响应时间偏长，建议放宽速度阈值减少压力",
            "expectedImpact": "提升节奏与稳定性",
            "risk": "low",
            "priority": 4
        }));
    }

    let data_quality = if stats.learning.total_answers >= 500 && stats.users.active_this_week >= 10
    {
        "sufficient"
    } else if stats.learning.total_answers >= 50 {
        "limited"
    } else {
        "insufficient"
    };

    let confidence = if stats.learning.total_answers >= 500 && stats.users.active_this_week >= 20 {
        0.85
    } else if stats.learning.total_answers >= 200 {
        0.75
    } else if stats.learning.total_answers >= 50 {
        0.65
    } else {
        0.5
    };

    let next_focus = if stats.alerts.churn_rate > 0.1 {
        "重点关注用户留存和学习体验优化"
    } else if stats.alerts.high_fatigue_user_ratio > 0.2 {
        "关注疲劳度控制和休息提醒机制"
    } else {
        "关注正确率、响应时间与学习效率的变化"
    };

    serde_json::json!({
        "analysis": {
            "summary": format!("本周{}名活跃用户，答题{}次，正确率{:.1}%",
                stats.users.active_this_week,
                stats.learning.total_answers,
                stats.learning.avg_accuracy * 100.0),
            "keyFindings": key_findings,
            "concerns": concerns,
        },
        "suggestions": suggestions,
        "confidence": confidence,
        "dataQuality": data_quality,
        "nextReviewFocus": next_focus
    })
}

async fn trigger_analysis(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    let config = llm_config_summary();
    if !config.enabled {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "LLM 顾问未启用，请设置 LLM_ADVISOR_ENABLED=true",
        ));
    }
    let (valid, message) = llm_config_valid(&config);
    if !valid {
        tracing::warn!(reason = %message, "LLM 配置未就绪，触发分析将回退到启发式策略");
    }

    {
        let store = store();
        let mut guard = store.is_running.write().await;
        if *guard {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "分析正在进行中，请稍后再试",
            ));
        }
        *guard = true;
    }

    let result = trigger_analysis_inner(proxy.as_ref()).await;

    {
        let store = store();
        let mut guard = store.is_running.write().await;
        *guard = false;
    }

    result
}

async fn trigger_analysis_inner(
    proxy: &crate::db::DatabaseProxy,
) -> Result<impl IntoResponse, AppError> {
    let suggestion_id = Uuid::new_v4().to_string();

    let end = Utc::now();
    let start = end - chrono::Duration::days(7);
    let start_iso = start.to_rfc3339_opts(SecondsFormat::Millis, true);
    let end_iso = end.to_rfc3339_opts(SecondsFormat::Millis, true);

    let (users_result, learning_result, state_dist_result) = tokio::join!(
        compute_user_stats(proxy, start, end),
        compute_learning_stats(proxy, start, end),
        compute_state_distribution(proxy),
    );

    let users = users_result?;
    let learning = learning_result?;
    let state_distribution = state_dist_result?;
    let alerts = compute_alerts(proxy, &users, start, end).await?;

    let stats = WeeklyStatsSnapshot {
        period: PeriodSnapshot {
            start: start_iso.clone(),
            end: end_iso.clone(),
        },
        users,
        learning,
        state_distribution,
        alerts,
    };

    let (parsed_suggestion, raw_response) = build_suggestion(&stats).await;
    let stats_snapshot = serde_json::to_value(&stats).unwrap_or(serde_json::Value::Null);

    insert_suggestion(
        proxy,
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
    (
        build_heuristic_suggestion(stats),
        "Generated by Rust heuristic advisor".to_string(),
    )
}

async fn build_llm_suggestion(
    llm: &LLMProvider,
    stats: &WeeklyStatsSnapshot,
) -> Result<(serde_json::Value, String), crate::services::llm_provider::LLMError> {
    let target_list = VALID_SUGGESTION_TARGETS
        .iter()
        .map(|(name, desc)| format!("  - {}: {}", name, desc))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        r#"你是一个学习系统数据分析顾问，负责分析周度学习数据并提出算法参数调优建议。

【数据解读指南】

1. 用户健康指标阈值：
   - 流失率：<5%健康，5-10%警戒，>10%危险
   - 活跃率（活跃/总用户）：>30%健康，15-30%警戒，<15%危险

2. 学习效果指标阈值：
   - 正确率：>75%优秀，65-75%良好，50-65%需关注，<50%危险
   - 响应时间：<3000ms优秀，3000-5000ms良好，5000-8000ms偏慢，>8000ms需优化
   - 会话时长：5-15分钟理想，<3分钟过短，>25分钟可能疲劳

3. 状态分布解读：
   - 高疲劳占比：<10%健康，10-20%警戒，>20%需干预
   - 低动机占比：<15%健康，15-25%警戒，>25%需干预

4. 预警指标解读：
   - 低正确率用户占比：<10%正常，10-20%关注，>20%需优化难度
   - 高疲劳/低动机占比升高时，优先考虑降低学习强度

【参数调优策略】

- 流失率高 → 降低 newWordRatioDefault，降低学习压力
- 正确率低 → 提高 priorityWeightErrorRate，增加易错词复习；降低 consecutiveCorrectThreshold
- 响应时间长 → 放宽 speedThreshold 系列阈值，降低时间压力
- 高疲劳占比大 → 降低 consecutiveCorrectThreshold，加快成就感获得
- 低动机占比大 → 调整 priorityWeight 系列，增加新词比例提升新鲜感

【可调参数列表】
{}

【输出要求】
- 语言：所有文本字段必须使用中文
- suggestions 中的 target 必须严格使用上述参数名
- 每个建议需说明原因和预期效果
- 根据数据样本量评估 dataQuality 和 confidence

请以 JSON 格式输出：
{{
  "analysis": {{
    "summary": "一句话总结本周学习状况",
    "keyFindings": ["发现1", "发现2", "发现3"],
    "concerns": ["问题1", "问题2"]
  }},
  "suggestions": [
    {{
      "id": "唯一ID(可用uuid)",
      "type": "threshold",
      "target": "参数名",
      "currentValue": 当前估计值,
      "suggestedValue": 建议值,
      "reason": "基于数据的调整原因",
      "expectedImpact": "预期效果",
      "risk": "low/medium/high",
      "priority": 优先级数字(1最高)
    }}
  ],
  "confidence": 0.0-1.0,
  "dataQuality": "sufficient(>=500答题)/limited(50-500)/insufficient(<50)",
  "nextReviewFocus": "下周重点关注的指标"
}}"#,
        target_list
    );

    let user_prompt = format!(
        r#"分析周期: {} 至 {}

用户统计:
- 总用户数: {}
- 本周活跃用户: {}
- 本周新增用户: {}
- 流失用户: {}

学习统计:
- 总答题数: {}
- 平均正确率: {:.1}%
- 平均响应时间: {:.0}ms
- 学习单词数: {}
- 平均会话时长: {:.0}秒

用户状态分布:
- 疲劳度: 低{}人 / 中{}人 / 高{}人
- 动机: 低{}人 / 中{}人 / 高{}人

预警指标:
- 低正确率用户占比: {:.1}%
- 高疲劳用户占比: {:.1}%
- 低动机用户占比: {:.1}%
- 流失率: {:.1}%"#,
        stats.period.start,
        stats.period.end,
        stats.users.total,
        stats.users.active_this_week,
        stats.users.new_this_week,
        stats.users.churned,
        stats.learning.total_answers,
        stats.learning.avg_accuracy * 100.0,
        stats.learning.avg_response_time,
        stats.learning.total_words_learned,
        stats.learning.avg_session_duration,
        stats.state_distribution.fatigue.low,
        stats.state_distribution.fatigue.mid,
        stats.state_distribution.fatigue.high,
        stats.state_distribution.motivation.low,
        stats.state_distribution.motivation.mid,
        stats.state_distribution.motivation.high,
        stats.alerts.low_accuracy_user_ratio * 100.0,
        stats.alerts.high_fatigue_user_ratio * 100.0,
        stats.alerts.low_motivation_user_ratio * 100.0,
        stats.alerts.churn_rate * 100.0,
    );

    let messages = [
        ChatMessage {
            role: "system".into(),
            content: system_prompt,
        },
        ChatMessage {
            role: "user".into(),
            content: user_prompt,
        },
    ];

    let response = llm.chat(&messages).await?;
    let raw = response.first_content().unwrap_or_default().to_string();
    let parsed = parse_llm_response(&raw);
    Ok((parsed, raw))
}

fn parse_llm_response(raw: &str) -> serde_json::Value {
    let cleaned = strip_think_tags(raw);
    let trimmed = cleaned.trim();
    let json_str = extract_json_content(trimmed);
    serde_json::from_str(json_str.trim()).unwrap_or_else(|_| {
        serde_json::json!({
            "analysis": { "summary": trimmed, "keyFindings": [], "concerns": [] },
            "suggestions": [],
            "confidence": 0.5,
            "dataQuality": "limited",
            "nextReviewFocus": ""
        })
    })
}

fn strip_think_tags(s: &str) -> String {
    let mut result = s.to_string();
    while let Some(start) = result.find("<think>") {
        if let Some(end) = result.find("</think>") {
            let close_end = end + "</think>".len();
            result = format!("{}{}", &result[..start], &result[close_end..]);
        } else {
            break;
        }
    }
    result
}

fn extract_json_content(s: &str) -> &str {
    let trimmed = s.trim();
    if trimmed.starts_with("```json") || trimmed.starts_with("```") {
        let start = if trimmed.starts_with("```json") {
            trimmed.find('\n').map(|i| i + 1).unwrap_or(7)
        } else {
            trimmed.find('\n').map(|i| i + 1).unwrap_or(3)
        };
        let content = &trimmed[start..];
        if let Some(end_pos) = find_closing_fence(content) {
            return content[..end_pos].trim();
        }
        content.trim()
    } else {
        trimmed
    }
}

fn find_closing_fence(content: &str) -> Option<usize> {
    for (i, line) in content.lines().enumerate() {
        let trimmed_line = line.trim();
        if trimmed_line == "```"
            || trimmed_line.starts_with("```\n")
            || trimmed_line.starts_with("``` ")
        {
            let offset: usize = content.lines().take(i).map(|l| l.len() + 1).sum();
            return Some(offset);
        }
    }
    content
        .rfind("\n```")
        .map(|i| i + 1)
        .or_else(|| content.rfind("```"))
}

async fn compute_weekly_learning_stats(
    proxy: &crate::db::DatabaseProxy,
    start: chrono::DateTime<Utc>,
    end: chrono::DateTime<Utc>,
) -> Result<(i64, f64, f64), AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) as "total",
            SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END) as "correct",
            AVG(NULLIF("responseTime", 0))::float8 as "avg_rt",
            COUNT("responseTime") as "rt_count",
            COUNT(NULLIF("responseTime", 0)) as "rt_non_zero_count"
        FROM "answer_records"
        WHERE "timestamp" >= $1 AND "timestamp" <= $2
        "#,
    )
    .bind(start.naive_utc())
    .bind(end.naive_utc())
    .fetch_one(pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to query weekly learning stats");
        json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")
    })?;

    let total: i64 = row.try_get("total").unwrap_or(0);
    let correct: i64 = row.try_get("correct").unwrap_or(0);
    let avg_rt: Option<f64> = row.try_get("avg_rt").ok();
    let rt_count: i64 = row.try_get("rt_count").unwrap_or(0);
    let rt_non_zero_count: i64 = row.try_get("rt_non_zero_count").unwrap_or(0);

    tracing::info!(
        total = total,
        correct = correct,
        avg_rt = ?avg_rt,
        rt_count = rt_count,
        rt_non_zero_count = rt_non_zero_count,
        "Weekly learning stats computed"
    );

    let accuracy = if total > 0 {
        (correct.max(0) as f64) / (total as f64)
    } else {
        0.0
    };
    Ok((total, accuracy, avg_rt.unwrap_or(0.0)))
}

async fn compute_user_stats(
    proxy: &crate::db::DatabaseProxy,
    start: chrono::DateTime<Utc>,
    end: chrono::DateTime<Utc>,
) -> Result<UsersSnapshot, AppError> {
    let pool = proxy.pool();
    let prev_start = start - chrono::Duration::days(7);

    let row = sqlx::query(
        r#"
        SELECT
            (SELECT COUNT(*) FROM "users") as total,
            (SELECT COUNT(DISTINCT "userId") FROM "answer_records"
             WHERE "timestamp" >= $1 AND "timestamp" <= $2) as active,
            (SELECT COUNT(*) FROM "users" WHERE "createdAt" >= $1 AND "createdAt" <= $2) as new_users,
            (SELECT COUNT(DISTINCT "userId") FROM "answer_records"
             WHERE "timestamp" >= $3 AND "timestamp" < $1) as prev_active
        "#,
    )
    .bind(start.naive_utc())
    .bind(end.naive_utc())
    .bind(prev_start.naive_utc())
    .fetch_one(pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to query user stats");
        json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")
    })?;

    let total: i64 = row.try_get("total").unwrap_or(0);
    let active: i64 = row.try_get("active").unwrap_or(0);
    let new_users: i64 = row.try_get("new_users").unwrap_or(0);
    let prev_active: i64 = row.try_get("prev_active").unwrap_or(0);

    let churned: i64 = if prev_active > 0 {
        sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM (
                SELECT DISTINCT "userId" FROM "answer_records"
                WHERE "timestamp" >= $1 AND "timestamp" < $2
            ) prev
            WHERE NOT EXISTS (
                SELECT 1 FROM "answer_records" ar
                WHERE ar."userId" = prev."userId" AND ar."timestamp" >= $2
            )
            "#,
        )
        .bind(prev_start.naive_utc())
        .bind(start.naive_utc())
        .fetch_one(pool)
        .await
        .unwrap_or(0)
    } else {
        0
    };

    Ok(UsersSnapshot {
        total,
        active_this_week: active,
        new_this_week: new_users,
        churned,
        prev_week_active: prev_active,
    })
}

async fn compute_learning_stats(
    proxy: &crate::db::DatabaseProxy,
    start: chrono::DateTime<Utc>,
    end: chrono::DateTime<Utc>,
) -> Result<LearningSnapshot, AppError> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) as total_answers,
            SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END) as correct,
            AVG(NULLIF("responseTime", 0))::float8 as avg_rt,
            COUNT(DISTINCT "wordId") as words_learned
        FROM "answer_records"
        WHERE "timestamp" >= $1 AND "timestamp" <= $2
        "#,
    )
    .bind(start.naive_utc())
    .bind(end.naive_utc())
    .fetch_one(pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to query learning stats");
        json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")
    })?;

    let total_answers: i64 = row.try_get("total_answers").unwrap_or(0);
    let correct: i64 = row.try_get("correct").unwrap_or(0);
    let avg_rt: Option<f64> = row.try_get("avg_rt").ok();
    let words_learned: i64 = row.try_get("words_learned").unwrap_or(0);

    let avg_accuracy = if total_answers > 0 {
        (correct.max(0) as f64) / (total_answers as f64)
    } else {
        0.0
    };

    let session_row = sqlx::query(
        r#"
        SELECT AVG(EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))) as avg_duration
        FROM "learning_sessions"
        WHERE "startedAt" >= $1 AND "startedAt" <= $2
          AND "endedAt" IS NOT NULL
          AND EXTRACT(EPOCH FROM ("endedAt" - "startedAt")) BETWEEN 10 AND 7200
        "#,
    )
    .bind(start.naive_utc())
    .bind(end.naive_utc())
    .fetch_one(pool)
    .await
    .ok();

    let avg_session_duration = session_row
        .and_then(|r| r.try_get::<Option<f64>, _>("avg_duration").ok().flatten())
        .unwrap_or(0.0);

    Ok(LearningSnapshot {
        total_answers,
        avg_accuracy,
        avg_response_time: avg_rt.unwrap_or(0.0),
        avg_session_duration,
        total_words_learned: words_learned,
    })
}

async fn compute_state_distribution(
    proxy: &crate::db::DatabaseProxy,
) -> Result<StateDistributionSnapshot, AppError> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
            COUNT(CASE WHEN "fatigue" < 0.33 THEN 1 END) as fatigue_low,
            COUNT(CASE WHEN "fatigue" >= 0.33 AND "fatigue" < 0.66 THEN 1 END) as fatigue_mid,
            COUNT(CASE WHEN "fatigue" >= 0.66 THEN 1 END) as fatigue_high,
            COUNT(CASE WHEN "motivation" < -0.33 THEN 1 END) as motivation_low,
            COUNT(CASE WHEN "motivation" >= -0.33 AND "motivation" < 0.33 THEN 1 END) as motivation_mid,
            COUNT(CASE WHEN "motivation" >= 0.33 THEN 1 END) as motivation_high
        FROM "amas_user_states"
        "#,
    )
    .fetch_one(pool)
    .await
    .ok();

    let (fatigue, motivation) = match row {
        Some(r) => (
            ThreeTierDistribution {
                low: r.try_get("fatigue_low").unwrap_or(0),
                mid: r.try_get("fatigue_mid").unwrap_or(0),
                high: r.try_get("fatigue_high").unwrap_or(0),
            },
            ThreeTierDistribution {
                low: r.try_get("motivation_low").unwrap_or(0),
                mid: r.try_get("motivation_mid").unwrap_or(0),
                high: r.try_get("motivation_high").unwrap_or(0),
            },
        ),
        None => (
            ThreeTierDistribution {
                low: 0,
                mid: 0,
                high: 0,
            },
            ThreeTierDistribution {
                low: 0,
                mid: 0,
                high: 0,
            },
        ),
    };

    Ok(StateDistributionSnapshot {
        fatigue,
        motivation,
    })
}

async fn compute_alerts(
    proxy: &crate::db::DatabaseProxy,
    users: &UsersSnapshot,
    start: chrono::DateTime<Utc>,
    end: chrono::DateTime<Utc>,
) -> Result<AlertsSnapshot, AppError> {
    let pool = proxy.pool();

    let low_accuracy_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT "userId" FROM "answer_records"
            WHERE "timestamp" >= $1 AND "timestamp" <= $2
            GROUP BY "userId"
            HAVING AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) < 0.5
                AND COUNT(*) >= 10
        ) sub
        "#,
    )
    .bind(start.naive_utc())
    .bind(end.naive_utc())
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let state_row = sqlx::query(
        r#"
        SELECT
            COUNT(CASE WHEN "fatigue" >= 0.66 THEN 1 END) as high_fatigue,
            COUNT(CASE WHEN "motivation" < -0.33 THEN 1 END) as low_motivation,
            COUNT(*) as total
        FROM "amas_user_states"
        "#,
    )
    .fetch_one(pool)
    .await
    .ok();

    let (high_fatigue, low_motivation, state_total) = state_row
        .map(|r| {
            (
                r.try_get::<i64, _>("high_fatigue").unwrap_or(0),
                r.try_get::<i64, _>("low_motivation").unwrap_or(0),
                r.try_get::<i64, _>("total").unwrap_or(1).max(1),
            )
        })
        .unwrap_or((0, 0, 1));

    let active_count = users.active_this_week.max(1) as f64;
    let prev_active_count = users.prev_week_active.max(1) as f64;

    Ok(AlertsSnapshot {
        low_accuracy_user_ratio: low_accuracy_count as f64 / active_count,
        high_fatigue_user_ratio: high_fatigue as f64 / state_total as f64,
        low_motivation_user_ratio: low_motivation as f64 / state_total as f64,
        churn_rate: if users.prev_week_active > 0 {
            users.churned as f64 / prev_active_count
        } else {
            0.0
        },
    })
}

async fn insert_suggestion(
    proxy: &crate::db::DatabaseProxy,
    id: &str,
    week_start_iso: &str,
    week_end_iso: &str,
    stats_snapshot: &serde_json::Value,
    raw_response: &str,
    parsed_suggestion: &serde_json::Value,
) -> Result<(), AppError> {
    let pool = proxy.pool();

    let week_start = chrono::DateTime::parse_from_rfc3339(week_start_iso)
        .map(|dt| dt.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let week_end = chrono::DateTime::parse_from_rfc3339(week_end_iso)
        .map(|dt| dt.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc());

    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "llm_advisor_suggestions" ("id", "weekStart", "weekEnd", "statsSnapshot", "rawResponse", "parsedSuggestion", "status", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        "#,
    )
    .bind(id)
    .bind(week_start)
    .bind(week_end)
    .bind(stats_snapshot)
    .bind(raw_response)
    .bind(parsed_suggestion)
    .bind("pending")
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to insert LLM suggestion");
        json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败")
    })?;

    Ok(())
}

async fn get_latest(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let suggestion = select_latest(proxy.as_ref()).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: suggestion,
    }))
}

async fn select_latest(
    proxy: &crate::db::DatabaseProxy,
) -> Result<Option<StoredSuggestionDto>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "id" FROM "llm_advisor_suggestions"
        ORDER BY "createdAt" DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    let Some(row) = row else { return Ok(None) };
    let id: String = row.try_get("id").unwrap_or_default();
    select_suggestion(proxy, &id).await
}

async fn get_pending_count(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let count = count_pending(proxy.as_ref()).await.unwrap_or(0);
    Ok(Json(SuccessResponse {
        success: true,
        data: PendingCountDto { count },
    }))
}
