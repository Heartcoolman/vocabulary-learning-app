use std::sync::Arc;

use axum::extract::{Extension, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};
use uuid::Uuid;

use crate::amas::types::{
    ColdStartPhase, ProcessOptions, RawEvent, StrategyParams as AmasStrategyParams,
};
use crate::db::state_machine::DatabaseState;
use crate::middleware::RequestDbState;
use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct SuccessMessageResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RangeQuery {
    range: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaysQuery {
    days: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecisionQuery {
    decision_id: Option<String>,
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineQuery {
    limit: Option<i32>,
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEventRequest {
    word_id: String,
    is_correct: bool,
    response_time: i64,
    session_id: Option<String>,
    dwell_time: Option<i64>,
    pause_count: Option<i32>,
    switch_count: Option<i32>,
    retry_count: Option<i32>,
    focus_loss_duration: Option<i64>,
    interaction_density: Option<f64>,
    paused_time_ms: Option<i64>,
    hint_used: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEventResponse {
    session_id: String,
    strategy: StrategyResponse,
    explanation: ExplanationResponse,
    state: StateResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    word_mastery_decision: Option<WordMasteryResponse>,
    reward: RewardResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    cold_start_phase: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StrategyResponse {
    interval_scale: f64,
    new_ratio: f64,
    difficulty: String,
    batch_size: i32,
    hint_level: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplanationResponse {
    factors: Vec<FactorResponse>,
    changes: Vec<String>,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FactorResponse {
    name: String,
    value: f64,
    impact: String,
    percentage: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateResponse {
    #[serde(rename = "A")]
    attention: f64,
    #[serde(rename = "F")]
    fatigue: f64,
    #[serde(rename = "M")]
    motivation: f64,
    #[serde(rename = "C")]
    cognitive: CognitiveResponse,
    conf: f64,
    ts: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CognitiveResponse {
    mem: f64,
    speed: f64,
    stability: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WordMasteryResponse {
    word_id: String,
    prev_mastery: f64,
    new_mastery: f64,
    prev_interval: f64,
    new_interval: f64,
    quality: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RewardResponse {
    value: f64,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchEventItem {
    word_id: String,
    is_correct: bool,
    response_time: i64,
    timestamp: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchProcessRequest {
    events: Vec<BatchEventItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchProcessResponse {
    processed_count: usize,
    final_state: StateResponse,
    final_strategy: StrategyResponse,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/process", post(process_event))
        .route("/reset", post(reset_user))
        .route("/state", get(get_state))
        .route("/strategy", get(get_strategy))
        .route("/batch-process", post(batch_process))
        .route("/delayed-rewards", get(get_delayed_rewards))
        .route("/time-preferences", get(get_time_preferences))
        .route("/golden-time", get(get_golden_time))
        .route("/trend", get(get_trend))
        .route("/trend/history", get(get_trend_history))
        .route("/trend/intervention", get(get_trend_intervention))
        .route("/trend/report", get(get_trend_report))
        .route("/history", get(get_history))
        .route("/growth", get(get_growth))
        .route("/changes", get(get_changes))
        .route("/explain-decision", get(explain_decision))
        .route("/learning-curve", get(get_learning_curve))
        .route("/phase", get(get_phase))
        .route("/decision-timeline", get(get_decision_timeline))
        .route("/counterfactual", post(counterfactual))
}

fn not_implemented() -> Response {
    json_error(StatusCode::NOT_IMPLEMENTED, "NOT_IMPLEMENTED", "功能尚未实现").into_response()
}

async fn process_event(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(body): Json<ProcessEventRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (_, user, _) = require_user(&state, request_state, &headers).await?;

    let session_id = body.session_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let raw_event = RawEvent {
        word_id: Some(body.word_id),
        is_correct: body.is_correct,
        response_time: body.response_time,
        dwell_time: body.dwell_time,
        pause_count: body.pause_count.unwrap_or(0),
        switch_count: body.switch_count.unwrap_or(0),
        retry_count: body.retry_count.unwrap_or(0),
        focus_loss_duration: body.focus_loss_duration,
        interaction_density: body.interaction_density,
        paused_time_ms: body.paused_time_ms,
        hint_used: body.hint_used.unwrap_or(false),
        timestamp: chrono::Utc::now().timestamp_millis(),
        ..Default::default()
    };

    let options = ProcessOptions::default();

    let engine = state.amas_engine();
    let result = engine.process_event(&user.id, raw_event, options)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "AMAS_ERROR", &e))?;

    let response = ProcessEventResponse {
        session_id,
        strategy: strategy_to_response(&result.strategy),
        explanation: ExplanationResponse {
            factors: result.explanation.factors.iter().map(|f| FactorResponse {
                name: f.name.clone(),
                value: f.value,
                impact: f.impact.clone(),
                percentage: f.percentage,
            }).collect(),
            changes: result.explanation.changes.clone(),
            text: result.explanation.text.clone(),
        },
        state: state_to_response(&result.state),
        word_mastery_decision: result.word_mastery_decision.map(|w| WordMasteryResponse {
            word_id: w.word_id,
            prev_mastery: w.prev_mastery,
            new_mastery: w.new_mastery,
            prev_interval: w.prev_interval,
            new_interval: w.new_interval,
            quality: w.quality,
        }),
        reward: RewardResponse {
            value: result.reward.value,
            reason: result.reward.reason.clone(),
        },
        cold_start_phase: result.cold_start_phase.map(|p| match p {
            ColdStartPhase::Classify => "classify".to_string(),
            ColdStartPhase::Explore => "explore".to_string(),
            ColdStartPhase::Normal => "normal".to_string(),
        }),
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: response,
    }))
}

async fn get_state(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_, user, _) = require_user(&state, request_state, &headers).await?;

    let engine = state.amas_engine();
    let user_state = engine.get_user_state(&user.id).await;

    match user_state {
        Some(s) => Ok(Json(SuccessResponse {
            success: true,
            data: state_to_response(&s),
        })),
        None => Err(json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户AMAS状态未初始化")),
    }
}

async fn get_strategy(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_, user, _) = require_user(&state, request_state, &headers).await?;

    let engine = state.amas_engine();
    let strategy = engine.get_current_strategy(&user.id).await;

    #[derive(Serialize)]
    struct StrategyWithInit {
        #[serde(flatten)]
        strategy: StrategyResponse,
        initialized: bool,
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: StrategyWithInit {
            strategy: strategy_to_response(&strategy),
            initialized: true,
        },
    }))
}

async fn batch_process(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Json(body): Json<BatchProcessRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (_, user, _) = require_user(&state, request_state, &headers).await?;

    if body.events.is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "事件数组不能为空"));
    }
    if body.events.len() > 100 {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "单次批量处理最多100条事件"));
    }

    let engine = state.amas_engine();
    let mut final_state = None;
    let mut final_strategy = None;

    for event in &body.events {
        let raw_event = RawEvent {
            word_id: Some(event.word_id.clone()),
            is_correct: event.is_correct,
            response_time: event.response_time,
            timestamp: event.timestamp,
            ..Default::default()
        };

        let options = ProcessOptions {
            skip_update: Some(false),
            ..Default::default()
        };

        match engine.process_event(&user.id, raw_event, options).await {
            Ok(result) => {
                final_state = Some(result.state);
                final_strategy = Some(result.strategy);
            }
            Err(e) => {
                tracing::warn!(error = %e, "batch process event failed");
            }
        }
    }

    let final_state = final_state.unwrap_or_default();
    let final_strategy = final_strategy.unwrap_or_default();

    Ok(Json(SuccessResponse {
        success: true,
        data: BatchProcessResponse {
            processed_count: body.events.len(),
            final_state: state_to_response(&final_state),
            final_strategy: strategy_to_response(&final_strategy),
        },
    }))
}

async fn get_delayed_rewards(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_, _user, _) = require_user(&state, request_state, &headers).await?;

    #[derive(Serialize)]
    struct DelayedRewardsResponse {
        items: Vec<serde_json::Value>,
        count: usize,
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: DelayedRewardsResponse {
            items: vec![],
            count: 0,
        },
    }))
}

