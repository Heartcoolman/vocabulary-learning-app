use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, Request, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::stream::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use uuid::Uuid;

use crate::amas::metrics::registry;
use crate::db::operations::{
    get_algorithm_distribution as db_get_algorithm_distribution, get_decision_by_id,
    get_global_recent_decisions, get_monitoring_overview, get_today_decision_count,
    get_algorithm_status as db_get_algorithm_status, get_memory_status as db_get_memory_status,
    get_pipeline_status as db_get_pipeline_status, get_user_state_status as db_get_user_state_status,
    has_decision_data, has_learning_state_data, has_monitoring_data, has_user_state_data,
    DecisionRecord,
};
use crate::services::amas::StrategyParams;
use crate::state::AppState;

static ABOUT_STORE: OnceLock<Arc<AboutStore>> = OnceLock::new();

fn store() -> &'static Arc<AboutStore> {
    ABOUT_STORE.get_or_init(|| Arc::new(AboutStore::new()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/simulate", post(simulate))
        .route("/simulate-batch", post(simulate_batch))
        // Stats routes (with /stats/ prefix)
        .route("/stats/overview", get(stats_overview))
        .route(
            "/stats/algorithm-distribution",
            get(stats_algorithm_distribution),
        )
        .route("/stats/performance", get(stats_performance))
        .route("/stats/optimization-events", get(stats_optimization_events))
        .route("/stats/mastery-radar", get(stats_mastery_radar))
        .route("/stats/state-distribution", get(stats_state_distribution))
        .route("/stats/recent-decisions", get(stats_recent_decisions))
        .route(
            "/stats/learning-mode-distribution",
            get(stats_learning_mode_distribution),
        )
        .route(
            "/stats/half-life-distribution",
            get(stats_half_life_distribution),
        )
        .route("/stats/algorithm-trend", get(stats_algorithm_trend))
        // Frontend compatibility aliases (without /stats/ prefix)
        .route("/overview", get(stats_overview))
        .route("/algorithm-distribution", get(stats_algorithm_distribution))
        .route("/performance", get(stats_performance))
        .route("/optimization-events", get(stats_optimization_events))
        .route("/mastery-radar", get(stats_mastery_radar))
        .route("/state-distribution", get(stats_state_distribution))
        .route("/recent-decisions", get(stats_recent_decisions))
        .route("/mixed-decisions", get(stats_recent_decisions))
        .route("/decisions/:id", get(decision_detail))
        .route("/memory", get(system_memory_status))
        // Decision detail
        .route("/decision/:decisionId", get(decision_detail))
        // Pipeline routes
        .route("/pipeline/snapshot", get(pipeline_snapshot))
        .route("/pipeline/trace/:packetId", get(pipeline_trace))
        .route("/pipeline/inject-fault", post(pipeline_inject_fault))
        .route("/pipeline/fault", post(pipeline_inject_fault))
        .route("/pipeline/layers/:layer", get(system_pipeline_status))
        // System routes
        .route("/system/pipeline-status", get(system_pipeline_status))
        .route("/system/algorithm-status", get(system_algorithm_status))
        .route("/system/user-state-status", get(system_user_state_status))
        .route("/system/memory-status", get(system_memory_status))
        // Algorithm and user-state aliases for frontend
        .route("/algorithms/:algorithm", get(system_algorithm_status))
        .route("/user-state/:dimension", get(system_user_state_status))
        // Metrics and other
        .route("/metrics", get(about_metrics))
        .route("/metrics/prometheus", get(about_metrics_prometheus))
        .route("/feature-flags", get(feature_flags))
        .route("/module-health", get(module_health_check))
        .route("/health", get(about_health))
        .route("/decisions/stream", get(decisions_stream))
        .fallback(about_fallback)
}

#[derive(Debug, Serialize)]
struct AboutErrorBody {
    success: bool,
    error: String,
}

#[derive(Debug, Serialize)]
struct AboutSuccessBody<T> {
    success: bool,
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<&'static str>,
}

fn about_error(status: StatusCode, message: impl Into<String>) -> Response {
    let body = AboutErrorBody {
        success: false,
        error: message.into(),
    };
    (status, Json(body)).into_response()
}

fn about_ok<T: Serialize>(data: T) -> Response {
    Json(AboutSuccessBody::<T> {
        success: true,
        data,
        source: None,
    })
    .into_response()
}

fn about_ok_with_source<T: Serialize>(data: T, source: &'static str) -> Response {
    Json(AboutSuccessBody::<T> {
        success: true,
        data,
        source: Some(source),
    })
    .into_response()
}

async fn about_fallback() -> Response {
    about_error(StatusCode::NOT_FOUND, "接口不存在")
}

#[derive(Debug)]
struct AboutStore {
    decisions: RwLock<DecisionStore>,
    pipeline: RwLock<PipelineStore>,
    sse_tx: broadcast::Sender<SseDecisionEvent>,
    connections: AtomicUsize,
    seed: AtomicU64,
}

impl AboutStore {
    fn new() -> Self {
        let (tx, _rx) = broadcast::channel(256);
        Self {
            decisions: RwLock::new(DecisionStore::default()),
            pipeline: RwLock::new(PipelineStore::default()),
            sse_tx: tx,
            connections: AtomicUsize::new(0),
            seed: AtomicU64::new(now_ms() ^ 0x9E37_79B9_7F4A_7C15),
        }
    }

    fn next_seed(&self) -> u64 {
        self.seed
            .fetch_add(1, Ordering::Relaxed)
            .wrapping_mul(6364136223846793005)
    }
}

#[derive(Debug, Default)]
struct DecisionStore {
    virtual_recent: Vec<RecentDecision>,
    virtual_detail: HashMap<String, DecisionDetail>,
}

#[derive(Debug, Default)]
struct PipelineStore {
    packets: Vec<DataPacket>,
    traces: HashMap<String, PacketTrace>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AboutSimulateResponse {
    #[serde(rename = "inputState")]
    input_state: StateSnapshot,
    #[serde(rename = "decisionProcess")]
    decision_process: DecisionProcess,
    #[serde(rename = "outputStrategy")]
    output_strategy: StrategyParams,
    explanation: Explanation,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StateSnapshot {
    #[serde(rename = "A")]
    attention: f64,
    #[serde(rename = "F")]
    fatigue: f64,
    #[serde(rename = "M")]
    motivation: f64,
    #[serde(rename = "C")]
    cognitive: CognitiveSnapshot,
    conf: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CognitiveSnapshot {
    mem: f64,
    speed: f64,
    stability: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct DecisionProcess {
    phase: String,
    votes: HashMap<String, MemberVote>,
    weights: EnsembleWeights,
    #[serde(rename = "decisionSource")]
    decision_source: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct MemberVote {
    action: String,
    contribution: f64,
    confidence: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct EnsembleWeights {
    thompson: f64,
    linucb: f64,
    heuristic: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct Explanation {
    factors: Vec<ExplanationFactor>,
    summary: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExplanationFactor {
    name: String,
    value: f64,
    impact: String,
    percentage: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentDecision {
    decision_id: String,
    pseudo_id: String,
    timestamp: String,
    decision_source: String,
    strategy: RecentDecisionStrategy,
    dominant_factor: String,
}

#[derive(Debug, Serialize, Clone)]
struct RecentDecisionStrategy {
    difficulty: String,
    batch_size: i32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DecisionDetail {
    decision_id: String,
    timestamp: String,
    pseudo_id: String,
    decision_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    coldstart_phase: Option<String>,
    confidence: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    reward: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_duration_ms: Option<u64>,
    strategy: StrategyParams,
    weights: HashMap<String, f64>,
    #[serde(rename = "memberVotes")]
    member_votes: Vec<MemberVoteDetail>,
    pipeline: Vec<PipelineStageDetail>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MemberVoteDetail {
    #[serde(skip_serializing_if = "Option::is_none")]
    member: Option<String>,
    action: String,
    contribution: f64,
    confidence: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PipelineStageDetail {
    stage: u32,
    stage_type: String,
    stage_name: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ended_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_summary: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_summary: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DataPacket {
    id: String,
    current_stage: u8,
    current_node: String,
    progress: u8,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fault_type: Option<String>,
    data: HashMap<String, f64>,
    created_at: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NodeState {
    id: String,
    status: String,
    load: f64,
    processed_count: u64,
    last_processed_at: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PipelineMetrics {
    throughput: f64,
    avg_latency: f64,
    active_packets: u64,
    total_processed: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PipelineSnapshot {
    timestamp: u64,
    current_packets: Vec<DataPacket>,
    node_states: HashMap<String, NodeState>,
    metrics: PipelineMetrics,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StageTrace {
    stage: String,
    stage_name: String,
    node_id: String,
    duration: u64,
    input: String,
    output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
    timestamp: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PacketTrace {
    packet_id: String,
    status: String,
    stages: Vec<StageTrace>,
    total_duration: u64,
}

#[derive(Debug, Deserialize)]
struct MixedQuery {
    mixed: Option<String>,
}

#[derive(Debug, Serialize)]
struct MixedDecisions {
    real: Vec<RecentDecision>,
    #[serde(rename = "virtual")]
    virtual_items: Vec<RecentDecision>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FaultInjectionRequest {
    fault_type: String,
    intensity: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FaultInjectionResponse {
    packet_id: String,
    fault_type: String,
    expected_path: Vec<String>,
    guard_rail_triggers: Vec<String>,
    expected_outcome: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SseDecisionEvent {
    decision_id: String,
    pseudo_id: String,
    timestamp: String,
    decision_source: String,
    strategy: RecentDecisionStrategy,
    dominant_factor: String,
    source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SseConnectedEvent {
    message: String,
    timestamp: String,
    connections: usize,
}

async fn simulate(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Response {
    let object = match payload.as_object() {
        Some(object) => object,
        None => return about_error(StatusCode::BAD_REQUEST, "请求体必须是有效的 JSON 对象"),
    };

    let attention = parse_f64(object.get("attention")).unwrap_or(0.6);
    let fatigue = parse_f64(object.get("fatigue")).unwrap_or(0.3);
    let motivation = parse_f64(object.get("motivation")).unwrap_or(0.0);

    if !(0.0..=1.0).contains(&attention) {
        return about_error(StatusCode::BAD_REQUEST, "attention 必须在 [0, 1] 范围内");
    }
    if !(0.0..=1.0).contains(&fatigue) {
        return about_error(StatusCode::BAD_REQUEST, "fatigue 必须在 [0, 1] 范围内");
    }
    if !(-1.0..=1.0).contains(&motivation) {
        return about_error(StatusCode::BAD_REQUEST, "motivation 必须在 [-1, 1] 范围内");
    }

    let cognitive = object.get("cognitive").and_then(|value| value.as_object());
    let mem = cognitive
        .and_then(|c| parse_f64(c.get("memory")))
        .unwrap_or(0.5);
    let speed = cognitive
        .and_then(|c| parse_f64(c.get("speed")))
        .unwrap_or(0.5);
    let stability = cognitive
        .and_then(|c| parse_f64(c.get("stability")))
        .unwrap_or(0.5);

    let input_state = StateSnapshot {
        attention,
        fatigue,
        motivation,
        cognitive: CognitiveSnapshot {
            mem: mem.clamp(0.0, 1.0),
            speed: speed.clamp(0.0, 1.0),
            stability: stability.clamp(0.0, 1.0),
        },
        conf: compute_confidence(attention, fatigue, motivation),
    };

    let decision = build_simulation(&input_state);

    let store = Arc::clone(store());
    record_virtual_decision(&store, &decision).await;

    about_ok(decision)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchSimulateRequest {
    count: Option<usize>,
    user_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchSimulateResponse {
    processed: usize,
    duration_ms: u64,
    decisions: Vec<BatchDecisionSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchDecisionSummary {
    decision_id: String,
    decision_source: String,
    difficulty: String,
    batch_size: i32,
    confidence: f64,
}

async fn simulate_batch(
    State(state): State<AppState>,
    Json(payload): Json<BatchSimulateRequest>,
) -> Response {
    use crate::amas::types::{ProcessOptions, RawEvent};
    use crate::db::operations::{insert_decision_record, DecisionRecord};

    let count = payload.count.unwrap_or(100).min(500);
    let user_id = payload.user_id.unwrap_or_else(|| format!("sim-user-{}", now_ms()));
    let start = std::time::Instant::now();

    let engine = state.amas_engine();
    let proxy = state.db_proxy();
    let mut decisions = Vec::with_capacity(count);

    for i in 0..count {
        let seed = store().next_seed();
        let is_correct = (seed % 100) >= 28;
        let response_time: i64 = 800 + ((seed >> 8) % 5200) as i64;
        let word_idx = ((seed >> 16) % 50) + 1;
        let word_id = format!("word_{:03}", word_idx);
        let dwell_time = response_time + 500 + ((seed >> 24) % 1500) as i64;
        let hint_used = (seed >> 32) % 10 == 0;
        let pause_count = ((seed >> 40) % 3) as i32;
        let rt_cv = 0.1 + ((seed >> 48) % 40) as f64 / 100.0;
        let recent_accuracy = 0.5 + ((seed >> 52) % 40) as f64 / 100.0;
        let study_duration = 5.0 + ((seed >> 56) % 40) as f64;
        let session_id = format!("sim-session-{}", now_ms());

        let event = RawEvent {
            is_correct,
            response_time,
            dwell_time: Some(dwell_time),
            hint_used,
            pause_count,
            word_id: Some(word_id.clone()),
            ..Default::default()
        };

        let options = ProcessOptions {
            rt_cv: Some(rt_cv),
            recent_accuracy: Some(recent_accuracy),
            study_duration_minutes: Some(study_duration),
            session_id: Some(session_id.clone()),
            ..Default::default()
        };

        let event_start = std::time::Instant::now();
        match engine.process_event(&user_id, event, options).await {
            Ok(result) => {
                let latency_ms = event_start.elapsed().as_millis() as i64;
                let decision_id = Uuid::new_v4().to_string();

                // Only mark as coldstart for Classify/Explore phases, not Normal
                let is_coldstart = matches!(
                    result.cold_start_phase,
                    Some(crate::amas::types::ColdStartPhase::Classify)
                    | Some(crate::amas::types::ColdStartPhase::Explore)
                );
                let decision_source = if is_coldstart {
                    "coldstart".to_string()
                } else {
                    "ensemble".to_string()
                };
                let difficulty = format!("{:?}", result.strategy.difficulty).to_lowercase();
                let confidence = result.state.conf;
                let coldstart_phase = result.cold_start_phase.map(|p| format!("{:?}", p).to_lowercase());

                // Write decision record to database
                if let Some(ref proxy) = proxy {
                    let weights = result.algorithm_weights.as_ref().map(|w| {
                        serde_json::json!({
                            "thompson": w.thompson,
                            "linucb": w.linucb,
                            "actr": w.actr,
                            "heuristic": w.heuristic
                        })
                    });

                    let record = DecisionRecord {
                        id: Uuid::new_v4().to_string(),
                        decision_id: decision_id.clone(),
                        answer_record_id: None,
                        session_id: Some(session_id),
                        decision_source: decision_source.clone(),
                        coldstart_phase: coldstart_phase.clone(),
                        weights_snapshot: weights,
                        member_votes: None,
                        selected_action: serde_json::json!({
                            "difficulty": difficulty,
                            "batch_size": result.strategy.batch_size,
                            "interval_scale": result.strategy.interval_scale,
                            "new_ratio": result.strategy.new_ratio,
                            "hint_level": result.strategy.hint_level
                        }),
                        confidence,
                        reward: Some(result.reward.value),
                        trace_version: 1,
                        total_duration_ms: Some(latency_ms as i32),
                        is_simulation: false,
                        emotion_label: None,
                        flow_score: None,
                    };

                    if let Err(e) = insert_decision_record(proxy.as_ref(), &record).await {
                        tracing::warn!(error = %e, "Failed to insert decision record");
                    }
                }

                decisions.push(BatchDecisionSummary {
                    decision_id,
                    decision_source,
                    difficulty,
                    batch_size: result.strategy.batch_size,
                    confidence,
                });
            }
            Err(e) => {
                tracing::warn!(error = %e, iteration = i, "Batch simulate error");
            }
        }

        if i % 10 == 0 && i > 0 {
            tokio::task::yield_now().await;
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    about_ok(BatchSimulateResponse {
        processed: decisions.len(),
        duration_ms,
        decisions,
    })
}

fn parse_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    let value = value?;
    match value {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn compute_confidence(attention: f64, fatigue: f64, motivation: f64) -> f64 {
    let fatigue_factor = 1.0 - fatigue.clamp(0.0, 1.0);
    let motivation_factor = ((motivation.clamp(-1.0, 1.0) + 1.0) / 2.0).clamp(0.0, 1.0);
    (attention.clamp(0.0, 1.0) * 0.55 + fatigue_factor * 0.25 + motivation_factor * 0.2)
        .clamp(0.0, 1.0)
}

fn build_simulation(input: &StateSnapshot) -> AboutSimulateResponse {
    let phase = if input.conf < 0.4 {
        "classify"
    } else if input.conf < 0.65 {
        "explore"
    } else {
        "normal"
    };

    let decision_source = if phase == "normal" {
        "ensemble"
    } else {
        "coldstart"
    };

    let weights = match phase {
        "classify" => EnsembleWeights {
            thompson: 0.25,
            linucb: 0.30,
            heuristic: 0.45,
        },
        "explore" => EnsembleWeights {
            thompson: 0.35,
            linucb: 0.45,
            heuristic: 0.20,
        },
        _ => EnsembleWeights {
            thompson: 0.40,
            linucb: 0.45,
            heuristic: 0.15,
        },
    };

    let output_strategy = decide_strategy(input);

    let mut votes: HashMap<String, MemberVote> = HashMap::new();
    votes.insert(
        "thompson".to_string(),
        MemberVote {
            action: format!("difficulty:{}", output_strategy.difficulty),
            contribution: weights.thompson,
            confidence: (input.conf * 0.9).clamp(0.0, 1.0),
        },
    );
    votes.insert(
        "linucb".to_string(),
        MemberVote {
            action: format!("batch_size:{}", output_strategy.batch_size),
            contribution: weights.linucb,
            confidence: (input.conf * 0.95).clamp(0.0, 1.0),
        },
    );
    votes.insert(
        "heuristic".to_string(),
        MemberVote {
            action: format!("new_ratio:{:.2}", output_strategy.new_ratio),
            contribution: weights.heuristic,
            confidence: (input.conf * 0.75).clamp(0.0, 1.0),
        },
    );

    let factors = build_explanation_factors(input, &output_strategy);
    let summary = format!(
        "当前注意力 {:.0}%，疲劳 {:.0}%，动机 {:.0}%，推荐难度 {}，每组 {} 个单词。",
        input.attention * 100.0,
        input.fatigue * 100.0,
        ((input.motivation + 1.0) / 2.0) * 100.0,
        output_strategy.difficulty,
        output_strategy.batch_size
    );

    AboutSimulateResponse {
        input_state: input.clone(),
        decision_process: DecisionProcess {
            phase: phase.to_string(),
            votes,
            weights,
            decision_source: decision_source.to_string(),
        },
        output_strategy,
        explanation: Explanation { factors, summary },
    }
}

fn decide_strategy(input: &StateSnapshot) -> StrategyParams {
    let base_interval = 1.0 + (input.attention - 0.5) * 0.6 - input.fatigue * 0.4;
    let interval_scale = base_interval.clamp(0.6, 1.6);

    let base_new_ratio = 0.2 + input.motivation * 0.08 - input.fatigue * 0.06;
    let new_ratio = base_new_ratio.clamp(0.05, 0.6);

    let difficulty = if input.fatigue > 0.75 {
        "easy"
    } else if input.attention > 0.75 && input.motivation > 0.2 {
        "hard"
    } else {
        "mid"
    };

    let raw_batch = 8.0 + input.motivation * 3.0 - input.fatigue * 2.5;
    let batch_size = raw_batch.round().clamp(4.0, 20.0) as i32;

    let hint_level = if difficulty == "hard" { 0 } else { 1 };

    StrategyParams {
        interval_scale,
        new_ratio,
        difficulty: difficulty.to_string(),
        batch_size,
        hint_level,
    }
}

fn build_explanation_factors(
    input: &StateSnapshot,
    strategy: &StrategyParams,
) -> Vec<ExplanationFactor> {
    let attention = input.attention.clamp(0.0, 1.0);
    let fatigue = input.fatigue.clamp(0.0, 1.0);
    let motivation = ((input.motivation.clamp(-1.0, 1.0) + 1.0) / 2.0).clamp(0.0, 1.0);

    let mut raw = vec![
        ("注意力".to_string(), attention),
        ("疲劳".to_string(), 1.0 - fatigue),
        ("动机".to_string(), motivation),
    ];

    let sum: f64 = raw.iter().map(|(_, v)| *v).sum();
    if sum <= 0.0 {
        return Vec::new();
    }

    raw.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    raw.into_iter()
        .map(|(name, value)| ExplanationFactor {
            impact: if name == "疲劳" && input.fatigue > 0.6 {
                "负向".to_string()
            } else {
                "正向".to_string()
            },
            percentage: ((value / sum) * 100.0 * 10.0).round() / 10.0,
            name,
            value: (value * 1000.0).round() / 1000.0,
        })
        .chain(std::iter::once(ExplanationFactor {
            name: "策略批量".to_string(),
            value: strategy.batch_size as f64,
            impact: "配置".to_string(),
            percentage: 0.0,
        }))
        .collect()
}

async fn record_virtual_decision(store: &Arc<AboutStore>, simulation: &AboutSimulateResponse) {
    let decision_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let pseudo_id = short_id(&decision_id);

    let dominant_factor = simulation
        .explanation
        .factors
        .first()
        .map(|f| f.name.clone())
        .unwrap_or_else(|| "注意力".to_string());

    let detail = DecisionDetail {
        decision_id: decision_id.clone(),
        timestamp: now.clone(),
        pseudo_id: pseudo_id.clone(),
        decision_source: simulation.decision_process.decision_source.clone(),
        coldstart_phase: Some(simulation.decision_process.phase.clone())
            .filter(|_| simulation.decision_process.decision_source == "coldstart"),
        confidence: simulation.input_state.conf,
        reward: None,
        total_duration_ms: None,
        strategy: simulation.output_strategy.clone(),
        weights: {
            let mut map = HashMap::new();
            map.insert(
                "thompson".to_string(),
                simulation.decision_process.weights.thompson,
            );
            map.insert(
                "linucb".to_string(),
                simulation.decision_process.weights.linucb,
            );
            map.insert(
                "heuristic".to_string(),
                simulation.decision_process.weights.heuristic,
            );
            map
        },
        member_votes: simulation
            .decision_process
            .votes
            .iter()
            .map(|(member, vote)| MemberVoteDetail {
                member: Some(member.clone()),
                action: vote.action.clone(),
                contribution: vote.contribution,
                confidence: vote.confidence,
            })
            .collect(),
        pipeline: build_virtual_pipeline(
            &now,
            &simulation.input_state,
            &simulation.output_strategy,
        ),
    };

    let summary = RecentDecision {
        decision_id: decision_id.clone(),
        pseudo_id: pseudo_id.clone(),
        timestamp: now.clone(),
        decision_source: simulation.decision_process.decision_source.clone(),
        strategy: RecentDecisionStrategy {
            difficulty: simulation.output_strategy.difficulty.clone(),
            batch_size: simulation.output_strategy.batch_size,
        },
        dominant_factor: dominant_factor.clone(),
    };

    {
        let mut guard = store.decisions.write().await;
        guard.virtual_detail.insert(decision_id.clone(), detail);
        guard
            .virtual_recent
            .retain(|d| d.decision_id != decision_id);
        guard.virtual_recent.insert(0, summary.clone());
        guard.virtual_recent.truncate(50);
    }

    let _ = store.sse_tx.send(SseDecisionEvent {
        decision_id,
        pseudo_id,
        timestamp: now,
        decision_source: simulation.decision_process.decision_source.clone(),
        strategy: summary.strategy,
        dominant_factor,
        source: "virtual".to_string(),
    });
}

fn build_virtual_pipeline(
    now_iso: &str,
    input: &StateSnapshot,
    strategy: &StrategyParams,
) -> Vec<PipelineStageDetail> {
    let mut stages = Vec::new();
    let stage_names = [
        ("PERCEPTION", "感知层"),
        ("MODELING", "建模层"),
        ("LEARNING", "学习层"),
        ("DECISION", "决策层"),
        ("EVALUATION", "评估层"),
        ("OPTIMIZATION", "优化层"),
    ];

    for (idx, (stage_type, stage_name)) in stage_names.iter().enumerate() {
        let stage_number = (idx + 1) as u32;
        let status = if stage_number == 1 || stage_number == 4 {
            "SUCCESS"
        } else {
            "SKIPPED"
        };

        let input_summary = match stage_number {
            1 => Some(serde_json::json!({ "rawInput": input })),
            4 => Some(serde_json::json!({ "state": input })),
            _ => None,
        };

        let output_summary = match stage_number {
            1 => Some(serde_json::json!({ "state": input })),
            4 => Some(serde_json::json!({ "strategy": strategy })),
            _ => None,
        };

        stages.push(PipelineStageDetail {
            stage: stage_number,
            stage_type: stage_type.to_string(),
            stage_name: stage_name.to_string(),
            status: status.to_string(),
            duration_ms: Some(0),
            started_at: now_iso.to_string(),
            ended_at: Some(now_iso.to_string()),
            input_summary,
            output_summary,
            metadata: None,
            error_message: None,
        });
    }

    stages
}

fn short_id(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect()
}

async fn stats_overview(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        // No database connection, use virtual data
        let store = store();
        seed_virtual_decisions(store).await;
        let count = { store.decisions.read().await.virtual_recent.len() as u64 };
        return about_ok_with_source(
            OverviewStats {
                today_decisions: count,
                active_users: 42,
                avg_efficiency_gain: 0.18,
                timestamp: now_iso(),
            },
            "virtual",
        );
    };

    // Try to get real data first
    let today_count = get_today_decision_count(&proxy).await.unwrap_or(0);
    let monitoring = get_monitoring_overview(&proxy).await.ok();

    if today_count > 0 || monitoring.is_some() {
        let mon = monitoring.unwrap_or_default();
        return about_ok_with_source(
            OverviewStats {
                today_decisions: today_count as u64,
                active_users: mon.events_last24h as u64 / 10, // estimate
                avg_efficiency_gain: 1.0 - mon.anomaly_rate,
                timestamp: now_iso(),
            },
            "real",
        );
    }

    // Fallback to virtual data
    let store = store();
    seed_virtual_decisions(store).await;
    let count = { store.decisions.read().await.virtual_recent.len() as u64 };

    about_ok_with_source(
        OverviewStats {
            today_decisions: count,
            active_users: 42,
            avg_efficiency_gain: 0.18,
            timestamp: now_iso(),
        },
        "virtual",
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OverviewStats {
    today_decisions: u64,
    active_users: u64,
    avg_efficiency_gain: f64,
    timestamp: String,
}

async fn stats_algorithm_distribution(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return about_ok_with_source(
            AlgorithmDistribution {
                thompson: 0.4,
                linucb: 0.4,
                heuristic: 0.18,
                coldstart: 0.02,
            },
            "virtual",
        );
    };

    // Try to get real data first
    if let Ok(dist) = db_get_algorithm_distribution(&proxy).await {
        if !dist.is_empty() {
            return about_ok_with_source(
                AlgorithmDistribution {
                    thompson: *dist.get("thompson").unwrap_or(&0.0),
                    linucb: *dist.get("linucb").unwrap_or(&0.0),
                    heuristic: *dist.get("heuristic").unwrap_or(&0.0),
                    coldstart: *dist.get("coldstart").unwrap_or(&0.0),
                },
                "real",
            );
        }
    }

    // Fallback to virtual data
    about_ok_with_source(
        AlgorithmDistribution {
            thompson: 0.4,
            linucb: 0.4,
            heuristic: 0.18,
            coldstart: 0.02,
        },
        "virtual",
    )
}

#[derive(Serialize)]
struct AlgorithmDistribution {
    thompson: f64,
    linucb: f64,
    heuristic: f64,
    coldstart: f64,
}

async fn stats_state_distribution(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        StateDistribution {
            attention: LevelDistribution {
                low: 0.15,
                medium: 0.55,
                high: 0.3,
            },
            fatigue: FatigueDistribution {
                fresh: 0.4,
                normal: 0.45,
                tired: 0.15,
            },
            motivation: MotivationDistribution {
                frustrated: 0.1,
                neutral: 0.5,
                motivated: 0.4,
            },
        },
        "virtual",
    )
}

#[derive(Serialize)]
struct StateDistribution {
    attention: LevelDistribution,
    fatigue: FatigueDistribution,
    motivation: MotivationDistribution,
}

#[derive(Serialize)]
struct LevelDistribution {
    low: f64,
    medium: f64,
    high: f64,
}

#[derive(Serialize)]
struct FatigueDistribution {
    fresh: f64,
    normal: f64,
    tired: f64,
}

#[derive(Serialize)]
struct MotivationDistribution {
    frustrated: f64,
    neutral: f64,
    motivated: f64,
}

async fn stats_performance(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        PerformanceMetrics {
            global_accuracy: 85.2,
            accuracy_improvement: 12.4,
            avg_inference_ms: 12,
            p99_inference_ms: 45,
            causal_ate: 0.18,
            causal_confidence: 0.95,
        },
        "virtual",
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PerformanceMetrics {
    global_accuracy: f64,
    accuracy_improvement: f64,
    avg_inference_ms: u64,
    p99_inference_ms: u64,
    causal_ate: f64,
    causal_confidence: f64,
}

async fn stats_optimization_events(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        vec![OptimizationEvent {
            id: "1".to_string(),
            r#type: "bayesian".to_string(),
            title: "超参数自动调优".to_string(),
            description: "Thompson 采样 Beta 分布参数优化完成".to_string(),
            timestamp: chrono::Utc::now()
                .checked_sub_signed(chrono::Duration::minutes(15))
                .unwrap_or_else(chrono::Utc::now)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            impact: "+2.3% 探索效率".to_string(),
        }],
        "virtual",
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OptimizationEvent {
    id: String,
    r#type: String,
    title: String,
    description: String,
    timestamp: String,
    impact: String,
}

async fn stats_mastery_radar(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        MasteryRadar {
            speed: 0.8,
            stability: 0.6,
            complexity: 0.7,
            consistency: 0.9,
        },
        "virtual",
    )
}

#[derive(Serialize)]
struct MasteryRadar {
    speed: f64,
    stability: f64,
    complexity: f64,
    consistency: f64,
}

async fn stats_recent_decisions(
    State(state): State<AppState>,
    Query(query): Query<MixedQuery>,
) -> Response {
    let mixed = matches!(query.mixed.as_deref(), Some("true" | "1" | "yes"));

    // Try to get real decisions first
    let real_recent: Vec<RecentDecision> = if let Some(proxy) = state.db_proxy() {
        get_global_recent_decisions(&proxy, 50)
            .await
            .unwrap_or_default()
            .iter()
            .map(|r| decision_record_to_recent(r))
            .collect()
    } else {
        Vec::new()
    };

    // Get virtual decisions as fallback
    let store = store();
    seed_virtual_decisions(store).await;
    let virtual_recent = { store.decisions.read().await.virtual_recent.clone() };

    if mixed {
        return about_ok_with_source(
            MixedDecisions {
                real: real_recent,
                virtual_items: virtual_recent,
            },
            "mixed",
        );
    }

    // Return real data if available, otherwise virtual
    if !real_recent.is_empty() {
        about_ok_with_source(real_recent, "real")
    } else {
        about_ok_with_source(virtual_recent, "virtual")
    }
}

fn decision_record_to_recent(record: &DecisionRecord) -> RecentDecision {
    let strategy = record
        .selected_action
        .as_object()
        .map(|obj| RecentDecisionStrategy {
            difficulty: obj
                .get("difficulty")
                .and_then(|v| v.as_str())
                .unwrap_or("medium")
                .to_string(),
            batch_size: obj.get("batch_size").and_then(|v| v.as_i64()).unwrap_or(10) as i32,
        })
        .unwrap_or(RecentDecisionStrategy {
            difficulty: "medium".to_string(),
            batch_size: 10,
        });

    RecentDecision {
        decision_id: record.decision_id.clone(),
        pseudo_id: short_id(&record.decision_id),
        timestamp: now_iso(), // TODO: use actual timestamp from record
        decision_source: record.decision_source.clone(),
        strategy,
        dominant_factor: record
            .emotion_label
            .clone()
            .unwrap_or_else(|| "注意力".to_string()),
    }
}

async fn decision_detail(
    State(state): State<AppState>,
    Path(decision_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let source = query.get("source").map(String::as_str);

    // Handle virtual source
    if source == Some("virtual") {
        let store = store();
        let detail = {
            store
                .decisions
                .read()
                .await
                .virtual_detail
                .get(&decision_id)
                .cloned()
        };

        let Some(detail) = detail else {
            return about_error(StatusCode::NOT_FOUND, "未找到指定模拟决策");
        };

        return about_ok_with_source(detail, "virtual");
    }

    // Try to get real data
    if let Some(proxy) = state.db_proxy() {
        if let Ok(Some(record)) = get_decision_by_id(&proxy, &decision_id).await {
            let detail = decision_record_to_detail(&record);
            return about_ok_with_source(detail, "real");
        }
    }

    // Fallback: try virtual store
    let store = store();
    let detail = {
        store
            .decisions
            .read()
            .await
            .virtual_detail
            .get(&decision_id)
            .cloned()
    };

    if let Some(detail) = detail {
        return about_ok_with_source(detail, "virtual");
    }

    about_error(StatusCode::NOT_FOUND, "未找到指定决策")
}

fn decision_record_to_detail(record: &DecisionRecord) -> DecisionDetail {
    let strategy = record
        .selected_action
        .as_object()
        .map(|obj| StrategyParams {
            difficulty: obj
                .get("difficulty")
                .and_then(|v| v.as_str())
                .unwrap_or("medium")
                .to_string(),
            batch_size: obj.get("batch_size").and_then(|v| v.as_i64()).unwrap_or(10) as i32,
            interval_scale: obj
                .get("interval_scale")
                .and_then(|v| v.as_f64())
                .unwrap_or(1.0),
            new_ratio: obj
                .get("new_ratio")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.2),
            hint_level: obj.get("hint_level").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
        })
        .unwrap_or(StrategyParams {
            difficulty: "medium".to_string(),
            batch_size: 10,
            interval_scale: 1.0,
            new_ratio: 0.2,
            hint_level: 1,
        });

    let member_votes: Vec<MemberVoteDetail> = record
        .member_votes
        .as_ref()
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    Some(MemberVoteDetail {
                        member: v.get("member").and_then(|m| m.as_str()).map(|s| s.to_string()),
                        action: v.get("action")?.as_str()?.to_string(),
                        contribution: v.get("contribution")?.as_f64()?,
                        confidence: v.get("confidence")?.as_f64()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let weights: HashMap<String, f64> = record
        .weights_snapshot
        .as_ref()
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();

    DecisionDetail {
        decision_id: record.decision_id.clone(),
        pseudo_id: short_id(&record.decision_id),
        timestamp: now_iso(),
        decision_source: record.decision_source.clone(),
        coldstart_phase: record.coldstart_phase.clone(),
        confidence: record.confidence,
        reward: record.reward,
        total_duration_ms: record.total_duration_ms.map(|v| v as u64),
        strategy,
        weights,
        member_votes,
        pipeline: Vec::new(),
    }
}

async fn pipeline_snapshot(State(_state): State<AppState>) -> Response {
    let store = store();
    seed_pipeline(store).await;

    let snapshot = {
        let mut pipeline = store.pipeline.write().await;
        advance_pipeline(&mut pipeline, store.next_seed());
        build_snapshot(&pipeline)
    };

    about_ok_with_source(snapshot, "virtual")
}

async fn pipeline_trace(State(_state): State<AppState>, Path(packet_id): Path<String>) -> Response {
    let store = store();
    seed_pipeline(store).await;

    let trace = { store.pipeline.read().await.traces.get(&packet_id).cloned() };
    let Some(trace) = trace else {
        return about_error(StatusCode::BAD_REQUEST, "packetId 参数无效");
    };

    about_ok_with_source(trace, "virtual")
}

async fn pipeline_inject_fault(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<FaultInjectionRequest>,
) -> Response {
    let valid_fault_types = ["high_fatigue", "low_attention", "anomaly"];
    if !valid_fault_types.contains(&payload.fault_type.as_str()) {
        return about_error(
            StatusCode::BAD_REQUEST,
            format!(
                "faultType 必须是以下值之一: {}",
                valid_fault_types.join(", ")
            ),
        );
    }

    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return about_error(StatusCode::UNAUTHORIZED, "未提供认证令牌");
    };

    let Some(proxy) = state.db_proxy() else {
        return about_error(StatusCode::UNAUTHORIZED, "认证失败，请重新登录");
    };

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => return about_error(StatusCode::UNAUTHORIZED, "认证失败，请重新登录"),
    };

    if user.role != "ADMIN" {
        return about_error(StatusCode::FORBIDDEN, "无权限执行该操作");
    }

    let intensity = payload.intensity.map(|v| v.clamp(0.0, 1.0));
    let store = store();

    let response = inject_fault(store, &payload.fault_type, intensity).await;
    about_ok(response)
}

async fn inject_fault(
    store: &Arc<AboutStore>,
    fault_type: &str,
    intensity: Option<f64>,
) -> FaultInjectionResponse {
    let packet_id = Uuid::new_v4().to_string();
    let created_at = now_ms();
    let intensity = intensity.unwrap_or(0.7).clamp(0.0, 1.0);

    let (expected_path, guard_rail_triggers, expected_outcome) = match fault_type {
        "high_fatigue" => (
            vec!["perception", "model", "guard", "decision"],
            vec!["fatigue_guard".to_string()],
            "系统应降低难度并减少新词比例".to_string(),
        ),
        "low_attention" => (
            vec!["perception", "model", "guard", "decision"],
            vec!["attention_guard".to_string()],
            "系统应缩短批次并提高提示级别".to_string(),
        ),
        "anomaly" => (
            vec!["perception", "guard", "blocked"],
            vec!["anomaly_guard".to_string()],
            "系统应阻断本次决策并回退到安全策略".to_string(),
        ),
        _ => (
            vec!["perception", "decision"],
            Vec::new(),
            "系统将按默认路径处理".to_string(),
        ),
    };

    let mut data = HashMap::new();
    data.insert(
        "attention".to_string(),
        if fault_type == "low_attention" {
            (0.2 * (1.0 - intensity)).clamp(0.0, 1.0)
        } else {
            0.7
        },
    );
    data.insert(
        "fatigue".to_string(),
        if fault_type == "high_fatigue" {
            (0.7 + 0.3 * intensity).clamp(0.0, 1.0)
        } else {
            0.3
        },
    );
    data.insert("motivation".to_string(), 0.2);

    {
        let mut pipeline = store.pipeline.write().await;
        pipeline.packets.insert(
            0,
            DataPacket {
                id: packet_id.clone(),
                current_stage: 1,
                current_node: "perception".to_string(),
                progress: 0,
                status: "fault_sim".to_string(),
                fault_type: Some(fault_type.to_string()),
                data: data.clone(),
                created_at,
            },
        );
        pipeline.packets.truncate(10);

        pipeline.traces.insert(
            packet_id.clone(),
            PacketTrace {
                packet_id: packet_id.clone(),
                status: "blocked".to_string(),
                stages: vec![StageTrace {
                    stage: "perception".to_string(),
                    stage_name: "感知层".to_string(),
                    node_id: "perception".to_string(),
                    duration: 5,
                    input: "fault injection".to_string(),
                    output: format!("{fault_type}:{intensity}"),
                    details: Some("已注入故障信号".to_string()),
                    timestamp: created_at,
                }],
                total_duration: 5,
            },
        );
    }

    FaultInjectionResponse {
        packet_id,
        fault_type: fault_type.to_string(),
        expected_path: expected_path.into_iter().map(|v| v.to_string()).collect(),
        guard_rail_triggers,
        expected_outcome,
    }
}

async fn system_pipeline_status(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return about_ok_with_source(default_pipeline_status(), "computed");
    };

    if !has_monitoring_data(proxy.as_ref()).await {
        return about_ok_with_source(default_pipeline_status(), "computed");
    }

    match db_get_pipeline_status(proxy.as_ref()).await {
        Ok(status) => about_ok_with_source(
            serde_json::json!({
                "layers": status.layers,
                "totalThroughput": status.total_throughput,
                "systemHealth": status.system_health,
            }),
            "real",
        ),
        Err(_) => about_ok_with_source(default_pipeline_status(), "computed"),
    }
}

fn default_pipeline_status() -> serde_json::Value {
    let now = now_iso();
    serde_json::json!({
        "layers": [
            { "id": "PERCEPTION", "name": "Perception", "nameCn": "感知层", "processedCount": 0, "avgLatencyMs": 0.0, "successRate": 1.0, "status": "healthy", "lastProcessedAt": now },
            { "id": "MODELING", "name": "Modeling", "nameCn": "建模层", "processedCount": 0, "avgLatencyMs": 0.0, "successRate": 1.0, "status": "healthy", "lastProcessedAt": now },
            { "id": "LEARNING", "name": "Learning", "nameCn": "学习层", "processedCount": 0, "avgLatencyMs": 0.0, "successRate": 1.0, "status": "healthy", "lastProcessedAt": now },
            { "id": "DECISION", "name": "Decision", "nameCn": "决策层", "processedCount": 0, "avgLatencyMs": 0.0, "successRate": 1.0, "status": "healthy", "lastProcessedAt": now },
            { "id": "EVALUATION", "name": "Evaluation", "nameCn": "评估层", "processedCount": 0, "avgLatencyMs": 0.0, "successRate": 1.0, "status": "healthy", "lastProcessedAt": now },
            { "id": "OPTIMIZATION", "name": "Optimization", "nameCn": "优化层", "processedCount": 0, "avgLatencyMs": 0.0, "successRate": 1.0, "status": "healthy", "lastProcessedAt": now },
        ],
        "totalThroughput": 0.0,
        "systemHealth": "healthy",
    })
}

async fn system_algorithm_status(State(state): State<AppState>) -> Response {
    // Always use runtime metrics from registry
    let algorithms = registry().snapshot();

    // Group by layer for better organization
    let by_layer: std::collections::HashMap<String, Vec<_>> = algorithms
        .iter()
        .fold(std::collections::HashMap::new(), |mut acc, a| {
            acc.entry(a.layer.clone()).or_default().push(a.clone());
            acc
        });

    let Some(proxy) = state.db_proxy() else {
        return about_ok_with_source(serde_json::json!({
            "algorithms": algorithms,
            "byLayer": by_layer,
            "ensembleConsensusRate": 0.8,
            "coldstartStats": { "classifyCount": 0, "exploreCount": 0, "normalCount": 0 }
        }), "runtime");
    };

    // Merge with DB stats if available
    if !has_decision_data(proxy.as_ref()).await {
        return about_ok_with_source(serde_json::json!({
            "algorithms": algorithms,
            "byLayer": by_layer,
            "ensembleConsensusRate": 0.8,
            "coldstartStats": { "classifyCount": 0, "exploreCount": 0, "normalCount": 0 }
        }), "runtime");
    }

    match db_get_algorithm_status(proxy.as_ref()).await {
        Ok(status) => about_ok_with_source(
            serde_json::json!({
                "algorithms": algorithms,
                "byLayer": by_layer,
                "ensembleConsensusRate": status.ensemble_consensus_rate,
                "coldstartStats": status.coldstart_stats,
            }),
            "runtime+db",
        ),
        Err(_) => about_ok_with_source(serde_json::json!({
            "algorithms": algorithms,
            "byLayer": by_layer,
            "ensembleConsensusRate": 0.8,
            "coldstartStats": { "classifyCount": 0, "exploreCount": 0, "normalCount": 0 }
        }), "runtime"),
    }
}

fn default_algorithm_status() -> serde_json::Value {
    let now = now_iso();
    serde_json::json!({
        "algorithms": [
            { "id": "thompson", "name": "Thompson Sampling", "weight": 0.4, "callCount": 0, "avgLatencyMs": 0.0, "explorationRate": 0.1, "lastCalledAt": now },
            { "id": "linucb", "name": "LinUCB", "weight": 0.4, "callCount": 0, "avgLatencyMs": 0.0, "explorationRate": 0.1, "lastCalledAt": now },
            { "id": "heuristic", "name": "Heuristic Rules", "weight": 0.2, "callCount": 0, "avgLatencyMs": 0.0, "explorationRate": 0.1, "lastCalledAt": now },
        ],
        "ensembleConsensusRate": 0.8,
        "coldstartStats": { "classifyCount": 0, "exploreCount": 0, "normalCount": 0, "userTypeDistribution": { "fast": 0.35, "stable": 0.45, "cautious": 0.2 } }
    })
}

async fn system_user_state_status(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return about_ok_with_source(default_user_state_status(), "computed");
    };

    if !has_user_state_data(proxy.as_ref()).await {
        return about_ok_with_source(default_user_state_status(), "computed");
    }

    match db_get_user_state_status(proxy.as_ref()).await {
        Ok((distributions, recent)) => about_ok_with_source(
            serde_json::json!({
                "distributions": distributions,
                "recentInferences": recent,
                "modelParams": {
                    "attention": { "beta": 0.85, "weights": { "rt_mean": 0.25, "rt_cv": 0.35, "pause": 0.15, "focus_loss": 0.5 } },
                    "fatigue": { "decayK": 0.08, "longBreakThreshold": 30 },
                    "motivation": { "rho": 0.85, "kappa": 0.3, "lambda": 0.4 }
                }
            }),
            "real",
        ),
        Err(_) => about_ok_with_source(default_user_state_status(), "computed"),
    }
}

fn default_user_state_status() -> serde_json::Value {
    serde_json::json!({
        "distributions": {
            "attention": { "avg": 0.7, "low": 0.0, "medium": 0.0, "high": 0.0, "lowAlertCount": 0 },
            "fatigue": { "avg": 0.3, "fresh": 0.0, "normal": 0.0, "tired": 0.0, "highAlertCount": 0 },
            "motivation": { "avg": 0.0, "frustrated": 0.0, "neutral": 0.0, "motivated": 0.0, "lowAlertCount": 0 },
            "cognitive": { "memory": 0.5, "speed": 0.5, "stability": 0.5 }
        },
        "recentInferences": [],
        "modelParams": {
            "attention": { "beta": 0.85, "weights": { "rt_mean": 0.25, "rt_cv": 0.35, "pause": 0.15, "focus_loss": 0.5 } },
            "fatigue": { "decayK": 0.08, "longBreakThreshold": 30 },
            "motivation": { "rho": 0.85, "kappa": 0.3, "lambda": 0.4 }
        }
    })
}

async fn system_memory_status(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return about_ok_with_source(default_memory_status(), "computed");
    };

    if !has_learning_state_data(proxy.as_ref()).await {
        return about_ok_with_source(default_memory_status(), "computed");
    }

    match db_get_memory_status(proxy.as_ref()).await {
        Ok(status) => about_ok_with_source(
            serde_json::json!({
                "strengthDistribution": status.strength_distribution,
                "urgentReviewCount": status.urgent_review_count,
                "soonReviewCount": status.soon_review_count,
                "stableCount": status.stable_count,
                "avgHalfLifeDays": status.avg_half_life_days,
                "todayConsolidationRate": status.today_consolidation_rate,
            }),
            "real",
        ),
        Err(_) => about_ok_with_source(default_memory_status(), "computed"),
    }
}

fn default_memory_status() -> serde_json::Value {
    serde_json::json!({
        "strengthDistribution": [
            { "range": "0-20%", "count": 0, "percentage": 0.0 },
            { "range": "20-40%", "count": 0, "percentage": 0.0 },
            { "range": "40-60%", "count": 0, "percentage": 0.0 },
            { "range": "60-80%", "count": 0, "percentage": 0.0 },
            { "range": "80-100%", "count": 0, "percentage": 0.0 }
        ],
        "urgentReviewCount": 0,
        "soonReviewCount": 0,
        "stableCount": 0,
        "avgHalfLifeDays": 0.0,
        "todayConsolidationRate": 0.0
    })
}

async fn stats_learning_mode_distribution(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "exam": 0.2,
            "daily": 0.5,
            "travel": 0.15,
            "custom": 0.15,
        }),
        "virtual",
    )
}

async fn stats_half_life_distribution(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "distribution": [
                { "range": "0-1天", "count": 120, "percentage": 15 },
                { "range": "1-3天", "count": 280, "percentage": 35 },
                { "range": "3-7天", "count": 200, "percentage": 25 },
                { "range": "7-14天", "count": 120, "percentage": 15 },
                { "range": "14+天", "count": 80, "percentage": 10 }
            ],
            "avgHalfLife": 4.2,
            "totalWords": 800,
        }),
        "virtual",
    )
}

async fn stats_algorithm_trend(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "thompson": [50, 52, 48, 55, 50, 53, 47, 51, 49, 50],
            "linucb": [55, 57, 53, 60, 55, 58, 52, 56, 54, 55],
            "heuristic": [35, 37, 33, 40, 35, 38, 32, 36, 34, 35],
            "coldstart": [30, 32, 28, 35, 30, 33, 27, 31, 29, 30],
        }),
        "virtual",
    )
}

async fn about_metrics(State(_state): State<AppState>) -> Response {
    about_ok(serde_json::json!({
        "decision": {
            "writeTotal": 0,
            "writeSuccess": 0,
            "writeFailed": 0,
        },
        "pipeline": {
            "activeConnections": store().connections.load(Ordering::Relaxed),
        }
    }))
}

async fn about_metrics_prometheus(State(_state): State<AppState>) -> Response {
    let connections = store().connections.load(Ordering::Relaxed) as f64;
    let body = format!(
        "# HELP about_sse_connections Number of active SSE connections\n# TYPE about_sse_connections gauge\nabout_sse_connections {connections}\n"
    );
    let mut response = Response::new(Body::from(body));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
}

async fn feature_flags(State(state): State<AppState>) -> Response {
    let has_db = state.db_proxy().is_some();

    // Get real feature flags from AMAS engine config
    let amas_flags = state.amas_engine().get_config().await.feature_flags;

    let source = if has_db { "real" } else { "computed" };

    about_ok_with_source(serde_json::json!({
        "readEnabled": has_db,
        "writeEnabled": false,
        "flags": {
            "ensemble": { "enabled": amas_flags.ensemble_enabled, "status": if amas_flags.ensemble_enabled { "healthy" } else { "disabled" } },
            "thompsonSampling": { "enabled": amas_flags.thompson_enabled, "status": if amas_flags.thompson_enabled { "healthy" } else { "disabled" } },
            "linucb": { "enabled": amas_flags.linucb_enabled, "status": if amas_flags.linucb_enabled { "healthy" } else { "disabled" } },
            "heuristicBaseline": { "enabled": amas_flags.heuristic_enabled, "status": if amas_flags.heuristic_enabled { "healthy" } else { "disabled" } },
            "actrMemory": { "enabled": amas_flags.actr_memory_enabled, "status": if amas_flags.actr_memory_enabled { "healthy" } else { "disabled" } },
            "coldStartManager": { "enabled": true, "status": "healthy" },
            "userParamsManager": { "enabled": true, "status": "healthy" },
            "trendAnalyzer": { "enabled": true, "status": "healthy" },
            "bayesianOptimizer": { "enabled": amas_flags.bayesian_optimizer_enabled, "status": if amas_flags.bayesian_optimizer_enabled { "healthy" } else { "disabled" } },
            "causalInference": { "enabled": amas_flags.causal_inference_enabled, "status": if amas_flags.causal_inference_enabled { "healthy" } else { "disabled" } },
            "delayedReward": { "enabled": true, "status": "healthy" },
            "realDataWrite": { "enabled": false, "status": "disabled" },
            "realDataRead": { "enabled": has_db, "status": if has_db { "healthy" } else { "disabled" } },
            "visualization": { "enabled": true, "status": "healthy" }
        }
    }), source)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModuleHealthStatus {
    enabled: bool,
    status: &'static str,
    last_activity: Option<String>,
    latency_ms: Option<i64>,
    error_rate: Option<f64>,
    call_count: Option<i64>,
}

async fn module_health_check(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return about_ok_with_source(serde_json::json!({
            "flags": default_module_health(false),
            "checkedAt": now_iso()
        }), "computed");
    };

    let pool = proxy.pool();
    let now = chrono::Utc::now();

    // Active probing: actually call module functions and check responses
    let cold_start = probe_coldstart_health().await;
    let user_params = probe_user_params_health(pool).await;
    let trend_analyzer = probe_trend_analyzer_health(pool).await;
    let delayed_reward = probe_delayed_reward_health(pool).await;
    let bayesian = probe_bayesian_health(pool).await;
    let (ensemble, thompson, linucb, heuristic, actr) = probe_algorithm_health(pool).await;

    // Causal inference - not implemented
    let causal = ModuleHealthStatus {
        enabled: false,
        status: "disabled",
        last_activity: None,
        latency_ms: None,
        error_rate: None,
        call_count: None,
    };

    about_ok_with_source(serde_json::json!({
        "flags": {
            "ensemble": ensemble,
            "thompsonSampling": thompson,
            "linucb": linucb,
            "heuristicBaseline": heuristic,
            "actrMemory": actr,
            "coldStartManager": cold_start,
            "userParamsManager": user_params,
            "trendAnalyzer": trend_analyzer,
            "bayesianOptimizer": bayesian,
            "causalInference": causal,
            "delayedReward": delayed_reward,
            "realDataWrite": { "enabled": false, "status": "disabled" },
            "realDataRead": { "enabled": true, "status": "healthy" },
            "visualization": { "enabled": true, "status": "healthy" }
        },
        "checkedAt": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }), "real")
}

async fn probe_coldstart_health() -> ModuleHealthStatus {
    use crate::amas::config::AMASConfig;
    use crate::amas::decision::coldstart::ColdStartManager;

    let start = std::time::Instant::now();
    let config = AMASConfig::from_env().cold_start;
    let mut manager = ColdStartManager::new(config);

    // Probe: call update with test data, expect valid strategy
    let result = manager.update(0.7, 3000);
    let latency = start.elapsed().as_millis() as i64;

    match result {
        Some(strategy) if strategy.batch_size > 0 => ModuleHealthStatus {
            enabled: true,
            status: "healthy",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
        _ => ModuleHealthStatus {
            enabled: true,
            status: "warning",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
    }
}

async fn probe_user_params_health(pool: &sqlx::PgPool) -> ModuleHealthStatus {
    let start = std::time::Instant::now();

    // Probe: try to query amas_user_states table
    let result: Result<Option<(i64,)>, _> = sqlx::query_as(
        r#"SELECT COUNT(*) FROM "amas_user_states" LIMIT 1"#
    )
    .fetch_optional(pool)
    .await;

    let latency = start.elapsed().as_millis() as i64;

    match result {
        Ok(_) => ModuleHealthStatus {
            enabled: true,
            status: "healthy",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
        Err(_) => ModuleHealthStatus {
            enabled: true,
            status: "error",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
    }
}

async fn probe_trend_analyzer_health(pool: &sqlx::PgPool) -> ModuleHealthStatus {
    let start = std::time::Instant::now();

    // Probe: try to query learning history for trend calculation
    let result: Result<Vec<(f64,)>, _> = sqlx::query_as(
        r#"SELECT COALESCE(motivation, 0.0) FROM "amas_user_states" LIMIT 5"#
    )
    .fetch_all(pool)
    .await;

    let latency = start.elapsed().as_millis() as i64;

    match result {
        Ok(_) => ModuleHealthStatus {
            enabled: true,
            status: "healthy",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
        Err(_) => ModuleHealthStatus {
            enabled: true,
            status: "error",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
    }
}

async fn probe_delayed_reward_health(pool: &sqlx::PgPool) -> ModuleHealthStatus {
    let start = std::time::Instant::now();

    // Probe: check queue status and pending count
    let result: Result<Option<(i64, i64)>, _> = sqlx::query_as(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE status = 'DONE'::"RewardStatus") as done_count,
            COUNT(*) FILTER (WHERE status = 'PENDING'::"RewardStatus") as pending_count
        FROM "reward_queue"
        WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
        "#
    )
    .fetch_optional(pool)
    .await;

    let latency = start.elapsed().as_millis() as i64;

    match result {
        Ok(Some((done, pending))) => {
            let status = if done > 0 || pending < 100 {
                "healthy"
            } else if pending >= 100 {
                "warning" // Queue backlog
            } else {
                "warning"
            };
            ModuleHealthStatus {
                enabled: true,
                status,
                last_activity: Some(now_iso()),
                latency_ms: Some(latency),
                error_rate: None,
                call_count: Some(done + pending),
            }
        }
        Ok(None) => ModuleHealthStatus {
            enabled: true,
            status: "healthy",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: Some(0),
        },
        Err(_) => ModuleHealthStatus {
            enabled: true,
            status: "error",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
    }
}

async fn probe_bayesian_health(pool: &sqlx::PgPool) -> ModuleHealthStatus {
    let enabled = std::env::var("ENABLE_BAYESIAN_OPTIMIZER")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
        || std::env::var("AMAS_BAYESIAN_ENABLED")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

    if !enabled {
        return ModuleHealthStatus {
            enabled: false,
            status: "disabled",
            last_activity: None,
            latency_ms: None,
            error_rate: None,
            call_count: None,
        };
    }

    let start = std::time::Instant::now();

    // Probe: check optimization_event table accessibility and recent events
    let result: Result<Option<(i64, Option<chrono::DateTime<chrono::Utc>>)>, _> = sqlx::query_as(
        r#"
        SELECT COUNT(*)::bigint as cnt, MAX("timestamp") as last_run
        FROM "optimization_event"
        WHERE "timestamp" >= NOW() - INTERVAL '7 days'
        "#
    )
    .fetch_optional(pool)
    .await;

    let latency = start.elapsed().as_millis() as i64;

    match result {
        Ok(Some((count, last_run))) => {
            let status = if count > 0 { "healthy" } else { "warning" };
            ModuleHealthStatus {
                enabled: true,
                status,
                last_activity: last_run.map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
                latency_ms: Some(latency),
                error_rate: None,
                call_count: Some(count),
            }
        }
        Ok(None) => ModuleHealthStatus {
            enabled: true,
            status: "warning",
            last_activity: None,
            latency_ms: Some(latency),
            error_rate: None,
            call_count: Some(0),
        },
        Err(_) => ModuleHealthStatus {
            enabled: true,
            status: "error",
            last_activity: Some(now_iso()),
            latency_ms: Some(latency),
            error_rate: None,
            call_count: None,
        },
    }
}

async fn probe_algorithm_health(_pool: &sqlx::PgPool) -> (ModuleHealthStatus, ModuleHealthStatus, ModuleHealthStatus, ModuleHealthStatus, ModuleHealthStatus) {
    use crate::amas::config::AMASConfig;
    use crate::amas::decision::ensemble::EnsembleDecision;
    use crate::amas::decision::heuristic::HeuristicLearner;
    use crate::amas::decision::thompson::ThompsonSamplingModel;
    use crate::amas::types::{FeatureVector, StrategyParams, UserState};

    let config = AMASConfig::from_env();
    let amas_flags = config.feature_flags.clone();

    // Create test data using Default
    let test_state = UserState::default();
    let test_feature = FeatureVector::new(vec![0.5; 10], vec!["test".to_string(); 10]);
    let test_strategy = StrategyParams::default();
    let candidates = vec![test_strategy.clone()];

    // 1. Probe Heuristic
    let heuristic_status = {
        let start = std::time::Instant::now();
        let heuristic = HeuristicLearner::default();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            heuristic.suggest(&test_state, &test_strategy)
        }));
        let latency = start.elapsed().as_millis() as i64;

        if !amas_flags.heuristic_enabled {
            ModuleHealthStatus {
                enabled: false,
                status: "disabled",
                last_activity: None,
                latency_ms: None,
                error_rate: None,
                call_count: None,
            }
        } else {
            match result {
                Ok(strategy) if strategy.batch_size > 0 => ModuleHealthStatus {
                    enabled: true,
                    status: "healthy",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
                _ => ModuleHealthStatus {
                    enabled: true,
                    status: "error",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
            }
        }
    };

    // 2. Probe Thompson Sampling
    let thompson_status = {
        let start = std::time::Instant::now();
        let mut thompson = ThompsonSamplingModel::new(1.0, 1.0);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            thompson.select_action(&test_state, &test_feature, &candidates)
        }));
        let latency = start.elapsed().as_millis() as i64;

        if !amas_flags.thompson_enabled {
            ModuleHealthStatus {
                enabled: false,
                status: "disabled",
                last_activity: None,
                latency_ms: None,
                error_rate: None,
                call_count: None,
            }
        } else {
            match result {
                Ok(Some(_)) => ModuleHealthStatus {
                    enabled: true,
                    status: "healthy",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
                _ => ModuleHealthStatus {
                    enabled: true,
                    status: "error",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
            }
        }
    };

    // 3. Probe LinUCB (uses registry metrics as proxy since native module is separate)
    let linucb_status = {
        let start = std::time::Instant::now();
        let metrics = registry().get(crate::amas::metrics::AlgorithmId::LinUCB);
        let latency = start.elapsed().as_millis() as i64;

        if !amas_flags.linucb_enabled {
            ModuleHealthStatus {
                enabled: false,
                status: "disabled",
                last_activity: None,
                latency_ms: None,
                error_rate: None,
                call_count: None,
            }
        } else {
            match metrics {
                Some(m) => {
                    let is_healthy = m.error_count() == 0 || m.call_count() > m.error_count() * 10;
                    ModuleHealthStatus {
                        enabled: true,
                        status: if is_healthy { "healthy" } else { "warning" },
                        last_activity: Some(now_iso()),
                        latency_ms: Some(latency),
                        error_rate: if m.call_count() > 0 {
                            Some(m.error_count() as f64 / m.call_count() as f64)
                        } else {
                            None
                        },
                        call_count: Some(m.call_count() as i64),
                    }
                }
                None => ModuleHealthStatus {
                    enabled: true,
                    status: "error",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
            }
        }
    };

    // 4. Probe Ensemble
    let ensemble_status = {
        let start = std::time::Instant::now();
        let decider = EnsembleDecision::new(amas_flags.clone());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            decider.decide(&test_state, &test_feature, &test_strategy, Some(&test_strategy), Some(&test_strategy))
        }));
        let latency = start.elapsed().as_millis() as i64;

        if !amas_flags.ensemble_enabled {
            ModuleHealthStatus {
                enabled: false,
                status: "disabled",
                last_activity: None,
                latency_ms: None,
                error_rate: None,
                call_count: None,
            }
        } else {
            match result {
                Ok((strategy, candidates)) if strategy.batch_size > 0 && !candidates.is_empty() => ModuleHealthStatus {
                    enabled: true,
                    status: "healthy",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
                _ => ModuleHealthStatus {
                    enabled: true,
                    status: "error",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
            }
        }
    };

    // 5. Probe ACT-R Memory (uses registry metrics)
    let actr_status = {
        let start = std::time::Instant::now();
        let metrics = registry().get(crate::amas::metrics::AlgorithmId::ActrMemory);
        let latency = start.elapsed().as_millis() as i64;

        if !amas_flags.actr_memory_enabled {
            ModuleHealthStatus {
                enabled: false,
                status: "disabled",
                last_activity: None,
                latency_ms: None,
                error_rate: None,
                call_count: None,
            }
        } else {
            match metrics {
                Some(m) => {
                    let is_healthy = m.error_count() == 0 || m.call_count() > m.error_count() * 10;
                    ModuleHealthStatus {
                        enabled: true,
                        status: if is_healthy { "healthy" } else { "warning" },
                        last_activity: Some(now_iso()),
                        latency_ms: Some(latency),
                        error_rate: if m.call_count() > 0 {
                            Some(m.error_count() as f64 / m.call_count() as f64)
                        } else {
                            None
                        },
                        call_count: Some(m.call_count() as i64),
                    }
                }
                None => ModuleHealthStatus {
                    enabled: true,
                    status: "error",
                    last_activity: Some(now_iso()),
                    latency_ms: Some(latency),
                    error_rate: None,
                    call_count: None,
                },
            }
        }
    };

    (ensemble_status, thompson_status, linucb_status, heuristic_status, actr_status)
}

fn default_module_health(has_db: bool) -> serde_json::Value {
    serde_json::json!({
        "ensemble": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "thompsonSampling": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "linucb": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "heuristicBaseline": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "actrMemory": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "coldStartManager": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "userParamsManager": { "enabled": true, "status": "healthy" },
        "trendAnalyzer": { "enabled": true, "status": "healthy" },
        "bayesianOptimizer": { "enabled": false, "status": "disabled" },
        "causalInference": { "enabled": false, "status": "disabled" },
        "delayedReward": { "enabled": true, "status": if has_db { "healthy" } else { "error" } },
        "realDataWrite": { "enabled": false, "status": "disabled" },
        "realDataRead": { "enabled": has_db, "status": if has_db { "healthy" } else { "disabled" } },
        "visualization": { "enabled": true, "status": "healthy" }
    })
}

async fn about_health(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return about_error(StatusCode::UNAUTHORIZED, "未提供认证令牌");
    };

    let Some(proxy) = state.db_proxy() else {
        return about_error(StatusCode::UNAUTHORIZED, "认证失败，请重新登录");
    };

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => return about_error(StatusCode::UNAUTHORIZED, "认证失败，请重新登录"),
    };

    let primary = proxy.primary_status().await;
    let db_healthy = primary.healthy;

    if user.role == "ADMIN" {
        return about_ok(serde_json::json!({
            "status": if db_healthy { "healthy" } else { "degraded" },
            "timestamp": now_iso(),
            "database": if db_healthy { "connected" } else { "disconnected" },
            "dataSource": "virtual",
            "features": { "writeEnabled": false, "readEnabled": false }
        }));
    }

    about_ok(serde_json::json!({
        "status": if db_healthy { "healthy" } else { "degraded" },
        "timestamp": now_iso(),
    }))
}

async fn decisions_stream(State(_state): State<AppState>) -> Response {
    let store = Arc::clone(store());
    seed_virtual_decisions(&store).await;

    let connections = store.connections.fetch_add(1, Ordering::SeqCst) + 1;
    let guard = ConnectionGuard {
        store: Arc::clone(&store),
    };

    let connected = futures_util::stream::once(async move {
        let payload = SseConnectedEvent {
            message: "SSE connection established".to_string(),
            timestamp: now_iso(),
            connections,
        };
        let json = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
        Ok(Event::default().event("connected").data(json))
    });

    let rx = store.sse_tx.subscribe();
    let decision_stream = BroadcastStream::new(rx).filter_map(|message| async {
        let Ok(event) = message else {
            return None;
        };
        let json = serde_json::to_string(&event).unwrap_or_else(|_| "{}".to_string());
        Some(Ok(Event::default().event("decision").data(json)))
    });

    let stream = connected
        .chain(decision_stream)
        .map(move |item: Result<Event, Infallible>| {
            let _ = &guard;
            item
        });

    let mut response = Sse::new(stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(30))
                .text("heartbeat"),
        )
        .into_response();

    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-cache"),
    );
    response.headers_mut().insert(
        header::CONNECTION,
        header::HeaderValue::from_static("keep-alive"),
    );
    response.headers_mut().insert(
        header::HeaderName::from_static("x-accel-buffering"),
        header::HeaderValue::from_static("no"),
    );

    response
}

struct ConnectionGuard {
    store: Arc<AboutStore>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.store.connections.fetch_sub(1, Ordering::SeqCst);
    }
}

async fn seed_virtual_decisions(store: &Arc<AboutStore>) {
    let needs_seed = { store.decisions.read().await.virtual_recent.is_empty() };
    if !needs_seed {
        return;
    }

    let mut guard = store.decisions.write().await;
    if !guard.virtual_recent.is_empty() {
        return;
    }

    let now = chrono::Utc::now();
    for idx in 0..10 {
        let decision_id = Uuid::new_v4().to_string();
        let timestamp = now
            .checked_sub_signed(chrono::Duration::minutes(idx * 3))
            .unwrap_or(now)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let pseudo_id = short_id(&decision_id);

        let strategy = RecentDecisionStrategy {
            difficulty: if idx % 3 == 0 {
                "easy".to_string()
            } else if idx % 3 == 1 {
                "mid".to_string()
            } else {
                "hard".to_string()
            },
            batch_size: 8 + (idx as i32 % 5),
        };

        let summary = RecentDecision {
            decision_id: decision_id.clone(),
            pseudo_id: pseudo_id.clone(),
            timestamp: timestamp.clone(),
            decision_source: if idx % 4 == 0 {
                "coldstart".to_string()
            } else {
                "ensemble".to_string()
            },
            strategy: strategy.clone(),
            dominant_factor: "注意力".to_string(),
        };

        guard.virtual_recent.push(summary.clone());

        guard.virtual_detail.insert(
            decision_id.clone(),
            DecisionDetail {
                decision_id,
                timestamp,
                pseudo_id,
                decision_source: summary.decision_source.clone(),
                coldstart_phase: None,
                confidence: 0.8,
                reward: None,
                total_duration_ms: None,
                strategy: StrategyParams {
                    interval_scale: 1.0,
                    new_ratio: 0.2,
                    difficulty: summary.strategy.difficulty.clone(),
                    batch_size: summary.strategy.batch_size,
                    hint_level: 1,
                },
                weights: HashMap::from([
                    ("thompson".to_string(), 0.4),
                    ("linucb".to_string(), 0.4),
                    ("heuristic".to_string(), 0.2),
                ]),
                member_votes: Vec::new(),
                pipeline: Vec::new(),
            },
        );
    }

    guard
        .virtual_recent
        .sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
}

async fn seed_pipeline(store: &Arc<AboutStore>) {
    let needs_seed = { store.pipeline.read().await.packets.is_empty() };
    if !needs_seed {
        return;
    }

    let mut pipeline = store.pipeline.write().await;
    if !pipeline.packets.is_empty() {
        return;
    }

    for idx in 0..4 {
        let packet_id = Uuid::new_v4().to_string();
        let created_at = now_ms().saturating_sub((idx as u64) * 5000);

        pipeline.packets.push(DataPacket {
            id: packet_id.clone(),
            current_stage: 1,
            current_node: "perception".to_string(),
            progress: (idx as u8) * 20,
            status: "normal".to_string(),
            fault_type: None,
            data: HashMap::from([
                ("attention".to_string(), 0.6),
                ("fatigue".to_string(), 0.3),
                ("motivation".to_string(), 0.2),
            ]),
            created_at,
        });

        pipeline.traces.insert(
            packet_id.clone(),
            PacketTrace {
                packet_id,
                status: "in_progress".to_string(),
                stages: vec![StageTrace {
                    stage: "perception".to_string(),
                    stage_name: "感知层".to_string(),
                    node_id: "perception".to_string(),
                    duration: 5,
                    input: "raw".to_string(),
                    output: "state".to_string(),
                    details: None,
                    timestamp: created_at,
                }],
                total_duration: 5,
            },
        );
    }
}

fn advance_pipeline(pipeline: &mut PipelineStore, seed: u64) {
    let bump = (seed % 17) as u8 + 3;
    for packet in &mut pipeline.packets {
        packet.progress = packet.progress.saturating_add(bump).min(100);
        if packet.progress >= 100 {
            packet.current_stage = (packet.current_stage % 6).saturating_add(1);
            packet.progress = 0;
            packet.current_node = match packet.current_stage {
                1 => "perception",
                2 => "model",
                3 => "learner",
                4 => "decision",
                5 => "eval",
                _ => "optim",
            }
            .to_string();
        }
    }
}

fn build_snapshot(pipeline: &PipelineStore) -> PipelineSnapshot {
    let now = now_ms();
    let mut node_states: HashMap<String, NodeState> = HashMap::new();
    for node in [
        "perception",
        "model",
        "learner",
        "decision",
        "eval",
        "optim",
    ] {
        node_states.insert(
            node.to_string(),
            NodeState {
                id: node.to_string(),
                status: "processing".to_string(),
                load: 0.4,
                processed_count: 1234,
                last_processed_at: now,
            },
        );
    }

    PipelineSnapshot {
        timestamp: now,
        current_packets: pipeline.packets.clone(),
        node_states,
        metrics: PipelineMetrics {
            throughput: 4.12,
            avg_latency: 12.0,
            active_packets: pipeline.packets.len() as u64,
            total_processed: 1234,
        },
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
