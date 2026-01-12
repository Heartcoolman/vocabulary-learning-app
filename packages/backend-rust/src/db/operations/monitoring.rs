use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aggregate15m {
    pub id: String,
    pub period_start: DateTime<Utc>,
    pub event_count: i32,
    pub anomaly_count: i32,
    pub avg_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub avg_attention: f64,
    pub avg_fatigue: f64,
    pub avg_motivation: f64,
    pub constraints_satisfied_rate: f64,
    pub alert_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateDaily {
    pub id: String,
    pub date: NaiveDate,
    pub total_events: i64,
    pub anomaly_count: i32,
    pub avg_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub avg_attention: f64,
    pub avg_fatigue: f64,
    pub avg_motivation: f64,
    pub constraints_satisfied_rate: f64,
    pub unique_users: i32,
    pub alert_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub id: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub health_score: f64,
    pub health_status: String,
    pub insights: serde_json::Value,
    pub recommendations: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MonitoringOverview {
    pub total_events: i64,
    pub events_last24h: i64,
    pub anomaly_rate: f64,
    pub avg_latency_ms: f64,
    pub constraints_satisfied_rate: f64,
    pub latest_health_score: Option<f64>,
    pub latest_health_status: Option<String>,
}

pub async fn get_monitoring_overview(proxy: &DatabaseProxy) -> Result<MonitoringOverview, sqlx::Error> {
    let today = Utc::now().date_naive();

    let daily: Option<(i64, i32)> = sqlx::query_as(
        r#"
        SELECT "totalEvents", "totalAnomalies"
        FROM "amas_monitoring_aggregates_daily"
        WHERE "date" = $1
        "#,
    )
    .bind(today)
    .fetch_optional(proxy.pool())
    .await?;

    let latest_report: Option<(f64, String)> = sqlx::query_as(
        r#"
        SELECT "healthScore", "healthStatus"
        FROM "amas_health_reports"
        ORDER BY "createdAt" DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(proxy.pool())
    .await?;

    let stats_24h: Option<(i64, i64, Option<f64>, Option<f64>)> = sqlx::query_as(
        r#"
        SELECT
            COALESCE(SUM("eventCount"), 0)::bigint,
            COALESCE(SUM("anomalyCount"), 0)::bigint,
            AVG("latencyP95"::float),
            AVG("constraintsSatisfiedRate")
        FROM "amas_monitoring_aggregates_15m"
        WHERE "periodStart" >= NOW() - INTERVAL '24 hours'
        "#,
    )
    .fetch_optional(proxy.pool())
    .await?;

    let (total_events_today, _) = daily.unwrap_or((0, 0));
    let (events_last24h, anomalies_24h, avg_latency, constraints_rate) =
        stats_24h.unwrap_or((0, 0, None, None));

    let anomaly_rate = if events_last24h > 0 {
        anomalies_24h as f64 / events_last24h as f64
    } else {
        0.0
    };

    Ok(MonitoringOverview {
        total_events: total_events_today,
        events_last24h,
        anomaly_rate,
        avg_latency_ms: avg_latency.unwrap_or(0.0),
        constraints_satisfied_rate: constraints_rate.unwrap_or(1.0),
        latest_health_score: latest_report.as_ref().map(|(s, _)| *s),
        latest_health_status: latest_report.map(|(_, st)| st),
    })
}

pub async fn get_aggregates_15m(
    proxy: &DatabaseProxy,
    limit: i32,
) -> Result<Vec<Aggregate15m>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT "id"::text, "periodStart", "eventCount",
               "anomalyCount", "latencyP50", "latencyP95",
               "avgAttention", "avgFatigue", "avgMotivation",
               "constraintsSatisfiedRate", "alertLevel"
        FROM "amas_monitoring_aggregates_15m"
        ORDER BY "periodStart" DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let latency_p50: Option<i32> = row.get("latencyP50");
            let latency_p95: Option<i32> = row.get("latencyP95");
            Aggregate15m {
                id: row.get("id"),
                period_start: row.get("periodStart"),
                event_count: row.get("eventCount"),
                anomaly_count: row.get("anomalyCount"),
                avg_latency_ms: latency_p50.unwrap_or(0) as f64,
                p95_latency_ms: latency_p95.unwrap_or(0) as f64,
                avg_attention: row.get::<Option<f64>, _>("avgAttention").unwrap_or(0.0),
                avg_fatigue: row.get::<Option<f64>, _>("avgFatigue").unwrap_or(0.0),
                avg_motivation: row.get::<Option<f64>, _>("avgMotivation").unwrap_or(0.0),
                constraints_satisfied_rate: row.get::<Option<f64>, _>("constraintsSatisfiedRate").unwrap_or(1.0),
                alert_level: row.get("alertLevel"),
            }
        })
        .collect())
}

