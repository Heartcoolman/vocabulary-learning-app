#![allow(dead_code)]

mod delayed_reward;
mod forgetting_alert;
mod llm_advisor;
mod optimization;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::{broadcast, Mutex};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info, warn};

use crate::amas::AMASEngine;
use crate::db::DatabaseProxy;

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
    pub async fn new(db_proxy: Arc<DatabaseProxy>, amas_engine: Arc<AMASEngine>) -> Result<Self, WorkerError> {
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
            let schedule = std::env::var("LLM_ADVISOR_SCHEDULE")
                .unwrap_or_else(|_| "0 0 4 * * 0".to_string());
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
}