async fn get_time_preferences(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    match crate::services::learning_time::get_time_preferences(&proxy, db_state, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse { success: true, data: result })),
        Err(e) => Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e)),
    }
}

async fn get_golden_time(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    match crate::services::learning_time::is_golden_time(&proxy, db_state, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse { success: true, data: result })),
        Err(e) => Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e)),
    }
}

async fn get_trend(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    match crate::services::trend_analysis::get_current_trend(&proxy, db_state, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse { success: true, data: result })),
        Err(e) => Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e)),
    }
}

async fn get_trend_history(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Query(query): Query<DaysQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    let days = query.days.unwrap_or(28) as i64;

    match crate::services::trend_analysis::get_trend_history(&proxy, db_state, &user.id, days).await {
        Ok(result) => Ok(Json(SuccessResponse { success: true, data: result })),
        Err(e) => Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e)),
    }
}

async fn get_trend_report(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;

    match crate::services::trend_analysis::generate_trend_report(&proxy, db_state, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse { success: true, data: result })),
        Err(e) => Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_FAILED", &e)),
    }
}

async fn get_history(Query(_query): Query<RangeQuery>) -> Response {
    not_implemented()
}

async fn get_growth(Query(_query): Query<RangeQuery>) -> Response {
    not_implemented()
}

