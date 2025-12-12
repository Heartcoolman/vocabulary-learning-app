//! # danci-algo - 词汇学习核心算法库
//!
//! 本 crate 提供纯 Rust 实现的学习算法:
//!
//! - **ACT-R Memory Model** - 认知架构的记忆与学习模型
//! - **LinUCB** - 线性上置信界多臂老虎机算法
//! - **Thompson Sampling** - 贝叶斯多臂老虎机算法
//! - **Causal Inference** - AIPW 因果推断估计器
//!
//! ## 设计理念
//!
//! 本 crate 的设计目标:
//! - **纯 Rust** - 无 NAPI 依赖，可在任何 Rust 项目中使用
//! - **可复用** - 核心算法与绑定代码分离
//! - **充分测试** - 所有算法都有完整的单元测试
//! - **高性能** - 支持并行处理，针对生产环境优化
//!
//! ## 模块结构
//!
//! - [`actr`] - ACT-R 记忆模型 (激活度、回忆概率、最优间隔)
//! - [`linucb`] - LinUCB 算法 (线性收益的上下文老虎机)
//! - [`thompson`] - Thompson 采样 (Beta 先验的贝叶斯老虎机)
//! - [`causal`] - 因果推断 (AIPW 估计器、倾向得分)
//! - [`matrix`] - 矩阵运算 (Cholesky 分解、线性代数)
//! - [`sanitize`] - 数据清洗 (数值稳定性、验证)
//! - [`types`] - 公共类型和常量
//!
//! ## 使用示例
//!
//! ```rust
//! use danci_algo::{ThompsonSampling, CausalInference};
//!
//! // 创建 Thompson 采样实例
//! let mut thompson = ThompsonSampling::new();
//! thompson.update("action1".to_string(), true);
//! let selection = thompson.select_action(vec!["action1".to_string(), "action2".to_string()]);
//!
//! // 创建因果推断实例
//! let causal = CausalInference::new(4, None);
//! ```

// ============================================================================
// 模块声明
// ============================================================================

pub mod matrix;
pub mod sanitize;
pub mod types;
pub mod actr;
pub mod linucb;
pub mod thompson;
pub mod causal;

// ============================================================================
// 重新导出
// ============================================================================

/// 重新导出所有公共类型
pub use types::*;

/// 重新导出 ACT-R 记忆模型
pub use actr::ACTRMemory;

/// 重新导出 LinUCB 算法
pub use linucb::LinUCB;

/// 重新导出 Thompson 采样算法
pub use thompson::{
    ActionSelection, BatchUpdateItem, BetaParams, ThompsonSampling, ThompsonSamplingOptions,
    ThompsonSamplingState,
};

/// 重新导出因果推断模块
pub use causal::{
    CausalEstimate, CausalInference, CausalInferenceConfig, CausalObservation,
    PropensityDiagnostics,
};
