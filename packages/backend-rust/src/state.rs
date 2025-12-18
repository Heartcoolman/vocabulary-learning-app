use std::sync::Arc;
use std::time::{Instant, SystemTime};

use tokio::sync::RwLock;

use crate::amas::AMASEngine;
use crate::core::EventBus;
use crate::db::state_machine::DatabaseStateMachine;
use crate::db::DatabaseProxy;

#[derive(Clone)]
pub struct AppState {
    started_at: Instant,
    started_at_system: SystemTime,
    db_state: Arc<RwLock<DatabaseStateMachine>>,
    db_proxy: Option<Arc<DatabaseProxy>>,
    amas_engine: Arc<AMASEngine>,
    event_bus: Arc<EventBus>,
}

impl AppState {
    pub fn new(
        db_state: Arc<RwLock<DatabaseStateMachine>>,
        db_proxy: Option<Arc<DatabaseProxy>>,
    ) -> Self {
        let amas_engine = AMASEngine::new(
            crate::amas::AMASConfig::from_env(),
            db_proxy.clone(),
        );

        Self {
            started_at: Instant::now(),
            started_at_system: SystemTime::now(),
            db_state,
            db_proxy,
            amas_engine: Arc::new(amas_engine),
            event_bus: Arc::new(EventBus::new()),
        }
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    pub fn started_at_system(&self) -> SystemTime {
        self.started_at_system
    }

    pub fn db_state(&self) -> Arc<RwLock<DatabaseStateMachine>> {
        Arc::clone(&self.db_state)
    }

    pub fn db_proxy(&self) -> Option<Arc<DatabaseProxy>> {
        self.db_proxy.clone()
    }

    pub fn amas_engine(&self) -> Arc<AMASEngine> {
        Arc::clone(&self.amas_engine)
    }

    pub fn event_bus(&self) -> Arc<EventBus> {
        Arc::clone(&self.event_bus)
    }
}
