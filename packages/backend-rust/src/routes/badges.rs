use std::collections::{BTreeMap, HashMap, HashSet};

use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Duration, NaiveDate, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct MessageResponse<T> {
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserBadgeDto {
    id: String,
    badge_id: String,
    name: String,
    description: String,
    icon_url: String,
    category: String,
    tier: i64,
    unlocked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserBadgesData {
    badges: Vec<UserBadgeDto>,
    count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct BadgeCondition {
    #[serde(rename = "type")]
    r#type: String,
    value: f64,
    #[serde(default)]
    params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BadgeDetailsDto {
    id: String,
    name: String,
    description: String,
    icon_url: String,
    category: String,
    tier: i64,
    condition: BadgeCondition,
    unlocked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    unlocked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AllBadgesData {
    badges: Vec<BadgeDetailsDto>,
    grouped: BTreeMap<String, Vec<BadgeDetailsDto>>,
    total_count: usize,
    unlocked_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BadgeProgressDto {
    badge_id: String,
    current_value: f64,
    target_value: f64,
    percentage: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NewBadgeResult {
    badge: UserBadgeDto,
    is_new: bool,
    unlocked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckBadgesData {
    new_badges: Vec<NewBadgeResult>,
    has_new_badges: bool,
    message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_user_badges))
        .route("/all", get(get_all_badges))
        .route("/check", post(check_and_award_badges))
        .route("/:id", get(get_badge_detail))
        .route("/:id/progress", get(get_badge_progress))
}

async fn get_user_badges(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let badges = select_user_badges(proxy.as_ref(), &user.id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: UserBadgesData {
            count: badges.len(),
            badges,
        },
    }))
}

async fn get_all_badges(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let badge_defs = select_badge_definitions(proxy.as_ref()).await?;
    let unlocked = select_user_badge_unlocks(proxy.as_ref(), &user.id).await?;
    let stats = compute_user_badge_stats(proxy.as_ref(), &user.id).await?;

    let mut badges: Vec<BadgeDetailsDto> = Vec::with_capacity(badge_defs.len());
    for def in badge_defs {
        let key = format!("{}:{}", def.id, def.tier);
        let unlocked_at = unlocked.get(&key).cloned();
        let condition = def.condition.unwrap_or_else(|| BadgeCondition {
            r#type: "streak".to_string(),
            value: 1.0,
            params: None,
        });
        let unlocked_flag = unlocked_at.is_some();
        let progress = if unlocked_flag {
            Some(100)
        } else {
            let current = current_value_for_condition(&condition, &stats);
            let pct = if condition.value > 0.0 {
                ((current / condition.value) * 100.0).round().clamp(0.0, 100.0)
            } else {
                0.0
            };
            Some(pct as i64)
        };
        badges.push(BadgeDetailsDto {
            id: def.id,
            name: def.name,
            description: def.description,
            icon_url: def.icon_url,
            category: def.category.clone(),
            tier: def.tier,
            condition,
            unlocked: unlocked_flag,
            unlocked_at,
            progress,
        });
    }

    let unlocked_count = badges.iter().filter(|b| b.unlocked).count();
    let mut grouped: BTreeMap<String, Vec<BadgeDetailsDto>> = BTreeMap::new();
    for badge in &badges {
        grouped
            .entry(badge.category.clone())
            .or_default()
            .push(badge.clone());
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: AllBadgesData {
            total_count: badges.len(),
            unlocked_count,
            grouped,
            badges,
        },
    }))
}

async fn get_badge_detail(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<axum::response::Response, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let Some(def) = select_badge_definition(proxy.as_ref(), &id).await? else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(MessageResponse::<serde_json::Value> {
                success: false,
                message: "徽章不存在".to_string(),
                data: None,
            }),
        )
            .into_response());
    };

    let unlocked = select_user_badge_unlocks(proxy.as_ref(), &user.id).await?;
    let key = format!("{}:{}", def.id, def.tier);
    let unlocked_at = unlocked.get(&key).cloned();
    let stats = compute_user_badge_stats(proxy.as_ref(), &user.id).await?;
    let condition = def.condition.unwrap_or_else(|| BadgeCondition {
        r#type: "streak".to_string(),
        value: 1.0,
        params: None,
    });
    let unlocked_flag = unlocked_at.is_some();
    let progress = if unlocked_flag {
        Some(100)
    } else {
        let current = current_value_for_condition(&condition, &stats);
        let pct = if condition.value > 0.0 {
            ((current / condition.value) * 100.0).round().clamp(0.0, 100.0)
        } else {
            0.0
        };
        Some(pct as i64)
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: BadgeDetailsDto {
            id: def.id,
            name: def.name,
            description: def.description,
            icon_url: def.icon_url,
            category: def.category,
            tier: def.tier,
            condition,
            unlocked: unlocked_flag,
            unlocked_at,
            progress,
        },
    })
    .into_response())
}

