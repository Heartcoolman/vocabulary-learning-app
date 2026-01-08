use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaginationMeta {
    total: i64,
    page: i64,
    page_size: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListExperimentsResponse {
    data: Vec<ExperimentListItemDto>,
    pagination: PaginationMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExperimentListItemDto {
    id: String,
    name: String,
    description: Option<String>,
    status: String,
    traffic_allocation: String,
    min_sample_size: i64,
    significance_level: f64,
    started_at: Option<String>,
    ended_at: Option<String>,
    created_at: String,
    updated_at: String,
    variant_count: i64,
    total_samples: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VariantDto {
    id: String,
    experiment_id: String,
    name: String,
    weight: f64,
    is_control: bool,
    parameters: serde_json::Value,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsDto {
    id: String,
    experiment_id: String,
    variant_id: String,
    sample_count: i64,
    primary_metric: f64,
    average_reward: f64,
    std_dev: f64,
    m2: f64,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExperimentDto {
    id: String,
    name: String,
    description: Option<String>,
    traffic_allocation: String,
    min_sample_size: i64,
    significance_level: f64,
    minimum_detectable_effect: f64,
    auto_decision: bool,
    status: String,
    started_at: Option<String>,
    ended_at: Option<String>,
    created_at: String,
    updated_at: String,
    variants: Vec<VariantDto>,
    metrics: Vec<MetricsDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExperimentStatusDto {
    status: String,
    p_value: f64,
    effect_size: f64,
    confidence_interval: ConfidenceIntervalDto,
    is_significant: bool,
    statistical_power: f64,
    sample_sizes: Vec<SampleSizeDto>,
    winner: Option<String>,
    recommendation: String,
    reason: String,
    is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfidenceIntervalDto {
    lower: f64,
    upper: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SampleSizeDto {
    variant_id: String,
    sample_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    status: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateExperimentBody {
    name: String,
    description: Option<String>,
    traffic_allocation: String,
    min_sample_size: i64,
    significance_level: f64,
    minimum_detectable_effect: f64,
    auto_decision: Option<bool>,
    variants: Vec<CreateVariantBody>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateVariantBody {
    id: String,
    name: String,
    weight: f64,
    is_control: bool,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateExperimentResult {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordMetricBody {
    variant_id: String,
    reward: f64,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_experiments).post(create_experiment))
        .route(
            "/:experimentId",
            get(get_experiment).delete(delete_experiment),
        )
        .route("/:experimentId/status", get(get_experiment_status))
        .route("/:experimentId/start", post(start_experiment))
        .route("/:experimentId/stop", post(stop_experiment))
        .route("/:experimentId/metric", post(record_metric))
        .fallback(|| async { (StatusCode::NOT_FOUND, Json(serde_json::json!({"success": false, "error": "接口不存在", "code": "NOT_FOUND"}))) })
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    Ok((proxy, user))
}

async fn require_admin_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let (proxy, user) = require_user(state, headers).await?;
    if user.role != "ADMIN" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "权限不足，需要管理员权限",
        ));
    }
    Ok((proxy, user))
}

async fn list_experiments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let status_filter = normalize_status_filter(query.status.as_deref());

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    let (items, total) =
        list_experiments_pg(&pool, status_filter.as_deref(), page_size, offset).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: ListExperimentsResponse {
            data: items,
            pagination: PaginationMeta {
                total,
                page,
                page_size,
            },
        },
    }))
}

async fn create_experiment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateExperimentBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    validate_create_experiment(&payload)?;

    let experiment_id = Uuid::new_v4().to_string();
    let auto_decision = payload.auto_decision.unwrap_or(false);

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    create_experiment_pg(&pool, &experiment_id, &payload, auto_decision).await?;

    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: CreateExperimentResult {
                id: experiment_id,
                name: payload.name.trim().to_string(),
            },
        }),
    ))
}

