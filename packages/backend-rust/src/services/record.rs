use std::collections::HashSet;

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

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
pub struct EnhancedStudyStatistics {
    pub total_words: i64,
    pub total_records: i64,
    pub correct_rate: f64,
    pub recent_records: Vec<RecentRecord>,
    pub study_days: i64,
    pub consecutive_days: i64,
    pub daily_accuracy: Vec<DailyAccuracyItem>,
    pub weekday_heat: Vec<i32>,
    pub mastery_distribution: Vec<MasteryLevelCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAccuracyItem {
    pub date: String,
    pub accuracy: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryLevelCount {
    pub level: i32,
    pub count: i64,
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
    pub id: String,
    pub word: String,
    pub definition: String,
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
    user_id: &str,
    input: CreateRecordInput,
) -> Result<AnswerRecord, RecordError> {
    validate_record_input(&input)?;

    if let Some(session_id) = input.session_id.as_deref() {
        ensure_learning_session_exists(proxy, session_id, user_id).await?;
    }

    ensure_word_access(proxy, user_id, &input.word_id).await?;

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

    let pool = proxy.pool();
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
    .execute(pool)
    .await?;

    let review_ts_ms = input.timestamp_ms.unwrap_or(now_ms);
    if let Err(err) = record_word_review_trace(
        proxy,
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
        resolved.push(ResolvedRecord {
            input: record,
            timestamp_ms: ts_ms,
        });
    }

    let word_ids: Vec<String> = resolved.iter().map(|r| r.input.word_id.clone()).collect();
    let unique_word_ids: Vec<String> = word_ids
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let accessible_word_ids = select_accessible_word_ids(proxy, user_id, &unique_word_ids).await?;
    let accessible_set: HashSet<&str> = accessible_word_ids.iter().map(|id| id.as_str()).collect();

    let valid: Vec<ResolvedRecord> = resolved
        .into_iter()
        .filter(|r| accessible_set.contains(r.input.word_id.as_str()))
        .collect();

    if valid.is_empty() {
        return Err(RecordError::Validation(
            "所有单词都不存在或无权访问".to_string(),
        ));
    }

    let session_ids: Vec<String> = valid
        .iter()
        .filter_map(|r| r.input.session_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    for session_id in session_ids {
        ensure_learning_session_exists(proxy, &session_id, user_id).await?;
    }

    let existing_keys = select_existing_record_keys(proxy, user_id, &valid).await?;

    let mut new_records: Vec<ResolvedRecord> = Vec::new();
    for record in &valid {
        let key = format!("{user_id}-{}-{}", record.input.word_id, record.timestamp_ms);
        if !existing_keys.contains(key.as_str()) {
            new_records.push(record.clone());
        }
    }

    let pool = proxy.pool();
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
    qb.build().execute(pool).await?;

    if !new_records.is_empty() {
        for record in &new_records {
            let review_ts = record.input.timestamp_ms.unwrap_or(now_ms);
            if let Err(err) = record_word_review_trace(
                proxy,
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
    user_id: &str,
    options: PaginationOptions,
) -> Result<PaginatedResult<AnswerRecordWithWord>, sqlx::Error> {
    get_paginated_records(proxy, user_id, None, options).await
}

pub async fn get_records_by_session_id(
    proxy: &DatabaseProxy,
    user_id: &str,
    session_id: &str,
    options: PaginationOptions,
) -> Result<PaginatedResult<AnswerRecordWithWord>, sqlx::Error> {
    get_paginated_records(proxy, user_id, Some(session_id), options).await
}

pub async fn get_statistics(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<StudyStatistics, sqlx::Error> {
    get_statistics_with_period(proxy, user_id, None).await
}

pub async fn get_statistics_with_period(
    proxy: &DatabaseProxy,
    user_id: &str,
    period: Option<&str>,
) -> Result<StudyStatistics, sqlx::Error> {
    let word_book_ids = select_accessible_word_book_ids(proxy, user_id).await?;
    let total_words = if word_book_ids.is_empty() {
        0
    } else {
        count_words_in_word_books(proxy, &word_book_ids).await?
    };

    let date_filter = parse_period_to_date_filter(period);
    let total_records = count_answer_records_with_date(proxy, user_id, None, date_filter).await?;
    let correct_records =
        count_answer_records_with_date(proxy, user_id, Some(true), date_filter).await?;
    let recent_records = select_recent_records_with_date(proxy, user_id, date_filter).await?;

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

fn parse_period_to_date_filter(period: Option<&str>) -> Option<(NaiveDateTime, NaiveDateTime)> {
    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0)?;
    let today_end = now.naive_utc();

    match period? {
        "today" => Some((today_start, today_end)),
        "week" => {
            let week_ago = today_start - chrono::Duration::days(7);
            Some((week_ago, today_end))
        }
        "month" => {
            let month_ago = today_start - chrono::Duration::days(30);
            Some((month_ago, today_end))
        }
        _ => None,
    }
}

pub async fn ensure_learning_session_exists(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<(), RecordError> {
    let owner = select_learning_session_owner(proxy, session_id).await?;
    if let Some(existing_user) = owner {
        if existing_user != user_id {
            return Err(RecordError::Unauthorized(format!(
                "Session {session_id} belongs to different user"
            )));
        }
        return Ok(());
    }

    let pool = proxy.pool();
    let now = chrono::Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "learning_sessions"
          ("id","userId","startedAt","totalQuestions","actualMasteryCount","sessionType","contextShifts","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6::"SessionType",$7,$8,$9)
        ON CONFLICT ("id") DO NOTHING
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .bind(now)
    .bind(0_i32)
    .bind(0_i32)
    .bind("NORMAL")
    .bind(0_i32)
    .bind(now)
    .bind(now)
    .execute(pool)
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
            return Err(RecordError::Validation(
                "selectedAnswer 不能为空".to_string(),
            ));
        }
    }

    if let Some(value) = input.selected_option.as_deref() {
        if value.trim().is_empty() {
            return Err(RecordError::Validation(
                "selectedOption 不能为空".to_string(),
            ));
        }
    }

    if let Some(value) = input.correct_answer.as_deref() {
        if value.trim().is_empty() {
            return Err(RecordError::Validation(
                "correctAnswer 不能为空".to_string(),
            ));
        }
    }

    if let Some(value) = input.response_time {
        if value < 0 {
            return Err(RecordError::Validation(
                "responseTime 必须是非负整数".to_string(),
            ));
        }
    }

    if let Some(value) = input.dwell_time {
        if value < 0 {
            return Err(RecordError::Validation(
                "dwellTime 必须是非负整数".to_string(),
            ));
        }
    }

    if let Some(value) = input.timestamp_ms {
        if value < 0 {
            return Err(RecordError::Validation(
                "timestamp 必须是非负整数".to_string(),
            ));
        }
    }

    if let Some(session) = input.session_id.as_deref() {
        if session.len() > 255 {
            return Err(RecordError::Validation(
                "sessionId 长度不能超过 255".to_string(),
            ));
        }
    }

    Ok(())
}

fn validate_timestamp_ms(timestamp: i64) -> Result<i64, RecordError> {
    let now = Utc::now().timestamp_millis();
    if timestamp > now + TIMESTAMP_FUTURE_LIMIT_MS {
        return Err(RecordError::Validation(
            "时间戳不能超过当前时间1小时".to_string(),
        ));
    }
    if timestamp < now - TIMESTAMP_PAST_LIMIT_MS {
        return Err(RecordError::Validation(
            "时间戳不能早于24小时前".to_string(),
        ));
    }
    Ok(timestamp)
}

async fn ensure_word_access(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<(), RecordError> {
    let Some((book_type, book_user)) = select_word_book_owner(proxy, word_id).await? else {
        return Err(RecordError::NotFound("单词不存在".to_string()));
    };

    if book_type == "USER" && book_user.as_deref() != Some(user_id) {
        return Err(RecordError::Unauthorized("无权访问该单词".to_string()));
    }

    Ok(())
}

async fn select_word_book_owner(
    proxy: &DatabaseProxy,
    word_id: &str,
) -> Result<Option<(String, Option<String>)>, sqlx::Error> {
    let pool = proxy.pool();
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
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| {
        let t: String = row.try_get("type").unwrap_or_default();
        let owner: Option<String> = row.try_get("userId").ok();
        (t, owner)
    }))
}

async fn record_word_review_trace(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    timestamp_ms: i64,
    is_correct: bool,
    response_time: i64,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
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
    .execute(pool)
    .await;

    Ok(())
}

async fn select_accessible_word_ids(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let pool = proxy.pool();
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
    qb.push(
        " AND (wb.\"type\"::text = 'SYSTEM' OR (wb.\"type\"::text = 'USER' AND wb.\"userId\" = ",
    );
    qb.push_bind(user_id);
    qb.push("))");
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("id").ok())
        .collect())
}

async fn select_existing_record_keys(
    proxy: &DatabaseProxy,
    user_id: &str,
    records: &[ResolvedRecord],
) -> Result<HashSet<String>, sqlx::Error> {
    if records.is_empty() {
        return Ok(HashSet::new());
    }

    let pool = proxy.pool();
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

    let rows = qb.build().fetch_all(pool).await?;
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

async fn get_paginated_records(
    proxy: &DatabaseProxy,
    user_id: &str,
    session_id: Option<&str>,
    options: PaginationOptions,
) -> Result<PaginatedResult<AnswerRecordWithWord>, sqlx::Error> {
    let page = options.page.unwrap_or(1).max(1);
    let page_size = options.page_size.unwrap_or(50).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let pool = proxy.pool();
    let (data, total) = tokio::try_join!(
        select_answer_records_pg(&pool, user_id, session_id, page_size, offset),
        count_answer_records_pg(&pool, user_id, session_id),
    )?;

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

fn map_answer_record_pg(row: sqlx::postgres::PgRow) -> AnswerRecordWithWord {
    let timestamp: NaiveDateTime = row
        .try_get("timestamp")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    AnswerRecordWithWord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        selected_answer: row.try_get("selectedAnswer").unwrap_or_default(),
        correct_answer: row.try_get("correctAnswer").unwrap_or_default(),
        is_correct: row.try_get::<bool, _>("isCorrect").unwrap_or(false),
        timestamp: crate::auth::format_naive_datetime_iso_millis(timestamp),
        dwell_time: row
            .try_get::<Option<i32>, _>("dwellTime")
            .ok()
            .flatten()
            .map(|v| v as i64),
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
            meanings: row
                .try_get::<Vec<String>, _>("wMeanings")
                .unwrap_or_default(),
        },
    }
}

async fn select_accessible_word_book_ids(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "id"
        FROM "word_books"
        WHERE "type"::text = 'SYSTEM' OR ("type"::text = 'USER' AND "userId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|r| r.try_get::<String, _>("id").ok())
        .collect())
}

async fn count_words_in_word_books(
    proxy: &DatabaseProxy,
    word_book_ids: &[String],
) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(0);
    }
    let pool = proxy.pool();
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
    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn count_answer_records(
    proxy: &DatabaseProxy,
    user_id: &str,
    is_correct: Option<bool>,
) -> Result<i64, sqlx::Error> {
    count_answer_records_with_date(proxy, user_id, is_correct, None).await
}

async fn count_answer_records_with_date(
    proxy: &DatabaseProxy,
    user_id: &str,
    is_correct: Option<bool>,
    date_filter: Option<(NaiveDateTime, NaiveDateTime)>,
) -> Result<i64, sqlx::Error> {
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT COUNT(*) as "count" FROM "answer_records" WHERE "userId" = "#,
    );
    qb.push_bind(user_id);
    if let Some(flag) = is_correct {
        qb.push(" AND \"isCorrect\" = ");
        qb.push_bind(flag);
    }
    if let Some((start, end)) = date_filter {
        qb.push(" AND \"timestamp\" >= ");
        qb.push_bind(start);
        qb.push(" AND \"timestamp\" <= ");
        qb.push_bind(end);
    }
    let row = qb.build().fetch_one(pool).await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn select_recent_records(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<RecentRecord>, sqlx::Error> {
    select_recent_records_with_date(proxy, user_id, None).await
}

async fn select_recent_records_with_date(
    proxy: &DatabaseProxy,
    user_id: &str,
    date_filter: Option<(NaiveDateTime, NaiveDateTime)>,
) -> Result<Vec<RecentRecord>, sqlx::Error> {
    let pool = proxy.pool();
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
          ar."responseTime",
          ar."dwellTime",
          ar."sessionId",
          w."id" as "wId",
          w."spelling" as "wSpelling",
          w."phonetic" as "wPhonetic",
          w."meanings" as "wMeanings"
        FROM "answer_records" ar
        JOIN "words" w ON w."id" = ar."wordId"
        WHERE ar."userId" = "#,
    );
    qb.push_bind(user_id);
    if let Some((start, end)) = date_filter {
        qb.push(" AND ar.\"timestamp\" >= ");
        qb.push_bind(start);
        qb.push(" AND ar.\"timestamp\" <= ");
        qb.push_bind(end);
    }
    qb.push(" ORDER BY ar.\"timestamp\" DESC LIMIT 10");
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_recent_record_pg).collect())
}

fn map_recent_record_pg(row: sqlx::postgres::PgRow) -> RecentRecord {
    let timestamp: NaiveDateTime = row
        .try_get("timestamp")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let meanings: Option<serde_json::Value> = row.try_get("wMeanings").ok();
    let definition = meanings
        .and_then(|v| {
            v.as_array()
                .and_then(|arr| arr.first().and_then(|m| m.as_str().map(|s| s.to_string())))
        })
        .unwrap_or_default();
    RecentRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        selected_answer: row.try_get("selectedAnswer").unwrap_or_default(),
        correct_answer: row.try_get("correctAnswer").unwrap_or_default(),
        is_correct: row.try_get::<bool, _>("isCorrect").unwrap_or(false),
        timestamp: crate::auth::format_naive_datetime_iso_millis(timestamp),
        response_time: row
            .try_get::<Option<i32>, _>("responseTime")
            .ok()
            .flatten()
            .map(|v| v as i64),
        dwell_time: row
            .try_get::<Option<i32>, _>("dwellTime")
            .ok()
            .flatten()
            .map(|v| v as i64),
        session_id: row.try_get::<Option<String>, _>("sessionId").ok().flatten(),
        word: RecentWord {
            id: row.try_get("wId").unwrap_or_default(),
            word: row.try_get("wSpelling").unwrap_or_default(),
            definition,
        },
    }
}

