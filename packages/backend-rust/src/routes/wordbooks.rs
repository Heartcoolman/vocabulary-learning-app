use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WordBookResponse {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cover_image: Option<String>,
    r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    is_public: bool,
    word_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    imported_at: Option<String>,
    created_at: String,
    updated_at: String,
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWordBookRequest {
    name: Option<String>,
    description: Option<String>,
    cover_image: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWordBookRequest {
    name: Option<Option<String>>,
    description: Option<Option<String>>,
    cover_image: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWordRequest {
    spelling: String,
    phonetic: Option<String>,
    meanings: Vec<String>,
    examples: Vec<String>,
    audio_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchAddWordsRequest {
    words: Vec<CreateWordRequest>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchAddWordsResult {
    imported: usize,
    failed: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    errors: Vec<String>,
}

pub async fn list_user_wordbooks(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user_id, _req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let books = match select_word_books(proxy.as_ref(), Some(&user_id), WordBookSelection::UserOnly)
        .await
    {
        Ok(books) => books,
        Err(err) => {
            tracing::warn!(error = %err, "user wordbooks query failed");
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
        data: books,
    })
    .into_response()
}

pub async fn list_system_wordbooks(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, _user_id, _req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let books = match select_word_books(proxy.as_ref(), None, WordBookSelection::SystemOnly).await {
        Ok(books) => books,
        Err(err) => {
            tracing::warn!(error = %err, "system wordbooks query failed");
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
        data: books,
    })
    .into_response()
}

pub async fn list_available_wordbooks(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (proxy, user_id, _req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let books = match select_word_books(
        proxy.as_ref(),
        Some(&user_id),
        WordBookSelection::SystemAndUser,
    )
    .await
    {
        Ok(books) => books,
        Err(err) => {
            tracing::warn!(error = %err, "available wordbooks query failed");
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
        data: books,
    })
    .into_response()
}

pub async fn create_wordbook(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: CreateWordBookRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
                .into_response()
        }
    };

    let name = payload.name.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "词书名称不能为空")
            .into_response();
    }
    if name.len() > 100 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "词书名称不能超过100个字符",
        )
        .into_response();
    }

    let description = match payload.description {
        Some(value) => {
            if value.len() > 500 {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    "BAD_REQUEST",
                    "词书描述不能超过500个字符",
                )
                .into_response();
            }
            Some(value.trim().to_string()).filter(|v| !v.is_empty())
        }
        None => None,
    };

    let cover_image = match payload.cover_image {
        Some(value) => {
            if value.len() > 500 {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    "BAD_REQUEST",
                    "封面图片URL不能超过500个字符",
                )
                .into_response();
            }
            let trimmed = value.trim().to_string();
            if !(trimmed.is_empty()
                || trimmed.starts_with("http://")
                || trimmed.starts_with("https://"))
            {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    "BAD_REQUEST",
                    "封面图片URL格式不正确",
                )
                .into_response();
            }
            Some(trimmed).filter(|v| !v.is_empty())
        }
        None => None,
    };

    let token = crate::auth::extract_token(&parts.headers);
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

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let id = uuid::Uuid::new_v4().to_string();

    if let Err(err) = insert_word_book(
        proxy.as_ref(),
        &id,
        &auth_user.id,
        &name,
        description.as_deref(),
        cover_image.as_deref(),
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "wordbook insert failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    (
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: WordBookResponse {
                id,
                name,
                description,
                cover_image,
                r#type: "USER".to_string(),
                user_id: Some(auth_user.id),
                is_public: false,
                word_count: 0,
                tags: None,
                source_url: None,
                source_version: None,
                source_author: None,
                imported_at: None,
                created_at: now_iso.clone(),
                updated_at: now_iso,
            },
        }),
    )
        .into_response()
}

pub async fn get_wordbook(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user_id, req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let word_book_id = req
        .uri()
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    if word_book_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }

    match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => {
            if book.r#type == "USER" && book.user_id.as_deref() != Some(&user_id) {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权访问此词书")
                    .into_response();
            }
            Json(SuccessResponse {
                success: true,
                data: book,
            })
            .into_response()
        }
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

