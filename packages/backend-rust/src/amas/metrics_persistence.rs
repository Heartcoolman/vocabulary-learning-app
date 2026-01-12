use std::collections::HashMap;

use chrono::{DateTime, Utc};
use tracing::info;

use crate::amas::metrics::{registry, AlgorithmId, AlgorithmMetricsSnapshot};
use crate::db::operations::algorithm_metrics::{list_algorithm_metrics_daily, upsert_algorithm_metrics_daily};
use crate::db::DatabaseProxy;

#[derive(Debug)]
pub struct AlgorithmMetricsPersistor {
    last_snapshot: HashMap<AlgorithmId, AlgorithmMetricsSnapshot>,
}

impl Default for AlgorithmMetricsPersistor {
    fn default() -> Self {
        Self::new()
    }
}

impl AlgorithmMetricsPersistor {
    pub fn new() -> Self {
        let mut last_snapshot = HashMap::new();
        for id in AlgorithmId::all() {
            if let Some(metrics) = registry().get(*id) {
                last_snapshot.insert(*id, metrics.snapshot());
            }
        }
        Self { last_snapshot }
    }

    pub async fn flush(&mut self, proxy: &DatabaseProxy) -> Result<(), sqlx::Error> {
        let today = Utc::now().date_naive();
        for id in AlgorithmId::all() {
            let Some(metrics) = registry().get(*id) else {
                continue;
            };
            let current = metrics.snapshot();
            let last = self.last_snapshot.get(id).copied().unwrap_or_default();

            let call_count_delta = current.call_count.saturating_sub(last.call_count);
            let total_latency_delta = current.total_latency_us.saturating_sub(last.total_latency_us);
            let error_count_delta = current.error_count.saturating_sub(last.error_count);

            if call_count_delta == 0 && total_latency_delta == 0 && error_count_delta == 0 {
                self.last_snapshot.insert(*id, current);
                continue;
            }

            let last_called_at = current
                .last_called_at
                .and_then(|ts| DateTime::from_timestamp_millis(ts as i64));

            upsert_algorithm_metrics_daily(
                proxy,
                today,
                id.id(),
                call_count_delta,
                total_latency_delta,
                error_count_delta,
                last_called_at,
            )
            .await?;

            self.last_snapshot.insert(*id, current);
        }

        Ok(())
    }
}

pub async fn restore_registry_from_db(proxy: &DatabaseProxy) -> Result<(), sqlx::Error> {
    let today = Utc::now().date_naive();
    let rows = list_algorithm_metrics_daily(proxy, today, today, None).await?;

    let mut restored = 0;
    for row in rows {
        if let Ok(id) = row.algorithm_id.parse::<AlgorithmId>() {
            if let Some(metrics) = registry().get(id) {
                let snapshot = AlgorithmMetricsSnapshot {
                    call_count: row.call_count.max(0) as u64,
                    total_latency_us: row.total_latency_us.max(0) as u64,
                    error_count: row.error_count.max(0) as u64,
                    last_called_at: row.last_called_at.map(|dt| dt.timestamp_millis() as u64),
                };
                metrics.apply_snapshot(snapshot);
                restored += 1;
            }
        }
    }

    if restored > 0 {
        info!(count = restored, "Restored algorithm metrics from database");
    }

    Ok(())
}
