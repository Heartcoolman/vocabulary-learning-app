use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::db::state_machine::DatabaseState;
use crate::middleware::RequestDbState;
use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

pub async fn get_statistics(
    State(state): State<AppState>,
    request_state: Option<axum::extract::Extension<RequestDbState>>,
) -> Response {
    let db_state = request_state
        .map(|axum::extract::Extension(v)| v.0)
        .unwrap_or(DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    match crate::services::admin::get_system_statistics(proxy.as_ref(), db_state).await {
        Ok(data) => Json(SuccessResponse { success: true, data }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "admin statistics query failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}
