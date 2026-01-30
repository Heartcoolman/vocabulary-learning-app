//! MSMT (Multi-Scale Memory Trace) - Original multi-scale memory algorithm
//!
//! Replaces ACT-R with multi-scale exponential traces:
//! τ = [1h, 24h, 168h] for short/medium/long term memory
//!
//! Parameters:
//! - threshold = 0.3
//! - slope = 1.5
//! - max_history = 100
//! - correct_weight = 1.0
//! - incorrect_weight = 0.2

use serde::{Deserialize, Serialize};

const TAU_SHORT: f64 = 1.0;    // 1 hour
const TAU_MEDIUM: f64 = 24.0;  // 24 hours
const TAU_LONG: f64 = 168.0;   // 168 hours (7 days)
const THRESHOLD: f64 = 0.3;
const SLOPE: f64 = 1.5;
const MAX_HISTORY: usize = 100;
const CORRECT_WEIGHT: f64 = 1.0;
const INCORRECT_WEIGHT: f64 = 0.2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewEvent {
    pub timestamp_hours: f64,
    pub is_correct: bool,
}

pub struct MsmtModel;

impl MsmtModel {
    fn compute_trace(events: &[ReviewEvent], now_hours: f64, tau: f64) -> f64 {
        events.iter().fold(0.0, |acc, e| {
            let delta = (now_hours - e.timestamp_hours).max(0.0);
            let weight = if e.is_correct { CORRECT_WEIGHT } else { INCORRECT_WEIGHT };
            acc + weight * (-delta / tau).exp()
        })
    }

    fn sigmoid(x: f64) -> f64 {
        1.0 / (1.0 + (-(x - THRESHOLD) * SLOPE).exp())
    }

    pub fn predict_recall(events: &[ReviewEvent], now_hours: f64) -> f64 {
        if events.is_empty() {
            return 0.0;
        }

        let events: Vec<_> = if events.len() > MAX_HISTORY {
            events[events.len() - MAX_HISTORY..].to_vec()
        } else {
            events.to_vec()
        };

        let t_short = Self::compute_trace(&events, now_hours, TAU_SHORT);
        let t_medium = Self::compute_trace(&events, now_hours, TAU_MEDIUM);
        let t_long = Self::compute_trace(&events, now_hours, TAU_LONG);

        let combined = 0.2 * t_short + 0.3 * t_medium + 0.5 * t_long;
        Self::sigmoid(combined).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_history() {
        let p = MsmtModel::predict_recall(&[], 0.0);
        assert!((p - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_single_correct_review() {
        let events = vec![ReviewEvent { timestamp_hours: 0.0, is_correct: true }];
        let p = MsmtModel::predict_recall(&events, 0.0);
        assert!(p > 0.5);
    }

    #[test]
    fn test_recall_decays() {
        let events = vec![ReviewEvent { timestamp_hours: 0.0, is_correct: true }];
        let p0 = MsmtModel::predict_recall(&events, 0.0);
        let p24 = MsmtModel::predict_recall(&events, 24.0);
        let p168 = MsmtModel::predict_recall(&events, 168.0);
        assert!(p24 < p0);
        assert!(p168 < p24);
    }

    #[test]
    fn test_incorrect_has_lower_weight() {
        let correct = vec![ReviewEvent { timestamp_hours: 0.0, is_correct: true }];
        let incorrect = vec![ReviewEvent { timestamp_hours: 0.0, is_correct: false }];
        let pc = MsmtModel::predict_recall(&correct, 0.0);
        let pi = MsmtModel::predict_recall(&incorrect, 0.0);
        assert!(pc > pi);
    }
}