async fn get_experiment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    let experiment = fetch_experiment_pg(&pool, experiment_id.trim())
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "实验不存在"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: experiment,
    }))
}

async fn get_experiment_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    let experiment = fetch_experiment_pg(&pool, experiment_id.trim())
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "实验不存在"))?;

    let status = compute_experiment_status(&experiment);
    Ok(Json(SuccessResponse {
        success: true,
        data: status,
    }))
}

async fn start_experiment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let experiment_id = experiment_id.trim();

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    start_experiment_pg(&pool, experiment_id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "message": "实验已启动" }),
    }))
}

async fn stop_experiment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let experiment_id = experiment_id.trim();

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    stop_experiment_pg(&pool, experiment_id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "message": "实验已停止" }),
    }))
}

async fn delete_experiment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;
    let experiment_id = experiment_id.trim();

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    delete_experiment_pg(&pool, experiment_id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "message": "实验已删除" }),
    }))
}

async fn record_metric(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
    Json(payload): Json<RecordMetricBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;
    let experiment_id = experiment_id.trim();

    if payload.variant_id.trim().is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "variantId 不能为空",
        ));
    }
    if !payload.reward.is_finite() || payload.reward < -1.0 || payload.reward > 1.0 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "reward 必须在 [-1, 1] 范围内",
        ));
    }

    let primary = proxy.primary_pool().await;

    let Some(pool) = primary else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        ));
    };
    record_metric_pg(
        &pool,
        experiment_id,
        payload.variant_id.trim(),
        payload.reward,
    )
    .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "recorded": true }),
    }))
}

fn normalize_status_filter(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    if value.is_empty() {
        return None;
    }
    let normalized = value.to_ascii_uppercase();
    let allowed = ["DRAFT", "RUNNING", "COMPLETED", "ABORTED"];
    if allowed.contains(&normalized.as_str()) {
        Some(normalized)
    } else {
        None
    }
}

fn validate_create_experiment(payload: &CreateExperimentBody) -> Result<(), AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "实验名称不能为空",
        ));
    }
    if name.len() > 200 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "实验名称不能超过200个字符",
        ));
    }

    if payload.variants.len() < 2 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "至少需要两个变体",
        ));
    }

    let allocation = payload.traffic_allocation.trim().to_ascii_uppercase();
    if !["EVEN", "WEIGHTED", "DYNAMIC"].contains(&allocation.as_str()) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "无效的流量分配类型",
        ));
    }

    if payload.min_sample_size < 10 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "最小样本数必须至少为10",
        ));
    }
    if !(0.0 < payload.significance_level && payload.significance_level < 1.0) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "显著性水平必须在 0 和 1 之间",
        ));
    }
    if !(0.0 < payload.minimum_detectable_effect && payload.minimum_detectable_effect < 1.0) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "最小可检测效应必须在 0 和 1 之间",
        ));
    }

    let mut total_weight = 0.0;
    let mut control_count = 0;
    let mut ids = HashMap::<String, ()>::new();
    for variant in &payload.variants {
        let id = variant.id.trim();
        if id.is_empty() {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "每个变体必须有唯一ID",
            ));
        }
        if ids.insert(id.to_string(), ()).is_some() {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "变体ID重复",
            ));
        }
        if variant.name.trim().is_empty() {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "每个变体必须有名称",
            ));
        }
        if !(0.0..=1.0).contains(&variant.weight) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "变体权重必须在 0 和 1 之间",
            ));
        }
        total_weight += variant.weight;
        if variant.is_control {
            control_count += 1;
        }
    }
    if (total_weight - 1.0).abs() > 0.01 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "变体权重总和必须为 1",
        ));
    }
    if control_count != 1 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "必须有且仅有一个控制组",
        ));
    }

    Ok(())
}

