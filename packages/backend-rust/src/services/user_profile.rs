use std::collections::HashMap;

use chrono::{DateTime, Local, NaiveDateTime, SecondsFormat, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

// ========== Types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub reward_profile: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStatistics {
    pub total_words: i64,
    pub total_records: i64,
    pub correct_count: i64,
    pub accuracy: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardProfileItem {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardProfilesResponse {
    pub current_profile: String,
    pub available_profiles: &'static [RewardProfileItem],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningHistoryItem {
    pub hour: i32,
    pub performance: f64,
    pub sample_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChronotypeProfile {
    pub category: &'static str,
    pub peak_hours: Vec<i32>,
    pub confidence: f64,
    pub sample_count: i64,
    pub learning_history: Vec<LearningHistoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleScores {
    pub visual: f64,
    pub auditory: f64,
    pub kinesthetic: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleInteractionPatterns {
    pub avg_dwell_time: f64,
    pub avg_response_time: f64,
    pub pause_frequency: f64,
    pub switch_frequency: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleProfile {
    pub style: &'static str,
    pub confidence: f64,
    pub sample_count: i64,
    pub scores: LearningStyleScores,
    pub interaction_patterns: LearningStyleInteractionPatterns,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveProfileResponse {
    pub chronotype: Option<ChronotypeProfile>,
    pub learning_style: Option<LearningStyleProfile>,
}

pub const REWARD_PROFILES: &[RewardProfileItem] = &[
    RewardProfileItem { id: "standard", name: "标准模式", description: "平衡长期记忆和学习体验" },
    RewardProfileItem { id: "cram", name: "突击模式", description: "最大化短期记忆，适合考前冲刺" },
    RewardProfileItem { id: "relaxed", name: "轻松模式", description: "降低压力，保持学习动力" },
];

pub enum SelectedPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

struct AnswerRecordChrono {
    timestamp_ms: i64,
    is_correct: bool,
}

struct AnswerRecordInteraction {
    timestamp_ms: i64,
    dwell_time: i64,
    response_time: Option<i64>,
}

// ========== Pool Selection ==========

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

// ========== Validation ==========

pub fn is_valid_reward_profile_id(profile_id: &str) -> bool {
    matches!(profile_id, "standard" | "cram" | "relaxed")
}

pub fn validate_password(password: &str) -> Option<&'static str> {
    if password.len() < 10 {
        return Some("密码长度至少为10个字符");
    }
    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    let special_chars = "!@#$%^&*()_-+=[]{};:'\",.<>/?\\|`~";
    let has_special = password.chars().any(|ch| special_chars.contains(ch));
    if has_letter && has_digit && has_special { None } else { Some("密码需包含字母、数字和特殊符号") }
}

// ========== Read Operations ==========

pub async fn get_user_profile(pool: &SelectedPool, user_id: &str) -> Result<Option<UserProfile>, String> {
    match pool {
        SelectedPool::Primary(pg) => get_user_profile_pg(pg, user_id).await,
        SelectedPool::Fallback(sqlite) => get_user_profile_sqlite(sqlite, user_id).await,
    }
}

async fn get_user_profile_pg(pool: &PgPool, user_id: &str) -> Result<Option<UserProfile>, String> {
    let row = sqlx::query(
        r#"SELECT "id","email","username","role"::text as "role","rewardProfile","createdAt","updatedAt"
           FROM "users" WHERE "id" = $1 LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());

    Ok(Some(UserProfile {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        role: row.try_get("role").unwrap_or_default(),
        reward_profile: row.try_get::<Option<String>, _>("rewardProfile").ok().flatten().unwrap_or_else(|| "standard".to_string()),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }))
}

async fn get_user_profile_sqlite(pool: &SqlitePool, user_id: &str) -> Result<Option<UserProfile>, String> {
    let row = sqlx::query(
        r#"SELECT "id","email","username","role","rewardProfile","createdAt","updatedAt"
           FROM "users" WHERE "id" = ? LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    let created_raw: String = row.try_get("createdAt").unwrap_or_default();
    let updated_raw: String = row.try_get("updatedAt").unwrap_or_default();

    Ok(Some(UserProfile {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        role: row.try_get("role").unwrap_or_default(),
        reward_profile: row.try_get::<Option<String>, _>("rewardProfile").ok().flatten().unwrap_or_else(|| "standard".to_string()),
        created_at: normalize_datetime_str(&created_raw),
        updated_at: normalize_datetime_str(&updated_raw),
    }))
}

pub async fn get_reward_profile(pool: &SelectedPool, user_id: &str) -> Result<String, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(r#"SELECT "rewardProfile" FROM "users" WHERE "id" = $1 LIMIT 1"#)
                .bind(user_id).fetch_optional(pg).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(row.and_then(|r| r.try_get::<Option<String>, _>("rewardProfile").ok()).flatten().unwrap_or_else(|| "standard".to_string()))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(r#"SELECT "rewardProfile" FROM "users" WHERE "id" = ? LIMIT 1"#)
                .bind(user_id).fetch_optional(sqlite).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(row.and_then(|r| r.try_get::<Option<String>, _>("rewardProfile").ok()).flatten().unwrap_or_else(|| "standard".to_string()))
        }
    }
}

pub async fn get_password_hash(pool: &SelectedPool, user_id: &str) -> Result<Option<String>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(r#"SELECT "passwordHash" FROM "users" WHERE "id" = $1 LIMIT 1"#)
                .bind(user_id).fetch_optional(pg).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(row.and_then(|r| r.try_get::<String, _>("passwordHash").ok()))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(r#"SELECT "passwordHash" FROM "users" WHERE "id" = ? LIMIT 1"#)
                .bind(user_id).fetch_optional(sqlite).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(row.and_then(|r| r.try_get::<String, _>("passwordHash").ok()))
        }
    }
}

pub async fn get_user_statistics(pool: &SelectedPool, user_id: &str) -> Result<UserStatistics, String> {
    match pool {
        SelectedPool::Primary(pg) => get_user_statistics_pg(pg, user_id).await,
        SelectedPool::Fallback(sqlite) => get_user_statistics_sqlite(sqlite, user_id).await,
    }
}

async fn get_user_statistics_pg(pool: &PgPool, user_id: &str) -> Result<UserStatistics, String> {
    let word_books: Vec<String> = sqlx::query_scalar(
        r#"SELECT "id" FROM "word_books" WHERE ("type"::text = 'SYSTEM') OR (("type"::text = 'USER') AND "userId" = $1)"#,
    )
    .bind(user_id).fetch_all(pool).await.unwrap_or_default();

    let total_words = count_words_pg(pool, &word_books).await.unwrap_or(0);
    let total_records: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1"#)
        .bind(user_id).fetch_one(pool).await.unwrap_or(0);
    let correct_count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1 AND "isCorrect" = true"#)
        .bind(user_id).fetch_one(pool).await.unwrap_or(0);

    Ok(build_statistics(total_words, total_records, correct_count))
}

async fn get_user_statistics_sqlite(pool: &SqlitePool, user_id: &str) -> Result<UserStatistics, String> {
    let word_books: Vec<String> = sqlx::query_scalar(
        r#"SELECT "id" FROM "word_books" WHERE "type" = 'SYSTEM' OR ("type" = 'USER' AND "userId" = ?)"#,
    )
    .bind(user_id).fetch_all(pool).await.unwrap_or_default();

    let total_words = count_words_sqlite(pool, &word_books).await.unwrap_or(0);
    let total_records: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = ?"#)
        .bind(user_id).fetch_one(pool).await.unwrap_or(0);
    let correct_count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = ? AND "isCorrect" = 1"#)
        .bind(user_id).fetch_one(pool).await.unwrap_or(0);

    Ok(build_statistics(total_words, total_records, correct_count))
}

fn build_statistics(total_words: i64, total_records: i64, correct_count: i64) -> UserStatistics {
    let accuracy = if total_records > 0 { (correct_count as f64 / total_records as f64) * 100.0 } else { 0.0 };
    UserStatistics { total_words, total_records, correct_count, accuracy: (accuracy * 100.0).round() / 100.0 }
}

async fn count_words_pg(pool: &PgPool, word_book_ids: &[String]) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() { return Ok(0); }
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" IN ("#);
    let mut sep = qb.separated(", ");
    for id in word_book_ids { sep.push_bind(id); }
    sep.push_unseparated(")");
    qb.build_query_scalar().fetch_one(pool).await
}

async fn count_words_sqlite(pool: &SqlitePool, word_book_ids: &[String]) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() { return Ok(0); }
    let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" IN ("#);
    let mut sep = qb.separated(", ");
    for id in word_book_ids { sep.push_bind(id); }
    sep.push_unseparated(")");
    qb.build_query_scalar().fetch_one(pool).await
}

// ========== Cognitive Profile ==========

pub async fn compute_chronotype(pool: &SelectedPool, user_id: &str) -> Result<ChronotypeProfile, String> {
    let records = fetch_records_for_chronotype(pool, user_id).await?;
    let mut hourly_data: HashMap<i32, (i64, i64)> = HashMap::new();

    for record in records {
        let hour = Local.timestamp_millis_opt(record.timestamp_ms).single().map(|dt| dt.hour() as i32).unwrap_or(0);
        let entry = hourly_data.entry(hour).or_insert((0, 0));
        entry.1 += 1;
        if record.is_correct { entry.0 += 1; }
    }

    let mut learning_history: Vec<LearningHistoryItem> = hourly_data.into_iter()
        .filter_map(|(hour, (correct, total))| {
            if total == 0 { None } else { Some(LearningHistoryItem { hour, performance: correct as f64 / total as f64, sample_count: total }) }
        })
        .collect();
    learning_history.sort_by_key(|item| item.hour);

    let total_samples: i64 = learning_history.iter().map(|item| item.sample_count).sum();
    if total_samples < 20 {
        return Ok(ChronotypeProfile { category: "intermediate", peak_hours: vec![9, 10, 14, 15, 16], confidence: 0.3, sample_count: total_samples, learning_history });
    }

    let morning = avg_performance(&learning_history, &[6, 7, 8, 9, 10]);
    let afternoon = avg_performance(&learning_history, &[14, 15, 16, 17, 18]);
    let evening = avg_performance(&learning_history, &[19, 20, 21, 22]);

    let perf_variance = variance(&[morning, afternoon, evening]);
    let sample_confidence = (total_samples as f64 / 100.0).min(1.0);
    let diff_confidence = if perf_variance > 0.01 { 0.8 } else { 0.5 };
    let confidence = (sample_confidence + diff_confidence) / 2.0;

    if morning > afternoon && morning > evening {
        Ok(ChronotypeProfile { category: "morning", peak_hours: identify_peak_hours(&learning_history, &[6, 7, 8, 9, 10, 11]), confidence, sample_count: total_samples, learning_history })
    } else if evening > morning && evening > afternoon {
        Ok(ChronotypeProfile { category: "evening", peak_hours: identify_peak_hours(&learning_history, &[18, 19, 20, 21, 22, 23]), confidence, sample_count: total_samples, learning_history })
    } else {
        Ok(ChronotypeProfile { category: "intermediate", peak_hours: identify_peak_hours(&learning_history, &[10, 11, 14, 15, 16, 17]), confidence: confidence * 0.8, sample_count: total_samples, learning_history })
    }
}

pub async fn compute_learning_style(pool: &SelectedPool, user_id: &str) -> Result<LearningStyleProfile, String> {
    let interactions = fetch_records_for_learning_style(pool, user_id).await?;
    let sample_count = interactions.len() as i64;

    if interactions.is_empty() {
        return Ok(LearningStyleProfile {
            style: "mixed", confidence: 0.3, sample_count: 0,
            scores: LearningStyleScores { visual: 0.33, auditory: 0.33, kinesthetic: 0.33 },
            interaction_patterns: LearningStyleInteractionPatterns { avg_dwell_time: 0.0, avg_response_time: 0.0, pause_frequency: 0.0, switch_frequency: 0.0 },
        });
    }

    let avg_dwell_time = interactions.iter().map(|r| r.dwell_time as f64).sum::<f64>() / interactions.len() as f64;
    let avg_response_time = interactions.iter().map(|r| r.response_time.unwrap_or(0) as f64).sum::<f64>() / interactions.len() as f64;
    let dwell_variance = interactions.iter().map(|r| (r.dwell_time as f64 - avg_dwell_time).powi(2)).sum::<f64>() / interactions.len() as f64;
    let response_variance = interactions.iter().map(|r| (r.response_time.unwrap_or(0) as f64 - avg_response_time).powi(2)).sum::<f64>() / interactions.len() as f64;

    let mut pause_count = 0i64;
    for i in 1..interactions.len() {
        if interactions[i - 1].timestamp_ms - interactions[i].timestamp_ms > 30_000 { pause_count += 1; }
    }

    let mut switch_count = 0i64;
    for i in 1..interactions.len() {
        let prev = response_or_avg(interactions[i - 1].response_time, avg_response_time);
        let curr = response_or_avg(interactions[i].response_time, avg_response_time);
        if prev > 0.0 && curr > 0.0 && (curr / prev > 2.0 || prev / curr > 2.0) { switch_count += 1; }
    }

    if sample_count < 50 {
        return Ok(LearningStyleProfile {
            style: "mixed", confidence: 0.3, sample_count,
            scores: LearningStyleScores { visual: 0.33, auditory: 0.33, kinesthetic: 0.33 },
            interaction_patterns: LearningStyleInteractionPatterns { avg_dwell_time, avg_response_time, pause_frequency: 0.0, switch_frequency: 0.0 },
        });
    }

    let mut scores = LearningStyleScores {
        visual: compute_visual_score(avg_dwell_time),
        auditory: compute_auditory_score(avg_dwell_time, dwell_variance, pause_count, sample_count),
        kinesthetic: compute_kinesthetic_score(avg_response_time, response_variance, switch_count, sample_count),
    };

    let total_score = scores.visual + scores.auditory + scores.kinesthetic;
    if total_score > 0.0 { scores.visual /= total_score; scores.auditory /= total_score; scores.kinesthetic /= total_score; }

    let normalized_max = scores.visual.max(scores.auditory.max(scores.kinesthetic));
    let pause_frequency = pause_count as f64 / sample_count as f64;
    let switch_frequency = switch_count as f64 / sample_count as f64;

    if normalized_max < 0.4 {
        return Ok(LearningStyleProfile {
            style: "mixed", confidence: 0.5, sample_count, scores,
            interaction_patterns: LearningStyleInteractionPatterns { avg_dwell_time, avg_response_time, pause_frequency, switch_frequency },
        });
    }

    let style = if scores.visual == normalized_max { "visual" } else if scores.auditory == normalized_max { "auditory" } else { "kinesthetic" };
    Ok(LearningStyleProfile {
        style, confidence: normalized_max.min(0.9), sample_count, scores,
        interaction_patterns: LearningStyleInteractionPatterns { avg_dwell_time, avg_response_time, pause_frequency, switch_frequency },
    })
}

pub async fn get_cognitive_profile(pool: &SelectedPool, user_id: &str) -> CognitiveProfileResponse {
    let chronotype = compute_chronotype(pool, user_id).await.ok().filter(|p| p.sample_count >= 20);
    let learning_style = compute_learning_style(pool, user_id).await.ok().filter(|p| p.sample_count >= 20);
    CognitiveProfileResponse { chronotype, learning_style }
}

async fn fetch_records_for_chronotype(pool: &SelectedPool, user_id: &str) -> Result<Vec<AnswerRecordChrono>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(r#"SELECT "timestamp", "isCorrect" FROM "answer_records" WHERE "userId" = $1 ORDER BY "timestamp" DESC LIMIT 500"#)
                .bind(user_id).fetch_all(pg).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().filter_map(|row| {
                let ts: NaiveDateTime = row.try_get("timestamp").ok()?;
                Some(AnswerRecordChrono { timestamp_ms: DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc).timestamp_millis(), is_correct: row.try_get("isCorrect").unwrap_or(false) })
            }).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(r#"SELECT CAST("timestamp" AS TEXT) AS "timestamp", "isCorrect" FROM "answer_records" WHERE "userId" = ? ORDER BY "timestamp" DESC LIMIT 500"#)
                .bind(user_id).fetch_all(sqlite).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().filter_map(|row| {
                let ts: String = row.try_get("timestamp").ok()?;
                let timestamp_ms = parse_datetime_millis(&ts)?;
                let is_correct: i64 = row.try_get("isCorrect").unwrap_or(0);
                Some(AnswerRecordChrono { timestamp_ms, is_correct: is_correct != 0 })
            }).collect())
        }
    }
}

