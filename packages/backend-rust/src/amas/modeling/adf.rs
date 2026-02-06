use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdfConfig {
    pub alpha_base: f64,
    pub process_noise: f64,
}

impl Default for AdfConfig {
    fn default() -> Self {
        Self {
            alpha_base: 0.7,
            process_noise: 0.01,
        }
    }
}

pub struct AdfFeatures {
    pub rt_norm: f64,
    pub accuracy: f64,
    pub pause_count: f64,
    pub switch_count: f64,
    pub focus_loss: f64,
    pub interaction_density: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdfState {
    pub attention: f64,
    pub prev_observation: f64,
}

impl Default for AdfState {
    fn default() -> Self {
        Self {
            attention: 0.7,
            prev_observation: 0.7,
        }
    }
}

pub struct AttentionDynamicsFilter {
    config: AdfConfig,
}

impl Default for AttentionDynamicsFilter {
    fn default() -> Self {
        Self::new(AdfConfig::default())
    }
}

impl AttentionDynamicsFilter {
    pub fn new(config: AdfConfig) -> Self {
        Self { config }
    }

    fn compute_observation(features: &AdfFeatures) -> f64 {
        let weights = [0.25, 0.25, -0.15, -0.10, -0.15, 0.10];
        let raw = [
            features.accuracy.clamp(0.0, 1.0),
            (1.0 - features.rt_norm.clamp(0.0, 1.0)),
            features.pause_count.clamp(0.0, 10.0) / 10.0,
            features.switch_count.clamp(0.0, 10.0) / 10.0,
            features.focus_loss.clamp(0.0, 1.0),
            features.interaction_density.clamp(0.0, 1.0),
        ];

        let phi: f64 = raw.iter().zip(weights.iter()).map(|(r, w)| r * w).sum();
        // σ(tanh(phi)) normalized to [0,1]
        let activated = phi.tanh();
        (activated + 1.0) / 2.0
    }

    pub fn update(&self, state: &mut AdfState, features: &AdfFeatures) -> f64 {
        let observation = Self::compute_observation(features);
        let delta = (observation - state.prev_observation).abs();
        let alpha = self.config.alpha_base * (1.0 - delta.clamp(0.0, 1.0));

        state.attention = (alpha * state.attention + (1.0 - alpha) * observation).clamp(0.0, 1.0);
        state.prev_observation = observation;
        state.attention
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn good_features() -> AdfFeatures {
        AdfFeatures {
            rt_norm: 0.3,
            accuracy: 0.9,
            pause_count: 0.0,
            switch_count: 0.0,
            focus_loss: 0.0,
            interaction_density: 0.7,
        }
    }

    fn bad_features() -> AdfFeatures {
        AdfFeatures {
            rt_norm: 0.9,
            accuracy: 0.2,
            pause_count: 5.0,
            switch_count: 4.0,
            focus_loss: 0.6,
            interaction_density: 0.1,
        }
    }

    #[test]
    fn test_high_attention_good_features() {
        let adf = AttentionDynamicsFilter::default();
        let mut state = AdfState::default();
        let a = adf.update(&mut state, &good_features());
        assert!(a > 0.5);
    }

    #[test]
    fn test_low_attention_bad_features() {
        let adf = AttentionDynamicsFilter::default();
        let mut state = AdfState::default();
        for _ in 0..20 {
            adf.update(&mut state, &bad_features());
        }
        assert!(state.attention < 0.5);
    }

    #[test]
    fn test_bounded() {
        let adf = AttentionDynamicsFilter::default();
        let mut state = AdfState::default();
        for _ in 0..100 {
            let a = adf.update(&mut state, &good_features());
            assert!(a >= 0.0 && a <= 1.0);
        }
        for _ in 0..100 {
            let a = adf.update(&mut state, &bad_features());
            assert!(a >= 0.0 && a <= 1.0);
        }
    }

    #[test]
    fn test_sudden_change_fast_response() {
        let adf = AttentionDynamicsFilter::default();
        let mut state = AdfState::default();
        for _ in 0..10 {
            adf.update(&mut state, &good_features());
        }
        let before = state.attention;
        adf.update(&mut state, &bad_features());
        let change = (before - state.attention).abs();
        // Should respond noticeably to sudden change
        assert!(change > 0.05);
    }
}
