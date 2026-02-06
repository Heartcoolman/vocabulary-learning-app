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
            rt: NormalizationStat {
                mean: 3000.0,
                std_dev: 1500.0,
            },
            pause: NormalizationStat {
                mean: 2.0,
                std_dev: 2.0,
            },
            focus_loss: NormalizationStat {
                mean: 5000.0,
                std_dev: 3000.0,
            },
            switches: NormalizationStat {
                mean: 1.0,
                std_dev: 1.0,
            },
            dwell: NormalizationStat {
                mean: 8000.0,
                std_dev: 4000.0,
            },
            interaction_density: NormalizationStat {
                mean: 0.5,
                std_dev: 0.2,
            },
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
    pub recent_accuracy: f64,
    pub streak: f64,
    pub hint_used: f64,
    pub retry_count: f64,
    pub dwell_time: f64,
    pub visual_fatigue: f64,
    pub motivation: f64,
    pub cognitive: f64,
    pub study_duration: f64,
    pub circadian: f64,
}

impl Default for AttentionWeights {
    fn default() -> Self {
        Self {
            rt_mean: 0.12,
            rt_cv: 0.08,
            pace_cv: 0.05,
            pause: 0.06,
            switch: 0.05,
            drift: 0.05,
            interaction: 0.05,
            focus_loss: 0.08,
            recent_accuracy: 0.10,
            streak: 0.06,
            hint_used: 0.04,
            retry_count: 0.04,
            dwell_time: 0.04,
            visual_fatigue: 0.06,
            motivation: 0.04,
            cognitive: 0.04,
            study_duration: 0.05,
            circadian: 0.04,
        }
    }
}

