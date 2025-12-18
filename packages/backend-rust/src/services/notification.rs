use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotificationType {
    Achievement,
    Reminder,
    System,
    Social,
    Learning,
}

impl NotificationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Achievement => "ACHIEVEMENT",
            Self::Reminder => "REMINDER",
            Self::System => "SYSTEM",
            Self::Social => "SOCIAL",
            Self::Learning => "LEARNING",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "REMINDER" => Self::Reminder,
            "SYSTEM" => Self::System,
            "SOCIAL" => Self::Social,
            "LEARNING" => Self::Learning,
            _ => Self::Achievement,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotificationPriority {
    Low,
    Normal,
    High,
    Urgent,
}

impl NotificationPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "LOW",
            Self::Normal => "NORMAL",
            Self::High => "HIGH",
            Self::Urgent => "URGENT",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "LOW" => Self::Low,
            "HIGH" => Self::High,
            "URGENT" => Self::Urgent,
            _ => Self::Normal,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendNotificationInput {
    pub user_id: String,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    #[serde(default)]
    pub action_url: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    pub id: String,
    pub user_id: String,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub priority: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_url: Option<String>,
    pub is_read: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_at: Option<String>,
    pub is_archived: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationStats {
    pub total: i64,
    pub unread: i64,
    pub archived: i64,
    pub by_type: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationFilters {
    #[serde(default)]
    pub notification_type: Option<String>,
    #[serde(default)]
    pub is_read: Option<bool>,
    #[serde(default)]
    pub is_archived: Option<bool>,
    #[serde(default)]
    pub priority: Option<String>,
}

pub enum SelectedPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

pub async fn select_pool(proxy: &DatabaseProxy, state: DatabaseState) -> Result<SelectedPool, String> {
    match state {
        DatabaseState::Degraded | DatabaseState::Unavailable => proxy
            .fallback_pool().await
            .map(SelectedPool::Fallback)
            .ok_or_else(|| "服务不可用".to_string()),
        _ => match proxy.primary_pool().await {
            Some(pool) => Ok(SelectedPool::Primary(pool)),
            None => proxy.fallback_pool().await
                .map(SelectedPool::Fallback)
                .ok_or_else(|| "服务不可用".to_string()),
        },
    }
}

pub async fn send_notification(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    input: SendNotificationInput,
) -> Result<NotificationItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let priority = input.priority.as_deref().unwrap_or("NORMAL");

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::json!(id));
        data.insert("userId".into(), serde_json::json!(input.user_id));
        data.insert("type".into(), serde_json::json!(input.notification_type));
        data.insert("title".into(), serde_json::json!(input.title));
        data.insert("message".into(), serde_json::json!(input.message));
        data.insert("priority".into(), serde_json::json!(priority));
        if let Some(ref d) = input.data {
            data.insert("data".into(), serde_json::json!(d.to_string()));
        }
        if let Some(ref url) = input.action_url {
            data.insert("actionUrl".into(), serde_json::json!(url));
        }
        data.insert("isRead".into(), serde_json::json!(false));
        data.insert("isArchived".into(), serde_json::json!(false));
        if let Some(ref exp) = input.expires_at {
            data.insert("expiresAt".into(), serde_json::json!(exp));
        }
        data.insert("createdAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "notifications".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

        return Ok(NotificationItem {
            id,
            user_id: input.user_id,
            notification_type: input.notification_type,
            title: input.title,
            message: input.message,
            priority: priority.to_string(),
            data: input.data,
            action_url: input.action_url,
            is_read: false,
            read_at: None,
            is_archived: false,
            archived_at: None,
            expires_at: input.expires_at,
            created_at: now_str,
        });
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let data_json = input.data.as_ref().map(|d| serde_json::to_string(d).unwrap_or_default());

    sqlx::query(
        r#"INSERT INTO "notifications" ("id","userId","type","title","message","priority","data","actionUrl","isRead","isArchived","expiresAt","createdAt")
           VALUES ($1,$2,$3::notification_type,$4,$5,$6::notification_priority,$7::jsonb,$8,false,false,$9,NOW())"#,
    )
    .bind(&id)
    .bind(&input.user_id)
    .bind(&input.notification_type)
    .bind(&input.title)
    .bind(&input.message)
    .bind(priority)
    .bind(&data_json)
    .bind(&input.action_url)
    .bind(&input.expires_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("写入失败: {e}"))?;

    Ok(NotificationItem {
        id,
        user_id: input.user_id,
        notification_type: input.notification_type,
        title: input.title,
        message: input.message,
        priority: priority.to_string(),
        data: input.data,
        action_url: input.action_url,
        is_read: false,
        read_at: None,
        is_archived: false,
        archived_at: None,
        expires_at: input.expires_at,
        created_at: now_str,
    })
}

pub async fn get_notifications(
    pool: &SelectedPool,
    user_id: &str,
    filters: &NotificationFilters,
    page: i32,
    page_size: i32,
) -> Result<(Vec<NotificationItem>, i64), String> {
    let offset = (page - 1) * page_size;

    match pool {
        SelectedPool::Primary(pg) => {
            let rows = build_and_execute_query_pg(pg, user_id, filters, page_size, offset).await?;
            let total = count_notifications_pg(pg, user_id, filters).await?;

            let items = rows.iter().map(|row| parse_notification_row_pg(row)).collect();
            Ok((items, total))
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = build_and_execute_query_sqlite(sqlite, user_id, filters, page_size, offset).await?;
            let total = count_notifications_sqlite(sqlite, user_id, filters).await?;

            let items = rows.iter().map(|row| parse_notification_row_sqlite(row)).collect();
            Ok((items, total))
        }
    }
}

pub async fn get_notification(pool: &SelectedPool, notification_id: &str) -> Result<Option<NotificationItem>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","type"::text,"title","message","priority"::text,"data","actionUrl","isRead","readAt","isArchived","archivedAt","expiresAt","createdAt"
                   FROM "notifications" WHERE "id" = $1 AND "deletedAt" IS NULL"#,
            )
            .bind(notification_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| parse_notification_row_pg(&r)))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","type","title","message","priority","data","actionUrl","isRead","readAt","isArchived","archivedAt","expiresAt","createdAt"
                   FROM "notifications" WHERE "id" = ? AND "deletedAt" IS NULL"#,
            )
            .bind(notification_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| parse_notification_row_sqlite(&r)))
        }
    }
}

