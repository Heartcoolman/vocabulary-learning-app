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

use crate::services::amas::StrategyParams;
use crate::state::AppState;

static ABOUT_STORE: OnceLock<Arc<AboutStore>> = OnceLock::new();

fn store() -> &'static Arc<AboutStore> {
    ABOUT_STORE.get_or_init(|| Arc::new(AboutStore::new()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/simulate", post(simulate))
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
    actr: f64,
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
            thompson: 0.20,
            linucb: 0.25,
            actr: 0.15,
            heuristic: 0.40,
        },
        "explore" => EnsembleWeights {
            thompson: 0.30,
            linucb: 0.35,
            actr: 0.20,
            heuristic: 0.15,
        },
        _ => EnsembleWeights {
            thompson: 0.25,
            linucb: 0.40,
            actr: 0.25,
            heuristic: 0.10,
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
        "actr".to_string(),
        MemberVote {
            action: format!("interval_scale:{:.2}", output_strategy.interval_scale),
            contribution: weights.actr,
            confidence: (input.conf * 0.85).clamp(0.0, 1.0),
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
            map.insert("actr".to_string(), simulation.decision_process.weights.actr);
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

async fn stats_overview(State(_state): State<AppState>) -> Response {
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

async fn stats_algorithm_distribution(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        AlgorithmDistribution {
            thompson: 0.25,
            linucb: 0.4,
            actr: 0.25,
            heuristic: 0.08,
            coldstart: 0.02,
        },
        "virtual",
    )
}

#[derive(Serialize)]
struct AlgorithmDistribution {
    thompson: f64,
    linucb: f64,
    actr: f64,
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
    State(_state): State<AppState>,
    Query(query): Query<MixedQuery>,
) -> Response {
    let store = store();
    seed_virtual_decisions(store).await;

    let mixed = matches!(query.mixed.as_deref(), Some("true" | "1" | "yes"));
    let virtual_recent = { store.decisions.read().await.virtual_recent.clone() };

    if mixed {
        return about_ok_with_source(
            MixedDecisions {
                real: Vec::new(),
                virtual_items: virtual_recent,
            },
            "mixed",
        );
    }

    about_ok_with_source(virtual_recent, "virtual")
}

async fn decision_detail(
    State(_state): State<AppState>,
    Path(decision_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let source = query.get("source").map(String::as_str);

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

    about_error(StatusCode::BAD_REQUEST, "真实决策详情需要启用真实数据源")
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

async fn system_pipeline_status(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "layers": [
                {
                    "id": "PERCEPTION",
                    "name": "Perception",
                    "nameCn": "感知层",
                    "processedCount": 1234,
                    "avgLatencyMs": 5,
                    "successRate": 0.99,
                    "status": "healthy",
                    "lastProcessedAt": now_iso(),
                },
                {
                    "id": "MODELING",
                    "name": "Modeling",
                    "nameCn": "建模层",
                    "processedCount": 1234,
                    "avgLatencyMs": 8,
                    "successRate": 0.98,
                    "status": "healthy",
                    "lastProcessedAt": now_iso(),
                },
                {
                    "id": "LEARNING",
                    "name": "Learning",
                    "nameCn": "学习层",
                    "processedCount": 1234,
                    "avgLatencyMs": 12,
                    "successRate": 0.97,
                    "status": "healthy",
                    "lastProcessedAt": now_iso(),
                },
                {
                    "id": "DECISION",
                    "name": "Decision",
                    "nameCn": "决策层",
                    "processedCount": 1234,
                    "avgLatencyMs": 6,
                    "successRate": 0.99,
                    "status": "healthy",
                    "lastProcessedAt": now_iso(),
                },
                {
                    "id": "EVALUATION",
                    "name": "Evaluation",
                    "nameCn": "评估层",
                    "processedCount": 800,
                    "avgLatencyMs": 15,
                    "successRate": 0.95,
                    "status": "healthy",
                    "lastProcessedAt": now_iso(),
                },
                {
                    "id": "OPTIMIZATION",
                    "name": "Optimization",
                    "nameCn": "优化层",
                    "processedCount": 50,
                    "avgLatencyMs": 100,
                    "successRate": 1.0,
                    "status": "healthy",
                    "lastProcessedAt": now_iso(),
                },
            ],
            "totalThroughput": 4.12,
            "systemHealth": "healthy",
        }),
        "virtual",
    )
}

async fn system_algorithm_status(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "algorithms": [
                {
                    "id": "thompson",
                    "name": "Thompson Sampling",
                    "weight": 0.25,
                    "callCount": 320,
                    "avgLatencyMs": 8,
                    "explorationRate": 0.15,
                    "lastCalledAt": now_iso(),
                },
                {
                    "id": "linucb",
                    "name": "LinUCB",
                    "weight": 0.4,
                    "callCount": 512,
                    "avgLatencyMs": 12,
                    "explorationRate": 0.12,
                    "lastCalledAt": now_iso(),
                },
                {
                    "id": "actr",
                    "name": "ACT-R Memory",
                    "weight": 0.25,
                    "callCount": 320,
                    "avgLatencyMs": 6,
                    "explorationRate": 0.08,
                    "lastCalledAt": now_iso(),
                },
                {
                    "id": "heuristic",
                    "name": "Heuristic Rules",
                    "weight": 0.1,
                    "callCount": 128,
                    "avgLatencyMs": 2,
                    "explorationRate": 0.05,
                    "lastCalledAt": now_iso(),
                },
            ],
            "ensembleConsensusRate": 0.82,
            "coldstartStats": {
                "classifyCount": 15,
                "exploreCount": 8,
                "normalCount": 1200,
                "userTypeDistribution": { "fast": 0.35, "stable": 0.45, "cautious": 0.2 }
            }
        }),
        "virtual",
    )
}

