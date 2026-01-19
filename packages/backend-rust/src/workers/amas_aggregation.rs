use std::sync::Arc;

use chrono::{Duration, NaiveDateTime, Timelike, Utc};
use sqlx::Row;
use tracing::{info, warn};

use crate::db::operations::monitoring::insert_15m_aggregate;
use crate::db::DatabaseProxy;

pub async fn aggregate_15min(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let pool = db.pool();
    let now = Utc::now().naive_utc();
    let period_end = round_to_15min(now);
    let period_start = period_end - Duration::minutes(15);

    let existing: Option<(i32,)> = sqlx::query_as(
        r#"SELECT 1 FROM "amas_monitoring_aggregates_15m" WHERE "periodStart" = $1"#,
    )
    .bind(period_start)
    .fetch_optional(pool)
    .await
    .map_err(super::WorkerError::Database)?;

    if existing.is_some() {
        return Ok(());
    }

    let stats = sqlx::query(
        r#"
        SELECT
            COUNT(*) as event_count,
            COUNT(DISTINCT "userId") as unique_users,
            COUNT(*) FILTER (WHERE "isAnomaly" = true) as anomaly_count,
            COALESCE(SUM(jsonb_array_length("invariantViolations")), 0) as violation_count,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs") as p50,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") as p95,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latencyMs") as p99,
            MAX("latencyMs") as max_latency,
            AVG(("userState"->>'A')::float) as avg_attention,
            AVG(("userState"->>'F')::float) as avg_fatigue,
            AVG(("userState"->>'M')::float) as avg_motivation,
            AVG(("userState"->>'conf')::float) as avg_confidence,
            AVG(CASE WHEN "constraintsSatisfied" = true THEN 1.0 ELSE 0.0 END) as constraint_rate,
            COUNT(*) FILTER (WHERE "coldStartPhase" = 'classify') as cold_classify,
            COUNT(*) FILTER (WHERE "coldStartPhase" = 'explore') as cold_explore
        FROM "amas_monitoring_events"
        WHERE "timestamp" >= $1 AND "timestamp" < $2
        "#,
    )
    .bind(period_start)
    .bind(period_end)
    .fetch_one(pool)
    .await
    .map_err(super::WorkerError::Database)?;

    let event_count: i64 = stats.try_get("event_count").unwrap_or(0);
    let unique_users: i64 = stats.try_get("unique_users").unwrap_or(0);
    let anomaly_count: i64 = stats.try_get("anomaly_count").unwrap_or(0);
    let violation_count: i64 = stats.try_get("violation_count").unwrap_or(0);
    let p50: Option<f64> = stats.try_get("p50").ok();
    let p95: Option<f64> = stats.try_get("p95").ok();
    let p99: Option<f64> = stats.try_get("p99").ok();
    let max_latency: Option<i32> = stats.try_get("max_latency").ok();
    let avg_attention: Option<f64> = stats.try_get("avg_attention").ok();
    let avg_fatigue: Option<f64> = stats.try_get("avg_fatigue").ok();
    let avg_motivation: Option<f64> = stats.try_get("avg_motivation").ok();
    let avg_confidence: Option<f64> = stats.try_get("avg_confidence").ok();
    let constraint_rate: Option<f64> = stats.try_get("constraint_rate").ok();

    if event_count == 0 {
        return Ok(());
    }

    let (alert_level, alert_reasons) = compute_alert_level(
        anomaly_count as f64 / event_count as f64,
        p95.map(|v| v as i64).unwrap_or(0),
        constraint_rate.unwrap_or(1.0),
        violation_count > 0,
    );

    insert_15m_aggregate(
        &db,
        period_start,
        period_end,
        event_count as i32,
        unique_users as i32,
        anomaly_count as i32,
        violation_count as i32,
        p50.map(|v| v as i32),
        p95.map(|v| v as i32),
        p99.map(|v| v as i32),
        max_latency,
        avg_attention,
        avg_fatigue,
        avg_motivation,
        avg_confidence,
        constraint_rate,
        &alert_level,
        &alert_reasons,
    )
    .await
    .map_err(super::WorkerError::Database)?;

    if alert_level != "ok" {
        warn!(
            period = %period_start,
            alert_level = %alert_level,
            reasons = ?alert_reasons,
            "AMAS monitoring alert"
        );
    } else {
        info!(
            period = %period_start,
            events = event_count,
            anomalies = anomaly_count,
            "AMAS 15min aggregation completed"
        );
    }

    Ok(())
}

