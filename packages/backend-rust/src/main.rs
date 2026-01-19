use std::net::SocketAddr;
use std::sync::Arc;

use http::{header, Method};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use danci_backend_rust::cache::RedisCache;
use danci_backend_rust::config::Config;
use danci_backend_rust::db;
use danci_backend_rust::logging;
use danci_backend_rust::routes;
use danci_backend_rust::services::quality_service;
use danci_backend_rust::state::AppState;
use danci_backend_rust::workers::WorkerManager;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let config = Config::from_env();

    let _file_log_guard = logging::init_tracing(&config.log_level);

    let db_proxy = match db::DatabaseProxy::from_env().await {
        Ok(proxy) => Some(proxy),
        Err(err) => {
            tracing::warn!(error = %err, "database proxy not initialized");
            None
        }
    };

    if let Some(ref proxy) = db_proxy {
        quality_service::cleanup_stale_tasks(proxy).await;
        if let Err(err) =
            danci_backend_rust::amas::metrics_persistence::restore_registry_from_db(proxy.as_ref())
                .await
        {
            tracing::warn!(error = %err, "failed to restore algorithm metrics");
        }
        danci_backend_rust::seed::seed_test_users(proxy.as_ref()).await;
    }

    let cache = match std::env::var("REDIS_URL") {
        Ok(redis_url) => match RedisCache::connect(&redis_url).await {
            Ok(c) => {
                tracing::info!("Redis cache connected");
                Some(Arc::new(c))
            }
            Err(err) => {
                tracing::warn!(error = %err, "Redis cache not initialized");
                None
            }
        },
        Err(_) => None,
    };

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

    let state = AppState::new(db_proxy, amas_engine, cache);

    let cors = match std::env::var("CORS_ORIGIN") {
        Ok(origin) if !origin.is_empty() => {
            tracing::info!(origin = %origin, "CORS configured with specific origin");
            CorsLayer::new()
                .allow_origin(
                    origin
                        .parse::<header::HeaderValue>()
                        .expect("invalid CORS_ORIGIN"),
                )
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::ACCEPT])
                .allow_credentials(true)
        }
        _ => {
            tracing::info!("CORS configured as permissive");
            CorsLayer::permissive()
        }
    };

    let app = routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = config.bind_addr();
    tracing::info!(%addr, "backend-rust listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind listener failed");

    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
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
        let mut sigterm =
            signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        sigterm.recv().await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