async fn select_learning_session_owner(
    proxy: &DatabaseProxy,
    session_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "userId" FROM "learning_sessions" WHERE "id" = $1 LIMIT 1"#)
        .bind(session_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|row| row.try_get::<String, _>("userId").ok()))
}

pub async fn get_enhanced_statistics(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<EnhancedStudyStatistics, sqlx::Error> {
    let (base, study_days, consecutive_days, daily_accuracy, weekday_heat, mastery_distribution) =
        tokio::try_join!(
            get_statistics(proxy, user_id),
            calculate_study_days(proxy, user_id),
            calculate_consecutive_days(proxy, user_id),
            calculate_daily_accuracy(proxy, user_id),
            calculate_weekday_heat(proxy, user_id),
            calculate_mastery_distribution(proxy, user_id),
        )?;

    Ok(EnhancedStudyStatistics {
        total_words: base.total_words,
        total_records: base.total_records,
        correct_rate: base.correct_rate,
        recent_records: base.recent_records,
        study_days,
        consecutive_days,
        daily_accuracy,
        weekday_heat,
        mastery_distribution,
    })
}

async fn calculate_study_days(proxy: &DatabaseProxy, user_id: &str) -> Result<i64, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"SELECT COUNT(DISTINCT DATE("timestamp")) as "count" FROM "answer_records" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}

async fn calculate_consecutive_days(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<i64, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        WITH study_dates AS (
            SELECT DISTINCT DATE("timestamp") as study_date
            FROM "answer_records"
            WHERE "userId" = $1
        ),
        date_gaps AS (
            SELECT study_date,
                   study_date - (ROW_NUMBER() OVER (ORDER BY study_date))::int as grp
            FROM study_dates
        ),
        streaks AS (
            SELECT grp, COUNT(*) as streak_len, MAX(study_date) as last_date
            FROM date_gaps
            GROUP BY grp
        )
        SELECT COALESCE(
            (SELECT streak_len FROM streaks
             WHERE last_date >= CURRENT_DATE - INTERVAL '1 day'
             ORDER BY last_date DESC LIMIT 1),
            0
        )::bigint as "consecutive"
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(row.try_get::<i64, _>("consecutive").unwrap_or(0))
}

async fn calculate_daily_accuracy(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<DailyAccuracyItem>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT
            DATE("timestamp")::text as "date",
            CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END)::float / COUNT(*)::float ELSE 0 END as "accuracy"
        FROM "answer_records"
        WHERE "userId" = $1 AND "timestamp" >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY DATE("timestamp")
        ORDER BY DATE("timestamp") ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| DailyAccuracyItem {
            date: row.try_get::<String, _>("date").unwrap_or_default(),
            accuracy: row.try_get::<f64, _>("accuracy").unwrap_or(0.0),
        })
        .collect())
}