pub async fn get_aggregates_daily(
    proxy: &DatabaseProxy,
    limit: i32,
) -> Result<Vec<AggregateDaily>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT "id"::text, "date", "totalEvents", "uniqueUsers", "totalAnomalies",
               "latencyDistribution", "stateMetrics", "constraintHealth",
               "warnPeriods", "criticalPeriods"
        FROM "amas_monitoring_aggregates_daily"
        ORDER BY "date" DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let latency_dist: serde_json::Value = row.get("latencyDistribution");
            let state_metrics: serde_json::Value = row.get("stateMetrics");
            let constraint_health: serde_json::Value = row.get("constraintHealth");
            let warn_periods: i32 = row.get("warnPeriods");
            let critical_periods: i32 = row.get("criticalPeriods");

            let alert_level = if critical_periods > 0 {
                "critical"
            } else if warn_periods > 0 {
                "warn"
            } else {
                "ok"
            };

            AggregateDaily {
                id: row.get("id"),
                date: row.get("date"),
                total_events: row.get("totalEvents"),
                anomaly_count: row.get("totalAnomalies"),
                avg_latency_ms: latency_dist.get("p50").and_then(|v| v.as_f64()).unwrap_or(0.0),
                p95_latency_ms: latency_dist.get("p95").and_then(|v| v.as_f64()).unwrap_or(0.0),
                avg_attention: state_metrics.get("avgAttention").and_then(|v| v.as_f64()).unwrap_or(0.0),
                avg_fatigue: state_metrics.get("avgFatigue").and_then(|v| v.as_f64()).unwrap_or(0.0),
                avg_motivation: state_metrics.get("avgMotivation").and_then(|v| v.as_f64()).unwrap_or(0.0),
                constraints_satisfied_rate: constraint_health.get("satisfiedRate").and_then(|v| v.as_f64()).unwrap_or(1.0),
                unique_users: row.get("uniqueUsers"),
                alert_level: alert_level.to_string(),
            }
        })
        .collect())
}

pub async fn get_health_reports(
    proxy: &DatabaseProxy,
    limit: i32,
) -> Result<Vec<HealthReport>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT "id"::text, "weekStart", "weekEnd", "healthScore", "healthStatus",
               "insights", "recommendations"
        FROM "amas_health_reports"
        ORDER BY "createdAt" DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| HealthReport {
            id: row.get("id"),
            period_start: row.get("weekStart"),
            period_end: row.get("weekEnd"),
            health_score: row.get("healthScore"),
            health_status: row.get("healthStatus"),
            insights: row.get("insights"),
            recommendations: row.get("recommendations"),
        })
        .collect())
}

pub async fn insert_15m_aggregate(
    proxy: &DatabaseProxy,
    period_start: NaiveDateTime,
    period_end: NaiveDateTime,
    event_count: i32,
    unique_users: i32,
    anomaly_count: i32,
    invariant_violation_count: i32,
    latency_p50: Option<i32>,
    latency_p95: Option<i32>,
    latency_p99: Option<i32>,
    latency_max: Option<i32>,
    avg_attention: Option<f64>,
    avg_fatigue: Option<f64>,
    avg_motivation: Option<f64>,
    avg_confidence: Option<f64>,
    constraints_satisfied_rate: Option<f64>,
    alert_level: &str,
    alert_reasons: &[String],
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO "amas_monitoring_aggregates_15m" (
            "id", "periodStart", "periodEnd", "eventCount", "uniqueUsers",
            "anomalyCount", "invariantViolationCount", "latencyP50", "latencyP95",
            "latencyP99", "latencyMax", "avgAttention", "avgFatigue",
            "avgMotivation", "avgConfidence", "constraintsSatisfiedRate",
            "alertLevel", "alertReasons"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT ("periodStart") DO NOTHING
        "#,
    )
    .bind(id)
    .bind(period_start)
    .bind(period_end)
    .bind(event_count)
    .bind(unique_users)
    .bind(anomaly_count)
    .bind(invariant_violation_count)
    .bind(latency_p50)
    .bind(latency_p95)
    .bind(latency_p99)
    .bind(latency_max)
    .bind(avg_attention)
    .bind(avg_fatigue)
    .bind(avg_motivation)
    .bind(avg_confidence)
    .bind(constraints_satisfied_rate)
    .bind(alert_level)
    .bind(alert_reasons)
    .execute(proxy.pool())
    .await?;

    Ok(id.to_string())
}

pub async fn insert_daily_aggregate(
    proxy: &DatabaseProxy,
    date: NaiveDate,
    total_events: i64,
    unique_users: i32,
    total_anomalies: i32,
    latency_distribution: &serde_json::Value,
    state_metrics: &serde_json::Value,
    constraint_health: &serde_json::Value,
    cold_start_funnel: &serde_json::Value,
    warn_periods: i32,
    critical_periods: i32,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO "amas_monitoring_aggregates_daily" (
            "id", "date", "totalEvents", "uniqueUsers", "totalAnomalies",
            "latencyDistribution", "stateMetrics", "constraintHealth",
            "coldStartFunnel", "warnPeriods", "criticalPeriods"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT ("date") DO NOTHING
        "#,
    )
    .bind(id)
    .bind(date)
    .bind(total_events)
    .bind(unique_users)
    .bind(total_anomalies)
    .bind(latency_distribution)
    .bind(state_metrics)
    .bind(constraint_health)
    .bind(cold_start_funnel)
    .bind(warn_periods)
    .bind(critical_periods)
    .execute(proxy.pool())
    .await?;

    Ok(id.to_string())
}

pub async fn insert_health_report(
    proxy: &DatabaseProxy,
    week_start: NaiveDate,
    week_end: NaiveDate,
    health_score: f64,
    health_status: &str,
    insights: &serde_json::Value,
    recommendations: &serde_json::Value,
    input_snapshot: &serde_json::Value,
    tokens_used: Option<i32>,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO "amas_health_reports" (
            "id", "weekStart", "weekEnd", "healthScore", "healthStatus",
            "insights", "recommendations", "inputSnapshot", "tokensUsed"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(id)
    .bind(week_start)
    .bind(week_end)
    .bind(health_score)
    .bind(health_status)
    .bind(insights)
    .bind(recommendations)
    .bind(input_snapshot)
    .bind(tokens_used)
    .execute(proxy.pool())
    .await?;

    Ok(id.to_string())
}
