use std::path::{Path, PathBuf};
use std::time::Duration;

use thiserror::Error;

#[derive(Debug, Clone)]
pub struct DbConfig {
    pub primary_url: String,
    pub redis_url: Option<String>,
    pub sqlite: SqliteConfig,
    pub health_check: HealthCheckConfig,
    pub sync: SyncConfig,
    pub dual_write: DualWriteConfig,
    pub fencing: FencingConfig,
}

impl DbConfig {
    pub fn from_env() -> Result<Self, DbConfigError> {
        let primary_url = std::env::var("DATABASE_URL").map_err(|_| DbConfigError::Missing {
            key: "DATABASE_URL",
        })?;

        let redis_url = std::env::var("REDIS_URL").ok();

        Ok(Self {
            primary_url,
            redis_url,
            sqlite: SqliteConfig::from_env(),
            health_check: HealthCheckConfig::from_env(),
            sync: SyncConfig::from_env(),
            dual_write: DualWriteConfig::from_env(),
            fencing: FencingConfig::from_env(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct SqliteConfig {
    pub enabled: bool,
    pub path: PathBuf,
    pub journal_mode: SqliteJournalMode,
    pub synchronous: SqliteSynchronous,
    pub busy_timeout: Duration,
    pub cache_size: i64,
    pub foreign_keys: bool,
}

impl SqliteConfig {
    fn from_env() -> Self {
        let enabled = env_bool("SQLITE_FALLBACK_ENABLED", false);

        let raw_path = std::env::var("SQLITE_FALLBACK_PATH").unwrap_or_else(|_| "./data/fallback.db".to_string());
        let path = resolve_path_relative_to_manifest_dir(&raw_path);

        let journal_mode = std::env::var("SQLITE_JOURNAL_MODE")
            .ok()
            .as_deref()
            .and_then(SqliteJournalMode::parse)
            .unwrap_or(SqliteJournalMode::Wal);

        let synchronous = std::env::var("SQLITE_SYNCHRONOUS")
            .ok()
            .as_deref()
            .and_then(SqliteSynchronous::parse)
            .unwrap_or(SqliteSynchronous::Full);

        let busy_timeout_ms = env_u64("SQLITE_BUSY_TIMEOUT_MS", 5000);
        let cache_size = env_i64("SQLITE_CACHE_SIZE", -64000);
        let foreign_keys = env_bool("SQLITE_FOREIGN_KEYS", true);

        Self {
            enabled,
            path,
            journal_mode,
            synchronous,
            busy_timeout: Duration::from_millis(busy_timeout_ms),
            cache_size,
            foreign_keys,
        }
    }
}

#[derive(Debug, Clone)]
pub struct HealthCheckConfig {
    pub interval: Duration,
    pub timeout: Duration,
    pub failure_threshold: u32,
    pub recovery_threshold: u32,
    pub min_recovery_interval: Duration,
}

impl HealthCheckConfig {
    fn from_env() -> Self {
        let interval_ms = env_u64("DB_HEALTH_CHECK_INTERVAL_MS", 5000);
        let timeout_ms = env_u64("DB_HEALTH_CHECK_TIMEOUT_MS", 3000);
        let failure_threshold = env_u32("DB_FAILURE_THRESHOLD", 3);
        let recovery_threshold = env_u32("DB_RECOVERY_THRESHOLD", 5);
        let min_recovery_interval_ms = env_u64("DB_MIN_RECOVERY_INTERVAL_MS", 30000);

        Self {
            interval: Duration::from_millis(interval_ms),
            timeout: Duration::from_millis(timeout_ms),
            failure_threshold,
            recovery_threshold,
            min_recovery_interval: Duration::from_millis(min_recovery_interval_ms),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictStrategy {
    SqliteWins,
    PostgresWins,
    Manual,
    VersionBased,
}

impl ConflictStrategy {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "sqlite_wins" => Some(Self::SqliteWins),
            "postgres_wins" => Some(Self::PostgresWins),
            "manual" => Some(Self::Manual),
            "version_based" => Some(Self::VersionBased),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SyncConfig {
    pub batch_size: u32,
    pub retry_count: u32,
    pub conflict_strategy: ConflictStrategy,
    pub sync_on_startup: bool,
}

impl SyncConfig {
    fn from_env() -> Self {
        let batch_size = env_u32("DB_SYNC_BATCH_SIZE", 100);
        let retry_count = env_u32("DB_SYNC_RETRY_COUNT", 3);
        let conflict_strategy = std::env::var("DB_CONFLICT_STRATEGY")
            .ok()
            .as_deref()
            .and_then(ConflictStrategy::parse)
            .unwrap_or(ConflictStrategy::SqliteWins);
        let sync_on_startup = env_bool("SQLITE_SYNC_ON_STARTUP", true);

        Self {
            batch_size,
            retry_count,
            conflict_strategy,
            sync_on_startup,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FencingConfig {
    pub enabled: bool,
    pub lock_key: String,
    pub lock_ttl: Duration,
    pub renew_interval: Duration,
    pub fail_on_redis_unavailable: bool,
}

impl FencingConfig {
    fn from_env() -> Self {
        let enabled = env_bool("DB_FENCING_ENABLED", false);
        let lock_key = std::env::var("DB_FENCING_LOCK_KEY")
            .unwrap_or_else(|_| "danci:db:write_lock".to_string());
        let lock_ttl_ms = env_u64("DB_FENCING_LOCK_TTL_MS", 30000);
        let renew_interval_ms = env_u64("DB_FENCING_RENEW_INTERVAL_MS", 10000);
        let fail_on_redis_unavailable = env_bool("DB_FENCING_FAIL_ON_REDIS_UNAVAILABLE", false);

        Self {
            enabled,
            lock_key,
            lock_ttl: Duration::from_millis(lock_ttl_ms),
            renew_interval: Duration::from_millis(renew_interval_ms),
            fail_on_redis_unavailable,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqliteJournalMode {
    Wal,
    Delete,
    Truncate,
    Persist,
    Memory,
    Off,
}

impl SqliteJournalMode {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "WAL" => Some(Self::Wal),
            "DELETE" => Some(Self::Delete),
            "TRUNCATE" => Some(Self::Truncate),
            "PERSIST" => Some(Self::Persist),
            "MEMORY" => Some(Self::Memory),
            "OFF" => Some(Self::Off),
            _ => None,
        }
    }

    pub const fn as_pragma_value(self) -> &'static str {
        match self {
            SqliteJournalMode::Wal => "WAL",
            SqliteJournalMode::Delete => "DELETE",
            SqliteJournalMode::Truncate => "TRUNCATE",
            SqliteJournalMode::Persist => "PERSIST",
            SqliteJournalMode::Memory => "MEMORY",
            SqliteJournalMode::Off => "OFF",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqliteSynchronous {
    Off,
    Normal,
    Full,
    Extra,
}

impl SqliteSynchronous {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "OFF" => Some(Self::Off),
            "NORMAL" => Some(Self::Normal),
            "FULL" => Some(Self::Full),
            "EXTRA" => Some(Self::Extra),
            _ => None,
        }
    }

    pub const fn as_pragma_value(self) -> &'static str {
        match self {
            SqliteSynchronous::Off => "OFF",
            SqliteSynchronous::Normal => "NORMAL",
            SqliteSynchronous::Full => "FULL",
            SqliteSynchronous::Extra => "EXTRA",
        }
    }
}

#[derive(Debug, Clone)]
pub struct DualWriteConfig {
    pub sync_write_to_fallback: bool,
    pub sync_critical_writes: bool,
    pub max_async_retries: u32,
    pub async_retry_delay: Duration,
    pub recover_pending_writes_on_init: bool,
}

impl DualWriteConfig {
    fn from_env() -> Self {
        let sync_write_to_fallback = env_bool("DB_SYNC_WRITE_TO_FALLBACK", false);
        let sync_critical_writes = env_bool("DB_SYNC_CRITICAL_WRITES", true);
        let max_async_retries = env_u32("DB_MAX_ASYNC_RETRIES", 3);
        let async_retry_delay_ms = env_u64("DB_ASYNC_RETRY_DELAY_MS", 1000);
        let recover_pending_writes_on_init = env_bool("DB_RECOVER_PENDING_WRITES_ON_INIT", true);

        Self {
            sync_write_to_fallback,
            sync_critical_writes,
            max_async_retries,
            async_retry_delay: Duration::from_millis(async_retry_delay_ms),
            recover_pending_writes_on_init,
        }
    }
}

#[derive(Debug, Error)]
pub enum DbConfigError {
    #[error("Missing required env var: {key}")]
    Missing { key: &'static str },
}

fn env_bool(key: &str, default: bool) -> bool {
    match std::env::var(key).ok().as_deref() {
        Some("true") | Some("1") => true,
        Some("false") | Some("0") => false,
        _ => default,
    }
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(default)
}

fn env_i64(key: &str, default: i64) -> i64 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(default)
}

fn resolve_path_relative_to_manifest_dir(value: &str) -> PathBuf {
    let raw = Path::new(value);
    if raw.is_absolute() {
        return raw.to_path_buf();
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(raw)
}
