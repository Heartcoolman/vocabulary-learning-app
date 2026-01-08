use std::sync::{Arc, OnceLock};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Clone, Serialize)]
struct ParamRange {
    min: f64,
    max: f64,
}

#[derive(Debug, Clone, Serialize)]
struct OptimizationParamSpace {
    interval_scale: ParamRange,
    new_ratio: ParamRange,
    difficulty: ParamRange,
    hint_level: ParamRange,
}

#[derive(Debug, Clone, Copy)]
struct Bounds {
    min: f64,
    max: f64,
}

const PARAM_ORDER: [&str; 4] = ["interval_scale", "new_ratio", "difficulty", "hint_level"];
const DEFAULT_PARAMS: OptimizationParams = OptimizationParams {
    interval_scale: 1.0,
    new_ratio: 0.2,
    difficulty: 2,
    hint_level: 1,
};

fn default_param_space() -> OptimizationParamSpace {
    OptimizationParamSpace {
        interval_scale: ParamRange { min: 0.5, max: 2.0 },
        new_ratio: ParamRange { min: 0.0, max: 0.5 },
        difficulty: ParamRange { min: 1.0, max: 3.0 },
        hint_level: ParamRange { min: 0.0, max: 2.0 },
    }
}

fn bounds_for(key: &str) -> Bounds {
    match key {
        "interval_scale" => Bounds { min: 0.5, max: 2.0 },
        "new_ratio" => Bounds { min: 0.0, max: 0.5 },
        "difficulty" => Bounds { min: 1.0, max: 3.0 },
        "hint_level" => Bounds { min: 0.0, max: 2.0 },
        _ => Bounds { min: 0.0, max: 1.0 },
    }
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

fn bayesian_optimizer_enabled() -> bool {
    env_bool("AMAS_FEATURE_BAYESIAN_OPTIMIZER").unwrap_or(true)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OptimizationParams {
    interval_scale: f64,
    new_ratio: f64,
    difficulty: i64,
    hint_level: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvaluateBody {
    params: serde_json::Value,
    value: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestData {
    params: Option<OptimizationParams>,
    param_space: OptimizationParamSpace,
}

#[derive(Debug, Serialize)]
struct RecordedData {
    recorded: bool,
}

#[derive(Debug, Serialize)]
struct ResetData {
    reset: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BestData {
    params: OptimizationParams,
    value: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParamEvaluationDto {
    params: OptimizationParams,
    value: f64,
    timestamp: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OptimizationHistoryDto {
    observations: Vec<ParamEvaluationDto>,
    best_params: Option<OptimizationParams>,
    best_value: Option<f64>,
    evaluation_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TriggerResultDto {
    suggested: Option<OptimizationParams>,
    evaluated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsDto {
    enabled: bool,
    is_optimizing: bool,
    evaluation_count: usize,
    param_space: OptimizationParamSpace,
    best_params: Option<OptimizationParams>,
    best_value: Option<f64>,
}

#[derive(Default)]
struct OptimizationStore {
    is_optimizing: RwLock<bool>,
}

static OPTIMIZATION_STORE: OnceLock<Arc<OptimizationStore>> = OnceLock::new();

fn store() -> Arc<OptimizationStore> {
    OPTIMIZATION_STORE
        .get_or_init(|| Arc::new(OptimizationStore::default()))
        .clone()
}

#[derive(Debug, Clone)]
struct OptimizerObservation {
    params: Vec<f64>,
    value: f64,
    timestamp: i64,
}

#[derive(Debug, Clone)]
struct OptimizerBest {
    params: Vec<f64>,
    value: f64,
}

#[derive(Debug, Clone)]
struct OptimizerState {
    observations: Vec<OptimizerObservation>,
    best: Option<OptimizerBest>,
}

impl OptimizerState {
    fn evaluation_count(&self) -> usize {
        self.observations.len()
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/suggest", get(suggest_next))
        .route("/evaluate", post(evaluate_params))
        .route("/best", get(get_best))
        .route("/history", get(get_history))
        .route("/trigger", post(trigger_cycle))
        .route("/reset", post(reset_optimizer))
        .route("/diagnostics", get(get_diagnostics))
        .route("/param-space", get(get_param_space))
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

fn clamp(value: f64, bounds: Bounds) -> f64 {
    value.max(bounds.min).min(bounds.max)
}

fn random_unit() -> f64 {
    let bits = (Uuid::new_v4().as_u128() >> (128 - 53)) as u64;
    bits as f64 / ((1u64 << 53) as f64)
}

fn random_in(bounds: Bounds) -> f64 {
    bounds.min + random_unit() * (bounds.max - bounds.min)
}

fn sample_params(state: &OptimizerState) -> OptimizationParams {
    if let Some(best) = &state.best {
        let best_params = vec_to_params(&best.params);
        let explore = random_unit() < 0.2;
        let interval_bounds = bounds_for("interval_scale");
        let new_ratio_bounds = bounds_for("new_ratio");

        let interval_scale = if explore {
            random_in(interval_bounds)
        } else {
            let span = (interval_bounds.max - interval_bounds.min) * 0.1;
            clamp(
                best_params.interval_scale + (random_unit() * 2.0 - 1.0) * span,
                interval_bounds,
            )
        };

        let new_ratio = if explore {
            random_in(new_ratio_bounds)
        } else {
            let span = (new_ratio_bounds.max - new_ratio_bounds.min) * 0.1;
            clamp(
                best_params.new_ratio + (random_unit() * 2.0 - 1.0) * span,
                new_ratio_bounds,
            )
        };

        let difficulty = if explore {
            (random_in(bounds_for("difficulty")).round() as i64).clamp(1, 3)
        } else {
            (best_params.difficulty + (random_unit() * 2.0 - 1.0).round() as i64).clamp(1, 3)
        };

        let hint_level = if explore {
            (random_in(bounds_for("hint_level")).round() as i64).clamp(0, 2)
        } else {
            (best_params.hint_level + (random_unit() * 2.0 - 1.0).round() as i64).clamp(0, 2)
        };

        OptimizationParams {
            interval_scale,
            new_ratio,
            difficulty,
            hint_level,
        }
    } else if !state.observations.is_empty() {
        let base = DEFAULT_PARAMS;
        OptimizationParams {
            interval_scale: clamp(
                base.interval_scale + (random_unit() * 0.2 - 0.1),
                bounds_for("interval_scale"),
            ),
            new_ratio: clamp(
                base.new_ratio + (random_unit() * 0.1 - 0.05),
                bounds_for("new_ratio"),
            ),
            difficulty: (base.difficulty + (random_unit() * 2.0 - 1.0).round() as i64).clamp(1, 3),
            hint_level: (base.hint_level + (random_unit() * 2.0 - 1.0).round() as i64).clamp(0, 2),
        }
    } else {
        DEFAULT_PARAMS
    }
}

fn params_to_vec(params: &OptimizationParams) -> Vec<f64> {
    vec![
        clamp(params.interval_scale, bounds_for("interval_scale")),
        clamp(params.new_ratio, bounds_for("new_ratio")),
        (params.difficulty as f64).clamp(1.0, 3.0),
        (params.hint_level as f64).clamp(0.0, 2.0),
    ]
}

fn vec_to_params(params: &[f64]) -> OptimizationParams {
    let interval_scale = params
        .get(0)
        .copied()
        .unwrap_or(DEFAULT_PARAMS.interval_scale);
    let new_ratio = params.get(1).copied().unwrap_or(DEFAULT_PARAMS.new_ratio);
    let difficulty = params
        .get(2)
        .copied()
        .unwrap_or(DEFAULT_PARAMS.difficulty as f64)
        .round() as i64;
    let hint_level = params
        .get(3)
        .copied()
        .unwrap_or(DEFAULT_PARAMS.hint_level as f64)
        .round() as i64;

    OptimizationParams {
        interval_scale: clamp(interval_scale, bounds_for("interval_scale")),
        new_ratio: clamp(new_ratio, bounds_for("new_ratio")),
        difficulty: difficulty.clamp(1, 3),
        hint_level: hint_level.clamp(0, 2),
    }
}

fn parse_named_params(value: &serde_json::Value) -> Result<OptimizationParams, AppError> {
    let obj = value
        .as_object()
        .ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "params 必须是对象"))?;

    let extract = |key: &str| -> Result<f64, AppError> {
        let val = obj.get(key).ok_or_else(|| {
            json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                format!("params 缺少字段: {key}"),
            )
        })?;
        val.as_f64().ok_or_else(|| {
            json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                format!("params.{key} 必须是数字"),
            )
        })
    };

    let interval_scale = extract("interval_scale")?;
    let new_ratio = extract("new_ratio")?;
    let difficulty = extract("difficulty")?.round() as i64;
    let hint_level = extract("hint_level")?.round() as i64;

    Ok(OptimizationParams {
        interval_scale: clamp(interval_scale, bounds_for("interval_scale")),
        new_ratio: clamp(new_ratio, bounds_for("new_ratio")),
        difficulty: difficulty.clamp(1, 3),
        hint_level: hint_level.clamp(0, 2),
    })
}

fn parse_observations(value: serde_json::Value) -> Vec<OptimizerObservation> {
    let array = value.as_array().cloned().unwrap_or_default();
    let mut out = Vec::with_capacity(array.len());
    for entry in array {
        let Some(obj) = entry.as_object() else {
            continue;
        };
        let params = obj
            .get("params")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect::<Vec<f64>>())
            .unwrap_or_default();
        let Some(value) = obj.get("value").and_then(|v| v.as_f64()) else {
            continue;
        };
        let timestamp = obj
            .get("timestamp")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| Utc::now().timestamp_millis());
        out.push(OptimizerObservation {
            params,
            value,
            timestamp,
        });
    }
    out
}

fn parse_best(
    best_params: Option<serde_json::Value>,
    best_value: Option<f64>,
) -> Option<OptimizerBest> {
    let value = best_value?;
    let params_val = best_params?;
    let params = params_val
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect::<Vec<f64>>())
        .unwrap_or_default();
    if params.is_empty() {
        None
    } else {
        Some(OptimizerBest { params, value })
    }
}

async fn load_state(proxy: &crate::db::DatabaseProxy) -> Result<OptimizerState, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "observations" as "observations", "bestParams" as "bestParams", "bestValue" as "bestValue"
        FROM "bayesian_optimizer_state"
        WHERE "id" = $1
        "#,
    )
    .bind("global")
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let Some(row) = row else {
        return Ok(OptimizerState {
            observations: Vec::new(),
            best: None,
        });
    };

    let observations_val: serde_json::Value = row
        .try_get("observations")
        .unwrap_or_else(|_| serde_json::Value::Array(Vec::new()));
    let best_params_val: Option<serde_json::Value> = row.try_get("bestParams").ok();
    let best_value: Option<f64> = row.try_get("bestValue").ok();

    Ok(OptimizerState {
        observations: parse_observations(observations_val),
        best: parse_best(best_params_val, best_value),
    })
}

async fn persist_state(
    proxy: &crate::db::DatabaseProxy,
    optimizer_state: &OptimizerState,
) -> Result<(), AppError> {
    let observations_json = serde_json::Value::Array(
        optimizer_state
            .observations
            .iter()
            .map(|obs| {
                serde_json::json!({
                    "params": obs.params,
                    "value": obs.value,
                    "timestamp": obs.timestamp,
                })
            })
            .collect(),
    );

    let (best_params, best_value) = match &optimizer_state.best {
        Some(best) => (
            Some(serde_json::Value::Array(
                best.params
                    .iter()
                    .filter_map(|v| serde_json::Number::from_f64(*v).map(serde_json::Value::Number))
                    .collect(),
            )),
            Some(best.value),
        ),
        None => (None, None),
    };

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "bayesian_optimizer_state" ("id", "observations", "bestParams", "bestValue", "evaluationCount", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("id") DO UPDATE SET
            "observations" = EXCLUDED."observations",
            "bestParams" = EXCLUDED."bestParams",
            "bestValue" = EXCLUDED."bestValue",
            "evaluationCount" = EXCLUDED."evaluationCount",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind("global")
    .bind(observations_json)
    .bind(best_params)
    .bind(best_value)
    .bind(optimizer_state.evaluation_count() as i64)
    .bind(now)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))
}

async fn suggest_next(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    let params = if bayesian_optimizer_enabled() {
        let state = load_state(proxy.as_ref()).await?;
        Some(sample_params(&state))
    } else {
        None
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: SuggestData {
            params,
            param_space: default_param_space(),
        },
    }))
}

