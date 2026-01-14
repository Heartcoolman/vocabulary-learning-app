use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordResetToken {
    pub id: String,
    pub user_id: String,
    pub token: String,
    pub expires_at: String,
    pub used: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInteractionStats {
    pub id: String,
    pub user_id: String,
    pub pronunciation_clicks: i32,
    pub pause_count: i32,
    pub page_switch_count: i32,
    pub total_interactions: i32,
    pub total_session_duration: i64,
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

pub async fn get_user_learning_profile(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<UserLearningProfile>, sqlx::Error> {
    let row = sqlx::query(r#"SELECT * FROM "user_learning_profiles" WHERE "userId" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(proxy.pool())
        .await?;
    Ok(row.map(|r| {
        let created_at: NaiveDateTime = r.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
        let updated_at: NaiveDateTime = r.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
        UserLearningProfile {
            id: r.try_get("id").unwrap_or_default(),
            user_id: r.try_get("userId").unwrap_or_default(),
            learning_speed: r.try_get("learningSpeed").unwrap_or(1.0),
            retention_rate: r.try_get("retentionRate").unwrap_or(0.8),
            preferred_difficulty: r.try_get("preferredDifficulty").unwrap_or(0.5),
            optimal_batch_size: r.try_get("optimalBatchSize").unwrap_or(10),
            fatigue_threshold: r.try_get("fatigueThreshold").unwrap_or(0.7),
            recovery_rate: r.try_get("recoveryRate").unwrap_or(0.1),
            created_at: format_naive_iso(created_at),
            updated_at: format_naive_iso(updated_at),
        }
    }))
}

pub async fn upsert_user_learning_profile(
    proxy: &DatabaseProxy,
    profile: &UserLearningProfile,
) -> Result<(), sqlx::Error> {
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
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_user_state_history(
    proxy: &DatabaseProxy,
    history: &UserStateHistory,
) -> Result<(), sqlx::Error> {
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
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_recent_user_state_history(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<UserStateHistory>, sqlx::Error> {
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
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(|r| {
        let created_at: NaiveDateTime = r.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
        UserStateHistory {
            id: r.try_get("id").unwrap_or_default(),
            user_id: r.try_get("userId").unwrap_or_default(),
            state_snapshot: r.try_get("stateSnapshot").unwrap_or(serde_json::Value::Null),
            trigger_event: r.try_get("triggerEvent").unwrap_or_default(),
            created_at: format_naive_iso(created_at),
        }
    }).collect())
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub async fn upsert_user_interaction_stats(
    proxy: &DatabaseProxy,
    user_id: &str,
    pronunciation_clicks: i32,
    pause_count: i32,
    page_switch_count: i32,
    total_interactions: i32,
) -> Result<(), sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "user_interaction_stats" (
            "id", "userId", "pronunciationClicks", "pauseCount", "pageSwitchCount",
            "totalInteractions", "totalSessionDuration", "lastActivityTime",
            "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7, $7)
        ON CONFLICT ("userId") DO UPDATE SET
            "pronunciationClicks" = "user_interaction_stats"."pronunciationClicks" + EXCLUDED."pronunciationClicks",
            "pauseCount" = "user_interaction_stats"."pauseCount" + EXCLUDED."pauseCount",
            "pageSwitchCount" = "user_interaction_stats"."pageSwitchCount" + EXCLUDED."pageSwitchCount",
            "totalInteractions" = "user_interaction_stats"."totalInteractions" + EXCLUDED."totalInteractions",
            "lastActivityTime" = EXCLUDED."lastActivityTime",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(pronunciation_clicks)
    .bind(pause_count)
    .bind(page_switch_count)
    .bind(total_interactions)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn create_password_reset_token(
    proxy: &DatabaseProxy,
    user_id: &str,
    token: &str,
    expires_at: NaiveDateTime,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO "password_reset_tokens" ("id", "userId", "token", "expiresAt")
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(token)
    .bind(expires_at)
    .execute(proxy.pool())
    .await?;
    Ok(id)
}

pub async fn get_valid_password_reset_token(
    proxy: &DatabaseProxy,
    token: &str,
) -> Result<Option<PasswordResetToken>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT * FROM "password_reset_tokens"
        WHERE "token" = $1 AND "used" = FALSE AND "expiresAt" > NOW()
        LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| {
        let expires_at: NaiveDateTime = r.try_get("expiresAt").unwrap_or_else(|_| Utc::now().naive_utc());
        let created_at: NaiveDateTime = r.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
        PasswordResetToken {
            id: r.try_get("id").unwrap_or_default(),
            user_id: r.try_get("userId").unwrap_or_default(),
            token: r.try_get("token").unwrap_or_default(),
            expires_at: format_naive_iso(expires_at),
            used: r.try_get("used").unwrap_or(false),
            created_at: format_naive_iso(created_at),
        }
    }))
}

pub async fn mark_password_reset_token_used(
    proxy: &DatabaseProxy,
    token_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "password_reset_tokens" SET "used" = TRUE WHERE "id" = $1"#)
        .bind(token_id)
        .execute(proxy.pool())
        .await?;
    Ok(())
}

pub async fn get_user_interaction_stats(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<UserInteractionStats>, sqlx::Error> {
    let row = sqlx::query(r#"SELECT * FROM "user_interaction_stats" WHERE "userId" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(proxy.pool())
        .await?;
    Ok(row.map(|r| {
        let created_at: NaiveDateTime = r.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
        let updated_at: NaiveDateTime = r.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
        UserInteractionStats {
            id: r.try_get("id").unwrap_or_default(),
            user_id: r.try_get("userId").unwrap_or_default(),
            pronunciation_clicks: r.try_get("pronunciationClicks").unwrap_or(0),
            pause_count: r.try_get("pauseCount").unwrap_or(0),
            page_switch_count: r.try_get("pageSwitchCount").unwrap_or(0),
            total_interactions: r.try_get("totalInteractions").unwrap_or(0),
            total_session_duration: r.try_get("totalSessionDuration").unwrap_or(0),
            created_at: format_naive_iso(created_at),
            updated_at: format_naive_iso(updated_at),
        }
    }))
}
