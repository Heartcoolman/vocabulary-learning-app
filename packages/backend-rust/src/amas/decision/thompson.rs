use chrono::Timelike;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::amas::types::{FeatureVector, StrategyParams, UserState};

const MAX_PARAMS_CACHE_SIZE: usize = 1000;
const MAX_GAMMA_ITERATIONS: usize = 10000;
const DEFAULT_CONTEXT_BINS: usize = 3;
const DEFAULT_CONTEXT_WEIGHT: f64 = 0.7;

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
    #[serde(default)]
    global_params: HashMap<String, BetaParams>,
    #[serde(default)]
    context_params: HashMap<String, BetaParams>,
    #[serde(default = "default_context_bins")]
    context_bins: usize,
    #[serde(default = "default_context_weight")]
    context_weight: f64,
    access_counter: u64,
}

impl ThompsonSamplingModel {
    pub fn new(prior_alpha: f64, prior_beta: f64) -> Self {
        Self {
            prior_alpha,
            prior_beta,
            global_params: HashMap::new(),
            context_params: HashMap::new(),
            context_bins: DEFAULT_CONTEXT_BINS,
            context_weight: DEFAULT_CONTEXT_WEIGHT,
            access_counter: 0,
        }
    }

    pub fn select_action(
        &mut self,
        state: &UserState,
        _feature: &FeatureVector,
        candidates: &[StrategyParams],
    ) -> Option<StrategyParams> {
        if candidates.is_empty() {
            return None;
        }

        let mut rng = rand::rng();
        let mut best_score = f64::NEG_INFINITY;
        let mut best_action = None;
        let context_key = self.context_signature(state);

        for candidate in candidates {
            let action_key = self.strategy_to_key(candidate);
            let params = self.ensure_params(&action_key);
            let context_params = self.ensure_context_params(&context_key, &action_key);
            let global_sample = self.sample_beta(&mut rng, params.alpha, params.beta);
            let context_sample = self.sample_beta(&mut rng, context_params.alpha, context_params.beta);
            let sample = (1.0 - self.context_weight) * global_sample
                + self.context_weight * context_sample;

            if sample > best_score {
                best_score = sample;
                best_action = Some(candidate.clone());
            }
        }

        best_action
    }

    pub fn set_context_config(&mut self, bins: usize, weight: f64) {
        self.context_bins = bins.max(2);
        self.context_weight = weight.clamp(0.0, 1.0);
    }

    fn strategy_to_key(&self, strategy: &StrategyParams) -> String {
        format!(
            "{:?}_{:.2}_{}_{}",
            strategy.difficulty, strategy.new_ratio, strategy.batch_size, strategy.hint_level
        )
    }

    fn ensure_params(&mut self, action_key: &str) -> BetaParams {
        self.access_counter += 1;
        let counter = self.access_counter;
        Self::evict_if_needed(&mut self.global_params);
        Self::ensure_params_in(
            &mut self.global_params,
            action_key,
            self.prior_alpha,
            self.prior_beta,
            counter,
        )
    }

    fn ensure_context_params(&mut self, context_key: &str, action_key: &str) -> BetaParams {
        let full_key = format!("{}|{}", context_key, action_key);
        self.access_counter += 1;
        let counter = self.access_counter;
        Self::evict_if_needed(&mut self.context_params);
        Self::ensure_params_in(
            &mut self.context_params,
            &full_key,
            self.prior_alpha,
            self.prior_beta,
            counter,
        )
    }

    fn ensure_params_in(
        map: &mut HashMap<String, BetaParams>,
        key: &str,
        prior_alpha: f64,
        prior_beta: f64,
        counter: u64,
    ) -> BetaParams {
        map.entry(key.to_string())
            .and_modify(|p| p.last_used = counter)
            .or_insert_with(|| {
                let mut p = BetaParams::new(prior_alpha, prior_beta);
                p.last_used = counter;
                p
            })
            .clone()
    }

    fn evict_if_needed(map: &mut HashMap<String, BetaParams>) {
        if map.len() <= MAX_PARAMS_CACHE_SIZE {
            return;
        }

        let mut entries: Vec<_> = map
            .iter()
            .map(|(k, v)| (k.clone(), v.last_used))
            .collect();
        entries.sort_by_key(|(_, lu)| *lu);

        let to_remove = map.len() - MAX_PARAMS_CACHE_SIZE / 2;
        for (key, _) in entries.into_iter().take(to_remove) {
            map.remove(&key);
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

    pub fn update(&mut self, state: &UserState, strategy: &StrategyParams, reward: f64) {
        let action_key = self.strategy_to_key(strategy);
        let context_key = self.context_signature(state);
        let params = self.ensure_params(&action_key);
        let context_params = self.ensure_context_params(&context_key, &action_key);

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

        let new_context_params = if success {
            BetaParams {
                alpha: context_params.alpha + 1.0,
                beta: context_params.beta,
                last_used: self.access_counter,
            }
        } else {
            BetaParams {
                alpha: context_params.alpha,
                beta: context_params.beta + 1.0,
                last_used: self.access_counter,
            }
        };

        let full_key = format!("{}|{}", context_key, self.strategy_to_key(strategy));
        self.context_params.insert(full_key, new_context_params);
    }

    fn context_signature(&self, state: &UserState) -> String {
        let bins = self.context_bins.max(2);
        let max_idx = (bins - 1) as i32;
        let attention = state.attention.clamp(0.0, 1.0);
        let fatigue = state
            .fused_fatigue
            .unwrap_or(state.fatigue)
            .clamp(0.0, 1.0);
        let motivation = ((state.motivation + 1.0) / 2.0).clamp(0.0, 1.0);
        let time_pref = state
            .habit
            .as_ref()
            .and_then(|h| {
                let hour = chrono::Local::now().hour() as usize;
                h.time_pref.get(hour).copied()
            })
            .unwrap_or(0.5)
            .clamp(0.0, 1.0);

        let bin = |value: f64| -> i32 {
            let idx = (value * bins as f64).floor() as i32;
            idx.clamp(0, max_idx)
        };

        format!(
            "a{}_f{}_m{}_t{}",
            bin(attention),
            bin(fatigue),
            bin(motivation),
            bin(time_pref)
        )
    }
}

impl Default for ThompsonSamplingModel {
    fn default() -> Self {
        Self::new(1.0, 1.0)
    }
}

fn default_context_bins() -> usize {
    DEFAULT_CONTEXT_BINS
}

fn default_context_weight() -> f64 {
    DEFAULT_CONTEXT_WEIGHT
}
