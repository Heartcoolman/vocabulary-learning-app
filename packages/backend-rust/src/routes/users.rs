use std::collections::HashMap;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, Local, NaiveDateTime, SecondsFormat, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::middleware::RequestDbState;
use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct MessageResponse {
    success: bool,
    message: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MeResponse {
    id: String,
    email: String,
    username: String,
    role: String,
    reward_profile: String,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatisticsResponse {
    total_words: i64,
    total_records: i64,
    correct_count: i64,
    accuracy: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct V1ProfileResponse {
    id: String,
    username: String,
    email: String,
    reward_profile: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RewardProfileItem {
    id: &'static str,
    name: &'static str,
    description: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RewardProfilesResponse {
    current_profile: String,
    available_profiles: &'static [RewardProfileItem],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningHistoryItem {
    hour: i32,
    performance: f64,
    sample_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChronotypeProfile {
    category: &'static str,
    peak_hours: Vec<i32>,
    confidence: f64,
    sample_count: i64,
    learning_history: Vec<LearningHistoryItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningStyleScores {
    visual: f64,
    auditory: f64,
    kinesthetic: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningStyleInteractionPatterns {
    avg_dwell_time: f64,
    avg_response_time: f64,
    pause_frequency: f64,
    switch_frequency: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningStyleProfile {
    style: &'static str,
    confidence: f64,
    sample_count: i64,
    scores: LearningStyleScores,
    interaction_patterns: LearningStyleInteractionPatterns,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CognitiveProfileResponse {
    chronotype: Option<ChronotypeProfile>,
    learning_style: Option<LearningStyleProfile>,
}

#[derive(Debug, Deserialize)]
struct UpdatePasswordRequest {
    old_password: String,
    new_password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRewardProfileRequest {
    profile_id: String,
}

const REWARD_PROFILES: &[RewardProfileItem] = &[
    RewardProfileItem {
        id: "standard",
        name: "标准模式",
        description: "平衡长期记忆和学习体验",
    },
    RewardProfileItem {
        id: "cram",
        name: "突击模式",
        description: "最大化短期记忆，适合考前冲刺",
    },
    RewardProfileItem {
        id: "relaxed",
        name: "轻松模式",
        description: "降低压力，保持学习动力",
    },
];

fn is_valid_reward_profile_id(profile_id: &str) -> bool {
    matches!(profile_id, "standard" | "cram" | "relaxed")
}

pub async fn me(
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

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let user = match select_user_me(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "user me query failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: user,
    })
    .into_response()
}

pub async fn statistics(
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

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let stats = match select_user_statistics(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "user statistics query failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: stats,
    })
    .into_response()
}

pub async fn v1_me_profile(
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

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let user = match select_user_me(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(value)) => value,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "user profile query failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: V1ProfileResponse {
            id: user.id,
            username: user.username,
            email: user.email,
            reward_profile: user.reward_profile,
            created_at: user.created_at,
        },
    })
    .into_response()
}

pub async fn reward_profile(
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

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let current_profile = match select_user_reward_profile(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(profile)) => profile,
        Ok(None) => "standard".to_string(),
        Err(err) => {
            tracing::warn!(error = %err, "reward profile lookup failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: RewardProfilesResponse {
            current_profile,
            available_profiles: REWARD_PROFILES,
        },
    })
    .into_response()
}

pub async fn v1_reward_profile(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    reward_profile(State(state), req).await
}

pub async fn update_reward_profile(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    update_reward_profile_inner(state, req, false).await
}

pub async fn v1_update_reward_profile(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    update_reward_profile_inner(state, req, true).await
}

async fn update_reward_profile_inner(state: AppState, req: Request<Body>, v1: bool) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: UpdateRewardProfileRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    if payload.profile_id.is_empty() || !is_valid_reward_profile_id(&payload.profile_id) {
        if v1 {
            return json_error(
                StatusCode::BAD_REQUEST,
                "INVALID_PROFILE_ID",
                "无效的学习模式 ID。有效值: standard, cram, relaxed",
            )
            .into_response();
        }
        return json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "Invalid profile ID. Valid values: standard, cram, relaxed",
        )
        .into_response();
    }

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(auth_user.id.clone()));

        let mut data = serde_json::Map::new();
        data.insert(
            "rewardProfile".to_string(),
            serde_json::Value::String(payload.profile_id.clone()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "users".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        if let Err(err) = proxy.write_operation(request_state, op).await {
            tracing::warn!(error = %err, "reward profile update write failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
        };

        let now = Utc::now().naive_utc();
        if let Err(err) = sqlx::query(
            r#"
            UPDATE "users"
            SET "rewardProfile" = $1, "updatedAt" = $2
            WHERE "id" = $3
            "#,
        )
        .bind(&payload.profile_id)
        .bind(now)
        .bind(&auth_user.id)
        .execute(&primary)
        .await
        {
            tracing::warn!(error = %err, "reward profile update failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    }

    Json(SuccessResponse {
        success: true,
        data: serde_json::json!({
            "currentProfile": payload.profile_id,
            "message": "学习模式已更新",
        }),
    })
    .into_response()
}

pub async fn chronotype(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    cognitive_part(State(state), req, CognitivePart::Chronotype).await
}

pub async fn learning_style(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    cognitive_part(State(state), req, CognitivePart::LearningStyle).await
}

pub async fn cognitive(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    cognitive_part(State(state), req, CognitivePart::Combined).await
}

#[derive(Clone, Copy)]
enum CognitivePart {
    Chronotype,
    LearningStyle,
    Combined,
}

async fn cognitive_part(
    State(state): State<AppState>,
    req: Request<Body>,
    part: CognitivePart,
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

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match part {
        CognitivePart::Chronotype => {
            let profile = match compute_chronotype(proxy.as_ref(), request_state, &auth_user.id).await {
                Ok(profile) => profile,
                Err(err) => {
                    tracing::warn!(error = %err, "chronotype compute failed");
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
                }
            };

            let data = if profile.sample_count < 20 { None } else { Some(profile) };
            Json(SuccessResponse {
                success: true,
                data,
            })
            .into_response()
        }
        CognitivePart::LearningStyle => {
            let profile = match compute_learning_style(proxy.as_ref(), request_state, &auth_user.id).await {
                Ok(profile) => profile,
                Err(err) => {
                    tracing::warn!(error = %err, "learning style compute failed");
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
                }
            };

            let data = if profile.sample_count < 20 { None } else { Some(profile) };
            Json(SuccessResponse {
                success: true,
                data,
            })
            .into_response()
        }
        CognitivePart::Combined => {
            let chronotype = match compute_chronotype(proxy.as_ref(), request_state, &auth_user.id).await {
                Ok(profile) if profile.sample_count >= 20 => Some(profile),
                Ok(_) => None,
                Err(err) => {
                    tracing::warn!(error = %err, "chronotype compute failed");
                    None
                }
            };

            let learning_style = match compute_learning_style(proxy.as_ref(), request_state, &auth_user.id).await {
                Ok(profile) if profile.sample_count >= 20 => Some(profile),
                Ok(_) => None,
                Err(err) => {
                    tracing::warn!(error = %err, "learning style compute failed");
                    None
                }
            };

            Json(SuccessResponse {
                success: true,
                data: CognitiveProfileResponse {
                    chronotype,
                    learning_style,
                },
            })
            .into_response()
        }
    }
}

pub async fn update_password(
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

    let payload: UpdatePasswordRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    if payload.old_password.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "旧密码不能为空").into_response();
    }

    if let Some(message) = validate_register_password(&payload.new_password) {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response();
    }

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let password_hash = match select_user_password_hash(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(hash)) => hash,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "password lookup failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let old_ok = bcrypt::verify(&payload.old_password, &password_hash).unwrap_or(false);
    if !old_ok {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "旧密码不正确").into_response();
    }

    let new_hash = match bcrypt::hash(&payload.new_password, 10) {
        Ok(hash) => hash,
        Err(_) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(auth_user.id.clone()));

        let mut data = serde_json::Map::new();
        data.insert("passwordHash".to_string(), serde_json::Value::String(new_hash));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "users".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        if let Err(err) = proxy.write_operation(request_state, op).await {
            tracing::warn!(error = %err, "password update write failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }

        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".to_string(), serde_json::Value::String(auth_user.id.clone()));

        let op = crate::db::dual_write_manager::WriteOperation::Delete {
            table: "sessions".to_string(),
            r#where: where_clause,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        if let Err(err) = proxy.write_operation(request_state, op).await {
            tracing::warn!(error = %err, "session cleanup failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
        };

        let now = Utc::now().naive_utc();
        if let Err(err) = sqlx::query(
            r#"
            UPDATE "users"
            SET "passwordHash" = $1, "updatedAt" = $2
            WHERE "id" = $3
            "#,
        )
        .bind(&new_hash)
        .bind(now)
        .bind(&auth_user.id)
        .execute(&primary)
        .await
        {
            tracing::warn!(error = %err, "password update failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }

        if let Err(err) = sqlx::query(r#"DELETE FROM "sessions" WHERE "userId" = $1"#)
            .bind(&auth_user.id)
            .execute(&primary)
            .await
        {
            tracing::warn!(error = %err, "session delete failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    }

    Json(MessageResponse {
        success: true,
        message: "密码修改成功",
    })
    .into_response()
}

async fn select_user_me(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<Option<MeResponse>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };

        let row = sqlx::query(
            r#"
            SELECT
              "id",
              "email",
              "username",
              "role",
              "rewardProfile",
              "createdAt",
              "updatedAt"
            FROM "users"
            WHERE "id" = ?
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let created_raw: String = row.try_get("createdAt")?;
        let updated_raw: String = row.try_get("updatedAt")?;

        let created_ms = crate::auth::parse_sqlite_datetime_ms(&created_raw).unwrap_or_else(|| Utc::now().timestamp_millis());
        let updated_ms = crate::auth::parse_sqlite_datetime_ms(&updated_raw).unwrap_or_else(|| Utc::now().timestamp_millis());

        let created_at = crate::auth::format_timestamp_ms_iso_millis(created_ms)
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        let updated_at = crate::auth::format_timestamp_ms_iso_millis(updated_ms)
            .unwrap_or_else(|| Utc::now().to_rfc3339());

        Ok(Some(MeResponse {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
            role: row.try_get("role")?,
            reward_profile: row.try_get::<Option<String>, _>("rewardProfile")?.unwrap_or_else(|| "standard".to_string()),
            created_at,
            updated_at,
        }))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };

        let row = sqlx::query(
            r#"
            SELECT
              "id",
              "email",
              "username",
              "role"::text as "role",
              "rewardProfile",
              "createdAt",
              "updatedAt"
            FROM "users"
            WHERE "id" = $1
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let created_at: NaiveDateTime = row.try_get("createdAt")?;
        let updated_at: NaiveDateTime = row.try_get("updatedAt")?;

        Ok(Some(MeResponse {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            username: row.try_get("username")?,
            role: row.try_get("role")?,
            reward_profile: row.try_get::<Option<String>, _>("rewardProfile")?.unwrap_or_else(|| "standard".to_string()),
            created_at: format_naive_iso(created_at),
            updated_at: format_naive_iso(updated_at),
        }))
    }
}

async fn select_user_reward_profile(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(r#"SELECT "rewardProfile" FROM "users" WHERE "id" = ? LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<Option<String>, _>("rewardProfile").ok()).flatten())
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(r#"SELECT "rewardProfile" FROM "users" WHERE "id" = $1 LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<Option<String>, _>("rewardProfile").ok()).flatten())
    }
}

async fn select_user_password_hash(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(None);
        };
        let row = sqlx::query(r#"SELECT "passwordHash" FROM "users" WHERE "id" = ? LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("passwordHash").ok()))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };
        let row = sqlx::query(r#"SELECT "passwordHash" FROM "users" WHERE "id" = $1 LIMIT 1"#)
            .bind(user_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("passwordHash").ok()))
    }
}

async fn select_user_statistics(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<StatisticsResponse, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(StatisticsResponse {
                total_words: 0,
                total_records: 0,
                correct_count: 0,
                accuracy: 0.0,
            });
        };

        let word_books: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT "id"
            FROM "word_books"
            WHERE "type" = 'SYSTEM' OR ("type" = 'USER' AND "userId" = ?)
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let total_words = count_words_sqlite(&pool, &word_books).await.unwrap_or(0);

        let total_records: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = ?"#)
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

        let correct_count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = ? AND "isCorrect" = 1"#,
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        Ok(build_accuracy(total_words, total_records, correct_count))
    } else {
        let Some(pool) = primary else {
            return Ok(StatisticsResponse {
                total_words: 0,
                total_records: 0,
                correct_count: 0,
                accuracy: 0.0,
            });
        };

        let word_books: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT "id"
            FROM "word_books"
            WHERE ("type"::text = 'SYSTEM') OR (("type"::text = 'USER') AND "userId" = $1)
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let total_words = count_words_postgres(&pool, &word_books).await.unwrap_or(0);

        let total_records: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

        let correct_count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1 AND "isCorrect" = true"#,
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        Ok(build_accuracy(total_words, total_records, correct_count))
    }
}

fn build_accuracy(total_words: i64, total_records: i64, correct_count: i64) -> StatisticsResponse {
    let accuracy = if total_records > 0 {
        (correct_count as f64 / total_records as f64) * 100.0
    } else {
        0.0
    };
    let accuracy = (accuracy * 100.0).round() / 100.0;

    StatisticsResponse {
        total_words,
        total_records,
        correct_count,
        accuracy,
    }
}

struct AnswerRecordChrono {
    timestamp_ms: i64,
    is_correct: bool,
}

struct AnswerRecordInteraction {
    timestamp_ms: i64,
    dwell_time: i64,
    response_time: Option<i64>,
}

async fn compute_chronotype(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<ChronotypeProfile, sqlx::Error> {
    let records = fetch_answer_records_for_chronotype(proxy, state, user_id).await?;

    let mut hourly_data: HashMap<i32, (i64, i64)> = HashMap::new();
    for record in records {
        let hour = Local
            .timestamp_millis_opt(record.timestamp_ms)
            .single()
            .map(|dt| dt.hour() as i32)
            .unwrap_or(0);

        let entry = hourly_data.entry(hour).or_insert((0, 0));
        entry.1 += 1;
        if record.is_correct {
            entry.0 += 1;
        }
    }

    let mut learning_history: Vec<LearningHistoryItem> = hourly_data
        .into_iter()
        .filter_map(|(hour, (correct, total))| {
            if total == 0 {
                None
            } else {
                Some(LearningHistoryItem {
                    hour,
                    performance: correct as f64 / total as f64,
                    sample_count: total,
                })
            }
        })
        .collect();
    learning_history.sort_by_key(|item| item.hour);

    let total_samples: i64 = learning_history.iter().map(|item| item.sample_count).sum();
    if total_samples < 20 {
        return Ok(ChronotypeProfile {
            category: "intermediate",
            peak_hours: vec![9, 10, 14, 15, 16],
            confidence: 0.3,
            sample_count: total_samples,
            learning_history,
        });
    }

    let morning = average_performance(&learning_history, &[6, 7, 8, 9, 10]);
    let afternoon = average_performance(&learning_history, &[14, 15, 16, 17, 18]);
    let evening = average_performance(&learning_history, &[19, 20, 21, 22]);

    let perf_variance = variance(&[morning, afternoon, evening]);
    let sample_confidence = (total_samples as f64 / 100.0).min(1.0);
    let difference_confidence = if perf_variance > 0.01 { 0.8 } else { 0.5 };
    let confidence = (sample_confidence + difference_confidence) / 2.0;

    if morning > afternoon && morning > evening {
        Ok(ChronotypeProfile {
            category: "morning",
            peak_hours: identify_peak_hours(&learning_history, &[6, 7, 8, 9, 10, 11]),
            confidence,
            sample_count: total_samples,
            learning_history,
        })
    } else if evening > morning && evening > afternoon {
        Ok(ChronotypeProfile {
            category: "evening",
            peak_hours: identify_peak_hours(&learning_history, &[18, 19, 20, 21, 22, 23]),
            confidence,
            sample_count: total_samples,
            learning_history,
        })
    } else {
        Ok(ChronotypeProfile {
            category: "intermediate",
            peak_hours: identify_peak_hours(&learning_history, &[10, 11, 14, 15, 16, 17]),
            confidence: confidence * 0.8,
            sample_count: total_samples,
            learning_history,
        })
    }
}

fn average_performance(history: &[LearningHistoryItem], hours: &[i32]) -> f64 {
    let mut total_samples = 0i64;
    let mut weighted_sum = 0.0f64;

    for item in history {
        if hours.contains(&item.hour) {
            total_samples += item.sample_count;
            weighted_sum += item.performance * item.sample_count as f64;
        }
    }

    if total_samples == 0 {
        0.0
    } else {
        weighted_sum / total_samples as f64
    }
}

fn identify_peak_hours(history: &[LearningHistoryItem], candidate_hours: &[i32]) -> Vec<i32> {
    let mut candidates: Vec<&LearningHistoryItem> = history
        .iter()
        .filter(|item| candidate_hours.contains(&item.hour))
        .collect();

    if candidates.is_empty() {
        return candidate_hours.iter().copied().take(4).collect();
    }

    candidates.sort_by(|a, b| {
        b.performance
            .partial_cmp(&a.performance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut hours: Vec<i32> = candidates.iter().take(4).map(|item| item.hour).collect();
    hours.sort_unstable();
    hours
}

fn variance(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let mean = values.iter().sum::<f64>() / values.len() as f64;
    values
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / values.len() as f64
}

async fn fetch_answer_records_for_chronotype(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<Vec<AnswerRecordChrono>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };

        let rows = sqlx::query(
            r#"
            SELECT CAST("timestamp" AS TEXT) AS "timestamp", "isCorrect"
            FROM "answer_records"
            WHERE "userId" = ?
            ORDER BY "timestamp" DESC
            LIMIT 500
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        let mut records = Vec::with_capacity(rows.len());
        for row in rows {
            let ts: String = row.try_get("timestamp")?;
            let Some(timestamp_ms) = crate::auth::parse_sqlite_datetime_ms(&ts) else {
                continue;
            };
            let is_correct_num: i64 = row.try_get("isCorrect")?;
            records.push(AnswerRecordChrono {
                timestamp_ms,
                is_correct: is_correct_num != 0,
            });
        }
        Ok(records)
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };

        let rows = sqlx::query(
            r#"
            SELECT "timestamp", "isCorrect"
            FROM "answer_records"
            WHERE "userId" = $1
            ORDER BY "timestamp" DESC
            LIMIT 500
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        let mut records = Vec::with_capacity(rows.len());
        for row in rows {
            let timestamp: NaiveDateTime = row.try_get("timestamp")?;
            let timestamp_ms = DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc).timestamp_millis();
            let is_correct: bool = row.try_get("isCorrect")?;
            records.push(AnswerRecordChrono { timestamp_ms, is_correct });
        }
        Ok(records)
    }
}

async fn compute_learning_style(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<LearningStyleProfile, sqlx::Error> {
    let interactions = fetch_answer_records_for_learning_style(proxy, state, user_id).await?;
    let sample_count = interactions.len() as i64;

    if interactions.is_empty() {
        return Ok(LearningStyleProfile {
            style: "mixed",
            confidence: 0.3,
            sample_count: 0,
            scores: LearningStyleScores {
                visual: 0.33,
                auditory: 0.33,
                kinesthetic: 0.33,
            },
            interaction_patterns: LearningStyleInteractionPatterns {
                avg_dwell_time: 0.0,
                avg_response_time: 0.0,
                pause_frequency: 0.0,
                switch_frequency: 0.0,
            },
        });
    }

    let avg_dwell_time =
        interactions.iter().map(|r| r.dwell_time as f64).sum::<f64>() / interactions.len() as f64;
    let avg_response_time = interactions
        .iter()
        .map(|r| r.response_time.unwrap_or(0) as f64)
        .sum::<f64>()
        / interactions.len() as f64;

    let dwell_variance = interactions
        .iter()
        .map(|r| {
            let diff = r.dwell_time as f64 - avg_dwell_time;
            diff * diff
        })
        .sum::<f64>()
        / interactions.len() as f64;

    let response_variance = interactions
        .iter()
        .map(|r| {
            let diff = r.response_time.unwrap_or(0) as f64 - avg_response_time;
            diff * diff
        })
        .sum::<f64>()
        / interactions.len() as f64;

    let mut pause_count = 0i64;
    for i in 1..interactions.len() {
        let gap = interactions[i - 1].timestamp_ms - interactions[i].timestamp_ms;
        if gap > 30_000 {
            pause_count += 1;
        }
    }

    let mut switch_count = 0i64;
    for i in 1..interactions.len() {
        let prev = response_or_avg(interactions[i - 1].response_time, avg_response_time);
        let curr = response_or_avg(interactions[i].response_time, avg_response_time);
        if prev > 0.0 && curr > 0.0 && (curr / prev > 2.0 || prev / curr > 2.0) {
            switch_count += 1;
        }
    }

    if sample_count < 50 {
        return Ok(LearningStyleProfile {
            style: "mixed",
            confidence: 0.3,
            sample_count,
            scores: LearningStyleScores {
                visual: 0.33,
                auditory: 0.33,
                kinesthetic: 0.33,
            },
            interaction_patterns: LearningStyleInteractionPatterns {
                avg_dwell_time,
                avg_response_time,
                pause_frequency: 0.0,
                switch_frequency: 0.0,
            },
        });
    }

    let mut scores = LearningStyleScores {
        visual: compute_visual_score(avg_dwell_time),
        auditory: compute_auditory_score(avg_dwell_time, dwell_variance, pause_count, sample_count),
        kinesthetic: compute_kinesthetic_score(avg_response_time, response_variance, switch_count, sample_count),
    };

    let total_score = scores.visual + scores.auditory + scores.kinesthetic;
    if total_score > 0.0 {
        scores.visual /= total_score;
        scores.auditory /= total_score;
        scores.kinesthetic /= total_score;
    }

    let normalized_max = scores
        .visual
        .max(scores.auditory.max(scores.kinesthetic));

    let pause_frequency = pause_count as f64 / sample_count as f64;
    let switch_frequency = switch_count as f64 / sample_count as f64;

    if normalized_max < 0.4 {
        return Ok(LearningStyleProfile {
            style: "mixed",
            confidence: 0.5,
            sample_count,
            scores,
            interaction_patterns: LearningStyleInteractionPatterns {
                avg_dwell_time,
                avg_response_time,
                pause_frequency,
                switch_frequency,
            },
        });
    }

    let style = if scores.visual == normalized_max {
        "visual"
    } else if scores.auditory == normalized_max {
        "auditory"
    } else {
        "kinesthetic"
    };

    Ok(LearningStyleProfile {
        style,
        confidence: normalized_max.min(0.9),
        sample_count,
        scores,
        interaction_patterns: LearningStyleInteractionPatterns {
            avg_dwell_time,
            avg_response_time,
            pause_frequency,
            switch_frequency,
        },
    })
}

fn response_or_avg(value: Option<i64>, avg: f64) -> f64 {
    match value {
        Some(value) if value > 0 => value as f64,
        _ => avg,
    }
}

fn compute_visual_score(avg_dwell_time: f64) -> f64 {
    let optimal_dwell_time = 5000.0;
    let dwell_score = (avg_dwell_time / optimal_dwell_time).min(1.0);
    let deliberate_score = if avg_dwell_time > 3000.0 { 0.3 } else { 0.0 };
    (dwell_score + deliberate_score).min(1.0)
}

fn compute_auditory_score(avg_dwell_time: f64, dwell_variance: f64, pause_count: i64, sample_count: i64) -> f64 {
    let dwell_std_dev = dwell_variance.sqrt();
    let coefficient_of_variation = if avg_dwell_time > 0.0 {
        dwell_std_dev / avg_dwell_time
    } else {
        1.0
    };

    let stability_score = if coefficient_of_variation < 0.3 {
        0.4
    } else if coefficient_of_variation < 0.5 {
        0.25
    } else {
        0.1
    };

    let dwell_score = if avg_dwell_time >= 3000.0 && avg_dwell_time <= 6000.0 {
        0.3
    } else {
        0.1
    };

    let pause_rate = pause_count as f64 / sample_count as f64;
    let pause_score = if pause_rate > 0.1 { 0.2 } else { 0.1 };

    let sum: f64 = stability_score + dwell_score + pause_score;
    sum.min(1.0_f64)
}

fn compute_kinesthetic_score(
    avg_response_time: f64,
    response_variance: f64,
    switch_count: i64,
    sample_count: i64,
) -> f64 {
    let speed_score = if avg_response_time < 2000.0 {
        0.4
    } else if avg_response_time < 3000.0 {
        0.3
    } else {
        0.15
    };

    let switch_rate = switch_count as f64 / sample_count as f64;
    let switch_score = if switch_rate > 0.2 {
        0.3
    } else if switch_rate > 0.1 {
        0.2
    } else {
        0.1
    };

    let response_std_dev = response_variance.sqrt();
    let response_cv = if avg_response_time > 0.0 {
        response_std_dev / avg_response_time
    } else {
        0.0
    };
    let variability_score = if response_cv > 0.5 { 0.2 } else { 0.1 };

    let sum: f64 = speed_score + switch_score + variability_score;
    sum.min(1.0_f64)
}

async fn fetch_answer_records_for_learning_style(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<Vec<AnswerRecordInteraction>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };

        let rows = sqlx::query(
            r#"
            SELECT CAST("timestamp" AS TEXT) AS "timestamp", "dwellTime", "responseTime"
            FROM "answer_records"
            WHERE "userId" = ?
            ORDER BY "timestamp" DESC
            LIMIT 200
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        let mut records = Vec::with_capacity(rows.len());
        for row in rows {
            let ts: String = row.try_get("timestamp")?;
            let Some(timestamp_ms) = crate::auth::parse_sqlite_datetime_ms(&ts) else {
                continue;
            };
            let dwell_time: i64 = row.try_get::<Option<i64>, _>("dwellTime")?.unwrap_or(0);
            let response_time: Option<i64> = row.try_get::<Option<i64>, _>("responseTime")?;
            records.push(AnswerRecordInteraction {
                timestamp_ms,
                dwell_time,
                response_time,
            });
        }
        Ok(records)
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };

        let rows = sqlx::query(
            r#"
            SELECT "timestamp", "dwellTime", "responseTime"
            FROM "answer_records"
            WHERE "userId" = $1
            ORDER BY "timestamp" DESC
            LIMIT 200
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        let mut records = Vec::with_capacity(rows.len());
        for row in rows {
            let timestamp: NaiveDateTime = row.try_get("timestamp")?;
            let timestamp_ms = DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc).timestamp_millis();
            let dwell_time: i64 = row.try_get::<Option<i64>, _>("dwellTime")?.unwrap_or(0);
            let response_time: Option<i64> = row.try_get::<Option<i64>, _>("responseTime")?;
            records.push(AnswerRecordInteraction {
                timestamp_ms,
                dwell_time,
                response_time,
            });
        }
        Ok(records)
    }
}

async fn count_words_postgres(pool: &sqlx::PgPool, word_book_ids: &[String]) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(0);
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" IN ("#,
    );
    let mut separated = qb.separated(", ");
    for id in word_book_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    qb.build_query_scalar().fetch_one(pool).await
}

async fn count_words_sqlite(pool: &sqlx::SqlitePool, word_book_ids: &[String]) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(0);
    }

    let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
        r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" IN ("#,
    );
    let mut separated = qb.separated(", ");
    for id in word_book_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    qb.build_query_scalar().fetch_one(pool).await
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    chrono::DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

async fn split_body(req: Request<Body>) -> Result<(axum::http::request::Parts, bytes::Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求").into_response());
        }
    };
    Ok((parts, body_bytes))
}

fn validate_register_password(password: &str) -> Option<&'static str> {
    if password.len() < 10 {
        return Some("密码长度至少为10个字符");
    }

    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    let special_chars = "!@#$%^&*()_-+=[]{};:'\",.<>/?\\|`~";
    let has_special = password.chars().any(|ch| special_chars.contains(ch));

    if has_letter && has_digit && has_special {
        None
    } else {
        Some("密码需包含字母、数字和特殊符号")
    }
}
