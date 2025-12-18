use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaginationQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wordbooks/:id/quality-check", post(start_quality_check))
        .route("/wordbooks/:id/quality-checks", get(get_quality_checks))
        .route("/wordbooks/:id/issues", get(get_wordbook_issues))
        .route("/wordbooks/:id/quality-stats", get(get_quality_stats))
        .route("/quality-checks/:id", get(get_quality_check_detail))
        .route("/issues/:id/fix", post(mark_issue_fixed))
        .route("/issues/:id/ignore", post(ignore_issue))
        .route("/issues/batch-fix", post(batch_fix_issues))
        .route("/words/enhance", post(enhance_words))
        .route("/words/:id/enhancement-preview", get(preview_enhancement))
        .route("/content-variants", get(get_content_variants))
        .route("/content-variants/:id/approve", post(approve_variant))
        .route("/content-variants/:id/reject", post(reject_variant))
        .route("/content-variants/batch-approve", post(batch_approve_variants))
        .route("/enhance-tasks", get(get_enhance_tasks))
}

async fn start_quality_check(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn get_quality_checks(Path(_id): Path<String>, Query(_query): Query<PaginationQuery>) -> Response {
    not_implemented()
}

async fn get_quality_check_detail(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn get_wordbook_issues(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn mark_issue_fixed(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn ignore_issue(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn batch_fix_issues() -> Response {
    not_implemented()
}

async fn get_quality_stats(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn enhance_words() -> Response {
    not_implemented()
}

async fn preview_enhancement(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn get_content_variants() -> Response {
    not_implemented()
}

async fn approve_variant(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn reject_variant(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn batch_approve_variants() -> Response {
    not_implemented()
}

async fn get_enhance_tasks(Query(_query): Query<PaginationQuery>) -> Response {
    not_implemented()
}

fn not_implemented() -> Response {
    json_error(StatusCode::NOT_IMPLEMENTED, "NOT_IMPLEMENTED", "功能尚未实现").into_response()
}
