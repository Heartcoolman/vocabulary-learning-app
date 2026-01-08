use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, OnceLock};

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{header::RETRY_AFTER, HeaderName, HeaderValue, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use tokio::sync::Mutex;

use crate::response::json_error;

const RATE_LIMIT_LIMIT: HeaderName = HeaderName::from_static("ratelimit-limit");
const RATE_LIMIT_REMAINING: HeaderName = HeaderName::from_static("ratelimit-remaining");
const RATE_LIMIT_RESET: HeaderName = HeaderName::from_static("ratelimit-reset");

const DEFAULT_API_WINDOW_MS: u64 = 900_000; // 15 分钟
const DEFAULT_API_MAX: u64 = 500;

const AUTH_WINDOW_MS: u64 = 5 * 60 * 1000;
const AUTH_MAX: u64 = 30;

static API_LIMITER: OnceLock<Arc<RateLimiter>> = OnceLock::new();
static AUTH_LIMITER: OnceLock<Arc<RateLimiter>> = OnceLock::new();

pub async fn api_rate_limit_middleware(req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path();
    if !matches_api_prefix(path) || should_skip_api_rate_limit(&req) {
        return next.run(req).await;
    }

    let limiter = API_LIMITER.get_or_init(|| Arc::new(RateLimiter::new(api_config())));
    enforce_rate_limit(
        limiter,
        Scope::Api,
        req,
        next,
        StatusCode::TOO_MANY_REQUESTS,
        "TOO_MANY_REQUESTS",
        "请求过于频繁，请稍后再试",
    )
    .await
}

pub async fn auth_rate_limit_middleware(req: Request<Body>, next: Next) -> Response {
    if is_test_env() || is_loopback_request(&req) {
        return next.run(req).await;
    }

    let path = req.uri().path();
    if !path.starts_with("/api/auth") {
        return next.run(req).await;
    }

    let limiter = AUTH_LIMITER.get_or_init(|| {
        Arc::new(RateLimiter::new(RateLimitConfig {
            window_ms: AUTH_WINDOW_MS,
            max: AUTH_MAX,
        }))
    });
    enforce_rate_limit(
        limiter,
        Scope::Auth,
        req,
        next,
        StatusCode::TOO_MANY_REQUESTS,
        "TOO_MANY_AUTH_REQUESTS",
        "认证请求过于频繁，请稍后再试",
    )
    .await
}

async fn enforce_rate_limit(
    limiter: &Arc<RateLimiter>,
    scope: Scope,
    req: Request<Body>,
    next: Next,
    status: StatusCode,
    code: &'static str,
    message: &'static str,
) -> Response {
    let ip = extract_client_ip(&req).unwrap_or(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)));
    let check = limiter.check(Key { scope, ip }).await;

    if !check.allowed {
        let mut res = json_error(status, code, message).into_response();
        apply_rate_limit_headers(&mut res, check);
        return res;
    }

    let mut res = next.run(req).await;
    apply_rate_limit_headers(&mut res, check);
    res
}

fn apply_rate_limit_headers(res: &mut Response, check: RateLimitCheck) {
    if let Ok(value) = HeaderValue::from_str(&check.limit.to_string()) {
        res.headers_mut().insert(RATE_LIMIT_LIMIT, value);
    }
    if let Ok(value) = HeaderValue::from_str(&check.remaining.to_string()) {
        res.headers_mut().insert(RATE_LIMIT_REMAINING, value);
    }
    if let Ok(value) = HeaderValue::from_str(&check.reset_after_seconds.to_string()) {
        res.headers_mut().insert(RATE_LIMIT_RESET, value.clone());
        if check.remaining == 0 {
            res.headers_mut().insert(RETRY_AFTER, value);
        }
    }
}

fn matches_api_prefix(path: &str) -> bool {
    path == "/api" || path.starts_with("/api/")
}

fn should_skip_api_rate_limit(req: &Request<Body>) -> bool {
    if is_test_env() || is_loopback_request(req) {
        return true;
    }

    let path = req.uri().path();
    path.starts_with("/api/v1/realtime/")
}

