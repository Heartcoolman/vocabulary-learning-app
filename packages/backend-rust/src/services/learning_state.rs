use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

// ========== Types ==========

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WordState {
    New,
    Learning,
    Reviewing,
    Mastered,
}

impl Default for WordState {
    fn default() -> Self { Self::New }
}

impl WordState {
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "LEARNING" => Self::Learning,
            "REVIEWING" => Self::Reviewing,
            "MASTERED" => Self::Mastered,
            _ => Self::New,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::New => "NEW",
            Self::Learning => "LEARNING",
            Self::Reviewing => "REVIEWING",
            Self::Mastered => "MASTERED",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordLearningState {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub state: WordState,
    pub mastery_level: i32,
    pub ease_factor: f64,
    pub review_count: i32,
    pub last_review_date: Option<i64>,
    pub next_review_date: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordScore {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub score: f64,
    pub correct_count: i32,
    pub incorrect_count: i32,
    pub total_response_time: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryEvaluation {
    pub word_id: String,
    pub score: f64,
    pub recall_probability: f64,
    pub stability: f64,
    pub confidence: f64,
    pub is_mastered: bool,
    pub needs_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteWordState {
    pub learning_state: Option<WordLearningState>,
    pub score: Option<WordScore>,
    pub mastery: Option<MasteryEvaluation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStats {
    pub total_words: i64,
    pub new_words: i64,
    pub learning_words: i64,
    pub reviewing_words: i64,
    pub mastered_words: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMasteryStats {
    pub total_words: i64,
    pub mastered_words: i64,
    pub learning_words: i64,
    pub new_words: i64,
    pub average_score: f64,
    pub average_recall: f64,
    pub need_review_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreStats {
    pub average_score: f64,
    pub high_score_count: i64,
    pub medium_score_count: i64,
    pub low_score_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserLearningStats {
    pub state_stats: UserStats,
    pub score_stats: ScoreStats,
    pub mastery_stats: UserMasteryStats,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordStateUpdateData {
    pub state: Option<WordState>,
    pub mastery_level: Option<i32>,
    pub ease_factor: Option<f64>,
    pub review_count: Option<i32>,
    pub last_review_date: Option<i64>,
    pub next_review_date: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewEventInput {
    pub timestamp: i64,
    pub is_correct: bool,
    pub response_time: i64,
}

pub enum SelectedPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

// ========== Service Implementation ==========

pub async fn select_pool(proxy: &DatabaseProxy, state: DatabaseState) -> Result<SelectedPool, String> {
    match state {
        DatabaseState::Degraded | DatabaseState::Unavailable => proxy
            .fallback_pool().await
            .map(SelectedPool::Fallback)
            .ok_or_else(|| "服务不可用".to_string()),
        _ => match proxy.primary_pool().await {
            Some(pool) => Ok(SelectedPool::Primary(pool)),
            None => proxy.fallback_pool().await
                .map(SelectedPool::Fallback)
                .ok_or_else(|| "服务不可用".to_string()),
        },
    }
}

pub async fn get_word_state(
    pool: &SelectedPool,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordLearningState>, String> {
    match pool {
        SelectedPool::Primary(pg) => get_word_state_pg(pg, user_id, word_id).await,
        SelectedPool::Fallback(sqlite) => get_word_state_sqlite(sqlite, user_id, word_id).await,
    }
}

async fn get_word_state_pg(pool: &PgPool, user_id: &str, word_id: &str) -> Result<Option<WordLearningState>, String> {
    let row = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
           "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt"
           FROM "word_learning_states" WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    Ok(Some(parse_learning_state_pg(&row)?))
}

async fn get_word_state_sqlite(pool: &SqlitePool, user_id: &str, word_id: &str) -> Result<Option<WordLearningState>, String> {
    let row = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
           "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt"
           FROM "word_learning_states" WHERE "userId" = ? AND "wordId" = ?"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    Ok(Some(parse_learning_state_sqlite(&row)?))
}

fn parse_learning_state_pg(row: &sqlx::postgres::PgRow) -> Result<WordLearningState, String> {
    Ok(WordLearningState {
        id: row.try_get("id").map_err(|e| format!("解析失败: {e}"))?,
        user_id: row.try_get("userId").map_err(|e| format!("解析失败: {e}"))?,
        word_id: row.try_get("wordId").map_err(|e| format!("解析失败: {e}"))?,
        state: WordState::from_str(row.try_get::<String, _>("state").unwrap_or_default().as_str()),
        mastery_level: row.try_get("masteryLevel").unwrap_or(0),
        ease_factor: row.try_get("easeFactor").unwrap_or(2.5),
        review_count: row.try_get("reviewCount").unwrap_or(0),
        last_review_date: row.try_get::<Option<DateTime<Utc>>, _>("lastReviewDate").ok().flatten().map(|d| d.timestamp_millis()),
        next_review_date: row.try_get::<Option<DateTime<Utc>>, _>("nextReviewDate").ok().flatten().map(|d| d.timestamp_millis()),
        created_at: row.try_get::<DateTime<Utc>, _>("createdAt").map(|d| d.timestamp_millis()).unwrap_or_else(|_| Utc::now().timestamp_millis()),
        updated_at: row.try_get::<DateTime<Utc>, _>("updatedAt").map(|d| d.timestamp_millis()).unwrap_or_else(|_| Utc::now().timestamp_millis()),
    })
}

fn parse_learning_state_sqlite(row: &sqlx::sqlite::SqliteRow) -> Result<WordLearningState, String> {
    Ok(WordLearningState {
        id: row.try_get("id").map_err(|e| format!("解析失败: {e}"))?,
        user_id: row.try_get("userId").map_err(|e| format!("解析失败: {e}"))?,
        word_id: row.try_get("wordId").map_err(|e| format!("解析失败: {e}"))?,
        state: WordState::from_str(row.try_get::<String, _>("state").unwrap_or_default().as_str()),
        mastery_level: row.try_get("masteryLevel").unwrap_or(0),
        ease_factor: row.try_get("easeFactor").unwrap_or(2.5),
        review_count: row.try_get("reviewCount").unwrap_or(0),
        last_review_date: parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("lastReviewDate").ok().flatten()),
        next_review_date: parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("nextReviewDate").ok().flatten()),
        created_at: parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("createdAt").ok().flatten()).unwrap_or_else(|| Utc::now().timestamp_millis()),
        updated_at: parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("updatedAt").ok().flatten()).unwrap_or_else(|| Utc::now().timestamp_millis()),
    })
}

fn parse_datetime_sqlite(s: Option<String>) -> Option<DateTime<Utc>> {
    s.and_then(|v| chrono::DateTime::parse_from_rfc3339(&v).ok().map(|d| d.with_timezone(&Utc)))
}

fn parse_datetime_sqlite_ms(s: Option<String>) -> Option<i64> {
    parse_datetime_sqlite(s).map(|d| d.timestamp_millis())
}

pub async fn get_user_stats(pool: &SelectedPool, user_id: &str) -> Result<UserStats, String> {
    match pool {
        SelectedPool::Primary(pg) => get_user_stats_pg(pg, user_id).await,
        SelectedPool::Fallback(sqlite) => get_user_stats_sqlite(sqlite, user_id).await,
    }
}

async fn get_user_stats_pg(pool: &PgPool, user_id: &str) -> Result<UserStats, String> {
    let row = sqlx::query(
        r#"SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE "state" = 'NEW') as new_count,
           COUNT(*) FILTER (WHERE "state" = 'LEARNING') as learning_count,
           COUNT(*) FILTER (WHERE "state" = 'REVIEWING') as reviewing_count,
           COUNT(*) FILTER (WHERE "state" = 'MASTERED') as mastered_count
           FROM "word_learning_states" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(UserStats {
        total_words: row.try_get("total").unwrap_or(0),
        new_words: row.try_get("new_count").unwrap_or(0),
        learning_words: row.try_get("learning_count").unwrap_or(0),
        reviewing_words: row.try_get("reviewing_count").unwrap_or(0),
        mastered_words: row.try_get("mastered_count").unwrap_or(0),
    })
}

async fn get_user_stats_sqlite(pool: &SqlitePool, user_id: &str) -> Result<UserStats, String> {
    let row = sqlx::query(
        r#"SELECT
           COUNT(*) as total,
           SUM(CASE WHEN "state" = 'NEW' THEN 1 ELSE 0 END) as new_count,
           SUM(CASE WHEN "state" = 'LEARNING' THEN 1 ELSE 0 END) as learning_count,
           SUM(CASE WHEN "state" = 'REVIEWING' THEN 1 ELSE 0 END) as reviewing_count,
           SUM(CASE WHEN "state" = 'MASTERED' THEN 1 ELSE 0 END) as mastered_count
           FROM "word_learning_states" WHERE "userId" = ?"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(UserStats {
        total_words: row.try_get("total").unwrap_or(0),
        new_words: row.try_get("new_count").unwrap_or(0),
        learning_words: row.try_get("learning_count").unwrap_or(0),
        reviewing_words: row.try_get("reviewing_count").unwrap_or(0),
        mastered_words: row.try_get("mastered_count").unwrap_or(0),
    })
}

pub async fn get_due_words(
    pool: &SelectedPool,
    user_id: &str,
    limit: i32,
) -> Result<Vec<WordLearningState>, String> {
    let now = Utc::now();
    let _now_ms = now.timestamp_millis();
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
                   "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt"
                   FROM "word_learning_states"
                   WHERE "userId" = $1 AND "nextReviewDate" <= $2
                   ORDER BY "nextReviewDate" ASC LIMIT $3"#,
            )
            .bind(user_id)
            .bind(now)
            .bind(limit)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            rows.iter().map(parse_learning_state_pg).collect()
        }
        SelectedPool::Fallback(sqlite) => {
            let now_str = now.to_rfc3339();
            let rows = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
                   "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt"
                   FROM "word_learning_states"
                   WHERE "userId" = ? AND "nextReviewDate" <= ?
                   ORDER BY "nextReviewDate" ASC LIMIT ?"#,
            )
            .bind(user_id)
            .bind(&now_str)
            .bind(limit)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            rows.iter().map(parse_learning_state_sqlite).collect()
        }
    }
}

pub async fn get_words_by_state(
    pool: &SelectedPool,
    user_id: &str,
    state: WordState,
    limit: i32,
) -> Result<Vec<WordLearningState>, String> {
    let state_str = state.as_str();
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
                   "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt"
                   FROM "word_learning_states"
                   WHERE "userId" = $1 AND "state" = $2 LIMIT $3"#,
            )
            .bind(user_id)
            .bind(state_str)
            .bind(limit)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            rows.iter().map(parse_learning_state_pg).collect()
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
                   "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt"
                   FROM "word_learning_states"
                   WHERE "userId" = ? AND "state" = ? LIMIT ?"#,
            )
            .bind(user_id)
            .bind(state_str)
            .bind(limit)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            rows.iter().map(parse_learning_state_sqlite).collect()
        }
    }
}

