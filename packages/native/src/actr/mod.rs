//! ACT-R Memory Model - Native Rust Implementation
//!
//! Core theory:
//! - Based on Anderson's ACT-R cognitive architecture
//! - Activation model: memory item accessibility decays over time
//! - Recall probability model: activation determines recall success probability
//! - Optimal interval: find the time point when recall probability drops to target
//!
//! Mathematical formulas:
//! - Activation: A = ln(Σ w_j * t_j^(-d)) + ε
//!   - t_j: time since j-th review (seconds)
//!   - d: decay rate (typically 0.5)
//!   - w_j: weight (1.0 for correct, ERROR_PENALTY for incorrect)
//!   - ε: Gaussian noise
//!
//! - Recall probability: P = 1 / (1 + exp(-(A-τ)/s))
//!   - τ: recall threshold
//!   - s: noise scale
//!
//! References:
//! - Anderson, J. R., & Lebiere, C. (1998). The atomic components of thought.
//! - Pavlik Jr, P. I., & Anderson, J. R. (2005). Practice and forgetting effects.

#[cfg(feature = "napi")]
use napi_derive::napi;
use rayon::prelude::*;

// ==================== Constants ====================

/// Error review penalty factor
/// Incorrect retrieval attempts have weaker memory strengthening effects
/// Reference: Pavlik & Anderson (2005) - error feedback effect is ~30% of correct feedback
const ERROR_PENALTY: f64 = 0.3;

/// Default decay rate (Anderson recommended value)
const DEFAULT_DECAY: f64 = 0.5;

/// Default recall threshold
const DEFAULT_THRESHOLD: f64 = 0.3;

/// Default noise scale
const DEFAULT_NOISE_SCALE: f64 = 0.4;

/// Minimum time (prevent log(0))
const MIN_TIME: f64 = 1e-3;

/// Maximum search time (7 days in seconds)
const MAX_SEARCH_SECONDS: f64 = 7.0 * 24.0 * 3600.0;

/// Binary search maximum iterations
const MAX_SEARCH_ITERATIONS: usize = 60;

/// Default binary search tolerance
const DEFAULT_TOLERANCE: f64 = 1e-3;

// ==================== Data Structures ====================

/// Memory trace record
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct MemoryTrace {
    /// Time since this review (seconds ago from current time)
    pub timestamp: f64,
    /// Whether the answer was correct
    pub is_correct: bool,
}

/// ACT-R model state
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct ACTRState {
    /// Decay rate d (default 0.5)
    pub decay: f64,
    /// Recall threshold τ
    pub threshold: f64,
    /// Noise scale s
    pub noise_scale: f64,
    /// Update count
    pub update_count: u32,
}

impl Default for ACTRState {
    fn default() -> Self {
        Self {
            decay: DEFAULT_DECAY,
            threshold: DEFAULT_THRESHOLD,
            noise_scale: DEFAULT_NOISE_SCALE,
            update_count: 0,
        }
    }
}

/// Cognitive profile for personalized decay rate
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug, Default)]
pub struct CognitiveProfile {
    /// Memory factor [0, 1], higher means better memory
    pub memory_factor: f64,
    /// Speed factor [0, 1], higher means faster processing
    pub speed_factor: f64,
    /// Stability factor [0, 1], higher means more stable memory
    pub stability_factor: f64,
}

/// Activation computation result
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct ActivationResult {
    /// Base activation (without noise)
    pub base_activation: f64,
    /// Activation with noise
    pub activation: f64,
    /// Recall probability
    pub recall_probability: f64,
}

/// Recall prediction result
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct RecallPrediction {
    /// Activation (typically -2 to 2)
    pub activation: f64,
    /// Recall probability [0, 1]
    pub recall_probability: f64,
    /// Prediction confidence [0, 1]
    pub confidence: f64,
}

/// Optimal interval prediction result
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct IntervalPrediction {
    /// Optimal interval (seconds)
    pub optimal_seconds: f64,
    /// Minimum suggested interval (seconds)
    pub min_seconds: f64,
    /// Maximum suggested interval (seconds)
    pub max_seconds: f64,
    /// Target recall probability
    pub target_recall: f64,
}

/// Batch computation input
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct BatchComputeInput {
    /// Traces for this computation
    pub traces: Vec<MemoryTrace>,
    /// Current time for this computation
    pub current_time: f64,
}

/// Batch computation result
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct BatchComputeResult {
    /// Activation value
    pub activation: f64,
    /// Recall probability
    pub recall_probability: f64,
}

// ==================== Action Selection Types ====================

/// User state for action selection
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct ACTRSelectionState {
    /// Attention level [0, 1]
    pub attention: f64,
    /// Fatigue level [0, 1]
    pub fatigue: f64,
    /// Motivation level [-1, 1]
    pub motivation: f64,
    /// Confidence level [0, 1]
    pub conf: f64,
    /// Timestamp
    pub ts: f64,
    /// Memory factor [0, 1]
    pub mem: f64,
    /// Speed factor [0, 1]
    pub speed: f64,
    /// Stability factor [0, 1]
    pub stability: f64,
}

/// Context for action selection
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct ACTRSelectionContext {
    /// Current time (timestamp)
    pub current_time: f64,
    /// Session duration in milliseconds
    pub session_duration: f64,
    /// Number of words reviewed in session
    pub words_reviewed: u32,
}

/// Action parameters for selection
#[derive(Clone, Debug, serde::Deserialize)]
pub struct ACTRActionParams {
    /// Interval scale factor
    pub interval_scale: f64,
    /// New word ratio [0, 1]
    pub new_ratio: f64,
    /// Difficulty level ("easy", "mid", "hard")
    pub difficulty: String,
    /// Batch size
    pub batch_size: u32,
    /// Hint level (0, 1, 2)
    pub hint_level: u32,
}

/// Action selection result
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Clone, Debug)]
pub struct ACTRSelectionResult {
    /// Selected action index
    pub selected_index: u32,
    /// Selection score
    pub score: f64,
    /// Confidence level [0, 1]
    pub confidence: f64,
    /// Optional metadata (JSON string)
    pub metadata: Option<String>,
}

// ==================== ACT-R Memory Model ====================

/// ACT-R Memory Model Native Implementation
///
/// Use cases:
/// - Predict word forgetting curves
/// - Calculate optimal review intervals
/// - Long-term memory retention optimization
#[cfg_attr(feature = "napi", napi)]
pub struct ACTRMemoryNative {
    state: ACTRState,
    tolerance: f64,
    max_search_seconds: f64,
}

