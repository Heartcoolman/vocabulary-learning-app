use std::collections::HashMap;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};

use crate::response::json_error;
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WordResponse {
    id: String,
    word_book_id: String,
    spelling: String,
    phonetic: String,
    meanings: Vec<String>,
    examples: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    audio_url: Option<String>,
    created_at: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    word_book: Option<WordBookSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WordBookSummary {
    id: String,
    name: String,
    r#type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWordRequest {
    spelling: String,
    phonetic: Option<String>,
    meanings: Vec<String>,
    examples: Vec<String>,
    audio_url: Option<String>,
    word_book_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWordRequest {
    spelling: Option<String>,
    phonetic: Option<Option<String>>,
    meanings: Option<Vec<String>>,
    examples: Option<Vec<String>>,
    audio_url: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchCreateRequest {
    words: Vec<CreateWordRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchDeleteRequest {
    word_ids: Vec<String>,
}

pub async fn list_words(State(state): State<AppState>, req: Request<Body>) -> Response {
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

    let word_book_ids = match select_selected_word_book_ids(proxy.as_ref(), &auth_user.id).await {
        Ok(ids) => ids,
        Err(err) => {
            tracing::warn!(error = %err, "selected word book lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if word_book_ids.is_empty() {
        return Json(SuccessResponse::<Vec<WordResponse>> {
            success: true,
            data: Vec::new(),
        })
        .into_response();
    }

    let words = match select_words_by_word_books(proxy.as_ref(), &word_book_ids).await {
        Ok(words) => words,
        Err(err) => {
            tracing::warn!(error = %err, "words list query failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: words,
    })
    .into_response()
}

pub async fn learned_words(State(state): State<AppState>, req: Request<Body>) -> Response {
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

    let words = match select_learned_words(proxy.as_ref(), &auth_user.id).await {
        Ok(words) => words,
        Err(err) => {
            tracing::warn!(error = %err, "learned words query failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: words,
    })
    .into_response()
}

pub async fn get_word_by_id(State(state): State<AppState>, req: Request<Body>) -> Response {
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
        .to_string();
    if word_id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "请求参数不合法",
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

    match select_word_by_id(proxy.as_ref(), &word_id).await {
        Ok(Some((word, owner_user_id, word_book_type))) => {
            if word_book_type == "USER" && owner_user_id.as_deref() != Some(&auth_user.id) {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权访问此单词")
                    .into_response();
            }

            Json(SuccessResponse {
                success: true,
                data: Some(word),
            })
            .into_response()
        }
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "单词不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "word lookup failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn search_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    search_words_inner(state, req, false).await
}

pub async fn v1_search_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    search_words_inner(state, req, true).await
}

async fn search_words_inner(state: AppState, req: Request<Body>, strict: bool) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let query_string = req.uri().query().unwrap_or("");
    let q = get_query_param(query_string, "q").unwrap_or_default();
    let limit_raw = get_query_param(query_string, "limit").unwrap_or_default();

    if strict && q.trim().is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "EMPTY_QUERY", "搜索关键词不能为空")
            .into_response();
    }

    let limit = limit_raw.parse::<i64>().ok().unwrap_or(20);
    if strict && (limit < 1 || limit > 100) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_LIMIT",
            "limit 必须在 1-100 之间",
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

    let words = match select_search_words(proxy.as_ref(), &auth_user.id, &q, limit).await {
        Ok(words) => words,
        Err(err) => {
            tracing::warn!(error = %err, "search words failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: words,
    })
    .into_response()
}

pub async fn create_word(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: CreateWordRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
    };

    let spelling = payload.spelling.trim().to_string();
    if spelling.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "单词拼写不能为空",
        )
        .into_response();
    }
    if payload.meanings.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "至少需要一个释义",
        )
        .into_response();
    }

    let phonetic = match payload.phonetic {
        Some(value) if value.trim().is_empty() => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "音标不能为空")
                .into_response();
        }
        Some(value) => value,
        None => String::new(),
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

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let word_book_id = match payload.word_book_id {
        Some(id) if !id.trim().is_empty() => id,
        _ => match ensure_default_user_word_book(proxy.as_ref(), &auth_user.id, &now_iso).await {
            Ok(id) => id,
            Err(err) => {
                tracing::warn!(error = %err, "ensure default word book failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response();
            }
        },
    };

    let word_id = uuid::Uuid::new_v4().to_string();
    if let Err(err) = insert_word(
        proxy.as_ref(),
        &word_id,
        &word_book_id,
        &spelling,
        &phonetic,
        &payload.meanings,
        &payload.examples,
        payload.audio_url.as_deref(),
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "word insert failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = refresh_word_book_count(proxy.as_ref(), &word_book_id).await {
        tracing::warn!(error = %err, "word count refresh failed");
    }

    (
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: WordResponse {
                id: word_id,
                word_book_id,
                spelling,
                phonetic,
                meanings: payload.meanings,
                examples: payload.examples,
                audio_url: payload.audio_url,
                created_at: now_iso.clone(),
                updated_at: now_iso,
                word_book: None,
            },
        }),
    )
        .into_response()
}

