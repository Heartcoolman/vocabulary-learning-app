use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::amas::config::FeatureFlags;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceTracker {
    pub algorithms: HashMap<String, AlgorithmPerformance>,
    ema_alpha: f64,
    min_samples: u64,
    min_weight: f64,
}

impl Default for PerformanceTracker {
    fn default() -> Self {
        Self {
            algorithms: HashMap::new(),
            ema_alpha: 0.1,
            min_samples: 20,
            min_weight: 0.15,
        }
    }
}

impl PerformanceTracker {
    pub fn update(
        &mut self,
        candidates: &[DecisionCandidate],
        final_strategy: &StrategyParams,
        actual_reward: f64,
    ) {
        let total: u64 = self.algorithms.values().map(|p| p.sample_count).sum();
        if total < self.min_samples {
            for c in candidates {
                self.algorithms
                    .entry(c.source.clone())
                    .or_default()
                    .sample_count += 1;
            }
            return;
        }

        for c in candidates {
            let similarity = strategy_similarity(&c.strategy, final_strategy);
            let attributed = actual_reward * similarity;
            let perf = self.algorithms.entry(c.source.clone()).or_default();
            perf.sample_count += 1;
            perf.ema_reward =
                (1.0 - self.ema_alpha) * perf.ema_reward + self.ema_alpha * attributed;
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
            perf.trust_score = ((perf.ema_reward - min_reward) / range).clamp(0.2, 1.0);
        }
    }

    pub fn get_weights(&self, base: &[(&str, f64)]) -> HashMap<String, f64> {
        let total: u64 = self.algorithms.values().map(|p| p.sample_count).sum();
        let blend = if total < self.min_samples {
            0.0
        } else {
            ((total - self.min_samples) as f64 / 100.0).min(0.5)
        };

        let mut result = HashMap::new();
        for (src, base_w) in base {
            let trust = self
                .algorithms
                .get(*src)
                .map(|p| p.trust_score)
                .unwrap_or(0.33);
            let w = ((1.0 - blend) * base_w + blend * trust).max(self.min_weight);
            result.insert(src.to_string(), w);
        }
        normalize(&mut result);
        result
    }
}

fn strategy_similarity(a: &StrategyParams, b: &StrategyParams) -> f64 {
    let diff = if a.difficulty == b.difficulty {
        1.0
    } else {
        0.0
    };
    let ratio = 1.0 - (a.new_ratio - b.new_ratio).abs();
    let batch = 1.0 - ((a.batch_size - b.batch_size).abs() as f64 / 15.0);
    let interval = 1.0 - (a.interval_scale - b.interval_scale).abs();
    (0.3 * diff + 0.25 * ratio + 0.25 * batch + 0.2 * interval).clamp(0.0, 1.0)
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
    thompson_weight: f64,
    linucb_weight: f64,
    heuristic_weight: f64,
    pub performance: PerformanceTracker,
}

impl EnsembleDecision {
    pub fn new(feature_flags: FeatureFlags) -> Self {
        Self {
            feature_flags,
            heuristic: HeuristicLearner::default(),
            thompson_weight: 0.4,
            linucb_weight: 0.4,
            heuristic_weight: 0.2,
            performance: PerformanceTracker::default(),
        }
    }

    pub fn set_feature_flags(&mut self, flags: FeatureFlags) {
        self.feature_flags = flags;
    }

    pub fn decide(
        &self,
        state: &UserState,
        _feature_vector: &FeatureVector,
        current: &StrategyParams,
        thompson_action: Option<&StrategyParams>,
        thompson_confidence: Option<f64>,
        linucb_action: Option<&StrategyParams>,
        linucb_confidence: Option<f64>,
    ) -> (StrategyParams, Vec<DecisionCandidate>) {
        let mut candidates: Vec<DecisionCandidate> = Vec::new();

        let dynamic_weights = self.performance.get_weights(&[
            ("thompson", self.thompson_weight),
            ("linucb", self.linucb_weight),
            ("heuristic", self.heuristic_weight),
        ]);

        if self.feature_flags.heuristic_enabled {
            let heuristic_strategy = self.heuristic.suggest(state, current);
            let heuristic_conf = self.heuristic.confidence(state);
            candidates.push(DecisionCandidate {
                source: "heuristic".to_string(),
                strategy: heuristic_strategy,
                confidence: heuristic_conf,
                weight: *dynamic_weights.get("heuristic").unwrap_or(&self.heuristic_weight),
            });
        }

        if self.feature_flags.thompson_enabled {
            if let Some(action) = thompson_action {
                candidates.push(DecisionCandidate {
                    source: "thompson".to_string(),
                    strategy: action.clone(),
                    confidence: thompson_confidence.unwrap_or(0.7),
                    weight: *dynamic_weights.get("thompson").unwrap_or(&self.thompson_weight),
                });
            }
        }

        if self.feature_flags.linucb_enabled {
            if let Some(action) = linucb_action {
                candidates.push(DecisionCandidate {
                    source: "linucb".to_string(),
                    strategy: action.clone(),
                    confidence: linucb_confidence.unwrap_or(state.conf),
                    weight: *dynamic_weights.get("linucb").unwrap_or(&self.linucb_weight),
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
        self.performance.update(candidates, final_strategy, reward);
    }

    pub fn post_filter(
        &self,
        mut strategy: StrategyParams,
        state: &UserState,
        session: Option<&SessionInfo>,
    ) -> StrategyParams {
        let fatigue = state.fused_fatigue.unwrap_or(state.fatigue);

        let (min_batch, max_batch) = if fatigue > 0.9 {
            (3, 5)
        } else if fatigue > 0.75 {
            (3, 8)
        } else {
            (3, 20)
        };

        let max_ratio = if fatigue > 0.75 { 0.2 } else { 0.5 };

        if fatigue > 0.9 {
            strategy.difficulty = DifficultyLevel::Easy;
            strategy.hint_level = strategy.hint_level.max(2);
        } else if fatigue > 0.75 && strategy.difficulty == DifficultyLevel::Hard {
            strategy.difficulty = DifficultyLevel::Mid;
        }

        if state.attention < 0.3 {
            strategy.hint_level = strategy.hint_level.max(1);
        }

        if let Some(s) = session {
            if s.total_sessions < 5 {
                strategy.difficulty = DifficultyLevel::Easy;
                strategy.hint_level = strategy.hint_level.max(1);
            }
            if s.duration_minutes > 45.0 {
                strategy.new_ratio = strategy.new_ratio.min(0.15);
            }
        }

        strategy.batch_size =
            snap_to_valid_grid(strategy.batch_size, &[5, 8, 12, 16], min_batch, max_batch);
        strategy.new_ratio = strategy.new_ratio.clamp(0.05, max_ratio);
        strategy.new_ratio = self.snap_new_ratio(strategy.new_ratio);

        strategy
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
    let valid: Vec<i32> = grid.iter().filter(|&&v| v >= min && v <= max).copied().collect();
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