async fn get_badge_progress(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<axum::response::Response, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let Some(def) = select_badge_definition(proxy.as_ref(), &id).await? else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(MessageResponse::<serde_json::Value> {
                success: false,
                message: "徽章不存在".to_string(),
                data: None,
            }),
        )
            .into_response());
    };

    let stats = compute_user_badge_stats(proxy.as_ref(), &user.id).await?;
    let condition = def.condition.unwrap_or_else(|| BadgeCondition {
        r#type: "streak".to_string(),
        value: 1.0,
        params: None,
    });
    let current_value = current_value_for_condition(&condition, &stats);
    let percentage = if condition.value > 0.0 {
        (current_value / condition.value * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: BadgeProgressDto {
            badge_id: def.id,
            current_value,
            target_value: condition.value,
            percentage,
        },
    })
    .into_response())
}

async fn check_and_award_badges(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let badge_defs = select_badge_definitions(proxy.as_ref()).await?;
    let unlocked = select_user_badge_unlocks(proxy.as_ref(), &user.id).await?;
    let stats = compute_user_badge_stats(proxy.as_ref(), &user.id).await?;

    let mut new_badges: Vec<NewBadgeResult> = Vec::new();
    for def in badge_defs {
        let key = format!("{}:{}", def.id, def.tier);
        if unlocked.contains_key(&key) {
            continue;
        }

        let condition = def.condition.unwrap_or_else(|| BadgeCondition {
            r#type: "streak".to_string(),
            value: 1.0,
            params: None,
        });
        if !is_condition_met(&condition, &stats) {
            continue;
        }

        let user_badge_id = Uuid::new_v4().to_string();
        let unlocked_at = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        upsert_user_badge(
            proxy.as_ref(),
            &user.id,
            &user_badge_id,
            &def.id,
            def.tier,
            &unlocked_at,
        )
        .await?;

        new_badges.push(NewBadgeResult {
            badge: UserBadgeDto {
                id: user_badge_id,
                badge_id: def.id.clone(),
                name: def.name.clone(),
                description: def.description.clone(),
                icon_url: def.icon_url.clone(),
                category: def.category.clone(),
                tier: def.tier,
                unlocked_at: unlocked_at.clone(),
            },
            is_new: true,
            unlocked_at: unlocked_at.clone(),
        });
    }

    let has_new = !new_badges.is_empty();
    let message = if has_new {
        format!("恭喜获得{}个新徽章！", new_badges.len())
    } else {
        "暂无新徽章".to_string()
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: CheckBadgesData {
            has_new_badges: has_new,
            new_badges,
            message,
        },
    }))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<
    (
        std::sync::Arc<crate::db::DatabaseProxy>,
        crate::auth::AuthUser,
    ),
    AppError,
> {
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

#[derive(Debug, Clone)]
struct BadgeDefinitionRow {
    id: String,
    name: String,
    description: String,
    icon_url: String,
    category: String,
    tier: i64,
    condition: Option<BadgeCondition>,
}

async fn select_badge_definitions(
    proxy: &crate::db::DatabaseProxy,
) -> Result<Vec<BadgeDefinitionRow>, AppError> {
    let pool = proxy.pool();
    select_badge_definitions_pg(pool).await
}

async fn select_badge_definition(
    proxy: &crate::db::DatabaseProxy,
    id: &str,
) -> Result<Option<BadgeDefinitionRow>, AppError> {
    let pool = proxy.pool();
    select_badge_definition_pg(pool, id).await
}

async fn select_badge_definitions_pg(
    pool: &sqlx::PgPool,
) -> Result<Vec<BadgeDefinitionRow>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT
          "id","name","description","iconUrl","category"::text as "category","tier","condition"
        FROM "badge_definitions"
        ORDER BY "category" ASC, "tier" ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    Ok(rows
        .into_iter()
        .map(|row| BadgeDefinitionRow {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            name: row.try_get::<String, _>("name").unwrap_or_default(),
            description: row.try_get::<String, _>("description").unwrap_or_default(),
            icon_url: row.try_get::<String, _>("iconUrl").unwrap_or_default(),
            category: row
                .try_get::<String, _>("category")
                .unwrap_or_else(|_| "STREAK".to_string()),
            tier: row.try_get::<i32, _>("tier").map(|v| v as i64).unwrap_or(1),
            condition: row
                .try_get::<sqlx::types::Json<serde_json::Value>, _>("condition")
                .ok()
                .and_then(|json| serde_json::from_value::<BadgeCondition>(json.0).ok()),
        })
        .collect())
}