pub async fn batch_create(State(state): State<AppState>, req: Request<Body>) -> Response {
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
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
    };

    if payload.words.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "EMPTY_WORDS_ARRAY",
            "words 数组不能为空",
        )
        .into_response();
    }
    if payload.words.len() > 1000 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BATCH_SIZE_EXCEEDED",
            "单次批量添加不能超过 1000 个单词",
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

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let default_word_book_id =
        match ensure_default_user_word_book(proxy.as_ref(), &auth_user.id, &now_iso).await {
            Ok(id) => id,
            Err(err) => {
                tracing::warn!(error = %err, "ensure default word book failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response();
            }
        };

    let mut created = Vec::with_capacity(payload.words.len());
    let mut touched_word_books: HashMap<String, ()> = HashMap::new();

    for word in payload.words {
        let spelling = word.spelling.trim().to_string();
        if spelling.is_empty() || word.meanings.is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
        let phonetic = match word.phonetic {
            Some(value) if value.trim().is_empty() => {
                return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "音标不能为空")
                    .into_response();
            }
            Some(value) => value,
            None => String::new(),
        };

        let word_book_id = word
            .word_book_id
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| default_word_book_id.clone());

        let word_id = uuid::Uuid::new_v4().to_string();
        if let Err(err) = insert_word(
            proxy.as_ref(),
            &word_id,
            &word_book_id,
            &spelling,
            &phonetic,
            &word.meanings,
            &word.examples,
            word.audio_url.as_deref(),
            &now_iso,
        )
        .await
        {
            tracing::warn!(error = %err, "batch word insert failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }

        touched_word_books.insert(word_book_id.clone(), ());
        created.push(WordResponse {
            id: word_id,
            word_book_id,
            spelling,
            phonetic,
            meanings: word.meanings,
            examples: word.examples,
            audio_url: word.audio_url,
            created_at: now_iso.clone(),
            updated_at: now_iso.clone(),
            word_book: None,
        });
    }

    for book_id in touched_word_books.keys() {
        if let Err(err) = refresh_word_book_count(proxy.as_ref(), book_id).await {
            tracing::warn!(error = %err, "word count refresh failed");
        }
    }

    (
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: created,
        }),
    )
        .into_response()
}

