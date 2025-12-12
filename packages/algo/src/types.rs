//! Common Types and Constants
//!
//! Shared data structures used across all algorithm modules.

use serde::{Deserialize, Serialize};

// ==================== Constants ====================

/// Feature dimension for LinUCB
pub const FEATURE_DIMENSION: usize = 22;

/// Minimum regularization parameter
pub const MIN_LAMBDA: f64 = 1e-3;

/// Minimum diagonal value for rank-1 updates
pub const MIN_RANK1_DIAG: f64 = 1e-6;

/// Maximum covariance value
pub const MAX_COVARIANCE: f64 = 1e9;

/// Maximum feature absolute value
pub const MAX_FEATURE_ABS: f64 = 50.0;

/// Numerical stability epsilon
pub const EPSILON: f64 = 1e-10;

// ==================== ACT-R Types ====================

/// Memory trace record
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryTrace {
    /// Time since this review (seconds ago from current time)
    pub timestamp: f64,
    /// Whether the answer was correct
    pub is_correct: bool,
}

/// ACT-R model state
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ACTRState {
    /// Decay rate d (default 0.5)
    pub decay: f64,
    /// Recall threshold tau
    pub threshold: f64,
    /// Noise scale s
    pub noise_scale: f64,
    /// Update count
    pub update_count: u32,
}

impl Default for ACTRState {
    fn default() -> Self {
        Self {
            decay: 0.5,
            threshold: 0.3,
            noise_scale: 0.4,
            update_count: 0,
        }
    }
}

/// Cognitive profile for personalized decay rate
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CognitiveProfile {
    /// Memory factor [0, 1], higher means better memory
    pub memory_factor: f64,
    /// Speed factor [0, 1], higher means faster processing
    pub speed_factor: f64,
    /// Stability factor [0, 1], higher means more stable memory
    pub stability_factor: f64,
}

/// Activation computation result
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActivationResult {
    /// Base activation (without noise)
    pub base_activation: f64,
    /// Activation with noise
    pub activation: f64,
    /// Recall probability
    pub recall_probability: f64,
}

/// Recall prediction result
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecallPrediction {
    /// Activation (typically -2 to 2)
    pub activation: f64,
    /// Recall probability [0, 1]
    pub recall_probability: f64,
    /// Prediction confidence [0, 1]
    pub confidence: f64,
}

/// Optimal interval prediction result
#[derive(Clone, Debug, Serialize, Deserialize)]
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
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchComputeInput {
    /// Traces for this computation
    pub traces: Vec<MemoryTrace>,
    /// Current time for this computation
    pub current_time: f64,
}

/// Batch computation result
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchComputeResult {
    /// Activation value
    pub activation: f64,
    /// Recall probability
    pub recall_probability: f64,
}

// ==================== LinUCB Types ====================

/// Difficulty level for word learning
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Difficulty {
    Recognition,
    Recall,
    Spelling,
    Listening,
    Usage,
}

impl Difficulty {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "recognition" => Some(Difficulty::Recognition),
            "recall" => Some(Difficulty::Recall),
            "spelling" => Some(Difficulty::Spelling),
            "listening" => Some(Difficulty::Listening),
            "usage" => Some(Difficulty::Usage),
            _ => None,
        }
    }

    pub fn to_index(&self) -> usize {
        match self {
            Difficulty::Recognition => 0,
            Difficulty::Recall => 1,
            Difficulty::Spelling => 2,
            Difficulty::Listening => 3,
            Difficulty::Usage => 4,
        }
    }
}

/// Action with string difficulty
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub word_id: String,
    pub difficulty: String,
    pub scheduled_at: Option<f64>,
}

/// Action with typed difficulty
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTyped {
    pub word_id: String,
    pub difficulty: Difficulty,
    pub scheduled_at: Option<f64>,
}

/// User learning state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    pub mastery_level: f64,
    pub recent_accuracy: f64,
    pub study_streak: u32,
    pub total_interactions: u32,
    pub average_response_time: f64,
}

/// LinUCB context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinUCBContext {
    pub time_of_day: f64,
    pub day_of_week: u32,
    pub session_duration: f64,
    pub fatigue_factor: Option<f64>,
}

/// Action selection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSelection {
    pub selected_index: u32,
    pub selected_action: Action,
    pub exploitation: f64,
    pub exploration: f64,
    pub score: f64,
    pub all_scores: Vec<f64>,
}

