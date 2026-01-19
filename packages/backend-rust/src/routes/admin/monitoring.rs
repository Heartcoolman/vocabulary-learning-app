use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Extension;
use axum::Json;
use axum::Router;
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::db::operations::monitoring::{
    get_aggregates_15m, get_aggregates_daily, get_health_reports, get_monitoring_overview,
};
use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/overview", axum::routing::get(overview))
        .route("/aggregates", axum::routing::get(aggregates))
        .route("/health-reports", axum::routing::get(health_reports))
}

async fn overview(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match get_monitoring_overview(&proxy).await {
        Ok(overview) => Ok(Json(SuccessResponse {
            success: true,
            data: overview,
        })),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to get monitoring overview");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "获取监控概览失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AggregatesQuery {
    period: Option<String>,
    limit: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AggregatesResponse {
    period: String,
    data: serde_json::Value,
}

async fn aggregates(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Query(query): Query<AggregatesQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let period = query.period.as_deref().unwrap_or("15m");
    let limit = query.limit.unwrap_or(50).clamp(1, 200);

    let data = match period {
        "15m" => {
            let rows = get_aggregates_15m(&proxy, limit).await.map_err(|e| {
                tracing::warn!(error = %e, "Failed to get 15m aggregates");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DB_ERROR",
                    "获取15分钟聚合数据失败",
                )
            })?;
            serde_json::to_value(rows).unwrap_or_default()
        }
        "daily" => {
            let rows = get_aggregates_daily(&proxy, limit).await.map_err(|e| {
                tracing::warn!(error = %e, "Failed to get daily aggregates");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DB_ERROR",
                    "获取每日聚合数据失败",
                )
            })?;
            serde_json::to_value(rows).unwrap_or_default()
        }
        _ => {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_PERIOD",
                "无效的周期参数，支持 15m 或 daily",
            ));
        }
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: AggregatesResponse {
            period: period.to_string(),
            data,
        },
    }))
}

#[derive(Debug, Deserialize)]
struct HealthReportsQuery {
    limit: Option<i32>,
}

async fn health_reports(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Query(query): Query<HealthReportsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let limit = query.limit.unwrap_or(10).clamp(1, 50);

    match get_health_reports(&proxy, limit).await {
        Ok(reports) => Ok(Json(SuccessResponse {
            success: true,
            data: reports,
        })),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to get health reports");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "获取健康报告失败",
            ))
        }
    }
}
