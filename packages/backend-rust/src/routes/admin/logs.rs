use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogsQuery {
    page: Option<i32>,
    page_size: Option<i32>,
    level: Option<String>,
    module: Option<String>,
    source: Option<String>,
    user_id: Option<String>,
    request_id: Option<String>,
    message_pattern: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatsQuery {
    start_time: Option<String>,
    end_time: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModulesQuery {
    search: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogEntry {
    id: String,
    level: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    module: Option<String>,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    env: Option<String>,
    timestamp: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaginationInfo {
    page: i32,
    page_size: i32,
    total: i64,
    total_pages: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogsListData {
    logs: Vec<LogEntry>,
    pagination: PaginationInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LevelCount {
    level: String,
    count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceCount {
    source: String,
    count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogsStatsData {
    total: i64,
    error_count: i64,
    warn_count: i64,
    frontend_count: i64,
    backend_count: i64,
    by_level: Vec<LevelCount>,
    by_source: Vec<SourceCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogAlertRule {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    enabled: bool,
    levels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    module: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_pattern: Option<String>,
    threshold: i32,
    window_minutes: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    webhook_url: Option<String>,
    cooldown_minutes: i32,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAlertRuleInput {
    name: String,
    description: Option<String>,
    #[serde(default = "default_enabled")]
    enabled: bool,
    levels: Vec<String>,
    module: Option<String>,
    message_pattern: Option<String>,
    threshold: i32,
    window_minutes: i32,
    webhook_url: Option<String>,
    #[serde(default = "default_cooldown")]
    cooldown_minutes: i32,
}

fn default_enabled() -> bool { true }
fn default_cooldown() -> i32 { 30 }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAlertRuleInput {
    name: Option<String>,
    description: Option<String>,
    enabled: Option<bool>,
    levels: Option<Vec<String>>,
    module: Option<String>,
    message_pattern: Option<String>,
    threshold: Option<i32>,
    window_minutes: Option<i32>,
    webhook_url: Option<String>,
    cooldown_minutes: Option<i32>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_logs))
        .route("/stats", get(logs_stats))
        .route("/modules", get(logs_modules))
        .route("/log-alerts", get(list_log_alerts).post(create_log_alert))
        .route("/log-alerts/{id}", put(update_log_alert).delete(delete_log_alert))
        .route("/{id}", get(get_log))
}

async fn list_logs(State(state): State<AppState>, Query(query): Query<LogsQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;
    let sort_by = query.sort_by.as_deref().unwrap_or("timestamp");
    let sort_order = query.sort_order.as_deref().unwrap_or("desc");

    let order_column = match sort_by {
        "level" => "\"level\"",
        _ => "\"timestamp\"",
    };
    let order_dir = if sort_order == "asc" { "ASC" } else { "DESC" };

    // Parse comma-separated levels into a vector
    let levels: Vec<&str> = query.level.as_ref()
        .map(|l| l.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();

    let mut conditions = vec!["1=1".to_string()];
    let mut bind_idx = 1;

    if !levels.is_empty() {
        let placeholders: Vec<String> = levels.iter()
            .enumerate()
            .map(|(i, _)| format!("${}", bind_idx + i as i32))
            .collect();
        conditions.push(format!("\"level\"::text IN ({})", placeholders.join(",")));
        bind_idx += levels.len() as i32;
    }
    if query.module.is_some() {
        conditions.push(format!("\"module\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if query.source.is_some() {
        conditions.push(format!("\"source\"::text = ${bind_idx}"));
        bind_idx += 1;
    }
    if query.user_id.is_some() {
        conditions.push(format!("\"userId\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if query.request_id.is_some() {
        conditions.push(format!("\"requestId\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if query.message_pattern.is_some() {
        conditions.push(format!("\"message\" ILIKE ${bind_idx}"));
        bind_idx += 1;
    }
    if query.start_time.is_some() {
        conditions.push(format!("\"timestamp\" >= ${bind_idx}"));
        bind_idx += 1;
    }
    if query.end_time.is_some() {
        conditions.push(format!("\"timestamp\" <= ${bind_idx}"));
        bind_idx += 1;
    }

    let where_clause = conditions.join(" AND ");
    let count_query = format!(r#"SELECT COUNT(*) FROM "system_logs" WHERE {where_clause}"#);
    let data_query = format!(
        r#"SELECT "id","level"::text,"message","module","source"::text,"context","error","requestId","userId","clientIp","userAgent","app","env","timestamp"
           FROM "system_logs" WHERE {where_clause} ORDER BY {order_column} {order_dir} LIMIT ${bind_idx} OFFSET ${}"#,
        bind_idx + 1
    );

    let mut count_q = sqlx::query_scalar(&count_query);
    let mut data_q = sqlx::query(&data_query);

    for level in &levels { count_q = count_q.bind(*level); data_q = data_q.bind(*level); }
    if let Some(ref v) = query.module { count_q = count_q.bind(v); data_q = data_q.bind(v); }
    if let Some(ref v) = query.source { count_q = count_q.bind(v); data_q = data_q.bind(v); }
    if let Some(ref v) = query.user_id { count_q = count_q.bind(v); data_q = data_q.bind(v); }
    if let Some(ref v) = query.request_id { count_q = count_q.bind(v); data_q = data_q.bind(v); }
    if let Some(ref v) = query.message_pattern {
        let pattern = format!("%{v}%");
        count_q = count_q.bind(pattern.clone());
        data_q = data_q.bind(pattern);
    }
    if let Some(ref v) = query.start_time { count_q = count_q.bind(v); data_q = data_q.bind(v); }
    if let Some(ref v) = query.end_time { count_q = count_q.bind(v); data_q = data_q.bind(v); }

    data_q = data_q.bind(page_size).bind(offset);

    let total: i64 = count_q.fetch_one(pg).await.unwrap_or(0);
    let rows = match data_q.fetch_all(pg).await {
        Ok(r) => r,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
    };

    let logs: Vec<LogEntry> = rows.iter().map(|r| parse_log_entry_pg(r)).collect();
    let total_pages = ((total as f64) / (page_size as f64)).ceil() as i64;

    (StatusCode::OK, Json(SuccessResponse {
        success: true,
        data: LogsListData {
            logs,
            pagination: PaginationInfo { page, page_size, total, total_pages },
        },
    })).into_response()
}

async fn logs_stats(State(state): State<AppState>, Query(query): Query<StatsQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let mut where_parts = vec![];
    if query.start_time.is_some() { where_parts.push("\"timestamp\" >= $1".to_string()); }
    if query.end_time.is_some() {
        let idx = if query.start_time.is_some() { 2 } else { 1 };
        where_parts.push(format!("\"timestamp\" <= ${idx}"));
    }
    let where_clause = if where_parts.is_empty() { "1=1".to_string() } else { where_parts.join(" AND ") };

    let total_q = format!(r#"SELECT COUNT(*) FROM "system_logs" WHERE {where_clause}"#);
    let level_q = format!(r#"SELECT "level"::text, COUNT(*) as cnt FROM "system_logs" WHERE {where_clause} GROUP BY "level""#);
    let source_q = format!(r#"SELECT "source"::text, COUNT(*) as cnt FROM "system_logs" WHERE {where_clause} GROUP BY "source""#);

    let mut tq = sqlx::query_scalar(&total_q);
    let mut lq = sqlx::query(&level_q);
    let mut sq = sqlx::query(&source_q);

    if let Some(ref s) = query.start_time { tq = tq.bind(s); lq = lq.bind(s); sq = sq.bind(s); }
    if let Some(ref e) = query.end_time { tq = tq.bind(e); lq = lq.bind(e); sq = sq.bind(e); }

    let total: i64 = tq.fetch_one(pg).await.unwrap_or(0);
    let level_rows = lq.fetch_all(pg).await.unwrap_or_default();
    let source_rows = sq.fetch_all(pg).await.unwrap_or_default();

    let by_level: Vec<LevelCount> = level_rows.iter().map(|r| LevelCount {
        level: r.try_get("level").unwrap_or_default(),
        count: r.try_get("cnt").unwrap_or(0),
    }).collect();

    let by_source: Vec<SourceCount> = source_rows.iter().map(|r| SourceCount {
        source: r.try_get("source").unwrap_or_default(),
        count: r.try_get("cnt").unwrap_or(0),
    }).collect();

    let error_count = by_level.iter().find(|l| l.level == "ERROR").map(|l| l.count).unwrap_or(0);
    let warn_count = by_level.iter().find(|l| l.level == "WARN").map(|l| l.count).unwrap_or(0);
    let frontend_count = by_source.iter().find(|s| s.source == "FRONTEND").map(|s| s.count).unwrap_or(0);
    let backend_count = by_source.iter().find(|s| s.source == "BACKEND").map(|s| s.count).unwrap_or(0);

    (StatusCode::OK, Json(SuccessResponse {
        success: true,
        data: LogsStatsData { total, error_count, warn_count, frontend_count, backend_count, by_level, by_source },
    })).into_response()
}

async fn logs_modules(State(state): State<AppState>, Query(query): Query<ModulesQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let (sql, pattern) = if let Some(ref s) = query.search {
        (r#"SELECT DISTINCT "module" FROM "system_logs" WHERE "module" IS NOT NULL AND "module" ILIKE $1 ORDER BY "module" LIMIT 100"#.to_string(), Some(format!("%{s}%")))
    } else {
        (r#"SELECT DISTINCT "module" FROM "system_logs" WHERE "module" IS NOT NULL ORDER BY "module" LIMIT 100"#.to_string(), None)
    };

    let rows = if let Some(p) = pattern {
        sqlx::query(&sql).bind(p).fetch_all(pg).await
    } else {
        sqlx::query(&sql).fetch_all(pg).await
    };

    let modules: Vec<String> = rows.unwrap_or_default().iter()
        .filter_map(|r| r.try_get::<String, _>("module").ok())
        .collect();

    (StatusCode::OK, Json(SuccessResponse { success: true, data: modules })).into_response()
}

async fn list_log_alerts(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let rows = sqlx::query(
        r#"SELECT "id","name","description","enabled","levels","module","messagePattern","threshold","windowMinutes","webhookUrl","cooldownMinutes","createdAt","updatedAt"
           FROM "log_alert_rules" ORDER BY "enabled" DESC, "createdAt" DESC"#
    )
    .fetch_all(pg)
    .await;

    match rows {
        Ok(rows) => {
            let rules: Vec<LogAlertRule> = rows.iter().map(|r| parse_alert_rule_pg(r)).collect();
            (StatusCode::OK, Json(SuccessResponse { success: true, data: rules })).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
    }
}

async fn create_log_alert(State(state): State<AppState>, Json(input): Json<CreateAlertRuleInput>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    let levels_json = serde_json::to_string(&input.levels).unwrap_or_default();

    let result = sqlx::query(
        r#"INSERT INTO "log_alert_rules" ("id","name","description","enabled","levels","module","messagePattern","threshold","windowMinutes","webhookUrl","cooldownMinutes","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,NOW(),NOW())"#
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.description)
    .bind(input.enabled)
    .bind(&levels_json)
    .bind(&input.module)
    .bind(&input.message_pattern)
    .bind(input.threshold)
    .bind(input.window_minutes)
    .bind(&input.webhook_url)
    .bind(input.cooldown_minutes)
    .execute(pg)
    .await;

    if let Err(e) = result {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
    }

    let rule = LogAlertRule {
        id,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        levels: input.levels,
        module: input.module,
        message_pattern: input.message_pattern,
        threshold: input.threshold,
        window_minutes: input.window_minutes,
        webhook_url: input.webhook_url,
        cooldown_minutes: input.cooldown_minutes,
        created_at: now_str.clone(),
        updated_at: now_str,
    };

    (StatusCode::CREATED, Json(SuccessResponse { success: true, data: rule })).into_response()
}

async fn update_log_alert(State(state): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateAlertRuleInput>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let existing = sqlx::query(r#"SELECT "id" FROM "log_alert_rules" WHERE "id" = $1"#)
        .bind(&id)
        .fetch_optional(pg)
        .await;

    if existing.is_err() || existing.unwrap().is_none() {
        return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "告警规则不存在").into_response();
    }

    let mut sets = vec!["\"updatedAt\" = NOW()".to_string()];
    let mut bind_idx = 1;

    if input.name.is_some() { sets.push(format!("\"name\" = ${bind_idx}")); bind_idx += 1; }
    if input.description.is_some() { sets.push(format!("\"description\" = ${bind_idx}")); bind_idx += 1; }
    if input.enabled.is_some() { sets.push(format!("\"enabled\" = ${bind_idx}")); bind_idx += 1; }
    if input.levels.is_some() { sets.push(format!("\"levels\" = ${bind_idx}::jsonb")); bind_idx += 1; }
    if input.module.is_some() { sets.push(format!("\"module\" = ${bind_idx}")); bind_idx += 1; }
    if input.message_pattern.is_some() { sets.push(format!("\"messagePattern\" = ${bind_idx}")); bind_idx += 1; }
    if input.threshold.is_some() { sets.push(format!("\"threshold\" = ${bind_idx}")); bind_idx += 1; }
    if input.window_minutes.is_some() { sets.push(format!("\"windowMinutes\" = ${bind_idx}")); bind_idx += 1; }
    if input.webhook_url.is_some() { sets.push(format!("\"webhookUrl\" = ${bind_idx}")); bind_idx += 1; }
    if input.cooldown_minutes.is_some() { sets.push(format!("\"cooldownMinutes\" = ${bind_idx}")); bind_idx += 1; }

    let sql = format!(r#"UPDATE "log_alert_rules" SET {} WHERE "id" = ${bind_idx}"#, sets.join(", "));
    let mut q = sqlx::query(&sql);

    if let Some(ref n) = input.name { q = q.bind(n); }
    if let Some(ref d) = input.description { q = q.bind(d); }
    if let Some(e) = input.enabled { q = q.bind(e); }
    if let Some(ref l) = input.levels { q = q.bind(serde_json::to_string(l).unwrap_or_default()); }
    if let Some(ref m) = input.module { q = q.bind(m); }
    if let Some(ref p) = input.message_pattern { q = q.bind(p); }
    if let Some(t) = input.threshold { q = q.bind(t); }
    if let Some(w) = input.window_minutes { q = q.bind(w); }
    if let Some(ref u) = input.webhook_url { q = q.bind(u); }
    if let Some(c) = input.cooldown_minutes { q = q.bind(c); }
    q = q.bind(&id);

    if let Err(e) = q.execute(pg).await {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true, "message": "更新成功" }))).into_response()
}

async fn delete_log_alert(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let existing = sqlx::query(r#"SELECT "id" FROM "log_alert_rules" WHERE "id" = $1"#)
        .bind(&id)
        .fetch_optional(pg)
        .await;

    if existing.is_err() || existing.unwrap().is_none() {
        return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "告警规则不存在").into_response();
    }

    if let Err(e) = sqlx::query(r#"DELETE FROM "log_alert_rules" WHERE "id" = $1"#)
        .bind(&id)
        .execute(pg)
        .await
    {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "DELETE_ERROR", &e.to_string()).into_response();
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true, "message": "删除成功" }))).into_response()
}

async fn get_log(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let pg = proxy.pool();

    let row = sqlx::query(
        r#"SELECT "id","level"::text,"message","module","source"::text,"context","error","requestId","userId","clientIp","userAgent","app","env","timestamp"
           FROM "system_logs" WHERE "id" = $1"#
    )
    .bind(&id)
    .fetch_optional(pg)
    .await;

    match row {
        Ok(Some(r)) => {
            let log = parse_log_entry_pg(&r);
            (StatusCode::OK, Json(SuccessResponse { success: true, data: log })).into_response()
        }
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "日志不存在").into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
    }
}

fn parse_log_entry_pg(row: &sqlx::postgres::PgRow) -> LogEntry {
    let timestamp: chrono::NaiveDateTime = row.try_get("timestamp").unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    LogEntry {
        id: row.try_get("id").unwrap_or_default(),
        level: row.try_get("level").unwrap_or_default(),
        message: row.try_get("message").unwrap_or_default(),
        module: row.try_get("module").ok(),
        source: row.try_get("source").unwrap_or_default(),
        context: row.try_get("context").ok(),
        error: row.try_get("error").ok(),
        request_id: row.try_get("requestId").ok(),
        user_id: row.try_get("userId").ok(),
        client_ip: row.try_get("clientIp").ok(),
        user_agent: row.try_get("userAgent").ok(),
        app: row.try_get("app").ok(),
        env: row.try_get("env").ok(),
        timestamp: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(timestamp, chrono::Utc).to_rfc3339(),
    }
}

fn parse_alert_rule_pg(row: &sqlx::postgres::PgRow) -> LogAlertRule {
    let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let updated_at: chrono::NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let levels: Vec<String> = row.try_get::<serde_json::Value, _>("levels")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    LogAlertRule {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok(),
        enabled: row.try_get("enabled").unwrap_or(true),
        levels,
        module: row.try_get("module").ok(),
        message_pattern: row.try_get("messagePattern").ok(),
        threshold: row.try_get("threshold").unwrap_or(1),
        window_minutes: row.try_get("windowMinutes").unwrap_or(60),
        webhook_url: row.try_get("webhookUrl").ok(),
        cooldown_minutes: row.try_get("cooldownMinutes").unwrap_or(30),
        created_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(created_at, chrono::Utc).to_rfc3339(),
        updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(updated_at, chrono::Utc).to_rfc3339(),
    }
}
