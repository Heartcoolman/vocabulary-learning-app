use std::collections::VecDeque;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::db::config::HealthCheckConfig;

#[derive(Debug, Clone)]
pub struct HealthCheckResult {
    pub applicable: bool,
    pub healthy: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub timestamp_ms: u64,
}

impl HealthCheckResult {
    pub fn healthy(latency: Duration) -> Self {
        Self {
            applicable: true,
            healthy: true,
            latency_ms: Some(latency.as_millis() as u64),
            error: None,
            timestamp_ms: now_ms(),
        }
    }

    pub fn unhealthy(error: String) -> Self {
        Self {
            applicable: true,
            healthy: false,
            latency_ms: None,
            error: Some(error),
            timestamp_ms: now_ms(),
        }
    }

    pub fn unknown() -> Self {
        Self {
            applicable: false,
            healthy: false,
            latency_ms: None,
            error: None,
            timestamp_ms: now_ms(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct HealthCheckSnapshot {
    pub healthy: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub timestamp_ms: Option<u64>,
    pub consecutive_failures: u32,
    pub consecutive_successes: u32,
}

#[derive(Debug)]
pub struct HealthTracker {
    config: HealthCheckConfig,
    consecutive_failures: u32,
    consecutive_successes: u32,
    last_result: Option<HealthCheckResult>,
    last_failure_ms: Option<u64>,
    window: VecDeque<bool>,
    window_size: usize,
}

impl HealthTracker {
    pub fn new(config: HealthCheckConfig) -> Self {
        Self {
            config,
            consecutive_failures: 0,
            consecutive_successes: 0,
            last_result: None,
            last_failure_ms: None,
            window: VecDeque::new(),
            window_size: 10,
        }
    }

    pub fn process(&mut self, result: HealthCheckResult) {
        if !result.applicable {
            return;
        }

        self.last_result = Some(result.clone());

        self.window.push_back(result.healthy);
        if self.window.len() > self.window_size {
            self.window.pop_front();
        }

        if result.healthy {
            self.consecutive_successes = self.consecutive_successes.saturating_add(1);

            let recent_failures = self
                .window
                .iter()
                .filter(|healthy| !**healthy)
                .count() as u32;

            if recent_failures >= self.config.failure_threshold {
                self.consecutive_failures = recent_failures;
            } else {
                self.consecutive_failures = 0;
            }
        } else {
            self.consecutive_failures = self.consecutive_failures.saturating_add(1);

            let recent_successes = self
                .window
                .iter()
                .filter(|healthy| **healthy)
                .count() as u32;

            if recent_successes >= self.config.recovery_threshold {
                self.consecutive_successes = recent_successes;
            } else {
                self.consecutive_successes = 0;
            }

            self.last_failure_ms = Some(result.timestamp_ms);
        }
    }

    pub fn snapshot(&self) -> HealthCheckSnapshot {
        HealthCheckSnapshot {
            healthy: self.last_result.as_ref().map(|r| r.healthy).unwrap_or(false),
            latency_ms: self.last_result.as_ref().and_then(|r| r.latency_ms),
            error: self.last_result.as_ref().and_then(|r| r.error.clone()),
            timestamp_ms: self.last_result.as_ref().map(|r| r.timestamp_ms),
            consecutive_failures: self.consecutive_failures,
            consecutive_successes: self.consecutive_successes,
        }
    }

    pub fn is_recovery_threshold_reached(&self) -> bool {
        if let Some(last_failure) = self.last_failure_ms {
            let since_failure = now_ms().saturating_sub(last_failure);
            if since_failure < self.config.min_recovery_interval.as_millis() as u64 {
                return false;
            }
        }
        self.consecutive_successes >= self.config.recovery_threshold
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