async fn list_experiments_pg(
    pool: &sqlx::PgPool,
    status: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<ExperimentListItemDto>, i64), AppError> {
    let total: i64 = if let Some(status) = status {
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ab_experiments" WHERE "status" = $1"#)
            .bind(status)
            .fetch_one(pool)
            .await
            .unwrap_or(0)
    } else {
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ab_experiments""#)
            .fetch_one(pool)
            .await
            .unwrap_or(0)
    };

    let rows = if let Some(status) = status {
        sqlx::query(
            r#"
            SELECT
              "id","name","description",
              "status"::text as "status",
              "trafficAllocation"::text as "trafficAllocation",
              "minSampleSize","significanceLevel",
              "startedAt","endedAt","createdAt","updatedAt",
              (SELECT COUNT(*) FROM "ab_variants" v WHERE v."experimentId" = e."id") as "variantCount",
              (SELECT COALESCE(SUM("sampleCount"),0) FROM "ab_experiment_metrics" m WHERE m."experimentId" = e."id") as "totalSamples"
            FROM "ab_experiments" e
            WHERE "status" = $1
            ORDER BY "createdAt" DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query(
            r#"
            SELECT
              "id","name","description",
              "status"::text as "status",
              "trafficAllocation"::text as "trafficAllocation",
              "minSampleSize","significanceLevel",
              "startedAt","endedAt","createdAt","updatedAt",
              (SELECT COUNT(*) FROM "ab_variants" v WHERE v."experimentId" = e."id") as "variantCount",
              (SELECT COALESCE(SUM("sampleCount"),0) FROM "ab_experiment_metrics" m WHERE m."experimentId" = e."id") as "totalSamples"
            FROM "ab_experiments" e
            ORDER BY "createdAt" DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    };

    let items = rows
        .into_iter()
        .map(|row| ExperimentListItemDto {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            name: row.try_get::<String, _>("name").unwrap_or_default(),
            description: row
                .try_get::<Option<String>, _>("description")
                .unwrap_or(None),
            status: row
                .try_get::<String, _>("status")
                .unwrap_or_else(|_| "DRAFT".to_string()),
            traffic_allocation: row
                .try_get::<String, _>("trafficAllocation")
                .unwrap_or_else(|_| "WEIGHTED".to_string()),
            min_sample_size: row
                .try_get::<i32, _>("minSampleSize")
                .map(|v| v as i64)
                .unwrap_or(100),
            significance_level: row.try_get::<f64, _>("significanceLevel").unwrap_or(0.05),
            started_at: row
                .try_get::<Option<NaiveDateTime>, _>("startedAt")
                .ok()
                .flatten()
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                }),
            ended_at: row
                .try_get::<Option<NaiveDateTime>, _>("endedAt")
                .ok()
                .flatten()
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                }),
            created_at: row
                .try_get::<NaiveDateTime, _>("createdAt")
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                })
                .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
            updated_at: row
                .try_get::<NaiveDateTime, _>("updatedAt")
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                })
                .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
            variant_count: row.try_get::<i64, _>("variantCount").unwrap_or(0),
            total_samples: row.try_get::<i64, _>("totalSamples").unwrap_or(0),
        })
        .collect();

    Ok((items, total))
}

async fn create_experiment_pg(
    pool: &sqlx::PgPool,
    experiment_id: &str,
    payload: &CreateExperimentBody,
    auto_decision: bool,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    sqlx::query(
        r#"
        INSERT INTO "ab_experiments"
          ("id","name","description","trafficAllocation","minSampleSize","significanceLevel","minimumDetectableEffect","autoDecision","status")
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT')
        "#,
    )
    .bind(experiment_id)
    .bind(payload.name.trim())
    .bind(payload.description.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()))
    .bind(payload.traffic_allocation.trim().to_ascii_uppercase())
    .bind(payload.min_sample_size as i32)
    .bind(payload.significance_level)
    .bind(payload.minimum_detectable_effect)
    .bind(auto_decision)
    .execute(&mut *tx)
    .await
    .map_err(|_| json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "创建实验失败"))?;

    for variant in &payload.variants {
        sqlx::query(
            r#"
            INSERT INTO "ab_variants"
              ("id","experimentId","name","weight","isControl","parameters")
            VALUES
              ($1,$2,$3,$4,$5,$6)
            "#,
        )
        .bind(variant.id.trim())
        .bind(experiment_id)
        .bind(variant.name.trim())
        .bind(variant.weight)
        .bind(variant.is_control)
        .bind(sqlx::types::Json(variant.parameters.clone()))
        .execute(&mut *tx)
        .await
        .map_err(|_| json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "创建变体失败"))?;
    }

    tx.commit().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;
    Ok(())
}

