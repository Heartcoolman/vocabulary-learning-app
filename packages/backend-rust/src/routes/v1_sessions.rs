use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::response::{json_error, AppError};
use crate::services::{mastery_learning, record};
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
pub(super) struct CreateSessionRequest {
    target_mastery_count: i64,
    session_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionResponse {
    session_id: String,
    target_mastery_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SyncProgressRequest {
    actual_mastery_count: i64,
    total_questions: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ListSessionsQuery {
    active: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PagePagination {
    page: i64,
    page_size: i64,
    total: i64,
    total_pages: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RecordsQuery {
    page: Option<i64>,
    page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
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

pub(super) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    if payload.target_mastery_count <= 0 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_TARGET_COUNT",
            "targetMasteryCount 必须是正整数",
        ));
    }
    if payload.target_mastery_count > 100 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "TARGET_COUNT_TOO_LARGE",
            "targetMasteryCount 不能超过 100",
        ));
    }

    let session_id = mastery_learning::ensure_learning_session(
        proxy.as_ref(),
        &user.id,
        payload.target_mastery_count,
        payload.session_id,
    )
    .await
    .map_err(|err| match err {
        mastery_learning::SessionError::Forbidden => {
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未授权")
        }
        mastery_learning::SessionError::NotFound => {
            json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "学习会话不存在")
        }
        mastery_learning::SessionError::Sql(_) | mastery_learning::SessionError::Mutation(_) => {
            json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败")
        }
    })?;

    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: CreateSessionResponse {
                session_id,
                target_mastery_count: payload.target_mastery_count,
            },
        }),
    ))
}

pub(super) async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    if session_id.trim().is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "MISSING_SESSION_ID",
            "sessionId 参数必填",
        ));
    }

    let progress = mastery_learning::get_session_progress(proxy.as_ref(), &session_id, &user.id)
        .await
        .map_err(|err| match err {
            mastery_learning::SessionError::NotFound => {
                json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "学习会话不存在")
            }
            mastery_learning::SessionError::Forbidden => {
                json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未授权")
            }
            mastery_learning::SessionError::Sql(_)
            | mastery_learning::SessionError::Mutation(_) => {
                json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")
            }
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: progress,
    }))
}

pub(super) async fn sync_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(payload): Json<SyncProgressRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    if session_id.trim().is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "MISSING_SESSION_ID",
            "sessionId 参数必填",
        ));
    }

    if payload.actual_mastery_count < 0 || payload.total_questions < 0 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_PROGRESS_VALUE",
            "进度数据必须是有效的非负数",
        ));
    }

    mastery_learning::sync_session_progress(
        proxy.as_ref(),
        &session_id,
        &user.id,
        payload.actual_mastery_count,
        payload.total_questions,
    )
    .await
    .map_err(|err| match err {
        mastery_learning::SessionError::NotFound => {
            json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "学习会话不存在")
        }
        mastery_learning::SessionError::Forbidden => {
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未授权")
        }
        mastery_learning::SessionError::Sql(_) | mastery_learning::SessionError::Mutation(_) => {
            json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败")
        }
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({
            "synced": true,
            "actualMasteryCount": payload.actual_mastery_count,
            "totalQuestions": payload.total_questions,
        }),
    }))
}

pub(super) async fn records(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Query(query): Query<RecordsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    if session_id.trim().is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "MISSING_SESSION_ID",
            "sessionId 参数必填",
        ));
    }

    let options = record::PaginationOptions {
        page: query.page,
        page_size: query.page_size,
    };

    let result = record::get_records_by_session_id(proxy.as_ref(), &user.id, &session_id, options)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    Ok(Json(SuccessResponseWithPagination {
        success: true,
        data: result.data,
        pagination: result.pagination,
    }))
}

pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListSessionsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;
    let active_only = query.active.unwrap_or(false);

    if active_only {
        let active = select_active_session(proxy.as_ref(), &user.id).await?;
        let mut data: Vec<SessionStats> = active.into_iter().collect();
        let total = data.len() as i64;
        let start = offset.min(total) as usize;
        let end = (offset + page_size).min(total) as usize;
        data = data[start..end].to_vec();
        return Ok(Json(SuccessResponseWithPagination {
            success: true,
            data,
            pagination: PagePagination {
                page,
                page_size,
                total,
                total_pages: if total == 0 {
                    0
                } else {
                    (total + page_size - 1) / page_size
                },
            },
        }));
    }

    let total = count_user_sessions(proxy.as_ref(), &user.id).await?;
    let sessions = select_user_sessions(proxy.as_ref(), &user.id, page_size, offset).await?;
    Ok(Json(SuccessResponseWithPagination {
        success: true,
        data: sessions,
        pagination: PagePagination {
            page,
            page_size,
            total,
            total_pages: if total == 0 {
                0
            } else {
                (total + page_size - 1) / page_size
            },
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

fn duration_seconds(started_at: &str, ended_at: Option<&str>) -> i64 {
    let now_ms = Utc::now().timestamp_millis();
    let start_ms = parse_datetime_millis(started_at).unwrap_or(now_ms);
    let end_ms = ended_at.and_then(parse_datetime_millis).unwrap_or(now_ms);
    ((end_ms - start_ms) / 1000).max(0)
}

async fn select_user_sessions(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<SessionStats>, AppError> {
    select_user_sessions_pg(proxy.pool(), user_id, limit, offset).await
}

async fn count_user_sessions(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<i64, AppError> {
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "learning_sessions" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_one(proxy.pool())
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))
}

async fn select_active_session(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<SessionStats>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT ls."id", ls."userId", ls."startedAt", ls."endedAt", ls."totalQuestions", ls."actualMasteryCount",
               ls."targetMasteryCount", ls."sessionType", ls."flowPeakScore", ls."avgCognitiveLoad", ls."contextShifts",
               (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id") as "answerRecordCount"
        FROM "learning_sessions" ls
        WHERE ls."userId" = $1 AND ls."endedAt" IS NULL
        ORDER BY ls."startedAt" DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(proxy.pool())
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(row.map(map_session_row_pg))
}

async fn select_user_sessions_pg(
    pool: &PgPool,
    user_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<SessionStats>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT ls."id", ls."userId", ls."startedAt", ls."endedAt", ls."totalQuestions", ls."actualMasteryCount",
               ls."targetMasteryCount", ls."sessionType", ls."flowPeakScore", ls."avgCognitiveLoad", ls."contextShifts",
               (SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id") as "answerRecordCount"
        FROM "learning_sessions" ls
        WHERE ls."userId" = $1
        ORDER BY ls."startedAt" DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(rows.into_iter().map(map_session_row_pg).collect())
}

fn map_session_row_pg(row: sqlx::postgres::PgRow) -> SessionStats {
    let started_at: NaiveDateTime = row
        .try_get("startedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let ended_at: Option<NaiveDateTime> = row.try_get("endedAt").ok().flatten();
    let started_at_iso = format_naive_datetime(started_at);
    let ended_at_iso = ended_at.map(format_naive_datetime);
    let duration = duration_seconds(&started_at_iso, ended_at_iso.as_deref());

    SessionStats {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        started_at: started_at_iso,
        ended_at: ended_at_iso,
        duration,
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
        answer_record_count: row.try_get::<i64, _>("answerRecordCount").unwrap_or(0),
    }
}