pub async fn update_wordbook(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: UpdateWordBookRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
                .into_response()
        }
    };

    if let Some(Some(name)) = payload.name.as_ref() {
        if name.trim().is_empty() {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "词书名称不能为空")
                .into_response();
        }
        if name.len() > 100 {
            return json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "词书名称不能超过100个字符",
            )
            .into_response();
        }
    }
    if let Some(Some(desc)) = payload.description.as_ref() {
        if desc.len() > 500 {
            return json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "词书描述不能超过500个字符",
            )
            .into_response();
        }
    }
    if let Some(Some(url)) = payload.cover_image.as_ref() {
        if url.len() > 500 {
            return json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "封面图片URL不能超过500个字符",
            )
            .into_response();
        }
        if !(url.trim().is_empty() || url.starts_with("http://") || url.starts_with("https://")) {
            return json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "封面图片URL格式不正确",
            )
            .into_response();
        }
    }

    let word_book_id = parts
        .uri
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    if word_book_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }

    let token = crate::auth::extract_token(&parts.headers);
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

    let mut book = match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => book,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if book.r#type == "SYSTEM" {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无法修改系统词书")
            .into_response();
    }
    if book.user_id.as_deref() != Some(&auth_user.id) {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权修改此词书")
            .into_response();
    }

    if let Some(Some(name)) = payload.name {
        book.name = name.trim().to_string();
    }
    if let Some(Some(desc)) = payload.description {
        book.description = Some(desc.trim().to_string()).filter(|v| !v.is_empty());
    }
    if let Some(Some(url)) = payload.cover_image {
        let trimmed = url.trim().to_string();
        book.cover_image = Some(trimmed).filter(|v| !v.is_empty());
    }

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    book.updated_at = now_iso.clone();

    if let Err(err) = apply_word_book_update(proxy.as_ref(), &book, &now_iso).await {
        tracing::warn!(error = %err, "wordbook update failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    Json(SuccessResponse {
        success: true,
        data: book,
    })
    .into_response()
}

pub async fn delete_wordbook(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user_id, req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let word_book_id = req
        .uri()
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    if word_book_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }

    let book = match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => book,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if book.r#type == "SYSTEM" {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无法删除系统词书")
            .into_response();
    }
    if book.user_id.as_deref() != Some(&user_id) {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权删除此词书")
            .into_response();
    }

    let pool = proxy.pool();
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(err) => {
            tracing::warn!(error = %err, "wordbook delete tx begin failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if let Err(err) = sqlx::query(r#"DELETE FROM "words" WHERE "wordBookId" = $1"#)
        .bind(&word_book_id)
        .execute(&mut *tx)
        .await
    {
        tracing::warn!(error = %err, "wordbook words delete failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = sqlx::query(r#"DELETE FROM "word_books" WHERE "id" = $1"#)
        .bind(&word_book_id)
        .execute(&mut *tx)
        .await
    {
        tracing::warn!(error = %err, "wordbook delete failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = tx.commit().await {
        tracing::warn!(error = %err, "wordbook delete tx commit failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    Json(MessageResponse {
        success: true,
        message: "词书删除成功",
    })
    .into_response()
}

pub async fn get_wordbook_words(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user_id, req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let path = req.uri().path();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 3 {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }
    let word_book_id = segments[2].to_string();

    let query_string = req.uri().query().unwrap_or("");
    let fetch_all = get_query_param(query_string, "all")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let page = get_query_param(query_string, "page")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(1)
        .max(1);
    let page_size = get_query_param(query_string, "pageSize")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(100)
        .clamp(1, 500);
    let offset = (page - 1) * page_size;

    let book = match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => book,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if book.r#type == "USER" && book.user_id.as_deref() != Some(&user_id) {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "无权访问此词书")
            .into_response();
    }

    let words = if fetch_all {
        match select_all_words_in_word_book(proxy.as_ref(), &word_book_id).await {
            Ok(words) => words,
            Err(err) => {
                tracing::warn!(error = %err, "wordbook words query failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response();
            }
        }
    } else {
        match select_words_in_word_book_paginated(proxy.as_ref(), &word_book_id, page_size, offset)
            .await
        {
            Ok(words) => words,
            Err(err) => {
                tracing::warn!(error = %err, "wordbook words query failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response();
            }
        }
    };

    Json(SuccessResponse {
        success: true,
        data: words,
    })
    .into_response()
}

pub async fn add_word_to_wordbook(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: CreateWordRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
                .into_response()
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

    let path = parts.uri.path();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 4 {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }
    let word_book_id = segments[2].to_string();

    let token = crate::auth::extract_token(&parts.headers);
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

    let book = match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => book,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if book.r#type == "SYSTEM" {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "无法向系统词书添加单词",
        )
        .into_response();
    }
    if book.user_id.as_deref() != Some(&auth_user.id) {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "无权向此词书添加单词",
        )
        .into_response();
    }

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
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
            },
        }),
    )
        .into_response()
}

