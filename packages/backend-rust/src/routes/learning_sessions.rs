use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::Json;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct SuccessResponseWithPagination<T, P> {
    success: bool,
    data: T,
    pagination: P,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionRequest {
    session_type: Option<String>,
    target_mastery_count: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionResponse {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgressRequest {
    total_questions: Option<i64>,
    actual_mastery_count: Option<i64>,
    flow_peak_score: Option<f64>,
    avg_cognitive_load: Option<f64>,
    context_shifts: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowRequest {
    challenge_level: f64,
    skill_level: f64,
    concentration: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmotionRequest {
    r#type: String,
    is_correct: Option<bool>,
    response_time: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListSessionsQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    include_active: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LimitOffsetPagination {
    limit: i64,
    offset: i64,
    total: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionStats {
    id: String,
    user_id: String,
    started_at: String,
    ended_at: Option<String>,
    duration: i64,
    total_questions: i64,
    actual_mastery_count: i64,
    target_mastery_count: Option<i64>,
    session_type: String,
    flow_peak_score: Option<f64>,
    avg_cognitive_load: Option<f64>,
    context_shifts: i64,
    answer_record_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionDetail {
    #[serde(flatten)]
    stats: SessionStats,
    answer_records: Vec<SessionAnswerRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionAnswerRecord {
    id: String,
    word_id: String,
    is_correct: bool,
    response_time: Option<i64>,
    dwell_time: Option<i64>,
    timestamp: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartedResponse {
    session_id: String,
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdatedResponse {
    session_id: String,
    updated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackedResponse {
    session_id: String,
    tracked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FlowResponse {
    session_id: String,
    flow_score: f64,
}

pub fn router() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/", get(list_sessions).post(create_session))
        .route("/user/active", get(get_active_session))
        .route("/:sessionId/start", post(start_session))
        .route("/:sessionId/end", post(end_session))
        .route("/:sessionId/progress", put(update_progress))
        .route("/:sessionId/flow", post(detect_flow))
        .route("/:sessionId/emotion", post(track_emotion))
        .route("/:sessionId/detail", get(get_session_detail))
        .route("/:sessionId", get(get_session_stats))
}

async fn list_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListSessionsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = query.offset.unwrap_or(0).max(0);
    let include_active = query.include_active.unwrap_or(false);

    let total = count_user_sessions(proxy.as_ref(), &user.id, include_active).await?;
    let sessions =
        select_user_sessions(proxy.as_ref(), &user.id, limit, offset, include_active).await?;

    Ok(Json(SuccessResponseWithPagination {
        success: true,
        data: sessions,
        pagination: LimitOffsetPagination {
            limit,
            offset,
            total,
        },
    }))
}

async fn create_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let session_type = payload
        .session_type
        .as_deref()
        .unwrap_or("NORMAL")
        .trim()
        .to_string();

    if !matches!(
        session_type.as_str(),
        "NORMAL" | "SPACED_REPETITION" | "INTENSIVE" | "QUIZ"
    ) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_SESSION_TYPE",
            "无效的会话类型",
        ));
    }

    if let Some(value) = payload.target_mastery_count {
        if value <= 0 {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_TARGET_COUNT",
                "targetMasteryCount 必须是正整数",
            ));
        }
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    insert_learning_session(
        proxy.as_ref(),
        &session_id,
        &user.id,
        &session_type,
        payload.target_mastery_count,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: CreateSessionResponse { session_id },
        }),
    ))
}

async fn start_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let session = verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;

    if session.ended_at.is_some() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("会话已结束: {session_id}"),
        ));
    }

    let payload = serde_json::json!({
        "sessionId": session_id,
        "userId": user.id,
        "sessionType": session.session_type,
    });
    crate::routes::realtime::send_event(user.id, Some(session_id.clone()), "flow-update", payload);

    Ok(Json(SuccessResponse {
        success: true,
        data: StartedResponse {
            session_id,
            status: "started",
        },
    }))
}

