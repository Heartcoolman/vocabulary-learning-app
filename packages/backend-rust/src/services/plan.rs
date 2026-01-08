use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlanStatus {
    Active,
    Completed,
    Paused,
    Expired,
}

impl PlanStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "ACTIVE",
            Self::Completed => "COMPLETED",
            Self::Paused => "PAUSED",
            Self::Expired => "EXPIRED",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "COMPLETED" => Self::Completed,
            "PAUSED" => Self::Paused,
            "EXPIRED" => Self::Expired,
            _ => Self::Active,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePlanInput {
    pub user_id: String,
    pub wordbook_ids: Vec<String>,
    pub target_date: String,
    #[serde(default)]
    pub daily_new_words: Option<i32>,
    #[serde(default)]
    pub daily_review_words: Option<i32>,
    #[serde(default)]
    pub study_days_per_week: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningPlan {
    pub id: String,
    pub user_id: String,
    pub wordbook_ids: Vec<String>,
    pub target_date: String,
    pub daily_new_words: i32,
    pub daily_review_words: i32,
    pub study_days_per_week: i32,
    pub total_words: i64,
    pub learned_words: i64,
    pub status: String,
    pub milestones: Vec<PlanMilestone>,
    pub wordbook_distribution: Vec<WordbookDistribution>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanMilestone {
    pub week: i32,
    pub start_date: String,
    pub end_date: String,
    pub target_words: i64,
    pub new_words: i64,
    pub review_words: i64,
    pub is_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordbookDistribution {
    pub wordbook_id: String,
    pub wordbook_name: String,
    pub total_words: i64,
    pub allocated_words: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanProgress {
    pub total_words: i64,
    pub learned_words: i64,
    pub remaining_words: i64,
    pub progress_percentage: f64,
    pub days_remaining: i64,
    pub on_track: bool,
    pub required_daily_words: i32,
    pub current_daily_average: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    pub id: String,
    pub status: String,
    pub total_words: i64,
    pub learned_words: i64,
    pub progress_percentage: f64,
    pub target_date: String,
    pub days_remaining: i64,
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

pub async fn generate_plan(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    input: GeneratePlanInput,
) -> Result<LearningPlan, String> {
    if input.wordbook_ids.is_empty() {
        return Err("至少需要选择一个词书".to_string());
    }

    let target_date = NaiveDate::parse_from_str(&input.target_date, "%Y-%m-%d")
        .map_err(|_| "无效的目标日期格式")?;
    let today = Utc::now().date_naive();

    if target_date <= today {
        return Err("目标日期必须在今天之后".to_string());
    }

    let pool = select_pool(proxy, state).await?;
    let wordbook_info = get_wordbook_info(&pool, &input.wordbook_ids).await?;
    let total_words: i64 = wordbook_info.iter().map(|(_, _, count)| count).sum();

    if total_words == 0 {
        return Err("选择的词书中没有单词".to_string());
    }

    let days_until_target = (target_date - today).num_days();
    let study_days_per_week = input.study_days_per_week.unwrap_or(5).clamp(1, 7);
    let total_study_days = (days_until_target * study_days_per_week as i64) / 7;

    let daily_new_words = input.daily_new_words.unwrap_or_else(|| {
        ((total_words as f64 / total_study_days as f64).ceil() as i32).clamp(5, 100)
    });
    let daily_review_words = input.daily_review_words.unwrap_or(daily_new_words * 3);

    let learned_words = get_learned_words_count(&pool, &input.user_id, &input.wordbook_ids).await?;
    let distribution = calculate_wordbook_distribution(&wordbook_info, total_words);
    let milestones = generate_weekly_milestones(today, target_date, total_words, daily_new_words, study_days_per_week);

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();
    let now_str = now.to_rfc3339();

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::json!(id));
        data.insert("userId".into(), serde_json::json!(input.user_id));
        data.insert("wordbookIds".into(), serde_json::json!(input.wordbook_ids));
        data.insert("targetDate".into(), serde_json::json!(input.target_date));
        data.insert("dailyNewWords".into(), serde_json::json!(daily_new_words));
        data.insert("dailyReviewWords".into(), serde_json::json!(daily_review_words));
        data.insert("studyDaysPerWeek".into(), serde_json::json!(study_days_per_week));
        data.insert("totalWords".into(), serde_json::json!(total_words));
        data.insert("learnedWords".into(), serde_json::json!(learned_words));
        data.insert("status".into(), serde_json::json!("ACTIVE"));
        data.insert("milestones".into(), serde_json::json!(serde_json::to_string(&milestones).unwrap_or_default()));
        data.insert("wordbookDistribution".into(), serde_json::json!(serde_json::to_string(&distribution).unwrap_or_default()));
        data.insert("createdAt".into(), serde_json::json!(now_str));
        data.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "learning_plans".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

        return Ok(LearningPlan {
            id,
            user_id: input.user_id,
            wordbook_ids: input.wordbook_ids,
            target_date: input.target_date,
            daily_new_words,
            daily_review_words,
            study_days_per_week,
            total_words,
            learned_words,
            status: "ACTIVE".to_string(),
            milestones,
            wordbook_distribution: distribution,
            created_at: now_str.clone(),
            updated_at: now_str,
        });
    }

    let pg = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let wordbook_ids_json = serde_json::to_string(&input.wordbook_ids).unwrap_or_default();
    let milestones_json = serde_json::to_string(&milestones).unwrap_or_default();
    let distribution_json = serde_json::to_string(&distribution).unwrap_or_default();

    sqlx::query(
        r#"INSERT INTO "learning_plans" ("id","userId","wordbookIds","targetDate","dailyNewWords","dailyReviewWords","studyDaysPerWeek","totalWords","learnedWords","status","milestones","wordbookDistribution","createdAt","updatedAt")
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10::learning_plan_status,$11::jsonb,$12::jsonb,NOW(),NOW())"#,
    )
    .bind(&id)
    .bind(&input.user_id)
    .bind(&wordbook_ids_json)
    .bind(target_date)
    .bind(daily_new_words)
    .bind(daily_review_words)
    .bind(study_days_per_week)
    .bind(total_words)
    .bind(learned_words)
    .bind("ACTIVE")
    .bind(&milestones_json)
    .bind(&distribution_json)
    .execute(&pg)
    .await
    .map_err(|e| format!("写入失败: {e}"))?;

    Ok(LearningPlan {
        id,
        user_id: input.user_id,
        wordbook_ids: input.wordbook_ids,
        target_date: input.target_date,
        daily_new_words,
        daily_review_words,
        study_days_per_week,
        total_words,
        learned_words,
        status: "ACTIVE".to_string(),
        milestones,
        wordbook_distribution: distribution,
        created_at: now_str.clone(),
        updated_at: now_str,
    })
}

pub async fn get_current_plan(pool: &SelectedPool, user_id: &str) -> Result<Option<LearningPlan>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","wordbookIds","targetDate","dailyNewWords","dailyReviewWords","studyDaysPerWeek","totalWords","learnedWords","status"::text,"milestones","wordbookDistribution","createdAt","updatedAt"
                   FROM "learning_plans" WHERE "userId" = $1 AND "status"::text = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| parse_plan_row_pg(&r)))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","wordbookIds","targetDate","dailyNewWords","dailyReviewWords","studyDaysPerWeek","totalWords","learnedWords","status","milestones","wordbookDistribution","createdAt","updatedAt"
                   FROM "learning_plans" WHERE "userId" = ? AND "status" = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1"#,
            )
            .bind(user_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| parse_plan_row_sqlite(&r)))
        }
    }
}

