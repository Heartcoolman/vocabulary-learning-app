use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::response::json_error;
use crate::services::{weekly_report, insight_generator};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeAlertRequest {
    alert: AlertInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AlertInput {
    alert_rule_id: Option<String>,
    severity: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAlertStatusRequest {
    status: String,
    resolution: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertAnalysis {
    id: String,
    alert_rule_id: String,
    severity: String,
    root_cause: String,
    suggested_fixes: Vec<SuggestedFix>,
    related_metrics: serde_json::Value,
    confidence: f64,
    status: String,
    created_at: String,
    resolution: Option<String>,
    resolved_at: Option<String>,
    resolved_by: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestedFix {
    action: String,
    priority: String,
    estimated_impact: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertAnalysisListResult {
    analyses: Vec<AlertAnalysis>,
    total: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertStats {
    total_analyses: i64,
    open_count: i64,
    investigating_count: i64,
    resolved_count: i64,
    avg_confidence: f64,
    by_severity: std::collections::BTreeMap<String, i64>,
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
        .route("/amas/config/reload", post(reload_amas_config))
        .route("/amas/config", get(get_amas_config))
}

async fn analyze_alert(Json(payload): Json<AnalyzeAlertRequest>) -> Response {
    let now = Utc::now();
    let alert_rule_id = payload.alert.alert_rule_id.unwrap_or_default();
    let severity = payload.alert.severity.unwrap_or_else(|| "low".to_string());
    let analysis = AlertAnalysis {
        id: Uuid::new_v4().to_string(),
        alert_rule_id,
        severity,
        root_cause: "暂未分析".to_string(),
        suggested_fixes: Vec::new(),
        related_metrics: serde_json::json!({}),
        confidence: 0.0,
        status: "open".to_string(),
        created_at: crate::auth::format_naive_datetime_iso_millis(now.naive_utc()),
        resolution: None,
        resolved_at: None,
        resolved_by: None,
    };

    Json(SuccessResponse { success: true, data: analysis }).into_response()
}

async fn get_analyses(Query(_query): Query<PaginationQuery>) -> Response {
    Json(SuccessResponse {
        success: true,
        data: AlertAnalysisListResult {
            analyses: Vec::new(),
            total: 0,
        },
    })
    .into_response()
}

async fn get_analysis(Path(_id): Path<String>) -> Response {
    Json(SuccessResponse {
        success: true,
        data: Option::<AlertAnalysis>::None,
    })
    .into_response()
}

async fn update_analysis_status(
    Path(_id): Path<String>,
    Json(_payload): Json<UpdateAlertStatusRequest>,
) -> Response {
    Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "updated": true }),
    })
    .into_response()
}

async fn get_alert_stats() -> Response {
    let mut by_severity = std::collections::BTreeMap::new();
    by_severity.insert("low".to_string(), 0);
    by_severity.insert("medium".to_string(), 0);
    by_severity.insert("high".to_string(), 0);
    by_severity.insert("critical".to_string(), 0);

    Json(SuccessResponse {
        success: true,
        data: AlertStats {
            total_analyses: 0,
            open_count: 0,
            investigating_count: 0,
            resolved_count: 0,
            avg_confidence: 0.0,
            by_severity,
        },
    })
    .into_response()
}

async fn generate_weekly_report(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };

    match weekly_report::generate_report(&proxy).await {
        Ok(report) => Json(SuccessResponse { success: true, data: report }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "GENERATE_FAILED", &e).into_response(),
    }
}

async fn get_weekly_reports(State(state): State<AppState>, Query(query): Query<PaginationQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let limit = query.limit.unwrap_or(10);
    let offset = query.offset.unwrap_or(0);

    match weekly_report::get_reports(&proxy, limit, offset).await {
        Ok((reports, total)) => Json(SuccessResponse { success: true, data: serde_json::json!({ "reports": reports, "total": total }) }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_latest_weekly_report(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };

    match weekly_report::get_latest_report(&proxy).await {
        Ok(Some(report)) => Json(SuccessResponse { success: true, data: report }).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "没有周报记录").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_weekly_report(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };

    match weekly_report::get_report_by_id(&proxy, &id).await {
        Ok(Some(report)) => Json(SuccessResponse { success: true, data: report }).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "报告不存在").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct HealthTrendQuery {
    weeks: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InsightsQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    status: Option<String>,
}

async fn get_health_trend(State(state): State<AppState>, Query(query): Query<HealthTrendQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };
    let weeks = query.weeks.unwrap_or(12);

    match weekly_report::get_health_trend(&proxy, weeks).await {
        Ok(trend) => Json(SuccessResponse { success: true, data: trend }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn generate_insight(
    State(state): State<AppState>,
    Json(payload): Json<insight_generator::GenerateInsightRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };

    match insight_generator::generate_insights(&proxy, payload).await {
        Ok(insights) => Json(SuccessResponse { success: true, data: insights }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "GENERATE_FAILED", &e).into_response(),
    }
}

async fn get_insights(State(state): State<AppState>, Query(query): Query<InsightsQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };

    let limit = query.limit.unwrap_or(10).max(1).min(100);
    let offset = query.offset.unwrap_or(0).max(0);

    match insight_generator::get_insights(&proxy, limit, offset, query.status.as_deref()).await {
        Ok(result) => Json(SuccessResponse { success: true, data: result }).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_insight(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_UNAVAILABLE", "数据库不可用").into_response();
    };

    match insight_generator::get_insight_by_id(&proxy, &id).await {
        Ok(Some(insight)) => Json(SuccessResponse { success: true, data: insight }).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "洞察不存在").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_segments() -> Response {
    Json(SuccessResponse {
        success: true,
        data: USER_SEGMENTS,
    }).into_response()
}

async fn reload_amas_config(State(state): State<AppState>) -> Response {
    let engine = state.amas_engine();
    match engine.reload_config().await {
        Ok(()) => {
            let config = engine.get_config().await;
            Json(SuccessResponse {
                success: true,
                data: serde_json::json!({
                    "message": "AMAS config reloaded successfully",
                    "feature_flags": config.feature_flags,
                }),
            }).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "RELOAD_FAILED", &e).into_response(),
    }
}

async fn get_amas_config(State(state): State<AppState>) -> Response {
    let engine = state.amas_engine();
    let config = engine.get_config().await;
    Json(SuccessResponse { success: true, data: config }).into_response()
}

fn not_implemented() -> Response {
    json_error(StatusCode::NOT_IMPLEMENTED, "NOT_IMPLEMENTED", "功能尚未实现").into_response()
}
