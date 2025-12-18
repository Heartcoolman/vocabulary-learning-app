pub mod amas;
pub mod config;
pub mod core;
pub mod db;
pub mod auth;
pub mod middleware;
pub mod response;
pub mod routes;
pub mod services;
pub mod state;
pub mod workers;

use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::db::state_machine::{DatabaseState, DatabaseStateMachine};
use crate::state::AppState;

pub async fn create_app() -> axum::Router {
    let db_state = Arc::new(RwLock::new(DatabaseStateMachine::new(DatabaseState::Normal)));

    let db_proxy = match db::DatabaseProxy::from_env(Arc::clone(&db_state)).await {
        Ok(proxy) => Some(proxy),
        Err(_) => None,
    };

    let state = AppState::new(db_state, db_proxy);

    routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
}