pub async fn mark_as_read(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    notification_id: &str,
) -> Result<(), String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(notification_id));

        let mut data = serde_json::Map::new();
        data.insert("isRead".into(), serde_json::json!(true));
        data.insert("readAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "notifications".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("更新失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    sqlx::query(r#"UPDATE "notifications" SET "isRead" = true, "readAt" = NOW() WHERE "id" = $1"#)
        .bind(notification_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("更新失败: {e}"))?;

    Ok(())
}

pub async fn mark_many_as_read(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    notification_ids: &[String],
) -> Result<i64, String> {
    if notification_ids.is_empty() {
        return Ok(0);
    }

    let now = Utc::now();
    let mut count = 0i64;

    if proxy.sqlite_enabled() {
        for id in notification_ids {
            let mut where_clause = serde_json::Map::new();
            where_clause.insert("id".into(), serde_json::json!(id));

            let mut data = serde_json::Map::new();
            data.insert("isRead".into(), serde_json::json!(true));
            data.insert("readAt".into(), serde_json::json!(now.to_rfc3339()));

            let op = crate::db::dual_write_manager::WriteOperation::Update {
                table: "notifications".to_string(),
                r#where: where_clause,
                data,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(false),
            };
            if proxy.write_operation(state, op).await.is_ok() {
                count += 1;
            }
        }
        return Ok(count);
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let placeholders: Vec<String> = (1..=notification_ids.len()).map(|i| format!("${i}")).collect();
    let query = format!(
        r#"UPDATE "notifications" SET "isRead" = true, "readAt" = NOW() WHERE "id" IN ({})"#,
        placeholders.join(",")
    );

    let mut q = sqlx::query(&query);
    for id in notification_ids {
        q = q.bind(id);
    }

    let result = q.execute(&pool).await.map_err(|e| format!("更新失败: {e}"))?;
    Ok(result.rows_affected() as i64)
}

pub async fn mark_all_as_read(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<i64, String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let pool = select_pool(proxy, state).await?;
        let unread_ids = get_unread_notification_ids(&pool, user_id).await?;
        return mark_many_as_read(proxy, state, &unread_ids).await;
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let result = sqlx::query(
        r#"UPDATE "notifications" SET "isRead" = true, "readAt" = $1 WHERE "userId" = $2 AND "isRead" = false AND "deletedAt" IS NULL"#,
    )
    .bind(now)
    .bind(user_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    Ok(result.rows_affected() as i64)
}

pub async fn archive_notification(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    notification_id: &str,
) -> Result<(), String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(notification_id));

        let mut data = serde_json::Map::new();
        data.insert("isArchived".into(), serde_json::json!(true));
        data.insert("archivedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "notifications".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("更新失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    sqlx::query(r#"UPDATE "notifications" SET "isArchived" = true, "archivedAt" = NOW() WHERE "id" = $1"#)
        .bind(notification_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("更新失败: {e}"))?;

    Ok(())
}

pub async fn delete_notification(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    notification_id: &str,
) -> Result<(), String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(notification_id));

        let mut data = serde_json::Map::new();
        data.insert("deletedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "notifications".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("删除失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    sqlx::query(r#"UPDATE "notifications" SET "deletedAt" = NOW() WHERE "id" = $1"#)
        .bind(notification_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("删除失败: {e}"))?;

    Ok(())
}

pub async fn delete_many_notifications(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    notification_ids: &[String],
) -> Result<i64, String> {
    if notification_ids.is_empty() {
        return Ok(0);
    }

    let now = Utc::now();
    let mut count = 0i64;

    if proxy.sqlite_enabled() {
        for id in notification_ids {
            let mut where_clause = serde_json::Map::new();
            where_clause.insert("id".into(), serde_json::json!(id));

            let mut data = serde_json::Map::new();
            data.insert("deletedAt".into(), serde_json::json!(now.to_rfc3339()));

            let op = crate::db::dual_write_manager::WriteOperation::Update {
                table: "notifications".to_string(),
                r#where: where_clause,
                data,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(false),
            };
            if proxy.write_operation(state, op).await.is_ok() {
                count += 1;
            }
        }
        return Ok(count);
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let placeholders: Vec<String> = (1..=notification_ids.len()).map(|i| format!("${i}")).collect();
    let query = format!(
        r#"UPDATE "notifications" SET "deletedAt" = NOW() WHERE "id" IN ({})"#,
        placeholders.join(",")
    );

    let mut q = sqlx::query(&query);
    for id in notification_ids {
        q = q.bind(id);
    }

    let result = q.execute(&pool).await.map_err(|e| format!("删除失败: {e}"))?;
    Ok(result.rows_affected() as i64)
}

pub async fn get_notification_stats(pool: &SelectedPool, user_id: &str) -> Result<NotificationStats, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT
                   COUNT(*) FILTER (WHERE "deletedAt" IS NULL) as total,
                   COUNT(*) FILTER (WHERE "isRead" = false AND "deletedAt" IS NULL) as unread,
                   COUNT(*) FILTER (WHERE "isArchived" = true AND "deletedAt" IS NULL) as archived
                   FROM "notifications" WHERE "userId" = $1"#,
            )
            .bind(user_id)
            .fetch_one(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let by_type_rows = sqlx::query(
                r#"SELECT "type"::text, COUNT(*) as count FROM "notifications"
                   WHERE "userId" = $1 AND "deletedAt" IS NULL GROUP BY "type""#,
            )
            .bind(user_id)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let mut by_type = serde_json::Map::new();
            for r in by_type_rows {
                let t: String = r.try_get("type").unwrap_or_default();
                let c: i64 = r.try_get("count").unwrap_or(0);
                by_type.insert(t, serde_json::json!(c));
            }

            Ok(NotificationStats {
                total: row.try_get("total").unwrap_or(0),
                unread: row.try_get("unread").unwrap_or(0),
                archived: row.try_get("archived").unwrap_or(0),
                by_type: serde_json::Value::Object(by_type),
            })
        }
        SelectedPool::Fallback(sqlite) => {
            let total: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = ? AND "deletedAt" IS NULL"#,
            )
            .bind(user_id)
            .fetch_one(sqlite)
            .await
            .unwrap_or(0);

            let unread: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = ? AND "isRead" = 0 AND "deletedAt" IS NULL"#,
            )
            .bind(user_id)
            .fetch_one(sqlite)
            .await
            .unwrap_or(0);

            let archived: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM "notifications" WHERE "userId" = ? AND "isArchived" = 1 AND "deletedAt" IS NULL"#,
            )
            .bind(user_id)
            .fetch_one(sqlite)
            .await
            .unwrap_or(0);

            let by_type_rows = sqlx::query(
                r#"SELECT "type", COUNT(*) as count FROM "notifications"
                   WHERE "userId" = ? AND "deletedAt" IS NULL GROUP BY "type""#,
            )
            .bind(user_id)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let mut by_type = serde_json::Map::new();
            for r in by_type_rows {
                let t: String = r.try_get("type").unwrap_or_default();
                let c: i64 = r.try_get("count").unwrap_or(0);
                by_type.insert(t, serde_json::json!(c));
            }

            Ok(NotificationStats {
                total,
                unread,
                archived,
                by_type: serde_json::Value::Object(by_type),
            })
        }
    }
}