pub async fn aggregate_daily(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let pool = db.pool();
    let yesterday = (Utc::now() - Duration::days(1)).date_naive();

    let existing: Option<(i32,)> =
        sqlx::query_as(r#"SELECT 1 FROM "amas_monitoring_aggregates_daily" WHERE "date" = $1"#)
            .bind(yesterday)
            .fetch_optional(pool)
            .await
            .map_err(super::WorkerError::Database)?;

    if existing.is_some() {
        return Ok(());
    }

    let stats = sqlx::query(
        r#"
        SELECT
            COALESCE(SUM("eventCount"), 0) as total_events,
            COALESCE(MAX("uniqueUsers"), 0) as unique_users,
            COALESCE(SUM("anomalyCount"), 0) as total_anomalies,
            AVG("latencyP50") as avg_p50,
            AVG("latencyP95") as avg_p95,
            MAX("latencyP99") as max_p99,
            MAX("latencyMax") as max_latency,
            AVG("avgAttention") as avg_attention,
            AVG("avgFatigue") as avg_fatigue,
            AVG("avgMotivation") as avg_motivation,
            AVG("constraintsSatisfiedRate") as avg_constraint,
            SUM("coldStartClassifyCount") as cold_classify,
            SUM("coldStartExploreCount") as cold_explore,
            COUNT(*) FILTER (WHERE "alertLevel" = 'warn') as warn_periods,
            COUNT(*) FILTER (WHERE "alertLevel" = 'critical') as critical_periods
        FROM "amas_monitoring_aggregates_15m"
        WHERE DATE("periodStart") = $1
        "#,
    )
    .bind(yesterday)
    .fetch_one(pool)
    .await
    .map_err(super::WorkerError::Database)?;

    let total_events: i64 = stats.try_get("total_events").unwrap_or(0);

    if total_events == 0 {
        return Ok(());
    }

    let latency_dist = serde_json::json!({
        "p50": stats.try_get::<f64, _>("avg_p50").ok(),
        "p95": stats.try_get::<f64, _>("avg_p95").ok(),
        "p99": stats.try_get::<f64, _>("max_p99").ok(),
        "max": stats.try_get::<i32, _>("max_latency").ok()
    });

    let state_metrics = serde_json::json!({
        "attention": {"avg": stats.try_get::<f64, _>("avg_attention").ok()},
        "fatigue": {"avg": stats.try_get::<f64, _>("avg_fatigue").ok()},
        "motivation": {"avg": stats.try_get::<f64, _>("avg_motivation").ok()}
    });

    let constraint_health = serde_json::json!({
        "satisfiedRate": stats.try_get::<f64, _>("avg_constraint").ok()
    });

    let cold_start_funnel = serde_json::json!({
        "classify": stats.try_get::<i64, _>("cold_classify").ok(),
        "explore": stats.try_get::<i64, _>("cold_explore").ok()
    });

    crate::db::operations::monitoring::insert_daily_aggregate(
        &db,
        yesterday,
        total_events,
        stats.try_get("unique_users").unwrap_or(0),
        stats.try_get("total_anomalies").unwrap_or(0),
        &latency_dist,
        &state_metrics,
        &constraint_health,
        &cold_start_funnel,
        stats.try_get("warn_periods").unwrap_or(0),
        stats.try_get("critical_periods").unwrap_or(0),
    )
    .await
    .map_err(super::WorkerError::Database)?;

    info!(date = %yesterday, events = total_events, "AMAS daily aggregation completed");

    Ok(())
}

fn round_to_15min(dt: NaiveDateTime) -> NaiveDateTime {
    let minute = dt.time().minute();
    let rounded_minute = (minute / 15) * 15;
    dt.date()
        .and_hms_opt(dt.time().hour(), rounded_minute, 0)
        .unwrap()
}

fn compute_alert_level(
    anomaly_rate: f64,
    latency_p95: i64,
    constraints_rate: f64,
    has_invariant_violation: bool,
) -> (String, Vec<String>) {
    let mut reasons = vec![];
    let mut level = "ok";

    if has_invariant_violation {
        reasons.push("invariant_violation".into());
        level = "critical";
    }
    if anomaly_rate > 0.05 {
        reasons.push(format!("anomaly_rate: {:.1}%", anomaly_rate * 100.0));
        level = "critical";
    }
    if latency_p95 > 500 {
        reasons.push(format!("latency_p95: {}ms", latency_p95));
        level = "critical";
    }

    if level == "ok" {
        if anomaly_rate > 0.01 {
            reasons.push(format!("anomaly_rate: {:.1}%", anomaly_rate * 100.0));
            level = "warn";
        }
        if latency_p95 > 200 {
            reasons.push(format!("latency_p95: {}ms", latency_p95));
            level = "warn";
        }
        if constraints_rate < 0.90 {
            reasons.push(format!(
                "constraints_rate: {:.1}%",
                constraints_rate * 100.0
            ));
            level = "warn";
        }
    }

    (level.to_string(), reasons)
}