pub async fn update_word(State(state): State<AppState>, req: Request<Body>) -> Response {
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
        .to_string();
    if word_id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "请求参数不合法",
        )
        .into_response();
    }

    let payload: UpdateWordRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
    };

    if let Some(spelling) = payload.spelling.as_ref() {
        if spelling.trim().is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "单词拼写不能为空",
            )
            .into_response();
        }
    }
    if let Some(meanings) = payload.meanings.as_ref() {
        if meanings.is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "至少需要一个释义",
            )
            .into_response();
        }
    }
    if let Some(Some(phonetic)) = payload.phonetic.as_ref() {
        if phonetic.trim().is_empty() {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "音标不能为空")
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

    let existing = match select_word_by_id(proxy.as_ref(), &word_id).await {
        Ok(Some((word, owner_user_id, word_book_type))) => {
            if word_book_type == "SYSTEM" {
                return json_error(
                    StatusCode::FORBIDDEN,
                    "FORBIDDEN",
                    "无法修改系统词书中的单词",
                )
                .into_response();
            }
            if owner_user_id.as_deref() != Some(&auth_user.id) {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权修改此单词")
                    .into_response();
            }
            word
        }
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "单词不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "word lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let updated = WordResponse {
        spelling: payload
            .spelling
            .as_ref()
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| existing.spelling.clone()),
        phonetic: match payload.phonetic {
            Some(Some(value)) => value,
            Some(None) => String::new(),
            None => existing.phonetic.clone(),
        },
        meanings: payload
            .meanings
            .clone()
            .unwrap_or_else(|| existing.meanings.clone()),
        examples: payload
            .examples
            .clone()
            .unwrap_or_else(|| existing.examples.clone()),
        audio_url: match payload.audio_url {
            Some(Some(value)) => Some(value),
            Some(None) => existing.audio_url.clone(),
            None => existing.audio_url.clone(),
        },
        updated_at: now_iso.clone(),
        ..existing
    };

    if let Err(err) = apply_word_update(proxy.as_ref(), &updated, &now_iso).await {
        tracing::warn!(error = %err, "word update failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    Json(SuccessResponse {
        success: true,
        data: updated,
    })
    .into_response()
}

pub async fn delete_word(State(state): State<AppState>, req: Request<Body>) -> Response {
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
        .to_string();
    if word_id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "请求参数不合法",
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

    let word = match select_word_by_id(proxy.as_ref(), &word_id).await {
        Ok(Some((word, owner_user_id, word_book_type))) => {
            if word_book_type == "SYSTEM" {
                return json_error(
                    StatusCode::FORBIDDEN,
                    "FORBIDDEN",
                    "无法删除系统词书中的单词",
                )
                .into_response();
            }
            if owner_user_id.as_deref() != Some(&auth_user.id) {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权删除此单词")
                    .into_response();
            }
            word
        }
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "单词不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "word lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if let Err(err) = delete_word_record(proxy.as_ref(), &word.id).await {
        tracing::warn!(error = %err, "word delete failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = refresh_word_book_count(proxy.as_ref(), &word.word_book_id).await {
        tracing::warn!(error = %err, "word count refresh failed");
    }

    Json(MessageResponse {
        success: true,
        message: "单词删除成功",
    })
    .into_response()
}

pub async fn batch_delete_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: BatchDeleteRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
    };

    if payload.word_ids.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "wordIds 不能为空",
        )
        .into_response();
    }
    if payload.word_ids.len() > 1000 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "单次最多删除1000个",
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

    let word_book_ids =
        match select_word_book_ids_for_words(proxy.as_ref(), &payload.word_ids).await {
            Ok(ids) => ids,
            Err(err) => {
                tracing::warn!(error = %err, "word lookup for batch delete failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response();
            }
        };

    if word_book_ids
        .iter()
        .any(|owner| owner.1.as_deref() != Some(&auth_user.id))
    {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "存在无权限删除的单词",
        )
        .into_response();
    }

    if let Err(err) = delete_words(proxy.as_ref(), &payload.word_ids).await {
        tracing::warn!(error = %err, "batch delete failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    let mut touched: HashMap<String, ()> = HashMap::new();
    for (book_id, _) in word_book_ids {
        touched.insert(book_id, ());
    }
    for book_id in touched.keys() {
        if let Err(err) = refresh_word_book_count(proxy.as_ref(), book_id).await {
            tracing::warn!(error = %err, "word count refresh failed");
        }
    }

    Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "deleted": payload.word_ids.len() }),
    })
    .into_response()
}

async fn select_selected_word_book_ids(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"SELECT "selectedWordBookIds" FROM "user_study_configs" WHERE "userId" = $1 LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else {
        return Ok(Vec::new());
    };
    let ids: Vec<String> = row.try_get("selectedWordBookIds")?;
    Ok(ids)
}

async fn select_words_by_word_books(
    proxy: &crate::db::DatabaseProxy,
    word_book_ids: &[String],
) -> Result<Vec<WordResponse>, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          "id",
          "spelling",
          "phonetic",
          "meanings",
          "examples",
          "audioUrl",
          "wordBookId",
          "createdAt",
          "updatedAt"
        FROM "words"
        WHERE "wordBookId" IN (
        "#,
    );
    let mut separated = qb.separated(", ");
    for id in word_book_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(") ORDER BY \"createdAt\" DESC");

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| map_postgres_word_row(&row))
        .collect())
}

