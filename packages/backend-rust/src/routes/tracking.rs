use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock};

use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::response::json_error;
use crate::state::AppState;

static TRACKING_STORE: OnceLock<Arc<TrackingStore>> = OnceLock::new();

fn store() -> &'static Arc<TrackingStore> {
    TRACKING_STORE.get_or_init(|| Arc::new(TrackingStore::new()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/events", post(events))
        .route("/stats", get(stats))
        .route("/auditory-preference", get(auditory_preference))
        .route("/recent", get(recent))
}

#[derive(Debug, Serialize)]
struct SuccessMessageResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug)]
struct TrackingStore {
    stats: RwLock<HashMap<String, UserInteractionStats>>,
    events: RwLock<HashMap<String, Vec<TrackingEvent>>>,
}

impl TrackingStore {
    fn new() -> Self {
        Self {
            stats: RwLock::new(HashMap::new()),
            events: RwLock::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct RecentQuery {
    limit: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventBatch {
    events: Vec<TrackingEvent>,
    session_id: String,
    timestamp: u64,
    #[serde(default)]
    auth_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrackingEvent {
    #[serde(rename = "type")]
    event_type: String,
    timestamp: u64,
    #[serde(default)]
    data: Option<serde_json::Value>,
    #[serde(default)]
    session_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UserInteractionStats {
    pronunciation_clicks: u64,
    pause_count: u64,
    page_switch_count: u64,
    total_interactions: u64,
    total_session_duration: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_activity_time: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentEventsResponse {
    events: Vec<TrackingEvent>,
    count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditoryPreferenceResponse {
    score: f64,
    interpretation: String,
}

async fn events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(batch): Json<EventBatch>,
) -> Response {
    if batch.session_id.trim().is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "Invalid request body: sessionId required",
        )
        .into_response();
    }

    if batch.events.len() > 100 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "Too many events in batch (max 100)",
        )
        .into_response();
    }

    let (token, used_cookie_auth) = extract_tracking_token(&headers, batch.auth_token.as_deref());

    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    if used_cookie_auth {
        if let Err(res) = validate_csrf_from_headers(&headers) {
            return res;
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "数据库服务不可用",
        )
        .into_response();
    };

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(u) => u,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let event_count = batch.events.len();
    process_batch(proxy, user.id, batch).await;

    (
        StatusCode::OK,
        Json(SuccessMessageResponse {
            success: true,
            message: format!("Processed {event_count} events"),
        }),
    )
        .into_response()
}

async fn process_batch(proxy: Arc<crate::db::DatabaseProxy>, user_id: String, batch: EventBatch) {
    let store = Arc::clone(store());

    let mut normalized_events = Vec::with_capacity(batch.events.len());
    for mut event in batch.events.clone() {
        if event.session_id.is_none() {
            event.session_id = Some(batch.session_id.clone());
        }
        normalized_events.push(event);
    }

    let mut unique_events: Vec<TrackingEvent> = Vec::new();
    {
        let mut events_guard = store.events.write().await;
        let entry = events_guard.entry(user_id.clone()).or_insert_with(Vec::new);

        let mut seen = HashSet::with_capacity(entry.len().saturating_add(normalized_events.len()));
        for event in entry.iter() {
            seen.insert(event_key(event));
        }

        for event in normalized_events {
            let key = event_key(&event);
            if !seen.insert(key) {
                continue;
            }
            unique_events.push(event);
        }

        if !unique_events.is_empty() {
            entry.extend(unique_events.iter().cloned());
            entry.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
            if entry.len() > 300 {
                entry.truncate(300);
            }
        }
    }

    let mut pronunciation_clicks = 0u64;
    let mut pause_count = 0u64;
    let mut page_switch_count = 0u64;
    for event in &unique_events {
        match event.event_type.as_str() {
            "pronunciation_click" => pronunciation_clicks += 1,
            "learning_pause" => pause_count += 1,
            "page_switch" => page_switch_count += 1,
            _ => {}
        }
    }

    let now_iso = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    {
        let mut stats_guard = store.stats.write().await;
        let entry = stats_guard
            .entry(user_id.clone())
            .or_insert(UserInteractionStats {
                pronunciation_clicks: 0,
                pause_count: 0,
                page_switch_count: 0,
                total_interactions: 0,
                total_session_duration: 0,
                last_activity_time: None,
            });

        entry.pronunciation_clicks += pronunciation_clicks;
        entry.pause_count += pause_count;
        entry.page_switch_count += page_switch_count;
        entry.total_interactions += unique_events.len() as u64;
        entry.last_activity_time = Some(now_iso);
    }

    // Persist to database
    let pool = proxy.pool();
    for event in &unique_events {
        let session_id = event.session_id.as_ref().unwrap_or(&batch.session_id);
        if let Err(err) = sqlx::query(
            r#"
            INSERT INTO "tracking_events" ("userId", "sessionId", "eventType", "timestamp", "data")
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(&user_id)
        .bind(session_id)
        .bind(&event.event_type)
        .bind(event.timestamp as i64)
        .bind(&event.data)
        .execute(pool)
        .await
        {
            tracing::warn!(error = %err, "Failed to persist tracking event");
        }
    }

    // Persist interaction stats to database
    if let Err(e) = crate::db::operations::upsert_user_interaction_stats(
        &proxy,
        &user_id,
        pronunciation_clicks as i32,
        pause_count as i32,
        page_switch_count as i32,
        unique_events.len() as i32,
    )
    .await
    {
        tracing::warn!(error = %e, "Failed to persist user interaction stats");
    }
}

fn event_key(event: &TrackingEvent) -> String {
    let session_id = event.session_id.as_deref().unwrap_or("");
    let data = event
        .data
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_default();
    format!(
        "{session_id}|{}|{}|{data}",
        event.event_type, event.timestamp
    )
}

async fn stats(State(state): State<AppState>, headers: axum::http::HeaderMap) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(res) => return res,
    };

    let store = store();
    let stats = store
        .stats
        .read()
        .await
        .get(&user.id)
        .cloned()
        .unwrap_or(UserInteractionStats {
            pronunciation_clicks: 0,
            pause_count: 0,
            page_switch_count: 0,
            total_interactions: 0,
            total_session_duration: 0,
            last_activity_time: None,
        });

    Json(SuccessResponse {
        success: true,
        data: stats,
    })
    .into_response()
}

async fn auditory_preference(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(res) => return res,
    };

    let stats = store().stats.read().await.get(&user.id).cloned();
    let score = match stats {
        Some(stats) if stats.total_interactions > 0 => {
            let click_ratio = stats.pronunciation_clicks as f64 / stats.total_interactions as f64;
            (click_ratio / 0.3).min(1.0)
        }
        _ => 0.5,
    };

    let interpretation = if score > 0.7 {
        "strong_auditory"
    } else if score > 0.4 {
        "moderate_auditory"
    } else {
        "low_auditory"
    }
    .to_string();

    let data = AuditoryPreferenceResponse {
        score,
        interpretation,
    };
    Json(SuccessResponse {
        success: true,
        data,
    })
    .into_response()
}

async fn recent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RecentQuery>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(res) => return res,
    };

    let limit = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(50)
        .min(100);

    let events = store()
        .events
        .read()
        .await
        .get(&user.id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(limit)
        .collect::<Vec<_>>();

    let response = RecentEventsResponse {
        count: events.len(),
        events,
    };

    Json(SuccessResponse {
        success: true,
        data: response,
    })
    .into_response()
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<crate::auth::AuthUser, Response> {
    let token = crate::auth::extract_token(headers);
    let Some(token) = token else {
        return Err(
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response(),
        );
    };

    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "数据库服务不可用",
        )
        .into_response());
    };

    match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => Ok(user),
        Err(_) => Err(json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "认证失败，请重新登录",
        )
        .into_response()),
    }
}

