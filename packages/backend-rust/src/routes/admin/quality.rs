use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::response::json_error;
use crate::services::quality_service;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct ListResponse<T> {
    success: bool,
    data: T,
    total: i64,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wordbooks/:id/tasks", post(start_task).get(list_tasks))
        .route("/wordbooks/:id/stats", get(get_stats))
        .route("/wordbooks/:id/issues", get(list_issues))
        .route("/tasks/:id/cancel", post(cancel_task))
        .route("/issues/:id/fix", post(apply_fix))
        .route("/issues/:id/ignore", post(ignore_issue))
        .route("/issues/batch", post(batch_operation))
}

async fn start_task(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(wordbook_id): Path<String>,
    Json(payload): Json<quality_service::StartTaskRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::start_task(&proxy, &wordbook_id, payload, user.id).await {
        Ok(task) => Json(SuccessResponse { success: true, data: task }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "START_TASK_FAILED", &e).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListTasksQuery {
    limit: Option<i64>,
}

async fn list_tasks(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(wordbook_id): Path<String>,
    Query(query): Query<ListTasksQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    let limit = query.limit.unwrap_or(10).clamp(1, 100);

    match quality_service::list_tasks(&proxy, &wordbook_id, limit).await {
        Ok(tasks) => Json(SuccessResponse { success: true, data: tasks }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "LIST_TASKS_FAILED", &e).into_response(),
    }
}

async fn get_stats(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(wordbook_id): Path<String>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::get_stats(&proxy, &wordbook_id).await {
        Ok(stats) => Json(SuccessResponse { success: true, data: stats }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "GET_STATS_FAILED", &e).into_response(),
    }
}

async fn cancel_task(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(task_id): Path<String>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::cancel_task(&proxy, &task_id).await {
        Ok(_) => Json(SuccessResponse { success: true, data: serde_json::json!({}) }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "CANCEL_TASK_FAILED", &e).into_response(),
    }
}

async fn list_issues(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(wordbook_id): Path<String>,
    Query(filters): Query<quality_service::IssueFilters>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::list_issues(&proxy, &wordbook_id, filters).await {
        Ok((issues, total)) => Json(ListResponse { success: true, data: issues, total }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "LIST_ISSUES_FAILED", &e).into_response(),
    }
}

async fn apply_fix(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(issue_id): Path<String>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::apply_fix(&proxy, &issue_id, &user.id).await {
        Ok(issue) => Json(SuccessResponse { success: true, data: issue }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "APPLY_FIX_FAILED", &e).into_response(),
    }
}

async fn ignore_issue(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(issue_id): Path<String>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::ignore_issue(&proxy, &issue_id, &user.id).await {
        Ok(_) => Json(SuccessResponse { success: true, data: serde_json::json!({}) }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "IGNORE_ISSUE_FAILED", &e).into_response(),
    }
}

async fn batch_operation(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<quality_service::BatchRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match quality_service::batch_operation(&proxy, payload, &user.id).await {
        Ok(result) => Json(SuccessResponse { success: true, data: result }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "BATCH_OPERATION_FAILED", &e).into_response(),
    }
}
