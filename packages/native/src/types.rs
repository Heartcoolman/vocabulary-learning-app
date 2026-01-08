#[cfg(feature = "napi")]
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

// 常量定义 (与 TS 对齐)
pub const FEATURE_DIMENSION: usize = 22;
pub const MIN_LAMBDA: f64 = 1e-3;
pub const MIN_RANK1_DIAG: f64 = 1e-6;
pub const MAX_COVARIANCE: f64 = 1e9;
pub const MAX_FEATURE_ABS: f64 = 50.0;
pub const EPSILON: f64 = 1e-10;
pub const CHOLESKY_RECOMPUTE_INTERVAL: u32 = 200;

/// BanditModel 结构体 (字段命名与 TS 对齐)
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BanditModel {
    #[serde(rename = "A")]
    pub a_matrix: Vec<f64>, // d*d, 行优先
    pub b: Vec<f64>, // d 维
    #[serde(rename = "L")]
    pub l_matrix: Vec<f64>, // d*d, 下三角
    pub lambda: f64,
    pub alpha: f64,
    pub d: u32,
    #[serde(rename = "updateCount")]
    pub update_count: u32,
}

/// Difficulty 枚举
#[cfg_attr(feature = "napi", napi)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Difficulty {
    Recognition,
    Recall,
    Spelling,
    Listening,
    Usage,
}

impl Difficulty {
    pub fn try_from_str(s: &str) -> Option<Self> {
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

impl FromStr for Difficulty {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Difficulty::try_from_str(s).ok_or(())
    }
}

/// Action 结构体
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    #[serde(rename = "wordId")]
    pub word_id: String,
    pub difficulty: String, // 字符串形式，兼容性更好
    #[serde(rename = "scheduledAt")]
    pub scheduled_at: Option<f64>,
}

/// Action 类型化版本
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionTyped {
    #[serde(rename = "wordId")]
    pub word_id: String,
    pub difficulty: Difficulty,
    #[serde(rename = "scheduledAt")]
    pub scheduled_at: Option<f64>,
}

/// UserState 结构体
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserState {
    #[serde(rename = "masteryLevel")]
    pub mastery_level: f64,
    #[serde(rename = "recentAccuracy")]
    pub recent_accuracy: f64,
    #[serde(rename = "studyStreak")]
    pub study_streak: u32,
    #[serde(rename = "totalInteractions")]
    pub total_interactions: u32,
    #[serde(rename = "averageResponseTime")]
    pub average_response_time: f64,
}

/// LinUCBContext 结构体
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinUCBContext {
    #[serde(rename = "timeOfDay")]
    pub time_of_day: f64,
    #[serde(rename = "dayOfWeek")]
    pub day_of_week: u32,
    #[serde(rename = "sessionDuration")]
    pub session_duration: f64,
    #[serde(rename = "fatigueFactor")]
    pub fatigue_factor: Option<f64>,
}

/// ActionSelection 结构体 - 动作选择结果
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSelection {
    #[serde(rename = "selectedIndex")]
    pub selected_index: u32,
    #[serde(rename = "selectedAction")]
    pub selected_action: Action,
    pub exploitation: f64,
    pub exploration: f64,
    pub score: f64,
    #[serde(rename = "allScores")]
    pub all_scores: Vec<f64>,
}

/// ActionSelectionTyped 结构体 - 类型化动作选择结果
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSelectionTyped {
    #[serde(rename = "selectedIndex")]
    pub selected_index: u32,
    #[serde(rename = "selectedAction")]
    pub selected_action: ActionTyped,
    pub exploitation: f64,
    pub exploration: f64,
    pub score: f64,
    #[serde(rename = "allScores")]
    pub all_scores: Vec<f64>,
}

/// UCBStats 结构体 - UCB 统计信息
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UCBStats {
    pub theta: Vec<f64>,
    pub exploitation: f64,
    pub confidence: f64,
    pub score: f64,
}

/// DiagnosticResult 结构体 - 诊断结果
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResult {
    #[serde(rename = "isHealthy")]
    pub is_healthy: bool,
    #[serde(rename = "hasNaN")]
    pub has_nan: bool,
    #[serde(rename = "hasInf")]
    pub has_inf: bool,
    #[serde(rename = "conditionNumber")]
    pub condition_number: f64,
    #[serde(rename = "minDiagonal")]
    pub min_diagonal: f64,
    #[serde(rename = "maxDiagonal")]
    pub max_diagonal: f64,
    pub message: String,
}