pub async fn cleanup_deleted_notifications(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    days_old: i64,
) -> Result<i64, String> {
    let cutoff = Utc::now() - Duration::days(days_old);

    if proxy.sqlite_enabled() {
        let pool = select_pool(proxy, state).await?;
        let ids = match &pool {
            SelectedPool::Fallback(sqlite) => {
                let cutoff_str = cutoff.to_rfc3339();
                let rows = sqlx::query(
                    r#"SELECT "id" FROM "notifications" WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ?"#,
                )
                .bind(&cutoff_str)
                .fetch_all(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?;

                rows.iter().filter_map(|r| r.try_get::<String, _>("id").ok()).collect::<Vec<_>>()
            }
            _ => return Err("不支持的数据库".to_string()),
        };

        let mut count = 0i64;
        for id in ids {
            let mut where_clause = serde_json::Map::new();
            where_clause.insert("id".into(), serde_json::json!(id));

            let op = crate::db::dual_write_manager::WriteOperation::Delete {
                table: "notifications".to_string(),
                r#where: where_clause,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(false),
            };
            if proxy.write_operation(state, op).await.is_ok() {
                count += 1;
            }
        }
        return Ok(count);
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let result = sqlx::query(
        r#"DELETE FROM "notifications" WHERE "deletedAt" IS NOT NULL AND "deletedAt" < $1"#,
    )
    .bind(cutoff)
    .execute(&pool)
    .await
    .map_err(|e| format!("删除失败: {e}"))?;

    Ok(result.rows_affected() as i64)
}

pub async fn cleanup_expired_notifications(
    proxy: &DatabaseProxy,
    state: DatabaseState,
) -> Result<i64, String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let pool = select_pool(proxy, state).await?;
        let ids = match &pool {
            SelectedPool::Fallback(sqlite) => {
                let now_str = now.to_rfc3339();
                let rows = sqlx::query(
                    r#"SELECT "id" FROM "notifications" WHERE "expiresAt" IS NOT NULL AND "expiresAt" < ? AND "deletedAt" IS NULL"#,
                )
                .bind(&now_str)
                .fetch_all(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?;

                rows.iter().filter_map(|r| r.try_get::<String, _>("id").ok()).collect::<Vec<_>>()
            }
            _ => return Err("不支持的数据库".to_string()),
        };

        return delete_many_notifications(proxy, state, &ids).await;
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let result = sqlx::query(
        r#"UPDATE "notifications" SET "deletedAt" = NOW() WHERE "expiresAt" IS NOT NULL AND "expiresAt" < NOW() AND "deletedAt" IS NULL"#,
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    Ok(result.rows_affected() as i64)
}

async fn get_unread_notification_ids(pool: &SelectedPool, user_id: &str) -> Result<Vec<String>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id" FROM "notifications" WHERE "userId" = $1 AND "isRead" = false AND "deletedAt" IS NULL"#,
            )
            .bind(user_id)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(rows.iter().filter_map(|r| r.try_get::<String, _>("id").ok()).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(
                r#"SELECT "id" FROM "notifications" WHERE "userId" = ? AND "isRead" = 0 AND "deletedAt" IS NULL"#,
            )
            .bind(user_id)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(rows.iter().filter_map(|r| r.try_get::<String, _>("id").ok()).collect())
        }
    }
}