fn api_config() -> RateLimitConfig {
    RateLimitConfig {
        window_ms: env_u64("RATE_LIMIT_WINDOW_MS").unwrap_or(DEFAULT_API_WINDOW_MS),
        max: env_u64("RATE_LIMIT_MAX").unwrap_or(DEFAULT_API_MAX),
    }
}

fn env_u64(key: &str) -> Option<u64> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse::<u64>().ok()
}

fn is_test_env() -> bool {
    matches!(std::env::var("NODE_ENV").ok().as_deref(), Some("test"))
}

fn is_loopback_request(req: &Request<Body>) -> bool {
    extract_client_ip(req)
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Scope {
    Api,
    Auth,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Key {
    scope: Scope,
    ip: IpAddr,
}

#[derive(Debug, Clone, Copy)]
struct RateLimitConfig {
    window_ms: u64,
    max: u64,
}

#[derive(Debug)]
struct RateLimiterState {
    entries: HashMap<Key, Entry>,
    last_cleanup_ms: u64,
}

#[derive(Debug, Clone, Copy)]
struct Entry {
    window_start_ms: u64,
    hits: u64,
}

#[derive(Debug, Clone, Copy)]
struct RateLimitCheck {
    allowed: bool,
    limit: u64,
    remaining: u64,
    reset_after_seconds: u64,
}

#[derive(Debug)]
struct RateLimiter {
    config: RateLimitConfig,
    state: Mutex<RateLimiterState>,
}

impl RateLimiter {
    fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            state: Mutex::new(RateLimiterState {
                entries: HashMap::new(),
                last_cleanup_ms: now_ms(),
            }),
        }
    }

    async fn check(&self, key: Key) -> RateLimitCheck {
        let now_ms = now_ms();
        let mut state = self.state.lock().await;

        if now_ms.saturating_sub(state.last_cleanup_ms) >= self.config.window_ms {
            let window_ms = self.config.window_ms;
            state
                .entries
                .retain(|_, entry| now_ms.saturating_sub(entry.window_start_ms) < window_ms);
            state.last_cleanup_ms = now_ms;
        }

        let entry = state.entries.entry(key).or_insert_with(|| Entry {
            window_start_ms: now_ms,
            hits: 0,
        });

        if now_ms.saturating_sub(entry.window_start_ms) >= self.config.window_ms {
            entry.window_start_ms = now_ms;
            entry.hits = 0;
        }

        entry.hits = entry.hits.saturating_add(1);
        let allowed = entry.hits <= self.config.max;
        let remaining = self
            .config
            .max
            .saturating_sub(entry.hits)
            .min(self.config.max);
        let reset_after_ms = self
            .config
            .window_ms
            .saturating_sub(now_ms.saturating_sub(entry.window_start_ms));
        let reset_after_seconds = (reset_after_ms + 999) / 1000;

        RateLimitCheck {
            allowed,
            limit: self.config.max,
            remaining: if allowed { remaining } else { 0 },
            reset_after_seconds,
        }
    }
}

fn now_ms() -> u64 {
    chrono::Utc::now().timestamp_millis().max(0) as u64
}

fn extract_client_ip(req: &Request<Body>) -> Option<IpAddr> {
    if trust_proxy_enabled() {
        if let Some(ip) = extract_x_forwarded_for(req) {
            return Some(ip);
        }
    }

    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(addr)| addr.ip())
}

fn trust_proxy_enabled() -> bool {
    let value = std::env::var("TRUST_PROXY").ok();
    let Some(value) = value else { return false };
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    !matches!(normalized.as_str(), "0" | "false")
}

fn extract_x_forwarded_for(req: &Request<Body>) -> Option<IpAddr> {
    let raw = req
        .headers()
        .get(HeaderName::from_static("x-forwarded-for"))?
        .to_str()
        .ok()?;
    let first = raw.split(',').next()?.trim();
    first.parse::<IpAddr>().ok()
}
