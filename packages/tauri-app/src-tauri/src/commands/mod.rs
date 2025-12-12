//! Tauri Commands - Native Algorithm Bindings
//!
//! This module provides Tauri command wrappers for the native Rust implementations
//! of learning algorithms used in the vocabulary learning application.
//!
//! Modules:
//! - `actr`: ACT-R cognitive memory model commands
//! - `linucb`: LinUCB contextual bandit algorithm commands
//! - `thompson`: Thompson Sampling algorithm commands
//! - `causal`: Causal inference estimator commands
//! - `storage`: Storage commands for database operations and sync
//! - `tts`: Text-to-Speech commands
//! - `fatigue`: Visual fatigue detection commands
//! - `permissions`: Permission management commands

pub mod actr;
pub mod causal;
pub mod fatigue;
pub mod linucb;
pub mod permissions;
pub mod storage;
pub mod thompson;
pub mod tts;

// Re-export all command functions for convenient registration
pub use actr::*;
pub use causal::*;
pub use fatigue::*;
pub use linucb::*;
pub use permissions::*;
pub use storage::*;
pub use thompson::*;
pub use tts::*;

// ==================== Basic Commands ====================

/// Simple greeting command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Danci.", name)
}