async fn evaluate_params(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EvaluateBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !bayesian_optimizer_enabled() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: RecordedData { recorded: false },
        }));
    }

    if !payload.value.is_finite() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "value 必须是有效的数字",
        ));
    }

    let params = parse_named_params(&payload.params)?;

    let mut state = load_state(proxy.as_ref()).await?;
    let now = Utc::now().timestamp_millis();
    let obs = OptimizerObservation {
        params: params_to_vec(&params),
        value: payload.value,
        timestamp: now,
    };
    state.observations.push(obs);
    match &state.best {
        Some(best) if payload.value > best.value => {
            state.best = Some(OptimizerBest {
                params: params_to_vec(&params),
                value: payload.value,
            });
        }
        None => {
            state.best = Some(OptimizerBest {
                params: params_to_vec(&params),
                value: payload.value,
            });
        }
        _ => {}
    }

    persist_state(proxy.as_ref(), &state).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: RecordedData { recorded: true },
    }))
}

async fn get_best(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !bayesian_optimizer_enabled() {
        return Ok(Json(SuccessResponse::<Option<BestData>> {
            success: true,
            data: None,
        }));
    }

    let state = load_state(proxy.as_ref()).await?;
    let best = state.best.map(|best| BestData {
        params: vec_to_params(&best.params),
        value: best.value,
    });

    Ok(Json(SuccessResponse {
        success: true,
        data: best,
    }))
}