pub async fn get_plan_by_id(pool: &SelectedPool, plan_id: &str) -> Result<Option<LearningPlan>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","wordbookIds","targetDate","dailyNewWords","dailyReviewWords","studyDaysPerWeek","totalWords","learnedWords","status"::text,"milestones","wordbookDistribution","createdAt","updatedAt"
                   FROM "learning_plans" WHERE "id" = $1"#,
            )
            .bind(plan_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| parse_plan_row_pg(&r)))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "id","userId","wordbookIds","targetDate","dailyNewWords","dailyReviewWords","studyDaysPerWeek","totalWords","learnedWords","status","milestones","wordbookDistribution","createdAt","updatedAt"
                   FROM "learning_plans" WHERE "id" = ?"#,
            )
            .bind(plan_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| parse_plan_row_sqlite(&r)))
        }
    }
}

pub async fn get_user_plans(
    pool: &SelectedPool,
    user_id: &str,
    status: Option<&str>,
) -> Result<Vec<PlanSummary>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let rows = if let Some(st) = status {
                sqlx::query(
                    r#"SELECT "id","status"::text,"totalWords","learnedWords","targetDate","createdAt"
                       FROM "learning_plans" WHERE "userId" = $1 AND "status"::text = $2 ORDER BY "createdAt" DESC"#,
                )
                .bind(user_id)
                .bind(st)
                .fetch_all(pg)
                .await
                .map_err(|e| format!("查询失败: {e}"))?
            } else {
                sqlx::query(
                    r#"SELECT "id","status"::text,"totalWords","learnedWords","targetDate","createdAt"
                       FROM "learning_plans" WHERE "userId" = $1 ORDER BY "createdAt" DESC"#,
                )
                .bind(user_id)
                .fetch_all(pg)
                .await
                .map_err(|e| format!("查询失败: {e}"))?
            };

            let today = Utc::now().date_naive();
            Ok(rows.iter().map(|row| {
                let total: i64 = row.try_get("totalWords").unwrap_or(0);
                let learned: i64 = row.try_get("learnedWords").unwrap_or(0);
                let target_date: NaiveDate = row.try_get("targetDate").unwrap_or(today);
                let days_remaining = (target_date - today).num_days().max(0);
                let progress = if total > 0 { (learned as f64 / total as f64) * 100.0 } else { 0.0 };

                PlanSummary {
                    id: row.try_get("id").unwrap_or_default(),
                    status: row.try_get("status").unwrap_or_default(),
                    total_words: total,
                    learned_words: learned,
                    progress_percentage: (progress * 100.0).round() / 100.0,
                    target_date: target_date.to_string(),
                    days_remaining,
                }
            }).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = if let Some(st) = status {
                sqlx::query(
                    r#"SELECT "id","status","totalWords","learnedWords","targetDate","createdAt"
                       FROM "learning_plans" WHERE "userId" = ? AND "status" = ? ORDER BY "createdAt" DESC"#,
                )
                .bind(user_id)
                .bind(st)
                .fetch_all(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?
            } else {
                sqlx::query(
                    r#"SELECT "id","status","totalWords","learnedWords","targetDate","createdAt"
                       FROM "learning_plans" WHERE "userId" = ? ORDER BY "createdAt" DESC"#,
                )
                .bind(user_id)
                .fetch_all(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?
            };

            let today = Utc::now().date_naive();
            Ok(rows.iter().map(|row| {
                let total: i64 = row.try_get("totalWords").unwrap_or(0);
                let learned: i64 = row.try_get("learnedWords").unwrap_or(0);
                let target_str: String = row.try_get("targetDate").unwrap_or_default();
                let target_date = NaiveDate::parse_from_str(&target_str, "%Y-%m-%d").unwrap_or(today);
                let days_remaining = (target_date - today).num_days().max(0);
                let progress = if total > 0 { (learned as f64 / total as f64) * 100.0 } else { 0.0 };

                PlanSummary {
                    id: row.try_get("id").unwrap_or_default(),
                    status: row.try_get("status").unwrap_or_default(),
                    total_words: total,
                    learned_words: learned,
                    progress_percentage: (progress * 100.0).round() / 100.0,
                    target_date: target_str,
                    days_remaining,
                }
            }).collect())
        }
    }
}