/// Typed action selection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSelectionTyped {
    pub selected_index: u32,
    pub selected_action: ActionTyped,
    pub exploitation: f64,
    pub exploration: f64,
    pub score: f64,
    pub all_scores: Vec<f64>,
}

/// UCB statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UCBStats {
    pub theta: Vec<f64>,
    pub exploitation: f64,
    pub confidence: f64,
    pub score: f64,
}

/// Bandit model state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanditModel {
    pub a_matrix: Vec<f64>,
    pub b: Vec<f64>,
    pub l_matrix: Vec<f64>,
    pub lambda: f64,
    pub alpha: f64,
    pub d: u32,
    pub update_count: u32,
}

impl Default for BanditModel {
    fn default() -> Self {
        let d = FEATURE_DIMENSION;
        let lambda: f64 = 1.0;
        let sqrt_lambda = lambda.sqrt();

        let mut a_matrix = vec![0.0; d * d];
        for i in 0..d {
            a_matrix[i * d + i] = lambda;
        }

        let b = vec![0.0; d];

        let mut l_matrix = vec![0.0; d * d];
        for i in 0..d {
            l_matrix[i * d + i] = sqrt_lambda;
        }

        BanditModel {
            a_matrix,
            b,
            l_matrix,
            lambda,
            alpha: 0.3,
            d: d as u32,
            update_count: 0,
        }
    }
}

/// Diagnostic result for model health
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResult {
    pub is_healthy: bool,
    pub has_nan: bool,
    pub has_inf: bool,
    pub condition_number: f64,
    pub min_diagonal: f64,
    pub max_diagonal: f64,
    pub message: String,
}

// ==================== Thompson Sampling Types ====================

/// Beta distribution parameters
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BetaParams {
    pub alpha: f64,
    pub beta: f64,
}

impl BetaParams {
    pub fn new(alpha: f64, beta: f64) -> Self {
        Self {
            alpha: alpha.max(EPSILON),
            beta: beta.max(EPSILON),
        }
    }

    pub fn expected_value(&self) -> f64 {
        let sum = self.alpha + self.beta;
        if sum > 0.0 {
            self.alpha / sum
        } else {
            0.5
        }
    }

    pub fn total(&self) -> f64 {
        self.alpha + self.beta
    }
}

/// Thompson Sampling action selection result
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TSActionSelection {
    pub action_key: String,
    pub score: f64,
    pub confidence: f64,
    pub global_sample: f64,
    pub contextual_sample: f64,
}

/// Thompson Sampling configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThompsonSamplingOptions {
    pub prior_alpha: Option<f64>,
    pub prior_beta: Option<f64>,
    pub min_context_weight: Option<f64>,
    pub max_context_weight: Option<f64>,
    pub enable_soft_update: Option<bool>,
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

/// Thompson Sampling serializable state
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThompsonSamplingState {
    pub version: String,
    pub prior_alpha: f64,
    pub prior_beta: f64,
    pub update_count: i64,
    pub global_params_json: String,
    pub context_params_json: String,
}

/// Batch update item
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchUpdateItem {
    pub action_key: String,
    pub success: bool,
}

// ==================== Causal Inference Types ====================

/// Causal observation data
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CausalObservation {
    pub features: Vec<f64>,
    pub treatment: u8,
    pub outcome: f64,
    pub timestamp: Option<f64>,
    pub user_id: Option<String>,
}

/// Causal effect estimate
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CausalEstimate {
    pub ate: f64,
    pub standard_error: f64,
    pub confidence_interval_lower: f64,
    pub confidence_interval_upper: f64,
    pub sample_size: u32,
    pub effective_sample_size: f64,
    pub p_value: f64,
    pub significant: bool,
}

/// Propensity score diagnostics
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PropensityDiagnostics {
    pub mean: f64,
    pub std: f64,
    pub median: f64,
    pub treatment_mean: f64,
    pub control_mean: f64,
    pub overlap: f64,
    pub auc: f64,
}

/// Causal inference configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CausalInferenceConfig {
    pub propensity_min: Option<f64>,
    pub propensity_max: Option<f64>,
    pub learning_rate: Option<f64>,
    pub regularization: Option<f64>,
    pub max_iterations: Option<u32>,
    pub convergence_threshold: Option<f64>,
}

impl Default for CausalInferenceConfig {
    fn default() -> Self {
        Self {
            propensity_min: Some(0.05),
            propensity_max: Some(0.95),
            learning_rate: Some(0.1),
            regularization: Some(0.01),
            max_iterations: Some(1000),
            convergence_threshold: Some(1e-6),
        }
    }
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ============ Difficulty::from_str() 测试 ============

