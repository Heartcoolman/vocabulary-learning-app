use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::amas::config::{
    EnsembleConfig, FeatureFlags, PerformanceTrackerConfig, StrategySimilarityWeights,
};
use crate::amas::types::{DifficultyLevel, FeatureVector, StrategyParams, UserState};

use super::heuristic::HeuristicLearner;

#[derive(Debug, Clone)]
pub struct DecisionCandidate {
    pub source: String,
    pub strategy: StrategyParams,
    pub confidence: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AlgorithmPerformance {
    pub ema_reward: f64,
    pub sample_count: u64,
    pub trust_score: f64,
}

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub total_sessions: u32,
    pub duration_minutes: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PerformanceTracker {
    pub algorithms: HashMap<String, AlgorithmPerformance>,
    config: PerformanceTrackerConfig,
}

impl PerformanceTracker {
    pub fn new(config: PerformanceTrackerConfig) -> Self {
        Self {
            algorithms: HashMap::new(),
            config,
        }
    }

    pub fn update(
        &mut self,
        candidates: &[DecisionCandidate],
        final_strategy: &StrategyParams,
        actual_reward: f64,
        similarity_weights: &StrategySimilarityWeights,
    ) {
        let total: u64 = self.algorithms.values().map(|p| p.sample_count).sum();
        if total < self.config.warmup_samples {
            for c in candidates {
                self.algorithms
                    .entry(c.source.clone())
                    .or_default()
                    .sample_count += 1;
            }
            return;
        }

        for c in candidates {
            let similarity = strategy_similarity(&c.strategy, final_strategy, similarity_weights);
            let attributed = actual_reward * similarity;
            let perf = self.algorithms.entry(c.source.clone()).or_default();
            perf.sample_count += 1;
            perf.ema_reward = (1.0 - self.config.ema_alpha) * perf.ema_reward
                + self.config.ema_alpha * attributed;
        }
        self.update_trust_scores();
    }

    fn update_trust_scores(&mut self) {
        let rewards: Vec<f64> = self.algorithms.values().map(|p| p.ema_reward).collect();
        if rewards.is_empty() {
            return;
        }
        let max_reward = rewards.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let min_reward = rewards.iter().cloned().fold(f64::INFINITY, f64::min);
        let range = (max_reward - min_reward).max(1e-6);

        for perf in self.algorithms.values_mut() {
            perf.trust_score = ((perf.ema_reward - min_reward) / range)
                .clamp(self.config.trust_score_min, self.config.trust_score_max);
        }
    }

    pub fn get_weights(&self, base: &[(&str, f64)]) -> HashMap<String, f64> {
        let total: u64 = self.algorithms.values().map(|p| p.sample_count).sum();
        let blend = if total < self.config.warmup_samples {
            0.0
        } else {
            ((total - self.config.warmup_samples) as f64 / self.config.blend_scale)
                .min(self.config.blend_max)
        };

        let mut result = HashMap::new();
        for (src, base_w) in base {
            let trust = self
                .algorithms
                .get(*src)
                .map(|p| p.trust_score)
                .unwrap_or(0.33);
            let w = ((1.0 - blend) * base_w + blend * trust).max(self.config.min_weight);
            result.insert(src.to_string(), w);
        }
        normalize(&mut result);
        result
    }
}

fn strategy_similarity(
    a: &StrategyParams,
    b: &StrategyParams,
    w: &StrategySimilarityWeights,
) -> f64 {
    let diff = if a.difficulty == b.difficulty {
        1.0
    } else {
        0.0
    };
    let ratio = 1.0 - (a.new_ratio - b.new_ratio).abs();
    let batch = 1.0 - ((a.batch_size - b.batch_size).abs() as f64 / 15.0);
    let interval = 1.0 - (a.interval_scale - b.interval_scale).abs();
    (w.difficulty_weight * diff
        + w.new_ratio_weight * ratio
        + w.batch_size_weight * batch
        + w.interval_scale_weight * interval)
        .clamp(0.0, 1.0)
}

fn normalize(weights: &mut HashMap<String, f64>) {
    let total: f64 = weights.values().sum();
    if total > 1e-6 {
        for v in weights.values_mut() {
            *v /= total;
        }
    }
}

pub struct EnsembleDecision {
    feature_flags: FeatureFlags,
    heuristic: HeuristicLearner,
    config: EnsembleConfig,
    pub performance: PerformanceTracker,
}

impl EnsembleDecision {
    pub fn new(feature_flags: FeatureFlags) -> Self {
        Self::with_config(feature_flags, EnsembleConfig::default())
    }

