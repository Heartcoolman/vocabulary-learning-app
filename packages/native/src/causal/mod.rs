use napi_derive::napi;

pub mod estimator;

/// 因果观测数据
#[napi(object)]
#[derive(Clone, Debug)]
pub struct CausalObservation {
    /// 特征向量
    pub features: Vec<f64>,
    /// 处理组标记 (0 或 1)
    pub treatment: u8,
    /// 结果值
    pub outcome: f64,
    /// 时间戳（可选）
    pub timestamp: Option<f64>,
    /// 用户ID（可选）
    pub user_id: Option<String>,
}

/// 因果效应估计结果
#[napi(object)]
#[derive(Clone, Debug)]
pub struct CausalEstimate {
    /// 平均处理效应
    pub ate: f64,
    /// 标准误
    pub standard_error: f64,
    /// 95% 置信区间下限
    pub confidence_interval_lower: f64,
    /// 95% 置信区间上限
    pub confidence_interval_upper: f64,
    /// 样本量
    pub sample_size: u32,
    /// 有效样本量（IPW加权后）
    pub effective_sample_size: f64,
    /// p值
    pub p_value: f64,
    /// 是否显著（alpha=0.05）
    pub significant: bool,
}

/// 倾向得分诊断
#[napi(object)]
#[derive(Clone, Debug)]
pub struct PropensityDiagnostics {
    /// 均值
    pub mean: f64,
    /// 标准差
    pub std: f64,
    /// 中位数
    pub median: f64,
    /// 处理组均值
    pub treatment_mean: f64,
    /// 对照组均值
    pub control_mean: f64,
    /// 重叠度量
    pub overlap: f64,
    /// AUC（区分度）
    pub auc: f64,
}

/// 因果推断配置
#[napi(object)]
#[derive(Clone, Debug)]
pub struct CausalInferenceConfig {
    /// 倾向得分截断下限
    pub propensity_min: Option<f64>,
    /// 倾向得分截断上限
    pub propensity_max: Option<f64>,
    /// 学习率
    pub learning_rate: Option<f64>,
    /// 正则化系数
    pub regularization: Option<f64>,
    /// 最大迭代次数
    pub max_iterations: Option<u32>,
    /// 收敛阈值
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
