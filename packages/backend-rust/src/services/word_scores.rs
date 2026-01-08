use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::db::DatabaseProxy;

const MAX_BATCH_SIZE: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordScoreRecord {
    pub id: String,
    pub user_id: String,
    pub word_id: String,
    pub total_score: f64,
    pub accuracy_score: f64,
    pub speed_score: f64,
    pub stability_score: f64,
    pub proficiency_score: f64,
    pub total_attempts: i64,
    pub correct_attempts: i64,
    pub average_response_time: f64,
    pub average_dwell_time: f64,
    pub recent_accuracy: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreStats {
    pub average_score: f64,
    pub high_score_count: i64,
    pub medium_score_count: i64,
    pub low_score_count: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum WordScoreError {
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

pub async fn get_word_score(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordScoreRecord>, sqlx::Error> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId",
          "totalScore","accuracyScore","speedScore","stabilityScore","proficiencyScore",
          "totalAttempts","correctAttempts","averageResponseTime","averageDwellTime","recentAccuracy",
          "createdAt","updatedAt"
        FROM "word_scores"
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

pub async fn batch_get_word_scores(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, WordScoreRecord>, WordScoreError> {
    if word_ids.is_empty() {
        return Ok(HashMap::new());
    }
    if word_ids.len() > MAX_BATCH_SIZE {
        return Err(WordScoreError::Validation(
            "wordIds数组最多允许500个元素".to_string(),
        ));
    }
    if !word_ids.iter().all(|id| !id.trim().is_empty()) {
        return Err(WordScoreError::Validation(
            "wordIds数组元素必须是非空字符串".to_string(),
        ));
    }

    let unique_ids: Vec<String> = word_ids
        .iter()
        .map(|id| id.trim().to_string())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let pool = proxy.pool();

    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          "id","userId","wordId",
          "totalScore","accuracyScore","speedScore","stabilityScore","proficiencyScore",
          "totalAttempts","correctAttempts","averageResponseTime","averageDwellTime","recentAccuracy",
          "createdAt","updatedAt"
        FROM "word_scores"
        WHERE "userId" = $1
          AND "wordId" IN (
        "#,
    );
    qb.push_bind(user_id);
    {
        let mut sep = qb.separated(", ");
        for id in &unique_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }

    let rows = qb.build().fetch_all(pool).await?;
    let mut out = HashMap::with_capacity(rows.len());
    for row in &rows {
        let record = map_pg_row(row);
        out.insert(record.word_id.clone(), record);
    }
    Ok(out)
}

pub async fn list_scores_in_range(
    proxy: &DatabaseProxy,
    user_id: &str,
    min_score: f64,
    max_score: f64,
) -> Result<Vec<WordScoreRecord>, sqlx::Error> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId",
          "totalScore","accuracyScore","speedScore","stabilityScore","proficiencyScore",
          "totalAttempts","correctAttempts","averageResponseTime","averageDwellTime","recentAccuracy",
          "createdAt","updatedAt"
        FROM "word_scores"
        WHERE "userId" = $1
          AND "totalScore" >= $2
          AND "totalScore" <= $3
        ORDER BY "totalScore" DESC
        "#,
    )
    .bind(user_id)
    .bind(min_score)
    .bind(max_score)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(map_pg_row).collect())
}

pub async fn list_low_scores(
    proxy: &DatabaseProxy,
    user_id: &str,
    threshold: i64,
) -> Result<Vec<WordScoreRecord>, sqlx::Error> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId",
          "totalScore","accuracyScore","speedScore","stabilityScore","proficiencyScore",
          "totalAttempts","correctAttempts","averageResponseTime","averageDwellTime","recentAccuracy",
          "createdAt","updatedAt"
        FROM "word_scores"
        WHERE "userId" = $1
          AND "totalScore" < $2
        ORDER BY "totalScore" ASC
        "#,
    )
    .bind(user_id)
    .bind(threshold as f64)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(map_pg_row).collect())
}

pub async fn list_high_scores(
    proxy: &DatabaseProxy,
    user_id: &str,
    threshold: i64,
) -> Result<Vec<WordScoreRecord>, sqlx::Error> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT
          "id","userId","wordId",
          "totalScore","accuracyScore","speedScore","stabilityScore","proficiencyScore",
          "totalAttempts","correctAttempts","averageResponseTime","averageDwellTime","recentAccuracy",
          "createdAt","updatedAt"
        FROM "word_scores"
        WHERE "userId" = $1
          AND "totalScore" > $2
        ORDER BY "totalScore" DESC
        "#,
    )
    .bind(user_id)
    .bind(threshold as f64)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(map_pg_row).collect())
}

pub async fn get_user_score_stats(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<ScoreStats, sqlx::Error> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*)::bigint as "total",
          AVG("totalScore") as "avg",
          SUM(CASE WHEN "totalScore" > 80 THEN 1 ELSE 0 END)::bigint as "high",
          SUM(CASE WHEN "totalScore" >= 40 AND "totalScore" <= 80 THEN 1 ELSE 0 END)::bigint as "medium",
          SUM(CASE WHEN "totalScore" < 40 THEN 1 ELSE 0 END)::bigint as "low"
        FROM "word_scores"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(ScoreStats {
        average_score: row
            .try_get::<Option<f64>, _>("avg")
            .unwrap_or(None)
            .unwrap_or(0.0),
        high_score_count: row
            .try_get::<Option<i64>, _>("high")
            .unwrap_or(None)
            .unwrap_or(0),
        medium_score_count: row
            .try_get::<Option<i64>, _>("medium")
            .unwrap_or(None)
            .unwrap_or(0),
        low_score_count: row
            .try_get::<Option<i64>, _>("low")
            .unwrap_or(None)
            .unwrap_or(0),
    })
}

