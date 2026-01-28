use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Broadcast {
    pub id: String,
    pub admin_id: String,
    pub title: String,
    pub content: String,
    pub target: String,
    pub target_filter: Option<serde_json::Value>,
    pub priority: String,
    pub persistent: bool,
    pub expires_at: Option<String>,
    pub status: String,
    pub target_count: i32,
    pub delivered_count: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastAuditLog {
    pub id: String,
    pub broadcast_id: String,
    pub admin_id: String,
    pub action: String,
    pub details: Option<serde_json::Value>,
    pub created_at: String,
}

fn format_datetime(dt: NaiveDateTime) -> String {
    chrono::DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[derive(Debug, Clone)]
pub struct CreateBroadcastParams {
    pub admin_id: String,
    pub title: String,
    pub content: String,
    pub target: String,
    pub target_filter: Option<serde_json::Value>,
    pub priority: String,
    pub persistent: bool,
    pub expires_at: Option<NaiveDateTime>,
    pub target_count: i32,
}

pub async fn create_broadcast(
    proxy: &DatabaseProxy,
    params: CreateBroadcastParams,
) -> Result<Broadcast, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"
        INSERT INTO "broadcasts" (
            "id", "adminId", "title", "content", "target", "targetFilter",
            "priority", "persistent", "expiresAt", "status", "targetCount", "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5::"BroadcastTarget", $6, $7::"NotificationPriority", $8, $9, 'sent'::"BroadcastStatus", $10, $11)
        "#,
    )
    .bind(&id)
    .bind(&params.admin_id)
    .bind(&params.title)
    .bind(&params.content)
    .bind(&params.target)
    .bind(&params.target_filter)
    .bind(&params.priority)
    .bind(params.persistent)
    .bind(params.expires_at)
    .bind(params.target_count)
    .bind(now)
    .execute(proxy.pool())
    .await?;

    Ok(Broadcast {
        id,
        admin_id: params.admin_id,
        title: params.title,
        content: params.content,
        target: params.target,
        target_filter: params.target_filter,
        priority: params.priority,
        persistent: params.persistent,
        expires_at: params.expires_at.map(format_datetime),
        status: "sent".to_string(),
        target_count: params.target_count,
        delivered_count: 0,
        created_at: format_datetime(now),
    })
}

pub async fn update_broadcast_delivered_count(
    proxy: &DatabaseProxy,
    broadcast_id: &str,
    delivered_count: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "broadcasts" SET "deliveredCount" = $2 WHERE "id" = $1"#)
        .bind(broadcast_id)
        .bind(delivered_count)
        .execute(proxy.pool())
        .await?;
    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct ListBroadcastsParams {
    pub status: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

pub async fn list_broadcasts(
    proxy: &DatabaseProxy,
    params: ListBroadcastsParams,
) -> Result<(Vec<Broadcast>, i64), sqlx::Error> {
    let select_cols = r#""id", "adminId", "title", "content", "target"::text as "target", "targetFilter", "priority"::text as "priority", "persistent", "expiresAt", "status"::text as "status", "targetCount", "deliveredCount", "createdAt""#;

    let (count_sql, data_sql) = if let Some(ref status) = params.status {
        (
            r#"SELECT COUNT(*) FROM "broadcasts" WHERE "status"::text = $1"#.to_string(),
            format!(
                r#"
                SELECT {} FROM "broadcasts"
                WHERE "status"::text = $1
                ORDER BY "createdAt" DESC
                LIMIT {} OFFSET {}
                "#,
                select_cols, params.limit, params.offset
            ),
        )
    } else {
        (
            r#"SELECT COUNT(*) FROM "broadcasts""#.to_string(),
            format!(
                r#"SELECT {} FROM "broadcasts" ORDER BY "createdAt" DESC LIMIT {} OFFSET {}"#,
                select_cols, params.limit, params.offset
            ),
        )
    };

    let total: i64 = if let Some(ref status) = params.status {
        sqlx::query_scalar(&count_sql)
            .bind(status)
            .fetch_one(proxy.pool())
            .await?
    } else {
        sqlx::query_scalar(&count_sql)
            .fetch_one(proxy.pool())
            .await?
    };

    let rows = if let Some(ref status) = params.status {
        sqlx::query(&data_sql)
            .bind(status)
            .fetch_all(proxy.pool())
            .await?
    } else {
        sqlx::query(&data_sql).fetch_all(proxy.pool()).await?
    };

    let broadcasts = rows
        .into_iter()
        .map(|row| {
            let created_at: NaiveDateTime = row
                .try_get("createdAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            let expires_at: Option<NaiveDateTime> = row.try_get("expiresAt").ok();

            Broadcast {
                id: row.try_get("id").unwrap_or_default(),
                admin_id: row.try_get("adminId").unwrap_or_default(),
                title: row.try_get("title").unwrap_or_default(),
                content: row.try_get("content").unwrap_or_default(),
                target: row.try_get::<String, _>("target").unwrap_or_default(),
                target_filter: row.try_get("targetFilter").ok(),
                priority: row.try_get::<String, _>("priority").unwrap_or_default(),
                persistent: row.try_get("persistent").unwrap_or(false),
                expires_at: expires_at.map(format_datetime),
                status: row.try_get::<String, _>("status").unwrap_or_default(),
                target_count: row.try_get("targetCount").unwrap_or(0),
                delivered_count: row.try_get("deliveredCount").unwrap_or(0),
                created_at: format_datetime(created_at),
            }
        })
        .collect();

    Ok((broadcasts, total))
}

pub async fn get_broadcast_by_id(
    proxy: &DatabaseProxy,
    id: &str,
) -> Result<Option<Broadcast>, sqlx::Error> {
    let row = sqlx::query(r#"SELECT "id", "adminId", "title", "content", "target"::text as "target", "targetFilter", "priority"::text as "priority", "persistent", "expiresAt", "status"::text as "status", "targetCount", "deliveredCount", "createdAt" FROM "broadcasts" WHERE "id" = $1"#)
        .bind(id)
        .fetch_optional(proxy.pool())
        .await?;

    Ok(row.map(|row| {
        let created_at: NaiveDateTime = row
            .try_get("createdAt")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let expires_at: Option<NaiveDateTime> = row.try_get("expiresAt").ok();

        Broadcast {
            id: row.try_get("id").unwrap_or_default(),
            admin_id: row.try_get("adminId").unwrap_or_default(),
            title: row.try_get("title").unwrap_or_default(),
            content: row.try_get("content").unwrap_or_default(),
            target: row.try_get::<String, _>("target").unwrap_or_default(),
            target_filter: row.try_get("targetFilter").ok(),
            priority: row.try_get::<String, _>("priority").unwrap_or_default(),
            persistent: row.try_get("persistent").unwrap_or(false),
            expires_at: expires_at.map(format_datetime),
            status: row.try_get::<String, _>("status").unwrap_or_default(),
            target_count: row.try_get("targetCount").unwrap_or(0),
            delivered_count: row.try_get("deliveredCount").unwrap_or(0),
            created_at: format_datetime(created_at),
        }
    }))
}

pub async fn create_audit_log(
    proxy: &DatabaseProxy,
    broadcast_id: &str,
    admin_id: &str,
    action: &str,
    details: Option<serde_json::Value>,
) -> Result<BroadcastAuditLog, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"
        INSERT INTO "broadcast_audit_logs" ("id", "broadcastId", "adminId", "action", "details", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&id)
    .bind(broadcast_id)
    .bind(admin_id)
    .bind(action)
    .bind(&details)
    .bind(now)
    .execute(proxy.pool())
    .await?;

    Ok(BroadcastAuditLog {
        id,
        broadcast_id: broadcast_id.to_string(),
        admin_id: admin_id.to_string(),
        action: action.to_string(),
        details,
        created_at: format_datetime(now),
    })
}

pub async fn list_audit_logs(
    proxy: &DatabaseProxy,
    broadcast_id: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<BroadcastAuditLog>, sqlx::Error> {
    let rows = if let Some(bid) = broadcast_id {
        sqlx::query(
            r#"
            SELECT * FROM "broadcast_audit_logs"
            WHERE "broadcastId" = $1
            ORDER BY "createdAt" DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(bid)
        .bind(limit)
        .bind(offset)
        .fetch_all(proxy.pool())
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT * FROM "broadcast_audit_logs"
            ORDER BY "createdAt" DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(proxy.pool())
        .await?
    };

    Ok(rows
        .into_iter()
        .map(|row| {
            let created_at: NaiveDateTime = row
                .try_get("createdAt")
                .unwrap_or_else(|_| Utc::now().naive_utc());
            BroadcastAuditLog {
                id: row.try_get("id").unwrap_or_default(),
                broadcast_id: row.try_get("broadcastId").unwrap_or_default(),
                admin_id: row.try_get("adminId").unwrap_or_default(),
                action: row.try_get("action").unwrap_or_default(),
                details: row.try_get("details").ok(),
                created_at: format_datetime(created_at),
            }
        })
        .collect())
}

pub async fn insert_broadcast_notifications(
    proxy: &DatabaseProxy,
    broadcast_id: &str,
    user_ids: &[String],
    title: &str,
    content: &str,
    priority: &str,
) -> Result<i64, sqlx::Error> {
    if user_ids.is_empty() {
        return Ok(0);
    }

    let now = Utc::now().naive_utc();
    let mut count = 0i64;

    for user_id in user_ids {
        let notif_id = uuid::Uuid::new_v4().to_string();
        let result = sqlx::query(
            r#"
            INSERT INTO "notifications" (
                "id", "userId", "type", "title", "content", "status", "priority", "broadcastId", "createdAt", "updatedAt"
            )
            VALUES ($1, $2, 'SYSTEM'::"NotificationType", $3, $4, 'UNREAD'::"NotificationStatus", $5::"NotificationPriority", $6, $7, $7)
            "#,
        )
        .bind(&notif_id)
        .bind(user_id)
        .bind(title)
        .bind(content)
        .bind(priority)
        .bind(broadcast_id)
        .bind(now)
        .execute(proxy.pool())
        .await;

        if result.is_ok() {
            count += 1;
        }
    }

    Ok(count)
}
