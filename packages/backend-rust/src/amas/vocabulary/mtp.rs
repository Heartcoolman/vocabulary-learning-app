//! MTP (Morphological Transfer Propagation) - Vocabulary specialization
//!
//! Computes bonus based on known morphemes in a word.
//!
//! Parameters:
//! - α = 0.1 (per-morpheme contribution)
//! - max_bonus = 0.30
//! - masteryLevel_max = 5

use serde::{Deserialize, Serialize};

const ALPHA: f64 = 0.1;
const MAX_BONUS: f64 = 0.30;
const MASTERY_MAX: f64 = 5.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MorphemeState {
    pub morpheme_id: String,
    pub mastery_level: f64,
}

pub struct MtpModel;

impl MtpModel {
    pub fn compute_bonus(morpheme_states: &[MorphemeState]) -> f64 {
        if morpheme_states.is_empty() {
            return 0.0;
        }

        let total: f64 = morpheme_states
            .iter()
            .map(|s| ALPHA * (s.mastery_level / MASTERY_MAX).min(1.0))
            .sum();

        total.min(MAX_BONUS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_morphemes() {
        assert!((MtpModel::compute_bonus(&[]) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_single_morpheme() {
        let states = vec![MorphemeState {
            morpheme_id: "pre".into(),
            mastery_level: 5.0,
        }];
        let bonus = MtpModel::compute_bonus(&states);
        assert!((bonus - ALPHA).abs() < 1e-6);
    }

    #[test]
    fn test_max_bonus_cap() {
        let states: Vec<_> = (0..10)
            .map(|i| MorphemeState {
                morpheme_id: format!("m{}", i),
                mastery_level: 5.0,
            })
            .collect();
        let bonus = MtpModel::compute_bonus(&states);
        assert!((bonus - MAX_BONUS).abs() < 1e-6);
    }
}
