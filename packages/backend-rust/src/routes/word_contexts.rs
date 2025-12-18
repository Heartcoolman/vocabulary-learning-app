use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::Extension;
use axum::Json;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::middleware::RequestDbState;
use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateContextRequest {
    word_id: String,
    context_type: String,
    content: String,
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchDeleteRequest {
    context_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecommendRequest {
    word_ids: Vec<String>,
    context_type: Option<String>,
    difficulty: Option<String>,
    max_per_word: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateContentRequest {
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEffectivenessRequest {
    score: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetContextsQuery {
    #[serde(rename = "type")]
    r#type: Option<String>,
    difficulty: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    sort_by: Option<String>,
    sort_order: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetRandomQuery {
    #[serde(rename = "type")]
    r#type: Option<String>,
    difficulty: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetBestQuery {
    preferred_type: Option<String>,
    user_level: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WordContextData {
    id: String,
    word_id: String,
    context_type: String,
    content: String,
    metadata: Option<serde_json::Value>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeleteContextResponse {
    context_id: String,
    deleted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchDeleteResponse {
    deleted_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageResponse {
    context_id: String,
    recorded: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EffectivenessResponse {
    context_id: String,
    score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextStats {
    word_id: String,
    total: i64,
    by_type: HashMap<String, i64>,
    most_used: Option<WordContextData>,
    most_effective: Option<WordContextData>,
}

pub fn router() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/", post(add_context))
        .route("/batch", post(add_contexts_batch).delete(delete_contexts_batch))
        .route("/recommend", post(recommend_contexts_for_words))
        .route("/word/:wordId", get(get_contexts_for_word))
        .route("/word/:wordId/random", get(get_random_context))
        .route("/word/:wordId/best", get(get_best_context))
        .route("/word/:wordId/stats", get(get_context_stats))
        .route("/:contextId/content", put(update_content))
        .route("/:contextId/metadata", put(update_metadata))
        .route("/:contextId/usage", post(record_usage))
        .route("/:contextId/effectiveness", put(update_effectiveness))
        .route("/:contextId", delete(delete_context))
}

async fn add_context(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(payload): Json<CreateContextRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    let word_id = payload.word_id.trim().to_string();
    if word_id.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_WORD_ID",
            "wordId 参数必填且必须是字符串",
        ));
    }

    let context_type = normalize_context_type(payload.context_type.as_str())?;
    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_CONTENT",
            "content 参数必填且不能为空",
        ));
    }

    assert_word_accessible(proxy.as_ref(), db_state, &user.id, &word_id).await?;

    let metadata = match payload.metadata {
        Some(value) if value.is_object() => Some(value),
        Some(_) => {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_METADATA",
                "metadata 必须是对象",
            ))
        }
        None => None,
    };

    let context_id = uuid::Uuid::new_v4().to_string();
    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    insert_context(
        proxy.as_ref(),
        db_state,
        &context_id,
        &word_id,
        &context_type,
        &content,
        metadata.as_ref(),
        &now_iso,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: WordContextData {
                id: context_id,
                word_id,
                context_type,
                content,
                metadata,
                created_at: now_iso.clone(),
                updated_at: now_iso,
            },
        }),
    ))
}

async fn add_contexts_batch(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(payload): Json<Vec<CreateContextRequest>>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    if payload.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_REQUEST_BODY",
            "请求体必须是非空数组",
        ));
    }

    let mut unique_word_ids: Vec<String> = Vec::new();
    for item in &payload {
        let word_id = item.word_id.trim();
        let context_type = item.context_type.trim();
        let content = item.content.trim();
        if word_id.is_empty() || context_type.is_empty() || content.is_empty() {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "INCOMPLETE_REQUEST",
                "每个语境必须包含 wordId, contextType 和 content",
            ));
        }
        if !unique_word_ids.iter().any(|v| v == word_id) {
            unique_word_ids.push(word_id.to_string());
        }
    }

    let accessible_count = count_accessible_words(proxy.as_ref(), db_state, &user.id, &unique_word_ids).await?;
    if accessible_count != unique_word_ids.len() as i64 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "FORBIDDEN",
            "批量语境包含不存在或无权访问的单词",
        ));
    }

    let now_iso = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut created: Vec<WordContextData> = Vec::with_capacity(payload.len());

    for item in payload {
        let word_id = item.word_id.trim().to_string();
        let context_type = normalize_context_type(item.context_type.as_str())?;
        let content = item.content.trim().to_string();
        let metadata = match item.metadata {
            Some(value) if value.is_object() => Some(value),
            Some(_) => {
                return Err(json_error(
                    StatusCode::BAD_REQUEST,
                    "INVALID_METADATA",
                    "metadata 必须是对象",
                ))
            }
            None => None,
        };

        let context_id = uuid::Uuid::new_v4().to_string();
        insert_context(
            proxy.as_ref(),
            db_state,
            &context_id,
            &word_id,
            &context_type,
            &content,
            metadata.as_ref(),
            &now_iso,
        )
        .await?;

        created.push(WordContextData {
            id: context_id,
            word_id,
            context_type,
            content,
            metadata,
            created_at: now_iso.clone(),
            updated_at: now_iso.clone(),
        });
    }

    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: created,
        }),
    ))
}

