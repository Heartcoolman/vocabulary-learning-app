use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::cache::keys::{user_profile_key, USER_PROFILE_TTL};
use crate::response::json_error;
use crate::services::user_profile::{
    compute_chronotype, compute_learning_style, CognitiveProfileResponse,
};
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

#[derive(Serialize, Deserialize)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePasswordRequest {
    old_password: String,
    new_password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRewardProfileRequest {
    profile_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProfileRequest {
    username: Option<String>,
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

pub async fn me(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let cache = state.cache();
    let auth_user =
        match crate::auth::verify_request_token_cached(proxy.as_ref(), &token, cache.as_deref())
            .await
        {
            Ok(user) => user,
            Err(_) => {
                return json_error(
                    StatusCode::UNAUTHORIZED,
                    "UNAUTHORIZED",
                    "认证失败，请重新登录",
                )
                .into_response();
            }
        };

    let cache_key = user_profile_key(&auth_user.id);
    if let Some(ref cache) = cache {
        if let Some(user) = cache.get::<MeResponse>(&cache_key).await {
            return Json(SuccessResponse {
                success: true,
                data: user,
            })
            .into_response();
        }
    }

    let user = match select_user_me(proxy.as_ref(), &auth_user.id).await {
        Ok(Some(value)) => value,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "user me query failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if let Some(ref cache) = cache {
        cache.set(&cache_key, &user, USER_PROFILE_TTL).await;
    }

    Json(SuccessResponse {
        success: true,
        data: user,
    })
    .into_response()
}

pub async fn update_profile(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: UpdateProfileRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
    };

    let username = match &payload.username {
        Some(name) if name.trim().len() >= 2 => name.trim().to_string(),
        Some(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "用户名至少2个字符",
            )
            .into_response();
        }
        None => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请提供要更新的字段",
            )
            .into_response();
        }
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let cache = state.cache();
    let auth_user =
        match crate::auth::verify_request_token_cached(proxy.as_ref(), &token, cache.as_deref())
            .await
        {
            Ok(user) => user,
            Err(_) => {
                return json_error(
                    StatusCode::UNAUTHORIZED,
                    "UNAUTHORIZED",
                    "认证失败，请重新登录",
                )
                .into_response();
            }
        };

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    if let Err(err) = sqlx::query(
        r#"
        UPDATE "users"
        SET "username" = $1, "updatedAt" = $2
        WHERE "id" = $3
        "#,
    )
    .bind(&username)
    .bind(now)
    .bind(&auth_user.id)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, "profile update failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    let cache_key = user_profile_key(&auth_user.id);
    if let Some(ref cache) = cache {
        cache.delete(&cache_key).await;
    }

    let user = match select_user_me(proxy.as_ref(), &auth_user.id).await {
        Ok(Some(value)) => value,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "user profile query failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if let Some(ref cache) = cache {
        cache.set(&cache_key, &user, USER_PROFILE_TTL).await;
    }

    Json(SuccessResponse {
        success: true,
        data: user,
    })
    .into_response()
}

pub async fn statistics(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let stats = match select_user_statistics(proxy.as_ref(), &auth_user.id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "user statistics query failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: stats,
    })
    .into_response()
}

