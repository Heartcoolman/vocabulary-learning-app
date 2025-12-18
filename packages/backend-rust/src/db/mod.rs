#![allow(dead_code)]

pub mod config;
pub mod change_log;
pub mod conflict_resolver;
pub mod dual_write_manager;
pub mod fencing;
pub mod pending_writes;
pub mod schema_registry;
pub mod sqlite_schema;
pub mod state_machine;
pub mod sync_manager;
pub mod type_mapper;
pub mod operations;

mod health_monitor;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{PgPool, Row, SqlitePool};
use thiserror::Error;
use tokio::sync::RwLock;

use crate::db::config::{DbConfig, DbConfigError, SqliteConfig};
use crate::db::conflict_resolver::ConflictResolver;
use crate::db::fencing::{FencingError, FencingManager};
use crate::db::health_monitor::{HealthCheckResult, HealthCheckSnapshot, HealthTracker};
use crate::db::schema_registry::{SchemaRegistry, SchemaRegistryError};
use crate::db::sqlite_schema::{split_sql_statements, SQLITE_FALLBACK_SCHEMA_SQL};
use crate::db::state_machine::{DatabaseState, DatabaseStateMachine, TransitionError};
use crate::db::sync_manager::{SyncManager, SyncResult};

#[derive(Clone)]
pub struct DatabaseProxy {
    config: DbConfig,
    state_machine: Arc<RwLock<DatabaseStateMachine>>,
    primary_pool: Arc<RwLock<Option<PgPool>>>,
    fallback_pool: Arc<RwLock<Option<SqlitePool>>>,
    primary_health: Arc<RwLock<HealthTracker>>,
    fallback_health: Arc<RwLock<HealthTracker>>,
    fencing: Arc<FencingManager>,
    schema_registry: Option<Arc<SchemaRegistry>>,
    sync_manager: Arc<RwLock<Option<Arc<SyncManager>>>>,
    dual_write_manager: Arc<RwLock<Option<Arc<dual_write_manager::DualWriteManager>>>>,
    sync_meta: Arc<RwLock<SyncMeta>>,
    sync_running: Arc<AtomicBool>,
}

impl DatabaseProxy {
    pub async fn from_env(state_machine: Arc<RwLock<DatabaseStateMachine>>) -> Result<Arc<Self>, DbInitError> {
        let config = DbConfig::from_env()?;

        let fencing = Arc::new(FencingManager::new(config.fencing.clone(), config.redis_url.clone()).await);
        let _ = fencing.acquire_lock().await;
        let fencing_ready = !fencing.enabled() || fencing.has_valid_lock();

        let schema_registry = if config.sqlite.enabled {
            Some(Arc::new(SchemaRegistry::load()?))
        } else {
            None
        };

        let (fallback_pool, fallback_health) = if config.sqlite.enabled {
            match init_sqlite(&config.sqlite).await {
                Ok(pool) => {
                    let tracker = HealthTracker::new(config.health_check.clone());
                    (Some(pool), tracker)
                }
                Err(err) => {
                    tracing::warn!(error = %err, "sqlite fallback init failed");
                    (None, HealthTracker::new(config.health_check.clone()))
                }
            }
        } else {
            (None, HealthTracker::new(config.health_check.clone()))
        };

        let primary_pool = match init_postgres(&config.primary_url).await {
            Ok(pool) => Some(pool),
            Err(err) => {
                tracing::warn!(error = %err, "postgres init failed");
                None
            }
        };

        {
            let mut sm = state_machine.write().await;
            match (primary_pool.is_some(), fallback_pool.is_some()) {
                (true, _) => {
                    if !fencing_ready {
                        if fallback_pool.is_some() {
                            sm.degraded("fencing lock unavailable during startup").ok();
                        } else {
                            let _ = sm.degraded("fencing lock unavailable during startup");
                            sm.unavailable("fencing lock unavailable during startup").ok();
                        }
                    } else {
                        sm.recover("primary available during startup").ok();
                    }
                }
                (false, true) => {
                    sm.degraded("primary unavailable during startup").ok();
                }
                (false, false) => {
                    let _ = sm.degraded("primary unavailable during startup");
                    sm.unavailable("both primary and fallback unavailable during startup").ok();
                }
            }
        }

        let proxy = Arc::new(Self {
            primary_health: Arc::new(RwLock::new(HealthTracker::new(config.health_check.clone()))),
            fallback_health: Arc::new(RwLock::new(fallback_health)),
            config,
            state_machine,
            primary_pool: Arc::new(RwLock::new(primary_pool)),
            fallback_pool: Arc::new(RwLock::new(fallback_pool)),
            fencing,
            schema_registry,
            sync_manager: Arc::new(RwLock::new(None)),
            dual_write_manager: Arc::new(RwLock::new(None)),
            sync_meta: Arc::new(RwLock::new(SyncMeta::default())),
            sync_running: Arc::new(AtomicBool::new(false)),
        });

        proxy.ensure_managers_initialized().await;

        if proxy.config.sqlite.enabled && proxy.config.sync.sync_on_startup {
            if let Err(err) = proxy.full_sync_primary_to_fallback().await {
                tracing::warn!(error = %err, "startup full sync skipped");
            }
        }

        proxy.start_health_monitor();

        Ok(proxy)
    }

