use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::response::{json_error, AppError};
use crate::state::AppState;

const MAX_FEATURES_LENGTH: usize = 100;
const MAX_FEATURE_VALUE: f64 = 1e6;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObserveBody {
    features: Vec<f64>,
    treatment: i64,
    outcome: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ObserveResponse {
    id: String,
    treatment: i64,
    outcome: f64,
    timestamp: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CausalEstimateDto {
    ate: f64,
    standard_error: f64,
    confidence_interval_lower: f64,
    confidence_interval_upper: f64,
    sample_size: u32,
    effective_sample_size: f64,
    p_value: f64,
    significant: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CausalDiagnosticsDto {
    observation_count: i64,
    treatment_distribution: HashMap<i64, i64>,
    latest_estimate: Option<CausalEstimateDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompareQuery {
    strategy_a: Option<i64>,
    strategy_b: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StrategyComparisonResultDto {
    diff: f64,
    standard_error: f64,
    confidence_interval: [f64; 2],
    p_value: f64,
    significant: bool,
    sample_size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    strategy_a: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    strategy_b: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sample_size_a: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sample_size_b: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VariantAssignmentDto {
    variant_id: String,
    variant_name: String,
    is_control: bool,
    parameters: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VariantMetricBody {
    reward: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveExperimentDto {
    id: String,
    name: String,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserActiveExperimentDto {
    experiment_id: String,
    experiment_name: String,
    variant_id: String,
    variant_name: String,
    is_control: bool,
    parameters: serde_json::Value,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/causal/observe", post(observe))
        .route("/causal/ate", get(get_ate))
        .route("/causal/compare", get(compare_strategies))
        .route("/causal/diagnostics", get(get_diagnostics))
        .route("/variant/:experimentId", get(get_variant))
        .route("/variant/:experimentId/metric", post(record_variant_metric))
        .route("/active-experiments", get(get_active_experiments))
        .route("/user-experiments", get(get_user_experiments))
}

fn env_bool(key: &str) -> Option<bool> {
    let value = std::env::var(key).ok()?;
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    match normalized.as_str() {
        "1" | "true" | "yes" | "y" | "on" => Some(true),
        "0" | "false" | "no" | "n" | "off" => Some(false),
        _ => None,
    }
}

fn causal_inference_enabled() -> bool {
    env_bool("AMAS_FEATURE_CAUSAL_INFERENCE").unwrap_or(true)
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state
        .db_proxy()
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    Ok((proxy, user))
}

async fn require_admin_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let (proxy, user) = require_user(state, headers).await?;
    if user.role != "ADMIN" {
        return Err(json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "权限不足，需要管理员权限"));
    }
    Ok((proxy, user))
}

async fn observe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ObserveBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    if !causal_inference_enabled() {
        return Ok(Json(SuccessResponse::<Option<ObserveResponse>> { success: true, data: None }));
    }

    validate_observation(&payload)?;
    let now_ms = Utc::now().timestamp_millis();
    let id = Uuid::new_v4().to_string();

    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
    };
    insert_observation_pg(&pool, &id, &user.id, &payload, now_ms).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: Some(ObserveResponse {
            id,
            treatment: payload.treatment,
            outcome: payload.outcome,
            timestamp: now_ms.to_string(),
        }),
    }))
}

async fn get_ate(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !causal_inference_enabled() {
        return Ok(Json(SuccessResponse::<Option<CausalEstimateDto>> { success: true, data: None }));
    }

    let estimate = estimate_ate(proxy.as_ref()).await?;
    Ok(Json(SuccessResponse { success: true, data: estimate }))
}

async fn compare_strategies(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CompareQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !causal_inference_enabled() {
        return Ok(Json(SuccessResponse::<Option<StrategyComparisonResultDto>> { success: true, data: None }));
    }

    let a = query.strategy_a.ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "strategyA 和 strategyB 必须是有效的数字"))?;
    let b = query.strategy_b.ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "strategyA 和 strategyB 必须是有效的数字"))?;

    let result = compare_groups(proxy.as_ref(), a, b).await?;
    Ok(Json(SuccessResponse { success: true, data: result }))
}

