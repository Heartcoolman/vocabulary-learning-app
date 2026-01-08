use std::time::{SystemTime, UNIX_EPOCH};

use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseState {
    Normal,
    Degraded,
    Syncing,
    Unavailable,
}

impl DatabaseState {
    pub const fn as_str(self) -> &'static str {
        match self {
            DatabaseState::Normal => "NORMAL",
            DatabaseState::Degraded => "DEGRADED",
            DatabaseState::Syncing => "SYNCING",
            DatabaseState::Unavailable => "UNAVAILABLE",
        }
    }
}

#[derive(Debug, Clone)]
pub struct StateTransition {
    pub from: DatabaseState,
    pub to: DatabaseState,
    pub reason: String,
    pub timestamp_ms: u64,
}

const HISTORY_LIMIT: usize = 100;

#[derive(Debug)]
pub struct DatabaseStateMachine {
    current: DatabaseState,
    history: Vec<StateTransition>,
    change_count: u64,
    last_state_change_ms: Option<u64>,
    started_ms: u64,
}

impl DatabaseStateMachine {
    pub fn new(initial_state: DatabaseState) -> Self {
        Self {
            current: initial_state,
            history: Vec::new(),
            change_count: 0,
            last_state_change_ms: None,
            started_ms: now_ms(),
        }
    }

    pub fn state(&self) -> DatabaseState {
        self.current
    }

    pub fn state_change_count(&self) -> u64 {
        self.change_count
    }

    pub fn last_state_change_ms(&self) -> Option<u64> {
        self.last_state_change_ms
    }

    pub fn uptime_ms(&self) -> u64 {
        now_ms().saturating_sub(self.started_ms)
    }

    pub fn history(&self) -> &[StateTransition] {
        &self.history
    }

    pub fn can_transition_to(&self, target: DatabaseState) -> bool {
        matches!(
            (self.current, target),
            (DatabaseState::Normal, DatabaseState::Degraded)
                | (DatabaseState::Degraded, DatabaseState::Syncing)
                | (DatabaseState::Degraded, DatabaseState::Unavailable)
                | (DatabaseState::Syncing, DatabaseState::Normal)
                | (DatabaseState::Syncing, DatabaseState::Degraded)
                | (DatabaseState::Unavailable, DatabaseState::Degraded)
                | (DatabaseState::Unavailable, DatabaseState::Normal)
        )
    }

    pub fn transition_to(
        &mut self,
        target: DatabaseState,
        reason: impl Into<String>,
    ) -> Result<(), TransitionError> {
        if !self.can_transition_to(target) {
            return Err(TransitionError::InvalidTransition {
                from: self.current,
                to: target,
            });
        }

        let transition = StateTransition {
            from: self.current,
            to: target,
            reason: reason.into(),
            timestamp_ms: now_ms(),
        };

        self.current = target;
        self.change_count = self.change_count.saturating_add(1);
        self.last_state_change_ms = Some(transition.timestamp_ms);
        self.history.push(transition);

        if self.history.len() > HISTORY_LIMIT {
            let extra = self.history.len() - HISTORY_LIMIT;
            self.history.drain(0..extra);
        }

        Ok(())
    }

    pub fn degraded(&mut self, reason: impl Into<String>) -> Result<(), TransitionError> {
        self.transition_to(DatabaseState::Degraded, reason)
    }

    pub fn start_sync(&mut self, reason: impl Into<String>) -> Result<(), TransitionError> {
        self.transition_to(DatabaseState::Syncing, reason)
    }

    pub fn recover(&mut self, reason: impl Into<String>) -> Result<(), TransitionError> {
        self.transition_to(DatabaseState::Normal, reason)
    }

    pub fn sync_failed(&mut self, reason: impl Into<String>) -> Result<(), TransitionError> {
        self.transition_to(DatabaseState::Degraded, reason)
    }

    pub fn unavailable(&mut self, reason: impl Into<String>) -> Result<(), TransitionError> {
        self.transition_to(DatabaseState::Unavailable, reason)
    }
}

#[derive(Debug, Error)]
pub enum TransitionError {
    #[error("Invalid transition from {from:?} to {to:?}")]
    InvalidTransition {
        from: DatabaseState,
        to: DatabaseState,
    },
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