#[cfg_attr(feature = "napi", napi)]
impl ACTRMemoryNative {
    /// Create a new ACT-R memory model instance
    #[cfg_attr(feature = "napi", napi(constructor))]
    pub fn new(
        decay: Option<f64>,
        threshold: Option<f64>,
        noise_scale: Option<f64>,
    ) -> Self {
        Self {
            state: ACTRState {
                decay: decay.unwrap_or(DEFAULT_DECAY),
                threshold: threshold.unwrap_or(DEFAULT_THRESHOLD),
                noise_scale: noise_scale.unwrap_or(DEFAULT_NOISE_SCALE),
                update_count: 0,
            },
            tolerance: DEFAULT_TOLERANCE,
            max_search_seconds: MAX_SEARCH_SECONDS,
        }
    }

    /// Compute activation: A = ln(Σ w_j · t_j^(-d))
    ///
    /// # Arguments
    /// * `traces` - Memory traces where `timestamp` is the **absolute time** of each review
    /// * `current_time` - Current time in seconds (same unit as traces.timestamp)
    ///
    /// # Note
    /// For "seconds ago" format, use `compute_activation_from_seconds_ago` instead.
    ///
    /// # Returns
    /// Activation value (can be -Infinity for empty traces)
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_activation(&self, traces: Vec<MemoryTrace>, current_time: f64) -> f64 {
        self.compute_activation_internal(&traces, current_time, self.state.decay)
    }

    /// Compute activation with custom decay rate
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_activation_with_decay(
        &self,
        traces: Vec<MemoryTrace>,
        current_time: f64,
        decay: f64,
    ) -> f64 {
        self.compute_activation_internal(&traces, current_time, decay)
    }

    /// Internal activation computation
    /// Uses absolute timestamps: age = current_time - timestamp
    fn compute_activation_internal(
        &self,
        traces: &[MemoryTrace],
        current_time: f64,
        decay: f64,
    ) -> f64 {
        if traces.is_empty() {
            return f64::NEG_INFINITY;
        }

        let sum: f64 = traces
            .iter()
            .filter(|t| t.timestamp < current_time)
            .map(|t| {
                // timestamp is absolute time, so age = current_time - timestamp
                let age = (current_time - t.timestamp).max(MIN_TIME);
                let weight = if t.is_correct { 1.0 } else { ERROR_PENALTY };
                weight * age.powf(-decay)
            })
            .sum();

        if sum > 0.0 && sum.is_finite() {
            sum.ln()
        } else {
            f64::NEG_INFINITY
        }
    }

    /// Compute activation from "seconds ago" format traces (matching TypeScript API)
    ///
    /// # Arguments
    /// * `traces` - Memory traces where `timestamp` represents **seconds ago from now**
    ///   (e.g., timestamp=60 means this review happened 60 seconds ago)
    ///
    /// # Returns
    /// Activation value (can be -Infinity for empty traces)
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_activation_from_seconds_ago(&self, traces: Vec<MemoryTrace>) -> f64 {
        self.compute_activation_from_seconds_ago_internal(&traces, self.state.decay)
    }

    /// Internal computation for "seconds ago" format
    fn compute_activation_from_seconds_ago_internal(
        &self,
        traces: &[MemoryTrace],
        decay: f64,
    ) -> f64 {
        if traces.is_empty() {
            return f64::NEG_INFINITY;
        }

        let sum: f64 = traces
            .iter()
            .map(|t| {
                // timestamp here means "seconds ago"
                let age = t.timestamp.max(MIN_TIME);
                let weight = if t.is_correct { 1.0 } else { ERROR_PENALTY };
                weight * age.powf(-decay)
            })
            .sum();

        if sum > 0.0 && sum.is_finite() {
            sum.ln()
        } else {
            f64::NEG_INFINITY
        }
    }

    /// Compute recall probability: P = 1 / (1 + exp(-(A-τ)/s))
    ///
    /// # Arguments
    /// * `activation` - Activation value
    ///
    /// # Returns
    /// Recall probability [0, 1]
    #[cfg_attr(feature = "napi", napi)]
    pub fn retrieval_probability(&self, activation: f64) -> f64 {
        self.compute_recall_probability_internal(
            activation,
            self.state.threshold,
            self.state.noise_scale,
        )
    }

    /// Compute recall probability with custom parameters
    #[cfg_attr(feature = "napi", napi)]
    pub fn retrieval_probability_with_params(
        &self,
        activation: f64,
        threshold: f64,
        noise_scale: f64,
    ) -> f64 {
        self.compute_recall_probability_internal(activation, threshold, noise_scale)
    }

    /// Internal recall probability computation
    fn compute_recall_probability_internal(
        &self,
        activation: f64,
        threshold: f64,
        noise_scale: f64,
    ) -> f64 {
        if !activation.is_finite() {
            return 0.0;
        }

        let s = noise_scale.max(1e-6);
        let z = (activation - threshold) / s;
        let prob = 1.0 / (1.0 + (-z).exp());

        if prob.is_finite() {
            prob.clamp(0.0, 1.0)
        } else {
            0.0
        }
    }

    /// Compute personalized decay rate based on cognitive profile
    ///
    /// Algorithm:
    /// - Higher memory factor → slower decay (better retention)
    /// - Higher speed factor → slightly faster decay (shallow encoding)
    /// - Higher stability factor → damping toward default value
    ///
    /// Reference: Pavlik & Anderson (2008) individual differences model
    ///
    /// # Arguments
    /// * `memory_factor` - Memory ability [0, 1]
    /// * `speed_factor` - Processing speed [0, 1]
    /// * `stability_factor` - Memory stability [0, 1]
    ///
    /// # Returns
    /// Personalized decay rate [0.3, 0.7]
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_personalized_decay(
        &self,
        memory_factor: f64,
        speed_factor: f64,
        stability_factor: f64,
    ) -> f64 {
        let base_decay = self.state.decay;

        // Memory factor: better memory → slower decay (reduce decay rate)
        // mem=0.5 is neutral, mem=1 reduces decay by 30%
        let mem_factor = 1.0 - memory_factor.clamp(0.0, 1.0) * 0.3;

        // Speed factor: faster processing → slightly faster decay (shallow encoding)
        // speed=0.5 is neutral, speed=1 increases decay by 20%
        let speed_factor_adj = 1.0 + speed_factor.clamp(0.0, 1.0) * 0.2;

        // Stability damping: higher stability → adjustments move toward default
        let stability = stability_factor.clamp(0.0, 1.0);
        let damping_factor = 0.3 + stability * 0.7; // stability=1 means damping=1 (use default)

        // Calculate personalized decay
        let personalized_decay = base_decay * mem_factor * speed_factor_adj;

        // Apply damping: high stability users use decay closer to default
        let final_decay = base_decay * damping_factor + personalized_decay * (1.0 - damping_factor);

        // Clamp to reasonable range [0.3, 0.7]
        final_decay.clamp(0.3, 0.7)
    }

