use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::net::IpAddr;
use std::sync::Arc;

use crate::auth::AuthUser;
use crate::db::DatabaseProxy;
use crate::response::json_error;
use crate::state::AppState;

const DEFAULT_CENTER_URL: &str = "https://cdn.jsdelivr.net/gh/Heartcoolman/wordbook-center@main";

async fn authenticate(
    state: &AppState,
    req: Request<Body>,
) -> Result<(Arc<DatabaseProxy>, AuthUser, Request<Body>), Response> {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return Err(
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response(),
        );
    };

    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DB_ERROR",
            "数据库不可用",
        )
        .into_response());
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return Err(json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response());
        }
    };

    Ok((proxy, auth_user, req))
}

fn is_safe_url(url: &str) -> Result<(), &'static str> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "无效的URL格式")?;

    let host = parsed.host_str().ok_or("URL缺少主机名")?;

    let allow_local = std::env::var("ALLOW_LOCAL_WORDBOOK_CENTER")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if !allow_local {
        if host == "localhost" || host.ends_with(".local") || host.ends_with(".internal") {
            return Err("不允许访问本地地址");
        }

        if let Ok(ip) = host.parse::<IpAddr>() {
            match ip {
                IpAddr::V4(v4) => {
                    if v4.is_loopback() || v4.is_private() || v4.is_link_local()
                       || v4.is_broadcast() || v4.is_unspecified() {
                        return Err("不允许访问内部IP地址");
                    }
                }
                IpAddr::V6(v6) => {
                    if v6.is_loopback() || v6.is_unspecified() {
                        return Err("不允许访问内部IP地址");
                    }
                }
            }
        }
    }

    Ok(())
}

fn is_static_hosting(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("jsdelivr.net")
        || lower.contains("github.io")
        || lower.contains("raw.githubusercontent.com")
        || lower.ends_with(".json")
}

fn static_index_url(center_url: &str) -> String {
    let trimmed = center_url.trim_end_matches('/');
    let lower = trimmed.to_ascii_lowercase();
    if lower.ends_with(".json") {
        trimmed.to_string()
    } else {
        format!("{}/index.json", trimmed)
    }
}

fn static_wordbook_url(center_url: &str, id: &str) -> String {
    let trimmed = center_url.trim_end_matches('/');
    let lower = trimmed.to_ascii_lowercase();
    let base = if lower.ends_with(".json") {
        match trimmed.rfind('/') {
            Some(idx) if idx > 0 => &trimmed[..idx],
            _ => trimmed,
        }
    } else {
        trimmed
    };
    format!("{}/wordbooks/{}.json", base, id)
}

async fn fetch_global_config(proxy: &DatabaseProxy) -> Result<CenterConfig, Response> {
    let row = sqlx::query(
        r#"SELECT "id", "centerUrl", "updatedAt", "updatedBy" FROM "wordbook_center_config" WHERE "id" = 'default'"#,
    )
    .fetch_optional(proxy.pool())
    .await;

    match row {
        Ok(Some(r)) => {
            let updated_at: chrono::NaiveDateTime = r
                .try_get("updatedAt")
                .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
            let center_url: String = r.try_get("centerUrl").unwrap_or_default();
            let center_url = if center_url.trim().is_empty() {
                DEFAULT_CENTER_URL.to_string()
            } else {
                center_url
            };
            Ok(CenterConfig {
                id: r.try_get("id").unwrap_or_else(|_| "default".to_string()),
                center_url,
                updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                    updated_at,
                    chrono::Utc,
                )
                .to_rfc3339(),
                updated_by: r.try_get::<Option<String>, _>("updatedBy").ok().flatten(),
            })
        }
        Ok(None) => Ok(CenterConfig {
            id: "default".to_string(),
            center_url: DEFAULT_CENTER_URL.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            updated_by: None,
        }),
        Err(e) => {
            tracing::error!(error = %e, "config query failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询配置失败",
            )
            .into_response())
        }
    }
}