async fn system_user_state_status(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "distributions": {
                "attention": { "avg": 0.65, "low": 0.15, "medium": 0.55, "high": 0.3, "lowAlertCount": 3 },
                "fatigue": { "avg": 0.35, "fresh": 0.4, "normal": 0.45, "tired": 0.15, "highAlertCount": 2 },
                "motivation": { "avg": 0.25, "frustrated": 0.1, "neutral": 0.5, "motivated": 0.4, "lowAlertCount": 1 },
                "cognitive": { "memory": 0.6, "speed": 0.55, "stability": 0.7 }
            },
            "recentInferences": [
                {
                    "id": "a1b2c3d4",
                    "timestamp": now_iso(),
                    "attention": 0.72,
                    "fatigue": 0.28,
                    "motivation": 0.45,
                    "confidence": 0.88
                },
                {
                    "id": "e5f6g7h8",
                    "timestamp": chrono::Utc::now().checked_sub_signed(chrono::Duration::seconds(30)).unwrap_or_else(chrono::Utc::now).to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                    "attention": 0.58,
                    "fatigue": 0.42,
                    "motivation": 0.15,
                    "confidence": 0.82
                }
            ],
            "modelParams": {
                "attention": { "beta": 0.85, "weights": { "rt_mean": 0.25, "rt_cv": 0.35, "pause": 0.15, "focus_loss": 0.5 } },
                "fatigue": { "decayK": 0.08, "longBreakThreshold": 30 },
                "motivation": { "rho": 0.85, "kappa": 0.3, "lambda": 0.4 }
            }
        }),
        "virtual",
    )
}

async fn system_memory_status(State(_state): State<AppState>) -> Response {
    about_ok_with_source(
        serde_json::json!({
            "strengthDistribution": [
                { "range": "0-20%", "count": 150, "percentage": 7.5 },
                { "range": "20-40%", "count": 300, "percentage": 15.0 },
                { "range": "40-60%", "count": 600, "percentage": 30.0 },
                { "range": "60-80%", "count": 650, "percentage": 32.5 },
                { "range": "80-100%", "count": 300, "percentage": 15.0 }
            ],
            "urgentReviewCount": 45,
            "soonReviewCount": 120,
            "stableCount": 1835,
            "avgHalfLifeDays": 3.2,
            "todayConsolidationRate": 78.5
        }),
        "virtual",
    )
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
            "actr": [45, 47, 43, 50, 45, 48, 42, 46, 44, 45],
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

async fn feature_flags(State(_state): State<AppState>) -> Response {
    about_ok(serde_json::json!({
        "readEnabled": false,
        "writeEnabled": false,
        "flags": {
            "ensemble": { "enabled": true, "status": "healthy", "latencyMs": 0, "callCount": 0 },
            "thompsonSampling": { "enabled": true, "status": "healthy" },
            "heuristicBaseline": { "enabled": true, "status": "healthy" },
            "actrMemory": { "enabled": true, "status": "healthy" },
            "coldStartManager": { "enabled": true, "status": "healthy" },
            "userParamsManager": { "enabled": true, "status": "healthy" },
            "trendAnalyzer": { "enabled": true, "status": "healthy" },
            "bayesianOptimizer": { "enabled": false, "status": "error" },
            "causalInference": { "enabled": false, "status": "error" },
            "delayedReward": { "enabled": false, "status": "error" },
            "realDataWrite": { "enabled": false, "status": "error" },
            "realDataRead": { "enabled": false, "status": "error" },
            "visualization": { "enabled": true, "status": "healthy" }
        }
    }))
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
                    ("thompson".to_string(), 0.25),
                    ("linucb".to_string(), 0.4),
                    ("actr".to_string(), 0.25),
                    ("heuristic".to_string(), 0.1),
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