pub async fn update_plan_progress(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    plan_id: &str,
) -> Result<PlanProgress, String> {
    let pool = select_pool(proxy, state).await?;
    let plan = get_plan_by_id(&pool, plan_id).await?.ok_or("计划不存在")?;

    let learned_words = get_learned_words_count(&pool, &plan.user_id, &plan.wordbook_ids).await?;
    let today = Utc::now().date_naive();
    let target_date = NaiveDate::parse_from_str(&plan.target_date, "%Y-%m-%d")
        .unwrap_or(today + Duration::days(30));
    let days_remaining = (target_date - today).num_days().max(0);

    let remaining_words = plan.total_words - learned_words;
    let progress_percentage = if plan.total_words > 0 {
        (learned_words as f64 / plan.total_words as f64) * 100.0
    } else {
        0.0
    };

    let required_daily_words = if days_remaining > 0 {
        ((remaining_words as f64 / days_remaining as f64).ceil() as i32).max(1)
    } else {
        remaining_words as i32
    };

    let plan_created = NaiveDate::parse_from_str(&plan.created_at[..10], "%Y-%m-%d").unwrap_or(today);
    let days_elapsed = (today - plan_created).num_days().max(1);
    let current_daily_average = learned_words as f64 / days_elapsed as f64;

    let on_track = current_daily_average >= (plan.daily_new_words as f64 * 0.8);

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(plan_id));

        let mut data = serde_json::Map::new();
        data.insert("learnedWords".into(), serde_json::json!(learned_words));
        data.insert("updatedAt".into(), serde_json::json!(Utc::now().to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "learning_plans".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("更新失败: {e}"))?;
    } else {
        let pg = proxy.primary_pool().await.ok_or("数据库不可用")?;
        sqlx::query(r#"UPDATE "learning_plans" SET "learnedWords" = $1, "updatedAt" = NOW() WHERE "id" = $2"#)
            .bind(learned_words)
            .bind(plan_id)
            .execute(&pg)
            .await
            .map_err(|e| format!("更新失败: {e}"))?;
    }

    Ok(PlanProgress {
        total_words: plan.total_words,
        learned_words,
        remaining_words,
        progress_percentage: (progress_percentage * 100.0).round() / 100.0,
        days_remaining,
        on_track,
        required_daily_words,
        current_daily_average: (current_daily_average * 100.0).round() / 100.0,
    })
}

