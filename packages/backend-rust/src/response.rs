#![allow(dead_code)]

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub success: bool,
    pub error: String,
    pub code: String,
}

#[derive(Debug, Clone)]
pub struct AppError {
    status: StatusCode,
    code: String,
    message: String,
    is_operational: bool,
}

impl AppError {
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::operational(StatusCode::NOT_FOUND, "NOT_FOUND", message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::operational(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::operational(StatusCode::FORBIDDEN, "FORBIDDEN", message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::operational(StatusCode::CONFLICT, "CONFLICT", message)
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::operational(StatusCode::BAD_REQUEST, "BAD_REQUEST", message)
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::operational(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL_ERROR".to_string(),
            message: message.into(),
            is_operational: false,
        }
    }

    pub fn infer(message: impl Into<String>) -> Self {
        let message = message.into();

        if message.contains("不存在") && !message.contains("密码") {
            return Self::not_found(message);
        }

        if message.contains("已被注册") || message.contains("已存在") {
            return Self::conflict(message);
        }

        if [
            "无权",
            "令牌",
            "密码错误",
            "邮箱或密码",
            "尚未注册",
            "认证",
            "会话",
        ]
        .iter()
        .any(|needle| message.contains(needle))
        {
            return Self::unauthorized(message);
        }

        Self::bad_request(message)
    }

    fn operational(
        status: StatusCode,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            status,
            code: code.into(),
            message: message.into(),
            is_operational: true,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let message = if self.is_operational {
            self.message
        } else {
            "服务器内部错误".to_string()
        };

        let body = ErrorResponse {
            success: false,
            error: message,
            code: self.code,
        };

        (self.status, Json(body)).into_response()
    }
}

pub fn json_error(
    status: StatusCode,
    code: impl Into<String>,
    message: impl Into<String>,
) -> AppError {
    AppError {
        status,
        code: code.into(),
        message: message.into(),
        is_operational: true,
    }
}