async fn fetch_experiment_pg(
    pool: &sqlx::PgPool,
    experiment_id: &str,
) -> Result<Option<ExperimentDto>, AppError> {
    let experiment_row = sqlx::query(
        r#"
        SELECT
          "id","name","description",
          "trafficAllocation"::text as "trafficAllocation",
          "minSampleSize","significanceLevel","minimumDetectableEffect","autoDecision",
          "status"::text as "status",
          "startedAt","endedAt","createdAt","updatedAt"
        FROM "ab_experiments"
        WHERE "id" = $1
        "#,
    )
    .bind(experiment_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    let Some(row) = experiment_row else {
        return Ok(None);
    };

    let variants_rows = sqlx::query(
        r#"
        SELECT
          "id","experimentId","name","weight","isControl","parameters","createdAt","updatedAt"
        FROM "ab_variants"
        WHERE "experimentId" = $1
        ORDER BY "createdAt" ASC
        "#,
    )
    .bind(experiment_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let metrics_rows = sqlx::query(
        r#"
        SELECT
          "id","experimentId","variantId","sampleCount","primaryMetric","averageReward","stdDev","m2","updatedAt"
        FROM "ab_experiment_metrics"
        WHERE "experimentId" = $1
        "#,
    )
    .bind(experiment_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let created_at = row
        .try_get::<NaiveDateTime, _>("createdAt")
        .map(|dt| {
            DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                .to_rfc3339_opts(SecondsFormat::Millis, true)
        })
        .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));
    let updated_at = row
        .try_get::<NaiveDateTime, _>("updatedAt")
        .map(|dt| {
            DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                .to_rfc3339_opts(SecondsFormat::Millis, true)
        })
        .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));

    let started_at = row
        .try_get::<Option<NaiveDateTime>, _>("startedAt")
        .ok()
        .flatten()
        .map(|dt| {
            DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                .to_rfc3339_opts(SecondsFormat::Millis, true)
        });
    let ended_at = row
        .try_get::<Option<NaiveDateTime>, _>("endedAt")
        .ok()
        .flatten()
        .map(|dt| {
            DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                .to_rfc3339_opts(SecondsFormat::Millis, true)
        });

    let variants = variants_rows
        .into_iter()
        .map(|row| VariantDto {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            experiment_id: row.try_get::<String, _>("experimentId").unwrap_or_default(),
            name: row.try_get::<String, _>("name").unwrap_or_default(),
            weight: row.try_get::<f64, _>("weight").unwrap_or(0.5),
            is_control: row.try_get::<bool, _>("isControl").unwrap_or(false),
            parameters: row
                .try_get::<sqlx::types::Json<serde_json::Value>, _>("parameters")
                .map(|v| v.0)
                .unwrap_or_else(|_| serde_json::json!({})),
            created_at: row
                .try_get::<NaiveDateTime, _>("createdAt")
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                })
                .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
            updated_at: row
                .try_get::<NaiveDateTime, _>("updatedAt")
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                })
                .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        })
        .collect();

    let metrics = metrics_rows
        .into_iter()
        .map(|row| MetricsDto {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            experiment_id: row.try_get::<String, _>("experimentId").unwrap_or_default(),
            variant_id: row.try_get::<String, _>("variantId").unwrap_or_default(),
            sample_count: row
                .try_get::<i32, _>("sampleCount")
                .map(|v| v as i64)
                .unwrap_or(0),
            primary_metric: row.try_get::<f64, _>("primaryMetric").unwrap_or(0.0),
            average_reward: row.try_get::<f64, _>("averageReward").unwrap_or(0.0),
            std_dev: row.try_get::<f64, _>("stdDev").unwrap_or(0.0),
            m2: row.try_get::<f64, _>("m2").unwrap_or(0.0),
            updated_at: row
                .try_get::<NaiveDateTime, _>("updatedAt")
                .map(|dt| {
                    DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
                        .to_rfc3339_opts(SecondsFormat::Millis, true)
                })
                .unwrap_or_else(|_| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        })
        .collect();

    Ok(Some(ExperimentDto {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        name: row.try_get::<String, _>("name").unwrap_or_default(),
        description: row
            .try_get::<Option<String>, _>("description")
            .unwrap_or(None),
        traffic_allocation: row
            .try_get::<String, _>("trafficAllocation")
            .unwrap_or_else(|_| "WEIGHTED".to_string()),
        min_sample_size: row
            .try_get::<i32, _>("minSampleSize")
            .map(|v| v as i64)
            .unwrap_or(100),
        significance_level: row.try_get::<f64, _>("significanceLevel").unwrap_or(0.05),
        minimum_detectable_effect: row
            .try_get::<f64, _>("minimumDetectableEffect")
            .unwrap_or(0.05),
        auto_decision: row.try_get::<bool, _>("autoDecision").unwrap_or(false),
        status: row
            .try_get::<String, _>("status")
            .unwrap_or_else(|_| "DRAFT".to_string()),
        started_at,
        ended_at,
        created_at,
        updated_at,
        variants,
        metrics,
    }))
}

