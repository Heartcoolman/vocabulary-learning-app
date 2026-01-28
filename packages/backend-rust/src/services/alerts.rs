use std::collections::VecDeque;
use std::sync::Arc;

use chrono::Utc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Info,
    Warning,
    Critical,
}

impl AlertSeverity {
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "warning" => Self::Warning,
            "critical" => Self::Critical,
            _ => Self::Info,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertStatus {
    Pending,
    Firing,
    Resolved,
}

impl AlertStatus {
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "firing" => Self::Firing,
            "resolved" => Self::Resolved,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertEvent {
    pub id: String,
    pub rule_id: String,
    pub rule_name: String,
    pub metric: String,
    pub severity: AlertSeverity,
    pub status: AlertStatus,
    pub message: String,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threshold: Option<f64>,
    pub triggered_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<String>,
}

pub struct AlertMonitoringService {
    active_alerts: RwLock<Vec<AlertEvent>>,
    history: RwLock<VecDeque<AlertEvent>>,
    max_history: usize,
}

impl Default for AlertMonitoringService {
    fn default() -> Self {
        Self::new()
    }
}

impl AlertMonitoringService {
    pub fn new() -> Self {
        Self {
            active_alerts: RwLock::new(Vec::new()),
            history: RwLock::new(VecDeque::new()),
            max_history: 200,
        }
    }

    pub fn get_active_alerts(&self) -> Vec<AlertEvent> {
        self.active_alerts.read().clone()
    }

    pub fn get_history(&self, limit: usize) -> Vec<AlertEvent> {
        let history = self.history.read();
        history.iter().take(limit).cloned().collect()
    }

    pub fn fire_alert(&self, event: AlertEvent) {
        let mut active = self.active_alerts.write();
        if !active.iter().any(|a| a.rule_id == event.rule_id) {
            active.push(event.clone());
        }

        let mut history = self.history.write();
        history.push_front(event);
        while history.len() > self.max_history {
            history.pop_back();
        }
    }

    pub fn resolve_alert(&self, rule_id: &str) {
        let mut active = self.active_alerts.write();
        if let Some(pos) = active.iter().position(|a| a.rule_id == rule_id) {
            let mut resolved = active.remove(pos);
            resolved.status = AlertStatus::Resolved;
            resolved.resolved_at = Some(Utc::now().to_rfc3339());

            let mut history = self.history.write();
            history.push_front(resolved);
            while history.len() > self.max_history {
                history.pop_back();
            }
        }
    }

    pub fn clear_all(&self) {
        self.active_alerts.write().clear();
    }

    pub fn active_count(&self) -> usize {
        self.active_alerts.read().len()
    }

    pub fn history_count(&self) -> usize {
        self.history.read().len()
    }
}

static GLOBAL_SERVICE: std::sync::OnceLock<Arc<AlertMonitoringService>> =
    std::sync::OnceLock::new();

pub fn alert_monitoring_service() -> Arc<AlertMonitoringService> {
    GLOBAL_SERVICE
        .get_or_init(|| Arc::new(AlertMonitoringService::new()))
        .clone()
}
