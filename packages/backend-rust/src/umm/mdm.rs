//! MDM (Memory Dynamics Model) - Original memory dynamics algorithm
//!
//! Replaces FSRS with differential equation based memory decay:
//! dM/dt = -λ(M,C) × M where λ(M,C) = λ_0 × e^(-α×M) × (1 - η×C)
//!
//! Parameters:
//! - λ_0 = 0.3 (base decay rate)
//! - α = 0.5 (strength dampening)
//! - η = 0.4 (consolidation effect)
//! - M_max = 10.0 (maximum strength)
//! - κ = 0.2 (consolidation growth rate)
//! - μ = 0.25 (consolidation update factor)

use serde::{Deserialize, Serialize};

const LAMBDA_0: f64 = 0.3;
const ALPHA: f64 = 0.5;
const ETA: f64 = 0.4;
const M_MAX: f64 = 10.0;
const M_MIN: f64 = 0.1;
const KAPPA: f64 = 0.2;
const MU: f64 = 0.25;
const EPSILON: f64 = 1e-6;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdmState {
    pub strength: f64,
    pub consolidation: f64,
    pub last_review_ts: i64,
}

impl Default for MdmState {
    fn default() -> Self {
        Self {
            strength: 1.0,
            consolidation: 0.1,
            last_review_ts: 0,
        }
    }
}

impl MdmState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_fsrs(stability: f64, difficulty: f64) -> Self {
        Self {
            strength: (stability + 1.0).ln().clamp(M_MIN, M_MAX),
            consolidation: (1.0 - difficulty / 10.0).clamp(0.0, 1.0),
            last_review_ts: 0,
        }
    }

    fn lambda(&self) -> f64 {
        LAMBDA_0 * (-ALPHA * self.strength).exp() * (1.0 - ETA * self.consolidation)
    }

    pub fn retrievability(&self, elapsed_days: f64) -> f64 {
        if elapsed_days <= EPSILON {
            return 1.0;
        }
        let lambda = self.lambda();
        let decay = (-lambda * elapsed_days).exp();
        decay.clamp(0.0, 1.0)
    }

    pub fn update(&mut self, quality: f64, now_ts: i64) {
        let delta_m = quality * (M_MAX - self.strength) * KAPPA;
        self.strength = (self.strength + delta_m).clamp(M_MIN, M_MAX);

        let delta_c = MU * quality * (1.0 - self.consolidation);
        self.consolidation = (self.consolidation + delta_c).clamp(0.0, 1.0);

        self.last_review_ts = now_ts;
    }

    pub fn interval_for_target(&self, r_target: f64) -> f64 {
        let r_target = r_target.clamp(0.05, 0.97);
        let lambda = self.lambda();
        if lambda <= EPSILON {
            return 365.0;
        }
        let interval = -r_target.ln() / lambda;
        interval.clamp(0.0, 365.0)
    }
}

pub fn compute_quality(is_correct: bool, response_time_ms: i64, hints_used: i32) -> f64 {
    if !is_correct {
        return 0.0;
    }
    let rt_factor = 1.0 - (response_time_ms as f64 / 30000.0).min(1.0);
    let hint_factor = 1.0 - (hints_used as f64 / 3.0).min(1.0);
    (0.5 + 0.3 * rt_factor + 0.2 * hint_factor).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_state() {
        let state = MdmState::default();
        assert!((state.strength - 1.0).abs() < EPSILON);
        assert!((state.consolidation - 0.1).abs() < EPSILON);
    }

    #[test]
    fn test_retrievability_decays() {
        let state = MdmState::default();
        let r0 = state.retrievability(0.0);
        let r1 = state.retrievability(1.0);
        let r7 = state.retrievability(7.0);
        assert!((r0 - 1.0).abs() < EPSILON);
        assert!(r1 < r0);
        assert!(r7 < r1);
    }

    #[test]
    fn test_update_increases_strength() {
        let mut state = MdmState::default();
        let initial = state.strength;
        state.update(1.0, 1000);
        assert!(state.strength > initial);
    }

    #[test]
    fn test_quality_mapping() {
        assert!((compute_quality(false, 0, 0) - 0.0).abs() < EPSILON);
        let q = compute_quality(true, 0, 0);
        assert!(q > 0.7);
        let q_slow = compute_quality(true, 30000, 0);
        assert!(q_slow < q);
    }
}