async fn select_learned_words(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Vec<WordResponse>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT
          w."id",
          w."spelling",
          w."phonetic",
          w."meanings",
          w."examples",
          w."audioUrl",
          w."wordBookId",
          w."createdAt",
          w."updatedAt"
        FROM "word_learning_states" s
        JOIN "words" w ON w."id" = s."wordId"
        WHERE s."userId" = $1
        ORDER BY s."updatedAt" DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| map_postgres_word_row(&row))
        .collect())
}

async fn select_word_by_id(
    proxy: &crate::db::DatabaseProxy,
    word_id: &str,
) -> Result<Option<(WordResponse, Option<String>, String)>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT
          w."id",
          w."spelling",
          w."phonetic",
          w."meanings",
          w."examples",
          w."audioUrl",
          w."wordBookId",
          w."createdAt",
          w."updatedAt",
          wb."userId" as "wbUserId",
          wb."type"::text as "wbType"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" = $1
        LIMIT 1
        "#,
    )
    .bind(word_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let word = map_postgres_word_row(&row);
    let owner: Option<String> = row.try_get("wbUserId").ok();
    let wb_type: String = row
        .try_get("wbType")
        .unwrap_or_else(|_| "SYSTEM".to_string());
    Ok(Some((word, owner, wb_type)))
}

async fn select_search_words(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    query: &str,
    limit: i64,
) -> Result<Vec<WordResponse>, sqlx::Error> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let search_term = query.trim().to_string();
    let lower_term = search_term.to_lowercase();
    let escaped = escape_like(&lower_term);
    let pattern = format!("%{}%", escaped);
    let prefix_pattern = format!("{}%", escaped);

    let pool = proxy.pool();
    let ids: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT w."id"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE (wb."type"::text = 'SYSTEM' OR (wb."type"::text = 'USER' AND wb."userId" = $1))
          AND (
            lower(w."spelling") LIKE $2 ESCAPE '\\'
            OR EXISTS (
              SELECT 1 FROM unnest(w."meanings") m
              WHERE lower(m) LIKE $2 ESCAPE '\\'
            )
          )
        ORDER BY
          CASE
            WHEN lower(w."spelling") = $3 THEN 0
            WHEN lower(w."spelling") LIKE $4 ESCAPE '\\' THEN 1
            ELSE 2
          END,
          w."spelling" ASC
        LIMIT $5
        "#,
    )
    .bind(user_id)
    .bind(&pattern)
    .bind(&lower_term)
    .bind(&prefix_pattern)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut by_id: HashMap<String, WordResponse> = HashMap::new();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          w."id",
          w."spelling",
          w."phonetic",
          w."meanings",
          w."examples",
          w."audioUrl",
          w."wordBookId",
          w."createdAt",
          w."updatedAt",
          wb."id" as "wbId",
          wb."name" as "wbName",
          wb."type"::text as "wbType"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" IN (
        "#,
    );
    let mut separated = qb.separated(", ");
    for id in &ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    let rows = qb.build().fetch_all(pool).await?;
    for row in rows {
        let mut word = map_postgres_word_row(&row);
        let wb_id: String = row.try_get("wbId").unwrap_or_default();
        if !wb_id.is_empty() {
            let wb_name: String = row.try_get("wbName").unwrap_or_default();
            let wb_type: String = row.try_get("wbType").unwrap_or_default();
            word.word_book = Some(WordBookSummary {
                id: wb_id,
                name: wb_name,
                r#type: wb_type,
            });
        }
        by_id.insert(word.id.clone(), word);
    }

    Ok(ids.into_iter().filter_map(|id| by_id.remove(&id)).collect())
}

async fn ensure_default_user_word_book(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    _now_iso: &str,
) -> Result<String, sqlx::Error> {
    if let Some(existing) = select_first_user_word_book(proxy, user_id).await? {
        return Ok(existing);
    }

    let word_book_id = uuid::Uuid::new_v4().to_string();
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "word_books"
          ("id","name","type","userId","isPublic","wordCount","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        "#,
    )
    .bind(&word_book_id)
    .bind("我的单词本")
    .bind("USER")
    .bind(user_id)
    .bind(false)
    .bind(0_i64)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(word_book_id)
}