async fn get_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !bayesian_optimizer_enabled() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: OptimizationHistoryDto {
                observations: Vec::new(),
                best_params: None,
                best_value: None,
                evaluation_count: 0,
            },
        }));
    }

    let state = load_state(proxy.as_ref()).await?;
    let observations = state
        .observations
        .iter()
        .map(|obs| ParamEvaluationDto {
            params: vec_to_params(&obs.params),
            value: obs.value,
            timestamp: obs.timestamp,
        })
        .collect::<Vec<_>>();

    Ok(Json(SuccessResponse {
        success: true,
        data: OptimizationHistoryDto {
            observations,
            best_params: state.best.as_ref().map(|best| vec_to_params(&best.params)),
            best_value: state.best.as_ref().map(|best| best.value),
            evaluation_count: state.evaluation_count(),
        },
    }))
}

async fn evaluate_recent_learning_effect_pg(pool: &sqlx::PgPool) -> Result<Option<f64>, AppError> {
    let boundary = (Utc::now() - Duration::hours(24)).naive_utc();
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) as "total",
            SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END) as "correct",
            AVG(NULLIF("responseTime", 0))::float8 as "avg_response_time"
        FROM "answer_records"
        WHERE "timestamp" >= $1
        "#,
    )
    .bind(boundary)
    .fetch_one(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let total: i64 = row.try_get("total").unwrap_or(0);
    let correct: i64 = row.try_get("correct").unwrap_or(0);
    let avg_rt: Option<f64> = row.try_get("avg_response_time").ok();

    if total < 10 {
        return Ok(None);
    }

    let accuracy = (correct.max(0) as f64) / (total as f64);
    let speed_score = match avg_rt {
        Some(rt) if rt.is_finite() && rt > 0.0 => (1.0 - (rt - 3000.0) / 7000.0).clamp(0.0, 1.0),
        _ => 0.5,
    };
    Ok(Some(accuracy * 0.6 + speed_score * 0.4))
}