async fn select_badge_definition_pg(
    pool: &sqlx::PgPool,
    id: &str,
) -> Result<Option<BadgeDefinitionRow>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT
          "id","name","description","iconUrl","category"::text as "category","tier","condition"
        FROM "badge_definitions"
        WHERE "id" = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    Ok(row.map(|row| BadgeDefinitionRow {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        name: row.try_get::<String, _>("name").unwrap_or_default(),
        description: row.try_get::<String, _>("description").unwrap_or_default(),
        icon_url: row.try_get::<String, _>("iconUrl").unwrap_or_default(),
        category: row
            .try_get::<String, _>("category")
            .unwrap_or_else(|_| "STREAK".to_string()),
        tier: row.try_get::<i32, _>("tier").map(|v| v as i64).unwrap_or(1),
        condition: row
            .try_get::<sqlx::types::Json<serde_json::Value>, _>("condition")
            .ok()
            .and_then(|json| serde_json::from_value::<BadgeCondition>(json.0).ok()),
    }))
}

async fn select_user_badges(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Vec<UserBadgeDto>, AppError> {
    let pool = proxy.pool();
    select_user_badges_pg(pool, user_id).await
}

async fn select_user_badges_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
) -> Result<Vec<UserBadgeDto>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT
          ub."id" as "id",
          ub."badgeId" as "badgeId",
          ub."tier" as "tier",
          ub."unlockedAt" as "unlockedAt",
          bd."name" as "name",
          bd."description" as "description",
          bd."iconUrl" as "iconUrl",
          bd."category"::text as "category"
        FROM "user_badges" ub
        JOIN "badge_definitions" bd ON bd."id" = ub."badgeId"
        WHERE ub."userId" = $1
        ORDER BY ub."unlockedAt" DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    Ok(rows
        .into_iter()
        .map(|row| UserBadgeDto {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            badge_id: row.try_get::<String, _>("badgeId").unwrap_or_default(),
            name: row.try_get::<String, _>("name").unwrap_or_default(),
            description: row.try_get::<String, _>("description").unwrap_or_default(),
            icon_url: row.try_get::<String, _>("iconUrl").unwrap_or_default(),
            category: row
                .try_get::<String, _>("category")
                .unwrap_or_else(|_| "STREAK".to_string()),
            tier: row.try_get::<i32, _>("tier").map(|v| v as i64).unwrap_or(1),
            unlocked_at: row
                .try_get::<chrono::NaiveDateTime, _>("unlockedAt")
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                })
                .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        })
        .collect())
}

async fn select_user_badge_unlocks(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<HashMap<String, String>, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "badgeId","tier","unlockedAt"
        FROM "user_badges"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let badge_id = row.try_get::<String, _>("badgeId").unwrap_or_default();
        let tier = row.try_get::<i32, _>("tier").map(|v| v as i64).unwrap_or(1);
        let unlocked_at = row
            .try_get::<chrono::NaiveDateTime, _>("unlockedAt")
            .map(|dt| {
                DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                    .to_rfc3339_opts(SecondsFormat::Millis, true)
            })
            .unwrap_or_default();
        map.insert(format!("{badge_id}:{tier}"), unlocked_at);
    }
    Ok(map)
}

#[derive(Debug, Clone)]
struct BadgeStats {
    consecutive_days: f64,
    total_words_learned: f64,
    total_sessions: f64,
    recent_accuracy: f64,
    cognitive_min_improvement: f64,
    cognitive_has_data: bool,
}