impl AttentionWeights {
    pub fn total(&self) -> f64 {
        self.rt_mean
            + self.rt_cv
            + self.pace_cv
            + self.pause
            + self.switch
            + self.drift
            + self.interaction
            + self.focus_loss
            + self.recent_accuracy
            + self.streak
            + self.hint_used
            + self.retry_count
            + self.dwell_time
            + self.visual_fatigue
            + self.motivation
            + self.cognitive
            + self.study_duration
            + self.circadian
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
    pub min_classify_samples: i32,
    pub min_explore_samples: i32,
    pub classify_confidence_margin: f64,
    pub explore_high_accuracy: f64,
    pub explore_low_accuracy: f64,
}

impl Default for ColdStartConfig {
    fn default() -> Self {
        Self {
            classify_samples: 3,
            explore_samples: 5,
            probe_sequence: vec![0, 1, 2, 0, 1, 2],
            min_classify_samples: 2,
            min_explore_samples: 2,
            classify_confidence_margin: 0.35,
            explore_high_accuracy: 0.85,
            explore_low_accuracy: 0.5,
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
            context_dim: 10,
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
    pub heuristic_enabled: bool,
    #[serde(default)]
    pub causal_inference_enabled: bool,
    #[serde(default)]
    pub bayesian_optimizer_enabled: bool,
    #[serde(default = "default_true", alias = "umm_mdm_enabled")]
    pub amas_mdm_enabled: bool,
    #[serde(default = "default_true", alias = "umm_ige_enabled")]
    pub amas_ige_enabled: bool,
    #[serde(default = "default_true", alias = "umm_swd_enabled")]
    pub amas_swd_enabled: bool,
    #[serde(default = "default_true", alias = "umm_msmt_enabled")]
    pub amas_msmt_enabled: bool,
    #[serde(default = "default_true", alias = "umm_mtp_enabled")]
    pub amas_mtp_enabled: bool,
    #[serde(default = "default_true", alias = "umm_iad_enabled")]
    pub amas_iad_enabled: bool,
    #[serde(default = "default_true", alias = "umm_evm_enabled")]
    pub amas_evm_enabled: bool,
    #[serde(default, alias = "umm_ab_test_enabled")]
    pub amas_ab_test_enabled: bool,
    #[serde(
        default = "default_ab_test_percentage",
        alias = "umm_ab_test_percentage"
    )]
    pub amas_ab_test_percentage: u8,
}

fn default_true() -> bool {
    true
}

fn default_ab_test_percentage() -> u8 {
    10
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            ensemble_enabled: true,
            heuristic_enabled: true,
            causal_inference_enabled: false,
            bayesian_optimizer_enabled: false,
            amas_mdm_enabled: true,
            amas_ige_enabled: true,
            amas_swd_enabled: true,
            amas_msmt_enabled: true,
            amas_mtp_enabled: true,
            amas_iad_enabled: true,
            amas_evm_enabled: true,
            amas_ab_test_enabled: false,
            amas_ab_test_percentage: 10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfidenceMapConfig {
    pub min_confidence: f64,
    pub max_confidence: f64,
}

impl Default for ConfidenceMapConfig {
    fn default() -> Self {
        Self {
            min_confidence: 0.4,
            max_confidence: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceTrackerConfig {
    pub ema_alpha: f64,
    pub warmup_samples: u64,
    pub min_weight: f64,
    pub blend_max: f64,
    pub blend_scale: f64,
    pub trust_score_min: f64,
    pub trust_score_max: f64,
}

impl Default for PerformanceTrackerConfig {
    fn default() -> Self {
        Self {
            ema_alpha: 0.1,
            warmup_samples: 20,
            min_weight: 0.15,
            blend_max: 0.5,
            blend_scale: 100.0,
            trust_score_min: 0.2,
            trust_score_max: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyFilterConfig {
    pub high_fatigue_threshold: f64,
    pub mid_fatigue_threshold: f64,
    pub low_attention_threshold: f64,
    pub new_user_session_threshold: u32,
    pub long_session_minutes: f64,
    pub long_session_max_new_ratio: f64,
    pub high_fatigue_max_batch: i32,
    pub mid_fatigue_max_batch: i32,
    pub high_fatigue_max_new_ratio: f64,
}

impl Default for SafetyFilterConfig {
    fn default() -> Self {
        Self {
            high_fatigue_threshold: 0.9,
            mid_fatigue_threshold: 0.75,
            low_attention_threshold: 0.3,
            new_user_session_threshold: 5,
            long_session_minutes: 45.0,
            long_session_max_new_ratio: 0.15,
            high_fatigue_max_batch: 5,
            mid_fatigue_max_batch: 8,
            high_fatigue_max_new_ratio: 0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategySimilarityWeights {
    pub difficulty_weight: f64,
    pub new_ratio_weight: f64,
    pub batch_size_weight: f64,
    pub interval_scale_weight: f64,
}

impl Default for StrategySimilarityWeights {
    fn default() -> Self {
        Self {
            difficulty_weight: 0.3,
            new_ratio_weight: 0.25,
            batch_size_weight: 0.25,
            interval_scale_weight: 0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnsembleConfig {
    pub heuristic_base_weight: f64,
    pub confidence_map: ConfidenceMapConfig,
    pub performance_tracker: PerformanceTrackerConfig,
    pub safety_filter: SafetyFilterConfig,
    pub similarity_weights: StrategySimilarityWeights,
}

impl Default for EnsembleConfig {
    fn default() -> Self {
        Self {
            heuristic_base_weight: 1.0,
            confidence_map: ConfidenceMapConfig::default(),
            performance_tracker: PerformanceTrackerConfig::default(),
            safety_filter: SafetyFilterConfig::default(),
            similarity_weights: StrategySimilarityWeights::default(),
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
    pub ensemble: EnsembleConfig,
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
            ensemble: EnsembleConfig::default(),
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

        config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_feature_flags() {
        let flags = FeatureFlags::default();
        assert!(flags.amas_mdm_enabled);
        assert!(flags.amas_ige_enabled);
        assert!(flags.amas_swd_enabled);
        assert!(flags.amas_msmt_enabled);
    }

    #[test]
    fn test_old_keys_accepted() {
        let old_json =
            r#"{"ensemble_enabled": true, "heuristic_enabled": true, "umm_mdm_enabled": false}"#;
        let flags: FeatureFlags = serde_json::from_str(old_json).unwrap();
        assert!(!flags.amas_mdm_enabled);
    }
}
