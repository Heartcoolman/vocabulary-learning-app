use std::collections::HashMap;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use chrono::{NaiveDateTime, TimeZone, Utc};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::middleware::RequestDbState;
use crate::response::json_error;
use crate::state::AppState;

#[derive(serde::Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(serde::Serialize)]
struct SuccessMessageResponse {
    success: bool,
    message: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AffectedData {
    affected: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationItem {
    id: String,
    user_id: String,
    #[serde(rename = "type")]
    notification_type: String,
    title: String,
    content: String,
    status: String,
    priority: String,
    metadata: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    read_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationStatsResponse {
    total: i64,
    unread: i64,
    read: i64,
    archived: i64,
    by_type: HashMap<String, i64>,
    by_priority: HashMap<String, i64>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchIdsPayload {
    notification_ids: Vec<String>,
}

pub async fn list_notifications(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let query_string = req.uri().query().unwrap_or("");
    let status = get_query_param(query_string, "status");
    let notification_type = get_query_param(query_string, "type");
    let priority = get_query_param(query_string, "priority");
    let limit = get_query_param(query_string, "limit")
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(50);
    let offset = get_query_param(query_string, "offset")
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(0);
    let start_date = get_query_param(query_string, "startDate")
        .as_deref()
        .and_then(parse_query_datetime);
    let end_date = get_query_param(query_string, "endDate")
        .as_deref()
        .and_then(parse_query_datetime);

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let params = NotificationQueryParams {
        status,
        notification_type,
        priority,
        limit: limit.clamp(1, 200),
        offset: offset.max(0),
        start_date,
        end_date,
    };

    match select_notifications(proxy.as_ref(), request_state, &auth_user.id, &params).await {
        Ok(notifications) => Json(SuccessResponse {
            success: true,
            data: notifications,
            message: None,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select notifications failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn stats(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    match build_stats(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(stats) => Json(SuccessResponse {
            success: true,
            data: stats,
            message: None,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "notification stats failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn get_notification(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let notification_id = extract_notification_id(req.uri().path());
    let Some(notification_id) = notification_id else {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    match select_notification(proxy.as_ref(), request_state, &auth_user.id, &notification_id).await {
        Ok(Some(notification)) => Json(SuccessResponse {
            success: true,
            data: notification,
            message: None,
        })
        .into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "success": false, "error": "通知不存在" }))).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "get notification failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn read_all(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let unread_count = match count_notifications(proxy.as_ref(), request_state, &auth_user.id, Some("UNREAD")).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "count unread notifications failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let now_iso = now_iso_millis();
    if let Err(err) = mark_all_as_read(proxy.as_ref(), request_state, &auth_user.id, &now_iso).await {
        tracing::warn!(error = %err, "mark all as read failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    Json(SuccessResponse {
        success: true,
        data: AffectedData {
            affected: unread_count as u64,
        },
        message: Some(format!("已标记 {unread_count} 条通知为已读")),
    })
    .into_response()
}

pub async fn batch_read(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: BatchIdsPayload = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    if payload.notification_ids.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请提供有效的通知ID数组").into_response();
    }

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    let affected = match mark_many_as_read(proxy.as_ref(), request_state, &auth_user.id, &payload.notification_ids, &now_iso).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "batch mark as read failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: AffectedData { affected },
        message: Some(format!("已标记 {affected} 条通知为已读")),
    })
    .into_response()
}

pub async fn mark_read(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let notification_id = extract_notification_id(req.uri().path());
    let Some(notification_id) = notification_id else {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = update_notification_status(
        proxy.as_ref(),
        request_state,
        &auth_user.id,
        &notification_id,
        NotificationAction::MarkRead { read_at: &now_iso },
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "mark notification read failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    Json(SuccessMessageResponse {
        success: true,
        message: "通知已标记为已读".to_string(),
    })
    .into_response()
}

pub async fn archive(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let notification_id = extract_notification_id(req.uri().path());
    let Some(notification_id) = notification_id else {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = update_notification_status(
        proxy.as_ref(),
        request_state,
        &auth_user.id,
        &notification_id,
        NotificationAction::Archive,
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "archive notification failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    Json(SuccessMessageResponse {
        success: true,
        message: "通知已归档".to_string(),
    })
    .into_response()
}

pub async fn batch_delete(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: BatchIdsPayload = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    if payload.notification_ids.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请提供有效的通知ID数组").into_response();
    }

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    let affected = match mark_many_as_deleted(
        proxy.as_ref(),
        request_state,
        &auth_user.id,
        &payload.notification_ids,
        &now_iso,
    )
    .await
    {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "batch delete notification failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: AffectedData { affected },
        message: Some(format!("已删除 {affected} 条通知")),
    })
    .into_response()
}

pub async fn delete_notification(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let notification_id = extract_notification_id(req.uri().path());
    let Some(notification_id) = notification_id else {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = update_notification_status(
        proxy.as_ref(),
        request_state,
        &auth_user.id,
        &notification_id,
        NotificationAction::Delete,
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "delete notification failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    Json(SuccessMessageResponse {
        success: true,
        message: "通知已删除".to_string(),
    })
    .into_response()
}

struct NotificationQueryParams {
    status: Option<String>,
    notification_type: Option<String>,
    priority: Option<String>,
    limit: i64,
    offset: i64,
    start_date: Option<NaiveDateTime>,
    end_date: Option<NaiveDateTime>,
}

async fn select_notifications(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    params: &NotificationQueryParams,
) -> Result<Vec<NotificationItem>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(sqlx::Error::PoolClosed);
        };

        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"
            SELECT
              "id",
              "userId",
              "type",
              "title",
              "content",
              "status",
              "priority",
              "metadata",
              "readAt",
              "createdAt",
              "updatedAt"
            FROM "notifications"
            WHERE "userId" = 
            "#,
        );
        qb.push_bind(user_id);

        if let Some(status) = params.status.as_deref() {
            qb.push(r#" AND "status" = "#);
            qb.push_bind(status);
        } else {
            qb.push(r#" AND "status" != 'DELETED'"#);
        }

        if let Some(nt) = params.notification_type.as_deref() {
            qb.push(r#" AND "type" = "#);
            qb.push_bind(nt);
        }

        if let Some(priority) = params.priority.as_deref() {
            qb.push(r#" AND "priority" = "#);
            qb.push_bind(priority);
        }

        if let Some(start) = params.start_date {
            qb.push(r#" AND datetime("createdAt") >= datetime("#);
            qb.push_bind(format_sqlite_query_datetime(start));
            qb.push(")");
        }

        if let Some(end) = params.end_date {
            qb.push(r#" AND datetime("createdAt") <= datetime("#);
            qb.push_bind(format_sqlite_query_datetime(end));
            qb.push(")");
        }

        qb.push(
            r#"
            ORDER BY
              CASE "priority"
                WHEN 'URGENT' THEN 3
                WHEN 'HIGH' THEN 2
                WHEN 'NORMAL' THEN 1
                WHEN 'LOW' THEN 0
                ELSE -1
              END DESC,
              datetime("createdAt") DESC
            "#,
        );

        qb.push(" LIMIT ");
        qb.push_bind(params.limit);
        qb.push(" OFFSET ");
        qb.push_bind(params.offset);

        let rows = qb.build().fetch_all(&pool).await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(map_sqlite_notification_row(&row)?);
        }
        Ok(out)
    } else {
        let Some(pool) = primary else {
            return Err(sqlx::Error::PoolClosed);
        };

        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"
            SELECT
              "id",
              "userId",
              "type"::text as "type",
              "title",
              "content",
              "status"::text as "status",
              "priority"::text as "priority",
              "metadata",
              "readAt",
              "createdAt",
              "updatedAt"
            FROM "notifications"
            WHERE "userId" =
            "#,
        );
        qb.push_bind(user_id);

        if let Some(status) = params.status.as_deref() {
            qb.push(r#" AND "status"::text = "#);
            qb.push_bind(status);
        } else {
            qb.push(r#" AND "status"::text != 'DELETED'"#);
        }

        if let Some(nt) = params.notification_type.as_deref() {
            qb.push(r#" AND "type"::text = "#);
            qb.push_bind(nt);
        }

        if let Some(priority) = params.priority.as_deref() {
            qb.push(r#" AND "priority"::text = "#);
            qb.push_bind(priority);
        }

        if let Some(start) = params.start_date {
            qb.push(r#" AND "createdAt" >= "#);
            qb.push_bind(start);
        }

        if let Some(end) = params.end_date {
            qb.push(r#" AND "createdAt" <= "#);
            qb.push_bind(end);
        }

        qb.push(r#" ORDER BY "priority" DESC, "createdAt" DESC"#);
        qb.push(" LIMIT ");
        qb.push_bind(params.limit);
        qb.push(" OFFSET ");
        qb.push_bind(params.offset);

        let rows = qb.build().fetch_all(&pool).await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(map_pg_notification_row(&row)?);
        }
        Ok(out)
    }
}

async fn select_notification(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    notification_id: &str,
) -> Result<Option<NotificationItem>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(sqlx::Error::PoolClosed);
        };

        let row = sqlx::query(
            r#"
            SELECT
              "id",
              "userId",
              "type",
              "title",
              "content",
              "status",
              "priority",
              "metadata",
              "readAt",
              "createdAt",
              "updatedAt"
            FROM "notifications"
            WHERE "id" = ? AND "userId" = ?
            LIMIT 1
            "#,
        )
        .bind(notification_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        Ok(row.map(|row| map_sqlite_notification_row(&row)).transpose()?)
    } else {
        let Some(pool) = primary else {
            return Err(sqlx::Error::PoolClosed);
        };

        let row = sqlx::query(
            r#"
            SELECT
              "id",
              "userId",
              "type"::text as "type",
              "title",
              "content",
              "status"::text as "status",
              "priority"::text as "priority",
              "metadata",
              "readAt",
              "createdAt",
              "updatedAt"
            FROM "notifications"
            WHERE "id" = $1 AND "userId" = $2
            LIMIT 1
            "#,
        )
        .bind(notification_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        Ok(row.map(|row| map_pg_notification_row(&row)).transpose()?)
    }
}

async fn build_stats(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<NotificationStatsResponse, sqlx::Error> {
    let total = count_notifications(proxy, state, user_id, None).await?;
    let unread = count_notifications(proxy, state, user_id, Some("UNREAD")).await?;
    let read = count_notifications(proxy, state, user_id, Some("READ")).await?;
    let archived = count_notifications(proxy, state, user_id, Some("ARCHIVED")).await?;
    let by_type = group_notifications(proxy, state, user_id, "type").await?;
    let by_priority = group_notifications(proxy, state, user_id, "priority").await?;

    Ok(NotificationStatsResponse {
        total,
        unread,
        read,
        archived,
        by_type,
        by_priority,
    })
}

async fn count_notifications(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    status: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(sqlx::Error::PoolClosed);
        };

        if let Some(status) = status {
            let count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = ? AND "status" = ?"#,
            )
            .bind(user_id)
            .bind(status)
            .fetch_one(&pool)
            .await?;
            Ok(count)
        } else {
            let count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = ? AND "status" != 'DELETED'"#,
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await?;
            Ok(count)
        }
    } else {
        let Some(pool) = primary else {
            return Err(sqlx::Error::PoolClosed);
        };

        if let Some(status) = status {
            let count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = $1 AND "status"::text = $2"#,
            )
            .bind(user_id)
            .bind(status)
            .fetch_one(&pool)
            .await?;
            Ok(count)
        } else {
            let count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = $1 AND "status"::text != 'DELETED'"#,
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await?;
            Ok(count)
        }
    }
}

async fn group_notifications(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    column: &'static str,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Err(sqlx::Error::PoolClosed);
        };

        let sql = format!(
            r#"SELECT "{column}" as "key", COUNT(*) as "count"
               FROM "notifications"
               WHERE "userId" = ? AND "status" != 'DELETED'
               GROUP BY "{column}""#
        );

        let rows = sqlx::query(&sql).bind(user_id).fetch_all(&pool).await?;
        let mut out = HashMap::new();
        for row in rows {
            let key: String = row.try_get("key")?;
            let count: i64 = row.try_get("count")?;
            out.insert(key, count);
        }
        Ok(out)
    } else {
        let Some(pool) = primary else {
            return Err(sqlx::Error::PoolClosed);
        };

        let sql = format!(
            r#"SELECT "{column}"::text as "key", COUNT(*) as "count"
               FROM "notifications"
               WHERE "userId" = $1 AND "status"::text != 'DELETED'
               GROUP BY "{column}""#
        );

        let rows = sqlx::query(&sql).bind(user_id).fetch_all(&pool).await?;
        let mut out = HashMap::new();
        for row in rows {
            let key: String = row.try_get("key")?;
            let count: i64 = row.try_get("count")?;
            out.insert(key, count);
        }
        Ok(out)
    }
}

enum NotificationAction<'a> {
    MarkRead { read_at: &'a str },
    Archive,
    Delete,
}

async fn update_notification_status(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    notification_id: &str,
    action: NotificationAction<'_>,
    now_iso: &str,
) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(notification_id.to_string()));
        where_clause.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));

