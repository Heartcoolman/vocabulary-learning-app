use chrono::{Duration, NaiveDate, Utc};
use serde::Serialize;
use sqlx::Row;

use crate::db::DatabaseProxy;

const DEFAULT_TREND_DAYS: i64 = 28;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPoint {
    pub date: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendLine {
    pub points: Vec<DataPoint>,
    pub direction: String,
    pub change_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendReport {
    pub accuracy_trend: TrendLine,
    pub response_time_trend: TrendLine,
    pub motivation_trend: TrendLine,
    pub summary: String,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendResult {
    pub state: String,
    pub consecutive_days: i64,
    pub last_change: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendHistoryItem {
    pub date: String,
    pub state: String,
    pub accuracy: f64,
    pub avg_response_time: f64,
    pub motivation: f64,
}

pub async fn get_current_trend(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<TrendResult, String> {
    let pool = proxy.pool();

    let state: Option<String> = sqlx::query_scalar(
        r#"SELECT "trendState" FROM "amas_user_states" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let rows = sqlx::query(
        r#"SELECT "trendState", "motivation", "memory", "speed" FROM "user_state_history" WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 30"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let history: Vec<HistoryPoint> = rows.into_iter().map(|r| HistoryPoint {
        trend_state: r.try_get("trendState").ok(),
        motivation: r.try_get("motivation").unwrap_or(0.0),
        memory: r.try_get("memory").unwrap_or(0.0),
        speed: r.try_get("speed").unwrap_or(0.0),
    }).collect();

    let (trend_state, history) = (state, history);

    let current_state = trend_state
        .as_deref()
        .and_then(validate_trend_state)
        .unwrap_or_else(|| calculate_trend_from_history(&history));

    let consecutive_days = calculate_consecutive_days(&history, &current_state);

    Ok(TrendResult {
        state: current_state,
        consecutive_days,
        last_change: Utc::now().to_rfc3339(),
    })
}

pub async fn get_trend_history(
    proxy: &DatabaseProxy,
    user_id: &str,
    days: i64,
) -> Result<Vec<TrendHistoryItem>, String> {
    let days = days.clamp(7, 90);
    let start = Utc::now() - Duration::days(days);
    let pool = proxy.pool();

    let history_rows = sqlx::query(
        r#"SELECT "date", "trendState", "motivation" FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 ORDER BY "date" ASC"#,
    )
    .bind(user_id)
    .bind(start.naive_utc())
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let record_rows = sqlx::query(
        r#"SELECT "timestamp", "isCorrect", "responseTime" FROM "answer_records" WHERE "userId" = $1 AND "timestamp" >= $2"#,
    )
    .bind(user_id)
    .bind(start.naive_utc())
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Ok(aggregate_daily_data_pg(history_rows, record_rows))
}

pub async fn generate_trend_report(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<TrendReport, String> {
    let history = get_trend_history(proxy, user_id, DEFAULT_TREND_DAYS).await?;

    let accuracy_trend = calculate_trend_line(
        history.iter().map(|h| DataPoint { date: h.date.clone(), value: h.accuracy }).collect(),
        false,
    );

    let response_time_trend = calculate_trend_line(
        history.iter().map(|h| DataPoint { date: h.date.clone(), value: h.avg_response_time }).collect(),
        true,
    );

    let motivation_trend = calculate_trend_line(
        history.iter().map(|h| DataPoint { date: h.date.clone(), value: h.motivation }).collect(),
        false,
    );

    let (summary, recommendations) = generate_summary_and_recommendations(&accuracy_trend, &response_time_trend, &motivation_trend);

    Ok(TrendReport {
        accuracy_trend,
        response_time_trend,
        motivation_trend,
        summary,
        recommendations,
    })
}

#[derive(Debug, Clone)]
struct HistoryPoint {
    trend_state: Option<String>,
    motivation: f64,
    memory: f64,
    speed: f64,
}

fn default_trend_result() -> TrendResult {
    TrendResult {
        state: "flat".to_string(),
        consecutive_days: 1,
        last_change: Utc::now().to_rfc3339(),
    }
}

fn validate_trend_state(state: &str) -> Option<String> {
    match state {
        "up" | "flat" | "stuck" | "down" => Some(state.to_string()),
        _ => None,
    }
}

fn calculate_trend_from_history(history: &[HistoryPoint]) -> String {
    if history.len() < 2 {
        return "flat".to_string();
    }

    let recent: Vec<_> = history.iter().take(7).collect();
    let previous: Vec<_> = history.iter().skip(7).take(7).collect();

    if previous.is_empty() {
        return "flat".to_string();
    }

    let avg = |items: &[&HistoryPoint]| -> f64 {
        let sum: f64 = items.iter().map(|p| (p.motivation + p.memory + p.speed) / 3.0).sum();
        sum / items.len() as f64
    };

    let recent_avg = avg(&recent);
    let previous_avg = avg(&previous);
    let denominator = if previous_avg == 0.0 { 1.0 } else { previous_avg };
    let change = (recent_avg - previous_avg) / denominator;

    const TREND_THRESHOLD: f64 = 0.1;
    const MINOR_THRESHOLD: f64 = 0.05;

    if change > TREND_THRESHOLD { "up".to_string() }
    else if change < -TREND_THRESHOLD { "down".to_string() }
    else if change.abs() < MINOR_THRESHOLD { "flat".to_string() }
    else { "stuck".to_string() }
}

fn calculate_consecutive_days(history: &[HistoryPoint], current_state: &str) -> i64 {
    if history.is_empty() {
        return 1;
    }
    let mut count = 0i64;
    for item in history {
        if item.trend_state.as_deref() == Some(current_state) {
            count += 1;
        } else {
            break;
        }
    }
    if count > 0 { count } else { 1 }
}

fn aggregate_daily_data_pg(
    history_rows: Vec<sqlx::postgres::PgRow>,
    record_rows: Vec<sqlx::postgres::PgRow>,
) -> Vec<TrendHistoryItem> {
    use std::collections::HashMap;

    let mut history_map: HashMap<NaiveDate, (Option<String>, f64)> = HashMap::new();
    for row in history_rows {
        let Ok(date): Result<NaiveDate, _> = row.try_get("date") else { continue };
        let trend_state: Option<String> = row.try_get("trendState").ok();
        let motivation: f64 = row.try_get("motivation").unwrap_or(0.0);
        history_map.insert(date, (trend_state, motivation));
    }

    let mut records_map: HashMap<NaiveDate, (i64, i64, i64)> = HashMap::new();
    for row in record_rows {
        let Ok(ts): Result<chrono::NaiveDateTime, _> = row.try_get("timestamp") else { continue };
        let date = ts.date();
        let is_correct: bool = row.try_get("isCorrect").unwrap_or(false);
        let response_time: i64 = row
            .try_get::<Option<i32>, _>("responseTime")
            .ok()
            .flatten()
            .map(|v| v as i64)
            .unwrap_or(0);

        let entry = records_map.entry(date).or_insert((0, 0, 0));
        entry.0 += 1;
        if is_correct { entry.1 += 1; }
        entry.2 += response_time;
    }

    let mut all_dates: Vec<NaiveDate> = history_map.keys().chain(records_map.keys()).cloned().collect();
    all_dates.sort();
    all_dates.dedup();

    all_dates.into_iter().map(|date| {
        let (trend_state, motivation) = history_map.get(&date).cloned().unwrap_or((None, 0.0));
        let (total, correct, rt_sum) = records_map.get(&date).cloned().unwrap_or((0, 0, 0));
        let accuracy = if total > 0 { correct as f64 / total as f64 } else { 0.0 };
        let avg_rt = if total > 0 { rt_sum as f64 / total as f64 } else { 0.0 };

        TrendHistoryItem {
            date: format!("{}T00:00:00.000Z", date.format("%Y-%m-%d")),
            state: trend_state.unwrap_or_else(|| "flat".to_string()),
            accuracy,
            avg_response_time: avg_rt,
            motivation,
        }
    }).collect()
}

fn calculate_trend_line(points: Vec<DataPoint>, invert_direction: bool) -> TrendLine {
    if points.is_empty() {
        return TrendLine {
            points: vec![],
            direction: "flat".to_string(),
            change_percent: 0.0,
        };
    }

    let first_value = points.first().map(|p| p.value).unwrap_or(0.0);
    let last_value = points.last().map(|p| p.value).unwrap_or(0.0);
    let raw_change = if first_value != 0.0 {
        ((last_value - first_value) / first_value) * 100.0
    } else if last_value != 0.0 {
        100.0
    } else {
        0.0
    };

    let semantic_change = if invert_direction { -raw_change } else { raw_change };
    let direction = if semantic_change > 5.0 { "up" }
    else if semantic_change < -5.0 { "down" }
    else { "flat" };

    TrendLine {
        points,
        direction: direction.to_string(),
        change_percent: semantic_change,
    }
}

fn generate_summary_and_recommendations(
    accuracy_trend: &TrendLine,
    response_time_trend: &TrendLine,
    motivation_trend: &TrendLine,
) -> (String, Vec<String>) {
    let mut summary_parts = Vec::new();
    let mut recommendations = Vec::new();

    if accuracy_trend.direction == "up" {
        summary_parts.push("正确率持续提升");
    } else if accuracy_trend.direction == "down" {
        summary_parts.push("正确率有所下降");
        recommendations.push("建议增加复习频率，巩固已学单词".to_string());
    }

    if response_time_trend.direction == "up" {
        summary_parts.push("反应速度提升");
    } else if response_time_trend.direction == "down" {
        summary_parts.push("反应速度变慢");
        recommendations.push("建议适当休息，避免疲劳学习".to_string());
    }

    if motivation_trend.direction == "up" {
        summary_parts.push("学习动力增强");
    } else if motivation_trend.direction == "down" {
        summary_parts.push("学习动力下降");
        recommendations.push("建议设定小目标，获取成就感".to_string());
    }

    let summary = if summary_parts.is_empty() {
        "过去4周学习状态保持稳定".to_string()
    } else {
        format!("过去4周：{}", summary_parts.join("，"))
    };

    if recommendations.is_empty() {
        recommendations.push("继续保持当前学习节奏".to_string());
        recommendations.push("可以尝试挑战更难的单词".to_string());
    }

    (summary, recommendations)
}
