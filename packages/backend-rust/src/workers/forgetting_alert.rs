use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use sqlx::{PgPool, Row};
use tracing::{debug, error, info, warn};

use crate::db::DatabaseProxy;
use crate::db::state_machine::DatabaseState;

const BATCH_SIZE: usize = 100;
const RETENTION_THRESHOLD: f64 = 0.3;

#[derive(Debug, Default)]
struct AlertStats {
    users_scanned: i64,
    words_scanned: i64,
    alerts_created: i64,
    alerts_updated: i64,
    duration_secs: f64,
}

pub async fn scan_forgetting_risks(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let start = Instant::now();
    info!("Starting forgetting alert scan");

    let state = db.state_machine().read().await.state();
    if state == DatabaseState::Degraded || state == DatabaseState::Unavailable {
        warn!("Database degraded, skipping forgetting alert scan");
        return Ok(());
    }

    let pool = match db.primary_pool().await {
        Some(p) => p,
        None => {
            debug!("Primary pool not available, skipping forgetting alert scan");
            return Ok(());
        }
    };

    let mut stats = AlertStats::default();

    let users = get_active_users(&pool).await?;
    stats.users_scanned = users.len() as i64;

    info!(user_count = users.len(), "Scanning users for forgetting risks");

    for user_id in users {
        if let Err(e) = process_user_alerts(&pool, &user_id, &mut stats).await {
            error!(user_id = %user_id, error = %e, "Failed to process user alerts");
        }
    }

    stats.duration_secs = start.elapsed().as_secs_f64();

    info!(
        users_scanned = stats.users_scanned,
        words_scanned = stats.words_scanned,
        alerts_created = stats.alerts_created,
        alerts_updated = stats.alerts_updated,
        duration_secs = format!("{:.2}", stats.duration_secs),
        "Forgetting alert scan completed"
    );

    Ok(())
}

async fn get_active_users(pool: &PgPool) -> Result<Vec<String>, super::WorkerError> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT u.id
        FROM "user" u
        INNER JOIN "word_learning_state" wls ON wls."userId" = u.id
        WHERE wls."lastReviewDate" IS NOT NULL
          AND wls.state IN ('LEARNING', 'REVIEWING', 'MASTERED')
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().filter_map(|r| r.try_get("id").ok()).collect())
}

async fn process_user_alerts(
    pool: &PgPool,
    user_id: &str,
    stats: &mut AlertStats,
) -> Result<(), super::WorkerError> {
    let learning_states = get_user_learning_states(pool, user_id).await?;
    stats.words_scanned += learning_states.len() as i64;

    for chunk in learning_states.chunks(BATCH_SIZE) {
        process_batch(pool, user_id, chunk, stats).await?;
    }

    Ok(())
}

#[derive(Debug)]
struct LearningState {
    id: String,
    word_id: String,
    half_life: f64,
    last_review_date: chrono::DateTime<Utc>,
    next_review_date: Option<chrono::DateTime<Utc>>,
}

async fn get_user_learning_states(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<LearningState>, super::WorkerError> {
    let rows = sqlx::query(
        r#"
        SELECT id, "wordId", "halfLife", "lastReviewDate", "nextReviewDate"
        FROM "word_learning_state"
        WHERE "userId" = $1
          AND "lastReviewDate" IS NOT NULL
          AND state IN ('LEARNING', 'REVIEWING', 'MASTERED')
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|r| {
            let id: Result<String, _> = r.try_get("id");
            let word_id: Result<String, _> = r.try_get("wordId");
            let last_review_date: Result<chrono::DateTime<Utc>, _> = r.try_get("lastReviewDate");

            match (id, word_id, last_review_date) {
                (Ok(id), Ok(word_id), Ok(last_review_date)) => Some(LearningState {
                    id,
                    word_id,
                    half_life: r.try_get::<Option<f64>, _>("halfLife").ok().flatten().unwrap_or(86400.0),
                    last_review_date,
                    next_review_date: r.try_get("nextReviewDate").ok(),
                }),
                _ => {
                    warn!("Failed to parse learning state row, skipping");
                    None
                }
            }
        })
        .collect())
}