async fn start_experiment_pg(pool: &sqlx::PgPool, experiment_id: &str) -> Result<(), AppError> {
    let mut tx = pool.begin().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    let exp =
        sqlx::query(r#"SELECT "status"::text as "status" FROM "ab_experiments" WHERE "id" = $1"#)
            .bind(experiment_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| {
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
            })?;

    let Some(exp) = exp else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "实验不存在"));
    };
    let status = exp
        .try_get::<String, _>("status")
        .unwrap_or_else(|_| "DRAFT".to_string());
    if status != "DRAFT" {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "只能启动草稿状态的实验",
        ));
    }

    let variants = sqlx::query(r#"SELECT "id" FROM "ab_variants" WHERE "experimentId" = $1"#)
        .bind(experiment_id)
        .fetch_all(&mut *tx)
        .await
        .unwrap_or_default();
    if variants.len() < 2 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "实验至少需要两个变体",
        ));
    }

    sqlx::query(
        r#"UPDATE "ab_experiments" SET "status" = 'RUNNING', "startedAt" = NOW() WHERE "id" = $1"#,
    )
    .bind(experiment_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    for row in variants {
        let variant_id = row.try_get::<String, _>("id").unwrap_or_default();
        if variant_id.is_empty() {
            continue;
        }
        sqlx::query(
            r#"
            INSERT INTO "ab_experiment_metrics"
              ("id","experimentId","variantId","sampleCount","primaryMetric","averageReward","stdDev","m2")
            VALUES
              ($1,$2,$3,0,0,0,0,0)
            ON CONFLICT ("experimentId","variantId") DO NOTHING
            "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(experiment_id)
        .bind(variant_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误"))?;
    }

    tx.commit().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;
    Ok(())
}

async fn stop_experiment_pg(pool: &sqlx::PgPool, experiment_id: &str) -> Result<(), AppError> {
    let status: Option<String> =
        sqlx::query_scalar(r#"SELECT "status"::text FROM "ab_experiments" WHERE "id" = $1"#)
            .bind(experiment_id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

    let Some(status) = status else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "实验不存在"));
    };
    if status != "RUNNING" {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "只能停止运行中的实验",
        ));
    }

    sqlx::query(
        r#"UPDATE "ab_experiments" SET "status" = 'COMPLETED', "endedAt" = NOW() WHERE "id" = $1"#,
    )
    .bind(experiment_id)
    .execute(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;
    Ok(())
}