async fn get_contexts_for_word(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<GetContextsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_word_accessible(proxy.as_ref(), db_state, &user.id, &word_id).await?;

    let sort_by = query.sort_by.clone().unwrap_or_else(|| "createdAt".to_string());
    let sort_order = query.sort_order.clone().unwrap_or_else(|| "desc".to_string());

    let options = ContextQueryOptions {
        context_type: query.r#type.map(|v| normalize_context_type(&v)).transpose()?,
        difficulty: query.difficulty.map(|v| normalize_difficulty(&v)).transpose()?,
        limit: query.limit.unwrap_or(20).clamp(1, 100),
        offset: query.offset.unwrap_or(0).max(0),
        sort_by,
        sort_order,
    };

    let contexts = select_contexts_for_word(proxy.as_ref(), db_state, &user.id, &word_id, &options).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: contexts,
    }))
}

async fn get_random_context(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<GetRandomQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_word_accessible(proxy.as_ref(), db_state, &user.id, &word_id).await?;

    let context_type = query.r#type.map(|v| normalize_context_type(&v)).transpose()?;
    let difficulty = query.difficulty.map(|v| normalize_difficulty(&v)).transpose()?;

    let context = select_random_context(proxy.as_ref(), db_state, &word_id, context_type.as_deref(), difficulty.as_deref()).await?;
    let Some(context) = context else {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "CONTEXT_NOT_FOUND",
            "未找到符合条件的语境",
        ));
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: context,
    }))
}

async fn get_best_context(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<GetBestQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_word_accessible(proxy.as_ref(), db_state, &user.id, &word_id).await?;

    let preferred_type = query
        .preferred_type
        .map(|v| normalize_context_type(&v))
        .transpose()?;

    let difficulty = query
        .user_level
        .as_deref()
        .and_then(map_user_level_to_difficulty);

    let mut best = None;
    if let (Some(preferred_type), Some(difficulty)) = (preferred_type.as_deref(), difficulty.as_deref()) {
        best = select_random_context(
            proxy.as_ref(),
            db_state,
            &word_id,
            Some(preferred_type),
            Some(difficulty),
        )
        .await?;
    }

    if best.is_none() {
        if let Some(difficulty) = difficulty.as_deref() {
            best = select_random_context(proxy.as_ref(), db_state, &word_id, None, Some(difficulty)).await?;
        }
    }

    if best.is_none() {
        best = select_random_context(proxy.as_ref(), db_state, &word_id, None, None).await?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: best,
    }))
}

async fn get_context_stats(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_word_accessible(proxy.as_ref(), db_state, &user.id, &word_id).await?;

    let contexts = select_all_contexts_for_word(proxy.as_ref(), db_state, &word_id).await?;
    let mut by_type: HashMap<String, i64> = HashMap::from([
        ("SENTENCE".to_string(), 0),
        ("CONVERSATION".to_string(), 0),
        ("ARTICLE".to_string(), 0),
        ("MEDIA".to_string(), 0),
    ]);

    let mut most_used: Option<WordContextData> = None;
    let mut most_effective: Option<WordContextData> = None;
    let mut max_usage = 0_i64;
    let mut max_effectiveness = 0_f64;

    for context in contexts.iter() {
        *by_type.entry(context.context_type.clone()).or_insert(0) += 1;

        let usage = context
            .metadata
            .as_ref()
            .and_then(|meta| meta.get("usageCount"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if usage > 0 && usage > max_usage {
            max_usage = usage;
            most_used = Some(context.clone());
        }

        let eff = context
            .metadata
            .as_ref()
            .and_then(|meta| meta.get("effectivenessScore"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if eff > 0.0 && eff > max_effectiveness {
            max_effectiveness = eff;
            most_effective = Some(context.clone());
        }
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: ContextStats {
            word_id,
            total: contexts.len() as i64,
            by_type,
            most_used,
            most_effective,
        },
    }))
}

async fn update_content(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(context_id): Path<String>,
    Json(payload): Json<UpdateContentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_context_accessible(proxy.as_ref(), db_state, &user.id, &context_id).await?;

    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_CONTENT",
            "content 参数必填且不能为空",
        ));
    }

    update_context_content(proxy.as_ref(), db_state, &context_id, &content).await?;
    let updated = select_context_by_id(proxy.as_ref(), db_state, &context_id).await?.ok_or_else(|| {
        json_error(StatusCode::NOT_FOUND, "CONTEXT_NOT_FOUND", "语境不存在或无权访问")
    })?;

    Ok(Json(SuccessResponse { success: true, data: updated }))
}