pub async fn adjust_plan(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    plan_id: &str,
    daily_new_words: Option<i32>,
    daily_review_words: Option<i32>,
    target_date: Option<&str>,
) -> Result<LearningPlan, String> {
    let pool = select_pool(proxy, state).await?;
    let mut plan = get_plan_by_id(&pool, plan_id).await?.ok_or("计划不存在")?;

    if let Some(new_words) = daily_new_words {
        plan.daily_new_words = new_words.clamp(1, 200);
    }
    if let Some(review_words) = daily_review_words {
        plan.daily_review_words = review_words.clamp(0, 500);
    }
    if let Some(new_target) = target_date {
        let parsed = NaiveDate::parse_from_str(new_target, "%Y-%m-%d")
            .map_err(|_| "无效的目标日期格式")?;
        let today = Utc::now().date_naive();
        if parsed <= today {
            return Err("目标日期必须在今天之后".to_string());
        }
        plan.target_date = new_target.to_string();
    }

    let today = Utc::now().date_naive();
    let target = NaiveDate::parse_from_str(&plan.target_date, "%Y-%m-%d").unwrap_or(today + Duration::days(30));
    plan.milestones = generate_weekly_milestones(today, target, plan.total_words, plan.daily_new_words, plan.study_days_per_week);

    let now = Utc::now().to_rfc3339();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(plan_id));

        let mut data = serde_json::Map::new();
        data.insert("dailyNewWords".into(), serde_json::json!(plan.daily_new_words));
        data.insert("dailyReviewWords".into(), serde_json::json!(plan.daily_review_words));
        data.insert("targetDate".into(), serde_json::json!(plan.target_date));
        data.insert("milestones".into(), serde_json::json!(serde_json::to_string(&plan.milestones).unwrap_or_default()));
        data.insert("updatedAt".into(), serde_json::json!(now));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "learning_plans".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("更新失败: {e}"))?;
    } else {
        let pg = proxy.primary_pool().await.ok_or("数据库不可用")?;
        let milestones_json = serde_json::to_string(&plan.milestones).unwrap_or_default();
        let target = NaiveDate::parse_from_str(&plan.target_date, "%Y-%m-%d").unwrap_or(today);

        sqlx::query(
            r#"UPDATE "learning_plans" SET "dailyNewWords" = $1, "dailyReviewWords" = $2, "targetDate" = $3, "milestones" = $4::jsonb, "updatedAt" = NOW() WHERE "id" = $5"#,
        )
        .bind(plan.daily_new_words)
        .bind(plan.daily_review_words)
        .bind(target)
        .bind(&milestones_json)
        .bind(plan_id)
        .execute(&pg)
        .await
        .map_err(|e| format!("更新失败: {e}"))?;
    }

    plan.updated_at = now;
    Ok(plan)
}

pub async fn update_plan_status(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    plan_id: &str,
    status: PlanStatus,
) -> Result<(), String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(plan_id));

        let mut data = serde_json::Map::new();
        data.insert("status".into(), serde_json::json!(status.as_str()));
        data.insert("updatedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "learning_plans".to_string(),
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
    sqlx::query(r#"UPDATE "learning_plans" SET "status" = $1::learning_plan_status, "updatedAt" = NOW() WHERE "id" = $2"#)
        .bind(status.as_str())
        .bind(plan_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("更新失败: {e}"))?;

    Ok(())
}

pub async fn delete_plan(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    plan_id: &str,
) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(plan_id));

        let op = crate::db::dual_write_manager::WriteOperation::Delete {
            table: "learning_plans".to_string(),
            r#where: where_clause,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("删除失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    sqlx::query(r#"DELETE FROM "learning_plans" WHERE "id" = $1"#)
        .bind(plan_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("删除失败: {e}"))?;

    Ok(())
}

