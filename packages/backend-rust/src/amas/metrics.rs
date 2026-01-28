use std::collections::HashMap;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::RwLock;

static REGISTRY: OnceLock<Arc<AlgorithmRegistry>> = OnceLock::new();

pub fn registry() -> &'static Arc<AlgorithmRegistry> {
    REGISTRY.get_or_init(|| Arc::new(AlgorithmRegistry::new()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AlgorithmId {
    // Decision Layer
    Thompson,
    LinUCB,
    Heuristic,
    // Modeling Layer
    AttentionMonitor,
    FatigueEstimator,
    CognitiveProfiler,
    MotivationTracker,
    TrendAnalyzer,
    // Memory Layer
    ActrMemory,
    Fsrs,
    // Management
    ColdStartManager,
}

impl AlgorithmId {
    pub fn all() -> &'static [AlgorithmId] {
        &[
            AlgorithmId::Thompson,
            AlgorithmId::LinUCB,
            AlgorithmId::Heuristic,
            AlgorithmId::AttentionMonitor,
            AlgorithmId::FatigueEstimator,
            AlgorithmId::CognitiveProfiler,
            AlgorithmId::MotivationTracker,
            AlgorithmId::TrendAnalyzer,
            AlgorithmId::ActrMemory,
            AlgorithmId::Fsrs,
            AlgorithmId::ColdStartManager,
        ]
    }

    pub fn id(&self) -> &'static str {
        match self {
            AlgorithmId::Thompson => "thompson",
            AlgorithmId::LinUCB => "linucb",
            AlgorithmId::Heuristic => "heuristic",
            AlgorithmId::AttentionMonitor => "attention_monitor",
            AlgorithmId::FatigueEstimator => "fatigue_estimator",
            AlgorithmId::CognitiveProfiler => "cognitive_profiler",
            AlgorithmId::MotivationTracker => "motivation_tracker",
            AlgorithmId::TrendAnalyzer => "trend_analyzer",
            AlgorithmId::ActrMemory => "actr_memory",
            AlgorithmId::Fsrs => "fsrs",
            AlgorithmId::ColdStartManager => "coldstart_manager",
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            AlgorithmId::Thompson => "Thompson Sampling",
            AlgorithmId::LinUCB => "LinUCB",
            AlgorithmId::Heuristic => "Heuristic Rules",
            AlgorithmId::AttentionMonitor => "Attention Monitor",
            AlgorithmId::FatigueEstimator => "Fatigue Estimator",
            AlgorithmId::CognitiveProfiler => "Cognitive Profiler",
            AlgorithmId::MotivationTracker => "Motivation Tracker",
            AlgorithmId::TrendAnalyzer => "Trend Analyzer",
            AlgorithmId::ActrMemory => "ACT-R Memory",
            AlgorithmId::Fsrs => "FSRS",
            AlgorithmId::ColdStartManager => "ColdStart Manager",
        }
    }

    pub fn layer(&self) -> &'static str {
        match self {
            AlgorithmId::Thompson | AlgorithmId::LinUCB | AlgorithmId::Heuristic => "decision",
            AlgorithmId::AttentionMonitor
            | AlgorithmId::FatigueEstimator
            | AlgorithmId::CognitiveProfiler
            | AlgorithmId::MotivationTracker
            | AlgorithmId::TrendAnalyzer => "modeling",
            AlgorithmId::ActrMemory | AlgorithmId::Fsrs => "memory",
            AlgorithmId::ColdStartManager => "management",
        }
    }

    pub fn default_weight(&self) -> f64 {
        match self {
            AlgorithmId::Thompson => 0.4,
            AlgorithmId::LinUCB => 0.4,
            AlgorithmId::Heuristic => 0.2,
            _ => 0.0,
        }
    }

    pub fn default_exploration_rate(&self) -> f64 {
        match self {
            AlgorithmId::Thompson => 0.15,
            AlgorithmId::LinUCB => 0.1,
            AlgorithmId::Heuristic => 0.05,
            _ => 0.0,
        }
    }
}

impl FromStr for AlgorithmId {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "thompson" => Ok(AlgorithmId::Thompson),
            "linucb" => Ok(AlgorithmId::LinUCB),
            "heuristic" => Ok(AlgorithmId::Heuristic),
            "attention_monitor" => Ok(AlgorithmId::AttentionMonitor),
            "fatigue_estimator" => Ok(AlgorithmId::FatigueEstimator),
            "cognitive_profiler" => Ok(AlgorithmId::CognitiveProfiler),
            "motivation_tracker" => Ok(AlgorithmId::MotivationTracker),
            "trend_analyzer" => Ok(AlgorithmId::TrendAnalyzer),
            "actr_memory" => Ok(AlgorithmId::ActrMemory),
            "fsrs" => Ok(AlgorithmId::Fsrs),
            "coldstart_manager" => Ok(AlgorithmId::ColdStartManager),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct AlgorithmMetricsSnapshot {
    pub call_count: u64,
    pub total_latency_us: u64,
    pub error_count: u64,
    pub last_called_at: Option<u64>,
}

#[derive(Debug, Default)]
pub struct AlgorithmMetrics {
    call_count: AtomicU64,
    total_latency_us: AtomicU64,
    error_count: AtomicU64,
    last_called_at: AtomicU64,
}

impl AlgorithmMetrics {
    pub fn record_call(&self, latency_us: u64) {
        self.call_count.fetch_add(1, Ordering::Relaxed);
        self.total_latency_us
            .fetch_add(latency_us, Ordering::Relaxed);
        self.last_called_at.store(now_ms(), Ordering::Relaxed);
    }

