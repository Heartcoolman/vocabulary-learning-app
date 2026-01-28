use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};

use crate::db::operations::broadcast as broadcast_ops;
use crate::response::json_error;
use crate::services::admin_auth::AdminAuthUser;
use crate::services::broadcast::{self, BroadcastError, CreateBroadcastRequest};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_broadcast).get(list_broadcasts))
        .route("/online-stats", get(get_online_stats))
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
            &format!("无效目标: {}", t),
        )
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "BROADCAST_FAILED",
            &e.to_string(),
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
            &e.to_string(),
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
            &e.to_string(),
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
            &e.to_string(),
        )
        .into_response(),
    }
}
