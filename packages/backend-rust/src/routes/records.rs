use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::services::record::{self, CreateRecordInput, PaginationOptions, RecordError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct SuccessWithPagination<T> {
    success: bool,
    data: Vec<T>,
    pagination: record::Pagination,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRecordRequest {
    word_id: String,
    #[serde(default)]
    selected_option: Option<String>,
    #[serde(default)]
    selected_answer: Option<String>,
    #[serde(default)]
    correct_answer: Option<String>,
    is_correct: bool,
    #[serde(default)]
    timestamp: Option<i64>,
    #[serde(default)]
    response_time: Option<i64>,
    #[serde(default)]
    dwell_time: Option<i64>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    mastery_level_before: Option<i64>,
    #[serde(default)]
    mastery_level_after: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchCreateRequest {
    records: Vec<CreateRecordRequest>,
}

pub async fn list_records(State(state): State<AppState>, req: Request<Body>) -> Response {
    list_records_inner(state, req, None).await
}

pub async fn v1_list_learning_records(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    list_records_inner(state, req, None).await
}

async fn list_records_inner(
    state: AppState,
    req: Request<Body>,
    session_id: Option<&str>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let query = req.uri().query().unwrap_or("");
    let page = get_query_param(query, "page").and_then(|v| v.parse::<i64>().ok());
    let page_size = get_query_param(query, "pageSize").and_then(|v| v.parse::<i64>().ok());

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

    let options = PaginationOptions { page, page_size };
    let result = match session_id {
        Some(session_id) => {
            record::get_records_by_session_id(proxy.as_ref(), &auth_user.id, session_id, options)
                .await
        }
        None => record::get_records_by_user_id(proxy.as_ref(), &auth_user.id, options).await,
    };

    match result {
        Ok(result) => Json(SuccessWithPagination {
            success: true,
            data: result.data,
            pagination: result.pagination,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "records query failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn create_record(State(state): State<AppState>, req: Request<Body>) -> Response {
    create_record_inner(state, req).await
}

pub async fn v1_create_learning_record(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    create_record_inner(state, req).await
}

async fn create_record_inner(state: AppState, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: CreateRecordRequest = match serde_json::from_slice(&body_bytes) {
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

    let input = CreateRecordInput {
        word_id: payload.word_id,
        selected_option: payload.selected_option,
        selected_answer: payload.selected_answer,
        correct_answer: payload.correct_answer,
        is_correct: payload.is_correct,
        timestamp_ms: payload.timestamp,
        response_time: payload.response_time,
        dwell_time: payload.dwell_time,
        session_id: payload.session_id,
        mastery_level_before: payload.mastery_level_before,
        mastery_level_after: payload.mastery_level_after,
    };

    match record::create_record(proxy.as_ref(), &auth_user.id, input).await {
        Ok(record) => {
            let payload = serde_json::json!({
                "userId": auth_user.id,
                "wordId": record.word_id,
                "isCorrect": record.is_correct,
                "responseTime": record.response_time,
                "sessionId": record.session_id,
            });
            crate::routes::realtime::send_event(
                auth_user.id.clone(),
                record.session_id.clone(),
                "feedback",
                payload,
            );
            (
                StatusCode::CREATED,
                Json(SuccessResponse {
                    success: true,
                    data: record,
                }),
            )
                .into_response()
        }
        Err(err) => match err {
            RecordError::Validation(message) => {
                json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response()
            }
            RecordError::Unauthorized(message) => {
                json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", message).into_response()
            }
            RecordError::NotFound(message) => {
                json_error(StatusCode::NOT_FOUND, "NOT_FOUND", message).into_response()
            }
            RecordError::Sql(sql_err) => {
                tracing::warn!(error = %sql_err, "record insert failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
            RecordError::Mutation(message) => {
                tracing::warn!(error = %message, "record mutation failed");
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

pub async fn batch_create_records(State(state): State<AppState>, req: Request<Body>) -> Response {
    batch_create_records_inner(state, req).await
}

pub async fn v1_batch_create_learning_records(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    batch_create_records_inner(state, req).await
}

async fn batch_create_records_inner(state: AppState, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: BatchCreateRequest = match serde_json::from_slice(&body_bytes) {
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

    let records: Vec<CreateRecordInput> = payload
        .records
        .into_iter()
        .map(|record| CreateRecordInput {
            word_id: record.word_id,
            selected_option: record.selected_option,
            selected_answer: record.selected_answer,
            correct_answer: record.correct_answer,
            is_correct: record.is_correct,
            timestamp_ms: record.timestamp,
            response_time: record.response_time,
            dwell_time: record.dwell_time,
            session_id: record.session_id,
            mastery_level_before: record.mastery_level_before,
            mastery_level_after: record.mastery_level_after,
        })
        .collect();

    match record::batch_create_records(proxy.as_ref(), &auth_user.id, records).await {
        Ok(result) => (
            StatusCode::CREATED,
            Json(SuccessResponse {
                success: true,
                data: result,
            }),
        )
            .into_response(),
        Err(err) => match err {
            RecordError::Validation(message) => {
                json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response()
            }
            RecordError::Unauthorized(message) => {
                json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", message).into_response()
            }
            RecordError::NotFound(message) => {
                json_error(StatusCode::NOT_FOUND, "NOT_FOUND", message).into_response()
            }
            RecordError::Sql(sql_err) => {
                tracing::warn!(error = %sql_err, "batch record insert failed");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response()
            }
            RecordError::Mutation(message) => {
                tracing::warn!(error = %message, "batch record mutation failed");
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

pub async fn statistics(State(state): State<AppState>, req: Request<Body>) -> Response {
    statistics_inner(state, req).await
}

pub async fn v1_learning_statistics(State(state): State<AppState>, req: Request<Body>) -> Response {
    statistics_inner(state, req).await
}

async fn statistics_inner(state: AppState, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

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

    let period = get_query_param(req.uri().query().unwrap_or(""), "period");
    match record::get_statistics_with_period(proxy.as_ref(), &auth_user.id, period.as_deref()).await
    {
        Ok(stats) => Json(SuccessResponse {
            success: true,
            data: stats,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "statistics query failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn enhanced_statistics(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

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

    match record::get_enhanced_statistics(proxy.as_ref(), &auth_user.id).await {
        Ok(stats) => Json(SuccessResponse {
            success: true,
            data: stats,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "enhanced statistics query failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
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
