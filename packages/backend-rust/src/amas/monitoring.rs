use std::sync::Arc;

use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::amas::types::{ColdStartPhase, ProcessResult};
use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvariantViolation {
    pub field: String,
    pub value: f64,
    pub expected_min: f64,
    pub expected_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitoringEvent {
    pub user_id: String,
    pub session_id: Option<String>,
    pub event_type: String,
    pub timestamp: i64,
    pub latency_ms: i64,
    pub is_anomaly: bool,
    pub invariant_violations: Vec<InvariantViolation>,
    pub user_state: serde_json::Value,
    pub strategy: serde_json::Value,
    pub reward: serde_json::Value,
    pub cold_start_phase: Option<String>,
    pub constraints_satisfied: Option<bool>,
    pub objective_score: Option<f64>,
}

pub struct AMASMonitor {
    db_proxy: Arc<DatabaseProxy>,
    sample_rate: f64,
}

impl AMASMonitor {
    pub fn new(db_proxy: Arc<DatabaseProxy>) -> Self {
        let sample_rate = std::env::var("AMAS_MONITOR_SAMPLE_RATE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0.05);

        Self {
            db_proxy,
            sample_rate,
        }
    }

    pub async fn record_process_event(
        &self,
        user_id: &str,
        session_id: Option<&str>,
        result: &ProcessResult,
        latency_ms: i64,
    ) {
        let violations = self.check_invariants(result);
        let is_anomaly = !violations.is_empty();
        let is_cold_start = matches!(
            result.cold_start_phase,
            Some(ColdStartPhase::Classify) | Some(ColdStartPhase::Explore)
        );

        if !self.should_sample(is_anomaly, is_cold_start) {
            return;
        }

        let event = MonitoringEvent {
            user_id: user_id.to_string(),
            session_id: session_id.map(String::from),
            event_type: "process_event".to_string(),
            timestamp: Utc::now().timestamp_millis(),
            latency_ms,
            is_anomaly,
            invariant_violations: violations.clone(),
            user_state: serde_json::to_value(&result.state).unwrap_or_default(),
            strategy: serde_json::to_value(&result.strategy).unwrap_or_default(),
            reward: serde_json::to_value(&result.reward).unwrap_or_default(),
            cold_start_phase: result
                .cold_start_phase
                .map(|p| format!("{:?}", p).to_lowercase()),
            constraints_satisfied: result
                .objective_evaluation
                .as_ref()
                .map(|e| e.constraints_satisfied),
            objective_score: result
                .objective_evaluation
                .as_ref()
                .map(|e| e.metrics.aggregated_score),
        };

        if let Err(e) = self.insert_event(&event).await {
            tracing::warn!(error = %e, "Failed to insert monitoring event");
        }

        if is_anomaly {
            for v in &violations {
                tracing::warn!(
                    user_id = %user_id,
                    field = %v.field,
                    value = %v.value,
                    expected = %format!("[{}, {}]", v.expected_min, v.expected_max),
                    "AMAS invariant violation detected"
                );
            }
        }
    }

    fn check_invariants(&self, result: &ProcessResult) -> Vec<InvariantViolation> {
        let mut violations = Vec::new();
        let state = &result.state;
        let strategy = &result.strategy;
        let reward = &result.reward;

        self.check_range(&mut violations, "attention", state.attention, 0.0, 1.0);
        self.check_range(&mut violations, "fatigue", state.fatigue, 0.0, 1.0);
        self.check_range(&mut violations, "motivation", state.motivation, -1.0, 1.0);
        self.check_range(&mut violations, "conf", state.conf, 0.0, 1.0);
        self.check_range(
            &mut violations,
            "cognitive.mem",
            state.cognitive.mem,
            0.0,
            1.0,
        );
        self.check_range(
            &mut violations,
            "cognitive.speed",
            state.cognitive.speed,
            0.0,
            1.0,
        );
        self.check_range(
            &mut violations,
            "cognitive.stability",
            state.cognitive.stability,
            0.0,
            1.0,
        );
        self.check_range(
            &mut violations,
            "strategy.new_ratio",
            strategy.new_ratio,
            0.0,
            1.0,
        );
        self.check_range(&mut violations, "reward.value", reward.value, -1.0, 1.0);

        self.check_nan_inf(&mut violations, "attention", state.attention);
        self.check_nan_inf(&mut violations, "fatigue", state.fatigue);
        self.check_nan_inf(&mut violations, "motivation", state.motivation);
        self.check_nan_inf(&mut violations, "conf", state.conf);
        self.check_nan_inf(&mut violations, "reward.value", reward.value);

        violations
    }

    fn check_range(
        &self,
        violations: &mut Vec<InvariantViolation>,
        field: &str,
        value: f64,
        min: f64,
        max: f64,
    ) {
        if value < min || value > max {
            violations.push(InvariantViolation {
                field: field.to_string(),
                value,
                expected_min: min,
                expected_max: max,
            });
        }
    }

    fn check_nan_inf(&self, violations: &mut Vec<InvariantViolation>, field: &str, value: f64) {
        if value.is_nan() || value.is_infinite() {
            violations.push(InvariantViolation {
                field: field.to_string(),
                value: if value.is_nan() { f64::NAN } else { value },
                expected_min: f64::NEG_INFINITY,
                expected_max: f64::INFINITY,
            });
        }
    }

    fn should_sample(&self, is_anomaly: bool, is_cold_start: bool) -> bool {
        if is_anomaly || is_cold_start {
            return true;
        }
        rand::rng().random::<f64>() < self.sample_rate
    }

    async fn insert_event(&self, event: &MonitoringEvent) -> Result<(), sqlx::Error> {
        let id = uuid::Uuid::new_v4();
        let violations_json = serde_json::to_value(&event.invariant_violations).unwrap_or_default();

        sqlx::query(
            r#"
            INSERT INTO "amas_monitoring_events" (
                "id", "userId", "sessionId", "eventType", "timestamp",
                "latencyMs", "isAnomaly", "invariantViolations",
                "userState", "strategy", "reward",
                "coldStartPhase", "constraintsSatisfied", "objectiveScore"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            "#,
        )
        .bind(id)
        .bind(&event.user_id)
        .bind(&event.session_id)
        .bind(&event.event_type)
        .bind(chrono::DateTime::from_timestamp_millis(event.timestamp).unwrap_or_else(Utc::now))
        .bind(event.latency_ms as i32)
        .bind(event.is_anomaly)
        .bind(&violations_json)
        .bind(&event.user_state)
        .bind(&event.strategy)
        .bind(&event.reward)
        .bind(&event.cold_start_phase)
        .bind(event.constraints_satisfied)
        .bind(event.objective_score)
        .execute(self.db_proxy.pool())
        .await?;

        Ok(())
    }
}
