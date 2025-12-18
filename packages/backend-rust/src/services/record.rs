use std::collections::HashSet;

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

const MAX_BATCH_SIZE: usize = 1000;
const TIMESTAMP_PAST_LIMIT_MS: i64 = 24 * 60 * 60 * 1000;
const TIMESTAMP_FUTURE_LIMIT_MS: i64 = 60 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct CreateRecordInput {
    pub word_id: String,
    pub selected_option: Option<String>,
    pub selected_answer: Option<String>,
    pub correct_answer: Option<String>,
    pub is_correct: bool,
    pub timestamp_ms: Option<i64>,
    pub response_time: Option<i64>,
    pub dwell_time: Option<i64>,
    pub session_id: Option<String>,
    pub mastery_level_before: Option<i64>,
    pub mastery_level_after: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRecordWord {
    pub spelling: String,
    pub phonetic: String,
    pub meanings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRecordWithWord {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub selected_answer: String,
    pub correct_answer: String,
    pub is_correct: bool,
    pub timestamp: String,
    pub dwell_time: Option<i64>,
    pub mastery_level_after: Option<i64>,
    pub mastery_level_before: Option<i64>,
    pub response_time: Option<i64>,
    pub session_id: Option<String>,
    pub word: AnswerRecordWord,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRecord {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub selected_answer: String,
    pub correct_answer: String,
    pub is_correct: bool,
    pub timestamp: String,
    pub dwell_time: Option<i64>,
    pub mastery_level_after: Option<i64>,
    pub mastery_level_before: Option<i64>,
    pub response_time: Option<i64>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PaginationOptions {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
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
pub struct PaginatedResult<T> {
    pub data: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCreateResult {
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyStatistics {
    pub total_words: i64,
    pub total_records: i64,
    pub correct_rate: f64,
    pub recent_records: Vec<RecentRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRecord {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub selected_answer: String,
    pub correct_answer: String,
    pub is_correct: bool,
    pub timestamp: String,
    pub response_time: Option<i64>,
    pub dwell_time: Option<i64>,
    pub session_id: Option<String>,
    pub word: RecentWord,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWord {
    pub spelling: String,
    pub phonetic: String,
}

#[derive(Debug, thiserror::Error)]
pub enum RecordError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("unauthorized")]
    Unauthorized(String),
    #[error("not found")]
    NotFound(String),
    #[error("sql error: {0}")]
    Sql(#[from] sqlx::Error),
    #[error("db mutation failed: {0}")]
    Mutation(String),
}

pub async fn create_record(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    input: CreateRecordInput,
) -> Result<AnswerRecord, RecordError> {
    validate_record_input(&input)?;

    if let Some(session_id) = input.session_id.as_deref() {
        ensure_learning_session_exists(proxy, state, session_id, user_id).await?;
    }

    ensure_word_access(proxy, state, user_id, &input.word_id).await?;

    let now_ms = Utc::now().timestamp_millis();
    let ts_ms = match input.timestamp_ms {
        Some(ts) => validate_timestamp_ms(ts)?,
        None => now_ms,
    };

    let timestamp_iso = crate::auth::format_timestamp_ms_iso_millis(ts_ms)
        .unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));
    let record_id = Uuid::new_v4().to_string();

    let selected_answer = resolve_selected_answer(&input);
    let correct_answer = input.correct_answer.clone().unwrap_or_default();

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".to_string(), serde_json::Value::String(record_id.clone()));
        data.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        data.insert("wordId".to_string(), serde_json::Value::String(input.word_id.clone()));
        data.insert(
            "selectedAnswer".to_string(),
            serde_json::Value::String(selected_answer.clone()),
        );
        data.insert(
            "correctAnswer".to_string(),
            serde_json::Value::String(correct_answer.clone()),
        );
        data.insert("isCorrect".to_string(), serde_json::Value::Bool(input.is_correct));
        data.insert("timestamp".to_string(), serde_json::Value::String(timestamp_iso.clone()));
        if let Some(value) = input.dwell_time {
            data.insert("dwellTime".to_string(), serde_json::Value::Number(value.into()));
        }
        if let Some(value) = input.mastery_level_after {
            data.insert(
                "masteryLevelAfter".to_string(),
                serde_json::Value::Number(value.into()),
            );
        }
        if let Some(value) = input.mastery_level_before {
            data.insert(
                "masteryLevelBefore".to_string(),
                serde_json::Value::Number(value.into()),
            );
        }
        if let Some(value) = input.response_time {
            data.insert(
                "responseTime".to_string(),
                serde_json::Value::Number(value.into()),
            );
        }
        if let Some(value) = input.session_id.as_deref() {
            data.insert("sessionId".to_string(), serde_json::Value::String(value.to_string()));
        }

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "answer_records".to_string(),
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: Some(ts_ms.max(0) as u64),
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map_err(|err| RecordError::Mutation(err.to_string()))?;
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err(RecordError::Sql(sqlx::Error::PoolClosed));
        };

        let timestamp_dt = DateTime::<Utc>::from_timestamp_millis(ts_ms)
            .unwrap_or_else(|| Utc::now())
            .naive_utc();
        sqlx::query(
            r#"
            INSERT INTO "answer_records"
              ("id","userId","wordId","selectedAnswer","correctAnswer","isCorrect","timestamp","dwellTime","masteryLevelAfter","masteryLevelBefore","responseTime","sessionId")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            "#,
        )
        .bind(&record_id)
        .bind(user_id)
        .bind(&input.word_id)
        .bind(&selected_answer)
        .bind(&correct_answer)
        .bind(input.is_correct)
        .bind(timestamp_dt)
        .bind(input.dwell_time.map(|v| v as i32))
        .bind(input.mastery_level_after.map(|v| v as i32))
        .bind(input.mastery_level_before.map(|v| v as i32))
        .bind(input.response_time.map(|v| v as i32))
        .bind(input.session_id.as_deref())
        .execute(&primary)
        .await?;
    }

    let review_ts_ms = input.timestamp_ms.unwrap_or(now_ms);
    if let Err(err) = record_word_review_trace(
        proxy,
        state,
        user_id,
        &input.word_id,
        review_ts_ms,
        input.is_correct,
        input.response_time.unwrap_or(0),
    )
    .await
    {
        tracing::warn!(error = %err, "word review trace insert failed");
    }

    Ok(AnswerRecord {
        id: record_id,
        user_id: user_id.to_string(),
        word_id: input.word_id,
        selected_answer,
        correct_answer,
        is_correct: input.is_correct,
        timestamp: timestamp_iso,
        dwell_time: input.dwell_time,
        mastery_level_after: input.mastery_level_after,
        mastery_level_before: input.mastery_level_before,
        response_time: input.response_time,
        session_id: input.session_id,
    })
}

pub async fn batch_create_records(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    records: Vec<CreateRecordInput>,
) -> Result<BatchCreateResult, RecordError> {
    if records.len() > MAX_BATCH_SIZE {
        return Err(RecordError::Validation(format!(
            "批量操作上限为 {MAX_BATCH_SIZE} 条，当前 {} 条。请分批提交。",
            records.len()
        )));
    }

    for record in &records {
        validate_record_input(record)?;
    }

    let mut resolved: Vec<ResolvedRecord> = Vec::with_capacity(records.len());
    let now_ms = Utc::now().timestamp_millis();

    for record in records {
        let ts_ms = match record.timestamp_ms {
            Some(ts) => validate_timestamp_ms(ts)?,
            None => now_ms,
        };
        resolved.push(ResolvedRecord { input: record, timestamp_ms: ts_ms });
    }

    let word_ids: Vec<String> = resolved.iter().map(|r| r.input.word_id.clone()).collect();
    let unique_word_ids: Vec<String> = word_ids.into_iter().collect::<HashSet<_>>().into_iter().collect();

    let accessible_word_ids = select_accessible_word_ids(proxy, state, user_id, &unique_word_ids).await?;
    let accessible_set: HashSet<&str> = accessible_word_ids.iter().map(|id| id.as_str()).collect();

    let valid: Vec<ResolvedRecord> = resolved
        .into_iter()
        .filter(|r| accessible_set.contains(r.input.word_id.as_str()))
        .collect();

    if valid.is_empty() {
        return Err(RecordError::Validation("所有单词都不存在或无权访问".to_string()));
    }

    let session_ids: Vec<String> = valid
        .iter()
        .filter_map(|r| r.input.session_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    for session_id in session_ids {
        ensure_learning_session_exists(proxy, state, &session_id, user_id).await?;
    }

    let existing_keys = select_existing_record_keys(proxy, state, user_id, &valid).await?;

    let mut new_records: Vec<ResolvedRecord> = Vec::new();
    for record in &valid {
        let key = format!("{user_id}-{}-{}", record.input.word_id, record.timestamp_ms);
        if !existing_keys.contains(key.as_str()) {
            new_records.push(record.clone());
        }
    }

    if proxy.sqlite_enabled() {
        for record in &valid {
            let timestamp_iso = crate::auth::format_timestamp_ms_iso_millis(record.timestamp_ms)
                .unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));
            let selected_answer = resolve_selected_answer(&record.input);
            let correct_answer = record.input.correct_answer.clone().unwrap_or_default();

            let mut where_clause = serde_json::Map::new();
            where_clause.insert(
                "userId".to_string(),
                serde_json::Value::String(user_id.to_string()),
            );
            where_clause.insert(
                "wordId".to_string(),
                serde_json::Value::String(record.input.word_id.clone()),
            );
            where_clause.insert(
                "timestamp".to_string(),
                serde_json::Value::String(timestamp_iso.clone()),
            );

            let mut create = serde_json::Map::new();
            create.insert("id".to_string(), serde_json::Value::String(Uuid::new_v4().to_string()));
            create.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
            create.insert(
                "wordId".to_string(),
                serde_json::Value::String(record.input.word_id.clone()),
            );
            create.insert(
                "selectedAnswer".to_string(),
                serde_json::Value::String(selected_answer),
            );
            create.insert(
                "correctAnswer".to_string(),
                serde_json::Value::String(correct_answer),
            );
            create.insert("isCorrect".to_string(), serde_json::Value::Bool(record.input.is_correct));
            create.insert("timestamp".to_string(), serde_json::Value::String(timestamp_iso.clone()));
            if let Some(value) = record.input.response_time {
                create.insert("responseTime".to_string(), serde_json::Value::Number(value.into()));
            }
            if let Some(value) = record.input.dwell_time {
                create.insert("dwellTime".to_string(), serde_json::Value::Number(value.into()));
            }
            if let Some(value) = record.input.session_id.as_deref() {
                create.insert("sessionId".to_string(), serde_json::Value::String(value.to_string()));
            }
            if let Some(value) = record.input.mastery_level_before {
                create.insert("masteryLevelBefore".to_string(), serde_json::Value::Number(value.into()));
            }
            if let Some(value) = record.input.mastery_level_after {
                create.insert("masteryLevelAfter".to_string(), serde_json::Value::Number(value.into()));
            }

            let op = crate::db::dual_write_manager::WriteOperation::Upsert {
                table: "answer_records".to_string(),
                r#where: where_clause,
                create,
                update: serde_json::Map::new(),
                operation_id: Uuid::new_v4().to_string(),
                timestamp_ms: Some(record.timestamp_ms.max(0) as u64),
                critical: Some(true),
            };

            proxy
                .write_operation(state, op)
                .await
                .map_err(|err| RecordError::Mutation(err.to_string()))?;
        }
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err(RecordError::Sql(sqlx::Error::PoolClosed));
        };

        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"
            INSERT INTO "answer_records"
              ("id","userId","wordId","selectedAnswer","correctAnswer","isCorrect","timestamp","responseTime","dwellTime","sessionId","masteryLevelBefore","masteryLevelAfter")
            "#,
        );
        qb.push_values(valid.iter(), |mut b, record| {
            let id = Uuid::new_v4().to_string();
            let timestamp_dt = DateTime::<Utc>::from_timestamp_millis(record.timestamp_ms)
                .unwrap_or_else(|| Utc::now())
                .naive_utc();
            b.push_bind(id);
            b.push_bind(user_id);
            b.push_bind(&record.input.word_id);
            b.push_bind(resolve_selected_answer(&record.input));
            b.push_bind(record.input.correct_answer.clone().unwrap_or_default());
            b.push_bind(record.input.is_correct);
            b.push_bind(timestamp_dt);
            b.push_bind(record.input.response_time.map(|v| v as i32));
            b.push_bind(record.input.dwell_time.map(|v| v as i32));
            b.push_bind(record.input.session_id.as_deref());
            b.push_bind(record.input.mastery_level_before.map(|v| v as i32));
            b.push_bind(record.input.mastery_level_after.map(|v| v as i32));
        });
        qb.push(" ON CONFLICT (\"userId\",\"wordId\",\"timestamp\") DO NOTHING");
        qb.build().execute(&primary).await?;
    }

    if !new_records.is_empty() {
        for record in &new_records {
            let review_ts = record.input.timestamp_ms.unwrap_or(now_ms);
            if let Err(err) = record_word_review_trace(
                proxy,
                state,
                user_id,
                &record.input.word_id,
                review_ts,
                record.input.is_correct,
                record.input.response_time.unwrap_or(0),
            )
            .await
            {
                tracing::warn!(error = %err, "word review trace insert failed");
                break;
            }
        }
    }

    Ok(BatchCreateResult {
        count: new_records.len() as i64,
    })
}

pub async fn get_records_by_user_id(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    options: PaginationOptions,
) -> Result<PaginatedResult<AnswerRecordWithWord>, sqlx::Error> {
    get_paginated_records(proxy, state, user_id, None, options).await
}

pub async fn get_records_by_session_id(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    session_id: &str,
    options: PaginationOptions,
) -> Result<PaginatedResult<AnswerRecordWithWord>, sqlx::Error> {
    get_paginated_records(proxy, state, user_id, Some(session_id), options).await
}

pub async fn get_statistics(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<StudyStatistics, sqlx::Error> {
    let word_book_ids = select_accessible_word_book_ids(proxy, state, user_id).await?;
    let total_words = if word_book_ids.is_empty() {
        0
    } else {
        count_words_in_word_books(proxy, state, &word_book_ids).await?
    };

    let total_records = count_answer_records(proxy, state, user_id, None).await?;
    let correct_records = count_answer_records(proxy, state, user_id, Some(true)).await?;
    let recent_records = select_recent_records(proxy, state, user_id).await?;

    let correct_rate = if total_records > 0 {
        correct_records as f64 / total_records as f64
    } else {
        0.0
    };

    Ok(StudyStatistics {
        total_words,
        total_records,
        correct_rate,
        recent_records,
    })
}

pub async fn ensure_learning_session_exists(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
    user_id: &str,
) -> Result<(), RecordError> {
    let owner = select_learning_session_owner(proxy, state, session_id).await?;
    if let Some(existing_user) = owner {
        if existing_user != user_id {
            return Err(RecordError::Unauthorized(format!(
                "Session {session_id} belongs to different user"
            )));
        }
        return Ok(());
    }

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert(
            "id".to_string(),
            serde_json::Value::String(session_id.to_string()),
        );
        let mut create = serde_json::Map::new();
        create.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "learning_sessions".to_string(),
            r#where: where_clause,
            create,
            update: serde_json::Map::new(),
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|err| RecordError::Mutation(err.to_string()))?;
        return Ok(());
    }

    let Some(primary) = proxy.primary_pool().await else {
        return Err(RecordError::Sql(sqlx::Error::PoolClosed));
    };
    sqlx::query(r#"INSERT INTO "learning_sessions" ("id","userId") VALUES ($1,$2) ON CONFLICT ("id") DO NOTHING"#)
        .bind(session_id)
        .bind(user_id)
        .execute(&primary)
        .await?;

    Ok(())
}

#[derive(Debug, Clone)]
struct ResolvedRecord {
    input: CreateRecordInput,
    timestamp_ms: i64,
}

fn resolve_selected_answer(input: &CreateRecordInput) -> String {
    input
        .selected_answer
        .as_deref()
        .or_else(|| input.selected_option.as_deref())
        .unwrap_or("")
        .to_string()
}

fn validate_record_input(input: &CreateRecordInput) -> Result<(), RecordError> {
    if Uuid::parse_str(&input.word_id).is_err() {
        return Err(RecordError::Validation("无效的单词ID".to_string()));
    }

    if let Some(value) = input.selected_answer.as_deref() {
        if value.trim().is_empty() {
            return Err(RecordError::Validation("selectedAnswer 不能为空".to_string()));
        }
    }

    if let Some(value) = input.selected_option.as_deref() {
        if value.trim().is_empty() {
            return Err(RecordError::Validation("selectedOption 不能为空".to_string()));
        }
    }

    if let Some(value) = input.correct_answer.as_deref() {
        if value.trim().is_empty() {
            return Err(RecordError::Validation("correctAnswer 不能为空".to_string()));
        }
    }

    if let Some(value) = input.response_time {
        if value < 0 {
            return Err(RecordError::Validation("responseTime 必须是非负整数".to_string()));
        }
    }

    if let Some(value) = input.dwell_time {
        if value < 0 {
            return Err(RecordError::Validation("dwellTime 必须是非负整数".to_string()));
        }
    }

    if let Some(value) = input.timestamp_ms {
        if value < 0 {
            return Err(RecordError::Validation("timestamp 必须是非负整数".to_string()));
        }
    }

    if let Some(session) = input.session_id.as_deref() {
        if session.len() > 255 {
            return Err(RecordError::Validation("sessionId 长度不能超过 255".to_string()));
        }
    }

    Ok(())
}

fn validate_timestamp_ms(timestamp: i64) -> Result<i64, RecordError> {
    let now = Utc::now().timestamp_millis();
    if timestamp > now + TIMESTAMP_FUTURE_LIMIT_MS {
        return Err(RecordError::Validation("时间戳不能超过当前时间1小时".to_string()));
    }
    if timestamp < now - TIMESTAMP_PAST_LIMIT_MS {
        return Err(RecordError::Validation("时间戳不能早于24小时前".to_string()));
    }
    Ok(timestamp)
}

async fn ensure_word_access(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
) -> Result<(), RecordError> {
    let Some((book_type, book_user)) = select_word_book_owner(proxy, state, word_id).await? else {
        return Err(RecordError::NotFound("单词不存在".to_string()));
    };

    if book_type == "USER" && book_user.as_deref() != Some(user_id) {
        return Err(RecordError::Unauthorized("无权访问该单词".to_string()));
    }

    Ok(())
}

async fn select_word_book_owner(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    word_id: &str,
) -> Result<Option<(String, Option<String>)>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT wb."type" as "type", wb."userId" as "userId"
            FROM "words" w
            JOIN "word_books" wb ON wb."id" = w."wordBookId"
            WHERE w."id" = ?
            LIMIT 1
            "#,
        )
        .bind(word_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|row| {
            let t: String = row.try_get("type").unwrap_or_default();
            let owner: Option<String> = row.try_get("userId").ok();
            (t, owner)
        }))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(
            r#"
            SELECT wb."type"::text as "type", wb."userId" as "userId"
            FROM "words" w
            JOIN "word_books" wb ON wb."id" = w."wordBookId"
            WHERE w."id" = $1
            LIMIT 1
            "#,
        )
        .bind(word_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|row| {
            let t: String = row.try_get("type").unwrap_or_default();
            let owner: Option<String> = row.try_get("userId").ok();
            (t, owner)
        }))
    }
}