async fn fetch_records_for_learning_style(pool: &SelectedPool, user_id: &str) -> Result<Vec<AnswerRecordInteraction>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(r#"SELECT "timestamp", "dwellTime", "responseTime" FROM "answer_records" WHERE "userId" = $1 ORDER BY "timestamp" DESC LIMIT 200"#)
                .bind(user_id).fetch_all(pg).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().filter_map(|row| {
                let ts: NaiveDateTime = row.try_get("timestamp").ok()?;
                Some(AnswerRecordInteraction {
                    timestamp_ms: DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc).timestamp_millis(),
                    dwell_time: row.try_get::<Option<i64>, _>("dwellTime").ok().flatten().unwrap_or(0),
                    response_time: row.try_get::<Option<i64>, _>("responseTime").ok().flatten(),
                })
            }).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(r#"SELECT CAST("timestamp" AS TEXT) AS "timestamp", "dwellTime", "responseTime" FROM "answer_records" WHERE "userId" = ? ORDER BY "timestamp" DESC LIMIT 200"#)
                .bind(user_id).fetch_all(sqlite).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().filter_map(|row| {
                let ts: String = row.try_get("timestamp").ok()?;
                let timestamp_ms = parse_datetime_millis(&ts)?;
                Some(AnswerRecordInteraction {
                    timestamp_ms,
                    dwell_time: row.try_get::<Option<i64>, _>("dwellTime").ok().flatten().unwrap_or(0),
                    response_time: row.try_get::<Option<i64>, _>("responseTime").ok().flatten(),
                })
            }).collect())
        }
    }
}

