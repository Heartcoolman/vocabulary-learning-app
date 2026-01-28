use std::collections::HashMap;

use chrono::{NaiveDateTime, Utc};
use serde::Serialize;
use sqlx::{QueryBuilder, Row};

use crate::db::DatabaseProxy;

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
    params: ListUsersParams,
) -> Result<UserListResult, AdminError> {
    let page = params.page.max(1);
    let page_size = params.page_size.clamp(1, 200);
    let offset = (page - 1) * page_size;
    let search = normalize_search(params.search.as_deref());

    let pool = proxy.pool();

    let total = count_users_pg(pool, search.as_deref()).await?;

    let users = if total == 0 {
        Vec::new()
    } else {
        select_users_pg(pool, search.as_deref(), page_size, offset).await?
    };

    Ok(UserListResult {
        users,
        total,
        pagination: build_pagination(page, page_size, total),
    })
}

pub async fn get_user_by_id(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<UserDetail, AdminError> {
    let pool = proxy.pool();
    select_user_detail_pg(pool, user_id).await
}

pub async fn update_user_role(
    proxy: &DatabaseProxy,
    user_id: &str,
    role: &str,
) -> Result<UpdateUserRoleResult, AdminError> {
    let normalized = role.trim().to_ascii_uppercase();
    if normalized != "USER" && normalized != "ADMIN" && normalized != "BANNED" {
        return Err(AdminError::Validation(
            "role 必须为 USER / ADMIN / BANNED".to_string(),
        ));
    }

    let pool = proxy.pool();

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
    .fetch_optional(pool)
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

pub async fn delete_user(proxy: &DatabaseProxy, user_id: &str) -> Result<(), AdminError> {
    let role = select_user_role(proxy, user_id).await?;
    let Some(role) = role else {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    };
    if role == "ADMIN" {
        return Err(AdminError::Forbidden("不能删除管理员账户".to_string()));
    }

    let pool = proxy.pool();

    let result = sqlx::query(r#"DELETE FROM "users" WHERE "id" = $1"#)
        .bind(user_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AdminError::NotFound("用户不存在".to_string()));
    }

    Ok(())
}

pub async fn get_user_learning_data(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<UserLearningData, AdminError> {
    let _limit = limit.clamp(1, 100);
    let user = select_basic_user(proxy, user_id).await?;

    let (total_records, correct_records, total_words_learned) =
        select_learning_counts(proxy, user_id).await?;

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
    user_id: &str,
) -> Result<UserDetailedStatistics, AdminError> {
    let user = select_basic_user_with_role(proxy, user_id).await?;

    let (total_records, correct_records, total_words_learned, average_score) =
        select_statistics_aggregates(proxy, user_id).await?;

    let accuracy = if total_records > 0 {
        round_two((correct_records as f64 / total_records as f64) * 100.0)
    } else {
        0.0
    };

    let mastery_distribution = select_mastery_distribution(proxy, user_id).await?;

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
    user_id: &str,
    params: UserWordsParams,
) -> Result<UserWordsResult, AdminError> {
    let page = params.page.max(1);
    let page_size = params.page_size.clamp(1, 200);
    let offset = (page - 1) * page_size;

    let normalized_state = match params.state.as_deref() {
        Some(value) => Some(validate_word_state(value)?),
        None => None,
    };

    if let Some(level) = params.mastery_level {
        if !(0..=5).contains(&level) {
            return Err(AdminError::Validation(
                "masteryLevel 参数不合法".to_string(),
            ));
        }
    }

    let search = normalize_search(params.search.as_deref());

    let pool = proxy.pool();

    let total = count_user_words_pg(
        pool,
        user_id,
        normalized_state.as_deref(),
        search.as_deref(),
    )
    .await?;

    let words = if total == 0 {
        Vec::new()
    } else {
        select_user_words_pg(
            pool,
            user_id,
            &params,
            normalized_state.as_deref(),
            search.as_deref(),
            page_size,
            offset,
        )
        .await?
    };

    Ok(UserWordsResult {
        words,
        pagination: build_pagination(page, page_size, total),
    })
}

pub async fn get_user_decisions(
    _proxy: &DatabaseProxy,
    _user_id: &str,
    params: UserDecisionsParams,
) -> Result<UserDecisionsResult, AdminError> {
    let page = params.page.max(1);
    let page_size = params.page_size.clamp(1, 100);

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

pub async fn get_system_statistics(proxy: &DatabaseProxy) -> Result<SystemStatistics, AdminError> {
    let pool = proxy.pool();
    select_system_statistics_pg(pool).await
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

fn validate_word_state(value: &str) -> Result<String, AdminError> {
    let normalized = value.trim().to_ascii_uppercase();
    match normalized.as_str() {
        "NEW" | "LEARNING" | "REVIEWING" | "MASTERED" => Ok(normalized),
        _ => Err(AdminError::Validation("state 参数不合法".to_string())),
    }
}

async fn count_users_pg(pool: &sqlx::PgPool, search: Option<&str>) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT COUNT(*) as "count" FROM "users" u WHERE 1=1"#,
    );
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

fn map_user_list_item_pg(row: sqlx::postgres::PgRow) -> UserListItem {
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let last_learning_time: Option<NaiveDateTime> = row
        .try_get::<Option<NaiveDateTime>, _>("lastLearningTime")
        .ok()
        .flatten();

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

async fn select_user_detail_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
) -> Result<UserDetail, AdminError> {
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
        count: UserDetailCounts {
            word_books,
            records,
        },
    })
}

async fn select_user_role(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<String>, AdminError> {
    let pool = proxy.pool();

    let row = sqlx::query(r#"SELECT "role"::text as "role" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    Ok(row.and_then(|r| r.try_get::<String, _>("role").ok()))
}

async fn select_basic_user(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<BasicUserInfo, AdminError> {
    let pool = proxy.pool();

    let row = sqlx::query(r#"SELECT "id","email","username" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
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

async fn select_basic_user_with_role(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<BasicUserInfoWithRole, AdminError> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT "id","email","username","role"::text as "role","createdAt"
        FROM "users"
        WHERE "id" = $1
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

    Ok(BasicUserInfoWithRole {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
    })
}

async fn select_learning_counts(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<(i64, i64, i64), AdminError> {
    let pool = proxy.pool();

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
    .fetch_one(pool)
    .await?;

    let total = row.try_get::<i64, _>("total").unwrap_or(0);
    let correct = row.try_get::<i64, _>("correct").unwrap_or(0);
    let distinct_words = row.try_get::<i64, _>("distinctWords").unwrap_or(0);
    Ok((total, correct, distinct_words))
}

async fn select_statistics_aggregates(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<(i64, i64, i64, f64), AdminError> {
    let (total_records, correct_records, total_words_learned) =
        select_learning_counts(proxy, user_id).await?;

    let pool = proxy.pool();

    let row = sqlx::query(
        r#"SELECT COALESCE(AVG("totalScore"), 0) as "avg" FROM "word_scores" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let average_score = row.try_get::<f64, _>("avg").unwrap_or(0.0);

    Ok((
        total_records,
        correct_records,
        total_words_learned,
        average_score,
    ))
}

async fn select_mastery_distribution(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<MasteryDistribution, AdminError> {
    let pool = proxy.pool();

    let mut dist = MasteryDistribution {
        level0: 0,
        level1: 0,
        level2: 0,
        level3: 0,
        level4: 0,
        level5: 0,
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
    .fetch_all(pool)
    .await?;

    for row in rows {
        let level = row.try_get::<i32, _>("masteryLevel").unwrap_or(0) as i64;
        let count = row.try_get::<i64, _>("count").unwrap_or(0);
        apply_mastery_bucket(&mut dist, level, count);
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

fn map_user_word_pg(row: sqlx::postgres::PgRow) -> UserWordItem {
    let mastery_level = row.try_get::<i32, _>("masteryLevel").unwrap_or(0) as i64;
    let review_count = row.try_get::<i32, _>("reviewCount").unwrap_or(0) as i64;
    let last_review: Option<NaiveDateTime> = row
        .try_get::<Option<NaiveDateTime>, _>("lastReviewDate")
        .ok()
        .flatten();
    let next_review: Option<NaiveDateTime> = row
        .try_get::<Option<NaiveDateTime>, _>("nextReviewDate")
        .ok()
        .flatten();

    UserWordItem {
        word: AdminWord {
            id: row.try_get("id").unwrap_or_default(),
            spelling: row.try_get("spelling").unwrap_or_default(),
            phonetic: row.try_get("phonetic").unwrap_or_default(),
            meanings: row
                .try_get::<Vec<String>, _>("meanings")
                .unwrap_or_default(),
            examples: row
                .try_get::<Vec<String>, _>("examples")
                .unwrap_or_default(),
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

    let active_users = active_users_row
        .try_get::<i64, _>("activeUsers")
        .unwrap_or(0);

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreHistoryItem {
    pub timestamp: String,
    pub score: f64,
    pub mastery_level: Option<i32>,
    pub is_correct: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordScoreHistoryResult {
    pub current_score: f64,
    pub score_history: Vec<ScoreHistoryItem>,
}

pub async fn get_word_score_history(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<WordScoreHistoryResult, AdminError> {
    let pool = proxy.pool();

    let current_score = sqlx::query_scalar::<_, f64>(
        r#"SELECT COALESCE("totalScore", 0) FROM "word_scores" WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await?
    .unwrap_or(0.0);

    let rows = sqlx::query(
        r#"
        SELECT ar."timestamp", ar."isCorrect",
               COALESCE(ws."totalScore", 0) as score,
               wls."masteryLevel"
        FROM "answer_records" ar
        LEFT JOIN "word_scores" ws ON ws."userId" = ar."userId" AND ws."wordId" = ar."wordId"
        LEFT JOIN "word_learning_states" wls ON wls."userId" = ar."userId" AND wls."wordId" = ar."wordId"
        WHERE ar."userId" = $1 AND ar."wordId" = $2
        ORDER BY ar."timestamp" DESC
        LIMIT 50
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_all(pool)
    .await?;

    let score_history = rows
        .into_iter()
        .map(|row| {
            let ts: NaiveDateTime = row
                .try_get("timestamp")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            ScoreHistoryItem {
                timestamp: crate::auth::format_naive_datetime_iso_millis(ts),
                score: row.try_get::<f64, _>("score").unwrap_or(0.0),
                mastery_level: row.try_get::<Option<i32>, _>("masteryLevel").ok().flatten(),
                is_correct: row.try_get("isCorrect").unwrap_or(false),
            }
        })
        .collect();

    Ok(WordScoreHistoryResult {
        current_score,
        score_history,
    })
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagAnomalyRequest {
    pub reason: String,
    pub notes: Option<String>,
    pub record_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnomalyFlag {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub record_id: Option<String>,
    pub reason: String,
    pub notes: Option<String>,
    pub flagged_by: String,
    pub flagged_at: String,
}

pub async fn create_anomaly_flag(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    flagged_by: &str,
    request: FlagAnomalyRequest,
) -> Result<AnomalyFlag, AdminError> {
    let pool = proxy.pool();
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO "anomaly_flags" ("id", "userId", "wordId", "recordId", "reason", "notes", "flaggedBy", "flaggedAt", "status", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $8)
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(word_id)
    .bind(&request.record_id)
    .bind(&request.reason)
    .bind(&request.notes)
    .bind(flagged_by)
    .bind(now.naive_utc())
    .execute(pool)
    .await
    .map_err(|e| AdminError::Mutation(format!("创建异常标记失败: {e}")))?;

    Ok(AnomalyFlag {
        id,
        user_id: user_id.to_string(),
        word_id: word_id.to_string(),
        record_id: request.record_id,
        reason: request.reason,
        notes: request.notes,
        flagged_by: flagged_by.to_string(),
        flagged_at: now.to_rfc3339(),
    })
}

pub async fn get_anomaly_flags(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<Vec<AnomalyFlag>, AdminError> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT "id", "userId", "wordId", "recordId", "reason", "notes", "flaggedBy", "flaggedAt"
        FROM "anomaly_flags"
        WHERE "userId" = $1 AND "wordId" = $2 AND "status" = 'active'
        ORDER BY "flaggedAt" DESC
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let flagged_at: NaiveDateTime = row
                .try_get("flaggedAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            AnomalyFlag {
                id: row.try_get("id").unwrap_or_default(),
                user_id: row.try_get("userId").unwrap_or_default(),
                word_id: row.try_get("wordId").unwrap_or_default(),
                record_id: row.try_get("recordId").ok(),
                reason: row.try_get("reason").unwrap_or_default(),
                notes: row.try_get("notes").ok(),
                flagged_by: row.try_get("flaggedBy").unwrap_or_default(),
                flagged_at: crate::auth::format_naive_datetime_iso_millis(flagged_at),
            }
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapItem {
    pub date: String,
    pub activity_count: i64,
    pub correct_count: i64,
    pub words_learned: i64,
    pub average_score: f64,
}

pub async fn get_user_heatmap(
    proxy: &DatabaseProxy,
    user_id: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<HeatmapItem>, AdminError> {
    let pool = proxy.pool();

    let start = start_date
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| (Utc::now() - chrono::Duration::days(365)).date_naive());
    let end = end_date
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());

    let rows = sqlx::query(
        r#"
        SELECT
            DATE("timestamp") as "date",
            COUNT(*) as "activityCount",
            COUNT(*) FILTER (WHERE "isCorrect" = true) as "correctCount",
            COUNT(DISTINCT "wordId") as "wordsLearned",
            CASE WHEN COUNT(*) > 0
                THEN (SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END)::double precision * 100 / COUNT(*)::double precision)
                ELSE 0
            END as "avgScore"
        FROM "answer_records"
        WHERE "userId" = $1 AND DATE("timestamp") BETWEEN $2 AND $3
        GROUP BY DATE("timestamp")
        ORDER BY "date" ASC
        "#,
    )
    .bind(user_id)
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let date: chrono::NaiveDate = row
                .try_get("date")
                .unwrap_or_else(|_| Utc::now().date_naive());
            HeatmapItem {
                date: date.to_string(),
                activity_count: row.try_get::<i64, _>("activityCount").unwrap_or(0),
                correct_count: row.try_get::<i64, _>("correctCount").unwrap_or(0),
                words_learned: row.try_get::<i64, _>("wordsLearned").unwrap_or(0),
                average_score: row.try_get::<f64, _>("avgScore").unwrap_or(0.0),
            }
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWordDetailResult {
    pub word: AdminWord,
    pub state: String,
    pub score: f64,
    pub mastery_level: i32,
    pub review_count: i32,
    pub correct_count: i32,
    pub accuracy: f64,
    pub last_review_date: Option<String>,
    pub next_review_date: Option<String>,
    pub first_learned_at: Option<String>,
    pub total_time_spent_ms: i64,
}

pub async fn get_user_word_detail(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<UserWordDetailResult, AdminError> {
    let pool = proxy.pool();

    let word_row = sqlx::query(
        r#"
        SELECT "id", "spelling", "phonetic", "meanings", "examples"
        FROM "words" WHERE "id" = $1
        "#,
    )
    .bind(word_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AdminError::NotFound("单词不存在".to_string()))?;

    let word = AdminWord {
        id: word_row.try_get("id").unwrap_or_default(),
        spelling: word_row.try_get("spelling").unwrap_or_default(),
        phonetic: word_row.try_get("phonetic").unwrap_or_default(),
        meanings: word_row
            .try_get::<serde_json::Value, _>("meanings")
            .ok()
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
        examples: word_row
            .try_get::<serde_json::Value, _>("examples")
            .ok()
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
    };

    let state_row = sqlx::query(
        r#"
        SELECT "state"::text as "state", "masteryLevel", "reviewCount", "lastReviewDate", "nextReviewDate", "createdAt"
        FROM "word_learning_states"
        WHERE "userId" = $1 AND "wordId" = $2
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await?;

    let score_row = sqlx::query(
        r#"SELECT "totalScore", "recentAccuracy" FROM "word_scores" WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await?;

    let stats_row = sqlx::query(
        r#"
        SELECT
            COUNT(*) as "totalCount",
            COUNT(*) FILTER (WHERE "isCorrect" = true) as "correctCount",
            COALESCE(SUM("responseTimeMs"), 0) as "totalTime"
        FROM "answer_records"
        WHERE "userId" = $1 AND "wordId" = $2
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_one(pool)
    .await?;

    let (state, mastery_level, review_count, last_review, next_review, first_learned) =
        match state_row {
            Some(row) => {
                let last: Option<NaiveDateTime> = row.try_get("lastReviewDate").ok();
                let next: Option<NaiveDateTime> = row.try_get("nextReviewDate").ok();
                let created: Option<NaiveDateTime> = row.try_get("createdAt").ok();
                (
                    row.try_get::<String, _>("state")
                        .unwrap_or_else(|_| "NEW".to_string()),
                    row.try_get::<i32, _>("masteryLevel").unwrap_or(0),
                    row.try_get::<i32, _>("reviewCount").unwrap_or(0),
                    last.map(crate::auth::format_naive_datetime_iso_millis),
                    next.map(crate::auth::format_naive_datetime_iso_millis),
                    created.map(crate::auth::format_naive_datetime_iso_millis),
                )
            }
            None => ("NEW".to_string(), 0, 0, None, None, None),
        };

    let score = score_row
        .as_ref()
        .and_then(|r| r.try_get::<f64, _>("totalScore").ok())
        .unwrap_or(0.0);
    let recent_accuracy = score_row
        .as_ref()
        .and_then(|r| r.try_get::<f64, _>("recentAccuracy").ok())
        .unwrap_or(0.0);

    let total_count = stats_row.try_get::<i64, _>("totalCount").unwrap_or(0);
    let correct_count = stats_row.try_get::<i64, _>("correctCount").unwrap_or(0);
    let total_time = stats_row.try_get::<i64, _>("totalTime").unwrap_or(0);

    Ok(UserWordDetailResult {
        word,
        state,
        score,
        mastery_level,
        review_count,
        correct_count: correct_count as i32,
        accuracy: if total_count > 0 {
            recent_accuracy * 100.0
        } else {
            0.0
        },
        last_review_date: last_review,
        next_review_date: next_review,
        first_learned_at: first_learned,
        total_time_spent_ms: total_time,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordHistoryItem {
    pub id: String,
    pub timestamp: String,
    pub answer_type: String,
    pub is_correct: bool,
    pub score: f64,
    pub response_time_ms: i64,
    pub mastery_level_after: Option<i32>,
}

pub async fn get_word_history(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    limit: i64,
) -> Result<Vec<WordHistoryItem>, AdminError> {
    let pool = proxy.pool();
    let limit = limit.clamp(1, 200);

    let rows = sqlx::query(
        r#"
        SELECT
            ar."id",
            ar."timestamp",
            'quiz' as "answerType",
            ar."isCorrect",
            COALESCE(ws."totalScore", 0) as "score",
            COALESCE(ar."responseTime", 0) as "responseTimeMs",
            wls."masteryLevel"
        FROM "answer_records" ar
        LEFT JOIN "word_learning_states" wls ON wls."userId" = ar."userId" AND wls."wordId" = ar."wordId"
        LEFT JOIN "word_scores" ws ON ws."userId" = ar."userId" AND ws."wordId" = ar."wordId"
        WHERE ar."userId" = $1 AND ar."wordId" = $2
        ORDER BY ar."timestamp" DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let ts: NaiveDateTime = row
                .try_get("timestamp")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            WordHistoryItem {
                id: row.try_get("id").unwrap_or_default(),
                timestamp: crate::auth::format_naive_datetime_iso_millis(ts),
                answer_type: row
                    .try_get("answerType")
                    .unwrap_or_else(|_| "unknown".to_string()),
                is_correct: row.try_get("isCorrect").unwrap_or(false),
                score: row.try_get("score").unwrap_or(0.0),
                response_time_ms: row.try_get("responseTimeMs").unwrap_or(0),
                mastery_level_after: row.try_get("masteryLevel").ok(),
            }
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWordItem {
    pub word_id: String,
    pub spelling: String,
    pub phonetic: Option<String>,
    pub state: String,
    pub score: f64,
    pub mastery_level: i32,
    pub review_count: i32,
    pub accuracy: f64,
    pub last_review_date: Option<String>,
}

pub async fn export_user_words(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<ExportWordItem>, AdminError> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT
            w."id" as "wordId",
            w."spelling",
            w."phonetic",
            wls."state"::text as "state",
            COALESCE(ws."totalScore", 0) as "score",
            wls."masteryLevel",
            wls."reviewCount",
            COALESCE(ws."recentAccuracy", 0) as "accuracy",
            wls."lastReviewDate"
        FROM "word_learning_states" wls
        JOIN "words" w ON w."id" = wls."wordId"
        LEFT JOIN "word_scores" ws ON ws."userId" = wls."userId" AND ws."wordId" = wls."wordId"
        WHERE wls."userId" = $1
        ORDER BY w."spelling" ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let last_review: Option<NaiveDateTime> = row.try_get("lastReviewDate").ok();
            ExportWordItem {
                word_id: row.try_get("wordId").unwrap_or_default(),
                spelling: row.try_get("spelling").unwrap_or_default(),
                phonetic: row.try_get("phonetic").ok(),
                state: row.try_get("state").unwrap_or_else(|_| "NEW".to_string()),
                score: row.try_get("score").unwrap_or(0.0),
                mastery_level: row.try_get("masteryLevel").unwrap_or(0),
                review_count: row.try_get("reviewCount").unwrap_or(0),
                accuracy: row.try_get::<f64, _>("accuracy").unwrap_or(0.0) * 100.0,
                last_review_date: last_review.map(crate::auth::format_naive_datetime_iso_millis),
            }
        })
        .collect())
}