    #[test]
    fn test_difficulty_from_str_valid_lowercase() {
        assert_eq!(Difficulty::from_str("recognition"), Some(Difficulty::Recognition));
        assert_eq!(Difficulty::from_str("recall"), Some(Difficulty::Recall));
        assert_eq!(Difficulty::from_str("spelling"), Some(Difficulty::Spelling));
        assert_eq!(Difficulty::from_str("listening"), Some(Difficulty::Listening));
        assert_eq!(Difficulty::from_str("usage"), Some(Difficulty::Usage));
    }

    #[test]
    fn test_difficulty_from_str_valid_uppercase() {
        assert_eq!(Difficulty::from_str("RECOGNITION"), Some(Difficulty::Recognition));
        assert_eq!(Difficulty::from_str("RECALL"), Some(Difficulty::Recall));
        assert_eq!(Difficulty::from_str("SPELLING"), Some(Difficulty::Spelling));
        assert_eq!(Difficulty::from_str("LISTENING"), Some(Difficulty::Listening));
        assert_eq!(Difficulty::from_str("USAGE"), Some(Difficulty::Usage));
    }

    #[test]
    fn test_difficulty_from_str_valid_mixed_case() {
        assert_eq!(Difficulty::from_str("Recognition"), Some(Difficulty::Recognition));
        assert_eq!(Difficulty::from_str("ReCaLl"), Some(Difficulty::Recall));
        assert_eq!(Difficulty::from_str("SpElLiNg"), Some(Difficulty::Spelling));
        assert_eq!(Difficulty::from_str("Listening"), Some(Difficulty::Listening));
        assert_eq!(Difficulty::from_str("UsAgE"), Some(Difficulty::Usage));
    }

    #[test]
    fn test_difficulty_from_str_invalid() {
        assert_eq!(Difficulty::from_str(""), None);
        assert_eq!(Difficulty::from_str("invalid"), None);
        assert_eq!(Difficulty::from_str("recognitionn"), None);
        assert_eq!(Difficulty::from_str("recal"), None);
        assert_eq!(Difficulty::from_str(" recall"), None);
        assert_eq!(Difficulty::from_str("recall "), None);
        assert_eq!(Difficulty::from_str("re call"), None);
        assert_eq!(Difficulty::from_str("123"), None);
        assert_eq!(Difficulty::from_str("recognition1"), None);
    }

    #[test]
    fn test_difficulty_from_str_edge_cases() {
        // 特殊字符
        assert_eq!(Difficulty::from_str("recognition\n"), None);
        assert_eq!(Difficulty::from_str("\trecall"), None);
        assert_eq!(Difficulty::from_str("spelling\0"), None);
        // Unicode 字符
        assert_eq!(Difficulty::from_str("認識"), None);
        assert_eq!(Difficulty::from_str("记忆"), None);
    }

    // ============ Difficulty::to_index() 测试 ============

    #[test]
    fn test_difficulty_to_index() {
        assert_eq!(Difficulty::Recognition.to_index(), 0);
        assert_eq!(Difficulty::Recall.to_index(), 1);
        assert_eq!(Difficulty::Spelling.to_index(), 2);
        assert_eq!(Difficulty::Listening.to_index(), 3);
        assert_eq!(Difficulty::Usage.to_index(), 4);
    }

    #[test]
    fn test_difficulty_roundtrip() {
        // 测试 from_str -> to_index 的往返转换
        let difficulties = vec![
            ("recognition", 0),
            ("recall", 1),
            ("spelling", 2),
            ("listening", 3),
            ("usage", 4),
        ];

        for (name, expected_index) in difficulties {
            let difficulty = Difficulty::from_str(name).expect(&format!("{} should be valid", name));
            assert_eq!(difficulty.to_index(), expected_index);
        }
    }

    #[test]
    fn test_difficulty_index_uniqueness() {
        // 确保所有难度的索引都是唯一的
        let all_difficulties = vec![
            Difficulty::Recognition,
            Difficulty::Recall,
            Difficulty::Spelling,
            Difficulty::Listening,
            Difficulty::Usage,
        ];

        let indices: Vec<usize> = all_difficulties.iter().map(|d| d.to_index()).collect();
        let mut sorted_indices = indices.clone();
        sorted_indices.sort();
        sorted_indices.dedup();

        assert_eq!(indices.len(), sorted_indices.len(), "Indices should be unique");
    }

