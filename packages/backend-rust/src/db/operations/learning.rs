use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WordState {
    #[default]
    New,
    Learning,
    Reviewing,
    Mastered,
    Forgotten,
}

impl WordState {
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "LEARNING" => Self::Learning,
            "REVIEWING" => Self::Reviewing,
            "MASTERED" => Self::Mastered,
            "FORGOTTEN" => Self::Forgotten,
            _ => Self::New,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::New => "NEW",
            Self::Learning => "LEARNING",
            Self::Reviewing => "REVIEWING",
            Self::Mastered => "MASTERED",
            Self::Forgotten => "FORGOTTEN",
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
    pub last_review_date: Option<String>,
    pub next_review_date: Option<String>,
    pub current_interval: i32,
    pub consecutive_correct: i32,
    pub consecutive_wrong: i32,
    pub half_life: f64,
    pub version: i32,
    pub stability: f64,
    pub difficulty: f64,
    pub desired_retention: f64,
    pub lapses: i32,
    pub reps: i32,
    pub scheduled_days: f64,
    pub elapsed_days: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRecord {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub session_id: Option<String>,
    pub question_type: String,
    pub is_correct: bool,
    pub response_time: Option<i64>,
    pub dwell_time: Option<i64>,
    pub confidence: Option<f64>,
    pub hint_used: bool,
    pub answer_given: Option<String>,
    pub timestamp: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordReviewTrace {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub review_type: String,
    pub before_mastery: f64,
    pub after_mastery: f64,
    pub before_interval: f64,
    pub after_interval: f64,
    pub quality: i32,
    pub created_at: String,
}

pub async fn get_word_learning_state(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordLearningState>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT * FROM "word_learning_states" WHERE "userId" = $1 AND "wordId" = $2 LIMIT 1"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_word_learning_state(&r)))
}

pub async fn get_user_word_learning_states(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<WordLearningState>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT * FROM "word_learning_states"
        WHERE "userId" = $1
        ORDER BY "updatedAt" DESC
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_word_learning_state).collect())
}

pub async fn get_due_words_for_review(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<WordLearningState>, sqlx::Error> {
    let now = Utc::now().naive_utc();
    let rows = sqlx::query(
        r#"
        SELECT * FROM "word_learning_states"
        WHERE "userId" = $1 AND ("nextReviewDate" IS NULL OR "nextReviewDate" <= $2)
        ORDER BY "nextReviewDate" ASC NULLS FIRST
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(now)
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_word_learning_state).collect())
}

pub async fn upsert_word_learning_state(
    proxy: &DatabaseProxy,
    wls: &WordLearningState,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    let last_review = wls
        .last_review_date
        .as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.naive_utc());
    let next_review = wls
        .next_review_date
        .as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "word_learning_states" (
            "id", "userId", "wordId", "state", "masteryLevel", "easeFactor",
            "reviewCount", "lastReviewDate", "nextReviewDate", "currentInterval",
            "consecutiveCorrect", "consecutiveWrong", "halfLife", "version",
            "stability", "difficulty", "desiredRetention", "lapses", "reps",
            "scheduledDays", "elapsedDays", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4::"WordLearningState", $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT ("userId", "wordId") DO UPDATE SET
            "state" = EXCLUDED."state",
            "masteryLevel" = EXCLUDED."masteryLevel",
            "easeFactor" = EXCLUDED."easeFactor",
            "reviewCount" = EXCLUDED."reviewCount",
            "lastReviewDate" = EXCLUDED."lastReviewDate",
            "nextReviewDate" = EXCLUDED."nextReviewDate",
            "currentInterval" = EXCLUDED."currentInterval",
            "consecutiveCorrect" = EXCLUDED."consecutiveCorrect",
            "consecutiveWrong" = EXCLUDED."consecutiveWrong",
            "halfLife" = EXCLUDED."halfLife",
            "version" = EXCLUDED."version",
            "stability" = EXCLUDED."stability",
            "difficulty" = EXCLUDED."difficulty",
            "desiredRetention" = EXCLUDED."desiredRetention",
            "lapses" = EXCLUDED."lapses",
            "reps" = EXCLUDED."reps",
            "scheduledDays" = EXCLUDED."scheduledDays",
            "elapsedDays" = EXCLUDED."elapsedDays",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&wls.id)
    .bind(&wls.user_id)
    .bind(&wls.word_id)
    .bind(wls.state.as_str())
    .bind(wls.mastery_level)
    .bind(wls.ease_factor)
    .bind(wls.review_count)
    .bind(last_review)
    .bind(next_review)
    .bind(wls.current_interval)
    .bind(wls.consecutive_correct)
    .bind(wls.consecutive_wrong)
    .bind(wls.half_life)
    .bind(wls.version)
    .bind(wls.stability)
    .bind(wls.difficulty)
    .bind(wls.desired_retention)
    .bind(wls.lapses)
    .bind(wls.reps)
    .bind(wls.scheduled_days)
    .bind(wls.elapsed_days)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn insert_answer_record(
    proxy: &DatabaseProxy,
    record: &AnswerRecord,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    let timestamp = chrono::DateTime::parse_from_rfc3339(&record.timestamp)
        .map(|dt| dt.naive_utc())
        .unwrap_or(now);

    sqlx::query(
        r#"
        INSERT INTO "answer_records" (
            "id", "userId", "wordId", "sessionId", "questionType", "isCorrect",
            "responseTime", "dwellTime", "confidence", "hintUsed", "answerGiven",
            "timestamp", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        "#,
    )
    .bind(&record.id)
    .bind(&record.user_id)
    .bind(&record.word_id)
    .bind(&record.session_id)
    .bind(&record.question_type)
    .bind(record.is_correct)
    .bind(record.response_time)
    .bind(record.dwell_time)
    .bind(record.confidence)
    .bind(record.hint_used)
    .bind(&record.answer_given)
    .bind(timestamp)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_recent_answer_records(
    proxy: &DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<AnswerRecord>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT * FROM "answer_records"
        WHERE "userId" = $1
        ORDER BY "timestamp" DESC
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_answer_record).collect())
}

