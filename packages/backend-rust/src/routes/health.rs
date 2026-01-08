use axum::body::Body;
use axum::extract::State;
use axum::http::header;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(root))
        .route("/info", get(info))
        .route("/live", get(live))
        .route("/ready", get(ready))
        .route("/metrics", get(metrics))
        .route("/metrics/prometheus", get(metrics_prometheus))
        .route("/database", get(database))
}

async fn root(State(state): State<AppState>) -> Response {
    let db_status = database_check(&state).await;
    let ok = matches!(db_status, DbCheckStatus::Connected { .. });

    let response = CompatHealthResponse {
        database: if ok { "connected" } else { "disconnected" },
        timestamp: now_iso(),
        status: if ok { "ok" } else { "degraded" },
    };

    let status_code = if ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status_code, Json(response)).into_response()
}

async fn info(State(state): State<AppState>) -> Response {
    let response = HealthInfoResponse {
        service: "danci-backend",
        version: std::env::var("APP_VERSION")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
        environment: std::env::var("NODE_ENV")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "development".to_string()),
        node_version: std::env::var("NODE_VERSION")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
        start_time: system_time_iso(state.started_at_system()),
        uptime: state.uptime_seconds(),
    };

    Json(response).into_response()
}

async fn live(State(state): State<AppState>) -> Response {
    let process_healthy = std::process::id() > 0;
    let memory_healthy = check_memory_health(0.9);

    let status = if process_healthy && memory_healthy {
        "healthy"
    } else {
        "unhealthy"
    };

    let response = LivenessResponse {
        status,
        timestamp: now_iso(),
        uptime: state.uptime_seconds(),
        version: std::env::var("APP_VERSION")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
        checks: LivenessChecks {
            process: process_healthy,
            memory: memory_healthy,
        },
    };

    let status_code = if status == "healthy" {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (status_code, Json(response)).into_response()
}

async fn ready(State(state): State<AppState>) -> Response {
    let db_check = database_check(&state).await;
    let memory_healthy = check_memory_health(0.9);
    let memory_usage = read_memory_usage();
    let memory_limit = 1_400_000_000u64;

    let (database_status, database_latency_ms) = match db_check {
        DbCheckStatus::Connected { latency_ms } => ("connected", latency_ms),
        DbCheckStatus::Timeout => ("timeout", None),
        DbCheckStatus::Disconnected => ("disconnected", None),
    };

    let status = if database_status == "disconnected" {
        "unhealthy"
    } else if database_status == "timeout" || !memory_healthy {
        "degraded"
    } else {
        "healthy"
    };

    let response = ReadinessResponse {
        status,
        timestamp: now_iso(),
        uptime: state.uptime_seconds(),
        version: std::env::var("APP_VERSION")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
        checks: ReadinessChecks {
            database: database_status,
            memory: memory_healthy,
            disk_space: None,
        },
        details: Some(ReadinessDetails {
            database_latency: database_latency_ms,
            memory_usage: Some(memory_usage.heap_used),
            memory_limit: Some(memory_limit),
        }),
    };

    let status_code = match status {
        "healthy" | "degraded" => StatusCode::OK,
        _ => StatusCode::SERVICE_UNAVAILABLE,
    };

    (status_code, Json(response)).into_response()
}

async fn metrics(State(state): State<AppState>) -> Response {
    let hostname = read_hostname();
    let load_average = read_load_average();

    let db_check = database_check(&state).await;
    let db_connected = matches!(db_check, DbCheckStatus::Connected { .. });
    let db_latency = match db_check {
        DbCheckStatus::Connected { latency_ms } => latency_ms.unwrap_or(0) as f64,
        _ => 0.0,
    };

    let mut metrics_map = std::collections::HashMap::new();
    metrics_map.insert(
        "db_connected".to_string(),
        if db_connected { 1.0 } else { 0.0 },
    );
    metrics_map.insert("p95_latency_ms".to_string(), db_latency);
    metrics_map.insert("error_rate".to_string(), 0.0);
    metrics_map.insert("worker_healthy".to_string(), 1.0);

    let engine = crate::services::alert_engine::alert_engine();
    engine.evaluate(&metrics_map);

    let alert_service = crate::services::alerts::alert_monitoring_service();
    let active_alerts = alert_service.get_active_alerts();

    let response = MetricsResponse {
        timestamp: now_iso(),
        system: MetricsSystem {
            hostname,
            platform: std::env::consts::OS.to_string(),
            arch: normalize_arch(std::env::consts::ARCH).to_string(),
            node_version: std::env::var("NODE_VERSION")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .unwrap_or_else(|| "unknown".to_string()),
            uptime: read_os_uptime_seconds(),
            load_average: vec![load_average[0], load_average[1], load_average[2]],
            cpu_count: std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1),
        },
        process: MetricsProcess {
            pid: std::process::id(),
            uptime: state.uptime_seconds(),
            memory_usage: read_memory_usage(),
            cpu_usage: CpuUsage { user: 0, system: 0 },
        },
        http: MetricsHttp {
            total_requests: 0,
            error_requests5xx: 0,
            request_duration: MetricsHttpDuration {
                avg: 0.0,
                p50: 0.0,
                p95: 0.0,
                p99: 0.0,
                count: 0,
            },
        },
        database: MetricsDatabase {
            slow_query_total: 0,
        },
        alerts: MetricsAlerts {
            active_count: active_alerts.len() as u64,
            active: active_alerts
                .iter()
                .map(|a| AlertEntry {
                    rule_name: a.rule_name.clone(),
                    severity: format!("{:?}", a.severity).to_lowercase(),
                    triggered_at: a.triggered_at.clone(),
                })
                .collect(),
        },
    };

    Json(response).into_response()
}

