use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use sqlx::{PgPool, Row};
use tracing::{debug, error, info, warn};

use crate::db::DatabaseProxy;

const BATCH_SIZE: i64 = 50;
const MAX_RETRY: i32 = 3;
const PROCESSING_TIMEOUT_SECS: i64 = 300;

#[derive(Debug)]
struct RewardTask {
    id: String,
    user_id: String,
    answer_record_id: Option<String>,
    reward: f64,
    due_ts: chrono::DateTime<Utc>,
    last_error: Option<String>,
}

pub async fn process_pending_rewards(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let start = Instant::now();
    debug!("Starting delayed reward processing cycle");

    let pool = db.pool();

    recover_stuck_tasks(&pool).await?;

    let tasks = claim_pending_tasks(&pool).await?;
    if tasks.is_empty() {
        debug!("No pending reward tasks");
        return Ok(());
    }

    info!(count = tasks.len(), "Processing delayed reward tasks");

    let mut success_count = 0;
    let mut failure_count = 0;

    for task in tasks {
        match process_single_task_atomic(&pool, &task).await {
            Ok(()) => {
                success_count += 1;
            }
            Err(e) => {
                let retry_count = parse_retry_count(&task.last_error);
                let error_msg = e.to_string();
                handle_task_failure(&pool, &task, retry_count, &error_msg).await?;
                failure_count += 1;
            }
        }
    }

    let duration = start.elapsed();
    info!(
        success = success_count,
        failure = failure_count,
        duration_ms = duration.as_millis() as u64,
        "Delayed reward cycle completed"
    );

    Ok(())
}

async fn recover_stuck_tasks(pool: &PgPool) -> Result<(), super::WorkerError> {
    let timeout_threshold = Utc::now() - chrono::Duration::seconds(PROCESSING_TIMEOUT_SECS);

    let result = sqlx::query(
        r#"
        UPDATE "reward_queue"
        SET status = 'PENDING', "updatedAt" = NOW()
        WHERE status = 'PROCESSING'
          AND "updatedAt" < $1
        "#,
    )
    .bind(timeout_threshold)
    .execute(pool)
    .await?;

    if result.rows_affected() > 0 {
        warn!(
            recovered = result.rows_affected(),
            "Recovered stuck processing tasks"
        );
    }

    Ok(())
}

async fn claim_pending_tasks(pool: &PgPool) -> Result<Vec<RewardTask>, super::WorkerError> {
    let now = Utc::now();

    let rows = sqlx::query(
        r#"
        WITH claimed AS (
            SELECT id FROM "reward_queue"
            WHERE status = 'PENDING'
              AND "dueTs" <= $1
            ORDER BY "dueTs" ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE "reward_queue" rq
        SET status = 'PROCESSING', "updatedAt" = $1
        FROM claimed
        WHERE rq.id = claimed.id
        RETURNING rq.id, rq."userId", rq."answerRecordId", rq.reward, rq."dueTs", rq."lastError"
        "#,
    )
    .bind(now)
    .bind(BATCH_SIZE)
    .fetch_all(pool)
    .await?;

    let tasks = rows
        .into_iter()
        .filter_map(|row| {
            let id: Result<String, _> = row.try_get("id");
            let user_id: Result<String, _> = row.try_get("userId");
            let reward: Result<f64, _> = row.try_get("reward");
            let due_ts: Result<chrono::DateTime<Utc>, _> = row.try_get("dueTs");

            match (id, user_id, reward, due_ts) {
                (Ok(id), Ok(user_id), Ok(reward), Ok(due_ts)) => Some(RewardTask {
                    id,
                    user_id,
                    answer_record_id: row.try_get("answerRecordId").ok(),
                    reward,
                    due_ts,
                    last_error: row.try_get("lastError").ok(),
                }),
                _ => {
                    warn!("Failed to parse reward task row, skipping");
                    None
                }
            }
        })
        .collect();

    Ok(tasks)
}

async fn process_single_task_atomic(
    pool: &PgPool,
    task: &RewardTask,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    debug!(task_id = %task.id, user_id = %task.user_id, reward = task.reward, "Applying delayed reward");

    // Use transaction to ensure atomicity of reward application + task completion
    let mut tx = pool.begin().await?;

    if let Some(ref answer_record_id) = task.answer_record_id {
        let record = sqlx::query(
            r#"
            SELECT ar.id, ar."wordId", ar."isCorrect"
            FROM "answer_records" ar
            WHERE ar.id = $1 AND ar."userId" = $2
            "#,
        )
        .bind(answer_record_id)
        .bind(&task.user_id)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(row) = record {
            let word_id: String = row.try_get("wordId").map_err(|e| {
                warn!(error = %e, "Failed to get wordId from answer record");
                e
            })?;

            let now = Utc::now();
            sqlx::query(
                r#"
                UPDATE "word_learning_states"
                SET "lastRewardApplied" = $1, "cumulativeReward" = COALESCE("cumulativeReward", 0) + $2, "updatedAt" = $3
                WHERE "userId" = $4 AND "wordId" = $5
                "#,
            )
            .bind(task.reward)
            .bind(task.reward)
            .bind(now)
            .bind(&task.user_id)
            .bind(&word_id)
            .execute(&mut *tx)
            .await?;

            debug!(user_id = %task.user_id, word_id = %word_id, reward = task.reward, "Learning model updated");
        } else {
            warn!(answer_record_id = %answer_record_id, "Answer record not found for delayed reward");
        }
    }

    // Mark task as done within the same transaction
    sqlx::query(r#"UPDATE "reward_queue" SET status = 'DONE', "lastError" = NULL, "updatedAt" = NOW() WHERE id = $1"#)
        .bind(&task.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}

async fn handle_task_failure(
    pool: &PgPool,
    task: &RewardTask,
    retry_count: i32,
    error_msg: &str,
) -> Result<(), super::WorkerError> {
    let next_retry = retry_count + 1;
    let is_failed = next_retry >= MAX_RETRY;
    let next_status = if is_failed { "FAILED" } else { "PENDING" };
    let backoff_minutes = std::cmp::min(5, next_retry as i64);
    let next_due = if is_failed {
        task.due_ts
    } else {
        Utc::now() + chrono::Duration::minutes(backoff_minutes)
    };
    let full_error = format!("Retry {}/{}: {}", next_retry, MAX_RETRY, error_msg);

    sqlx::query(r#"UPDATE "reward_queue" SET status = $1, "dueTs" = $2, "lastError" = $3, "updatedAt" = NOW() WHERE id = $4"#)
        .bind(next_status)
        .bind(next_due)
        .bind(&full_error)
        .bind(&task.id)
        .execute(pool)
        .await?;

    if is_failed {
        error!(task_id = %task.id, error = %error_msg, "Delayed reward task failed permanently");
    } else {
        warn!(task_id = %task.id, retry = next_retry, next_due = %next_due, "Delayed reward task scheduled for retry");
    }

    Ok(())
}

fn parse_retry_count(last_error: &Option<String>) -> i32 {
    last_error
        .as_ref()
        .and_then(|e| {
            e.strip_prefix("Retry ")
                .and_then(|s| s.split('/').next())
                .and_then(|n| n.parse().ok())
        })
        .unwrap_or(0)
}
