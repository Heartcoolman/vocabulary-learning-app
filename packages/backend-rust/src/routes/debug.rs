use std::sync::{Arc, OnceLock};

use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::atomic::Ordering;
use tokio::sync::RwLock;

use crate::amas::config::FeatureFlags;
use crate::response::{json_error, AppError};
use crate::services::llm_provider::{set_llm_runtime_enabled, set_llm_runtime_mock};
use crate::state::AppState;

const MAX_AUDIT_LOG_SIZE: usize = 100;
const MAX_SIMULATION_DURATION_MS: i64 = 5 * 60 * 1000;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct MessageResponse<T> {
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditLogEntry {
    timestamp: String,
    action: String,
    details: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServicesDebugConfig {
    behavior_fatigue: bool,
    delayed_reward: bool,
    optimization: bool,
    state_history: bool,
    tracking: bool,
}

impl Default for ServicesDebugConfig {
    fn default() -> Self {
        Self {
            behavior_fatigue: true,
            delayed_reward: true,
            optimization: true,
            state_history: true,
            tracking: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToggleRedisBody {
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DbSimulationBody {
    simulate_slow_query: Option<bool>,
    slow_query_delay_ms: Option<i64>,
    simulate_connection_failure: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LlmToggleBody {
    enabled: Option<bool>,
    mock_response: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureFlagsUpdateBody(Value);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServicesToggleBody(Value);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FallbackTestBody {
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FallbackSimulateBody {
    reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditLogQuery {
    limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStatus {
    debug_enabled: bool,
    simulation_active: bool,
    simulation_remaining_ms: Option<i64>,
    infrastructure: InfrastructureStatus,
    amas: AmasStatus,
    services: ServicesDebugConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfrastructureStatus {
    redis: RedisStatus,
    database: DatabaseStatus,
    llm: LlmStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedisStatus {
    enabled: bool,
    connected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseStatus {
    connected: bool,
    simulate_slow_query: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmStatus {
    enabled: bool,
    mock_response: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AmasStatus {
    feature_flags: Value,
    circuit_force_open: bool,
    simulate_fallback_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheckResult {
    redis: HealthItem,
    database: HealthItem,
    amas: AmasHealth,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthItem {
    healthy: bool,
    latency_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AmasHealth {
    healthy: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StrategyParams {
    interval_scale: f64,
    new_ratio: f64,
    difficulty: String,
    batch_size: i64,
    hint_level: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FallbackResult {
    strategy: StrategyParams,
    action: StrategyParams,
    degraded: bool,
    reason: String,
    explanation: String,
}

#[derive(Debug, Clone)]
struct InfrastructureConfig {
    redis_enabled: bool,
    db_simulation: DbSimulationState,
    llm: LlmState,
}

#[derive(Debug, Clone)]
struct DbSimulationState {
    simulate_slow_query: bool,
    slow_query_delay_ms: i64,
    simulate_connection_failure: bool,
}

#[derive(Debug, Clone)]
struct LlmState {
    enabled: bool,
    mock_response: bool,
}

#[derive(Debug, Clone)]
struct AmasDebugState {
    force_circuit_open: bool,
    simulate_fallback_reason: Option<String>,
}

#[derive(Debug, Clone)]
struct DebugState {
    infrastructure: InfrastructureConfig,
    services: ServicesDebugConfig,
    amas: AmasDebugState,
    feature_flags: Map<String, Value>,
    audit_log: Vec<AuditLogEntry>,
    simulation_until_ms: Option<i64>,
}

impl DebugState {
    fn new() -> Self {
        Self {
            infrastructure: InfrastructureConfig {
                redis_enabled: true,
                db_simulation: DbSimulationState {
                    simulate_slow_query: false,
                    slow_query_delay_ms: 0,
                    simulate_connection_failure: false,
                },
                llm: LlmState {
                    enabled: true,
                    mock_response: false,
                },
            },
            services: ServicesDebugConfig::default(),
            amas: AmasDebugState {
                force_circuit_open: false,
                simulate_fallback_reason: None,
            },
            feature_flags: default_feature_flags(),
            audit_log: Vec::new(),
            simulation_until_ms: None,
        }
    }

    fn simulation_remaining_ms(&self, now_ms: i64) -> Option<i64> {
        self.simulation_until_ms
            .map(|until| (until - now_ms).max(0))
    }

    fn simulation_active(&self) -> bool {
        self.simulation_until_ms.is_some()
    }

    fn start_simulation(&mut self, now_ms: i64) {
        self.simulation_until_ms = Some(now_ms.saturating_add(MAX_SIMULATION_DURATION_MS));
    }

    fn reset_debug_config(&mut self) {
        let feature_flags = self.feature_flags.clone();
        let audit_log = std::mem::take(&mut self.audit_log);
        *self = DebugState::new();
        self.feature_flags = feature_flags;
        self.audit_log = audit_log;
    }

    fn reset_feature_flags(&mut self) {
        self.feature_flags = default_feature_flags();
    }

    fn expire_simulation_if_needed(&mut self, now_ms: i64) {
        let Some(until) = self.simulation_until_ms else {
            return;
        };
        if now_ms >= until {
            self.reset_debug_config();
        }
    }

    fn push_audit_log(
        &mut self,
        action: impl Into<String>,
        details: Value,
        user_id: Option<String>,
    ) {
        let entry = AuditLogEntry {
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            action: action.into(),
            details,
            user_id,
        };
        self.audit_log.insert(0, entry);
        if self.audit_log.len() > MAX_AUDIT_LOG_SIZE {
            self.audit_log.truncate(MAX_AUDIT_LOG_SIZE);
        }
    }
}

struct DebugStore {
    inner: RwLock<DebugState>,
}

impl DebugStore {
    fn new() -> Self {
        Self {
            inner: RwLock::new(DebugState::new()),
        }
    }
}

static DEBUG_STORE: OnceLock<Arc<DebugStore>> = OnceLock::new();

fn store() -> Arc<DebugStore> {
    DEBUG_STORE
        .get_or_init(|| Arc::new(DebugStore::new()))
        .clone()
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

fn debug_available() -> bool {
    let debug_mode = env_bool("DEBUG_MODE").unwrap_or(false);
    let is_production = matches!(
        std::env::var("NODE_ENV").ok().as_deref(),
        Some("production")
    );
    debug_mode || !is_production
}

fn default_feature_flags() -> Map<String, Value> {
    let defaults = [
        ("enableTrendAnalyzer", true),
        ("enableHabitRecognizer", true),
        ("enableHeuristicBaseline", true),
        ("enableThompsonSampling", true),
        ("enableACTRMemory", true),
        ("enableColdStartManager", true),
        ("enableEnsemble", true),
        ("enableUserParamsManager", true),
        ("enableDelayedRewardAggregator", true),
        ("enableCausalInference", true),
        ("enableBayesianOptimizer", true),
        ("enableNativeLinUCB", true),
        ("enableNativeThompson", true),
        ("enableNativeACTR", true),
    ];

    let mut map = Map::new();
    for (key, default_value) in defaults {
        let env_key = match key {
            "enableTrendAnalyzer" => "AMAS_FEATURE_TREND_ANALYZER",
            "enableHabitRecognizer" => "AMAS_FEATURE_HABIT_RECOGNIZER",
            "enableHeuristicBaseline" => "AMAS_FEATURE_HEURISTIC_BASELINE",
            "enableThompsonSampling" => "AMAS_FEATURE_THOMPSON_SAMPLING",
            "enableACTRMemory" => "AMAS_FEATURE_ACTR_MEMORY",
            "enableColdStartManager" => "AMAS_FEATURE_COLD_START_MANAGER",
            "enableEnsemble" => "AMAS_FEATURE_ENSEMBLE",
            "enableUserParamsManager" => "AMAS_FEATURE_USER_PARAMS_MANAGER",
            "enableDelayedRewardAggregator" => "AMAS_FEATURE_DELAYED_REWARD_AGGREGATOR",
            "enableCausalInference" => "AMAS_FEATURE_CAUSAL_INFERENCE",
            "enableBayesianOptimizer" => "AMAS_FEATURE_BAYESIAN_OPTIMIZER",
            "enableNativeLinUCB" => "AMAS_FEATURE_NATIVE_LINUCB",
            "enableNativeThompson" => "AMAS_FEATURE_NATIVE_THOMPSON",
            "enableNativeACTR" => "AMAS_FEATURE_NATIVE_ACTR",
            _ => "",
        };
        let value = env_bool(env_key).unwrap_or(default_value);
        map.insert(key.to_string(), Value::Bool(value));
    }
    map
}

fn debug_flag_bool(flags: &Map<String, Value>, key: &str, default: bool) -> bool {
    flags.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

fn debug_flags_to_feature_flags(flags: &Map<String, Value>) -> FeatureFlags {
    FeatureFlags {
        ensemble_enabled: debug_flag_bool(flags, "enableEnsemble", true),
        thompson_enabled: debug_flag_bool(flags, "enableThompsonSampling", true),
        linucb_enabled: debug_flag_bool(flags, "enableNativeLinUCB", true),
        heuristic_enabled: debug_flag_bool(flags, "enableHeuristicBaseline", true),
        causal_inference_enabled: debug_flag_bool(flags, "enableCausalInference", false),
        bayesian_optimizer_enabled: debug_flag_bool(flags, "enableBayesianOptimizer", false),
        actr_memory_enabled: debug_flag_bool(flags, "enableACTRMemory", true),
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/status", get(get_status))
        .route("/health", get(get_health))
        .route("/redis/toggle", post(toggle_redis))
        .route("/db/simulate", post(simulate_db))
        .route("/llm/toggle", post(toggle_llm))
        .route(
            "/amas/feature-flags",
            get(get_feature_flags).post(update_feature_flags),
        )
        .route("/amas/feature-flags/reset", post(reset_feature_flags))
        .route("/amas/circuit/open", post(force_circuit_open))
        .route("/amas/circuit/reset", post(reset_circuit))
        .route("/amas/fallback/test", post(test_fallback))
        .route("/amas/fallback/simulate", post(simulate_fallback))
        .route("/services", get(get_services))
        .route("/services/toggle", post(toggle_services))
        .route("/reset", post(reset_all))
        .route("/stop-simulations", post(stop_simulations))
        .route("/audit-log", get(get_audit_log).delete(clear_audit_log))
}

async fn require_admin(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    if !debug_available() {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "调试模式未启用，仅在开发/测试环境可用",
        ));
    }

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

    if user.role != "ADMIN" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "需要管理员权限",
        ));
    }

    Ok((proxy, user))
}

async fn get_status(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    let db_connected = test_database_connection(proxy.as_ref()).await;
    let redis_connected = match state.cache() {
        Some(cache) => cache.is_connected().await,
        None => false,
    };

    let status = SystemStatus {
        debug_enabled: debug_available(),
        simulation_active: guard.simulation_active(),
        simulation_remaining_ms: guard.simulation_remaining_ms(now_ms),
        infrastructure: InfrastructureStatus {
            redis: RedisStatus {
                enabled: guard.infrastructure.redis_enabled,
                connected: redis_connected,
            },
            database: DatabaseStatus {
                connected: db_connected,
                simulate_slow_query: guard.infrastructure.db_simulation.simulate_slow_query,
            },
            llm: LlmStatus {
                enabled: guard.infrastructure.llm.enabled,
                mock_response: guard.infrastructure.llm.mock_response,
            },
        },
        amas: AmasStatus {
            feature_flags: Value::Object(guard.feature_flags.clone()),
            circuit_force_open: guard.amas.force_circuit_open,
            simulate_fallback_reason: guard.amas.simulate_fallback_reason.clone(),
        },
        services: guard.services.clone(),
    };

    guard.push_audit_log("debug.status", Value::Null, Some(user.id));

    Ok(Json(SuccessResponse {
        success: true,
        data: status,
    }))
}

async fn get_health(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin(&state, &headers).await?;

    let (db_healthy, db_latency, db_error) = test_database_health(proxy.as_ref()).await;
    let (redis_healthy, redis_latency, redis_error) = test_redis_health(&state).await;

    let result = HealthCheckResult {
        redis: HealthItem {
            healthy: redis_healthy,
            latency_ms: redis_latency,
            error: redis_error,
        },
        database: HealthItem {
            healthy: db_healthy,
            latency_ms: db_latency,
            error: db_error,
        },
        amas: AmasHealth { healthy: true },
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn toggle_redis(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ToggleRedisBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    state
        .runtime()
        .redis_enabled
        .store(payload.enabled, Ordering::Relaxed);

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.infrastructure.redis_enabled = payload.enabled;
    guard.push_audit_log(
        "redis.toggle",
        serde_json::json!({ "enabled": payload.enabled }),
        Some(user.id),
    );

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "enabled": payload.enabled }),
    }))
}

async fn simulate_db(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DbSimulationBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let runtime = state.runtime();
    if let Some(value) = payload.simulate_slow_query {
        runtime.db_slow_enabled.store(value, Ordering::Relaxed);
    }
    if let Some(value) = payload.slow_query_delay_ms {
        runtime
            .db_slow_delay_ms
            .store(value.max(0) as u64, Ordering::Relaxed);
    }

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    if let Some(value) = payload.simulate_slow_query {
        guard.infrastructure.db_simulation.simulate_slow_query = value;
    }
    if let Some(value) = payload.slow_query_delay_ms {
        guard.infrastructure.db_simulation.slow_query_delay_ms = value.max(0);
    }
    if let Some(value) = payload.simulate_connection_failure {
        guard
            .infrastructure
            .db_simulation
            .simulate_connection_failure = value;
        apply_db_failure_simulation(&state, value).await;
    }

    if guard.infrastructure.db_simulation.simulate_slow_query
        || guard
            .infrastructure
            .db_simulation
            .simulate_connection_failure
    {
        guard.start_simulation(now_ms);
    } else {
        guard.simulation_until_ms = None;
    }

    guard.push_audit_log(
        "database.simulation",
        serde_json::to_value(&payload).unwrap_or(Value::Null),
        Some(user.id),
    );

    Ok(Json(SuccessResponse {
        success: true,
        data: payload,
    }))
}

async fn toggle_llm(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LlmToggleBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let runtime = state.runtime();
    if let Some(value) = payload.enabled {
        runtime.llm_enabled.store(value, Ordering::Relaxed);
        set_llm_runtime_enabled(value);
    }
    if let Some(value) = payload.mock_response {
        runtime.llm_mock.store(value, Ordering::Relaxed);
        set_llm_runtime_mock(value);
    }

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    if let Some(value) = payload.enabled {
        guard.infrastructure.llm.enabled = value;
    }
    if let Some(value) = payload.mock_response {
        guard.infrastructure.llm.mock_response = value;
    }

    guard.push_audit_log(
        "llm.toggle",
        serde_json::to_value(&payload).unwrap_or(Value::Null),
        Some(user.id),
    );

    Ok(Json(SuccessResponse {
        success: true,
        data: payload,
    }))
}

async fn get_feature_flags(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_admin(&state, &headers).await?;

    let now_ms = Utc::now().timestamp_millis();
    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    Ok(Json(SuccessResponse {
        success: true,
        data: Value::Object(guard.feature_flags.clone()),
    }))
}

async fn update_feature_flags(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;

    let updates = payload.as_object().ok_or_else(|| {
        json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "请求体必须是JSON对象",
        )
    })?;

    let now_ms = Utc::now().timestamp_millis();
    let store = store();

    let (flags, result_flags) = {
        let mut guard = store.inner.write().await;
        guard.expire_simulation_if_needed(now_ms);

        let mut applied = Map::new();
        for (key, value) in updates {
            let Some(flag) = value.as_bool() else {
                continue;
            };
            if guard.feature_flags.contains_key(key) {
                guard.feature_flags.insert(key.clone(), Value::Bool(flag));
                applied.insert(key.clone(), Value::Bool(flag));
            }
        }

        let flags = debug_flags_to_feature_flags(&guard.feature_flags);
        let result_flags = guard.feature_flags.clone();

        guard.push_audit_log(
            "amas.featureFlags.update",
            Value::Object(applied),
            Some(user.id),
        );

        (flags, result_flags)
    };

    state.runtime().set_amas_flags(flags.clone()).await;
    state.amas_engine().set_feature_flags(flags).await;

    Ok(Json(SuccessResponse {
        success: true,
        data: Value::Object(result_flags),
    }))
}

async fn reset_feature_flags(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;

    let now_ms = Utc::now().timestamp_millis();
    let store = store();

    let (flags, result_flags) = {
        let mut guard = store.inner.write().await;
        guard.expire_simulation_if_needed(now_ms);
        guard.reset_feature_flags();

        let flags = debug_flags_to_feature_flags(&guard.feature_flags);
        let result_flags = guard.feature_flags.clone();

        guard.push_audit_log("amas.featureFlags.reset", Value::Null, Some(user.id));

        (flags, result_flags)
    };

    state.runtime().set_amas_flags(flags.clone()).await;
    state.amas_engine().set_feature_flags(flags).await;

    Ok(Json(SuccessResponse {
        success: true,
        data: Value::Object(result_flags),
    }))
}

async fn force_circuit_open(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;

    let now_ms = Utc::now().timestamp_millis();
    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.amas.force_circuit_open = true;
    guard.start_simulation(now_ms);
    guard.push_audit_log("amas.circuit.forceOpen", Value::Null, Some(user.id));

    Ok(Json(MessageResponse::<Value> {
        success: true,
        message: "熔断器已强制打开".to_string(),
        data: None,
    }))
}

async fn reset_circuit(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;

    let now_ms = Utc::now().timestamp_millis();
    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.amas.force_circuit_open = false;
    guard.push_audit_log("amas.circuit.reset", Value::Null, Some(user.id));

    Ok(Json(MessageResponse::<Value> {
        success: true,
        message: "熔断器已重置".to_string(),
        data: None,
    }))
}

async fn test_fallback(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FallbackTestBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;

    let valid = [
        "circuit_open",
        "timeout",
        "exception",
        "missing_features",
        "model_unavailable",
        "degraded_state",
    ];
    if !valid.contains(&payload.reason.as_str()) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("Invalid reason. Must be one of: {}", valid.join(", ")),
        ));
    }

    let result = safe_default_fallback(&payload.reason);

    let now_ms = Utc::now().timestamp_millis();
    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);
    guard.push_audit_log(
        "amas.fallback.test",
        serde_json::to_value(&payload).unwrap_or(Value::Null),
        Some(user.id),
    );

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn simulate_fallback(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FallbackSimulateBody>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.amas.simulate_fallback_reason = payload.reason.clone();
    if guard.amas.simulate_fallback_reason.is_some() {
        guard.start_simulation(now_ms);
    }

    guard.push_audit_log(
        "amas.fallback.simulate",
        serde_json::to_value(&payload).unwrap_or(Value::Null),
        Some(user.id),
    );

    let message = match &payload.reason {
        Some(reason) => format!("已设置模拟降级原因: {reason}"),
        None => "已清除模拟降级".to_string(),
    };

    Ok(Json(MessageResponse::<Value> {
        success: true,
        message,
        data: None,
    }))
}

async fn get_services(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    Ok(Json(SuccessResponse {
        success: true,
        data: guard.services.clone(),
    }))
}

async fn toggle_services(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;

    let updates = payload.as_object().ok_or_else(|| {
        json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "请求体必须是JSON对象",
        )
    })?;

    let now_ms = Utc::now().timestamp_millis();
    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    let mut applied = Map::new();
    for (key, value) in updates {
        let Some(flag) = value.as_bool() else {
            continue;
        };
        match key.as_str() {
            "behaviorFatigue" => {
                guard.services.behavior_fatigue = flag;
                applied.insert(key.clone(), Value::Bool(flag));
            }
            "delayedReward" => {
                guard.services.delayed_reward = flag;
                applied.insert(key.clone(), Value::Bool(flag));
            }
            "optimization" => {
                guard.services.optimization = flag;
                applied.insert(key.clone(), Value::Bool(flag));
            }
            "stateHistory" => {
                guard.services.state_history = flag;
                applied.insert(key.clone(), Value::Bool(flag));
            }
            "tracking" => {
                guard.services.tracking = flag;
                applied.insert(key.clone(), Value::Bool(flag));
            }
            _ => {}
        }
    }

    guard.push_audit_log("services.toggle", Value::Object(applied), Some(user.id));

    Ok(Json(SuccessResponse {
        success: true,
        data: guard.services.clone(),
    }))
}

async fn reset_all(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let runtime = state.runtime();
    runtime.redis_enabled.store(true, Ordering::Relaxed);
    runtime.llm_enabled.store(true, Ordering::Relaxed);
    runtime.llm_mock.store(false, Ordering::Relaxed);
    runtime.db_slow_enabled.store(false, Ordering::Relaxed);
    runtime.db_slow_delay_ms.store(0, Ordering::Relaxed);
    set_llm_runtime_enabled(true);
    set_llm_runtime_mock(false);

    let default_flags = FeatureFlags::default();
    runtime.set_amas_flags(default_flags.clone()).await;
    state.amas_engine().set_feature_flags(default_flags).await;

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.reset_debug_config();
    guard.reset_feature_flags();
    guard.infrastructure.redis_enabled = true;
    guard.push_audit_log("debug.resetAll", Value::Null, Some(user.id));

    Ok(Json(MessageResponse::<Value> {
        success: true,
        message: "所有调试配置已重置".to_string(),
        data: None,
    }))
}

async fn stop_simulations(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let runtime = state.runtime();
    runtime.redis_enabled.store(true, Ordering::Relaxed);
    runtime.llm_enabled.store(true, Ordering::Relaxed);
    runtime.llm_mock.store(false, Ordering::Relaxed);
    runtime.db_slow_enabled.store(false, Ordering::Relaxed);
    runtime.db_slow_delay_ms.store(0, Ordering::Relaxed);
    set_llm_runtime_enabled(true);
    set_llm_runtime_mock(false);

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.reset_debug_config();
    guard.push_audit_log("debug.stopSimulations", Value::Null, Some(user.id));

    Ok(Json(MessageResponse::<Value> {
        success: true,
        message: "所有模拟已停止".to_string(),
        data: None,
    }))
}

async fn get_audit_log(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<AuditLogQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, _user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let limit = query.limit.unwrap_or(50).clamp(1, 200);

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    let items: Vec<AuditLogEntry> = guard.audit_log.iter().take(limit).cloned().collect();
    Ok(Json(SuccessResponse {
        success: true,
        data: items,
    }))
}

async fn clear_audit_log(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_admin(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let store = store();
    let mut guard = store.inner.write().await;
    guard.expire_simulation_if_needed(now_ms);

    guard.audit_log.clear();
    guard.push_audit_log("audit.clear", Value::Null, Some(user.id));

    Ok(Json(MessageResponse::<Value> {
        success: true,
        message: "审计日志已清除".to_string(),
        data: None,
    }))
}

async fn test_database_connection(proxy: &crate::db::DatabaseProxy) -> bool {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(proxy.pool())
        .await
        .is_ok()
}

async fn test_database_health(
    proxy: &crate::db::DatabaseProxy,
) -> (bool, Option<i64>, Option<String>) {
    let start = std::time::Instant::now();
    let ok = test_database_connection(proxy).await;
    let latency = start.elapsed().as_millis().min(i64::MAX as u128) as i64;
    if ok {
        (true, Some(latency), None)
    } else {
        (false, None, Some("数据库不可用".to_string()))
    }
}

async fn test_redis_health(state: &AppState) -> (bool, Option<i64>, Option<String>) {
    let Some(cache) = state.cache() else {
        return (false, None, Some("Redis未配置".to_string()));
    };

    let start = std::time::Instant::now();
    let ok = cache.is_connected().await;
    let latency = start.elapsed().as_millis().min(i64::MAX as u128) as i64;

    if ok {
        (true, Some(latency), None)
    } else {
        (false, None, Some("Redis连接失败".to_string()))
    }
}

async fn apply_db_failure_simulation(_state: &AppState, _simulate_failure: bool) {
    // Dual-write mechanism removed - db failure simulation no longer supported
}

fn safe_default_fallback(reason: &str) -> FallbackResult {
    let strategy = StrategyParams {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: "mid".to_string(),
        batch_size: 8,
        hint_level: 1,
    };
    let explanation = match reason {
        "circuit_open" => "熔断器打开，使用安全默认策略".to_string(),
        "timeout" => "系统超时，使用安全默认策略".to_string(),
        "exception" => "系统异常，使用安全默认策略".to_string(),
        "missing_features" => "特征缺失，使用安全默认策略".to_string(),
        "model_unavailable" => "模型不可用，使用安全默认策略".to_string(),
        "degraded_state" => "系统处于降级状态，使用安全默认策略".to_string(),
        _ => "使用安全默认策略".to_string(),
    };

    FallbackResult {
        action: strategy.clone(),
        strategy,
        degraded: true,
        reason: reason.to_string(),
        explanation,
    }
}
