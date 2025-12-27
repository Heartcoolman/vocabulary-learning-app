use std::sync::Arc;
use std::net::SocketAddr;

use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

use danci_backend_rust::config::Config;
use danci_backend_rust::db;
use danci_backend_rust::state::AppState;
use danci_backend_rust::workers::WorkerManager;
use danci_backend_rust::routes;
use danci_backend_rust::services::quality_service;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let config = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_new(&config.log_level).unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let db_proxy = match db::DatabaseProxy::from_env().await {
        Ok(proxy) => Some(proxy),
        Err(err) => {
            tracing::warn!(error = %err, "database proxy not initialized");
            None
        }
    };

    if let Some(ref proxy) = db_proxy {
        quality_service::cleanup_stale_tasks(proxy).await;
    }

    let amas_engine = AppState::create_amas_engine(db_proxy.clone());

    let worker_manager = if let Some(ref proxy) = db_proxy {
        match WorkerManager::new(Arc::clone(proxy), Arc::clone(&amas_engine)).await {
            Ok(manager) => {
                if let Err(e) = manager.start().await {
                    tracing::error!(error = %e, "failed to start workers");
                }
                Some(Arc::new(manager))
            }
            Err(e) => {
                tracing::warn!(error = %e, "worker manager not initialized");
                None
            }
        }
    } else {
        None
    };

    let state = AppState::new(db_proxy, amas_engine);

    let app = routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    let addr = config.bind_addr();
    tracing::info!(%addr, "backend-rust listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind listener failed");

    let server = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal());

    if let Err(e) = server.await {
        tracing::error!(error = %e, "server error");
    }

    tracing::info!("HTTP server stopped, initiating graceful shutdown sequence");

    if let Some(ref manager) = worker_manager {
        manager.stop().await;
    }

    tracing::info!("Graceful shutdown complete");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        sigterm.recv().await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
