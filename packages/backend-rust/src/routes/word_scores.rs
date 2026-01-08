use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::services::word_scores::{self, ScoreStats, WordScoreError, WordScoreRecord};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchRequest {
    word_ids: Vec<String>,
}

pub async fn range(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let query = req.uri().query().unwrap_or("");
    let min_score = get_query_param(query, "minScore")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    let max_score = get_query_param(query, "maxScore")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(100.0);
    if min_score < 0.0 || max_score > 100.0 || min_score > max_score {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "得分范围无效").into_response();
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

    match word_scores::list_scores_in_range(proxy.as_ref(), &auth_user.id, min_score, max_score)
        .await
    {
        Ok(scores) => Json(SuccessResponse {
            success: true,
            data: scores,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word scores range failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn low_list(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let query = req.uri().query().unwrap_or("");
    let threshold = get_query_param(query, "threshold")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(40);
    if threshold < 0 || threshold > 100 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "threshold必须在0-100之间",
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

    match word_scores::list_low_scores(proxy.as_ref(), &auth_user.id, threshold).await {
        Ok(scores) => Json(SuccessResponse {
            success: true,
            data: scores,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word scores low list failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn high_list(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let query = req.uri().query().unwrap_or("");
    let threshold = get_query_param(query, "threshold")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(80);
    if threshold < 0 || threshold > 100 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "threshold必须在0-100之间",
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

    match word_scores::list_high_scores(proxy.as_ref(), &auth_user.id, threshold).await {
        Ok(scores) => Json(SuccessResponse {
            success: true,
            data: scores,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word scores high list failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn stats_overview(State(state): State<AppState>, req: Request<Body>) -> Response {
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

    match word_scores::get_user_score_stats(proxy.as_ref(), &auth_user.id).await {
        Ok(stats) => Json(SuccessResponse::<ScoreStats> {
            success: true,
            data: stats,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word scores stats failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn get_one(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let word_id = req
        .uri()
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required")
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

    match word_scores::get_word_score(proxy.as_ref(), &auth_user.id, &word_id).await {
        Ok(score) => Json(SuccessResponse::<Option<WordScoreRecord>> {
            success: true,
            data: score,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word score get failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn batch_get(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: BatchRequest = match serde_json::from_slice(&body_bytes) {
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

    if payload.word_ids.len() > 500 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "wordIds数组最多允许500个元素",
        )
        .into_response();
    }
    if !payload.word_ids.iter().all(|id| !id.trim().is_empty()) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "wordIds数组元素必须是非空字符串",
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

    let map =
        match word_scores::batch_get_word_scores(proxy.as_ref(), &auth_user.id, &payload.word_ids)
            .await
        {
            Ok(value) => value,
            Err(err) => {
                return handle_service_error(err);
            }
        };

    let scores: Vec<WordScoreRecord> = map.into_values().collect();
    Json(SuccessResponse {
        success: true,
        data: scores,
    })
    .into_response()
}

pub async fn upsert_one(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let word_id = parts
        .uri
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if word_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "wordId is required")
            .into_response();
    }

    let raw: serde_json::Map<String, serde_json::Value> = match serde_json::from_slice(&body_bytes)
    {
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

    match word_scores::upsert_word_score(proxy.as_ref(), &auth_user.id, &word_id, &raw).await {
        Ok(record) => Json(SuccessResponse::<WordScoreRecord> {
            success: true,
            data: record,
        })
        .into_response(),
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

fn handle_service_error(err: WordScoreError) -> Response {
    match err {
        WordScoreError::Validation(msg) => {
            json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", msg).into_response()
        }
        WordScoreError::Unauthorized(msg) => {
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg).into_response()
        }
        WordScoreError::NotFound(msg) => {
            json_error(StatusCode::NOT_FOUND, "NOT_FOUND", msg).into_response()
        }
        WordScoreError::Sql(sql_err) => {
            tracing::warn!(error = %sql_err, "word score sql failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
        WordScoreError::Mutation(message) => {
            tracing::warn!(error = %message, "word score mutation failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
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
