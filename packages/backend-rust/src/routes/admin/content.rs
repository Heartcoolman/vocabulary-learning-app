use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Serialize)]
struct PlannedResponse {
    success: bool,
    status: &'static str,
    message: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaginationQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wordbooks/:id/quality-check", post(deprecated_endpoint))
        .route("/wordbooks/:id/quality-checks", get(deprecated_endpoint))
        .route("/wordbooks/:id/issues", get(deprecated_endpoint))
        .route("/wordbooks/:id/quality-stats", get(deprecated_endpoint))
        .route("/quality-checks/:id", get(deprecated_endpoint))
        .route("/issues/:id/fix", post(planned_feature))
        .route("/issues/:id/ignore", post(planned_feature))
        .route("/issues/batch-fix", post(planned_feature))
        .route("/words/enhance", post(planned_feature))
        .route("/words/:id/enhancement-preview", get(planned_feature))
        .route("/content-variants", get(planned_feature))
        .route("/content-variants/:id/approve", post(planned_feature))
        .route("/content-variants/:id/reject", post(planned_feature))
        .route("/content-variants/batch-approve", post(planned_feature))
        .route("/enhance-tasks", get(planned_feature))
}

async fn deprecated_endpoint() -> Response {
    (
        StatusCode::GONE,
        Json(PlannedResponse {
            success: false,
            status: "deprecated",
            message: "此端点已废弃，请使用 /api/admin/quality",
        }),
    )
        .into_response()
}

async fn planned_feature() -> Response {
    Json(PlannedResponse {
        success: true,
        status: "planned",
        message: "功能开发中",
    })
    .into_response()
}
