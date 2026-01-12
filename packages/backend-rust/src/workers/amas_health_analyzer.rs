use std::sync::Arc;

use chrono::{Datelike, Duration, NaiveDate, Utc};
use sqlx::Row;
use tracing::{info, warn};

use crate::db::operations::monitoring::insert_health_report;
use crate::db::DatabaseProxy;
use crate::services::llm_provider::{ChatMessage, LLMProvider};

pub async fn run_weekly_health_analysis(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let pool = db.pool();

    let llm_enabled = std::env::var("AMAS_HEALTH_ANALYZER_ENABLED")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if !llm_enabled {
        info!("AMAS health analyzer not enabled, skipping");
        return Ok(());
    }

    let llm = LLMProvider::from_env();
    if !llm.is_available() {
        warn!("LLM not configured, skipping health analysis");
        return Ok(());
    }

    let today = Utc::now().date_naive();
    let week_end = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let week_start = week_end - Duration::days(6);

    let existing: Option<(i32,)> = sqlx::query_as(
        r#"SELECT 1 FROM "amas_health_reports" WHERE "weekStart" = $1"#,
    )
    .bind(week_start)
    .fetch_optional(pool)
    .await
    .map_err(super::WorkerError::Database)?;

    if existing.is_some() {
        info!(week = %week_start, "Health report already exists, skipping");
        return Ok(());
    }

    let weekly_data = collect_weekly_data(pool, week_start, week_end).await?;

    if weekly_data.total_events == 0 {
        info!(week = %week_start, "No events for the week, skipping health analysis");
        return Ok(());
    }

    let analysis = match generate_health_analysis(&llm, &weekly_data).await {
        Ok(a) => a,
        Err(e) => {
            warn!(error = %e, "LLM health analysis failed, using heuristic");
            generate_heuristic_analysis(&weekly_data)
        }
    };

    let input_snapshot = serde_json::to_value(&weekly_data).unwrap_or_default();
    let insights = serde_json::to_value(&analysis.insights).unwrap_or_default();
    let recommendations = serde_json::to_value(&analysis.recommendations).unwrap_or_default();

    insert_health_report(
        &db,
        week_start,
        week_end,
        analysis.health_score,
        &analysis.health_status,
        &insights,
        &recommendations,
        &input_snapshot,
        analysis.tokens_used,
    )
    .await
    .map_err(super::WorkerError::Database)?;

    info!(
        week = %week_start,
        health_score = analysis.health_score,
        status = %analysis.health_status,
        "AMAS weekly health analysis completed"
    );

    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct WeeklyData {
    total_events: i64,
    unique_users: i32,
    total_anomalies: i32,
    avg_latency_p95: Option<f64>,
    avg_constraint_rate: Option<f64>,
    warn_periods: i32,
    critical_periods: i32,
    daily_trend: Vec<DailyTrend>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct DailyTrend {
    date: NaiveDate,
    events: i64,
    anomalies: i32,
}

async fn collect_weekly_data(
    pool: &sqlx::PgPool,
    week_start: NaiveDate,
    week_end: NaiveDate,
) -> Result<WeeklyData, super::WorkerError> {
    let summary = sqlx::query(
        r#"
        SELECT
            COALESCE(SUM("totalEvents"), 0) as total_events,
            COALESCE(MAX("uniqueUsers"), 0) as unique_users,
            COALESCE(SUM("totalAnomalies"), 0) as total_anomalies,
            AVG(("latencyDistribution"->>'p95')::float) as avg_p95,
            AVG(("constraintHealth"->>'satisfiedRate')::float) as avg_constraint,
            COALESCE(SUM("warnPeriods"), 0) as warn_periods,
            COALESCE(SUM("criticalPeriods"), 0) as critical_periods
        FROM "amas_monitoring_aggregates_daily"
        WHERE "date" >= $1 AND "date" <= $2
        "#,
    )
    .bind(week_start)
    .bind(week_end)
    .fetch_one(pool)
    .await
    .map_err(super::WorkerError::Database)?;

    let trends = sqlx::query(
        r#"
        SELECT "date", "totalEvents" as events, "totalAnomalies" as anomalies
        FROM "amas_monitoring_aggregates_daily"
        WHERE "date" >= $1 AND "date" <= $2
        ORDER BY "date"
        "#,
    )
    .bind(week_start)
    .bind(week_end)
    .fetch_all(pool)
    .await
    .map_err(super::WorkerError::Database)?;

    let daily_trend: Vec<DailyTrend> = trends
        .iter()
        .map(|row| DailyTrend {
            date: row.get("date"),
            events: row.get("events"),
            anomalies: row.get("anomalies"),
        })
        .collect();

    Ok(WeeklyData {
        total_events: summary.try_get("total_events").unwrap_or(0),
        unique_users: summary.try_get("unique_users").unwrap_or(0),
        total_anomalies: summary.try_get("total_anomalies").unwrap_or(0),
        avg_latency_p95: summary.try_get("avg_p95").ok(),
        avg_constraint_rate: summary.try_get("avg_constraint").ok(),
        warn_periods: summary.try_get("warn_periods").unwrap_or(0),
        critical_periods: summary.try_get("critical_periods").unwrap_or(0),
        daily_trend,
    })
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct HealthAnalysis {
    health_score: f64,
    health_status: String,
    insights: HealthInsights,
    recommendations: Vec<Recommendation>,
    tokens_used: Option<i32>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct HealthInsights {
    summary: String,
    anomaly_analysis: String,
    performance_analysis: String,
    trend_analysis: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct Recommendation {
    priority: String,
    category: String,
    action: String,
    rationale: String,
}

async fn generate_health_analysis(
    llm: &LLMProvider,
    data: &WeeklyData,
) -> Result<HealthAnalysis, crate::services::llm_provider::LLMError> {
    let system_prompt = r#"You are an AMAS (Adaptive Learning System) health analyst.
Analyze weekly monitoring data and output a structured JSON health report.

Output format (JSON only, no markdown):
{
  "health_score": 0-100,
  "health_status": "healthy|degraded|unhealthy",
  "insights": {
    "summary": "One-line summary",
    "anomaly_analysis": "Analysis of anomalies",
    "performance_analysis": "Latency and constraint analysis",
    "trend_analysis": "Daily trend interpretation"
  },
  "recommendations": [
    {"priority": "high|medium|low", "category": "category", "action": "action", "rationale": "why"}
  ]
}

Health score guidelines:
- 90-100: healthy (< 1% anomaly rate, P95 < 200ms, constraints > 95%)
- 70-89: degraded (1-5% anomaly rate, P95 < 500ms, constraints > 85%)
- < 70: unhealthy (> 5% anomaly rate or critical issues)"#;

    let anomaly_rate = if data.total_events > 0 {
        (data.total_anomalies as f64 / data.total_events as f64) * 100.0
    } else {
        0.0
    };

    let user_prompt = format!(
        r#"Weekly AMAS Monitoring Data:
- Total Events: {}
- Unique Users: {}
- Total Anomalies: {} ({:.2}% rate)
- Avg Latency P95: {:.1}ms
- Constraint Satisfaction Rate: {:.1}%
- Warn Periods: {}
- Critical Periods: {}

Daily Trend:
{}"#,
        data.total_events,
        data.unique_users,
        data.total_anomalies,
        anomaly_rate,
        data.avg_latency_p95.unwrap_or(0.0),
        data.avg_constraint_rate.unwrap_or(1.0) * 100.0,
        data.warn_periods,
        data.critical_periods,
        serde_json::to_string_pretty(&data.daily_trend).unwrap_or_default()
    );

    let messages = [
        ChatMessage {
            role: "system".into(),
            content: system_prompt.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: user_prompt,
        },
    ];

    let response = llm.chat(&messages).await?;
    let raw = response.first_content().unwrap_or_default();
    let tokens = response
        .usage
        .as_ref()
        .and_then(|u| u.total_tokens)
        .map(|t| t as i32);

    let json_str = raw
        .trim()
        .strip_prefix("```json")
        .and_then(|s| s.strip_suffix("```"))
        .or_else(|| {
            raw.trim()
                .strip_prefix("```")
                .and_then(|s| s.strip_suffix("```"))
        })
        .unwrap_or(raw.trim());

    let mut analysis: HealthAnalysis =
        serde_json::from_str(json_str).map_err(crate::services::llm_provider::LLMError::Json)?;
    analysis.tokens_used = tokens;

    Ok(analysis)
}

fn generate_heuristic_analysis(data: &WeeklyData) -> HealthAnalysis {
    let anomaly_rate = if data.total_events > 0 {
        data.total_anomalies as f64 / data.total_events as f64
    } else {
        0.0
    };

    let latency_ok = data.avg_latency_p95.map(|l| l < 200.0).unwrap_or(true);
    let constraints_ok = data.avg_constraint_rate.map(|c| c > 0.90).unwrap_or(true);

    let (health_score, health_status) = if anomaly_rate < 0.01 && latency_ok && constraints_ok {
        (95.0, "healthy")
    } else if anomaly_rate < 0.05 && data.avg_latency_p95.unwrap_or(0.0) < 500.0 {
        (75.0, "degraded")
    } else {
        (50.0, "unhealthy")
    };

    let mut recommendations = vec![];
    if anomaly_rate > 0.01 {
        recommendations.push(Recommendation {
            priority: "high".into(),
            category: "anomaly".into(),
            action: "Investigate invariant violations".into(),
            rationale: format!("Anomaly rate is {:.1}%", anomaly_rate * 100.0),
        });
    }
    if !latency_ok {
        recommendations.push(Recommendation {
            priority: "medium".into(),
            category: "performance".into(),
            action: "Optimize AMAS processing pipeline".into(),
            rationale: format!(
                "P95 latency is {:.0}ms",
                data.avg_latency_p95.unwrap_or(0.0)
            ),
        });
    }

    HealthAnalysis {
        health_score,
        health_status: health_status.into(),
        insights: HealthInsights {
            summary: format!(
                "AMAS processed {} events with {:.1}% anomaly rate",
                data.total_events,
                anomaly_rate * 100.0
            ),
            anomaly_analysis: format!("{} anomalies detected", data.total_anomalies),
            performance_analysis: format!(
                "P95 latency: {:.0}ms, Constraint rate: {:.0}%",
                data.avg_latency_p95.unwrap_or(0.0),
                data.avg_constraint_rate.unwrap_or(1.0) * 100.0
            ),
            trend_analysis: format!(
                "{} warn periods, {} critical periods",
                data.warn_periods, data.critical_periods
            ),
        },
        recommendations,
        tokens_used: None,
    }
}
