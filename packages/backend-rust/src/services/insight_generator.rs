use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: String,
    #[serde(rename = "type")]
    pub insight_type: String,
    pub segment: Option<String>,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub metrics: serde_json::Value,
    pub recommendations: Vec<String>,
    pub status: String,
    pub generated_at: String,
    pub acknowledged_by: Option<String>,
    pub acknowledged_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsightsListResult {
    pub insights: Vec<Insight>,
    pub total: i64,
}

#[derive(Debug, Clone)]
pub struct SegmentStats {
    pub user_count: i64,
    pub avg_accuracy: f64,
    pub avg_response_time: f64,
    pub active_ratio: f64,
    pub inactive_7d_count: i64,
    pub struggling_count: i64,
    pub high_performers_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInsightRequest {
    pub segment: Option<String>,
    pub insight_type: Option<String>,
}

pub async fn generate_insights(
    proxy: &DatabaseProxy,
    request: GenerateInsightRequest,
) -> Result<Vec<Insight>, String> {
    let pool = proxy.pool();
    let stats = collect_segment_stats(pool, request.segment.as_deref()).await?;
    let mut insights = Vec::new();

    if stats.avg_accuracy < 0.5 && stats.user_count > 5 {
        let insight = create_insight(
            "low_accuracy",
            request.segment.as_deref(),
            "部分用户学习困难",
            &format!(
                "平均正确率为 {:.1}%，低于健康阈值 50%。共有 {} 名用户在此分群中。",
                stats.avg_accuracy * 100.0,
                stats.user_count
            ),
            "warning",
            serde_json::json!({
                "avgAccuracy": stats.avg_accuracy,
                "userCount": stats.user_count,
                "strugglingCount": stats.struggling_count
            }),
            vec![
                "降低每日新词数量".to_string(),
                "增加复习频率".to_string(),
                "启用更多提示功能".to_string(),
            ],
        );
        insights.push(insight);
    }

    if stats.inactive_7d_count > 0 {
        let inactive_ratio = stats.inactive_7d_count as f64 / stats.user_count.max(1) as f64;
        if inactive_ratio > 0.3 {
            let insight = create_insight(
                "high_churn_risk",
                request.segment.as_deref(),
                "用户流失风险较高",
                &format!(
                    "{} 名用户在过去 7 天内无活动，占比 {:.1}%。",
                    stats.inactive_7d_count,
                    inactive_ratio * 100.0
                ),
                "critical",
                serde_json::json!({
                    "inactiveCount": stats.inactive_7d_count,
                    "inactiveRatio": inactive_ratio,
                    "totalUsers": stats.user_count
                }),
                vec![
                    "发送召回通知".to_string(),
                    "推送个性化学习建议".to_string(),
                    "简化学习任务".to_string(),
                ],
            );
            insights.push(insight);
        }
    }

    if stats.avg_response_time > 5000.0 {
        let insight = create_insight(
            "slow_response",
            request.segment.as_deref(),
            "平均响应时间过长",
            &format!(
                "平均响应时间为 {:.0}ms，超过推荐阈值 5000ms。",
                stats.avg_response_time
            ),
            "info",
            serde_json::json!({
                "avgResponseTime": stats.avg_response_time
            }),
            vec![
                "检查题目难度设置".to_string(),
                "考虑提供更多上下文提示".to_string(),
            ],
        );
        insights.push(insight);
    }

    if stats.high_performers_count as f64 / stats.user_count.max(1) as f64 > 0.3 {
        let insight = create_insight(
            "high_performers",
            request.segment.as_deref(),
            "高绩效用户比例较高",
            &format!(
                "{} 名用户正确率超过 80%，可以考虑提升难度。",
                stats.high_performers_count
            ),
            "info",
            serde_json::json!({
                "highPerformersCount": stats.high_performers_count,
                "ratio": stats.high_performers_count as f64 / stats.user_count.max(1) as f64
            }),
            vec![
                "为高绩效用户增加词汇难度".to_string(),
                "引入更多生词".to_string(),
            ],
        );
        insights.push(insight);
    }

    if insights.is_empty() {
        let insight = create_insight(
            "healthy",
            request.segment.as_deref(),
            "系统运行正常",
            "当前各项指标均在健康范围内，无需特别关注。",
            "info",
            serde_json::json!({
                "avgAccuracy": stats.avg_accuracy,
                "userCount": stats.user_count,
                "avgResponseTime": stats.avg_response_time
            }),
            vec![],
        );
        insights.push(insight);
    }

    for insight in &insights {
        store_insight(pool, insight).await?;
    }

    store_user_behavior_insight(proxy, request.segment.as_deref(), &stats, &insights).await;

    Ok(insights)
}

async fn store_user_behavior_insight(
    proxy: &DatabaseProxy,
    segment: Option<&str>,
    stats: &SegmentStats,
    insights: &[Insight],
) {
    let analysis_date = Utc::now().date_naive();
    let user_segment = segment.unwrap_or("all").to_string();

    let patterns = serde_json::json!({
        "avgAccuracy": stats.avg_accuracy,
        "avgResponseTime": stats.avg_response_time,
        "activeRatio": stats.active_ratio,
        "strugglingRatio": stats.struggling_count as f64 / stats.user_count.max(1) as f64,
        "highPerformersRatio": stats.high_performers_count as f64 / stats.user_count.max(1) as f64,
    });

    let insights_summary: Vec<serde_json::Value> = insights.iter().map(|i| {
        serde_json::json!({
            "type": i.insight_type,
            "severity": i.severity,
            "title": i.title,
        })
    }).collect();

    let recommendations: Vec<String> = insights.iter()
        .flat_map(|i| i.recommendations.clone())
        .collect();

    if let Err(e) = crate::db::operations::upsert_user_behavior_insight(
        proxy,
        analysis_date,
        &user_segment,
        &patterns,
        &serde_json::json!(insights_summary),
        &serde_json::json!(recommendations),
        stats.user_count as i32,
        (stats.user_count * 10) as i32,
    ).await {
        tracing::warn!(error = %e, "Failed to store user behavior insight");
    }
}

fn create_insight(
    insight_type: &str,
    segment: Option<&str>,
    title: &str,
    description: &str,
    severity: &str,
    metrics: serde_json::Value,
    recommendations: Vec<String>,
) -> Insight {
    Insight {
        id: uuid::Uuid::new_v4().to_string(),
        insight_type: insight_type.to_string(),
        segment: segment.map(|s| s.to_string()),
        title: title.to_string(),
        description: description.to_string(),
        severity: severity.to_string(),
        metrics,
        recommendations,
        status: "active".to_string(),
        generated_at: Utc::now().to_rfc3339(),
        acknowledged_by: None,
        acknowledged_at: None,
    }
}

async fn store_insight(pool: &PgPool, insight: &Insight) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO "system_insights" ("id", "type", "segment", "title", "description", "severity", "metrics", "recommendations", "status", "generatedAt", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        "#,
    )
    .bind(&insight.id)
    .bind(&insight.insight_type)
    .bind(&insight.segment)
    .bind(&insight.title)
    .bind(&insight.description)
    .bind(&insight.severity)
    .bind(&insight.metrics)
    .bind(serde_json::to_value(&insight.recommendations).unwrap_or_default())
    .bind(&insight.status)
    .bind(Utc::now().naive_utc())
    .execute(pool)
    .await
    .map_err(|e| format!("存储洞察失败: {e}"))?;