    pub fn with_config(feature_flags: FeatureFlags, config: EnsembleConfig) -> Self {
        Self {
            feature_flags,
            heuristic: HeuristicLearner::default(),
            performance: PerformanceTracker::new(config.performance_tracker.clone()),
            config,
        }
    }

    pub fn set_feature_flags(&mut self, flags: FeatureFlags) {
        self.feature_flags = flags;
    }

    pub fn set_config(&mut self, config: EnsembleConfig) {
        self.performance = PerformanceTracker::new(config.performance_tracker.clone());
        self.config = config;
    }

    pub fn config(&self) -> &EnsembleConfig {
        &self.config
    }

    pub fn decide(
        &self,
        state: &UserState,
        _feature_vector: &FeatureVector,
        current: &StrategyParams,
        ige_action: Option<&StrategyParams>,
        ige_confidence: Option<f64>,
        swd_action: Option<&StrategyParams>,
        swd_confidence: Option<f64>,
    ) -> (StrategyParams, Vec<DecisionCandidate>) {
        let mut candidates: Vec<DecisionCandidate> = Vec::new();

        let dynamic_weights = self.performance.get_weights(&[
            ("heuristic", self.config.heuristic_base_weight),
            ("ige", 0.4),
            ("swd", 0.4),
        ]);

        if self.feature_flags.heuristic_enabled {
            let heuristic_strategy = self.heuristic.suggest(state, current);
            let heuristic_conf = self.heuristic.confidence(state);
            candidates.push(DecisionCandidate {
                source: "heuristic".to_string(),
                strategy: heuristic_strategy,
                confidence: heuristic_conf,
                weight: *dynamic_weights
                    .get("heuristic")
                    .unwrap_or(&self.config.heuristic_base_weight),
            });
        }

        // UMM IGE
        if self.feature_flags.amas_ige_enabled {
            if let Some(action) = ige_action {
                candidates.push(DecisionCandidate {
                    source: "ige".to_string(),
                    strategy: action.clone(),
                    confidence: ige_confidence.unwrap_or(0.7),
                    weight: *dynamic_weights.get("ige").unwrap_or(&0.4),
                });
            }
        }

        // UMM SWD
        if self.feature_flags.amas_swd_enabled {
            if let Some(action) = swd_action {
                candidates.push(DecisionCandidate {
                    source: "swd".to_string(),
                    strategy: action.clone(),
                    confidence: swd_confidence.unwrap_or(state.conf),
                    weight: *dynamic_weights.get("swd").unwrap_or(&0.4),
                });
            }
        }

        if candidates.is_empty() {
            return (current.clone(), vec![]);
        }

        let final_strategy = self.weighted_merge(&candidates);
        (final_strategy, candidates)
    }

    pub fn update_performance(
        &mut self,
        candidates: &[DecisionCandidate],
        final_strategy: &StrategyParams,
        reward: f64,
    ) {
        self.performance.update(
            candidates,
            final_strategy,
            reward,
            &self.config.similarity_weights,
        );
    }

    pub fn post_filter(
        &self,
        mut strategy: StrategyParams,
        state: &UserState,
        session: Option<&SessionInfo>,
    ) -> StrategyParams {
        // Apply reward profile adjustments first (before safety filters)
        if let Some(ref profile) = state.reward_profile {
            strategy = Self::apply_reward_profile(strategy, profile);
        }

        let sf = &self.config.safety_filter;
        let fatigue = state.fused_fatigue.unwrap_or(state.fatigue);

        let (min_batch, max_batch) = if fatigue > sf.high_fatigue_threshold {
            (3, sf.high_fatigue_max_batch)
        } else if fatigue > sf.mid_fatigue_threshold {
            (3, sf.mid_fatigue_max_batch)
        } else {
            (3, 20)
        };

        let max_ratio = if fatigue > sf.mid_fatigue_threshold {
            sf.high_fatigue_max_new_ratio
        } else {
            0.5
        };

        if fatigue > sf.high_fatigue_threshold {
            strategy.difficulty = DifficultyLevel::Easy;
            strategy.hint_level = strategy.hint_level.max(2);
        } else if fatigue > sf.mid_fatigue_threshold && strategy.difficulty == DifficultyLevel::Hard
        {
            strategy.difficulty = DifficultyLevel::Mid;
        }

        if state.attention < sf.low_attention_threshold {
            strategy.hint_level = strategy.hint_level.max(1);
        }

        if let Some(s) = session {
            if s.total_sessions < sf.new_user_session_threshold {
                strategy.difficulty = DifficultyLevel::Easy;
                strategy.hint_level = strategy.hint_level.max(1);
            }
            if s.duration_minutes > sf.long_session_minutes {
                strategy.new_ratio = strategy.new_ratio.min(sf.long_session_max_new_ratio);
            }
        }

        strategy.batch_size =
            snap_to_valid_grid(strategy.batch_size, &[5, 8, 12, 16], min_batch, max_batch);
        strategy.new_ratio = strategy.new_ratio.clamp(0.05, max_ratio);
        strategy.new_ratio = self.snap_new_ratio(strategy.new_ratio);

        strategy
    }