async fn metrics_prometheus(State(state): State<AppState>) -> Response {
    let memory_usage = read_memory_usage();
    let load_average = read_load_average();
    let uptime_seconds = state.uptime_seconds() as f64;

    let mut lines: Vec<String> = Vec::new();

    add_metric(
        &mut lines,
        "process_uptime_seconds",
        "Process uptime in seconds",
        "gauge",
        uptime_seconds,
        None,
    );
    add_metric(
        &mut lines,
        "process_heap_bytes",
        "Process heap size in bytes",
        "gauge",
        memory_usage.heap_used as f64,
        None,
    );
    add_metric(
        &mut lines,
        "process_rss_bytes",
        "Process RSS in bytes",
        "gauge",
        memory_usage.rss as f64,
        None,
    );

    add_metric(
        &mut lines,
        "http_requests_total",
        "Total HTTP requests",
        "counter",
        0.0,
        None,
    );
    add_metric(
        &mut lines,
        "http_requests_5xx_total",
        "Total HTTP 5xx errors",
        "counter",
        0.0,
        None,
    );
    add_metric(
        &mut lines,
        "http_request_duration_p50_ms",
        "HTTP request duration P50",
        "gauge",
        0.0,
        None,
    );
    add_metric(
        &mut lines,
        "http_request_duration_p95_ms",
        "HTTP request duration P95",
        "gauge",
        0.0,
        None,
    );
    add_metric(
        &mut lines,
        "http_request_duration_p99_ms",
        "HTTP request duration P99",
        "gauge",
        0.0,
        None,
    );

    add_metric(
        &mut lines,
        "db_slow_queries_total",
        "Total slow database queries",
        "counter",
        0.0,
        None,
    );
    add_metric(
        &mut lines,
        "alerts_active_total",
        "Number of active alerts",
        "gauge",
        0.0,
        None,
    );

    add_metric(
        &mut lines,
        "system_load_1m",
        "System load average 1 minute",
        "gauge",
        load_average[0],
        None,
    );
    add_metric(
        &mut lines,
        "system_load_5m",
        "System load average 5 minutes",
        "gauge",
        load_average[1],
        None,
    );
    add_metric(
        &mut lines,
        "system_load_15m",
        "System load average 15 minutes",
        "gauge",
        load_average[2],
        None,
    );

    let body = lines.join("\n");
    let mut response = Response::new(Body::from(body));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
}

