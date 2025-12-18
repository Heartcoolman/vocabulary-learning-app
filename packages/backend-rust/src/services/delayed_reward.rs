use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
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

    pub fn from_str(s: &str) -> Self {
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

pub enum SelectedPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

const MAX_RETRY: i32 = 5;
const BATCH_SIZE: i32 = 50;
const PROCESSING_TIMEOUT_SECS: i64 = 300;

// ========== Pool Selection ==========

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

// ========== Enqueue Operations ==========

pub async fn enqueue_delayed_reward(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    input: EnqueueRewardInput,
) -> Result<RewardQueueItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp_millis();

    if proxy.sqlite_enabled() {
        let existing = get_by_idempotency_key(proxy, state, &input.idempotency_key).await?;
        if let Some(item) = existing {
            return Ok(item);
        }

        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::json!(id));
        data.insert("userId".into(), serde_json::json!(input.user_id));
        if let Some(ref aid) = input.answer_record_id {
            data.insert("answerRecordId".into(), serde_json::json!(aid));
        }
        if let Some(ref sid) = input.session_id {
            data.insert("sessionId".into(), serde_json::json!(sid));
        }
        data.insert("reward".into(), serde_json::json!(input.reward));
        data.insert("dueTs".into(), serde_json::json!(input.due_ts));
        data.insert("status".into(), serde_json::json!("PENDING"));
        data.insert("idempotencyKey".into(), serde_json::json!(input.idempotency_key));
        data.insert("createdAt".into(), serde_json::json!(now));
        data.insert("updatedAt".into(), serde_json::json!(now));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "reward_queue".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

        return Ok(RewardQueueItem {
            id,
            user_id: input.user_id,
            answer_record_id: input.answer_record_id,
            session_id: input.session_id,
            reward: input.reward,
            due_ts: input.due_ts,
            status: RewardStatus::Pending,
            last_error: None,
            created_at: now,
            updated_at: now,
        });
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let due_dt = DateTime::from_timestamp_millis(input.due_ts).unwrap_or(Utc::now());

    let result = sqlx::query(
        r#"INSERT INTO "reward_queue" ("id","userId","answerRecordId","sessionId","reward","dueTs","status","idempotencyKey","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
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
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("写入失败: {e}"))?;

    if let Some(row) = result {
        return Ok(parse_reward_queue_pg(&row)?);
    }

    get_by_idempotency_key(proxy, state, &input.idempotency_key).await?
        .ok_or_else(|| "创建失败".to_string())
}

async fn get_by_idempotency_key(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    key: &str,
) -> Result<Option<RewardQueueItem>, String> {
    let pool = select_pool(proxy, state).await?;

    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
                   FROM "reward_queue" WHERE "idempotencyKey" = $1"#,
            )
            .bind(key)
            .fetch_optional(&pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            row.map(|r| parse_reward_queue_pg(&r)).transpose()
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
                   FROM "reward_queue" WHERE "idempotencyKey" = ?"#,
            )
            .bind(key)
            .fetch_optional(&sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            row.map(|r| parse_reward_queue_sqlite(&r)).transpose()
        }
    }
}

// ========== Processing Operations ==========

pub async fn get_pending_rewards(
    pool: &SelectedPool,
    limit: i32,
) -> Result<Vec<RewardQueueItem>, String> {
    let now = Utc::now();

    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
                   FROM "reward_queue" WHERE "status" = 'PENDING' AND "dueTs" <= $1
                   ORDER BY "dueTs" ASC LIMIT $2"#,
            )
            .bind(now)
            .bind(limit)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            rows.iter().map(parse_reward_queue_pg).collect()
        }
        SelectedPool::Fallback(sqlite) => {
            let now_ms = now.timestamp_millis();
            let rows = sqlx::query(
                r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
                   FROM "reward_queue" WHERE "status" = 'PENDING' AND "dueTs" <= ?
                   ORDER BY "dueTs" ASC LIMIT ?"#,
            )
            .bind(now_ms)
            .bind(limit)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            rows.iter().map(parse_reward_queue_sqlite).collect()
        }
    }
}