async fn update_metadata(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(context_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_context_accessible(proxy.as_ref(), db_state, &user.id, &context_id).await?;

    let new_meta = payload.as_object().cloned().ok_or_else(|| {
        json_error(StatusCode::BAD_REQUEST, "INVALID_METADATA", "metadata 必须是对象")
    })?;

    let existing = select_context_metadata(proxy.as_ref(), db_state, &context_id).await?;
    let mut merged = existing.unwrap_or_default();
    for (k, v) in new_meta {
        merged.insert(k, v);
    }

    update_context_metadata(proxy.as_ref(), db_state, &context_id, &merged).await?;

    let updated = select_context_by_id(proxy.as_ref(), db_state, &context_id).await?.ok_or_else(|| {
        json_error(StatusCode::NOT_FOUND, "CONTEXT_NOT_FOUND", "语境不存在或无权访问")
    })?;

    Ok(Json(SuccessResponse { success: true, data: updated }))
}

async fn record_usage(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(context_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_context_accessible(proxy.as_ref(), db_state, &user.id, &context_id).await?;

    let existing = select_context_metadata(proxy.as_ref(), db_state, &context_id).await?.unwrap_or_default();
    let mut merged = existing;

    let usage_count = merged.get("usageCount").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    let view_count = merged.get("viewCount").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    merged.insert("usageCount".to_string(), serde_json::Value::Number(usage_count.into()));
    merged.insert("viewCount".to_string(), serde_json::Value::Number(view_count.into()));

    update_context_metadata(proxy.as_ref(), db_state, &context_id, &merged).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: UsageResponse { context_id, recorded: true },
    }))
}

async fn update_effectiveness(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(context_id): Path<String>,
    Json(payload): Json<UpdateEffectivenessRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_context_accessible(proxy.as_ref(), db_state, &user.id, &context_id).await?;

    if !(0.0..=1.0).contains(&payload.score) || payload.score.is_nan() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_SCORE",
            "score 必须是 0-1 之间的数字",
        ));
    }

    let existing = select_context_metadata(proxy.as_ref(), db_state, &context_id).await?.unwrap_or_default();
    let mut merged = existing;
    merged.insert(
        "effectivenessScore".to_string(),
        serde_json::Value::Number(
            serde_json::Number::from_f64(payload.score)
                .unwrap_or_else(|| serde_json::Number::from(0)),
        ),
    );

    update_context_metadata(proxy.as_ref(), db_state, &context_id, &merged).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: EffectivenessResponse { context_id, score: payload.score },
    }))
}

async fn delete_context(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(context_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    assert_context_accessible(proxy.as_ref(), db_state, &user.id, &context_id).await?;
    delete_context_by_id(proxy.as_ref(), db_state, &context_id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: DeleteContextResponse { context_id, deleted: true },
    }))
}

async fn delete_contexts_batch(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(payload): Json<BatchDeleteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    if payload.context_ids.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_CONTEXT_IDS",
            "contextIds 必须是非空数组",
        ));
    }

    let count = count_accessible_contexts(proxy.as_ref(), db_state, &user.id, &payload.context_ids).await?;
    if count != payload.context_ids.len() as i64 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "FORBIDDEN",
            "批量删除包含不存在或无权访问的语境",
        ));
    }

    delete_contexts(proxy.as_ref(), db_state, &payload.context_ids).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: BatchDeleteResponse { deleted_count: count },
    }))
}

async fn recommend_contexts_for_words(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(payload): Json<RecommendRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    if payload.word_ids.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_WORD_IDS",
            "wordIds 必须是非空数组",
        ));
    }

    let context_type = payload.context_type.map(|v| normalize_context_type(&v)).transpose()?;
    let difficulty = payload.difficulty.map(|v| normalize_difficulty(&v)).transpose()?;
    let max_per_word = payload.max_per_word.unwrap_or(3).clamp(1, 10);

    let mut result: HashMap<String, Vec<WordContextData>> = HashMap::new();
    for word_id in payload.word_ids {
        let accessible = assert_word_accessible(proxy.as_ref(), db_state, &user.id, &word_id).await;
        if accessible.is_err() {
            result.insert(word_id, Vec::new());
            continue;
        }

        let options = ContextQueryOptions {
            context_type: context_type.clone(),
            difficulty: difficulty.clone(),
            limit: max_per_word,
            offset: 0,
            sort_by: "effectivenessScore".to_string(),
            sort_order: "desc".to_string(),
        };

        let contexts =
            select_contexts_for_word(proxy.as_ref(), db_state, &user.id, &word_id, &options).await?;
        result.insert(word_id, contexts);
    }

    Ok(Json(SuccessResponse { success: true, data: result }))
}

