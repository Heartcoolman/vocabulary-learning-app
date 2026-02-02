//! Memory Engine - Unified entry point for all AMAS memory algorithms
//!
//! Combines:
//! - MDM for retrievability calculation
//! - MTP/IAD/EVM for vocabulary-specific adjustments
//! - MSMT for multi-scale memory trace

use serde::{Deserialize, Serialize};

use crate::amas::{
    memory::mdm::MdmState,
    vocabulary::{
        evm::{ContextEntry, EvmModel},
        iad::{ConfusionPair, IadModel},
        mtp::{MorphemeState, MtpModel},
    },
};

const MULT_MIN: f64 = 0.5;
const MULT_MAX: f64 = 2.0;
const R_BASE_TARGET_MIN: f64 = 0.05;
const R_BASE_TARGET_MAX: f64 = 0.97;
const EPSILON: f64 = 1e-6;

/// Shadow calculation result for MDM vs FSRS comparison
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowResult {
    pub fsrs_interval: f64,
    pub fsrs_retrievability: f64,
    pub fsrs_stability: f64,
    pub fsrs_difficulty: f64,
    pub mdm_interval: Option<f64>,
    pub mdm_retrievability: Option<f64>,
    pub mdm_strength: Option<f64>,
    pub mdm_consolidation: Option<f64>,
    pub mtp_bonus: Option<f64>,
    pub iad_penalty: Option<f64>,
    pub evm_bonus: Option<f64>,
    pub amas_retrievability: Option<f64>,
    pub amas_interval: Option<f64>,
}

pub struct MemoryEngine;

impl MemoryEngine {
    pub fn compute_retrievability(
        mdm_state: &MdmState,
        elapsed_days: f64,
        morpheme_states: &[MorphemeState],
        confusion_pairs: &[ConfusionPair],
        recent_word_ids: &[String],
        context_history: &[ContextEntry],
    ) -> f64 {
        let r_base = mdm_state.retrievability(elapsed_days);
        let bonus_mtp = MtpModel::compute_bonus(morpheme_states);
        let penalty_iad = IadModel::compute_penalty(confusion_pairs, recent_word_ids);
        let bonus_evm = EvmModel::compute_bonus(context_history);

        let mult = (1.0 + bonus_mtp) * (1.0 + bonus_evm) * (1.0 - penalty_iad);
        let mult = mult.clamp(MULT_MIN, MULT_MAX);

        (r_base * mult).clamp(0.0, 1.0)
    }

    pub fn compute_interval(
        mdm_state: &MdmState,
        r_target: f64,
        morpheme_states: &[MorphemeState],
        confusion_pairs: &[ConfusionPair],
        recent_word_ids: &[String],
        context_history: &[ContextEntry],
    ) -> f64 {
        let bonus_mtp = MtpModel::compute_bonus(morpheme_states);
        let penalty_iad = IadModel::compute_penalty(confusion_pairs, recent_word_ids);
        let bonus_evm = EvmModel::compute_bonus(context_history);

        let mult = (1.0 + bonus_mtp) * (1.0 + bonus_evm) * (1.0 - penalty_iad);
        let mult = mult.clamp(MULT_MIN, MULT_MAX);

        let r_base_target = if mult.abs() < EPSILON {
            r_target
        } else {
            r_target / mult
        };
        let r_base_target = r_base_target.clamp(R_BASE_TARGET_MIN, R_BASE_TARGET_MAX);

        mdm_state.interval_for_target(r_base_target)
    }

