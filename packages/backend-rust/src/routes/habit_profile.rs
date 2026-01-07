use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Json;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EndSessionRequest {
    session_id: String,
    #[serde(default)]
    auth_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EndSessionResponse {
    session_ended: bool,
    duration_minutes: f64,
    word_count: i64,
    habit_profile_saved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    habit_profile_message: Option<String>,
    preferred_time_slots: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistResponse {
    saved: bool,
    profile: Option<RealtimeHabitProfile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InitializeResponse {
    initialized: bool,
    saved: bool,
    profile: Option<RealtimeHabitProfile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HabitProfileResponse {
    stored: Option<StoredHabitProfile>,
    realtime: Option<RealtimeHabitProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredHabitProfile {
    time_pref: Vec<f64>,
    rhythm_pref: RhythmPref,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeHabitProfile {
    time_pref: Vec<f64>,
    preferred_time_slots: Vec<i64>,
    rhythm_pref: RhythmPref,
    samples: HabitSamples,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RhythmPref {
    session_median_minutes: f64,
    batch_median: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HabitSamples {
    time_events: i64,
    sessions: i64,
    batches: i64,
}

pub fn router() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/", get(get_habit_profile))
        .route("/initialize", post(initialize))
        .route("/persist", post(persist))
        .route("/end-session", post(end_session))
}

async fn get_habit_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let stored = select_stored_habit_profile(proxy.as_ref(), &user.id).await?;
    let realtime = compute_realtime_habit_profile(proxy.as_ref(), &user.id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: HabitProfileResponse { stored, realtime },
    }))
}

async fn initialize(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let profile = compute_realtime_habit_profile(proxy.as_ref(), &user.id).await?;
    let saved = persist_habit_profile(proxy.as_ref(), &user.id, profile.as_ref()).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: InitializeResponse {
            initialized: true,
            saved,
            profile,
        },
    }))
}

async fn persist(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let profile = compute_realtime_habit_profile(proxy.as_ref(), &user.id).await?;
    let saved = persist_habit_profile(proxy.as_ref(), &user.id, profile.as_ref()).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: PersistResponse { saved, profile },
    }))
}

async fn end_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EndSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "数据库服务不可用"));
    };

    let token = crate::auth::extract_token(&headers)
        .or_else(|| payload.auth_token.clone());

    let Some(token) = token else {
        return Err(json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"));
    };

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    let session_id = payload.session_id.trim().to_string();
    if session_id.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "sessionId is required",
        ));
    }

    let session = select_learning_session_for_user(proxy.as_ref(), &session_id, &user.id).await?;
    let Some(session) = session else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "Session not found"));
    };

    let now_ms = Utc::now().timestamp_millis();
    let start_ms = session.started_at_ms.unwrap_or(now_ms);
    let duration_minutes = ((now_ms - start_ms) as f64 / 60_000.0).max(0.0);

    set_learning_session_ended_at(proxy.as_ref(), &session_id, &user.id).await?;

    let profile = compute_realtime_habit_profile(proxy.as_ref(), &user.id).await?;
    let saved = persist_habit_profile(proxy.as_ref(), &user.id, profile.as_ref()).await?;

    let (habit_profile_saved, habit_profile_message, preferred_time_slots) = match profile {
        Some(ref profile) => {
            if profile.samples.time_events < 10 {
                (
                    false,
                    Some(format!(
                        "样本不足（当前{}/10），继续学习后将自动保存",
                        profile.samples.time_events
                    )),
                    profile.preferred_time_slots.clone(),
                )
            } else if saved {
                (true, None, profile.preferred_time_slots.clone())
            } else {
                (
                    false,
                    Some("习惯画像保存失败，请稍后重试".to_string()),
                    profile.preferred_time_slots.clone(),
                )
            }
        }
        None => (
            false,
            Some("习惯画像保存失败，请稍后重试".to_string()),
            Vec::new(),
        ),
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: EndSessionResponse {
            session_ended: true,
            duration_minutes: (duration_minutes * 10.0).round() / 10.0,
            word_count: session.answer_record_count,
            habit_profile_saved,
            habit_profile_message,
            preferred_time_slots,
        },
    }))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(std::sync::Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers).ok_or_else(|| {
        json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
    })?;

    let proxy = state
        .db_proxy()
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let user = crate::auth::verify_request_token(&proxy, &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    Ok((proxy, user))
}

fn format_naive_datetime(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_datetime_millis(value: &str) -> Option<i64> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Some(parsed.timestamp_millis());
    }
    if let Ok(parsed) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(parsed, Utc).timestamp_millis());
    }
    None
}

fn normalize_datetime_str(value: &str) -> String {
    if let Some(ms) = parse_datetime_millis(value) {
        if let Some(dt) = DateTime::<Utc>::from_timestamp_millis(ms) {
            return dt.to_rfc3339_opts(SecondsFormat::Millis, true);
        }
    }
    value.to_string()
}

fn median_f64(values: &mut [f64], default: f64) -> f64 {
    if values.is_empty() {
        return default;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = values.len() / 2;
    if values.len() % 2 == 1 {
        values[mid]
    } else {
        (values[mid - 1] + values[mid]) / 2.0
    }
}

fn median_i64(values: &mut [i64], default: i64) -> i64 {
    if values.is_empty() {
        return default;
    }
    values.sort();
    let mid = values.len() / 2;
    if values.len() % 2 == 1 {
        values[mid]
    } else {
        (values[mid - 1] + values[mid]) / 2
    }
}

async fn select_stored_habit_profile(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<StoredHabitProfile>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "timePref","rhythmPref","updatedAt"
        FROM "habit_profiles"
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let Some(row) = row else { return Ok(None) };

    let time_pref_value = row
        .try_get::<Option<serde_json::Value>, _>("timePref")
        .ok()
        .flatten()
        .and_then(parse_time_pref);
    let Some(time_pref) = time_pref_value else {
        return Ok(None);
    };
    let rhythm_pref = row
        .try_get::<Option<serde_json::Value>, _>("rhythmPref")
        .ok()
        .flatten()
        .and_then(parse_rhythm_pref)
        .unwrap_or(RhythmPref { session_median_minutes: 15.0, batch_median: 8.0 });

    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());

    Ok(Some(StoredHabitProfile {
        time_pref,
        rhythm_pref,
        updated_at: format_naive_datetime(updated_at),
    }))
}