    /// Compute optimal review interval using binary search
    ///
    /// Finds the time when recall probability drops to target value.
    ///
    /// # Arguments
    /// * `traces` - Current review traces (in "seconds ago" format)
    /// * `target_probability` - Target recall probability (e.g., 0.7 means review at 70%)
    ///
    /// # Returns
    /// Optimal interval in seconds
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_optimal_interval(
        &self,
        traces: Vec<MemoryTrace>,
        target_probability: f64,
    ) -> f64 {
        self.compute_optimal_interval_with_decay(traces, target_probability, self.state.decay)
    }

    /// Compute optimal interval with custom decay rate
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_optimal_interval_with_decay(
        &self,
        traces: Vec<MemoryTrace>,
        target_probability: f64,
        decay: f64,
    ) -> f64 {
        let target = target_probability.clamp(0.01, 0.99);

        // Compute current activation (no noise for stable prediction)
        let current_activation = self.compute_activation_from_seconds_ago_internal(&traces, decay);
        if !current_activation.is_finite() {
            return 0.0;
        }

        // Current recall probability
        let current_prob = self.compute_recall_probability_internal(
            current_activation,
            self.state.threshold,
            self.state.noise_scale,
        );

        if current_prob <= target {
            return 0.0; // Already below target, should review immediately
        }

        // Binary search for optimal interval
        let mut low = 0.0;
        let mut high = self.max_search_seconds;

        for _ in 0..MAX_SEARCH_ITERATIONS {
            let mid = (low + high) / 2.0;

            // Calculate activation at mid seconds in the future
            // Add mid to each "seconds ago" value
            let future_traces: Vec<MemoryTrace> = traces
                .iter()
                .map(|t| MemoryTrace {
                    timestamp: t.timestamp + mid,
                    is_correct: t.is_correct,
                })
                .collect();

            let future_activation =
                self.compute_activation_from_seconds_ago_internal(&future_traces, decay);
            let future_prob = self.compute_recall_probability_internal(
                future_activation,
                self.state.threshold,
                self.state.noise_scale,
            );

            if (future_prob - target).abs() < self.tolerance {
                return mid;
            }

            if future_prob > target {
                // Probability still too high, need more time
                low = mid;
            } else {
                // Probability already too low, reduce time
                high = mid;
            }
        }

        (low + high) / 2.0
    }

    /// Compute full activation result (base, with noise, and probability)
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_full_activation(&self, traces: Vec<MemoryTrace>) -> ActivationResult {
        self.compute_full_activation_with_decay(traces, self.state.decay)
    }

    /// Compute full activation with custom decay
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_full_activation_with_decay(
        &self,
        traces: Vec<MemoryTrace>,
        decay: f64,
    ) -> ActivationResult {
        if traces.is_empty() {
            return ActivationResult {
                base_activation: f64::NEG_INFINITY,
                activation: f64::NEG_INFINITY,
                recall_probability: 0.0,
            };
        }

        let base_activation = self.compute_activation_from_seconds_ago_internal(&traces, decay);

        if !base_activation.is_finite() {
            return ActivationResult {
                base_activation: f64::NEG_INFINITY,
                activation: f64::NEG_INFINITY,
                recall_probability: 0.0,
            };
        }

        // Add noise using Box-Muller transform
        let noise = sample_standard_normal() * self.state.noise_scale;
        let activation = base_activation + noise;

        let recall_probability = self.compute_recall_probability_internal(
            activation,
            self.state.threshold,
            self.state.noise_scale,
        );

        ActivationResult {
            base_activation,
            activation,
            recall_probability,
        }
    }

    /// Compute recall prediction with confidence
    #[cfg_attr(feature = "napi", napi)]
    pub fn predict_recall(&self, traces: Vec<MemoryTrace>) -> RecallPrediction {
        if traces.is_empty() {
            return RecallPrediction {
                activation: f64::NEG_INFINITY,
                recall_probability: 0.0,
                confidence: 0.0,
            };
        }

        // Use noise-free activation for stable prediction
        let activation = self.compute_activation_from_seconds_ago_internal(&traces, self.state.decay);
        let recall_probability = self.compute_recall_probability_internal(
            activation,
            self.state.threshold,
            self.state.noise_scale,
        );

        // Confidence based on review count and time span
        let review_count = traces.len() as f64;
        let time_span = if traces.len() > 1 {
            let max_time = traces.iter().map(|t| t.timestamp).fold(0.0_f64, f64::max);
            let min_time = traces.iter().map(|t| t.timestamp).fold(f64::INFINITY, f64::min);
            max_time - min_time
        } else {
            0.0
        };

        let count_factor = (review_count / 10.0).min(1.0); // 10 reviews = full confidence
        let time_factor = (time_span / (7.0 * 24.0 * 3600.0)).min(1.0); // 7 days span = full confidence

        // Single review special handling: base confidence of 0.3
        let base_single_review_confidence = 0.3;
        let raw_confidence = 0.5 * count_factor + 0.5 * time_factor;
        let confidence = if traces.len() == 1 {
            raw_confidence.max(base_single_review_confidence)
        } else {
            raw_confidence.clamp(0.0, 1.0)
        };

        RecallPrediction {
            activation,
            recall_probability,
            confidence,
        }
    }

