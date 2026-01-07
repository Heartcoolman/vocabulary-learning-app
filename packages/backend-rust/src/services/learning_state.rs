use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

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
    // FSRS fields
    pub stability: f64,
    pub difficulty: f64,
    pub desired_retention: f64,
    pub lapses: i32,
    pub reps: i32,
    pub scheduled_days: f64,
    pub elapsed_days: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordScore {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub total_score: f64,
    pub accuracy_score: f64,
    pub speed_score: f64,
    pub total_attempts: i32,
    pub correct_attempts: i32,
    pub average_response_time: f64,
    pub recent_accuracy: f64,
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
    #[serde(default)]
    pub increment_review: bool,
    // FSRS fields
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub desired_retention: Option<f64>,
    pub lapses: Option<i32>,
    pub reps: Option<i32>,
    pub scheduled_days: Option<f64>,
    pub elapsed_days: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewEventInput {
    pub timestamp: i64,
    pub is_correct: bool,
    pub response_time: i64,
    pub session_id: Option<String>,
}

// ========== Service Implementation ==========

pub async fn get_word_state(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordLearningState>, String> {
    let row = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
           "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt",
           "stability", "difficulty", "desiredRetention", "lapses", "reps", "scheduledDays", "elapsedDays"
           FROM "word_learning_states" WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    Ok(Some(parse_word_learning_state(&row)?))
}

fn parse_word_learning_state(row: &sqlx::postgres::PgRow) -> Result<WordLearningState, String> {
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
        stability: row.try_get("stability").unwrap_or(1.0),
        difficulty: row.try_get("difficulty").unwrap_or(0.3),
        desired_retention: row.try_get("desiredRetention").unwrap_or(0.9),
        lapses: row.try_get("lapses").unwrap_or(0),
        reps: row.try_get("reps").unwrap_or(0),
        scheduled_days: row.try_get("scheduledDays").unwrap_or(0.0),
        elapsed_days: row.try_get("elapsedDays").unwrap_or(0.0),
    })
}

pub async fn get_user_stats(pool: &PgPool, user_id: &str) -> Result<UserStats, String> {
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

pub async fn get_due_words(
    pool: &PgPool,
    user_id: &str,
    limit: i32,
) -> Result<Vec<WordLearningState>, String> {
    let now = Utc::now();
    let rows = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
           "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt",
           "stability", "difficulty", "desiredRetention", "lapses", "reps", "scheduledDays", "elapsedDays"
           FROM "word_learning_states"
           WHERE "userId" = $1 AND "nextReviewDate" <= $2
           ORDER BY "nextReviewDate" ASC LIMIT $3"#,
    )
    .bind(user_id)
    .bind(now)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    rows.iter().map(|row| parse_word_learning_state(row)).collect()
}

pub async fn get_words_by_state(
    pool: &PgPool,
    user_id: &str,
    state: WordState,
    limit: i32,
) -> Result<Vec<WordLearningState>, String> {
    let state_str = state.as_str();
    let rows = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "state", "masteryLevel", "easeFactor", "reviewCount",
           "lastReviewDate", "nextReviewDate", "createdAt", "updatedAt",
           "stability", "difficulty", "desiredRetention", "lapses", "reps", "scheduledDays", "elapsedDays"
           FROM "word_learning_states"
           WHERE "userId" = $1 AND "state" = $2 LIMIT $3"#,
    )
    .bind(user_id)
    .bind(state_str)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    rows.iter().map(|row| parse_word_learning_state(row)).collect()
}