// ========== Write Operations ==========

pub async fn update_reward_profile(proxy: &DatabaseProxy, state: DatabaseState, user_id: &str, profile_id: &str) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(user_id));
        let mut data = serde_json::Map::new();
        data.insert("rewardProfile".into(), serde_json::json!(profile_id));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "users".to_string(), r#where: where_clause, data,
            operation_id: uuid::Uuid::new_v4().to_string(), timestamp_ms: None, critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let now = Utc::now().naive_utc();
    sqlx::query(r#"UPDATE "users" SET "rewardProfile" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(profile_id).bind(now).bind(user_id)
        .execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

pub async fn update_password(proxy: &DatabaseProxy, state: DatabaseState, user_id: &str, new_hash: &str) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(user_id));
        let mut data = serde_json::Map::new();
        data.insert("passwordHash".into(), serde_json::json!(new_hash));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "users".to_string(), r#where: where_clause, data,
            operation_id: uuid::Uuid::new_v4().to_string(), timestamp_ms: None, critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::json!(user_id));
        let op = crate::db::dual_write_manager::WriteOperation::Delete {
            table: "sessions".to_string(), r#where: where_clause,
            operation_id: uuid::Uuid::new_v4().to_string(), timestamp_ms: None, critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let now = Utc::now().naive_utc();
    sqlx::query(r#"UPDATE "users" SET "passwordHash" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(new_hash).bind(now).bind(user_id)
        .execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;
    sqlx::query(r#"DELETE FROM "sessions" WHERE "userId" = $1"#)
        .bind(user_id).execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

// ========== Helper Functions ==========

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_datetime_millis(value: &str) -> Option<i64> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) { return Some(parsed.timestamp_millis()); }
    if let Ok(parsed) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(parsed, Utc).timestamp_millis());
    }
    None
}