async fn compute_user_badge_stats(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<BadgeStats, AppError> {
    let consecutive = compute_consecutive_days(proxy, user_id).await? as f64;
    let total_words = count_distinct_words_learned(proxy, user_id).await? as f64;
    let total_sessions = count_learning_sessions(proxy, user_id).await? as f64;
    let recent_accuracy = compute_recent_accuracy(proxy, user_id).await?;

    Ok(BadgeStats {
        consecutive_days: consecutive,
        total_words_learned: total_words,
        total_sessions,
        recent_accuracy,
        cognitive_min_improvement: 0.0,
        cognitive_has_data: false,
    })
}

async fn count_distinct_words_learned(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<i64, AppError> {
    let pool = proxy.pool();
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT "wordId") FROM "answer_records"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    Ok(count)
}

async fn count_learning_sessions(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<i64, AppError> {
    let pool = proxy.pool();
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM "learning_sessions"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    Ok(count)
}

async fn compute_recent_accuracy(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<f64, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "isCorrect" as "isCorrect"
        FROM "answer_records"
        WHERE "userId" = $1
        ORDER BY "timestamp" DESC
        LIMIT 200
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if rows.is_empty() {
        return Ok(0.0);
    }
    let correct = rows
        .iter()
        .filter(|row| row.try_get::<bool, _>("isCorrect").unwrap_or(false))
        .count();
    Ok((correct as f64) / (rows.len() as f64))
}

async fn compute_consecutive_days(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<i64, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "timestamp" as "timestamp"
        FROM "answer_records"
        WHERE "userId" = $1
        ORDER BY "timestamp" DESC
        LIMIT 2000
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let dates: Vec<NaiveDate> = rows
        .into_iter()
        .filter_map(|row| row.try_get::<chrono::NaiveDateTime, _>("timestamp").ok())
        .map(|dt| dt.date())
        .collect();

    if dates.is_empty() {
        return Ok(0);
    }

    let mut unique: HashSet<NaiveDate> = HashSet::new();
    for d in dates {
        unique.insert(d);
    }

    let mut sorted: Vec<NaiveDate> = unique.into_iter().collect();
    sorted.sort_by(|a, b| b.cmp(a));

    let today = Utc::now().date_naive();
    if sorted.first().copied() != Some(today) {
        return Ok(0);
    }

    let mut consecutive = 1i64;
    for (i, &date) in sorted.iter().enumerate().skip(1) {
        let expected = today - Duration::days(i as i64);
        if date == expected {
            consecutive += 1;
        } else {
            break;
        }
    }
    Ok(consecutive)
}

fn parse_date_only(raw: &str) -> Option<NaiveDate> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
        return Some(dt.date_naive());
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S") {
        return Some(dt.date());
    }
    if let Ok(date) = NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
        return Some(date);
    }
    None
}

fn current_value_for_condition(condition: &BadgeCondition, stats: &BadgeStats) -> f64 {
    match condition.r#type.as_str() {
        "streak" => stats.consecutive_days,
        "accuracy" => stats.recent_accuracy,
        "words_learned" => stats.total_words_learned,
        "total_sessions" => stats.total_sessions,
        "cognitive_improvement" => stats.cognitive_min_improvement,
        _ => 0.0,
    }
}

fn is_condition_met(condition: &BadgeCondition, stats: &BadgeStats) -> bool {
    match condition.r#type.as_str() {
        "streak" => stats.consecutive_days >= condition.value,
        "accuracy" => {
            let min_words = condition
                .params
                .as_ref()
                .and_then(|v| v.get("minWords"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if min_words > 0.0 && stats.total_words_learned < min_words {
                return false;
            }
            stats.recent_accuracy >= condition.value
        }
        "words_learned" => stats.total_words_learned >= condition.value,
        "total_sessions" => stats.total_sessions >= condition.value,
        "cognitive_improvement" => {
            if !stats.cognitive_has_data {
                return false;
            }
            stats.cognitive_min_improvement >= condition.value
        }
        _ => false,
    }
}

async fn upsert_user_badge(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    user_badge_id: &str,
    badge_id: &str,
    tier: i64,
    unlocked_at: &str,
) -> Result<(), AppError> {
    let pool = proxy.pool();
    let unlocked_dt = chrono::DateTime::parse_from_rfc3339(unlocked_at)
        .map(|dt| dt.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "user_badges" ("id", "userId", "badgeId", "tier", "unlockedAt")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ("userId", "badgeId", "tier") DO NOTHING
        "#,
    )
    .bind(user_badge_id)
    .bind(user_id)
    .bind(badge_id)
    .bind(tier as i32)
    .bind(unlocked_dt)
    .execute(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "数据库写入失败",
        )
    })?;
    Ok(())
}
