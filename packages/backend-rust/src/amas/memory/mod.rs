//! AMAS Memory Layer - Memory dynamics and recall modeling
//!
//! Contains:
//! - MDM (Memory Dynamics Model) - differential equation based memory decay
//! - MSMT (Multi-Scale Memory Trace) - multi-scale exponential traces
//! - R-Target (Recall Target) - dynamic retention target
//! - Adaptive Mastery - personalized mastery decision
//! - MemoryEngine - unified entry point for memory computations

pub mod adaptive_mastery;
pub mod mdm;
pub mod msmt;
pub mod r_target;

mod engine;

pub use adaptive_mastery::{
    compute_adaptive_mastery, compute_adaptive_mastery_with_history, AdaptiveMasteryResult,
    MasteryAttempt, MasteryContext, MasteryFactors, MasteryHistory,
};
pub use engine::{MemoryEngine, ShadowResult};
pub use mdm::{compute_quality, MdmState};
pub use msmt::{MsmtModel, ReviewEvent};
pub use r_target::RTargetCalculator;
