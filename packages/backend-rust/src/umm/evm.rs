//! EVM (Encoding Variability Metric) - Vocabulary specialization
//!
//! Computes bonus based on context variability (encoding specificity principle).
//!
//! Parameters:
//! - β = 0.15 (variability weight)
//! - max_bonus = 0.15
//! - max_history = 50
//! - Dimensions: hour_of_day, day_of_week, question_type, device_type

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const BETA: f64 = 0.15;
const MAX_BONUS: f64 = 0.15;
const MAX_HISTORY: usize = 50;
const NUM_DIMENSIONS: usize = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEntry {
    pub hour_of_day: u8,
    pub day_of_week: u8,
    pub question_type: String,
    pub device_type: String,
}

pub struct EvmModel;

impl EvmModel {
    pub fn compute_bonus(history: &[ContextEntry]) -> f64 {
        if history.is_empty() {
            return 0.0;
        }

        let history: Vec<_> = if history.len() > MAX_HISTORY {
            history[history.len() - MAX_HISTORY..].to_vec()
        } else {
            history.to_vec()
        };

        let hour_bins: HashSet<_> = history.iter().map(|e| e.hour_of_day / 4).collect();
        let day_bins: HashSet<_> = history.iter().map(|e| e.day_of_week).collect();
        let types: HashSet<_> = history.iter().map(|e| e.question_type.clone()).collect();
        let devices: HashSet<_> = history.iter().map(|e| e.device_type.clone()).collect();

        let hour_var = (hour_bins.len() as f64 - 1.0).max(0.0) / 5.0;
        let day_var = (day_bins.len() as f64 - 1.0).max(0.0) / 6.0;
        let type_var = (types.len() as f64 - 1.0).max(0.0) / 3.0;
        let device_var = (devices.len() as f64 - 1.0).max(0.0) / 2.0;

        let variability = (hour_var + day_var + type_var + device_var) / NUM_DIMENSIONS as f64;
        (BETA * variability).min(MAX_BONUS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_history() {
        assert!((EvmModel::compute_bonus(&[]) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_single_entry() {
        let history = vec![ContextEntry {
            hour_of_day: 10,
            day_of_week: 1,
            question_type: "multiple_choice".into(),
            device_type: "desktop".into(),
        }];
        assert!((EvmModel::compute_bonus(&history) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_varied_contexts() {
        let history = vec![
            ContextEntry {
                hour_of_day: 8,
                day_of_week: 1,
                question_type: "multiple_choice".into(),
                device_type: "desktop".into(),
            },
            ContextEntry {
                hour_of_day: 14,
                day_of_week: 3,
                question_type: "spelling".into(),
                device_type: "mobile".into(),
            },
            ContextEntry {
                hour_of_day: 20,
                day_of_week: 5,
                question_type: "listening".into(),
                device_type: "tablet".into(),
            },
        ];
        let bonus = EvmModel::compute_bonus(&history);
        assert!(bonus > 0.0);
        assert!(bonus <= MAX_BONUS);
    }
}