async fn record_word_review_trace(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
    timestamp_ms: i64,
    is_correct: bool,
    response_time: i64,
) -> Result<(), sqlx::Error> {
    let timestamp_iso = crate::auth::format_timestamp_ms_iso_millis(timestamp_ms)
        .unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".to_string(), serde_json::Value::String(Uuid::new_v4().to_string()));
        data.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        data.insert("wordId".to_string(), serde_json::Value::String(word_id.to_string()));
        data.insert("timestamp".to_string(), serde_json::Value::String(timestamp_iso));
        data.insert("isCorrect".to_string(), serde_json::Value::Bool(is_correct));
        data.insert(
            "responseTime".to_string(),
            serde_json::Value::Number(response_time.into()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "word_review_traces".to_string(),
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: Some(timestamp_ms.max(0) as u64),
            critical: Some(false),
        };
        if proxy.write_operation(state, op).await.is_err() {
            return Ok(());
        }
        return Ok(());
    }

    let Some(primary) = proxy.primary_pool().await else {
        return Ok(());
    };
    let ts = DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
        .unwrap_or_else(|| Utc::now())
        .naive_utc();
    let _ = sqlx::query(
        r#"
        INSERT INTO "word_review_traces"
          ("id","userId","wordId","timestamp","isCorrect","responseTime")
        VALUES ($1,$2,$3,$4,$5,$6)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(word_id)
    .bind(ts)
    .bind(is_correct)
    .bind(response_time as i32)
    .execute(&primary)
    .await;

    Ok(())
}

async fn select_accessible_word_ids(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"
            SELECT w."id" as "id"
            FROM "words" w
            JOIN "word_books" wb ON wb."id" = w."wordBookId"
            WHERE w."id" IN (
            "#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids {
                sep.push_bind(id);
            }
            sep.push_unseparated(")");
        }
        qb.push(" AND (wb.\"type\" = 'SYSTEM' OR (wb.\"type\" = 'USER' AND wb.\"userId\" = ");
        qb.push_bind(user_id);
        qb.push("))");
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("id").ok())
            .collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"
            SELECT w."id" as "id"
            FROM "words" w
            JOIN "word_books" wb ON wb."id" = w."wordBookId"
            WHERE w."id" IN (
            "#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids {
                sep.push_bind(id);
            }
            sep.push_unseparated(")");
        }
        qb.push(" AND (wb.\"type\"::text = 'SYSTEM' OR (wb.\"type\"::text = 'USER' AND wb.\"userId\" = ");
        qb.push_bind(user_id);
        qb.push("))");
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("id").ok())
            .collect())
    }
}

