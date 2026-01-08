pub mod config;
pub mod operations;
pub mod state_machine;

mod health_monitor;

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use thiserror::Error;
use tokio::sync::RwLock;

use crate::db::config::{DbConfig, DbConfigError};
use crate::db::health_monitor::{HealthCheckResult, HealthCheckSnapshot, HealthTracker};

use crate::db::state_machine::{DatabaseState, DatabaseStateMachine};

#[derive(Clone)]
pub struct DatabaseProxy {
    config: DbConfig,
    pool: PgPool,
    health: Arc<RwLock<HealthTracker>>,
    state_machine: Arc<RwLock<DatabaseStateMachine>>,
}

impl DatabaseProxy {
    pub async fn from_env() -> Result<Arc<Self>, DbInitError> {
        let config = DbConfig::from_env()?;

        let pool = PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(5))
            .connect(&config.primary_url)
            .await
            .map_err(DbInitError::Sqlx)?;

        let proxy = Arc::new(Self {
            health: Arc::new(RwLock::new(HealthTracker::new(config.health_check.clone()))),
            state_machine: Arc::new(RwLock::new(DatabaseStateMachine::new(
                DatabaseState::Normal,
            ))),
            config,
            pool,
        });

        proxy.start_health_monitor();

        Ok(proxy)
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn connection_string(&self) -> &str {
        &self.config.primary_url
    }

    pub async fn health_status(&self) -> HealthCheckSnapshot {
        let tracker = self.health.read().await;
        tracker.snapshot()
    }

    pub async fn primary_pool(&self) -> Option<PgPool> {
        Some(self.pool.clone())
    }

    pub async fn primary_status(&self) -> HealthCheckSnapshot {
        self.health_status().await
    }

    pub fn state_machine(&self) -> Arc<RwLock<DatabaseStateMachine>> {
        Arc::clone(&self.state_machine)
    }

    #[deprecated(note = "SQLite fallback removed - always returns None")]
    pub async fn fallback_pool(&self) -> Option<sqlx::SqlitePool> {
        None
    }

    #[deprecated(note = "SQLite fallback removed - always returns false")]
    pub fn sqlite_enabled(&self) -> bool {
        false
    }

    #[deprecated(note = "Dual-write removed - use direct sqlx queries")]
    #[allow(deprecated)]
    pub async fn write_operation(
        &self,
        _state: DatabaseState,
        _op: WriteOperation,
    ) -> Result<WriteResult, DbMutationError> {
        Err(DbMutationError::NotSupported)
    }

    pub async fn delete_session_by_token_hash(&self, token_hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query(r#"DELETE FROM "sessions" WHERE "token" = $1"#)
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

impl DatabaseProxy {
    fn start_health_monitor(self: &Arc<Self>) {
        let proxy = Arc::clone(self);
        tokio::spawn(async move {
            proxy.health_monitor_loop().await;
        });
    }

    async fn health_monitor_loop(self: Arc<Self>) {
        let interval = self.config.health_check.interval;

        loop {
            let start = tokio::time::Instant::now();
            let result = self.check_health().await;
            {
                let mut tracker = self.health.write().await;
                tracker.process(result);
            }

            let elapsed = start.elapsed();
            if elapsed < interval {
                tokio::time::sleep(interval - elapsed).await;
            }
        }
    }

    async fn check_health(&self) -> HealthCheckResult {
        let timeout = self.config.health_check.timeout;
        let pool = self.pool.clone();

        let started = std::time::Instant::now();
        let result = tokio::time::timeout(timeout, sqlx::query("SELECT 1").execute(&pool)).await;

        match result {
            Ok(Ok(_)) => HealthCheckResult::healthy(started.elapsed()),
            Ok(Err(err)) => HealthCheckResult::unhealthy(err.to_string()),
            Err(_) => HealthCheckResult::unhealthy("timeout".to_string()),
        }
    }
}

#[derive(Debug, Error)]
pub enum DbInitError {
    #[error(transparent)]
    Config(#[from] DbConfigError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

#[derive(Debug, Error)]
pub enum DbMutationError {
    #[error("Operation not supported - dual-write removed")]
    NotSupported,
    #[error("Service unavailable")]
    Unavailable,
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error("{0}")]
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[deprecated(note = "Dual-write removed - use direct sqlx queries")]
pub enum WriteOperation {
    Insert {
        table: String,
        data: serde_json::Map<String, serde_json::Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
    Update {
        table: String,
        r#where: serde_json::Map<String, serde_json::Value>,
        data: serde_json::Map<String, serde_json::Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
    Delete {
        table: String,
        r#where: serde_json::Map<String, serde_json::Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
    Upsert {
        table: String,
        r#where: serde_json::Map<String, serde_json::Value>,
        create: serde_json::Map<String, serde_json::Value>,
        update: serde_json::Map<String, serde_json::Value>,
        operation_id: String,
        timestamp_ms: Option<u64>,
        critical: Option<bool>,
    },
}

#[derive(Debug, Clone)]
#[deprecated(note = "Dual-write removed")]
pub struct WriteResult {
    pub written_to: &'static str,
    pub async_fallback_pending: bool,
}

#[allow(deprecated)]
pub mod dual_write_manager {
    pub use super::WriteOperation;
    pub use super::WriteResult;
}
