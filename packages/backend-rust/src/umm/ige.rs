//! IGE (Information Gain Exploration) - Original decision algorithm
//!
//! Replaces Thompson Sampling with information gain driven deterministic selection.
//! Uses global + context layered statistics.
//!
//! Parameters:
//! - β = 1.0 (exploration weight)
//! - context_weight = 0.7
//! - ess_k = 5 (effective sample size factor)
//! - min_confidence = 0.4
//! - max_confidence = 0.98

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const BETA: f64 = 1.0;
const CONTEXT_WEIGHT: f64 = 0.7;
const ESS_K: f64 = 5.0;
const MIN_CONFIDENCE: f64 = 0.4;
const MAX_CONFIDENCE: f64 = 0.98;
const EPSILON: f64 = 1e-6;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StrategyStats {
    pub successes: f64,
    pub trials: f64,
}

impl StrategyStats {
    pub fn mean(&self) -> f64 {
        if self.trials < EPSILON {
            0.5
        } else {
            self.successes / self.trials
        }
    }

    pub fn variance(&self) -> f64 {
        if self.trials < 2.0 {
            0.25
        } else {
            let p = self.mean();
            p * (1.0 - p) / self.trials
        }
    }

    pub fn update(&mut self, reward: f64) {
        self.trials += 1.0;
        self.successes += reward;
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IgeModel {
    global: HashMap<String, StrategyStats>,
    context: HashMap<String, HashMap<String, StrategyStats>>,
}

impl IgeModel {
    pub fn new() -> Self {
        Self::default()
    }

    fn information_gain(&self, strategy: &str, context_key: Option<&str>) -> f64 {
        let global_stats = self.global.get(strategy);
        let context_stats = context_key.and_then(|ck| {
            self.context.get(ck).and_then(|m| m.get(strategy))
        });

        let (g_mean, g_var) = global_stats
            .map(|s| (s.mean(), s.variance()))
            .unwrap_or((0.5, 0.25));

        let (c_mean, c_var) = context_stats
            .map(|s| (s.mean(), s.variance()))
            .unwrap_or((0.5, 0.25));

        let mean = CONTEXT_WEIGHT * c_mean + (1.0 - CONTEXT_WEIGHT) * g_mean;
        let var = CONTEXT_WEIGHT * c_var + (1.0 - CONTEXT_WEIGHT) * g_var;

        mean + BETA * var.sqrt()
    }

    pub fn select_action(&self, candidates: &[String], context_key: Option<&str>) -> Option<String> {
        if candidates.is_empty() {
            return None;
        }

        let mut scored: Vec<_> = candidates
            .iter()
            .map(|c| (c.clone(), self.information_gain(c, context_key)))
            .collect();

        scored.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.0.cmp(&b.0))
        });

        scored.first().map(|(s, _)| s.clone())
    }

    pub fn update(&mut self, strategy: &str, reward: f64, context_key: Option<&str>) {
        self.global
            .entry(strategy.to_string())
            .or_default()
            .update(reward);

        if let Some(ck) = context_key {
            self.context
                .entry(ck.to_string())
                .or_default()
                .entry(strategy.to_string())
                .or_default()
                .update(reward);
        }
    }

    pub fn get_confidence(&self, strategy: &str, context_key: Option<&str>) -> f64 {
        let global_trials = self.global.get(strategy).map(|s| s.trials).unwrap_or(0.0);
        let context_trials = context_key
            .and_then(|ck| self.context.get(ck))
            .and_then(|m| m.get(strategy))
            .map(|s| s.trials)
            .unwrap_or(0.0);

        let ess = global_trials + CONTEXT_WEIGHT * context_trials;
        let conf = 1.0 - (1.0 / (1.0 + ess / ESS_K));
        conf.clamp(MIN_CONFIDENCE, MAX_CONFIDENCE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cold_start() {
        let model = IgeModel::new();
        let result = model.select_action(&["a".into(), "b".into()], None);
        assert!(result.is_some());
    }

    #[test]
    fn test_update_affects_selection() {
        let mut model = IgeModel::new();
        for _ in 0..10 {
            model.update("good", 1.0, None);
            model.update("bad", 0.0, None);
        }
        let result = model.select_action(&["good".into(), "bad".into()], None);
        assert_eq!(result, Some("good".into()));
    }

    #[test]
    fn test_confidence_increases() {
        let mut model = IgeModel::new();
        let c0 = model.get_confidence("test", None);
        for _ in 0..10 {
            model.update("test", 0.5, None);
        }
        let c1 = model.get_confidence("test", None);
        assert!(c1 > c0);
    }

    #[test]
    fn test_tie_break_by_key() {
        let model = IgeModel::new();
        let result = model.select_action(&["b".into(), "a".into()], None);
        assert_eq!(result, Some("a".into()));
    }
}