pub async fn get_word_score(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordScore>, String> {
    let row = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "totalScore", "accuracyScore", "speedScore",
           "totalAttempts", "correctAttempts", "averageResponseTime", "recentAccuracy", "updatedAt"
           FROM "word_scores" WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    Ok(Some(WordScore {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        total_score: row.try_get("totalScore").unwrap_or(0.0),
        accuracy_score: row.try_get("accuracyScore").unwrap_or(0.0),
        speed_score: row.try_get("speedScore").unwrap_or(0.0),
        total_attempts: row.try_get("totalAttempts").unwrap_or(0),
        correct_attempts: row.try_get("correctAttempts").unwrap_or(0),
        average_response_time: row.try_get("averageResponseTime").unwrap_or(0.0),
        recent_accuracy: row.try_get("recentAccuracy").unwrap_or(0.0),
        updated_at: row.try_get::<DateTime<Utc>, _>("updatedAt").map(|d| d.timestamp_millis()).unwrap_or_else(|_| Utc::now().timestamp_millis()),
    }))
}

pub async fn get_low_score_words(
    pool: &PgPool,
    user_id: &str,
    threshold: f64,
    limit: i32,
) -> Result<Vec<WordScore>, String> {
    let rows = sqlx::query(
        r#"SELECT "id", "userId", "wordId", "totalScore", "accuracyScore", "speedScore",
           "totalAttempts", "correctAttempts", "averageResponseTime", "recentAccuracy", "updatedAt"
           FROM "word_scores" WHERE "userId" = $1 AND "totalScore" < $2
           ORDER BY "totalScore" ASC LIMIT $3"#,
    )
    .bind(user_id)
    .bind(threshold)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows.iter().map(|row| WordScore {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        total_score: row.try_get("totalScore").unwrap_or(0.0),
        accuracy_score: row.try_get("accuracyScore").unwrap_or(0.0),
        speed_score: row.try_get("speedScore").unwrap_or(0.0),
        total_attempts: row.try_get("totalAttempts").unwrap_or(0),
        correct_attempts: row.try_get("correctAttempts").unwrap_or(0),
        average_response_time: row.try_get("averageResponseTime").unwrap_or(0.0),
        recent_accuracy: row.try_get("recentAccuracy").unwrap_or(0.0),
        updated_at: row.try_get::<DateTime<Utc>, _>("updatedAt").map(|d| d.timestamp_millis()).unwrap_or_else(|_| Utc::now().timestamp_millis()),
    }).collect())
}