    pub fn sqlite_enabled(&self) -> bool {
        self.config.sqlite.enabled
    }

    pub async fn primary_pool(&self) -> Option<PgPool> {
        self.primary_pool.read().await.clone()
    }

    pub async fn fallback_pool(&self) -> Option<SqlitePool> {
        self.fallback_pool.read().await.clone()
    }

    pub fn state_machine(&self) -> Arc<RwLock<DatabaseStateMachine>> {
        Arc::clone(&self.state_machine)
    }

    pub fn fencing(&self) -> Arc<FencingManager> {
        Arc::clone(&self.fencing)
    }

    pub async fn primary_status(&self) -> HealthCheckSnapshot {
        let tracker = self.primary_health.read().await;
        tracker.snapshot()
    }

    pub async fn fallback_status(&self) -> HealthCheckSnapshot {
        let tracker = self.fallback_health.read().await;
        tracker.snapshot()
    }

    pub async fn unsynced_change_count(&self) -> u64 {
        let maybe_pool = self.fallback_pool.read().await.clone();
        let Some(pool) = maybe_pool else { return 0 };

        let result: Result<i64, sqlx::Error> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM \"_changelog\" WHERE \"synced\" = 0",
        )
        .fetch_one(&pool)
        .await;

        match result {
            Ok(count) => count.max(0) as u64,
            Err(_) => 0,
        }
    }

    pub async fn sync_status(&self) -> SyncStatusSnapshot {
        let meta = self.sync_meta.read().await.clone();
        SyncStatusSnapshot {
            last_sync_time_ms: meta.last_sync_time_ms,
            last_error: meta.last_error,
        }
    }

    pub async fn delete_session_by_token_hash(
        &self,
        state: DatabaseState,
        token_hash: &str,
    ) -> Result<(), DbMutationError> {
        if self.config.sqlite.enabled {
            let mut where_clause = serde_json::Map::new();
            where_clause.insert(
                "token".to_string(),
                serde_json::Value::String(token_hash.to_string()),
            );

            let op = dual_write_manager::WriteOperation::Delete {
                table: "sessions".to_string(),
                r#where: where_clause,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(true),
            };

            self.write_operation(state, op).await?;
            return Ok(());
        }

        let Some(primary) = self.primary_pool().await else {
            return Err(DbMutationError::Unavailable);
        };

        sqlx::query(
            r#"
            DELETE FROM "sessions"
            WHERE "token" = $1
            "#,
        )
        .bind(token_hash)
        .execute(&primary)
        .await?;

        Ok(())
    }

    pub async fn write_operation(
        &self,
        state: DatabaseState,
        operation: dual_write_manager::WriteOperation,
    ) -> Result<dual_write_manager::WriteResult, DbMutationError> {
        if !self.config.sqlite.enabled {
            return Err(DbMutationError::Unavailable);
        }

        self.ensure_managers_initialized().await;
        let Some(manager) = self.dual_write_manager.read().await.clone() else {
            return Err(DbMutationError::Unavailable);
        };

        Ok(manager.write(state, operation).await?)
    }
}