async fn delete_experiment_pg(pool: &sqlx::PgPool, experiment_id: &str) -> Result<(), AppError> {
    let status: Option<String> =
        sqlx::query_scalar(r#"SELECT "status"::text FROM "ab_experiments" WHERE "id" = $1"#)
            .bind(experiment_id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);
    let Some(status) = status else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "实验不存在"));
    };
    if status == "RUNNING" {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "无法删除运行中的实验",
        ));
    }

    let mut tx = pool.begin().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;
    sqlx::query(r#"DELETE FROM "ab_user_assignments" WHERE "experimentId" = $1"#)
        .bind(experiment_id)
        .execute(&mut *tx)
        .await
        .ok();
    sqlx::query(r#"DELETE FROM "ab_experiment_metrics" WHERE "experimentId" = $1"#)
        .bind(experiment_id)
        .execute(&mut *tx)
        .await
        .ok();
    sqlx::query(r#"DELETE FROM "ab_variants" WHERE "experimentId" = $1"#)
        .bind(experiment_id)
        .execute(&mut *tx)
        .await
        .ok();
    sqlx::query(r#"DELETE FROM "ab_experiments" WHERE "id" = $1"#)
        .bind(experiment_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
        })?;
    tx.commit().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;
    Ok(())
}

async fn record_metric_pg(
    pool: &sqlx::PgPool,
    experiment_id: &str,
    variant_id: &str,
    reward: f64,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    let current = sqlx::query(
        r#"
        SELECT "sampleCount","averageReward","m2"
        FROM "ab_experiment_metrics"
        WHERE "experimentId" = $1 AND "variantId" = $2
        FOR UPDATE
        "#,
    )
    .bind(experiment_id)
    .bind(variant_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    let Some(row) = current else {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "指标记录不存在",
        ));
    };

    let sample_count = row.try_get::<i32, _>("sampleCount").unwrap_or(0) as i64;
    let average_reward = row.try_get::<f64, _>("averageReward").unwrap_or(0.0);
    let m2 = row.try_get::<f64, _>("m2").unwrap_or(0.0);

    let n = sample_count + 1;
    let delta = reward - average_reward;
    let new_mean = average_reward + delta / n as f64;
    let delta2 = reward - new_mean;
    let new_m2 = m2 + delta * delta2;
    let new_std_dev = if n > 1 {
        (new_m2 / (n - 1) as f64).sqrt()
    } else {
        0.0
    };

    sqlx::query(
        r#"
        UPDATE "ab_experiment_metrics"
        SET "sampleCount" = $1,
            "averageReward" = $2,
            "m2" = $3,
            "stdDev" = $4,
            "primaryMetric" = $2,
            "updatedAt" = NOW()
        WHERE "experimentId" = $5 AND "variantId" = $6
        "#,
    )
    .bind(n as i32)
    .bind(new_mean)
    .bind(new_m2)
    .bind(new_std_dev)
    .bind(experiment_id)
    .bind(variant_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    tx.commit().await.map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;
    Ok(())
}

fn compute_experiment_status(experiment: &ExperimentDto) -> ExperimentStatusDto {
    let sample_sizes: Vec<SampleSizeDto> = experiment
        .metrics
        .iter()
        .map(|m| SampleSizeDto {
            variant_id: m.variant_id.clone(),
            sample_count: m.sample_count,
        })
        .collect();

    if experiment.variants.len() < 2 || experiment.metrics.is_empty() {
        return default_status(&experiment.status, sample_sizes);
    }

    let control = experiment.variants.iter().find(|v| v.is_control);
    let treatment = experiment.variants.iter().find(|v| !v.is_control);
    let (Some(control), Some(treatment)) = (control, treatment) else {
        return default_status(&experiment.status, sample_sizes);
    };

    let control_metrics = experiment
        .metrics
        .iter()
        .find(|m| m.variant_id == control.id);
    let treatment_metrics = experiment
        .metrics
        .iter()
        .find(|m| m.variant_id == treatment.id);
    let (Some(control_metrics), Some(treatment_metrics)) = (control_metrics, treatment_metrics)
    else {
        return default_status(&experiment.status, sample_sizes);
    };

    if control_metrics.sample_count == 0 || treatment_metrics.sample_count == 0 {
        return default_status(&experiment.status, sample_sizes);
    }

    let control_mean = control_metrics.average_reward;
    let treatment_mean = treatment_metrics.average_reward;
    let effect_size = if control_mean.abs() > f64::EPSILON {
        (treatment_mean - control_mean) / control_mean
    } else {
        0.0
    };

    let significance = calculate_significance(
        control_metrics.sample_count as f64,
        treatment_metrics.sample_count as f64,
        control_mean,
        treatment_mean,
        control_metrics.std_dev,
        treatment_metrics.std_dev,
        experiment.significance_level,
    );

    let power = calculate_power(
        control_metrics.sample_count.max(1) as f64,
        treatment_metrics.sample_count.max(1) as f64,
        effect_size,
        experiment.significance_level,
    );

    let total_samples: i64 = sample_sizes.iter().map(|s| s.sample_count).sum();

    let mut winner: Option<String> = None;
    let (recommendation, reason) =
        if significance.is_significant && effect_size > experiment.minimum_detectable_effect {
            winner = Some(if effect_size > 0.0 {
                treatment.id.clone()
            } else {
                control.id.clone()
            });
            (
                format!(
                    "建议采用 {}",
                    if winner.as_deref() == Some(&treatment.id) {
                        &treatment.name
                    } else {
                        &control.name
                    }
                ),
                format!(
                    "效应量 {:.1}% 超过最小可检测效应 {:.1}%，且统计显著",
                    effect_size * 100.0,
                    experiment.minimum_detectable_effect * 100.0
                ),
            )
        } else if total_samples < experiment.min_sample_size {
            (
                "继续收集数据".to_string(),
                format!(
                    "当前样本量 {total_samples} 未达到最小要求 {}",
                    experiment.min_sample_size
                ),
            )
        } else if !significance.is_significant {
            (
                "无显著差异，可考虑结束实验".to_string(),
                format!(
                    "p值 {:.4} 大于显著性水平 {}",
                    significance.p_value, experiment.significance_level
                ),
            )
        } else {
            (
                "效应量较小，建议继续观察".to_string(),
                format!("效应量 {:.1}% 未达到最小可检测效应", effect_size * 100.0),
            )
        };

    let status = match experiment.status.as_str() {
        "RUNNING" => "running",
        "COMPLETED" => "completed",
        "DRAFT" => "draft",
        "ABORTED" => "aborted",
        _ => "stopped",
    };

    ExperimentStatusDto {
        status: status.to_string(),
        p_value: significance.p_value,
        effect_size,
        confidence_interval: ConfidenceIntervalDto {
            lower: significance.ci_lower,
            upper: significance.ci_upper,
        },
        is_significant: significance.is_significant,
        statistical_power: power,
        sample_sizes,
        winner,
        recommendation,
        reason,
        is_active: experiment.status == "RUNNING",
    }
}

struct SignificanceResult {
    p_value: f64,
    is_significant: bool,
    ci_lower: f64,
    ci_upper: f64,
}

fn calculate_significance(
    n1: f64,
    n2: f64,
    mean1: f64,
    mean2: f64,
    std1: f64,
    std2: f64,
    alpha: f64,
) -> SignificanceResult {
    let se = ((std1 * std1) / n1.max(1.0) + (std2 * std2) / n2.max(1.0)).sqrt();
    let diff = mean2 - mean1;
    let t = if se > 0.0 { diff / se } else { 0.0 };
    let p_value = 2.0 * (1.0 - normal_cdf(t.abs()));

    let z_critical = 1.96;
    let margin = z_critical * se;
    let relative_diff = if mean1.abs() > f64::EPSILON {
        diff / mean1
    } else {
        0.0
    };
    let relative_margin = if mean1.abs() > f64::EPSILON {
        margin / mean1.abs()
    } else {
        0.0
    };

    SignificanceResult {
        p_value: p_value.clamp(0.0, 1.0),
        is_significant: p_value < alpha,
        ci_lower: relative_diff - relative_margin,
        ci_upper: relative_diff + relative_margin,
    }
}

fn calculate_power(n1: f64, n2: f64, effect_size: f64, alpha: f64) -> f64 {
    let pooled_n = 2.0 / (1.0 / n1.max(1.0) + 1.0 / n2.max(1.0));
    let non_centrality = effect_size.abs() * (pooled_n / 2.0).sqrt();
    let z_alpha = normal_quantile(1.0 - alpha / 2.0);
    (1.0 - normal_cdf(z_alpha - non_centrality)).clamp(0.0, 1.0)
}

fn normal_cdf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.2316419 * x.abs());
    let d = 0.3989422804 * (-x * x / 2.0).exp();
    let p =
        d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if x > 0.0 {
        1.0 - p
    } else {
        p
    }
}