async fn get_changes(Query(_query): Query<RangeQuery>) -> Response {
    not_implemented()
}

async fn explain_decision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DecisionQuery>,
) -> Response {
    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let request_state = DatabaseState::Normal;
    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败").into_response();
        }
    };

    let pg_pool = proxy.primary_pool().await;
    let sqlite_pool = proxy.fallback_pool().await;
    let request_state_ref = Some(&RequestDbState(request_state));

    match crate::services::explainability::get_decision_explanation(
        pg_pool.as_ref(),
        sqlite_pool.as_ref(),
        request_state_ref,
        &auth_user.id,
        query.decision_id.as_deref(),
    )
    .await
    {
        Ok(Some(result)) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Ok(None) => Json(serde_json::json!({
            "success": true,
            "data": null,
            "message": "暂无决策记录，开始学习后将自动生成"
        }))
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "explain_decision failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

async fn get_decision_timeline(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TimelineQuery>,
) -> Response {
    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let request_state = DatabaseState::Normal;
    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败").into_response();
        }
    };

    let pg_pool = proxy.primary_pool().await;
    let sqlite_pool = proxy.fallback_pool().await;
    let request_state_ref = Some(&RequestDbState(request_state));
    let limit = query.limit.unwrap_or(50).min(200);

    match crate::services::explainability::get_decision_timeline(
        pg_pool.as_ref(),
        sqlite_pool.as_ref(),
        request_state_ref,
        &auth_user.id,
        limit,
        query.cursor.as_deref(),
    )
    .await
    {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "get_decision_timeline failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

async fn counterfactual(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<crate::services::explainability::CounterfactualInput>,
) -> Response {
    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let request_state = DatabaseState::Normal;
    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败").into_response();
        }
    };

    let pg_pool = proxy.primary_pool().await;
    let sqlite_pool = proxy.fallback_pool().await;
    let request_state_ref = Some(&RequestDbState(request_state));

    match crate::services::explainability::run_counterfactual(
        pg_pool.as_ref(),
        sqlite_pool.as_ref(),
        request_state_ref,
        &auth_user.id,
        input,
    )
    .await
    {
        Ok(Some(result)) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Ok(None) => Json(serde_json::json!({
            "success": true,
            "data": null,
            "message": "暂无决策记录，请先进行一些学习后再运行反事实分析"
        }))
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "counterfactual failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

fn strategy_to_response(s: &AmasStrategyParams) -> StrategyResponse {
    StrategyResponse {
        interval_scale: s.interval_scale,
        new_ratio: s.new_ratio,
        difficulty: s.difficulty.as_str().to_string(),
        batch_size: s.batch_size,
        hint_level: s.hint_level,
    }
}

fn state_to_response(s: &crate::amas::types::UserState) -> StateResponse {
    StateResponse {
        attention: s.attention,
        fatigue: s.fatigue,
        motivation: s.motivation,
        cognitive: CognitiveResponse {
            mem: s.cognitive.mem,
            speed: s.cognitive.speed,
            stability: s.cognitive.stability,
        },
        conf: s.conf,
        ts: s.ts,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningCurvePoint {
    date: String,
    mastery: f64,
    attention: f64,
    fatigue: f64,
    motivation: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningCurveResult {
    points: Vec<LearningCurvePoint>,
    trend: String,
    current_mastery: f64,
    average_attention: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhaseResult {
    phase: String,
    description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InterventionResult {
    needs_intervention: bool,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actions: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
struct TrendHistoryPoint {
    trend_state: Option<String>,
    motivation: f64,
    memory: f64,
    speed: f64,
}

async fn require_user(
    state: &AppState,
    request_state: Option<Extension<RequestDbState>>,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser, DatabaseState), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let db_state = request_state
        .map(|Extension(value)| value.0)
        .unwrap_or(DatabaseState::Normal);

    let proxy = state
        .db_proxy()
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), db_state, &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    Ok((proxy, user, db_state))
}

enum SelectedReadPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

async fn select_read_pool(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
) -> Result<SelectedReadPool, AppError> {
    match state {
        DatabaseState::Degraded | DatabaseState::Unavailable => proxy
            .fallback_pool()
            .await
            .map(SelectedReadPool::Fallback)
            .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用")),
        DatabaseState::Normal | DatabaseState::Syncing => match proxy.primary_pool().await {
            Some(pool) => Ok(SelectedReadPool::Primary(pool)),
            None => proxy
                .fallback_pool()
                .await
                .map(SelectedReadPool::Fallback)
                .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用")),
        },
    }
}

async fn get_learning_curve(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
    Query(query): Query<DaysQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    let days = query.days.unwrap_or(30);
    if !(7..=90).contains(&days) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "days参数必须在7-90之间",
        ));
    }

    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(days as i64);
    let start_date_str = start_date.format("%Y-%m-%d").to_string();

    let points = match select_read_pool(proxy.as_ref(), db_state).await? {
        SelectedReadPool::Primary(pool) => select_learning_curve_pg(&pool, &user.id, start_date).await?,
        SelectedReadPool::Fallback(pool) => {
            select_learning_curve_sqlite(&pool, &user.id, &start_date_str).await?
        }
    };

    let mastery_values: Vec<f64> = points.iter().map(|p| p.mastery).collect();
    let trend = compute_mastery_trend(&mastery_values);
    let current_mastery = points.last().map(|p| p.mastery).unwrap_or(0.0);
    let average_attention = if points.is_empty() {
        0.0
    } else {
        points.iter().map(|p| p.attention).sum::<f64>() / points.len() as f64
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: LearningCurveResult {
            points,
            trend,
            current_mastery,
            average_attention,
        },
    }))
}