async fn database(State(state): State<AppState>) -> impl IntoResponse {
    let Some(proxy) = state.db_proxy() else {
        let response = DatabaseStatusResponse::Standalone(DatabaseStatusStandaloneResponse {
            mode: "standalone",
            state: "NORMAL",
            primary: PrimaryStatus {
                r#type: "postgresql",
                healthy: false,
                latency: None,
                consecutive_failures: None,
            },
            fallback: None,
            hot_standby_enabled: false,
        });
        return (StatusCode::OK, Json(response));
    };

    let primary = proxy.primary_status().await;
    let response = DatabaseStatusResponse::Standalone(DatabaseStatusStandaloneResponse {
        mode: "standalone",
        state: "NORMAL",
        primary: PrimaryStatus {
            r#type: "postgresql",
            healthy: primary.healthy,
            latency: primary.latency_ms,
            consecutive_failures: None,
        },
        fallback: None,
        hot_standby_enabled: false,
    });

    (StatusCode::OK, Json(response))
}

#[derive(Debug)]
enum DbCheckStatus {
    Connected { latency_ms: Option<u64> },
    Timeout,
    Disconnected,
}

async fn database_check(state: &AppState) -> DbCheckStatus {
    let Some(proxy) = state.db_proxy() else {
        return DbCheckStatus::Disconnected;
    };

    let primary = proxy.primary_status().await;
    if primary.healthy {
        return DbCheckStatus::Connected {
            latency_ms: primary.latency_ms,
        };
    }
    if primary.error.as_deref() == Some("timeout") {
        return DbCheckStatus::Timeout;
    }
    DbCheckStatus::Disconnected
}