    pub fn record_error(&self) {
        self.error_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn call_count(&self) -> u64 {
        self.call_count.load(Ordering::Relaxed)
    }

    pub fn total_latency_us(&self) -> u64 {
        self.total_latency_us.load(Ordering::Relaxed)
    }

    pub fn avg_latency_ms(&self) -> f64 {
        let calls = self.call_count.load(Ordering::Relaxed);
        if calls == 0 {
            return 0.0;
        }
        let total_us = self.total_latency_us.load(Ordering::Relaxed);
        let avg = (total_us as f64 / calls as f64) / 1000.0;
        (avg * 10000.0).round() / 10000.0
    }

    pub fn error_count(&self) -> u64 {
        self.error_count.load(Ordering::Relaxed)
    }

    pub fn last_called_at(&self) -> Option<u64> {
        let ts = self.last_called_at.load(Ordering::Relaxed);
        if ts == 0 {
            None
        } else {
            Some(ts)
        }
    }

    pub fn snapshot(&self) -> AlgorithmMetricsSnapshot {
        AlgorithmMetricsSnapshot {
            call_count: self.call_count(),
            total_latency_us: self.total_latency_us(),
            error_count: self.error_count(),
            last_called_at: self.last_called_at(),
        }
    }

    pub fn apply_snapshot(&self, snapshot: AlgorithmMetricsSnapshot) {
        self.call_count
            .store(snapshot.call_count, Ordering::Relaxed);
        self.total_latency_us
            .store(snapshot.total_latency_us, Ordering::Relaxed);
        self.error_count
            .store(snapshot.error_count, Ordering::Relaxed);
        self.last_called_at
            .store(snapshot.last_called_at.unwrap_or(0), Ordering::Relaxed);
    }

    pub fn is_active(&self) -> bool {
        let last = self.last_called_at.load(Ordering::Relaxed);
        if last == 0 {
            return false;
        }
        let now = now_ms();
        now.saturating_sub(last) < 300_000 // Active if called within 5 minutes
    }
}

pub struct AlgorithmRegistry {
    metrics: HashMap<AlgorithmId, AlgorithmMetrics>,
    enabled: RwLock<HashMap<AlgorithmId, bool>>,
}

impl Default for AlgorithmRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl AlgorithmRegistry {
    pub fn new() -> Self {
        let mut metrics = HashMap::new();
        let mut enabled = HashMap::new();
        for id in AlgorithmId::all() {
            metrics.insert(*id, AlgorithmMetrics::default());
            enabled.insert(*id, true);
        }
        Self {
            metrics,
            enabled: RwLock::new(enabled),
        }
    }

    pub fn record(&self, id: AlgorithmId, latency_us: u64) {
        if let Some(m) = self.metrics.get(&id) {
            m.record_call(latency_us);
        }
    }

    pub fn record_error(&self, id: AlgorithmId) {
        if let Some(m) = self.metrics.get(&id) {
            m.record_error();
        }
    }

    pub fn get(&self, id: AlgorithmId) -> Option<&AlgorithmMetrics> {
        self.metrics.get(&id)
    }

    pub async fn set_enabled(&self, id: AlgorithmId, enabled: bool) {
        let mut guard = self.enabled.write().await;
        guard.insert(id, enabled);
    }

    pub async fn is_enabled(&self, id: AlgorithmId) -> bool {
        let guard = self.enabled.read().await;
        guard.get(&id).copied().unwrap_or(true)
    }

    pub fn snapshot(&self) -> Vec<AlgorithmStatus> {
        AlgorithmId::all()
            .iter()
            .map(|id| {
                let m = self.metrics.get(id).unwrap();
                let calls = m.call_count();
                let is_active = m.is_active();
                let status = if calls == 0 {
                    "idle"
                } else if is_active {
                    "healthy"
                } else {
                    "inactive"
                };
                AlgorithmStatus {
                    id: id.id().to_string(),
                    name: id.name().to_string(),
                    layer: id.layer().to_string(),
                    weight: id.default_weight(),
                    call_count: calls,
                    avg_latency_ms: m.avg_latency_ms(),
                    exploration_rate: id.default_exploration_rate(),
                    error_count: m.error_count(),
                    last_called_at: m.last_called_at(),
                    is_active,
                    status: status.to_string(),
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlgorithmStatus {
    pub id: String,
    pub name: String,
    pub layer: String,
    pub weight: f64,
    pub call_count: u64,
    pub avg_latency_ms: f64,
    pub exploration_rate: f64,
    pub error_count: u64,
    pub last_called_at: Option<u64>,
    pub is_active: bool,
    pub status: String,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[macro_export]
macro_rules! track_algorithm {
    ($id:expr, $body:expr) => {{
        let start = std::time::Instant::now();
        let result = $body;
        let latency_us = start.elapsed().as_micros() as u64;
        $crate::amas::metrics::registry().record($id, latency_us);
        result
    }};
}
