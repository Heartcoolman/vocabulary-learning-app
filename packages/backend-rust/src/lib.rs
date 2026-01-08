#![allow(dead_code)]

pub mod amas;
pub mod auth;
pub mod cache;
pub mod config;
pub mod core;
pub mod db;
pub mod middleware;
pub mod response;
pub mod routes;
pub mod services;
pub mod state;
pub mod workers;

use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::state::AppState;

pub async fn create_app() -> axum::Router {
    let db_proxy = match db::DatabaseProxy::from_env().await {
        Ok(proxy) => Some(proxy),
        Err(_) => None,
    };

    let amas_engine = AppState::create_amas_engine(db_proxy.clone());
    let state = AppState::new(db_proxy, amas_engine, None);

    routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
}