    /// Predict optimal review interval with min/max suggestions
    #[cfg_attr(feature = "napi", napi)]
    pub fn predict_optimal_interval(
        &self,
        traces: Vec<MemoryTrace>,
        target_recall: Option<f64>,
    ) -> IntervalPrediction {
        let target = target_recall.unwrap_or(0.9).clamp(0.01, 0.99);

        // Optimal interval at target probability
        let optimal_seconds = self.compute_optimal_interval(traces.clone(), target);

        // Min interval (target + 0.1, max 0.95)
        let high_target = (target + 0.1).min(0.95);
        let min_seconds = self.compute_optimal_interval(traces.clone(), high_target);

        // Max interval (target - 0.15, min 0.5)
        let low_target = (target - 0.15).max(0.5);
        let max_seconds = self.compute_optimal_interval(traces, low_target);

        // Clamp to reasonable range: 1 hour to 30 days
        const MIN_INTERVAL: f64 = 3600.0; // 1 hour
        const MAX_INTERVAL: f64 = 30.0 * 24.0 * 3600.0; // 30 days

        IntervalPrediction {
            optimal_seconds: optimal_seconds.clamp(MIN_INTERVAL, MAX_INTERVAL),
            min_seconds: min_seconds.clamp(MIN_INTERVAL, MAX_INTERVAL),
            max_seconds: max_seconds.clamp(MIN_INTERVAL, MAX_INTERVAL),
            target_recall: target,
        }
    }

    /// Batch compute activations using parallel processing (Rayon)
    ///
    /// Efficiently processes multiple memory trace sets in parallel.
    ///
    /// # Arguments
    /// * `inputs` - Vector of batch computation inputs
    ///
    /// # Returns
    /// Vector of batch computation results
    #[cfg_attr(feature = "napi", napi)]
    pub fn batch_compute_activations(&self, inputs: Vec<BatchComputeInput>) -> Vec<BatchComputeResult> {
        let decay = self.state.decay;
        let threshold = self.state.threshold;
        let noise_scale = self.state.noise_scale;

        inputs
            .par_iter()
            .map(|input| {
                let activation = compute_activation_internal_static(
                    &input.traces,
                    input.current_time,
                    decay,
                );
                let recall_probability =
                    compute_recall_probability_static(activation, threshold, noise_scale);

                BatchComputeResult {
                    activation,
                    recall_probability,
                }
            })
            .collect()
    }

    /// Batch compute activations from "seconds ago" format using parallel processing
    #[cfg_attr(feature = "napi", napi)]
    pub fn batch_compute_activations_from_seconds_ago(
        &self,
        trace_sets: Vec<Vec<MemoryTrace>>,
    ) -> Vec<BatchComputeResult> {
        let decay = self.state.decay;
        let threshold = self.state.threshold;
        let noise_scale = self.state.noise_scale;

        trace_sets
            .par_iter()
            .map(|traces| {
                let activation = compute_activation_from_seconds_ago_static(traces, decay);
                let recall_probability =
                    compute_recall_probability_static(activation, threshold, noise_scale);

                BatchComputeResult {
                    activation,
                    recall_probability,
                }
            })
            .collect()
    }

    /// Batch compute optimal intervals using parallel processing
    #[cfg_attr(feature = "napi", napi)]
    pub fn batch_compute_optimal_intervals(
        &self,
        trace_sets: Vec<Vec<MemoryTrace>>,
        target_probability: f64,
    ) -> Vec<f64> {
        let decay = self.state.decay;
        let threshold = self.state.threshold;
        let noise_scale = self.state.noise_scale;
        let tolerance = self.tolerance;
        let max_search_seconds = self.max_search_seconds;
        let target = target_probability.clamp(0.01, 0.99);

        trace_sets
            .par_iter()
            .map(|traces| {
                compute_optimal_interval_static(
                    traces,
                    target,
                    decay,
                    threshold,
                    noise_scale,
                    tolerance,
                    max_search_seconds,
                )
            })
            .collect()
    }

    /// Get current state
    #[cfg_attr(feature = "napi", napi)]
    pub fn get_state(&self) -> ACTRState {
        self.state.clone()
    }

    /// Set state
    #[cfg_attr(feature = "napi", napi)]
    pub fn set_state(&mut self, state: ACTRState) {
        // Validate and clamp parameters
        self.state = ACTRState {
            decay: state.decay.clamp(0.1, 1.0),
            threshold: state.threshold.clamp(-1.0, 2.0),
            noise_scale: state.noise_scale.clamp(0.1, 2.0),
            update_count: state.update_count,
        };
    }

    /// Update model (increment update count)
    #[cfg_attr(feature = "napi", napi)]
    pub fn update(&mut self) {
        self.state.update_count += 1;
    }

    /// Reset model
    #[cfg_attr(feature = "napi", napi)]
    pub fn reset(&mut self) {
        self.state.update_count = 0;
    }

    /// Get decay rate
    #[cfg_attr(feature = "napi", napi)]
    pub fn get_decay(&self) -> f64 {
        self.state.decay
    }

    /// Set decay rate
    #[cfg_attr(feature = "napi", napi)]
    pub fn set_decay(&mut self, decay: f64) {
        self.state.decay = decay.clamp(0.1, 1.0);
    }

    /// Get threshold
    #[cfg_attr(feature = "napi", napi)]
    pub fn get_threshold(&self) -> f64 {
        self.state.threshold
    }

    /// Set threshold
    #[cfg_attr(feature = "napi", napi)]
    pub fn set_threshold(&mut self, threshold: f64) {
        self.state.threshold = threshold;
    }

    /// Compute memory strength (normalized activation)
    #[cfg_attr(feature = "napi", napi)]
    pub fn compute_memory_strength(&self, traces: Vec<MemoryTrace>) -> f64 {
        let activation = self.compute_activation_from_seconds_ago_internal(&traces, self.state.decay);
        if !activation.is_finite() {
            return 0.0;
        }
        // Map activation to [0, 1] using sigmoid (same as recall probability)
        self.compute_recall_probability_internal(
            activation,
            self.state.threshold,
            self.state.noise_scale,
        )
    }

