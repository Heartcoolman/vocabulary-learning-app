use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AirConfig {
    pub theta_initial: f64,
    pub alpha_default: f64,
    pub eta_base: f64,
    pub alpha_eta: f64,
    pub beta_eta: f64,
}

impl Default for AirConfig {
    fn default() -> Self {
        Self {
            theta_initial: 0.0,
            alpha_default: 1.0,
            eta_base: 0.3,
            alpha_eta: 0.05,
            beta_eta: 0.1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AirUserState {
    pub theta: f64,
    pub fisher_info_sum: f64,
    pub response_count: u32,
}

impl Default for AirUserState {
    fn default() -> Self {
        Self {
            theta: 0.0,
            fisher_info_sum: 0.0,
            response_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AirItemParams {
    pub alpha: f64,
    pub beta: f64,
}

impl Default for AirItemParams {
    fn default() -> Self {
        Self {
            alpha: 1.0,
            beta: 0.0,
        }
    }
}

impl AirItemParams {
    pub fn from_elo(difficulty_elo: f64) -> Self {
        Self {
            alpha: 1.0,
            beta: ((difficulty_elo - 1200.0) / 400.0).clamp(-3.0, 3.0),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AirResponse {
    pub is_correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AirUpdateResult {
    pub probability: f64,
    pub theta: f64,
    pub confidence: f64,
    pub se: f64,
    pub fisher_info: f64,
    pub item_alpha: f64,
    pub item_beta: f64,
}

pub struct AdaptiveItemResponse {
    config: AirConfig,
}

impl Default for AdaptiveItemResponse {
    fn default() -> Self {
        Self::new(AirConfig::default())
    }
}

impl AdaptiveItemResponse {
    pub fn new(config: AirConfig) -> Self {
        Self { config }
    }

    pub fn probability(theta: f64, beta: f64, alpha: f64) -> f64 {
        let z = (alpha * (theta - beta)).clamp(-20.0, 20.0);
        1.0 / (1.0 + (-z).exp())
    }

    pub fn fisher_information(alpha: f64, p: f64) -> f64 {
        alpha * alpha * p * (1.0 - p)
    }

    pub fn update(
        &self,
        user: &mut AirUserState,
        item: &mut AirItemParams,
        response: &AirResponse,
    ) -> AirUpdateResult {
        let y = if response.is_correct { 1.0 } else { 0.0 };
        let p = Self::probability(user.theta, item.beta, item.alpha);
        let residual = y - p;

        let eta = self.config.eta_base / (1.0 + user.response_count as f64);

        user.theta = (user.theta + eta * item.alpha * residual).clamp(-3.0, 3.0);

        item.alpha = (item.alpha + self.config.alpha_eta * residual * (user.theta - item.beta))
            .clamp(0.5, 2.5);
        item.beta = (item.beta - self.config.beta_eta * residual).clamp(-3.0, 3.0);

        let fi = Self::fisher_information(item.alpha, p);
        user.fisher_info_sum += fi;
        user.response_count += 1;

        let se = 1.0 / user.fisher_info_sum.max(0.01).sqrt();
        let confidence = 1.0 / (1.0 + se);

        AirUpdateResult {
            probability: p,
            theta: user.theta,
            confidence,
            se,
            fisher_info: fi,
            item_alpha: item.alpha,
            item_beta: item.beta,
        }
    }

    pub fn confidence(fisher_info_sum: f64) -> f64 {
        if fisher_info_sum <= 0.0 {
            return 0.0;
        }
        let se = 1.0 / fisher_info_sum.max(0.01).sqrt();
        1.0 / (1.0 + se)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probability_range() {
        for theta in [-3.0, -1.0, 0.0, 1.0, 3.0] {
            for beta in [-3.0, -1.0, 0.0, 1.0, 3.0] {
                for alpha in [0.5, 1.0, 2.5] {
                    let p = AdaptiveItemResponse::probability(theta, beta, alpha);
                    assert!(
                        p > 0.0 && p < 1.0,
                        "p={p} for theta={theta}, beta={beta}, alpha={alpha}"
                    );
                }
            }
        }
    }

    #[test]
    fn test_higher_ability_higher_probability() {
        let p1 = AdaptiveItemResponse::probability(0.0, 0.0, 1.0);
        let p2 = AdaptiveItemResponse::probability(1.0, 0.0, 1.0);
        assert!(p2 > p1);
    }

    #[test]
    fn test_ability_update_correct() {
        let air = AdaptiveItemResponse::default();
        let mut user = AirUserState::default();
        let mut item = AirItemParams::default();
        let result = air.update(&mut user, &mut item, &AirResponse { is_correct: true });
        assert!(result.theta > 0.0);
    }

    #[test]
    fn test_ability_update_incorrect() {
        let air = AdaptiveItemResponse::default();
        let mut user = AirUserState::default();
        let mut item = AirItemParams::default();
        let result = air.update(&mut user, &mut item, &AirResponse { is_correct: false });
        assert!(result.theta < 0.0);
    }

    #[test]
    fn test_ability_bounded() {
        let air = AdaptiveItemResponse::default();
        let mut user = AirUserState {
            theta: 2.9,
            fisher_info_sum: 0.0,
            response_count: 0,
        };
        let mut item = AirItemParams {
            alpha: 2.5,
            beta: -3.0,
        };
        for _ in 0..100 {
            air.update(&mut user, &mut item, &AirResponse { is_correct: true });
        }
        assert!(user.theta >= -3.0 && user.theta <= 3.0);
    }

    #[test]
    fn test_item_params_bounded() {
        let air = AdaptiveItemResponse::default();
        let mut user = AirUserState::default();
        let mut item = AirItemParams {
            alpha: 2.4,
            beta: 2.9,
        };
        for _ in 0..100 {
            air.update(&mut user, &mut item, &AirResponse { is_correct: true });
        }
        assert!(item.alpha >= 0.5 && item.alpha <= 2.5);
        assert!(item.beta >= -3.0 && item.beta <= 3.0);
    }

    #[test]
    fn test_confidence_increases_with_responses() {
        let air = AdaptiveItemResponse::default();
        let mut user = AirUserState::default();
        let mut item = AirItemParams::default();
        let c0 = AdaptiveItemResponse::confidence(user.fisher_info_sum);
        assert_eq!(c0, 0.0);
        air.update(&mut user, &mut item, &AirResponse { is_correct: true });
        let c1 = AdaptiveItemResponse::confidence(user.fisher_info_sum);
        air.update(&mut user, &mut item, &AirResponse { is_correct: false });
        let c2 = AdaptiveItemResponse::confidence(user.fisher_info_sum);
        assert!(c2 > c1);
        assert!(c1 > c0);
    }

    #[test]
    fn test_fisher_information_positive() {
        for alpha in [0.5, 1.0, 2.5] {
            for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
                let fi = AdaptiveItemResponse::fisher_information(alpha, p);
                assert!(fi >= 0.0);
            }
        }
    }

    #[test]
    fn test_from_elo_conversion() {
        let item = AirItemParams::from_elo(1200.0);
        assert!((item.beta - 0.0).abs() < 1e-10);
        let item_hard = AirItemParams::from_elo(1600.0);
        assert!((item_hard.beta - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_roundtrip_serialization() {
        let user = AirUserState {
            theta: 1.5,
            fisher_info_sum: 3.0,
            response_count: 10,
        };
        let json = serde_json::to_value(&user).unwrap();
        let restored: AirUserState = serde_json::from_value(json).unwrap();
        assert!((user.theta - restored.theta).abs() < 1e-10);
        assert_eq!(user.response_count, restored.response_count);
    }
}