async fn get_wordbook_info(pool: &SelectedPool, wordbook_ids: &[String]) -> Result<Vec<(String, String, i64)>, String> {
    if wordbook_ids.is_empty() {
        return Ok(Vec::new());
    }

    match pool {
        SelectedPool::Primary(pg) => {
            let placeholders: Vec<String> = (1..=wordbook_ids.len()).map(|i| format!("${i}")).collect();
            let query = format!(
                r#"SELECT w."id", w."name", COUNT(ww."wordId") as word_count
                   FROM "wordbooks" w
                   LEFT JOIN "wordbook_words" ww ON w."id" = ww."wordbookId"
                   WHERE w."id" IN ({})
                   GROUP BY w."id", w."name""#,
                placeholders.join(",")
            );

            let mut q = sqlx::query(&query);
            for id in wordbook_ids {
                q = q.bind(id);
            }

            let rows = q.fetch_all(pg).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().map(|r| {
                (
                    r.try_get::<String, _>("id").unwrap_or_default(),
                    r.try_get::<String, _>("name").unwrap_or_default(),
                    r.try_get::<i64, _>("word_count").unwrap_or(0),
                )
            }).collect())
        }
        SelectedPool::Fallback(sqlite) => {
            let placeholders: Vec<&str> = wordbook_ids.iter().map(|_| "?").collect();
            let query = format!(
                r#"SELECT w."id", w."name", COUNT(ww."wordId") as word_count
                   FROM "wordbooks" w
                   LEFT JOIN "wordbook_words" ww ON w."id" = ww."wordbookId"
                   WHERE w."id" IN ({})
                   GROUP BY w."id", w."name""#,
                placeholders.join(",")
            );

            let mut q = sqlx::query(&query);
            for id in wordbook_ids {
                q = q.bind(id);
            }

            let rows = q.fetch_all(sqlite).await.map_err(|e| format!("查询失败: {e}"))?;
            Ok(rows.iter().map(|r| {
                (
                    r.try_get::<String, _>("id").unwrap_or_default(),
                    r.try_get::<String, _>("name").unwrap_or_default(),
                    r.try_get::<i64, _>("word_count").unwrap_or(0),
                )
            }).collect())
        }
    }
}

async fn get_learned_words_count(pool: &SelectedPool, user_id: &str, wordbook_ids: &[String]) -> Result<i64, String> {
    if wordbook_ids.is_empty() {
        return Ok(0);
    }

    match pool {
        SelectedPool::Primary(pg) => {
            let placeholders: Vec<String> = (2..=wordbook_ids.len() + 1).map(|i| format!("${i}")).collect();
            let query = format!(
                r#"SELECT COUNT(DISTINCT wls."wordId") FROM "word_learning_states" wls
                   JOIN "wordbook_words" ww ON wls."wordId" = ww."wordId"
                   WHERE wls."userId" = $1 AND ww."wordbookId" IN ({}) AND wls."reviewCount" > 0"#,
                placeholders.join(",")
            );

            let mut q = sqlx::query_scalar(&query).bind(user_id);
            for id in wordbook_ids {
                q = q.bind(id);
            }

            q.fetch_one(pg).await.map_err(|e| format!("查询失败: {e}"))
        }
        SelectedPool::Fallback(sqlite) => {
            let placeholders: Vec<&str> = wordbook_ids.iter().map(|_| "?").collect();
            let query = format!(
                r#"SELECT COUNT(DISTINCT wls."wordId") FROM "word_learning_states" wls
                   JOIN "wordbook_words" ww ON wls."wordId" = ww."wordId"
                   WHERE wls."userId" = ? AND ww."wordbookId" IN ({}) AND wls."reviewCount" > 0"#,
                placeholders.join(",")
            );

            let mut q = sqlx::query_scalar(&query).bind(user_id);
            for id in wordbook_ids {
                q = q.bind(id);
            }

            q.fetch_one(sqlite).await.map_err(|e| format!("查询失败: {e}"))
        }
    }
}