    fn apply_reward_profile(mut s: StrategyParams, profile: &str) -> StrategyParams {
        match profile {
            "cram" => {
                s.interval_scale *= 0.7;
                s.new_ratio = (s.new_ratio * 1.3).min(0.5);
                s.batch_size = ((s.batch_size as f64 * 1.3) as i32).min(20);
                s.difficulty = s.difficulty.harder();
                s.hint_level = (s.hint_level - 1).max(0);
            }
            "relaxed" => {
                s.interval_scale *= 1.4;
                s.new_ratio = (s.new_ratio * 0.6).max(0.05);
                s.batch_size = ((s.batch_size as f64 * 0.75) as i32).max(4);
                s.difficulty = s.difficulty.easier();
                s.hint_level = (s.hint_level + 1).min(2);
            }
            _ => {}
        }
        s
    }

    fn weighted_merge(&self, candidates: &[DecisionCandidate]) -> StrategyParams {
        if candidates.is_empty() {
            return StrategyParams::default();
        }

        let total_weight: f64 = candidates.iter().map(|c| c.weight * c.confidence).sum();
        if total_weight < 1e-6 {
            return candidates[0].strategy.clone();
        }

        let mut interval_scale = 0.0;
        let mut new_ratio = 0.0;
        let mut batch_size = 0.0;
        let mut hint_level = 0.0;
        let mut difficulty_scores = [0.0f64; 3];

        for c in candidates {
            let w = c.weight * c.confidence / total_weight;
            interval_scale += w * c.strategy.interval_scale;
            new_ratio += w * c.strategy.new_ratio;
            batch_size += w * c.strategy.batch_size as f64;
            hint_level += w * c.strategy.hint_level as f64;

            match c.strategy.difficulty {
                DifficultyLevel::Easy => difficulty_scores[0] += w,
                DifficultyLevel::Mid => difficulty_scores[1] += w,
                DifficultyLevel::Hard => difficulty_scores[2] += w,
            }
        }

        let difficulty = if difficulty_scores[2] > difficulty_scores[1]
            && difficulty_scores[2] > difficulty_scores[0]
        {
            DifficultyLevel::Hard
        } else if difficulty_scores[0] > difficulty_scores[1] {
            DifficultyLevel::Easy
        } else {
            DifficultyLevel::Mid
        };

        StrategyParams {
            interval_scale: self.snap_interval_scale(interval_scale),
            new_ratio: self.snap_new_ratio(new_ratio),
            difficulty,
            batch_size: self.snap_batch_size(batch_size),
            hint_level: hint_level.round() as i32,
            swd_recommendation: None,
        }
    }

    fn snap_interval_scale(&self, value: f64) -> f64 {
        let options = [0.5, 0.8, 1.0, 1.2, 1.5];
        *options
            .iter()
            .min_by(|a, b| {
                ((*a) - value)
                    .abs()
                    .partial_cmp(&((*b) - value).abs())
                    .unwrap()
            })
            .unwrap_or(&1.0)
    }

    fn snap_new_ratio(&self, value: f64) -> f64 {
        let options = [0.1, 0.2, 0.3, 0.4];
        *options
            .iter()
            .min_by(|a, b| {
                ((*a) - value)
                    .abs()
                    .partial_cmp(&((*b) - value).abs())
                    .unwrap()
            })
            .unwrap_or(&0.2)
    }