async fn select_existing_record_keys(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    records: &[ResolvedRecord],
) -> Result<HashSet<String>, sqlx::Error> {
    if records.is_empty() {
        return Ok(HashSet::new());
    }

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(HashSet::new());
        };

        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"
            SELECT "userId","wordId","timestamp"
            FROM "answer_records"
            WHERE "userId" = ?
              AND (
            "#,
        );
        qb.push_bind(user_id);
        for (idx, record) in records.iter().enumerate() {
            if idx > 0 {
                qb.push(" OR ");
            }
            qb.push("(\"wordId\" = ");
            qb.push_bind(&record.input.word_id);
            qb.push(" AND \"timestamp\" = ");
            qb.push_bind(canonical_sqlite_rfc3339(record.timestamp_ms));
            qb.push(")");
        }
        qb.push(")");

        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let word_id: String = row.try_get("wordId").ok()?;
                let ts_raw: String = row.try_get("timestamp").ok()?;
                let ts_ms = crate::auth::parse_sqlite_datetime_ms(&ts_raw)?;
                Some(format!("{user_id}-{word_id}-{ts_ms}"))
            })
            .collect())
    } else {
        let Some(pool) = primary else {
            return Ok(HashSet::new());
        };

        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"
            SELECT "userId","wordId","timestamp"
            FROM "answer_records"
            WHERE "userId" = 
            "#,
        );
        qb.push_bind(user_id);
        qb.push(" AND (");

        for (idx, record) in records.iter().enumerate() {
            if idx > 0 {
                qb.push(" OR ");
            }
            let ts_dt = DateTime::<Utc>::from_timestamp_millis(record.timestamp_ms)
                .unwrap_or_else(|| Utc::now())
                .naive_utc();
            qb.push("(\"wordId\" = ");
            qb.push_bind(&record.input.word_id);
            qb.push(" AND \"timestamp\" = ");
            qb.push_bind(ts_dt);
            qb.push(")");
        }
        qb.push(")");

        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let word_id: String = row.try_get("wordId").ok()?;
                let ts: NaiveDateTime = row.try_get("timestamp").ok()?;
                let ts_ms = DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc).timestamp_millis();
                Some(format!("{user_id}-{word_id}-{ts_ms}"))
            })
            .collect())
    }
}

