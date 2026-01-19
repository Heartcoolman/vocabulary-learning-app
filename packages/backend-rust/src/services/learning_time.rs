use chrono::{Duration, Utc};
use serde::Serialize;
use sqlx::Row;

use crate::db::DatabaseProxy;

const MIN_SESSION_COUNT: i64 = 20;
const GOLDEN_TIME_THRESHOLD: f64 = 0.6;
const RECOMMENDED_SLOTS_COUNT: usize = 3;
const TIME_PREF_WINDOW_DAYS: i64 = 90;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSlot {
    pub hour: i32,
    pub score: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimePreferenceResult {
    pub time_pref: Vec<f64>,
    pub preferred_slots: Vec<TimeSlot>,
    pub confidence: f64,
    pub sample_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsufficientDataResult {
    pub insufficient_data: bool,
    pub min_required: i64,
    pub current_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoldenTimeResult {
    pub is_golden: bool,
    pub current_hour: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_slot: Option<TimeSlot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum TimePreferenceResponse {
    Sufficient(TimePreferenceResult),
    Insufficient(InsufficientDataResult),
}

pub async fn get_time_preferences(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<TimePreferenceResponse, String> {
    let session_count = get_session_count(proxy, user_id).await?;

    if session_count < MIN_SESSION_COUNT {
        return Ok(TimePreferenceResponse::Insufficient(
            InsufficientDataResult {
                insufficient_data: true,
                min_required: MIN_SESSION_COUNT,
                current_count: session_count,
            },
        ));
    }

    let time_pref = calculate_time_pref_from_records(proxy, user_id).await?;
    let preferred_slots = get_recommended_slots(&time_pref);
    let confidence = calculate_confidence(session_count, &time_pref);

    Ok(TimePreferenceResponse::Sufficient(TimePreferenceResult {
        time_pref,
        preferred_slots,
        confidence,
        sample_count: session_count,
    }))
}

pub async fn is_golden_time(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<GoldenTimeResult, String> {
    let current_hour = Utc::now().hour() as i32;

    let preferences = get_time_preferences(proxy, user_id).await?;

    match preferences {
        TimePreferenceResponse::Insufficient(_) => Ok(GoldenTimeResult {
            is_golden: false,
            current_hour,
            matched_slot: None,
        }),
        TimePreferenceResponse::Sufficient(pref) => {
            let matched = pref
                .preferred_slots
                .iter()
                .find(|s| s.hour == current_hour)
                .cloned();
            let is_golden = matched
                .as_ref()
                .map(|s| s.score >= GOLDEN_TIME_THRESHOLD)
                .unwrap_or(false);

            Ok(GoldenTimeResult {
                is_golden,
                current_hour,
                matched_slot: if is_golden { matched } else { None },
            })
        }
    }
}

async fn get_session_count(proxy: &DatabaseProxy, user_id: &str) -> Result<i64, String> {
    let pool = proxy.pool();
    let count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT "sessionId") FROM "answer_records" WHERE "userId" = $1 AND "sessionId" IS NOT NULL"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    Ok(count)
}

async fn calculate_time_pref_from_records(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<f64>, String> {
    let pool = proxy.pool();
    let mut hour_counts = vec![0i64; 24];
    let mut hour_scores = vec![0.0f64; 24];

    let cutoff = Utc::now() - Duration::days(TIME_PREF_WINDOW_DAYS);

    let rows = sqlx::query(
        r#"SELECT "timestamp", "isCorrect", "responseTime" FROM "answer_records" WHERE "userId" = $1 AND "timestamp" >= $2"#,
    )
    .bind(user_id)
    .bind(cutoff.naive_utc())
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for row in rows {
        let Ok(ts): Result<chrono::NaiveDateTime, _> = row.try_get("timestamp") else {
            continue;
        };
        let is_correct: bool = row.try_get("isCorrect").unwrap_or(false);
        let response_time: i64 = row.try_get("responseTime").unwrap_or(0);

        let hour = ts.hour() as usize;
        hour_counts[hour] += 1;
        let correct_score = if is_correct { 1.0 } else { 0.0 };
        let speed_score = (1.0 - (response_time as f64 / 10000.0)).clamp(0.0, 1.0);
        hour_scores[hour] += correct_score * 0.7 + speed_score * 0.3;
    }

    let time_pref: Vec<f64> = hour_scores
        .iter()
        .zip(hour_counts.iter())
        .map(|(&score, &count)| {
            if count == 0 {
                0.0
            } else {
                score / count as f64
            }
        })
        .collect();

    let max_score = time_pref.iter().cloned().fold(0.001f64, f64::max);
    Ok(time_pref.into_iter().map(|s| s / max_score).collect())
}

fn get_recommended_slots(time_pref: &[f64]) -> Vec<TimeSlot> {
    if time_pref.len() != 24 {
        return vec![
            TimeSlot {
                hour: 9,
                score: 0.5,
                confidence: 0.0,
            },
            TimeSlot {
                hour: 14,
                score: 0.4,
                confidence: 0.0,
            },
            TimeSlot {
                hour: 20,
                score: 0.3,
                confidence: 0.0,
            },
        ];
    }

    let mut slots: Vec<TimeSlot> = time_pref
        .iter()
        .enumerate()
        .map(|(hour, &score)| TimeSlot {
            hour: hour as i32,
            score: score.clamp(0.0, 1.0),
            confidence: calculate_slot_confidence(score, time_pref),
        })
        .collect();

    slots.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    slots.truncate(RECOMMENDED_SLOTS_COUNT);
    slots
}

fn calculate_slot_confidence(score: f64, all_scores: &[f64]) -> f64 {
    let avg: f64 = all_scores.iter().sum::<f64>() / all_scores.len() as f64;
    let variance: f64 =
        all_scores.iter().map(|&s| (s - avg).powi(2)).sum::<f64>() / all_scores.len() as f64;
    let std_dev = variance.sqrt();

    if std_dev == 0.0 {
        return 0.5;
    }

    let z_score = (score - avg) / std_dev;
    (0.5 + z_score * 0.2).clamp(0.0, 1.0)
}

fn calculate_confidence(session_count: i64, time_pref: &[f64]) -> f64 {
    let sample_confidence = (session_count as f64 / 100.0).min(1.0);

    let avg: f64 = time_pref.iter().sum::<f64>() / time_pref.len() as f64;
    let variance: f64 =
        time_pref.iter().map(|&s| (s - avg).powi(2)).sum::<f64>() / time_pref.len() as f64;
    let variance_confidence = (variance * 10.0).min(1.0);

    sample_confidence * 0.6 + variance_confidence * 0.4
}

use chrono::Timelike;