    fn snap_batch_size(&self, value: f64) -> i32 {
        let options = [5, 8, 12, 16];
        *options
            .iter()
            .min_by(|a, b| {
                ((**a as f64) - value)
                    .abs()
                    .partial_cmp(&((**b as f64) - value).abs())
                    .unwrap()
            })
            .unwrap_or(&8)
    }
}

fn snap_to_valid_grid(value: i32, grid: &[i32], min: i32, max: i32) -> i32 {
    let valid: Vec<i32> = grid
        .iter()
        .filter(|&&v| v >= min && v <= max)
        .copied()
        .collect();
    if valid.is_empty() {
        return min;
    }
    *valid.iter().min_by_key(|&&v| (v - value).abs()).unwrap()
}

impl Default for EnsembleDecision {
    fn default() -> Self {
        Self::new(FeatureFlags::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::amas::config::{EnsembleConfig, FeatureFlags, PerformanceTrackerConfig, SafetyFilterConfig};
    use crate::amas::types::{CognitiveProfile, DifficultyLevel, FeatureVector, StrategyParams, UserState};

    fn sample_strategy() -> StrategyParams {
        StrategyParams {
            difficulty: DifficultyLevel::Mid,
            new_ratio: 0.2,
            batch_size: 8,
            interval_scale: 1.0,
            hint_level: 1,
            swd_recommendation: None,
        }
    }

    fn sample_user_state() -> UserState {
        UserState {
            attention: 0.7,
            fatigue: 0.3,
            cognitive: CognitiveProfile::default(),
            motivation: 0.5,
            habit: None,
            trend: None,
            conf: 0.5,
            ts: 0,
            visual_fatigue: None,
            fused_fatigue: None,
            reward_profile: None,
        }
    }

    fn sample_feature_vector() -> FeatureVector {
        FeatureVector::new(vec![0.5; 5], vec!["f".to_string(); 5])
    }

    #[test]
    fn new_creates_with_feature_flags() {
        let flags = FeatureFlags {
            heuristic_enabled: true,
            ..Default::default()
        };
        let ensemble = EnsembleDecision::new(flags.clone());
        assert!(ensemble.feature_flags.heuristic_enabled);
    }

    #[test]
    fn decide_returns_current_when_no_candidates() {
        let flags = FeatureFlags {
            heuristic_enabled: false,
            amas_ige_enabled: false,
            amas_swd_enabled: false,
            ..Default::default()
        };
        let ensemble = EnsembleDecision::new(flags);
        let state = sample_user_state();
        let feature = sample_feature_vector();
        let current = sample_strategy();
        let (final_strategy, candidates) =
            ensemble.decide(&state, &feature, &current, None, None, None, None);
        assert_eq!(final_strategy.batch_size, current.batch_size);
        assert!(candidates.is_empty());
    }

    #[test]
    fn decide_includes_heuristic_when_enabled() {
        let flags = FeatureFlags {
            heuristic_enabled: true,
            amas_ige_enabled: false,
            amas_swd_enabled: false,
            ..Default::default()
        };
        let ensemble = EnsembleDecision::new(flags);
        let state = sample_user_state();
        let feature = sample_feature_vector();
        let current = sample_strategy();
        let (_, candidates) = ensemble.decide(&state, &feature, &current, None, None, None, None);
        assert!(!candidates.is_empty());
        assert!(candidates.iter().any(|c| c.source == "heuristic"));
    }

    #[test]
    fn decide_includes_ige_when_provided() {
        let flags = FeatureFlags {
            heuristic_enabled: false,
            amas_ige_enabled: true,
            amas_swd_enabled: false,
            ..Default::default()
        };
        let ensemble = EnsembleDecision::new(flags);
        let state = sample_user_state();
        let feature = sample_feature_vector();
        let current = sample_strategy();
        let ige_action = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let (_, candidates) = ensemble.decide(
            &state,
            &feature,
            &current,
            Some(&ige_action),
            Some(0.8),
            None,
            None,
        );
        assert!(candidates.iter().any(|c| c.source == "ige"));
    }

    #[test]
    fn decide_includes_swd_when_provided() {
        let flags = FeatureFlags {
            heuristic_enabled: false,
            amas_ige_enabled: false,
            amas_swd_enabled: true,
            ..Default::default()
        };
        let ensemble = EnsembleDecision::new(flags);
        let state = sample_user_state();
        let feature = sample_feature_vector();
        let current = sample_strategy();
        let swd_action = StrategyParams {
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        };
        let (_, candidates) = ensemble.decide(
            &state,
            &feature,
            &current,
            None,
            None,
            Some(&swd_action),
            Some(0.7),
        );
        assert!(candidates.iter().any(|c| c.source == "swd"));
    }

    #[test]
    fn weighted_merge_returns_default_for_empty() {
        let ensemble = EnsembleDecision::default();
        let merged = ensemble.weighted_merge(&[]);
        assert_eq!(merged.batch_size, StrategyParams::default().batch_size);
    }

    #[test]
    fn weighted_merge_returns_first_when_zero_weight() {
        let ensemble = EnsembleDecision::default();
        let candidates = vec![DecisionCandidate {
            source: "test".to_string(),
            strategy: StrategyParams {
                batch_size: 12,
                ..sample_strategy()
            },
            confidence: 0.0,
            weight: 0.0,
        }];
        let merged = ensemble.weighted_merge(&candidates);
        assert_eq!(merged.batch_size, 12);
    }

    #[test]
    fn weighted_merge_snaps_values() {
        let ensemble = EnsembleDecision::default();
        let candidates = vec![DecisionCandidate {
            source: "a".to_string(),
            strategy: StrategyParams {
                interval_scale: 1.49,
                new_ratio: 0.39,
                batch_size: 15,
                hint_level: 1,
                difficulty: DifficultyLevel::Hard,
                swd_recommendation: None,
            },
            confidence: 1.0,
            weight: 1.0,
        }];
        let merged = ensemble.weighted_merge(&candidates);
        assert_eq!(merged.batch_size, 16);
        assert!((merged.new_ratio - 0.4).abs() < 1e-6);
        assert!((merged.interval_scale - 1.5).abs() < 1e-6);
    }

    #[test]
    fn weighted_merge_averages_multiple_candidates() {
        let ensemble = EnsembleDecision::default();
        let candidates = vec![
            DecisionCandidate {
                source: "a".to_string(),
                strategy: StrategyParams {
                    new_ratio: 0.1,
                    batch_size: 5,
                    ..sample_strategy()
                },
                confidence: 1.0,
                weight: 0.5,
            },
            DecisionCandidate {
                source: "b".to_string(),
                strategy: StrategyParams {
                    new_ratio: 0.3,
                    batch_size: 16,
                    ..sample_strategy()
                },
                confidence: 1.0,
                weight: 0.5,
            },
        ];
        let merged = ensemble.weighted_merge(&candidates);
        assert_eq!(merged.new_ratio, 0.2);
    }

    #[test]
    fn weighted_merge_selects_majority_difficulty() {
        let ensemble = EnsembleDecision::default();
        let candidates = vec![
            DecisionCandidate {
                source: "a".to_string(),
                strategy: StrategyParams {
                    difficulty: DifficultyLevel::Hard,
                    ..sample_strategy()
                },
                confidence: 1.0,
                weight: 0.6,
            },
            DecisionCandidate {
                source: "b".to_string(),
                strategy: StrategyParams {
                    difficulty: DifficultyLevel::Easy,
                    ..sample_strategy()
                },
                confidence: 1.0,
                weight: 0.4,
            },
        ];
        let merged = ensemble.weighted_merge(&candidates);
        assert_eq!(merged.difficulty, DifficultyLevel::Hard);
    }

    #[test]
    fn post_filter_reduces_batch_on_high_fatigue() {
        let ensemble = EnsembleDecision::default();
        let mut state = sample_user_state();
        state.fatigue = 0.95;
        let strategy = StrategyParams {
            batch_size: 16,
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let filtered = ensemble.post_filter(strategy, &state, None);
        assert!(filtered.batch_size <= ensemble.config.safety_filter.high_fatigue_max_batch);
        assert_eq!(filtered.difficulty, DifficultyLevel::Easy);
    }

    #[test]
    fn post_filter_increases_hint_on_low_attention() {
        let ensemble = EnsembleDecision::default();
        let mut state = sample_user_state();
        state.attention = 0.2;
        let strategy = StrategyParams {
            hint_level: 0,
            ..sample_strategy()
        };
        let filtered = ensemble.post_filter(strategy, &state, None);
        assert!(filtered.hint_level >= 1);
    }

    #[test]
    fn post_filter_adjusts_for_new_user() {
        let ensemble = EnsembleDecision::default();
        let state = sample_user_state();
        let strategy = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let session = SessionInfo {
            total_sessions: 2,
            duration_minutes: 10.0,
        };
        let filtered = ensemble.post_filter(strategy, &state, Some(&session));
        assert_eq!(filtered.difficulty, DifficultyLevel::Easy);
    }

    #[test]
    fn post_filter_limits_new_ratio_for_long_session() {
        let config = EnsembleConfig {
            safety_filter: SafetyFilterConfig {
                long_session_minutes: 30.0,
                long_session_max_new_ratio: 0.15,
                ..Default::default()
            },
            ..Default::default()
        };
        let ensemble = EnsembleDecision::with_config(FeatureFlags::default(), config);
        let state = sample_user_state();
        let strategy = StrategyParams {
            new_ratio: 0.4,
            ..sample_strategy()
        };
        let session = SessionInfo {
            total_sessions: 20,
            duration_minutes: 60.0,
        };
        let filtered = ensemble.post_filter(strategy, &state, Some(&session));
        assert!(filtered.new_ratio <= 0.15);
    }

    #[test]
    fn strategy_similarity_identical_strategies() {
        let s1 = sample_strategy();
        let s2 = sample_strategy();
        let weights = StrategySimilarityWeights::default();
        let sim = strategy_similarity(&s1, &s2, &weights);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn strategy_similarity_different_difficulty() {
        let s1 = StrategyParams {
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        };
        let s2 = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let weights = StrategySimilarityWeights::default();
        let sim = strategy_similarity(&s1, &s2, &weights);
        assert!(sim < 1.0);
    }

    #[test]
    fn performance_tracker_warmup_phase() {
        let config = PerformanceTrackerConfig {
            warmup_samples: 10,
            ..Default::default()
        };
        let mut tracker = PerformanceTracker::new(config);
        let candidates = vec![DecisionCandidate {
            source: "algo1".to_string(),
            strategy: sample_strategy(),
            confidence: 1.0,
            weight: 1.0,
        }];
        for _ in 0..5 {
            tracker.update(
                &candidates,
                &sample_strategy(),
                1.0,
                &StrategySimilarityWeights::default(),
            );
        }
        let perf = tracker.algorithms.get("algo1").unwrap();
        assert_eq!(perf.sample_count, 5);
        assert!((perf.ema_reward - 0.0).abs() < 1e-6);
    }

    #[test]
    fn performance_tracker_updates_after_warmup() {
        let config = PerformanceTrackerConfig {
            warmup_samples: 5,
            ema_alpha: 0.1,
            ..Default::default()
        };
        let mut tracker = PerformanceTracker::new(config);
        let candidates = vec![DecisionCandidate {
            source: "algo1".to_string(),
            strategy: sample_strategy(),
            confidence: 1.0,
            weight: 1.0,
        }];
        for _ in 0..10 {
            tracker.update(
                &candidates,
                &sample_strategy(),
                1.0,
                &StrategySimilarityWeights::default(),
            );
        }
        let perf = tracker.algorithms.get("algo1").unwrap();
        assert!(perf.ema_reward > 0.0);
    }

    #[test]
    fn performance_tracker_get_weights_during_warmup() {
        let config = PerformanceTrackerConfig {
            warmup_samples: 100,
            ..Default::default()
        };
        let tracker = PerformanceTracker::new(config);
        let weights = tracker.get_weights(&[("ige", 0.4), ("swd", 0.4), ("heuristic", 0.2)]);
        let total: f64 = weights.values().sum();
        assert!((total - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_sums_to_one() {
        let mut weights = HashMap::new();
        weights.insert("a".to_string(), 2.0);
        weights.insert("b".to_string(), 3.0);
        normalize(&mut weights);
        let total: f64 = weights.values().sum();
        assert!((total - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_handles_zero_total() {
        let mut weights = HashMap::new();
        weights.insert("a".to_string(), 0.0);
        weights.insert("b".to_string(), 0.0);
        normalize(&mut weights);
        assert_eq!(weights.get("a"), Some(&0.0));
    }

    #[test]
    fn snap_to_valid_grid_selects_closest() {
        let result = snap_to_valid_grid(7, &[5, 8, 12, 16], 3, 20);
        assert_eq!(result, 8);
    }

    #[test]
    fn snap_to_valid_grid_respects_bounds() {
        let result = snap_to_valid_grid(16, &[5, 8, 12, 16], 3, 10);
        assert_eq!(result, 8);
    }

    #[test]
    fn snap_to_valid_grid_returns_min_when_empty() {
        let result = snap_to_valid_grid(10, &[5, 8, 12, 16], 20, 25);
        assert_eq!(result, 20);
    }

    #[test]
    fn set_feature_flags_updates_flags() {
        let mut ensemble = EnsembleDecision::default();
        let new_flags = FeatureFlags {
            amas_ige_enabled: false,
            ..Default::default()
        };
        ensemble.set_feature_flags(new_flags);
        assert!(!ensemble.feature_flags.amas_ige_enabled);
    }

    #[test]
    fn set_config_resets_performance_tracker() {
        let mut ensemble = EnsembleDecision::default();
        let new_config = EnsembleConfig {
            heuristic_base_weight: 0.5,
            ..Default::default()
        };
        ensemble.set_config(new_config);
        assert!((ensemble.config.heuristic_base_weight - 0.5).abs() < 1e-6);
    }

    #[test]
    fn update_performance_delegates_to_tracker() {
        let mut ensemble = EnsembleDecision::default();
        let candidates = vec![DecisionCandidate {
            source: "test".to_string(),
            strategy: sample_strategy(),
            confidence: 1.0,
            weight: 1.0,
        }];
        ensemble.update_performance(&candidates, &sample_strategy(), 1.0);
        assert!(ensemble.performance.algorithms.contains_key("test"));
    }

    #[test]
    fn apply_reward_profile_cram_mode() {
        let s = StrategyParams {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Mid,
            batch_size: 8,
            hint_level: 1,
            swd_recommendation: None,
        };
        let adjusted = EnsembleDecision::apply_reward_profile(s, "cram");
        assert!((adjusted.interval_scale - 0.7).abs() < 1e-6);
        assert!((adjusted.new_ratio - 0.26).abs() < 1e-6);
        assert_eq!(adjusted.batch_size, 10);
        assert_eq!(adjusted.difficulty, DifficultyLevel::Hard);
        assert_eq!(adjusted.hint_level, 0);
    }

    #[test]
    fn apply_reward_profile_relaxed_mode() {
        let s = StrategyParams {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Mid,
            batch_size: 8,
            hint_level: 1,
            swd_recommendation: None,
        };
        let adjusted = EnsembleDecision::apply_reward_profile(s, "relaxed");
        assert!((adjusted.interval_scale - 1.4).abs() < 1e-6);
        assert!((adjusted.new_ratio - 0.12).abs() < 1e-6);
        assert_eq!(adjusted.batch_size, 6);
        assert_eq!(adjusted.difficulty, DifficultyLevel::Easy);
        assert_eq!(adjusted.hint_level, 2);
    }

    #[test]
    fn apply_reward_profile_standard_unchanged() {
        let s = StrategyParams {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Mid,
            batch_size: 8,
            hint_level: 1,
            swd_recommendation: None,
        };
        let adjusted = EnsembleDecision::apply_reward_profile(s.clone(), "standard");
        assert!((adjusted.interval_scale - s.interval_scale).abs() < 1e-6);
        assert!((adjusted.new_ratio - s.new_ratio).abs() < 1e-6);
        assert_eq!(adjusted.batch_size, s.batch_size);
        assert_eq!(adjusted.difficulty, s.difficulty);
        assert_eq!(adjusted.hint_level, s.hint_level);
    }

    #[test]
    fn post_filter_applies_cram_reward_profile() {
        let ensemble = EnsembleDecision::default();
        let mut state = sample_user_state();
        state.reward_profile = Some("cram".to_string());
        let strategy = sample_strategy();
        let filtered = ensemble.post_filter(strategy, &state, None);
        assert_eq!(filtered.difficulty, DifficultyLevel::Hard);
    }

    #[test]
    fn post_filter_applies_relaxed_reward_profile() {
        let ensemble = EnsembleDecision::default();
        let mut state = sample_user_state();
        state.reward_profile = Some("relaxed".to_string());
        let strategy = sample_strategy();
        let filtered = ensemble.post_filter(strategy, &state, None);
        assert_eq!(filtered.difficulty, DifficultyLevel::Easy);
    }
}