    Ok(())
}

async fn collect_segment_stats(pool: &PgPool, _segment: Option<&str>) -> Result<SegmentStats, String> {
    let seven_days_ago = Utc::now() - chrono::Duration::days(7);

    let stats_row = sqlx::query(
        r#"
        SELECT
            COUNT(DISTINCT ar."userId") as user_count,
            COALESCE(AVG(CASE WHEN ar."isCorrect" THEN 1.0 ELSE 0.0 END), 0) as avg_accuracy,
            COALESCE(AVG(ar."responseTime"), 0) as avg_response_time
        FROM "answer_records" ar
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询统计失败: {e}"))?;

    let inactive_row = sqlx::query(
        r#"
        SELECT COUNT(*) as inactive_count
        FROM "users" u
        WHERE NOT EXISTS (
            SELECT 1 FROM "answer_records" ar
            WHERE ar."userId" = u."id" AND ar."timestamp" >= $1
        )
        "#,
    )
    .bind(seven_days_ago.naive_utc())
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询不活跃用户失败: {e}"))?;

    let performance_row = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE avg_acc < 0.5) as struggling,
            COUNT(*) FILTER (WHERE avg_acc >= 0.8) as high_performers
        FROM (
            SELECT "userId", AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) as avg_acc
            FROM "answer_records"
            GROUP BY "userId"
        ) sub
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询绩效分布失败: {e}"))?;

    let user_count = stats_row.try_get::<i64, _>("user_count").unwrap_or(0);

    Ok(SegmentStats {
        user_count,
        avg_accuracy: stats_row.try_get::<f64, _>("avg_accuracy").unwrap_or(0.0),
        avg_response_time: stats_row.try_get::<f64, _>("avg_response_time").unwrap_or(0.0),
        active_ratio: if user_count > 0 {
            1.0 - (inactive_row.try_get::<i64, _>("inactive_count").unwrap_or(0) as f64 / user_count as f64)
        } else {
            0.0
        },
        inactive_7d_count: inactive_row.try_get::<i64, _>("inactive_count").unwrap_or(0),
        struggling_count: performance_row.try_get::<i64, _>("struggling").unwrap_or(0),
        high_performers_count: performance_row.try_get::<i64, _>("high_performers").unwrap_or(0),
    })
}

