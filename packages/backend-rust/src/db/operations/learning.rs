use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::state_machine::DatabaseState;
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
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordLearningState>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"SELECT * FROM "word_learning_states" WHERE "userId" = ? AND "wordId" = ? LIMIT 1"#,
        )
        .bind(user_id)
        .bind(word_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_sqlite_word_learning_state(&r)))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"SELECT * FROM "word_learning_states" WHERE "userId" = $1 AND "wordId" = $2 LIMIT 1"#,
        )
        .bind(user_id)
        .bind(word_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|r| map_postgres_word_learning_state(&r)))
    }
}

pub async fn get_user_word_learning_states(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    limit: i64,
) -> Result<Vec<WordLearningState>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT * FROM "word_learning_states"
            WHERE "userId" = ?
            ORDER BY "updatedAt" DESC
            LIMIT ?
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_sqlite_word_learning_state).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
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
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_postgres_word_learning_state).collect())
    }
}

pub async fn get_due_words_for_review(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    limit: i64,
) -> Result<Vec<WordLearningState>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT * FROM "word_learning_states"
            WHERE "userId" = ? AND ("nextReviewAt" IS NULL OR "nextReviewAt" <= ?)
            ORDER BY "nextReviewAt" ASC NULLS FIRST
            LIMIT ?
            "#,
        )
        .bind(user_id)
        .bind(&now_iso)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_sqlite_word_learning_state).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
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
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_postgres_word_learning_state).collect())
    }
}

pub async fn upsert_word_learning_state(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    wls: &WordLearningState,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::Value::String(wls.user_id.clone()));
        where_clause.insert("wordId".into(), serde_json::Value::String(wls.word_id.clone()));

        let mut create_data = serde_json::Map::new();
        create_data.insert("id".into(), serde_json::Value::String(wls.id.clone()));
        create_data.insert("userId".into(), serde_json::Value::String(wls.user_id.clone()));
        create_data.insert("wordId".into(), serde_json::Value::String(wls.word_id.clone()));
        create_data.insert("masteryLevel".into(), serde_json::json!(wls.mastery_level));
        create_data.insert("familiarity".into(), serde_json::json!(wls.familiarity));
        if let Some(ref last_review) = wls.last_review_at {
            create_data.insert("lastReviewAt".into(), serde_json::Value::String(last_review.clone()));
        }
        if let Some(ref next_review) = wls.next_review_at {
            create_data.insert("nextReviewAt".into(), serde_json::Value::String(next_review.clone()));
        }
        create_data.insert("reviewCount".into(), serde_json::json!(wls.review_count));
        create_data.insert("correctCount".into(), serde_json::json!(wls.correct_count));
        create_data.insert("streak".into(), serde_json::json!(wls.streak));
        create_data.insert("easinessFactor".into(), serde_json::json!(wls.easiness_factor));
        create_data.insert("intervalDays".into(), serde_json::json!(wls.interval_days));
        create_data.insert("createdAt".into(), serde_json::Value::String(now_iso.clone()));
        create_data.insert("updatedAt".into(), serde_json::Value::String(now_iso.clone()));

        let mut update_data = serde_json::Map::new();
        update_data.insert("masteryLevel".into(), serde_json::json!(wls.mastery_level));
        update_data.insert("familiarity".into(), serde_json::json!(wls.familiarity));
        if let Some(ref last_review) = wls.last_review_at {
            update_data.insert("lastReviewAt".into(), serde_json::Value::String(last_review.clone()));
        }
        if let Some(ref next_review) = wls.next_review_at {
            update_data.insert("nextReviewAt".into(), serde_json::Value::String(next_review.clone()));
        }
        update_data.insert("reviewCount".into(), serde_json::json!(wls.review_count));
        update_data.insert("correctCount".into(), serde_json::json!(wls.correct_count));
        update_data.insert("streak".into(), serde_json::json!(wls.streak));
        update_data.insert("easinessFactor".into(), serde_json::json!(wls.easiness_factor));
        update_data.insert("intervalDays".into(), serde_json::json!(wls.interval_days));
        update_data.insert("updatedAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "word_learning_states".to_string(),
            r#where: where_clause,
            create: create_data,
            update: update_data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
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
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn insert_answer_record(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    record: &AnswerRecord,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(record.id.clone()));
        data.insert("userId".into(), serde_json::Value::String(record.user_id.clone()));
        data.insert("wordId".into(), serde_json::Value::String(record.word_id.clone()));
        if let Some(ref session_id) = record.session_id {
            data.insert("sessionId".into(), serde_json::Value::String(session_id.clone()));
        }
        data.insert("questionType".into(), serde_json::Value::String(record.question_type.clone()));
        data.insert("isCorrect".into(), serde_json::Value::Bool(record.is_correct));
        if let Some(response_time) = record.response_time {
            data.insert("responseTime".into(), serde_json::json!(response_time));
        }
        if let Some(dwell_time) = record.dwell_time {
            data.insert("dwellTime".into(), serde_json::json!(dwell_time));
        }
        if let Some(confidence) = record.confidence {
            data.insert("confidence".into(), serde_json::json!(confidence));
        }
        data.insert("hintUsed".into(), serde_json::Value::Bool(record.hint_used));
        if let Some(ref answer) = record.answer_given {
            data.insert("answerGiven".into(), serde_json::Value::String(answer.clone()));
        }
        data.insert("timestamp".into(), serde_json::Value::String(record.timestamp.clone()));
        data.insert("createdAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "answer_records".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
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
        .execute(&pool)
        .await?;
        Ok(())
    }
}