    pub fn compute_shadow(
        fsrs_interval: f64,
        fsrs_retrievability: f64,
        fsrs_stability: f64,
        fsrs_difficulty: f64,
        mdm_state: Option<&MdmState>,
        elapsed_days: f64,
        r_target: f64,
        morpheme_states: &[MorphemeState],
        confusion_pairs: &[ConfusionPair],
        recent_word_ids: &[String],
        context_history: &[ContextEntry],
    ) -> ShadowResult {
        let mtp_bonus = if morpheme_states.is_empty() {
            None
        } else {
            Some(MtpModel::compute_bonus(morpheme_states))
        };

        let iad_penalty = if confusion_pairs.is_empty() || recent_word_ids.is_empty() {
            None
        } else {
            Some(IadModel::compute_penalty(confusion_pairs, recent_word_ids))
        };

        let evm_bonus = if context_history.is_empty() {
            None
        } else {
            Some(EvmModel::compute_bonus(context_history))
        };

        let (
            mdm_interval,
            mdm_retrievability,
            mdm_strength,
            mdm_consolidation,
            amas_retrievability,
            amas_interval,
        ) = if let Some(mdm) = mdm_state {
            let r_base = mdm.retrievability(elapsed_days);

            let bonus_mtp = mtp_bonus.unwrap_or(0.0);
            let penalty_iad = iad_penalty.unwrap_or(0.0);
            let bonus_evm = evm_bonus.unwrap_or(0.0);

            let mult = (1.0 + bonus_mtp) * (1.0 + bonus_evm) * (1.0 - penalty_iad);
            let mult = mult.clamp(MULT_MIN, MULT_MAX);

            let umm_r = (r_base * mult).clamp(0.0, 1.0);

            let r_base_target = if mult.abs() < EPSILON {
                r_target
            } else {
                r_target / mult
            };
            let r_base_target = r_base_target.clamp(R_BASE_TARGET_MIN, R_BASE_TARGET_MAX);
            let interval = mdm.interval_for_target(r_base_target);

            (
                Some(interval),
                Some(r_base),
                Some(mdm.strength),
                Some(mdm.consolidation),
                Some(umm_r),
                Some(interval),
            )
        } else {
            (None, None, None, None, None, None)
        };

        ShadowResult {
            fsrs_interval,
            fsrs_retrievability,
            fsrs_stability,
            fsrs_difficulty,
            mdm_interval,
            mdm_retrievability,
            mdm_strength,
            mdm_consolidation,
            mtp_bonus,
            iad_penalty,
            evm_bonus,
            amas_retrievability,
            amas_interval,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_retrievability() {
        let state = MdmState::default();
        let r = MemoryEngine::compute_retrievability(&state, 0.0, &[], &[], &[], &[]);
        assert!((r - 1.0).abs() < EPSILON);
    }

    #[test]
    fn test_mtp_bonus_increases_r() {
        let state = MdmState::default();
        let morphemes = vec![MorphemeState {
            morpheme_id: "pre".into(),
            mastery_level: 5.0,
        }];
        let r_base = MemoryEngine::compute_retrievability(&state, 1.0, &[], &[], &[], &[]);
        let r_with_mtp =
            MemoryEngine::compute_retrievability(&state, 1.0, &morphemes, &[], &[], &[]);
        assert!(r_with_mtp >= r_base);
    }

    #[test]
    fn test_iad_penalty_decreases_r() {
        let state = MdmState::default();
        let pairs = vec![ConfusionPair {
            confusing_word_id: "w1".into(),
            distance: 0.0,
        }];
        let recent = vec!["w1".into()];
        let r_base = MemoryEngine::compute_retrievability(&state, 1.0, &[], &[], &[], &[]);
        let r_with_iad =
            MemoryEngine::compute_retrievability(&state, 1.0, &[], &pairs, &recent, &[]);
        assert!(r_with_iad <= r_base);
    }

    #[test]
    fn test_interval_computation() {
        let state = MdmState::default();
        let interval = MemoryEngine::compute_interval(&state, 0.9, &[], &[], &[], &[]);
        assert!(interval > 0.0);
    }

    #[test]
    fn test_shadow_computation() {
        let mdm = MdmState::default();
        let result = MemoryEngine::compute_shadow(
            1.0, 0.9, 5.0, 0.3,
            Some(&mdm), 1.0, 0.9,
            &[], &[], &[], &[],
        );
        assert!(result.mdm_interval.is_some());
        assert!(result.amas_retrievability.is_some());
    }

    #[test]
    fn test_computation_performance() {
        use std::time::Instant;

        let mdm = MdmState::default();
        let morphemes = vec![
            MorphemeState {
                morpheme_id: "pre".into(),
                mastery_level: 3.0,
            },
            MorphemeState {
                morpheme_id: "root".into(),
                mastery_level: 4.0,
            },
        ];
        let pairs = vec![
            ConfusionPair {
                confusing_word_id: "w1".into(),
                distance: 0.5,
            },
            ConfusionPair {
                confusing_word_id: "w2".into(),
                distance: 0.3,
            },
        ];
        let recent = vec!["w1".into(), "w3".into()];
        let context = vec![
            ContextEntry {
                hour_of_day: 10,
                day_of_week: 1,
                question_type: "mc".into(),
                device_type: "desktop".into(),
            },
            ContextEntry {
                hour_of_day: 14,
                day_of_week: 2,
                question_type: "typing".into(),
                device_type: "mobile".into(),
            },
        ];

        for _ in 0..100 {
            let _ = MemoryEngine::compute_shadow(
                1.0, 0.9, 5.0, 0.3,
                Some(&mdm), 1.0, 0.9,
                &morphemes, &pairs, &recent, &context,
            );
        }

        let iterations = 1000;
        let start = Instant::now();
        for _ in 0..iterations {
            let _ = MemoryEngine::compute_shadow(
                1.0, 0.9, 5.0, 0.3,
                Some(&mdm), 1.0, 0.9,
                &morphemes, &pairs, &recent, &context,
            );
        }
        let elapsed = start.elapsed();
        let avg_micros = elapsed.as_micros() as f64 / iterations as f64;

        assert!(
            avg_micros < 10000.0,
            "Memory computation too slow: {:.2}us",
            avg_micros
        );

        assert!(
            avg_micros < 100.0,
            "Memory computation should be < 100us, got {:.2}us",
            avg_micros
        );
    }
}
