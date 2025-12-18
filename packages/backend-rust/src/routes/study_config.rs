use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde::Serialize;

use crate::middleware::RequestDbState;
use crate::response::json_error;
use crate::services::study_config::{self, StudyConfigUpdateError, UpdateStudyConfigInput};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

pub async fn get_config(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match study_config::get_or_create_user_study_config(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(config) => Json(SuccessResponse { success: true, data: config }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "study config lookup failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn update_config(
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

    let payload: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    let Some(obj) = payload.as_object() else {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
    };

    let selected_ids = match obj.get("selectedWordBookIds") {
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect::<Vec<_>>(),
        _ => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "selectedWordBookIds 必须是数组")
                .into_response();
        }
    };

    let daily_word_count = match obj.get("dailyWordCount").and_then(|v| v.as_i64()) {
        Some(value) if (10..=100).contains(&value) => value,
        _ => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "每日学习量必须在 10-100 之间")
                .into_response();
        }
    };

    let study_mode = obj
        .get("studyMode")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "sequential".to_string());

    let valid_modes = ["sequential", "random", "new", "review", "mixed"];
    if let Some(raw) = obj.get("studyMode").and_then(|v| v.as_str()) {
        if !valid_modes.iter().any(|m| m == &raw) {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!("studyMode 必须是以下值之一: {}", valid_modes.join(", ")),
            )
            .into_response();
        }
    }

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let input = UpdateStudyConfigInput {
        selected_word_book_ids: selected_ids,
        daily_word_count,
        study_mode,
    };

    match study_config::update_user_study_config(proxy.as_ref(), request_state, &auth_user.id, input).await {
        Ok(config) => Json(SuccessResponse { success: true, data: config }).into_response(),
        Err(err) => match err {
            StudyConfigUpdateError::UnauthorizedWordBooks(ids) => json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                format!("无权访问以下词书: {}", ids.join(", ")),
            )
            .into_response(),
            StudyConfigUpdateError::Sql(sql_err) => {
                tracing::warn!(error = %sql_err, "study config update failed");
                json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
            }
        },
    }
}

pub async fn today_words(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match study_config::get_today_words(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(result) => Json(SuccessResponse { success: true, data: result }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "today words query failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn progress(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match study_config::get_study_progress(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(result) => Json(SuccessResponse { success: true, data: result }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "study progress query failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
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

