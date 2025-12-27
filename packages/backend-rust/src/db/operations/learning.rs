use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordLearningState {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub mastery_level: f64,
    pub familiarity: f64,
    pub last_review_at: Option<String>,
    pub next_review_at: Option<String>,
    pub review_count: i32,
    pub correct_count: i32,
    pub streak: i32,
    pub easiness_factor: f64,
    pub interval_days: f64,
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
        WHERE "userId" = $1 AND ("nextReviewAt" IS NULL OR "nextReviewAt" <= $2)
        ORDER BY "nextReviewAt" ASC NULLS FIRST
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
    let last_review = wls.last_review_at.as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.naive_utc());
    let next_review = wls.next_review_at.as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "word_learning_states" (
            "id", "userId", "wordId", "masteryLevel", "familiarity",
            "lastReviewAt", "nextReviewAt", "reviewCount", "correctCount",
            "streak", "easinessFactor", "intervalDays", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT ("userId", "wordId") DO UPDATE SET
            "masteryLevel" = EXCLUDED."masteryLevel",
            "familiarity" = EXCLUDED."familiarity",
            "lastReviewAt" = EXCLUDED."lastReviewAt",
            "nextReviewAt" = EXCLUDED."nextReviewAt",
            "reviewCount" = EXCLUDED."reviewCount",
            "correctCount" = EXCLUDED."correctCount",
            "streak" = EXCLUDED."streak",
            "easinessFactor" = EXCLUDED."easinessFactor",
            "intervalDays" = EXCLUDED."intervalDays",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&wls.id)
    .bind(&wls.user_id)
    .bind(&wls.word_id)
    .bind(wls.mastery_level)
    .bind(wls.familiarity)
    .bind(last_review)
    .bind(next_review)
    .bind(wls.review_count)
    .bind(wls.correct_count)
    .bind(wls.streak)
    .bind(wls.easiness_factor)
    .bind(wls.interval_days)
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
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let last_review_at: Option<NaiveDateTime> = row.try_get("lastReviewAt").ok();
    let next_review_at: Option<NaiveDateTime> = row.try_get("nextReviewAt").ok();
    WordLearningState {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        mastery_level: row.try_get("masteryLevel").unwrap_or(0.0),
        familiarity: row.try_get("familiarity").unwrap_or(0.0),
        last_review_at: last_review_at.map(format_naive_iso),
        next_review_at: next_review_at.map(format_naive_iso),
        review_count: row.try_get("reviewCount").unwrap_or(0),
        correct_count: row.try_get("correctCount").unwrap_or(0),
        streak: row.try_get("streak").unwrap_or(0),
        easiness_factor: row.try_get("easinessFactor").unwrap_or(2.5),
        interval_days: row.try_get("intervalDays").unwrap_or(1.0),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_answer_record(row: &sqlx::postgres::PgRow) -> AnswerRecord {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let timestamp: NaiveDateTime = row.try_get("timestamp").unwrap_or_else(|_| Utc::now().naive_utc());
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
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}
