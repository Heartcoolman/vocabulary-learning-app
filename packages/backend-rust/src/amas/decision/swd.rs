//! SWD (Similarity-Weighted Decision) - Original decision algorithm
//!
//! Replaces LinUCB with similarity-weighted k-NN (no matrix inversion).
//!
//! Parameters:
//! - γ = 0.5 (recency weight)
//! - k = 5.0 (softmax temperature)
//! - max_history = 200
//! - ε = 1e-6

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

use crate::amas::types::SwdRecommendation;

const GAMMA: f64 = 0.5;
const K: f64 = 5.0;
const MAX_HISTORY: usize = 200;
const EPSILON: f64 = 1e-6;
const MIN_CONFIDENCE: f64 = 0.4;
const MAX_CONFIDENCE: f64 = 0.98;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub context: Vec<f64>,
    pub strategy: String,
    pub reward: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SwdModel {
    history: VecDeque<HistoryEntry>,
}

impl SwdModel {
    pub fn new() -> Self {
        Self::default()
    }

    fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
        let norm_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();
        if norm_a < EPSILON || norm_b < EPSILON {
            return 0.0;
        }
        (dot / (norm_a * norm_b)).clamp(-1.0, 1.0)
    }

    pub fn select_action(&self, context: &[f64], candidates: &[String]) -> Option<String> {
        if candidates.is_empty() {
            return None;
        }

        if self.history.is_empty() {
            return candidates.first().cloned();
        }

        let mut scores: Vec<(String, f64)> = candidates
            .iter()
            .map(|c| {
                let mut weighted_sum = 0.0;
                let mut weight_total = 0.0;

                for (i, entry) in self.history.iter().rev().enumerate() {
                    if entry.strategy != *c {
                        continue;
                    }
                    let sim = Self::cosine_similarity(context, &entry.context);
                    let recency = GAMMA.powi(i as i32);
                    let weight = (sim + 1.0) / 2.0 * recency;
                    weighted_sum += weight * entry.reward;
                    weight_total += weight;
                }

                let score = if weight_total > EPSILON {
                    weighted_sum / weight_total
                } else {
                    0.5
                };
                (c.clone(), score)
            })
            .collect();

        scores.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.0.cmp(&b.0))
        });

        scores.first().map(|(s, _)| s.clone())
    }

    pub fn update(&mut self, context: Vec<f64>, strategy: String, reward: f64) {
        self.history.push_back(HistoryEntry {
            context,
            strategy,
            reward,
        });
        while self.history.len() > MAX_HISTORY {
            self.history.pop_front();
        }
    }

    pub fn get_confidence(&self, strategy: &str) -> f64 {
        let count = self
            .history
            .iter()
            .filter(|e| e.strategy == strategy)
            .count();
        let conf = 1.0 - (1.0 / (1.0 + count as f64 / K));
        conf.clamp(MIN_CONFIDENCE, MAX_CONFIDENCE)
    }

    pub fn recommend_additional_count(&self, context: &[f64]) -> Option<SwdRecommendation> {
        if self.history.is_empty() || context.is_empty() {
            return None;
        }

        let mut weighted_reward = 0.0;
        let mut weight_total = 0.0;
        let mut valid_entries = 0;

        for (i, entry) in self.history.iter().rev().enumerate() {
            if entry.context.len() != context.len() {
                continue;
            }
            let sim = Self::cosine_similarity(context, &entry.context);
            let recency = GAMMA.powi(i as i32);
            let weight = (sim + 1.0) / 2.0 * recency;
            weighted_reward += weight * entry.reward;
            weight_total += weight;
            valid_entries += 1;
        }

        if weight_total < EPSILON || valid_entries == 0 {
            return None;
        }

        let avg_reward = weighted_reward / weight_total;
        let confidence = self.get_confidence("_global");
        let recommended_count = (avg_reward * 10.0).round() as i32;

        if recommended_count > 0 {
            Some(SwdRecommendation {
                recommended_count,
                confidence,
            })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cold_start() {
        let model = SwdModel::new();
        let result = model.select_action(&[0.5, 0.5], &["a".into(), "b".into()]);
        assert_eq!(result, Some("a".into()));
    }

    #[test]
    fn test_learns_from_history() {
        let mut model = SwdModel::new();
        for _ in 0..5 {
            model.update(vec![1.0, 0.0], "good".into(), 1.0);
            model.update(vec![1.0, 0.0], "bad".into(), 0.0);
        }
        let result = model.select_action(&[1.0, 0.0], &["good".into(), "bad".into()]);
        assert_eq!(result, Some("good".into()));
    }

    #[test]
    fn test_fifo_eviction() {
        let mut model = SwdModel::new();
        for i in 0..250 {
            model.update(vec![i as f64], format!("s{}", i), 0.5);
        }
        assert_eq!(model.history.len(), MAX_HISTORY);
    }

    #[test]
    fn test_zero_vector() {
        let model = SwdModel::new();
        let result = model.select_action(&[0.0, 0.0], &["a".into()]);
        assert_eq!(result, Some("a".into()));
    }
}