    /// Select action from serialized state and actions
    ///
    /// This method enables Native-side action selection based on ACT-R memory model principles.
    /// The selection is based on:
    /// 1. User state (attention, fatigue, motivation, cognitive profile)
    /// 2. Available actions with their parameters
    /// 3. Context information (session duration, words reviewed)
    ///
    /// # Arguments
    /// * `state` - Serialized user state
    /// * `actions` - Serialized action parameters (JSON array string)
    /// * `context` - Context information (JSON object string)
    ///
    /// # Returns
    /// Selection result with selected index, score and confidence
    #[cfg_attr(feature = "napi", napi)]
    pub fn select_action_from_serialized(
        &self,
        state: ACTRSelectionState,
        actions: String,
        context: ACTRSelectionContext,
    ) -> ACTRSelectionResult {
        // Parse actions from JSON string
        let parsed_actions: Vec<ACTRActionParams> = match serde_json::from_str(&actions) {
            Ok(a) => a,
            Err(_) => {
                // Return fallback (first action) on parse error
                return ACTRSelectionResult {
                    selected_index: 0,
                    score: 0.5,
                    confidence: 0.0,
                    metadata: None,
                };
            }
        };

        if parsed_actions.is_empty() {
            return ACTRSelectionResult {
                selected_index: 0,
                score: 0.0,
                confidence: 0.0,
                metadata: None,
            };
        }

        // Calculate scores for each action
        let scores: Vec<f64> = parsed_actions
            .iter()
            .map(|action| self.compute_action_score(&state, action, &context))
            .collect();

        // Find best action (highest score)
        let (selected_index, &best_score) = scores
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or((0, &0.0));

        // Calculate confidence based on score spread
        let mean_score = scores.iter().sum::<f64>() / scores.len() as f64;
        let variance = scores.iter().map(|s| (s - mean_score).powi(2)).sum::<f64>() / scores.len() as f64;
        let confidence = if variance > 0.0 {
            // Higher variance = more confident in selection
            (variance.sqrt() * 2.0).min(1.0)
        } else {
            0.5 // Uniform scores = low confidence
        };

        ACTRSelectionResult {
            selected_index: selected_index as u32,
            score: best_score,
            confidence,
            metadata: Some(format!(
                "{{\"scores\":[{}],\"mean_score\":{:.4}}}",
                scores.iter().map(|s| format!("{:.4}", s)).collect::<Vec<_>>().join(","),
                mean_score
            )),
        }
    }

    /// Compute score for a single action based on user state and context
    fn compute_action_score(
        &self,
        state: &ACTRSelectionState,
        action: &ACTRActionParams,
        context: &ACTRSelectionContext,
    ) -> f64 {
        // Base score starts at 0.5
        let mut score = 0.5;

        // Factor 1: Fatigue adjustment
        // High fatigue (>0.6) favors lower difficulty and higher interval_scale
        if state.fatigue > 0.6 {
            let fatigue_penalty = (state.fatigue - 0.6) * 0.5;
            // Favor easier difficulty
            score += match action.difficulty.as_str() {
                "easy" => 0.1,
                "mid" => 0.0,
                "hard" => -0.15,
                _ => 0.0,
            };
            // Favor longer intervals
            if action.interval_scale > 1.0 {
                score += 0.05 * (action.interval_scale - 1.0).min(0.5);
            }
            score -= fatigue_penalty * 0.3;
        }

        // Factor 2: Attention adjustment
        // Low attention (<0.5) favors smaller batch sizes and more hints
        if state.attention < 0.5 {
            let attention_penalty = (0.5 - state.attention) * 0.4;
            // Favor smaller batches
            if action.batch_size <= 6 {
                score += 0.08;
            } else if action.batch_size > 10 {
                score -= 0.1;
            }
            // Favor more hints
            score += action.hint_level as f64 * 0.03;
            score -= attention_penalty * 0.2;
        }

        // Factor 3: Motivation adjustment
        // Low motivation favors easier content and fewer new words
        if state.motivation < 0.0 {
            let motivation_penalty = -state.motivation * 0.3;
            score += match action.difficulty.as_str() {
                "easy" => 0.08,
                "mid" => 0.0,
                "hard" => -0.12,
                _ => 0.0,
            };
            // Favor lower new_ratio
            if action.new_ratio < 0.2 {
                score += 0.05;
            }
            score -= motivation_penalty * 0.25;
        }

        // Factor 4: Memory stability adjustment
        // High stability (>0.7) can handle more challenging content
        if state.stability > 0.7 {
            let stability_bonus = (state.stability - 0.7) * 0.3;
            // Can handle harder difficulty
            score += match action.difficulty.as_str() {
                "easy" => -0.02,
                "mid" => 0.02,
                "hard" => 0.05,
                _ => 0.0,
            };
            // Can handle more new words
            score += action.new_ratio * stability_bonus * 0.3;
        }

        // Factor 5: Session context adjustment
        // Longer sessions should have more conservative parameters
        let session_minutes = context.session_duration / 60000.0;
        if session_minutes > 30.0 {
            // Favor easier content as session extends
            let session_factor = ((session_minutes - 30.0) / 30.0).min(1.0);
            score += match action.difficulty.as_str() {
                "easy" => 0.05 * session_factor,
                "hard" => -0.08 * session_factor,
                _ => 0.0,
            };
        }

        // Clamp score to [0, 1]
        score.clamp(0.0, 1.0)
    }
}

// ==================== Static Helper Functions ====================

/// Static activation computation (for parallel processing)
fn compute_activation_internal_static(
    traces: &[MemoryTrace],
    current_time: f64,
    decay: f64,
) -> f64 {
    if traces.is_empty() {
        return f64::NEG_INFINITY;
    }

    let sum: f64 = traces
        .iter()
        .filter(|t| t.timestamp < current_time)
        .map(|t| {
            let age = (current_time - t.timestamp).max(MIN_TIME);
            let weight = if t.is_correct { 1.0 } else { ERROR_PENALTY };
            weight * age.powf(-decay)
        })
        .sum();

    if sum > 0.0 && sum.is_finite() {
        sum.ln()
    } else {
        f64::NEG_INFINITY
    }
}

/// Static activation computation from "seconds ago" format
fn compute_activation_from_seconds_ago_static(traces: &[MemoryTrace], decay: f64) -> f64 {
    if traces.is_empty() {
        return f64::NEG_INFINITY;
    }

    let sum: f64 = traces
        .iter()
        .map(|t| {
            let age = t.timestamp.max(MIN_TIME);
            let weight = if t.is_correct { 1.0 } else { ERROR_PENALTY };
            weight * age.powf(-decay)
        })
        .sum();

    if sum > 0.0 && sum.is_finite() {
        sum.ln()
    } else {
        f64::NEG_INFINITY
    }
}