fn canonical_sqlite_rfc3339(timestamp_ms: i64) -> String {
    crate::auth::format_timestamp_ms_iso_millis(timestamp_ms)
        .unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true))
}

async fn get_paginated_records(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    session_id: Option<&str>,
    options: PaginationOptions,
) -> Result<PaginatedResult<AnswerRecordWithWord>, sqlx::Error> {
    let page = options.page.unwrap_or(1).max(1);
    let page_size = options.page_size.unwrap_or(50).max(1).min(100);
    let offset = (page - 1) * page_size;

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    let (data, total) = if use_fallback {
        let Some(pool) = fallback else {
            return Ok(PaginatedResult {
                data: Vec::new(),
                pagination: Pagination {
                    page,
                    page_size,
                    total: 0,
                    total_pages: 0,
                },
            });
        };

        let (data, total) = tokio::try_join!(
            select_answer_records_sqlite(&pool, user_id, session_id, page_size, offset),
            count_answer_records_sqlite(&pool, user_id, session_id),
        )?;
        (data, total)
    } else {
        let Some(pool) = primary else {
            return Ok(PaginatedResult {
                data: Vec::new(),
                pagination: Pagination {
                    page,
                    page_size,
                    total: 0,
                    total_pages: 0,
                },
            });
        };

        let (data, total) = tokio::try_join!(
            select_answer_records_pg(&pool, user_id, session_id, page_size, offset),
            count_answer_records_pg(&pool, user_id, session_id),
        )?;
        (data, total)
    };

    let total_pages = if total > 0 {
        (total + page_size - 1) / page_size
    } else {
        0
    };

    Ok(PaginatedResult {
        data,
        pagination: Pagination {
            page,
            page_size,
            total,
            total_pages,
        },
    })
}