fn parse_time_pref(value: serde_json::Value) -> Option<Vec<f64>> {
    let arr = value.as_array()?;
    if arr.len() != 24 {
        return None;
    }
    let mut out = Vec::with_capacity(24);
    for v in arr {
        out.push(v.as_f64()?);
    }
    Some(out)
}

fn parse_rhythm_pref(value: serde_json::Value) -> Option<RhythmPref> {
    let obj = value.as_object()?;
    let session_median_minutes = obj.get("sessionMedianMinutes").and_then(|v| v.as_f64()).unwrap_or(15.0);
    let batch_median = obj.get("batchMedian").and_then(|v| v.as_f64()).unwrap_or(8.0);
    Some(RhythmPref { session_median_minutes, batch_median })
}

fn compute_preferred_slots(time_pref: &[f64]) -> Vec<i64> {
    let mut indexed: Vec<(usize, f64)> = time_pref.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    indexed.into_iter().take(3).map(|(hour, _)| hour as i64).collect()
}

async fn compute_realtime_habit_profile(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<RealtimeHabitProfile>, AppError> {
    let sessions = select_recent_sessions(proxy, user_id).await?;
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
        time_counts
            .iter()
            .map(|v| (*v as f64) / (time_events as f64))
            .collect()
    } else {
        vec![0.0; 24]
    };

    let preferred_time_slots = compute_preferred_slots(&time_pref);
    let mut durations_copy = durations.clone();
    let mut batch_copy = batch_sizes.clone();
    let session_median_minutes = median_f64(&mut durations_copy, 15.0);
    let batch_median = median_i64(&mut batch_copy, 8) as f64;

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

#[derive(Debug)]
struct SessionSummary {
    started_hour: Option<u32>,
    started_at_ms: Option<i64>,
    duration_minutes: Option<f64>,
    answer_record_count: i64,
}

async fn select_recent_sessions(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Vec<SessionSummary>, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT ls."startedAt", ls."endedAt",
               (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id") as "answerRecordCount"
        FROM "learning_sessions" ls
        WHERE ls."userId" = $1
        ORDER BY ls."startedAt" DESC
        LIMIT 200
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let started_at: NaiveDateTime = row.try_get("startedAt").unwrap_or_else(|_| Utc::now().naive_utc());
        let ended_at: Option<NaiveDateTime> = row.try_get("endedAt").ok().flatten();
        let started_dt = DateTime::<Utc>::from_naive_utc_and_offset(started_at, Utc);
        let started_hour = Some(started_dt.hour());
        let started_at_ms = Some(started_dt.timestamp_millis());

        let duration_minutes = ended_at.map(|end| {
            let end_dt = DateTime::<Utc>::from_naive_utc_and_offset(end, Utc);
            ((end_dt.timestamp_millis() - started_dt.timestamp_millis()) as f64 / 60_000.0).max(0.0)
        });

        out.push(SessionSummary {
            started_hour,
            started_at_ms,
            duration_minutes,
            answer_record_count: row.try_get::<i64, _>("answerRecordCount").unwrap_or(0),
        });
    }
    Ok(out)
}

async fn persist_habit_profile(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    profile: Option<&RealtimeHabitProfile>,
) -> Result<bool, AppError> {
    let Some(profile) = profile else { return Ok(false) };
    if profile.samples.time_events < 10 {
        return Ok(false);
    }

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "habit_profiles" ("userId","timePref","rhythmPref","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT ("userId") DO UPDATE SET
          "timePref" = EXCLUDED."timePref",
          "rhythmPref" = EXCLUDED."rhythmPref",
          "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(user_id)
    .bind(serde_json::to_value(&profile.time_pref).unwrap_or_default())
    .bind(serde_json::json!({
        "sessionMedianMinutes": profile.rhythm_pref.session_median_minutes,
        "batchMedian": profile.rhythm_pref.batch_median,
    }))
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "数据库写入失败"))?;

    Ok(true)
}

#[derive(Debug)]
struct OwnedSessionRow {
    started_at_ms: Option<i64>,
    answer_record_count: i64,
}

async fn select_learning_session_for_user(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<Option<OwnedSessionRow>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT ls."startedAt",
               (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id") as "answerRecordCount"
        FROM "learning_sessions" ls
        WHERE ls."id" = $1 AND ls."userId" = $2
        LIMIT 1
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    let Some(row) = row else { return Ok(None) };
    let started_at: NaiveDateTime = row.try_get("startedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let started_at_ms = Some(DateTime::<Utc>::from_naive_utc_and_offset(started_at, Utc).timestamp_millis());
    Ok(Some(OwnedSessionRow { started_at_ms, answer_record_count: row.try_get::<i64, _>("answerRecordCount").unwrap_or(0) }))
}

async fn set_learning_session_ended_at(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<(), AppError> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    let affected = sqlx::query(r#"UPDATE "learning_sessions" SET "endedAt" = $1, "updatedAt" = $2 WHERE "id" = $3 AND "userId" = $4"#)
        .bind(now)
        .bind(now)
        .bind(session_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?
        .rows_affected();
    if affected == 0 {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "Session not found"));
    }
    Ok(())
}
