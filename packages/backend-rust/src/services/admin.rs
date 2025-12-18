use std::collections::HashMap;

use chrono::{NaiveDateTime, Utc};
use serde::Serialize;
use serde_json::{Map, Value};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::db::state_machine::DatabaseState;
use crate::db::{DbMutationError, DatabaseProxy};

#[derive(Debug, thiserror::Error)]
pub enum AdminError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("forbidden: {0}")]
    Forbidden(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("database unavailable")]
    Unavailable,
    #[error(transparent)]
    Sql(#[from] sqlx::Error),
    #[error("db mutation failed: {0}")]
    Mutation(String),
    #[error("record error: {0}")]
    Record(String),
}

#[derive(Debug, Clone)]
pub struct ListUsersParams {
    pub page: i64,
    pub page_size: i64,
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
    pub total_pages: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserListItem {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
    pub total_words_learned: i64,
    pub average_score: f64,
    pub accuracy: f64,
    pub last_learning_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserListResult {
    pub users: Vec<UserListItem>,
    pub total: i64,
    pub pagination: Pagination,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDetailCounts {
    pub word_books: i64,
    pub records: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDetail {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(rename = "_count")]
    pub count: UserDetailCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserRoleResult {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicUserInfo {
    pub id: String,
    pub email: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserLearningData {
    pub user: BasicUserInfo,
    pub total_records: i64,
    pub correct_records: i64,
    pub average_accuracy: f64,
    pub total_words_learned: i64,
    pub recent_records: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryDistribution {
    pub level0: i64,
    pub level1: i64,
    pub level2: i64,
    pub level3: i64,
    pub level4: i64,
    pub level5: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicUserInfoWithRole {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDetailedStatistics {
    pub user: BasicUserInfoWithRole,
    pub total_records: i64,
    pub correct_records: i64,
    pub total_words_learned: i64,
    pub accuracy: f64,
    pub average_score: f64,
    pub mastery_distribution: MasteryDistribution,
}

#[derive(Debug, Clone)]
pub struct UserWordsParams {
    pub page: i64,
    pub page_size: i64,
    pub sort_by: Option<UserWordsSortBy>,
    pub sort_order: SortOrder,
    pub state: Option<String>,
    pub search: Option<String>,
    pub score_range: Option<ScoreRange>,
    pub mastery_level: Option<i64>,
    pub min_accuracy: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
pub enum SortOrder {
    Asc,
    Desc,
}

impl SortOrder {
    pub fn from_query(value: Option<&str>) -> Self {
        match value.unwrap_or("desc").trim().to_ascii_lowercase().as_str() {
            "asc" => SortOrder::Asc,
            _ => SortOrder::Desc,
        }
    }

    fn sql(self) -> &'static str {
        match self {
            SortOrder::Asc => "ASC",
            SortOrder::Desc => "DESC",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum UserWordsSortBy {
    UpdatedAt,
    ReviewCount,
    LastReview,
    Spelling,
    MasteryLevel,
    Score,
    Accuracy,
}

impl UserWordsSortBy {
    pub fn from_query(value: Option<&str>) -> Option<Self> {
        let raw = value?.trim().to_ascii_lowercase();
        match raw.as_str() {
            "reviewcount" | "review_count" => Some(UserWordsSortBy::ReviewCount),
            "lastreview" | "last_review" => Some(UserWordsSortBy::LastReview),
            "spelling" => Some(UserWordsSortBy::Spelling),
            "masterylevel" | "mastery_level" => Some(UserWordsSortBy::MasteryLevel),
            "score" => Some(UserWordsSortBy::Score),
            "accuracy" => Some(UserWordsSortBy::Accuracy),
            "updatedat" | "updated_at" => Some(UserWordsSortBy::UpdatedAt),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum ScoreRange {
    Low,
    Medium,
    High,
}

impl ScoreRange {
    pub fn from_query(value: Option<&str>) -> Option<Self> {
        let raw = value?.trim().to_ascii_lowercase();
        match raw.as_str() {
            "low" => Some(ScoreRange::Low),
            "medium" => Some(ScoreRange::Medium),
            "high" => Some(ScoreRange::High),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminWord {
    pub id: String,
    pub spelling: String,
    pub phonetic: String,
    pub meanings: Vec<String>,
    pub examples: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWordItem {
    pub word: AdminWord,
    pub score: f64,
    pub mastery_level: i64,
    pub accuracy: f64,
    pub review_count: i64,
    pub last_review_date: Option<String>,
    pub next_review_date: Option<String>,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWordsResult {
    pub words: Vec<UserWordItem>,
    pub pagination: Pagination,
}

#[derive(Debug, Clone)]
pub struct UserDecisionsParams {
    pub page: i64,
    pub page_size: i64,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub decision_source: Option<String>,
    pub min_confidence: Option<f64>,
    pub sort_by: DecisionSortBy,
    pub sort_order: SortOrder,
}

#[derive(Debug, Clone, Copy)]
pub enum DecisionSortBy {
    Timestamp,
    Confidence,
    Duration,
}

impl DecisionSortBy {
    pub fn from_query(value: Option<&str>) -> Self {
        let raw = value.unwrap_or("timestamp").trim().to_ascii_lowercase();
        match raw.as_str() {
            "confidence" => DecisionSortBy::Confidence,
            "duration" => DecisionSortBy::Duration,
            _ => DecisionSortBy::Timestamp,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionStatistics {
    pub total_decisions: i64,
    pub average_confidence: f64,
    pub average_reward: f64,
    pub decision_source_distribution: HashMap<String, i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionSummary {
    pub decision_id: String,
    pub timestamp: String,
    pub decision_source: String,
    pub confidence: f64,
    pub reward: Option<f64>,
    pub total_duration_ms: Option<i64>,
    pub strategy: DecisionStrategy,
}

#[derive(Debug, Clone, Serialize)]
pub struct DecisionStrategy {
    pub difficulty: String,
    #[serde(rename = "batch_size")]
    pub batch_size: i64,
    #[serde(rename = "interval_scale", skip_serializing_if = "Option::is_none")]
    pub interval_scale: Option<f64>,
    #[serde(rename = "new_ratio", skip_serializing_if = "Option::is_none")]
    pub new_ratio: Option<f64>,
    #[serde(rename = "hint_level", skip_serializing_if = "Option::is_none")]
    pub hint_level: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDecisionsResult {
    pub decisions: Vec<DecisionSummary>,
    pub pagination: Pagination,
    pub statistics: DecisionStatistics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatistics {
    pub total_users: i64,
    pub active_users: i64,
    pub total_word_books: i64,
    pub system_word_books: i64,
    pub user_word_books: i64,
    pub total_words: i64,
    pub total_records: i64,
}

pub async fn list_users(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    params: ListUsersParams,
) -> Result<UserListResult, AdminError> {
    let page = params.page.max(1);
    let page_size = params.page_size.max(1).min(200);
    let offset = (page - 1) * page_size;
    let search = normalize_search(params.search.as_deref());

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    let total = if use_fallback {
        let Some(pool) = fallback.clone() else {
            return Err(AdminError::Unavailable);
        };
        count_users_sqlite(&pool, search.as_deref()).await?
    } else {
        let Some(pool) = primary.clone() else {
            return Err(AdminError::Unavailable);
        };
        count_users_pg(&pool, search.as_deref()).await?
    };

    let users = if total == 0 {
        Vec::new()
    } else if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };
        select_users_sqlite(&pool, search.as_deref(), page_size, offset).await?
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };
        select_users_pg(&pool, search.as_deref(), page_size, offset).await?
    };

    Ok(UserListResult {
        users,
        total,
        pagination: build_pagination(page, page_size, total),
    })
}

pub async fn get_user_by_id(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<UserDetail, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };
        select_user_detail_sqlite(&pool, user_id).await
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };
        select_user_detail_pg(&pool, user_id).await
    }
}

pub async fn update_user_role(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    role: &str,
) -> Result<UpdateUserRoleResult, AdminError> {
    let normalized = role.trim().to_ascii_uppercase();
    if normalized != "USER" && normalized != "ADMIN" {
        return Err(AdminError::Validation("role 必须为 USER 或 ADMIN".to_string()));
    }

    if proxy.sqlite_enabled() {
        let mut where_clause = Map::new();
        where_clause.insert("id".to_string(), Value::String(user_id.to_string()));

        let mut data = Map::new();
        data.insert("role".to_string(), Value::String(normalized.clone()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "users".to_string(),
            r#where: where_clause,
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map_err(map_db_mutation_error)?;

        return select_user_role_update(proxy, state, user_id).await;
    }

    let Some(pool) = proxy.primary_pool().await else {
        return Err(AdminError::Unavailable);
    };

    let row = sqlx::query(
        r#"
        UPDATE "users"
        SET "role" = $2::"UserRole",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1
        RETURNING "id","email","username","role"::text as "role","updatedAt"
        "#,
    )
    .bind(user_id)
    .bind(&normalized)
    .fetch_optional(&pool)
    .await?;

    let Some(row) = row else {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    };

    let updated_at: NaiveDateTime = row.try_get("updatedAt")?;

    Ok(UpdateUserRoleResult {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
    })
}

pub async fn delete_user(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<(), AdminError> {
    let role = select_user_role(proxy, state, user_id).await?;
    let Some(role) = role else {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    };
    if role == "ADMIN" {
        return Err(AdminError::Forbidden("不能删除管理员账户".to_string()));
    }

    if proxy.sqlite_enabled() {
        let mut where_clause = Map::new();
        where_clause.insert("id".to_string(), Value::String(user_id.to_string()));

        let op = crate::db::dual_write_manager::WriteOperation::Delete {
            table: "users".to_string(),
            r#where: where_clause,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map_err(map_db_mutation_error)?;

        return Ok(());
    }

    let Some(pool) = proxy.primary_pool().await else {
        return Err(AdminError::Unavailable);
    };

    let result = sqlx::query(r#"DELETE FROM "users" WHERE "id" = $1"#)
        .bind(user_id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    }

    Ok(())
}

pub async fn get_user_learning_data(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    limit: i64,
) -> Result<UserLearningData, AdminError> {
    let _limit = limit.max(1).min(100);
    let user = select_basic_user(proxy, state, user_id).await?;

    let (total_records, correct_records, total_words_learned) =
        select_learning_counts(proxy, state, user_id).await?;

    let average_accuracy = if total_records > 0 {
        round_two((correct_records as f64 / total_records as f64) * 100.0)
    } else {
        0.0
    };

    Ok(UserLearningData {
        user,
        total_records,
        correct_records,
        average_accuracy,
        total_words_learned,
        recent_records: Vec::new(),
    })
}

pub async fn get_user_detailed_statistics(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<UserDetailedStatistics, AdminError> {
    let user = select_basic_user_with_role(proxy, state, user_id).await?;

    let (total_records, correct_records, total_words_learned, average_score) =
        select_statistics_aggregates(proxy, state, user_id).await?;

    let accuracy = if total_records > 0 {
        round_two((correct_records as f64 / total_records as f64) * 100.0)
    } else {
        0.0
    };

    let mastery_distribution = select_mastery_distribution(proxy, state, user_id).await?;

    Ok(UserDetailedStatistics {
        user,
        total_records,
        correct_records,
        total_words_learned,
        accuracy,
        average_score: round_two(average_score),
        mastery_distribution,
    })
}

pub async fn get_user_words(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    params: UserWordsParams,
) -> Result<UserWordsResult, AdminError> {
    let page = params.page.max(1);
    let page_size = params.page_size.max(1).min(200);
    let offset = (page - 1) * page_size;

    let normalized_state = match params.state.as_deref() {
        Some(value) => Some(validate_word_state(value)?),
        None => None,
    };

    if let Some(level) = params.mastery_level {
        if !(0..=5).contains(&level) {
            return Err(AdminError::Validation("masteryLevel 参数不合法".to_string()));
        }
    }

    let search = normalize_search(params.search.as_deref());

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    let total = if use_fallback {
        let Some(pool) = fallback.clone() else {
            return Err(AdminError::Unavailable);
        };
        count_user_words_sqlite(&pool, user_id, normalized_state.as_deref(), search.as_deref()).await?
    } else {
        let Some(pool) = primary.clone() else {
            return Err(AdminError::Unavailable);
        };
        count_user_words_pg(&pool, user_id, normalized_state.as_deref(), search.as_deref()).await?
    };

    let words = if total == 0 {
        Vec::new()
    } else if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };
        select_user_words_sqlite(&pool, user_id, &params, normalized_state.as_deref(), search.as_deref(), page_size, offset).await?
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };
        select_user_words_pg(&pool, user_id, &params, normalized_state.as_deref(), search.as_deref(), page_size, offset).await?
    };

    Ok(UserWordsResult {
        words,
        pagination: build_pagination(page, page_size, total),
    })
}

pub async fn get_user_decisions(
    _proxy: &DatabaseProxy,
    _state: DatabaseState,
    _user_id: &str,
    params: UserDecisionsParams,
) -> Result<UserDecisionsResult, AdminError> {
    let page = params.page.max(1);
    let page_size = params.page_size.max(1).min(100);

    Ok(UserDecisionsResult {
        decisions: Vec::new(),
        pagination: build_pagination(page, page_size, 0),
        statistics: DecisionStatistics {
            total_decisions: 0,
            average_confidence: 0.0,
            average_reward: 0.0,
            decision_source_distribution: HashMap::new(),
        },
    })
}

pub async fn get_system_statistics(
    proxy: &DatabaseProxy,
    state: DatabaseState,
) -> Result<SystemStatistics, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };
        select_system_statistics_sqlite(&pool).await
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };
        select_system_statistics_pg(&pool).await
    }
}

fn should_use_fallback(state: DatabaseState, primary_missing: bool) -> bool {
    matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary_missing
}

fn normalize_search(search: Option<&str>) -> Option<String> {
    let raw = search?.trim();
    if raw.is_empty() {
        None
    } else {
        Some(raw.to_string())
    }
}

fn build_pagination(page: i64, page_size: i64, total: i64) -> Pagination {
    let total_pages = if total > 0 {
        (total + page_size - 1) / page_size
    } else {
        0
    };

    Pagination {
        page,
        page_size,
        total,
        total_pages,
    }
}

fn round_two(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn format_sqlite_datetime(raw: &str) -> String {
    let ms = crate::auth::parse_sqlite_datetime_ms(raw).unwrap_or_else(|| Utc::now().timestamp_millis());
    crate::auth::format_timestamp_ms_iso_millis(ms).unwrap_or_else(|| Utc::now().to_rfc3339())
}

fn parse_json_string_array(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn validate_word_state(value: &str) -> Result<String, AdminError> {
    let normalized = value.trim().to_ascii_uppercase();
    match normalized.as_str() {
        "NEW" | "LEARNING" | "REVIEWING" | "MASTERED" => Ok(normalized),
        _ => Err(AdminError::Validation("state 参数不合法".to_string())),
    }
}

fn map_db_mutation_error(err: DbMutationError) -> AdminError {
    match err {
        DbMutationError::Unavailable => AdminError::Unavailable,
        other => AdminError::Mutation(other.to_string()),
    }
}

async fn count_users_pg(pool: &sqlx::PgPool, search: Option<&str>) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(r#"SELECT COUNT(*) as "count" FROM "users" u WHERE 1=1"#);
    if let Some(search) = search {
        let pattern = format!("%{}%", search);
        qb.push(" AND (u.\"email\" ILIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR u.\"username\" ILIKE ");
        qb.push_bind(pattern);
        qb.push(")");
    }
    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn count_users_sqlite(pool: &sqlx::SqlitePool, search: Option<&str>) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Sqlite>::new(r#"SELECT COUNT(*) as "count" FROM "users" u WHERE 1=1"#);
    if let Some(search) = search {
        let pattern = format!("%{}%", search.to_ascii_lowercase());
        qb.push(" AND (LOWER(u.\"email\") LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(u.\"username\") LIKE ");
        qb.push_bind(pattern);
        qb.push(")");
    }
    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn select_users_pg(
    pool: &sqlx::PgPool,
    search: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<UserListItem>, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          u."id" as "id",
          u."email" as "email",
          u."username" as "username",
          u."role"::text as "role",
          u."createdAt" as "createdAt",
          COALESCE(stats."totalWordsLearned", 0) as "totalWordsLearned",
          COALESCE(score."averageScore", 0) as "averageScore",
          COALESCE(stats."accuracy", 0) as "accuracy",
          stats."lastLearningTime" as "lastLearningTime"
        FROM "users" u
        LEFT JOIN (
          SELECT
            ar."userId" as "userId",
            COUNT(DISTINCT ar."wordId") as "totalWordsLearned",
            MAX(ar."timestamp") as "lastLearningTime",
            CASE WHEN COUNT(*) > 0
              THEN (SUM(CASE WHEN ar."isCorrect" THEN 1 ELSE 0 END)::double precision * 100 / COUNT(*)::double precision)
              ELSE 0
            END as "accuracy"
          FROM "answer_records" ar
          GROUP BY ar."userId"
        ) stats ON stats."userId" = u."id"
        LEFT JOIN (
          SELECT
            ws."userId" as "userId",
            AVG(ws."totalScore") as "averageScore"
          FROM "word_scores" ws
          GROUP BY ws."userId"
        ) score ON score."userId" = u."id"
        WHERE 1=1
        "#,
    );
    if let Some(search) = search {
        let pattern = format!("%{}%", search);
        qb.push(" AND (u.\"email\" ILIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR u.\"username\" ILIKE ");
        qb.push_bind(pattern);
        qb.push(")");
    }
    qb.push(" ORDER BY u.\"createdAt\" DESC LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_user_list_item_pg).collect())
}

async fn select_users_sqlite(
    pool: &sqlx::SqlitePool,
    search: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<UserListItem>, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT
          u."id" as "id",
          u."email" as "email",
          u."username" as "username",
          u."role" as "role",
          u."createdAt" as "createdAt",
          COALESCE(stats."totalWordsLearned", 0) as "totalWordsLearned",
          COALESCE(score."averageScore", 0) as "averageScore",
          COALESCE(stats."accuracy", 0) as "accuracy",
          stats."lastLearningTime" as "lastLearningTime"
        FROM "users" u
        LEFT JOIN (
          SELECT
            ar."userId" as "userId",
            COUNT(DISTINCT ar."wordId") as "totalWordsLearned",
            MAX(ar."timestamp") as "lastLearningTime",
            CASE WHEN COUNT(*) > 0
              THEN (SUM(CASE WHEN ar."isCorrect" = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
              ELSE 0
            END as "accuracy"
          FROM "answer_records" ar
          GROUP BY ar."userId"
        ) stats ON stats."userId" = u."id"
        LEFT JOIN (
          SELECT
            ws."userId" as "userId",
            AVG(ws."totalScore") as "averageScore"
          FROM "word_scores" ws
          GROUP BY ws."userId"
        ) score ON score."userId" = u."id"
        WHERE 1=1
        "#,
    );
    if let Some(search) = search {
        let pattern = format!("%{}%", search.to_ascii_lowercase());
        qb.push(" AND (LOWER(u.\"email\") LIKE ");
        qb.push_bind(pattern.clone());
        qb.push(" OR LOWER(u.\"username\") LIKE ");
        qb.push_bind(pattern);
        qb.push(")");
    }
    qb.push(" ORDER BY u.\"createdAt\" DESC LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_user_list_item_sqlite).collect())
}

fn map_user_list_item_pg(row: sqlx::postgres::PgRow) -> UserListItem {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let last_learning_time: Option<NaiveDateTime> = row.try_get::<Option<NaiveDateTime>, _>("lastLearningTime").ok().flatten();

    UserListItem {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        role: row.try_get("role").unwrap_or_else(|_| "USER".to_string()),
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        total_words_learned: row.try_get::<i64, _>("totalWordsLearned").unwrap_or(0),
        average_score: row.try_get::<f64, _>("averageScore").unwrap_or(0.0),
        accuracy: round_two(row.try_get::<f64, _>("accuracy").unwrap_or(0.0)),
        last_learning_time: last_learning_time.map(crate::auth::format_naive_datetime_iso_millis),
    }
}

fn map_user_list_item_sqlite(row: sqlx::sqlite::SqliteRow) -> UserListItem {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let last_raw: Option<String> = row.try_get::<Option<String>, _>("lastLearningTime").ok().flatten();

    UserListItem {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        role: row.try_get("role").unwrap_or_else(|_| "USER".to_string()),
        created_at: format_sqlite_datetime(&created_raw),
        total_words_learned: row.try_get::<i64, _>("totalWordsLearned").unwrap_or(0),
        average_score: row.try_get::<f64, _>("averageScore").unwrap_or(0.0),
        accuracy: round_two(row.try_get::<f64, _>("accuracy").unwrap_or(0.0)),
        last_learning_time: last_raw.as_deref().map(format_sqlite_datetime),
    }
}

async fn select_user_detail_pg(pool: &sqlx::PgPool, user_id: &str) -> Result<UserDetail, AdminError> {
    let row = sqlx::query(
        r#"
        SELECT
          u."id",
          u."email",
          u."username",
          u."role"::text as "role",
          u."createdAt",
          u."updatedAt",
          (SELECT COUNT(*) FROM "word_books" wb WHERE wb."userId" = u."id") as "wordBooksCount",
          (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."userId" = u."id") as "recordsCount"
        FROM "users" u
        WHERE u."id" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    };

    let created_at: NaiveDateTime = row.try_get("createdAt")?;
    let updated_at: NaiveDateTime = row.try_get("updatedAt")?;
    let word_books: i64 = row.try_get("wordBooksCount").unwrap_or(0);
    let records: i64 = row.try_get("recordsCount").unwrap_or(0);

    Ok(UserDetail {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
        count: UserDetailCounts { word_books, records },
    })
}

async fn select_user_detail_sqlite(pool: &sqlx::SqlitePool, user_id: &str) -> Result<UserDetail, AdminError> {
    let row = sqlx::query(
        r#"
        SELECT
          u."id",
          u."email",
          u."username",
          u."role" as "role",
          u."createdAt" as "createdAt",
          u."updatedAt" as "updatedAt",
          (SELECT COUNT(*) FROM "word_books" wb WHERE wb."userId" = u."id") as "wordBooksCount",
          (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."userId" = u."id") as "recordsCount"
        FROM "users" u
        WHERE u."id" = ?
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    };

    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();
    let word_books: i64 = row.try_get("wordBooksCount").unwrap_or(0);
    let records: i64 = row.try_get("recordsCount").unwrap_or(0);

    Ok(UserDetail {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
        count: UserDetailCounts { word_books, records },
    })
}

async fn select_user_role_update(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<UpdateUserRoleResult, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(
            r#"
            SELECT "id","email","username","role","updatedAt" as "updatedAt"
            FROM "users"
            WHERE "id" = ?
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        let Some(row) = row else {
            return Err(AdminError::NotFound("用户不存在".to_string()));
        };

        let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();

        return Ok(UpdateUserRoleResult {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
            role: row.try_get("role")?,
            updated_at: format_sqlite_datetime(&updated_raw),
        });
    }

    let Some(pool) = primary else {
        return Err(AdminError::Unavailable);
    };

    let row = sqlx::query(
        r#"
        SELECT "id","email","username","role"::text as "role","updatedAt"
        FROM "users"
        WHERE "id" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await?;

    let Some(row) = row else {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    };

    let updated_at: NaiveDateTime = row.try_get("updatedAt")?;

    Ok(UpdateUserRoleResult {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
    })
}

async fn select_user_role(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Option<String>, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(r#"SELECT "role" FROM "users" WHERE "id" = ? LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;

        Ok(row.and_then(|r| r.try_get::<String, _>("role").ok()))
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(r#"SELECT "role"::text as "role" FROM "users" WHERE "id" = $1 LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;

        Ok(row.and_then(|r| r.try_get::<String, _>("role").ok()))
    }
}

async fn select_basic_user(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<BasicUserInfo, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(r#"SELECT "id","email","username" FROM "users" WHERE "id" = ? LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;

        let Some(row) = row else {
            return Err(AdminError::NotFound("用户不存在".to_string()));
        };

        Ok(BasicUserInfo {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
        })
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(r#"SELECT "id","email","username" FROM "users" WHERE "id" = $1 LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;

        let Some(row) = row else {
            return Err(AdminError::NotFound("用户不存在".to_string()));
        };

        Ok(BasicUserInfo {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
        })
    }
}

async fn select_basic_user_with_role(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<BasicUserInfoWithRole, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(
            r#"
            SELECT "id","email","username","role","createdAt" as "createdAt"
            FROM "users"
            WHERE "id" = ?
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        let Some(row) = row else {
            return Err(AdminError::NotFound("用户不存在".to_string()));
        };

        let created_raw: String = row.try_get("createdAt").unwrap_or_default();

        Ok(BasicUserInfoWithRole {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
            role: row.try_get("role")?,
            created_at: format_sqlite_datetime(&created_raw),
        })
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(
            r#"
            SELECT "id","email","username","role"::text as "role","createdAt"
            FROM "users"
            WHERE "id" = $1
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        let Some(row) = row else {
            return Err(AdminError::NotFound("用户不存在".to_string()));
        };

        let created_at: NaiveDateTime = row.try_get("createdAt")?;

        Ok(BasicUserInfoWithRole {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
            role: row.try_get("role")?,
            created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        })
    }
}

async fn select_learning_counts(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<(i64, i64, i64), AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(
            r#"
            SELECT
              COUNT(*) as "total",
              COALESCE(SUM(CASE WHEN "isCorrect" = 1 THEN 1 ELSE 0 END), 0) as "correct",
              COUNT(DISTINCT "wordId") as "distinctWords"
            FROM "answer_records"
            WHERE "userId" = ?
            "#,
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await?;

        let total = row.try_get::<i64, _>("total").unwrap_or(0);
        let correct = row.try_get::<i64, _>("correct").unwrap_or(0);
        let distinct_words = row.try_get::<i64, _>("distinctWords").unwrap_or(0);
        Ok((total, correct, distinct_words))
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(
            r#"
            SELECT
              COUNT(*) as "total",
              COALESCE(SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END), 0) as "correct",
              COUNT(DISTINCT "wordId") as "distinctWords"
            FROM "answer_records"
            WHERE "userId" = $1
            "#,
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await?;

        let total = row.try_get::<i64, _>("total").unwrap_or(0);
        let correct = row.try_get::<i64, _>("correct").unwrap_or(0);
        let distinct_words = row.try_get::<i64, _>("distinctWords").unwrap_or(0);
        Ok((total, correct, distinct_words))
    }
}

async fn select_statistics_aggregates(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<(i64, i64, i64, f64), AdminError> {
    let (total_records, correct_records, total_words_learned) =
        select_learning_counts(proxy, state, user_id).await?;

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    let average_score = if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(r#"SELECT COALESCE(AVG("totalScore"), 0) as "avg" FROM "word_scores" WHERE "userId" = ?"#)
            .bind(user_id)
            .fetch_one(&pool)
            .await?;

        row.try_get::<f64, _>("avg").unwrap_or(0.0)
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };

        let row = sqlx::query(r#"SELECT COALESCE(AVG("totalScore"), 0) as "avg" FROM "word_scores" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_one(&pool)
            .await?;

        row.try_get::<f64, _>("avg").unwrap_or(0.0)
    };

    Ok((total_records, correct_records, total_words_learned, average_score))
}

async fn select_mastery_distribution(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<MasteryDistribution, AdminError> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = should_use_fallback(state, primary.is_none());

    let mut dist = MasteryDistribution {
        level0: 0,
        level1: 0,
        level2: 0,
        level3: 0,
        level4: 0,
        level5: 0,
    };

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(AdminError::Unavailable);
        };

        let rows = sqlx::query(
            r#"
            SELECT "masteryLevel" as "masteryLevel", COUNT(*) as "count"
            FROM "word_learning_states"
            WHERE "userId" = ?
            GROUP BY "masteryLevel"
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        for row in rows {
            let level = row.try_get::<i64, _>("masteryLevel").unwrap_or(0);
            let count = row.try_get::<i64, _>("count").unwrap_or(0);
            apply_mastery_bucket(&mut dist, level, count);
        }
    } else {
        let Some(pool) = primary else {
            return Err(AdminError::Unavailable);
        };

        let rows = sqlx::query(
            r#"
            SELECT "masteryLevel" as "masteryLevel", COUNT(*) as "count"
            FROM "word_learning_states"
            WHERE "userId" = $1
            GROUP BY "masteryLevel"
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        for row in rows {
            let level = row.try_get::<i32, _>("masteryLevel").unwrap_or(0) as i64;
            let count = row.try_get::<i64, _>("count").unwrap_or(0);
            apply_mastery_bucket(&mut dist, level, count);
        }
    }

    Ok(dist)
}

fn apply_mastery_bucket(dist: &mut MasteryDistribution, level: i64, count: i64) {
    match level {
        0 => dist.level0 = count,
        1 => dist.level1 = count,
        2 => dist.level2 = count,
        3 => dist.level3 = count,
        4 => dist.level4 = count,
        5 => dist.level5 = count,
        _ => {}
    }
}

async fn count_user_words_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
    normalized_state: Option<&str>,
    search: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT COUNT(*) as "count"
        FROM "word_learning_states" wls
        JOIN "words" w ON w."id" = wls."wordId"
        WHERE wls."userId" =
        "#,
    );
    qb.push_bind(user_id);

    if let Some(state) = normalized_state {
        qb.push(r#" AND wls."state"::text = "#);
        qb.push_bind(state);
    }

    if let Some(search) = search {
        let pattern = format!("%{}%", search);
        qb.push(r#" AND w."spelling" ILIKE "#);
        qb.push_bind(pattern);
    }

    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn count_user_words_sqlite(
    pool: &sqlx::SqlitePool,
    user_id: &str,
    normalized_state: Option<&str>,
    search: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT COUNT(*) as "count"
        FROM "word_learning_states" wls
        JOIN "words" w ON w."id" = wls."wordId"
        WHERE wls."userId" = ?
        "#,
    );
    qb.push_bind(user_id);

    if let Some(state) = normalized_state {
        qb.push(r#" AND wls."state" = "#);
        qb.push_bind(state);
    }

    if let Some(search) = search {
        let pattern = format!("%{}%", search.to_ascii_lowercase());
        qb.push(r#" AND LOWER(w."spelling") LIKE "#);
        qb.push_bind(pattern);
    }

    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn select_user_words_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
    params: &UserWordsParams,
    normalized_state: Option<&str>,
    search: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<UserWordItem>, AdminError> {
    let sort_by = params.sort_by.unwrap_or(UserWordsSortBy::UpdatedAt);
    let order_by = match sort_by {
        UserWordsSortBy::ReviewCount => r#"wls."reviewCount""#,
        UserWordsSortBy::LastReview => r#"wls."lastReviewDate""#,
        UserWordsSortBy::Spelling => r#"w."spelling""#,
        UserWordsSortBy::MasteryLevel => r#"wls."masteryLevel""#,
        UserWordsSortBy::Score => r#"COALESCE(ws."totalScore", 0)"#,
        UserWordsSortBy::Accuracy => r#"COALESCE(ws."recentAccuracy", 0)"#,
        UserWordsSortBy::UpdatedAt => r#"wls."updatedAt""#,
    };

    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          w."id" as "id",
          w."spelling" as "spelling",
          w."phonetic" as "phonetic",
          w."meanings" as "meanings",
          w."examples" as "examples",
          wls."masteryLevel" as "masteryLevel",
          wls."reviewCount" as "reviewCount",
          wls."lastReviewDate" as "lastReviewDate",
          wls."nextReviewDate" as "nextReviewDate",
          wls."state"::text as "state",
          COALESCE(ws."totalScore", 0) as "score",
          COALESCE(ws."recentAccuracy", 0) * 100 as "accuracy"
        FROM "word_learning_states" wls
        JOIN "words" w ON w."id" = wls."wordId"
        LEFT JOIN "word_scores" ws ON ws."userId" = wls."userId" AND ws."wordId" = wls."wordId"
        WHERE wls."userId" =
        "#,
    );
    qb.push_bind(user_id);

    if let Some(state) = normalized_state {
        qb.push(r#" AND wls."state"::text = "#);
        qb.push_bind(state);
    }

    if let Some(search) = search {
        let pattern = format!("%{}%", search);
        qb.push(r#" AND w."spelling" ILIKE "#);
        qb.push_bind(pattern);
    }

    if let Some(level) = params.mastery_level {
        qb.push(r#" AND wls."masteryLevel" = "#);
        qb.push_bind(level as i32);
    }

    qb.push(" ORDER BY ");
    qb.push(order_by);
    qb.push(" ");
    qb.push(params.sort_order.sql());
    qb.push(" NULLS LAST LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_user_word_pg).collect())
}

async fn select_user_words_sqlite(
    pool: &sqlx::SqlitePool,
    user_id: &str,
    params: &UserWordsParams,
    normalized_state: Option<&str>,
    search: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<UserWordItem>, AdminError> {
    let sort_by = params.sort_by.unwrap_or(UserWordsSortBy::UpdatedAt);
    let order_by = match sort_by {
        UserWordsSortBy::ReviewCount => r#"wls."reviewCount""#,
        UserWordsSortBy::LastReview => r#"wls."lastReviewDate""#,
        UserWordsSortBy::Spelling => r#"w."spelling""#,
        UserWordsSortBy::MasteryLevel => r#"wls."masteryLevel""#,
        UserWordsSortBy::Score => r#"COALESCE(ws."totalScore", 0)"#,
        UserWordsSortBy::Accuracy => r#"COALESCE(ws."recentAccuracy", 0)"#,
        UserWordsSortBy::UpdatedAt => r#"wls."updatedAt""#,
    };

    let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT
          w."id" as "id",
          w."spelling" as "spelling",
          w."phonetic" as "phonetic",
          w."meanings" as "meanings",
          w."examples" as "examples",
          wls."masteryLevel" as "masteryLevel",
          wls."reviewCount" as "reviewCount",
          wls."lastReviewDate" as "lastReviewDate",
          wls."nextReviewDate" as "nextReviewDate",
          wls."state" as "state",
          COALESCE(ws."totalScore", 0) as "score",
          COALESCE(ws."recentAccuracy", 0) * 100 as "accuracy"
        FROM "word_learning_states" wls
        JOIN "words" w ON w."id" = wls."wordId"
        LEFT JOIN "word_scores" ws ON ws."userId" = wls."userId" AND ws."wordId" = wls."wordId"
        WHERE wls."userId" = ?
        "#,
    );
    qb.push_bind(user_id);

    if let Some(state) = normalized_state {
        qb.push(r#" AND wls."state" = "#);
        qb.push_bind(state);
    }

    if let Some(search) = search {
        let pattern = format!("%{}%", search.to_ascii_lowercase());
        qb.push(r#" AND LOWER(w."spelling") LIKE "#);
        qb.push_bind(pattern);
    }

    if let Some(level) = params.mastery_level {
        qb.push(r#" AND wls."masteryLevel" = "#);
        qb.push_bind(level);
    }

    qb.push(" ORDER BY ");
    qb.push(order_by);
    qb.push(" ");
    qb.push(params.sort_order.sql());
    qb.push(" LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_user_word_sqlite).collect())
}

fn map_user_word_pg(row: sqlx::postgres::PgRow) -> UserWordItem {
    let mastery_level = row.try_get::<i32, _>("masteryLevel").unwrap_or(0) as i64;
    let review_count = row.try_get::<i32, _>("reviewCount").unwrap_or(0) as i64;
    let last_review: Option<NaiveDateTime> = row.try_get::<Option<NaiveDateTime>, _>("lastReviewDate").ok().flatten();
    let next_review: Option<NaiveDateTime> = row.try_get::<Option<NaiveDateTime>, _>("nextReviewDate").ok().flatten();

    UserWordItem {
        word: AdminWord {
            id: row.try_get("id").unwrap_or_default(),
            spelling: row.try_get("spelling").unwrap_or_default(),
            phonetic: row.try_get("phonetic").unwrap_or_default(),
            meanings: row.try_get::<Vec<String>, _>("meanings").unwrap_or_default(),
            examples: row.try_get::<Vec<String>, _>("examples").unwrap_or_default(),
        },
        score: row.try_get::<f64, _>("score").unwrap_or(0.0),
        mastery_level,
        accuracy: round_two(row.try_get::<f64, _>("accuracy").unwrap_or(0.0)),
        review_count,
        last_review_date: last_review.map(crate::auth::format_naive_datetime_iso_millis),
        next_review_date: next_review.map(crate::auth::format_naive_datetime_iso_millis),
        state: row.try_get("state").unwrap_or_else(|_| "NEW".to_string()),
    }
}

fn map_user_word_sqlite(row: sqlx::sqlite::SqliteRow) -> UserWordItem {
    let meanings_raw: String = row.try_get("meanings").unwrap_or_else(|_| "[]".to_string());
    let examples_raw: String = row.try_get("examples").unwrap_or_else(|_| "[]".to_string());
    let last_raw: Option<String> = row.try_get::<Option<String>, _>("lastReviewDate").ok().flatten();
    let next_raw: Option<String> = row.try_get::<Option<String>, _>("nextReviewDate").ok().flatten();

    UserWordItem {
        word: AdminWord {
            id: row.try_get("id").unwrap_or_default(),
            spelling: row.try_get("spelling").unwrap_or_default(),
            phonetic: row.try_get("phonetic").unwrap_or_default(),
            meanings: parse_json_string_array(&meanings_raw),
            examples: parse_json_string_array(&examples_raw),
        },
        score: row.try_get::<f64, _>("score").unwrap_or(0.0),
        mastery_level: row.try_get::<i64, _>("masteryLevel").unwrap_or(0),
        accuracy: round_two(row.try_get::<f64, _>("accuracy").unwrap_or(0.0)),
        review_count: row.try_get::<i64, _>("reviewCount").unwrap_or(0),
        last_review_date: last_raw.as_deref().map(format_sqlite_datetime),
        next_review_date: next_raw.as_deref().map(format_sqlite_datetime),
        state: row.try_get("state").unwrap_or_else(|_| "NEW".to_string()),
    }
}

async fn select_system_statistics_pg(pool: &sqlx::PgPool) -> Result<SystemStatistics, AdminError> {
    let row = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM "users") as "totalUsers",
          (SELECT COUNT(*) FROM "word_books") as "totalWordBooks",
          (SELECT COUNT(*) FROM "word_books" WHERE "type" = 'SYSTEM') as "systemWordBooks",
          (SELECT COUNT(*) FROM "word_books" WHERE "type" = 'USER') as "userWordBooks",
          (SELECT COUNT(*) FROM "words") as "totalWords",
          (SELECT COUNT(*) FROM "answer_records") as "totalRecords"
        "#,
    )
    .fetch_one(pool)
    .await?;

    let total_users = row.try_get::<i64, _>("totalUsers").unwrap_or(0);
    let seven_days_ago = Utc::now() - chrono::Duration::days(7);

    let active_users_row = sqlx::query(
        r#"
        SELECT COUNT(DISTINCT "userId") as "activeUsers"
        FROM "answer_records"
        WHERE "timestamp" >= $1
        "#,
    )
    .bind(seven_days_ago.naive_utc())
    .fetch_one(pool)
    .await?;

    let active_users = active_users_row.try_get::<i64, _>("activeUsers").unwrap_or(0);

    Ok(SystemStatistics {
        total_users,
        active_users,
        total_word_books: row.try_get::<i64, _>("totalWordBooks").unwrap_or(0),
        system_word_books: row.try_get::<i64, _>("systemWordBooks").unwrap_or(0),
        user_word_books: row.try_get::<i64, _>("userWordBooks").unwrap_or(0),
        total_words: row.try_get::<i64, _>("totalWords").unwrap_or(0),
        total_records: row.try_get::<i64, _>("totalRecords").unwrap_or(0),
    })
}

async fn select_system_statistics_sqlite(pool: &sqlx::SqlitePool) -> Result<SystemStatistics, AdminError> {
    let row = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM "users") as "totalUsers",
          (SELECT COUNT(*) FROM "word_books") as "totalWordBooks",
          (SELECT COUNT(*) FROM "word_books" WHERE "type" = 'SYSTEM') as "systemWordBooks",
          (SELECT COUNT(*) FROM "word_books" WHERE "type" = 'USER') as "userWordBooks",
          (SELECT COUNT(*) FROM "words") as "totalWords",
          (SELECT COUNT(*) FROM "answer_records") as "totalRecords"
        "#,
    )
    .fetch_one(pool)
    .await?;

    let total_users = row.try_get::<i64, _>("totalUsers").unwrap_or(0);
    let seven_days_ago = Utc::now() - chrono::Duration::days(7);
    let seven_days_ago_str = crate::auth::format_naive_datetime_iso_millis(seven_days_ago.naive_utc());

    let active_users_row = sqlx::query(
        r#"
        SELECT COUNT(DISTINCT "userId") as "activeUsers"
        FROM "answer_records"
        WHERE "timestamp" >= ?
        "#,
    )
    .bind(&seven_days_ago_str)
    .fetch_one(pool)
    .await?;

    let active_users = active_users_row.try_get::<i64, _>("activeUsers").unwrap_or(0);

    Ok(SystemStatistics {
        total_users,
        active_users,
        total_word_books: row.try_get::<i64, _>("totalWordBooks").unwrap_or(0),
        system_word_books: row.try_get::<i64, _>("systemWordBooks").unwrap_or(0),
        user_word_books: row.try_get::<i64, _>("userWordBooks").unwrap_or(0),
        total_words: row.try_get::<i64, _>("totalWords").unwrap_or(0),
        total_records: row.try_get::<i64, _>("totalRecords").unwrap_or(0),
    })
}