async fn select_answer_records_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
    session_id: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<AnswerRecordWithWord>, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          ar."id",
          ar."userId",
          ar."wordId",
          ar."selectedAnswer",
          ar."correctAnswer",
          ar."isCorrect",
          ar."timestamp",
          ar."dwellTime",
          ar."masteryLevelAfter",
          ar."masteryLevelBefore",
          ar."responseTime",
          ar."sessionId",
          w."spelling" as "wSpelling",
          w."phonetic" as "wPhonetic",
          w."meanings" as "wMeanings"
        FROM "answer_records" ar
        JOIN "words" w ON w."id" = ar."wordId"
        WHERE ar."userId" = 
        "#,
    );
    qb.push_bind(user_id);
    if let Some(session_id) = session_id {
        qb.push(" AND ar.\"sessionId\" = ");
        qb.push_bind(session_id);
    }
    qb.push(" ORDER BY ar.\"timestamp\" DESC LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_answer_record_pg).collect())
}

async fn count_answer_records_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
    session_id: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT COUNT(*) as "count" FROM "answer_records" WHERE "userId" = "#,
    );
    qb.push_bind(user_id);
    if let Some(session_id) = session_id {
        qb.push(" AND \"sessionId\" = ");
        qb.push_bind(session_id);
    }
    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn select_answer_records_sqlite(
    pool: &sqlx::SqlitePool,
    user_id: &str,
    session_id: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<AnswerRecordWithWord>, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT
          ar."id" as "id",
          ar."userId" as "userId",
          ar."wordId" as "wordId",
          ar."selectedAnswer" as "selectedAnswer",
          ar."correctAnswer" as "correctAnswer",
          ar."isCorrect" as "isCorrect",
          ar."timestamp" as "timestamp",
          ar."dwellTime" as "dwellTime",
          ar."masteryLevelAfter" as "masteryLevelAfter",
          ar."masteryLevelBefore" as "masteryLevelBefore",
          ar."responseTime" as "responseTime",
          ar."sessionId" as "sessionId",
          w."spelling" as "wSpelling",
          w."phonetic" as "wPhonetic",
          w."meanings" as "wMeanings"
        FROM "answer_records" ar
        JOIN "words" w ON w."id" = ar."wordId"
        WHERE ar."userId" = ?
        "#,
    );
    qb.push_bind(user_id);
    if let Some(session_id) = session_id {
        qb.push(" AND ar.\"sessionId\" = ");
        qb.push_bind(session_id);
    }
    qb.push(" ORDER BY ar.\"timestamp\" DESC LIMIT ");
    qb.push_bind(limit);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_answer_record_sqlite).collect())
}