fn normal_quantile(p: f64) -> f64 {
    if p <= 0.0 {
        return f64::NEG_INFINITY;
    }
    if p >= 1.0 {
        return f64::INFINITY;
    }
    if (p - 0.5).abs() < f64::EPSILON {
        return 0.0;
    }

    let a = [
        -3.969683028665376e1,
        2.209460984245205e2,
        -2.759285104469687e2,
        1.38357751867269e2,
        -3.066479806614716e1,
        2.506628277459239,
    ];
    let b = [
        -5.447609879822406e1,
        1.615858368580409e2,
        -1.556989798598866e2,
        6.680131188771972e1,
        -1.328068155288572e1,
    ];
    let c = [
        -7.784894002430293e-3,
        -3.223964580411365e-1,
        -2.400758277161838,
        -2.549732539343734,
        4.374664141464968,
        2.938163982698783,
    ];
    let d = [
        7.784695709041462e-3,
        3.224671290700398e-1,
        2.445134137142996,
        3.754408661907416,
    ];

    let p_low = 0.02425;
    let p_high = 1.0 - p_low;

    if p < p_low {
        let q = (-2.0 * p.ln()).sqrt();
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
    }

    if p <= p_high {
        let q = p - 0.5;
        let r = q * q;
        return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q)
            / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0);
    }

    let q = (-2.0 * (1.0 - p).ln()).sqrt();
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
        / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
}

fn default_status(status: &str, sample_sizes: Vec<SampleSizeDto>) -> ExperimentStatusDto {
    let mapped = match status {
        "RUNNING" => "running",
        "COMPLETED" => "completed",
        "DRAFT" => "draft",
        "ABORTED" => "aborted",
        _ => "stopped",
    };
    ExperimentStatusDto {
        status: mapped.to_string(),
        p_value: 1.0,
        effect_size: 0.0,
        confidence_interval: ConfidenceIntervalDto {
            lower: 0.0,
            upper: 0.0,
        },
        is_significant: false,
        statistical_power: 0.0,
        sample_sizes,
        winner: None,
        recommendation: "数据不足，无法进行分析".to_string(),
        reason: "需要更多样本数据".to_string(),
        is_active: status == "RUNNING",
    }
}
