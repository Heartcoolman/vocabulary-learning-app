use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionEffectTracking {
    pub id: String,
    pub suggestion_id: String,
    pub item_id: String,
    pub target_param: String,
    pub old_value: f64,
    pub new_value: f64,
    pub applied_at: NaiveDateTime,
    pub metrics_before_apply: serde_json::Value,
    pub metrics_after_apply: Option<serde_json::Value>,
    pub effect_evaluated: bool,
    pub effect_score: Option<f64>,
    pub effect_analysis: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordContentVariant {
    pub id: String,
    pub word_id: String,
    pub field: String,
    pub original_value: Option<serde_json::Value>,
    pub generated_value: serde_json::Value,
    pub confidence: f64,
    pub task_id: Option<String>,
    pub status: String,
    pub approved_by: Option<String>,
    pub approved_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMAnalysisTask {
    pub id: String,
    pub task_type: String,
    pub status: String,
    pub priority: i32,
    pub input: serde_json::Value,
    pub output: Option<serde_json::Value>,
    pub tokens_used: Option<i32>,
    pub error: Option<String>,
    pub retry_count: i32,
    pub created_by: Option<String>,
    pub started_at: Option<NaiveDateTime>,
    pub completed_at: Option<NaiveDateTime>,
}

pub async fn insert_suggestion_effect_tracking(
    proxy: &DatabaseProxy,
    suggestion_id: &str,
    item_id: &str,
    target_param: &str,
    old_value: f64,
    new_value: f64,
    metrics_before_apply: &serde_json::Value,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "suggestion_effect_tracking" (
            "id", "suggestionId", "itemId", "targetParam", "oldValue", "newValue",
            "appliedAt", "metricsBeforeApply", "effectEvaluated",
            "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $7, $7)
        "#,
    )
    .bind(&id)
    .bind(suggestion_id)
    .bind(item_id)
    .bind(target_param)
    .bind(old_value)
    .bind(new_value)
    .bind(now)
    .bind(metrics_before_apply)
    .execute(proxy.pool())
    .await?;
    Ok(id)
}

pub async fn update_suggestion_effect(
    proxy: &DatabaseProxy,
    tracking_id: &str,
    metrics_after_apply: &serde_json::Value,
    effect_score: f64,
    effect_analysis: &str,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "suggestion_effect_tracking" SET
            "metricsAfterApply" = $1,
            "effectEvaluated" = true,
            "effectScore" = $2,
            "effectAnalysis" = $3,
            "evaluatedAt" = $4,
            "updatedAt" = $4
        WHERE "id" = $5
        "#,
    )
    .bind(metrics_after_apply)
    .bind(effect_score)
    .bind(effect_analysis)
    .bind(now)
    .bind(tracking_id)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_word_content_variant(
    proxy: &DatabaseProxy,
    word_id: &str,
    field: &str,
    original_value: Option<&serde_json::Value>,
    generated_value: &serde_json::Value,
    confidence: f64,
    task_id: Option<&str>,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "word_content_variants" (
            "id", "wordId", "field", "originalValue", "generatedValue",
            "confidence", "taskId", "status", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
        "#,
    )
    .bind(&id)
    .bind(word_id)
    .bind(field)
    .bind(original_value)
    .bind(generated_value)
    .bind(confidence)
    .bind(task_id)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(id)
}

pub async fn update_word_content_variant_status(
    proxy: &DatabaseProxy,
    variant_id: &str,
    status: &str,
    approved_by: Option<&str>,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    let approved_at = if status == "approved" {
        Some(now)
    } else {
        None
    };
    sqlx::query(
        r#"
        UPDATE "word_content_variants" SET
            "status" = $1,
            "approvedBy" = $2,
            "approvedAt" = $3
        WHERE "id" = $4
        "#,
    )
    .bind(status)
    .bind(approved_by)
    .bind(approved_at)
    .bind(variant_id)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_llm_analysis_task(
    proxy: &DatabaseProxy,
    task_type: &str,
    priority: i32,
    input: &serde_json::Value,
    created_by: Option<&str>,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "llm_analysis_tasks" (
            "id", "type", "status", "priority", "input", "retryCount",
            "createdBy", "createdAt", "updatedAt"
        ) VALUES ($1, $2, 'pending', $3, $4, 0, $5, $6, $6)
        "#,
    )
    .bind(&id)
    .bind(task_type)
    .bind(priority)
    .bind(input)
    .bind(created_by)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(id)
}

pub async fn update_llm_task_started(
    proxy: &DatabaseProxy,
    task_id: &str,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "llm_analysis_tasks" SET
            "status" = 'processing',
            "startedAt" = $1,
            "updatedAt" = $1
        WHERE "id" = $2
        "#,
    )
    .bind(now)
    .bind(task_id)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn update_llm_task_completed(
    proxy: &DatabaseProxy,
    task_id: &str,
    output: &serde_json::Value,
    tokens_used: Option<i32>,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "llm_analysis_tasks" SET
            "status" = 'completed',
            "output" = $1,
            "tokensUsed" = $2,
            "completedAt" = $3,
            "updatedAt" = $3
        WHERE "id" = $4
        "#,
    )
    .bind(output)
    .bind(tokens_used)
    .bind(now)
    .bind(task_id)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn update_llm_task_failed(
    proxy: &DatabaseProxy,
    task_id: &str,
    error: &str,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "llm_analysis_tasks" SET
            "status" = 'failed',
            "error" = $1,
            "retryCount" = "retryCount" + 1,
            "completedAt" = $2,
            "updatedAt" = $2
        WHERE "id" = $3
        "#,
    )
    .bind(error)
    .bind(now)
    .bind(task_id)
    .execute(proxy.pool())
    .await?;
    Ok(())
}
