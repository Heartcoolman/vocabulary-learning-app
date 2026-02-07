use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::response::json_error;
use crate::state::AppState;

fn desktop_local_user() -> crate::auth::AuthUser {
    crate::auth::AuthUser {
        id: "1".to_string(),
        email: "local@localhost".to_string(),
        username: "local_user".to_string(),
        role: "USER".to_string(),
        created_at: 0,
        updated_at: 0,
    }
}

pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    if state.config().desktop_mode {
        req.extensions_mut().insert(desktop_local_user());
        return next.run(req).await;
    }

    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "数据库服务不可用",
        )
        .into_response();
    };

    let cache = state.cache();
    match crate::auth::verify_request_token_cached(proxy.as_ref(), &token, cache.as_deref()).await {
        Ok(user) => {
            req.extensions_mut().insert(user);
            next.run(req).await
        }
        Err(_err) => json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "认证失败，请重新登录",
        )
        .into_response(),
    }
}

pub async fn optional_auth(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    if state.config().desktop_mode {
        req.extensions_mut().insert(desktop_local_user());
        return next.run(req).await;
    }

    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return next.run(req).await;
    };

    let Some(proxy) = state.db_proxy() else {
        return next.run(req).await;
    };

    let cache = state.cache();
    if let Ok(user) =
        crate::auth::verify_request_token_cached(proxy.as_ref(), &token, cache.as_deref()).await
    {
        req.extensions_mut().insert(user);
    }

    next.run(req).await
}
