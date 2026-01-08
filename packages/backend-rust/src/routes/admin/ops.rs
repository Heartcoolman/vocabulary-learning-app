use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::response::json_error;
use crate::services::{insight_generator, weekly_report};
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

#[derive(Debug, Serialize, Deserialize)]
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
    UserSegment {
        id: "new_users",
        name: "新用户",
        description: "注册7天内的用户",
    },
    UserSegment {
        id: "active_learners",
        name: "活跃学习者",
        description: "每日都有学习记录的用户",
    },
    UserSegment {
        id: "at_risk",
        name: "流失风险用户",
        description: "最近3天没有活动的用户",
    },
    UserSegment {
        id: "high_performers",
        name: "高绩效用户",
        description: "正确率超过80%的用户",
    },
    UserSegment {
        id: "struggling",
        name: "困难用户",
        description: "正确率低于50%的用户",
    },
    UserSegment {
        id: "casual",
        name: "休闲用户",
        description: "每周只学习1-2天的用户",
    },
    UserSegment {
        id: "all",
        name: "全部用户",
        description: "所有有学习记录的用户",
    },
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

async fn analyze_alert(
    State(state): State<AppState>,
    Json(payload): Json<AnalyzeAlertRequest>,
) -> Response {
    let now = Utc::now();
    let alert_rule_id = payload.alert.alert_rule_id.unwrap_or_default();
    let severity = payload.alert.severity.unwrap_or_else(|| "low".to_string());

    let root_cause = analyze_root_cause(&severity);
    let suggested_fixes = generate_suggested_fixes(&severity);
    let related_metrics = serde_json::json!({
        "triggeredAt": now.to_rfc3339(),
        "severity": severity
    });
    let confidence = calculate_confidence(&severity);

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::db::operations::insert_alert_root_cause_analysis(
        &proxy,
        &alert_rule_id,
        &severity,
        &root_cause,
        &serde_json::to_value(&suggested_fixes).unwrap_or_default(),
        &related_metrics,
        confidence,
    )
    .await
    {
        Ok(id) => {
            let analysis = AlertAnalysis {
                id,
                alert_rule_id,
                severity,
                root_cause,
                suggested_fixes,
                related_metrics,
                confidence,
                status: "open".to_string(),
                created_at: crate::auth::format_naive_datetime_iso_millis(now.naive_utc()),
                resolution: None,
                resolved_at: None,
                resolved_by: None,
            };
            Json(SuccessResponse {
                success: true,
                data: analysis,
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to insert alert root cause analysis");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "存储分析失败",
            )
            .into_response()
        }
    }
}

fn analyze_root_cause(severity: &str) -> String {
    match severity {
        "critical" => "系统检测到严重异常，可能是核心服务故障或数据一致性问题".to_string(),
        "high" => "检测到高风险问题，可能影响部分用户的学习体验".to_string(),
        "medium" => "发现中等级别问题，建议在下次迭代中处理".to_string(),
        _ => "低优先级问题，可按计划处理".to_string(),
    }
}

fn generate_suggested_fixes(severity: &str) -> Vec<SuggestedFix> {
    match severity {
        "critical" | "high" => vec![
            SuggestedFix {
                action: "检查服务健康状态".to_string(),
                priority: "high".to_string(),
                estimated_impact: "可快速定位问题根源".to_string(),
            },
            SuggestedFix {
                action: "回滚最近的配置变更".to_string(),
                priority: "medium".to_string(),
                estimated_impact: "可恢复到稳定状态".to_string(),
            },
        ],
        _ => vec![SuggestedFix {
            action: "记录问题并安排后续处理".to_string(),
            priority: "low".to_string(),
            estimated_impact: "不影响正常运行".to_string(),
        }],
    }
}

fn calculate_confidence(severity: &str) -> f64 {
    match severity {
        "critical" => 0.9,
        "high" => 0.8,
        "medium" => 0.7,
        _ => 0.6,
    }
}

async fn get_analyses(
    State(state): State<AppState>,
    Query(query): Query<PaginationQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let pool = proxy.pool();
    let limit = query.limit.unwrap_or(20).max(1).min(100);
    let offset = query.offset.unwrap_or(0).max(0);

    let total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "alert_root_cause_analyses""#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let rows = sqlx::query(
        r#"
        SELECT "id", "alertRuleId", "severity", "rootCause", "suggestedFixes", "relatedMetrics",
               "confidence", "status", "resolvedBy", "resolvedAt", "resolution", "createdAt"
        FROM "alert_root_cause_analyses"
        ORDER BY "createdAt" DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let analyses: Vec<AlertAnalysis> = rows
        .into_iter()
        .map(|row| map_alert_analysis(&row))
        .collect();

    Json(SuccessResponse {
        success: true,
        data: AlertAnalysisListResult { analyses, total },
    })
    .into_response()
}

async fn get_analysis(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "id", "alertRuleId", "severity", "rootCause", "suggestedFixes", "relatedMetrics",
               "confidence", "status", "resolvedBy", "resolvedAt", "resolution", "createdAt"
        FROM "alert_root_cause_analyses"
        WHERE "id" = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match row {
        Some(r) => Json(SuccessResponse {
            success: true,
            data: Some(map_alert_analysis(&r)),
        })
        .into_response(),
        None => Json(SuccessResponse {
            success: true,
            data: Option::<AlertAnalysis>::None,
        })
        .into_response(),
    }
}

async fn update_analysis_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAlertStatusRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    if payload.status == "resolved" {
        if let Err(e) = crate::db::operations::update_alert_root_cause_resolved(
            &proxy,
            &id,
            "admin",
            payload.resolution.as_deref().unwrap_or(""),
        )
        .await
        {
            tracing::error!(error = %e, "Failed to update alert analysis status");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "更新状态失败",
            )
            .into_response();
        }
    } else {
        let pool = proxy.pool();
        if let Err(e) = sqlx::query(
            r#"UPDATE "alert_root_cause_analyses" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2"#,
        )
        .bind(&payload.status)
        .bind(&id)
        .execute(pool)
        .await {
            tracing::error!(error = %e, "Failed to update alert analysis status");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "更新状态失败").into_response();
        }
    }

    Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "updated": true }),
    })
    .into_response()
}