async fn trigger_cycle(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !bayesian_optimizer_enabled() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: TriggerResultDto {
                suggested: None,
                evaluated: false,
            },
        }));
    }

    {
        let store = store();
        let mut guard = store.is_optimizing.write().await;
        if *guard {
            return Ok(Json(SuccessResponse {
                success: true,
                data: TriggerResultDto {
                    suggested: None,
                    evaluated: false,
                },
            }));
        }
        *guard = true;
    }

    let result = trigger_cycle_inner(proxy.as_ref()).await;

    {
        let store = store();
        let mut guard = store.is_optimizing.write().await;
        *guard = false;
    }

    result
}

async fn trigger_cycle_inner(
    proxy: &crate::db::DatabaseProxy,
) -> Result<Json<SuccessResponse<TriggerResultDto>>, AppError> {
    let mut state = load_state(proxy).await?;
    let suggested_params = sample_params(&state);

    let pool = proxy.pool();
    let evaluation_value = evaluate_recent_learning_effect_pg(&pool).await?;

    let mut evaluated = false;
    if let Some(value) = evaluation_value {
        evaluated = true;
        let now = Utc::now().timestamp_millis();
        state.observations.push(OptimizerObservation {
            params: params_to_vec(&suggested_params),
            value,
            timestamp: now,
        });
        match &state.best {
            Some(best) if value > best.value => {
                state.best = Some(OptimizerBest {
                    params: params_to_vec(&suggested_params),
                    value,
                });
            }
            None => {
                state.best = Some(OptimizerBest {
                    params: params_to_vec(&suggested_params),
                    value,
                });
            }
            _ => {}
        }
        persist_state(proxy, &state).await?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: TriggerResultDto {
            suggested: Some(suggested_params),
            evaluated,
        },
    }))
}

async fn reset_optimizer(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    if !bayesian_optimizer_enabled() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: ResetData { reset: false },
        }));
    }

    let state = OptimizerState {
        observations: Vec::new(),
        best: None,
    };
    persist_state(proxy.as_ref(), &state).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: ResetData { reset: true },
    }))
}

async fn get_diagnostics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin_user(&state, &headers).await?;

    let enabled = bayesian_optimizer_enabled();
    let state = if enabled {
        load_state(proxy.as_ref()).await?
    } else {
        OptimizerState {
            observations: Vec::new(),
            best: None,
        }
    };

    let is_optimizing = *store().is_optimizing.read().await;

    Ok(Json(SuccessResponse {
        success: true,
        data: DiagnosticsDto {
            enabled,
            is_optimizing,
            evaluation_count: state.evaluation_count(),
            param_space: default_param_space(),
            best_params: state.best.as_ref().map(|best| vec_to_params(&best.params)),
            best_value: state.best.as_ref().map(|best| best.value),
        },
    }))
}

async fn get_param_space(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_admin_user(&state, &headers).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: default_param_space(),
    }))
}
