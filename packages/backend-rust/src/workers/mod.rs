#![allow(dead_code)]

mod algorithm_metrics;
mod amas_aggregation;
mod amas_health_analyzer;
pub mod clustering;
pub mod confusion_cache;
mod delayed_reward;
mod embedding_worker;
mod etymology;
mod forgetting_alert;
mod llm_advisor;
mod log_export;
mod optimization;
mod session_cleanup;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::{broadcast, Mutex};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info, warn};

use crate::amas::AMASEngine;
use crate::db::DatabaseProxy;
use crate::logging;

static WORKER_LEADER: AtomicBool = AtomicBool::new(false);

pub fn is_worker_leader() -> bool {
    WORKER_LEADER.load(Ordering::Relaxed)
}

fn set_worker_leader(val: bool) {
    WORKER_LEADER.store(val, Ordering::Relaxed);
}

pub struct WorkerManager {
    scheduler: Mutex<JobScheduler>,
    shutdown_tx: broadcast::Sender<()>,
    db_proxy: Arc<DatabaseProxy>,
    amas_engine: Arc<AMASEngine>,
}

impl WorkerManager {
    pub async fn new(
        db_proxy: Arc<DatabaseProxy>,
        amas_engine: Arc<AMASEngine>,
    ) -> Result<Self, WorkerError> {
        let scheduler = JobScheduler::new().await.map_err(WorkerError::Scheduler)?;
        let (shutdown_tx, _) = broadcast::channel(1);
        Ok(Self {
            scheduler: Mutex::new(scheduler),
            shutdown_tx,
            db_proxy,
            amas_engine,
        })
    }

