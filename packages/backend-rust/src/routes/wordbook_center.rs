use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::net::IpAddr;

use crate::response::json_error;
use crate::state::AppState;

fn is_safe_url(url: &str) -> Result<(), &'static str> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "无效的URL格式")?;

    let host = parsed.host_str().ok_or("URL缺少主机名")?;

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

    Ok(())
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
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    word_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    cover_image: Option<String>,
    tags: Vec<String>,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    download_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CenterWordBookDetail {
    #[serde(flatten)]
    wordbook: CenterWordBook,
    words: Vec<CenterWord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CenterWord {
    spelling: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phonetic: Option<String>,
    meanings: Vec<String>,
    examples: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
        .route("/browse", get(browse_wordbooks))
        .route("/browse/{id}", get(get_wordbook_detail))
        .route("/import/{id}", post(import_wordbook))
}

async fn get_config(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

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
            let config = CenterConfig {
                id: r.try_get("id").unwrap_or_else(|_| "default".to_string()),
                center_url: r.try_get("centerUrl").unwrap_or_default(),
                updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                    updated_at,
                    chrono::Utc,
                )
                .to_rfc3339(),
                updated_by: r.try_get::<Option<String>, _>("updatedBy").ok().flatten(),
            };
            Json(SuccessResponse {
                success: true,
                data: config,
            })
            .into_response()
        }
        Ok(None) => Json(SuccessResponse {
            success: true,
            data: CenterConfig {
                id: "default".to_string(),
                center_url: String::new(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                updated_by: None,
            },
        })
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "config query failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询配置失败",
            )
            .into_response()
        }
    }
}

async fn update_config(
    State(state): State<AppState>,
    Json(input): Json<UpdateConfigInput>,
) -> Response {
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

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let result = sqlx::query(
        r#"INSERT INTO "wordbook_center_config" ("id", "centerUrl", "updatedAt")
           VALUES ('default', $1, NOW())
           ON CONFLICT ("id") DO UPDATE SET "centerUrl" = $1, "updatedAt" = NOW()"#,
    )
    .bind(url)
    .execute(proxy.pool())
    .await;

    match result {
        Ok(_) => {
            let config = CenterConfig {
                id: "default".to_string(),
                center_url: url.to_string(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                updated_by: None,
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

async fn browse_wordbooks(State(state): State<AppState>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let config_row = sqlx::query(
        r#"SELECT "centerUrl" FROM "wordbook_center_config" WHERE "id" = 'default'"#,
    )
    .fetch_optional(proxy.pool())
    .await;

    let center_url: String = match config_row {
        Ok(Some(r)) => r.try_get("centerUrl").unwrap_or_default(),
        Ok(None) => {
            return json_error(
                StatusCode::NOT_FOUND,
                "CONFIG_NOT_FOUND",
                "词库中心未配置",
            )
            .into_response();
        }
        Err(e) => {
            tracing::error!(error = %e, "query config failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询配置失败",
            )
            .into_response();
        }
    };

    if center_url.is_empty() {
        return json_error(
            StatusCode::NOT_FOUND,
            "CONFIG_NOT_FOUND",
            "词库中心未配置",
        )
        .into_response();
    }

    let client = reqwest::Client::new();
    let url = format!("{}/api/wordbooks", center_url.trim_end_matches('/'));

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
                    let wordbooks: Vec<CenterWordBook> = data
                        .get("data")
                        .or(data.get("wordbooks"))
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or_default();
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
        Err(_) => json_error(
            StatusCode::BAD_GATEWAY,
            "CENTER_UNREACHABLE",
            "无法连接词库中心",
        )
        .into_response(),
    }
}

async fn get_wordbook_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let config_row = sqlx::query(
        r#"SELECT "centerUrl" FROM "wordbook_center_config" WHERE "id" = 'default'"#,
    )
    .fetch_optional(proxy.pool())
    .await;

    let center_url: String = match config_row {
        Ok(Some(r)) => r.try_get("centerUrl").unwrap_or_default(),
        Ok(None) => {
            return json_error(
                StatusCode::NOT_FOUND,
                "CONFIG_NOT_FOUND",
                "词库中心未配置",
            )
            .into_response();
        }
        Err(e) => {
            tracing::error!(error = %e, "query config failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询配置失败",
            )
            .into_response();
        }
    };

    if center_url.is_empty() {
        return json_error(
            StatusCode::NOT_FOUND,
            "CONFIG_NOT_FOUND",
            "词库中心未配置",
        )
        .into_response();
    }

    let client = reqwest::Client::new();
    let url = format!("{}/api/wordbooks/{}", center_url.trim_end_matches('/'), id);

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
                    let detail: Option<CenterWordBookDetail> = data
                        .get("data")
                        .and_then(|v| serde_json::from_value(v.clone()).ok());
                    match detail {
                        Some(d) => Json(SuccessResponse {
                            success: true,
                            data: d,
                        })
                        .into_response(),
                        None => json_error(
                            StatusCode::BAD_GATEWAY,
                            "PARSE_ERROR",
                            "解析词书详情失败",
                        )
                        .into_response(),
                    }
                }
                Err(_) => json_error(
                    StatusCode::BAD_GATEWAY,
                    "PARSE_ERROR",
                    "解析词库中心响应失败",
                )
                .into_response(),
            }
        }
        Err(_) => json_error(
            StatusCode::BAD_GATEWAY,
            "CENTER_UNREACHABLE",
            "无法连接词库中心",
        )
        .into_response(),
    }
}

