use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitProfile {
    pub id: String,
    pub user_id: String,
    pub preferred_time_slots: serde_json::Value,
    pub avg_session_duration: i64,
    pub weekly_frequency: i32,
    pub consistency_score: f64,
    pub last_active_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserLearningProfile {
    pub id: String,
    pub user_id: String,
    pub learning_speed: f64,
    pub retention_rate: f64,
    pub preferred_difficulty: f64,
    pub optimal_batch_size: i32,
    pub fatigue_threshold: f64,
    pub recovery_rate: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStateHistory {
    pub id: String,
    pub user_id: String,
    pub state_snapshot: serde_json::Value,
    pub trigger_event: String,
    pub created_at: String,
}

pub async fn get_habit_profile(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Option<HabitProfile>, sqlx::Error> {
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
            r#"SELECT * FROM "habit_profiles" WHERE "userId" = ? LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_sqlite_habit_profile(&r)))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"SELECT * FROM "habit_profiles" WHERE "userId" = $1 LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_postgres_habit_profile(&r)))
    }
}

pub async fn upsert_habit_profile(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    profile: &HabitProfile,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::Value::String(profile.user_id.clone()));

        let mut create_data = serde_json::Map::new();
        create_data.insert("id".into(), serde_json::Value::String(profile.id.clone()));
        create_data.insert("userId".into(), serde_json::Value::String(profile.user_id.clone()));
        create_data.insert("preferredTimeSlots".into(), profile.preferred_time_slots.clone());
        create_data.insert("avgSessionDuration".into(), serde_json::json!(profile.avg_session_duration));
        create_data.insert("weeklyFrequency".into(), serde_json::json!(profile.weekly_frequency));
        create_data.insert("consistencyScore".into(), serde_json::json!(profile.consistency_score));
        if let Some(ref last_active) = profile.last_active_at {
            create_data.insert("lastActiveAt".into(), serde_json::Value::String(last_active.clone()));
        }
        create_data.insert("createdAt".into(), serde_json::Value::String(now_iso.clone()));
        create_data.insert("updatedAt".into(), serde_json::Value::String(now_iso.clone()));

        let mut update_data = serde_json::Map::new();
        update_data.insert("preferredTimeSlots".into(), profile.preferred_time_slots.clone());
        update_data.insert("avgSessionDuration".into(), serde_json::json!(profile.avg_session_duration));
        update_data.insert("weeklyFrequency".into(), serde_json::json!(profile.weekly_frequency));
        update_data.insert("consistencyScore".into(), serde_json::json!(profile.consistency_score));
        if let Some(ref last_active) = profile.last_active_at {
            update_data.insert("lastActiveAt".into(), serde_json::Value::String(last_active.clone()));
        }
        update_data.insert("updatedAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "habit_profiles".to_string(),
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
        let last_active = profile.last_active_at.as_ref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.naive_utc());

        sqlx::query(
            r#"
            INSERT INTO "habit_profiles" (
                "id", "userId", "preferredTimeSlots", "avgSessionDuration",
                "weeklyFrequency", "consistencyScore", "lastActiveAt", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT ("userId") DO UPDATE SET
                "preferredTimeSlots" = EXCLUDED."preferredTimeSlots",
                "avgSessionDuration" = EXCLUDED."avgSessionDuration",
                "weeklyFrequency" = EXCLUDED."weeklyFrequency",
                "consistencyScore" = EXCLUDED."consistencyScore",
                "lastActiveAt" = EXCLUDED."lastActiveAt",
                "updatedAt" = EXCLUDED."updatedAt"
            "#,
        )
        .bind(&profile.id)
        .bind(&profile.user_id)
        .bind(&profile.preferred_time_slots)
        .bind(profile.avg_session_duration)
        .bind(profile.weekly_frequency)
        .bind(profile.consistency_score)
        .bind(last_active)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn get_user_learning_profile(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Option<UserLearningProfile>, sqlx::Error> {
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
            r#"SELECT * FROM "user_learning_profiles" WHERE "userId" = ? LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_sqlite_user_learning_profile(&r)))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"SELECT * FROM "user_learning_profiles" WHERE "userId" = $1 LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_postgres_user_learning_profile(&r)))
    }
}

pub async fn upsert_user_learning_profile(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    profile: &UserLearningProfile,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::Value::String(profile.user_id.clone()));

        let mut create_data = serde_json::Map::new();
        create_data.insert("id".into(), serde_json::Value::String(profile.id.clone()));
        create_data.insert("userId".into(), serde_json::Value::String(profile.user_id.clone()));
        create_data.insert("learningSpeed".into(), serde_json::json!(profile.learning_speed));
        create_data.insert("retentionRate".into(), serde_json::json!(profile.retention_rate));
        create_data.insert("preferredDifficulty".into(), serde_json::json!(profile.preferred_difficulty));
        create_data.insert("optimalBatchSize".into(), serde_json::json!(profile.optimal_batch_size));
        create_data.insert("fatigueThreshold".into(), serde_json::json!(profile.fatigue_threshold));
        create_data.insert("recoveryRate".into(), serde_json::json!(profile.recovery_rate));
        create_data.insert("createdAt".into(), serde_json::Value::String(now_iso.clone()));
        create_data.insert("updatedAt".into(), serde_json::Value::String(now_iso.clone()));

        let mut update_data = serde_json::Map::new();
        update_data.insert("learningSpeed".into(), serde_json::json!(profile.learning_speed));
        update_data.insert("retentionRate".into(), serde_json::json!(profile.retention_rate));
        update_data.insert("preferredDifficulty".into(), serde_json::json!(profile.preferred_difficulty));
        update_data.insert("optimalBatchSize".into(), serde_json::json!(profile.optimal_batch_size));
        update_data.insert("fatigueThreshold".into(), serde_json::json!(profile.fatigue_threshold));
        update_data.insert("recoveryRate".into(), serde_json::json!(profile.recovery_rate));
        update_data.insert("updatedAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "user_learning_profiles".to_string(),
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
            INSERT INTO "user_learning_profiles" (
                "id", "userId", "learningSpeed", "retentionRate", "preferredDifficulty",
                "optimalBatchSize", "fatigueThreshold", "recoveryRate", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT ("userId") DO UPDATE SET
                "learningSpeed" = EXCLUDED."learningSpeed",
                "retentionRate" = EXCLUDED."retentionRate",
                "preferredDifficulty" = EXCLUDED."preferredDifficulty",
                "optimalBatchSize" = EXCLUDED."optimalBatchSize",
                "fatigueThreshold" = EXCLUDED."fatigueThreshold",
                "recoveryRate" = EXCLUDED."recoveryRate",
                "updatedAt" = EXCLUDED."updatedAt"
            "#,
        )
        .bind(&profile.id)
        .bind(&profile.user_id)
        .bind(profile.learning_speed)
        .bind(profile.retention_rate)
        .bind(profile.preferred_difficulty)
        .bind(profile.optimal_batch_size)
        .bind(profile.fatigue_threshold)
        .bind(profile.recovery_rate)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn insert_user_state_history(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    history: &UserStateHistory,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(history.id.clone()));
        data.insert("userId".into(), serde_json::Value::String(history.user_id.clone()));
        data.insert("stateSnapshot".into(), history.state_snapshot.clone());
        data.insert("triggerEvent".into(), serde_json::Value::String(history.trigger_event.clone()));
        data.insert("createdAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "user_state_history".to_string(),
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
            INSERT INTO "user_state_history" (
                "id", "userId", "stateSnapshot", "triggerEvent", "createdAt"
            ) VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(&history.id)
        .bind(&history.user_id)
        .bind(&history.state_snapshot)
        .bind(&history.trigger_event)
        .bind(now)
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn get_recent_user_state_history(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    limit: i64,
) -> Result<Vec<UserStateHistory>, sqlx::Error> {
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
            SELECT * FROM "user_state_history"
            WHERE "userId" = ?
            ORDER BY "createdAt" DESC
            LIMIT ?
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_sqlite_user_state_history).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT * FROM "user_state_history"
            WHERE "userId" = $1
            ORDER BY "createdAt" DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_postgres_user_state_history).collect())
    }
}

fn map_postgres_habit_profile(row: &sqlx::postgres::PgRow) -> HabitProfile {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let last_active_at: Option<NaiveDateTime> = row.try_get("lastActiveAt").ok();
    HabitProfile {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        preferred_time_slots: row.try_get("preferredTimeSlots").unwrap_or(serde_json::Value::Array(vec![])),
        avg_session_duration: row.try_get("avgSessionDuration").unwrap_or(0),
        weekly_frequency: row.try_get("weeklyFrequency").unwrap_or(0),
        consistency_score: row.try_get("consistencyScore").unwrap_or(0.0),
        last_active_at: last_active_at.map(format_naive_iso),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_sqlite_habit_profile(row: &sqlx::sqlite::SqliteRow) -> HabitProfile {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();
    let last_active_raw: Option<String> = row.try_get("lastActiveAt").ok();
    let slots_raw: String = row.try_get("preferredTimeSlots").unwrap_or_default();
    HabitProfile {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        preferred_time_slots: serde_json::from_str(&slots_raw).unwrap_or(serde_json::Value::Array(vec![])),
        avg_session_duration: row.try_get("avgSessionDuration").unwrap_or(0),
        weekly_frequency: row.try_get("weeklyFrequency").unwrap_or(0),
        consistency_score: row.try_get("consistencyScore").unwrap_or(0.0),
        last_active_at: last_active_raw.as_ref().map(|s| format_sqlite_datetime(s)),
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
    }
}

fn map_postgres_user_learning_profile(row: &sqlx::postgres::PgRow) -> UserLearningProfile {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    UserLearningProfile {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        learning_speed: row.try_get("learningSpeed").unwrap_or(1.0),
        retention_rate: row.try_get("retentionRate").unwrap_or(0.8),
        preferred_difficulty: row.try_get("preferredDifficulty").unwrap_or(0.5),
        optimal_batch_size: row.try_get("optimalBatchSize").unwrap_or(10),
        fatigue_threshold: row.try_get("fatigueThreshold").unwrap_or(0.7),
        recovery_rate: row.try_get("recoveryRate").unwrap_or(0.1),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_sqlite_user_learning_profile(row: &sqlx::sqlite::SqliteRow) -> UserLearningProfile {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();
    UserLearningProfile {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        learning_speed: row.try_get("learningSpeed").unwrap_or(1.0),
        retention_rate: row.try_get("retentionRate").unwrap_or(0.8),
        preferred_difficulty: row.try_get("preferredDifficulty").unwrap_or(0.5),
        optimal_batch_size: row.try_get("optimalBatchSize").unwrap_or(10),
        fatigue_threshold: row.try_get("fatigueThreshold").unwrap_or(0.7),
        recovery_rate: row.try_get("recoveryRate").unwrap_or(0.1),
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
    }
}

fn map_postgres_user_state_history(row: &sqlx::postgres::PgRow) -> UserStateHistory {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    UserStateHistory {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        state_snapshot: row.try_get("stateSnapshot").unwrap_or(serde_json::Value::Null),
        trigger_event: row.try_get("triggerEvent").unwrap_or_default(),
        created_at: format_naive_iso(created_at),
    }
}

fn map_sqlite_user_state_history(row: &sqlx::sqlite::SqliteRow) -> UserStateHistory {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let snapshot_raw: String = row.try_get("stateSnapshot").unwrap_or_default();
    UserStateHistory {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        state_snapshot: serde_json::from_str(&snapshot_raw).unwrap_or(serde_json::Value::Null),
        trigger_event: row.try_get("triggerEvent").unwrap_or_default(),
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