async fn fetch_personal_config(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<PersonalCenterConfig>, Response> {
    let row = sqlx::query(
        r#"SELECT "centerUrl", "updatedAt" FROM "wordbook_center_user_config" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_optional(proxy.pool())
    .await;

    match row {
        Ok(Some(r)) => {
            let updated_at: chrono::NaiveDateTime = r
                .try_get("updatedAt")
                .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
            Ok(Some(PersonalCenterConfig {
                center_url: r.try_get("centerUrl").unwrap_or_default(),
                updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                    updated_at,
                    chrono::Utc,
                )
                .to_rfc3339(),
            }))
        }
        Ok(None) => Ok(None),
        Err(e) => {
            tracing::error!(error = %e, "personal config query failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询个人配置失败",
            )
            .into_response())
        }
    }
}

fn resolve_effective_url(
    personal: Option<&PersonalCenterConfig>,
    global: &CenterConfig,
) -> (String, &'static str) {
    if let Some(cfg) = personal {
        if !cfg.center_url.trim().is_empty() {
            return (cfg.center_url.clone(), "personal");
        }
    }
    (global.center_url.clone(), "global")
}

async fn fetch_effective_center_url(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<String, Response> {
    let global = fetch_global_config(proxy).await?;
    let personal = fetch_personal_config(proxy, user_id).await?;
    let (url, _) = resolve_effective_url(personal.as_ref(), &global);
    Ok(url)
}

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CenterConfig {
    id: String,
    center_url: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonalCenterConfig {
    center_url: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CenterConfigResponse {
    global: CenterConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    personal: Option<PersonalCenterConfig>,
    effective_url: String,
    source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateConfigInput {
    center_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CenterWordBook {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    word_count: i64,
    #[serde(default)]
    cover_image: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    version: String,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    download_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CenterWordBookDetail {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    word_count: i64,
    #[serde(default)]
    cover_image: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    version: String,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    download_count: Option<i64>,
    #[serde(default)]
    words: Vec<CenterWord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteWordBookMeta {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    word_count: i64,
    #[serde(default)]
    cover_image: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    version: String,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    download_count: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteWordsPage {
    data: Vec<CenterWord>,
    #[serde(default)]
    total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CenterWord {
    spelling: String,
    #[serde(default)]
    phonetic: Option<String>,
    #[serde(default)]
    meanings: Vec<String>,
    #[serde(default)]
    examples: Vec<String>,
    #[serde(default)]
    audio_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportRequest {
    target_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    wordbook_id: String,
    imported_count: i64,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowseResponse {
    wordbooks: Vec<CenterWordBook>,
    total: i64,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config", get(get_config).put(update_config))
        .route(
            "/config/personal",
            put(update_personal_config).delete(clear_personal_config),
        )
        .route("/browse", get(browse_wordbooks))
        .route("/browse/:id", get(get_wordbook_detail))
        .route("/import/:id", post(import_wordbook))
}

async fn get_config(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user, _req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    let global = match fetch_global_config(proxy.as_ref()).await {
        Ok(v) => v,
        Err(e) => return e,
    };
    let personal = match fetch_personal_config(proxy.as_ref(), &user.id).await {
        Ok(v) => v,
        Err(e) => return e,
    };
    let (effective_url, source) = resolve_effective_url(personal.as_ref(), &global);

    Json(SuccessResponse {
        success: true,
        data: CenterConfigResponse {
            global,
            personal,
            effective_url,
            source: source.to_string(),
        },
    })
    .into_response()
}

async fn update_config(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user, req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    if user.role != "ADMIN" {
        return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "仅管理员可修改配置")
            .into_response();
    }

    let body = match axum::body::to_bytes(req.into_body(), 1024 * 16).await {
        Ok(b) => b,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求体")
                .into_response();
        }
    };
    let input: UpdateConfigInput = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效JSON格式")
                .into_response();
        }
    };

    if input.center_url.trim().is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "词库中心URL不能为空",
        )
        .into_response();
    }

    let url = input.center_url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "词库中心URL必须以http://或https://开头",
        )
        .into_response();
    }

    if let Err(msg) = is_safe_url(url) {
        return json_error(StatusCode::BAD_REQUEST, "SSRF_BLOCKED", msg).into_response();
    }

    let result = sqlx::query(
        r#"INSERT INTO "wordbook_center_config" ("id", "centerUrl", "updatedAt", "updatedBy")
           VALUES ('default', $1, NOW(), $2)
           ON CONFLICT ("id") DO UPDATE SET "centerUrl" = $1, "updatedAt" = NOW(), "updatedBy" = $2"#,
    )
    .bind(url)
    .bind(&user.id)
    .execute(proxy.pool())
    .await;

    match result {
        Ok(_) => {
            let config = CenterConfig {
                id: "default".to_string(),
                center_url: url.to_string(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                updated_by: Some(user.id.clone()),
            };
            Json(SuccessResponse {
                success: true,
                data: config,
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "config update failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "WRITE_ERROR",
                "更新配置失败",
            )
            .into_response()
        }
    }
}

async fn update_personal_config(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user, req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    let body = match axum::body::to_bytes(req.into_body(), 1024 * 16).await {
        Ok(b) => b,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求体")
                .into_response();
        }
    };
    let input: UpdateConfigInput = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效JSON格式")
                .into_response();
        }
    };

    if input.center_url.trim().is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "词库中心URL不能为空",
        )
        .into_response();
    }

    let url = input.center_url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "词库中心URL必须以http://或https://开头",
        )
        .into_response();
    }

    if let Err(msg) = is_safe_url(url) {
        return json_error(StatusCode::BAD_REQUEST, "SSRF_BLOCKED", msg).into_response();
    }

    let config_id = uuid::Uuid::new_v4().to_string();
    let result = sqlx::query(
        r#"INSERT INTO "wordbook_center_user_config" ("id", "userId", "centerUrl", "updatedAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("userId") DO UPDATE SET "centerUrl" = $3, "updatedAt" = NOW()"#,
    )
    .bind(&config_id)
    .bind(&user.id)
    .bind(url)
    .execute(proxy.pool())
    .await;

    match result {
        Ok(_) => {
            let config = PersonalCenterConfig {
                center_url: url.to_string(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            };
            Json(SuccessResponse {
                success: true,
                data: config,
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "personal config update failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "WRITE_ERROR",
                "更新个人配置失败",
            )
            .into_response()
        }
    }
}

async fn clear_personal_config(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user, _req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    let result = sqlx::query(
        r#"DELETE FROM "wordbook_center_user_config" WHERE "userId" = $1"#,
    )
    .bind(&user.id)
    .execute(proxy.pool())
    .await;

    match result {
        Ok(_) => Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "message": "个人配置已清除" }),
        })
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "personal config delete failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DELETE_ERROR",
                "清除个人配置失败",
            )
            .into_response()
        }
    }
}

