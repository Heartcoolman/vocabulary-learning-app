use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::cache::keys::session_key;
use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct VerifyResponse {
    success: bool,
    data: VerifyData,
}

#[derive(Serialize)]
struct VerifyData {
    user: AuthUser,
}

#[derive(Serialize)]
struct LogoutResponse {
    success: bool,
    message: &'static str,
}

#[derive(Serialize)]
struct MessageResponse {
    success: bool,
    message: &'static str,
}

#[derive(Debug, Deserialize)]
struct RegisterRequest {
    email: String,
    password: String,
    username: String,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct PasswordResetRequest {
    email: String,
}

#[derive(Debug, Deserialize)]
pub struct PasswordResetConfirmRequest {
    token: String,
    new_password: String,
}

#[derive(Serialize)]
struct AuthResponse {
    success: bool,
    data: AuthData,
}

#[derive(Serialize)]
struct AuthData {
    user: AuthUserSummary,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthUserSummary {
    id: String,
    email: String,
    username: String,
    role: String,
    created_at: String,
}

pub async fn verify(State(state): State<AppState>, req: Request<Body>) -> Response {
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

    match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => Json(VerifyResponse {
            success: true,
            data: VerifyData { user },
        })
        .into_response(),
        Err(_) => json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "认证失败，请重新登录",
        )
        .into_response(),
    }
}

pub async fn logout(State(state): State<AppState>, req: Request<Body>) -> Response {
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

    match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(_user) => {
            let token_hash = crate::auth::hash_token(&token);
            if let Err(err) = proxy.delete_session_by_token_hash(&token_hash).await {
                tracing::warn!(error = %err, "logout session delete failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "服务器内部错误",
                )
                .into_response();
            }

            if let Some(cache) = state.cache() {
                cache.delete(&session_key(&token_hash)).await;
            }

            let mut headers = HeaderMap::new();
            if let Some(cookie) = clear_auth_cookie_header() {
                headers.insert(header::SET_COOKIE, cookie);
            }

            (
                StatusCode::OK,
                headers,
                Json(LogoutResponse {
                    success: true,
                    message: "退出登录成功",
                }),
            )
                .into_response()
        }
        Err(_) => json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "认证失败，请重新登录",
        )
        .into_response(),
    }
}