fn system_time_iso(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Utc> = time.into();
    datetime.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn unix_ms_to_iso(ms: u64) -> String {
    system_time_iso(std::time::UNIX_EPOCH + std::time::Duration::from_millis(ms))
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn check_memory_health(threshold: f64) -> bool {
    let usage = read_memory_usage();
    if usage.rss == 0 {
        return true;
    }

    let heap_size_limit = 1_400_000_000f64;
    (usage.rss as f64) / heap_size_limit < threshold
}

fn read_memory_usage() -> MemoryUsage {
    let rss_bytes = read_proc_self_status_kb("VmRSS").unwrap_or(0) * 1024;

    MemoryUsage {
        rss: rss_bytes,
        heap_total: 0,
        heap_used: rss_bytes,
        external: 0,
        array_buffers: 0,
    }
}

fn read_proc_self_status_kb(prefix: &str) -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    for line in status.lines() {
        let trimmed = line.trim_start();
        if !trimmed.starts_with(prefix) {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let value: u64 = parts[1].parse().ok()?;
        return Some(value);
    }
    None
}

fn read_hostname() -> String {
    if let Ok(raw) = std::fs::read_to_string("/proc/sys/kernel/hostname") {
        let value = raw.trim().to_string();
        if !value.is_empty() {
            return value;
        }
    }

    std::env::var("HOSTNAME")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn read_os_uptime_seconds() -> u64 {
    let Ok(raw) = std::fs::read_to_string("/proc/uptime") else {
        return 0;
    };

    let Some(first) = raw.split_whitespace().next() else {
        return 0;
    };

    first
        .parse::<f64>()
        .ok()
        .map(|v| v.floor().max(0.0) as u64)
        .unwrap_or(0)
}

fn read_load_average() -> [f64; 3] {
    let Ok(raw) = std::fs::read_to_string("/proc/loadavg") else {
        return [0.0, 0.0, 0.0];
    };

    let mut iter = raw.split_whitespace();
    let one = iter
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    let five = iter
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    let fifteen = iter
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    [one, five, fifteen]
}

fn normalize_arch(value: &str) -> &str {
    match value {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

fn add_metric(
    lines: &mut Vec<String>,
    name: &str,
    help: &str,
    metric_type: &str,
    value: f64,
    labels: Option<&[(&str, &str)]>,
) {
    lines.push(format!("# HELP {name} {help}"));
    lines.push(format!("# TYPE {name} {metric_type}"));

    let label_str = labels.map(|pairs| {
        let inner = pairs
            .iter()
            .map(|(k, v)| format!("{k}=\"{v}\""))
            .collect::<Vec<_>>()
            .join(",");
        format!("{{{inner}}}")
    });

    match label_str {
        Some(labels) => lines.push(format!("{name}{labels} {value}")),
        None => lines.push(format!("{name} {value}")),
    };
}

#[derive(Serialize)]
#[serde(untagged)]
enum DatabaseStatusResponse {
    Standalone(DatabaseStatusStandaloneResponse),
    HotStandby(DatabaseStatusHotStandbyResponse),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseStatusStandaloneResponse {
    mode: &'static str,
    state: &'static str,
    primary: PrimaryStatus,
    fallback: Option<FallbackStatus>,
    #[serde(rename = "hotStandbyEnabled")]
    hot_standby_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseStatusHotStandbyResponse {
    mode: &'static str,
    state: String,
    primary: PrimaryStatus,
    fallback: FallbackStatus,
    metrics: MetricsStatus,
    #[serde(rename = "lastStateChange")]
    last_state_change: Option<String>,
    uptime: u64,
    #[serde(rename = "hotStandbyEnabled")]
    hot_standby_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrimaryStatus {
    #[serde(rename = "type")]
    r#type: &'static str,
    healthy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    consecutive_failures: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FallbackStatus {
    #[serde(rename = "type")]
    r#type: &'static str,
    healthy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency: Option<u64>,
    #[serde(rename = "syncStatus")]
    sync_status: SyncStatus,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStatus {
    last_sync_time: Option<u64>,
    pending_changes: u64,
    sync_in_progress: bool,
    last_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsStatus {
    total_queries: u64,
    failed_queries: u64,
    average_latency: f64,
    state_changes: u64,
    pending_sync_changes: u64,
}

#[derive(Serialize)]
struct CompatHealthResponse {
    database: &'static str,
    timestamp: String,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthInfoResponse {
    service: &'static str,
    version: String,
    environment: String,
    #[serde(rename = "nodeVersion")]
    node_version: String,
    #[serde(rename = "startTime")]
    start_time: String,
    uptime: u64,
}

#[derive(Serialize)]
struct LivenessResponse {
    status: &'static str,
    timestamp: String,
    uptime: u64,
    version: String,
    checks: LivenessChecks,
}

#[derive(Serialize)]
struct LivenessChecks {
    process: bool,
    memory: bool,
}

#[derive(Serialize)]
struct ReadinessResponse {
    status: &'static str,
    timestamp: String,
    uptime: u64,
    version: String,
    checks: ReadinessChecks,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<ReadinessDetails>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadinessChecks {
    database: &'static str,
    memory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_space: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadinessDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    database_latency: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_usage: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_limit: Option<u64>,
}

#[derive(Serialize)]
struct MetricsResponse {
    timestamp: String,
    system: MetricsSystem,
    process: MetricsProcess,
    http: MetricsHttp,
    database: MetricsDatabase,
    alerts: MetricsAlerts,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsSystem {
    hostname: String,
    platform: String,
    arch: String,
    #[serde(rename = "nodeVersion")]
    node_version: String,
    uptime: u64,
    #[serde(rename = "loadAverage")]
    load_average: Vec<f64>,
    #[serde(rename = "cpuCount")]
    cpu_count: usize,
}

#[derive(Serialize)]
struct MetricsProcess {
    pid: u32,
    uptime: u64,
    #[serde(rename = "memoryUsage")]
    memory_usage: MemoryUsage,
    #[serde(rename = "cpuUsage")]
    cpu_usage: CpuUsage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryUsage {
    rss: u64,
    #[serde(rename = "heapTotal")]
    heap_total: u64,
    #[serde(rename = "heapUsed")]
    heap_used: u64,
    external: u64,
    #[serde(rename = "arrayBuffers")]
    array_buffers: u64,
}

#[derive(Serialize)]
struct CpuUsage {
    user: u64,
    system: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsHttp {
    #[serde(rename = "totalRequests")]
    total_requests: u64,
    #[serde(rename = "errorRequests5xx")]
    error_requests5xx: u64,
    #[serde(rename = "requestDuration")]
    request_duration: MetricsHttpDuration,
}

#[derive(Serialize)]
struct MetricsHttpDuration {
    avg: f64,
    p50: f64,
    p95: f64,
    p99: f64,
    count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsDatabase {
    #[serde(rename = "slowQueryTotal")]
    slow_query_total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsAlerts {
    #[serde(rename = "activeCount")]
    active_count: u64,
    active: Vec<AlertEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertEntry {
    #[serde(rename = "ruleName")]
    rule_name: String,
    severity: String,
    #[serde(rename = "triggeredAt")]
    triggered_at: String,
}
