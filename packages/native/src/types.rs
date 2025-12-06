use napi_derive::napi;
use serde::{Deserialize, Serialize};

// 常量定义 (与 TS 对齐)
pub const FEATURE_DIMENSION: usize = 22;
pub const MIN_LAMBDA: f64 = 1e-3;
pub const MIN_RANK1_DIAG: f64 = 1e-6;
pub const MAX_COVARIANCE: f64 = 1e9;
pub const MAX_FEATURE_ABS: f64 = 50.0;
pub const EPSILON: f64 = 1e-10;

/// BanditModel 结构体 (字段命名与 TS 对齐)
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanditModel {
    #[napi(js_name = "A")]
    pub a_matrix: Vec<f64>, // d*d, 行优先
    pub b: Vec<f64>, // d 维
    #[napi(js_name = "L")]
    pub l_matrix: Vec<f64>, // d*d, 下三角
    pub lambda: f64,
    pub alpha: f64,
    pub d: u32,
    #[napi(js_name = "updateCount")]
    pub update_count: u32,
}

/// Difficulty 枚举
#[napi]
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
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

/// Action 结构体
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    #[napi(js_name = "wordId")]
    pub word_id: String,
    pub difficulty: String, // 字符串形式，兼容性更好
    #[napi(js_name = "scheduledAt")]
    pub scheduled_at: Option<f64>,
}

/// Action 类型化版本
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTyped {
    #[napi(js_name = "wordId")]
    pub word_id: String,
    pub difficulty: Difficulty,
    #[napi(js_name = "scheduledAt")]
    pub scheduled_at: Option<f64>,
}

/// UserState 结构体
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    #[napi(js_name = "masteryLevel")]
    pub mastery_level: f64,
    #[napi(js_name = "recentAccuracy")]
    pub recent_accuracy: f64,
    #[napi(js_name = "studyStreak")]
    pub study_streak: u32,
    #[napi(js_name = "totalInteractions")]
    pub total_interactions: u32,
    #[napi(js_name = "averageResponseTime")]
    pub average_response_time: f64,
}

/// LinUCBContext 结构体
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinUCBContext {
    #[napi(js_name = "timeOfDay")]
    pub time_of_day: f64,
    #[napi(js_name = "dayOfWeek")]
    pub day_of_week: u32,
    #[napi(js_name = "sessionDuration")]
    pub session_duration: f64,
    #[napi(js_name = "fatigueFactor")]
    pub fatigue_factor: Option<f64>,
}

/// ActionSelection 结构体 - 动作选择结果
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSelection {
    #[napi(js_name = "selectedIndex")]
    pub selected_index: u32,
    #[napi(js_name = "selectedAction")]
    pub selected_action: Action,
    pub exploitation: f64,
    pub exploration: f64,
    pub score: f64,
    #[napi(js_name = "allScores")]
    pub all_scores: Vec<f64>,
}

/// UCBStats 结构体 - UCB 统计信息
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UCBStats {
    pub theta: Vec<f64>,
    pub exploitation: f64,
    pub confidence: f64,
    pub score: f64,
}

/// DiagnosticResult 结构体 - 诊断结果
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResult {
    #[napi(js_name = "isHealthy")]
    pub is_healthy: bool,
    #[napi(js_name = "hasNaN")]
    pub has_nan: bool,
    #[napi(js_name = "hasInf")]
    pub has_inf: bool,
    #[napi(js_name = "conditionNumber")]
    pub condition_number: f64,
    #[napi(js_name = "minDiagonal")]
    pub min_diagonal: f64,
    #[napi(js_name = "maxDiagonal")]
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