pub async fn get_score_stats(pool: &PgPool, user_id: &str) -> Result<ScoreStats, String> {
    let row = sqlx::query(
        r#"SELECT
           COALESCE(AVG("totalScore"), 0) as avg_score,
           COUNT(*) FILTER (WHERE "totalScore" >= 80) as high_count,
           COUNT(*) FILTER (WHERE "totalScore" >= 40 AND "totalScore" < 80) as medium_count,
           COUNT(*) FILTER (WHERE "totalScore" < 40) as low_count
           FROM "word_scores" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(ScoreStats {
        average_score: row.try_get("avg_score").unwrap_or(0.0),
        high_score_count: row.try_get("high_count").unwrap_or(0),
        medium_score_count: row.try_get("medium_count").unwrap_or(0),
        low_score_count: row.try_get("low_count").unwrap_or(0),
    })
}

pub async fn get_complete_word_state(
    pool: &PgPool,
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
    let base_score = score.map(|s| s.total_score).unwrap_or(50.0);
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

pub async fn get_user_learning_stats(pool: &PgPool, user_id: &str) -> Result<UserLearningStats, String> {
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
    user_id: &str,
    word_id: &str,
    data: WordStateUpdateData,
) -> Result<(), String> {
    let pool = proxy.pool();
    let now = Utc::now();
    let id = uuid::Uuid::new_v4().to_string();

    let state_str: Option<&str> = data.state.map(|s| s.as_str());
    let last_review: Option<DateTime<Utc>> = data.last_review_date.and_then(DateTime::from_timestamp_millis);
    let next_review: Option<DateTime<Utc>> = data.next_review_date.and_then(DateTime::from_timestamp_millis);

    sqlx::query(
        r#"INSERT INTO "word_learning_states" (
           "id","userId","wordId","state","masteryLevel","easeFactor",
           "reviewCount","lastReviewDate","nextReviewDate","createdAt","updatedAt",
           "stability","difficulty","desiredRetention","lapses","reps","scheduledDays","elapsedDays"
         )
         VALUES ($1,$2,$3,COALESCE($4::"WordState",'NEW'::"WordState"),COALESCE($5,0),COALESCE($6,2.5),
                 COALESCE($7,0),$8,$9,$10,$11,
                 COALESCE($13,1.0),COALESCE($14,0.3),COALESCE($15,0.9),COALESCE($16,0),COALESCE($17,0),COALESCE($18,0.0),COALESCE($19,0.0))
         ON CONFLICT ("userId","wordId") DO UPDATE SET
           "state"=COALESCE($4::"WordState","word_learning_states"."state"),
           "masteryLevel"=COALESCE($5,"word_learning_states"."masteryLevel"),
           "easeFactor"=COALESCE($6,"word_learning_states"."easeFactor"),
           "reviewCount"=CASE WHEN $12 THEN "word_learning_states"."reviewCount"+1 ELSE COALESCE($7,"word_learning_states"."reviewCount") END,
           "lastReviewDate"=COALESCE($8,"word_learning_states"."lastReviewDate"),
           "nextReviewDate"=COALESCE($9,"word_learning_states"."nextReviewDate"),
           "updatedAt"=$11,
           "stability"=COALESCE($13,"word_learning_states"."stability"),
           "difficulty"=COALESCE($14,"word_learning_states"."difficulty"),
           "desiredRetention"=COALESCE($15,"word_learning_states"."desiredRetention"),
           "lapses"=COALESCE($16,"word_learning_states"."lapses"),
           "reps"=CASE WHEN $12 THEN "word_learning_states"."reps"+1 ELSE COALESCE($17,"word_learning_states"."reps") END,
           "scheduledDays"=COALESCE($18,"word_learning_states"."scheduledDays"),
           "elapsedDays"=COALESCE($19,"word_learning_states"."elapsedDays")"#,
    )
    .bind(&id).bind(user_id).bind(word_id).bind(state_str)
    .bind(data.mastery_level).bind(data.ease_factor).bind(data.review_count)
    .bind(last_review).bind(next_review).bind(now).bind(now)
    .bind(data.increment_review)
    .bind(data.stability).bind(data.difficulty).bind(data.desired_retention)
    .bind(data.lapses).bind(data.reps).bind(data.scheduled_days).bind(data.elapsed_days)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

pub async fn upsert_word_score(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    score: f64,
    is_correct: bool,
    response_time: i64,
) -> Result<(), String> {
    let pool = proxy.pool();
    let now = Utc::now();
    let id = uuid::Uuid::new_v4().to_string();
    let correct_inc = if is_correct { 1 } else { 0 };
    let accuracy = if is_correct { 1.0 } else { 0.0 };

    sqlx::query(
        r#"INSERT INTO "word_scores" ("id","userId","wordId","totalScore","accuracyScore","speedScore","totalAttempts","correctAttempts","averageResponseTime","recentAccuracy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$10)
           ON CONFLICT ("userId","wordId") DO UPDATE SET
           "totalScore"=EXCLUDED."totalScore",
           "accuracyScore"=("word_scores"."accuracyScore" * "word_scores"."totalAttempts" + EXCLUDED."accuracyScore") / ("word_scores"."totalAttempts" + 1),
           "totalAttempts"="word_scores"."totalAttempts"+1,
           "correctAttempts"="word_scores"."correctAttempts"+$7,
           "averageResponseTime"=("word_scores"."averageResponseTime" * "word_scores"."totalAttempts" + $8) / ("word_scores"."totalAttempts" + 1),
           "recentAccuracy"=EXCLUDED."recentAccuracy",
           "updatedAt"=$10"#,
    )
    .bind(&id).bind(user_id).bind(word_id).bind(score)
    .bind(accuracy).bind(calculate_speed_score(response_time)).bind(correct_inc)
    .bind(response_time as f64).bind(accuracy).bind(now)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

fn calculate_speed_score(response_time: i64) -> f64 {
    let max_time = 10000.0;
    let min_time = 500.0;
    let rt = response_time as f64;
    if rt <= min_time { 1.0 }
    else if rt >= max_time { 0.0 }
    else { 1.0 - (rt - min_time) / (max_time - min_time) }
}

pub async fn record_review(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    event: ReviewEventInput,
) -> Result<(), String> {
    let pool = proxy.pool();
    let now = Utc::now();
    let id = uuid::Uuid::new_v4().to_string();
    let event_ts = DateTime::from_timestamp_millis(event.timestamp);

    sqlx::query(
        r#"INSERT INTO "word_review_traces" ("id","userId","wordId","isCorrect","responseTime","timestamp","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)"#,
    )
    .bind(&id).bind(user_id).bind(word_id).bind(event.is_correct)
    .bind(event.response_time).bind(event_ts.unwrap_or(now)).bind(now)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    if let Some(ref session_id) = event.session_id {
        sqlx::query(
            r#"UPDATE "learning_sessions" SET "totalQuestions" = "totalQuestions" + 1, "updatedAt" = $1 WHERE "id" = $2"#,
        )
        .bind(now.naive_utc())
        .bind(session_id)
        .execute(pool)
        .await
        .ok();
    }

    Ok(())
}

pub async fn get_memory_trace(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
    limit: i32,
) -> Result<Vec<ReviewTraceRecord>, String> {
    let rows = sqlx::query(
        r#"SELECT "id", "timestamp", "isCorrect", "responseTime"
           FROM "word_review_traces" WHERE "userId" = $1 AND "wordId" = $2
           ORDER BY "timestamp" DESC LIMIT $3"#,
    )
    .bind(user_id).bind(word_id).bind(limit)
    .fetch_all(pool).await.map_err(|e| format!("查询失败: {e}"))?;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewTraceRecord {
    pub id: String,
    pub timestamp: i64,
    pub is_correct: bool,
    pub response_time: i64,
    pub seconds_ago: i64,
}
