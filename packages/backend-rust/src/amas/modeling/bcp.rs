use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BcpConfig {
    pub drift_rate: f64,
    pub process_noise_diag: f64,
    pub observation_noise_diag: f64,
}

impl Default for BcpConfig {
    fn default() -> Self {
        Self {
            drift_rate: 0.001,
            process_noise_diag: 0.001,
            observation_noise_diag: 0.05,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BcpState {
    pub mu: [f64; 3],       // [mem, speed, stability]
    pub cov: [[f64; 3]; 3], // 3x3 covariance matrix
}

impl Default for BcpState {
    fn default() -> Self {
        Self {
            mu: [0.5, 0.5, 0.5],
            cov: [
                [0.1, 0.0, 0.0],
                [0.0, 0.1, 0.0],
                [0.0, 0.0, 0.1],
            ],
        }
    }
}

pub struct BcpObservation {
    pub accuracy: f64,
    pub speed: f64,        // 1/rt_norm
    pub consistency: f64,  // 1 - error_variance
}

pub struct BayesianCognitiveProfiler {
    config: BcpConfig,
}

impl Default for BayesianCognitiveProfiler {
    fn default() -> Self {
        Self::new(BcpConfig::default())
    }
}

impl BayesianCognitiveProfiler {
    pub fn new(config: BcpConfig) -> Self {
        Self { config }
    }

    pub fn update(&self, state: &mut BcpState, obs: &BcpObservation) -> BcpOutput {
        // Predict step: apply drift and increase uncertainty
        for i in 0..3 {
            state.mu[i] += self.config.drift_rate;
            state.cov[i][i] += self.config.process_noise_diag;
        }

        // Observation vector z (H = I, so z maps directly to state)
        let z = [
            obs.accuracy.clamp(0.0, 1.0),
            obs.speed.clamp(0.0, 1.0),
            obs.consistency.clamp(0.0, 1.0),
        ];

        // Innovation: y = z - H·μ (H = I)
        let y = [z[0] - state.mu[0], z[1] - state.mu[1], z[2] - state.mu[2]];

        // S = Σ + R (H = I)
        let r = self.config.observation_noise_diag;
        let mut s = state.cov;
        for (i, row) in s.iter_mut().enumerate() {
            row[i] += r;
        }

        // K = Σ · S^(-1) (simplified: since S is near-diagonal, use element-wise)
        let mut k = [[0.0f64; 3]; 3];
        for (i, k_row) in k.iter_mut().enumerate() {
            for (j, k_cell) in k_row.iter_mut().enumerate() {
                let s_inv = if s[j][j].abs() > 1e-12 { 1.0 / s[j][j] } else { 0.0 };
                *k_cell = state.cov[i][j] * s_inv;
            }
        }

        // Update: μ' = μ + K·y
        for (i, k_row) in k.iter().enumerate() {
            let correction: f64 = k_row.iter().zip(y.iter()).map(|(ki, yi)| ki * yi).sum();
            state.mu[i] = (state.mu[i] + correction).clamp(0.0, 1.0);
        }

        // Update: Σ' = (I - K·H)·Σ  (H = I, so Σ' = (I - K)·Σ)
        let old_cov = state.cov;
        for (i, k_row) in k.iter().enumerate() {
            for (j, cov_cell) in state.cov[i].iter_mut().enumerate() {
                let ikh: f64 = (0..3).map(|m| k[i][m] * if m == j { 1.0 } else { 0.0 }).sum();
                let id = if i == j { 1.0 } else { 0.0 };
                let factor = id - ikh;
                *cov_cell = (0..3).map(|m| {
                    let f_im = if i == m { factor } else { -k[i][m] };
                    let _ = f_im; // appease
                    0.0
                }).sum::<f64>();
                // Simpler approach: direct formula
                *cov_cell = 0.0;
                for (m, old_cov_row) in old_cov.iter().enumerate() {
                    let i_minus_k = if i == m { 1.0 } else { 0.0 } - k_row[m];
                    *cov_cell += i_minus_k * old_cov_row[j];
                }
                // Ensure positive semi-definite diagonal
                if i == j {
                    *cov_cell = (*cov_cell).max(1e-6);
                }
            }
        }

        let trace: f64 = (0..3).map(|i| state.cov[i][i]).sum();
        let confidence = (1.0 / (1.0 + trace)).clamp(0.0, 1.0);

        BcpOutput {
            mem: state.mu[0],
            speed: state.mu[1],
            stability: state.mu[2],
            confidence,
            covariance_trace: trace,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BcpOutput {
    pub mem: f64,
    pub speed: f64,
    pub stability: f64,
    pub confidence: f64,
    pub covariance_trace: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_state() {
        let state = BcpState::default();
        assert_eq!(state.mu, [0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_high_performance_increases_profile() {
        let bcp = BayesianCognitiveProfiler::default();
        let mut state = BcpState::default();
        for _ in 0..20 {
            bcp.update(&mut state, &BcpObservation {
                accuracy: 0.95,
                speed: 0.9,
                consistency: 0.85,
            });
        }
        assert!(state.mu[0] > 0.5);
        assert!(state.mu[1] > 0.5);
        assert!(state.mu[2] > 0.5);
    }

    #[test]
    fn test_low_performance_decreases_profile() {
        let bcp = BayesianCognitiveProfiler::default();
        let mut state = BcpState::default();
        for _ in 0..20 {
            bcp.update(&mut state, &BcpObservation {
                accuracy: 0.2,
                speed: 0.1,
                consistency: 0.2,
            });
        }
        assert!(state.mu[0] < 0.5);
        assert!(state.mu[1] < 0.5);
    }

    #[test]
    fn test_confidence_increases_with_data() {
        let bcp = BayesianCognitiveProfiler::default();
        let mut state = BcpState::default();
        let c0 = 1.0 / (1.0 + state.cov.iter().enumerate().map(|(i, r)| r[i]).sum::<f64>());
        for _ in 0..10 {
            bcp.update(&mut state, &BcpObservation {
                accuracy: 0.7,
                speed: 0.6,
                consistency: 0.7,
            });
        }
        let c1 = 1.0 / (1.0 + state.cov.iter().enumerate().map(|(i, r)| r[i]).sum::<f64>());
        assert!(c1 > c0);
    }

    #[test]
    fn test_mu_bounded() {
        let bcp = BayesianCognitiveProfiler::default();
        let mut state = BcpState::default();
        for _ in 0..100 {
            bcp.update(&mut state, &BcpObservation {
                accuracy: 1.0,
                speed: 1.0,
                consistency: 1.0,
            });
        }
        for v in state.mu {
            assert!(v >= 0.0 && v <= 1.0);
        }
    }

    #[test]
    fn test_covariance_diagonal_positive() {
        let bcp = BayesianCognitiveProfiler::default();
        let mut state = BcpState::default();
        for _ in 0..50 {
            bcp.update(&mut state, &BcpObservation {
                accuracy: 0.5,
                speed: 0.5,
                consistency: 0.5,
            });
        }
        for i in 0..3 {
            assert!(state.cov[i][i] > 0.0);
        }
    }

    #[test]
    fn test_roundtrip_serialization() {
        let state = BcpState::default();
        let json = serde_json::to_value(&state).unwrap();
        let restored: BcpState = serde_json::from_value(json).unwrap();
        assert_eq!(state.mu, restored.mu);
    }
}
