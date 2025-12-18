use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizationStat {
    pub mean: f64,
    pub std_dev: f64,
}

impl Default for NormalizationStat {
    fn default() -> Self {
        Self {
            mean: 0.5,
            std_dev: 0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerceptionConfig {
    pub rt: NormalizationStat,
    pub pause: NormalizationStat,
    pub focus_loss: NormalizationStat,
    pub switches: NormalizationStat,
    pub dwell: NormalizationStat,
    pub interaction_density: NormalizationStat,
    pub max_response_time: i64,
    pub max_pause_count: i32,
    pub max_switch_count: i32,
    pub max_focus_loss: i64,
}

impl Default for PerceptionConfig {
    fn default() -> Self {
        Self {
            rt: NormalizationStat { mean: 3000.0, std_dev: 1500.0 },
            pause: NormalizationStat { mean: 2.0, std_dev: 2.0 },
            focus_loss: NormalizationStat { mean: 5000.0, std_dev: 3000.0 },
            switches: NormalizationStat { mean: 1.0, std_dev: 1.0 },
            dwell: NormalizationStat { mean: 8000.0, std_dev: 4000.0 },
            interaction_density: NormalizationStat { mean: 0.5, std_dev: 0.2 },
            max_response_time: 30000,
            max_pause_count: 10,
            max_switch_count: 5,
            max_focus_loss: 60000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttentionWeights {
    pub rt_mean: f64,
    pub rt_cv: f64,
    pub pace_cv: f64,
    pub pause: f64,
    pub switch: f64,
    pub drift: f64,
    pub interaction: f64,
    pub focus_loss: f64,
}

impl Default for AttentionWeights {
    fn default() -> Self {
        Self {
            rt_mean: 0.20,
            rt_cv: 0.15,
            pace_cv: 0.10,
            pause: 0.15,
            switch: 0.10,
            drift: 0.10,
            interaction: 0.10,
            focus_loss: 0.10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FatigueParams {
    pub beta: f64,
    pub gamma: f64,
    pub delta: f64,
    pub k: f64,
    pub long_break_threshold: f64,
}

impl Default for FatigueParams {
    fn default() -> Self {
        Self {
            beta: 0.3,
            gamma: 0.3,
            delta: 0.2,
            k: 0.05,
            long_break_threshold: 30.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotivationParams {
    pub rho: f64,
    pub kappa: f64,
    pub lambda: f64,
    pub mu: f64,
}

impl Default for MotivationParams {
    fn default() -> Self {
        Self {
            rho: 0.9,
            kappa: 0.1,
            lambda: 0.15,
            mu: 0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveParams {
    pub memory_alpha: f64,
    pub speed_baseline_ms: f64,
    pub stability_window: usize,
}

impl Default for CognitiveParams {
    fn default() -> Self {
        Self {
            memory_alpha: 0.1,
            speed_baseline_ms: 3000.0,
            stability_window: 20,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendParams {
    pub window_size: usize,
    pub up_threshold: f64,
    pub down_threshold: f64,
    pub stuck_variance_threshold: f64,
}

impl Default for TrendParams {
    fn default() -> Self {
        Self {
            window_size: 30,
            up_threshold: 0.05,
            down_threshold: -0.05,
            stuck_variance_threshold: 0.01,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColdStartConfig {
    pub classify_samples: i32,
    pub explore_samples: i32,
    pub probe_sequence: Vec<i32>,
}

impl Default for ColdStartConfig {
    fn default() -> Self {
        Self {
            classify_samples: 5,
            explore_samples: 10,
            probe_sequence: vec![0, 1, 2, 0, 1, 2],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanditConfig {
    pub alpha: f64,
    pub context_dim: usize,
    pub action_count: usize,
    pub exploration_bonus: f64,
}

impl Default for BanditConfig {
    fn default() -> Self {
        Self {
            alpha: 0.1,
            context_dim: 8,
            action_count: 48,
            exploration_bonus: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardConfig {
    pub accuracy_weight: f64,
    pub speed_weight: f64,
    pub stability_weight: f64,
    pub retention_weight: f64,
}

impl Default for RewardConfig {
    fn default() -> Self {
        Self {
            accuracy_weight: 0.4,
            speed_weight: 0.2,
            stability_weight: 0.2,
            retention_weight: 0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlags {
    pub ensemble_enabled: bool,
    pub thompson_enabled: bool,
    pub heuristic_enabled: bool,
    pub causal_inference_enabled: bool,
    pub bayesian_optimizer_enabled: bool,
    pub actr_memory_enabled: bool,
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            ensemble_enabled: true,
            thompson_enabled: true,
            heuristic_enabled: true,
            causal_inference_enabled: false,
            bayesian_optimizer_enabled: false,
            actr_memory_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AMASConfig {
    pub perception: PerceptionConfig,
    pub attention_weights: AttentionWeights,
    pub fatigue: FatigueParams,
    pub motivation: MotivationParams,
    pub cognitive: CognitiveParams,
    pub trend: TrendParams,
    pub cold_start: ColdStartConfig,
    pub bandit: BanditConfig,
    pub reward: RewardConfig,
    pub feature_flags: FeatureFlags,
    pub attention_smoothing: f64,
    pub confidence_decay: f64,
    pub min_confidence: f64,
}

impl Default for AMASConfig {
    fn default() -> Self {
        Self {
            perception: PerceptionConfig::default(),
            attention_weights: AttentionWeights::default(),
            fatigue: FatigueParams::default(),
            motivation: MotivationParams::default(),
            cognitive: CognitiveParams::default(),
            trend: TrendParams::default(),
            cold_start: ColdStartConfig::default(),
            bandit: BanditConfig::default(),
            reward: RewardConfig::default(),
            feature_flags: FeatureFlags::default(),
            attention_smoothing: 0.3,
            confidence_decay: 0.99,
            min_confidence: 0.1,
        }
    }
}

impl AMASConfig {
    pub fn from_env() -> Self {
        let mut config = Self::default();

        if let Ok(val) = std::env::var("AMAS_ENSEMBLE_ENABLED") {
            config.feature_flags.ensemble_enabled = val.parse().unwrap_or(true);
        }
        if let Ok(val) = std::env::var("AMAS_THOMPSON_ENABLED") {
            config.feature_flags.thompson_enabled = val.parse().unwrap_or(true);
        }
        if let Ok(val) = std::env::var("AMAS_CAUSAL_ENABLED") {
            config.feature_flags.causal_inference_enabled = val.parse().unwrap_or(false);
        }
        if let Ok(val) = std::env::var("AMAS_ACTR_ENABLED") {
            config.feature_flags.actr_memory_enabled = val.parse().unwrap_or(true);
        }

        config
    }
}
