//! Thompson Sampling Algorithm Implementation
//!
//! This module implements the Thompson Sampling algorithm with context-aware support.
//!
//! Core principles:
//! - Maintains Beta distribution parameters (alpha, beta) for each action
//! - During selection, samples from Beta(alpha, beta) and selects the action with the highest sample
//! - Positive feedback -> alpha + 1, negative feedback -> beta + 1
//! - Supports both global and contextual parameters for personalized decisions
//!
//! Features:
//! - Natural exploration-exploitation balance (probability matching)
//! - Cold-start friendly (prior distribution guidance)
//! - Computationally efficient O(|A|) time complexity

use napi_derive::napi;
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== Constants ====================

/// Numerical stability: minimum positive number
const EPSILON: f64 = 1e-10;

/// Maximum iterations for Gamma sampling to prevent infinite loops
const MAX_GAMMA_ITERATIONS: usize = 1000;

/// Maximum recursion depth for Gamma sampling
const MAX_GAMMA_RECURSION: usize = 10;

/// Confidence scale factor for normalization
const CONFIDENCE_SCALE: f64 = 20.0;

// ==================== Data Structures ====================

/// Beta distribution parameters
#[napi(object)]
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BetaParams {
    /// Success count (alpha >= 0)
    pub alpha: f64,
    /// Failure count (beta >= 0)
    pub beta: f64,
}

impl BetaParams {
    /// Create new Beta parameters with validation
    pub fn new(alpha: f64, beta: f64) -> Self {
        Self {
            alpha: alpha.max(EPSILON),
            beta: beta.max(EPSILON),
        }
    }

    /// Calculate expected value (mean of Beta distribution)
    pub fn expected_value(&self) -> f64 {
        let sum = self.alpha + self.beta;
        if sum > 0.0 {
            self.alpha / sum
        } else {
            0.5
        }
    }

    /// Calculate total observations (alpha + beta)
    pub fn total(&self) -> f64 {
        self.alpha + self.beta
    }
}

/// Action selection result
#[napi(object)]
#[derive(Clone, Debug)]
pub struct ActionSelection {
    /// Selected action key
    pub action_key: String,
    /// Selection score (sampled value)
    pub score: f64,
    /// Confidence level [0, 1]
    pub confidence: f64,
    /// Global sample value
    pub global_sample: f64,
    /// Contextual sample value
    pub contextual_sample: f64,
}

/// Thompson Sampling configuration options
#[napi(object)]
#[derive(Clone, Debug)]
pub struct ThompsonSamplingOptions {
    /// Prior alpha (default: 1, uninformative prior)
    pub prior_alpha: Option<f64>,
    /// Prior beta (default: 1, uninformative prior)
    pub prior_beta: Option<f64>,
    /// Minimum context weight
    pub min_context_weight: Option<f64>,
    /// Maximum context weight
    pub max_context_weight: Option<f64>,
    /// Enable soft update mode
    pub enable_soft_update: Option<bool>,
    /// Random seed for reproducibility (optional)
    pub seed: Option<u32>,
}

impl Default for ThompsonSamplingOptions {
    fn default() -> Self {
        Self {
            prior_alpha: Some(1.0),
            prior_beta: Some(1.0),
            min_context_weight: Some(0.35),
            max_context_weight: Some(0.75),
            enable_soft_update: Some(false),
            seed: None,
        }
    }
}

/// Serializable state for persistence
#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThompsonSamplingState {
    /// Version number (for migration)
    pub version: String,
    /// Prior alpha
    pub prior_alpha: f64,
    /// Prior beta
    pub prior_beta: f64,
    /// Total update count
    pub update_count: i64,
    /// Global Beta parameters (JSON serialized)
    pub global_params_json: String,
    /// Contextual Beta parameters (JSON serialized)
    pub context_params_json: String,
}

// ==================== Main Implementation ====================