async fn require_user(
    state: &AppState,
    request_state: Option<Extension<RequestDbState>>,
    headers: &HeaderMap,
) -> Result<(std::sync::Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser, DatabaseState), AppError> {
    let token = crate::auth::extract_token(headers).ok_or_else(|| {
        json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
    })?;

    let db_state = request_state
        .map(|Extension(value)| value.0)
        .unwrap_or(DatabaseState::Normal);

    let proxy = state
        .db_proxy()
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), db_state, &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    Ok((proxy, user, db_state))
}

fn normalize_context_type(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if !matches!(value, "SENTENCE" | "CONVERSATION" | "ARTICLE" | "MEDIA") {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_CONTEXT_TYPE",
            "contextType 必须是 SENTENCE, CONVERSATION, ARTICLE 或 MEDIA",
        ));
    }
    Ok(value.to_string())
}

fn normalize_difficulty(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if !matches!(value, "easy" | "medium" | "hard") {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_DIFFICULTY",
            "difficulty 必须是 easy, medium 或 hard",
        ));
    }
    Ok(value.to_string())
}

fn map_user_level_to_difficulty(value: &str) -> Option<String> {
    match value {
        "beginner" => Some("easy".to_string()),
        "intermediate" => Some("medium".to_string()),
        "advanced" => Some("hard".to_string()),
        _ => None,
    }
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
struct ContextRow {
    id: String,
    word_id: String,
    context_type: String,
    content: String,
    metadata: Option<serde_json::Value>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct ContextQueryOptions {
    context_type: Option<String>,
    difficulty: Option<String>,
    limit: i64,
    offset: i64,
    sort_by: String,
    sort_order: String,
}

async fn assert_word_accessible(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
) -> Result<(), AppError> {
    let selected = select_read_pool(proxy, state).await?;
    let ok = match selected {
        SelectedReadPool::Primary(pool) => is_word_accessible_pg(&pool, user_id, word_id).await?,
        SelectedReadPool::Fallback(pool) => is_word_accessible_sqlite(&pool, user_id, word_id).await?,
    };

    if ok {
        Ok(())
    } else {
        Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "单词不存在或无权访问",
        ))
    }
}

async fn assert_context_accessible(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    context_id: &str,
) -> Result<(), AppError> {
    let selected = select_read_pool(proxy, state).await?;
    let ok = match selected {
        SelectedReadPool::Primary(pool) => is_context_accessible_pg(&pool, user_id, context_id).await?,
        SelectedReadPool::Fallback(pool) => is_context_accessible_sqlite(&pool, user_id, context_id).await?,
    };

    if ok {
        Ok(())
    } else {
        Err(json_error(
            StatusCode::NOT_FOUND,
            "CONTEXT_NOT_FOUND",
            "语境不存在或无权访问",
        ))
    }
}

async fn count_accessible_words(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_ids: &[String],
) -> Result<i64, AppError> {
    let selected = select_read_pool(proxy, state).await?;
    match selected {
        SelectedReadPool::Primary(pool) => count_accessible_words_pg(&pool, user_id, word_ids).await,
        SelectedReadPool::Fallback(pool) => count_accessible_words_sqlite(&pool, user_id, word_ids).await,
    }
}

async fn count_accessible_contexts(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    context_ids: &[String],
) -> Result<i64, AppError> {
    let selected = select_read_pool(proxy, state).await?;
    match selected {
        SelectedReadPool::Primary(pool) => count_accessible_contexts_pg(&pool, user_id, context_ids).await,
        SelectedReadPool::Fallback(pool) => count_accessible_contexts_sqlite(&pool, user_id, context_ids).await,
    }
}

async fn is_word_accessible_pg(pool: &PgPool, user_id: &str, word_id: &str) -> Result<bool, AppError> {
    let row = sqlx::query_scalar::<_, String>(
        r#"
        SELECT w."id"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" = $1
          AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = $2))
        LIMIT 1
        "#,
    )
    .bind(word_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(row.is_some())
}

async fn is_word_accessible_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    word_id: &str,
) -> Result<bool, AppError> {
    let row = sqlx::query_scalar::<_, String>(
        r#"
        SELECT w."id"
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" = ?
          AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = ?))
        LIMIT 1
        "#,
    )
    .bind(word_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(row.is_some())
}

