use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::db::operations::broadcast::{self, Broadcast, CreateBroadcastParams};
use crate::db::DatabaseProxy;
use crate::routes::realtime;

#[derive(Debug, Error)]
pub enum BroadcastError {
    #[error("database error: {0}")]
    Database(String),
    #[error("invalid target: {0}")]
    InvalidTarget(String),
    #[error("not found")]
    NotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBroadcastRequest {
    pub title: String,
    pub content: String,
    pub target: String,
    pub target_filter: Option<serde_json::Value>,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub persistent: bool,
    pub expires_at: Option<String>,
}

fn default_priority() -> String {
    "NORMAL".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastResult {
    pub broadcast: Broadcast,
    pub delivered_count: i32,
    pub online_count: usize,
}

pub async fn create_broadcast(
    proxy: &DatabaseProxy,
    admin_id: &str,
    req: CreateBroadcastRequest,
) -> Result<BroadcastResult, BroadcastError> {
    let target = req.target.to_lowercase();
    if !["all", "online", "group", "user", "users"].contains(&target.as_str()) {
        return Err(BroadcastError::InvalidTarget(target));
    }

    let target_user_ids = resolve_target_users(proxy, &target, req.target_filter.as_ref()).await?;
    let online_ids = realtime::get_online_user_ids_async().await;
    let online_count = online_ids.len();

    let expires_at = req.expires_at.as_ref().and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.naive_utc())
    });

    let params = CreateBroadcastParams {
        admin_id: admin_id.to_string(),
        title: req.title.clone(),
        content: req.content.clone(),
        target: target.clone(),
        target_filter: req.target_filter.clone(),
        priority: req.priority.clone(),
        persistent: req.persistent,
        expires_at,
        target_count: target_user_ids.len() as i32,
    };

    let broadcast_record = broadcast::create_broadcast(proxy, params)
        .await
        .map_err(|e| BroadcastError::Database(e.to_string()))?;

    broadcast::create_audit_log(
        proxy,
        &broadcast_record.id,
        admin_id,
        "created",
        Some(serde_json::json!({
            "target": target,
            "targetCount": target_user_ids.len(),
            "persistent": req.persistent,
        })),
    )
    .await
    .ok();

    let delivered_ids: Vec<String> = if target == "online" {
        online_ids.clone()
    } else {
        target_user_ids
            .iter()
            .filter(|id| online_ids.contains(id))
            .cloned()
            .collect()
    };

    for user_id in &delivered_ids {
        realtime::send_event(
            user_id.clone(),
            None,
            "admin-broadcast",
            serde_json::json!({
                "broadcastId": broadcast_record.id,
                "title": req.title,
                "content": req.content,
                "priority": req.priority,
            }),
        );
    }

    let delivered_count = delivered_ids.len() as i32;

    if req.persistent && !target_user_ids.is_empty() {
        let persisted = broadcast::insert_broadcast_notifications(
            proxy,
            &broadcast_record.id,
            &target_user_ids,
            &req.title,
            &req.content,
            &req.priority,
        )
        .await
        .unwrap_or(0);

        broadcast::update_broadcast_delivered_count(proxy, &broadcast_record.id, persisted as i32)
            .await
            .ok();
    } else {
        broadcast::update_broadcast_delivered_count(proxy, &broadcast_record.id, delivered_count)
            .await
            .ok();
    }

    Ok(BroadcastResult {
        broadcast: broadcast_record,
        delivered_count,
        online_count,
    })
}

async fn resolve_target_users(
    proxy: &DatabaseProxy,
    target: &str,
    filter: Option<&serde_json::Value>,
) -> Result<Vec<String>, BroadcastError> {
    match target {
        "all" => {
            let rows: Vec<(String,)> =
                sqlx::query_as(r#"SELECT "id" FROM "users" WHERE "role"::text != 'BANNED'"#)
                    .fetch_all(proxy.pool())
                    .await
                    .map_err(|e| BroadcastError::Database(e.to_string()))?;
            Ok(rows.into_iter().map(|(id,)| id).collect())
        }
        "online" => Ok(realtime::get_online_user_ids_async().await),
        "user" => {
            if let Some(filter) = filter {
                if let Some(user_id) = filter.get("userId").and_then(|v| v.as_str()) {
                    return Ok(vec![user_id.to_string()]);
                }
            }
            Ok(vec![])
        }
        "users" => {
            if let Some(filter) = filter {
                if let Some(user_ids) = filter.get("userIds").and_then(|v| v.as_array()) {
                    return Ok(user_ids
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect());
                }
            }
            Ok(vec![])
        }
        "group" => Ok(vec![]),
        _ => Err(BroadcastError::InvalidTarget(target.to_string())),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineStats {
    pub online_count: usize,
    pub online_user_ids: Vec<String>,
}

pub async fn get_online_stats() -> OnlineStats {
    let online_user_ids = realtime::get_online_user_ids_async().await;
    OnlineStats {
        online_count: online_user_ids.len(),
        online_user_ids,
    }
}
