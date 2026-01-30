use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::operations::broadcast as broadcast_ops;
use crate::response::json_error;
use crate::routes::realtime;
use crate::services::admin_auth::AdminAuthUser;
use crate::services::broadcast::{self, BroadcastError, CreateBroadcastRequest};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_broadcast).get(list_broadcasts))
        .route("/online-stats", get(get_online_stats))
        .route("/online-users", get(get_online_users))
        .route("/audit", get(list_audit_logs))
        .route("/:id", get(get_broadcast))
}

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

async fn create_broadcast(
    State(state): State<AppState>,
    Extension(admin): Extension<AdminAuthUser>,
    Json(payload): Json<CreateBroadcastRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match broadcast::create_broadcast(proxy.as_ref(), &admin.id, payload).await {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(BroadcastError::InvalidTarget(t)) => json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_TARGET",
            format!("无效目标: {}", t),
        )
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "BROADCAST_FAILED",
            e.to_string(),
        )
        .into_response(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    status: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListResponse<T> {
    success: bool,
    data: Vec<T>,
    total: i64,
    page: i64,
    page_size: i64,
}

async fn list_broadcasts(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let params = broadcast_ops::ListBroadcastsParams {
        status: query.status,
        limit: page_size,
        offset,
    };

    match broadcast_ops::list_broadcasts(proxy.as_ref(), params).await {
        Ok((broadcasts, total)) => Json(ListResponse {
            success: true,
            data: broadcasts,
            total,
            page,
            page_size,
        })
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "LIST_FAILED",
            e.to_string(),
        )
        .into_response(),
    }
}

async fn get_broadcast(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match broadcast_ops::get_broadcast_by_id(proxy.as_ref(), &id).await {
        Ok(Some(b)) => Json(SuccessResponse {
            success: true,
            data: b,
        })
        .into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "广播不存在").into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "GET_FAILED",
            e.to_string(),
        )
        .into_response(),
    }
}

async fn get_online_stats() -> Response {
    let stats = broadcast::get_online_stats().await;
    Json(SuccessResponse {
        success: true,
        data: stats,
    })
    .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnlineUsersQuery {
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnlineUserDetail {
    user_id: String,
    email: String,
    name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnlineUsersPagination {
    total: usize,
    page: usize,
    limit: usize,
    total_pages: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnlineUsersResponse {
    success: bool,
    data: Vec<OnlineUserDetail>,
    pagination: OnlineUsersPagination,
}

async fn get_online_users(
    State(state): State<AppState>,
    Query(query): Query<OnlineUsersQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let page = query.page.unwrap_or(1).max(1) as usize;
    let limit = query.limit.unwrap_or(20).clamp(1, 100) as usize;
    let mut online_ids = realtime::get_online_user_ids_async().await;
    online_ids.sort();
    let total = online_ids.len();
    let total_pages = (total + limit - 1) / limit.max(1);
    let offset = (page.saturating_sub(1)).saturating_mul(limit);

    let page_ids: Vec<String> = online_ids.into_iter().skip(offset).take(limit).collect();

    if page_ids.is_empty() {
        return Json(OnlineUsersResponse {
            success: true,
            data: Vec::new(),
            pagination: OnlineUsersPagination {
                total,
                page,
                limit,
                total_pages,
            },
        })
        .into_response();
    }

    let rows = match sqlx::query(
        r#"SELECT "id", "email", "username" FROM "users" WHERE "id" = ANY($1) ORDER BY array_position($1, "id")"#,
    )
    .bind(&page_ids)
    .fetch_all(proxy.pool())
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!(error = %e, "fetch online users failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "LIST_FAILED", "查询失败")
                .into_response();
        }
    };

    let users: Vec<OnlineUserDetail> = rows
        .into_iter()
        .map(|row| OnlineUserDetail {
            user_id: row.try_get("id").unwrap_or_default(),
            email: row.try_get("email").unwrap_or_default(),
            name: row.try_get("username").ok(),
        })
        .collect();

    Json(OnlineUsersResponse {
        success: true,
        data: users,
        pagination: OnlineUsersPagination {
            total,
            page,
            limit,
            total_pages,
        },
    })
    .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditQuery {
    broadcast_id: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
}

async fn list_audit_logs(
    State(state): State<AppState>,
    Query(query): Query<AuditQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    match broadcast_ops::list_audit_logs(
        proxy.as_ref(),
        query.broadcast_id.as_deref(),
        page_size,
        offset,
    )
    .await
    {
        Ok(logs) => Json(SuccessResponse {
            success: true,
            data: logs,
        })
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "LIST_FAILED",
            e.to_string(),
        )
        .into_response(),
    }
}
