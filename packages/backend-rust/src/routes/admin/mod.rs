use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Extension;
use axum::Json;
use axum::Router;
use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::middleware::RequestDbState;
use crate::response::json_error;
use crate::response::AppError;
use crate::state::AppState;

mod content;
mod logs;
mod ops;
mod statistics;
mod users;
mod wordbooks;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/users", users::router())
        .nest("/wordbooks", wordbooks::router())
        .nest("/logs", logs::router())
        .nest("/content", content::router())
        .nest("/ops", ops::router())
        .route("/statistics", axum::routing::get(statistics::get_statistics))
        .route("/export/history", axum::routing::get(get_export_history))
        .route("/metrics/error-rate", axum::routing::get(get_error_rate_metrics))
        .route("/metrics/performance", axum::routing::get(get_performance_metrics))
        .route(
            "/visual-fatigue/stats",
            axum::routing::get(get_visual_fatigue_stats),
        )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportHistoryQuery {
    limit: Option<i64>,
    data_type: Option<String>,
}

async fn get_export_history(
    Query(query): Query<ExportHistoryQuery>,
) -> Result<impl IntoResponse, AppError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let _data_type = query.data_type.unwrap_or_default();

    let items: Vec<serde_json::Value> = Vec::with_capacity(limit as usize);
    Ok(Json(SuccessResponse { success: true, data: items }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetricsRangeQuery {
    range: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorRatePoint {
    timestamp: i64,
    total_requests: i64,
    error_requests: i64,
    error_rate: f64,
}

async fn get_error_rate_metrics(
    Query(query): Query<MetricsRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let _range_minutes = query.range.unwrap_or(60).clamp(1, 7 * 24 * 60);
    let now_ms = Utc::now().timestamp_millis();

    let points = vec![ErrorRatePoint {
        timestamp: now_ms,
        total_requests: 0,
        error_requests: 0,
        error_rate: 0.0,
    }];

    Ok(Json(SuccessResponse { success: true, data: points }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PerformancePoint {
    timestamp: i64,
    avg: f64,
    p50: f64,
    p95: f64,
    p99: f64,
    count: i64,
}

async fn get_performance_metrics(
    Query(query): Query<MetricsRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let _range_minutes = query.range.unwrap_or(60).clamp(1, 7 * 24 * 60);
    let now_ms = Utc::now().timestamp_millis();

    let points = vec![PerformancePoint {
        timestamp: now_ms,
        avg: 0.0,
        p50: 0.0,
        p95: 0.0,
        p99: 0.0,
        count: 0,
    }];

    Ok(Json(SuccessResponse { success: true, data: points }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueStatsResponse {
    data_volume: VisualFatigueDataVolume,
    usage: VisualFatigueUsage,
    fatigue: VisualFatigueFatigue,
    period: VisualFatiguePeriod,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueDataVolume {
    total_records: i64,
    records_today: i64,
    records_this_week: i64,
    avg_records_per_user: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueUsage {
    total_users: i64,
    enabled_users: i64,
    enable_rate: i64,
    active_today: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FatigueDistributionPercent {
    low: i64,
    medium: i64,
    high: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueFatigue {
    avg_visual_fatigue: f64,
    avg_fused_fatigue: f64,
    high_fatigue_users: i64,
    fatigue_distribution: FatigueDistributionPercent,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatiguePeriod {
    start: String,
    end: String,
}

#[derive(Debug, Default)]
struct DistributionCounts {
    low: i64,
    medium: i64,
    high: i64,
}

async fn get_visual_fatigue_stats(
    State(state): State<AppState>,
    Extension(RequestDbState(request_state)): Extension<RequestDbState>,
    Extension(_user): Extension<crate::auth::AuthUser>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap_or_else(|| now.naive_utc());
    let week_start = today_start - chrono::Duration::days(7);

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        request_state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    let stats = if use_fallback {
        let Some(pool) = fallback else {
            return Err(json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "DATABASE_UNAVAILABLE",
                "数据库不可用",
            ));
        };
        fetch_visual_fatigue_stats_sqlite(&pool, today_start, week_start).await?
    } else {
        let Some(pool) = primary else {
            return Err(json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "DATABASE_UNAVAILABLE",
                "数据库不可用",
            ));
        };
        fetch_visual_fatigue_stats_pg(&pool, today_start, week_start).await?
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: stats,
    }))
}

async fn fetch_visual_fatigue_stats_pg(
    pool: &sqlx::PgPool,
    today_start: NaiveDateTime,
    week_start: NaiveDateTime,
) -> Result<VisualFatigueStatsResponse, AppError> {
    let total_records: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "visual_fatigue_records""#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let records_today: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "visual_fatigue_records" WHERE "createdAt" >= $1"#,
    )
    .bind(today_start)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let records_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "visual_fatigue_records" WHERE "createdAt" >= $1"#,
    )
    .bind(week_start)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let total_users: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "users""#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let enabled_users_from_config: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "user_visual_fatigue_configs" WHERE "enabled" = true"#,
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let active_today: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT "userId") FROM "visual_fatigue_records" WHERE "createdAt" >= $1"#,
    )
    .bind(today_start)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let users_with_records_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT "userId") FROM "visual_fatigue_records" WHERE "createdAt" >= $1"#,
    )
    .bind(week_start)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let aggregate_row = sqlx::query(
        r#"
        SELECT AVG("score") as "avgScore", AVG("fusedScore") as "avgFused"
        FROM "visual_fatigue_records"
        WHERE "createdAt" >= $1
        "#,
    )
    .bind(week_start)
    .fetch_one(pool)
    .await;

    let (avg_visual_fatigue, avg_fused_fatigue) = match aggregate_row {
        Ok(row) => (
            row.try_get::<Option<f64>, _>("avgScore").unwrap_or(Some(0.0)).unwrap_or(0.0),
            row.try_get::<Option<f64>, _>("avgFused").unwrap_or(Some(0.0)).unwrap_or(0.0),
        ),
        Err(_) => (0.0, 0.0),
    };

    let distribution_rows = sqlx::query(
        r#"
        SELECT
          CASE
            WHEN "fusedScore" < 0.3 THEN 'low'
            WHEN "fusedScore" < 0.6 THEN 'medium'
            ELSE 'high'
          END as "range",
          COUNT(*) as "count"
        FROM "visual_fatigue_records"
        WHERE "createdAt" >= $1
        GROUP BY "range"
        "#,
    )
    .bind(week_start)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut distribution = DistributionCounts::default();
    for row in distribution_rows {
        let range = row.try_get::<String, _>("range").unwrap_or_default();
        let count = row.try_get::<i64, _>("count").unwrap_or(0);
        match range.as_str() {
            "low" => distribution.low = count,
            "medium" => distribution.medium = count,
            "high" => distribution.high = count,
            _ => {}
        }
    }

    let distinct_users: i64 = sqlx::query_scalar(r#"SELECT COUNT(DISTINCT "userId") FROM "visual_fatigue_records""#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let avg_records_per_user = if distinct_users > 0 {
        (total_records as f64) / (distinct_users as f64)
    } else {
        0.0
    };

    let high_fatigue_users: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT "userId")
        FROM "visual_fatigue_records"
        WHERE "createdAt" >= $1
          AND "fusedScore" >= 0.6
        "#,
    )
    .bind(week_start)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let enabled_users = if enabled_users_from_config > 0 {
        enabled_users_from_config
    } else {
        users_with_records_this_week
    };

    let enable_rate = if total_users > 0 {
        ((enabled_users as f64 / total_users as f64) * 100.0).round() as i64
    } else {
        0
    };

    let total_distribution = distribution.low + distribution.medium + distribution.high;
    let fatigue_distribution = FatigueDistributionPercent {
        low: if total_distribution > 0 {
            ((distribution.low as f64 / total_distribution as f64) * 100.0).round() as i64
        } else {
            0
        },
        medium: if total_distribution > 0 {
            ((distribution.medium as f64 / total_distribution as f64) * 100.0).round() as i64
        } else {
            0
        },
        high: if total_distribution > 0 {
            ((distribution.high as f64 / total_distribution as f64) * 100.0).round() as i64
        } else {
            0
        },
    };

    Ok(VisualFatigueStatsResponse {
        data_volume: VisualFatigueDataVolume {
            total_records,
            records_today,
            records_this_week,
            avg_records_per_user: (avg_records_per_user * 10.0).round() / 10.0,
        },
        usage: VisualFatigueUsage {
            total_users,
            enabled_users,
            enable_rate,
            active_today,
        },
        fatigue: VisualFatigueFatigue {
            avg_visual_fatigue,
            avg_fused_fatigue,
            high_fatigue_users,
            fatigue_distribution,
        },
        period: VisualFatiguePeriod {
            start: chrono::DateTime::<Utc>::from_naive_utc_and_offset(week_start, Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            end: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        },
    })
}

async fn fetch_visual_fatigue_stats_sqlite(
    pool: &sqlx::SqlitePool,
    today_start: NaiveDateTime,
    week_start: NaiveDateTime,
) -> Result<VisualFatigueStatsResponse, AppError> {
    let today_start_str = today_start.format("%Y-%m-%d %H:%M:%S").to_string();
    let week_start_str = week_start.format("%Y-%m-%d %H:%M:%S").to_string();

    let total_records: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "visual_fatigue_records""#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let records_today: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "visual_fatigue_records" WHERE "createdAt" >= ?"#,
    )
    .bind(&today_start_str)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let records_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "visual_fatigue_records" WHERE "createdAt" >= ?"#,
    )
    .bind(&week_start_str)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let total_users: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "users""#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let enabled_users_from_config: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "user_visual_fatigue_configs" WHERE "enabled" != 0"#,
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let active_today: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT "userId") FROM "visual_fatigue_records" WHERE "createdAt" >= ?"#,
    )
    .bind(&today_start_str)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let users_with_records_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT "userId") FROM "visual_fatigue_records" WHERE "createdAt" >= ?"#,
    )
    .bind(&week_start_str)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let aggregate_row = sqlx::query(
        r#"
        SELECT AVG("score") as "avgScore", AVG("fusedScore") as "avgFused"
        FROM "visual_fatigue_records"
        WHERE "createdAt" >= ?
        "#,
    )
    .bind(&week_start_str)
    .fetch_one(pool)
    .await;

    let (avg_visual_fatigue, avg_fused_fatigue) = match aggregate_row {
        Ok(row) => (
            row.try_get::<Option<f64>, _>("avgScore").unwrap_or(Some(0.0)).unwrap_or(0.0),
            row.try_get::<Option<f64>, _>("avgFused").unwrap_or(Some(0.0)).unwrap_or(0.0),
        ),
        Err(_) => (0.0, 0.0),
    };

    let distribution_rows = sqlx::query(
        r#"
        SELECT
          CASE
            WHEN "fusedScore" < 0.3 THEN 'low'
            WHEN "fusedScore" < 0.6 THEN 'medium'
            ELSE 'high'
          END as "range",
          COUNT(*) as "count"
        FROM "visual_fatigue_records"
        WHERE "createdAt" >= ?
        GROUP BY "range"
        "#,
    )
    .bind(&week_start_str)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut distribution = DistributionCounts::default();
    for row in distribution_rows {
        let range = row.try_get::<String, _>("range").unwrap_or_default();
        let count = row.try_get::<i64, _>("count").unwrap_or(0);
        match range.as_str() {
            "low" => distribution.low = count,
            "medium" => distribution.medium = count,
            "high" => distribution.high = count,
            _ => {}
        }
    }

    let distinct_users: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(DISTINCT "userId") FROM "visual_fatigue_records""#)
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    let avg_records_per_user = if distinct_users > 0 {
        (total_records as f64) / (distinct_users as f64)
    } else {
        0.0
    };

    let high_fatigue_users: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT "userId")
        FROM "visual_fatigue_records"
        WHERE "createdAt" >= ?
          AND "fusedScore" >= 0.6
        "#,
    )
    .bind(&week_start_str)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let enabled_users = if enabled_users_from_config > 0 {
        enabled_users_from_config
    } else {
        users_with_records_this_week
    };

    let enable_rate = if total_users > 0 {
        ((enabled_users as f64 / total_users as f64) * 100.0).round() as i64
    } else {
        0
    };

    let total_distribution = distribution.low + distribution.medium + distribution.high;
    let fatigue_distribution = FatigueDistributionPercent {
        low: if total_distribution > 0 {
            ((distribution.low as f64 / total_distribution as f64) * 100.0).round() as i64
        } else {
            0
        },
        medium: if total_distribution > 0 {
            ((distribution.medium as f64 / total_distribution as f64) * 100.0).round() as i64
        } else {
            0
        },
        high: if total_distribution > 0 {
            ((distribution.high as f64 / total_distribution as f64) * 100.0).round() as i64
        } else {
            0
        },
    };

    Ok(VisualFatigueStatsResponse {
        data_volume: VisualFatigueDataVolume {
            total_records,
            records_today,
            records_this_week,
            avg_records_per_user: (avg_records_per_user * 10.0).round() / 10.0,
        },
        usage: VisualFatigueUsage {
            total_users,
            enabled_users,
            enable_rate,
            active_today,
        },
        fatigue: VisualFatigueFatigue {
            avg_visual_fatigue,
            avg_fused_fatigue,
            high_fatigue_users,
            fatigue_distribution,
        },
        period: VisualFatiguePeriod {
            start: chrono::DateTime::<Utc>::from_naive_utc_and_offset(week_start, Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            end: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        },
    })
}

pub async fn require_admin(State(state): State<AppState>, mut req: Request<Body>, next: Next) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => {
            if user.role != "ADMIN" {
                return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "权限不足，需要管理员权限").into_response();
            }
            req.extensions_mut().insert(user);
            next.run(req).await
        }
        Err(_err) => {
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response()
        }
    }
}
