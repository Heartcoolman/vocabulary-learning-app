use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::services::word_states::{self, WordLearningStateRecord, WordStateError, WordStateStats};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct MessageResponse {
    success: bool,
    message: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchRequest {
    word_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchItem {
    word_id: String,
    state: Option<WordLearningStateRecord>,
}

pub async fn batch_get(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: BatchRequest = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response(),
    };

    if payload.word_ids.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordIds must be a non-empty array").into_response();
    }
    if payload.word_ids.len() > 500 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "wordIds array exceeds maximum size of 500",
        )
        .into_response();
    }
    if !payload
        .word_ids
        .iter()
        .all(|id| !id.trim().is_empty())
    {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "wordIds must contain only non-empty strings",
        )
        .into_response();
    }

    let unique_ids: Vec<String> = payload
        .word_ids
        .into_iter()
        .map(|id| id.trim().to_string())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let map = match word_states::batch_get_word_states(proxy.as_ref(), &auth_user.id, &unique_ids).await {
        Ok(value) => value,
        Err(err) => {
            return handle_service_error(err);
        }
    };

    let items: Vec<BatchItem> = unique_ids
        .into_iter()
        .map(|id| BatchItem {
            state: map.get(id.as_str()).cloned(),
            word_id: id,
        })
        .collect();

    Json(SuccessResponse { success: true, data: items }).into_response()
}

pub async fn due_list(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::list_due_words(proxy.as_ref(), &auth_user.id).await {
        Ok(words) => Json(SuccessResponse { success: true, data: words }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word state due list failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn stats_overview(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::get_state_stats(proxy.as_ref(), &auth_user.id).await {
        Ok(stats) => Json(SuccessResponse::<WordStateStats> { success: true, data: stats }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word state stats failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn by_state(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let raw_state = req.uri().path().rsplit('/').next().unwrap_or("");
    let Some(state_value) = word_states::normalize_state_param(raw_state) else {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "Invalid state. Allowed values: new, learning, review, mastered",
        )
        .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::list_words_by_state(proxy.as_ref(), &auth_user.id, state_value).await {
        Ok(words) => Json(SuccessResponse { success: true, data: words }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word state by state failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn get_one(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let word_id = req.uri().path().rsplit('/').next().unwrap_or("").trim().to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::get_word_state(proxy.as_ref(), &auth_user.id, &word_id).await {
        Ok(state_row) => Json(SuccessResponse { success: true, data: state_row }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word state get failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn upsert_one(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let word_id = parts.uri.path().rsplit('/').next().unwrap_or("").trim().to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required").into_response();
    }

    let raw: serde_json::Map<String, serde_json::Value> = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response(),
    };

    let update = match word_states::validate_word_state_update_payload(&raw) {
        Ok(update) => update,
        Err(WordStateError::Validation(msg)) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", msg).into_response();
        }
        Err(err) => return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", err.to_string()).into_response(),
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::upsert_word_state(proxy.as_ref(), &auth_user.id, &word_id, update).await {
        Ok(record) => Json(SuccessResponse { success: true, data: record }).into_response(),
        Err(err) => handle_service_error(err),
    }
}

pub async fn delete_one(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let word_id = req.uri().path().rsplit('/').next().unwrap_or("").trim().to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::delete_word_state(proxy.as_ref(), &auth_user.id, &word_id).await {
        Ok(()) => Json(MessageResponse { success: true, message: "学习状态已删除" }).into_response(),
        Err(err) => handle_service_error(err),
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchUpdateRequest {
    word_ids: Vec<String>,
    operation: String,
}

pub async fn mark_mastered(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let word_id = req.uri().path()
        .trim_end_matches("/mark-mastered")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::mark_mastered(proxy.as_ref(), &auth_user.id, &word_id).await {
        Ok(record) => Json(SuccessResponse { success: true, data: record }).into_response(),
        Err(err) => handle_service_error(err),
    }
}

pub async fn mark_needs_practice(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let word_id = req.uri().path()
        .trim_end_matches("/mark-needs-practice")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::mark_needs_practice(proxy.as_ref(), &auth_user.id, &word_id).await {
        Ok(record) => Json(SuccessResponse { success: true, data: record }).into_response(),
        Err(err) => handle_service_error(err),
    }
}

pub async fn reset_progress(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let word_id = req.uri().path()
        .trim_end_matches("/reset")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::reset_progress(proxy.as_ref(), &auth_user.id, &word_id).await {
        Ok(record) => Json(SuccessResponse { success: true, data: record }).into_response(),
        Err(err) => handle_service_error(err),
    }
}

pub async fn batch_update(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: BatchUpdateRequest = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response(),
    };

    if payload.word_ids.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordIds must be a non-empty array").into_response();
    }
    if payload.word_ids.len() > 500 {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordIds array exceeds maximum size of 500").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match word_states::batch_update_states(proxy.as_ref(), &auth_user.id, &payload.word_ids, &payload.operation).await {
        Ok(records) => Json(SuccessResponse { success: true, data: records }).into_response(),
        Err(err) => handle_service_error(err),
    }
}

fn handle_service_error(err: WordStateError) -> Response {
    match err {
        WordStateError::Validation(msg) => json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", msg).into_response(),
        WordStateError::Unauthorized(msg) => json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg).into_response(),
        WordStateError::NotFound(msg) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", msg).into_response(),
        WordStateError::Sql(sql_err) => {
            tracing::warn!(error = %sql_err, "word state sql failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
        WordStateError::Mutation(message) => {
            tracing::warn!(error = %message, "word state mutation failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}
