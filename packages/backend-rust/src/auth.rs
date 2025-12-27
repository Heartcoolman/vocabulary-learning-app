#![allow(dead_code)]

use axum::http::{header, HeaderMap};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, TimeZone, Utc};
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use sqlx::Row;
use thiserror::Error;

use crate::db::DatabaseProxy;

const AUTH_COOKIE_NAME: &str = "auth_token";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("missing token")]
    MissingToken,
    #[error("invalid token")]
    InvalidToken,
    #[error("missing JWT_SECRET")]
    MissingSecret,
    #[error("invalid JWT_EXPIRES_IN")]
    InvalidExpiresIn,
    #[error("database unavailable")]
    DatabaseUnavailable,
    #[error("database error: {0}")]
    Database(String),
}

impl AuthError {
    pub fn should_fallback_to_upstream(&self) -> bool {
        matches!(
            self,
            AuthError::MissingSecret
                | AuthError::InvalidExpiresIn
                | AuthError::DatabaseUnavailable
                | AuthError::Database(_)
        )
    }
}

pub fn extract_token(headers: &HeaderMap) -> Option<String> {
    if let Some(token) = get_cookie(headers, AUTH_COOKIE_NAME) {
        return Some(token);
    }

    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())?;

    auth_header
        .strip_prefix("Bearer ")
        .map(|value| value.to_string())
}

pub async fn verify_request_token(
    proxy: &DatabaseProxy,
    token: &str,
) -> Result<AuthUser, AuthError> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| AuthError::MissingSecret)?;
    let claims = verify_jwt_hs256(token, &secret)?;

    let token_hash = hash_token(token);

    let pool = proxy.pool();
    verify_with_postgres(&pool, &claims.user_id, &token_hash).await
}

#[derive(Debug, Clone)]
struct JwtClaims {
    user_id: String,
}

fn verify_jwt_hs256(token: &str, secret: &str) -> Result<JwtClaims, AuthError> {
    let mut parts = token.split('.');
    let header_b64 = parts.next().ok_or(AuthError::InvalidToken)?;
    let payload_b64 = parts.next().ok_or(AuthError::InvalidToken)?;
    let sig_b64 = parts.next().ok_or(AuthError::InvalidToken)?;
    if parts.next().is_some() {
        return Err(AuthError::InvalidToken);
    }

    let header_bytes = URL_SAFE_NO_PAD
        .decode(header_b64.as_bytes())
        .map_err(|_| AuthError::InvalidToken)?;
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload_b64.as_bytes())
        .map_err(|_| AuthError::InvalidToken)?;
    let sig_bytes = URL_SAFE_NO_PAD
        .decode(sig_b64.as_bytes())
        .map_err(|_| AuthError::InvalidToken)?;

    let header_json: serde_json::Value =
        serde_json::from_slice(&header_bytes).map_err(|_| AuthError::InvalidToken)?;
    let alg = header_json
        .get("alg")
        .and_then(|value| value.as_str())
        .ok_or(AuthError::InvalidToken)?;
    if alg != "HS256" {
        return Err(AuthError::InvalidToken);
    }

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|_| AuthError::InvalidToken)?;
    mac.update(format!("{header_b64}.{payload_b64}").as_bytes());
    mac.verify_slice(&sig_bytes)
        .map_err(|_| AuthError::InvalidToken)?;

    let payload_json: serde_json::Value =
        serde_json::from_slice(&payload_bytes).map_err(|_| AuthError::InvalidToken)?;

    validate_registered_claims(&payload_json)?;

    let user_id = payload_json
        .get("userId")
        .and_then(|value| value.as_str())
        .ok_or(AuthError::InvalidToken)?
        .to_string();

    Ok(JwtClaims { user_id })
}

fn validate_registered_claims(payload: &serde_json::Value) -> Result<(), AuthError> {
    let now = Utc::now().timestamp();

    if let Some(exp) = payload.get("exp").and_then(|value| value.as_i64()) {
        if now >= exp {
            return Err(AuthError::InvalidToken);
        }
    }

    if let Some(nbf) = payload.get("nbf").and_then(|value| value.as_i64()) {
        if now < nbf {
            return Err(AuthError::InvalidToken);
        }
    }

    Ok(())
}

fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    hex::encode(digest)
}

pub fn hash_token(token: &str) -> String {
    sha256_hex(token)
}

