use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::Utc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use super::alerts::{alert_monitoring_service, AlertEvent, AlertSeverity, AlertStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub metric: String,
    pub operator: ComparisonOperator,
    pub threshold: f64,
    pub severity: AlertSeverity,
    pub cooldown_secs: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComparisonOperator {
    Gt,
    Gte,
    Lt,
    Lte,
    Eq,
}

impl ComparisonOperator {
    fn evaluate(&self, value: f64, threshold: f64) -> bool {
        match self {
            Self::Gt => value > threshold,
            Self::Gte => value >= threshold,
            Self::Lt => value < threshold,
            Self::Lte => value <= threshold,
            Self::Eq => (value - threshold).abs() < f64::EPSILON,
        }
    }
}

pub struct AlertEngine {
    rules: RwLock<Vec<AlertRule>>,
    last_fired: RwLock<HashMap<String, Instant>>,
    webhook_url: Option<String>,
}

impl Default for AlertEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AlertEngine {
    pub fn new() -> Self {
        let webhook_url = std::env::var("ALERT_WEBHOOK_URL").ok();
        let mut engine = Self {
            rules: RwLock::new(Vec::new()),
            last_fired: RwLock::new(HashMap::new()),
            webhook_url,
        };
        engine.load_default_rules();
        engine
    }

    fn load_default_rules(&mut self) {
        let error_threshold = std::env::var("ALERT_ERROR_THRESHOLD")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(0.05);

        let latency_threshold = std::env::var("ALERT_LATENCY_THRESHOLD")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(2000.0);

        let rules = vec![
            AlertRule {
                id: "error_rate".to_string(),
                name: "High Error Rate".to_string(),
                metric: "error_rate".to_string(),
                operator: ComparisonOperator::Gt,
                threshold: error_threshold,
                severity: AlertSeverity::Critical,
                cooldown_secs: 300,
            },
            AlertRule {
                id: "p95_latency".to_string(),
                name: "High P95 Latency".to_string(),
                metric: "p95_latency_ms".to_string(),
                operator: ComparisonOperator::Gt,
                threshold: latency_threshold,
                severity: AlertSeverity::Warning,
                cooldown_secs: 300,
            },
            AlertRule {
                id: "db_connection".to_string(),
                name: "Database Connection Failed".to_string(),
                metric: "db_connected".to_string(),
                operator: ComparisonOperator::Eq,
                threshold: 0.0,
                severity: AlertSeverity::Critical,
                cooldown_secs: 60,
            },
            AlertRule {
                id: "worker_failure".to_string(),
                name: "Worker Task Failed".to_string(),
                metric: "worker_healthy".to_string(),
                operator: ComparisonOperator::Eq,
                threshold: 0.0,
                severity: AlertSeverity::Warning,
                cooldown_secs: 300,
            },
        ];

        *self.rules.write() = rules;
    }

    pub fn evaluate(&self, metrics: &HashMap<String, f64>) {
        let rules = self.rules.read();
        let service = alert_monitoring_service();

        for rule in rules.iter() {
            let Some(&value) = metrics.get(&rule.metric) else {
                continue;
            };

            let triggered = rule.operator.evaluate(value, rule.threshold);

            if triggered {
                if self.can_fire(&rule.id, rule.cooldown_secs) {
                    let event = AlertEvent {
                        id: format!("alert_{}_{}", rule.id, Utc::now().timestamp_millis()),
                        rule_id: rule.id.clone(),
                        rule_name: rule.name.clone(),
                        metric: rule.metric.clone(),
                        severity: rule.severity,
                        status: AlertStatus::Firing,
                        message: format!(
                            "{}: {} = {:.4} (threshold: {:.4})",
                            rule.name, rule.metric, value, rule.threshold
                        ),
                        value,
                        threshold: Some(rule.threshold),
                        triggered_at: Utc::now().to_rfc3339(),
                        resolved_at: None,
                    };

                    service.fire_alert(event.clone());
                    self.mark_fired(&rule.id);
                    self.send_webhook(&event);
                }
            } else {
                service.resolve_alert(&rule.id);
            }
        }
    }

    fn can_fire(&self, rule_id: &str, cooldown_secs: u64) -> bool {
        let last_fired = self.last_fired.read();
        match last_fired.get(rule_id) {
            Some(last) => last.elapsed() > Duration::from_secs(cooldown_secs),
            None => true,
        }
    }

    fn mark_fired(&self, rule_id: &str) {
        self.last_fired
            .write()
            .insert(rule_id.to_string(), Instant::now());
    }

    fn send_webhook(&self, event: &AlertEvent) {
        let Some(url) = &self.webhook_url else {
            return;
        };

        let url = url.clone();
        let payload = serde_json::json!({
            "text": format!(
                "[{}] {} - {}",
                format!("{:?}", event.severity).to_uppercase(),
                event.rule_name,
                event.message
            ),
            "blocks": [{
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": format!(
                        "*{}*\n{}\n• Metric: `{}`\n• Value: `{:.4}`\n• Threshold: `{:.4}`\n• Time: `{}`",
                        event.rule_name,
                        event.message,
                        event.metric,
                        event.value,
                        event.threshold.unwrap_or(0.0),
                        event.triggered_at
                    )
                }
            }]
        });

        tokio::spawn(async move {
            let client = reqwest::Client::new();
            for attempt in 0..3 {
                match client
                    .post(&url)
                    .json(&payload)
                    .timeout(Duration::from_secs(10))
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        tracing::debug!("Alert webhook sent successfully");
                        return;
                    }
                    Ok(resp) => {
                        tracing::warn!(status = %resp.status(), "Alert webhook failed");
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, attempt = attempt + 1, "Alert webhook error");
                    }
                }
                tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
            }
            tracing::error!("Alert webhook failed after 3 attempts");
        });
    }

    pub fn add_rule(&self, rule: AlertRule) {
        self.rules.write().push(rule);
    }

    pub fn remove_rule(&self, rule_id: &str) {
        self.rules.write().retain(|r| r.id != rule_id);
    }

    pub fn list_rules(&self) -> Vec<AlertRule> {
        self.rules.read().clone()
    }
}

static GLOBAL_ENGINE: std::sync::OnceLock<Arc<AlertEngine>> = std::sync::OnceLock::new();

pub fn alert_engine() -> Arc<AlertEngine> {
    GLOBAL_ENGINE
        .get_or_init(|| Arc::new(AlertEngine::new()))
        .clone()
}
