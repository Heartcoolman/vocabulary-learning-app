//! IAD (Interference Attenuation by Distance) - Vocabulary specialization
//!
//! Computes penalty based on recently seen confusing words.
//!
//! Parameters:
//! - max_penalty = 0.50
//! - window_size = 20 (session window)
//! - max_distance = 1.0

use serde::{Deserialize, Serialize};

const MAX_PENALTY: f64 = 0.50;
const WINDOW_SIZE: usize = 20;
const MAX_DISTANCE: f64 = 1.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfusionPair {
    pub confusing_word_id: String,
    pub distance: f64,
}

pub struct IadModel;

impl IadModel {
    pub fn compute_penalty(confusion_pairs: &[ConfusionPair], recent_word_ids: &[String]) -> f64 {
        if confusion_pairs.is_empty() || recent_word_ids.is_empty() {
            return 0.0;
        }

        let window: Vec<_> = if recent_word_ids.len() > WINDOW_SIZE {
            recent_word_ids[recent_word_ids.len() - WINDOW_SIZE..].to_vec()
        } else {
            recent_word_ids.to_vec()
        };

        let mut penalty = 0.0;
        for pair in confusion_pairs {
            if window.contains(&pair.confusing_word_id) {
                let weight = 1.0 - (pair.distance / MAX_DISTANCE).min(1.0);
                penalty += weight * MAX_PENALTY / WINDOW_SIZE as f64;
            }
        }

        penalty.min(MAX_PENALTY)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_confusion() {
        let pairs = vec![];
        let recent = vec!["word1".into()];
        assert!((IadModel::compute_penalty(&pairs, &recent) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_no_recent_words() {
        let pairs = vec![ConfusionPair {
            confusing_word_id: "word1".into(),
            distance: 0.5,
        }];
        assert!((IadModel::compute_penalty(&pairs, &[]) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_single_match() {
        let pairs = vec![ConfusionPair {
            confusing_word_id: "word1".into(),
            distance: 0.0,
        }];
        let recent = vec!["word1".into()];
        let penalty = IadModel::compute_penalty(&pairs, &recent);
        assert!(penalty > 0.0);
        assert!(penalty <= MAX_PENALTY);
    }

    #[test]
    fn test_distance_reduces_penalty() {
        let pairs_close = vec![ConfusionPair {
            confusing_word_id: "word1".into(),
            distance: 0.0,
        }];
        let pairs_far = vec![ConfusionPair {
            confusing_word_id: "word1".into(),
            distance: 0.9,
        }];
        let recent = vec!["word1".into()];
        let p_close = IadModel::compute_penalty(&pairs_close, &recent);
        let p_far = IadModel::compute_penalty(&pairs_far, &recent);
        assert!(p_close > p_far);
    }
}
