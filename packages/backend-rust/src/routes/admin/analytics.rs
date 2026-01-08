use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::auth::AuthUser;
use crate::db::operations::analytics::{
    insert_alert_root_cause_analysis, update_alert_root_cause_resolved,
    upsert_user_behavior_insight,
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
        .route("/behavior-insights", post(create_behavior_insight))
        .route("/behavior-insights", get(list_behavior_insights))
        .route("/alert-root-cause", post(create_alert_root_cause))
        .route("/alert-root-cause", get(list_alert_root_causes))
        .route(
            "/alert-root-cause/:id/resolve",
            put(resolve_alert_root_cause),
        )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBehaviorInsightRequest {
    analysis_date: String,
    user_segment: String,
    patterns: serde_json::Value,
    insights: serde_json::Value,
    recommendations: serde_json::Value,
    user_count: i32,
    data_points: i32,
}

async fn create_behavior_insight(
    State(state): State<AppState>,
    Json(body): Json<CreateBehaviorInsightRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let analysis_date =
        NaiveDate::parse_from_str(&body.analysis_date, "%Y-%m-%d").map_err(|_| {
            json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_DATE",
                "日期格式无效，应为 YYYY-MM-DD",
            )
        })?;

    match upsert_user_behavior_insight(
        proxy.as_ref(),
        analysis_date,
        &body.user_segment,
        &body.patterns,
        &body.insights,
        &body.recommendations,
        body.user_count,
        body.data_points,
    )
    .await
    {
        Ok(id) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "create behavior insight failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "创建行为洞察失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListBehaviorInsightsQuery {
    date: Option<String>,
    segment: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BehaviorInsightItem {
    id: String,
    analysis_date: String,
    user_segment: String,
    patterns: serde_json::Value,
    insights: serde_json::Value,
    recommendations: serde_json::Value,
    user_count: i32,
    data_points: i32,
    created_at: String,
}

async fn list_behavior_insights(
    State(state): State<AppState>,
    Query(query): Query<ListBehaviorInsightsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let pool = proxy.pool();

    let date = query
        .date
        .as_ref()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

    let rows = match (&date, &query.segment) {
        (Some(d), Some(s)) => {
            sqlx::query(
                r#"SELECT * FROM "user_behavior_insights" WHERE "analysisDate" = $1 AND "userSegment" = $2 ORDER BY "createdAt" DESC LIMIT $3"#,
            )
            .bind(d)
            .bind(s)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (Some(d), None) => {
            sqlx::query(
                r#"SELECT * FROM "user_behavior_insights" WHERE "analysisDate" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
            )
            .bind(d)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, Some(s)) => {
            sqlx::query(
                r#"SELECT * FROM "user_behavior_insights" WHERE "userSegment" = $1 ORDER BY "analysisDate" DESC, "createdAt" DESC LIMIT $2"#,
            )
            .bind(s)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query(
                r#"SELECT * FROM "user_behavior_insights" ORDER BY "analysisDate" DESC, "createdAt" DESC LIMIT $1"#,
            )
            .bind(limit)
            .fetch_all(pool)
            .await
        }
    };

    let rows = rows.map_err(|e| {
        tracing::warn!(error = %e, "list behavior insights failed");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "查询行为洞察失败",
        )
    })?;

    let items: Vec<BehaviorInsightItem> = rows.iter().map(map_behavior_insight_row).collect();
    Ok(Json(SuccessResponse {
        success: true,
        data: items,
    }))
}

fn map_behavior_insight_row(row: &sqlx::postgres::PgRow) -> BehaviorInsightItem {
    let analysis_date: NaiveDate = row
        .try_get("analysisDate")
        .unwrap_or_else(|_| chrono::Utc::now().date_naive());
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());

    BehaviorInsightItem {
        id: row.try_get("id").unwrap_or_default(),
        analysis_date: analysis_date.format("%Y-%m-%d").to_string(),
        user_segment: row.try_get("userSegment").unwrap_or_default(),
        patterns: row.try_get("patterns").unwrap_or(serde_json::Value::Null),
        insights: row.try_get("insights").unwrap_or(serde_json::Value::Null),
        recommendations: row
            .try_get("recommendations")
            .unwrap_or(serde_json::Value::Null),
        user_count: row.try_get("userCount").unwrap_or(0),
        data_points: row.try_get("dataPoints").unwrap_or(0),
        created_at: format_naive_iso(created_at),
    }
}

fn format_naive_iso(value: chrono::NaiveDateTime) -> String {
    chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(value, chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAlertRootCauseRequest {
    alert_rule_id: String,
    severity: String,
    root_cause: String,
    suggested_fixes: serde_json::Value,
    related_metrics: serde_json::Value,
    confidence: f64,
}

async fn create_alert_root_cause(
    State(state): State<AppState>,
    Json(body): Json<CreateAlertRootCauseRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match insert_alert_root_cause_analysis(
        proxy.as_ref(),
        &body.alert_rule_id,
        &body.severity,
        &body.root_cause,
        &body.suggested_fixes,
        &body.related_metrics,
        body.confidence,
    )
    .await
    {
        Ok(id) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "create alert root cause failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "创建告警根因分析失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListAlertRootCausesQuery {
    alert_rule_id: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertRootCauseItem {
    id: String,
    alert_rule_id: String,
    severity: String,
    root_cause: String,
    suggested_fixes: serde_json::Value,
    related_metrics: serde_json::Value,
    confidence: f64,
    status: String,
    resolved_by: Option<String>,
    resolved_at: Option<String>,
    resolution: Option<String>,
    created_at: String,
}

async fn list_alert_root_causes(
    State(state): State<AppState>,
    Query(query): Query<ListAlertRootCausesQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let pool = proxy.pool();

    let rows = match (&query.alert_rule_id, &query.status) {
        (Some(rule_id), Some(status)) => {
            sqlx::query(
                r#"SELECT * FROM "alert_root_cause_analyses" WHERE "alertRuleId" = $1 AND "status" = $2 ORDER BY "createdAt" DESC LIMIT $3"#,
            )
            .bind(rule_id)
            .bind(status)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (Some(rule_id), None) => {
            sqlx::query(
                r#"SELECT * FROM "alert_root_cause_analyses" WHERE "alertRuleId" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
            )
            .bind(rule_id)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, Some(status)) => {
            sqlx::query(
                r#"SELECT * FROM "alert_root_cause_analyses" WHERE "status" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
            )
            .bind(status)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query(
                r#"SELECT * FROM "alert_root_cause_analyses" ORDER BY "createdAt" DESC LIMIT $1"#,
            )
            .bind(limit)
            .fetch_all(pool)
            .await
        }
    };

    let rows = rows.map_err(|e| {
        tracing::warn!(error = %e, "list alert root causes failed");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "查询告警根因分析失败",
        )
    })?;

    let items: Vec<AlertRootCauseItem> = rows.iter().map(map_alert_root_cause_row).collect();
    Ok(Json(SuccessResponse {
        success: true,
        data: items,
    }))
}

fn map_alert_root_cause_row(row: &sqlx::postgres::PgRow) -> AlertRootCauseItem {
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let resolved_at: Option<chrono::NaiveDateTime> = row.try_get("resolvedAt").ok();

    AlertRootCauseItem {
        id: row.try_get("id").unwrap_or_default(),
        alert_rule_id: row.try_get("alertRuleId").unwrap_or_default(),
        severity: row.try_get("severity").unwrap_or_default(),
        root_cause: row.try_get("rootCause").unwrap_or_default(),
        suggested_fixes: row
            .try_get("suggestedFixes")
            .unwrap_or(serde_json::Value::Null),
        related_metrics: row
            .try_get("relatedMetrics")
            .unwrap_or(serde_json::Value::Null),
        confidence: row.try_get("confidence").unwrap_or(0.0),
        status: row.try_get("status").unwrap_or_default(),
        resolved_by: row.try_get("resolvedBy").ok(),
        resolved_at: resolved_at.map(format_naive_iso),
        resolution: row.try_get("resolution").ok(),
        created_at: format_naive_iso(created_at),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveAlertRequest {
    resolution: String,
}

async fn resolve_alert_root_cause(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<ResolveAlertRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match update_alert_root_cause_resolved(proxy.as_ref(), &id, &user.id, &body.resolution).await {
        Ok(()) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id, "status": "resolved" }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "resolve alert root cause failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "解决告警根因失败",
            ))
        }
    }
}