pub async fn v1_me_profile(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let user = match select_user_me(proxy.as_ref(), &auth_user.id).await {
        Ok(Some(value)) => value,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "user profile query failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
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

pub async fn reward_profile(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let current_profile = match select_user_reward_profile(proxy.as_ref(), &auth_user.id).await {
        Ok(Some(profile)) => profile,
        Ok(None) => "standard".to_string(),
        Err(err) => {
            tracing::warn!(error = %err, "reward profile lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
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

pub async fn v1_reward_profile(State(state): State<AppState>, req: Request<Body>) -> Response {
    reward_profile(State(state), req).await
}

pub async fn update_reward_profile(State(state): State<AppState>, req: Request<Body>) -> Response {
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
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: UpdateRewardProfileRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
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

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let cache = state.cache();
    let auth_user =
        match crate::auth::verify_request_token_cached(proxy.as_ref(), &token, cache.as_deref())
            .await
        {
            Ok(user) => user,
            Err(_) => {
                return json_error(
                    StatusCode::UNAUTHORIZED,
                    "UNAUTHORIZED",
                    "认证失败，请重新登录",
                )
                .into_response();
            }
        };

    let pool = proxy.pool();
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
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, "reward profile update failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Some(ref cache) = cache {
        cache.delete(&user_profile_key(&auth_user.id)).await;
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

pub async fn chronotype(State(state): State<AppState>, req: Request<Body>) -> Response {
    cognitive_part(State(state), req, CognitivePart::Chronotype).await
}

pub async fn learning_style(State(state): State<AppState>, req: Request<Body>) -> Response {
    cognitive_part(State(state), req, CognitivePart::LearningStyle).await
}

pub async fn cognitive(State(state): State<AppState>, req: Request<Body>) -> Response {
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
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    match part {
        CognitivePart::Chronotype => {
            let profile = match compute_chronotype(proxy.pool(), &auth_user.id).await {
                Ok(profile) => profile,
                Err(err) => {
                    tracing::warn!(error = %err, "chronotype compute failed");
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "INTERNAL_ERROR",
                        "服务器内部错误",
                    )
                    .into_response();
                }
            };

            let data = if profile.sample_count < 20 {
                None
            } else {
                Some(profile)
            };
            Json(SuccessResponse {
                success: true,
                data,
            })
            .into_response()
        }
        CognitivePart::LearningStyle => {
            let profile = match compute_learning_style(proxy.pool(), &auth_user.id).await {
                Ok(profile) => profile,
                Err(err) => {
                    tracing::warn!(error = %err, "learning style compute failed");
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "INTERNAL_ERROR",
                        "服务器内部错误",
                    )
                    .into_response();
                }
            };

            let data = if profile.sample_count < 20 {
                None
            } else {
                Some(profile)
            };
            Json(SuccessResponse {
                success: true,
                data,
            })
            .into_response()
        }
        CognitivePart::Combined => {
            let chronotype = match compute_chronotype(proxy.pool(), &auth_user.id).await {
                Ok(profile) if profile.sample_count >= 20 => Some(profile),
                Ok(_) => None,
                Err(err) => {
                    tracing::warn!(error = %err, "chronotype compute failed");
                    None
                }
            };

            let learning_style = match compute_learning_style(proxy.pool(), &auth_user.id).await {
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

pub async fn update_password(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let payload: UpdatePasswordRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "请求参数不合法",
            )
            .into_response();
        }
    };

    if payload.old_password.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "旧密码不能为空",
        )
        .into_response();
    }

    if let Some(message) = validate_register_password(&payload.new_password) {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
            .into_response();
        }
    };

    let password_hash = match select_user_password_hash(proxy.as_ref(), &auth_user.id).await {
        Ok(Some(hash)) => hash,
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "password lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let old_ok = bcrypt::verify(&payload.old_password, &password_hash).unwrap_or(false);
    if !old_ok {
        return json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "旧密码不正确").into_response();
    }

    let new_hash = match bcrypt::hash(&payload.new_password, 10) {
        Ok(hash) => hash,
        Err(_) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let pool = proxy.pool();
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
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, "password update failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = sqlx::query(r#"DELETE FROM "sessions" WHERE "userId" = $1"#)
        .bind(&auth_user.id)
        .execute(pool)
        .await
    {
        tracing::warn!(error = %err, "session delete failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    Json(MessageResponse {
        success: true,
        message: "密码修改成功",
    })
    .into_response()
}

async fn select_user_me(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<MeResponse>, sqlx::Error> {
    let pool = proxy.pool();
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
    .fetch_optional(pool)
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
        reward_profile: row
            .try_get::<Option<String>, _>("rewardProfile")?
            .unwrap_or_else(|| "standard".to_string()),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }))
}

async fn select_user_reward_profile(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "rewardProfile" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row
        .and_then(|r| r.try_get::<Option<String>, _>("rewardProfile").ok())
        .flatten())
}

async fn select_user_password_hash(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "passwordHash" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|r| r.try_get::<String, _>("passwordHash").ok()))
}

async fn select_user_statistics(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<StatisticsResponse, sqlx::Error> {
    let pool = proxy.pool();
    let word_books: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT "id"
        FROM "word_books"
        WHERE ("type"::text = 'SYSTEM') OR (("type"::text = 'USER') AND "userId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let total_words = count_words_postgres(pool, &word_books).await.unwrap_or(0);

    let total_records: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    let correct_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1 AND "isCorrect" = true"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    Ok(build_accuracy(total_words, total_records, correct_count))
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

async fn count_words_postgres(
    pool: &sqlx::PgPool,
    word_book_ids: &[String],
) -> Result<i64, sqlx::Error> {
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

fn format_naive_iso(value: NaiveDateTime) -> String {
    chrono::DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

async fn split_body(
    req: Request<Body>,
) -> Result<(axum::http::request::Parts, bytes::Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return Err(
                json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求").into_response(),
            );
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