async fn select_learning_curve_pg(
    pool: &PgPool,
    user_id: &str,
    start_date: chrono::NaiveDate,
) -> Result<Vec<LearningCurvePoint>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT "date", "attention", "fatigue", "motivation", "memory"
        FROM "user_state_history"
        WHERE "userId" = $1 AND "date" >= $2
        ORDER BY "date" ASC
        "#,
    )
    .bind(user_id)
    .bind(start_date)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut points = Vec::with_capacity(rows.len());
    for row in rows {
        let date: chrono::NaiveDate = row
            .try_get("date")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let attention: f64 = row
            .try_get("attention")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let fatigue: f64 = row
            .try_get("fatigue")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let motivation: f64 = row
            .try_get("motivation")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let memory: f64 = row
            .try_get("memory")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        points.push(LearningCurvePoint {
            date: format!("{}T00:00:00.000Z", date.format("%Y-%m-%d")),
            mastery: memory * 100.0,
            attention,
            fatigue,
            motivation,
        });
    }

    Ok(points)
}

async fn select_learning_curve_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    start_date: &str,
) -> Result<Vec<LearningCurvePoint>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT "date", "attention", "fatigue", "motivation", "memory"
        FROM "user_state_history"
        WHERE "userId" = ? AND "date" >= ?
        ORDER BY "date" ASC
        "#,
    )
    .bind(user_id)
    .bind(start_date)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut points = Vec::with_capacity(rows.len());
    for row in rows {
        let date: String = row
            .try_get("date")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let attention: f64 = row
            .try_get("attention")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let fatigue: f64 = row
            .try_get("fatigue")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let motivation: f64 = row
            .try_get("motivation")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let memory: f64 = row
            .try_get("memory")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        points.push(LearningCurvePoint {
            date: normalize_history_date(&date),
            mastery: memory * 100.0,
            attention,
            fatigue,
            motivation,
        });
    }

    Ok(points)
}

