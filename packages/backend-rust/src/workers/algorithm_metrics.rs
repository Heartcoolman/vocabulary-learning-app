use std::sync::Arc;

use tokio::sync::Mutex;
use tracing::error;

use crate::amas::metrics_persistence::AlgorithmMetricsPersistor;
use crate::db::DatabaseProxy;

pub async fn flush_metrics(
    db: Arc<DatabaseProxy>,
    persistor: Arc<Mutex<AlgorithmMetricsPersistor>>,
) {
    let mut guard = persistor.lock().await;
    if let Err(e) = guard.flush(db.as_ref()).await {
        error!(error = %e, "Algorithm metrics persistence error");
    }
}