pub async fn upsert_word_score(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    raw_update: &serde_json::Map<String, serde_json::Value>,
) -> Result<WordScoreRecord, WordScoreError> {
    ensure_word_access(proxy, user_id, word_id).await?;

    let safe_update = sanitize_word_score_update(raw_update)?;

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();

    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        INSERT INTO "word_scores"
          ("id","userId","wordId","updatedAt"
        "#,
    );

    let mut insert_keys: Vec<String> = safe_update.keys().cloned().collect();
    insert_keys.sort();

    for key in &insert_keys {
        qb.push(", \"");
        qb.push(key);
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

    for key in &insert_keys {
        qb.push(", ");
        let value = safe_update
            .get(key)
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        match key.as_str() {
            "totalScore"
            | "accuracyScore"
            | "speedScore"
            | "stabilityScore"
            | "proficiencyScore"
            | "averageResponseTime"
            | "averageDwellTime"
            | "recentAccuracy" => qb.push_bind(value.as_f64()),
            "totalAttempts" | "correctAttempts" => qb.push_bind(value.as_i64().map(|v| v as i32)),
            _ => qb.push_bind(value.to_string()),
        };
    }

    qb.push(") ON CONFLICT (\"userId\",\"wordId\") DO UPDATE SET \"updatedAt\" = EXCLUDED.\"updatedAt\"");
    for key in &insert_keys {
        qb.push(", \"");
        qb.push(key);
        qb.push("\" = EXCLUDED.\"");
        qb.push(key);
        qb.push("\"");
    }

    qb.push(" RETURNING ");
    qb.push(
        r#"
        "id","userId","wordId",
        "totalScore","accuracyScore","speedScore","stabilityScore","proficiencyScore",
        "totalAttempts","correctAttempts","averageResponseTime","averageDwellTime","recentAccuracy",
        "createdAt","updatedAt"
        "#,
    );

    let row = qb.build().fetch_one(pool).await?;
    Ok(map_pg_row(&row))
}

fn sanitize_word_score_update(
    raw: &serde_json::Map<String, serde_json::Value>,
) -> Result<serde_json::Map<String, serde_json::Value>, WordScoreError> {
    let mut out = serde_json::Map::new();
    for (key, value) in raw {
        if matches!(
            key.as_str(),
            "userId" | "wordId" | "id" | "createdAt" | "updatedAt"
        ) {
            continue;
        }
        if value.is_null() {
            continue;
        }

        match key.as_str() {
            "totalScore"
            | "accuracyScore"
            | "speedScore"
            | "stabilityScore"
            | "proficiencyScore"
            | "averageResponseTime"
            | "averageDwellTime"
            | "recentAccuracy" => {
                let num = value
                    .as_f64()
                    .or_else(|| value.as_i64().map(|v| v as f64))
                    .ok_or_else(|| WordScoreError::Validation("参数验证失败".to_string()))?;
                let json = serde_json::Number::from_f64(num)
                    .ok_or_else(|| WordScoreError::Validation("参数验证失败".to_string()))?;
                out.insert(key.clone(), serde_json::Value::Number(json));
            }
            "totalAttempts" | "correctAttempts" => {
                let num = value
                    .as_i64()
                    .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
                    .ok_or_else(|| WordScoreError::Validation("参数验证失败".to_string()))?;
                if num < 0 {
                    return Err(WordScoreError::Validation("参数验证失败".to_string()));
                }
                out.insert(key.clone(), serde_json::Value::Number(num.into()));
            }
            _ => {}
        }
    }
    Ok(out)
}

async fn ensure_word_access(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<(), WordScoreError> {
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
        return Err(WordScoreError::NotFound("单词不存在".to_string()));
    };

    let wb_type: String = row.try_get("type").unwrap_or_default();
    let owner: Option<String> = row.try_get("owner").ok();
    if wb_type == "USER" && owner.as_deref() != Some(user_id) {
        return Err(WordScoreError::Unauthorized("无权访问该单词".to_string()));
    }
    Ok(())
}

fn map_pg_row(row: &sqlx::postgres::PgRow) -> WordScoreRecord {
    let created_dt: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_dt: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());

    WordScoreRecord {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        user_id: row.try_get::<String, _>("userId").unwrap_or_default(),
        word_id: row.try_get::<String, _>("wordId").unwrap_or_default(),
        total_score: row.try_get::<f64, _>("totalScore").unwrap_or(0.0),
        accuracy_score: row.try_get::<f64, _>("accuracyScore").unwrap_or(0.0),
        speed_score: row.try_get::<f64, _>("speedScore").unwrap_or(0.0),
        stability_score: row.try_get::<f64, _>("stabilityScore").unwrap_or(0.0),
        proficiency_score: row.try_get::<f64, _>("proficiencyScore").unwrap_or(0.0),
        total_attempts: row
            .try_get::<i32, _>("totalAttempts")
            .map(|v| v as i64)
            .unwrap_or(0),
        correct_attempts: row
            .try_get::<i32, _>("correctAttempts")
            .map(|v| v as i64)
            .unwrap_or(0),
        average_response_time: row.try_get::<f64, _>("averageResponseTime").unwrap_or(0.0),
        average_dwell_time: row.try_get::<f64, _>("averageDwellTime").unwrap_or(0.0),
        recent_accuracy: row.try_get::<f64, _>("recentAccuracy").unwrap_or(0.0),
        created_at: DateTime::<Utc>::from_naive_utc_and_offset(created_dt, Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        updated_at: DateTime::<Utc>::from_naive_utc_and_offset(updated_dt, Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true),
    }
}