pub async fn mark_as_processing(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    task_ids: &[String],
) -> Result<(), String> {
    if task_ids.is_empty() { return Ok(()); }

    if proxy.sqlite_enabled() {
        for id in task_ids {
            let mut where_clause = serde_json::Map::new();
            where_clause.insert("id".into(), serde_json::json!(id));

            let mut data = serde_json::Map::new();
            data.insert("status".into(), serde_json::json!("PROCESSING"));
            data.insert("updatedAt".into(), serde_json::json!(Utc::now().timestamp_millis()));

            let op = crate::db::dual_write_manager::WriteOperation::Update {
                table: "reward_queue".to_string(),
                r#where: where_clause,
                data,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(true),
            };
            proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        }
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let now = Utc::now();

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"UPDATE "reward_queue" SET "status" = 'PROCESSING', "updatedAt" = "#,
    );
    qb.push_bind(now);
    qb.push(r#" WHERE "id" IN ("#);
    let mut sep = qb.separated(", ");
    for id in task_ids { sep.push_bind(id); }
    sep.push_unseparated(")");

    qb.build().execute(&pool).await.map_err(|e| format!("更新失败: {e}"))?;
    Ok(())
}

pub async fn mark_as_done(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    task_id: &str,
) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(task_id));

        let mut data = serde_json::Map::new();
        data.insert("status".into(), serde_json::json!("DONE"));
        data.insert("lastError".into(), serde_json::Value::Null);
        data.insert("updatedAt".into(), serde_json::json!(Utc::now().timestamp_millis()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "reward_queue".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    sqlx::query(
        r#"UPDATE "reward_queue" SET "status" = 'DONE', "lastError" = NULL, "updatedAt" = NOW() WHERE "id" = $1"#,
    )
    .bind(task_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;
    Ok(())
}

pub async fn mark_as_failed(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    task_id: &str,
    error: &str,
    retry_count: i32,
) -> Result<(), String> {
    let is_final_failure = retry_count >= MAX_RETRY;
    let next_status = if is_final_failure { "FAILED" } else { "PENDING" };
    let next_due_offset_mins = retry_count.min(5) as i64;
    let next_due = Utc::now() + Duration::minutes(next_due_offset_mins);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(task_id));

        let mut data = serde_json::Map::new();
        data.insert("status".into(), serde_json::json!(next_status));
        data.insert("lastError".into(), serde_json::json!(format!("[retry {}] {}", retry_count, error)));
        if !is_final_failure {
            data.insert("dueTs".into(), serde_json::json!(next_due.timestamp_millis()));
        }
        data.insert("updatedAt".into(), serde_json::json!(Utc::now().timestamp_millis()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "reward_queue".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let error_msg = format!("[retry {}] {}", retry_count, error);

    sqlx::query(
        r#"UPDATE "reward_queue" SET "status" = $1, "lastError" = $2, "dueTs" = $3, "updatedAt" = NOW() WHERE "id" = $4"#,
    )
    .bind(next_status)
    .bind(&error_msg)
    .bind(next_due)
    .bind(task_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;
    Ok(())
}

pub async fn recover_stuck_processing(
    proxy: &DatabaseProxy,
    _state: DatabaseState,
) -> Result<i64, String> {
    let timeout_threshold = Utc::now() - Duration::seconds(PROCESSING_TIMEOUT_SECS);

    if proxy.sqlite_enabled() {
        return Ok(0);
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let result = sqlx::query(
        r#"UPDATE "reward_queue" SET "status" = 'PENDING', "updatedAt" = NOW()
           WHERE "status" = 'PROCESSING' AND "updatedAt" < $1"#,
    )
    .bind(timeout_threshold)
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    Ok(result.rows_affected() as i64)
}

// ========== Stats Operations ==========

pub async fn get_queue_stats(pool: &SelectedPool) -> Result<QueueStats, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT
                   COUNT(*) FILTER (WHERE "status" = 'PENDING') as pending,
                   COUNT(*) FILTER (WHERE "status" = 'PROCESSING') as processing,
                   COUNT(*) FILTER (WHERE "status" = 'DONE') as done,
                   COUNT(*) FILTER (WHERE "status" = 'FAILED') as failed,
                   MIN("dueTs") FILTER (WHERE "status" = 'PENDING') as oldest
                   FROM "reward_queue""#,
            )
            .fetch_one(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(QueueStats {
                pending_count: row.try_get("pending").unwrap_or(0),
                processing_count: row.try_get("processing").unwrap_or(0),
                done_count: row.try_get("done").unwrap_or(0),
                failed_count: row.try_get("failed").unwrap_or(0),
                oldest_pending_ts: row.try_get::<Option<DateTime<Utc>>, _>("oldest").ok().flatten().map(|d| d.timestamp_millis()),
            })
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT
                   SUM(CASE WHEN "status" = 'PENDING' THEN 1 ELSE 0 END) as pending,
                   SUM(CASE WHEN "status" = 'PROCESSING' THEN 1 ELSE 0 END) as processing,
                   SUM(CASE WHEN "status" = 'DONE' THEN 1 ELSE 0 END) as done,
                   SUM(CASE WHEN "status" = 'FAILED' THEN 1 ELSE 0 END) as failed,
                   MIN(CASE WHEN "status" = 'PENDING' THEN "dueTs" END) as oldest
                   FROM "reward_queue""#,
            )
            .fetch_one(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(QueueStats {
                pending_count: row.try_get("pending").unwrap_or(0),
                processing_count: row.try_get("processing").unwrap_or(0),
                done_count: row.try_get("done").unwrap_or(0),
                failed_count: row.try_get("failed").unwrap_or(0),
                oldest_pending_ts: row.try_get::<Option<i64>, _>("oldest").ok().flatten(),
            })
        }
    }
}

pub async fn get_user_pending_rewards(
    pool: &SelectedPool,
    user_id: &str,
) -> Result<Vec<RewardQueueItem>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
                   FROM "reward_queue" WHERE "userId" = $1 AND "status" = 'PENDING' ORDER BY "dueTs" ASC"#,
            )
            .bind(user_id)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            rows.iter().map(parse_reward_queue_pg).collect()
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(
                r#"SELECT "id","userId","answerRecordId","sessionId","reward","dueTs","status","lastError","createdAt","updatedAt"
                   FROM "reward_queue" WHERE "userId" = ? AND "status" = 'PENDING' ORDER BY "dueTs" ASC"#,
            )
            .bind(user_id)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            rows.iter().map(parse_reward_queue_sqlite).collect()
        }
    }
}

