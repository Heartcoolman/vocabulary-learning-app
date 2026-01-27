use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::sse::{Event, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::{BroadcastStream, IntervalStream};

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

pub fn send_event(
    user_id: String,
    session_id: Option<String>,
    event_type: &str,
    payload: serde_json::Value,
) {
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

    async fn online_user_ids(&self) -> Vec<String> {
        self.user_index.read().await.keys().cloned().collect()
    }

    async fn online_count(&self) -> usize {
        self.user_index.read().await.len()
    }
}

pub fn get_online_user_ids() -> Vec<String> {
    let hub = hub();
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(hub.online_user_ids())
    })
}

pub async fn get_online_user_ids_async() -> Vec<String> {
    hub().online_user_ids().await
}

pub async fn get_online_count() -> usize {
    hub().online_count().await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamQuery {
    event_types: Option<String>,
    token: Option<String>,
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
        .route("/users/:userId/stream", get(user_stream))
        .route("/lookup-user", get(lookup_user_by_email))
        .route("/stats", get(get_stats))
        .route("/test", post(send_test_event))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
    fallback_token: Option<String>,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .or(fallback_token)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    Ok((proxy, user))
}

fn allowed_event_types() -> HashSet<String> {
    [
        "feedback",
        "alert",
        "flow-update",
        "next-suggestion",
        "forgetting-alert",
        "quality-task-progress",
        "ping",
        "error",
        "amas-flow",
        "admin-broadcast",
    ]
    .into_iter()
    .map(|v| v.to_string())
    .collect()
}

async fn session_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Query(query): Query<StreamQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_user(&state, &headers, query.token.clone()).await?;

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
        .subscribe(
            user.id.clone(),
            Some(session_id.clone()),
            event_types.clone(),
        )
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

                    let data =
                        serde_json::to_string(&msg.event).unwrap_or_else(|_| "{}".to_string());
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LookupQuery {
    email: String,
    token: Option<String>,
}

async fn lookup_user_by_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LookupQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers, query.token).await?;

    let email = query.email.trim().to_lowercase();
    if email.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "邮箱不能为空",
        ));
    }

    let row: Option<(String,)> =
        sqlx::query_as(r#"SELECT "id" FROM "users" WHERE LOWER("email") = $1 LIMIT 1"#)
            .bind(&email)
            .fetch_optional(proxy.pool())
            .await
            .map_err(|_| {
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DB_ERROR",
                    "数据库查询失败",
                )
            })?;

    match row {
        Some((user_id,)) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "userId": user_id }),
        })),
        None => Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "未找到该邮箱对应的用户",
        )),
    }
}

async fn user_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(target_user_id): Path<String>,
    Query(query): Query<StreamQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_user(&state, &headers, query.token.clone()).await?;

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
        .subscribe(target_user_id.clone(), None, event_types.clone())
        .await;

    let events = BroadcastStream::new(receiver).filter_map(move |msg| {
        let _guard = &guard;
        let event_types = event_types.clone();
        let target_user_id = target_user_id.clone();

        async move {
            match msg {
                Ok(msg) => {
                    if msg.user_id != target_user_id {
                        return None;
                    }
                    if let Some(event_types) = &event_types {
                        if !event_types.contains(&msg.event.r#type) {
                            return None;
                        }
                    }

                    let data =
                        serde_json::to_string(&msg.event).unwrap_or_else(|_| "{}".to_string());
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
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_user(&state, &headers, None).await?;
    let stats = hub().stats().await;
    Ok(Json(SuccessResponse {
        success: true,
        data: stats,
    }))
}

async fn send_test_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TestBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_user(&state, &headers, None).await?;

    let env = std::env::var("NODE_ENV").unwrap_or_else(|_| "development".to_string());
    if env != "development" && env != "test" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "仅开发环境可用",
        ));
    }

    if payload.session_id.trim().is_empty() || payload.event_type.trim().is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "缺少必需参数",
        ));
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