async fn get_diagnostics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !causal_inference_enabled() {
        return Ok(Json(SuccessResponse::<Option<CausalDiagnosticsDto>> { success: true, data: None }));
    }

    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
    };
    let (observation_count, treatment_distribution) = diagnostics_pg(&pool).await?;

    let latest_estimate = estimate_ate(proxy.as_ref()).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: Some(CausalDiagnosticsDto {
            observation_count,
            treatment_distribution,
            latest_estimate,
        }),
    }))
}

async fn get_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let experiment_id = experiment_id.trim();
    if experiment_id.is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "experimentId 参数缺失"));
    }

    let assignment = get_or_assign_variant(proxy.as_ref(), &user.id, experiment_id).await?;
    let Some(assignment) = assignment else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "实验不存在或未在运行中"));
    };

    Ok(Json(SuccessResponse { success: true, data: assignment }))
}

async fn record_variant_metric(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(experiment_id): Path<String>,
    Json(payload): Json<VariantMetricBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let experiment_id = experiment_id.trim();
    if experiment_id.is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "experimentId 参数缺失"));
    }

    if !payload.reward.is_finite() || payload.reward < -1.0 || payload.reward > 1.0 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "reward 必须是 [-1, 1] 范围内的有效数字（不能为 NaN 或 Infinity）",
        ));
    }

    let assignment = get_user_variant(proxy.as_ref(), &user.id, experiment_id, true).await?;
    let Some(assignment) = assignment else {
        return Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户未参与此实验或实验已停止"));
    };

    record_metric(proxy.as_ref(), experiment_id, &assignment.variant_id, payload.reward).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "recorded": true }),
    }))
}

async fn get_active_experiments(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
    };
    let items = list_active_experiments_pg(&pool).await?;

    Ok(Json(SuccessResponse { success: true, data: items }))
}

async fn get_user_experiments(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
    };
    let items = list_user_active_experiments_pg(&pool, &user.id).await?;

    Ok(Json(SuccessResponse { success: true, data: items }))
}

fn validate_observation(payload: &ObserveBody) -> Result<(), AppError> {
    if payload.features.len() > MAX_FEATURES_LENGTH {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("features 数组长度不能超过 {MAX_FEATURES_LENGTH}"),
        ));
    }
    for (idx, value) in payload.features.iter().enumerate() {
        if !value.is_finite() || value.abs() > MAX_FEATURE_VALUE {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                format!("features[{idx}] 必须是有效数字，且绝对值不超过 {MAX_FEATURE_VALUE}"),
            ));
        }
    }
    if payload.treatment != 0 && payload.treatment != 1 {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "treatment 必须为 0 或 1"));
    }
    if !payload.outcome.is_finite() || payload.outcome < -1.0 || payload.outcome > 1.0 {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "outcome 必须在 [-1, 1] 范围内"));
    }
    Ok(())
}

async fn insert_observation_pg(
    pool: &sqlx::PgPool,
    id: &str,
    user_id: &str,
    payload: &ObserveBody,
    timestamp_ms: i64,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO "causal_observations"
          ("id","userId","features","treatment","outcome","timestamp")
        VALUES
          ($1,$2,$3,$4,$5,$6)
        "#,
    )
    .bind(id)
    .bind(user_id)
    .bind(sqlx::types::Json(payload.features.clone()))
    .bind(payload.treatment as i32)
    .bind(payload.outcome)
    .bind(timestamp_ms)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误"))?;
    Ok(())
}

async fn estimate_ate(proxy: &crate::db::DatabaseProxy) -> Result<Option<CausalEstimateDto>, AppError> {
    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else { return Ok(None) };
    let observations = load_causal_observations_pg(&pool).await?;

    let Some(dim) = observations.first().map(|o| o.features.len()) else { return Ok(None) };
    if dim == 0 {
        return Ok(None);
    }

    let filtered: Vec<danci_algo::CausalObservation> = observations
        .into_iter()
        .filter(|o| o.features.len() == dim && (o.treatment == 0 || o.treatment == 1))
        .map(|o| danci_algo::CausalObservation {
            features: o.features,
            treatment: o.treatment as u8,
            outcome: o.outcome,
            timestamp: Some(o.timestamp_ms as f64),
            user_id: o.user_id,
        })
        .collect();

    if filtered.len() < 10 {
        return Ok(None);
    }

    let mut estimator = danci_algo::CausalInferenceNative::new(dim as u32, None);
    estimator.fit(filtered.clone());
    let estimate = estimator.estimate_ate(filtered);

    Ok(Some(CausalEstimateDto {
        ate: estimate.ate,
        standard_error: estimate.standard_error,
        confidence_interval_lower: estimate.confidence_interval_lower,
        confidence_interval_upper: estimate.confidence_interval_upper,
        sample_size: estimate.sample_size as u32,
        effective_sample_size: estimate.effective_sample_size,
        p_value: estimate.p_value,
        significant: estimate.significant,
    }))
}

