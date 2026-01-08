use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::services::alerts::alert_monitoring_service;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryQuery {
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
struct AlertsResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveAlertsData {
    alerts: Vec<AlertEntry>,
    count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertHistoryData {
    alerts: Vec<AlertEntry>,
    total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertEntry {
    id: String,
    rule_id: String,
    rule_name: String,
    metric: String,
    severity: String,
    status: String,
    message: String,
    value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    threshold: Option<f64>,
    triggered_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolved_at: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/active", get(get_active_alerts))
        .route("/history", get(get_alert_history))
}

async fn get_active_alerts(State(_state): State<AppState>) -> Response {
    let service = alert_monitoring_service();
    let alerts = service.get_active_alerts();
    let count = alerts.len();

    let entries: Vec<AlertEntry> = alerts
        .into_iter()
        .map(|a| AlertEntry {
            id: a.id,
            rule_id: a.rule_id,
            rule_name: a.rule_name,
            metric: a.metric,
            severity: format!("{:?}", a.severity).to_lowercase(),
            status: format!("{:?}", a.status).to_lowercase(),
            message: a.message,
            value: a.value,
            threshold: a.threshold,
            triggered_at: a.triggered_at,
            resolved_at: a.resolved_at,
        })
        .collect();

    let data = ActiveAlertsData {
        alerts: entries,
        count,
    };
    (
        StatusCode::OK,
        Json(AlertsResponse {
            success: true,
            data,
        }),
    )
        .into_response()
}

async fn get_alert_history(
    State(_state): State<AppState>,
    Query(query): Query<HistoryQuery>,
) -> Response {
    let limit = query.limit.unwrap_or(50);
    let service = alert_monitoring_service();
    let alerts = service.get_history(limit);
    let total = service.history_count();

    let entries: Vec<AlertEntry> = alerts
        .into_iter()
        .map(|a| AlertEntry {
            id: a.id,
            rule_id: a.rule_id,
            rule_name: a.rule_name,
            metric: a.metric,
            severity: format!("{:?}", a.severity).to_lowercase(),
            status: format!("{:?}", a.status).to_lowercase(),
            message: a.message,
            value: a.value,
            threshold: a.threshold,
            triggered_at: a.triggered_at,
            resolved_at: a.resolved_at,
        })
        .collect();

    let data = AlertHistoryData {
        alerts: entries,
        total,
    };
    (
        StatusCode::OK,
        Json(AlertsResponse {
            success: true,
            data,
        }),
    )
        .into_response()
}
