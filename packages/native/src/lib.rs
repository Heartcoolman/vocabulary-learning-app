#![deny(clippy::all)]

pub mod causal;
pub mod matrix;
pub mod sanitize;
pub mod types;

pub use causal::estimator::CausalInferenceNative;
pub use causal::{CausalEstimate, CausalInferenceConfig, CausalObservation, PropensityDiagnostics};
pub use types::*;