fn calculate_wordbook_distribution(
    wordbook_info: &[(String, String, i64)],
    total_words: i64,
) -> Vec<WordbookDistribution> {
    wordbook_info.iter().map(|(id, name, count)| {
        let percentage = if total_words > 0 {
            (*count as f64 / total_words as f64) * 100.0
        } else {
            0.0
        };
        WordbookDistribution {
            wordbook_id: id.clone(),
            wordbook_name: name.clone(),
            total_words: *count,
            allocated_words: *count,
            percentage: (percentage * 100.0).round() / 100.0,
        }
    }).collect()
}

fn generate_weekly_milestones(
    start_date: NaiveDate,
    target_date: NaiveDate,
    total_words: i64,
    daily_new_words: i32,
    study_days_per_week: i32,
) -> Vec<PlanMilestone> {
    let mut milestones = Vec::new();
    let mut current_date = start_date;
    let mut week_num = 1;
    let mut cumulative_words = 0i64;

    while current_date < target_date {
        let week_end = (current_date + Duration::days(6)).min(target_date);
        let weekly_new = (daily_new_words * study_days_per_week) as i64;
        let weekly_review = (daily_new_words * 3 * study_days_per_week) as i64;
        cumulative_words = (cumulative_words + weekly_new).min(total_words);

        milestones.push(PlanMilestone {
            week: week_num,
            start_date: current_date.to_string(),
            end_date: week_end.to_string(),
            target_words: cumulative_words,
            new_words: weekly_new.min(total_words - (cumulative_words - weekly_new)),
            review_words: weekly_review,
            is_completed: false,
        });

        current_date = current_date + Duration::days(7);
        week_num += 1;

        if cumulative_words >= total_words {
            break;
        }
    }

    milestones
}

fn parse_plan_row_pg(row: &sqlx::postgres::PgRow) -> LearningPlan {
    let target_date: NaiveDate = row.try_get("targetDate").unwrap_or_else(|_| Utc::now().date_naive());
    let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: chrono::NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());

    let wordbook_ids: Vec<String> = row.try_get::<serde_json::Value, _>("wordbookIds")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let milestones: Vec<PlanMilestone> = row.try_get::<serde_json::Value, _>("milestones")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let distribution: Vec<WordbookDistribution> = row.try_get::<serde_json::Value, _>("wordbookDistribution")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    LearningPlan {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        wordbook_ids,
        target_date: target_date.to_string(),
        daily_new_words: row.try_get("dailyNewWords").unwrap_or(20),
        daily_review_words: row.try_get("dailyReviewWords").unwrap_or(60),
        study_days_per_week: row.try_get("studyDaysPerWeek").unwrap_or(5),
        total_words: row.try_get("totalWords").unwrap_or(0),
        learned_words: row.try_get("learnedWords").unwrap_or(0),
        status: row.try_get("status").unwrap_or_else(|_| "ACTIVE".to_string()),
        milestones,
        wordbook_distribution: distribution,
        created_at: chrono::DateTime::<Utc>::from_naive_utc_and_offset(created_at, Utc).to_rfc3339(),
        updated_at: chrono::DateTime::<Utc>::from_naive_utc_and_offset(updated_at, Utc).to_rfc3339(),
    }
}

fn parse_plan_row_sqlite(row: &sqlx::sqlite::SqliteRow) -> LearningPlan {
    let wordbook_ids_raw: String = row.try_get("wordbookIds").unwrap_or_default();
    let wordbook_ids: Vec<String> = serde_json::from_str(&wordbook_ids_raw).unwrap_or_default();

    let milestones_raw: String = row.try_get("milestones").unwrap_or_default();
    let milestones: Vec<PlanMilestone> = serde_json::from_str(&milestones_raw).unwrap_or_default();

    let distribution_raw: String = row.try_get("wordbookDistribution").unwrap_or_default();
    let distribution: Vec<WordbookDistribution> = serde_json::from_str(&distribution_raw).unwrap_or_default();

    LearningPlan {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        wordbook_ids,
        target_date: row.try_get("targetDate").unwrap_or_default(),
        daily_new_words: row.try_get("dailyNewWords").unwrap_or(20),
        daily_review_words: row.try_get("dailyReviewWords").unwrap_or(60),
        study_days_per_week: row.try_get("studyDaysPerWeek").unwrap_or(5),
        total_words: row.try_get("totalWords").unwrap_or(0),
        learned_words: row.try_get("learnedWords").unwrap_or(0),
        status: row.try_get("status").unwrap_or_else(|_| "ACTIVE".to_string()),
        milestones,
        wordbook_distribution: distribution,
        created_at: row.try_get("createdAt").unwrap_or_default(),
        updated_at: row.try_get("updatedAt").unwrap_or_default(),
    }
}
