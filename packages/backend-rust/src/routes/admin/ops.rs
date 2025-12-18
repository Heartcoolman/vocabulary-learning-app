use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::services::weekly_report;
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

#[derive(Debug, Clone, Serialize)]
struct UserSegment {
    id: &'static str,
    name: &'static str,
    description: &'static str,
}

const USER_SEGMENTS: &[UserSegment] = &[
    UserSegment { id: "new_users", name: "新用户", description: "注册7天内的用户" },
    UserSegment { id: "active_learners", name: "活跃学习者", description: "每日都有学习记录的用户" },
    UserSegment { id: "at_risk", name: "流失风险用户", description: "最近3天没有活动的用户" },
    UserSegment { id: "high_performers", name: "高绩效用户", description: "正确率超过80%的用户" },
    UserSegment { id: "struggling", name: "困难用户", description: "正确率低于50%的用户" },
    UserSegment { id: "casual", name: "休闲用户", description: "每周只学习1-2天的用户" },
    UserSegment { id: "all", name: "全部用户", description: "所有有学习记录的用户" },
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/alerts/analyze", post(analyze_alert))
        .route("/alerts/analyses", get(get_analyses))
        .route("/alerts/analyses/:id", get(get_analysis))
        .route("/alerts/analyses/:id/status", patch(update_analysis_status))
        .route("/alerts/stats", get(get_alert_stats))
        .route("/reports/weekly/generate", post(generate_weekly_report))
        .route("/reports/weekly", get(get_weekly_reports))
        .route("/reports/weekly/latest", get(get_latest_weekly_report))
        .route("/reports/weekly/:id", get(get_weekly_report))
        .route("/reports/health-trend", get(get_health_trend))
        .route("/insights/generate", post(generate_insight))
        .route("/insights", get(get_insights))
        .route("/insights/:id", get(get_insight))
        .route("/segments", get(get_segments))
}

async fn analyze_alert() -> Response {
    not_implemented()
}

async fn get_analyses() -> Response {
    not_implemented()
}

async fn get_analysis(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn update_analysis_status(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn get_alert_stats() -> Response {
    not_implemented()
}

async fn generate_weekly_report(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();

    match weekly_report::generate_report(&proxy, db_state).await {
        Ok(report) => Json(SuccessResponse { success: true, data: report }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "GENERATE_FAILED", &e).into_response(),
    }
}

async fn get_weekly_reports(State(state): State<AppState>, Query(query): Query<PaginationQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let limit = query.limit.unwrap_or(10);
    let offset = query.offset.unwrap_or(0);

    match weekly_report::get_reports(&proxy, db_state, limit, offset).await {
        Ok((reports, total)) => Json(SuccessResponse { success: true, data: serde_json::json!({ "reports": reports, "total": total }) }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_latest_weekly_report(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();

    match weekly_report::get_latest_report(&proxy, db_state).await {
        Ok(Some(report)) => Json(SuccessResponse { success: true, data: report }).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "没有周报记录").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_weekly_report(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();

    match weekly_report::get_report_by_id(&proxy, db_state, &id).await {
        Ok(Some(report)) => Json(SuccessResponse { success: true, data: report }).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "报告不存在").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct HealthTrendQuery {
    weeks: Option<i32>,
}

async fn get_health_trend(State(state): State<AppState>, Query(query): Query<HealthTrendQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let weeks = query.weeks.unwrap_or(12);

    match weekly_report::get_health_trend(&proxy, db_state, weeks).await {
        Ok(trend) => Json(SuccessResponse { success: true, data: trend }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn generate_insight() -> Response {
    not_implemented()
}

async fn get_insights() -> Response {
    not_implemented()
}

async fn get_insight(Path(_id): Path<String>) -> Response {
    not_implemented()
}

async fn get_segments() -> Response {
    Json(SuccessResponse {
        success: true,
        data: USER_SEGMENTS,
    }).into_response()
}

fn not_implemented() -> Response {
    json_error(StatusCode::NOT_IMPLEMENTED, "NOT_IMPLEMENTED", "功能尚未实现").into_response()
}