pub async fn get_word_score(
    pool: &SelectedPool,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordScore>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "score", "correctCount", "incorrectCount",
                   "totalResponseTime", "updatedAt"
                   FROM "word_scores" WHERE "userId" = $1 AND "wordId" = $2"#,
            )
            .bind(user_id)
            .bind(word_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            let Some(row) = row else { return Ok(None) };
            Ok(Some(WordScore {
                id: row.try_get("id").unwrap_or_default(),
                user_id: row.try_get("userId").unwrap_or_default(),
                word_id: row.try_get("wordId").unwrap_or_default(),
                score: row.try_get("score").unwrap_or(0.0),
                correct_count: row.try_get("correctCount").unwrap_or(0),
                incorrect_count: row.try_get("incorrectCount").unwrap_or(0),
                total_response_time: row.try_get("totalResponseTime").unwrap_or(0),
                updated_at: row.try_get::<DateTime<Utc>, _>("updatedAt").map(|d| d.timestamp_millis()).unwrap_or_else(|_| Utc::now().timestamp_millis()),
            }))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "score", "correctCount", "incorrectCount",
                   "totalResponseTime", "updatedAt"
                   FROM "word_scores" WHERE "userId" = ? AND "wordId" = ?"#,
            )
            .bind(user_id)
            .bind(word_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            let Some(row) = row else { return Ok(None) };
            Ok(Some(WordScore {
                id: row.try_get("id").unwrap_or_default(),
                user_id: row.try_get("userId").unwrap_or_default(),
                word_id: row.try_get("wordId").unwrap_or_default(),
                score: row.try_get("score").unwrap_or(0.0),
                correct_count: row.try_get("correctCount").unwrap_or(0),
                incorrect_count: row.try_get("incorrectCount").unwrap_or(0),
                total_response_time: row.try_get("totalResponseTime").unwrap_or(0),
                updated_at: parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("updatedAt").ok().flatten()).unwrap_or_else(|| Utc::now().timestamp_millis()),
            }))
        }
    }
}

