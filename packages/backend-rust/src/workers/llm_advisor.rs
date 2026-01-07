use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use sqlx::{PgPool, Row};
use tracing::{debug, info, warn};

use crate::db::DatabaseProxy;
use crate::services::llm_provider::{ChatMessage, LLMProvider};

pub async fn run_weekly_analysis(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let start = Instant::now();
    info!("Starting weekly LLM analysis");

    let pool = db.pool();

    let llm_enabled = std::env::var("LLM_ADVISOR_ENABLED")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if !llm_enabled {
        debug!("LLM advisor not enabled, skipping");
        return Ok(());
    }

    let llm = LLMProvider::from_env();
    if !llm.is_available() {
        warn!("LLM not configured, skipping analysis");
        return Ok(());
    }

    let system_stats = collect_system_stats(&pool).await?;
    let user_patterns = analyze_user_patterns(&pool).await?;
    let analysis_result = generate_analysis(&llm, &system_stats, &user_patterns).await;

    store_analysis_result(&pool, &analysis_result).await?;

    let duration = start.elapsed();
    info!(
        analysis_id = %analysis_result.id,
        suggestions_count = analysis_result.suggestions.len(),
        duration_ms = duration.as_millis() as u64,
        "Weekly LLM analysis completed"
    );

    Ok(())
}

#[derive(Debug, Default)]
struct SystemStats {
    total_users: i64,
    active_users_7d: i64,
    total_answers: i64,
    avg_correct_rate: f64,
}

async fn collect_system_stats(pool: &PgPool) -> Result<SystemStats, super::WorkerError> {
    let since_7d = Utc::now() - chrono::Duration::days(7);

    let row = sqlx::query(
        r#"
        SELECT
            (SELECT COUNT(*) FROM "users") as total_users,
            (SELECT COUNT(DISTINCT "userId") FROM "answer_records" WHERE "timestamp" >= $1) as active_users,
            (SELECT COUNT(*) FROM "answer_records" WHERE "timestamp" >= $1) as total_answers,
            (SELECT AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) FROM "answer_records" WHERE "timestamp" >= $1) as avg_correct
        "#,
    )
    .bind(since_7d)
    .fetch_one(pool)
    .await?;

    Ok(SystemStats {
        total_users: row.try_get("total_users").unwrap_or(0),
        active_users_7d: row.try_get("active_users").unwrap_or(0),
        total_answers: row.try_get("total_answers").unwrap_or(0),
        avg_correct_rate: row.try_get::<Option<f64>, _>("avg_correct").ok().flatten().unwrap_or(0.0),
    })
}

#[derive(Debug, Default)]
struct UserPatterns {
    struggling_users_count: usize,
    high_performers_count: usize,
    difficult_words_count: usize,
}

async fn analyze_user_patterns(pool: &PgPool) -> Result<UserPatterns, super::WorkerError> {
    let since = Utc::now() - chrono::Duration::days(7);

    let struggling_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT "userId" FROM "answer_records" WHERE "timestamp" >= $1
            GROUP BY "userId"
            HAVING AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) < 0.5 AND COUNT(*) >= 20
        ) sub
        "#,
    )
    .bind(since)
    .fetch_one(pool)
    .await?;

    let high_performers_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT "userId" FROM "answer_records" WHERE "timestamp" >= $1
            GROUP BY "userId"
            HAVING AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) > 0.9 AND COUNT(*) >= 50
        ) sub
        "#,
    )
    .bind(since)
    .fetch_one(pool)
    .await?;

    let difficult_words_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT "wordId" FROM "answer_records" WHERE "timestamp" >= $1
            GROUP BY "wordId"
            HAVING AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) < 0.4 AND COUNT(*) >= 10
        ) sub
        "#,
    )
    .bind(since)
    .fetch_one(pool)
    .await?;

    Ok(UserPatterns {
        struggling_users_count: struggling_count as usize,
        high_performers_count: high_performers_count as usize,
        difficult_words_count: difficult_words_count as usize,
    })
}