fn normalize_datetime_str(value: &str) -> String {
    if let Some(ms) = parse_datetime_millis(value) {
        if let Some(dt) = DateTime::<Utc>::from_timestamp_millis(ms) { return dt.to_rfc3339_opts(SecondsFormat::Millis, true); }
    }
    value.to_string()
}

fn avg_performance(history: &[LearningHistoryItem], hours: &[i32]) -> f64 {
    let (mut total_samples, mut weighted_sum) = (0i64, 0.0f64);
    for item in history {
        if hours.contains(&item.hour) { total_samples += item.sample_count; weighted_sum += item.performance * item.sample_count as f64; }
    }
    if total_samples == 0 { 0.0 } else { weighted_sum / total_samples as f64 }
}

fn identify_peak_hours(history: &[LearningHistoryItem], candidate_hours: &[i32]) -> Vec<i32> {
    let mut candidates: Vec<_> = history.iter().filter(|item| candidate_hours.contains(&item.hour)).collect();
    if candidates.is_empty() { return candidate_hours.iter().copied().take(4).collect(); }
    candidates.sort_by(|a, b| b.performance.partial_cmp(&a.performance).unwrap_or(std::cmp::Ordering::Equal));
    let mut hours: Vec<i32> = candidates.iter().take(4).map(|item| item.hour).collect();
    hours.sort_unstable();
    hours
}