impl Default for BanditModel {
    fn default() -> Self {
        let d = FEATURE_DIMENSION;
        let lambda: f64 = 1.0;
        let sqrt_lambda = lambda.sqrt();

        // A = λI
        let mut a_matrix = vec![0.0; d * d];
        for i in 0..d {
            a_matrix[i * d + i] = lambda;
        }

        // b = 0
        let b = vec![0.0; d];

        // L = √λ·I
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

#[cfg(test)]
mod tests {
    use super::*;

    // ============ Difficulty::try_from_str() 测试 ============

    #[test]
    fn test_difficulty_from_str_valid_lowercase() {
        assert_eq!(
            Difficulty::try_from_str("recognition"),
            Some(Difficulty::Recognition)
        );
        assert_eq!(Difficulty::try_from_str("recall"), Some(Difficulty::Recall));
        assert_eq!(
            Difficulty::try_from_str("spelling"),
            Some(Difficulty::Spelling)
        );
        assert_eq!(
            Difficulty::try_from_str("listening"),
            Some(Difficulty::Listening)
        );
        assert_eq!(Difficulty::try_from_str("usage"), Some(Difficulty::Usage));
    }

    #[test]
    fn test_difficulty_from_str_valid_uppercase() {
        assert_eq!(
            Difficulty::try_from_str("RECOGNITION"),
            Some(Difficulty::Recognition)
        );
        assert_eq!(Difficulty::try_from_str("RECALL"), Some(Difficulty::Recall));
        assert_eq!(
            Difficulty::try_from_str("SPELLING"),
            Some(Difficulty::Spelling)
        );
        assert_eq!(
            Difficulty::try_from_str("LISTENING"),
            Some(Difficulty::Listening)
        );
        assert_eq!(Difficulty::try_from_str("USAGE"), Some(Difficulty::Usage));
    }

    #[test]
    fn test_difficulty_from_str_valid_mixed_case() {
        assert_eq!(
            Difficulty::try_from_str("Recognition"),
            Some(Difficulty::Recognition)
        );
        assert_eq!(Difficulty::try_from_str("ReCaLl"), Some(Difficulty::Recall));
        assert_eq!(
            Difficulty::try_from_str("SpElLiNg"),
            Some(Difficulty::Spelling)
        );
        assert_eq!(
            Difficulty::try_from_str("Listening"),
            Some(Difficulty::Listening)
        );
        assert_eq!(Difficulty::try_from_str("UsAgE"), Some(Difficulty::Usage));
    }

    #[test]
    fn test_difficulty_from_str_invalid() {
        assert_eq!(Difficulty::try_from_str(""), None);
        assert_eq!(Difficulty::try_from_str("invalid"), None);
        assert_eq!(Difficulty::try_from_str("recognitionn"), None);
        assert_eq!(Difficulty::try_from_str("recal"), None);
        assert_eq!(Difficulty::try_from_str(" recall"), None);
        assert_eq!(Difficulty::try_from_str("recall "), None);
        assert_eq!(Difficulty::try_from_str("re call"), None);
        assert_eq!(Difficulty::try_from_str("123"), None);
        assert_eq!(Difficulty::try_from_str("recognition1"), None);
    }

    #[test]
    fn test_difficulty_from_str_edge_cases() {
        // 特殊字符
        assert_eq!(Difficulty::try_from_str("recognition\n"), None);
        assert_eq!(Difficulty::try_from_str("\trecall"), None);
        assert_eq!(Difficulty::try_from_str("spelling\0"), None);
        // Unicode 字符
        assert_eq!(Difficulty::try_from_str("認識"), None);
        assert_eq!(Difficulty::try_from_str("记忆"), None);
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
            let difficulty =
                Difficulty::try_from_str(name).expect(&format!("{} should be valid", name));
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

        assert_eq!(
            indices.len(),
            sorted_indices.len(),
            "Indices should be unique"
        );
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
                    assert_eq!(
                        value, 0.0,
                        "Off-diagonal element A[{},{}] should be 0.0",
                        i, j
                    );
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
                    assert!(
                        (value - sqrt_lambda).abs() < EPSILON,
                        "Diagonal element L[{},{}] should be {}",
                        i,
                        j,
                        sqrt_lambda
                    );
                } else {
                    assert_eq!(
                        value, 0.0,
                        "Off-diagonal element L[{},{}] should be 0.0",
                        i, j
                    );
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