async fn end_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;
    set_session_ended_at(proxy.as_ref(), &session_id).await?;
    let stats = get_session_stats_internal(proxy.as_ref(), &session_id).await?;

    let payload = serde_json::json!({
        "sessionId": session_id,
        "userId": user.id,
        "duration": stats.duration,
        "totalQuestions": stats.total_questions,
        "actualMasteryCount": stats.actual_mastery_count,
    });
    crate::routes::realtime::send_event(user.id, Some(session_id), "flow-update", payload);

    Ok(Json(SuccessResponse {
        success: true,
        data: stats,
    }))
}

async fn update_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(payload): Json<UpdateProgressRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;

    if let Some(value) = payload.total_questions {
        if value < 0 {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "totalQuestions 必须是非负整数",
            ));
        }
    }

    if let Some(value) = payload.actual_mastery_count {
        if value < 0 {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "actualMasteryCount 必须是非负整数",
            ));
        }
    }

    if let Some(value) = payload.flow_peak_score {
        if !(0.0..=1.0).contains(&value) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_FLOW_SCORE",
                "flowPeakScore 必须是 0-1 之间的数字",
            ));
        }
    }

    if let Some(value) = payload.avg_cognitive_load {
        if !(0.0..=1.0).contains(&value) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_COGNITIVE_LOAD",
                "avgCognitiveLoad 必须是 0-1 之间的数字",
            ));
        }
    }

    if let Some(value) = payload.context_shifts {
        if value < 0 {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "contextShifts 必须是非负整数",
            ));
        }
    }

    update_session_progress(proxy.as_ref(), &session_id, payload).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: UpdatedResponse {
            session_id,
            updated: true,
        },
    }))
}

async fn get_session_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let session = verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: row_to_stats(&session),
    }))
}

async fn get_session_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let session = verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;
    let answer_records = select_session_answer_records(proxy.as_ref(), &session_id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: SessionDetail {
            stats: row_to_stats(&session),
            answer_records,
        },
    }))
}

async fn get_active_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let session_id = select_active_session_id(proxy.as_ref(), &user.id).await?;
    let data = match session_id {
        Some(id) => Some(get_session_stats_internal(proxy.as_ref(), &id).await?),
        None => None,
    };

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn detect_flow(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(payload): Json<FlowRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;

    validate_unit_interval(payload.challenge_level, "challengeLevel")?;
    validate_unit_interval(payload.skill_level, "skillLevel")?;
    validate_unit_interval(payload.concentration, "concentration")?;

    let flow_score = compute_flow_score(
        payload.challenge_level,
        payload.skill_level,
        payload.concentration,
    );

    update_flow_peak_score_if_higher(proxy.as_ref(), &session_id, flow_score).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: FlowResponse {
            session_id,
            flow_score,
        },
    }))
}

async fn track_emotion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(payload): Json<EmotionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    verify_session_ownership(proxy.as_ref(), &session_id, &user.id).await?;

    if !matches!(
        payload.r#type.as_str(),
        "answer" | "pause" | "resume" | "end"
    ) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_EVENT_TYPE",
            "无效的事件类型",
        ));
    }

    update_cognitive_load_from_emotion(proxy.as_ref(), &session_id, &payload).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: TrackedResponse {
            session_id,
            tracked: true,
        },
    }))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<
    (
        std::sync::Arc<crate::db::DatabaseProxy>,
        crate::auth::AuthUser,
    ),
    AppError,
> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    Ok((proxy, user))
}

async fn verify_session_ownership(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<LearningSessionRow, AppError> {
    let session = select_learning_session(proxy, session_id).await?;
    match session {
        Some(s) if s.user_id == user_id => Ok(s),
        Some(_) => Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "无权访问此会话",
        )),
        None => Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        )),
    }
}

fn validate_unit_interval(value: f64, field: &'static str) -> Result<(), AppError> {
    if !(0.0..=1.0).contains(&value) || value.is_nan() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("{field} 必须是 0-1 之间的数字"),
        ));
    }
    Ok(())
}

