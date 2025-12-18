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

pub struct EnsembleDecision {
    feature_flags: FeatureFlags,
    heuristic: HeuristicLearner,
    thompson_weight: f64,
    linucb_weight: f64,
    heuristic_weight: f64,
}

impl EnsembleDecision {
    pub fn new(feature_flags: FeatureFlags) -> Self {
        Self {
            feature_flags,
            heuristic: HeuristicLearner::default(),
            thompson_weight: 0.4,
            linucb_weight: 0.4,
            heuristic_weight: 0.2,
        }
    }

    pub fn decide(
        &self,
        state: &UserState,
        _feature_vector: &FeatureVector,
        current: &StrategyParams,
        thompson_action: Option<&StrategyParams>,
        linucb_action: Option<&StrategyParams>,
    ) -> (StrategyParams, Vec<DecisionCandidate>) {
        let mut candidates: Vec<DecisionCandidate> = Vec::new();

        if self.feature_flags.heuristic_enabled {
            let heuristic_strategy = self.heuristic.suggest(state, current);
            let heuristic_conf = self.heuristic.confidence(state);
            candidates.push(DecisionCandidate {
                source: "heuristic".to_string(),
                strategy: heuristic_strategy,
                confidence: heuristic_conf,
                weight: self.heuristic_weight,
            });
        }

        if self.feature_flags.thompson_enabled {
            if let Some(action) = thompson_action {
                candidates.push(DecisionCandidate {
                    source: "thompson".to_string(),
                    strategy: action.clone(),
                    confidence: 0.7,
                    weight: self.thompson_weight,
                });
            }
        }

        if let Some(action) = linucb_action {
            candidates.push(DecisionCandidate {
                source: "linucb".to_string(),
                strategy: action.clone(),
                confidence: state.conf,
                weight: self.linucb_weight,
            });
        }

        if candidates.is_empty() {
            return (current.clone(), vec![]);
        }

        let final_strategy = self.weighted_merge(&candidates);
        (final_strategy, candidates)
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

        let difficulty = if difficulty_scores[2] > difficulty_scores[1] && difficulty_scores[2] > difficulty_scores[0] {
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
            .min_by(|a, b| ((*a) - value).abs().partial_cmp(&((*b) - value).abs()).unwrap())
            .unwrap_or(&1.0)
    }

    fn snap_new_ratio(&self, value: f64) -> f64 {
        let options = [0.1, 0.2, 0.3, 0.4];
        *options
            .iter()
            .min_by(|a, b| ((*a) - value).abs().partial_cmp(&((*b) - value).abs()).unwrap())
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

impl Default for EnsembleDecision {
    fn default() -> Self {
        Self::new(FeatureFlags::default())
    }
}
