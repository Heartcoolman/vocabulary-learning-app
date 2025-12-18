use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;
use crate::services::llm_provider::{ChatMessage, LLMProvider};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyReport {
    pub id: String,
    pub week_start: String,
    pub week_end: String,
    pub summary: String,
    pub health_score: i32,
    pub key_metrics: KeyMetrics,
    pub highlights: Vec<Highlight>,
    pub concerns: Vec<Concern>,
    pub recommendations: Vec<Recommendation>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMetrics {
    pub users: UserMetrics,
    pub learning: LearningMetrics,
    pub system: SystemMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMetrics {
    pub total: i64,
    pub active: i64,
    pub new: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningMetrics {
    pub total_answers: i64,
    pub avg_accuracy: f64,
    pub avg_response_time: f64,
    pub total_words_learned: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub uptime_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Concern {
    pub title: String,
    pub description: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub action: String,
    pub reason: String,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthTrendPoint {
    pub week_start: String,
    pub health_score: i32,
}

pub async fn generate_report(
    proxy: &DatabaseProxy,
    db_state: DatabaseState,
) -> Result<WeeklyReport, String> {
    let end = Utc::now();
    let start = end - Duration::days(7);
    let start_iso = start.to_rfc3339();
    let end_iso = end.to_rfc3339();

    let metrics = collect_metrics(proxy, db_state, start, end).await?;
    let (summary, health_score, highlights, concerns, recommendations) =
        generate_analysis(&metrics).await;

    let report = WeeklyReport {
        id: Uuid::new_v4().to_string(),
        week_start: start_iso.clone(),
        week_end: end_iso.clone(),
        summary,
        health_score,
        key_metrics: metrics,
        highlights,
        concerns,
        recommendations,
        created_at: Utc::now().to_rfc3339(),
    };

    store_report(proxy, db_state, &report).await?;
    Ok(report)
}

async fn collect_metrics(
    proxy: &DatabaseProxy,
    db_state: DatabaseState,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<KeyMetrics, String> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    let (total_users, active_users, new_users, total_answers, avg_accuracy, avg_rt, words_learned) =
        if use_fallback {
            let Some(pool) = fallback else { return Ok(default_metrics()); };
            let start_s = start.format("%Y-%m-%d %H:%M:%S").to_string();
            let end_s = end.format("%Y-%m-%d %H:%M:%S").to_string();

            let user_row = sqlx::query(r#"
                SELECT
                    (SELECT COUNT(*) FROM "users") as total,
                    (SELECT COUNT(DISTINCT "userId") FROM "answer_records" WHERE "timestamp" >= ? AND "timestamp" <= ?) as active,
                    (SELECT COUNT(*) FROM "users" WHERE "createdAt" >= ?) as new
            "#)
            .bind(&start_s).bind(&end_s).bind(&start_s)
            .fetch_one(&pool).await.map_err(|e| e.to_string())?;

            let learning_row = sqlx::query(r#"
                SELECT
                    COUNT(*) as total,
                    AVG(CASE WHEN "isCorrect" != 0 THEN 1.0 ELSE 0.0 END) as accuracy,
                    AVG("responseTime") as avg_rt,
                    COUNT(DISTINCT "wordId") as words
                FROM "answer_records"
                WHERE "timestamp" >= ? AND "timestamp" <= ?
            "#)
            .bind(&start_s).bind(&end_s)
            .fetch_one(&pool).await.map_err(|e| e.to_string())?;

            (
                user_row.try_get::<i64, _>("total").unwrap_or(0),
                user_row.try_get::<i64, _>("active").unwrap_or(0),
                user_row.try_get::<i64, _>("new").unwrap_or(0),
                learning_row.try_get::<i64, _>("total").unwrap_or(0),
                learning_row.try_get::<f64, _>("accuracy").unwrap_or(0.0),
                learning_row.try_get::<f64, _>("avg_rt").unwrap_or(0.0),
                learning_row.try_get::<i64, _>("words").unwrap_or(0),
            )
        } else {
            let Some(pool) = primary else { return Ok(default_metrics()); };

            let user_row = sqlx::query(r#"
                SELECT
                    (SELECT COUNT(*) FROM "users") as total,
                    (SELECT COUNT(DISTINCT "userId") FROM "answer_records" WHERE "timestamp" >= $1 AND "timestamp" <= $2) as active,
                    (SELECT COUNT(*) FROM "users" WHERE "createdAt" >= $1) as new
            "#)
            .bind(start.naive_utc()).bind(end.naive_utc())
            .fetch_one(&pool).await.map_err(|e| e.to_string())?;

            let learning_row = sqlx::query(r#"
                SELECT
                    COUNT(*) as total,
                    AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) as accuracy,
                    AVG(NULLIF("responseTime", 0)) as avg_rt,
                    COUNT(DISTINCT "wordId") as words
                FROM "answer_records"
                WHERE "timestamp" >= $1 AND "timestamp" <= $2
            "#)
            .bind(start.naive_utc()).bind(end.naive_utc())
            .fetch_one(&pool).await.map_err(|e| e.to_string())?;

            (
                user_row.try_get::<i64, _>("total").unwrap_or(0),
                user_row.try_get::<i64, _>("active").unwrap_or(0),
                user_row.try_get::<i64, _>("new").unwrap_or(0),
                learning_row.try_get::<i64, _>("total").unwrap_or(0),
                learning_row.try_get::<Option<f64>, _>("accuracy").ok().flatten().unwrap_or(0.0),
                learning_row.try_get::<Option<f64>, _>("avg_rt").ok().flatten().unwrap_or(0.0),
                learning_row.try_get::<i64, _>("words").unwrap_or(0),
            )
        };

    Ok(KeyMetrics {
        users: UserMetrics { total: total_users, active: active_users, new: new_users },
        learning: LearningMetrics {
            total_answers,
            avg_accuracy,
            avg_response_time: avg_rt,
            total_words_learned: words_learned,
        },
        system: SystemMetrics { uptime_percent: 99.9 },
    })
}

fn default_metrics() -> KeyMetrics {
    KeyMetrics {
        users: UserMetrics { total: 0, active: 0, new: 0 },
        learning: LearningMetrics { total_answers: 0, avg_accuracy: 0.0, avg_response_time: 0.0, total_words_learned: 0 },
        system: SystemMetrics { uptime_percent: 99.9 },
    }
}

async fn generate_analysis(metrics: &KeyMetrics) -> (String, i32, Vec<Highlight>, Vec<Concern>, Vec<Recommendation>) {
    let llm = LLMProvider::from_env();
    if llm.is_available() {
        if let Ok(result) = generate_llm_analysis(&llm, metrics).await {
            return result;
        }
    }
    generate_heuristic_analysis(metrics)
}

async fn generate_llm_analysis(
    llm: &LLMProvider,
    metrics: &KeyMetrics,
) -> Result<(String, i32, Vec<Highlight>, Vec<Concern>, Vec<Recommendation>), crate::services::llm_provider::LLMError> {
    let system_prompt = r#"基于周度数据生成分析报告，JSON输出：{"summary":"总结","healthScore":0-100,"highlights":[{"title":"","description":""}],"concerns":[{"title":"","description":"","severity":"low/medium/high"}],"recommendations":[{"action":"","reason":"","priority":"low/medium/high"}]}"#;

    let user_prompt = format!(
        "用户: 总{}人, 活跃{}人, 新增{}人\n学习: 答题{}次, 正确率{:.1}%, 响应{:.0}ms, 单词{}个",
        metrics.users.total, metrics.users.active, metrics.users.new,
        metrics.learning.total_answers, metrics.learning.avg_accuracy * 100.0,
        metrics.learning.avg_response_time, metrics.learning.total_words_learned
    );

    let messages = [
        ChatMessage { role: "system".into(), content: system_prompt.into() },
        ChatMessage { role: "user".into(), content: user_prompt },
    ];

    let response = llm.chat(&messages).await?;
    let raw = response.first_content().unwrap_or_default();
    parse_llm_analysis(raw)
}

fn parse_llm_analysis(raw: &str) -> Result<(String, i32, Vec<Highlight>, Vec<Concern>, Vec<Recommendation>), crate::services::llm_provider::LLMError> {
    #[derive(Deserialize)]
    struct R {
        summary: String,
        #[serde(rename = "healthScore")]
        health_score: i32,
        highlights: Vec<Highlight>,
        concerns: Vec<Concern>,
        recommendations: Vec<Recommendation>,
    }

    let trimmed = raw.trim();
    let json_str = trimmed.strip_prefix("```json").and_then(|s| s.strip_suffix("```"))
        .or_else(|| trimmed.strip_prefix("```").and_then(|s| s.strip_suffix("```")))
        .unwrap_or(trimmed);

    let parsed: R = serde_json::from_str(json_str.trim())
        .map_err(crate::services::llm_provider::LLMError::Json)?;

    Ok((parsed.summary, parsed.health_score, parsed.highlights, parsed.concerns, parsed.recommendations))
}

fn generate_heuristic_analysis(metrics: &KeyMetrics) -> (String, i32, Vec<Highlight>, Vec<Concern>, Vec<Recommendation>) {
    let mut health_score = 70;
    let mut highlights = Vec::new();
    let mut concerns = Vec::new();
    let mut recommendations = Vec::new();

    if metrics.users.new > 0 {
        highlights.push(Highlight {
            title: "新用户增长".into(),
            description: format!("本周新增 {} 位用户", metrics.users.new),
        });
        health_score += 5;
    }

    if metrics.learning.avg_accuracy > 0.8 {
        highlights.push(Highlight {
            title: "高正确率".into(),
            description: format!("平均正确率达 {:.1}%", metrics.learning.avg_accuracy * 100.0),
        });
        health_score += 10;
    } else if metrics.learning.avg_accuracy < 0.6 {
        concerns.push(Concern {
            title: "正确率偏低".into(),
            description: format!("平均正确率仅 {:.1}%", metrics.learning.avg_accuracy * 100.0),
            severity: "medium".into(),
        });
        recommendations.push(Recommendation {
            action: "调整难度或增加复习".into(),
            reason: "提升用户学习效果".into(),
            priority: "high".into(),
        });
        health_score -= 10;
    }

    if metrics.users.active == 0 && metrics.users.total > 0 {
        concerns.push(Concern {
            title: "活跃度为零".into(),
            description: "本周无活跃用户".into(),
            severity: "high".into(),
        });
        health_score -= 20;
    }

    let summary = format!(
        "本周活跃用户 {} 人，答题 {} 次，正确率 {:.1}%",
        metrics.users.active, metrics.learning.total_answers, metrics.learning.avg_accuracy * 100.0
    );

    (summary, health_score.clamp(0, 100), highlights, concerns, recommendations)
}

async fn store_report(proxy: &DatabaseProxy, db_state: DatabaseState, report: &WeeklyReport) -> Result<(), String> {
    let key_metrics_json = serde_json::to_string(&report.key_metrics).unwrap_or_default();
    let user_metrics_json = serde_json::to_string(&report.key_metrics.users).unwrap_or_default();
    let learning_metrics_json = serde_json::to_string(&report.key_metrics.learning).unwrap_or_default();
    let system_metrics_json = serde_json::to_string(&report.key_metrics.system).unwrap_or_default();
    let highlights_json = serde_json::to_string(&report.highlights).unwrap_or_default();
    let concerns_json = serde_json::to_string(&report.concerns).unwrap_or_default();
    let recommendations_json = serde_json::to_string(&report.recommendations).unwrap_or_default();

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), report.id.clone().into());
        data.insert("weekStart".into(), report.week_start.clone().into());
        data.insert("weekEnd".into(), report.week_end.clone().into());
        data.insert("summary".into(), report.summary.clone().into());
        data.insert("healthScore".into(), (report.health_score as f64).into());
        data.insert("keyMetrics".into(), key_metrics_json.clone().into());
        data.insert("userMetrics".into(), user_metrics_json.clone().into());
        data.insert("learningMetrics".into(), learning_metrics_json.clone().into());
        data.insert("systemMetrics".into(), system_metrics_json.clone().into());
        data.insert("highlights".into(), highlights_json.clone().into());
        data.insert("concerns".into(), concerns_json.clone().into());
        data.insert("recommendations".into(), recommendations_json.clone().into());

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "system_weekly_reports".into(),
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy.write_operation(db_state, op).await.map_err(|e| e.to_string())?;
    } else {
        let Some(pool) = proxy.primary_pool().await else {
            return Err("Database unavailable".into());
        };

        let key_metrics_value = serde_json::to_value(&report.key_metrics).unwrap_or_default();
        let user_metrics_value = serde_json::to_value(&report.key_metrics.users).unwrap_or_default();
        let learning_metrics_value = serde_json::to_value(&report.key_metrics.learning).unwrap_or_default();
        let system_metrics_value = serde_json::to_value(&report.key_metrics.system).unwrap_or_default();
        let highlights_value = serde_json::to_value(&report.highlights).unwrap_or_default();
        let concerns_value = serde_json::to_value(&report.concerns).unwrap_or_default();
        let recommendations_value = serde_json::to_value(&report.recommendations).unwrap_or_default();

        sqlx::query(r#"
            INSERT INTO "system_weekly_reports" ("id", "weekStart", "weekEnd", "summary", "healthScore", "keyMetrics", "userMetrics", "learningMetrics", "systemMetrics", "highlights", "concerns", "recommendations")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        "#)
        .bind(&report.id)
        .bind(DateTime::parse_from_rfc3339(&report.week_start).map(|d| d.naive_utc()).ok())
        .bind(DateTime::parse_from_rfc3339(&report.week_end).map(|d| d.naive_utc()).ok())
        .bind(&report.summary)
        .bind(report.health_score as f64)
        .bind(&key_metrics_value)
        .bind(&user_metrics_value)
        .bind(&learning_metrics_value)
        .bind(&system_metrics_value)
        .bind(&highlights_value)
        .bind(&concerns_value)
        .bind(&recommendations_value)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub async fn get_reports(
    proxy: &DatabaseProxy,
    db_state: DatabaseState,
    limit: i64,
    offset: i64,
) -> Result<(Vec<WeeklyReport>, i64), String> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok((vec![], 0)); };

        let total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "system_weekly_reports""#)
            .fetch_one(&pool).await.unwrap_or(0);

        let rows = sqlx::query(r#"
            SELECT * FROM "system_weekly_reports" ORDER BY "createdAt" DESC LIMIT ? OFFSET ?
        "#).bind(limit).bind(offset).fetch_all(&pool).await.map_err(|e| e.to_string())?;

        let reports = rows.into_iter().map(|r| parse_report_sqlite(&r)).collect();
        Ok((reports, total))
    } else {
        let Some(pool) = primary else { return Ok((vec![], 0)); };

        let total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "system_weekly_reports""#)
            .fetch_one(&pool).await.unwrap_or(0);

        let rows = sqlx::query(r#"
            SELECT * FROM "system_weekly_reports" ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2
        "#).bind(limit).bind(offset).fetch_all(&pool).await.map_err(|e| e.to_string())?;

        let reports = rows.into_iter().map(|r| parse_report_pg(&r)).collect();
        Ok((reports, total))
    }
}

pub async fn get_latest_report(proxy: &DatabaseProxy, db_state: DatabaseState) -> Result<Option<WeeklyReport>, String> {
    let (reports, _) = get_reports(proxy, db_state, 1, 0).await?;
    Ok(reports.into_iter().next())
}

pub async fn get_report_by_id(proxy: &DatabaseProxy, db_state: DatabaseState, id: &str) -> Result<Option<WeeklyReport>, String> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(None); };
        let row = sqlx::query(r#"SELECT * FROM "system_weekly_reports" WHERE "id" = ?"#)
            .bind(id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;
        Ok(row.map(|r| parse_report_sqlite(&r)))
    } else {
        let Some(pool) = primary else { return Ok(None); };
        let row = sqlx::query(r#"SELECT * FROM "system_weekly_reports" WHERE "id" = $1"#)
            .bind(id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;
        Ok(row.map(|r| parse_report_pg(&r)))
    }
}

pub async fn get_health_trend(proxy: &DatabaseProxy, db_state: DatabaseState, weeks: i32) -> Result<Vec<HealthTrendPoint>, String> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(db_state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(vec![]); };
        let rows = sqlx::query(r#"
            SELECT "weekStart", "healthScore" FROM "system_weekly_reports"
            ORDER BY "weekStart" DESC LIMIT ?
        "#).bind(weeks as i64).fetch_all(&pool).await.map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| HealthTrendPoint {
            week_start: r.try_get::<String, _>("weekStart").unwrap_or_default(),
            health_score: r.try_get::<i32, _>("healthScore").unwrap_or(0),
        }).collect())
    } else {
        let Some(pool) = primary else { return Ok(vec![]); };
        let rows = sqlx::query(r#"
            SELECT "weekStart", "healthScore" FROM "system_weekly_reports"
            ORDER BY "weekStart" DESC LIMIT $1
        "#).bind(weeks as i64).fetch_all(&pool).await.map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| {
            let ws: chrono::NaiveDateTime = r.try_get("weekStart").unwrap_or_else(|_| Utc::now().naive_utc());
            HealthTrendPoint {
                week_start: ws.and_utc().to_rfc3339(),
                health_score: r.try_get::<i32, _>("healthScore").unwrap_or(0),
            }
        }).collect())
    }
}

fn parse_report_sqlite(row: &sqlx::sqlite::SqliteRow) -> WeeklyReport {
    let key_metrics: KeyMetrics = row.try_get::<String, _>("keyMetrics")
        .ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(default_metrics);
    let highlights: Vec<Highlight> = row.try_get::<String, _>("highlights")
        .ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let concerns: Vec<Concern> = row.try_get::<String, _>("concerns")
        .ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let recommendations: Vec<Recommendation> = row.try_get::<String, _>("recommendations")
        .ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();

    WeeklyReport {
        id: row.try_get("id").unwrap_or_default(),
        week_start: row.try_get("weekStart").unwrap_or_default(),
        week_end: row.try_get("weekEnd").unwrap_or_default(),
        summary: row.try_get("summary").unwrap_or_default(),
        health_score: row.try_get("healthScore").unwrap_or(0),
        key_metrics,
        highlights,
        concerns,
        recommendations,
        created_at: row.try_get("createdAt").unwrap_or_default(),
    }
}

fn parse_report_pg(row: &sqlx::postgres::PgRow) -> WeeklyReport {
    let key_metrics: KeyMetrics = row.try_get::<serde_json::Value, _>("keyMetrics")
        .ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_else(default_metrics);
    let highlights: Vec<Highlight> = row.try_get::<serde_json::Value, _>("highlights")
        .ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
    let concerns: Vec<Concern> = row.try_get::<serde_json::Value, _>("concerns")
        .ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
    let recommendations: Vec<Recommendation> = row.try_get::<serde_json::Value, _>("recommendations")
        .ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();

    let week_start: chrono::NaiveDateTime = row.try_get("weekStart").unwrap_or_else(|_| Utc::now().naive_utc());
    let week_end: chrono::NaiveDateTime = row.try_get("weekEnd").unwrap_or_else(|_| Utc::now().naive_utc());
    let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());

    WeeklyReport {
        id: row.try_get("id").unwrap_or_default(),
        week_start: week_start.and_utc().to_rfc3339(),
        week_end: week_end.and_utc().to_rfc3339(),
        summary: row.try_get("summary").unwrap_or_default(),
        health_score: row.try_get("healthScore").unwrap_or(0),
        key_metrics,
        highlights,
        concerns,
        recommendations,
        created_at: created_at.and_utc().to_rfc3339(),
    }
}