pub async fn get_low_score_words(
    pool: &SelectedPool,
    user_id: &str,
    threshold: f64,
    limit: i32,
) -> Result<Vec<WordScore>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "score", "correctCount", "incorrectCount",
                   "totalResponseTime", "updatedAt"
                   FROM "word_scores" WHERE "userId" = $1 AND "score" < $2
                   ORDER BY "score" ASC LIMIT $3"#,
            )
            .bind(user_id)
            .bind(threshold)
            .bind(limit)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().map(|row| WordScore {
                id: row.try_get("id").unwrap_or_default(),
                user_id: row.try_get("userId").unwrap_or_default(),
                word_id: row.try_get("wordId").unwrap_or_default(),
                score: row.try_get("score").unwrap_or(0.0),
                correct_count: row.try_get("correctCount").unwrap_or(0),
                incorrect_count: row.try_get("incorrectCount").unwrap_or(0),
                total_response_time: row.try_get("totalResponseTime").unwrap_or(0),
                updated_at: row.try_get::<DateTime<Utc>, _>("updatedAt").map(|d| d.timestamp_millis()).unwrap_or_else(|_| Utc::now().timestamp_millis()),
            }).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(
                r#"SELECT "id", "userId", "wordId", "score", "correctCount", "incorrectCount",
                   "totalResponseTime", "updatedAt"
                   FROM "word_scores" WHERE "userId" = ? AND "score" < ?
                   ORDER BY "score" ASC LIMIT ?"#,
            )
            .bind(user_id)
            .bind(threshold)
            .bind(limit)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().map(|row| WordScore {
                id: row.try_get("id").unwrap_or_default(),
                user_id: row.try_get("userId").unwrap_or_default(),
                word_id: row.try_get("wordId").unwrap_or_default(),
                score: row.try_get("score").unwrap_or(0.0),
                correct_count: row.try_get("correctCount").unwrap_or(0),
                incorrect_count: row.try_get("incorrectCount").unwrap_or(0),
                total_response_time: row.try_get("totalResponseTime").unwrap_or(0),
                updated_at: parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("updatedAt").ok().flatten()).unwrap_or_else(|| Utc::now().timestamp_millis()),
            }).collect())
        }
    }
}