/// Static recall probability computation
fn compute_recall_probability_static(activation: f64, threshold: f64, noise_scale: f64) -> f64 {
    if !activation.is_finite() {
        return 0.0;
    }

    let s = noise_scale.max(1e-6);
    let z = (activation - threshold) / s;
    let prob = 1.0 / (1.0 + (-z).exp());

    if prob.is_finite() {
        prob.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// Static optimal interval computation
fn compute_optimal_interval_static(
    traces: &[MemoryTrace],
    target: f64,
    decay: f64,
    threshold: f64,
    noise_scale: f64,
    tolerance: f64,
    max_search_seconds: f64,
) -> f64 {
    let current_activation = compute_activation_from_seconds_ago_static(traces, decay);
    if !current_activation.is_finite() {
        return 0.0;
    }

    let current_prob = compute_recall_probability_static(current_activation, threshold, noise_scale);
    if current_prob <= target {
        return 0.0;
    }

    let mut low = 0.0;
    let mut high = max_search_seconds;

    for _ in 0..MAX_SEARCH_ITERATIONS {
        let mid = (low + high) / 2.0;

        let future_traces: Vec<MemoryTrace> = traces
            .iter()
            .map(|t| MemoryTrace {
                timestamp: t.timestamp + mid,
                is_correct: t.is_correct,
            })
            .collect();

        let future_activation = compute_activation_from_seconds_ago_static(&future_traces, decay);
        let future_prob = compute_recall_probability_static(future_activation, threshold, noise_scale);

        if (future_prob - target).abs() < tolerance {
            return mid;
        }

        if future_prob > target {
            low = mid;
        } else {
            high = mid;
        }
    }

    (low + high) / 2.0
}

/// Sample from standard normal distribution using Box-Muller transform
fn sample_standard_normal() -> f64 {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let u1: f64 = rng.gen::<f64>().max(1e-12);
    let u2: f64 = rng.gen();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

// ==================== Standalone Functions (exported via napi) ====================

/// Compute activation (standalone function)
#[cfg_attr(feature = "napi", napi)]
pub fn compute_activation(traces: Vec<MemoryTrace>, decay: Option<f64>) -> f64 {
    let d = decay.unwrap_or(DEFAULT_DECAY);
    compute_activation_from_seconds_ago_static(&traces, d)
}

/// Compute recall probability (standalone function)
#[cfg_attr(feature = "napi", napi)]
pub fn compute_recall_probability(
    activation: f64,
    threshold: Option<f64>,
    noise_scale: Option<f64>,
) -> f64 {
    let t = threshold.unwrap_or(DEFAULT_THRESHOLD);
    let s = noise_scale.unwrap_or(DEFAULT_NOISE_SCALE);
    compute_recall_probability_static(activation, t, s)
}

/// Compute optimal interval (standalone function)
#[cfg_attr(feature = "napi", napi)]
pub fn compute_optimal_interval(
    traces: Vec<MemoryTrace>,
    target_probability: f64,
    decay: Option<f64>,
    threshold: Option<f64>,
    noise_scale: Option<f64>,
) -> f64 {
    let d = decay.unwrap_or(DEFAULT_DECAY);
    let t = threshold.unwrap_or(DEFAULT_THRESHOLD);
    let s = noise_scale.unwrap_or(DEFAULT_NOISE_SCALE);

    compute_optimal_interval_static(
        &traces,
        target_probability.clamp(0.01, 0.99),
        d,
        t,
        s,
        DEFAULT_TOLERANCE,
        MAX_SEARCH_SECONDS,
    )
}

// ==================== Unit Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON: f64 = 1e-10;

    fn create_default_model() -> ACTRMemoryNative {
        ACTRMemoryNative::new(None, None, None)
    }

    // ==================== Initialization Tests ====================

    #[test]
    fn test_default_initialization() {
        let model = create_default_model();
        let state = model.get_state();

        assert!((state.decay - 0.5).abs() < EPSILON);
        assert!((state.threshold - 0.3).abs() < EPSILON);
        assert!((state.noise_scale - 0.4).abs() < EPSILON);
        assert_eq!(state.update_count, 0);
    }

    #[test]
    fn test_custom_initialization() {
        let model = ACTRMemoryNative::new(Some(0.6), Some(0.4), Some(0.3));
        let state = model.get_state();

        assert!((state.decay - 0.6).abs() < EPSILON);
        assert!((state.threshold - 0.4).abs() < EPSILON);
        assert!((state.noise_scale - 0.3).abs() < EPSILON);
    }

    // ==================== Activation Computation Tests ====================

    #[test]
    fn test_empty_traces_returns_neg_infinity() {
        let model = create_default_model();
        let activation = model.compute_activation_from_seconds_ago(vec![]);

        assert!(activation.is_infinite() && activation < 0.0);
    }

    #[test]
    fn test_single_recent_trace_activation() {
        let model = create_default_model();
        let traces = vec![MemoryTrace {
            timestamp: 60.0, // 1 minute ago
            is_correct: true,
        }];

        let activation = model.compute_activation_from_seconds_ago(traces);

        // For t=60, d=0.5: sum = 60^(-0.5) ≈ 0.129
        // activation = ln(0.129) ≈ -2.05
        assert!(activation.is_finite());
        assert!(activation > -5.0 && activation < 0.0);
    }

    #[test]
    fn test_recent_trace_has_higher_activation() {
        let model = create_default_model();

        let recent_traces = vec![MemoryTrace {
            timestamp: 60.0,
            is_correct: true,
        }];
        let old_traces = vec![MemoryTrace {
            timestamp: 604800.0, // 1 week
            is_correct: true,
        }];

        let recent_activation = model.compute_activation_from_seconds_ago(recent_traces);
        let old_activation = model.compute_activation_from_seconds_ago(old_traces);

        assert!(recent_activation > old_activation);
    }

    #[test]
    fn test_multiple_traces_accumulate_activation() {
        let model = create_default_model();

        let single_trace = vec![MemoryTrace {
            timestamp: 3600.0,
            is_correct: true,
        }];
        let multiple_traces = vec![
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 7200.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 10800.0,
                is_correct: true,
            },
        ];

        let single_activation = model.compute_activation_from_seconds_ago(single_trace);
        let multiple_activation = model.compute_activation_from_seconds_ago(multiple_traces);

        assert!(multiple_activation > single_activation);
    }

    #[test]
    fn test_error_penalty_reduces_activation() {
        let model = create_default_model();

        let correct_trace = vec![MemoryTrace {
            timestamp: 3600.0,
            is_correct: true,
        }];
        let incorrect_trace = vec![MemoryTrace {
            timestamp: 3600.0,
            is_correct: false,
        }];

        let correct_activation = model.compute_activation_from_seconds_ago(correct_trace);
        let incorrect_activation = model.compute_activation_from_seconds_ago(incorrect_trace);

        // Incorrect should contribute less (ERROR_PENALTY = 0.3)
        assert!(incorrect_activation < correct_activation);

        // The difference should be ln(0.3) ≈ -1.204
        let expected_diff = (1.0_f64).ln() - (ERROR_PENALTY).ln();
        let actual_diff = correct_activation - incorrect_activation;
        assert!((actual_diff - expected_diff).abs() < EPSILON);
    }

    #[test]
    fn test_very_small_time_values() {
        let model = create_default_model();
        let traces = vec![MemoryTrace {
            timestamp: 0.001,
            is_correct: true,
        }];

        let activation = model.compute_activation_from_seconds_ago(traces);

        assert!(activation.is_finite());
    }

    #[test]
    fn test_very_large_time_values() {
        let model = create_default_model();
        let traces = vec![MemoryTrace {
            timestamp: 365.0 * 24.0 * 3600.0, // 1 year
            is_correct: true,
        }];

        let activation = model.compute_activation_from_seconds_ago(traces);

        assert!(activation.is_finite());
    }

    // ==================== Recall Probability Tests ====================

    #[test]
    fn test_recall_probability_range() {
        let model = create_default_model();

        for activation in [-5.0, -2.0, 0.0, 2.0, 5.0].iter() {
            let prob = model.retrieval_probability(*activation);
            assert!(prob >= 0.0 && prob <= 1.0);
        }
    }

    #[test]
    fn test_recall_probability_monotonic() {
        let model = create_default_model();

        let prob_low = model.retrieval_probability(-2.0);
        let prob_mid = model.retrieval_probability(0.0);
        let prob_high = model.retrieval_probability(2.0);

        assert!(prob_low < prob_mid);
        assert!(prob_mid < prob_high);
    }

    #[test]
    fn test_recall_probability_at_threshold() {
        let model = create_default_model();
        let threshold = model.get_threshold();

        let prob = model.retrieval_probability(threshold);

        // At threshold, probability should be 0.5
        assert!((prob - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_recall_probability_neg_infinity() {
        let model = create_default_model();
        let prob = model.retrieval_probability(f64::NEG_INFINITY);

        assert!((prob - 0.0).abs() < EPSILON);
    }

    // ==================== Personalized Decay Tests ====================

    #[test]
    fn test_personalized_decay_default() {
        let model = create_default_model();
        let decay = model.compute_personalized_decay(0.5, 0.5, 0.5);

        // With neutral factors, should be close to default
        assert!(decay >= 0.3 && decay <= 0.7);
    }

    #[test]
    fn test_personalized_decay_high_memory() {
        let model = create_default_model();
        let default_decay = model.compute_personalized_decay(0.5, 0.5, 0.0);
        let high_memory_decay = model.compute_personalized_decay(1.0, 0.5, 0.0);

        // Higher memory factor should result in lower decay
        assert!(high_memory_decay < default_decay);
    }

    #[test]
    fn test_personalized_decay_high_speed() {
        let model = create_default_model();
        let default_decay = model.compute_personalized_decay(0.5, 0.5, 0.0);
        let high_speed_decay = model.compute_personalized_decay(0.5, 1.0, 0.0);

        // Higher speed factor should result in slightly higher decay
        assert!(high_speed_decay > default_decay);
    }

    #[test]
    fn test_personalized_decay_clamped() {
        let model = create_default_model();

        let decay1 = model.compute_personalized_decay(0.0, 0.0, 0.0);
        let decay2 = model.compute_personalized_decay(1.0, 1.0, 1.0);

        // Should be clamped to [0.3, 0.7]
        assert!(decay1 >= 0.3 && decay1 <= 0.7);
        assert!(decay2 >= 0.3 && decay2 <= 0.7);
    }

    // ==================== Optimal Interval Tests ====================

    #[test]
    fn test_optimal_interval_returns_positive() {
        let model = create_default_model();
        let traces = vec![
            MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
        ];

        let interval = model.compute_optimal_interval(traces, 0.9);

        assert!(interval >= 0.0);
    }

    #[test]
    fn test_optimal_interval_lower_target_gives_longer_interval() {
        let model = create_default_model();
        let traces = vec![
            MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 86400.0,
                is_correct: true,
            },
        ];

        let interval_90 = model.compute_optimal_interval(traces.clone(), 0.9);
        let interval_70 = model.compute_optimal_interval(traces, 0.7);

        // Lower target probability means we can wait longer
        assert!(interval_70 >= interval_90);
    }

    #[test]
    fn test_optimal_interval_empty_traces() {
        let model = create_default_model();
        let interval = model.compute_optimal_interval(vec![], 0.9);

        assert!((interval - 0.0).abs() < EPSILON);
    }

    #[test]
    fn test_predict_optimal_interval_includes_bounds() {
        let model = create_default_model();
        let traces = vec![
            MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
        ];

        let prediction = model.predict_optimal_interval(traces, Some(0.9));

        assert!(prediction.min_seconds <= prediction.optimal_seconds);
        assert!(prediction.optimal_seconds <= prediction.max_seconds);
        assert!((prediction.target_recall - 0.9).abs() < EPSILON);
    }

    // ==================== Batch Computation Tests ====================

    #[test]
    fn test_batch_compute_activations() {
        let model = create_default_model();

        let trace_sets = vec![
            vec![MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            }],
            vec![MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            }],
            vec![MemoryTrace {
                timestamp: 86400.0,
                is_correct: true,
            }],
        ];

        let results = model.batch_compute_activations_from_seconds_ago(trace_sets.clone());

        assert_eq!(results.len(), 3);

        // Verify order is preserved (more recent = higher activation)
        assert!(results[0].activation > results[1].activation);
        assert!(results[1].activation > results[2].activation);

        // Verify each result matches individual computation
        for (i, traces) in trace_sets.iter().enumerate() {
            let single_activation = model.compute_activation_from_seconds_ago(traces.clone());
            assert!((results[i].activation - single_activation).abs() < EPSILON);
        }
    }

    #[test]
    fn test_batch_compute_optimal_intervals() {
        let model = create_default_model();

        let trace_sets = vec![
            vec![MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            }],
            vec![
                MemoryTrace {
                    timestamp: 60.0,
                    is_correct: true,
                },
                MemoryTrace {
                    timestamp: 3600.0,
                    is_correct: true,
                },
            ],
        ];

        let intervals = model.batch_compute_optimal_intervals(trace_sets.clone(), 0.9);

        assert_eq!(intervals.len(), 2);

        // Verify each result matches individual computation
        for (i, traces) in trace_sets.iter().enumerate() {
            let single_interval = model.compute_optimal_interval(traces.clone(), 0.9);
            assert!((intervals[i] - single_interval).abs() < EPSILON);
        }
    }

    // ==================== State Management Tests ====================

    #[test]
    fn test_state_roundtrip() {
        let model = ACTRMemoryNative::new(Some(0.6), Some(0.4), Some(0.3));
        let original_state = model.get_state();

        let mut new_model = create_default_model();
        new_model.set_state(original_state.clone());
        let restored_state = new_model.get_state();

        assert!((restored_state.decay - original_state.decay).abs() < EPSILON);
        assert!((restored_state.threshold - original_state.threshold).abs() < EPSILON);
        assert!((restored_state.noise_scale - original_state.noise_scale).abs() < EPSILON);
    }

    #[test]
    fn test_update_count() {
        let mut model = create_default_model();
        assert_eq!(model.get_state().update_count, 0);

        model.update();
        assert_eq!(model.get_state().update_count, 1);

        model.update();
        model.update();
        assert_eq!(model.get_state().update_count, 3);
    }

    #[test]
    fn test_reset() {
        let mut model = create_default_model();
        model.update();
        model.update();

        model.reset();

        assert_eq!(model.get_state().update_count, 0);
    }

    // ==================== Full Activation Result Tests ====================

    #[test]
    fn test_full_activation_includes_all_fields() {
        let model = create_default_model();
        let traces = vec![
            MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
        ];

        let result = model.compute_full_activation(traces);

        assert!(result.base_activation.is_finite());
        assert!(result.activation.is_finite());
        assert!(result.recall_probability >= 0.0 && result.recall_probability <= 1.0);
    }

    #[test]
    fn test_full_activation_empty_traces() {
        let model = create_default_model();
        let result = model.compute_full_activation(vec![]);

        assert!(result.base_activation.is_infinite() && result.base_activation < 0.0);
        assert!(result.activation.is_infinite() && result.activation < 0.0);
        assert!((result.recall_probability - 0.0).abs() < EPSILON);
    }

    // ==================== Recall Prediction Tests ====================

    #[test]
    fn test_predict_recall_confidence() {
        let model = create_default_model();

        // Single review
        let single_trace = vec![MemoryTrace {
            timestamp: 3600.0,
            is_correct: true,
        }];

        // Multiple reviews over 7 days
        let long_trace = vec![
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 86400.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 172800.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 259200.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 345600.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 432000.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 518400.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 604800.0,
                is_correct: true,
            },
        ];

        let single_prediction = model.predict_recall(single_trace);
        let long_prediction = model.predict_recall(long_trace);

        // Long trace should have higher confidence
        assert!(long_prediction.confidence >= single_prediction.confidence);

        // Single review should have at least base confidence (0.3)
        assert!(single_prediction.confidence >= 0.3);
    }

    // ==================== Standalone Function Tests ====================

    #[test]
    fn test_standalone_compute_activation() {
        let traces = vec![MemoryTrace {
            timestamp: 3600.0,
            is_correct: true,
        }];

        let activation1 = compute_activation(traces.clone(), None);
        let activation2 = compute_activation(traces, Some(0.5));

        assert!((activation1 - activation2).abs() < EPSILON);
    }

    #[test]
    fn test_standalone_compute_recall_probability() {
        let prob1 = compute_recall_probability(0.5, None, None);
        let prob2 = compute_recall_probability(0.5, Some(0.3), Some(0.4));

        assert!((prob1 - prob2).abs() < EPSILON);
    }

    #[test]
    fn test_standalone_compute_optimal_interval() {
        let traces = vec![
            MemoryTrace {
                timestamp: 60.0,
                is_correct: true,
            },
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
        ];

        let interval = compute_optimal_interval(traces, 0.9, None, None, None);

        assert!(interval >= 0.0);
    }

    // ==================== Memory Strength Tests ====================

    #[test]
    fn test_memory_strength_range() {
        let model = create_default_model();

        let traces = vec![
            MemoryTrace {
                timestamp: 3600.0,
                is_correct: true,
            },
        ];

        let strength = model.compute_memory_strength(traces);

        assert!(strength >= 0.0 && strength <= 1.0);
    }

    #[test]
    fn test_memory_strength_empty_traces() {
        let model = create_default_model();
        let strength = model.compute_memory_strength(vec![]);

        assert!((strength - 0.0).abs() < EPSILON);
    }

    // ==================== Numerical Precision Tests ====================

    #[test]
    fn test_activation_formula_precision() {
        // Test: A = ln(Σ w_j * t_j^(-d))
        // For single correct review at t=100, d=0.5:
        // sum = 1.0 * 100^(-0.5) = 0.1
        // A = ln(0.1) ≈ -2.302585

        let model = ACTRMemoryNative::new(Some(0.5), Some(0.3), Some(0.4));
        let traces = vec![MemoryTrace {
            timestamp: 100.0,
            is_correct: true,
        }];

        let activation = model.compute_activation_from_seconds_ago(traces);
        let expected = (100.0_f64.powf(-0.5)).ln();

        assert!((activation - expected).abs() < EPSILON);
    }

    #[test]
    fn test_recall_probability_formula_precision() {
        // Test: P = 1 / (1 + exp(-(A-τ)/s))
        // For A=0.5, τ=0.3, s=0.4:
        // z = (0.5 - 0.3) / 0.4 = 0.5
        // P = 1 / (1 + exp(-0.5)) ≈ 0.6225

        let model = ACTRMemoryNative::new(Some(0.5), Some(0.3), Some(0.4));
        let prob = model.retrieval_probability(0.5);

        let expected = 1.0 / (1.0 + (-0.5_f64).exp());
        assert!((prob - expected).abs() < EPSILON);
    }

    #[test]
    fn test_error_penalty_formula_precision() {
        // For single incorrect review at t=100, d=0.5:
        // sum = 0.3 * 100^(-0.5) = 0.03
        // A = ln(0.03) ≈ -3.506558

        let model = ACTRMemoryNative::new(Some(0.5), Some(0.3), Some(0.4));
        let traces = vec![MemoryTrace {
            timestamp: 100.0,
            is_correct: false,
        }];

        let activation = model.compute_activation_from_seconds_ago(traces);
        let expected = (ERROR_PENALTY * 100.0_f64.powf(-0.5)).ln();

        assert!((activation - expected).abs() < EPSILON);
    }
}
