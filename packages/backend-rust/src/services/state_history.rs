use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

// ========== Types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateHistoryItem {
    pub date: String,
    pub attention: f64,
    pub fatigue: f64,
    pub motivation: f64,
    pub memory: f64,
    pub speed: f64,
    pub stability: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trend_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySummary {
    pub record_count: i64,
    pub avg_attention: f64,
    pub avg_fatigue: f64,
    pub avg_motivation: f64,
    pub avg_memory: f64,
    pub avg_speed: f64,
    pub avg_stability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveSnapshot {
    pub memory: f64,
    pub speed: f64,
    pub stability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveGrowth {
    pub current: CognitiveSnapshot,
    pub previous: CognitiveSnapshot,
    pub memory_change: f64,
    pub speed_change: f64,
    pub stability_change: f64,
    pub days: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignificantChange {
    pub metric: String,
    pub metric_label: String,
    pub change_percent: f64,
    pub direction: String,
    pub is_positive: bool,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStateSnapshot {
    pub attention: f64,
    pub fatigue: f64,
    pub motivation: f64,
    pub memory: f64,
    pub speed: f64,
    pub stability: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trend_state: Option<String>,
}

pub enum SelectedPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

pub type DateRangeOption = i32;

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

// ========== Read Operations ==========

pub async fn get_state_history(
    pool: &SelectedPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<Vec<StateHistoryItem>, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(range as i64);

    match pool {
        SelectedPool::Primary(pg) => get_state_history_pg(pg, user_id, start_date, today).await,
        SelectedPool::Fallback(sqlite) => {
            let start_str = start_date.format("%Y-%m-%d").to_string();
            let end_str = today.format("%Y-%m-%d").to_string();
            get_state_history_sqlite(sqlite, user_id, &start_str, &end_str).await
        }
    }
}

async fn get_state_history_pg(
    pool: &PgPool,
    user_id: &str,
    start_date: NaiveDate,
    end_date: NaiveDate,
) -> Result<Vec<StateHistoryItem>, String> {
    let rows = sqlx::query(
        r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3 ORDER BY "date" ASC"#,
    )
    .bind(user_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows.iter().map(|row| StateHistoryItem {
        date: format!("{}T00:00:00.000Z", row.try_get::<NaiveDate, _>("date").unwrap_or(Utc::now().date_naive()).format("%Y-%m-%d")),
        attention: row.try_get("attention").unwrap_or(0.0),
        fatigue: row.try_get("fatigue").unwrap_or(0.0),
        motivation: row.try_get("motivation").unwrap_or(0.0),
        memory: row.try_get("memory").unwrap_or(0.0),
        speed: row.try_get("speed").unwrap_or(0.0),
        stability: row.try_get("stability").unwrap_or(0.0),
        trend_state: row.try_get::<Option<String>, _>("trendState").ok().flatten(),
    }).collect())
}

async fn get_state_history_sqlite(
    pool: &SqlitePool,
    user_id: &str,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<StateHistoryItem>, String> {
    let rows = sqlx::query(
        r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = ? AND "date" >= ? AND "date" <= ? ORDER BY "date" ASC"#,
    )
    .bind(user_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows.iter().map(|row| {
        let date_raw: String = row.try_get("date").unwrap_or_default();
        StateHistoryItem {
            date: normalize_date_str(&date_raw),
            attention: row.try_get("attention").unwrap_or(0.0),
            fatigue: row.try_get("fatigue").unwrap_or(0.0),
            motivation: row.try_get("motivation").unwrap_or(0.0),
            memory: row.try_get("memory").unwrap_or(0.0),
            speed: row.try_get("speed").unwrap_or(0.0),
            stability: row.try_get("stability").unwrap_or(0.0),
            trend_state: row.try_get::<Option<String>, _>("trendState").ok().flatten(),
        }
    }).collect())
}

pub async fn get_history_summary(
    pool: &SelectedPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<HistorySummary, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(range as i64);

    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT COUNT(*) as count, AVG("attention") as avg_attention, AVG("fatigue") as avg_fatigue,
                   AVG("motivation") as avg_motivation, AVG("memory") as avg_memory, AVG("speed") as avg_speed,
                   AVG("stability") as avg_stability FROM "user_state_history"
                   WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3"#,
            )
            .bind(user_id)
            .bind(start_date)
            .bind(today)
            .fetch_one(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(HistorySummary {
                record_count: row.try_get("count").unwrap_or(0),
                avg_attention: row.try_get("avg_attention").unwrap_or(0.0),
                avg_fatigue: row.try_get("avg_fatigue").unwrap_or(0.0),
                avg_motivation: row.try_get("avg_motivation").unwrap_or(0.0),
                avg_memory: row.try_get("avg_memory").unwrap_or(0.0),
                avg_speed: row.try_get("avg_speed").unwrap_or(0.0),
                avg_stability: row.try_get("avg_stability").unwrap_or(0.0),
            })
        }
        SelectedPool::Fallback(sqlite) => {
            let start_str = start_date.format("%Y-%m-%d").to_string();
            let end_str = today.format("%Y-%m-%d").to_string();

            let row = sqlx::query(
                r#"SELECT COUNT(*) as count, AVG("attention") as avg_attention, AVG("fatigue") as avg_fatigue,
                   AVG("motivation") as avg_motivation, AVG("memory") as avg_memory, AVG("speed") as avg_speed,
                   AVG("stability") as avg_stability FROM "user_state_history"
                   WHERE "userId" = ? AND "date" >= ? AND "date" <= ?"#,
            )
            .bind(user_id)
            .bind(&start_str)
            .bind(&end_str)
            .fetch_one(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(HistorySummary {
                record_count: row.try_get("count").unwrap_or(0),
                avg_attention: row.try_get("avg_attention").unwrap_or(0.0),
                avg_fatigue: row.try_get("avg_fatigue").unwrap_or(0.0),
                avg_motivation: row.try_get("avg_motivation").unwrap_or(0.0),
                avg_memory: row.try_get("avg_memory").unwrap_or(0.0),
                avg_speed: row.try_get("avg_speed").unwrap_or(0.0),
                avg_stability: row.try_get("avg_stability").unwrap_or(0.0),
            })
        }
    }
}

pub async fn get_cognitive_growth(
    pool: &SelectedPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<CognitiveGrowth, String> {
    let today = Utc::now().date_naive();
    let target_date = today - Duration::days(range as i64);

    let (current, previous) = match pool {
        SelectedPool::Primary(pg) => {
            let current_row = sqlx::query(
                r#"SELECT "memory", "speed", "stability" FROM "user_state_history"
                   WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let previous_row = sqlx::query(
                r#"SELECT "memory", "speed", "stability" FROM "user_state_history"
                   WHERE "userId" = $1 AND "date" <= $2 ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .bind(target_date)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let current = current_row.map(|r| CognitiveSnapshot {
                memory: r.try_get("memory").unwrap_or(0.0),
                speed: r.try_get("speed").unwrap_or(0.0),
                stability: r.try_get("stability").unwrap_or(0.0),
            }).unwrap_or(CognitiveSnapshot { memory: 0.0, speed: 0.0, stability: 0.0 });

            let previous = previous_row.map(|r| CognitiveSnapshot {
                memory: r.try_get("memory").unwrap_or(0.0),
                speed: r.try_get("speed").unwrap_or(0.0),
                stability: r.try_get("stability").unwrap_or(0.0),
            }).unwrap_or(current.clone());

            (current, previous)
        }
        SelectedPool::Fallback(sqlite) => {
            let target_str = target_date.format("%Y-%m-%d").to_string();

            let current_row = sqlx::query(
                r#"SELECT "memory", "speed", "stability" FROM "user_state_history"
                   WHERE "userId" = ? ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let previous_row = sqlx::query(
                r#"SELECT "memory", "speed", "stability" FROM "user_state_history"
                   WHERE "userId" = ? AND "date" <= ? ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .bind(&target_str)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let current = current_row.map(|r| CognitiveSnapshot {
                memory: r.try_get("memory").unwrap_or(0.0),
                speed: r.try_get("speed").unwrap_or(0.0),
                stability: r.try_get("stability").unwrap_or(0.0),
            }).unwrap_or(CognitiveSnapshot { memory: 0.0, speed: 0.0, stability: 0.0 });

            let previous = previous_row.map(|r| CognitiveSnapshot {
                memory: r.try_get("memory").unwrap_or(0.0),
                speed: r.try_get("speed").unwrap_or(0.0),
                stability: r.try_get("stability").unwrap_or(0.0),
            }).unwrap_or(current.clone());

            (current, previous)
        }
    };

    Ok(CognitiveGrowth {
        memory_change: ((current.memory - previous.memory) / if previous.memory == 0.0 { 1.0 } else { previous.memory }) * 100.0,
        speed_change: ((current.speed - previous.speed) / if previous.speed == 0.0 { 1.0 } else { previous.speed }) * 100.0,
        stability_change: ((current.stability - previous.stability) / if previous.stability == 0.0 { 1.0 } else { previous.stability }) * 100.0,
        current,
        previous,
        days: range as i64,
    })
}

pub async fn get_significant_changes(
    pool: &SelectedPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<Vec<SignificantChange>, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(range as i64);

    let metrics: Option<Vec<(&str, &str, f64, f64, bool)>> = match pool {
        SelectedPool::Primary(pg) => {
            let first_row = sqlx::query(
                r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability"
                   FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3
                   ORDER BY "date" ASC LIMIT 1"#,
            )
            .bind(user_id)
            .bind(start_date)
            .bind(today)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let last_row = sqlx::query(
                r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability"
                   FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3
                   ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .bind(start_date)
            .bind(today)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            match (first_row, last_row) {
                (Some(first), Some(last)) => Some(vec![
                    ("attention", "注意力", first.try_get("attention").unwrap_or(0.0), last.try_get("attention").unwrap_or(0.0), true),
                    ("fatigue", "疲劳度", first.try_get("fatigue").unwrap_or(0.0), last.try_get("fatigue").unwrap_or(0.0), false),
                    ("motivation", "动机", first.try_get("motivation").unwrap_or(0.0), last.try_get("motivation").unwrap_or(0.0), true),
                    ("memory", "记忆力", first.try_get("memory").unwrap_or(0.0), last.try_get("memory").unwrap_or(0.0), true),
                    ("speed", "速度", first.try_get("speed").unwrap_or(0.0), last.try_get("speed").unwrap_or(0.0), true),
                    ("stability", "稳定性", first.try_get("stability").unwrap_or(0.0), last.try_get("stability").unwrap_or(0.0), true),
                ]),
                _ => None,
            }
        }
        SelectedPool::Fallback(sqlite) => {
            let start_str = start_date.format("%Y-%m-%d").to_string();
            let end_str = today.format("%Y-%m-%d").to_string();

            let first_row = sqlx::query(
                r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability"
                   FROM "user_state_history" WHERE "userId" = ? AND "date" >= ? AND "date" <= ?
                   ORDER BY "date" ASC LIMIT 1"#,
            )
            .bind(user_id)
            .bind(&start_str)
            .bind(&end_str)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let last_row = sqlx::query(
                r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability"
                   FROM "user_state_history" WHERE "userId" = ? AND "date" >= ? AND "date" <= ?
                   ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .bind(&start_str)
            .bind(&end_str)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            match (first_row, last_row) {
                (Some(first), Some(last)) => Some(vec![
                    ("attention", "注意力", first.try_get("attention").unwrap_or(0.0), last.try_get("attention").unwrap_or(0.0), true),
                    ("fatigue", "疲劳度", first.try_get("fatigue").unwrap_or(0.0), last.try_get("fatigue").unwrap_or(0.0), false),
                    ("motivation", "动机", first.try_get("motivation").unwrap_or(0.0), last.try_get("motivation").unwrap_or(0.0), true),
                    ("memory", "记忆力", first.try_get("memory").unwrap_or(0.0), last.try_get("memory").unwrap_or(0.0), true),
                    ("speed", "速度", first.try_get("speed").unwrap_or(0.0), last.try_get("speed").unwrap_or(0.0), true),
                    ("stability", "稳定性", first.try_get("stability").unwrap_or(0.0), last.try_get("stability").unwrap_or(0.0), true),
                ]),
                _ => None,
            }
        }
    };

    let Some(metrics) = metrics else {
        return Ok(Vec::new());
    };

    let threshold = 0.15;
    let start_date_str = format!("{}T00:00:00.000Z", start_date.format("%Y-%m-%d"));
    let end_date_str = format!("{}T00:00:00.000Z", today.format("%Y-%m-%d"));

    Ok(metrics.into_iter().filter_map(|(metric, label, first_val, last_val, positive_direction)| {
        if first_val == 0.0 { return None; }
        let change_pct = ((last_val - first_val) / first_val) * 100.0;
        if change_pct.abs() < threshold * 100.0 { return None; }

        let direction = if change_pct > 0.0 { "up" } else { "down" };
        let is_positive = if positive_direction { change_pct > 0.0 } else { change_pct < 0.0 };

        Some(SignificantChange {
            metric: metric.to_string(),
            metric_label: label.to_string(),
            change_percent: change_pct,
            direction: direction.to_string(),
            is_positive,
            start_date: start_date_str.clone(),
            end_date: end_date_str.clone(),
        })
    }).collect())
}

pub async fn get_latest_state(
    pool: &SelectedPool,
    user_id: &str,
) -> Result<Option<StateHistoryItem>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
                   FROM "user_state_history" WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| StateHistoryItem {
                date: format!("{}T00:00:00.000Z", r.try_get::<NaiveDate, _>("date").unwrap_or(Utc::now().date_naive()).format("%Y-%m-%d")),
                attention: r.try_get("attention").unwrap_or(0.0),
                fatigue: r.try_get("fatigue").unwrap_or(0.0),
                motivation: r.try_get("motivation").unwrap_or(0.0),
                memory: r.try_get("memory").unwrap_or(0.0),
                speed: r.try_get("speed").unwrap_or(0.0),
                stability: r.try_get("stability").unwrap_or(0.0),
                trend_state: r.try_get::<Option<String>, _>("trendState").ok().flatten(),
            }))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
                   FROM "user_state_history" WHERE "userId" = ? ORDER BY "date" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| {
                let date_raw: String = r.try_get("date").unwrap_or_default();
                StateHistoryItem {
                    date: normalize_date_str(&date_raw),
                    attention: r.try_get("attention").unwrap_or(0.0),
                    fatigue: r.try_get("fatigue").unwrap_or(0.0),
                    motivation: r.try_get("motivation").unwrap_or(0.0),
                    memory: r.try_get("memory").unwrap_or(0.0),
                    speed: r.try_get("speed").unwrap_or(0.0),
                    stability: r.try_get("stability").unwrap_or(0.0),
                    trend_state: r.try_get::<Option<String>, _>("trendState").ok().flatten(),
                }
            }))
        }
    }
}

pub async fn get_state_by_date(
    pool: &SelectedPool,
    user_id: &str,
    date: NaiveDate,
) -> Result<Option<StateHistoryItem>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
                   FROM "user_state_history" WHERE "userId" = $1 AND "date" = $2"#,
            )
            .bind(user_id)
            .bind(date)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| StateHistoryItem {
                date: format!("{}T00:00:00.000Z", r.try_get::<NaiveDate, _>("date").unwrap_or(date).format("%Y-%m-%d")),
                attention: r.try_get("attention").unwrap_or(0.0),
                fatigue: r.try_get("fatigue").unwrap_or(0.0),
                motivation: r.try_get("motivation").unwrap_or(0.0),
                memory: r.try_get("memory").unwrap_or(0.0),
                speed: r.try_get("speed").unwrap_or(0.0),
                stability: r.try_get("stability").unwrap_or(0.0),
                trend_state: r.try_get::<Option<String>, _>("trendState").ok().flatten(),
            }))
        }
        SelectedPool::Fallback(sqlite) => {
            let date_str = date.format("%Y-%m-%d").to_string();

            let row = sqlx::query(
                r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
                   FROM "user_state_history" WHERE "userId" = ? AND "date" = ?"#,
            )
            .bind(user_id)
            .bind(&date_str)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| {
                let date_raw: String = r.try_get("date").unwrap_or_default();
                StateHistoryItem {
                    date: normalize_date_str(&date_raw),
                    attention: r.try_get("attention").unwrap_or(0.0),
                    fatigue: r.try_get("fatigue").unwrap_or(0.0),
                    motivation: r.try_get("motivation").unwrap_or(0.0),
                    memory: r.try_get("memory").unwrap_or(0.0),
                    speed: r.try_get("speed").unwrap_or(0.0),
                    stability: r.try_get("stability").unwrap_or(0.0),
                    trend_state: r.try_get::<Option<String>, _>("trendState").ok().flatten(),
                }
            }))
        }
    }
}