fn normalize_history_date(value: &str) -> String {
    if value.contains('T') {
        return value.to_string();
    }
    if value.len() == 10 {
        return format!("{value}T00:00:00.000Z");
    }
    value.to_string()
}

fn compute_mastery_trend(values: &[f64]) -> String {
    if values.len() < 2 {
        return "flat".to_string();
    }
    let delta = values[values.len() - 1] - values[0];
    if delta > 5.0 {
        return "up".to_string();
    }
    if delta < -5.0 {
        return "down".to_string();
    }
    "flat".to_string()
}

async fn get_phase(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    let pool = select_read_pool(proxy.as_ref(), db_state).await?;

    let phase = match load_cold_start_phase(&pool, &user.id).await? {
        Some(value) => value,
        None => infer_phase_from_interactions(&pool, &user.id).await?,
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: PhaseResult {
            description: phase_description(&phase).to_string(),
            phase,
        },
    }))
}

async fn load_cold_start_phase(
    pool: &SelectedReadPool,
    user_id: &str,
) -> Result<Option<String>, AppError> {
    match pool {
        SelectedReadPool::Primary(pool) => {
            let row = sqlx::query(
                r#"
                SELECT "coldStartState"
                FROM "amas_user_states"
                WHERE "userId" = $1
                "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let Some(row) = row else { return Ok(None) };
            let value: Option<serde_json::Value> = row
                .try_get("coldStartState")
                .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
            Ok(extract_phase_from_json(value.as_ref()))
        }
        SelectedReadPool::Fallback(pool) => {
            let row = sqlx::query(
                r#"
                SELECT "coldStartState"
                FROM "amas_user_states"
                WHERE "userId" = ?
                "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let Some(row) = row else { return Ok(None) };
            let raw: Option<String> = row
                .try_get("coldStartState")
                .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
            let Some(raw) = raw else { return Ok(None) };
            let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::String(raw));
            Ok(extract_phase_from_json(Some(&parsed)))
        }
    }
}

fn extract_phase_from_json(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    match value {
        serde_json::Value::String(phase) => normalize_phase(phase).map(|v| v.to_string()),
        serde_json::Value::Object(map) => map
            .get("phase")
            .and_then(|phase| phase.as_str())
            .and_then(normalize_phase)
            .map(|v| v.to_string()),
        _ => None,
    }
}

fn normalize_phase(phase: &str) -> Option<&'static str> {
    match phase {
        "classify" => Some("classify"),
        "explore" => Some("explore"),
        "normal" => Some("normal"),
        _ => None,
    }
}

fn phase_description(phase: &str) -> &'static str {
    match phase {
        "classify" => "分类阶段：正在了解你的学习特点",
        "explore" => "探索阶段：正在尝试不同的学习策略",
        "normal" => "正常运行：已为你定制最优学习策略",
        _ => "未知阶段",
    }
}

async fn infer_phase_from_interactions(
    pool: &SelectedReadPool,
    user_id: &str,
) -> Result<String, AppError> {
    let count = count_recent_interactions(pool, user_id).await?;
    if count < 5 {
        return Ok("classify".to_string());
    }
    if count < 8 {
        return Ok("explore".to_string());
    }
    Ok("normal".to_string())
}

async fn count_recent_interactions(
    pool: &SelectedReadPool,
    user_id: &str,
) -> Result<i64, AppError> {
    match pool {
        SelectedReadPool::Primary(pool) => sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(1) FROM (
                SELECT 1 FROM "answer_records"
                WHERE "userId" = $1
                LIMIT 8
            ) AS t
            "#,
        )
        .bind(user_id)
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")),
        SelectedReadPool::Fallback(pool) => sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(1) FROM (
                SELECT 1 FROM "answer_records"
                WHERE "userId" = ?
                LIMIT 8
            ) AS t
            "#,
        )
        .bind(user_id)
        .fetch_one(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败")),
    }
}

