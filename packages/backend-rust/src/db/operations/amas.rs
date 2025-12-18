use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmasUserState {
    pub id: String,
    pub user_id: String,
    pub attention: f64,
    pub fatigue: f64,
    pub motivation: f64,
    pub cognitive_memory: f64,
    pub cognitive_speed: f64,
    pub cognitive_stability: f64,
    pub trend_direction: String,
    pub trend_strength: f64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardQueueItem {
    pub id: String,
    pub decision_record_id: String,
    pub scheduled_at: String,
    pub processed: bool,
    pub processed_at: Option<String>,
    pub created_at: String,
}

pub async fn get_amas_user_state(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Option<AmasUserState>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT * FROM "amas_user_states"
            WHERE "userId" = ?
            ORDER BY "updatedAt" DESC
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_sqlite_amas_user_state(&r)))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT * FROM "amas_user_states"
            WHERE "userId" = $1
            ORDER BY "updatedAt" DESC
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_postgres_amas_user_state(&r)))
    }
}

pub async fn upsert_amas_user_state(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_state: &AmasUserState,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::Value::String(user_state.user_id.clone()));

        let mut create_data = serde_json::Map::new();
        create_data.insert("id".into(), serde_json::Value::String(user_state.id.clone()));
        create_data.insert("userId".into(), serde_json::Value::String(user_state.user_id.clone()));
        create_data.insert("attention".into(), serde_json::json!(user_state.attention));
        create_data.insert("fatigue".into(), serde_json::json!(user_state.fatigue));
        create_data.insert("motivation".into(), serde_json::json!(user_state.motivation));
        create_data.insert("cognitiveMemory".into(), serde_json::json!(user_state.cognitive_memory));
        create_data.insert("cognitiveSpeed".into(), serde_json::json!(user_state.cognitive_speed));
        create_data.insert("cognitiveStability".into(), serde_json::json!(user_state.cognitive_stability));
        create_data.insert("trendDirection".into(), serde_json::Value::String(user_state.trend_direction.clone()));
        create_data.insert("trendStrength".into(), serde_json::json!(user_state.trend_strength));
        create_data.insert("confidence".into(), serde_json::json!(user_state.confidence));
        create_data.insert("createdAt".into(), serde_json::Value::String(now_iso.clone()));
        create_data.insert("updatedAt".into(), serde_json::Value::String(now_iso.clone()));

        let mut update_data = serde_json::Map::new();
        update_data.insert("attention".into(), serde_json::json!(user_state.attention));
        update_data.insert("fatigue".into(), serde_json::json!(user_state.fatigue));
        update_data.insert("motivation".into(), serde_json::json!(user_state.motivation));
        update_data.insert("cognitiveMemory".into(), serde_json::json!(user_state.cognitive_memory));
        update_data.insert("cognitiveSpeed".into(), serde_json::json!(user_state.cognitive_speed));
        update_data.insert("cognitiveStability".into(), serde_json::json!(user_state.cognitive_stability));
        update_data.insert("trendDirection".into(), serde_json::Value::String(user_state.trend_direction.clone()));
        update_data.insert("trendStrength".into(), serde_json::json!(user_state.trend_strength));
        update_data.insert("confidence".into(), serde_json::json!(user_state.confidence));
        update_data.insert("updatedAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "amas_user_states".to_string(),
            r#where: where_clause,
            create: create_data,
            update: update_data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
        let now = Utc::now().naive_utc();
        sqlx::query(
            r#"
            INSERT INTO "amas_user_states" (
                "id", "userId", "attention", "fatigue", "motivation",
                "cognitiveMemory", "cognitiveSpeed", "cognitiveStability",
                "trendDirection", "trendStrength", "confidence", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT ("userId") DO UPDATE SET
                "attention" = EXCLUDED."attention",
                "fatigue" = EXCLUDED."fatigue",
                "motivation" = EXCLUDED."motivation",
                "cognitiveMemory" = EXCLUDED."cognitiveMemory",
                "cognitiveSpeed" = EXCLUDED."cognitiveSpeed",
                "cognitiveStability" = EXCLUDED."cognitiveStability",
                "trendDirection" = EXCLUDED."trendDirection",
                "trendStrength" = EXCLUDED."trendStrength",
                "confidence" = EXCLUDED."confidence",
                "updatedAt" = EXCLUDED."updatedAt"
            "#,
        )
        .bind(&user_state.id)
        .bind(&user_state.user_id)
        .bind(user_state.attention)
        .bind(user_state.fatigue)
        .bind(user_state.motivation)
        .bind(user_state.cognitive_memory)
        .bind(user_state.cognitive_speed)
        .bind(user_state.cognitive_stability)
        .bind(&user_state.trend_direction)
        .bind(user_state.trend_strength)
        .bind(user_state.confidence)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn get_amas_user_model(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    model_type: &str,
) -> Result<Option<AmasUserModel>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT * FROM "amas_user_models"
            WHERE "userId" = ? AND "modelType" = ?
            ORDER BY "version" DESC
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .bind(model_type)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_sqlite_amas_user_model(&r)))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
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
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_postgres_amas_user_model(&r)))
    }
}

