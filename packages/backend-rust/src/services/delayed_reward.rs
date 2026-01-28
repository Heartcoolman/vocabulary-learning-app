use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::db::DatabaseProxy;

// ========== Types ==========

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RewardStatus {
    Pending,
    Processing,
    Done,
    Failed,
}

impl RewardStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Processing => "PROCESSING",
            Self::Done => "DONE",
            Self::Failed => "FAILED",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "PROCESSING" => Self::Processing,
            "DONE" => Self::Done,
            "FAILED" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardQueueItem {
    pub id: String,
    pub user_id: String,
    pub answer_record_id: Option<String>,
    pub session_id: Option<String>,
    pub reward: f64,
    pub due_ts: i64,
    pub status: RewardStatus,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueRewardInput {
    pub user_id: String,
    pub answer_record_id: Option<String>,
    pub session_id: Option<String>,
    pub reward: f64,
    pub due_ts: i64,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStats {
    pub pending_count: i64,
    pub processing_count: i64,
    pub done_count: i64,
    pub failed_count: i64,
    pub oldest_pending_ts: Option<i64>,
}

const MAX_RETRY: i32 = 5;
const BATCH_SIZE: i32 = 50;
const PROCESSING_TIMEOUT_SECS: i64 = 300;

// ========== Enqueue Operations ==========

pub async fn enqueue_delayed_reward(
    proxy: &DatabaseProxy,
    input: EnqueueRewardInput,
) -> Result<RewardQueueItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let pool = proxy.pool();
    let due_dt = DateTime::from_timestamp_millis(input.due_ts).unwrap_or(Utc::now());

    let result = sqlx::query(
        r#"INSERT INTO "reward_queue" ("id","userId","answerRecordId","sessionId","reward","dueTs","status","idempotencyKey","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7::"RewardStatus",$8,NOW(),NOW())
           ON CONFLICT ("idempotencyKey") DO NOTHING
           RETURNING "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt""#,
    )
    .bind(&id)
    .bind(&input.user_id)
    .bind(&input.answer_record_id)
    .bind(&input.session_id)
    .bind(input.reward)
    .bind(due_dt)
    .bind("PENDING")
    .bind(&input.idempotency_key)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("写入失败: {e}"))?;

    if let Some(row) = result {
        return parse_reward_queue_pg(&row);
    }

    get_by_idempotency_key(proxy, &input.idempotency_key)
        .await?
        .ok_or_else(|| "创建失败".to_string())
}

async fn get_by_idempotency_key(
    proxy: &DatabaseProxy,
    key: &str,
) -> Result<Option<RewardQueueItem>, String> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
           FROM "reward_queue" WHERE "idempotencyKey" = $1"#,
    )
    .bind(key)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    row.map(|r| parse_reward_queue_pg(&r)).transpose()
}

// ========== Processing Operations ==========

pub async fn get_pending_rewards(
    pool: &PgPool,
    limit: i32,
) -> Result<Vec<RewardQueueItem>, String> {
    let now = Utc::now();

    let rows = sqlx::query(
        r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
           FROM "reward_queue" WHERE "status" = 'PENDING' AND "dueTs" <= $1
           ORDER BY "dueTs" ASC LIMIT $2"#,
    )
    .bind(now)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    rows.iter().map(parse_reward_queue_pg).collect()
}

pub async fn mark_as_processing(proxy: &DatabaseProxy, task_ids: &[String]) -> Result<(), String> {
    if task_ids.is_empty() {
        return Ok(());
    }

    let pool = proxy.pool();
    let now = Utc::now();

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"UPDATE "reward_queue" SET "status" = 'PROCESSING', "updatedAt" = "#,
    );
    qb.push_bind(now);
    qb.push(r#" WHERE "id" IN ("#);
    let mut sep = qb.separated(", ");
    for id in task_ids {
        sep.push_bind(id);
    }
    sep.push_unseparated(")");

    qb.build()
        .execute(pool)
        .await
        .map_err(|e| format!("更新失败: {e}"))?;
    Ok(())
}