async fn get_alert_stats(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE "status" = 'open') as open_count,
            COUNT(*) FILTER (WHERE "status" = 'investigating') as investigating_count,
            COUNT(*) FILTER (WHERE "status" = 'resolved') as resolved_count,
            COALESCE(AVG("confidence"), 0) as avg_confidence
        FROM "alert_root_cause_analyses"
        "#,
    )
    .fetch_one(pool)
    .await;

    let severity_rows = sqlx::query(
        r#"SELECT "severity", COUNT(*) as cnt FROM "alert_root_cause_analyses" GROUP BY "severity""#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut by_severity = std::collections::BTreeMap::new();
    by_severity.insert("low".to_string(), 0);
    by_severity.insert("medium".to_string(), 0);
    by_severity.insert("high".to_string(), 0);
    by_severity.insert("critical".to_string(), 0);

    for r in severity_rows {
        let sev: String = r.try_get("severity").unwrap_or_default();
        let cnt: i64 = r.try_get("cnt").unwrap_or(0);
        by_severity.insert(sev, cnt);
    }

    match row {
        Ok(r) => Json(SuccessResponse {
            success: true,
            data: AlertStats {
                total_analyses: r.try_get("total").unwrap_or(0),
                open_count: r.try_get("open_count").unwrap_or(0),
                investigating_count: r.try_get("investigating_count").unwrap_or(0),
                resolved_count: r.try_get("resolved_count").unwrap_or(0),
                avg_confidence: r.try_get("avg_confidence").unwrap_or(0.0),
                by_severity,
            },
        })
        .into_response(),
        Err(_) => Json(SuccessResponse {
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
        .into_response(),
    }
}

fn map_alert_analysis(row: &sqlx::postgres::PgRow) -> AlertAnalysis {
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let resolved_at: Option<chrono::NaiveDateTime> = row.try_get("resolvedAt").ok();
    let suggested_fixes_json: serde_json::Value = row
        .try_get("suggestedFixes")
        .unwrap_or(serde_json::json!([]));
    let suggested_fixes: Vec<SuggestedFix> =
        serde_json::from_value(suggested_fixes_json).unwrap_or_default();

    AlertAnalysis {
        id: row.try_get("id").unwrap_or_default(),
        alert_rule_id: row.try_get("alertRuleId").unwrap_or_default(),
        severity: row.try_get("severity").unwrap_or_default(),
        root_cause: row.try_get("rootCause").unwrap_or_default(),
        suggested_fixes,
        related_metrics: row
            .try_get("relatedMetrics")
            .unwrap_or(serde_json::json!({})),
        confidence: row.try_get("confidence").unwrap_or(0.0),
        status: row.try_get("status").unwrap_or_default(),
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        resolution: row.try_get("resolution").ok(),
        resolved_at: resolved_at.map(crate::auth::format_naive_datetime_iso_millis),
        resolved_by: row.try_get("resolvedBy").ok(),
    }
}

async fn generate_weekly_report(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match weekly_report::generate_report(&proxy).await {
        Ok(report) => Json(SuccessResponse {
            success: true,
            data: report,
        })
        .into_response(),
        Err(e) => {
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "GENERATE_FAILED", &e).into_response()
        }
    }
}

async fn get_weekly_reports(
    State(state): State<AppState>,
    Query(query): Query<PaginationQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };
    let limit = query.limit.unwrap_or(10);
    let offset = query.offset.unwrap_or(0);

    match weekly_report::get_reports(&proxy, limit, offset).await {
        Ok((reports, total)) => Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "reports": reports, "total": total }),
        })
        .into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_latest_weekly_report(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match weekly_report::get_latest_report(&proxy).await {
        Ok(Some(report)) => Json(SuccessResponse {
            success: true,
            data: report,
        })
        .into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "没有周报记录").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_weekly_report(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match weekly_report::get_report_by_id(&proxy, &id).await {
        Ok(Some(report)) => Json(SuccessResponse {
            success: true,
            data: report,
        })
        .into_response(),
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

async fn get_health_trend(
    State(state): State<AppState>,
    Query(query): Query<HealthTrendQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };
    let weeks = query.weeks.unwrap_or(12);

    match weekly_report::get_health_trend(&proxy, weeks).await {
        Ok(trend) => Json(SuccessResponse {
            success: true,
            data: trend,
        })
        .into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn generate_insight(
    State(state): State<AppState>,
    Json(payload): Json<insight_generator::GenerateInsightRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match insight_generator::generate_insights(&proxy, payload).await {
        Ok(insights) => Json(SuccessResponse {
            success: true,
            data: insights,
        })
        .into_response(),
        Err(e) => {
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "GENERATE_FAILED", &e).into_response()
        }
    }
}

async fn get_insights(
    State(state): State<AppState>,
    Query(query): Query<InsightsQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let limit = query.limit.unwrap_or(10).max(1).min(100);
    let offset = query.offset.unwrap_or(0).max(0);

    match insight_generator::get_insights(&proxy, limit, offset, query.status.as_deref()).await {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_insight(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match insight_generator::get_insight_by_id(&proxy, &id).await {
        Ok(Some(insight)) => Json(SuccessResponse {
            success: true,
            data: insight,
        })
        .into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "洞察不存在").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e).into_response(),
    }
}

async fn get_segments() -> Response {
    Json(SuccessResponse {
        success: true,
        data: USER_SEGMENTS,
    })
    .into_response()
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
            })
            .into_response()
        }
        Err(e) => {
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "RELOAD_FAILED", &e).into_response()
        }
    }
}

async fn get_amas_config(State(state): State<AppState>) -> Response {
    let engine = state.amas_engine();
    let config = engine.get_config().await;
    Json(SuccessResponse {
        success: true,
        data: config,
    })
    .into_response()
}

fn not_implemented() -> Response {
    json_error(
        StatusCode::NOT_IMPLEMENTED,
        "NOT_IMPLEMENTED",
        "功能尚未实现",
    )
    .into_response()
}