async fn count_answer_records_sqlite(
    pool: &sqlx::SqlitePool,
    user_id: &str,
    session_id: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
        r#"SELECT COUNT(*) as "count" FROM "answer_records" WHERE "userId" = ?"#,
    );
    qb.push_bind(user_id);
    if let Some(session_id) = session_id {
        qb.push(" AND \"sessionId\" = ");
        qb.push_bind(session_id);
    }
    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

fn map_answer_record_pg(row: sqlx::postgres::PgRow) -> AnswerRecordWithWord {
    let timestamp: NaiveDateTime = row.try_get("timestamp").unwrap_or_else(|_| Utc::now().naive_utc());
    AnswerRecordWithWord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        selected_answer: row.try_get("selectedAnswer").unwrap_or_default(),
        correct_answer: row.try_get("correctAnswer").unwrap_or_default(),
        is_correct: row.try_get::<bool, _>("isCorrect").unwrap_or(false),
        timestamp: crate::auth::format_naive_datetime_iso_millis(timestamp),
        dwell_time: row.try_get::<Option<i32>, _>("dwellTime").ok().flatten().map(|v| v as i64),
        mastery_level_after: row
            .try_get::<Option<i32>, _>("masteryLevelAfter")
            .ok()
            .flatten()
            .map(|v| v as i64),
        mastery_level_before: row
            .try_get::<Option<i32>, _>("masteryLevelBefore")
            .ok()
            .flatten()
            .map(|v| v as i64),
        response_time: row
            .try_get::<Option<i32>, _>("responseTime")
            .ok()
            .flatten()
            .map(|v| v as i64),
        session_id: row.try_get::<Option<String>, _>("sessionId").ok().flatten(),
        word: AnswerRecordWord {
            spelling: row.try_get("wSpelling").unwrap_or_default(),
            phonetic: row.try_get("wPhonetic").unwrap_or_default(),
            meanings: row.try_get::<Vec<String>, _>("wMeanings").unwrap_or_default(),
        },
    }
}

