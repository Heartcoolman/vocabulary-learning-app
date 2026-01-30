//! UMM (Unified Memory Model) - Original Memory Algorithm System
//!
//! A completely original memory algorithm system replacing existing algorithms:
//! - MDM (Memory Dynamics Model) - replaces FSRS
//! - IGE (Information Gain Exploration) - replaces Thompson Sampling
//! - SWD (Similarity-Weighted Decision) - replaces LinUCB
//! - MSMT (Multi-Scale Memory Trace) - replaces ACT-R
//! - MTP (Morphological Transfer Propagation) - vocabulary specialization
//! - IAD (Interference Attenuation by Distance) - vocabulary specialization
//! - EVM (Encoding Variability Metric) - vocabulary specialization
//! - Adaptive Mastery - personalized mastery decision based on user profile

pub mod adaptive_mastery;
pub mod engine;
pub mod evm;
pub mod iad;
pub mod ige;
pub mod mdm;
pub mod msmt;
pub mod mtp;
pub mod r_target;
pub mod swd;

pub use adaptive_mastery::{
    compute_adaptive_mastery, compute_adaptive_mastery_with_history, AdaptiveMasteryResult,
    MasteryContext, MasteryHistory,
};
pub use engine::{ShadowResult, UmmEngine};
