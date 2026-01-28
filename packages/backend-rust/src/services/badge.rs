use std::collections::{HashMap, HashSet};

use chrono::{Duration, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BadgeCategory {
    Streak,
    Accuracy,
    Learning,
    Cognitive,
    Session,
}

impl BadgeCategory {
    pub fn parse(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "ACCURACY" => Self::Accuracy,
            "LEARNING" => Self::Learning,
            "COGNITIVE" => Self::Cognitive,
            "SESSION" => Self::Session,
            _ => Self::Streak,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BadgeConditionType {
    Streak,
    Accuracy,
    WordsLearned,
    CognitiveImprovement,
    TotalSessions,
}

impl BadgeConditionType {
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "accuracy" => Self::Accuracy,
            "words_learned" => Self::WordsLearned,
            "cognitive_improvement" => Self::CognitiveImprovement,
            "total_sessions" => Self::TotalSessions,
            _ => Self::Streak,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeCondition {
    #[serde(rename = "type")]
    pub condition_type: String,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserBadge {
    pub id: String,
    pub badge_id: String,
    pub name: String,
    pub description: String,
    pub icon_url: String,
    pub category: String,
    pub tier: i64,
    pub unlocked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeDetails {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_url: String,
    pub category: String,
    pub tier: i64,
    pub condition: BadgeCondition,
    pub unlocked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlocked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeProgress {
    pub badge_id: String,
    pub current_value: f64,
    pub target_value: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBadgeResult {
    pub badge: UserBadge,
    pub is_new: bool,
    pub unlocked_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct CognitiveImprovementData {
    pub memory: f64,
    pub speed: f64,
    pub stability: f64,
    pub has_data: bool,
}

#[derive(Debug, Clone, Default)]
pub struct UserStats {
    pub consecutive_days: i64,
    pub total_words_learned: i64,
    pub total_sessions: i64,
    pub recent_accuracy: f64,
    pub cognitive_improvement: CognitiveImprovementData,
}

pub async fn get_user_badges(pool: &PgPool, user_id: &str) -> Result<Vec<UserBadge>, String> {
    let rows = sqlx::query(
        r#"SELECT ub."id", ub."badgeId", ub."tier", ub."unlockedAt",
           b."name", b."description", b."iconUrl", b."category"::text
           FROM "user_badges" ub
           JOIN "badge_definitions" b ON ub."badgeId" = b."id"
           WHERE ub."userId" = $1 ORDER BY ub."unlockedAt" DESC"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows
        .iter()
        .map(|row| {
            let unlocked_at: NaiveDateTime = row
                .try_get("unlockedAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            UserBadge {
                id: row.try_get("id").unwrap_or_default(),
                badge_id: row.try_get("badgeId").unwrap_or_default(),
                name: row.try_get("name").unwrap_or_default(),
                description: row.try_get("description").unwrap_or_default(),
                icon_url: row.try_get("iconUrl").unwrap_or_default(),
                category: row
                    .try_get("category")
                    .unwrap_or_else(|_| "STREAK".to_string()),
                tier: row.try_get("tier").unwrap_or(1),
                unlocked_at: chrono::DateTime::<Utc>::from_naive_utc_and_offset(unlocked_at, Utc)
                    .to_rfc3339(),
            }
        })
        .collect())
}

pub async fn check_and_award_badges(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<NewBadgeResult>, String> {
    let pool = proxy.pool();
    let stats = get_user_stats(pool, user_id).await?;
    let all_badges = get_all_badge_definitions(pool).await?;
    let existing = get_existing_badge_keys(pool, user_id).await?;

    let mut new_badges = Vec::new();
    let now = Utc::now();
    let now_str = now.to_rfc3339();

    for badge in all_badges {
        let badge_key = format!("{}:{}", badge.id, badge.tier);
        if existing.contains(&badge_key) {
            continue;
        }

        if check_badge_eligibility(&badge.condition, &stats) {
            let user_badge_id = uuid::Uuid::new_v4().to_string();

            sqlx::query(
                r#"INSERT INTO "user_badges" ("id","userId","badgeId","tier","unlockedAt")
                   VALUES ($1,$2,$3,$4,NOW())"#,
            )
            .bind(&user_badge_id)
            .bind(user_id)
            .bind(&badge.id)
            .bind(badge.tier)
            .execute(pool)
            .await
            .map_err(|e| format!("写入失败: {e}"))?;

            new_badges.push(NewBadgeResult {
                badge: UserBadge {
                    id: user_badge_id,
                    badge_id: badge.id.clone(),
                    name: badge.name.clone(),
                    description: badge.description.clone(),
                    icon_url: badge.icon_url.clone(),
                    category: badge.category.clone(),
                    tier: badge.tier,
                    unlocked_at: now_str.clone(),
                },
                is_new: true,
                unlocked_at: now_str.clone(),
            });
        }
    }

    Ok(new_badges)
}

pub async fn get_badge_details(
    pool: &PgPool,
    badge_id: &str,
    user_id: Option<&str>,
) -> Result<Option<BadgeDetails>, String> {
    let badge = get_badge_definition(pool, badge_id).await?;
    let Some(badge) = badge else { return Ok(None) };

    let (unlocked, unlocked_at) = if let Some(uid) = user_id {
        check_user_has_badge(pool, uid, badge_id).await?
    } else {
        (false, None)
    };

    Ok(Some(BadgeDetails {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon_url: badge.icon_url,
        category: badge.category,
        tier: badge.tier,
        condition: badge.condition,
        unlocked,
        unlocked_at,
        progress: None,
    }))
}

pub async fn get_badge_progress(
    pool: &PgPool,
    user_id: &str,
    badge_id: &str,
) -> Result<Option<BadgeProgress>, String> {
    let badge = get_badge_definition(pool, badge_id).await?;
    let Some(badge) = badge else { return Ok(None) };

    let stats = get_user_stats(pool, user_id).await?;
    let current_value = get_current_value_for_condition(&badge.condition, &stats);
    let target_value = badge.condition.value;
    let percentage = (current_value / target_value * 100.0).min(100.0);

    Ok(Some(BadgeProgress {
        badge_id: badge_id.to_string(),
        current_value,
        target_value,
        percentage,
    }))
}

pub async fn get_all_badges_with_status(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<BadgeDetails>, String> {
    let all_badges = get_all_badge_definitions(pool).await?;
    let user_badges = get_user_badge_map(pool, user_id).await?;
    let stats = get_user_stats(pool, user_id).await?;

    Ok(all_badges
        .into_iter()
        .map(|badge| {
            let badge_key = format!("{}:{}", badge.id, badge.tier);
            let unlocked_at = user_badges.get(&badge_key).cloned();
            let is_unlocked = unlocked_at.is_some();

            let progress = if is_unlocked {
                Some(100)
            } else {
                let current = get_current_value_for_condition(&badge.condition, &stats);
                let target = badge.condition.value;
                Some(((current / target * 100.0).min(100.0).round()) as i64)
            };

            BadgeDetails {
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon_url: badge.icon_url,
                category: badge.category,
                tier: badge.tier,
                condition: badge.condition,
                unlocked: is_unlocked,
                unlocked_at,
                progress,
            }
        })
        .collect())
}

async fn get_all_badge_definitions(pool: &PgPool) -> Result<Vec<BadgeDetails>, String> {
    let rows = sqlx::query(
        r#"SELECT "id","name","description","iconUrl","category"::text,"tier","condition"
           FROM "badge_definitions" ORDER BY "category","tier""#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows
        .iter()
        .map(|row| {
            let condition_raw: serde_json::Value = row
                .try_get("condition")
                .unwrap_or(serde_json::json!({"type":"streak","value":1}));
            BadgeDetails {
                id: row.try_get("id").unwrap_or_default(),
                name: row.try_get("name").unwrap_or_default(),
                description: row.try_get("description").unwrap_or_default(),
                icon_url: row.try_get("iconUrl").unwrap_or_default(),
                category: row
                    .try_get("category")
                    .unwrap_or_else(|_| "STREAK".to_string()),
                tier: row.try_get("tier").unwrap_or(1),
                condition: serde_json::from_value(condition_raw).unwrap_or(BadgeCondition {
                    condition_type: "streak".to_string(),
                    value: 1.0,
                    params: None,
                }),
                unlocked: false,
                unlocked_at: None,
                progress: None,
            }
        })
        .collect())
}

async fn get_badge_definition(
    pool: &PgPool,
    badge_id: &str,
) -> Result<Option<BadgeDetails>, String> {
    let row = sqlx::query(
        r#"SELECT "id","name","description","iconUrl","category"::text,"tier","condition"
           FROM "badge_definitions" WHERE "id" = $1"#,
    )
    .bind(badge_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(row.map(|r| {
        let condition_raw: serde_json::Value = r
            .try_get("condition")
            .unwrap_or(serde_json::json!({"type":"streak","value":1}));
        BadgeDetails {
            id: r.try_get("id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            description: r.try_get("description").unwrap_or_default(),
            icon_url: r.try_get("iconUrl").unwrap_or_default(),
            category: r
                .try_get("category")
                .unwrap_or_else(|_| "STREAK".to_string()),
            tier: r.try_get("tier").unwrap_or(1),
            condition: serde_json::from_value(condition_raw).unwrap_or(BadgeCondition {
                condition_type: "streak".to_string(),
                value: 1.0,
                params: None,
            }),
            unlocked: false,
            unlocked_at: None,
            progress: None,
        }
    }))
}

async fn get_existing_badge_keys(pool: &PgPool, user_id: &str) -> Result<HashSet<String>, String> {
    let rows = sqlx::query(r#"SELECT "badgeId","tier" FROM "user_badges" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows
        .iter()
        .map(|r| {
            let badge_id: String = r.try_get("badgeId").unwrap_or_default();
            let tier: i64 = r.try_get("tier").unwrap_or(1);
            format!("{badge_id}:{tier}")
        })
        .collect())
}

async fn get_user_badge_map(
    pool: &PgPool,
    user_id: &str,
) -> Result<HashMap<String, String>, String> {
    let rows = sqlx::query(
        r#"SELECT "badgeId","tier","unlockedAt" FROM "user_badges" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows
        .iter()
        .map(|r| {
            let badge_id: String = r.try_get("badgeId").unwrap_or_default();
            let tier: i64 = r.try_get("tier").unwrap_or(1);
            let unlocked_at: NaiveDateTime = r
                .try_get("unlockedAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            (
                format!("{badge_id}:{tier}"),
                chrono::DateTime::<Utc>::from_naive_utc_and_offset(unlocked_at, Utc).to_rfc3339(),
            )
        })
        .collect())
}

async fn check_user_has_badge(
    pool: &PgPool,
    user_id: &str,
    badge_id: &str,
) -> Result<(bool, Option<String>), String> {
    let row = sqlx::query(
        r#"SELECT "unlockedAt" FROM "user_badges" WHERE "userId" = $1 AND "badgeId" = $2 LIMIT 1"#,
    )
    .bind(user_id)
    .bind(badge_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(row
        .map(|r| {
            let unlocked_at: NaiveDateTime = r
                .try_get("unlockedAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            (
                true,
                Some(
                    chrono::DateTime::<Utc>::from_naive_utc_and_offset(unlocked_at, Utc)
                        .to_rfc3339(),
                ),
            )
        })
        .unwrap_or((false, None)))
}

async fn get_user_stats(pool: &PgPool, user_id: &str) -> Result<UserStats, String> {
    let consecutive_days = calculate_consecutive_days(pool, user_id).await?;
    let total_words_learned = calculate_total_words_learned(pool, user_id).await?;
    let total_sessions = calculate_total_sessions(pool, user_id).await?;
    let recent_accuracy = calculate_recent_accuracy(pool, user_id).await?;
    let cognitive_improvement = calculate_cognitive_improvement(pool, user_id).await?;

    Ok(UserStats {
        consecutive_days,
        total_words_learned,
        total_sessions,
        recent_accuracy,
        cognitive_improvement,
    })
}

fn check_badge_eligibility(condition: &BadgeCondition, stats: &UserStats) -> bool {
    let ctype = BadgeConditionType::parse(&condition.condition_type);
    match ctype {
        BadgeConditionType::Streak => stats.consecutive_days >= condition.value as i64,
        BadgeConditionType::Accuracy => {
            let min_words = condition
                .params
                .as_ref()
                .and_then(|p| p.get("minWords"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            if min_words > 0 && stats.total_words_learned < min_words {
                return false;
            }
            stats.recent_accuracy >= condition.value
        }
        BadgeConditionType::WordsLearned => stats.total_words_learned >= condition.value as i64,
        BadgeConditionType::TotalSessions => stats.total_sessions >= condition.value as i64,
        BadgeConditionType::CognitiveImprovement => check_cognitive_improvement(condition, stats),
    }
}

fn check_cognitive_improvement(condition: &BadgeCondition, stats: &UserStats) -> bool {
    if !stats.cognitive_improvement.has_data {
        return false;
    }

    let metric = condition
        .params
        .as_ref()
        .and_then(|p| p.get("metric"))
        .and_then(|v| v.as_str())
        .unwrap_or("all");
    let threshold = condition.value;

    match metric {
        "all" => {
            stats.cognitive_improvement.memory >= threshold
                && stats.cognitive_improvement.speed >= threshold
                && stats.cognitive_improvement.stability >= threshold
        }
        "memory" => stats.cognitive_improvement.memory >= threshold,
        "speed" => stats.cognitive_improvement.speed >= threshold,
        "stability" => stats.cognitive_improvement.stability >= threshold,
        _ => false,
    }
}

fn get_current_value_for_condition(condition: &BadgeCondition, stats: &UserStats) -> f64 {
    let ctype = BadgeConditionType::parse(&condition.condition_type);
    match ctype {
        BadgeConditionType::Streak => stats.consecutive_days as f64,
        BadgeConditionType::Accuracy => stats.recent_accuracy,
        BadgeConditionType::WordsLearned => stats.total_words_learned as f64,
        BadgeConditionType::TotalSessions => stats.total_sessions as f64,
        BadgeConditionType::CognitiveImprovement => {
            let metric = condition
                .params
                .as_ref()
                .and_then(|p| p.get("metric"))
                .and_then(|v| v.as_str())
                .unwrap_or("all");
            match metric {
                "all" => stats
                    .cognitive_improvement
                    .memory
                    .min(stats.cognitive_improvement.speed)
                    .min(stats.cognitive_improvement.stability),
                "memory" => stats.cognitive_improvement.memory,
                "speed" => stats.cognitive_improvement.speed,
                "stability" => stats.cognitive_improvement.stability,
                _ => 0.0,
            }
        }
    }
}

async fn calculate_consecutive_days(pool: &PgPool, user_id: &str) -> Result<i64, String> {
    let rows = sqlx::query(
        r#"SELECT DISTINCT DATE("timestamp") as d FROM "answer_records" WHERE "userId" = $1 ORDER BY d DESC"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let dates: Vec<String> = rows
        .iter()
        .filter_map(|r| {
            r.try_get::<chrono::NaiveDate, _>("d")
                .ok()
                .map(|d| d.to_string())
        })
        .collect();

    if dates.is_empty() {
        return Ok(0);
    }

    let today = Utc::now().date_naive().to_string();
    let yesterday = (Utc::now() - Duration::days(1)).date_naive().to_string();

    if dates[0] != today && dates[0] != yesterday {
        return Ok(0);
    }

    let mut consecutive = 1i64;
    for i in 1..dates.len() {
        let current = chrono::NaiveDate::parse_from_str(&dates[i - 1], "%Y-%m-%d").ok();
        let prev = chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d").ok();

        if let (Some(c), Some(p)) = (current, prev) {
            if (c - p).num_days() == 1 {
                consecutive += 1;
            } else {
                break;
            }
        }
    }

    Ok(consecutive)
}

async fn calculate_total_words_learned(pool: &PgPool, user_id: &str) -> Result<i64, String> {
    sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "word_learning_states" WHERE "userId" = $1 AND "reviewCount" > 0"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))
}

async fn calculate_total_sessions(pool: &PgPool, user_id: &str) -> Result<i64, String> {
    let rows = sqlx::query(r#"SELECT DISTINCT "sessionId" FROM "answer_records" WHERE "userId" = $1 AND "sessionId" IS NOT NULL"#)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询失败: {e}"))?;
    Ok(rows.len() as i64)
}

async fn calculate_recent_accuracy(pool: &PgPool, user_id: &str) -> Result<f64, String> {
    let rows = sqlx::query(r#"SELECT "isCorrect" FROM "answer_records" WHERE "userId" = $1 ORDER BY "timestamp" DESC LIMIT 50"#)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询失败: {e}"))?;

    if rows.is_empty() {
        return Ok(0.0);
    }

    let correct = rows
        .iter()
        .filter(|r| r.try_get::<bool, _>("isCorrect").unwrap_or(false))
        .count();
    Ok(correct as f64 / rows.len() as f64)
}

async fn calculate_cognitive_improvement(
    pool: &PgPool,
    user_id: &str,
) -> Result<CognitiveImprovementData, String> {
    let thirty_days_ago = (Utc::now() - Duration::days(30)).naive_utc();

    let past = sqlx::query(
        r#"SELECT "memory","speed","stability" FROM "user_state_history" WHERE "userId" = $1 AND "date" <= $2 ORDER BY "date" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .bind(thirty_days_ago.date())
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let current = sqlx::query(
        r#"SELECT "memory","speed","stability" FROM "user_state_history" WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let (Some(past), Some(current)) = (past, current) else {
        return Ok(CognitiveImprovementData::default());
    };

    Ok(CognitiveImprovementData {
        memory: current.try_get::<f64, _>("memory").unwrap_or(0.0)
            - past.try_get::<f64, _>("memory").unwrap_or(0.0),
        speed: current.try_get::<f64, _>("speed").unwrap_or(0.0)
            - past.try_get::<f64, _>("speed").unwrap_or(0.0),
        stability: current.try_get::<f64, _>("stability").unwrap_or(0.0)
            - past.try_get::<f64, _>("stability").unwrap_or(0.0),
        has_data: true,
    })
}