    #[test]
    fn test_difficulty_index_range() {
        // 确保索引在有效范围内 [0, 4]
        let all_difficulties = vec![
            Difficulty::Recognition,
            Difficulty::Recall,
            Difficulty::Spelling,
            Difficulty::Listening,
            Difficulty::Usage,
        ];

        for difficulty in all_difficulties {
            let index = difficulty.to_index();
            assert!(index <= 4, "Index {} should be <= 4", index);
        }
    }

    // ============ BanditModel::default() 测试 ============

    #[test]
    fn test_bandit_model_default_dimensions() {
        let model = BanditModel::default();

        assert_eq!(model.d as usize, FEATURE_DIMENSION);
        assert_eq!(model.a_matrix.len(), FEATURE_DIMENSION * FEATURE_DIMENSION);
        assert_eq!(model.b.len(), FEATURE_DIMENSION);
        assert_eq!(model.l_matrix.len(), FEATURE_DIMENSION * FEATURE_DIMENSION);
    }

    #[test]
    fn test_bandit_model_default_a_matrix_is_identity() {
        let model = BanditModel::default();
        let d = FEATURE_DIMENSION;

        // A 矩阵应该是 λI，其中 λ = 1.0
        for i in 0..d {
            for j in 0..d {
                let value = model.a_matrix[i * d + j];
                if i == j {
                    assert_eq!(value, 1.0, "Diagonal element A[{},{}] should be 1.0", i, j);
                } else {
                    assert_eq!(value, 0.0, "Off-diagonal element A[{},{}] should be 0.0", i, j);
                }
            }
        }
    }

    #[test]
    fn test_bandit_model_default_b_is_zero() {
        let model = BanditModel::default();

        for (i, &value) in model.b.iter().enumerate() {
            assert_eq!(value, 0.0, "b[{}] should be 0.0", i);
        }
    }

    #[test]
    fn test_bandit_model_default_l_matrix_is_sqrt_identity() {
        let model = BanditModel::default();
        let d = FEATURE_DIMENSION;
        let sqrt_lambda = 1.0_f64.sqrt(); // sqrt(1.0) = 1.0

        // L 矩阵应该是 √λI
        for i in 0..d {
            for j in 0..d {
                let value = model.l_matrix[i * d + j];
                if i == j {
                    assert!((value - sqrt_lambda).abs() < EPSILON,
                        "Diagonal element L[{},{}] should be {}", i, j, sqrt_lambda);
                } else {
                    assert_eq!(value, 0.0, "Off-diagonal element L[{},{}] should be 0.0", i, j);
                }
            }
        }
    }

    #[test]
    fn test_bandit_model_default_parameters() {
        let model = BanditModel::default();

        assert_eq!(model.lambda, 1.0);
        assert_eq!(model.alpha, 0.3);
        assert_eq!(model.update_count, 0);
    }

    #[test]
    fn test_bandit_model_clone() {
        let model = BanditModel::default();
        let cloned = model.clone();

        assert_eq!(model.d, cloned.d);
        assert_eq!(model.lambda, cloned.lambda);
        assert_eq!(model.alpha, cloned.alpha);
        assert_eq!(model.update_count, cloned.update_count);
        assert_eq!(model.a_matrix, cloned.a_matrix);
        assert_eq!(model.b, cloned.b);
        assert_eq!(model.l_matrix, cloned.l_matrix);
    }

    #[test]
    fn test_bandit_model_debug() {
        let model = BanditModel::default();
        let debug_str = format!("{:?}", model);

        // 确保 Debug trait 正常工作
        assert!(debug_str.contains("BanditModel"));
        assert!(debug_str.contains("lambda"));
        assert!(debug_str.contains("alpha"));
    }

    // ============ 常量测试 ============

    #[test]
    fn test_constants() {
        assert_eq!(FEATURE_DIMENSION, 22);
        assert!(MIN_LAMBDA > 0.0);
        assert!(MIN_RANK1_DIAG > 0.0);
        assert!(MAX_COVARIANCE > 0.0);
        assert!(MAX_FEATURE_ABS > 0.0);
        assert!(EPSILON > 0.0);
        assert!(EPSILON < 1e-6);
    }

    // ============ Difficulty 序列化测试 ============

    #[test]
    fn test_difficulty_equality() {
        assert_eq!(Difficulty::Recognition, Difficulty::Recognition);
        assert_ne!(Difficulty::Recognition, Difficulty::Recall);
    }

    #[test]
    fn test_difficulty_debug() {
        let debug_str = format!("{:?}", Difficulty::Recognition);
        assert_eq!(debug_str, "Recognition");
    }
}