#[derive(Debug, Error)]
pub enum DbMutationError {
    #[error("database unavailable")]
    Unavailable,
    #[error(transparent)]
    DualWrite(#[from] dual_write_manager::DualWriteError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

async fn init_postgres(url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(url)
        .await
}

async fn init_sqlite(config: &SqliteConfig) -> Result<SqlitePool, DbInitError> {
    if let Some(parent) = config.path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(DbInitError::Io)?;
    }

    let journal_mode = match config.journal_mode {
        config::SqliteJournalMode::Wal => SqliteJournalMode::Wal,
        config::SqliteJournalMode::Delete => SqliteJournalMode::Delete,
        config::SqliteJournalMode::Truncate => SqliteJournalMode::Truncate,
        config::SqliteJournalMode::Persist => SqliteJournalMode::Persist,
        config::SqliteJournalMode::Memory => SqliteJournalMode::Memory,
        config::SqliteJournalMode::Off => SqliteJournalMode::Off,
    };

    let synchronous = match config.synchronous {
        config::SqliteSynchronous::Off => SqliteSynchronous::Off,
        config::SqliteSynchronous::Normal => SqliteSynchronous::Normal,
        config::SqliteSynchronous::Full => SqliteSynchronous::Full,
        config::SqliteSynchronous::Extra => SqliteSynchronous::Extra,
    };

    let mut options = SqliteConnectOptions::new()
        .filename(&config.path)
        .create_if_missing(true)
        .journal_mode(journal_mode)
        .synchronous(synchronous)
        .busy_timeout(config.busy_timeout)
        .foreign_keys(config.foreign_keys);

    options = options.pragma("cache_size", config.cache_size.to_string());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(DbInitError::Sqlx)?;

    apply_sqlite_schema(&pool).await?;

    Ok(pool)
}

async fn apply_sqlite_schema(pool: &SqlitePool) -> Result<(), DbInitError> {
    for statement in split_sql_statements(SQLITE_FALLBACK_SCHEMA_SQL) {
        sqlx::query(&statement)
            .execute(pool)
            .await
            .map_err(DbInitError::Sqlx)?;
    }
    Ok(())
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
            self.ensure_managers_initialized().await;

            let start = tokio::time::Instant::now();
            let prev_state = { self.state_machine.read().await.state() };
            let primary_result = self.check_primary().await;
            {
                let mut tracker = self.primary_health.write().await;
                tracker.process(primary_result.clone());
            }

            let fallback_result = self.check_fallback().await;
            {
                let mut tracker = self.fallback_health.write().await;
                tracker.process(fallback_result.clone());
            }

            self.apply_state_transitions().await;
            let new_state = { self.state_machine.read().await.state() };

            if prev_state != new_state {
                if let Some(dw) = self.dual_write_manager.read().await.clone() {
                    dw.on_state_changed(new_state).await;
                }
                if new_state == DatabaseState::Syncing {
                    self.start_recovery_task();
                }
            }

            let elapsed = start.elapsed();
            if elapsed < interval {
                tokio::time::sleep(interval - elapsed).await;
            }
        }
    }

    async fn check_primary(&self) -> HealthCheckResult {
        let timeout = self.config.health_check.timeout;

        let maybe_pool = { self.primary_pool.read().await.clone() };
        let pool = match maybe_pool {
            Some(pool) => pool,
            None => match init_postgres(&self.config.primary_url).await {
                Ok(pool) => {
                    *self.primary_pool.write().await = Some(pool.clone());
                    self.ensure_managers_initialized().await;
                    pool
                }
                Err(err) => {
                    return HealthCheckResult::unhealthy(format!("connect failed: {err}"));
                }
            },
        };

        self.perform_sql_check(
            || async move { sqlx::query("SELECT 1").execute(&pool).await.map(|_| ()) },
            timeout,
        )
        .await
    }

    async fn check_fallback(&self) -> HealthCheckResult {
        if !self.config.sqlite.enabled {
            return HealthCheckResult::unknown();
        }

        let timeout = self.config.health_check.timeout;
        let maybe_pool = { self.fallback_pool.read().await.clone() };
        let pool = match maybe_pool {
            Some(pool) => pool,
            None => match init_sqlite(&self.config.sqlite).await {
                Ok(pool) => {
                    *self.fallback_pool.write().await = Some(pool.clone());
                    self.ensure_managers_initialized().await;
                    pool
                }
                Err(err) => {
                    return HealthCheckResult::unhealthy(format!("connect failed: {err}"));
                }
            },
        };

        self.perform_sql_check(
            || async move { sqlx::query("SELECT 1").execute(&pool).await.map(|_| ()) },
            timeout,
        )
        .await
    }

    async fn perform_sql_check<F, Fut, R>(&self, op: F, timeout: Duration) -> HealthCheckResult
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<R, sqlx::Error>> + Send,
        R: Send,
    {
        let started = std::time::Instant::now();
        let result = tokio::time::timeout(timeout, op()).await;

        match result {
            Ok(Ok(_)) => HealthCheckResult::healthy(started.elapsed()),
            Ok(Err(err)) => HealthCheckResult::unhealthy(err.to_string()),
            Err(_) => HealthCheckResult::unhealthy("timeout".to_string()),
        }
    }

    async fn apply_state_transitions(&self) {
        let primary = { self.primary_health.read().await.snapshot() };
        let fallback = { self.fallback_health.read().await.snapshot() };
        let current = { self.state_machine.read().await.state() };

        let primary_failed = primary.consecutive_failures >= self.config.health_check.failure_threshold;
        let primary_recovered = self.primary_health.read().await.is_recovery_threshold_reached();

        let fallback_unhealthy =
            self.config.sqlite.enabled && fallback.timestamp_ms.is_some() && !fallback.healthy;

        let fencing_required = self.fencing.enabled();
        let fencing_lost = fencing_required && !self.fencing.has_valid_lock();

        let fencing_ready = match current {
            DatabaseState::Normal => {
                if fencing_lost && primary.healthy {
                    self.ensure_fencing_lock().await
                } else {
                    !fencing_lost
                }
            }
            DatabaseState::Degraded => {
                if primary_recovered && fencing_required {
                    self.ensure_fencing_lock().await
                } else {
                    true
                }
            }
            DatabaseState::Syncing => {
                if fencing_lost {
                    self.ensure_fencing_lock().await
                } else {
                    true
                }
            }
            DatabaseState::Unavailable => true,
        };

        let mut sm = self.state_machine.write().await;

        match current {
            DatabaseState::Normal => {
                if fencing_lost && !fencing_ready {
                    if self.config.sqlite.enabled && !fallback_unhealthy {
                        let _ = sm.degraded("fencing lock lost");
                    } else {
                        let _ = sm.degraded("fencing lock lost");
                        let _ = sm.unavailable("fencing lock lost and fallback unavailable");
                    }
                    return;
                }

                if primary_failed {
                    if self.config.sqlite.enabled && !fallback_unhealthy {
                        let _ = sm.degraded("primary health threshold reached");
                    } else {
                        let _ = sm.degraded("primary health threshold reached");
                        let _ = sm.unavailable("primary down and fallback unavailable");
                    }
                }
            }
            DatabaseState::Degraded => {
                if fallback_unhealthy {
                    let _ = sm.unavailable("fallback unhealthy while degraded");
                } else if primary_recovered && fencing_ready {
                    let _ = sm.start_sync("primary recovered (sync not yet started)");
                }
            }
            DatabaseState::Syncing => {
                if primary_failed {
                    let _ = sm.sync_failed("primary became unhealthy during syncing");
                } else if fencing_lost && !fencing_ready {
                    let _ = sm.sync_failed("fencing lock lost during syncing");
                }
            }
            DatabaseState::Unavailable => {
                if self.config.sqlite.enabled && !fallback_unhealthy {
                    let _ = sm.transition_to(DatabaseState::Degraded, "fallback recovered");
                } else if primary.healthy {
                    let _ = sm.transition_to(DatabaseState::Normal, "primary recovered");
                }
            }
        }
    }

    async fn ensure_fencing_lock(&self) -> bool {
        if !self.fencing.enabled() {
            return true;
        }
        if self.fencing.has_valid_lock() {
            return true;
        }

        match self.fencing.acquire_lock().await {
            Ok(true) => true,
            Ok(false) => false,
            Err(err) => {
                tracing::warn!(error = %err, "failed to acquire fencing lock");
                false
            }
        }
    }

    async fn ensure_managers_initialized(&self) {
        if !self.config.sqlite.enabled {
            return;
        }

        let Some(registry) = self.schema_registry.as_ref() else {
            return;
        };

        let fallback = { self.fallback_pool.read().await.clone() };
        let Some(fallback) = fallback else {
            return;
        };

        let primary = match self.primary_pool.read().await.clone() {
            Some(pool) => pool,
            None => {
                let pool = PgPoolOptions::new()
                    .max_connections(10)
                    .acquire_timeout(Duration::from_secs(5))
                    .connect_lazy(&self.config.primary_url);

                match pool {
                    Ok(pool) => pool,
                    Err(err) => {
                        tracing::warn!(error = %err, "postgres lazy pool init failed");
                        return;
                    }
                }
            }
        };

        {
            let mut guard = self.sync_manager.write().await;
            if guard.is_none() {
                let resolver = ConflictResolver::new(self.config.sync.conflict_strategy);
                let manager = Arc::new(SyncManager::new(
                    primary.clone(),
                    fallback.clone(),
                    Arc::clone(registry),
                    resolver,
                    self.config.sync.clone(),
                ));
                *guard = Some(manager);
            }
        }

        {
            let mut guard = self.dual_write_manager.write().await;
            if guard.is_none() {
                let manager = Arc::new(dual_write_manager::DualWriteManager::new(
                    primary,
                    fallback,
                    Arc::clone(registry),
                    Arc::clone(&self.fencing),
                    self.config.dual_write.clone(),
                ));
                manager.initialize().await;
                *guard = Some(manager);
            }
        }
    }

    fn start_recovery_task(self: &Arc<Self>) {
        if self.sync_running.swap(true, Ordering::AcqRel) {
            return;
        }

        let proxy = Arc::clone(self);
        tokio::spawn(async move {
            let proxy_for_recovery = Arc::clone(&proxy);
            proxy_for_recovery.run_recovery().await;
            proxy.sync_running.store(false, Ordering::Release);
        });
    }

    async fn run_recovery(self: Arc<Self>) {
        self.ensure_managers_initialized().await;

        if self.fencing.enabled() && !self.ensure_fencing_lock().await {
            tracing::warn!("fencing lock unavailable, skipping recovery");
            let _ = self
                .state_machine
                .write()
                .await
                .sync_failed("fencing lock unavailable");
            return;
        }

        let maybe_sync = { self.sync_manager.read().await.clone() };
        let Some(sync) = maybe_sync else {
            tracing::warn!("sync manager not initialized, skipping recovery");
            let _ = self
                .state_machine
                .write()
                .await
                .sync_failed("sync manager not initialized");
            return;
        };

        let result = sync.sync().await;
        self.update_sync_meta(&result).await;

        if result.success {
            let _ = self
                .state_machine
                .write()
                .await
                .recover("sync completed successfully");
        } else {
            let _ = self.state_machine.write().await.sync_failed("sync failed");
        }

        if let Some(dw) = self.dual_write_manager.read().await.clone() {
            let state = { self.state_machine.read().await.state() };
            dw.on_state_changed(state).await;
        }
    }

    async fn update_sync_meta(&self, result: &SyncResult) {
        let mut meta = self.sync_meta.write().await;
        meta.last_sync_time_ms = Some(now_ms());
        meta.last_error = if result.success {
            None
        } else {
            result
                .errors
                .first()
                .map(|entry| entry.error.clone())
                .or(Some("sync completed with errors".to_string()))
        };
    }

    async fn full_sync_primary_to_fallback(&self) -> Result<(), DbInitError> {
        if !self.config.sqlite.enabled {
            return Ok(());
        }

        let Some(registry) = self.schema_registry.as_ref() else {
            return Ok(());
        };

        let primary = { self.primary_pool.read().await.clone() };
        let fallback = { self.fallback_pool.read().await.clone() };
        let (Some(primary), Some(fallback)) = (primary, fallback) else {
            return Ok(());
        };

        let batch_size = self.config.sync.batch_size as i64;

        for table_schema in registry.tables() {
            if table_schema.table_name.starts_with('_') {
                continue;
            }

            let sqlite_columns = sqlite_table_columns(&fallback, &table_schema.table_name).await?;
            if sqlite_columns.is_empty() {
                continue;
            }

            let mut offset = 0i64;
            loop {
                let sql = format!(
                    "SELECT to_jsonb(t) FROM \"{}\" t LIMIT $1 OFFSET $2",
                    table_schema.table_name
                );

                let rows: Vec<sqlx::types::Json<serde_json::Value>> =
                    match sqlx::query_scalar(&sql)
                        .bind(batch_size)
                        .bind(offset)
                        .fetch_all(&primary)
                        .await
                    {
                        Ok(rows) => rows,
                        Err(err) => {
                            tracing::warn!(table = %table_schema.table_name, error = %err, "full sync query failed");
                            break;
                        }
                    };

                if rows.is_empty() {
                    break;
                }

                let mut converted: Vec<Vec<type_mapper::SqliteBindValue>> = Vec::new();
                for row in &rows {
                    let Some(object) = row.0.as_object() else { continue };
                    let mut values = Vec::with_capacity(sqlite_columns.len());
                    for column in &sqlite_columns {
                        let prisma_type = table_schema
                            .fields
                            .iter()
                            .find(|f| f.name == *column)
                            .map(|f| f.prisma_type.as_str())
                            .unwrap_or("String");

                        let value = object.get(column).unwrap_or(&serde_json::Value::Null);
                        let bind =
                            type_mapper::pg_json_to_sqlite(value, prisma_type).unwrap_or(type_mapper::SqliteBindValue::Text(None));
                        values.push(bind);
                    }
                    converted.push(values);
                }

                if !converted.is_empty() {
                    insert_rows_sqlite(&fallback, &table_schema.table_name, &sqlite_columns, &converted).await?;
                }

                offset += batch_size;
                if (rows.len() as i64) < batch_size {
                    break;
                }
            }
        }

        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum DbInitError {
    #[error(transparent)]
    Config(#[from] DbConfigError),
    #[error(transparent)]
    SchemaRegistry(#[from] SchemaRegistryError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Fencing(#[from] FencingError),
    #[error(transparent)]
    Transition(#[from] TransitionError),
}

#[derive(Debug, Default, Clone)]
pub struct SyncMeta {
    pub last_sync_time_ms: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SyncStatusSnapshot {
    pub last_sync_time_ms: Option<u64>,
    pub last_error: Option<String>,
}

async fn sqlite_table_columns(pool: &SqlitePool, table: &str) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(&format!("PRAGMA table_info(\"{}\")", table))
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .collect())
}

async fn insert_rows_sqlite(
    pool: &SqlitePool,
    table: &str,
    columns: &[String],
    rows: &[Vec<type_mapper::SqliteBindValue>],
) -> Result<(), sqlx::Error> {
    if rows.is_empty() || columns.is_empty() {
        return Ok(());
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new("INSERT OR IGNORE INTO \"");
    qb.push(table);
    qb.push("\" (");
    for (idx, col) in columns.iter().enumerate() {
        if idx > 0 {
            qb.push(", ");
        }
        qb.push("\"");
        qb.push(col);
        qb.push("\"");
    }
    qb.push(") ");

    qb.push_values(rows.iter(), |mut b, row| {
        for value in row {
            match value {
                type_mapper::SqliteBindValue::Text(v) => b.push_bind(v.clone()),
                type_mapper::SqliteBindValue::Integer(v) => b.push_bind(*v),
                type_mapper::SqliteBindValue::Real(v) => b.push_bind(*v),
                type_mapper::SqliteBindValue::Blob(v) => b.push_bind(v.clone()),
            };
        }
    });

    qb.build().execute(pool).await?;
    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