pub async fn get_recent_answer_records(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    limit: i64,
) -> Result<Vec<AnswerRecord>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        DatabaseState::Degraded | DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT * FROM "answer_records"
            WHERE "userId" = ?
            ORDER BY "timestamp" DESC
            LIMIT ?
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_sqlite_answer_record).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
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
        .fetch_all(&pool)
        .await?;
        Ok(rows.iter().map(map_postgres_answer_record).collect())
    }
}

pub async fn insert_word_review_trace(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    trace: &WordReviewTrace,
) -> Result<(), sqlx::Error> {
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::Value::String(trace.id.clone()));
        data.insert("userId".into(), serde_json::Value::String(trace.user_id.clone()));
        data.insert("wordId".into(), serde_json::Value::String(trace.word_id.clone()));
        data.insert("reviewType".into(), serde_json::Value::String(trace.review_type.clone()));
        data.insert("beforeMastery".into(), serde_json::json!(trace.before_mastery));
        data.insert("afterMastery".into(), serde_json::json!(trace.after_mastery));
        data.insert("beforeInterval".into(), serde_json::json!(trace.before_interval));
        data.insert("afterInterval".into(), serde_json::json!(trace.after_interval));
        data.insert("quality".into(), serde_json::json!(trace.quality));
        data.insert("createdAt".into(), serde_json::Value::String(now_iso));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "word_review_traces".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy.write_operation(state, op).await.map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        Ok(())
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err(sqlx::Error::PoolClosed);
        };
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
        .execute(&pool)
        .await?;
        Ok(())
    }
}

fn map_postgres_word_learning_state(row: &sqlx::postgres::PgRow) -> WordLearningState {
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

fn map_sqlite_word_learning_state(row: &sqlx::sqlite::SqliteRow) -> WordLearningState {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();
    let last_review_raw: Option<String> = row.try_get("lastReviewAt").ok();
    let next_review_raw: Option<String> = row.try_get("nextReviewAt").ok();
    WordLearningState {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        mastery_level: row.try_get("masteryLevel").unwrap_or(0.0),
        familiarity: row.try_get("familiarity").unwrap_or(0.0),
        last_review_at: last_review_raw.as_ref().map(|s| format_sqlite_datetime(s)),
        next_review_at: next_review_raw.as_ref().map(|s| format_sqlite_datetime(s)),
        review_count: row.try_get("reviewCount").unwrap_or(0),
        correct_count: row.try_get("correctCount").unwrap_or(0),
        streak: row.try_get("streak").unwrap_or(0),
        easiness_factor: row.try_get("easinessFactor").unwrap_or(2.5),
        interval_days: row.try_get("intervalDays").unwrap_or(1.0),
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
    }
}

fn map_postgres_answer_record(row: &sqlx::postgres::PgRow) -> AnswerRecord {
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

fn map_sqlite_answer_record(row: &sqlx::sqlite::SqliteRow) -> AnswerRecord {
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let timestamp_raw: String = row.try_get("timestamp").unwrap_or_default();
    let is_correct_int: i64 = row.try_get("isCorrect").unwrap_or(0);
    let hint_used_int: i64 = row.try_get("hintUsed").unwrap_or(0);
    AnswerRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        session_id: row.try_get("sessionId").ok(),
        question_type: row.try_get("questionType").unwrap_or_default(),
        is_correct: is_correct_int != 0,
        response_time: row.try_get("responseTime").ok(),
        dwell_time: row.try_get("dwellTime").ok(),
        confidence: row.try_get("confidence").ok(),
        hint_used: hint_used_int != 0,
        answer_given: row.try_get("answerGiven").ok(),
        timestamp: format_sqlite_datetime(&timestamp_raw),
        created_at: format_sqlite_datetime(&created_raw),
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn format_sqlite_datetime(raw: &str) -> String {
    crate::auth::parse_sqlite_datetime_ms(raw)
        .and_then(crate::auth::format_timestamp_ms_iso_millis)
        .unwrap_or_else(|| Utc::now().to_rfc3339())
}