#[derive(Debug, Clone)]
struct RawObservation {
    features: Vec<f64>,
    treatment: i64,
    outcome: f64,
    timestamp_ms: i64,
    user_id: Option<String>,
}

async fn load_causal_observations_pg(pool: &sqlx::PgPool) -> Result<Vec<RawObservation>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT "features","treatment","outcome","timestamp","userId"
        FROM "causal_observations"
        ORDER BY "timestamp" ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let features = row
            .try_get::<sqlx::types::Json<Vec<f64>>, _>("features")
            .map(|v| v.0)
            .unwrap_or_default();
        let treatment = row.try_get::<i32, _>("treatment").map(|v| v as i64).unwrap_or(0);
        let outcome = row.try_get::<f64, _>("outcome").unwrap_or(0.0);
        let ts = row.try_get::<i64, _>("timestamp").unwrap_or(0);
        let user_id = row.try_get::<Option<String>, _>("userId").unwrap_or(None);
        out.push(RawObservation {
            features,
            treatment,
            outcome,
            timestamp_ms: ts,
            user_id,
        });
    }
    Ok(out)
}

async fn diagnostics_pg(pool: &sqlx::PgPool) -> Result<(i64, HashMap<i64, i64>), AppError> {
    let rows = sqlx::query(r#"SELECT "treatment", COUNT(*) as "count" FROM "causal_observations" GROUP BY "treatment""#)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let mut distribution = HashMap::new();
    let mut total = 0i64;
    for row in rows {
        let treatment = row.try_get::<i32, _>("treatment").map(|v| v as i64).unwrap_or(0);
        let count = row.try_get::<i64, _>("count").unwrap_or(0);
        distribution.insert(treatment, count);
        total += count;
    }
    Ok((total, distribution))
}

async fn compare_groups(
    proxy: &crate::db::DatabaseProxy,
    strategy_a: i64,
    strategy_b: i64,
) -> Result<Option<StrategyComparisonResultDto>, AppError> {
    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else { return Ok(None) };
    let observations = load_compare_observations_pg(&pool, strategy_a, strategy_b).await?;

    if observations.len() < 20 {
        return Ok(None);
    }

    let mut group_a = Vec::new();
    let mut group_b = Vec::new();
    for (treatment, outcome) in observations {
        if treatment == strategy_a {
            group_a.push(outcome);
        } else if treatment == strategy_b {
            group_b.push(outcome);
        }
    }

    if group_a.len() < 10 || group_b.len() < 10 {
        return Ok(None);
    }

    let mean_a = mean(&group_a);
    let mean_b = mean(&group_b);
    let var_a = variance(&group_a, mean_a);
    let var_b = variance(&group_b, mean_b);

    let diff = mean_b - mean_a;
    let pooled_se = (var_a / group_a.len() as f64 + var_b / group_b.len() as f64).sqrt();
    let z_score = if pooled_se > 0.0 { diff / pooled_se } else { 0.0 };
    let p_value = 2.0 * (1.0 - normal_cdf(z_score.abs()));
    let margin = 1.96 * pooled_se;
    let ci = [diff - margin, diff + margin];

    Ok(Some(StrategyComparisonResultDto {
        diff,
        standard_error: pooled_se,
        confidence_interval: ci,
        p_value,
        significant: p_value < 0.05,
        sample_size: (group_a.len() + group_b.len()) as i64,
        strategy_a: Some(strategy_a),
        strategy_b: Some(strategy_b),
        sample_size_a: Some(group_a.len() as i64),
        sample_size_b: Some(group_b.len() as i64),
    }))
}

async fn load_compare_observations_pg(
    pool: &sqlx::PgPool,
    strategy_a: i64,
    strategy_b: i64,
) -> Result<Vec<(i64, f64)>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT "treatment","outcome"
        FROM "causal_observations"
        WHERE "treatment" = $1 OR "treatment" = $2
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(strategy_a as i32)
    .bind(strategy_b as i32)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Ok(rows
        .into_iter()
        .map(|row| {
            let treatment = row.try_get::<i32, _>("treatment").map(|v| v as i64).unwrap_or(0);
            let outcome = row.try_get::<f64, _>("outcome").unwrap_or(0.0);
            (treatment, outcome)
        })
        .collect())
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn variance(values: &[f64], mean: f64) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    values
        .iter()
        .map(|v| (v - mean).powi(2))
        .sum::<f64>()
        / (values.len() as f64 - 1.0)
}

