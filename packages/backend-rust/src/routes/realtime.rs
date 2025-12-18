use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::sse::{Event, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Extension;
use axum::{Json, Router};
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::{BroadcastStream, IntervalStream};

use crate::db::state_machine::DatabaseState;
use crate::middleware::RequestDbState;
use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeEventDto {
    r#type: String,
    payload: serde_json::Value,
}

#[derive(Debug, Clone)]
struct RoutedEvent {
    user_id: String,
    session_id: Option<String>,
    event: RealtimeEventDto,
}

#[derive(Debug, Clone)]
struct SubscriptionMeta {
    user_id: String,
    session_id: Option<String>,
    event_types: Option<HashSet<String>>,
}

struct RealtimeHub {
    sender: broadcast::Sender<RoutedEvent>,
    counter: AtomicU64,
    subscriptions: RwLock<HashMap<String, SubscriptionMeta>>,
    user_index: RwLock<HashMap<String, HashSet<String>>>,
    session_index: RwLock<HashMap<String, HashSet<String>>>,
}

struct SubscriptionGuard {
    hub: Arc<RealtimeHub>,
    subscription_id: String,
}

impl Drop for SubscriptionGuard {
    fn drop(&mut self) {
        let hub = self.hub.clone();
        let id = self.subscription_id.clone();
        tokio::spawn(async move {
            hub.unsubscribe(&id).await;
        });
    }
}

static REALTIME_HUB: OnceLock<Arc<RealtimeHub>> = OnceLock::new();

fn hub() -> Arc<RealtimeHub> {
    REALTIME_HUB
        .get_or_init(|| {
            let (sender, _) = broadcast::channel(1024);
            Arc::new(RealtimeHub {
                sender,
                counter: AtomicU64::new(0),
                subscriptions: RwLock::new(HashMap::new()),
                user_index: RwLock::new(HashMap::new()),
                session_index: RwLock::new(HashMap::new()),
            })
        })
        .clone()
}

pub fn send_event(user_id: String, session_id: Option<String>, event_type: &str, payload: serde_json::Value) {
    let event = RealtimeEventDto {
        r#type: event_type.to_string(),
        payload,
    };
    hub().send(RoutedEvent {
        user_id,
        session_id,
        event,
    });
}

impl RealtimeHub {
    async fn subscribe(
        self: &Arc<Self>,
        user_id: String,
        session_id: Option<String>,
        event_types: Option<HashSet<String>>,
    ) -> (broadcast::Receiver<RoutedEvent>, SubscriptionGuard) {
        let subscription_id = format!(
            "sub_{}_{}",
            self.counter.fetch_add(1, Ordering::Relaxed),
            chrono::Utc::now().timestamp_millis()
        );

        {
            let mut subs = self.subscriptions.write().await;
            subs.insert(
                subscription_id.clone(),
                SubscriptionMeta {
                    user_id: user_id.clone(),
                    session_id: session_id.clone(),
                    event_types,
                },
            );
        }

        {
            let mut user_index = self.user_index.write().await;
            user_index
                .entry(user_id)
                .or_insert_with(HashSet::new)
                .insert(subscription_id.clone());
        }

        if let Some(session_id) = &session_id {
            let mut session_index = self.session_index.write().await;
            session_index
                .entry(session_id.clone())
                .or_insert_with(HashSet::new)
                .insert(subscription_id.clone());
        }

        let guard = SubscriptionGuard {
            hub: self.clone(),
            subscription_id: subscription_id.clone(),
        };

        (self.sender.subscribe(), guard)
    }

    async fn unsubscribe(&self, subscription_id: &str) {
        let meta = {
            let mut subs = self.subscriptions.write().await;
            subs.remove(subscription_id)
        };
        let Some(meta) = meta else {
            return;
        };

        {
            let mut user_index = self.user_index.write().await;
            if let Some(set) = user_index.get_mut(&meta.user_id) {
                set.remove(subscription_id);
                if set.is_empty() {
                    user_index.remove(&meta.user_id);
                }
            }
        }

        if let Some(session_id) = meta.session_id {
            let mut session_index = self.session_index.write().await;
            if let Some(set) = session_index.get_mut(&session_id) {
                set.remove(subscription_id);
                if set.is_empty() {
                    session_index.remove(&session_id);
                }
            }
        }
    }

    fn send(&self, event: RoutedEvent) {
        let _ = self.sender.send(event);
    }

    async fn stats(&self) -> RealtimeStatsDto {
        let total_subscriptions = self.subscriptions.read().await.len() as i64;
        let active_users = self.user_index.read().await.len() as i64;
        let active_sessions = self.session_index.read().await.len() as i64;
        RealtimeStatsDto {
            total_subscriptions,
            active_users,
            active_sessions,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamQuery {
    event_types: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestBody {
    session_id: String,
    event_type: String,
    payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeStatsDto {
    total_subscriptions: i64,
    active_users: i64,
    active_sessions: i64,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions/:sessionId/stream", get(session_stream))
        .route("/stats", get(get_stats))
        .route("/test", post(send_test_event))
}

async fn require_user(
    state: &AppState,
    request_state: Option<Extension<RequestDbState>>,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser, DatabaseState), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

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

fn allowed_event_types() -> HashSet<String> {
    [
        "feedback",
        "alert",
        "flow-update",
        "next-suggestion",
        "forgetting-alert",
        "ping",
        "error",
    ]
    .into_iter()
    .map(|v| v.to_string())
    .collect()
}

async fn session_stream(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Query(query): Query<StreamQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user, _db_state) = require_user(&state, request_state, &headers).await?;

    let allowed = allowed_event_types();
    let event_types = query.event_types.as_ref().map(|raw| {
        raw.split(',')
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .filter(|v| allowed.contains(*v))
            .map(|v| v.to_string())
            .collect::<HashSet<_>>()
    });

    let hub = hub();
    let (receiver, guard) = hub
        .subscribe(user.id.clone(), Some(session_id.clone()), event_types.clone())
        .await;

    let user_id = user.id.clone();

    let events = BroadcastStream::new(receiver).filter_map(move |msg| {
        let _guard = &guard;
        let event_types = event_types.clone();
        let user_id = user_id.clone();
        let session_id = session_id.clone();

        async move {
            match msg {
                Ok(msg) => {
                    if msg.user_id != user_id {
                        return None;
                    }
                    if let Some(event_types) = &event_types {
                        if !event_types.contains(&msg.event.r#type) {
                            return None;
                        }
                    }
                    if let Some(event_session_id) = &msg.session_id {
                        if event_session_id != &session_id {
                            return None;
                        }
                    }

                    let data = serde_json::to_string(&msg.event).unwrap_or_else(|_| "{}".to_string());
                    let sse = Event::default()
                        .id(uuid::Uuid::new_v4().to_string())
                        .event(msg.event.r#type.clone())
                        .data(data);
                    Some(Ok::<Event, Infallible>(sse))
                }
                Err(_) => None,
            }
        }
    });

    let ping_event = || {
        let payload = serde_json::json!({ "timestamp": chrono::Utc::now().to_rfc3339() });
        let event = RealtimeEventDto {
            r#type: "ping".to_string(),
            payload,
        };
        let data = serde_json::to_string(&event).unwrap_or_else(|_| "{}".to_string());
        Event::default()
            .id(uuid::Uuid::new_v4().to_string())
            .event("ping")
            .data(data)
    };

    let initial = stream::once(async move { Ok::<Event, Infallible>(ping_event()) });
    let pings = IntervalStream::new(tokio::time::interval(std::time::Duration::from_secs(30)))
        .map(move |_| Ok::<Event, Infallible>(ping_event()));

    let stream = initial.chain(stream::select(events, pings));

    Ok(Sse::new(stream))
}

async fn get_stats(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user, _db_state) = require_user(&state, request_state, &headers).await?;
    let stats = hub().stats().await;
    Ok(Json(SuccessResponse { success: true, data: stats }))
}

async fn send_test_event(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(payload): Json<TestBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user, _db_state) = require_user(&state, request_state, &headers).await?;

    let env = std::env::var("NODE_ENV").unwrap_or_else(|_| "development".to_string());
    if env != "development" && env != "test" {
        return Err(json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "仅开发环境可用"));
    }

    if payload.session_id.trim().is_empty() || payload.event_type.trim().is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "缺少必需参数"));
    }

    let event = RealtimeEventDto {
        r#type: payload.event_type.trim().to_string(),
        payload: payload.payload,
    };
    hub().send(RoutedEvent {
        user_id: user.id,
        session_id: Some(payload.session_id.trim().to_string()),
        event,
    });

    Ok(Json(crate::response::ErrorResponse {
        success: true,
        error: "测试事件已发送".to_string(),
        code: "OK".to_string(),
    }))
}