pub async fn batch_add_words_to_wordbook(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: BatchAddWordsRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
                .into_response()
        }
    };

    if payload.words.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "单词列表不能为空",
        )
        .into_response();
    }
    if payload.words.len() > 1000 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "单次导入不能超过1000个单词",
        )
        .into_response();
    }

    let path = parts.uri.path();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 4 {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }
    let word_book_id = segments[2].to_string();

    let token = crate::auth::extract_token(&parts.headers);
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

    let book = match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => book,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if book.r#type == "SYSTEM" {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "无法向系统词书添加单词",
        )
        .into_response();
    }
    if book.user_id.as_deref() != Some(&auth_user.id) {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "无权向此词书添加单词",
        )
        .into_response();
    }

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut imported = 0usize;
    let mut errors = Vec::new();

    for (idx, word) in payload.words.iter().enumerate() {
        let spelling = word.spelling.trim();
        if spelling.is_empty() {
            errors.push(format!("第{}个单词: 拼写不能为空", idx + 1));
            continue;
        }
        if word.meanings.is_empty() {
            errors.push(format!(
                "第{}个单词 '{}': 至少需要一个释义",
                idx + 1,
                spelling
            ));
            continue;
        }

        let phonetic = word.phonetic.as_deref().unwrap_or("");
        let word_id = uuid::Uuid::new_v4().to_string();

        if let Err(err) = insert_word(
            proxy.as_ref(),
            &word_id,
            &word_book_id,
            spelling,
            phonetic,
            &word.meanings,
            &word.examples,
            word.audio_url.as_deref(),
            &now_iso,
        )
        .await
        {
            tracing::warn!(error = %err, spelling = %spelling, "batch word insert failed");
            errors.push(format!("第{}个单词 '{}': 插入失败", idx + 1, spelling));
            continue;
        }
        imported += 1;
    }

    if let Err(err) = refresh_word_book_count(proxy.as_ref(), &word_book_id).await {
        tracing::warn!(error = %err, "word count refresh failed");
    }

    (
        StatusCode::OK,
        Json(SuccessResponse {
            success: true,
            data: BatchAddWordsResult {
                imported,
                failed: errors.len(),
                errors,
            },
        }),
    )
        .into_response()
}

pub async fn remove_word_from_wordbook(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (proxy, user_id, req) = match authenticate(&state, req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let segments: Vec<&str> = req
        .uri()
        .path()
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    if segments.len() < 5 {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "请求参数不合法")
            .into_response();
    }

    let word_book_id = segments[2].to_string();
    let word_id = segments[4].to_string();

    let book = match select_word_book_by_id(proxy.as_ref(), &word_book_id).await {
        Ok(Some(book)) => book,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "wordbook lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if book.r#type == "SYSTEM" {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "无法从系统词书删除单词",
        )
        .into_response();
    }
    if book.user_id.as_deref() != Some(&user_id) {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "无权从此词书删除单词",
        )
        .into_response();
    }

    let belongs = match word_belongs_to_book(proxy.as_ref(), &word_book_id, &word_id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "word belongs check failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if !belongs {
        return json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "单词不存在或不属于此词书",
        )
        .into_response();
    }

    if let Err(err) = delete_word_record(proxy.as_ref(), &word_id).await {
        tracing::warn!(error = %err, "word delete failed");
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

    Json(MessageResponse {
        success: true,
        message: "单词删除成功",
    })
    .into_response()
}

