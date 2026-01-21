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
            let context_sample =
                self.sample_beta(&mut rng, context_params.alpha, context_params.beta);
            let sample =
                (1.0 - self.context_weight) * global_sample + self.context_weight * context_sample;

            if sample > best_score {
                best_score = sample;
                best_action = Some(candidate.clone());
            }
        }

        best_action
    }

    pub fn get_confidence(&mut self, state: &UserState, strategy: &StrategyParams) -> f64 {
        self.get_confidence_with_params(state, strategy, 20.0, 0.4, 1.0)
    }

    pub fn get_confidence_with_params(
        &mut self,
        state: &UserState,
        strategy: &StrategyParams,
        ess_k: f64,
        min_conf: f64,
        max_conf: f64,
    ) -> f64 {
        let action_key = self.strategy_to_key(strategy);
        let context_key = self.context_signature(state);
        let global = self.ensure_params(&action_key);
        let context = self.ensure_context_params(&context_key, &action_key);

        let global_n = (global.alpha + global.beta - 2.0).max(0.0);
        let context_n = (context.alpha + context.beta - 2.0).max(0.0);
        let blended_n = (1.0 - self.context_weight) * global_n + self.context_weight * context_n;

        let raw_conf = blended_n / (blended_n + ess_k);
        min_conf + (max_conf - min_conf) * raw_conf
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

        let mut entries: Vec<_> = map.iter().map(|(k, v)| (k.clone(), v.last_used)).collect();
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

        let clamped_reward = reward.clamp(-1.0, 1.0);
        let normalized_reward = (clamped_reward + 1.0) / 2.0;
        let new_params = BetaParams {
            alpha: params.alpha + normalized_reward,
            beta: params.beta + (1.0 - normalized_reward),
            last_used: self.access_counter,
        };

        self.global_params.insert(action_key, new_params);

        let new_context_params = BetaParams {
            alpha: context_params.alpha + normalized_reward,
            beta: context_params.beta + (1.0 - normalized_reward),
            last_used: self.access_counter,
        };

        let full_key = format!("{}|{}", context_key, self.strategy_to_key(strategy));
        self.context_params.insert(full_key, new_context_params);
    }

    fn context_signature(&self, state: &UserState) -> String {
        let bins = self.context_bins.max(2);
        let max_idx = (bins - 1) as i32;
        let attention = state.attention.clamp(0.0, 1.0);
        let fatigue = state.fused_fatigue.unwrap_or(state.fatigue).clamp(0.0, 1.0);
        let motivation = ((state.motivation + 1.0) / 2.0).clamp(0.0, 1.0);
        let cognitive = state.cognitive.mem.clamp(0.0, 1.0);
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
            "a{}_f{}_m{}_c{}_t{}",
            bin(attention),
            bin(fatigue),
            bin(motivation),
            bin(cognitive),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::amas::types::{CognitiveProfile, DifficultyLevel, FeatureVector, StrategyParams, UserState};

    fn sample_strategy() -> StrategyParams {
        StrategyParams {
            difficulty: DifficultyLevel::Mid,
            new_ratio: 0.2,
            batch_size: 8,
            interval_scale: 1.0,
            hint_level: 1,
        }
    }

    fn sample_user_state() -> UserState {
        UserState {
            attention: 0.7,
            fatigue: 0.3,
            cognitive: CognitiveProfile::default(),
            motivation: 0.5,
            habit: None,
            trend: None,
            conf: 0.5,
            ts: 0,
            visual_fatigue: None,
            fused_fatigue: None,
        }
    }

    fn sample_feature_vector() -> FeatureVector {
        FeatureVector::new(vec![0.5; 5], vec!["f".to_string(); 5])
    }

    #[test]
    fn new_initializes_with_priors() {
        let model = ThompsonSamplingModel::new(2.0, 3.0);
        assert!((model.prior_alpha - 2.0).abs() < 1e-6);
        assert!((model.prior_beta - 3.0).abs() < 1e-6);
        assert!(model.global_params.is_empty());
        assert!(model.context_params.is_empty());
    }

    #[test]
    fn default_uses_uniform_prior() {
        let model = ThompsonSamplingModel::default();
        assert!((model.prior_alpha - 1.0).abs() < 1e-6);
        assert!((model.prior_beta - 1.0).abs() < 1e-6);
    }

    #[test]
    fn set_context_config_clamps_values() {
        let mut model = ThompsonSamplingModel::default();
        model.set_context_config(1, 1.5);
        assert_eq!(model.context_bins, 2);
        assert!((model.context_weight - 1.0).abs() < 1e-6);

        model.set_context_config(5, -0.5);
        assert_eq!(model.context_bins, 5);
        assert!((model.context_weight - 0.0).abs() < 1e-6);
    }

    #[test]
    fn select_action_returns_none_for_empty_candidates() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let feature = sample_feature_vector();
        let result = model.select_action(&state, &feature, &[]);
        assert!(result.is_none());
    }

    #[test]
    fn select_action_returns_valid_candidate() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let feature = sample_feature_vector();
        let candidates = vec![
            StrategyParams {
                difficulty: DifficultyLevel::Easy,
                ..sample_strategy()
            },
            StrategyParams {
                difficulty: DifficultyLevel::Hard,
                ..sample_strategy()
            },
        ];
        let result = model.select_action(&state, &feature, &candidates);
        assert!(result.is_some());
    }

    #[test]
    fn update_increments_parameters() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        model.update(&state, &strategy, 1.0);
        let key = model.strategy_to_key(&strategy);
        let params = model.global_params.get(&key).unwrap();
        assert!((params.alpha - 2.0).abs() < 1e-6);
        assert!((params.beta - 1.0).abs() < 1e-6);
    }

    #[test]
    fn update_clamps_reward() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        model.update(&state, &strategy, 5.0);
        let key = model.strategy_to_key(&strategy);
        let params = model.global_params.get(&key).unwrap();
        assert!((params.alpha - 2.0).abs() < 1e-6);
    }

    #[test]
    fn update_handles_negative_reward() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        model.update(&state, &strategy, -1.0);
        let key = model.strategy_to_key(&strategy);
        let params = model.global_params.get(&key).unwrap();
        assert!((params.alpha - 1.0).abs() < 1e-6);
        assert!((params.beta - 2.0).abs() < 1e-6);
    }

    #[test]
    fn get_confidence_returns_valid_range() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        let conf = model.get_confidence(&state, &strategy);
        assert!(conf >= 0.0 && conf <= 1.0);
    }

    #[test]
    fn get_confidence_increases_with_samples() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        let initial_conf = model.get_confidence(&state, &strategy);
        for _ in 0..50 {
            model.update(&state, &strategy, 1.0);
        }
        let final_conf = model.get_confidence(&state, &strategy);
        assert!(final_conf > initial_conf);
    }

    #[test]
    fn get_confidence_with_params_respects_bounds() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        let conf = model.get_confidence_with_params(&state, &strategy, 10.0, 0.3, 0.9);
        assert!(conf >= 0.3 && conf <= 0.9);
    }

    #[test]
    fn strategy_to_key_is_deterministic() {
        let model = ThompsonSamplingModel::default();
        let strategy = sample_strategy();
        let key1 = model.strategy_to_key(&strategy);
        let key2 = model.strategy_to_key(&strategy);
        assert_eq!(key1, key2);
    }

    #[test]
    fn strategy_to_key_differs_for_different_strategies() {
        let model = ThompsonSamplingModel::default();
        let s1 = sample_strategy();
        let s2 = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let key1 = model.strategy_to_key(&s1);
        let key2 = model.strategy_to_key(&s2);
        assert_ne!(key1, key2);
    }

    #[test]
    fn context_signature_is_deterministic() {
        let model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let sig1 = model.context_signature(&state);
        let sig2 = model.context_signature(&state);
        assert_eq!(sig1, sig2);
    }

    #[test]
    fn context_signature_clamps_extreme_values() {
        let model = ThompsonSamplingModel::default();
        let mut state = sample_user_state();
        state.attention = 2.0;
        state.fatigue = -1.0;
        let sig = model.context_signature(&state);
        assert!(sig.starts_with("a"));
    }

    #[test]
    fn context_signature_differs_for_different_states() {
        let model = ThompsonSamplingModel::default();
        let s1 = UserState {
            attention: 0.1,
            ..sample_user_state()
        };
        let s2 = UserState {
            attention: 0.9,
            ..sample_user_state()
        };
        let sig1 = model.context_signature(&s1);
        let sig2 = model.context_signature(&s2);
        assert_ne!(sig1, sig2);
    }

    #[test]
    fn sample_beta_returns_valid_range() {
        let model = ThompsonSamplingModel::default();
        let mut rng = rand::rng();
        for _ in 0..100 {
            let sample = model.sample_beta(&mut rng, 1.0, 1.0);
            assert!(sample >= 0.0 && sample <= 1.0);
        }
    }

    #[test]
    fn sample_beta_handles_non_positive_params() {
        let model = ThompsonSamplingModel::default();
        let mut rng = rand::rng();
        let sample = model.sample_beta(&mut rng, 0.0, -1.0);
        assert!((sample - 0.5).abs() < 1e-6);
    }

    #[test]
    fn sample_gamma_returns_positive() {
        let model = ThompsonSamplingModel::default();
        let mut rng = rand::rng();
        for _ in 0..100 {
            let sample = model.sample_gamma(&mut rng, 2.0, 1.0);
            assert!(sample >= 0.0);
        }
    }

    #[test]
    fn sample_gamma_handles_small_shape() {
        let model = ThompsonSamplingModel::default();
        let mut rng = rand::rng();
        let sample = model.sample_gamma(&mut rng, 0.5, 1.0);
        assert!(sample >= 0.0);
    }

    #[test]
    fn eviction_keeps_cache_bounded() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        for i in 0..1500 {
            let strategy = StrategyParams {
                batch_size: i % 20,
                ..sample_strategy()
            };
            model.update(&state, &strategy, 0.5);
        }
        assert!(model.global_params.len() <= MAX_PARAMS_CACHE_SIZE);
    }

    #[test]
    fn context_params_updated_on_update() {
        let mut model = ThompsonSamplingModel::default();
        let state = sample_user_state();
        let strategy = sample_strategy();
        assert!(model.context_params.is_empty());
        model.update(&state, &strategy, 1.0);
        assert!(!model.context_params.is_empty());
    }
}