fn extract_tracking_token(headers: &HeaderMap, body_token: Option<&str>) -> (Option<String>, bool) {
    if let Some(token) = extract_bearer_token(headers) {
        return (Some(token), false);
    }

    if let Some(token) = body_token.and_then(|value| normalize_token(value)) {
        return (Some(token.to_string()), false);
    }

    let cookie_token = get_cookie(headers, "auth_token");
    (cookie_token, true)
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())?;

    auth_header
        .strip_prefix("Bearer ")
        .and_then(normalize_token)
        .map(|value| value.to_string())
}

fn normalize_token(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn get_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let trimmed = part.trim();
        let (key, value) = trimmed.split_once('=')?;
        if key == name {
            return Some(value.to_string());
        }
    }
    None
}

fn validate_csrf_from_headers(headers: &HeaderMap) -> Result<(), Response> {
    const CSRF_COOKIE_NAME: &str = "csrf_token";
    const CSRF_HEADER_NAME: &str = "x-csrf-token";

    let cookie_token = get_cookie(headers, CSRF_COOKIE_NAME);
    let header_token = headers
        .get(CSRF_HEADER_NAME)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let Some(cookie_token) = cookie_token else {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "CSRF_TOKEN_MISSING",
            "CSRF token 验证失败",
        )
        .into_response());
    };
    let Some(header_token) = header_token else {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "CSRF_TOKEN_MISSING",
            "CSRF token 验证失败",
        )
        .into_response());
    };

    if !secure_eq(cookie_token.as_bytes(), header_token.as_bytes()) {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "CSRF_TOKEN_MISMATCH",
            "CSRF token 验证失败",
        )
        .into_response());
    }

    Ok(())
}

fn secure_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in a.iter().zip(b.iter()) {
        diff |= left ^ right;
    }
    diff == 0
}