async fn select_first_user_word_book(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    sqlx::query_scalar(
        r#"
        SELECT "id"
        FROM "word_books"
        WHERE "userId" = $1 AND "type"::text = 'USER'
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

async fn insert_word(
    proxy: &crate::db::DatabaseProxy,
    word_id: &str,
    word_book_id: &str,
    spelling: &str,
    phonetic: &str,
    meanings: &[String],
    examples: &[String],
    audio_url: Option<&str>,
    _now_iso: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "words"
          ("id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        "#,
    )
    .bind(word_id)
    .bind(spelling)
    .bind(phonetic)
    .bind(meanings.to_vec())
    .bind(examples.to_vec())
    .bind(audio_url)
    .bind(word_book_id)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

async fn apply_word_update(
    proxy: &crate::db::DatabaseProxy,
    word: &WordResponse,
    _now_iso: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "words"
        SET "spelling" = $1,
            "phonetic" = $2,
            "meanings" = $3,
            "examples" = $4,
            "audioUrl" = $5,
            "updatedAt" = $6
        WHERE "id" = $7
        "#,
    )
    .bind(&word.spelling)
    .bind(&word.phonetic)
    .bind(&word.meanings)
    .bind(&word.examples)
    .bind(&word.audio_url)
    .bind(now)
    .bind(&word.id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn delete_word_record(
    proxy: &crate::db::DatabaseProxy,
    word_id: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    sqlx::query(r#"DELETE FROM "words" WHERE "id" = $1"#)
        .bind(word_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn delete_words(
    proxy: &crate::db::DatabaseProxy,
    word_ids: &[String],
) -> Result<(), sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(r#"DELETE FROM "words" WHERE "id" IN ("#);
    let mut separated = qb.separated(", ");
    for id in word_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");
    qb.build().execute(pool).await?;
    Ok(())
}

async fn select_word_book_ids_for_words(
    proxy: &crate::db::DatabaseProxy,
    word_ids: &[String],
) -> Result<Vec<(String, Option<String>)>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT w."wordBookId" as "wordBookId", wb."userId" as "userId"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" IN (
        "#,
    );
    let mut separated = qb.separated(", ");
    for id in word_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    let rows = qb.build().fetch_all(pool).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let book_id: String = row.try_get("wordBookId")?;
        let owner: Option<String> = row.try_get("userId").ok();
        out.push((book_id, owner));
    }
    Ok(out)
}

async fn refresh_word_book_count(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<(), sqlx::Error> {
    let count = count_words_in_word_book(proxy, word_book_id).await?;
    let pool = proxy.pool();
    sqlx::query(r#"UPDATE "word_books" SET "wordCount" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(count)
        .bind(Utc::now().naive_utc())
        .bind(word_book_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn count_words_in_word_book(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<i64, sqlx::Error> {
    let pool = proxy.pool();
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" = $1"#)
        .bind(word_book_id)
        .fetch_one(pool)
        .await
}

fn map_postgres_word_row(row: &sqlx::postgres::PgRow) -> WordResponse {
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    WordResponse {
        id: row.try_get("id").unwrap_or_default(),
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").unwrap_or_default(),
        meanings: row
            .try_get::<Vec<String>, _>("meanings")
            .unwrap_or_default(),
        examples: row
            .try_get::<Vec<String>, _>("examples")
            .unwrap_or_default(),
        audio_url: row.try_get::<Option<String>, _>("audioUrl").ok().flatten(),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
        word_book: None,
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn escape_like(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '%' | '_' | '\\' => {
                out.push('\\');
                out.push(ch);
            }
            other => out.push(other),
        }
    }
    out
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
                        out.push(hi * 16 + lo);
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
            other => out.push(other),
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn from_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

async fn split_body(
    req: Request<Body>,
) -> Result<(axum::http::request::Parts, bytes::Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return Err(
                json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求").into_response(),
            );
        }
    };
    Ok((parts, body_bytes))
}