fn normal_cdf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.3275911 * x.abs());
    let a1 = 0.254829592;
    let a2 = -0.284496736;
    let a3 = 1.421413741;
    let a4 = -1.453152027;
    let a5 = 1.061405429;
    let y = 1.0
        - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t)
            * (-x * x / 2.0).exp();
    0.5 * (1.0 + if x < 0.0 { -y } else { y })
}

async fn get_user_variant(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    experiment_id: &str,
    require_running: bool,
) -> Result<Option<VariantAssignmentDto>, AppError> {
    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else { return Ok(None) };
    get_user_variant_pg(&pool, user_id, experiment_id, require_running).await
}

async fn get_or_assign_variant(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    experiment_id: &str,
) -> Result<Option<VariantAssignmentDto>, AppError> {
    if let Some(existing) = get_user_variant(proxy, user_id, experiment_id, false).await? {
        return Ok(Some(existing));
    }

    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else { return Ok(None) };
    assign_variant_pg(&pool, user_id, experiment_id).await
}

async fn get_user_variant_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
    experiment_id: &str,
    require_running: bool,
) -> Result<Option<VariantAssignmentDto>, AppError> {
    let row = if require_running {
        sqlx::query(
            r#"
            SELECT v."id" as "variantId", v."name" as "variantName", v."isControl" as "isControl", v."parameters" as "parameters"
            FROM "ab_user_assignments" a
            JOIN "ab_experiments" e ON e."id" = a."experimentId"
            JOIN "ab_variants" v ON v."id" = a."variantId"
            WHERE a."userId" = $1 AND a."experimentId" = $2 AND e."status" = 'RUNNING'
            "#,
        )
        .bind(user_id)
        .bind(experiment_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
    } else {
        sqlx::query(
            r#"
            SELECT v."id" as "variantId", v."name" as "variantName", v."isControl" as "isControl", v."parameters" as "parameters"
            FROM "ab_user_assignments" a
            JOIN "ab_variants" v ON v."id" = a."variantId"
            WHERE a."userId" = $1 AND a."experimentId" = $2
            "#,
        )
        .bind(user_id)
        .bind(experiment_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
    };

    let Some(row) = row else { return Ok(None) };
    Ok(Some(VariantAssignmentDto {
        variant_id: row.try_get::<String, _>("variantId").unwrap_or_default(),
        variant_name: row.try_get::<String, _>("variantName").unwrap_or_default(),
        is_control: row.try_get::<bool, _>("isControl").unwrap_or(false),
        parameters: row
            .try_get::<sqlx::types::Json<serde_json::Value>, _>("parameters")
            .map(|v| v.0)
            .unwrap_or_else(|_| serde_json::json!({})),
    }))
}

async fn assign_variant_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
    experiment_id: &str,
) -> Result<Option<VariantAssignmentDto>, AppError> {
    let status: Option<String> = sqlx::query_scalar(
        r#"SELECT "status"::text FROM "ab_experiments" WHERE "id" = $1"#,
    )
    .bind(experiment_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if status.as_deref() != Some("RUNNING") {
        return Ok(None);
    }

    let variants = sqlx::query(
        r#"SELECT "id","weight","name","isControl","parameters" FROM "ab_variants" WHERE "experimentId" = $1"#,
    )
    .bind(experiment_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if variants.is_empty() {
        return Ok(None);
    }

    let mut options: Vec<(String, f64)> = Vec::with_capacity(variants.len());
    for row in &variants {
        let id = row.try_get::<String, _>("id").unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let weight = row.try_get::<f64, _>("weight").unwrap_or(0.0).max(0.0);
        options.push((id, weight));
    }
    let Some(selected_id) = select_variant_id_by_hash(user_id, &options) else {
        return Ok(None);
    };

    sqlx::query(
        r#"
        INSERT INTO "ab_user_assignments" ("userId","experimentId","variantId","assignedAt")
        VALUES ($1,$2,$3,NOW())
        ON CONFLICT ("userId","experimentId") DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(experiment_id)
    .bind(&selected_id)
    .execute(pool)
    .await
    .ok();

    get_user_variant_pg(pool, user_id, experiment_id, false).await
}

fn hash_user_id(user_id: &str) -> u32 {
    let mut hash: i32 = 0;
    for ch in user_id.chars() {
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(ch as i32);
    }
    hash as u32
}

fn select_variant_id_by_hash(user_id: &str, variants: &[(String, f64)]) -> Option<String> {
    if variants.is_empty() {
        return None;
    }
    let hash = hash_user_id(user_id) as f64;
    let normalized = hash / 0xffffffffu32 as f64;
    let mut cumulative = 0.0;
    for (id, weight) in variants {
        cumulative += *weight;
        if normalized <= cumulative {
            return Some(id.clone());
        }
    }
    Some(variants[variants.len() - 1].0.clone())
}

async fn list_active_experiments_pg(pool: &sqlx::PgPool) -> Result<Vec<ActiveExperimentDto>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT "id","name","description"
        FROM "ab_experiments"
        WHERE "status" = 'RUNNING'
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Ok(rows
        .into_iter()
        .map(|row| ActiveExperimentDto {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            name: row.try_get::<String, _>("name").unwrap_or_default(),
            description: row.try_get::<Option<String>, _>("description").unwrap_or(None),
        })
        .collect())
}

async fn list_user_active_experiments_pg(
    pool: &sqlx::PgPool,
    user_id: &str,
) -> Result<Vec<UserActiveExperimentDto>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT
          e."id" as "experimentId",
          e."name" as "experimentName",
          v."id" as "variantId",
          v."name" as "variantName",
          v."isControl" as "isControl",
          v."parameters" as "parameters"
        FROM "ab_user_assignments" a
        JOIN "ab_experiments" e ON e."id" = a."experimentId"
        JOIN "ab_variants" v ON v."id" = a."variantId"
        WHERE a."userId" = $1 AND e."status" = 'RUNNING'
        ORDER BY e."createdAt" ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Ok(rows
        .into_iter()
        .map(|row| UserActiveExperimentDto {
            experiment_id: row.try_get::<String, _>("experimentId").unwrap_or_default(),
            experiment_name: row.try_get::<String, _>("experimentName").unwrap_or_default(),
            variant_id: row.try_get::<String, _>("variantId").unwrap_or_default(),
            variant_name: row.try_get::<String, _>("variantName").unwrap_or_default(),
            is_control: row.try_get::<bool, _>("isControl").unwrap_or(false),
            parameters: row
                .try_get::<sqlx::types::Json<serde_json::Value>, _>("parameters")
                .map(|v| v.0)
                .unwrap_or_else(|_| serde_json::json!({})),
        })
        .collect())
}

async fn record_metric(
    proxy: &crate::db::DatabaseProxy,
    experiment_id: &str,
    variant_id: &str,
    reward: f64,
) -> Result<(), AppError> {
    let primary = proxy.primary_pool().await;
    let Some(pool) = primary else {
        return Err(json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"));
    };
    record_metric_pg(&pool, experiment_id, variant_id, reward).await
}

async fn record_metric_pg(
    pool: &sqlx::PgPool,
    experiment_id: &str,
    variant_id: &str,
    reward: f64,
) -> Result<(), AppError> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误"))?;

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
    .unwrap_or(None);

    let Some(row) = current else {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "指标记录不存在"));
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
    .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误"))?;

    tx.commit()
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误"))?;
    Ok(())
}