async fn process_batch(
    pool: &PgPool,
    user_id: &str,
    states: &[LearningState],
    stats: &mut AlertStats,
) -> Result<(), super::WorkerError> {
    let now = Utc::now();

    for state in states {
        let retention = calculate_retention(state, now);

        if retention < RETENTION_THRESHOLD {
            let alert_result = upsert_forgetting_alert(pool, user_id, state, retention).await?;
            if alert_result.created {
                stats.alerts_created += 1;
            } else if alert_result.updated {
                stats.alerts_updated += 1;
            }
        } else {
            dismiss_existing_alert(pool, user_id, &state.word_id).await?;
        }
    }

    Ok(())
}

fn calculate_retention(state: &LearningState, now: chrono::DateTime<Utc>) -> f64 {
    let elapsed_secs = (now - state.last_review_date).num_seconds() as f64;
    let half_life_secs = state.half_life;

    if half_life_secs <= 0.0 {
        return 0.0;
    }

    let decay_rate = 0.693147 / half_life_secs;
    (-decay_rate * elapsed_secs).exp()
}

struct AlertResult {
    created: bool,
    updated: bool,
}

async fn upsert_forgetting_alert(
    pool: &PgPool,
    user_id: &str,
    state: &LearningState,
    retention: f64,
) -> Result<AlertResult, super::WorkerError> {
    let now = Utc::now();
    let id = uuid::Uuid::new_v4().to_string();

    // Use ON CONFLICT to handle race condition atomically
    let result = sqlx::query(
        r#"
        INSERT INTO "forgetting_alert" ("id", "userId", "wordId", "retentionRate", "status", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, 'PENDING', $5, $5)
        ON CONFLICT ("userId", "wordId") WHERE status = 'PENDING'
        DO UPDATE SET
            "retentionRate" = CASE
                WHEN ABS("forgetting_alert"."retentionRate" - EXCLUDED."retentionRate") > 0.05
                THEN EXCLUDED."retentionRate"
                ELSE "forgetting_alert"."retentionRate"
            END,
            "updatedAt" = CASE
                WHEN ABS("forgetting_alert"."retentionRate" - EXCLUDED."retentionRate") > 0.05
                THEN EXCLUDED."updatedAt"
                ELSE "forgetting_alert"."updatedAt"
            END
        RETURNING (xmax = 0) AS inserted,
                  (xmax <> 0 AND "updatedAt" = $5) AS updated
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(&state.word_id)
    .bind(retention)
    .bind(now)
    .fetch_optional(pool)
    .await?;

    match result {
        Some(row) => {
            let inserted: bool = row.try_get("inserted").unwrap_or(false);
            let updated: bool = row.try_get("updated").unwrap_or(false);

            if inserted {
                debug!(
                    user_id = %user_id,
                    word_id = %state.word_id,
                    retention = format!("{:.2}", retention),
                    "Forgetting alert created"
                );
            }

            Ok(AlertResult { created: inserted, updated })
        }
        None => Ok(AlertResult { created: false, updated: false }),
    }
}

async fn dismiss_existing_alert(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
) -> Result<(), super::WorkerError> {
    let now = Utc::now();

    sqlx::query(
        r#"
        UPDATE "forgetting_alert"
        SET status = 'DISMISSED', "updatedAt" = $1
        WHERE "userId" = $2 AND "wordId" = $3 AND status = 'PENDING'
        "#,
    )
    .bind(now)
    .bind(user_id)
    .bind(word_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn cleanup_resolved_alerts(pool: &PgPool, older_than_days: i64) -> Result<i64, super::WorkerError> {
    let cutoff = Utc::now() - chrono::Duration::days(older_than_days);

    let result = sqlx::query(
        r#"
        DELETE FROM "forgetting_alert"
        WHERE status IN ('REVIEWED', 'DISMISSED')
          AND "updatedAt" < $1
        "#,
    )
    .bind(cutoff)
    .execute(pool)
    .await?;

    let count = result.rows_affected() as i64;
    if count > 0 {
        info!(count = count, older_than_days = older_than_days, "Cleaned up resolved alerts");
    }

    Ok(count)
}
