use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::services::mastery_learning::{
    self, AdjustWordsInput, GetNextWordsInput, RecentPerformance, SessionError, UserState,
};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NextWordsRequest {
    current_word_ids: Vec<String>,
    mastered_word_ids: Vec<String>,
    session_id: String,
    #[serde(default)]
    count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdjustWordsRequest {
    session_id: String,
    current_word_ids: Vec<String>,
    mastered_word_ids: Vec<String>,
    #[serde(default)]
    user_state: Option<UserState>,
    recent_performance: RecentPerformance,
    adjust_reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionRequest {
    target_mastery_count: i64,
    #[serde(default)]
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncProgressRequest {
    session_id: String,
    actual_mastery_count: i64,
    total_questions: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionResponse {
    session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResponse {
    synced: bool,
}

pub async fn study_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    study_words_inner(state, req, false).await
}

pub async fn v1_study_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    study_words_inner(state, req, true).await
}

async fn study_words_inner(state: AppState, req: Request<Body>, v1: bool) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let query = req.uri().query().unwrap_or("");
    let raw_target = get_query_param(query, "targetCount");
    let target_count = raw_target.as_deref().and_then(|v| v.parse::<i64>().ok());

    if let Some(raw) = raw_target.as_deref() {
        if target_count.is_none() || target_count.unwrap_or(0) <= 0 {
            return json_error(
                StatusCode::BAD_REQUEST,
                if v1 {
                    "INVALID_TARGET_COUNT"
                } else {
                    "BAD_REQUEST"
                },
                "targetCount 必须是正整数",
            )
            .into_response();
        }
        if target_count.unwrap_or(0) > 100 {
            return json_error(
                StatusCode::BAD_REQUEST,
                if v1 {
                    "TARGET_COUNT_TOO_LARGE"
                } else {
                    "BAD_REQUEST"
                },
                "targetCount 不能超过 100",
            )
            .into_response();
        }
        if raw.trim().is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                if v1 {
                    "INVALID_TARGET_COUNT"
                } else {
                    "BAD_REQUEST"
                },
                "targetCount 必须是正整数",
            )
            .into_response();
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let amas_engine = state.amas_engine();
    match mastery_learning::get_words_for_mastery_mode(
        proxy.as_ref(),
        &auth_user.id,
        target_count,
        Some(amas_engine.as_ref()),
    )
    .await
    {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "study words failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn next_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    next_words_inner(state, req, false).await
}

pub async fn v1_next_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    next_words_inner(state, req, true).await
}

async fn next_words_inner(state: AppState, req: Request<Body>, v1: bool) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: NextWordsRequest = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response()
        }
    };

    if payload.session_id.trim().is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            if v1 {
                "INVALID_SESSION_ID"
            } else {
                "BAD_REQUEST"
            },
            "sessionId 必填且必须是字符串",
        )
        .into_response();
    }

    if payload.count.is_some() {
        let count = payload.count.unwrap_or(0);
        if count <= 0 || count > 20 {
            return json_error(
                StatusCode::BAD_REQUEST,
                if v1 { "INVALID_COUNT" } else { "BAD_REQUEST" },
                "count 必须是 1-20 之间的正整数",
            )
            .into_response();
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let input = GetNextWordsInput {
        current_word_ids: payload.current_word_ids,
        mastered_word_ids: payload.mastered_word_ids,
        session_id: payload.session_id,
        count: payload.count,
    };

    let amas_engine = state.amas_engine();
    match mastery_learning::get_next_words(
        proxy.as_ref(),
        &auth_user.id,
        input,
        Some(amas_engine.as_ref()),
    )
    .await
    {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "next words failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn adjust_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    adjust_words_inner(state, req, false).await
}

pub async fn v1_adjust_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    adjust_words_inner(state, req, true).await
}

async fn adjust_words_inner(state: AppState, req: Request<Body>, v1: bool) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: AdjustWordsRequest = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response()
        }
    };

    let valid_reasons = ["fatigue", "struggling", "excelling", "periodic"];
    if !valid_reasons.iter().any(|r| r == &payload.adjust_reason) {
        return json_error(
            StatusCode::BAD_REQUEST,
            if v1 {
                "INVALID_ADJUST_REASON"
            } else {
                "BAD_REQUEST"
            },
            format!("adjustReason 必须是 {}", valid_reasons.join("/")),
        )
        .into_response();
    }

    if payload.session_id.trim().is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            if v1 {
                "INVALID_SESSION_ID"
            } else {
                "BAD_REQUEST"
            },
            "sessionId 必填且为字符串",
        )
        .into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let input = AdjustWordsInput {
        user_id: auth_user.id,
        session_id: payload.session_id,
        current_word_ids: payload.current_word_ids,
        mastered_word_ids: payload.mastered_word_ids,
        user_state: payload.user_state,
        recent_performance: payload.recent_performance,
        adjust_reason: payload.adjust_reason,
    };

    match mastery_learning::adjust_words_for_user(proxy.as_ref(), input).await {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "adjust words failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn create_session(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: CreateSessionRequest = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response()
        }
    };

    if payload.target_mastery_count <= 0 || payload.target_mastery_count > 100 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "targetMasteryCount 必须是正整数",
        )
        .into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    match mastery_learning::ensure_learning_session(
        proxy.as_ref(),
        &auth_user.id,
        payload.target_mastery_count,
        payload.session_id,
    )
    .await
    {
        Ok(session_id) => Json(SuccessResponse {
            success: true,
            data: CreateSessionResponse { session_id },
        })
        .into_response(),
        Err(err) => match err {
            SessionError::Forbidden => {
                json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未授权").into_response()
            }
            SessionError::NotFound => {
                json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "学习会话不存在").into_response()
            }
            SessionError::Sql(sql_err) => {
                tracing::warn!(error = %sql_err, "create session failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
            SessionError::Mutation(message) => {
                tracing::warn!(error = %message, "create session mutation failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
        },
    }
}

pub async fn sync_progress(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: SyncProgressRequest = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response()
        }
    };

    if payload.session_id.trim().is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "sessionId 必填")
            .into_response();
    }

    if payload.actual_mastery_count < 0 || payload.total_questions < 0 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "进度数据必须是有效的非负数",
        )
        .into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    match mastery_learning::sync_session_progress(
        proxy.as_ref(),
        &payload.session_id,
        &auth_user.id,
        payload.actual_mastery_count,
        payload.total_questions,
    )
    .await
    {
        Ok(()) => Json(SuccessResponse {
            success: true,
            data: SyncResponse { synced: true },
        })
        .into_response(),
        Err(err) => match err {
            SessionError::NotFound => {
                json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "学习会话不存在").into_response()
            }
            SessionError::Forbidden => {
                json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未授权").into_response()
            }
            SessionError::Sql(sql_err) => {
                tracing::warn!(error = %sql_err, "sync progress failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
            SessionError::Mutation(message) => {
                tracing::warn!(error = %message, "sync progress mutation failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
        },
    }
}

pub async fn session_progress(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let session_id = req
        .uri()
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    if session_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    match mastery_learning::get_session_progress(proxy.as_ref(), &session_id, &auth_user.id).await {
        Ok(progress) => Json(SuccessResponse {
            success: true,
            data: progress,
        })
        .into_response(),
        Err(err) => match err {
            SessionError::NotFound => {
                json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "学习会话不存在").into_response()
            }
            SessionError::Forbidden => {
                json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未授权").into_response()
            }
            SessionError::Sql(sql_err) => {
                tracing::warn!(error = %sql_err, "session progress failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
            SessionError::Mutation(message) => {
                tracing::warn!(error = %message, "session progress mutation failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
        },
    }
}

async fn split_body(req: Request<Body>) -> Result<(axum::http::request::Parts, Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return Err(
                json_error(StatusCode::BAD_REQUEST, "BODY_TOO_LARGE", "请求体过大").into_response(),
            )
        }
    };
    Ok((parts, body_bytes))
}

fn get_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut iter = pair.splitn(2, '=');
        let k = iter.next().unwrap_or("");
        if k != key {
            continue;
        }
        let value = iter.next().unwrap_or("");
        return Some(percent_decode(value));
    }
    None
}

fn percent_decode(input: &str) -> String {
    let mut out: Vec<u8> = Vec::with_capacity(input.len());
    let mut bytes = input.as_bytes().iter().copied();
    while let Some(b) = bytes.next() {
        match b {
            b'+' => out.push(b' '),
            b'%' => {
                let hi = bytes.next();
                let lo = bytes.next();
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    if let (Some(hi), Some(lo)) = (from_hex(hi), from_hex(lo)) {
                        out.push((hi << 4) | lo);
                        continue;
                    }
                }
                out.push(b'%');
                if let Some(hi) = hi {
                    out.push(hi);
                }
                if let Some(lo) = lo {
                    out.push(lo);
                }
            }
            _ => out.push(b),
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(10 + (b - b'a')),
        b'A'..=b'F' => Some(10 + (b - b'A')),
        _ => None,
    }
}
