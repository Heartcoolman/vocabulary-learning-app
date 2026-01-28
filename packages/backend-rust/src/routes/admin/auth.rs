use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};

use crate::db::operations::admin as admin_ops;
use crate::response::json_error;
use crate::services::admin_auth::{self, AdminAuthError, AdminAuthUser};
use crate::state::AppState;

/// Public routes (no auth required): login, logout
pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/logout", post(logout))
}

/// Protected routes (require admin auth): me, users
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/me", get(get_me))
        .route("/users", post(create_admin_user))
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    success: bool,
    user: AdminAuthUser,
    token: String,
    expires_at: String,
}

async fn login(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match admin_auth::admin_login(proxy.as_ref(), &payload.email, &payload.password).await {
        Ok(result) => Json(LoginResponse {
            success: true,
            user: result.user,
            token: result.token,
            expires_at: result.expires_at,
        })
        .into_response(),
        Err(AdminAuthError::InvalidCredentials) => json_error(
            StatusCode::UNAUTHORIZED,
            "INVALID_CREDENTIALS",
            "邮箱或密码错误",
        )
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "LOGIN_FAILED",
            &e.to_string(),
        )
        .into_response(),
    }
}

#[derive(Debug, Serialize)]
struct LogoutResponse {
    success: bool,
    message: &'static str,
}

async fn logout(State(state): State<AppState>, req: Request<Body>) -> Response {
    let token = extract_admin_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match admin_auth::admin_logout(proxy.as_ref(), &token).await {
        Ok(_) => Json(LogoutResponse {
            success: true,
            message: "登出成功",
        })
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "LOGOUT_FAILED",
            &e.to_string(),
        )
        .into_response(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MeResponse {
    success: bool,
    user: AdminAuthUser,
}

async fn get_me(Extension(user): Extension<AdminAuthUser>) -> Response {
    Json(MeResponse {
        success: true,
        user,
    })
    .into_response()
}

fn extract_admin_token(headers: &axum::http::HeaderMap) -> Option<String> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())?;
    auth_header.strip_prefix("Bearer ").map(|s| s.to_string())
}

pub async fn require_admin_auth(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let token = extract_admin_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match admin_auth::verify_admin_token(proxy.as_ref(), &token).await {
        Ok(user) => {
            req.extensions_mut().insert(user);
            next.run(req).await
        }
        Err(_) => json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "认证失败，请重新登录",
        )
        .into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct CreateAdminRequest {
    email: String,
    password: String,
    username: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateAdminResponse {
    success: bool,
    user: AdminAuthUser,
}

async fn create_admin_user(
    State(state): State<AppState>,
    Extension(_current_admin): Extension<AdminAuthUser>,
    Json(payload): Json<CreateAdminRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    if payload.email.is_empty() || payload.password.is_empty() || payload.username.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "INVALID_INPUT",
            "邮箱、密码和用户名不能为空",
        )
        .into_response();
    }

    match admin_ops::find_admin_by_email(proxy.as_ref(), &payload.email).await {
        Ok(Some(_)) => {
            return json_error(StatusCode::CONFLICT, "EMAIL_EXISTS", "该邮箱已被注册")
                .into_response();
        }
        Ok(None) => {}
        Err(_) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DATABASE_ERROR",
                "数据库查询失败",
            )
            .into_response();
        }
    }

    let password_hash = match bcrypt::hash(&payload.password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "HASH_ERROR",
                "密码处理失败",
            )
            .into_response();
        }
    };

    let admin_id = uuid::Uuid::new_v4().to_string();
    match admin_ops::create_admin_user(
        proxy.as_ref(),
        &admin_id,
        &payload.email,
        &password_hash,
        &payload.username,
    )
    .await
    {
        Ok(user) => Json(CreateAdminResponse {
            success: true,
            user: AdminAuthUser {
                id: user.id,
                email: user.email,
                username: user.username,
                permissions: user.permissions,
            },
        })
        .into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "CREATE_FAILED",
            &format!("创建管理员失败: {}", e),
        )
        .into_response(),
    }
}