pub async fn insert_word_review_trace(
    proxy: &DatabaseProxy,
    trace: &WordReviewTrace,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "word_review_traces" (
            "id", "userId", "wordId", "reviewType", "beforeMastery", "afterMastery",
            "beforeInterval", "afterInterval", "quality", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(&trace.id)
    .bind(&trace.user_id)
    .bind(&trace.word_id)
    .bind(&trace.review_type)
    .bind(trace.before_mastery)
    .bind(trace.after_mastery)
    .bind(trace.before_interval)
    .bind(trace.after_interval)
    .bind(trace.quality)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

fn map_word_learning_state(row: &sqlx::postgres::PgRow) -> WordLearningState {
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let last_review_date: Option<NaiveDateTime> = row.try_get("lastReviewDate").ok();
    let next_review_date: Option<NaiveDateTime> = row.try_get("nextReviewDate").ok();
    WordLearningState {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        state: WordState::from_str(
            row.try_get::<String, _>("state")
                .unwrap_or_default()
                .as_str(),
        ),
        mastery_level: row.try_get("masteryLevel").unwrap_or(0),
        ease_factor: row.try_get("easeFactor").unwrap_or(2.5),
        review_count: row.try_get("reviewCount").unwrap_or(0),
        last_review_date: last_review_date.map(format_naive_iso),
        next_review_date: next_review_date.map(format_naive_iso),
        current_interval: row.try_get("currentInterval").unwrap_or(1),
        consecutive_correct: row.try_get("consecutiveCorrect").unwrap_or(0),
        consecutive_wrong: row.try_get("consecutiveWrong").unwrap_or(0),
        half_life: row.try_get("halfLife").unwrap_or(1.0),
        version: row.try_get("version").unwrap_or(0),
        stability: row.try_get("stability").unwrap_or(1.0),
        difficulty: row.try_get("difficulty").unwrap_or(0.3),
        desired_retention: row.try_get("desiredRetention").unwrap_or(0.9),
        lapses: row.try_get("lapses").unwrap_or(0),
        reps: row.try_get("reps").unwrap_or(0),
        scheduled_days: row.try_get("scheduledDays").unwrap_or(0.0),
        elapsed_days: row.try_get("elapsedDays").unwrap_or(0.0),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_answer_record(row: &sqlx::postgres::PgRow) -> AnswerRecord {
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let timestamp: NaiveDateTime = row
        .try_get("timestamp")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    AnswerRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        session_id: row.try_get("sessionId").ok(),
        question_type: row.try_get("questionType").unwrap_or_default(),
        is_correct: row.try_get("isCorrect").unwrap_or(false),
        response_time: row.try_get("responseTime").ok(),
        dwell_time: row.try_get("dwellTime").ok(),
        confidence: row.try_get("confidence").ok(),
        hint_used: row.try_get("hintUsed").unwrap_or(false),
        answer_given: row.try_get("answerGiven").ok(),
        timestamp: format_naive_iso(timestamp),
        created_at: format_naive_iso(created_at),
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}
