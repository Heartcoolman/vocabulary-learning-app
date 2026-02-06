use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AucConfig {
    pub theta_confident: f64,
    pub theta_entropy: f64,
    pub max_samples: u32,
}

impl Default for AucConfig {
    fn default() -> Self {
        Self {
            theta_confident: 0.8,
            theta_entropy: 0.5,
            max_samples: 10,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UserType {
    Fast,
    Stable,
    Cautious,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AucState {
    pub priors: [f64; 3], // [Fast, Stable, Cautious]
    pub sample_count: u32,
    pub classified: Option<UserType>,
}

impl Default for AucState {
    fn default() -> Self {
        Self {
            priors: [1.0 / 3.0; 3],
            sample_count: 0,
            classified: None,
        }
    }
}

pub struct ProbeResponse {
    pub is_correct: bool,
    pub response_time_ms: i64,
    pub difficulty: f64,
}

pub struct ActiveUserClassifier {
    config: AucConfig,
}

impl Default for ActiveUserClassifier {
    fn default() -> Self {
        Self::new(AucConfig::default())
    }
}

impl ActiveUserClassifier {
    pub fn new(config: AucConfig) -> Self {
        Self { config }
    }

    fn likelihood(user_type: UserType, response: &ProbeResponse) -> f64 {
        let rt_s = response.response_time_ms as f64 / 1000.0;
        let correct = response.is_correct;

        match user_type {
            UserType::Fast => {
                let p_correct = if correct { 0.7 } else { 0.3 };
                let p_fast_rt = (-0.5 * (rt_s - 2.0).powi(2)).exp();
                p_correct * p_fast_rt.max(0.01)
            }
            UserType::Stable => {
                let p_correct = if correct { 0.8 } else { 0.2 };
                let p_medium_rt = (-0.3 * (rt_s - 4.0).powi(2)).exp();
                p_correct * p_medium_rt.max(0.01)
            }
            UserType::Cautious => {
                let p_correct = if correct { 0.85 } else { 0.15 };
                let p_slow_rt = (-0.2 * (rt_s - 6.0).powi(2)).exp();
                p_correct * p_slow_rt.max(0.01)
            }
        }
    }

    fn entropy(probs: &[f64; 3]) -> f64 {
        probs
            .iter()
            .filter(|&&p| p > 0.0)
            .map(|&p| -p * p.ln())
            .sum()
    }

    pub fn information_gain(&self, state: &AucState, difficulty: f64) -> f64 {
        let h_before = Self::entropy(&state.priors);

        // Simulate correct and incorrect outcomes
        let fake_correct = ProbeResponse {
            is_correct: true,
            response_time_ms: 3000,
            difficulty,
        };
        let fake_incorrect = ProbeResponse {
            is_correct: false,
            response_time_ms: 3000,
            difficulty,
        };

        let types = [UserType::Fast, UserType::Stable, UserType::Cautious];
        let p_correct: f64 = types
            .iter()
            .enumerate()
            .map(|(i, &t)| state.priors[i] * Self::likelihood(t, &fake_correct))
            .sum();

        let mut posterior_correct = state.priors;
        let mut posterior_incorrect = state.priors;
        for (i, &t) in types.iter().enumerate() {
            posterior_correct[i] *= Self::likelihood(t, &fake_correct);
            posterior_incorrect[i] *= Self::likelihood(t, &fake_incorrect);
        }
        Self::normalize(&mut posterior_correct);
        Self::normalize(&mut posterior_incorrect);

        let h_correct = Self::entropy(&posterior_correct);
        let h_incorrect = Self::entropy(&posterior_incorrect);

        let p_c = p_correct.clamp(0.01, 0.99);
        h_before - (p_c * h_correct + (1.0 - p_c) * h_incorrect)
    }

    fn normalize(probs: &mut [f64; 3]) {
        let sum: f64 = probs.iter().sum();
        if sum > 1e-12 {
            for p in probs.iter_mut() {
                *p /= sum;
            }
        } else {
            *probs = [1.0 / 3.0; 3];
        }
    }

    pub fn update(&self, state: &mut AucState, response: &ProbeResponse) -> AucOutput {
        if state.classified.is_some() {
            return AucOutput {
                probabilities: state.priors,
                classified: state.classified,
                entropy: Self::entropy(&state.priors),
            };
        }

        let types = [UserType::Fast, UserType::Stable, UserType::Cautious];
        for (i, &t) in types.iter().enumerate() {
            state.priors[i] *= Self::likelihood(t, response);
        }
        Self::normalize(&mut state.priors);
        state.sample_count += 1;

        let max_p = state.priors.iter().cloned().fold(0.0f64, f64::max);
        let h = Self::entropy(&state.priors);

        if max_p > self.config.theta_confident
            || h < self.config.theta_entropy
            || state.sample_count >= self.config.max_samples
        {
            let best_idx = state
                .priors
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
                .map(|(i, _)| i)
                .unwrap_or(1);
            state.classified = Some(types[best_idx]);
        }

        AucOutput {
            probabilities: state.priors,
            classified: state.classified,
            entropy: h,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AucOutput {
    pub probabilities: [f64; 3],
    pub classified: Option<UserType>,
    pub entropy: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_uniform() {
        let state = AucState::default();
        for &p in &state.priors {
            assert!((p - 1.0 / 3.0).abs() < 1e-10);
        }
    }

    #[test]
    fn test_fast_user_classified() {
        let auc = ActiveUserClassifier::default();
        let mut state = AucState::default();
        for _ in 0..10 {
            auc.update(
                &mut state,
                &ProbeResponse {
                    is_correct: true,
                    response_time_ms: 2000,
                    difficulty: 0.5,
                },
            );
        }
        assert!(state.classified.is_some());
    }

    #[test]
    fn test_cautious_user_classified() {
        let auc = ActiveUserClassifier::default();
        let mut state = AucState::default();
        for _ in 0..10 {
            auc.update(
                &mut state,
                &ProbeResponse {
                    is_correct: true,
                    response_time_ms: 6000,
                    difficulty: 0.5,
                },
            );
        }
        assert!(state.classified.is_some());
        assert_eq!(state.classified, Some(UserType::Cautious));
    }

    #[test]
    fn test_classification_stops_updating() {
        let auc = ActiveUserClassifier::default();
        let mut state = AucState::default();
        for _ in 0..10 {
            auc.update(
                &mut state,
                &ProbeResponse {
                    is_correct: true,
                    response_time_ms: 2000,
                    difficulty: 0.5,
                },
            );
        }
        let priors_before = state.priors;
        auc.update(
            &mut state,
            &ProbeResponse {
                is_correct: false,
                response_time_ms: 8000,
                difficulty: 0.5,
            },
        );
        assert_eq!(priors_before, state.priors);
    }

    #[test]
    fn test_max_samples_forces_classification() {
        let auc = ActiveUserClassifier::new(AucConfig {
            theta_confident: 0.99,
            theta_entropy: 0.01,
            max_samples: 5,
            ..Default::default()
        });
        let mut state = AucState::default();
        for _ in 0..5 {
            auc.update(
                &mut state,
                &ProbeResponse {
                    is_correct: true,
                    response_time_ms: 4000,
                    difficulty: 0.5,
                },
            );
        }
        assert!(state.classified.is_some());
    }

    #[test]
    fn test_probabilities_sum_to_one() {
        let auc = ActiveUserClassifier::default();
        let mut state = AucState::default();
        for i in 0..8 {
            auc.update(
                &mut state,
                &ProbeResponse {
                    is_correct: i % 3 != 0,
                    response_time_ms: 2000 + (i * 500) as i64,
                    difficulty: 0.5,
                },
            );
            let sum: f64 = state.priors.iter().sum();
            assert!((sum - 1.0).abs() < 1e-10, "Sum = {sum}");
        }
    }

    #[test]
    fn test_information_gain_positive() {
        let auc = ActiveUserClassifier::default();
        let state = AucState::default();
        let ig = auc.information_gain(&state, 0.5);
        assert!(ig >= 0.0);
    }

    #[test]
    fn test_roundtrip_serialization() {
        let state = AucState::default();
        let json = serde_json::to_value(&state).unwrap();
        let restored: AucState = serde_json::from_value(json).unwrap();
        assert_eq!(state.priors, restored.priors);
    }
}