async fn browse_wordbooks(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (proxy, user, _req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    let center_url = match fetch_effective_center_url(proxy.as_ref(), &user.id).await {
        Ok(url) => url,
        Err(e) => return e,
    };

    let client = reqwest::Client::new();
    let base_url = center_url.trim_end_matches('/');
    let url = if is_static_hosting(base_url) {
        static_index_url(base_url)
    } else {
        format!("{}/api/wordbooks", base_url)
    };

    match client.get(&url).timeout(std::time::Duration::from_secs(30)).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return json_error(
                    StatusCode::BAD_GATEWAY,
                    "CENTER_ERROR",
                    &format!("词库中心返回错误: {}", resp.status()),
                )
                .into_response();
            }
            match resp.json::<serde_json::Value>().await {
                Ok(data) => {
                    let wordbooks_value = data
                        .get("data")
                        .or(data.get("wordbooks"))
                        .or(data.get("wordBooks"))
                        .cloned()
                        .unwrap_or(data);
                    let wordbooks: Vec<CenterWordBook> =
                        serde_json::from_value(wordbooks_value).unwrap_or_default();
                    let total = wordbooks.len() as i64;
                    Json(SuccessResponse {
                        success: true,
                        data: BrowseResponse { wordbooks, total },
                    })
                    .into_response()
                }
                Err(_) => json_error(
                    StatusCode::BAD_GATEWAY,
                    "PARSE_ERROR",
                    "解析词库中心响应失败",
                )
                .into_response(),
            }
        }
        Err(e) => {
            tracing::error!(error = %e, url = %url, "Failed to fetch wordbook center");
            json_error(
                StatusCode::BAD_GATEWAY,
                "CENTER_UNREACHABLE",
                &format!("无法连接词库中心: {}", e),
            )
            .into_response()
        }
    }
}

