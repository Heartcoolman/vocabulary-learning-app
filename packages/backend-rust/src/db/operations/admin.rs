use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    pub id: String,
    pub email: String,
    pub username: String,
    pub permissions: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    pub last_login_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSession {
    pub id: String,
    pub admin_id: String,
    pub token: String,
    pub expires_at: String,
    pub created_at: String,
}

fn format_datetime(dt: NaiveDateTime) -> String {
    chrono::DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub async fn create_admin_user(
    proxy: &DatabaseProxy,
    id: &str,
    email: &str,
    password_hash: &str,
    username: &str,
) -> Result<AdminUser, sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "admin_users" ("id", "email", "passwordHash", "username", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $5)
        "#,
    )
    .bind(id)
    .bind(email)
    .bind(password_hash)
    .bind(username)
    .bind(now)
    .execute(proxy.pool())
    .await?;

    Ok(AdminUser {
        id: id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        permissions: serde_json::json!([]),
        created_at: format_datetime(now),
        updated_at: format_datetime(now),
        last_login_at: None,
    })
}

pub async fn find_admin_by_email(
    proxy: &DatabaseProxy,
    email: &str,
) -> Result<Option<(AdminUser, String)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT "id", "email", "passwordHash", "username", "permissions",
               "createdAt", "updatedAt", "lastLoginAt"
        FROM "admin_users"
        WHERE "email" = $1
        "#,
    )
    .bind(email)
    .fetch_optional(proxy.pool())
    .await?;

    Ok(row.map(|r| {
        let created_at: NaiveDateTime = r
            .try_get("createdAt")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let updated_at: NaiveDateTime = r
            .try_get("updatedAt")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let last_login_at: Option<NaiveDateTime> = r.try_get("lastLoginAt").ok();
        let password_hash: String = r.try_get("passwordHash").unwrap_or_default();

        (
            AdminUser {
                id: r.try_get("id").unwrap_or_default(),
                email: r.try_get("email").unwrap_or_default(),
                username: r.try_get("username").unwrap_or_default(),
                permissions: r.try_get("permissions").unwrap_or(serde_json::json!([])),
                created_at: format_datetime(created_at),
                updated_at: format_datetime(updated_at),
                last_login_at: last_login_at.map(format_datetime),
            },
            password_hash,
        )
    }))
}

pub async fn find_admin_by_id(
    proxy: &DatabaseProxy,
    admin_id: &str,
) -> Result<Option<AdminUser>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT "id", "email", "username", "permissions",
               "createdAt", "updatedAt", "lastLoginAt"
        FROM "admin_users"
        WHERE "id" = $1
        "#,
    )
    .bind(admin_id)
    .fetch_optional(proxy.pool())
    .await?;

    Ok(row.map(|r| {
        let created_at: NaiveDateTime = r
            .try_get("createdAt")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let updated_at: NaiveDateTime = r
            .try_get("updatedAt")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let last_login_at: Option<NaiveDateTime> = r.try_get("lastLoginAt").ok();

        AdminUser {
            id: r.try_get("id").unwrap_or_default(),
            email: r.try_get("email").unwrap_or_default(),
            username: r.try_get("username").unwrap_or_default(),
            permissions: r.try_get("permissions").unwrap_or(serde_json::json!([])),
            created_at: format_datetime(created_at),
            updated_at: format_datetime(updated_at),
            last_login_at: last_login_at.map(format_datetime),
        }
    }))
}

pub async fn update_admin_last_login(
    proxy: &DatabaseProxy,
    admin_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "admin_users" SET "lastLoginAt" = $2 WHERE "id" = $1"#)
        .bind(admin_id)
        .bind(Utc::now().naive_utc())
        .execute(proxy.pool())
        .await?;
    Ok(())
}

pub async fn create_admin_session(
    proxy: &DatabaseProxy,
    id: &str,
    admin_id: &str,
    token_hash: &str,
    expires_at: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO "admin_sessions" ("id", "adminId", "token", "expiresAt", "createdAt")
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(id)
    .bind(admin_id)
    .bind(token_hash)
    .bind(expires_at)
    .bind(Utc::now().naive_utc())
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn delete_admin_session(
    proxy: &DatabaseProxy,
    token_hash: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(r#"DELETE FROM "admin_sessions" WHERE "token" = $1"#)
        .bind(token_hash)
        .execute(proxy.pool())
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn verify_admin_session(
    proxy: &DatabaseProxy,
    token_hash: &str,
) -> Result<Option<AdminUser>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT s."adminId", s."expiresAt",
               a."id", a."email", a."username", a."permissions",
               a."createdAt", a."updatedAt", a."lastLoginAt"
        FROM "admin_sessions" s
        JOIN "admin_users" a ON s."adminId" = a."id"
        WHERE s."token" = $1
        "#,
    )
    .bind(token_hash)
    .fetch_optional(proxy.pool())
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let expires_at: NaiveDateTime = row
        .try_get("expiresAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    if expires_at < Utc::now().naive_utc() {
        return Ok(None);
    }

    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let last_login_at: Option<NaiveDateTime> = row.try_get("lastLoginAt").ok();

    Ok(Some(AdminUser {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        permissions: row.try_get("permissions").unwrap_or(serde_json::json!([])),
        created_at: format_datetime(created_at),
        updated_at: format_datetime(updated_at),
        last_login_at: last_login_at.map(format_datetime),
    }))
}

pub async fn delete_all_admin_sessions(
    proxy: &DatabaseProxy,
    admin_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(r#"DELETE FROM "admin_sessions" WHERE "adminId" = $1"#)
        .bind(admin_id)
        .execute(proxy.pool())
        .await?;
    Ok(result.rows_affected())
}