        let mut data = serde_json::Map::new();
        match action {
            NotificationAction::MarkRead { read_at } => {
                data.insert("status".to_string(), serde_json::Value::String("READ".to_string()));
                data.insert("readAt".to_string(), serde_json::Value::String(read_at.to_string()));
            }
            NotificationAction::Archive => {
                data.insert("status".to_string(), serde_json::Value::String("ARCHIVED".to_string()));
            }
            NotificationAction::Delete => {
                data.insert("status".to_string(), serde_json::Value::String("DELETED".to_string()));
            }
        }
        data.insert("updatedAt".to_string(), serde_json::Value::String(now_iso.to_string()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "notifications".to_string(),
            r#where: where_clause,
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map(|_| ())
            .map_err(|err| err.to_string())
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        match action {
            NotificationAction::MarkRead { .. } => {
                sqlx::query(
                    r#"
                    UPDATE "notifications"
                    SET "status" = 'READ', "readAt" = $1, "updatedAt" = $2
                    WHERE "id" = $3 AND "userId" = $4
                    "#,
                )
                .bind(now)
                .bind(now)
                .bind(notification_id)
                .bind(user_id)
                .execute(&primary)
                .await
                .map(|_| ())
                .map_err(|err| err.to_string())
            }
            NotificationAction::Archive => {
                sqlx::query(
                    r#"
                    UPDATE "notifications"
                    SET "status" = 'ARCHIVED', "updatedAt" = $1
                    WHERE "id" = $2 AND "userId" = $3
                    "#,
                )
                .bind(now)
                .bind(notification_id)
                .bind(user_id)
                .execute(&primary)
                .await
                .map(|_| ())
                .map_err(|err| err.to_string())
            }
            NotificationAction::Delete => {
                sqlx::query(
                    r#"
                    UPDATE "notifications"
                    SET "status" = 'DELETED', "updatedAt" = $1
                    WHERE "id" = $2 AND "userId" = $3
                    "#,
                )
                .bind(now)
                .bind(notification_id)
                .bind(user_id)
                .execute(&primary)
                .await
                .map(|_| ())
                .map_err(|err| err.to_string())
            }
        }
    }
}

async fn mark_all_as_read(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    now_iso: &str,
) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        where_clause.insert("status".to_string(), serde_json::Value::String("UNREAD".to_string()));

