use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use tokio::sync::RwLock;

use crate::amas::config::FeatureFlags;
use crate::amas::AMASEngine;
use crate::cache::RedisCache;
use crate::db::DatabaseProxy;
use crate::services::email_provider::EmailService;

#[derive(Debug)]
pub struct RuntimeConfig {
    pub redis_enabled: AtomicBool,
    pub llm_enabled: AtomicBool,
    pub llm_mock: AtomicBool,
    pub db_slow_enabled: AtomicBool,
    pub db_slow_delay_ms: AtomicU64,
    amas_flags: RwLock<FeatureFlags>,
}

impl RuntimeConfig {
    pub fn new() -> Self {
        Self {
            redis_enabled: AtomicBool::new(true),
            llm_enabled: AtomicBool::new(true),
            llm_mock: AtomicBool::new(false),
            db_slow_enabled: AtomicBool::new(false),
            db_slow_delay_ms: AtomicU64::new(0),
            amas_flags: RwLock::new(FeatureFlags::default()),
        }
    }

    pub fn is_redis_enabled(&self) -> bool {
        self.redis_enabled.load(Ordering::Relaxed)
    }

    pub fn is_llm_enabled(&self) -> bool {
        self.llm_enabled.load(Ordering::Relaxed)
    }

    pub fn is_llm_mock(&self) -> bool {
        self.llm_mock.load(Ordering::Relaxed)
    }

    pub fn is_db_slow_enabled(&self) -> bool {
        self.db_slow_enabled.load(Ordering::Relaxed)
    }

    pub fn db_slow_delay(&self) -> Duration {
        Duration::from_millis(self.db_slow_delay_ms.load(Ordering::Relaxed))
    }

    pub async fn amas_flags(&self) -> FeatureFlags {
        self.amas_flags.read().await.clone()
    }

    pub async fn set_amas_flags(&self, flags: FeatureFlags) {
        let mut guard = self.amas_flags.write().await;
        *guard = flags;
    }

    pub async fn maybe_db_delay(&self) {
        if self.is_db_slow_enabled() {
            let delay = self.db_slow_delay();
            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }
        }
    }
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
pub struct AppState {
    started_at: Instant,
    started_at_system: SystemTime,
    db_proxy: Option<Arc<DatabaseProxy>>,
    cache: Option<Arc<RedisCache>>,
    amas_engine: Arc<AMASEngine>,
    runtime: Arc<RuntimeConfig>,
    email_service: Arc<EmailService>,
}

impl AppState {
    pub fn new(
        db_proxy: Option<Arc<DatabaseProxy>>,
        amas_engine: Arc<AMASEngine>,
        cache: Option<Arc<RedisCache>>,
    ) -> Self {
        Self {
            started_at: Instant::now(),
            started_at_system: SystemTime::now(),
            db_proxy,
            cache,
            amas_engine,
            runtime: Arc::new(RuntimeConfig::new()),
            email_service: Arc::new(EmailService::from_env()),
        }
    }

    pub fn create_amas_engine(db_proxy: Option<Arc<DatabaseProxy>>) -> Arc<AMASEngine> {
        Arc::new(AMASEngine::new(
            crate::amas::AMASConfig::from_env(),
            db_proxy,
        ))
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    pub fn started_at_system(&self) -> SystemTime {
        self.started_at_system
    }

    pub fn db_proxy(&self) -> Option<Arc<DatabaseProxy>> {
        self.db_proxy.clone()
    }

    pub fn cache(&self) -> Option<Arc<RedisCache>> {
        if !self.runtime.is_redis_enabled() {
            return None;
        }
        self.cache.clone()
    }

    pub fn cache_raw(&self) -> Option<Arc<RedisCache>> {
        self.cache.clone()
    }

    pub fn amas_engine(&self) -> Arc<AMASEngine> {
        Arc::clone(&self.amas_engine)
    }

    pub fn runtime(&self) -> Arc<RuntimeConfig> {
        Arc::clone(&self.runtime)
    }

    pub fn email_service(&self) -> Arc<EmailService> {
        Arc::clone(&self.email_service)
    }
}
