#![allow(dead_code)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::type_complexity)]
#![allow(clippy::result_large_err)]

pub mod amas;
pub mod auth;
pub mod cache;
pub mod config;
pub mod db;
pub mod logging;
pub mod middleware;
pub mod response;
pub mod routes;
pub mod seed;
pub mod services;
pub mod state;
pub mod workers;

use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::state::AppState;

pub async fn create_app() -> axum::Router {
    let db_proxy = (db::DatabaseProxy::from_env().await).ok();

    if let Some(ref proxy) = db_proxy {
        let _ = amas::metrics_persistence::restore_registry_from_db(proxy.as_ref()).await;
    }

    let amas_engine = AppState::create_amas_engine(db_proxy.clone());
    if let Err(err) = amas_engine.reload_config().await {
        tracing::warn!(error = %err, "failed to reload AMAS config");
    }
    let state = AppState::new(db_proxy, amas_engine, None);

    routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
}