fn compute_flow_score(challenge_level: f64, skill_level: f64, concentration: f64) -> f64 {
    let balance = 1.0 - (challenge_level - skill_level).abs().min(1.0);
    (concentration * balance).clamp(0.0, 1.0)
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

#[derive(Debug, Clone)]
struct LearningSessionRow {
    id: String,
    user_id: String,
    started_at: String,
    ended_at: Option<String>,
    total_questions: i64,
    actual_mastery_count: i64,
    target_mastery_count: Option<i64>,
    session_type: String,
    flow_peak_score: Option<f64>,
    avg_cognitive_load: Option<f64>,
    context_shifts: i64,
    answer_record_count: i64,
}

async fn select_session_answer_records(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
) -> Result<Vec<SessionAnswerRecord>, AppError> {
    let pool = proxy.pool();

    let rows = sqlx::query(
        r#"
        SELECT "id","wordId","isCorrect","responseTime","dwellTime","timestamp"
        FROM "answer_records"
        WHERE "sessionId" = $1
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let timestamp: NaiveDateTime = row
            .try_get("timestamp")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        out.push(SessionAnswerRecord {
            id: row.try_get("id").unwrap_or_default(),
            word_id: row.try_get("wordId").unwrap_or_default(),
            is_correct: row.try_get::<bool, _>("isCorrect").unwrap_or(false),
            response_time: row.try_get::<Option<i64>, _>("responseTime").ok().flatten(),
            dwell_time: row.try_get::<Option<i64>, _>("dwellTime").ok().flatten(),
            timestamp: format_naive_datetime(timestamp),
        });
    }
    Ok(out)
}

async fn get_session_stats_internal(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
) -> Result<SessionStats, AppError> {
    let Some(session) = select_learning_session(proxy, session_id).await? else {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    };
    Ok(row_to_stats(&session))
}

fn row_to_stats(row: &LearningSessionRow) -> SessionStats {
    let started_at_norm = normalize_datetime_str(&row.started_at);
    let ended_at_norm = row.ended_at.as_deref().map(normalize_datetime_str);

    let now_ms = Utc::now().timestamp_millis();
    let started_ms = parse_datetime_millis(&started_at_norm).unwrap_or(now_ms);
    let ended_ms = ended_at_norm
        .as_deref()
        .and_then(parse_datetime_millis)
        .unwrap_or(now_ms);
    let duration = ((ended_ms - started_ms) / 1000).max(0);

    SessionStats {
        id: row.id.clone(),
        user_id: row.user_id.clone(),
        started_at: started_at_norm,
        ended_at: ended_at_norm,
        duration,
        total_questions: row.total_questions,
        actual_mastery_count: row.actual_mastery_count,
        target_mastery_count: row.target_mastery_count,
        session_type: row.session_type.clone(),
        flow_peak_score: row.flow_peak_score,
        avg_cognitive_load: row.avg_cognitive_load,
        context_shifts: row.context_shifts,
        answer_record_count: row.answer_record_count,
    }
}

async fn insert_learning_session(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    user_id: &str,
    session_type: &str,
    target_mastery_count: Option<i64>,
) -> Result<(), AppError> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"
        INSERT INTO "learning_sessions"
          ("id","userId","startedAt","totalQuestions","actualMasteryCount","targetMasteryCount","sessionType","contextShifts","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7::"SessionType",$8,$9,$10)
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .bind(now)
    .bind(0_i32)
    .bind(0_i32)
    .bind(target_mastery_count.map(|v| v as i32))
    .bind(session_type)
    .bind(0_i32)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    Ok(())
}

async fn set_session_ended_at(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
) -> Result<(), AppError> {
    let exists = select_learning_session(proxy, session_id).await?;
    if exists.is_none() {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    }

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    let affected = sqlx::query(
        r#"
        UPDATE "learning_sessions"
        SET "endedAt" = COALESCE("endedAt", $1),
            "updatedAt" = $2
        WHERE "id" = $3
        "#,
    )
    .bind(now)
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?
    .rows_affected();
    if affected == 0 {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    }
    Ok(())
}

async fn update_session_progress(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    payload: UpdateProgressRequest,
) -> Result<(), AppError> {
    let exists = select_learning_session(proxy, session_id).await?;
    if exists.is_none() {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    }

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(r#"UPDATE "learning_sessions" SET "#);
    let mut separated = qb.separated(", ");

    if let Some(value) = payload.total_questions {
        separated.push(r#""totalQuestions" = GREATEST(COALESCE("totalQuestions", 0), "#);
        separated.push_bind(value as i32);
        separated.push(")");
    }
    if let Some(value) = payload.actual_mastery_count {
        separated.push(r#""actualMasteryCount" = GREATEST(COALESCE("actualMasteryCount", 0), "#);
        separated.push_bind(value as i32);
        separated.push(")");
    }
    if let Some(value) = payload.flow_peak_score {
        separated.push(r#""flowPeakScore" = GREATEST(COALESCE("flowPeakScore", 0), "#);
        separated.push_bind(value);
        separated.push(")");
    }
    if let Some(value) = payload.avg_cognitive_load {
        separated.push(r#""avgCognitiveLoad" = "#).push_bind(value);
    }
    if let Some(value) = payload.context_shifts {
        separated.push(r#""contextShifts" = GREATEST(COALESCE("contextShifts", 0), "#);
        separated.push_bind(value as i32);
        separated.push(")");
    }

    separated.push(r#""updatedAt" = "#).push_bind(now);

    qb.push(r#" WHERE "id" = "#).push_bind(session_id);
    let affected = qb
        .build()
        .execute(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?
        .rows_affected();

    if affected == 0 {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    }

    Ok(())
}

async fn update_flow_peak_score_if_higher(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    score: f64,
) -> Result<(), AppError> {
    let session = select_learning_session(proxy, session_id).await?;
    let Some(session) = session else {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    };

    if session.flow_peak_score.is_some_and(|v| score <= v) {
        return Ok(());
    }

    update_session_progress(
        proxy,
        session_id,
        UpdateProgressRequest {
            total_questions: None,
            actual_mastery_count: None,
            flow_peak_score: Some(score),
            avg_cognitive_load: None,
            context_shifts: None,
        },
    )
    .await
}

async fn update_cognitive_load_from_emotion(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
    payload: &EmotionRequest,
) -> Result<(), AppError> {
    let session = select_learning_session(proxy, session_id).await?;
    let Some(session) = session else {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("会话不存在: {session_id}"),
        ));
    };

    let sample = match payload.r#type.as_str() {
        "answer" => {
            let correctness = payload
                .is_correct
                .map(|v| if v { 0.0 } else { 1.0 })
                .unwrap_or(0.3);
            let rt = payload
                .response_time
                .map(|v| (v as f64 / 10_000.0).clamp(0.0, 1.0))
                .unwrap_or(0.3);
            (0.6 * correctness + 0.4 * rt).clamp(0.0, 1.0)
        }
        "pause" => 0.8,
        "resume" => 0.4,
        "end" => 0.5,
        _ => 0.5,
    };

    let next = match session.avg_cognitive_load {
        Some(prev) => (prev * 0.8 + sample * 0.2).clamp(0.0, 1.0),
        None => sample,
    };

    update_session_progress(
        proxy,
        session_id,
        UpdateProgressRequest {
            total_questions: None,
            actual_mastery_count: None,
            flow_peak_score: None,
            avg_cognitive_load: Some(next),
            context_shifts: None,
        },
    )
    .await
}

async fn count_user_sessions(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    include_active: bool,
) -> Result<i64, AppError> {
    let pool = proxy.pool();

    let sql = if include_active {
        r#"SELECT COUNT(*) FROM "learning_sessions" WHERE "userId" = $1"#
    } else {
        r#"SELECT COUNT(*) FROM "learning_sessions" WHERE "userId" = $1 AND "endedAt" IS NOT NULL"#
    };

    let count: i64 = sqlx::query_scalar(sql)
        .bind(user_id)
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(count)
}

async fn select_user_sessions(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    limit: i64,
    offset: i64,
    include_active: bool,
) -> Result<Vec<SessionStats>, AppError> {
    let pool = proxy.pool();

    let base = if include_active {
        r#"SELECT "id","userId","startedAt","endedAt","totalQuestions","actualMasteryCount","targetMasteryCount","sessionType","flowPeakScore","avgCognitiveLoad","contextShifts"
           FROM "learning_sessions" WHERE "userId" = $1 ORDER BY "startedAt" DESC LIMIT $2 OFFSET $3"#
    } else {
        r#"SELECT "id","userId","startedAt","endedAt","totalQuestions","actualMasteryCount","targetMasteryCount","sessionType","flowPeakScore","avgCognitiveLoad","contextShifts"
           FROM "learning_sessions" WHERE "userId" = $1 AND "endedAt" IS NOT NULL ORDER BY "startedAt" DESC LIMIT $2 OFFSET $3"#
    };

    let rows = sqlx::query(base)
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut sessions = Vec::with_capacity(rows.len());
    for row in rows {
        let session_id: String = row.try_get("id").unwrap_or_default();
        let answer_record_count = count_answer_records(pool, &session_id).await?;
        let session_row = LearningSessionRow {
            id: session_id,
            user_id: row.try_get("userId").unwrap_or_default(),
            started_at: format_naive_datetime(
                row.try_get("startedAt")
                    .unwrap_or_else(|_| Utc::now().naive_utc()),
            ),
            ended_at: row
                .try_get::<Option<NaiveDateTime>, _>("endedAt")
                .ok()
                .flatten()
                .map(format_naive_datetime),
            total_questions: row
                .try_get::<Option<i64>, _>("totalQuestions")
                .ok()
                .flatten()
                .unwrap_or(0),
            actual_mastery_count: row
                .try_get::<Option<i64>, _>("actualMasteryCount")
                .ok()
                .flatten()
                .unwrap_or(0),
            target_mastery_count: row
                .try_get::<Option<i64>, _>("targetMasteryCount")
                .ok()
                .flatten(),
            session_type: row
                .try_get("sessionType")
                .unwrap_or_else(|_| "NORMAL".to_string()),
            flow_peak_score: row
                .try_get::<Option<f64>, _>("flowPeakScore")
                .ok()
                .flatten(),
            avg_cognitive_load: row
                .try_get::<Option<f64>, _>("avgCognitiveLoad")
                .ok()
                .flatten(),
            context_shifts: row
                .try_get::<Option<i64>, _>("contextShifts")
                .ok()
                .flatten()
                .unwrap_or(0),
            answer_record_count,
        };
        sessions.push(row_to_stats(&session_row));
    }
    Ok(sessions)
}

async fn select_active_session_id(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<String>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query_scalar::<_, String>(
        r#"SELECT "id" FROM "learning_sessions" WHERE "userId" = $1 AND "endedAt" IS NULL ORDER BY "startedAt" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(row)
}

async fn select_learning_session(
    proxy: &crate::db::DatabaseProxy,
    session_id: &str,
) -> Result<Option<LearningSessionRow>, AppError> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT "id","userId","startedAt","endedAt","totalQuestions","actualMasteryCount","targetMasteryCount","sessionType","flowPeakScore","avgCognitiveLoad","contextShifts"
        FROM "learning_sessions"
        WHERE "id" = $1
        LIMIT 1
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let Some(row) = row else { return Ok(None) };

    let answer_record_count = count_answer_records(pool, session_id).await?;

    Ok(Some(LearningSessionRow {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        started_at: format_naive_datetime(
            row.try_get("startedAt")
                .unwrap_or_else(|_| Utc::now().naive_utc()),
        ),
        ended_at: row
            .try_get::<Option<NaiveDateTime>, _>("endedAt")
            .ok()
            .flatten()
            .map(format_naive_datetime),
        total_questions: row
            .try_get::<Option<i64>, _>("totalQuestions")
            .ok()
            .flatten()
            .unwrap_or(0),
        actual_mastery_count: row
            .try_get::<Option<i64>, _>("actualMasteryCount")
            .ok()
            .flatten()
            .unwrap_or(0),
        target_mastery_count: row
            .try_get::<Option<i64>, _>("targetMasteryCount")
            .ok()
            .flatten(),
        session_type: row
            .try_get("sessionType")
            .unwrap_or_else(|_| "NORMAL".to_string()),
        flow_peak_score: row
            .try_get::<Option<f64>, _>("flowPeakScore")
            .ok()
            .flatten(),
        avg_cognitive_load: row
            .try_get::<Option<f64>, _>("avgCognitiveLoad")
            .ok()
            .flatten(),
        context_shifts: row
            .try_get::<Option<i64>, _>("contextShifts")
            .ok()
            .flatten()
            .unwrap_or(0),
        answer_record_count,
    }))
}

async fn count_answer_records(pool: &PgPool, session_id: &str) -> Result<i64, AppError> {
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "sessionId" = $1"#)
        .bind(session_id)
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))
}
