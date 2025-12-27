use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::db::DatabaseProxy;

const MAX_BATCH_SIZE: usize = 500;
const TIMESTAMP_PAST_LIMIT_MS: i64 = 365 * 24 * 60 * 60 * 1000;
const TIMESTAMP_FUTURE_LIMIT_MS: i64 = 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordLearningStateRecord {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub state: String,
    pub mastery_level: i64,
    pub ease_factor: f64,
    pub review_count: i64,
    pub last_review_date: Option<String>,
    pub next_review_date: Option<String>,
    pub current_interval: i64,
    pub consecutive_correct: i64,
    pub consecutive_wrong: i64,
    pub half_life: f64,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct WordStateUpdate {
    pub state: Option<String>,
    pub mastery_level: Option<i64>,
    pub ease_factor: Option<f64>,
    pub review_count: Option<i64>,
    pub last_review_date: Option<Option<String>>,
    pub next_review_date: Option<Option<String>>,
    pub current_interval: Option<i64>,
    pub consecutive_correct: Option<i64>,
    pub consecutive_wrong: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum WordStateError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error(transparent)]
    Sql(#[from] sqlx::Error),
    #[error("db mutation failed: {0}")]
    Mutation(String),
}

pub async fn batch_get_word_states(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, WordLearningStateRecord>, WordStateError> {
    if word_ids.is_empty() {
        return Ok(HashMap::new());
    }
    if word_ids.len() > MAX_BATCH_SIZE {
        return Err(WordStateError::Validation(format!(
            "wordIds array exceeds maximum size of {MAX_BATCH_SIZE}"
        )));
    }

    let pool = proxy.pool();

    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "id","userId","wordId","state"::text as "state","masteryLevel","easeFactor","reviewCount",
          "lastReviewDate","nextReviewDate","currentInterval","consecutiveCorrect","consecutiveWrong",
          "halfLife","version","createdAt","updatedAt"
        FROM "word_learning_states"
        WHERE "userId" = "#,
    );
    qb.push_bind(user_id);
    qb.push(r#" AND "wordId" IN ("#);
    {
        let mut sep = qb.separated(", ");
        for id in word_ids {
            sep.push_bind(id);
        }
    }
    qb.push(")");

    let rows = qb.build().fetch_all(pool).await?;
    let mut out = HashMap::with_capacity(rows.len());
    for row in &rows {
        let record = map_pg_row(row);
        out.insert(record.word_id.clone(), record);
    }
    Ok(out)
}

pub async fn get_word_state(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordLearningStateRecord>, WordStateError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId","state"::text as "state","masteryLevel","easeFactor","reviewCount",
          "lastReviewDate","nextReviewDate","currentInterval","consecutiveCorrect","consecutiveWrong",
          "halfLife","version","createdAt","updatedAt"
        FROM "word_learning_states"
        WHERE "userId" = $1
          AND "wordId" = $2
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| map_pg_row(&row)))
}