async fn calculate_weekday_heat(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<i32>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT
            EXTRACT(DOW FROM "timestamp")::int as "dow",
            COUNT(*)::int as "count"
        FROM "answer_records"
        WHERE "userId" = $1
        GROUP BY EXTRACT(DOW FROM "timestamp")
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut heat = vec![0i32; 7];
    for row in rows {
        let dow: i32 = row.try_get("dow").unwrap_or(0);
        let count: i32 = row.try_get("count").unwrap_or(0);
        if dow >= 0 && dow < 7 {
            heat[dow as usize] = count;
        }
    }
    Ok(heat)
}

async fn calculate_mastery_distribution(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<MasteryLevelCount>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT
            COALESCE("masteryLevel", 0)::int as "level",
            COUNT(*)::bigint as "count"
        FROM "word_learning_states"
        WHERE "userId" = $1
        GROUP BY "masteryLevel"
        ORDER BY "level" ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut distribution: Vec<MasteryLevelCount> = (0..=5)
        .map(|level| MasteryLevelCount { level, count: 0 })
        .collect();

    for row in rows {
        let level: i32 = row.try_get("level").unwrap_or(0);
        let count: i64 = row.try_get("count").unwrap_or(0);
        if level >= 0 && level <= 5 {
            distribution[level as usize].count = count;
        }
    }
    Ok(distribution)
}