async fn is_context_accessible_pg(
    pool: &PgPool,
    user_id: &str,
    context_id: &str,
) -> Result<bool, AppError> {
    let row = sqlx::query_scalar::<_, String>(
        r#"
        SELECT wc."id"
        FROM "word_contexts" wc
        JOIN "words" w ON w."id" = wc."wordId"
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE wc."id" = $1
          AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = $2))
        LIMIT 1
        "#,
    )
    .bind(context_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(row.is_some())
}

async fn is_context_accessible_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    context_id: &str,
) -> Result<bool, AppError> {
    let row = sqlx::query_scalar::<_, String>(
        r#"
        SELECT wc."id"
        FROM "word_contexts" wc
        JOIN "words" w ON w."id" = wc."wordId"
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE wc."id" = ?
          AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = ?))
        LIMIT 1
        "#,
    )
    .bind(context_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(row.is_some())
}

async fn count_accessible_words_pg(
    pool: &PgPool,
    user_id: &str,
    word_ids: &[String],
) -> Result<i64, AppError> {
    if word_ids.is_empty() {
        return Ok(0);
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT COUNT(*)
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" IN (
        "#,
    );
    {
        let mut separated = qb.separated(", ");
        for id in word_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
    }
    qb.push(r#" AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = "#)
        .push_bind(user_id)
        .push("))");
    let count: i64 = qb
        .build_query_scalar()
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(count)
}

async fn count_accessible_words_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    word_ids: &[String],
) -> Result<i64, AppError> {
    if word_ids.is_empty() {
        return Ok(0);
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT COUNT(*)
        FROM "words" w
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE w."id" IN (
        "#,
    );
    {
        let mut separated = qb.separated(", ");
        for id in word_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
    }
    qb.push(r#" AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = "#)
        .push_bind(user_id)
        .push("))");
    let count: i64 = qb
        .build_query_scalar()
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(count)
}

async fn count_accessible_contexts_pg(
    pool: &PgPool,
    user_id: &str,
    context_ids: &[String],
) -> Result<i64, AppError> {
    if context_ids.is_empty() {
        return Ok(0);
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT COUNT(*)
        FROM "word_contexts" wc
        JOIN "words" w ON w."id" = wc."wordId"
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE wc."id" IN (
        "#,
    );
    {
        let mut separated = qb.separated(", ");
        for id in context_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
    }
    qb.push(r#" AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = "#)
        .push_bind(user_id)
        .push("))");
    let count: i64 = qb
        .build_query_scalar()
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(count)
}

async fn count_accessible_contexts_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    context_ids: &[String],
) -> Result<i64, AppError> {
    if context_ids.is_empty() {
        return Ok(0);
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
        r#"
        SELECT COUNT(*)
        FROM "word_contexts" wc
        JOIN "words" w ON w."id" = wc."wordId"
        JOIN "word_books" wb ON wb."id" = w."wordBookId"
        WHERE wc."id" IN (
        "#,
    );
    {
        let mut separated = qb.separated(", ");
        for id in context_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
    }
    qb.push(r#" AND (wb."type" = 'SYSTEM' OR (wb."type" = 'USER' AND wb."userId" = "#)
        .push_bind(user_id)
        .push("))");
    let count: i64 = qb
        .build_query_scalar()
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(count)
}

async fn select_contexts_for_word(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_id: &str,
    options: &ContextQueryOptions,
) -> Result<Vec<WordContextData>, AppError> {
    assert_word_accessible(proxy, state, user_id, word_id).await?;

    let contexts = select_context_rows(proxy, state, word_id, options).await?;
    Ok(contexts.into_iter().map(map_context_row).collect())
}

async fn select_context_rows(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    word_id: &str,
    options: &ContextQueryOptions,
) -> Result<Vec<ContextRow>, AppError> {
    let selected = select_read_pool(proxy, state).await?;
    match selected {
        SelectedReadPool::Primary(pool) => select_context_rows_pg(&pool, word_id, options).await,
        SelectedReadPool::Fallback(pool) => select_context_rows_sqlite(&pool, word_id, options).await,
    }
}

async fn select_context_rows_pg(
    pool: &PgPool,
    word_id: &str,
    options: &ContextQueryOptions,
) -> Result<Vec<ContextRow>, AppError> {
    let sort_order = if options.sort_order.to_ascii_lowercase() == "asc" { "ASC" } else { "DESC" };
    let needs_in_memory = matches!(options.sort_by.as_str(), "usageCount" | "effectivenessScore");

    if !needs_in_memory {
        let sql = format!(
            r#"
            SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
            FROM "word_contexts"
            WHERE "wordId" = $1
              AND ($2::text IS NULL OR "contextType" = $2)
              AND ($3::text IS NULL OR ("metadata"->>'difficulty') = $3)
            ORDER BY "createdAt" {sort_order}
            LIMIT $4 OFFSET $5
            "#
        );
        let rows = sqlx::query(&sql)
            .bind(word_id)
            .bind(options.context_type.as_deref())
            .bind(options.difficulty.as_deref())
            .bind(options.limit)
            .bind(options.offset)
            .fetch_all(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        return Ok(rows.into_iter().map(map_context_row_pg).collect());
    }

    let candidate_take = (options.limit + options.offset + 200).min(1000);
    let sql = format!(
        r#"
        SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
        FROM "word_contexts"
        WHERE "wordId" = $1
          AND ($2::text IS NULL OR "contextType" = $2)
          AND ($3::text IS NULL OR ("metadata"->>'difficulty') = $3)
        ORDER BY "createdAt" {sort_order}
        LIMIT $4
        "#
    );
    let rows = sqlx::query(&sql)
        .bind(word_id)
        .bind(options.context_type.as_deref())
        .bind(options.difficulty.as_deref())
        .bind(candidate_take)
        .fetch_all(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    let mut contexts: Vec<ContextRow> = rows.into_iter().map(map_context_row_pg).collect();
    sort_contexts_by_metadata(&mut contexts, options.sort_by.as_str(), options.sort_order.as_str());
    let start = options.offset.min(contexts.len() as i64) as usize;
    let end = (options.offset + options.limit).min(contexts.len() as i64) as usize;
    Ok(contexts[start..end].to_vec())
}

async fn select_context_rows_sqlite(
    pool: &SqlitePool,
    word_id: &str,
    options: &ContextQueryOptions,
) -> Result<Vec<ContextRow>, AppError> {
    let sort_order = if options.sort_order.to_ascii_lowercase() == "asc" { "ASC" } else { "DESC" };
    let needs_in_memory = matches!(options.sort_by.as_str(), "usageCount" | "effectivenessScore");
    let needs_metadata_filter = options.difficulty.is_some();

    if !needs_in_memory && !needs_metadata_filter {
        let sql = format!(
            r#"
            SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
            FROM "word_contexts"
            WHERE "wordId" = ?
              AND (? IS NULL OR "contextType" = ?)
            ORDER BY "createdAt" {sort_order}
            LIMIT ? OFFSET ?
            "#
        );
        let rows = sqlx::query(&sql)
            .bind(word_id)
            .bind(options.context_type.as_deref())
            .bind(options.context_type.as_deref())
            .bind(options.limit)
            .bind(options.offset)
            .fetch_all(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        return Ok(rows.into_iter().map(map_context_row_sqlite).collect());
    }

    let candidate_take = (options.limit + options.offset + 200).min(1000);
    let sql = format!(
        r#"
        SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
        FROM "word_contexts"
        WHERE "wordId" = ?
          AND (? IS NULL OR "contextType" = ?)
        ORDER BY "createdAt" {sort_order}
        LIMIT ?
        "#
    );
    let rows = sqlx::query(&sql)
        .bind(word_id)
        .bind(options.context_type.as_deref())
        .bind(options.context_type.as_deref())
        .bind(candidate_take)
        .fetch_all(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut contexts: Vec<ContextRow> = rows.into_iter().map(map_context_row_sqlite).collect();

    if let Some(difficulty) = options.difficulty.as_deref() {
        contexts.retain(|ctx| {
            ctx.metadata
                .as_ref()
                .and_then(|meta| meta.get("difficulty"))
                .and_then(|v| v.as_str())
                .is_some_and(|v| v == difficulty)
        });
    }

    if needs_in_memory {
        sort_contexts_by_metadata(&mut contexts, options.sort_by.as_str(), options.sort_order.as_str());
    }

    let start = options.offset.min(contexts.len() as i64) as usize;
    let end = (options.offset + options.limit).min(contexts.len() as i64) as usize;
    Ok(contexts[start..end].to_vec())
}

async fn select_all_contexts_for_word(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    word_id: &str,
) -> Result<Vec<WordContextData>, AppError> {
    let options = ContextQueryOptions {
        context_type: None,
        difficulty: None,
        limit: 1000,
        offset: 0,
        sort_by: "createdAt".to_string(),
        sort_order: "desc".to_string(),
    };
    let rows = select_context_rows(proxy, state, word_id, &options).await?;
    Ok(rows.into_iter().map(map_context_row).collect())
}

async fn select_random_context(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    word_id: &str,
    context_type: Option<&str>,
    difficulty: Option<&str>,
) -> Result<Option<WordContextData>, AppError> {
    let selected = select_read_pool(proxy, state).await?;
    match selected {
        SelectedReadPool::Primary(pool) => {
            let sql = r#"
                SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
                FROM "word_contexts"
                WHERE "wordId" = $1
                  AND ($2::text IS NULL OR "contextType" = $2)
                  AND ($3::text IS NULL OR ("metadata"->>'difficulty') = $3)
                ORDER BY RANDOM()
                LIMIT 1
            "#;
            let row = sqlx::query(sql)
                .bind(word_id)
                .bind(context_type)
                .bind(difficulty)
                .fetch_optional(&pool)
                .await
                .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
            Ok(row.map(map_context_row_pg).map(map_context_row))
        }
        SelectedReadPool::Fallback(pool) => {
            let sql = r#"
                SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
                FROM "word_contexts"
                WHERE "wordId" = ?
                  AND (? IS NULL OR "contextType" = ?)
                ORDER BY RANDOM()
                LIMIT 50
            "#;
            let rows = sqlx::query(sql)
                .bind(word_id)
                .bind(context_type)
                .bind(context_type)
                .fetch_all(&pool)
                .await
                .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let mut contexts: Vec<ContextRow> = rows.into_iter().map(map_context_row_sqlite).collect();
            if let Some(diff) = difficulty {
                contexts.retain(|ctx| {
                    ctx.metadata
                        .as_ref()
                        .and_then(|meta| meta.get("difficulty"))
                        .and_then(|v| v.as_str())
                        .is_some_and(|v| v == diff)
                });
            }
            Ok(contexts.into_iter().next().map(map_context_row))
        }
    }
}

fn sort_contexts_by_metadata(contexts: &mut [ContextRow], field: &str, order: &str) {
    let asc = order.to_ascii_lowercase() == "asc";
    contexts.sort_by(|a, b| {
        let va = metadata_number(a.metadata.as_ref(), field);
        let vb = metadata_number(b.metadata.as_ref(), field);
        let ord = va
            .partial_cmp(&vb)
            .unwrap_or(std::cmp::Ordering::Equal);
        if asc { ord } else { ord.reverse() }
    });
}

fn metadata_number(meta: Option<&serde_json::Value>, field: &str) -> f64 {
    meta.and_then(|v| v.get(field)).and_then(|v| v.as_f64()).unwrap_or(0.0)
}

async fn select_context_by_id(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_id: &str,
) -> Result<Option<WordContextData>, AppError> {
    let selected = select_read_pool(proxy, state).await?;
    let row = match selected {
        SelectedReadPool::Primary(pool) => sqlx::query(
            r#"
            SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
            FROM "word_contexts"
            WHERE "id" = $1
            LIMIT 1
            "#,
        )
        .bind(context_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?
        .map(map_context_row_pg),
        SelectedReadPool::Fallback(pool) => sqlx::query(
            r#"
            SELECT "id","wordId","contextType","content","metadata","createdAt","updatedAt"
            FROM "word_contexts"
            WHERE "id" = ?
            LIMIT 1
            "#,
        )
        .bind(context_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?
        .map(map_context_row_sqlite),
    };

    Ok(row.map(map_context_row))
}

async fn select_context_metadata(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_id: &str,
) -> Result<Option<serde_json::Map<String, serde_json::Value>>, AppError> {
    let selected = select_read_pool(proxy, state).await?;
    match selected {
        SelectedReadPool::Primary(pool) => {
            let row = sqlx::query_scalar::<_, Option<serde_json::Value>>(
                r#"SELECT "metadata" FROM "word_contexts" WHERE "id" = $1"#,
            )
            .bind(context_id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
            Ok(row.flatten().and_then(|v| v.as_object().cloned()))
        }
        SelectedReadPool::Fallback(pool) => {
            let row = sqlx::query_scalar::<_, Option<String>>(
                r#"SELECT "metadata" FROM "word_contexts" WHERE "id" = ?"#,
            )
            .bind(context_id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
            let value = row.flatten().and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok());
            Ok(value.and_then(|v| v.as_object().cloned()))
        }
    }
}

async fn insert_context(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_id: &str,
    word_id: &str,
    context_type: &str,
    content: &str,
    metadata: Option<&serde_json::Value>,
    now_iso: &str,
) -> Result<(), AppError> {
    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".to_string(), serde_json::Value::String(context_id.to_string()));
        data.insert("wordId".to_string(), serde_json::Value::String(word_id.to_string()));
        data.insert(
            "contextType".to_string(),
            serde_json::Value::String(context_type.to_string()),
        );
        data.insert("content".to_string(), serde_json::Value::String(content.to_string()));
        if let Some(meta) = metadata {
            data.insert("metadata".to_string(), meta.clone());
        }
        data.insert("createdAt".to_string(), serde_json::Value::String(now_iso.to_string()));
        data.insert("updatedAt".to_string(), serde_json::Value::String(now_iso.to_string()));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "word_contexts".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
        return Ok(());
    }

    let pool = proxy
        .primary_pool()
        .await
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "word_contexts"
          ("id","wordId","contextType","content","metadata","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        "#,
    )
    .bind(context_id)
    .bind(word_id)
    .bind(context_type)
    .bind(content)
    .bind(metadata.cloned())
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    Ok(())
}

async fn update_context_content(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_id: &str,
    content: &str,
) -> Result<(), AppError> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(context_id.to_string()));
        let mut data = serde_json::Map::new();
        data.insert("content".to_string(), serde_json::Value::String(content.to_string()));
        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "word_contexts".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
        return Ok(());
    }

    let pool = proxy
        .primary_pool()
        .await
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;
    let now = Utc::now().naive_utc();
    sqlx::query(r#"UPDATE "word_contexts" SET "content" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(content)
        .bind(now)
        .bind(context_id)
        .execute(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    Ok(())
}

async fn update_context_metadata(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_id: &str,
    metadata: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), AppError> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(context_id.to_string()));
        let mut data = serde_json::Map::new();
        data.insert("metadata".to_string(), serde_json::Value::Object(metadata.clone()));
        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "word_contexts".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
        return Ok(());
    }

    let pool = proxy
        .primary_pool()
        .await
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;
    let now = Utc::now().naive_utc();
    sqlx::query(r#"UPDATE "word_contexts" SET "metadata" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(serde_json::Value::Object(metadata.clone()))
        .bind(now)
        .bind(context_id)
        .execute(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    Ok(())
}

async fn delete_context_by_id(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_id: &str,
) -> Result<(), AppError> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(context_id.to_string()));
        let op = crate::db::dual_write_manager::WriteOperation::Delete {
            table: "word_contexts".to_string(),
            r#where: where_clause,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
        return Ok(());
    }

    let pool = proxy
        .primary_pool()
        .await
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;
    sqlx::query(r#"DELETE FROM "word_contexts" WHERE "id" = $1"#)
        .bind(context_id)
        .execute(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    Ok(())
}

async fn delete_contexts(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    context_ids: &[String],
) -> Result<(), AppError> {
    if context_ids.is_empty() {
        return Ok(());
    }

    if proxy.sqlite_enabled() {
        for id in context_ids {
            delete_context_by_id(proxy, state, id).await?;
        }
        return Ok(());
    }

    let pool = proxy
        .primary_pool()
        .await
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let mut qb =
        sqlx::QueryBuilder::<sqlx::Postgres>::new(r#"DELETE FROM "word_contexts" WHERE "id" IN ("#);
    {
        let mut separated = qb.separated(", ");
        for id in context_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
    }

    qb.build()
        .execute(&pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    Ok(())
}

fn map_context_row_pg(row: sqlx::postgres::PgRow) -> ContextRow {
    let created_at = row
        .try_get::<NaiveDateTime, _>("createdAt")
        .map(format_naive_datetime)
        .unwrap_or_default();
    let updated_at = row
        .try_get::<NaiveDateTime, _>("updatedAt")
        .map(format_naive_datetime)
        .unwrap_or_default();
    ContextRow {
        id: row.try_get("id").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        context_type: row.try_get("contextType").unwrap_or_default(),
        content: row.try_get("content").unwrap_or_default(),
        metadata: row.try_get::<Option<serde_json::Value>, _>("metadata").ok().flatten(),
        created_at,
        updated_at,
    }
}

fn map_context_row_sqlite(row: sqlx::sqlite::SqliteRow) -> ContextRow {
    let metadata_text = row.try_get::<Option<String>, _>("metadata").ok().flatten();
    let metadata = metadata_text.and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok());
    ContextRow {
        id: row.try_get("id").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        context_type: row.try_get("contextType").unwrap_or_default(),
        content: row.try_get("content").unwrap_or_default(),
        metadata,
        created_at: normalize_datetime_str(&row.try_get::<String, _>("createdAt").unwrap_or_default()),
        updated_at: normalize_datetime_str(&row.try_get::<String, _>("updatedAt").unwrap_or_default()),
    }
}

fn map_context_row(row: ContextRow) -> WordContextData {
    WordContextData {
        id: row.id,
        word_id: row.word_id,
        context_type: row.context_type,
        content: row.content,
        metadata: row.metadata,
        created_at: normalize_datetime_str(&row.created_at),
        updated_at: normalize_datetime_str(&row.updated_at),
    }
}

enum SelectedReadPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

async fn select_read_pool(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
) -> Result<SelectedReadPool, AppError> {
    match state {
        DatabaseState::Degraded | DatabaseState::Unavailable => proxy
            .fallback_pool()
            .await
            .map(SelectedReadPool::Fallback)
            .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用")),
        DatabaseState::Normal | DatabaseState::Syncing => match proxy.primary_pool().await {
            Some(pool) => Ok(SelectedReadPool::Primary(pool)),
            None => proxy
                .fallback_pool()
                .await
                .map(SelectedReadPool::Fallback)
                .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用")),
        },
    }
}