pub async fn upsert_word_state(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    update: WordStateUpdate,
) -> Result<WordLearningStateRecord, WordStateError> {
    ensure_word_access(proxy, user_id, word_id).await?;

    let pool = proxy.pool();

    let now = Utc::now().naive_utc();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        INSERT INTO "word_learning_states"
          ("id","userId","wordId","updatedAt"
        "#,
    );

    let mut insert_values: Vec<(&'static str, serde_json::Value)> = Vec::new();
    collect_update_pairs(&mut insert_values, &update)?;

    for (key, _) in &insert_values {
        qb.push(", \"");
        qb.push(*key);
        qb.push("\"");
    }

    qb.push(") VALUES (");
    qb.push_bind(Uuid::new_v4().to_string());
    qb.push(", ");
    qb.push_bind(user_id);
    qb.push(", ");
    qb.push_bind(word_id);
    qb.push(", ");
    qb.push_bind(now);

    for (key, value) in &insert_values {
        qb.push(", ");
        match *key {
            "state" => {
                qb.push_bind(value.as_str().unwrap_or("NEW"));
                qb.push(r#"::"WordState""#);
            }
            "masteryLevel"
            | "reviewCount"
            | "currentInterval"
            | "consecutiveCorrect"
            | "consecutiveWrong"
            | "version" => {
                qb.push_bind(value.as_i64().map(|v| v as i32));
            }
            "easeFactor" | "halfLife" => {
                qb.push_bind(value.as_f64());
            }
            "lastReviewDate" | "nextReviewDate" => {
                qb.push_bind(value.as_str());
            }
            _ => {
                qb.push_bind(value.to_string());
            }
        };
    }
    qb.push(") ON CONFLICT (\"userId\",\"wordId\") DO UPDATE SET \"updatedAt\" = EXCLUDED.\"updatedAt\"");

    for (key, _value) in &insert_values {
        qb.push(", \"");
        qb.push(*key);
        qb.push("\" = EXCLUDED.\"");
        qb.push(*key);
        qb.push("\"");
    }

    qb.push(" RETURNING ");
    qb.push(
        r#"
        "id","userId","wordId","state"::text as "state","masteryLevel","easeFactor","reviewCount",
        "lastReviewDate","nextReviewDate","currentInterval","consecutiveCorrect","consecutiveWrong",
        "halfLife","version","createdAt","updatedAt"
        "#,
    );

    let row = qb.build().fetch_one(pool).await?;
    Ok(map_pg_row(&row))
}

pub async fn delete_word_state(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<(), WordStateError> {
    let pool = proxy.pool();

    let result = sqlx::query(
        r#"
        DELETE FROM "word_learning_states"
        WHERE "userId" = $1
          AND "wordId" = $2
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(WordStateError::NotFound("学习状态不存在".to_string()));
    }

    Ok(())
}

pub async fn list_due_words(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<WordLearningStateRecord>, sqlx::Error> {
    let pool = proxy.pool();

    let now_dt = Utc::now().naive_utc();
    let rows = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId","state"::text as "state","masteryLevel","easeFactor","reviewCount",
          "lastReviewDate","nextReviewDate","currentInterval","consecutiveCorrect","consecutiveWrong",
          "halfLife","version","createdAt","updatedAt"
        FROM "word_learning_states"
        WHERE "userId" = $1
          AND (
            (
              "nextReviewDate" <= $2
              AND "state"::text IN ('LEARNING','REVIEWING')
            )
            OR (
              "state"::text = 'NEW'
              AND ("nextReviewDate" IS NULL OR "nextReviewDate" <= $2)
            )
          )
        ORDER BY "nextReviewDate" ASC NULLS FIRST
        "#,
    )
    .bind(user_id)
    .bind(now_dt)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(map_pg_row).collect())
}

pub async fn list_words_by_state(
    proxy: &DatabaseProxy,
    user_id: &str,
    state_value: &str,
) -> Result<Vec<WordLearningStateRecord>, sqlx::Error> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId","state"::text as "state","masteryLevel","easeFactor","reviewCount",
          "lastReviewDate","nextReviewDate","currentInterval","consecutiveCorrect","consecutiveWrong",
          "halfLife","version","createdAt","updatedAt"
        FROM "word_learning_states"
        WHERE "userId" = $1
          AND "state"::text = $2
        ORDER BY "updatedAt" DESC
        "#,
    )
    .bind(user_id)
    .bind(state_value)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(map_pg_row).collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordStateStats {
    pub total_words: i64,
    pub new_words: i64,
    pub learning_words: i64,
    pub reviewing_words: i64,
    pub mastered_words: i64,
}

pub async fn get_state_stats(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<WordStateStats, sqlx::Error> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*)::bigint as "total",
          SUM(CASE WHEN "state"::text = 'NEW' THEN 1 ELSE 0 END)::bigint as "new",
          SUM(CASE WHEN "state"::text = 'LEARNING' THEN 1 ELSE 0 END)::bigint as "learning",
          SUM(CASE WHEN "state"::text = 'REVIEWING' THEN 1 ELSE 0 END)::bigint as "reviewing",
          SUM(CASE WHEN "state"::text = 'MASTERED' THEN 1 ELSE 0 END)::bigint as "mastered"
        FROM "word_learning_states"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(WordStateStats {
        total_words: row.try_get::<i64, _>("total").unwrap_or(0),
        new_words: row.try_get::<i64, _>("new").unwrap_or(0),
        learning_words: row.try_get::<i64, _>("learning").unwrap_or(0),
        reviewing_words: row.try_get::<i64, _>("reviewing").unwrap_or(0),
        mastered_words: row.try_get::<i64, _>("mastered").unwrap_or(0),
    })
}