enum WordBookSelection {
    UserOnly,
    SystemOnly,
    SystemAndUser,
}

async fn select_word_books(
    proxy: &crate::db::DatabaseProxy,
    user_id: Option<&str>,
    selection: WordBookSelection,
) -> Result<Vec<WordBookResponse>, sqlx::Error> {
    let pool = proxy.pool();
    let (query, binds_user) = match selection {
        WordBookSelection::UserOnly => (
            r#"
            SELECT wb."id", wb."name", wb."description", wb."coverImage",
                   wb."type"::text as "type", wb."userId", wb."isPublic",
                   wb."tags", wb."sourceUrl", wb."sourceVersion", wb."sourceAuthor", wb."importedAt",
                   COUNT(w."id") as "wordCount", wb."createdAt", wb."updatedAt"
            FROM "word_books" wb
            LEFT JOIN "words" w ON w."wordBookId" = wb."id"
            WHERE wb."type"::text = 'USER' AND wb."userId" = $1
            GROUP BY wb."id"
            ORDER BY wb."createdAt" DESC
            "#,
            true,
        ),
        WordBookSelection::SystemOnly => (
            r#"
            SELECT wb."id", wb."name", wb."description", wb."coverImage",
                   wb."type"::text as "type", wb."userId", wb."isPublic",
                   wb."tags", wb."sourceUrl", wb."sourceVersion", wb."sourceAuthor", wb."importedAt",
                   COUNT(w."id") as "wordCount", wb."createdAt", wb."updatedAt"
            FROM "word_books" wb
            LEFT JOIN "words" w ON w."wordBookId" = wb."id"
            WHERE wb."type"::text = 'SYSTEM'
            GROUP BY wb."id"
            ORDER BY wb."createdAt" DESC
            "#,
            false,
        ),
        WordBookSelection::SystemAndUser => (
            r#"
            SELECT wb."id", wb."name", wb."description", wb."coverImage",
                   wb."type"::text as "type", wb."userId", wb."isPublic",
                   wb."tags", wb."sourceUrl", wb."sourceVersion", wb."sourceAuthor", wb."importedAt",
                   COUNT(w."id") as "wordCount", wb."createdAt", wb."updatedAt"
            FROM "word_books" wb
            LEFT JOIN "words" w ON w."wordBookId" = wb."id"
            WHERE (wb."type"::text = 'SYSTEM') OR (wb."type"::text = 'USER' AND wb."userId" = $1)
            GROUP BY wb."id"
            ORDER BY wb."type"::text ASC, wb."createdAt" DESC
            "#,
            true,
        ),
    };

    let mut query = sqlx::query(query);
    if binds_user {
        query = query.bind(user_id.unwrap_or_default());
    }
    let rows = query.fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| map_postgres_word_book_row(&row))
        .collect())
}

async fn select_word_book_by_id(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<Option<WordBookResponse>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT wb."id", wb."name", wb."description", wb."coverImage",
               wb."type"::text as "type", wb."userId", wb."isPublic",
               wb."tags", wb."sourceUrl", wb."sourceVersion", wb."sourceAuthor", wb."importedAt",
               COUNT(w."id") as "wordCount", wb."createdAt", wb."updatedAt"
        FROM "word_books" wb
        LEFT JOIN "words" w ON w."wordBookId" = wb."id"
        WHERE wb."id" = $1
        GROUP BY wb."id"
        LIMIT 1
        "#,
    )
    .bind(word_book_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| map_postgres_word_book_row(&row)))
}

async fn select_words_in_word_book(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<Vec<WordResponse>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
        FROM "words"
        WHERE "wordBookId" = $1
        ORDER BY "createdAt" DESC
        "#,
    )
    .bind(word_book_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| map_postgres_word_row(&row))
        .collect())
}

async fn select_all_words_in_word_book(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<Vec<WordResponse>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
        FROM "words"
        WHERE "wordBookId" = $1
        ORDER BY "createdAt" DESC
        "#,
    )
    .bind(word_book_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| map_postgres_word_row(&row))
        .collect())
}

