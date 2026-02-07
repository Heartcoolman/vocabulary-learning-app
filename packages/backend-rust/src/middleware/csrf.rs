use axum::body::Body;
use axum::http::{header, HeaderMap, HeaderValue, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::response::json_error;

const CSRF_COOKIE_NAME: &str = "csrf_token";
const CSRF_HEADER_NAME: &str = "x-csrf-token";

pub async fn csrf_token_middleware(req: Request<Body>, next: Next) -> Response {
    let has_token = get_cookie(req.headers(), CSRF_COOKIE_NAME).is_some();
    let mut response = next.run(req).await;

    if has_token {
        return response;
    }

    let token = generate_csrf_token();
    if let Ok(header_value) = HeaderValue::from_str(&build_csrf_cookie_header(&token)) {
        response
            .headers_mut()
            .append(header::SET_COOKIE, header_value);
    }

    response
}

pub async fn csrf_validation_middleware(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if state.config().desktop_mode {
        return next.run(req).await;
    }

    let method = req.method().as_str();
    let should_validate = matches!(method, "POST" | "PUT" | "DELETE" | "PATCH");
    if !should_validate {
        return next.run(req).await;
    }

    let path = req.uri().path();
    if !path.starts_with("/api") {
        return next.run(req).await;
    }

    if is_exempt_path(path) {
        return next.run(req).await;
    }

    let cookie_token = get_cookie(req.headers(), CSRF_COOKIE_NAME);
    let header_token = req
        .headers()
        .get(CSRF_HEADER_NAME)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let Some(cookie_token) = cookie_token else {
        return json_error(
            StatusCode::FORBIDDEN,
            "CSRF_TOKEN_MISSING",
            "CSRF token 验证失败",
        )
        .into_response();
    };
    let Some(header_token) = header_token else {
        return json_error(
            StatusCode::FORBIDDEN,
            "CSRF_TOKEN_MISSING",
            "CSRF token 验证失败",
        )
        .into_response();
    };

    if !secure_eq(cookie_token.as_bytes(), header_token.as_bytes()) {
        return json_error(
            StatusCode::FORBIDDEN,
            "CSRF_TOKEN_MISMATCH",
            "CSRF token 验证失败",
        )
        .into_response();
    }

    next.run(req).await
}

fn generate_csrf_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn build_csrf_cookie_header(token: &str) -> String {
    let is_production = matches!(
        std::env::var("NODE_ENV").ok().as_deref(),
        Some("production")
    );
    let mut parts = Vec::with_capacity(6);

    parts.push(format!("{CSRF_COOKIE_NAME}={token}"));
    parts.push("Path=/".to_string());
    parts.push("Max-Age=86400".to_string());

    // 开发环境使用 Lax 以支持代理场景，生产环境使用 Strict
    if is_production {
        parts.push("SameSite=Strict".to_string());
        parts.push("Secure".to_string());
    } else {
        parts.push("SameSite=Lax".to_string());
    }

    parts.join("; ")
}

fn is_exempt_path(path: &str) -> bool {
    let healthcheck = std::env::var("HEALTHCHECK_ENDPOINT").ok();

    let mut exempt = vec![
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/api/auth/password/request",
        "/api/auth/password/reset",
        // Admin auth endpoints
        "/api/admin/auth/login",
        "/api/admin/auth/logout",
        // These endpoints are called via `navigator.sendBeacon` (no custom headers),
        // so CSRF header validation cannot be satisfied.
        "/api/habit-profile/end-session",
        "/api/tracking/events",
        // Frontend logging endpoint (batch logs via fetch without custom headers)
        "/api/logs",
        // About/simulation endpoints for development
        "/api/about/simulate",
        "/auth/login",
        "/auth/register",
        "/auth/refresh",
        "/health",
        "/metrics",
    ];

    if let Some(value) = healthcheck.as_deref() {
        if !value.is_empty() {
            exempt.push(value);
        }
    }

    exempt.into_iter().any(|prefix| path.starts_with(prefix))
}

fn get_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let trimmed = part.trim();
        let (key, value) = trimmed.split_once('=')?;
        if key == name {
            return Some(value.to_string());
        }
    }
    None
}

fn secure_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in a.iter().zip(b.iter()) {
        diff |= left ^ right;
    }
    diff == 0
}