pub async fn get_insights(
    proxy: &DatabaseProxy,
    limit: i64,
    offset: i64,
    status: Option<&str>,
) -> Result<InsightsListResult, String> {
    let pool = proxy.pool();

    let count_row = if let Some(status) = status {
        sqlx::query(r#"SELECT COUNT(*) as total FROM "system_insights" WHERE "status" = $1"#)
            .bind(status)
            .fetch_one(pool)
            .await
    } else {
        sqlx::query(r#"SELECT COUNT(*) as total FROM "system_insights""#)
            .fetch_one(pool)
            .await
    }
    .map_err(|e| format!("查询总数失败: {e}"))?;

    let total = count_row.try_get::<i64, _>("total").unwrap_or(0);

    let rows = if let Some(status) = status {
        sqlx::query(
            r#"
            SELECT "id", "type", "segment", "title", "description", "severity", "metrics", "recommendations", "status", "generatedAt", "acknowledgedBy", "acknowledgedAt"
            FROM "system_insights"
            WHERE "status" = $1
            ORDER BY "generatedAt" DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            r#"
            SELECT "id", "type", "segment", "title", "description", "severity", "metrics", "recommendations", "status", "generatedAt", "acknowledgedBy", "acknowledgedAt"
            FROM "system_insights"
            ORDER BY "generatedAt" DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }
    .map_err(|e| format!("查询洞察列表失败: {e}"))?;

    let insights = rows
        .into_iter()
        .map(|row| {
            let generated_at: chrono::NaiveDateTime = row.try_get("generatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
            let acknowledged_at: Option<chrono::NaiveDateTime> = row.try_get("acknowledgedAt").ok();
            let recommendations: serde_json::Value = row.try_get("recommendations").unwrap_or(serde_json::json!([]));

            Insight {
                id: row.try_get("id").unwrap_or_default(),
                insight_type: row.try_get("type").unwrap_or_default(),
                segment: row.try_get("segment").ok(),
                title: row.try_get("title").unwrap_or_default(),
                description: row.try_get("description").unwrap_or_default(),
                severity: row.try_get("severity").unwrap_or_default(),
                metrics: row.try_get("metrics").unwrap_or(serde_json::json!({})),
                recommendations: serde_json::from_value(recommendations).unwrap_or_default(),
                status: row.try_get("status").unwrap_or_default(),
                generated_at: crate::auth::format_naive_datetime_iso_millis(generated_at),
                acknowledged_by: row.try_get("acknowledgedBy").ok(),
                acknowledged_at: acknowledged_at.map(crate::auth::format_naive_datetime_iso_millis),
            }
        })
        .collect();

    Ok(InsightsListResult { insights, total })
}

pub async fn get_insight_by_id(proxy: &DatabaseProxy, id: &str) -> Result<Option<Insight>, String> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT "id", "type", "segment", "title", "description", "severity", "metrics", "recommendations", "status", "generatedAt", "acknowledgedBy", "acknowledgedAt"
        FROM "system_insights"
        WHERE "id" = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询洞察失败: {e}"))?;

    Ok(row.map(|row| {
        let generated_at: chrono::NaiveDateTime = row.try_get("generatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
        let acknowledged_at: Option<chrono::NaiveDateTime> = row.try_get("acknowledgedAt").ok();
        let recommendations: serde_json::Value = row.try_get("recommendations").unwrap_or(serde_json::json!([]));

        Insight {
            id: row.try_get("id").unwrap_or_default(),
            insight_type: row.try_get("type").unwrap_or_default(),
            segment: row.try_get("segment").ok(),
            title: row.try_get("title").unwrap_or_default(),
            description: row.try_get("description").unwrap_or_default(),
            severity: row.try_get("severity").unwrap_or_default(),
            metrics: row.try_get("metrics").unwrap_or(serde_json::json!({})),
            recommendations: serde_json::from_value(recommendations).unwrap_or_default(),
            status: row.try_get("status").unwrap_or_default(),
            generated_at: crate::auth::format_naive_datetime_iso_millis(generated_at),
            acknowledged_by: row.try_get("acknowledgedBy").ok(),
            acknowledged_at: acknowledged_at.map(crate::auth::format_naive_datetime_iso_millis),
        }
    }))
}