fn variance(values: &[f64]) -> f64 {
    if values.is_empty() { return 0.0; }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64
}

fn response_or_avg(value: Option<i64>, avg: f64) -> f64 {
    match value { Some(v) if v > 0 => v as f64, _ => avg }
}

fn compute_visual_score(avg_dwell_time: f64) -> f64 {
    let dwell_score = (avg_dwell_time / 5000.0).min(1.0);
    let deliberate_score = if avg_dwell_time > 3000.0 { 0.3 } else { 0.0 };
    (dwell_score + deliberate_score).min(1.0)
}

fn compute_auditory_score(avg_dwell_time: f64, dwell_variance: f64, pause_count: i64, sample_count: i64) -> f64 {
    let cv = if avg_dwell_time > 0.0 { dwell_variance.sqrt() / avg_dwell_time } else { 1.0 };
    let stability_score: f64 = if cv < 0.3 { 0.4 } else if cv < 0.5 { 0.25 } else { 0.1 };
    let dwell_score: f64 = if avg_dwell_time >= 3000.0 && avg_dwell_time <= 6000.0 { 0.3 } else { 0.1 };
    let pause_rate = pause_count as f64 / sample_count as f64;
    let pause_score: f64 = if pause_rate > 0.1 { 0.2 } else { 0.1 };
    (stability_score + dwell_score + pause_score).min(1.0)
}

fn compute_kinesthetic_score(avg_response_time: f64, response_variance: f64, switch_count: i64, sample_count: i64) -> f64 {
    let speed_score: f64 = if avg_response_time < 2000.0 { 0.4 } else if avg_response_time < 3000.0 { 0.3 } else { 0.15 };
    let switch_rate = switch_count as f64 / sample_count as f64;
    let switch_score: f64 = if switch_rate > 0.2 { 0.3 } else if switch_rate > 0.1 { 0.2 } else { 0.1 };
    let response_cv = if avg_response_time > 0.0 { response_variance.sqrt() / avg_response_time } else { 0.0 };
    let variability_score: f64 = if response_cv > 0.5 { 0.2 } else { 0.1 };
    (speed_score + switch_score + variability_score).min(1.0)
}
