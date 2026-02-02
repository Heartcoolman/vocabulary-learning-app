//! AMAS Vocabulary Layer - Vocabulary-specific learning specializations
//!
//! Contains:
//! - MTP (Morphological Transfer Propagation) - morpheme-based bonus
//! - IAD (Interference Attenuation by Distance) - confusion penalty
//! - EVM (Encoding Variability Metric) - context variability bonus

pub mod evm;
pub mod iad;
pub mod mtp;

pub use evm::{ContextEntry, EvmModel};
pub use iad::{ConfusionPair, IadModel};
pub use mtp::{MorphemeState, MtpModel};