pub async fn get_score_stats(pool: &SelectedPool, user_id: &str) -> Result<ScoreStats, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT
                   COALESCE(AVG("score"), 0) as avg_score,
                   COUNT(*) FILTER (WHERE "score" >= 80) as high_count,
                   COUNT(*) FILTER (WHERE "score" >= 40 AND "score" < 80) as medium_count,
                   COUNT(*) FILTER (WHERE "score" < 40) as low_count
                   FROM "word_scores" WHERE "userId" = $1"#,
            )
            .bind(user_id)
            .fetch_one(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            Ok(ScoreStats {
                average_score: row.try_get("avg_score").unwrap_or(0.0),
                high_score_count: row.try_get("high_count").unwrap_or(0),
                medium_score_count: row.try_get("medium_count").unwrap_or(0),
                low_score_count: row.try_get("low_count").unwrap_or(0),
            })
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT
                   COALESCE(AVG("score"), 0) as avg_score,
                   SUM(CASE WHEN "score" >= 80 THEN 1 ELSE 0 END) as high_count,
                   SUM(CASE WHEN "score" >= 40 AND "score" < 80 THEN 1 ELSE 0 END) as medium_count,
                   SUM(CASE WHEN "score" < 40 THEN 1 ELSE 0 END) as low_count
                   FROM "word_scores" WHERE "userId" = ?"#,
            )
            .bind(user_id)
            .fetch_one(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;
            Ok(ScoreStats {
                average_score: row.try_get("avg_score").unwrap_or(0.0),
                high_score_count: row.try_get("high_count").unwrap_or(0),
                medium_score_count: row.try_get("medium_count").unwrap_or(0),
                low_score_count: row.try_get("low_count").unwrap_or(0),
            })
        }
    }
}