async fn get_wordbook_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    req: Request<Body>,
) -> Response {
    let (proxy, user, _req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    let center_url = match fetch_effective_center_url(proxy.as_ref(), &user.id).await {
        Ok(url) => url,
        Err(e) => return e,
    };

    let client = reqwest::Client::new();
    let base_url = center_url.trim_end_matches('/');
    let is_static = is_static_hosting(base_url);

    if is_static {
        let detail_url = static_wordbook_url(base_url, &id);
        let detail_resp = match client
            .get(&detail_url)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                return json_error(StatusCode::BAD_GATEWAY, "CENTER_UNREACHABLE", "无法连接词库中心")
                    .into_response();
            }
        };

        if !detail_resp.status().is_success() {
            return json_error(
                StatusCode::BAD_GATEWAY,
                "CENTER_ERROR",
                &format!("词库中心返回错误: {}", detail_resp.status()),
            )
            .into_response();
        }

        let detail_value: serde_json::Value = match detail_resp.json().await {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(error = %e, "Failed to parse wordbook detail");
                return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析词书详情失败")
                    .into_response();
            }
        };

        let detail_inner = detail_value
            .get("data")
            .or(detail_value.get("wordbook"))
            .or(detail_value.get("wordBook"))
            .cloned()
            .unwrap_or(detail_value);

        let detail: CenterWordBookDetail = match serde_json::from_value(detail_inner) {
            Ok(d) => d,
            Err(e) => {
                tracing::error!(error = %e, "Failed to deserialize wordbook detail");
                return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析词书详情失败")
                    .into_response();
            }
        };

        return Json(SuccessResponse {
            success: true,
            data: detail,
        })
        .into_response();
    }

    // Step 1: Fetch wordbook metadata
    let meta_url = format!("{}/api/wordbooks/{}", base_url, id);
    let meta_resp = match client
        .get(&meta_url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return json_error(StatusCode::BAD_GATEWAY, "CENTER_UNREACHABLE", "无法连接词库中心")
                .into_response();
        }
    };

    if !meta_resp.status().is_success() {
        return json_error(
            StatusCode::BAD_GATEWAY,
            "CENTER_ERROR",
            &format!("词库中心返回错误: {}", meta_resp.status()),
        )
        .into_response();
    }

    let meta: RemoteWordBookMeta = match meta_resp.json().await {
        Ok(m) => m,
        Err(e) => {
            tracing::error!(error = %e, "Failed to parse wordbook meta");
            return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析词书详情失败")
                .into_response();
        }
    };

    // Step 2: Fetch all words via pagination
    let mut all_words: Vec<CenterWord> = Vec::new();
    let page_size = 500;
    let mut page = 1;

    loop {
        let words_url = format!(
            "{}/api/wordbooks/{}/words?page={}&pageSize={}",
            base_url, id, page, page_size
        );

        let words_resp = match client
            .get(&words_url)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                return json_error(
                    StatusCode::BAD_GATEWAY,
                    "CENTER_UNREACHABLE",
                    "获取单词列表失败",
                )
                .into_response();
            }
        };

        if !words_resp.status().is_success() {
            return json_error(
                StatusCode::BAD_GATEWAY,
                "CENTER_ERROR",
                &format!("获取单词列表失败: {}", words_resp.status()),
            )
            .into_response();
        }

        let words_page: RemoteWordsPage = match words_resp.json().await {
            Ok(p) => p,
            Err(e) => {
                tracing::error!(error = %e, "Failed to parse words page");
                return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析单词列表失败")
                    .into_response();
            }
        };

        let fetched_count = words_page.data.len();
        all_words.extend(words_page.data);

        if fetched_count < page_size as usize || all_words.len() >= meta.word_count as usize {
            break;
        }

        page += 1;
        if page > 100 {
            break;
        }
    }

    let detail = CenterWordBookDetail {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        word_count: meta.word_count,
        cover_image: meta.cover_image,
        tags: meta.tags,
        version: meta.version,
        author: meta.author,
        download_count: meta.download_count,
        words: all_words,
    };

    Json(SuccessResponse {
        success: true,
        data: detail,
    })
    .into_response()
}