pub async fn insert_amas_user_model(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    model: &AmasUserModel,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(model.id.clone()));
        data.insert("userId".into(), serde_json::Value::String(model.user_id.clone()));
        data.insert("modelType".into(), serde_json::Value::String(model.model_type.clone()));
        data.insert("parameters".into(), model.parameters.clone());
        data.insert("version".into(), serde_json::json!(model.version));
        data.insert("createdAt".into(), serde_json::Value::String(now_iso.clone()));
        data.insert("updatedAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "amas_user_models".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
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
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn insert_decision_record(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    record: &DecisionRecord,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(record.id.clone()));
        data.insert("userId".into(), serde_json::Value::String(record.user_id.clone()));
        if let Some(ref session_id) = record.session_id {
            data.insert("sessionId".into(), serde_json::Value::String(session_id.clone()));
        }
        data.insert("decisionType".into(), serde_json::Value::String(record.decision_type.clone()));
        data.insert("inputState".into(), record.input_state.clone());
        data.insert("outputAction".into(), record.output_action.clone());
        if let Some(reward) = record.reward {
            data.insert("reward".into(), serde_json::json!(reward));
        }
        if let Some(delayed_reward) = record.delayed_reward {
            data.insert("delayedReward".into(), serde_json::json!(delayed_reward));
        }
        if let Some(ref fv_id) = record.feature_vector_id {
            data.insert("featureVectorId".into(), serde_json::Value::String(fv_id.clone()));
        }
        data.insert("createdAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "decision_records".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
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
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn get_recent_decision_records(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    limit: i64,
) -> Result<Vec<DecisionRecord>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT * FROM "decision_records"
            WHERE "userId" = ?
            ORDER BY "createdAt" DESC
            LIMIT ?
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_sqlite_decision_record).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
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
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_postgres_decision_record).collect())
    }
}

pub async fn insert_feature_vector(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    fv: &FeatureVector,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(fv.id.clone()));
        data.insert("userId".into(), serde_json::Value::String(fv.user_id.clone()));
        data.insert("vector".into(), serde_json::json!(fv.vector));
        data.insert("labels".into(), fv.labels.clone());
        data.insert("createdAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "feature_vectors".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
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
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn enqueue_delayed_reward(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    item: &RewardQueueItem,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(item.id.clone()));
        data.insert("decisionRecordId".into(), serde_json::Value::String(item.decision_record_id.clone()));
        data.insert("scheduledAt".into(), serde_json::Value::String(item.scheduled_at.clone()));
        data.insert("processed".into(), serde_json::Value::Bool(false));
        data.insert("createdAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "reward_queue".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
        let now = Utc::now().naive_utc();
        let scheduled_at = chrono::DateTime::parse_from_rfc3339(&item.scheduled_at)
            .map(|dt| dt.naive_utc())
            .unwrap_or(now);
        sqlx::query(
            r#"
            INSERT INTO "reward_queue" (
                "id", "decisionRecordId", "scheduledAt", "processed", "createdAt"
            ) VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(&item.id)
        .bind(&item.decision_record_id)
        .bind(scheduled_at)
        .bind(false)
        .bind(now)
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn get_pending_rewards(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    limit: i64,
) -> Result<Vec<RewardQueueItem>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT * FROM "reward_queue"
            WHERE "processed" = 0 AND "scheduledAt" <= ?
            ORDER BY "scheduledAt" ASC
            LIMIT ?
            "#,
        )
        .bind(&now_iso)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_sqlite_reward_queue_item).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let now = Utc::now().naive_utc();
        let rows = sqlx::query(
            r#"
            SELECT * FROM "reward_queue"
            WHERE "processed" = false AND "scheduledAt" <= $1
            ORDER BY "scheduledAt" ASC
            LIMIT $2
            "#,
        )
        .bind(now)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_postgres_reward_queue_item).collect())
    }
}

pub async fn mark_reward_processed(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    reward_id: &str,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::Value::String(reward_id.to_string()));

        let mut data = serde_json::Map::new();
        data.insert("processed".into(), serde_json::Value::Bool(true));
        data.insert("processedAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "reward_queue".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
        let now = Utc::now().naive_utc();
        sqlx::query(
            r#"
            UPDATE "reward_queue"
            SET "processed" = true, "processedAt" = $1
            WHERE "id" = $2
            "#,
        )
        .bind(now)
        .bind(reward_id)
        .execute(&pool)
        .await?;
        Ok(())
    }
}

