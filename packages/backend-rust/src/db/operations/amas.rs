use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmasUserState {
    pub id: String,
    pub user_id: String,
    pub attention: f64,
    pub fatigue: f64,
    pub motivation: f64,
    pub cognitive_profile: serde_json::Value,
    pub trend_state: Option<String>,
    pub confidence: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmasUserModel {
    pub id: String,
    pub user_id: String,
    pub model_type: String,
    pub parameters: serde_json::Value,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionRecord {
    pub id: String,
    pub user_id: String,
    pub session_id: Option<String>,
    pub decision_type: String,
    pub input_state: serde_json::Value,
    pub output_action: serde_json::Value,
    pub reward: Option<f64>,
    pub delayed_reward: Option<f64>,
    pub feature_vector_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionInsight {
    pub id: String,
    pub decision_record_id: String,
    pub insight_type: String,
    pub data: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStage {
    pub id: String,
    pub decision_record_id: String,
    pub stage_name: String,
    pub stage_order: i32,
    pub input_data: serde_json::Value,
    pub output_data: serde_json::Value,
    pub duration_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureVector {
    pub id: String,
    pub user_id: String,
    pub vector: Vec<f64>,
    pub labels: serde_json::Value,
    pub created_at: String,
}

pub async fn get_amas_user_state(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<AmasUserState>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT * FROM "amas_user_states"
        WHERE "userId" = $1
        ORDER BY "updatedAt" DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_amas_user_state(&r)))
}

pub async fn upsert_amas_user_state(
    proxy: &DatabaseProxy,
    user_state: &AmasUserState,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "amas_user_states" (
            "id", "userId", "attention", "fatigue", "motivation",
            "cognitiveProfile", "trendState", "confidence", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("userId") DO UPDATE SET
            "attention" = EXCLUDED."attention",
            "fatigue" = EXCLUDED."fatigue",
            "motivation" = EXCLUDED."motivation",
            "cognitiveProfile" = EXCLUDED."cognitiveProfile",
            "trendState" = EXCLUDED."trendState",
            "confidence" = EXCLUDED."confidence",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&user_state.id)
    .bind(&user_state.user_id)
    .bind(user_state.attention)
    .bind(user_state.fatigue)
    .bind(user_state.motivation)
    .bind(&user_state.cognitive_profile)
    .bind(&user_state.trend_state)
    .bind(user_state.confidence)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_amas_user_model(
    proxy: &DatabaseProxy,
    user_id: &str,
    model_type: &str,
) -> Result<Option<AmasUserModel>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT * FROM "amas_user_models"
        WHERE "userId" = $1 AND "modelType" = $2
        ORDER BY "version" DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(model_type)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_amas_user_model(&r)))
}

pub async fn insert_amas_user_model(
    proxy: &DatabaseProxy,
    model: &AmasUserModel,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "amas_user_models" (
            "id", "userId", "modelType", "parameters", "version", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(&model.id)
    .bind(&model.user_id)
    .bind(&model.model_type)
    .bind(&model.parameters)
    .bind(model.version)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_decision_record(
    proxy: &DatabaseProxy,
    record: &DecisionRecord,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "decision_records" (
            "id", "userId", "sessionId", "decisionType", "inputState",
            "outputAction", "reward", "delayedReward", "featureVectorId", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(&record.id)
    .bind(&record.user_id)
    .bind(&record.session_id)
    .bind(&record.decision_type)
    .bind(&record.input_state)
    .bind(&record.output_action)
    .bind(record.reward)
    .bind(record.delayed_reward)
    .bind(&record.feature_vector_id)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_recent_decision_records(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<DecisionRecord>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT * FROM "decision_records"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_decision_record).collect())
}

pub async fn insert_feature_vector(
    proxy: &DatabaseProxy,
    fv: &FeatureVector,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "feature_vectors" (
            "id", "userId", "vector", "labels", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(&fv.id)
    .bind(&fv.user_id)
    .bind(&fv.vector)
    .bind(&fv.labels)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

fn map_amas_user_state(row: &sqlx::postgres::PgRow) -> AmasUserState {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let default_cognitive = serde_json::json!({ "mem": 0.5, "speed": 0.5, "stability": 0.5 });
    AmasUserState {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        attention: row.try_get("attention").unwrap_or(0.5),
        fatigue: row.try_get("fatigue").unwrap_or(0.0),
        motivation: row.try_get("motivation").unwrap_or(0.5),
        cognitive_profile: row.try_get("cognitiveProfile").unwrap_or(default_cognitive),
        trend_state: row.try_get("trendState").ok(),
        confidence: row.try_get("confidence").unwrap_or(0.5),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_amas_user_model(row: &sqlx::postgres::PgRow) -> AmasUserModel {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    AmasUserModel {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        model_type: row.try_get("modelType").unwrap_or_default(),
        parameters: row.try_get("parameters").unwrap_or(serde_json::Value::Null),
        version: row.try_get("version").unwrap_or(1),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_decision_record(row: &sqlx::postgres::PgRow) -> DecisionRecord {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    DecisionRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        session_id: row.try_get("sessionId").ok(),
        decision_type: row.try_get("decisionType").unwrap_or_default(),
        input_state: row.try_get("inputState").unwrap_or(serde_json::Value::Null),
        output_action: row.try_get("outputAction").unwrap_or(serde_json::Value::Null),
        reward: row.try_get("reward").ok(),
        delayed_reward: row.try_get("delayedReward").ok(),
        feature_vector_id: row.try_get("featureVectorId").ok(),
        created_at: format_naive_iso(created_at),
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}