fn apply_update_fields(
    target: &mut serde_json::Map<String, serde_json::Value>,
    update: &WordStateUpdate,
) -> Result<(), WordStateError> {
    if let Some(value) = update.state.as_deref() {
        target.insert("state".to_string(), serde_json::Value::String(value.to_string()));
    }
    if let Some(value) = update.mastery_level {
        target.insert("masteryLevel".to_string(), serde_json::Value::Number(value.into()));
    }
    if let Some(value) = update.ease_factor {
        let num = serde_json::Number::from_f64(value)
            .ok_or_else(|| WordStateError::Validation("easeFactor 格式错误".to_string()))?;
        target.insert("easeFactor".to_string(), serde_json::Value::Number(num));
    }
    if let Some(value) = update.review_count {
        target.insert("reviewCount".to_string(), serde_json::Value::Number(value.into()));
    }
    if let Some(value) = &update.last_review_date {
        match value {
            Some(iso) => target.insert("lastReviewDate".to_string(), serde_json::Value::String(iso.clone())),
            None => target.insert("lastReviewDate".to_string(), serde_json::Value::Null),
        };
    }
    if let Some(value) = &update.next_review_date {
        match value {
            Some(iso) => target.insert("nextReviewDate".to_string(), serde_json::Value::String(iso.clone())),
            None => target.insert("nextReviewDate".to_string(), serde_json::Value::Null),
        };
    }
    if let Some(value) = update.current_interval {
        target.insert("currentInterval".to_string(), serde_json::Value::Number(value.into()));
    }
    if let Some(value) = update.consecutive_correct {
        target.insert(
            "consecutiveCorrect".to_string(),
            serde_json::Value::Number(value.into()),
        );
    }
    if let Some(value) = update.consecutive_wrong {
        target.insert(
            "consecutiveWrong".to_string(),
            serde_json::Value::Number(value.into()),
        );
    }
    Ok(())
}

fn collect_update_pairs(
    out: &mut Vec<(&'static str, serde_json::Value)>,
    update: &WordStateUpdate,
) -> Result<(), WordStateError> {
    if let Some(value) = update.state.as_deref() {
        out.push(("state", serde_json::Value::String(value.to_string())));
    }
    if let Some(value) = update.mastery_level {
        out.push(("masteryLevel", serde_json::Value::Number(value.into())));
    }
    if let Some(value) = update.ease_factor {
        let num = serde_json::Number::from_f64(value)
            .ok_or_else(|| WordStateError::Validation("easeFactor 格式错误".to_string()))?;
        out.push(("easeFactor", serde_json::Value::Number(num)));
    }
    if let Some(value) = update.review_count {
        out.push(("reviewCount", serde_json::Value::Number(value.into())));
    }
    if let Some(value) = &update.last_review_date {
        match value {
            Some(iso) => out.push(("lastReviewDate", serde_json::Value::String(iso.clone()))),
            None => out.push(("lastReviewDate", serde_json::Value::Null)),
        }
    }
    if let Some(value) = &update.next_review_date {
        match value {
            Some(iso) => out.push(("nextReviewDate", serde_json::Value::String(iso.clone()))),
            None => out.push(("nextReviewDate", serde_json::Value::Null)),
        }
    }
    if let Some(value) = update.current_interval {
        out.push(("currentInterval", serde_json::Value::Number(value.into())));
    }
    if let Some(value) = update.consecutive_correct {
        out.push(("consecutiveCorrect", serde_json::Value::Number(value.into())));
    }
    if let Some(value) = update.consecutive_wrong {
        out.push(("consecutiveWrong", serde_json::Value::Number(value.into())));
    }
    Ok(())
}

async fn ensure_word_access(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<(), WordStateError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT wb."type"::text as "type", wb."userId" as "owner"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" = $1
        LIMIT 1
        "#,
    )
    .bind(word_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Err(WordStateError::NotFound("单词不存在".to_string()));
    };

    let wb_type: String = row.try_get("type").unwrap_or_default();
    let owner: Option<String> = row.try_get("owner").ok();
    if wb_type == "USER" && owner.as_deref() != Some(user_id) {
        return Err(WordStateError::Unauthorized("无权访问该单词".to_string()));
    }
    Ok(())
}

pub fn normalize_state_param(input: &str) -> Option<&'static str> {
    match input.trim() {
        "NEW" | "new" => Some("NEW"),
        "LEARNING" | "learning" => Some("LEARNING"),
        "REVIEWING" | "reviewing" | "review" => Some("REVIEWING"),
        "MASTERED" | "mastered" => Some("MASTERED"),
        _ => None,
    }
}