/// Thompson Sampling Native Implementation
///
/// A context-aware Thompson Sampling algorithm optimized for Rust/NAPI.
///
/// Usage scenarios:
/// - Efficient exploration during cold-start phase
/// - Binary feedback (correct/incorrect) learning tasks
/// - Scenarios requiring natural exploration-exploitation balance
#[napi]
pub struct ThompsonSamplingNative {
    /// Global Beta parameters (indexed by action key)
    global_params: HashMap<String, BetaParams>,
    /// Contextual Beta parameters (indexed by action key + context key)
    context_params: HashMap<String, HashMap<String, BetaParams>>,
    /// Random number generator
    rng: ChaCha8Rng,
    /// Prior alpha parameter
    prior_alpha: f64,
    /// Prior beta parameter
    prior_beta: f64,
    /// Minimum context weight
    min_context_weight: f64,
    /// Maximum context weight
    max_context_weight: f64,
    /// Enable soft update mode
    enable_soft_update: bool,
    /// Total update count
    update_count: i64,
}

#[napi]
impl ThompsonSamplingNative {
    /// Create a new Thompson Sampling instance with default options
    #[napi(constructor)]
    pub fn new() -> Self {
        Self::with_options(ThompsonSamplingOptions::default())
    }

    /// Create a new instance with custom options
    #[napi(factory)]
    pub fn with_options(options: ThompsonSamplingOptions) -> Self {
        let seed = options.seed.unwrap_or_else(|| {
            // Use system time as default seed
            use std::time::{SystemTime, UNIX_EPOCH};
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos() as u32)
                .unwrap_or(42)
        });