async fn get_trend_intervention(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    let pool = select_read_pool(proxy.as_ref(), db_state).await?;

    let (trend_state, consecutive_days) = load_current_trend(&pool, &user.id).await?;
    let result = compute_intervention(&trend_state, consecutive_days);

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn load_current_trend(
    pool: &SelectedReadPool,
    user_id: &str,
) -> Result<(String, i64), AppError> {
    let (explicit_state, history) = match pool {
        SelectedReadPool::Primary(pool) => {
            let trend_state: Option<String> = sqlx::query_scalar(
                r#"
                SELECT "trendState"
                FROM "amas_user_states"
                WHERE "userId" = $1
                "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let rows = sqlx::query(
                r#"
                SELECT "trendState", "motivation", "memory", "speed"
                FROM "user_state_history"
                WHERE "userId" = $1
                ORDER BY "date" DESC
                LIMIT 30
                "#,
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let mut history = Vec::with_capacity(rows.len());
            for row in rows {
                let trend_state: Option<String> = row.try_get("trendState").ok();
                let motivation: f64 = row.try_get("motivation").unwrap_or(0.0);
                let memory: f64 = row.try_get("memory").unwrap_or(0.0);
                let speed: f64 = row.try_get("speed").unwrap_or(0.0);
                history.push(TrendHistoryPoint {
                    trend_state,
                    motivation,
                    memory,
                    speed,
                });
            }

            (trend_state, history)
        }
        SelectedReadPool::Fallback(pool) => {
            let trend_state: Option<String> = sqlx::query_scalar(
                r#"
                SELECT "trendState"
                FROM "amas_user_states"
                WHERE "userId" = ?
                "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let rows = sqlx::query(
                r#"
                SELECT "trendState", "motivation", "memory", "speed"
                FROM "user_state_history"
                WHERE "userId" = ?
                ORDER BY "date" DESC
                LIMIT 30
                "#,
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

            let mut history = Vec::with_capacity(rows.len());
            for row in rows {
                let trend_state: Option<String> = row.try_get("trendState").ok();
                let motivation: f64 = row.try_get("motivation").unwrap_or(0.0);
                let memory: f64 = row.try_get("memory").unwrap_or(0.0);
                let speed: f64 = row.try_get("speed").unwrap_or(0.0);
                history.push(TrendHistoryPoint {
                    trend_state,
                    motivation,
                    memory,
                    speed,
                });
            }

            (trend_state, history)
        }
    };

    let state = explicit_state
        .as_deref()
        .and_then(normalize_trend_state)
        .map(|v| v.to_string())
        .unwrap_or_else(|| calculate_trend_from_history(&history));

    let consecutive_days = calculate_consecutive_days(&history, &state);
    Ok((state, consecutive_days))
}

fn normalize_trend_state(value: &str) -> Option<&'static str> {
    match value {
        "up" => Some("up"),
        "flat" => Some("flat"),
        "stuck" => Some("stuck"),
        "down" => Some("down"),
        _ => None,
    }
}

fn calculate_trend_from_history(history: &[TrendHistoryPoint]) -> String {
    if history.len() < 2 {
        return "flat".to_string();
    }

    let recent = history.iter().take(7).collect::<Vec<_>>();
    let previous = history
        .iter()
        .skip(7)
        .take(7)
        .collect::<Vec<_>>();

    if previous.is_empty() {
        return "flat".to_string();
    }

    let avg = |items: &[&TrendHistoryPoint]| -> f64 {
        let sum = items
            .iter()
            .map(|item| (item.motivation + item.memory + item.speed) / 3.0)
            .sum::<f64>();
        sum / items.len() as f64
    };

    let recent_avg = avg(&recent);
    let previous_avg = avg(&previous);
    let denominator = if previous_avg == 0.0 { 1.0 } else { previous_avg };
    let change = (recent_avg - previous_avg) / denominator;

    const TREND_CHANGE_THRESHOLD: f64 = 0.1;
    const MINOR_CHANGE_THRESHOLD: f64 = 0.05;

    if change > TREND_CHANGE_THRESHOLD {
        return "up".to_string();
    }
    if change < -TREND_CHANGE_THRESHOLD {
        return "down".to_string();
    }
    if change.abs() < MINOR_CHANGE_THRESHOLD {
        return "flat".to_string();
    }
    "stuck".to_string()
}

fn calculate_consecutive_days(history: &[TrendHistoryPoint], current_state: &str) -> i64 {
    if history.is_empty() {
        return 1;
    }
    let mut count = 0i64;
    for item in history {
        if item.trend_state.as_deref() == Some(current_state) {
            count += 1;
        } else {
            break;
        }
    }
    if count > 0 { count } else { 1 }
}

fn compute_intervention(trend_state: &str, consecutive_days: i64) -> InterventionResult {
    if matches!(trend_state, "up" | "flat") {
        return InterventionResult {
            needs_intervention: false,
            kind: None,
            message: None,
            actions: None,
        };
    }

    const CONSECUTIVE_DOWN_THRESHOLD: i64 = 3;

    if trend_state == "down" {
        if consecutive_days > CONSECUTIVE_DOWN_THRESHOLD {
            return InterventionResult {
                needs_intervention: true,
                kind: Some("warning".to_string()),
                message: Some(format!(
                    "您的学习状态已连续{consecutive_days}天下降，建议调整学习计划"
                )),
                actions: Some(vec![
                    "减少每日学习量".to_string(),
                    "选择更简单的词书".to_string(),
                    "调整学习时间到黄金时段".to_string(),
                    "休息一天后再继续".to_string(),
                ]),
            };
        }
        return InterventionResult {
            needs_intervention: true,
            kind: Some("suggestion".to_string()),
            message: Some("您的学习状态有所下降，建议适当调整".to_string()),
            actions: Some(vec![
                "尝试在精力充沛时学习".to_string(),
                "减少单次学习时长".to_string(),
                "增加复习比例".to_string(),
            ]),
        };
    }

    InterventionResult {
        needs_intervention: true,
        kind: Some("encouragement".to_string()),
        message: Some("您的学习进入了平台期，这是正常现象".to_string()),
        actions: Some(vec![
            "尝试新的学习方法".to_string(),
            "挑战更难的单词".to_string(),
            "设定小目标激励自己".to_string(),
        ]),
    }
}

async fn reset_user(
    State(state): State<AppState>,
    request_state: Option<Extension<RequestDbState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user, db_state) = require_user(&state, request_state, &headers).await?;
    reset_user_state(proxy.as_ref(), db_state, &user.id).await?;

    Ok(Json(SuccessMessageResponse {
        success: true,
        message: "AMAS状态已重置".to_string(),
    }))
}

async fn reset_user_state(
    proxy: &crate::db::DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<(), AppError> {
    let now = Utc::now().naive_utc();
    let now_ms = Utc::now().timestamp_millis();

    let state_id = Uuid::new_v4().to_string();
    let default_cognitive = serde_json::json!({ "mem": 0.5, "speed": 0.5, "stability": 0.5 });

    let model_id = Uuid::new_v4().to_string();
    let default_model = serde_json::json!({});

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));

        let mut create = serde_json::Map::new();
        create.insert("id".to_string(), serde_json::Value::String(state_id));
        create.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        create.insert(
            "attention".to_string(),
            serde_json::Number::from_f64(0.7)
                .map(serde_json::Value::Number)
                .unwrap_or_else(|| serde_json::Value::Number(serde_json::Number::from(0))),
        );
        create.insert(
            "fatigue".to_string(),
            serde_json::Value::Number(serde_json::Number::from(0)),
        );
        create.insert(
            "motivation".to_string(),
            serde_json::Value::Number(serde_json::Number::from(0)),
        );
        create.insert(
            "confidence".to_string(),
            serde_json::Value::Number(serde_json::Number::from_f64(0.5).unwrap_or_else(|| serde_json::Number::from(0))),
        );
        create.insert("cognitiveProfile".to_string(), default_cognitive.clone());
        create.insert("habitProfile".to_string(), serde_json::Value::Null);
        create.insert("trendState".to_string(), serde_json::Value::Null);
        create.insert("coldStartState".to_string(), serde_json::Value::Null);
        create.insert(
            "lastUpdateTs".to_string(),
            serde_json::Value::Number(serde_json::Number::from(now_ms)),
        );
        create.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now.to_string()),
        );

        let mut update = serde_json::Map::new();
        update.insert(
            "attention".to_string(),
            serde_json::Number::from_f64(0.7)
                .map(serde_json::Value::Number)
                .unwrap_or_else(|| serde_json::Value::Number(serde_json::Number::from(0))),
        );
        update.insert(
            "fatigue".to_string(),
            serde_json::Value::Number(serde_json::Number::from(0)),
        );
        update.insert(
            "motivation".to_string(),
            serde_json::Value::Number(serde_json::Number::from(0)),
        );
        update.insert(
            "confidence".to_string(),
            serde_json::Value::Number(serde_json::Number::from_f64(0.5).unwrap_or_else(|| serde_json::Number::from(0))),
        );
        update.insert("cognitiveProfile".to_string(), default_cognitive);
        update.insert("habitProfile".to_string(), serde_json::Value::Null);
        update.insert("trendState".to_string(), serde_json::Value::Null);
        update.insert("coldStartState".to_string(), serde_json::Value::Null);
        update.insert(
            "lastUpdateTs".to_string(),
            serde_json::Value::Number(serde_json::Number::from(now_ms)),
        );
        update.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now.to_string()),
        );

        let state_op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "amas_user_states".to_string(),
            r#where: where_clause,
            create,
            update,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy
            .write_operation(state, state_op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

        let mut model_where = serde_json::Map::new();
        model_where.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));

        let mut model_create = serde_json::Map::new();
        model_create.insert("id".to_string(), serde_json::Value::String(model_id));
        model_create.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        model_create.insert("modelData".to_string(), default_model.clone());
        model_create.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now.to_string()),
        );

        let mut model_update = serde_json::Map::new();
        model_update.insert("modelData".to_string(), default_model);
        model_update.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now.to_string()),
        );

        let model_op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "amas_user_models".to_string(),
            r#where: model_where,
            create: model_create,
            update: model_update,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy
            .write_operation(state, model_op)
            .await
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

        return Ok(());
    }

    let pool = proxy
        .primary_pool()
        .await
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用"))?;

    sqlx::query(
        r#"
        INSERT INTO "amas_user_states" (
            "id",
            "userId",
            "attention",
            "fatigue",
            "motivation",
            "confidence",
            "cognitiveProfile",
            "habitProfile",
            "trendState",
            "coldStartState",
            "lastUpdateTs",
            "updatedAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT ("userId") DO UPDATE SET
            "attention" = EXCLUDED."attention",
            "fatigue" = EXCLUDED."fatigue",
            "motivation" = EXCLUDED."motivation",
            "confidence" = EXCLUDED."confidence",
            "cognitiveProfile" = EXCLUDED."cognitiveProfile",
            "habitProfile" = EXCLUDED."habitProfile",
            "trendState" = EXCLUDED."trendState",
            "coldStartState" = EXCLUDED."coldStartState",
            "lastUpdateTs" = EXCLUDED."lastUpdateTs",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(state_id)
    .bind(user_id)
    .bind(0.7f64)
    .bind(0.0f64)
    .bind(0.0f64)
    .bind(0.5f64)
    .bind(default_cognitive.clone())
    .bind(Option::<serde_json::Value>::None)
    .bind(Option::<String>::None)
    .bind(Option::<serde_json::Value>::None)
    .bind(now_ms)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    sqlx::query(
        r#"
        INSERT INTO "amas_user_models" (
            "id",
            "userId",
            "modelData",
            "updatedAt"
        )
        VALUES ($1,$2,$3,$4)
        ON CONFLICT ("userId") DO UPDATE SET
            "modelData" = EXCLUDED."modelData",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(model_id)
    .bind(user_id)
    .bind(default_model)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    Ok(())
}