// ========== Helper Functions ==========

fn parse_reward_queue_pg(row: &sqlx::postgres::PgRow) -> Result<RewardQueueItem, String> {
    Ok(RewardQueueItem {
        id: row.try_get("id").map_err(|e| format!("解析失败: {e}"))?,
        user_id: row.try_get("userId").map_err(|e| format!("解析失败: {e}"))?,
        answer_record_id: row.try_get("answerRecordId").ok(),
        session_id: row.try_get("sessionId").ok(),
        reward: row.try_get("reward").unwrap_or(0.0),
        due_ts: row.try_get::<DateTime<Utc>, _>("dueTs").map(|d| d.timestamp_millis()).unwrap_or(0),
        status: RewardStatus::from_str(row.try_get::<String, _>("status").unwrap_or_default().as_str()),
        last_error: row.try_get("lastError").ok(),
        created_at: row.try_get::<DateTime<Utc>, _>("createdAt").map(|d| d.timestamp_millis()).unwrap_or(0),
        updated_at: row.try_get::<DateTime<Utc>, _>("updatedAt").map(|d| d.timestamp_millis()).unwrap_or(0),
    })
}

fn parse_reward_queue_sqlite(row: &sqlx::sqlite::SqliteRow) -> Result<RewardQueueItem, String> {
    Ok(RewardQueueItem {
        id: row.try_get("id").map_err(|e| format!("解析失败: {e}"))?,
        user_id: row.try_get("userId").map_err(|e| format!("解析失败: {e}"))?,
        answer_record_id: row.try_get("answerRecordId").ok(),
        session_id: row.try_get("sessionId").ok(),
        reward: row.try_get("reward").unwrap_or(0.0),
        due_ts: row.try_get("dueTs").unwrap_or(0),
        status: RewardStatus::from_str(row.try_get::<String, _>("status").unwrap_or_default().as_str()),
        last_error: row.try_get("lastError").ok(),
        created_at: row.try_get("createdAt").unwrap_or(0),
        updated_at: row.try_get("updatedAt").unwrap_or(0),
    })
}
