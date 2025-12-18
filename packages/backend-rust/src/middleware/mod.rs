#![allow(dead_code)]

use axum::body::Body;
use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::db::state_machine::DatabaseState;
use crate::state::AppState;

pub mod auth;
pub mod csrf;
pub mod rate_limit;

#[derive(Debug, Clone, Copy)]
pub struct RequestDbState(pub DatabaseState);

pub async fn capture_request_db_state(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let selected = match state.db_proxy() {
        Some(_) => {
            let db_state = state.db_state();
            let guard = db_state.read().await;
            guard.state()
        }
        None => DatabaseState::Normal,
    };

    req.extensions_mut().insert(RequestDbState(selected));
    next.run(req).await
}