async fn import_wordbook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<ImportRequest>,
) -> Response {
    let target_type = input.target_type.to_uppercase();
    if target_type != "SYSTEM" && target_type != "USER" {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "targetType必须是SYSTEM或USER",
        )
        .into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let config_row = sqlx::query(
        r#"SELECT "centerUrl" FROM "wordbook_center_config" WHERE "id" = 'default'"#,
    )
    .fetch_optional(proxy.pool())
    .await;

    let center_url: String = match config_row {
        Ok(Some(r)) => r.try_get("centerUrl").unwrap_or_default(),
        Ok(None) => {
            return json_error(
                StatusCode::NOT_FOUND,
                "CONFIG_NOT_FOUND",
                "词库中心未配置",
            )
            .into_response();
        }
        Err(e) => {
            tracing::error!(error = %e, "query config failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询配置失败",
            )
            .into_response();
        }
    };

    if center_url.is_empty() {
        return json_error(
            StatusCode::NOT_FOUND,
            "CONFIG_NOT_FOUND",
            "词库中心未配置",
        )
        .into_response();
    }

    let source_url_to_check = format!("{}/api/wordbooks/{}", center_url.trim_end_matches('/'), id);
    let existing = sqlx::query(
        r#"SELECT "id" FROM "word_books" WHERE "sourceUrl" = $1"#,
    )
    .bind(&source_url_to_check)
    .fetch_optional(proxy.pool())
    .await;

    if let Ok(Some(_)) = existing {
        return json_error(
            StatusCode::CONFLICT,
            "ALREADY_IMPORTED",
            "该词书已导入过",
        )
        .into_response();
    }

    let client = reqwest::Client::new();
    let url = format!("{}/api/wordbooks/{}", center_url.trim_end_matches('/'), id);

    let resp = match client.get(&url).timeout(std::time::Duration::from_secs(60)).send().await {
        Ok(r) => r,
        Err(_) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                "CENTER_UNREACHABLE",
                "无法连接词库中心",
            )
            .into_response();
        }
    };

    if !resp.status().is_success() {
        return json_error(
            StatusCode::BAD_GATEWAY,
            "CENTER_ERROR",
            &format!("词库中心返回错误: {}", resp.status()),
        )
        .into_response();
    }

    let data: serde_json::Value = match resp.json().await {
        Ok(d) => d,
        Err(_) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                "PARSE_ERROR",
                "解析词库中心响应失败",
            )
            .into_response();
        }
    };

    let detail: CenterWordBookDetail = match data
        .get("data")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
    {
        Some(d) => d,
        None => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                "PARSE_ERROR",
                "解析词书详情失败",
            )
            .into_response();
        }
    };

    let wordbook_id = uuid::Uuid::new_v4().to_string();
    let source_url = url.clone();
    let tags_json = serde_json::to_value(&detail.wordbook.tags).unwrap_or(serde_json::json!([]));

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

    let insert_result = sqlx::query(
        r#"INSERT INTO "word_books"
           ("id", "name", "description", "type", "isPublic", "wordCount", "coverImage", "tags", "sourceUrl", "sourceVersion", "importedAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4::"WordBookType", true, 0, $5, $6, $7, $8, NOW(), NOW(), NOW())"#,
    )
    .bind(&wordbook_id)
    .bind(&detail.wordbook.name)
    .bind(&detail.wordbook.description)
    .bind(&target_type)
    .bind(&detail.wordbook.cover_image)
    .bind(&tags_json)
    .bind(&source_url)
    .bind(&detail.wordbook.version)
    .execute(&mut *tx)
    .await;

    if let Err(_) = insert_result {
        let _ = tx.rollback().await;
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "WRITE_ERROR",
            "创建词书失败",
        )
        .into_response();
    }

    let mut imported_count: i64 = 0;
    const BATCH_SIZE: usize = 100;

    for chunk in detail.words.chunks(BATCH_SIZE) {
        if chunk.is_empty() {
            continue;
        }

        let mut query_builder: sqlx::QueryBuilder<sqlx::Postgres> = sqlx::QueryBuilder::new(
            r#"INSERT INTO "words" ("id", "spelling", "phonetic", "meanings", "examples", "audioUrl", "wordBookId", "createdAt", "updatedAt") "#,
        );

        query_builder.push_values(chunk, |mut b, word| {
            let word_id = uuid::Uuid::new_v4().to_string();
            let meanings_json = serde_json::to_value(&word.meanings).unwrap_or(serde_json::json!([]));
            let examples_json = serde_json::to_value(&word.examples).unwrap_or(serde_json::json!([]));
            b.push_bind(word_id)
                .push_bind(&word.spelling)
                .push_bind(&word.phonetic)
                .push_bind(meanings_json)
                .push_bind(examples_json)
                .push_bind(&word.audio_url)
                .push_bind(&wordbook_id)
                .push("NOW()")
                .push("NOW()");
        });

        match query_builder.build().execute(&mut *tx).await {
            Ok(result) => {
                imported_count += result.rows_affected() as i64;
            }
            Err(_) => {
                let _ = tx.rollback().await;
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "IMPORT_ERROR",
                    "导入单词失败",
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