// ========== Write Operations ==========

pub async fn save_state_snapshot(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    snapshot: UserStateSnapshot,
) -> Result<(), String> {
    let today = Utc::now().date_naive();
    let alpha = 0.3;

    if proxy.sqlite_enabled() {
        let today_str = today.format("%Y-%m-%d").to_string();
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("userId".into(), serde_json::json!(user_id));
        where_clause.insert("date".into(), serde_json::json!(today_str));

        let pool = select_pool(proxy, state).await?;
        let existing = get_state_by_date(&pool, user_id, today).await?;

        let (attention, fatigue, motivation, memory, speed, stability) = if let Some(ex) = existing {
            (
                alpha * snapshot.attention + (1.0 - alpha) * ex.attention,
                alpha * snapshot.fatigue + (1.0 - alpha) * ex.fatigue,
                alpha * snapshot.motivation + (1.0 - alpha) * ex.motivation,
                alpha * snapshot.memory + (1.0 - alpha) * ex.memory,
                alpha * snapshot.speed + (1.0 - alpha) * ex.speed,
                alpha * snapshot.stability + (1.0 - alpha) * ex.stability,
            )
        } else {
            (snapshot.attention, snapshot.fatigue, snapshot.motivation, snapshot.memory, snapshot.speed, snapshot.stability)
        };

        let mut create = serde_json::Map::new();
        create.insert("userId".into(), serde_json::json!(user_id));
        create.insert("date".into(), serde_json::json!(today_str));
        create.insert("attention".into(), serde_json::json!(attention));
        create.insert("fatigue".into(), serde_json::json!(fatigue));
        create.insert("motivation".into(), serde_json::json!(motivation));
        create.insert("memory".into(), serde_json::json!(memory));
        create.insert("speed".into(), serde_json::json!(speed));
        create.insert("stability".into(), serde_json::json!(stability));
        if let Some(ref trend) = snapshot.trend_state {
            create.insert("trendState".into(), serde_json::json!(trend));
        }

        let mut update = serde_json::Map::new();
        update.insert("attention".into(), serde_json::json!(attention));
        update.insert("fatigue".into(), serde_json::json!(fatigue));
        update.insert("motivation".into(), serde_json::json!(motivation));
        update.insert("memory".into(), serde_json::json!(memory));
        update.insert("speed".into(), serde_json::json!(speed));
        update.insert("stability".into(), serde_json::json!(stability));
        if let Some(ref trend) = snapshot.trend_state {
            update.insert("trendState".into(), serde_json::json!(trend));
        }

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "user_state_history".to_string(),
            r#where: where_clause,
            create,
            update,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;

    let existing_row = sqlx::query(
        r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" = $2"#,
    )
    .bind(user_id)
    .bind(today)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let (attention, fatigue, motivation, memory, speed, stability, trend_state) = if let Some(ex) = existing_row {
        let existing_trend: Option<String> = ex.try_get("trendState").ok();
        (
            alpha * snapshot.attention + (1.0 - alpha) * ex.try_get("attention").unwrap_or(0.0),
            alpha * snapshot.fatigue + (1.0 - alpha) * ex.try_get("fatigue").unwrap_or(0.0),
            alpha * snapshot.motivation + (1.0 - alpha) * ex.try_get("motivation").unwrap_or(0.0),
            alpha * snapshot.memory + (1.0 - alpha) * ex.try_get("memory").unwrap_or(0.0),
            alpha * snapshot.speed + (1.0 - alpha) * ex.try_get("speed").unwrap_or(0.0),
            alpha * snapshot.stability + (1.0 - alpha) * ex.try_get("stability").unwrap_or(0.0),
            snapshot.trend_state.or(existing_trend),
        )
    } else {
        (snapshot.attention, snapshot.fatigue, snapshot.motivation, snapshot.memory, snapshot.speed, snapshot.stability, snapshot.trend_state)
    };

    sqlx::query(
        r#"INSERT INTO "user_state_history" ("userId","date","attention","fatigue","motivation","memory","speed","stability","trendState")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT ("userId","date") DO UPDATE SET
           "attention"=EXCLUDED."attention","fatigue"=EXCLUDED."fatigue","motivation"=EXCLUDED."motivation",
           "memory"=EXCLUDED."memory","speed"=EXCLUDED."speed","stability"=EXCLUDED."stability","trendState"=EXCLUDED."trendState""#,
    )
    .bind(user_id).bind(today).bind(attention).bind(fatigue).bind(motivation).bind(memory).bind(speed).bind(stability).bind(trend_state)
    .execute(&pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

// ========== Helper Functions ==========

fn normalize_date_str(value: &str) -> String {
    if value.contains('T') { return value.to_string(); }
    if value.len() == 10 { return format!("{value}T00:00:00.000Z"); }
    value.to_string()
}
