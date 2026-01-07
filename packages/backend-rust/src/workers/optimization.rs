use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use sqlx::{PgPool, Row};
use tracing::{debug, error, info, warn};

use crate::db::DatabaseProxy;

pub async fn run_optimization_cycle(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let start = Instant::now();
    info!("Starting Bayesian optimization cycle");

    let pool = db.pool();

    let enabled = std::env::var("ENABLE_BAYESIAN_OPTIMIZER")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if !enabled {
        debug!("Bayesian optimizer not enabled, skipping");
        return Ok(());
    }

    let users = get_active_users(&pool).await?;
    if users.is_empty() {
        info!("No active users for optimization");
        return Ok(());
    }

    info!(user_count = users.len(), "Processing users for optimization");

    let mut optimized_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    for user_id in users {
        match optimize_user_params(&pool, &user_id).await {
            Ok(true) => optimized_count += 1,
            Ok(false) => skipped_count += 1,
            Err(e) => {
                error!(user_id = %user_id, error = %e, "User optimization failed");
                error_count += 1;
            }
        }
    }

    let duration = start.elapsed();
    info!(
        optimized = optimized_count,
        skipped = skipped_count,
        errors = error_count,
        duration_ms = duration.as_millis() as u64,
        "Optimization cycle completed"
    );

    record_optimization_event(&pool, optimized_count, skipped_count, error_count, duration.as_millis() as i64).await?;

    Ok(())
}

async fn get_active_users(pool: &PgPool) -> Result<Vec<String>, super::WorkerError> {
    let min_records = std::env::var("OPTIMIZATION_MIN_RECORDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100i64);

    let rows = sqlx::query(
        r#"
        SELECT u.id FROM "user" u
        WHERE EXISTS (
            SELECT 1 FROM "answer_records" ar
            WHERE ar."userId" = u.id
            GROUP BY ar."userId"
            HAVING COUNT(*) >= $1
        )
        "#,
    )
    .bind(min_records)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().filter_map(|r| r.try_get("id").ok()).collect())
}

async fn optimize_user_params(pool: &PgPool, user_id: &str) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let recent_performance = get_recent_performance(pool, user_id).await?;

    if recent_performance.total_answers < 50 {
        debug!(user_id = %user_id, "Insufficient recent data for optimization");
        return Ok(false);
    }

    let current_config = get_user_algorithm_config(pool, user_id).await?;
    let suggested_params = suggest_parameters(&recent_performance, &current_config);

    if params_similar(&current_config, &suggested_params) {
        debug!(user_id = %user_id, "Parameters already optimal");
        return Ok(false);
    }

    apply_suggested_params(pool, user_id, &suggested_params).await?;
    info!(user_id = %user_id, old_alpha = current_config.alpha, new_alpha = suggested_params.alpha, "User parameters optimized");

    Ok(true)
}

#[derive(Debug, Default)]
struct RecentPerformance {
    total_answers: i64,
    correct_rate: f64,
    avg_response_time: f64,
}

async fn get_recent_performance(pool: &PgPool, user_id: &str) -> Result<RecentPerformance, super::WorkerError> {
    let since = Utc::now() - chrono::Duration::days(7);

    let row = sqlx::query(
        r#"
        SELECT COUNT(*) as total,
               AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END)::float8 as correct_rate,
               AVG("responseTime")::float8 as avg_response_time
        FROM "answer_records"
        WHERE "userId" = $1 AND "timestamp" >= $2
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_one(pool)
    .await?;

    Ok(RecentPerformance {
        total_answers: row.try_get::<i64, _>("total").unwrap_or(0),
        correct_rate: row.try_get::<Option<f64>, _>("correct_rate").ok().flatten().unwrap_or(0.0),
        avg_response_time: row.try_get::<Option<f64>, _>("avg_response_time").ok().flatten().unwrap_or(0.0),
    })
}

#[derive(Debug, Clone)]
struct AlgorithmConfig {
    alpha: f64,
    exploration_rate: f64,
    difficulty_weight: f64,
}

impl Default for AlgorithmConfig {
    fn default() -> Self {
        Self { alpha: 1.0, exploration_rate: 0.1, difficulty_weight: 0.5 }
    }
}

async fn get_user_algorithm_config(pool: &PgPool, user_id: &str) -> Result<AlgorithmConfig, super::WorkerError> {
    let row = sqlx::query(r#"SELECT "linucbAlpha", "explorationRate", "difficultyWeight" FROM "algorithm_config" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .map(|r| AlgorithmConfig {
            alpha: r.try_get::<Option<f64>, _>("linucbAlpha").ok().flatten().unwrap_or(1.0),
            exploration_rate: r.try_get::<Option<f64>, _>("explorationRate").ok().flatten().unwrap_or(0.1),
            difficulty_weight: r.try_get::<Option<f64>, _>("difficultyWeight").ok().flatten().unwrap_or(0.5),
        })
        .unwrap_or_default())
}

fn suggest_parameters(perf: &RecentPerformance, current: &AlgorithmConfig) -> AlgorithmConfig {
    let mut suggested = current.clone();

    if perf.correct_rate > 0.85 {
        suggested.alpha = (current.alpha * 0.9).max(0.1);
        suggested.exploration_rate = (current.exploration_rate * 1.1).min(0.3);
    } else if perf.correct_rate < 0.65 {
        suggested.alpha = (current.alpha * 1.1).min(3.0);
        suggested.exploration_rate = (current.exploration_rate * 0.9).max(0.05);
    }

    if perf.avg_response_time > 5000.0 {
        suggested.difficulty_weight = (current.difficulty_weight * 0.9).max(0.2);
    } else if perf.avg_response_time < 2000.0 {
        suggested.difficulty_weight = (current.difficulty_weight * 1.1).min(0.8);
    }

    suggested
}

fn params_similar(a: &AlgorithmConfig, b: &AlgorithmConfig) -> bool {
    let epsilon = 0.01;
    (a.alpha - b.alpha).abs() < epsilon
        && (a.exploration_rate - b.exploration_rate).abs() < epsilon
        && (a.difficulty_weight - b.difficulty_weight).abs() < epsilon
}

async fn apply_suggested_params(pool: &PgPool, user_id: &str, params: &AlgorithmConfig) -> Result<(), super::WorkerError> {
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO "algorithm_config" ("id", "userId", "linucbAlpha", "explorationRate", "difficultyWeight", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $5)
        ON CONFLICT ("userId") DO UPDATE SET
            "linucbAlpha" = EXCLUDED."linucbAlpha",
            "explorationRate" = EXCLUDED."explorationRate",
            "difficultyWeight" = EXCLUDED."difficultyWeight",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(user_id)
    .bind(params.alpha)
    .bind(params.exploration_rate)
    .bind(params.difficulty_weight)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

async fn record_optimization_event(pool: &PgPool, optimized: i32, skipped: i32, errors: i32, duration_ms: i64) -> Result<(), super::WorkerError> {
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO "optimization_event" ("id", "timestamp", "optimizedUsers", "skippedUsers", "errorCount", "durationMs", "createdAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $1)
        "#,
    )
    .bind(now)
    .bind(optimized)
    .bind(skipped)
    .bind(errors)
    .bind(duration_ms)
    .execute(pool)
    .await
    .map_err(|e| {
        warn!(error = %e, "Failed to record optimization event");
        e
    })?;

    Ok(())
}