pub async fn mark_as_done(proxy: &DatabaseProxy, task_id: &str) -> Result<(), String> {
    let pool = proxy.pool();
    sqlx::query(
        r#"UPDATE "reward_queue" SET "status" = 'DONE', "lastError" = NULL, "updatedAt" = NOW() WHERE "id" = $1"#,
    )
    .bind(task_id)
    .execute(pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;
    Ok(())
}

pub async fn mark_as_failed(
    proxy: &DatabaseProxy,
    task_id: &str,
    error: &str,
    retry_count: i32,
) -> Result<(), String> {
    let is_final_failure = retry_count >= MAX_RETRY;
    let next_status = if is_final_failure {
        "FAILED"
    } else {
        "PENDING"
    };
    let next_due_offset_mins = retry_count.min(5) as i64;
    let next_due = Utc::now() + Duration::minutes(next_due_offset_mins);

    let pool = proxy.pool();
    let error_msg = format!("[retry {}] {}", retry_count, error);

    sqlx::query(
        r#"UPDATE "reward_queue" SET "status" = $1, "lastError" = $2, "dueTs" = $3, "updatedAt" = NOW() WHERE "id" = $4"#,
    )
    .bind(next_status)
    .bind(&error_msg)
    .bind(next_due)
    .bind(task_id)
    .execute(pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;
    Ok(())
}

pub async fn recover_stuck_processing(proxy: &DatabaseProxy) -> Result<i64, String> {
    let timeout_threshold = Utc::now() - Duration::seconds(PROCESSING_TIMEOUT_SECS);
    let pool = proxy.pool();

    let result = sqlx::query(
        r#"UPDATE "reward_queue" SET "status" = 'PENDING', "updatedAt" = NOW()
           WHERE "status" = 'PROCESSING' AND "updatedAt" < $1"#,
    )
    .bind(timeout_threshold)
    .execute(pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    Ok(result.rows_affected() as i64)
}

// ========== Stats Operations ==========

pub async fn get_queue_stats(pool: &PgPool) -> Result<QueueStats, String> {
    let row = sqlx::query(
        r#"SELECT
           COUNT(*) FILTER (WHERE "status" = 'PENDING') as pending,
           COUNT(*) FILTER (WHERE "status" = 'PROCESSING') as processing,
           COUNT(*) FILTER (WHERE "status" = 'DONE') as done,
           COUNT(*) FILTER (WHERE "status" = 'FAILED') as failed,
           MIN("dueTs") FILTER (WHERE "status" = 'PENDING') as oldest
           FROM "reward_queue""#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(QueueStats {
        pending_count: row.try_get("pending").unwrap_or(0),
        processing_count: row.try_get("processing").unwrap_or(0),
        done_count: row.try_get("done").unwrap_or(0),
        failed_count: row.try_get("failed").unwrap_or(0),
        oldest_pending_ts: row
            .try_get::<Option<DateTime<Utc>>, _>("oldest")
            .ok()
            .flatten()
            .map(|d| d.timestamp_millis()),
    })
}

pub async fn get_user_pending_rewards(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<RewardQueueItem>, String> {
    let rows = sqlx::query(
        r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
           FROM "reward_queue" WHERE "userId" = $1 AND "status" = 'PENDING' ORDER BY "dueTs" ASC"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    rows.iter().map(parse_reward_queue_pg).collect()
}

// ========== Helper Functions ==========

fn parse_reward_queue_pg(row: &sqlx::postgres::PgRow) -> Result<RewardQueueItem, String> {
    Ok(RewardQueueItem {
        id: row.try_get("id").map_err(|e| format!("解析失败: {e}"))?,
        user_id: row
            .try_get("userId")
            .map_err(|e| format!("解析失败: {e}"))?,
        answer_record_id: row.try_get("answerRecordId").ok(),
        session_id: row.try_get("sessionId").ok(),
        reward: row.try_get("reward").unwrap_or(0.0),
        due_ts: row
            .try_get::<DateTime<Utc>, _>("dueTs")
            .map(|d| d.timestamp_millis())
            .unwrap_or(0),
        status: RewardStatus::parse(
            row.try_get::<String, _>("status")
                .unwrap_or_default()
                .as_str(),
        ),
        last_error: row.try_get("lastError").ok(),
        created_at: row
            .try_get::<DateTime<Utc>, _>("createdAt")
            .map(|d| d.timestamp_millis())
            .unwrap_or(0),
        updated_at: row
            .try_get::<DateTime<Utc>, _>("updatedAt")
            .map(|d| d.timestamp_millis())
            .unwrap_or(0),
    })
}