pub async fn get_complete_word_state(
    pool: &SelectedPool,
    user_id: &str,
    word_id: &str,
    include_mastery: bool,
) -> Result<CompleteWordState, String> {
    let learning_state = get_word_state(pool, user_id, word_id).await?;
    let score = get_word_score(pool, user_id, word_id).await?;

    let mastery = if include_mastery {
        learning_state.as_ref().map(|ls| compute_mastery_evaluation(ls, score.as_ref()))
    } else {
        None
    };

    Ok(CompleteWordState { learning_state, score, mastery })
}

fn compute_mastery_evaluation(state: &WordLearningState, score: Option<&WordScore>) -> MasteryEvaluation {
    let base_score = score.map(|s| s.score).unwrap_or(50.0);
    let mastery_factor = (state.mastery_level as f64 / 10.0).min(1.0);
    let review_factor = (state.review_count as f64 / 20.0).min(1.0);
    let combined_score = base_score * 0.5 + mastery_factor * 30.0 + review_factor * 20.0;
    let recall_prob = (0.9_f64).powf(1.0 / (1.0 + state.review_count as f64 * 0.1));
    let stability = state.ease_factor / 2.5;

    MasteryEvaluation {
        word_id: state.word_id.clone(),
        score: combined_score,
        recall_probability: recall_prob.min(1.0),
        stability,
        confidence: mastery_factor,
        is_mastered: state.state == WordState::Mastered || combined_score >= 80.0,
        needs_review: state.next_review_date.map(|d| d <= Utc::now().timestamp_millis()).unwrap_or(false),
    }
}

pub async fn get_user_learning_stats(pool: &SelectedPool, user_id: &str) -> Result<UserLearningStats, String> {
    let state_stats = get_user_stats(pool, user_id).await?;
    let score_stats = get_score_stats(pool, user_id).await?;

    let mastery_stats = UserMasteryStats {
        total_words: state_stats.total_words,
        mastered_words: state_stats.mastered_words,
        learning_words: state_stats.learning_words,
        new_words: state_stats.new_words,
        average_score: score_stats.average_score,
        average_recall: 0.85,
        need_review_count: state_stats.reviewing_words,
    };

    Ok(UserLearningStats { state_stats, score_stats, mastery_stats })
}

// ========== Write Operations ==========