#[derive(Debug)]
struct AnalysisResult {
    id: String,
    summary: String,
    suggestions: Vec<Suggestion>,
    confidence: f64,
    data_quality: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct Suggestion {
    category: String,
    title: String,
    description: String,
    priority: String,
}

async fn generate_analysis(llm: &LLMProvider, stats: &SystemStats, patterns: &UserPatterns) -> AnalysisResult {
    let id = uuid::Uuid::new_v4().to_string();

    match generate_llm_analysis(llm, stats, patterns).await {
        Ok(result) => AnalysisResult { id, ..result },
        Err(e) => {
            warn!(error = %e, "LLM analysis failed, using heuristic");
            generate_heuristic_analysis(&id, stats, patterns)
        }
    }
}

async fn generate_llm_analysis(
    llm: &LLMProvider,
    stats: &SystemStats,
    patterns: &UserPatterns,
) -> Result<AnalysisResult, crate::services::llm_provider::LLMError> {
    let system_prompt = r#"你是一个学习系统分析师。基于系统统计数据生成周度分析报告。
以 JSON 格式输出：{"summary":"总结","suggestions":[{"category":"分类","title":"标题","description":"描述","priority":"high/medium/low"}],"confidence":0.0-1.0,"dataQuality":"high/medium/low"}"#;

    let user_prompt = format!(
        "系统统计:\n- 总用户: {}\n- 7日活跃用户: {}\n- 总答题数: {}\n- 平均正确率: {:.1}%\n\n用户模式:\n- 困难用户数: {}\n- 高分用户数: {}\n- 困难单词数: {}",
        stats.total_users, stats.active_users_7d, stats.total_answers, stats.avg_correct_rate * 100.0,
        patterns.struggling_users_count, patterns.high_performers_count, patterns.difficult_words_count
    );

    let messages = [
        ChatMessage { role: "system".into(), content: system_prompt.into() },
        ChatMessage { role: "user".into(), content: user_prompt },
    ];

    let response = llm.chat(&messages).await?;
    let raw = response.first_content().unwrap_or_default();
    parse_analysis_response(raw)
}

fn parse_analysis_response(raw: &str) -> Result<AnalysisResult, crate::services::llm_provider::LLMError> {
    let trimmed = raw.trim();
    let json_str = trimmed
        .strip_prefix("```json").and_then(|s| s.strip_suffix("```"))
        .or_else(|| trimmed.strip_prefix("```").and_then(|s| s.strip_suffix("```")))
        .unwrap_or(trimmed);

    #[derive(serde::Deserialize)]
    struct LLMResponse {
        summary: String,
        suggestions: Vec<Suggestion>,
        confidence: f64,
        #[serde(rename = "dataQuality")]
        data_quality: String,
    }

    let parsed: LLMResponse = serde_json::from_str(json_str.trim())
        .map_err(|e| crate::services::llm_provider::LLMError::Json(e))?;

    Ok(AnalysisResult {
        id: String::new(),
        summary: parsed.summary,
        suggestions: parsed.suggestions,
        confidence: parsed.confidence,
        data_quality: parsed.data_quality,
    })
}

fn generate_heuristic_analysis(id: &str, stats: &SystemStats, patterns: &UserPatterns) -> AnalysisResult {
    let mut suggestions = Vec::new();

    if patterns.struggling_users_count > 0 {
        suggestions.push(Suggestion {
            category: "user_support".to_string(),
            title: "Struggling Users Detected".to_string(),
            description: format!("{} users have accuracy below 50%.", patterns.struggling_users_count),
            priority: "high".to_string(),
        });
    }

    if patterns.difficult_words_count > 0 {
        suggestions.push(Suggestion {
            category: "content".to_string(),
            title: "Difficult Words Identified".to_string(),
            description: format!("{} words have low success rates.", patterns.difficult_words_count),
            priority: "medium".to_string(),
        });
    }

    if stats.avg_correct_rate < 0.65 {
        suggestions.push(Suggestion {
            category: "algorithm".to_string(),
            title: "System-wide Accuracy Low".to_string(),
            description: format!("Overall accuracy is {:.1}%.", stats.avg_correct_rate * 100.0),
            priority: "high".to_string(),
        });
    }

    let data_quality = if stats.total_answers > 10000 { "high" } else if stats.total_answers > 1000 { "medium" } else { "low" };
    let confidence = if stats.active_users_7d > 100 { 0.85 } else { 0.6 };

    AnalysisResult {
        id: id.to_string(),
        summary: format!(
            "Weekly analysis: {} active users, {:.1}% avg accuracy, {} suggestions",
            stats.active_users_7d, stats.avg_correct_rate * 100.0, suggestions.len()
        ),
        suggestions,
        confidence,
        data_quality: data_quality.to_string(),
    }
}

async fn store_analysis_result(pool: &PgPool, result: &AnalysisResult) -> Result<(), super::WorkerError> {
    let now = Utc::now();
    let suggestions_json = serde_json::to_value(&result.suggestions).unwrap_or_default();

    sqlx::query(
        r#"
        INSERT INTO "llm_analysis" ("id", "summary", "suggestions", "confidence", "dataQuality", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&result.id)
    .bind(&result.summary)
    .bind(&suggestions_json)
    .bind(result.confidence)
    .bind(&result.data_quality)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| {
        warn!(error = %e, "Failed to store LLM analysis result");
        e
    })?;

    Ok(())
}