pub fn sign_jwt_for_user(user_id: &str) -> Result<(String, NaiveDateTime), AuthError> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| AuthError::MissingSecret)?;
    let expires_in = std::env::var("JWT_EXPIRES_IN").unwrap_or_else(|_| "24h".to_string());

    let expires_in_ms = parse_expires_in_ms(&expires_in)?;

    let issued_at = Utc::now();
    let exp = issued_at
        .checked_add_signed(chrono::Duration::milliseconds(expires_in_ms))
        .ok_or(AuthError::InvalidExpiresIn)?;

    let header_json = serde_json::json!({
        "alg": "HS256",
        "typ": "JWT",
    });

    let payload_json = serde_json::json!({
        "userId": user_id,
        "iat": issued_at.timestamp(),
        "exp": exp.timestamp(),
    });

    let header_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header_json).map_err(|_| AuthError::InvalidToken)?);
    let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload_json).map_err(|_| AuthError::InvalidToken)?);
    let signing_input = format!("{header_b64}.{payload_b64}");

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|_| AuthError::InvalidToken)?;
    mac.update(signing_input.as_bytes());
    let signature = mac.finalize().into_bytes();
    let sig_b64 = URL_SAFE_NO_PAD.encode(signature);

    let token = format!("{signing_input}.{sig_b64}");
    let expires_at = exp.naive_utc();

    Ok((token, expires_at))
}

pub fn parse_expires_in_ms(value: &str) -> Result<i64, AuthError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() < 2 {
        return Err(AuthError::InvalidExpiresIn);
    }

    let (digits, unit) = value
        .trim()
        .split_at(trimmed.len() - 1);

    let amount: i64 = digits.parse().map_err(|_| AuthError::InvalidExpiresIn)?;
    if amount <= 0 {
        return Err(AuthError::InvalidExpiresIn);
    }

    match unit {
        "s" => Ok(amount * 1000),
        "m" => Ok(amount * 60 * 1000),
        "h" => Ok(amount * 60 * 60 * 1000),
        "d" => Ok(amount * 24 * 60 * 60 * 1000),
        _ => Err(AuthError::InvalidExpiresIn),
    }
}

pub fn format_naive_datetime_iso_millis(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

async fn verify_with_postgres(
    pool: &PgPool,
    expected_user_id: &str,
    token_hash: &str,
) -> Result<AuthUser, AuthError> {
    let session_row = sqlx::query(
        r#"
        SELECT "userId", "expiresAt"
        FROM "sessions"
        WHERE "token" = $1
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await
    .map_err(|err| AuthError::Database(err.to_string()))?;

    let Some(session_row) = session_row else {
        return Err(AuthError::InvalidToken);
    };

    let session_user_id: String = session_row
        .try_get("userId")
        .map_err(|err| AuthError::Database(err.to_string()))?;
    let session_expires_at: NaiveDateTime = session_row
        .try_get("expiresAt")
        .map_err(|err| AuthError::Database(err.to_string()))?;

    if session_user_id != expected_user_id {
        return Err(AuthError::InvalidToken);
    }

    let now = Utc::now().naive_utc();
    if session_expires_at < now {
        return Err(AuthError::InvalidToken);
    }

    let user_row = sqlx::query(
        r#"
        SELECT
          "id",
          "email",
          "username",
          "role"::text as "role",
          "createdAt",
          "updatedAt"
        FROM "users"
        WHERE "id" = $1
        "#,
    )
    .bind(expected_user_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| AuthError::Database(err.to_string()))?;

    let Some(user_row) = user_row else {
        return Err(AuthError::InvalidToken);
    };

    let id: String = user_row
        .try_get("id")
        .map_err(|err| AuthError::Database(err.to_string()))?;
    let email: String = user_row
        .try_get("email")
        .map_err(|err| AuthError::Database(err.to_string()))?;
    let username: String = user_row
        .try_get("username")
        .map_err(|err| AuthError::Database(err.to_string()))?;
    let role: String = user_row
        .try_get("role")
        .map_err(|err| AuthError::Database(err.to_string()))?;
    let created_at: NaiveDateTime = user_row
        .try_get("createdAt")
        .map_err(|err| AuthError::Database(err.to_string()))?;
    let updated_at: NaiveDateTime = user_row
        .try_get("updatedAt")
        .map_err(|err| AuthError::Database(err.to_string()))?;

    Ok(AuthUser {
        id,
        email,
        username,
        role,
        created_at: naive_datetime_to_ms(created_at),
        updated_at: naive_datetime_to_ms(updated_at),
    })
}

fn naive_datetime_to_ms(value: NaiveDateTime) -> i64 {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).timestamp_millis()
}

pub fn parse_sqlite_datetime_ms(value: &str) -> Option<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return Some(dt.with_timezone(&Utc).timestamp_millis());
    }

    if let Ok(naive) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_millis());
    }

    if let Ok(naive) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_millis());
    }

    if let Ok(naive) = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_millis());
    }

    if let Ok(naive) = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_millis());
    }

    let parsed = value.parse::<i64>().ok()?;
    if parsed >= 10_000_000_000 {
        Some(parsed)
    } else {
        Some(parsed * 1000)
    }
}

pub fn format_timestamp_ms_iso_millis(value: i64) -> Option<String> {
    Utc.timestamp_millis_opt(value)
        .single()
        .map(|dt| dt.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn get_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let trimmed = part.trim();
        let (key, value) = trimmed.split_once('=')?;
        if key == name {
            return Some(value.to_string());
        }
    }
    None
}
