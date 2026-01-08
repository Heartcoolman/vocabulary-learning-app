#![deny(clippy::all)]

pub mod actr;
pub mod causal;
pub mod linucb;
pub mod matrix;
pub mod sanitize;
pub mod thompson;
pub mod types;

// 重新导出主要类型和函数
pub use actr::{
    compute_activation, compute_optimal_interval, compute_recall_probability, ACTRMemoryNative,
    ACTRState, ActivationResult, BatchComputeInput, BatchComputeResult, CognitiveProfile,
    IntervalPrediction, MemoryTrace, RecallPrediction,
};
pub use causal::estimator::CausalInferenceNative;
pub use causal::{CausalEstimate, CausalInferenceConfig, CausalObservation, PropensityDiagnostics};
pub use linucb::LinUCBNative;
pub use thompson::{
    ActionSelection, BatchUpdateItem, BetaParams, ThompsonSamplingNative, ThompsonSamplingOptions,
    ThompsonSamplingState,
};
pub use types::*;
