use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

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
    let row = sqlx::query!(r#"SELECT * FROM "user_learning_profiles" WHERE "userId" = $1 LIMIT 1"#, user_id)
        .fetch_optional(proxy.pool())
        .await?;
    Ok(row.map(|r| UserLearningProfile {
        id: r.id.to_string(),
        user_id: r.userId.clone(),
        learning_speed: r.learningSpeed.unwrap_or(1.0),
        retention_rate: r.retentionRate.unwrap_or(0.8),
        preferred_difficulty: r.preferredDifficulty.unwrap_or(0.5),
        optimal_batch_size: r.optimalBatchSize.unwrap_or(10),
        fatigue_threshold: r.fatigueThreshold.unwrap_or(0.7),
        recovery_rate: r.recoveryRate.unwrap_or(0.1),
        created_at: format_naive_iso(r.createdAt),
        updated_at: format_naive_iso(r.updatedAt),
    }))
}

pub async fn upsert_user_learning_profile(
    proxy: &DatabaseProxy,
    profile: &UserLearningProfile,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query!(
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
        profile.id,
        profile.user_id,
        profile.learning_speed,
        profile.retention_rate,
        profile.preferred_difficulty,
        profile.optimal_batch_size,
        profile.fatigue_threshold,
        profile.recovery_rate,
        now,
        now,
    )
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_user_state_history(
    proxy: &DatabaseProxy,
    history: &UserStateHistory,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query!(
        r#"
        INSERT INTO "user_state_history" (
            "id", "userId", "stateSnapshot", "triggerEvent", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5)
        "#,
        history.id,
        history.user_id,
        history.state_snapshot,
        history.trigger_event,
        now,
    )
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_recent_user_state_history(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<UserStateHistory>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT * FROM "user_state_history"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
        "#,
        user_id,
        limit,
    )
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(|r| UserStateHistory {
        id: r.id.to_string(),
        user_id: r.userId.clone(),
        state_snapshot: r.stateSnapshot.clone().unwrap_or(serde_json::Value::Null),
        trigger_event: r.triggerEvent.clone().unwrap_or_default(),
        created_at: format_naive_iso(r.createdAt),
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
    sqlx::query!(
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
        id,
        user_id,
        pronunciation_clicks,
        pause_count,
        page_switch_count,
        total_interactions,
        now,
    )
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
    sqlx::query!(
        r#"
        INSERT INTO "password_reset_tokens" ("id", "userId", "token", "expiresAt")
        VALUES ($1, $2, $3, $4)
        "#,
        id,
        user_id,
        token,
        expires_at,
    )
    .execute(proxy.pool())
    .await?;
    Ok(id)
}

pub async fn get_valid_password_reset_token(
    proxy: &DatabaseProxy,
    token: &str,
) -> Result<Option<PasswordResetToken>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT * FROM "password_reset_tokens"
        WHERE "token" = $1 AND "used" = FALSE AND "expiresAt" > NOW()
        LIMIT 1
        "#,
        token,
    )
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| PasswordResetToken {
        id: r.id.to_string(),
        user_id: r.userId.clone(),
        token: r.token.clone(),
        expires_at: format_naive_iso(r.expiresAt),
        used: r.used.unwrap_or(false),
        created_at: format_naive_iso(r.createdAt),
    }))
}

pub async fn mark_password_reset_token_used(
    proxy: &DatabaseProxy,
    token_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(r#"UPDATE "password_reset_tokens" SET "used" = TRUE WHERE "id" = $1"#, token_id)
        .execute(proxy.pool())
        .await?;
    Ok(())
}

pub async fn get_user_interaction_stats(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<UserInteractionStats>, sqlx::Error> {
    let row = sqlx::query!(r#"SELECT * FROM "user_interaction_stats" WHERE "userId" = $1 LIMIT 1"#, user_id)
        .fetch_optional(proxy.pool())
        .await?;
    Ok(row.map(|r| UserInteractionStats {
        id: r.id.to_string(),
        user_id: r.userId.clone(),
        pronunciation_clicks: r.pronunciationClicks.unwrap_or(0),
        pause_count: r.pauseCount.unwrap_or(0),
        page_switch_count: r.pageSwitchCount.unwrap_or(0),
        total_interactions: r.totalInteractions.unwrap_or(0),
        total_session_duration: r.totalSessionDuration.unwrap_or(0),
        created_at: format_naive_iso(r.createdAt),
        updated_at: format_naive_iso(r.updatedAt),
    }))
}