pub async fn upsert_word_state(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
    data: WordStateUpdateData,
) -> Result<(), String> {
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::json!(user_id));
        where_clause.insert("wordId".into(), serde_json::json!(word_id));

        let mut create = serde_json::Map::new();
        create.insert("id".into(), serde_json::json!(id));
        create.insert("userId".into(), serde_json::json!(user_id));
        create.insert("wordId".into(), serde_json::json!(word_id));
        create.insert("state".into(), serde_json::json!(data.state.map(|s| s.as_str()).unwrap_or("NEW")));
        create.insert("masteryLevel".into(), serde_json::json!(data.mastery_level.unwrap_or(0)));
        create.insert("easeFactor".into(), serde_json::json!(data.ease_factor.unwrap_or(2.5)));
        create.insert("reviewCount".into(), serde_json::json!(data.review_count.unwrap_or(0)));
        if let Some(ts) = data.last_review_date {
            create.insert("lastReviewDate".into(), serde_json::json!(DateTime::from_timestamp_millis(ts).map(|d| d.to_rfc3339())));
        }
        if let Some(ts) = data.next_review_date {
            create.insert("nextReviewDate".into(), serde_json::json!(DateTime::from_timestamp_millis(ts).map(|d| d.to_rfc3339())));
        }
        create.insert("createdAt".into(), serde_json::json!(now_str));
        create.insert("updatedAt".into(), serde_json::json!(now_str));

        let mut update = serde_json::Map::new();
        if let Some(s) = &data.state {
            update.insert("state".into(), serde_json::json!(s.as_str()));
        }
        if let Some(v) = data.mastery_level {
            update.insert("masteryLevel".into(), serde_json::json!(v));
        }
        if let Some(v) = data.ease_factor {
            update.insert("easeFactor".into(), serde_json::json!(v));
        }
        if let Some(v) = data.review_count {
            update.insert("reviewCount".into(), serde_json::json!(v));
        }
        if let Some(ts) = data.last_review_date {
            update.insert("lastReviewDate".into(), serde_json::json!(DateTime::from_timestamp_millis(ts).map(|d| d.to_rfc3339())));
        }
        if let Some(ts) = data.next_review_date {
            update.insert("nextReviewDate".into(), serde_json::json!(DateTime::from_timestamp_millis(ts).map(|d| d.to_rfc3339())));
        }
        update.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "word_learning_states".to_string(),
            r#where: where_clause,
            create,
            update,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;

    let state_str = data.state.map(|s| s.as_str()).unwrap_or("NEW");
    let mastery_level = data.mastery_level.unwrap_or(0);
    let ease_factor = data.ease_factor.unwrap_or(2.5);
    let review_count = data.review_count.unwrap_or(0);
    let last_review: Option<DateTime<Utc>> = data.last_review_date.and_then(DateTime::from_timestamp_millis);
    let next_review: Option<DateTime<Utc>> = data.next_review_date.and_then(DateTime::from_timestamp_millis);

    sqlx::query(
        r#"INSERT INTO "word_learning_states" ("id","userId","wordId","state","masteryLevel","easeFactor",
           "reviewCount","lastReviewDate","nextReviewDate","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT ("userId","wordId") DO UPDATE SET
           "state"=COALESCE($4,"word_learning_states"."state"),
           "masteryLevel"=COALESCE($5,"word_learning_states"."masteryLevel"),
           "easeFactor"=COALESCE($6,"word_learning_states"."easeFactor"),
           "reviewCount"=COALESCE($7,"word_learning_states"."reviewCount"),
           "lastReviewDate"=COALESCE($8,"word_learning_states"."lastReviewDate"),
           "nextReviewDate"=COALESCE($9,"word_learning_states"."nextReviewDate"),
           "updatedAt"=$11"#,
    )
    .bind(&id).bind(user_id).bind(word_id).bind(state_str)
    .bind(mastery_level).bind(ease_factor).bind(review_count)
    .bind(last_review).bind(next_review).bind(now).bind(now)
    .execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

pub async fn upsert_word_score(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
    score: f64,
    is_correct: bool,
    response_time: i64,
) -> Result<(), String> {
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::json!(user_id));
        where_clause.insert("wordId".into(), serde_json::json!(word_id));

        let mut create = serde_json::Map::new();
        create.insert("id".into(), serde_json::json!(id));
        create.insert("userId".into(), serde_json::json!(user_id));
        create.insert("wordId".into(), serde_json::json!(word_id));
        create.insert("score".into(), serde_json::json!(score));
        create.insert("correctCount".into(), serde_json::json!(if is_correct { 1 } else { 0 }));
        create.insert("incorrectCount".into(), serde_json::json!(if is_correct { 0 } else { 1 }));
        create.insert("totalResponseTime".into(), serde_json::json!(response_time));
        create.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "word_scores".to_string(),
            r#where: where_clause.clone(),
            create: create.clone(),
            update: create,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let correct_inc = if is_correct { 1 } else { 0 };
    let incorrect_inc = if is_correct { 0 } else { 1 };

    sqlx::query(
        r#"INSERT INTO "word_scores" ("id","userId","wordId","score","correctCount","incorrectCount","totalResponseTime","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT ("userId","wordId") DO UPDATE SET
           "score"=$4,
           "correctCount"="word_scores"."correctCount"+$5,
           "incorrectCount"="word_scores"."incorrectCount"+$6,
           "totalResponseTime"="word_scores"."totalResponseTime"+$7,
           "updatedAt"=$8"#,
    )
    .bind(&id).bind(user_id).bind(word_id).bind(score)
    .bind(correct_inc).bind(incorrect_inc).bind(response_time).bind(now)
    .execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