fn map_answer_record_sqlite(row: sqlx::sqlite::SqliteRow) -> AnswerRecordWithWord {
    let timestamp_raw: String = row.try_get("timestamp").unwrap_or_default();
    let meanings_raw: String = row.try_get("wMeanings").unwrap_or_else(|_| "[]".to_string());
    AnswerRecordWithWord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        selected_answer: row.try_get("selectedAnswer").unwrap_or_default(),
        correct_answer: row.try_get("correctAnswer").unwrap_or_default(),
        is_correct: row.try_get::<i64, _>("isCorrect").unwrap_or(0) != 0,
        timestamp: format_sqlite_datetime(&timestamp_raw),
        dwell_time: row.try_get::<Option<i64>, _>("dwellTime").ok().flatten(),
        mastery_level_after: row.try_get::<Option<i64>, _>("masteryLevelAfter").ok().flatten(),
        mastery_level_before: row.try_get::<Option<i64>, _>("masteryLevelBefore").ok().flatten(),
        response_time: row.try_get::<Option<i64>, _>("responseTime").ok().flatten(),
        session_id: row.try_get::<Option<String>, _>("sessionId").ok().flatten(),
        word: AnswerRecordWord {
            spelling: row.try_get("wSpelling").unwrap_or_default(),
            phonetic: row.try_get("wPhonetic").unwrap_or_default(),
            meanings: parse_json_string_array(&meanings_raw),
        },
    }
}

async fn select_accessible_word_book_ids(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT "id"
            FROM "word_books"
            WHERE "type" = 'SYSTEM' OR ("type" = 'USER' AND "userId" = ?)
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;
        Ok(rows.into_iter().filter_map(|r| r.try_get::<String, _>("id").ok()).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT "id"
            FROM "word_books"
            WHERE "type"::text = 'SYSTEM' OR ("type"::text = 'USER' AND "userId" = $1)
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;
        Ok(rows.into_iter().filter_map(|r| r.try_get::<String, _>("id").ok()).collect())
    }
}

async fn count_words_in_word_books(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    word_book_ids: &[String],
) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(0);
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(0);
        };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT COUNT(*) as "count" FROM "words" WHERE "wordBookId" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_book_ids {
                sep.push_bind(id);
            }
            sep.push_unseparated(")");
        }
        let row = qb.build().fetch_one(&pool).await?;
        Ok(row.try_get::<i64, _>("count").unwrap_or(0))
    } else {
        let Some(pool) = primary else {
            return Ok(0);
        };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT COUNT(*) as "count" FROM "words" WHERE "wordBookId" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_book_ids {
                sep.push_bind(id);
            }
            sep.push_unseparated(")");
        }
        let row = qb.build().fetch_one(&pool).await?;
        Ok(row.try_get::<i64, _>("count").unwrap_or(0))
    }
}

async fn count_answer_records(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    is_correct: Option<bool>,
) -> Result<i64, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(0);
        };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT COUNT(*) as "count" FROM "answer_records" WHERE "userId" = ?"#,
        );
        qb.push_bind(user_id);
        if let Some(flag) = is_correct {
            qb.push(" AND \"isCorrect\" = ");
            qb.push_bind(if flag { 1_i64 } else { 0_i64 });
        }
        let row = qb.build().fetch_one(&pool).await?;
        Ok(row.try_get::<i64, _>("count").unwrap_or(0))
    } else {
        let Some(pool) = primary else {
            return Ok(0);
        };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT COUNT(*) as "count" FROM "answer_records" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        if let Some(flag) = is_correct {
            qb.push(" AND \"isCorrect\" = ");
            qb.push_bind(flag);
        }
        let row = qb.build().fetch_one(&pool).await?;
        Ok(row.try_get::<i64, _>("count").unwrap_or(0))
    }
}

