use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use axum::extract::{Extension, Query, State};
use axum::http::StatusCode;
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
struct TokenQuery {
    token: Option<String>,
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
    request_state: Option<Extension<crate::middleware::RequestDbState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<TokenQuery>,
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

    let token = crate::auth::extract_token(&headers)
        .or_else(|| query.token.clone())
        .or_else(|| batch.auth_token.clone());

    let Some(token) = token else {
        return (
            StatusCode::OK,
            Json(SuccessMessageResponse {
                success: true,
                message: "Events received (anonymous, not stored)".to_string(),
            }),
        )
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return (
            StatusCode::OK,
            Json(SuccessMessageResponse {
                success: true,
                message: "Events received (anonymous, not stored)".to_string(),
            }),
        )
            .into_response();
    };

    let db_state = request_state
        .map(|Extension(state)| state.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let user = crate::auth::verify_request_token(proxy.as_ref(), db_state, &token).await.ok();
    let Some(user) = user else {
        return (
            StatusCode::OK,
            Json(SuccessMessageResponse {
                success: true,
                message: "Events received (anonymous, not stored)".to_string(),
            }),
        )
            .into_response();
    };

    let event_count = batch.events.len();
    process_batch(user.id, batch).await;

    (
        StatusCode::OK,
        Json(SuccessMessageResponse {
            success: true,
            message: format!("Processed {event_count} events"),
        }),
    )
        .into_response()
}

async fn process_batch(user_id: String, batch: EventBatch) {
    let store = Arc::clone(store());

    let mut pronunciation_clicks = 0u64;
    let mut pause_count = 0u64;
    let mut page_switch_count = 0u64;

    for event in &batch.events {
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
        let entry = stats_guard.entry(user_id.clone()).or_insert(UserInteractionStats {
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
        entry.total_interactions += batch.events.len() as u64;
        entry.last_activity_time = Some(now_iso);
    }

    {
        let mut events_guard = store.events.write().await;
        let entry = events_guard.entry(user_id).or_insert_with(Vec::new);
        for mut event in batch.events {
            if event.session_id.is_none() {
                event.session_id = Some(batch.session_id.clone());
            }
            entry.push(event);
        }

        entry.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        if entry.len() > 300 {
            entry.truncate(300);
        }
    }
}

async fn stats(
    State(state): State<AppState>,
    request_state: Option<Extension<crate::middleware::RequestDbState>>,
    headers: axum::http::HeaderMap,
) -> Response {
    let user = match require_user(&state, request_state, &headers).await {
        Ok(user) => user,
        Err(res) => return res,
    };

    let store = store();
    let stats = store.stats.read().await.get(&user.id).cloned().unwrap_or(UserInteractionStats {
        pronunciation_clicks: 0,
        pause_count: 0,
        page_switch_count: 0,
        total_interactions: 0,
        total_session_duration: 0,
        last_activity_time: None,
    });

    Json(SuccessResponse { success: true, data: stats }).into_response()
}

async fn auditory_preference(
    State(state): State<AppState>,
    request_state: Option<Extension<crate::middleware::RequestDbState>>,
    headers: axum::http::HeaderMap,
) -> Response {
    let user = match require_user(&state, request_state, &headers).await {
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

    let data = AuditoryPreferenceResponse { score, interpretation };
    Json(SuccessResponse { success: true, data }).into_response()
}

async fn recent(
    State(state): State<AppState>,
    request_state: Option<Extension<crate::middleware::RequestDbState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<TokenQuery>,
) -> Response {
    let user = match require_user(&state, request_state, &headers).await {
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

    Json(SuccessResponse { success: true, data: response }).into_response()
}

async fn require_user(
    state: &AppState,
    request_state: Option<Extension<crate::middleware::RequestDbState>>,
    headers: &axum::http::HeaderMap,
) -> Result<crate::auth::AuthUser, Response> {
    let token = crate::auth::extract_token(headers);
    let Some(token) = token else {
        return Err(json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response());
    };

    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "数据库服务不可用").into_response());
    };

    let db_state = request_state
        .map(|Extension(state)| state.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    match crate::auth::verify_request_token(proxy.as_ref(), db_state, &token).await {
        Ok(user) => Ok(user),
        Err(_) => Err(json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response()),
    }
}