pub async fn request_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<PasswordResetRequest>,
) -> Response {
    let email = payload.email.trim().to_lowercase();

    if !is_valid_email(&email) {
        return success_reset_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return success_reset_response();
    };

    let email_service = state.email_service();
    if !email_service.is_available() {
        tracing::warn!("password reset requested but email service not configured");
        return success_reset_response();
    }

    let user_id =
        match crate::db::operations::user::get_user_id_by_email(proxy.as_ref(), &email).await {
            Ok(Some(id)) => id,
            _ => return success_reset_response(),
        };

    if let Ok(Some(last_request)) =
        crate::db::operations::user::get_last_reset_request_time(proxy.as_ref(), &user_id).await
    {
        let now = chrono::Utc::now().naive_utc();
        let elapsed = (now - last_request).num_seconds();
        if elapsed < 60 {
            tracing::debug!(user_id = %user_id, elapsed, "rate limited password reset request");
            return success_reset_response();
        }
    }

    let _ =
        crate::db::operations::user::invalidate_user_reset_tokens(proxy.as_ref(), &user_id).await;

    let raw_token = Uuid::new_v4().to_string();
    let token_hash = match bcrypt::hash(&raw_token, 10) {
        Ok(hash) => hash,
        Err(err) => {
            tracing::warn!(error = %err, "password reset token hash failed");
            return success_reset_response();
        }
    };

    let expires_at = chrono::Utc::now().naive_utc() + chrono::Duration::minutes(15);
    if let Err(err) = crate::db::operations::user::create_password_reset_token(
        proxy.as_ref(),
        &user_id,
        &token_hash,
        expires_at,
    )
    .await
    {
        tracing::warn!(error = %err, "password reset token create failed");
        return success_reset_response();
    }

    let reset_link = build_reset_link(&raw_token);
    let html_body = build_reset_email_html(&reset_link);

    if let Err(err) = email_service
        .send_email(&email, "重置您的密码 / Reset Your Password", &html_body)
        .await
    {
        tracing::warn!(error = %err, "password reset email send failed");
    }

    success_reset_response()
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<PasswordResetConfirmRequest>,
) -> Response {
    if payload.token.trim().is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "令牌不能为空")
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

    let token_record = match crate::db::operations::user::get_valid_password_reset_token(
        proxy.as_ref(),
        &payload.token,
    )
    .await
    {
        Ok(Some(record)) => record,
        Ok(None) => {
            return json_error(StatusCode::BAD_REQUEST, "INVALID_TOKEN", "令牌无效或已过期")
                .into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "password reset token lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let password_hash = match bcrypt::hash(&payload.new_password, 10) {
        Ok(hash) => hash,
        Err(err) => {
            tracing::warn!(error = %err, "password hash failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let pool = proxy.pool();
    if let Err(err) = sqlx::query(
        r#"UPDATE "users" SET "passwordHash" = $1, "updatedAt" = NOW() WHERE "id" = $2"#,
    )
    .bind(&password_hash)
    .bind(&token_record.user_id)
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

    if let Err(err) = crate::db::operations::user::mark_password_reset_token_used(
        proxy.as_ref(),
        &token_record.id,
    )
    .await
    {
        tracing::warn!(error = %err, "mark token used failed");
    }

    Json(MessageResponse {
        success: true,
        message: "密码重置成功",
    })
    .into_response()
}

pub async fn refresh_token(State(state): State<AppState>, req: Request<Body>) -> Response {
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

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
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

    let old_token_hash = crate::auth::hash_token(&token);
    if let Err(err) = proxy.delete_session_by_token_hash(&old_token_hash).await {
        tracing::warn!(error = %err, "refresh token: old session delete failed");
    }

    if let Some(cache) = state.cache() {
        cache.delete(&session_key(&old_token_hash)).await;
    }

    let (new_token, expires_at) = match crate::auth::sign_jwt_for_user(&user.id) {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "refresh token: jwt sign failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let new_token_hash = crate::auth::hash_token(&new_token);
    let pool = proxy.pool();
    if let Err(err) = sqlx::query(
        r#"
        INSERT INTO "sessions" ("id", "userId", "token", "expiresAt")
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(&new_token_hash)
    .bind(expires_at)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, "refresh token: session insert failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    let mut headers = HeaderMap::new();
    if let Some(cookie) = auth_cookie_header(&new_token) {
        headers.insert(header::SET_COOKIE, cookie);
    }

    (
        StatusCode::OK,
        headers,
        Json(AuthResponse {
            success: true,
            data: AuthData {
                user: AuthUserSummary {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role,
                    created_at: crate::auth::format_timestamp_ms_iso_millis(user.created_at)
                        .unwrap_or_else(|| user.created_at.to_string()),
                },
                token: new_token,
            },
        }),
    )
        .into_response()
}

pub async fn register(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (_parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: RegisterRequest = match serde_json::from_slice(&body_bytes) {
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

    if !is_valid_email(&payload.email) {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "邮箱格式无效")
            .into_response();
    }

    if let Some(message) = validate_register_password(&payload.password) {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response();
    }

    if payload.username.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "用户名不能为空",
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

    match select_user_id_by_email(proxy.as_ref(), &payload.email).await {
        Ok(Some(_)) => {
            return json_error(StatusCode::CONFLICT, "CONFLICT", "该邮箱已被注册").into_response();
        }
        Ok(None) => {}
        Err(err) => {
            tracing::warn!(error = %err, "register email check failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    }

    let password_hash = match bcrypt::hash(&payload.password, 10) {
        Ok(hash) => hash,
        Err(err) => {
            tracing::warn!(error = %err, "password hash failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let user_id = Uuid::new_v4().to_string();
    let (token, expires_at) = match crate::auth::sign_jwt_for_user(&user_id) {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "jwt sign failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let token_hash = crate::auth::hash_token(&token);

    let pool = proxy.pool();
    let updated_at = chrono::Utc::now().naive_utc();
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(err) => {
            tracing::warn!(error = %err, "register tx begin failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    if let Err(err) = sqlx::query(
        r#"
        INSERT INTO "users" ("id", "email", "passwordHash", "username", "updatedAt")
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(&user_id)
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&payload.username)
    .bind(updated_at)
    .execute(&mut *tx)
    .await
    {
        tracing::warn!(error = %err, "register user insert failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = sqlx::query(
        r#"
        INSERT INTO "sessions" ("id", "userId", "token", "expiresAt")
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user_id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&mut *tx)
    .await
    {
        tracing::warn!(error = %err, "register session insert failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    if let Err(err) = tx.commit().await {
        tracing::warn!(error = %err, "register tx commit failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    let created_at = match select_user_created_at(proxy.as_ref(), &user_id).await {
        Ok(Some(value)) => value,
        _ => chrono::Utc::now().to_rfc3339(),
    };

    let mut headers = HeaderMap::new();
    if let Some(cookie) = auth_cookie_header(&token) {
        headers.insert(header::SET_COOKIE, cookie);
    }

    (
        StatusCode::CREATED,
        headers,
        Json(AuthResponse {
            success: true,
            data: AuthData {
                user: AuthUserSummary {
                    id: user_id,
                    email: payload.email,
                    username: payload.username,
                    role: "USER".to_string(),
                    created_at,
                },
                token,
            },
        }),
    )
        .into_response()
}

pub async fn login(State(state): State<AppState>, req: Request<Body>) -> Response {
    let (_parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: LoginRequest = match serde_json::from_slice(&body_bytes) {
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

    if !is_valid_email(&payload.email) {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "邮箱格式无效")
            .into_response();
    }

    if payload.password.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "密码不能为空")
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

    let user = match select_user_for_login(proxy.as_ref(), &payload.email).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "该邮箱尚未注册")
                .into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "login user lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let password_ok = bcrypt::verify(&payload.password, &user.password_hash).unwrap_or(false);
    if !password_ok {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "密码错误").into_response();
    }

    if user.role == "BANNED" {
        return json_error(StatusCode::FORBIDDEN, "ACCOUNT_BANNED", "账号已被封禁").into_response();
    }

    let (token, expires_at) = match crate::auth::sign_jwt_for_user(&user.id) {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "jwt sign failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response();
        }
    };

    let token_hash = crate::auth::hash_token(&token);

    let pool = proxy.pool();
    if let Err(err) = sqlx::query(
        r#"
        INSERT INTO "sessions" ("id", "userId", "token", "expiresAt")
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, "login session insert failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
        .into_response();
    }

    let mut headers = HeaderMap::new();
    if let Some(cookie) = auth_cookie_header(&token) {
        headers.insert(header::SET_COOKIE, cookie);
    }

    (
        StatusCode::OK,
        headers,
        Json(AuthResponse {
            success: true,
            data: AuthData {
                user: AuthUserSummary {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role,
                    created_at: user.created_at,
                },
                token,
            },
        }),
    )
        .into_response()
}

fn clear_auth_cookie_header() -> Option<HeaderValue> {
    let is_production = std::env::var("NODE_ENV")
        .ok()
        .map(|value| value == "production")
        .unwrap_or(false);

    let mut cookie = "auth_token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0"
        .to_string();

    if is_production {
        cookie.push_str("; Secure");
    }

    HeaderValue::from_str(&cookie).ok()
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

fn is_valid_email(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.contains(' ') {
        return false;
    }
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    domain.contains('.')
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

struct LoginUserRow {
    id: String,
    email: String,
    username: String,
    role: String,
    created_at: String,
    password_hash: String,
}

async fn select_user_id_by_email(
    proxy: &crate::db::DatabaseProxy,
    email: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "id" FROM "users" WHERE "email" = $1 LIMIT 1"#)
        .bind(email)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|r| r.try_get::<String, _>("id").ok()))
}

async fn select_user_created_at(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "createdAt" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };

    let created_at: chrono::NaiveDateTime = row.try_get("createdAt")?;
    Ok(Some(crate::auth::format_naive_datetime_iso_millis(
        created_at,
    )))
}

async fn select_user_for_login(
    proxy: &crate::db::DatabaseProxy,
    email: &str,
) -> Result<Option<LoginUserRow>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT
          "id",
          "email",
          "username",
          "role"::text as "role",
          "createdAt",
          "passwordHash"
        FROM "users"
        WHERE "email" = $1
        LIMIT 1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let created_at: chrono::NaiveDateTime = row.try_get("createdAt")?;

    Ok(Some(LoginUserRow {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        password_hash: row.try_get("passwordHash")?,
    }))
}

fn auth_cookie_header(token: &str) -> Option<HeaderValue> {
    let is_production = std::env::var("NODE_ENV")
        .ok()
        .map(|value| value == "production")
        .unwrap_or(false);

    let expires_in = std::env::var("JWT_EXPIRES_IN").unwrap_or_else(|_| "24h".to_string());
    let max_age = crate::auth::parse_expires_in_ms(&expires_in)
        .map(|ms| ms / 1000)
        .unwrap_or(86400);

    let mut cookie =
        format!("auth_token={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}");
    if is_production {
        cookie.push_str("; Secure");
    }

    HeaderValue::from_str(&cookie).ok()
}

fn success_reset_response() -> Response {
    Json(MessageResponse {
        success: true,
        message: "如果该邮箱已注册，您将收到密码重置邮件",
    })
    .into_response()
}

fn build_reset_link(token: &str) -> String {
    let base_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());
    format!(
        "{}/reset-password?token={}",
        base_url.trim_end_matches('/'),
        token
    )
}

fn build_reset_email_html(reset_link: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #333;">重置密码 / Reset Password</h2>
<p>您收到此邮件是因为有人请求重置您的账户密码。</p>
<p>You received this email because someone requested to reset your account password.</p>
<p style="margin: 30px 0;">
<a href="{reset_link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">重置密码 / Reset Password</a>
</p>
<p style="color: #666; font-size: 14px;">此链接将在15分钟后失效。如果您没有请求重置密码，请忽略此邮件。</p>
<p style="color: #666; font-size: 14px;">This link will expire in 15 minutes. If you didn't request a password reset, please ignore this email.</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
<p style="color: #999; font-size: 12px;">Danci - 智能单词学习</p>
</body>
</html>"#,
        reset_link = reset_link
    )
}