        Self {
            global_params: HashMap::new(),
            context_params: HashMap::new(),
            rng: ChaCha8Rng::seed_from_u64(seed as u64),
            prior_alpha: options.prior_alpha.unwrap_or(1.0).max(EPSILON),
            prior_beta: options.prior_beta.unwrap_or(1.0).max(EPSILON),
            min_context_weight: options.min_context_weight.unwrap_or(0.35),
            max_context_weight: options.max_context_weight.unwrap_or(0.75),
            enable_soft_update: options.enable_soft_update.unwrap_or(false),
            update_count: 0,
        }
    }

    /// Create a new instance with a specific seed (for testing)
    #[napi(factory)]
    pub fn with_seed(seed: u32) -> Self {
        Self {
            global_params: HashMap::new(),
            context_params: HashMap::new(),
            rng: ChaCha8Rng::seed_from_u64(seed as u64),
            prior_alpha: 1.0,
            prior_beta: 1.0,
            min_context_weight: 0.35,
            max_context_weight: 0.75,
            enable_soft_update: false,
            update_count: 0,
        }
    }

    // ==================== Sampling Methods ====================

    /// Sample from a Beta distribution using Gamma distribution method
    ///
    /// Uses the property: Beta(alpha, beta) = Gamma(alpha) / (Gamma(alpha) + Gamma(beta))
    #[napi]
    pub fn sample_beta(&mut self, alpha: f64, beta: f64) -> f64 {
        let a = alpha.max(EPSILON);
        let b = beta.max(EPSILON);

        let x = self.sample_gamma_internal(a, 1.0, 0);
        let y = self.sample_gamma_internal(b, 1.0, 0);

        let sum = x + y;
        if sum > 0.0 && sum.is_finite() {
            x / sum
        } else {
            // Fallback to uniform prior expectation
            0.5
        }
    }

    /// Sample from a Gamma distribution using Marsaglia-Tsang method
    ///
    /// Reference: Marsaglia, G., & Tsang, W. W. (2000).
    /// "A simple method for generating gamma variables."
    #[napi]
    pub fn sample_gamma(&mut self, shape: f64, scale: f64) -> f64 {
        self.sample_gamma_internal(shape, scale, 0)
    }

    /// Internal Gamma sampling with recursion depth tracking
    fn sample_gamma_internal(&mut self, shape: f64, scale: f64, depth: usize) -> f64 {
        if shape <= 0.0 {
            return 0.0;
        }

        // Recursion depth protection
        if depth >= MAX_GAMMA_RECURSION {
            // Return expected value as fallback
            return shape * scale;
        }

        // Handle shape < 1 using transformation
        if shape < 1.0 {
            let u: f64 = self.rng.gen();
            let u_safe = u.max(EPSILON);
            return self.sample_gamma_internal(1.0 + shape, scale, depth + 1)
                * u_safe.powf(1.0 / shape);
        }

        // Marsaglia-Tsang method for shape >= 1
        let d = shape - 1.0 / 3.0;
        let c = 1.0 / (9.0 * d).sqrt();

        for _ in 0..MAX_GAMMA_ITERATIONS {
            let x = self.sample_normal();
            let v_term = 1.0 + c * x;

            if v_term <= 0.0 {
                continue;
            }

            let v = v_term.powi(3);
            let u: f64 = self.rng.gen();
            let x2 = x * x;
            let x4 = x2 * x2;

            // Fast acceptance check
            if u < 1.0 - 0.0331 * x4 {
                return d * v * scale;
            }

            // Precise acceptance check
            if u.ln() < 0.5 * x2 + d * (1.0 - v + v.ln()) {
                return d * v * scale;
            }
        }

        // Exceeded iteration limit, return expected value
        shape * scale
    }

    /// Sample from standard normal distribution using Box-Muller transform
    fn sample_normal(&mut self) -> f64 {
        let u1: f64 = self.rng.gen::<f64>().max(EPSILON);
        let u2: f64 = self.rng.gen();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }

    /// Batch sample from multiple actions
    ///
    /// Returns sampled values for each action key
    #[napi]
    pub fn batch_sample(&mut self, action_keys: Vec<String>) -> Vec<f64> {
        action_keys
            .iter()
            .map(|key| {
                let params = self.ensure_global_params(key);
                self.sample_beta(params.alpha, params.beta)
            })
            .collect()
    }

    /// Batch sample with context support
    #[napi]
    pub fn batch_sample_with_context(
        &mut self,
        context_key: String,
        action_keys: Vec<String>,
    ) -> Vec<f64> {
        action_keys
            .iter()
            .map(|action_key| {
                let global_params = self.ensure_global_params(action_key);
                let contextual_params = self.ensure_context_params(action_key, &context_key);

                let global_sample = self.sample_beta(global_params.alpha, global_params.beta);
                let contextual_sample =
                    self.sample_beta(contextual_params.alpha, contextual_params.beta);

                self.blend_samples(global_sample, contextual_sample, &global_params, &contextual_params)
            })
            .collect()
    }

    // ==================== Action Selection ====================

    /// Select the best action from a list of action keys
    ///
    /// Samples from Beta distributions and returns the action with the highest sample value
    #[napi]
    pub fn select_action(&mut self, action_keys: Vec<String>) -> ActionSelection {
        if action_keys.is_empty() {
            return ActionSelection {
                action_key: String::new(),
                score: 0.0,
                confidence: 0.0,
                global_sample: 0.0,
                contextual_sample: 0.0,
            };
        }

        let mut best_selection: Option<ActionSelection> = None;

        for action_key in &action_keys {
            let params = self.ensure_global_params(action_key);
            let sample = self.sample_beta(params.alpha, params.beta);
            let confidence = self.compute_confidence(&params, &params);

            let selection = ActionSelection {
                action_key: action_key.clone(),
                score: sample,
                confidence,
                global_sample: sample,
                contextual_sample: sample,
            };

            if best_selection.is_none() || sample > best_selection.as_ref().unwrap().score {
                best_selection = Some(selection);
            }
        }

        best_selection.unwrap_or(ActionSelection {
            action_key: action_keys[0].clone(),
            score: 0.0,
            confidence: 0.0,
            global_sample: 0.0,
            contextual_sample: 0.0,
        })
    }

    /// Select the best action with context awareness
    ///
    /// Blends global and contextual samples based on data availability
    #[napi]
    pub fn select_action_with_context(
        &mut self,
        context_key: String,
        action_keys: Vec<String>,
    ) -> ActionSelection {
        if action_keys.is_empty() {
            return ActionSelection {
                action_key: String::new(),
                score: 0.0,
                confidence: 0.0,
                global_sample: 0.0,
                contextual_sample: 0.0,
            };
        }

        let mut best_selection: Option<ActionSelection> = None;

        for action_key in &action_keys {
            let global_params = self.ensure_global_params(action_key);
            let contextual_params = self.ensure_context_params(action_key, &context_key);

            let global_sample = self.sample_beta(global_params.alpha, global_params.beta);
            let contextual_sample =
                self.sample_beta(contextual_params.alpha, contextual_params.beta);

            let score =
                self.blend_samples(global_sample, contextual_sample, &global_params, &contextual_params);
            let confidence = self.compute_confidence(&global_params, &contextual_params);

            let selection = ActionSelection {
                action_key: action_key.clone(),
                score,
                confidence,
                global_sample,
                contextual_sample,
            };

            if best_selection.is_none() || score > best_selection.as_ref().unwrap().score {
                best_selection = Some(selection);
            }
        }

        best_selection.unwrap_or(ActionSelection {
            action_key: action_keys[0].clone(),
            score: 0.0,
            confidence: 0.0,
            global_sample: 0.0,
            contextual_sample: 0.0,
        })
    }

    // ==================== Update Methods ====================

    /// Update parameters based on feedback
    ///
    /// - success: true -> alpha + 1, false -> beta + 1
    #[napi]
    pub fn update(&mut self, action_key: String, success: bool) {
        let params = self
            .global_params
            .entry(action_key)
            .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta));

        if success {
            params.alpha += 1.0;
        } else {
            params.beta += 1.0;
        }

        self.update_count += 1;
    }

    /// Update parameters with a continuous reward value
    ///
    /// - Binary mode (default): reward >= 0 -> success, < 0 -> failure
    /// - Soft update mode: alpha += (reward + 1) / 2, beta += (1 - reward) / 2
    #[napi]
    pub fn update_with_reward(&mut self, action_key: String, reward: f64) {
        let safe_reward = reward.clamp(-1.0, 1.0);

        let params = self
            .global_params
            .entry(action_key)
            .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta));

        if self.enable_soft_update {
            // Soft update: preserve gradient information
            let normalized_reward = (safe_reward + 1.0) / 2.0;
            params.alpha += normalized_reward;
            params.beta += 1.0 - normalized_reward;
        } else {
            // Binary update: reward >= 0 is success
            if safe_reward >= 0.0 {
                params.alpha += 1.0;
            } else {
                params.beta += 1.0;
            }
        }

        self.update_count += 1;
    }

    /// Update with context
    #[napi]
    pub fn update_with_context(&mut self, context_key: String, action_key: String, success: bool) {
        // Update global params
        {
            let params = self
                .global_params
                .entry(action_key.clone())
                .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta));

            if success {
                params.alpha += 1.0;
            } else {
                params.beta += 1.0;
            }
        }

        // Update contextual params
        {
            let context_map = self
                .context_params
                .entry(action_key)
                .or_default();

            let params = context_map
                .entry(context_key)
                .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta));

            if success {
                params.alpha += 1.0;
            } else {
                params.beta += 1.0;
            }
        }

        self.update_count += 1;
    }

    /// Update with context and continuous reward
    #[napi]
    pub fn update_with_context_and_reward(
        &mut self,
        context_key: String,
        action_key: String,
        reward: f64,
    ) {
        let safe_reward = reward.clamp(-1.0, 1.0);

        // Update global params
        {
            let params = self
                .global_params
                .entry(action_key.clone())
                .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta));

            if self.enable_soft_update {
                let normalized_reward = (safe_reward + 1.0) / 2.0;
                params.alpha += normalized_reward;
                params.beta += 1.0 - normalized_reward;
            } else if safe_reward >= 0.0 {
                params.alpha += 1.0;
            } else {
                params.beta += 1.0;
            }
        }

        // Update contextual params
        {
            let context_map = self
                .context_params
                .entry(action_key)
                .or_default();

            let params = context_map
                .entry(context_key)
                .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta));

            if self.enable_soft_update {
                let normalized_reward = (safe_reward + 1.0) / 2.0;
                params.alpha += normalized_reward;
                params.beta += 1.0 - normalized_reward;
            } else if safe_reward >= 0.0 {
                params.alpha += 1.0;
            } else {
                params.beta += 1.0;
            }
        }

        self.update_count += 1;
    }

    /// Batch update multiple actions
    #[napi]
    pub fn batch_update(&mut self, updates: Vec<BatchUpdateItem>) {
        for item in updates {
            if item.success {
                self.update(item.action_key, true);
            } else {
                self.update(item.action_key, false);
            }
        }
    }

    // ==================== Query Methods ====================

    /// Get expected value for an action
    #[napi]
    pub fn get_expected_value(&self, action_key: String) -> f64 {
        self.global_params
            .get(&action_key)
            .map(|p| p.expected_value())
            .unwrap_or_else(|| self.prior_alpha / (self.prior_alpha + self.prior_beta))
    }

    /// Get expected value with context
    #[napi]
    pub fn get_expected_value_with_context(
        &self,
        context_key: String,
        action_key: String,
    ) -> f64 {
        self.context_params
            .get(&action_key)
            .and_then(|m| m.get(&context_key))
            .map(|p| p.expected_value())
            .unwrap_or_else(|| self.prior_alpha / (self.prior_alpha + self.prior_beta))
    }

    /// Get sample count for an action (observations excluding prior)
    #[napi]
    pub fn get_sample_count(&self, action_key: String) -> f64 {
        self.global_params
            .get(&action_key)
            .map(|p| (p.alpha + p.beta - self.prior_alpha - self.prior_beta).max(0.0))
            .unwrap_or(0.0)
    }

    /// Get global parameters for an action
    #[napi]
    pub fn get_global_params(&self, action_key: String) -> Option<BetaParams> {
        self.global_params.get(&action_key).cloned()
    }

    /// Get contextual parameters
    #[napi]
    pub fn get_context_params(&self, action_key: String, context_key: String) -> Option<BetaParams> {
        self.context_params
            .get(&action_key)
            .and_then(|m| m.get(&context_key))
            .cloned()
    }

    /// Set global parameters directly
    #[napi]
    pub fn set_global_params(&mut self, action_key: String, alpha: f64, beta: f64) {
        self.global_params
            .insert(action_key, BetaParams::new(alpha, beta));
    }

    /// Set contextual parameters directly
    #[napi]
    pub fn set_context_params(
        &mut self,
        action_key: String,
        context_key: String,
        alpha: f64,
        beta: f64,
    ) {
        let context_map = self
            .context_params
            .entry(action_key)
            .or_default();
        context_map.insert(context_key, BetaParams::new(alpha, beta));
    }

    /// Get all global stats
    #[napi]
    pub fn get_all_stats(&self) -> HashMap<String, BetaParams> {
        self.global_params.clone()
    }

    /// Get update count
    #[napi]
    pub fn get_update_count(&self) -> i64 {
        self.update_count
    }

    // ==================== State Management ====================

    /// Reset all parameters
    #[napi]
    pub fn reset(&mut self) {
        self.global_params.clear();
        self.context_params.clear();
        self.update_count = 0;
    }

    /// Get serializable state for persistence
    #[napi]
    pub fn get_state(&self) -> ThompsonSamplingState {
        ThompsonSamplingState {
            version: "1.0.0".to_string(),
            prior_alpha: self.prior_alpha,
            prior_beta: self.prior_beta,
            update_count: self.update_count,
            global_params_json: serde_json::to_string(&self.global_params).unwrap_or_default(),
            context_params_json: serde_json::to_string(&self.context_params).unwrap_or_default(),
        }
    }

    /// Restore state from serialized data
    #[napi]
    pub fn set_state(&mut self, state: ThompsonSamplingState) {
        // Version compatibility check
        let _version = &state.version;

        // Calculate prior deltas for migration
        let alpha_delta = self.prior_alpha - state.prior_alpha;
        let beta_delta = self.prior_beta - state.prior_beta;

        // Restore global params with migration
        if let Ok(params) =
            serde_json::from_str::<HashMap<String, BetaParams>>(&state.global_params_json)
        {
            self.global_params = params
                .into_iter()
                .map(|(k, v)| {
                    let new_params = BetaParams {
                        alpha: (v.alpha + alpha_delta).max(self.prior_alpha),
                        beta: (v.beta + beta_delta).max(self.prior_beta),
                    };
                    (k, new_params)
                })
                .collect();
        }

        // Restore context params with migration
        if let Ok(params) = serde_json::from_str::<HashMap<String, HashMap<String, BetaParams>>>(
            &state.context_params_json,
        ) {
            self.context_params = params
                .into_iter()
                .map(|(action_key, context_map)| {
                    let migrated_map: HashMap<String, BetaParams> = context_map
                        .into_iter()
                        .map(|(ctx_key, v)| {
                            let new_params = BetaParams {
                                alpha: (v.alpha + alpha_delta).max(self.prior_alpha),
                                beta: (v.beta + beta_delta).max(self.prior_beta),
                            };
                            (ctx_key, new_params)
                        })
                        .collect();
                    (action_key, migrated_map)
                })
                .collect();
        }

        self.update_count = state.update_count.max(0);
    }

    /// Set random seed (for testing)
    #[napi]
    pub fn set_seed(&mut self, seed: u32) {
        self.rng = ChaCha8Rng::seed_from_u64(seed as u64);
    }

    // ==================== Private Helper Methods ====================

    /// Ensure global parameters exist for an action
    fn ensure_global_params(&mut self, action_key: &str) -> BetaParams {
        self.global_params
            .entry(action_key.to_string())
            .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta))
            .clone()
    }

    /// Ensure contextual parameters exist
    fn ensure_context_params(&mut self, action_key: &str, context_key: &str) -> BetaParams {
        let context_map = self
            .context_params
            .entry(action_key.to_string())
            .or_default();

        context_map
            .entry(context_key.to_string())
            .or_insert_with(|| BetaParams::new(self.prior_alpha, self.prior_beta))
            .clone()
    }

    /// Blend global and contextual samples
    ///
    /// Weight strategy:
    /// - When contextual data is scarce, prefer global (generalization)
    /// - When contextual data is abundant, prefer contextual (personalization)
    fn blend_samples(
        &self,
        global_sample: f64,
        contextual_sample: f64,
        global_params: &BetaParams,
        contextual_params: &BetaParams,
    ) -> f64 {
        let prior_total = self.prior_alpha + self.prior_beta;
        let contextual_total = contextual_params.total();

        // If contextual has no additional data, use global entirely
        if contextual_total <= prior_total {
            return global_sample;
        }

        // Dynamically calculate context weight
        let global_total = global_params.total();
        let raw_weight = contextual_total / (contextual_total + global_total + 1.0);
        let weight = (self.min_context_weight
            + raw_weight * (self.max_context_weight - self.min_context_weight))
            .clamp(self.min_context_weight, self.max_context_weight);

        weight * contextual_sample + (1.0 - weight) * global_sample
    }

    /// Compute confidence based on observations
    fn compute_confidence(&self, global_params: &BetaParams, contextual_params: &BetaParams) -> f64 {
        let prior_total = self.prior_alpha + self.prior_beta;
        let global_observations = (global_params.total() - prior_total).max(0.0);
        let contextual_observations = (contextual_params.total() - prior_total).max(0.0);

        // Use max to avoid double counting (same observation updates both)
        let effective_observations = global_observations.max(contextual_observations);

        (effective_observations / (effective_observations + CONFIDENCE_SCALE)).clamp(0.0, 1.0)
    }
}