async fn build_and_execute_query_pg(
    pool: &PgPool,
    user_id: &str,
    filters: &NotificationFilters,
    page_size: i32,
    offset: i32,
) -> Result<Vec<sqlx::postgres::PgRow>, String> {
    let mut conditions = vec!["\"userId\" = $1".to_string(), "\"deletedAt\" IS NULL".to_string()];
    let mut bind_idx = 2;

    if filters.notification_type.is_some() {
        conditions.push(format!("\"type\"::text = ${bind_idx}"));
        bind_idx += 1;
    }
    if filters.is_read.is_some() {
        conditions.push(format!("\"isRead\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if filters.is_archived.is_some() {
        conditions.push(format!("\"isArchived\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if filters.priority.is_some() {
        conditions.push(format!("\"priority\"::text = ${bind_idx}"));
        bind_idx += 1;
    }

    let where_clause = conditions.join(" AND ");
    let query = format!(
        r#"SELECT "id","userId","type"::text,"title","message","priority"::text,"data","actionUrl","isRead","readAt","isArchived","archivedAt","expiresAt","createdAt"
           FROM "notifications" WHERE {} ORDER BY "createdAt" DESC LIMIT ${} OFFSET ${}"#,
        where_clause, bind_idx, bind_idx + 1
    );

    let mut q = sqlx::query(&query).bind(user_id);
    if let Some(ref t) = filters.notification_type {
        q = q.bind(t);
    }
    if let Some(is_read) = filters.is_read {
        q = q.bind(is_read);
    }
    if let Some(is_archived) = filters.is_archived {
        q = q.bind(is_archived);
    }
    if let Some(ref p) = filters.priority {
        q = q.bind(p);
    }
    q = q.bind(page_size).bind(offset);

    q.fetch_all(pool).await.map_err(|e| format!("查询失败: {e}"))
}

async fn build_and_execute_query_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    filters: &NotificationFilters,
    page_size: i32,
    offset: i32,
) -> Result<Vec<sqlx::sqlite::SqliteRow>, String> {
    let mut conditions = vec!["\"userId\" = ?".to_string(), "\"deletedAt\" IS NULL".to_string()];

    if filters.notification_type.is_some() {
        conditions.push("\"type\" = ?".to_string());
    }
    if filters.is_read.is_some() {
        conditions.push("\"isRead\" = ?".to_string());
    }
    if filters.is_archived.is_some() {
        conditions.push("\"isArchived\" = ?".to_string());
    }
    if filters.priority.is_some() {
        conditions.push("\"priority\" = ?".to_string());
    }

    let where_clause = conditions.join(" AND ");
    let query = format!(
        r#"SELECT "id","userId","type","title","message","priority","data","actionUrl","isRead","readAt","isArchived","archivedAt","expiresAt","createdAt"
           FROM "notifications" WHERE {} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?"#,
        where_clause
    );

    let mut q = sqlx::query(&query).bind(user_id);
    if let Some(ref t) = filters.notification_type {
        q = q.bind(t);
    }
    if let Some(is_read) = filters.is_read {
        q = q.bind(if is_read { 1 } else { 0 });
    }
    if let Some(is_archived) = filters.is_archived {
        q = q.bind(if is_archived { 1 } else { 0 });
    }
    if let Some(ref p) = filters.priority {
        q = q.bind(p);
    }
    q = q.bind(page_size).bind(offset);

    q.fetch_all(pool).await.map_err(|e| format!("查询失败: {e}"))
}

async fn count_notifications_pg(pool: &PgPool, user_id: &str, filters: &NotificationFilters) -> Result<i64, String> {
    let mut conditions = vec!["\"userId\" = $1".to_string(), "\"deletedAt\" IS NULL".to_string()];
    let mut bind_idx = 2;

    if filters.notification_type.is_some() {
        conditions.push(format!("\"type\"::text = ${bind_idx}"));
        bind_idx += 1;
    }
    if filters.is_read.is_some() {
        conditions.push(format!("\"isRead\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if filters.is_archived.is_some() {
        conditions.push(format!("\"isArchived\" = ${bind_idx}"));
        bind_idx += 1;
    }
    if filters.priority.is_some() {
        conditions.push(format!("\"priority\"::text = ${bind_idx}"));
    }

    let where_clause = conditions.join(" AND ");
    let query = format!(r#"SELECT COUNT(*) FROM "notifications" WHERE {}"#, where_clause);

    let mut q = sqlx::query_scalar(&query).bind(user_id);
    if let Some(ref t) = filters.notification_type {
        q = q.bind(t);
    }
    if let Some(is_read) = filters.is_read {
        q = q.bind(is_read);
    }
    if let Some(is_archived) = filters.is_archived {
        q = q.bind(is_archived);
    }
    if let Some(ref p) = filters.priority {
        q = q.bind(p);
    }

    q.fetch_one(pool).await.map_err(|e| format!("查询失败: {e}"))
}

async fn count_notifications_sqlite(pool: &SqlitePool, user_id: &str, filters: &NotificationFilters) -> Result<i64, String> {
    let mut conditions = vec!["\"userId\" = ?".to_string(), "\"deletedAt\" IS NULL".to_string()];

    if filters.notification_type.is_some() {
        conditions.push("\"type\" = ?".to_string());
    }
    if filters.is_read.is_some() {
        conditions.push("\"isRead\" = ?".to_string());
    }
    if filters.is_archived.is_some() {
        conditions.push("\"isArchived\" = ?".to_string());
    }
    if filters.priority.is_some() {
        conditions.push("\"priority\" = ?".to_string());
    }

    let where_clause = conditions.join(" AND ");
    let query = format!(r#"SELECT COUNT(*) FROM "notifications" WHERE {}"#, where_clause);

    let mut q = sqlx::query_scalar(&query).bind(user_id);
    if let Some(ref t) = filters.notification_type {
        q = q.bind(t);
    }
    if let Some(is_read) = filters.is_read {
        q = q.bind(if is_read { 1 } else { 0 });
    }
    if let Some(is_archived) = filters.is_archived {
        q = q.bind(if is_archived { 1 } else { 0 });
    }
    if let Some(ref p) = filters.priority {
        q = q.bind(p);
    }

    q.fetch_one(pool).await.map_err(|e| format!("查询失败: {e}"))
}

fn parse_notification_row_pg(row: &sqlx::postgres::PgRow) -> NotificationItem {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let read_at: Option<NaiveDateTime> = row.try_get("readAt").ok();
    let archived_at: Option<NaiveDateTime> = row.try_get("archivedAt").ok();
    let expires_at: Option<NaiveDateTime> = row.try_get("expiresAt").ok();

    NotificationItem {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        notification_type: row.try_get("type").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        message: row.try_get("message").unwrap_or_default(),
        priority: row.try_get("priority").unwrap_or_else(|_| "NORMAL".to_string()),
        data: row.try_get("data").ok(),
        action_url: row.try_get("actionUrl").ok(),
        is_read: row.try_get("isRead").unwrap_or(false),
        read_at: read_at.map(|d| DateTime::<Utc>::from_naive_utc_and_offset(d, Utc).to_rfc3339()),
        is_archived: row.try_get("isArchived").unwrap_or(false),
        archived_at: archived_at.map(|d| DateTime::<Utc>::from_naive_utc_and_offset(d, Utc).to_rfc3339()),
        expires_at: expires_at.map(|d| DateTime::<Utc>::from_naive_utc_and_offset(d, Utc).to_rfc3339()),
        created_at: DateTime::<Utc>::from_naive_utc_and_offset(created_at, Utc).to_rfc3339(),
    }
}

fn parse_notification_row_sqlite(row: &sqlx::sqlite::SqliteRow) -> NotificationItem {
    let data_raw: Option<String> = row.try_get("data").ok();
    let data = data_raw.and_then(|s| serde_json::from_str(&s).ok());

    NotificationItem {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        notification_type: row.try_get("type").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        message: row.try_get("message").unwrap_or_default(),
        priority: row.try_get("priority").unwrap_or_else(|_| "NORMAL".to_string()),
        data,
        action_url: row.try_get("actionUrl").ok(),
        is_read: row.try_get::<i32, _>("isRead").unwrap_or(0) != 0,
        read_at: row.try_get("readAt").ok(),
        is_archived: row.try_get::<i32, _>("isArchived").unwrap_or(0) != 0,
        archived_at: row.try_get("archivedAt").ok(),
        expires_at: row.try_get("expiresAt").ok(),
        created_at: row.try_get("createdAt").unwrap_or_default(),
    }
}