    pub async fn start(&self) -> Result<(), WorkerError> {
        // 桌面模式下跳过所有网络依赖 Worker
        if crate::db::sqlite_primary::DbMode::detect() == crate::db::sqlite_primary::DbMode::DesktopSqlite {
            info!("Desktop mode detected, skipping all workers");
            return Ok(());
        }

        let leader = std::env::var("WORKER_LEADER")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if !leader {
            info!("WORKER_LEADER not set, skipping worker startup");
            return Ok(());
        }

        set_worker_leader(true);
        info!("Starting workers (leader mode)");

        let enable_delayed_reward = std::env::var("ENABLE_DELAYED_REWARD_WORKER")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        let enable_optimization = std::env::var("ENABLE_OPTIMIZATION_WORKER")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        let enable_llm_advisor = std::env::var("ENABLE_LLM_ADVISOR_WORKER")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        let enable_forgetting_alert = std::env::var("ENABLE_FORGETTING_ALERT_WORKER")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        let enable_etymology = std::env::var("ENABLE_ETYMOLOGY_WORKER")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        let scheduler = self.scheduler.lock().await;

        if enable_delayed_reward {
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async("0 * * * * *", move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = delayed_reward::process_pending_rewards(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Delayed reward worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!("Delayed reward worker scheduled (every minute)");
        }

        if enable_optimization {
            let schedule = std::env::var("OPTIMIZATION_SCHEDULE")
                .unwrap_or_else(|_| "0 0 3 * * *".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = optimization::run_optimization_cycle(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Optimization worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Optimization worker scheduled");
        }

        if enable_llm_advisor {
            let schedule =
                std::env::var("LLM_ADVISOR_SCHEDULE").unwrap_or_else(|_| "0 0 4 * * 0".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = llm_advisor::run_weekly_analysis(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "LLM advisor worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "LLM advisor worker scheduled");
        }

        if enable_forgetting_alert {
            let schedule = std::env::var("FORGETTING_ALERT_SCHEDULE")
                .unwrap_or_else(|_| "0 0 2 * * *".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = forgetting_alert::scan_forgetting_risks(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Forgetting alert worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Forgetting alert worker scheduled");
        }

        if enable_etymology {
            let schedule =
                std::env::var("ETYMOLOGY_SCHEDULE").unwrap_or_else(|_| "0 30 3 * * *".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = etymology::run_etymology_analysis(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Etymology worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Etymology worker scheduled");
        }

        // AMAS cache cleanup - runs every 10 minutes
        {
            let amas = Arc::clone(&self.amas_engine);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let max_age_ms = std::env::var("AMAS_CACHE_MAX_AGE_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30 * 60 * 1000); // 30 minutes default
            let job = Job::new_async("0 */10 * * * *", move |_uuid, _lock| {
                let amas = Arc::clone(&amas);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        _ = async {
                            let cleaned = amas.cleanup_stale_users(max_age_ms).await;
                            if cleaned > 0 {
                                let (states, models) = amas.get_cache_stats().await;
                                info!(cleaned = cleaned, states = states, models = models, "AMAS cache cleanup");
                            }
                        } => {}
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!("AMAS cache cleanup worker scheduled (every 10 minutes)");
        }

        // AMAS monitoring aggregation - runs every 15 minutes
        let enable_amas_monitoring = std::env::var("ENABLE_AMAS_MONITORING_WORKER")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        if enable_amas_monitoring {
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async("0 */15 * * * *", move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = amas_aggregation::aggregate_15min(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "AMAS 15min aggregation error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!("AMAS monitoring 15min aggregation worker scheduled");
        }

        // AMAS daily aggregation - runs at 01:00 daily
        if enable_amas_monitoring {
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async("0 0 1 * * *", move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = amas_aggregation::aggregate_daily(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "AMAS daily aggregation error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!("AMAS monitoring daily aggregation worker scheduled");
        }

        // AMAS weekly health analysis - runs Monday 05:00
        let enable_health_analyzer = std::env::var("ENABLE_AMAS_HEALTH_ANALYZER_WORKER")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        if enable_health_analyzer {
            let schedule = std::env::var("AMAS_HEALTH_ANALYZER_SCHEDULE")
                .unwrap_or_else(|_| "0 0 5 * * 1".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = amas_health_analyzer::run_weekly_health_analysis(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "AMAS health analyzer error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "AMAS health analyzer worker scheduled");
        }

        // System log export - runs hourly when file logging is enabled
        if logging::file_logging_enabled() {
            let schedule =
                std::env::var("LOG_EXPORT_SCHEDULE").unwrap_or_else(|_| "0 0 * * * *".to_string());
            let export_dir =
                std::env::var("LOG_EXPORT_DIR").unwrap_or_else(|_| "./logs/exports".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let export_dir = export_dir.clone();
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = log_export::export_system_logs(db, &export_dir) => {
                            if let Err(e) = result {
                                error!(error = %e, "Log export error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Log export worker scheduled");
        }

        // Algorithm metrics persistence - runs every 5 minutes
        {
            let db = Arc::clone(&self.db_proxy);
            let persistor = Arc::new(Mutex::new(
                crate::amas::metrics_persistence::AlgorithmMetricsPersistor::new(),
            ));
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async("0 */5 * * * *", move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let persistor = Arc::clone(&persistor);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        _ = algorithm_metrics::flush_metrics(db, persistor) => {}
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!("Algorithm metrics persistence worker scheduled (every 5 minutes)");
        }

        // Embedding worker - runs every 5 minutes by default
        let enable_embedding = std::env::var("ENABLE_EMBEDDING_WORKER")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if enable_embedding {
            let schedule =
                std::env::var("EMBEDDING_SCHEDULE").unwrap_or_else(|_| "0 */5 * * * *".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = embedding_worker::process_pending_embeddings(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Embedding worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Embedding worker scheduled");
        }

        // Word clustering - runs weekly (Sunday 4AM by default)
        let enable_clustering = std::env::var("ENABLE_CLUSTERING_WORKER")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if enable_clustering {
            let schedule =
                std::env::var("CLUSTERING_SCHEDULE").unwrap_or_else(|_| "0 0 4 * * 0".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = clustering::run_clustering_cycle(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Clustering worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Clustering worker scheduled");
        }

        // Confusion cache rebuild - runs after clustering (Sunday 5AM by default)
        let enable_confusion_cache = std::env::var("ENABLE_CONFUSION_CACHE_WORKER")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if enable_confusion_cache {
            let schedule = std::env::var("CONFUSION_CACHE_SCHEDULE")
                .unwrap_or_else(|_| "0 0 5 * * 0".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = confusion_cache::rebuild_confusion_cache(db) => {
                            if let Err(e) = result {
                                error!(error = %e, "Confusion cache worker error");
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Confusion cache worker scheduled");
        }

        // Weekly report auto-generation - runs Monday 06:00 by default
        let enable_weekly_report = std::env::var("ENABLE_WEEKLY_REPORT_WORKER")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if enable_weekly_report {
            let schedule = std::env::var("WEEKLY_REPORT_SCHEDULE")
                .unwrap_or_else(|_| "0 0 6 * * 1".to_string());
            let db = Arc::clone(&self.db_proxy);
            let shutdown_rx = self.shutdown_tx.subscribe();
            let job = Job::new_async(&schedule, move |_uuid, _lock| {
                let db = Arc::clone(&db);
                let mut rx = shutdown_rx.resubscribe();
                Box::pin(async move {
                    tokio::select! {
                        _ = rx.recv() => {},
                        result = crate::services::weekly_report::generate_report(&db) => {
                            match result {
                                Ok(report) => info!(report_id = %report.id, "Weekly report generated"),
                                Err(e) => error!(error = %e, "Weekly report generation error"),
                            }
                        }
                    }
                })
            })
            .map_err(WorkerError::Scheduler)?;
            scheduler.add(job).await.map_err(WorkerError::Scheduler)?;
            info!(schedule = %schedule, "Weekly report worker scheduled");
        }

        scheduler.start().await.map_err(WorkerError::Scheduler)?;
        info!("All workers started");

        Ok(())
    }

    pub async fn stop(&self) {
        if !is_worker_leader() {
            return;
        }

        info!("Stopping workers...");
        let _ = self.shutdown_tx.send(());

        let mut scheduler = self.scheduler.lock().await;
        if let Err(e) = scheduler.shutdown().await {
            warn!(error = %e, "Error shutting down scheduler");
        }

        set_worker_leader(false);
        info!("Workers stopped");
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WorkerError {
    #[error("Scheduler error: {0}")]
    Scheduler(#[from] tokio_cron_scheduler::JobSchedulerError),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("{0}")]
    Custom(String),
}
