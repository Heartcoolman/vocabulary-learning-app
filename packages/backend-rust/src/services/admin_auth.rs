use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{NaiveDateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::db::operations::admin::{self, AdminUser};
use crate::db::DatabaseProxy;

const ADMIN_TOKEN_TYPE: &str = "admin";

#[derive(Debug, Error)]
pub enum AdminAuthError {
    #[error("missing ADMIN_JWT_SECRET")]
    MissingSecret,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("invalid token")]
    InvalidToken,
    #[error("database error: {0}")]
    Database(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAuthUser {
    pub id: String,
    pub email: String,
    pub username: String,
    pub permissions: serde_json::Value,
}

impl From<AdminUser> for AdminAuthUser {
    fn from(u: AdminUser) -> Self {
        Self {
            id: u.id,
            email: u.email,
            username: u.username,
            permissions: u.permissions,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminLoginResponse {
    pub user: AdminAuthUser,
    pub token: String,
    pub expires_at: String,
}

pub fn sign_admin_jwt(admin_id: &str) -> Result<(String, NaiveDateTime), AdminAuthError> {
    let secret = std::env::var("ADMIN_JWT_SECRET")
        .or_else(|_| std::env::var("JWT_SECRET"))
        .map_err(|_| AdminAuthError::MissingSecret)?;

    let expires_in_ms = 15 * 60 * 1000i64; // 15 minutes

    let issued_at = Utc::now();
    let exp = issued_at
        .checked_add_signed(chrono::Duration::milliseconds(expires_in_ms))
        .ok_or(AdminAuthError::InvalidToken)?;

    let header = serde_json::json!({ "alg": "HS256", "typ": "JWT" });
    let payload = serde_json::json!({
        "type": ADMIN_TOKEN_TYPE,
        "adminId": admin_id,
        "iat": issued_at.timestamp(),
        "exp": exp.timestamp(),
    });

    let header_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).unwrap());
    let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
    let signing_input = format!("{header_b64}.{payload_b64}");

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(signing_input.as_bytes());
    let sig_b64 = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

    Ok((format!("{signing_input}.{sig_b64}"), exp.naive_utc()))
}

#[derive(Debug)]
pub struct AdminJwtClaims {
    pub admin_id: String,
}

pub fn verify_admin_jwt(token: &str) -> Result<AdminJwtClaims, AdminAuthError> {
    let secret = std::env::var("ADMIN_JWT_SECRET")
        .or_else(|_| std::env::var("JWT_SECRET"))
        .map_err(|_| AdminAuthError::MissingSecret)?;

    let mut parts = token.split('.');
    let header_b64 = parts.next().ok_or(AdminAuthError::InvalidToken)?;
    let payload_b64 = parts.next().ok_or(AdminAuthError::InvalidToken)?;
    let sig_b64 = parts.next().ok_or(AdminAuthError::InvalidToken)?;
    if parts.next().is_some() {
        return Err(AdminAuthError::InvalidToken);
    }

    let header_bytes = URL_SAFE_NO_PAD
        .decode(header_b64.as_bytes())
        .map_err(|_| AdminAuthError::InvalidToken)?;
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload_b64.as_bytes())
        .map_err(|_| AdminAuthError::InvalidToken)?;
    let sig_bytes = URL_SAFE_NO_PAD
        .decode(sig_b64.as_bytes())
        .map_err(|_| AdminAuthError::InvalidToken)?;

    let header: serde_json::Value =
        serde_json::from_slice(&header_bytes).map_err(|_| AdminAuthError::InvalidToken)?;
    if header.get("alg").and_then(|v| v.as_str()) != Some("HS256") {
        return Err(AdminAuthError::InvalidToken);
    }

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(format!("{header_b64}.{payload_b64}").as_bytes());
    mac.verify_slice(&sig_bytes)
        .map_err(|_| AdminAuthError::InvalidToken)?;

    let payload: serde_json::Value =
        serde_json::from_slice(&payload_bytes).map_err(|_| AdminAuthError::InvalidToken)?;

    if payload.get("type").and_then(|v| v.as_str()) != Some(ADMIN_TOKEN_TYPE) {
        return Err(AdminAuthError::InvalidToken);
    }

    let now = Utc::now().timestamp();
    if let Some(exp) = payload.get("exp").and_then(|v| v.as_i64()) {
        if now >= exp {
            return Err(AdminAuthError::InvalidToken);
        }
    }

    let admin_id = payload
        .get("adminId")
        .and_then(|v| v.as_str())
        .ok_or(AdminAuthError::InvalidToken)?
        .to_string();

    Ok(AdminJwtClaims { admin_id })
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub async fn admin_login(
    proxy: &DatabaseProxy,
    email: &str,
    password: &str,
) -> Result<AdminLoginResponse, AdminAuthError> {
    let Some((user, password_hash)) = admin::find_admin_by_email(proxy, email)
        .await
        .map_err(|e| AdminAuthError::Database(e.to_string()))?
    else {
        return Err(AdminAuthError::InvalidCredentials);
    };

    if !bcrypt::verify(password, &password_hash).unwrap_or(false) {
        return Err(AdminAuthError::InvalidCredentials);
    }

    let (token, expires_at) = sign_admin_jwt(&user.id)?;
    let token_hash = hash_token(&token);
    let session_id = uuid::Uuid::new_v4().to_string();

    admin::create_admin_session(proxy, &session_id, &user.id, &token_hash, expires_at)
        .await
        .map_err(|e| AdminAuthError::Database(e.to_string()))?;

    admin::update_admin_last_login(proxy, &user.id)
        .await
        .map_err(|e| AdminAuthError::Database(e.to_string()))?;

    let expires_at_str = chrono::DateTime::<Utc>::from_naive_utc_and_offset(expires_at, Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    Ok(AdminLoginResponse {
        user: user.into(),
        token,
        expires_at: expires_at_str,
    })
}

pub async fn admin_logout(proxy: &DatabaseProxy, token: &str) -> Result<bool, AdminAuthError> {
    let token_hash = hash_token(token);
    admin::delete_admin_session(proxy, &token_hash)
        .await
        .map_err(|e| AdminAuthError::Database(e.to_string()))
}

pub async fn verify_admin_token(
    proxy: &DatabaseProxy,
    token: &str,
) -> Result<AdminAuthUser, AdminAuthError> {
    let claims = verify_admin_jwt(token)?;
    let token_hash = hash_token(token);

    let user = admin::verify_admin_session(proxy, &token_hash)
        .await
        .map_err(|e| AdminAuthError::Database(e.to_string()))?
        .ok_or(AdminAuthError::InvalidToken)?;

    if user.id != claims.admin_id {
        return Err(AdminAuthError::InvalidToken);
    }

    Ok(user.into())
}
