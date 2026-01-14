use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserBehaviorInsight {
    pub id: String,
    pub analysis_date: NaiveDate,
    pub user_segment: String,
    pub patterns: serde_json::Value,
    pub insights: serde_json::Value,
    pub recommendations: serde_json::Value,
    pub user_count: i32,
    pub data_points: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertRootCauseAnalysis {
    pub id: String,
    pub alert_rule_id: String,
    pub severity: String,
    pub root_cause: String,
    pub suggested_fixes: serde_json::Value,
    pub related_metrics: serde_json::Value,
    pub confidence: f64,
    pub status: String,
    pub resolved_by: Option<String>,
    pub resolved_at: Option<NaiveDateTime>,
    pub resolution: Option<String>,
}

pub async fn upsert_user_behavior_insight(
    proxy: &DatabaseProxy,
    analysis_date: NaiveDate,
    user_segment: &str,
    patterns: &serde_json::Value,
    insights: &serde_json::Value,
    recommendations: &serde_json::Value,
    user_count: i32,
    data_points: i32,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "user_behavior_insights" (
            "id", "analysisDate", "userSegment", "patterns", "insights",
            "recommendations", "userCount", "dataPoints", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("analysisDate", "userSegment") DO UPDATE SET
            "patterns" = EXCLUDED."patterns",
            "insights" = EXCLUDED."insights",
            "recommendations" = EXCLUDED."recommendations",
            "userCount" = EXCLUDED."userCount",
            "dataPoints" = EXCLUDED."dataPoints"
        "#,
    )
    .bind(id)
    .bind(analysis_date)
    .bind(user_segment)
    .bind(patterns)
    .bind(insights)
    .bind(recommendations)
    .bind(user_count)
    .bind(data_points)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(id.to_string())
}

pub async fn insert_alert_root_cause_analysis(
    proxy: &DatabaseProxy,
    alert_rule_id: &str,
    severity: &str,
    root_cause: &str,
    suggested_fixes: &serde_json::Value,
    related_metrics: &serde_json::Value,
    confidence: f64,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "alert_root_cause_analyses" (
            "id", "alertRuleId", "severity", "rootCause", "suggestedFixes",
            "relatedMetrics", "confidence", "status", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $8)
        "#,
    )
    .bind(id)
    .bind(alert_rule_id)
    .bind(severity)
    .bind(root_cause)
    .bind(suggested_fixes)
    .bind(related_metrics)
    .bind(confidence)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(id.to_string())
}

pub async fn update_alert_root_cause_resolved(
    proxy: &DatabaseProxy,
    analysis_id: &str,
    resolved_by: &str,
    resolution: &str,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    let uuid =
        uuid::Uuid::parse_str(analysis_id).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    sqlx::query(
        r#"
        UPDATE "alert_root_cause_analyses" SET
            "status" = 'resolved',
            "resolvedBy" = $1,
            "resolvedAt" = $2,
            "resolution" = $3,
            "updatedAt" = $2
        WHERE "id" = $4
        "#,
    )
    .bind(resolved_by)
    .bind(now)
    .bind(resolution)
    .bind(uuid)
    .execute(proxy.pool())
    .await?;
    Ok(())
}
