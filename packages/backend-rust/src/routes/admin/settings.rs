use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;

use crate::db::DatabaseProxy;
use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingItem {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub category: String,
    pub is_secret: bool,
    pub updated_at: String,
    pub updated_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsRequest {
    settings: Vec<UpdateSettingItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingItem {
    key: String,
    value: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_settings))
        .route("/", put(update_settings))
        .route("/embedding", get(get_embedding_settings))
        .route("/embedding", put(update_embedding_settings))
}

async fn require_admin(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(&proxy, &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    if user.role != "admin" && user.role != "ADMIN" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "需要管理员权限",
        ));
    }

    Ok((proxy, user))
}

async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin(&state, &headers).await?;

    let rows = sqlx::query(
        r#"
        SELECT "key", "value", "description", "category", "isSecret",
               "updatedAt"::text, "updatedBy"
        FROM "system_settings"
        ORDER BY "category", "key"
        "#,
    )
    .fetch_all(proxy.pool())
    .await
    .map_err(|e| {
        tracing::warn!(error = %e, "Failed to fetch settings");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取设置失败",
        )
    })?;

    let settings: Vec<SettingItem> = rows
        .into_iter()
        .map(|r| {
            let is_secret: bool = r.get("isSecret");
            let raw_value: String = r.get("value");
            SettingItem {
                key: r.get("key"),
                value: if is_secret && !raw_value.is_empty() {
                    "********".to_string()
                } else {
                    raw_value
                },
                description: r.get("description"),
                category: r.get("category"),
                is_secret,
                updated_at: r.get("updatedAt"),
                updated_by: r.get("updatedBy"),
            }
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: settings,
    }))
}

async fn get_embedding_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_admin(&state, &headers).await?;

    let rows = sqlx::query(
        r#"
        SELECT "key", "value", "description", "category", "isSecret",
               "updatedAt"::text, "updatedBy"
        FROM "system_settings"
        WHERE "category" = 'embedding'
        ORDER BY "key"
        "#,
    )
    .fetch_all(proxy.pool())
    .await
    .map_err(|e| {
        tracing::warn!(error = %e, "Failed to fetch embedding settings");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取设置失败",
        )
    })?;

    let settings: Vec<SettingItem> = rows
        .into_iter()
        .map(|r| {
            let is_secret: bool = r.get("isSecret");
            let raw_value: String = r.get("value");
            SettingItem {
                key: r.get("key"),
                value: if is_secret && !raw_value.is_empty() {
                    "********".to_string()
                } else {
                    raw_value
                },
                description: r.get("description"),
                category: r.get("category"),
                is_secret,
                updated_at: r.get("updatedAt"),
                updated_by: r.get("updatedBy"),
            }
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: settings,
    }))
}

async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_admin(&state, &headers).await?;

    for item in &payload.settings {
        if item.value == "********" {
            continue;
        }

        sqlx::query(
            r#"
            UPDATE "system_settings"
            SET "value" = $1, "updatedAt" = NOW(), "updatedBy" = $2
            WHERE "key" = $3
            "#,
        )
        .bind(&item.value)
        .bind(&user.id)
        .bind(&item.key)
        .execute(proxy.pool())
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, key = %item.key, "Failed to update setting");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "UPDATE_ERROR",
                "更新设置失败",
            )
        })?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: "设置已更新",
    }))
}

async fn update_embedding_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_admin(&state, &headers).await?;

    for item in &payload.settings {
        if !item.key.starts_with("embedding.") {
            continue;
        }
        if item.value == "********" {
            continue;
        }

        sqlx::query(
            r#"
            UPDATE "system_settings"
            SET "value" = $1, "updatedAt" = NOW(), "updatedBy" = $2
            WHERE "key" = $3 AND "category" = 'embedding'
            "#,
        )
        .bind(&item.value)
        .bind(&user.id)
        .bind(&item.key)
        .execute(proxy.pool())
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, key = %item.key, "Failed to update embedding setting");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "UPDATE_ERROR",
                "更新设置失败",
            )
        })?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: "Embedding 设置已更新",
    }))
}

pub async fn get_setting_value(proxy: &DatabaseProxy, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>(r#"SELECT "value" FROM "system_settings" WHERE "key" = $1"#)
        .bind(key)
        .fetch_optional(proxy.pool())
        .await
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
}