fn map_postgres_amas_user_state(row: &sqlx::postgres::PgRow) -> AmasUserState {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    AmasUserState {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        attention: row.try_get("attention").unwrap_or(0.5),
        fatigue: row.try_get("fatigue").unwrap_or(0.0),
        motivation: row.try_get("motivation").unwrap_or(0.5),
        cognitive_memory: row.try_get("cognitiveMemory").unwrap_or(0.5),
        cognitive_speed: row.try_get("cognitiveSpeed").unwrap_or(0.5),
        cognitive_stability: row.try_get("cognitiveStability").unwrap_or(0.5),
        trend_direction: row.try_get("trendDirection").unwrap_or_else(|_| "stable".to_string()),
        trend_strength: row.try_get("trendStrength").unwrap_or(0.0),
        confidence: row.try_get("confidence").unwrap_or(0.5),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_sqlite_amas_user_state(row: &sqlx::sqlite::SqliteRow) -> AmasUserState {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();
    AmasUserState {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        attention: row.try_get("attention").unwrap_or(0.5),
        fatigue: row.try_get("fatigue").unwrap_or(0.0),
        motivation: row.try_get("motivation").unwrap_or(0.5),
        cognitive_memory: row.try_get("cognitiveMemory").unwrap_or(0.5),
        cognitive_speed: row.try_get("cognitiveSpeed").unwrap_or(0.5),
        cognitive_stability: row.try_get("cognitiveStability").unwrap_or(0.5),
        trend_direction: row.try_get("trendDirection").unwrap_or_else(|_| "stable".to_string()),
        trend_strength: row.try_get("trendStrength").unwrap_or(0.0),
        confidence: row.try_get("confidence").unwrap_or(0.5),
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
    }
}

fn map_postgres_amas_user_model(row: &sqlx::postgres::PgRow) -> AmasUserModel {
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

fn map_sqlite_amas_user_model(row: &sqlx::sqlite::SqliteRow) -> AmasUserModel {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();
    let params_raw: String = row.try_get("parameters").unwrap_or_default();
    AmasUserModel {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        model_type: row.try_get("modelType").unwrap_or_default(),
        parameters: serde_json::from_str(&params_raw).unwrap_or(serde_json::Value::Null),
        version: row.try_get("version").unwrap_or(1),
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
    }
}

fn map_postgres_decision_record(row: &sqlx::postgres::PgRow) -> DecisionRecord {
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

fn map_sqlite_decision_record(row: &sqlx::sqlite::SqliteRow) -> DecisionRecord {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let input_raw: String = row.try_get("inputState").unwrap_or_default();
    let output_raw: String = row.try_get("outputAction").unwrap_or_default();
    DecisionRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        session_id: row.try_get("sessionId").ok(),
        decision_type: row.try_get("decisionType").unwrap_or_default(),
        input_state: serde_json::from_str(&input_raw).unwrap_or(serde_json::Value::Null),
        output_action: serde_json::from_str(&output_raw).unwrap_or(serde_json::Value::Null),
        reward: row.try_get("reward").ok(),
        delayed_reward: row.try_get("delayedReward").ok(),
        feature_vector_id: row.try_get("featureVectorId").ok(),
        created_at: format_sqlite_datetime(&created_raw),
    }
}

fn map_postgres_reward_queue_item(row: &sqlx::postgres::PgRow) -> RewardQueueItem {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let scheduled_at: NaiveDateTime = row.try_get("scheduledAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let processed_at: Option<NaiveDateTime> = row.try_get("processedAt").ok();
    RewardQueueItem {
        id: row.try_get("id").unwrap_or_default(),
        decision_record_id: row.try_get("decisionRecordId").unwrap_or_default(),
        scheduled_at: format_naive_iso(scheduled_at),
        processed: row.try_get("processed").unwrap_or(false),
        processed_at: processed_at.map(format_naive_iso),
        created_at: format_naive_iso(created_at),
    }
}

fn map_sqlite_reward_queue_item(row: &sqlx::sqlite::SqliteRow) -> RewardQueueItem {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let scheduled_raw: String = row.try_get("scheduledAt").unwrap_or_default();
    let processed_raw: Option<String> = row.try_get("processedAt").ok();
    let processed_int: i64 = row.try_get("processed").unwrap_or(0);
    RewardQueueItem {
        id: row.try_get("id").unwrap_or_default(),
        decision_record_id: row.try_get("decisionRecordId").unwrap_or_default(),
        scheduled_at: format_sqlite_datetime(&scheduled_raw),
        processed: processed_int != 0,
        processed_at: processed_raw.as_ref().map(|s| format_sqlite_datetime(s)),
        created_at: format_sqlite_datetime(&created_raw),
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn format_sqlite_datetime(raw: &str) -> String {
    crate::auth::parse_sqlite_datetime_ms(raw)
        .and_then(crate::auth::format_timestamp_ms_iso_millis)
        .unwrap_or_else(|| Utc::now().to_rfc3339())
}