async fn import_wordbook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    req: Request<Body>,
) -> Response {
    let (proxy, user, req) = match authenticate(&state, req).await {
        Ok(v) => v,
        Err(e) => return e,
    };

    let body = match axum::body::to_bytes(req.into_body(), 1024 * 16).await {
        Ok(b) => b,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求体")
                .into_response();
        }
    };
    let input: ImportRequest = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效JSON格式")
                .into_response();
        }
    };

    let target_type = input.target_type.to_uppercase();
    if target_type != "SYSTEM" && target_type != "USER" {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "targetType必须是SYSTEM或USER",
        )
        .into_response();
    }

    if target_type == "SYSTEM" && user.role != "ADMIN" {
        return json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "仅管理员可导入到系统词库",
        )
        .into_response();
    }

    let center_url = match fetch_effective_center_url(proxy.as_ref(), &user.id).await {
        Ok(url) => url,
        Err(e) => return e,
    };

    let base_url = center_url.trim_end_matches('/');
    let is_static = is_static_hosting(base_url);
    let source_url_to_check = if is_static {
        static_wordbook_url(base_url, &id)
    } else {
        format!("{}/api/wordbooks/{}", base_url, id)
    };
    let existing = sqlx::query(
        r#"SELECT "id" FROM "word_books" WHERE "sourceUrl" = $1"#,
    )
    .bind(&source_url_to_check)
    .fetch_optional(proxy.pool())
    .await;

    match existing {
        Ok(Some(_)) => {
            return json_error(
                StatusCode::CONFLICT,
                "ALREADY_IMPORTED",
                "该词书已导入过",
            )
            .into_response();
        }
        Ok(None) => {}
        Err(e) => {
            tracing::error!(error = %e, "sourceUrl lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询词书失败",
            )
            .into_response();
        }
    }

    let client = reqwest::Client::new();

    if is_static {
        let detail_url = static_wordbook_url(base_url, &id);
        let detail_resp = match client
            .get(&detail_url)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                return json_error(StatusCode::BAD_GATEWAY, "CENTER_UNREACHABLE", "无法连接词库中心")
                    .into_response();
            }
        };

        if !detail_resp.status().is_success() {
            return json_error(
                StatusCode::BAD_GATEWAY,
                "CENTER_ERROR",
                &format!("词库中心返回错误: {}", detail_resp.status()),
            )
            .into_response();
        }

        let detail_value: serde_json::Value = match detail_resp.json().await {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(error = %e, "Failed to parse wordbook detail");
                return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析词书详情失败")
                    .into_response();
            }
        };

        let detail_inner = detail_value
            .get("data")
            .or(detail_value.get("wordbook"))
            .or(detail_value.get("wordBook"))
            .cloned()
            .unwrap_or(detail_value);

        let detail: CenterWordBookDetail = match serde_json::from_value(detail_inner) {
            Ok(d) => d,
            Err(e) => {
                tracing::error!(error = %e, "Failed to deserialize wordbook detail");
                return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析词书详情失败")
                    .into_response();
            }
        };

        let wordbook_id = uuid::Uuid::new_v4().to_string();
        let source_url = detail_url.clone();

        let mut tx = match proxy.pool().begin().await {
            Ok(tx) => tx,
            Err(_) => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "TX_ERROR",
                    "数据库操作失败",
                )
                .into_response();
            }
        };

        let is_public = target_type == "SYSTEM";
        let user_id: Option<&str> = if target_type == "USER" {
            Some(&user.id)
        } else {
            None
        };

        let insert_result = sqlx::query(
            r#"INSERT INTO "word_books"
           ("id", "name", "description", "type", "userId", "isPublic", "wordCount", "coverImage", "tags", "sourceUrl", "sourceVersion", "importedAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4::"WordBookType", $5, $6, 0, $7, $8, $9, $10, NOW(), NOW(), NOW())"#,
        )
        .bind(&wordbook_id)
        .bind(&detail.name)
        .bind(&detail.description)
        .bind(&target_type)
        .bind(user_id)
        .bind(is_public)
        .bind(&detail.cover_image)
        .bind(&detail.tags)
        .bind(&source_url)
        .bind(&detail.version)
        .execute(&mut *tx)
        .await;

        if let Err(e) = insert_result {
            tracing::error!(error = %e, "Failed to create wordbook");
            let _ = tx.rollback().await;
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "WRITE_ERROR",
                &format!("创建词书失败: {}", e),
            )
            .into_response();
        }

        let mut imported_count: i64 = 0;
        const STATIC_BATCH_SIZE: usize = 100;

        for chunk in detail.words.chunks(STATIC_BATCH_SIZE) {
            if chunk.is_empty() {
                continue;
            }

            let mut query_builder: sqlx::QueryBuilder<sqlx::Postgres> = sqlx::QueryBuilder::new(
                r#"INSERT INTO "words" ("id", "spelling", "phonetic", "meanings", "examples", "audioUrl", "wordBookId", "createdAt", "updatedAt") "#,
            );

            query_builder.push_values(chunk, |mut b, word| {
                let word_id = uuid::Uuid::new_v4().to_string();
                let phonetic = word.phonetic.as_deref().unwrap_or("");
                b.push_bind(word_id)
                    .push_bind(&word.spelling)
                    .push_bind(phonetic)
                    .push_bind(&word.meanings)
                    .push_bind(&word.examples)
                    .push_bind(&word.audio_url)
                    .push_bind(&wordbook_id)
                    .push("NOW()")
                    .push("NOW()");
            });

            match query_builder.build().execute(&mut *tx).await {
                Ok(result) => {
                    imported_count += result.rows_affected() as i64;
                }
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert words batch");
                    let _ = tx.rollback().await;
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "IMPORT_ERROR",
                        &format!("导入单词失败: {}", e),
                    )
                    .into_response();
                }
            }
        }

        if let Err(_) = sqlx::query(
            r#"UPDATE "word_books" SET "wordCount" = $1, "updatedAt" = NOW() WHERE "id" = $2"#,
        )
        .bind(imported_count)
        .bind(&wordbook_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "IMPORT_ERROR",
                "更新词书统计失败",
            )
            .into_response();
        }

        if let Err(_) = tx.commit().await {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TX_COMMIT_ERROR",
                "保存数据失败",
            )
            .into_response();
        }

        return Json(SuccessResponse {
            success: true,
            data: ImportResult {
                wordbook_id,
                imported_count,
                message: format!("成功导入{}个单词", imported_count),
            },
        })
        .into_response();
    }

    // Step 1: Fetch wordbook metadata
    let meta_url = format!("{}/api/wordbooks/{}", base_url, id);
    let meta_resp = match client
        .get(&meta_url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return json_error(StatusCode::BAD_GATEWAY, "CENTER_UNREACHABLE", "无法连接词库中心")
                .into_response();
        }
    };

    if !meta_resp.status().is_success() {
        return json_error(
            StatusCode::BAD_GATEWAY,
            "CENTER_ERROR",
            &format!("词库中心返回错误: {}", meta_resp.status()),
        )
        .into_response();
    }

    let meta: RemoteWordBookMeta = match meta_resp.json().await {
        Ok(m) => m,
        Err(e) => {
            tracing::error!(error = %e, "Failed to parse wordbook meta");
            return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析词书详情失败")
                .into_response();
        }
    };

    let wordbook_id = uuid::Uuid::new_v4().to_string();
    let source_url = meta_url.clone();

    let mut tx = match proxy.pool().begin().await {
        Ok(tx) => tx,
        Err(_) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TX_ERROR",
                "数据库操作失败",
            )
            .into_response();
        }
    };

    let is_public = target_type == "SYSTEM";
    let user_id: Option<&str> = if target_type == "USER" {
        Some(&user.id)
    } else {
        None
    };

    let insert_result = sqlx::query(
        r#"INSERT INTO "word_books"
           ("id", "name", "description", "type", "userId", "isPublic", "wordCount", "coverImage", "tags", "sourceUrl", "sourceVersion", "importedAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4::"WordBookType", $5, $6, 0, $7, $8, $9, $10, NOW(), NOW(), NOW())"#,
    )
    .bind(&wordbook_id)
    .bind(&meta.name)
    .bind(&meta.description)
    .bind(&target_type)
    .bind(user_id)
    .bind(is_public)
    .bind(&meta.cover_image)
    .bind(&meta.tags)
    .bind(&source_url)
    .bind(&meta.version)
    .execute(&mut *tx)
    .await;

    if let Err(e) = insert_result {
        tracing::error!(error = %e, "Failed to create wordbook");
        let _ = tx.rollback().await;
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "WRITE_ERROR",
            &format!("创建词书失败: {}", e),
        )
        .into_response();
    }

    // Step 2: Fetch and import words via pagination
    let mut imported_count: i64 = 0;
    let page_size = 500;
    let mut page = 1;
    const BATCH_SIZE: usize = 100;

    loop {
        let words_url = format!(
            "{}/api/wordbooks/{}/words?page={}&pageSize={}",
            base_url, id, page, page_size
        );

        let words_resp = match client
            .get(&words_url)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                let _ = tx.rollback().await;
                return json_error(
                    StatusCode::BAD_GATEWAY,
                    "CENTER_UNREACHABLE",
                    "获取单词列表失败",
                )
                .into_response();
            }
        };

        if !words_resp.status().is_success() {
            let _ = tx.rollback().await;
            return json_error(
                StatusCode::BAD_GATEWAY,
                "CENTER_ERROR",
                &format!("获取单词列表失败: {}", words_resp.status()),
            )
            .into_response();
        }

        let words_page: RemoteWordsPage = match words_resp.json().await {
            Ok(p) => p,
            Err(e) => {
                tracing::error!(error = %e, "Failed to parse words page");
                let _ = tx.rollback().await;
                return json_error(StatusCode::BAD_GATEWAY, "PARSE_ERROR", "解析单词列表失败")
                    .into_response();
            }
        };

        let fetched_count = words_page.data.len();

        for chunk in words_page.data.chunks(BATCH_SIZE) {
            if chunk.is_empty() {
                continue;
            }

            let mut query_builder: sqlx::QueryBuilder<sqlx::Postgres> = sqlx::QueryBuilder::new(
                r#"INSERT INTO "words" ("id", "spelling", "phonetic", "meanings", "examples", "audioUrl", "wordBookId", "createdAt", "updatedAt") "#,
            );

            query_builder.push_values(chunk, |mut b, word| {
                let word_id = uuid::Uuid::new_v4().to_string();
                let phonetic = word.phonetic.as_deref().unwrap_or("");
                b.push_bind(word_id)
                    .push_bind(&word.spelling)
                    .push_bind(phonetic)
                    .push_bind(&word.meanings)
                    .push_bind(&word.examples)
                    .push_bind(&word.audio_url)
                    .push_bind(&wordbook_id)
                    .push("NOW()")
                    .push("NOW()");
            });

            match query_builder.build().execute(&mut *tx).await {
                Ok(result) => {
                    imported_count += result.rows_affected() as i64;
                }
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert words batch");
                    let _ = tx.rollback().await;
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "IMPORT_ERROR",
                        &format!("导入单词失败: {}", e),
                    )
                    .into_response();
                }
            }
        }

        if fetched_count < page_size as usize || imported_count >= meta.word_count {
            break;
        }

        page += 1;
        if page > 100 {
            break;
        }
    }

    if let Err(_) = sqlx::query(
        r#"UPDATE "word_books" SET "wordCount" = $1, "updatedAt" = NOW() WHERE "id" = $2"#,
    )
    .bind(imported_count)
    .bind(&wordbook_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "IMPORT_ERROR",
            "更新词书统计失败",
        )
        .into_response();
    }

    if let Err(_) = tx.commit().await {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TX_COMMIT_ERROR",
            "保存数据失败",
        )
        .into_response();
    }

    Json(SuccessResponse {
        success: true,
        data: ImportResult {
            wordbook_id,
            imported_count,
            message: format!("成功导入{}个单词", imported_count),
        },
    })
    .into_response()
}