impl Default for ThompsonSamplingNative {
    fn default() -> Self {
        Self::new()
    }
}

// ==================== Supporting Types ====================

/// Batch update item
#[napi(object)]
#[derive(Clone, Debug)]
pub struct BatchUpdateItem {
    pub action_key: String,
    pub success: bool,
}

// ==================== Unit Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_beta_basic() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Test basic sampling produces values in [0, 1]
        for _ in 0..100 {
            let sample = sampler.sample_beta(1.0, 1.0);
            assert!(sample >= 0.0 && sample <= 1.0, "Sample {} out of range", sample);
        }
    }

    #[test]
    fn test_sample_beta_skewed_distributions() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // High alpha should produce samples closer to 1
        let mut high_alpha_sum = 0.0;
        for _ in 0..100 {
            high_alpha_sum += sampler.sample_beta(10.0, 1.0);
        }
        let high_alpha_mean = high_alpha_sum / 100.0;
        assert!(high_alpha_mean > 0.7, "High alpha mean {} should be > 0.7", high_alpha_mean);

        // High beta should produce samples closer to 0
        let mut high_beta_sum = 0.0;
        for _ in 0..100 {
            high_beta_sum += sampler.sample_beta(1.0, 10.0);
        }
        let high_beta_mean = high_beta_sum / 100.0;
        assert!(high_beta_mean < 0.3, "High beta mean {} should be < 0.3", high_beta_mean);
    }

    #[test]
    fn test_sample_gamma_shape_less_than_one() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Test shape < 1 (uses transformation)
        for _ in 0..100 {
            let sample = sampler.sample_gamma(0.5, 1.0);
            assert!(sample >= 0.0, "Gamma sample should be non-negative");
            assert!(sample.is_finite(), "Gamma sample should be finite");
        }
    }

    #[test]
    fn test_sample_gamma_various_shapes() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        let shapes = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
        for &shape in &shapes {
            for _ in 0..50 {
                let sample = sampler.sample_gamma(shape, 1.0);
                assert!(sample >= 0.0, "Gamma({}) sample should be non-negative", shape);
                assert!(sample.is_finite(), "Gamma({}) sample should be finite", shape);
            }
        }
    }

    #[test]
    fn test_update_and_expected_value() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Initial expected value should be 0.5
        let initial = sampler.get_expected_value("test".to_string());
        assert!((initial - 0.5).abs() < EPSILON, "Initial expected value should be 0.5");

        // After success, expected value should increase
        sampler.update("test".to_string(), true);
        let after_success = sampler.get_expected_value("test".to_string());
        assert!(after_success > 0.5, "Expected value after success should be > 0.5");

        // After failures, expected value should decrease
        sampler.update("test".to_string(), false);
        sampler.update("test".to_string(), false);
        let after_failures = sampler.get_expected_value("test".to_string());
        assert!(after_failures < after_success, "Expected value should decrease after failures");
    }

    #[test]
    fn test_update_with_reward() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Test binary mode (default)
        sampler.update_with_reward("binary".to_string(), 0.5);
        let params = sampler.get_global_params("binary".to_string()).unwrap();
        assert_eq!(params.alpha, 2.0, "Positive reward should increase alpha");

        sampler.update_with_reward("binary".to_string(), -0.5);
        let params = sampler.get_global_params("binary".to_string()).unwrap();
        assert_eq!(params.beta, 2.0, "Negative reward should increase beta");
    }

    #[test]
    fn test_soft_update_mode() {
        let options = ThompsonSamplingOptions {
            enable_soft_update: Some(true),
            seed: Some(42),
            ..Default::default()
        };
        let mut sampler = ThompsonSamplingNative::with_options(options);

        // Soft update: reward = 0.5 -> normalized = 0.75
        sampler.update_with_reward("soft".to_string(), 0.5);
        let params = sampler.get_global_params("soft".to_string()).unwrap();
        assert!((params.alpha - 1.75).abs() < EPSILON, "Alpha should be 1.75");
        assert!((params.beta - 1.25).abs() < EPSILON, "Beta should be 1.25");
    }

    #[test]
    fn test_batch_sample() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        sampler.update("a".to_string(), true);
        sampler.update("b".to_string(), false);

        let samples = sampler.batch_sample(vec!["a".to_string(), "b".to_string(), "c".to_string()]);

        assert_eq!(samples.len(), 3, "Should return 3 samples");
        for sample in &samples {
            assert!(*sample >= 0.0 && *sample <= 1.0, "Sample should be in [0, 1]");
        }
    }

    #[test]
    fn test_select_action() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Set up biased arms
        for _ in 0..10 {
            sampler.update("best".to_string(), true);
            sampler.update("worst".to_string(), false);
        }

        // Run multiple selections and count
        let mut best_count = 0;
        for _ in 0..100 {
            let selection = sampler.select_action(vec!["best".to_string(), "worst".to_string()]);
            if selection.action_key == "best" {
                best_count += 1;
            }
        }

        // Best arm should be selected most of the time
        assert!(best_count > 70, "Best arm should be selected most often, got {}", best_count);
    }

    #[test]
    fn test_context_operations() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Update with context
        sampler.update_with_context("ctx1".to_string(), "action1".to_string(), true);
        sampler.update_with_context("ctx1".to_string(), "action1".to_string(), true);

        let expected = sampler.get_expected_value_with_context("ctx1".to_string(), "action1".to_string());
        assert!(expected > 0.5, "Expected value with context should be > 0.5");

        // Different context should be independent
        let other_ctx = sampler.get_expected_value_with_context("ctx2".to_string(), "action1".to_string());
        assert!((other_ctx - 0.5).abs() < EPSILON, "Different context should have default value");
    }

    #[test]
    fn test_select_action_with_context() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Set up context-specific preferences
        for _ in 0..10 {
            sampler.update_with_context("morning".to_string(), "easy".to_string(), true);
            sampler.update_with_context("morning".to_string(), "hard".to_string(), false);
        }

        // Select action in morning context
        let selection = sampler.select_action_with_context(
            "morning".to_string(),
            vec!["easy".to_string(), "hard".to_string()],
        );

        assert!(selection.confidence > 0.0, "Should have some confidence");
    }

    #[test]
    fn test_state_persistence() {
        let mut sampler1 = ThompsonSamplingNative::with_seed(42);

        // Make some updates
        sampler1.update("action1".to_string(), true);
        sampler1.update("action1".to_string(), true);
        sampler1.update_with_context("ctx".to_string(), "action2".to_string(), false);

        // Get state
        let state = sampler1.get_state();

        // Create new sampler and restore state
        let mut sampler2 = ThompsonSamplingNative::with_seed(123);
        sampler2.set_state(state);

        // Verify state is restored
        assert_eq!(sampler1.get_update_count(), sampler2.get_update_count());

        let exp1 = sampler1.get_expected_value("action1".to_string());
        let exp2 = sampler2.get_expected_value("action1".to_string());
        assert!((exp1 - exp2).abs() < EPSILON, "Expected values should match");
    }

    #[test]
    fn test_reset() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        sampler.update("test".to_string(), true);
        sampler.update_with_context("ctx".to_string(), "action".to_string(), true);

        assert!(sampler.get_update_count() > 0, "Should have updates");

        sampler.reset();

        assert_eq!(sampler.get_update_count(), 0, "Update count should be 0 after reset");
        assert!(sampler.get_global_params("test".to_string()).is_none(), "Params should be cleared");
        let expected = sampler.get_expected_value("test".to_string());
        assert!((expected - 0.5).abs() < EPSILON, "Expected value should be default after reset");
    }

    #[test]
    fn test_seed_reproducibility() {
        let mut sampler1 = ThompsonSamplingNative::with_seed(42);
        let mut sampler2 = ThompsonSamplingNative::with_seed(42);

        // Same seed should produce same samples
        for _ in 0..10 {
            let s1 = sampler1.sample_beta(2.0, 3.0);
            let s2 = sampler2.sample_beta(2.0, 3.0);
            assert!((s1 - s2).abs() < EPSILON, "Same seed should produce same results");
        }
    }

    #[test]
    fn test_batch_update() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        let updates = vec![
            BatchUpdateItem {
                action_key: "a".to_string(),
                success: true,
            },
            BatchUpdateItem {
                action_key: "a".to_string(),
                success: true,
            },
            BatchUpdateItem {
                action_key: "b".to_string(),
                success: false,
            },
        ];

        sampler.batch_update(updates);

        assert_eq!(sampler.get_update_count(), 3, "Should have 3 updates");

        let exp_a = sampler.get_expected_value("a".to_string());
        let exp_b = sampler.get_expected_value("b".to_string());
        assert!(exp_a > exp_b, "Action 'a' should have higher expected value");
    }

    #[test]
    fn test_sample_count() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        assert_eq!(sampler.get_sample_count("test".to_string()), 0.0, "Initial sample count should be 0");

        sampler.update("test".to_string(), true);
        sampler.update("test".to_string(), false);

        assert_eq!(sampler.get_sample_count("test".to_string()), 2.0, "Sample count should be 2");
    }

    #[test]
    fn test_confidence_calculation() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Initial selection should have low confidence
        let initial_selection = sampler.select_action(vec!["test".to_string()]);
        assert!(initial_selection.confidence < 0.1, "Initial confidence should be low");

        // After many updates, confidence should increase
        for _ in 0..50 {
            sampler.update("test".to_string(), true);
        }

        let final_selection = sampler.select_action(vec!["test".to_string()]);
        assert!(final_selection.confidence > 0.5, "Confidence should increase with more data");
    }

    #[test]
    fn test_edge_cases() {
        let mut sampler = ThompsonSamplingNative::with_seed(42);

        // Empty action list
        let selection = sampler.select_action(vec![]);
        assert!(selection.action_key.is_empty(), "Empty action list should return empty key");

        // Very small alpha/beta values
        let sample = sampler.sample_beta(0.001, 0.001);
        assert!(sample >= 0.0 && sample <= 1.0, "Should handle very small parameters");

        // Very large alpha/beta values
        let sample = sampler.sample_beta(1000.0, 1000.0);
        assert!((sample - 0.5).abs() < 0.1, "Large equal params should give ~0.5");
    }
}