        let mut data = serde_json::Map::new();
        data.insert("status".to_string(), serde_json::Value::String("READ".to_string()));
        data.insert("readAt".to_string(), serde_json::Value::String(now_iso.to_string()));
        data.insert("updatedAt".to_string(), serde_json::Value::String(now_iso.to_string()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "notifications".to_string(),
            r#where: where_clause,
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map(|_| ())
            .map_err(|err| err.to_string())
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        sqlx::query(
            r#"
            UPDATE "notifications"
            SET "status" = 'READ', "readAt" = $1, "updatedAt" = $2
            WHERE "userId" = $3 AND "status" = 'UNREAD'
            "#,
        )
        .bind(now)
        .bind(now)
        .bind(user_id)
        .execute(&primary)
        .await
        .map(|_| ())
        .map_err(|err| err.to_string())
    }
}

async fn mark_many_as_read(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    ids: &[String],
    now_iso: &str,
) -> Result<u64, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    if proxy.sqlite_enabled() {
        for id in ids {
            update_notification_status(
                proxy,
                state,
                user_id,
                id,
                NotificationAction::MarkRead { read_at: now_iso },
                now_iso,
            )
            .await?;
        }
        Ok(ids.len() as u64)
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"UPDATE "notifications" SET "status" = 'READ', "readAt" = "#,
        );
        qb.push_bind(now);
        qb.push(r#", "updatedAt" = "#);
        qb.push_bind(now);
        qb.push(r#" WHERE "userId" = "#);
        qb.push_bind(user_id);
        qb.push(r#" AND "id" IN ("#);
        let mut separated = qb.separated(", ");
        for id in ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");

        let result = qb.build().execute(&primary).await.map_err(|err| err.to_string())?;
        Ok(result.rows_affected())
    }
}

async fn mark_many_as_deleted(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    ids: &[String],
    now_iso: &str,
) -> Result<u64, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    if proxy.sqlite_enabled() {
        for id in ids {
            update_notification_status(proxy, state, user_id, id, NotificationAction::Delete, now_iso).await?;
        }
        Ok(ids.len() as u64)
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        let mut qb =
            QueryBuilder::<sqlx::Postgres>::new(r#"UPDATE "notifications" SET "status" = 'DELETED', "updatedAt" = "#);
        qb.push_bind(now);
        qb.push(r#" WHERE "userId" = "#);
        qb.push_bind(user_id);
        qb.push(r#" AND "id" IN ("#);
        let mut separated = qb.separated(", ");
        for id in ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");

        let result = qb.build().execute(&primary).await.map_err(|err| err.to_string())?;
        Ok(result.rows_affected())
    }
}

fn extract_notification_id(path: &str) -> Option<String> {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 3 {
        return None;
    }
    if segments[0] != "api" || segments[1] != "notifications" {
        return None;
    }
    let id = segments[2].trim();
    if id.is_empty() {
        None
    } else {
        Some(id.to_string())
    }
}

fn map_pg_notification_row(row: &sqlx::postgres::PgRow) -> Result<NotificationItem, sqlx::Error> {
    let id: String = row.try_get("id")?;
    let user_id: String = row.try_get("userId")?;
    let notification_type: String = row.try_get("type")?;
    let title: String = row.try_get("title")?;
    let content: String = row.try_get("content")?;
    let status: String = row.try_get("status")?;
    let priority: String = row.try_get("priority")?;
    let metadata: Option<serde_json::Value> = row.try_get("metadata")?;
    let read_at: Option<NaiveDateTime> = row.try_get("readAt")?;
    let created_at: NaiveDateTime = row.try_get("createdAt")?;
    let updated_at: NaiveDateTime = row.try_get("updatedAt")?;

    Ok(NotificationItem {
        id,
        user_id,
        notification_type,
        title,
        content,
        status,
        priority,
        metadata,
        read_at: read_at.map(crate::auth::format_naive_datetime_iso_millis),
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
    })
}

fn map_sqlite_notification_row(row: &sqlx::sqlite::SqliteRow) -> Result<NotificationItem, sqlx::Error> {
    let id: String = row.try_get("id")?;
    let user_id: String = row.try_get("userId")?;
    let notification_type: String = row.try_get("type")?;
    let title: String = row.try_get("title")?;
    let content: String = row.try_get("content")?;
    let status: String = row.try_get("status")?;
    let priority: String = row.try_get("priority")?;
    let metadata_raw: Option<String> = row.try_get("metadata")?;
    let read_at_raw: Option<String> = row.try_get("readAt")?;
    let created_raw: String = row.try_get("createdAt")?;
    let updated_raw: String = row.try_get("updatedAt")?;

    let metadata = metadata_raw.map(|raw| serde_json::from_str::<serde_json::Value>(&raw).unwrap_or(serde_json::Value::String(raw)));
    let read_at = read_at_raw.map(|raw| format_sqlite_datetime(&raw));

    Ok(NotificationItem {
        id,
        user_id,
        notification_type,
        title,
        content,
        status,
        priority,
        metadata,
        read_at,
        created_at: format_sqlite_datetime(&created_raw),
        updated_at: format_sqlite_datetime(&updated_raw),
    })
}

fn now_iso_millis() -> String {
    crate::auth::format_naive_datetime_iso_millis(Utc::now().naive_utc())
}

fn parse_naive_datetime(value: &str) -> Option<NaiveDateTime> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|dt| dt.naive_utc())
}

fn parse_query_datetime(value: &str) -> Option<NaiveDateTime> {
    let ms = crate::auth::parse_sqlite_datetime_ms(value)?;
    Utc.timestamp_millis_opt(ms).single().map(|dt| dt.naive_utc())
}

fn format_sqlite_query_datetime(value: NaiveDateTime) -> String {
    value.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn format_sqlite_datetime(raw: &str) -> String {
    let ms = crate::auth::parse_sqlite_datetime_ms(raw).unwrap_or_else(|| Utc::now().timestamp_millis());
    crate::auth::format_timestamp_ms_iso_millis(ms).unwrap_or_else(|| now_iso_millis())
}

fn get_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut iter = pair.splitn(2, '=');
        let k = iter.next().unwrap_or("");
        if k != key {
            continue;
        }
        let value = iter.next().unwrap_or("");
        return Some(percent_decode(value));
    }
    None
}

fn percent_decode(input: &str) -> String {
    let mut out: Vec<u8> = Vec::with_capacity(input.len());
    let mut bytes = input.as_bytes().iter().copied();
    while let Some(b) = bytes.next() {
        match b {
            b'+' => out.push(b' '),
            b'%' => {
                let hi = bytes.next();
                let lo = bytes.next();
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    if let (Some(hi), Some(lo)) = (from_hex(hi), from_hex(lo)) {
                        out.push(hi * 16 + lo);
                        continue;
                    }
                }
                out.push(b'%');
                if let Some(hi) = hi {
                    out.push(hi);
                }
                if let Some(lo) = lo {
                    out.push(lo);
                }
            }
            other => out.push(other),
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn from_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

async fn split_body(req: Request<Body>) -> Result<(axum::http::request::Parts, Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求").into_response());
        }
    };
    Ok((parts, body_bytes))
}
