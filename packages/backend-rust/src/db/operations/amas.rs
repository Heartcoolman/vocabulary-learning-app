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
    pub decision_id: String,
    pub answer_record_id: Option<String>,
    pub session_id: Option<String>,
    pub decision_source: String,
    pub coldstart_phase: Option<String>,
    pub weights_snapshot: Option<serde_json::Value>,
    pub member_votes: Option<serde_json::Value>,
    pub selected_action: serde_json::Value,
    pub confidence: f64,
    pub reward: Option<f64>,
    pub trace_version: i32,
    pub total_duration_ms: Option<i32>,
    pub is_simulation: bool,
    pub emotion_label: Option<String>,
    pub flow_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionInsight {
    pub id: String,
    pub decision_id: String,
    pub user_id: String,
    pub state_snapshot: serde_json::Value,
    pub difficulty_factors: serde_json::Value,
    pub triggers: Vec<String>,
    pub feature_vector_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStage {
    pub id: String,
    pub decision_record_id: String,
    pub stage: String,
    pub stage_name: String,
    pub status: String,
    pub started_at: chrono::NaiveDateTime,
    pub ended_at: Option<chrono::NaiveDateTime>,
    pub duration_ms: Option<i32>,
    pub input_summary: Option<serde_json::Value>,
    pub output_summary: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub error_message: Option<String>,
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
        ON CONFLICT ("id") DO UPDATE SET
            "parameters" = EXCLUDED."parameters",
            "version" = EXCLUDED."version",
            "updatedAt" = EXCLUDED."updatedAt"
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
            "id", "decisionId", "answerRecordId", "sessionId", "decisionSource",
            "coldstartPhase", "weightsSnapshot", "memberVotes", "selectedAction",
            "confidence", "reward", "traceVersion", "totalDurationMs",
            "isSimulation", "emotionLabel", "flowScore", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
        "#,
    )
    .bind(&record.id)
    .bind(&record.decision_id)
    .bind(&record.answer_record_id)
    .bind(&record.session_id)
    .bind(&record.decision_source)
    .bind(&record.coldstart_phase)
    .bind(&record.weights_snapshot)
    .bind(&record.member_votes)
    .bind(&record.selected_action)
    .bind(record.confidence)
    .bind(record.reward)
    .bind(record.trace_version)
    .bind(record.total_duration_ms)
    .bind(record.is_simulation)
    .bind(&record.emotion_label)
    .bind(record.flow_score)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_recent_decision_records(
    proxy: &DatabaseProxy,
    session_id: &str,
    limit: i64,
) -> Result<Vec<DecisionRecord>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT * FROM "decision_records"
        WHERE "sessionId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
        "#,
    )
    .bind(session_id)
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

pub async fn insert_decision_insight(
    proxy: &DatabaseProxy,
    decision_id: &str,
    user_id: &str,
    state_snapshot: &serde_json::Value,
    difficulty_factors: &serde_json::Value,
    triggers: &[String],
    feature_vector_hash: &str,
) -> Result<(), sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "decision_insights" (
            "id", "decision_id", "user_id", "state_snapshot", "difficulty_factors",
            "triggers", "feature_vector_hash", "created_at", "updated_at"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        ON CONFLICT ("decision_id") DO UPDATE SET
            "state_snapshot" = EXCLUDED."state_snapshot",
            "difficulty_factors" = EXCLUDED."difficulty_factors",
            "triggers" = EXCLUDED."triggers",
            "feature_vector_hash" = EXCLUDED."feature_vector_hash",
            "updated_at" = EXCLUDED."updated_at"
        "#,
    )
    .bind(&id)
    .bind(decision_id)
    .bind(user_id)
    .bind(state_snapshot)
    .bind(difficulty_factors)
    .bind(triggers)
    .bind(feature_vector_hash)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_pipeline_stage(
    proxy: &DatabaseProxy,
    decision_record_id: &str,
    stage: &str,
    stage_name: &str,
    status: &str,
    started_at: chrono::NaiveDateTime,
    ended_at: Option<chrono::NaiveDateTime>,
    duration_ms: Option<i32>,
    input_summary: Option<&serde_json::Value>,
    output_summary: Option<&serde_json::Value>,
    metadata: Option<&serde_json::Value>,
    error_message: Option<&str>,
) -> Result<(), sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "pipeline_stages" (
            "id", "decisionRecordId", "stage", "stageName", "status",
            "startedAt", "endedAt", "durationMs", "inputSummary",
            "outputSummary", "metadata", "errorMessage", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        "#,
    )
    .bind(&id)
    .bind(decision_record_id)
    .bind(stage)
    .bind(stage_name)
    .bind(status)
    .bind(started_at)
    .bind(ended_at)
    .bind(duration_ms)
    .bind(input_summary)
    .bind(output_summary)
    .bind(metadata)
    .bind(error_message)
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
    DecisionRecord {
        id: row.try_get("id").unwrap_or_default(),
        decision_id: row.try_get("decisionId").unwrap_or_default(),
        answer_record_id: row.try_get("answerRecordId").ok(),
        session_id: row.try_get("sessionId").ok(),
        decision_source: row.try_get("decisionSource").unwrap_or_default(),
        coldstart_phase: row.try_get("coldstartPhase").ok(),
        weights_snapshot: row.try_get("weightsSnapshot").ok(),
        member_votes: row.try_get("memberVotes").ok(),
        selected_action: row.try_get("selectedAction").unwrap_or(serde_json::Value::Null),
        confidence: row.try_get("confidence").unwrap_or(0.0),
        reward: row.try_get("reward").ok(),
        trace_version: row.try_get("traceVersion").unwrap_or(1),
        total_duration_ms: row.try_get("totalDurationMs").ok(),
        is_simulation: row.try_get("isSimulation").unwrap_or(false),
        emotion_label: row.try_get("emotionLabel").ok(),
        flow_score: row.try_get("flowScore").ok(),
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}