pub fn validate_timestamp_ms(value: i64) -> Result<Option<String>, WordStateError> {
    if value == 0 {
        return Ok(None);
    }

    let now = Utc::now().timestamp_millis();
    if value > now + TIMESTAMP_FUTURE_LIMIT_MS {
        return Err(WordStateError::Validation("时间戳不能超过当前时间1小时".to_string()));
    }
    if value < now - TIMESTAMP_PAST_LIMIT_MS {
        return Err(WordStateError::Validation("时间戳不能早于1年前".to_string()));
    }

    Ok(crate::auth::format_timestamp_ms_iso_millis(value))
}

pub fn parse_datetime_input(value: &serde_json::Value) -> Result<Option<Option<String>>, WordStateError> {
    if value.is_null() {
        return Ok(Some(None));
    }
    if let Some(ts) = value.as_i64() {
        let iso = validate_timestamp_ms(ts)?;
        return Ok(Some(iso));
    }
    if let Some(ts) = value.as_u64().and_then(|v| i64::try_from(v).ok()) {
        let iso = validate_timestamp_ms(ts)?;
        return Ok(Some(iso));
    }
    if let Some(s) = value.as_str() {
        if s.trim().is_empty() {
            return Ok(Some(None));
        }
        let Some(ms) = crate::auth::parse_sqlite_datetime_ms(s) else {
            return Err(WordStateError::Validation("无效的时间戳格式".to_string()));
        };
        let iso = validate_timestamp_ms(ms)?;
        return Ok(Some(iso));
    }

    Err(WordStateError::Validation("无效的时间戳格式".to_string()))
}

fn map_pg_row(row: &sqlx::postgres::PgRow) -> WordLearningStateRecord {
    let id: String = row.try_get("id").unwrap_or_default();
    let user_id: String = row.try_get("userId").unwrap_or_default();
    let word_id: String = row.try_get("wordId").unwrap_or_default();
    let state: String = row.try_get("state").unwrap_or_else(|_| "NEW".to_string());
    let mastery_level: i64 = row.try_get::<i32, _>("masteryLevel").map(|v| v as i64).unwrap_or(0);
    let ease_factor: f64 = row.try_get::<f64, _>("easeFactor").unwrap_or(2.5);
    let review_count: i64 = row.try_get::<i32, _>("reviewCount").map(|v| v as i64).unwrap_or(0);
    let last_dt: Option<NaiveDateTime> = row.try_get("lastReviewDate").ok();
    let next_dt: Option<NaiveDateTime> = row.try_get("nextReviewDate").ok();
    let current_interval: i64 = row.try_get::<i32, _>("currentInterval").map(|v| v as i64).unwrap_or(1);
    let consecutive_correct: i64 = row
        .try_get::<i32, _>("consecutiveCorrect")
        .map(|v| v as i64)
        .unwrap_or(0);
    let consecutive_wrong: i64 = row
        .try_get::<i32, _>("consecutiveWrong")
        .map(|v| v as i64)
        .unwrap_or(0);
    let half_life: f64 = row.try_get::<f64, _>("halfLife").unwrap_or(1.0);
    let version: i64 = row.try_get::<i32, _>("version").map(|v| v as i64).unwrap_or(0);
    let created_dt: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_dt: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());

    WordLearningStateRecord {
        id,
        user_id,
        word_id,
        state,
        mastery_level,
        ease_factor,
        review_count,
        last_review_date: last_dt.map(naive_to_iso),
        next_review_date: next_dt.map(naive_to_iso),
        current_interval,
        consecutive_correct,
        consecutive_wrong,
        half_life,
        version,
        created_at: naive_to_iso(created_dt),
        updated_at: naive_to_iso(updated_dt),
    }
}

