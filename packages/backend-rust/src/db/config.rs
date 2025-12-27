use std::time::Duration;

use thiserror::Error;

#[derive(Debug, Clone)]
pub struct DbConfig {
    pub primary_url: String,
    pub health_check: HealthCheckConfig,
}

impl DbConfig {
    pub fn from_env() -> Result<Self, DbConfigError> {
        let primary_url = std::env::var("DATABASE_URL").map_err(|_| DbConfigError::Missing {
            key: "DATABASE_URL",
        })?;

        Ok(Self {
            primary_url,
            health_check: HealthCheckConfig::from_env(),
        })
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

#[derive(Debug, Error)]
pub enum DbConfigError {
    #[error("Missing required env var: {key}")]
    Missing { key: &'static str },
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
