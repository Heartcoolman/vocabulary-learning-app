use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::amas::types::{FeatureVector, StrategyParams, UserState};

const MAX_PARAMS_CACHE_SIZE: usize = 1000;
const MAX_GAMMA_ITERATIONS: usize = 10000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BetaParams {
    alpha: f64,
    beta: f64,
    last_used: u64,
}

impl BetaParams {
    fn new(prior_alpha: f64, prior_beta: f64) -> Self {
        Self {
            alpha: prior_alpha,
            beta: prior_beta,
            last_used: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThompsonSamplingModel {
    prior_alpha: f64,
    prior_beta: f64,
    global_params: HashMap<String, BetaParams>,
    access_counter: u64,
}

impl ThompsonSamplingModel {
    pub fn new(prior_alpha: f64, prior_beta: f64) -> Self {
        Self {
            prior_alpha,
            prior_beta,
            global_params: HashMap::new(),
            access_counter: 0,
        }
    }

    pub fn select_action(
        &mut self,
        _state: &UserState,
        _feature: &FeatureVector,
        candidates: &[StrategyParams],
    ) -> Option<StrategyParams> {
        if candidates.is_empty() {
            return None;
        }

        let mut rng = rand::rng();
        let mut best_score = f64::NEG_INFINITY;
        let mut best_action = None;

        for candidate in candidates {
            let action_key = self.strategy_to_key(candidate);
            let params = self.ensure_params(&action_key);
            let sample = self.sample_beta(&mut rng, params.alpha, params.beta);

            if sample > best_score {
                best_score = sample;
                best_action = Some(candidate.clone());
            }
        }

        best_action
    }

    fn strategy_to_key(&self, strategy: &StrategyParams) -> String {
        format!(
            "{:?}_{:.2}_{}_{}",
            strategy.difficulty, strategy.new_ratio, strategy.batch_size, strategy.hint_level
        )
    }

    fn ensure_params(&mut self, action_key: &str) -> BetaParams {
        self.access_counter += 1;
        self.evict_if_needed();

        let counter = self.access_counter;
        self.global_params
            .entry(action_key.to_string())
            .and_modify(|p| p.last_used = counter)
            .or_insert_with(|| {
                let mut p = BetaParams::new(self.prior_alpha, self.prior_beta);
                p.last_used = counter;
                p
            })
            .clone()
    }

    fn evict_if_needed(&mut self) {
        if self.global_params.len() <= MAX_PARAMS_CACHE_SIZE {
            return;
        }

        let mut entries: Vec<_> = self
            .global_params
            .iter()
            .map(|(k, v)| (k.clone(), v.last_used))
            .collect();
        entries.sort_by_key(|(_, lu)| *lu);

        let to_remove = self.global_params.len() - MAX_PARAMS_CACHE_SIZE / 2;
        for (key, _) in entries.into_iter().take(to_remove) {
            self.global_params.remove(&key);
        }
    }

    fn sample_beta<R: Rng>(&self, rng: &mut R, alpha: f64, beta: f64) -> f64 {
        if alpha <= 0.0 || beta <= 0.0 {
            return 0.5;
        }

        let gamma1 = self.sample_gamma(rng, alpha, 1.0);
        let gamma2 = self.sample_gamma(rng, beta, 1.0);

        if gamma1 + gamma2 == 0.0 {
            return 0.5;
        }

        gamma1 / (gamma1 + gamma2)
    }

    fn sample_gamma<R: Rng>(&self, rng: &mut R, shape: f64, scale: f64) -> f64 {
        if shape < 1.0 {
            let u: f64 = rng.random();
            return self.sample_gamma(rng, shape + 1.0, scale) * u.powf(1.0 / shape);
        }

        let d = shape - 1.0 / 3.0;
        let c = 1.0 / (9.0 * d).sqrt();

        for _ in 0..MAX_GAMMA_ITERATIONS {
            let z = self.random_normal(rng);
            let v = (1.0 + c * z).powi(3);

            if v <= 0.0 {
                continue;
            }

            let u: f64 = rng.random();
            let z_sq = z * z;

            if u < 1.0 - 0.0331 * z_sq * z_sq {
                return d * v * scale;
            }

            if u.ln() < 0.5 * z_sq + d * (1.0 - v + v.ln()) {
                return d * v * scale;
            }
        }

        d * scale
    }

    fn random_normal<R: Rng>(&self, rng: &mut R) -> f64 {
        let u1: f64 = rng.random::<f64>().max(1e-10);
        let u2: f64 = rng.random();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }

    pub fn update(&mut self, strategy: &StrategyParams, reward: f64) {
        let action_key = self.strategy_to_key(strategy);
        let params = self.ensure_params(&action_key);

        let success = reward > 0.5;
        let new_params = if success {
            BetaParams {
                alpha: params.alpha + 1.0,
                beta: params.beta,
                last_used: self.access_counter,
            }
        } else {
            BetaParams {
                alpha: params.alpha,
                beta: params.beta + 1.0,
                last_used: self.access_counter,
            }
        };

        self.global_params.insert(action_key, new_params);
    }
}

impl Default for ThompsonSamplingModel {
    fn default() -> Self {
        Self::new(1.0, 1.0)
    }
}