fn naive_to_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub async fn mark_mastered(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<WordLearningStateRecord, WordStateError> {
    let update = WordStateUpdate {
        state: Some("MASTERED".to_string()),
        mastery_level: Some(5),
        consecutive_correct: Some(0),
        consecutive_wrong: Some(0),
        ..Default::default()
    };
    upsert_word_state(proxy, user_id, word_id, update).await
}

pub async fn mark_needs_practice(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<WordLearningStateRecord, WordStateError> {
    let update = WordStateUpdate {
        state: Some("LEARNING".to_string()),
        mastery_level: Some(1),
        ease_factor: Some(2.0),
        current_interval: Some(1),
        consecutive_correct: Some(0),
        consecutive_wrong: Some(0),
        ..Default::default()
    };
    upsert_word_state(proxy, user_id, word_id, update).await
}

pub async fn reset_progress(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<WordLearningStateRecord, WordStateError> {
    let update = WordStateUpdate {
        state: Some("NEW".to_string()),
        mastery_level: Some(0),
        ease_factor: Some(2.5),
        review_count: Some(0),
        current_interval: Some(1),
        consecutive_correct: Some(0),
        consecutive_wrong: Some(0),
        last_review_date: Some(None),
        next_review_date: Some(None),
    };
    upsert_word_state(proxy, user_id, word_id, update).await
}

pub async fn batch_update_states(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
    operation: &str,
) -> Result<Vec<WordLearningStateRecord>, WordStateError> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    if word_ids.len() > MAX_BATCH_SIZE {
        return Err(WordStateError::Validation(format!(
            "wordIds array exceeds maximum size of {MAX_BATCH_SIZE}"
        )));
    }

    let unique_ids: Vec<String> = word_ids
        .iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let mut results = Vec::with_capacity(unique_ids.len());
    for word_id in &unique_ids {
        let record = match operation {
            "mastered" => mark_mastered(proxy, user_id, word_id).await?,
            "needsPractice" => mark_needs_practice(proxy, user_id, word_id).await?,
            "reset" => reset_progress(proxy, user_id, word_id).await?,
            _ => return Err(WordStateError::Validation("Invalid operation. Allowed: mastered, needsPractice, reset".to_string())),
        };
        results.push(record);
    }
    Ok(results)
}

pub fn validate_word_state_update_payload(raw: &serde_json::Map<String, serde_json::Value>) -> Result<WordStateUpdate, WordStateError> {
    let allowed: HashSet<&'static str> = [
        "state",
        "masteryLevel",
        "easeFactor",
        "reviewCount",
        "lastReviewDate",
        "nextReviewDate",
        "currentInterval",
        "consecutiveCorrect",
        "consecutiveWrong",
    ]
    .into_iter()
    .collect();

    let invalid: Vec<&str> = raw
        .keys()
        .map(|k| k.as_str())
        .filter(|k| !allowed.contains(k))
        .collect();
    if !invalid.is_empty() {
        return Err(WordStateError::Validation(format!("不允许的字段: {}", invalid.join(", "))));
    }

    if raw.contains_key("userId") || raw.contains_key("wordId") {
        return Err(WordStateError::Validation("不允许提交 userId 或 wordId".to_string()));
    }

    let mut out = WordStateUpdate::default();

    if let Some(value) = raw.get("state") {
        let state = value
            .as_str()
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        match state {
            "NEW" | "LEARNING" | "REVIEWING" | "MASTERED" => out.state = Some(state.to_string()),
            _ => return Err(WordStateError::Validation("字段验证失败".to_string())),
        }
    }

    if let Some(value) = raw.get("masteryLevel") {
        let level = value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        if !(0..=5).contains(&level) {
            return Err(WordStateError::Validation("字段验证失败".to_string()));
        }
        out.mastery_level = Some(level);
    }

    if let Some(value) = raw.get("easeFactor") {
        let ef = value
            .as_f64()
            .or_else(|| value.as_i64().map(|v| v as f64))
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        if ef < 1.3 || ef > 2.5 {
            return Err(WordStateError::Validation("字段验证失败".to_string()));
        }
        out.ease_factor = Some(ef);
    }

    if let Some(value) = raw.get("reviewCount") {
        let rc = value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        if rc < 0 {
            return Err(WordStateError::Validation("字段验证失败".to_string()));
        }
        out.review_count = Some(rc);
    }

    if let Some(value) = raw.get("currentInterval") {
        let ci = value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        if ci < 1 {
            return Err(WordStateError::Validation("字段验证失败".to_string()));
        }
        out.current_interval = Some(ci);
    }

    if let Some(value) = raw.get("consecutiveCorrect") {
        let cc = value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        if cc < 0 {
            return Err(WordStateError::Validation("字段验证失败".to_string()));
        }
        out.consecutive_correct = Some(cc);
    }

    if let Some(value) = raw.get("consecutiveWrong") {
        let cw = value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
            .ok_or_else(|| WordStateError::Validation("字段验证失败".to_string()))?;
        if cw < 0 {
            return Err(WordStateError::Validation("字段验证失败".to_string()));
        }
        out.consecutive_wrong = Some(cw);
    }

    if let Some(value) = raw.get("lastReviewDate") {
        out.last_review_date = parse_datetime_input(value)?;
    }

    if let Some(value) = raw.get("nextReviewDate") {
        out.next_review_date = parse_datetime_input(value)?;
    }

    Ok(out)
}