async fn select_recent_records(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Vec<RecentRecord>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT
              ar."id" as "id",
              ar."userId" as "userId",
              ar."wordId" as "wordId",
              ar."selectedAnswer" as "selectedAnswer",
              ar."correctAnswer" as "correctAnswer",
              ar."isCorrect" as "isCorrect",
              ar."timestamp" as "timestamp",
              ar."responseTime" as "responseTime",
              ar."dwellTime" as "dwellTime",
              ar."sessionId" as "sessionId",
              w."spelling" as "wSpelling",
              w."phonetic" as "wPhonetic"
            FROM "answer_records" ar
            JOIN "words" w ON w."id" = ar."wordId"
            WHERE ar."userId" = ?
            ORDER BY ar."timestamp" DESC
            LIMIT 10
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;
        Ok(rows.into_iter().map(map_recent_record_sqlite).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT
              ar."id",
              ar."userId",
              ar."wordId",
              ar."selectedAnswer",
              ar."correctAnswer",
              ar."isCorrect",
              ar."timestamp",
              ar."responseTime",
              ar."dwellTime",
              ar."sessionId",
              w."spelling" as "wSpelling",
              w."phonetic" as "wPhonetic"
            FROM "answer_records" ar
            JOIN "words" w ON w."id" = ar."wordId"
            WHERE ar."userId" = $1
            ORDER BY ar."timestamp" DESC
            LIMIT 10
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;
        Ok(rows.into_iter().map(map_recent_record_pg).collect())
    }
}

fn map_recent_record_pg(row: sqlx::postgres::PgRow) -> RecentRecord {
    let timestamp: NaiveDateTime = row.try_get("timestamp").unwrap_or_else(|_| Utc::now().naive_utc());
    RecentRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        selected_answer: row.try_get("selectedAnswer").unwrap_or_default(),
        correct_answer: row.try_get("correctAnswer").unwrap_or_default(),
        is_correct: row.try_get::<bool, _>("isCorrect").unwrap_or(false),
        timestamp: crate::auth::format_naive_datetime_iso_millis(timestamp),
        response_time: row.try_get::<Option<i32>, _>("responseTime").ok().flatten().map(|v| v as i64),
        dwell_time: row.try_get::<Option<i32>, _>("dwellTime").ok().flatten().map(|v| v as i64),
        session_id: row.try_get::<Option<String>, _>("sessionId").ok().flatten(),
        word: RecentWord {
            spelling: row.try_get("wSpelling").unwrap_or_default(),
            phonetic: row.try_get("wPhonetic").unwrap_or_default(),
        },
    }
}

fn map_recent_record_sqlite(row: sqlx::sqlite::SqliteRow) -> RecentRecord {
    let timestamp_raw: String = row.try_get("timestamp").unwrap_or_default();
    RecentRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        selected_answer: row.try_get("selectedAnswer").unwrap_or_default(),
        correct_answer: row.try_get("correctAnswer").unwrap_or_default(),
        is_correct: row.try_get::<i64, _>("isCorrect").unwrap_or(0) != 0,
        timestamp: format_sqlite_datetime(&timestamp_raw),
        response_time: row.try_get::<Option<i64>, _>("responseTime").ok().flatten(),
        dwell_time: row.try_get::<Option<i64>, _>("dwellTime").ok().flatten(),
        session_id: row.try_get::<Option<String>, _>("sessionId").ok().flatten(),
        word: RecentWord {
            spelling: row.try_get("wSpelling").unwrap_or_default(),
            phonetic: row.try_get("wPhonetic").unwrap_or_default(),
        },
    }
}

async fn select_learning_session_owner(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(None) };
        let row = sqlx::query(r#"SELECT "userId" FROM "learning_sessions" WHERE "id" = ? LIMIT 1"#)
            .bind(session_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|row| row.try_get::<String, _>("userId").ok()))
    } else {
        let Some(pool) = primary else { return Ok(None) };
        let row = sqlx::query(r#"SELECT "userId" FROM "learning_sessions" WHERE "id" = $1 LIMIT 1"#)
            .bind(session_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|row| row.try_get::<String, _>("userId").ok()))
    }
}

fn parse_json_string_array(raw: &str) -> Vec<String> {
    match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::Array(items)) => items
            .into_iter()
            .filter_map(|item| match item {
                serde_json::Value::String(v) => Some(v),
                other => Some(other.to_string()),
            })
            .collect(),
        Ok(serde_json::Value::String(v)) => vec![v],
        _ => Vec::new(),
    }
}

fn format_sqlite_datetime(raw: &str) -> String {
    let ms = crate::auth::parse_sqlite_datetime_ms(raw)
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    crate::auth::format_timestamp_ms_iso_millis(ms).unwrap_or_else(|| Utc::now().to_rfc3339())
}