async fn select_words_in_word_book_paginated(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<WordResponse>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
        FROM "words"
        WHERE "wordBookId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(word_book_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| map_postgres_word_row(&row))
        .collect())
}

fn get_query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;

        if k == key {
            Some(v)
        } else {
            None
        }
    })
}

async fn word_belongs_to_book(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
    word_id: &str,
) -> Result<bool, sqlx::Error> {
    let pool = proxy.pool();
    let exists: Option<String> = sqlx::query_scalar(
        r#"SELECT "id" FROM "words" WHERE "id" = $1 AND "wordBookId" = $2 LIMIT 1"#,
    )
    .bind(word_id)
    .bind(word_book_id)
    .fetch_optional(pool)
    .await?;
    Ok(exists.is_some())
}

async fn insert_word_book(
    proxy: &crate::db::DatabaseProxy,
    id: &str,
    user_id: &str,
    name: &str,
    description: Option<&str>,
    cover_image: Option<&str>,
    _now_iso: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "word_books"
          ("id","name","description","type","userId","isPublic","wordCount","coverImage","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind("USER")
    .bind(user_id)
    .bind(false)
    .bind(0_i64)
    .bind(cover_image)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

async fn apply_word_book_update(
    proxy: &crate::db::DatabaseProxy,
    book: &WordBookResponse,
    _now_iso: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "word_books"
        SET "name" = $1, "description" = $2, "coverImage" = $3, "updatedAt" = $4
        WHERE "id" = $5
        "#,
    )
    .bind(&book.name)
    .bind(&book.description)
    .bind(&book.cover_image)
    .bind(now)
    .bind(&book.id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn delete_words_in_wordbook(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    sqlx::query(r#"DELETE FROM "words" WHERE "wordBookId" = $1"#)
        .bind(word_book_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn delete_word_book_record(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    sqlx::query(r#"DELETE FROM "word_books" WHERE "id" = $1"#)
        .bind(word_book_id)
        .execute(pool)
        .await?;
    Ok(())
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

async fn refresh_word_book_count(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<(), sqlx::Error> {
    let count = count_words(proxy, word_book_id).await?;
    let pool = proxy.pool();
    sqlx::query(r#"UPDATE "word_books" SET "wordCount" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(count)
        .bind(Utc::now().naive_utc())
        .bind(word_book_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn count_words(
    proxy: &crate::db::DatabaseProxy,
    word_book_id: &str,
) -> Result<i64, sqlx::Error> {
    let pool = proxy.pool();
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" = $1"#)
        .bind(word_book_id)
        .fetch_one(pool)
        .await
}

fn map_postgres_word_book_row(row: &sqlx::postgres::PgRow) -> WordBookResponse {
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let imported_at: Option<NaiveDateTime> = row.try_get("importedAt").ok().flatten();

    WordBookResponse {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok().flatten(),
        cover_image: row
            .try_get::<Option<String>, _>("coverImage")
            .ok()
            .flatten(),
        r#type: row.try_get("type").unwrap_or_else(|_| "SYSTEM".to_string()),
        user_id: row.try_get::<Option<String>, _>("userId").ok().flatten(),
        is_public: row.try_get::<bool, _>("isPublic").unwrap_or(false),
        word_count: row.try_get::<i64, _>("wordCount").unwrap_or(0),
        tags: row.try_get::<Option<Vec<String>>, _>("tags").ok().flatten(),
        source_url: row.try_get::<Option<String>, _>("sourceUrl").ok().flatten(),
        source_version: row
            .try_get::<Option<String>, _>("sourceVersion")
            .ok()
            .flatten(),
        source_author: row
            .try_get::<Option<String>, _>("sourceAuthor")
            .ok()
            .flatten(),
        imported_at: imported_at.map(format_naive_iso),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
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
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

async fn authenticate(
    state: &AppState,
    req: Request<Body>,
) -> Result<
    (
        std::sync::Arc<crate::db::DatabaseProxy>,
        String,
        Request<Body>,
    ),
    Response,
> {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return Err(
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response(),
        );
    };

    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response());
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return Err(json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response());
        }
    };

    Ok((proxy, auth_user.id, req))
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
