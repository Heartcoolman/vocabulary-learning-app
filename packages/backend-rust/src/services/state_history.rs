use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

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

pub type DateRangeOption = i32;

// ========== Read Operations ==========

pub async fn get_state_history(
    pool: &PgPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<Vec<StateHistoryItem>, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(range as i64);

    let rows = sqlx::query(
        r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3 ORDER BY "date" ASC"#,
    )
    .bind(user_id)
    .bind(start_date)
    .bind(today)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows
        .iter()
        .map(|row| StateHistoryItem {
            date: format!(
                "{}T00:00:00.000Z",
                row.try_get::<NaiveDate, _>("date")
                    .unwrap_or(Utc::now().date_naive())
                    .format("%Y-%m-%d")
            ),
            attention: row.try_get("attention").unwrap_or(0.0),
            fatigue: row.try_get("fatigue").unwrap_or(0.0),
            motivation: row.try_get("motivation").unwrap_or(0.0),
            memory: row.try_get("memory").unwrap_or(0.0),
            speed: row.try_get("speed").unwrap_or(0.0),
            stability: row.try_get("stability").unwrap_or(0.0),
            trend_state: row
                .try_get::<Option<String>, _>("trendState")
                .ok()
                .flatten(),
        })
        .collect())
}

pub async fn get_history_summary(
    pool: &PgPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<HistorySummary, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(range as i64);

    let row = sqlx::query(
        r#"SELECT COUNT(*) as count, AVG("attention") as avg_attention, AVG("fatigue") as avg_fatigue,
           AVG("motivation") as avg_motivation, AVG("memory") as avg_memory, AVG("speed") as avg_speed,
           AVG("stability") as avg_stability FROM "user_state_history"
           WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3"#,
    )
    .bind(user_id)
    .bind(start_date)
    .bind(today)
    .fetch_one(pool)
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

pub async fn get_cognitive_growth(
    pool: &PgPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<CognitiveGrowth, String> {
    let today = Utc::now().date_naive();
    let target_date = today - Duration::days(range as i64);

    let current_row = sqlx::query(
        r#"SELECT "memory", "speed", "stability" FROM "user_state_history"
           WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let previous_row = sqlx::query(
        r#"SELECT "memory", "speed", "stability" FROM "user_state_history"
           WHERE "userId" = $1 AND "date" <= $2 ORDER BY "date" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .bind(target_date)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let current = current_row
        .map(|r| CognitiveSnapshot {
            memory: r.try_get("memory").unwrap_or(0.0),
            speed: r.try_get("speed").unwrap_or(0.0),
            stability: r.try_get("stability").unwrap_or(0.0),
        })
        .unwrap_or(CognitiveSnapshot {
            memory: 0.0,
            speed: 0.0,
            stability: 0.0,
        });

    let previous = previous_row
        .map(|r| CognitiveSnapshot {
            memory: r.try_get("memory").unwrap_or(0.0),
            speed: r.try_get("speed").unwrap_or(0.0),
            stability: r.try_get("stability").unwrap_or(0.0),
        })
        .unwrap_or(current.clone());

    Ok(CognitiveGrowth {
        memory_change: ((current.memory - previous.memory)
            / if previous.memory == 0.0 {
                1.0
            } else {
                previous.memory
            })
            * 100.0,
        speed_change: ((current.speed - previous.speed)
            / if previous.speed == 0.0 {
                1.0
            } else {
                previous.speed
            })
            * 100.0,
        stability_change: ((current.stability - previous.stability)
            / if previous.stability == 0.0 {
                1.0
            } else {
                previous.stability
            })
            * 100.0,
        current,
        previous,
        days: range as i64,
    })
}

pub async fn get_significant_changes(
    pool: &PgPool,
    user_id: &str,
    range: DateRangeOption,
) -> Result<Vec<SignificantChange>, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(range as i64);

    let first_row = sqlx::query(
        r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3
           ORDER BY "date" ASC LIMIT 1"#,
    )
    .bind(user_id)
    .bind(start_date)
    .bind(today)
    .fetch_optional(pool)
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
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let metrics: Option<Vec<(&str, &str, f64, f64, bool)>> = match (first_row, last_row) {
        (Some(first), Some(last)) => Some(vec![
            (
                "attention",
                "注意力",
                first.try_get("attention").unwrap_or(0.0),
                last.try_get("attention").unwrap_or(0.0),
                true,
            ),
            (
                "fatigue",
                "疲劳度",
                first.try_get("fatigue").unwrap_or(0.0),
                last.try_get("fatigue").unwrap_or(0.0),
                false,
            ),
            (
                "motivation",
                "动机",
                first.try_get("motivation").unwrap_or(0.0),
                last.try_get("motivation").unwrap_or(0.0),
                true,
            ),
            (
                "memory",
                "记忆力",
                first.try_get("memory").unwrap_or(0.0),
                last.try_get("memory").unwrap_or(0.0),
                true,
            ),
            (
                "speed",
                "速度",
                first.try_get("speed").unwrap_or(0.0),
                last.try_get("speed").unwrap_or(0.0),
                true,
            ),
            (
                "stability",
                "稳定性",
                first.try_get("stability").unwrap_or(0.0),
                last.try_get("stability").unwrap_or(0.0),
                true,
            ),
        ]),
        _ => None,
    };

    let Some(metrics) = metrics else {
        return Ok(Vec::new());
    };

    let threshold = 0.15;
    let start_date_str = format!("{}T00:00:00.000Z", start_date.format("%Y-%m-%d"));
    let end_date_str = format!("{}T00:00:00.000Z", today.format("%Y-%m-%d"));

    Ok(metrics
        .into_iter()
        .filter_map(|(metric, label, first_val, last_val, positive_direction)| {
            if first_val == 0.0 {
                return None;
            }
            let change_pct = ((last_val - first_val) / first_val) * 100.0;
            if change_pct.abs() < threshold * 100.0 {
                return None;
            }

            let direction = if change_pct > 0.0 { "up" } else { "down" };
            let is_positive = if positive_direction {
                change_pct > 0.0
            } else {
                change_pct < 0.0
            };

            Some(SignificantChange {
                metric: metric.to_string(),
                metric_label: label.to_string(),
                change_percent: change_pct,
                direction: direction.to_string(),
                is_positive,
                start_date: start_date_str.clone(),
                end_date: end_date_str.clone(),
            })
        })
        .collect())
}

pub async fn get_latest_state(
    pool: &PgPool,
    user_id: &str,
) -> Result<Option<StateHistoryItem>, String> {
    let row = sqlx::query(
        r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(row.map(|r| StateHistoryItem {
        date: format!(
            "{}T00:00:00.000Z",
            r.try_get::<NaiveDate, _>("date")
                .unwrap_or(Utc::now().date_naive())
                .format("%Y-%m-%d")
        ),
        attention: r.try_get("attention").unwrap_or(0.0),
        fatigue: r.try_get("fatigue").unwrap_or(0.0),
        motivation: r.try_get("motivation").unwrap_or(0.0),
        memory: r.try_get("memory").unwrap_or(0.0),
        speed: r.try_get("speed").unwrap_or(0.0),
        stability: r.try_get("stability").unwrap_or(0.0),
        trend_state: r.try_get::<Option<String>, _>("trendState").ok().flatten(),
    }))
}

pub async fn get_state_by_date(
    pool: &PgPool,
    user_id: &str,
    date: NaiveDate,
) -> Result<Option<StateHistoryItem>, String> {
    let row = sqlx::query(
        r#"SELECT "date", "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" = $2"#,
    )
    .bind(user_id)
    .bind(date)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(row.map(|r| StateHistoryItem {
        date: format!(
            "{}T00:00:00.000Z",
            r.try_get::<NaiveDate, _>("date")
                .unwrap_or(date)
                .format("%Y-%m-%d")
        ),
        attention: r.try_get("attention").unwrap_or(0.0),
        fatigue: r.try_get("fatigue").unwrap_or(0.0),
        motivation: r.try_get("motivation").unwrap_or(0.0),
        memory: r.try_get("memory").unwrap_or(0.0),
        speed: r.try_get("speed").unwrap_or(0.0),
        stability: r.try_get("stability").unwrap_or(0.0),
        trend_state: r.try_get::<Option<String>, _>("trendState").ok().flatten(),
    }))
}

// ========== Write Operations ==========

pub async fn save_state_snapshot(
    proxy: &DatabaseProxy,
    user_id: &str,
    snapshot: UserStateSnapshot,
) -> Result<(), String> {
    let today = Utc::now().date_naive();
    let alpha = 0.3;

    let pool = proxy.pool();

    let existing_row = sqlx::query(
        r#"SELECT "attention", "fatigue", "motivation", "memory", "speed", "stability", "trendState"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" = $2"#,
    )
    .bind(user_id)
    .bind(today)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let (attention, fatigue, motivation, memory, speed, stability, trend_state) = if let Some(ex) =
        existing_row
    {
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
        (
            snapshot.attention,
            snapshot.fatigue,
            snapshot.motivation,
            snapshot.memory,
            snapshot.speed,
            snapshot.stability,
            snapshot.trend_state,
        )
    };

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO "user_state_history" ("id","userId","date","attention","fatigue","motivation","memory","speed","stability","trendState")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT ("userId","date") DO UPDATE SET
           "attention"=EXCLUDED."attention","fatigue"=EXCLUDED."fatigue","motivation"=EXCLUDED."motivation",
           "memory"=EXCLUDED."memory","speed"=EXCLUDED."speed","stability"=EXCLUDED."stability","trendState"=EXCLUDED."trendState""#,
    )
    .bind(&id).bind(user_id).bind(today).bind(attention).bind(fatigue).bind(motivation).bind(memory).bind(speed).bind(stability).bind(trend_state)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}