pub async fn record_review(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
    event: ReviewEventInput,
) -> Result<(), String> {
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let event_ts = DateTime::from_timestamp_millis(event.timestamp);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::json!(id));
        data.insert("userId".into(), serde_json::json!(user_id));
        data.insert("wordId".into(), serde_json::json!(word_id));
        data.insert("isCorrect".into(), serde_json::json!(event.is_correct));
        data.insert("responseTime".into(), serde_json::json!(event.response_time));
        data.insert("timestamp".into(), serde_json::json!(event_ts.map(|d| d.to_rfc3339()).unwrap_or(now_str.clone())));
        data.insert("createdAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "word_review_traces".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    sqlx::query(
        r#"INSERT INTO "word_review_traces" ("id","userId","wordId","isCorrect","responseTime","timestamp","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)"#,
    )
    .bind(&id).bind(user_id).bind(word_id).bind(event.is_correct)
    .bind(event.response_time).bind(event_ts.unwrap_or(now)).bind(now)
    .execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

pub async fn get_memory_trace(
    pool: &SelectedPool,
    user_id: &str,
    word_id: &str,
    limit: i32,
) -> Result<Vec<ReviewTraceRecord>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id", "timestamp", "isCorrect", "responseTime"
                   FROM "word_review_traces" WHERE "userId" = $1 AND "wordId" = $2
                   ORDER BY "timestamp" DESC LIMIT $3"#,
            )
            .bind(user_id).bind(word_id).bind(limit)
            .fetch_all(pg).await.map_err(|e| format!("查询失败: {e}"))?;

            let now = Utc::now().timestamp_millis();
            Ok(rows.iter().map(|row| {
                let ts: DateTime<Utc> = row.try_get("timestamp").unwrap_or(Utc::now());
                let ts_ms = ts.timestamp_millis();
                ReviewTraceRecord {
                    id: row.try_get("id").unwrap_or_default(),
                    timestamp: ts_ms,
                    is_correct: row.try_get("isCorrect").unwrap_or(false),
                    response_time: row.try_get("responseTime").unwrap_or(0),
                    seconds_ago: ((now - ts_ms) / 1000) as i64,
                }
            }).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(
                r#"SELECT "id", "timestamp", "isCorrect", "responseTime"
                   FROM "word_review_traces" WHERE "userId" = ? AND "wordId" = ?
                   ORDER BY "timestamp" DESC LIMIT ?"#,
            )
            .bind(user_id).bind(word_id).bind(limit)
            .fetch_all(sqlite).await.map_err(|e| format!("查询失败: {e}"))?;

            let now = Utc::now().timestamp_millis();
            Ok(rows.iter().map(|row| {
                let ts_ms = parse_datetime_sqlite_ms(row.try_get::<Option<String>, _>("timestamp").ok().flatten()).unwrap_or(now);
                ReviewTraceRecord {
                    id: row.try_get("id").unwrap_or_default(),
                    timestamp: ts_ms,
                    is_correct: row.try_get("isCorrect").unwrap_or(false),
                    response_time: row.try_get("responseTime").unwrap_or(0),
                    seconds_ago: ((now - ts_ms) / 1000) as i64,
                }
            }).collect())
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewTraceRecord {
    pub id: String,
    pub timestamp: i64,
    pub is_correct: bool,
    pub response_time: i64,
    pub seconds_ago: i64,
}
