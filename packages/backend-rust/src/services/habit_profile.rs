use chrono::{DateTime, NaiveDateTime, SecondsFormat, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredHabitProfile {
    pub time_pref: Vec<f64>,
    pub rhythm_pref: RhythmPref,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeHabitProfile {
    pub time_pref: Vec<f64>,
    pub preferred_time_slots: Vec<i64>,
    pub rhythm_pref: RhythmPref,
    pub samples: HabitSamples,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RhythmPref {
    pub session_median_minutes: f64,
    pub batch_median: f64,
}

impl Default for RhythmPref {
    fn default() -> Self {
        Self { session_median_minutes: 15.0, batch_median: 8.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitSamples {
    pub time_events: i64,
    pub sessions: i64,
    pub batches: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitProfileResponse {
    pub stored: Option<StoredHabitProfile>,
    pub realtime: Option<RealtimeHabitProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndSessionResult {
    pub session_ended: bool,
    pub duration_minutes: f64,
    pub word_count: i64,
    pub habit_profile_saved: bool,
    pub habit_profile_message: Option<String>,
    pub preferred_time_slots: Vec<i64>,
}

#[derive(Debug)]
pub struct SessionSummary {
    pub started_hour: Option<u32>,
    pub started_at_ms: Option<i64>,
    pub duration_minutes: Option<f64>,
    pub answer_record_count: i64,
}

pub async fn get_stored_habit_profile(
    pool: &PgPool,
    user_id: &str,
) -> Result<Option<StoredHabitProfile>, String> {
    let row = sqlx::query(
        r#"SELECT "timePref","rhythmPref","updatedAt" FROM "habit_profiles" WHERE "userId" = $1 LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };

    let time_pref = row.try_get::<Option<serde_json::Value>, _>("timePref")
        .ok().flatten().and_then(parse_time_pref);
    let Some(time_pref) = time_pref else { return Ok(None) };

    let rhythm_pref = row.try_get::<Option<serde_json::Value>, _>("rhythmPref")
        .ok().flatten().and_then(parse_rhythm_pref).unwrap_or_default();

    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());

    Ok(Some(StoredHabitProfile {
        time_pref,
        rhythm_pref,
        updated_at: format_naive_datetime(updated_at),
    }))
}

pub async fn compute_realtime_habit_profile(
    pool: &PgPool,
    user_id: &str,
) -> Result<Option<RealtimeHabitProfile>, String> {
    let sessions = select_recent_sessions(pool, user_id).await?;
    if sessions.is_empty() {
        return Ok(None);
    }

    let mut time_counts = [0_i64; 24];
    let mut time_events = 0_i64;
    let mut durations: Vec<f64> = Vec::new();
    let mut batch_sizes: Vec<i64> = Vec::new();

    for session in sessions {
        if let Some(hour) = session.started_hour {
            time_counts[hour as usize] += 1;
            time_events += 1;
        }
        if let Some(minutes) = session.duration_minutes {
            if minutes > 0.0 && minutes < 180.0 {
                durations.push(minutes);
            }
        }
        if session.answer_record_count > 0 {
            batch_sizes.push(session.answer_record_count);
        }
    }

    let time_pref: Vec<f64> = if time_events > 0 {
        time_counts.iter().map(|v| (*v as f64) / (time_events as f64)).collect()
    } else {
        vec![0.0; 24]
    };

    let preferred_time_slots = compute_preferred_slots(&time_pref);
    let session_median_minutes = median_f64(&mut durations.clone(), 15.0);
    let batch_median = median_i64(&mut batch_sizes.clone(), 8) as f64;

    Ok(Some(RealtimeHabitProfile {
        time_pref,
        preferred_time_slots,
        rhythm_pref: RhythmPref { session_median_minutes, batch_median },
        samples: HabitSamples {
            time_events,
            sessions: durations.len() as i64,
            batches: batch_sizes.len() as i64,
        },
    }))
}

pub async fn get_habit_profile(
    pool: &PgPool,
    user_id: &str,
) -> Result<HabitProfileResponse, String> {
    let stored = get_stored_habit_profile(pool, user_id).await?;
    let realtime = compute_realtime_habit_profile(pool, user_id).await?;
    Ok(HabitProfileResponse { stored, realtime })
}

async fn select_recent_sessions(pool: &PgPool, user_id: &str) -> Result<Vec<SessionSummary>, String> {
    let rows = sqlx::query(
        r#"SELECT ls."startedAt", ls."endedAt",
           (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id") as "answerRecordCount"
           FROM "learning_sessions" ls WHERE ls."userId" = $1 ORDER BY ls."startedAt" DESC LIMIT 200"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows.iter().map(|row| {
        let started_at: NaiveDateTime = row.try_get("startedAt").unwrap_or_else(|_| Utc::now().naive_utc());
        let ended_at: Option<NaiveDateTime> = row.try_get("endedAt").ok().flatten();
        let started_dt = DateTime::<Utc>::from_naive_utc_and_offset(started_at, Utc);

        SessionSummary {
            started_hour: Some(started_dt.hour()),
            started_at_ms: Some(started_dt.timestamp_millis()),
            duration_minutes: ended_at.map(|end| {
                let end_dt = DateTime::<Utc>::from_naive_utc_and_offset(end, Utc);
                ((end_dt.timestamp_millis() - started_dt.timestamp_millis()) as f64 / 60_000.0).max(0.0)
            }),
            answer_record_count: row.try_get::<i64, _>("answerRecordCount").unwrap_or(0),
        }
    }).collect())
}

pub async fn get_session_for_user(
    pool: &PgPool,
    session_id: &str,
    user_id: &str,
) -> Result<Option<SessionSummary>, String> {
    let row = sqlx::query(
        r#"SELECT ls."startedAt",
           (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id") as "answerRecordCount"
           FROM "learning_sessions" ls WHERE ls."id" = $1 AND ls."userId" = $2 LIMIT 1"#,
    )
    .bind(session_id).bind(user_id)
    .fetch_optional(pool).await.map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    let started_at: NaiveDateTime = row.try_get("startedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let started_dt = DateTime::<Utc>::from_naive_utc_and_offset(started_at, Utc);
    Ok(Some(SessionSummary {
        started_hour: Some(started_dt.hour()),
        started_at_ms: Some(started_dt.timestamp_millis()),
        duration_minutes: None,
        answer_record_count: row.try_get::<i64, _>("answerRecordCount").unwrap_or(0),
    }))
}

pub async fn persist_habit_profile(
    proxy: &DatabaseProxy,
    user_id: &str,
    profile: Option<&RealtimeHabitProfile>,
) -> Result<bool, String> {
    let Some(profile) = profile else { return Ok(false) };
    if profile.samples.time_events < 10 {
        return Ok(false);
    }

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"INSERT INTO "habit_profiles" ("userId","timePref","rhythmPref","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT ("userId") DO UPDATE SET
           "timePref" = EXCLUDED."timePref", "rhythmPref" = EXCLUDED."rhythmPref", "updatedAt" = EXCLUDED."updatedAt""#,
    )
    .bind(user_id)
    .bind(serde_json::to_value(&profile.time_pref).unwrap_or_default())
    .bind(serde_json::json!({
        "sessionMedianMinutes": profile.rhythm_pref.session_median_minutes,
        "batchMedian": profile.rhythm_pref.batch_median,
    }))
    .bind(now).bind(now)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(true)
}

pub async fn set_session_ended_at(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<(), String> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();

    let affected = sqlx::query(
        r#"UPDATE "learning_sessions" SET "endedAt" = $1, "updatedAt" = $2 WHERE "id" = $3 AND "userId" = $4"#
    )
    .bind(now).bind(now).bind(session_id).bind(user_id)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?
    .rows_affected();

    if affected == 0 {
        return Err("会话不存在".to_string());
    }
    Ok(())
}

pub async fn end_session(
    proxy: &DatabaseProxy,
    pool: &PgPool,
    session_id: &str,
    user_id: &str,
) -> Result<EndSessionResult, String> {
    let session = get_session_for_user(pool, session_id, user_id).await?
        .ok_or("会话不存在")?;

    let now_ms = Utc::now().timestamp_millis();
    let start_ms = session.started_at_ms.unwrap_or(now_ms);
    let duration_minutes = ((now_ms - start_ms) as f64 / 60_000.0).max(0.0);

    set_session_ended_at(proxy, session_id, user_id).await?;

    let profile = compute_realtime_habit_profile(pool, user_id).await?;
    let saved = persist_habit_profile(proxy, user_id, profile.as_ref()).await?;

    let (habit_profile_saved, habit_profile_message, preferred_time_slots) = match profile {
        Some(ref p) => {
            if p.samples.time_events < 10 {
                (false, Some(format!("样本不足（当前{}/10），继续学习后将自动保存", p.samples.time_events)), p.preferred_time_slots.clone())
            } else if saved {
                (true, None, p.preferred_time_slots.clone())
            } else {
                (false, Some("习惯画像保存失败，请稍后重试".to_string()), p.preferred_time_slots.clone())
            }
        }
        None => (false, Some("习惯画像保存失败，请稍后重试".to_string()), Vec::new()),
    };

    Ok(EndSessionResult {
        session_ended: true,
        duration_minutes: (duration_minutes * 10.0).round() / 10.0,
        word_count: session.answer_record_count,
        habit_profile_saved,
        habit_profile_message,
        preferred_time_slots,
    })
}

fn format_naive_datetime(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_time_pref(value: serde_json::Value) -> Option<Vec<f64>> {
    let arr = value.as_array()?;
    if arr.len() != 24 { return None; }
    arr.iter().map(|v| v.as_f64()).collect()
}

fn parse_rhythm_pref(value: serde_json::Value) -> Option<RhythmPref> {
    let obj = value.as_object()?;
    Some(RhythmPref {
        session_median_minutes: obj.get("sessionMedianMinutes").and_then(|v| v.as_f64()).unwrap_or(15.0),
        batch_median: obj.get("batchMedian").and_then(|v| v.as_f64()).unwrap_or(8.0),
    })
}

fn compute_preferred_slots(time_pref: &[f64]) -> Vec<i64> {
    let mut indexed: Vec<(usize, f64)> = time_pref.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    indexed.into_iter().take(3).map(|(hour, _)| hour as i64).collect()
}

fn median_f64(values: &mut [f64], default: f64) -> f64 {
    if values.is_empty() { return default; }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = values.len() / 2;
    if values.len() % 2 == 1 { values[mid] } else { (values[mid - 1] + values[mid]) / 2.0 }
}

fn median_i64(values: &mut [i64], default: i64) -> i64 {
    if values.is_empty() { return default; }
    values.sort();
    let mid = values.len() / 2;
    if values.len() % 2 == 1 { values[mid] } else { (values[mid - 1] + values[mid]) / 2 }
}
