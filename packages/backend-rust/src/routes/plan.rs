use std::collections::{HashMap, HashSet};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::Json;
use chrono::{DateTime, Datelike, Duration, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, QueryBuilder, Row};

use crate::response::{json_error, AppError};
use crate::services::study_config;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratePlanRequest {
    target_days: Option<i64>,
    daily_target: Option<i64>,
    wordbook_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdjustPlanRequest {
    reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WordbookAllocation {
    wordbook_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    wordbook_name: Option<String>,
    percentage: i64,
    priority: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WeeklyMilestone {
    week: i64,
    target: i64,
    description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningPlanResponse {
    id: String,
    daily_target: i64,
    total_words: i64,
    estimated_completion_date: String,
    wordbook_distribution: Vec<WordbookAllocation>,
    weekly_milestones: Vec<WeeklyMilestone>,
    is_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanProgressResponse {
    completed_today: i64,
    target_today: i64,
    weekly_progress: f64,
    overall_progress: f64,
    on_track: bool,
    deviation: f64,
    status: String,
}

pub fn router() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/", get(get_current_plan))
        .route("/generate", post(generate_plan))
        .route("/progress", get(get_progress))
        .route("/adjust", put(adjust_plan))
}

async fn get_current_plan(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let plan = select_plan(proxy.as_ref(), &user.id).await?;
    let Some(plan) = plan else {
        return Ok(Json(SuccessResponse::<Option<LearningPlanResponse>> {
            success: true,
            data: None,
            message: Some("暂无学习计划，请先生成计划".to_string()),
        }));
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: Some(map_plan_response(&plan, true)),
        message: None,
    }))
}

async fn generate_plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<GeneratePlanRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    if let Some(target_days) = payload.target_days {
        if !(1..=365).contains(&target_days) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "目标天数必须是1-365之间的整数",
            ));
        }
    }

    if let Some(daily_target) = payload.daily_target {
        if !(1..=200).contains(&daily_target) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "每日目标必须是1-200之间的整数",
            ));
        }
    }

    if let Some(ref wordbook_ids) = payload.wordbook_ids {
        if wordbook_ids.len() > 50 {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "wordbookIds数组长度不能超过50",
            ));
        }
        if wordbook_ids.iter().any(|id| id.trim().is_empty()) {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "wordbookIds数组元素必须是非空字符串",
            ));
        }
    }

    let plan = generate_plan_internal(proxy.as_ref(), &user.id, payload).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: map_plan_response(&plan, true),
        message: Some("学习计划已生成".to_string()),
    }))
}

async fn get_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let progress = update_plan_progress_internal(proxy.as_ref(), &user.id).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: progress,
        message: None,
    }))
}

async fn adjust_plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AdjustPlanRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let reason = payload.reason.unwrap_or_else(|| "用户手动调整".to_string());
    let plan = adjust_plan_internal(proxy.as_ref(), &user.id, &reason).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: map_plan_response(&plan, false),
        message: Some("学习计划已调整".to_string()),
    }))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<
    (
        std::sync::Arc<crate::db::DatabaseProxy>,
        crate::auth::AuthUser,
    ),
    AppError,
> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(&proxy, &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    Ok((proxy, user))
}

fn format_naive_datetime(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_datetime_millis(value: &str) -> Option<i64> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Some(parsed.timestamp_millis());
    }
    if let Ok(parsed) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(parsed, Utc).timestamp_millis());
    }
    None
}

fn normalize_datetime_str(value: &str) -> String {
    if let Some(ms) = parse_datetime_millis(value) {
        if let Some(dt) = DateTime::<Utc>::from_timestamp_millis(ms) {
            return dt.to_rfc3339_opts(SecondsFormat::Millis, true);
        }
    }
    value.to_string()
}

#[derive(Debug, Clone)]
struct WordbookRow {
    id: String,
    name: String,
    word_count: i64,
}

#[derive(Debug, Clone)]
struct LearningPlanRow {
    id: String,
    user_id: String,
    daily_target: i64,
    total_words: i64,
    estimated_completion_date: String,
    wordbook_distribution: Vec<WordbookAllocation>,
    weekly_milestones: Vec<WeeklyMilestone>,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

fn map_plan_response(plan: &LearningPlanRow, include_created_at: bool) -> LearningPlanResponse {
    LearningPlanResponse {
        id: plan.id.clone(),
        daily_target: plan.daily_target,
        total_words: plan.total_words,
        estimated_completion_date: plan.estimated_completion_date.clone(),
        wordbook_distribution: plan.wordbook_distribution.clone(),
        weekly_milestones: plan.weekly_milestones.clone(),
        is_active: plan.is_active,
        created_at: include_created_at.then_some(plan.created_at.clone()),
        updated_at: plan.updated_at.clone(),
    }
}

async fn generate_plan_internal(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    payload: GeneratePlanRequest,
) -> Result<LearningPlanRow, AppError> {
    let study = study_config::get_or_create_user_study_config(proxy, user_id)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut requested_wordbooks: Vec<String> = payload
        .wordbook_ids
        .unwrap_or_else(|| study.selected_word_book_ids.clone());
    requested_wordbooks.retain(|id| !id.trim().is_empty());

    let wordbooks = select_wordbooks(proxy, user_id, &requested_wordbooks).await?;
    if !requested_wordbooks.is_empty() && wordbooks.len() != requested_wordbooks.len() {
        let found: HashSet<&str> = wordbooks.iter().map(|wb| wb.id.as_str()).collect();
        let unauthorized: Vec<String> = requested_wordbooks
            .iter()
            .filter(|id| !found.contains(id.as_str()))
            .cloned()
            .collect();
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            format!("无权访问以下词书: {}", unauthorized.join(", ")),
        ));
    }

    let total_words: i64 = wordbooks.iter().map(|wb| wb.word_count).sum();

    if total_words == 0 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "所选词书中没有单词",
        ));
    }

    let (daily_target, days_to_complete) = if let Some(target_days) = payload.target_days {
        let days = target_days.max(1);
        let daily = payload
            .daily_target
            .unwrap_or_else(|| ((total_words + days - 1) / days).max(1));
        let computed_days = ((total_words + daily - 1) / daily).max(1);
        (daily, computed_days)
    } else {
        let daily = payload.daily_target.unwrap_or(20).max(1);
        let days = ((total_words + daily - 1) / daily).max(1);
        (daily, days)
    };

    let estimated_completion_date = Utc::now() + Duration::days(days_to_complete);
    let estimated_completion_iso =
        estimated_completion_date.to_rfc3339_opts(SecondsFormat::Millis, true);

    let distribution = calculate_wordbook_distribution(&wordbooks);
    let milestones = generate_weekly_milestones(total_words, daily_target, days_to_complete);

    upsert_plan(
        proxy,
        user_id,
        daily_target,
        total_words,
        &estimated_completion_iso,
        &distribution,
        &milestones,
    )
    .await
}

fn calculate_wordbook_distribution(wordbooks: &[WordbookRow]) -> Vec<WordbookAllocation> {
    if wordbooks.is_empty() {
        return Vec::new();
    }

    let mut sorted = wordbooks.to_vec();
    sorted.sort_by(|a, b| b.word_count.cmp(&a.word_count));

    let n = sorted.len() as i64;
    let total_weight: i64 = (1..=n).sum();

    #[derive(Clone)]
    struct Temp {
        id: String,
        name: String,
        priority: i64,
        floor_percentage: i64,
        remainder: f64,
    }

    let mut items: Vec<Temp> = Vec::new();
    for (idx, wb) in sorted.iter().enumerate() {
        let priority = (idx + 1) as i64;
        let weight = n - (idx as i64);
        let exact = (weight as f64 / total_weight as f64) * 100.0;
        let floor = exact.floor() as i64;
        items.push(Temp {
            id: wb.id.clone(),
            name: wb.name.clone(),
            priority,
            floor_percentage: floor,
            remainder: exact - floor as f64,
        });
    }

    let floor_sum: i64 = items.iter().map(|x| x.floor_percentage).sum();
    let mut remaining = 100 - floor_sum;

    let mut by_remainder = items.clone();
    by_remainder.sort_by(|a, b| {
        b.remainder
            .partial_cmp(&a.remainder)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for item in by_remainder.iter_mut() {
        if remaining <= 0 {
            break;
        }
        item.floor_percentage += 1;
        remaining -= 1;
    }

    let mut remap: HashMap<&str, i64> = HashMap::new();
    for item in &by_remainder {
        remap.insert(item.id.as_str(), item.floor_percentage);
    }

    items
        .into_iter()
        .map(|item| {
            let percentage = *remap
                .get(item.id.as_str())
                .unwrap_or(&item.floor_percentage);
            WordbookAllocation {
                wordbook_id: item.id,
                wordbook_name: Some(item.name),
                percentage,
                priority: item.priority,
            }
        })
        .collect()
}

fn generate_weekly_milestones(
    total_words: i64,
    daily_target: i64,
    total_days: i64,
) -> Vec<WeeklyMilestone> {
    let total_weeks = ((total_days + 6) / 7).max(1);
    let weekly_target = daily_target * 7;
    let mut milestones: Vec<WeeklyMilestone> = Vec::new();

    let mut cumulative = 0_i64;
    for week in 1..=total_weeks {
        cumulative = (cumulative + weekly_target).min(total_words);
        let description = if week == 1 {
            "开始学习之旅".to_string()
        } else if week == total_weeks {
            "完成所有单词学习".to_string()
        } else if (cumulative as f64) >= (total_words as f64 * 0.5)
            && ((cumulative - weekly_target) as f64) < (total_words as f64 * 0.5)
        {
            "完成一半进度".to_string()
        } else {
            format!("累计学习{cumulative}个单词")
        };

        milestones.push(WeeklyMilestone {
            week,
            target: cumulative,
            description,
            completed: Some(false),
        });
    }
    milestones
}

async fn update_plan_progress_internal(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<PlanProgressResponse, AppError> {
    let plan = select_plan(proxy, user_id).await?;
    let Some(plan) = plan else {
        return Ok(PlanProgressResponse {
            completed_today: 0,
            target_today: 20,
            weekly_progress: 0.0,
            overall_progress: 0.0,
            on_track: true,
            deviation: 0.0,
            status: "按计划进行中".to_string(),
        });
    };

    let (completed_today, weekly_completed, total_completed) =
        fetch_progress_metrics(proxy, user_id).await?;

    let weekly_target = plan.daily_target * 7;
    let weekly_progress = if weekly_target > 0 {
        ((weekly_completed as f64) / (weekly_target as f64) * 100.0).min(100.0)
    } else {
        0.0
    };

    let overall_progress = if plan.total_words > 0 {
        ((total_completed as f64) / (plan.total_words as f64) * 100.0).min(100.0)
    } else {
        0.0
    };

    let now_ms = Utc::now().timestamp_millis();
    let created_ms = parse_datetime_millis(&plan.created_at).unwrap_or(now_ms);
    let days_since_start = ((now_ms - created_ms) / 86_400_000).max(0);
    let expected_progress = days_since_start * plan.daily_target;
    let deviation = if expected_progress > 0 {
        (total_completed as f64 - expected_progress as f64) / expected_progress as f64
    } else {
        0.0
    };

    let on_track = deviation.abs() <= 0.2;
    if !on_track {
        let reason = format!("偏差{:.1}%", deviation * 100.0);
        let _ = adjust_plan_internal(proxy, user_id, &reason).await;
    }

    let status = if on_track {
        "按计划进行中".to_string()
    } else if deviation > 0.0 {
        "进度超前".to_string()
    } else {
        "进度落后".to_string()
    };

    Ok(PlanProgressResponse {
        completed_today,
        target_today: plan.daily_target,
        weekly_progress: (weekly_progress * 100.0).round() / 100.0,
        overall_progress: (overall_progress * 100.0).round() / 100.0,
        on_track,
        deviation: (deviation * 1000.0).round() / 1000.0,
        status,
    })
}

async fn adjust_plan_internal(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    _reason: &str,
) -> Result<LearningPlanRow, AppError> {
    let plan = select_plan(proxy, user_id).await?;
    let Some(plan) = plan else {
        return generate_plan_internal(
            proxy,
            user_id,
            GeneratePlanRequest {
                target_days: None,
                daily_target: None,
                wordbook_ids: None,
            },
        )
        .await;
    };

    let pool = proxy.pool();
    let total_completed = count_learned_words(pool, user_id).await?;
    let now = Utc::now();
    let est_ms =
        parse_datetime_millis(&plan.estimated_completion_date).unwrap_or(now.timestamp_millis());
    let remaining_days = (((est_ms - now.timestamp_millis()) as f64) / 86_400_000.0)
        .ceil()
        .max(1.0) as i64;

    let remaining_words = (plan.total_words - total_completed).max(0);
    let mut new_daily_target = ((remaining_words + remaining_days - 1) / remaining_days).max(1);
    let min_target = (plan.daily_target as f64 * 0.5).floor() as i64;
    let max_target = (plan.daily_target as f64 * 1.5).ceil() as i64;
    new_daily_target = new_daily_target.clamp(min_target, max_target);

    update_plan_daily_target(proxy, user_id, new_daily_target).await?;
    let updated = select_plan(proxy, user_id).await?;
    updated.ok_or_else(|| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))
}

async fn fetch_progress_metrics(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<(i64, i64, i64), AppError> {
    let pool = proxy.pool();
    let today = Utc::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
    let tomorrow = today + Duration::days(1);

    let weekday = Utc::now().weekday().num_days_from_sunday() as i64;
    let week_start = today - Duration::days(weekday);

    let completed_today: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM "answer_records"
        WHERE "userId" = $1 AND "timestamp" >= $2 AND "timestamp" < $3 AND "isCorrect" = true
        "#,
    )
    .bind(user_id)
    .bind(today)
    .bind(tomorrow)
    .fetch_one(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let weekly_completed: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM "answer_records"
        WHERE "userId" = $1 AND "timestamp" >= $2 AND "isCorrect" = true
        "#,
    )
    .bind(user_id)
    .bind(week_start)
    .fetch_one(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let total_completed = count_learned_words(pool, user_id).await?;

    Ok((completed_today, weekly_completed, total_completed))
}

async fn count_learned_words(pool: &PgPool, user_id: &str) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM "word_learning_states"
        WHERE "userId" = $1 AND "state" IN ('LEARNING','REVIEWING','MASTERED')
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(count)
}

async fn select_plan(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<LearningPlanRow>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "id","userId","dailyTarget","totalWords","estimatedCompletionDate",
               "wordbookDistribution","weeklyMilestones","isActive","createdAt","updatedAt"
        FROM "learning_plans"
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    let Some(row) = row else { return Ok(None) };

    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let estimated: NaiveDateTime = row
        .try_get("estimatedCompletionDate")
        .unwrap_or_else(|_| Utc::now().naive_utc());

    let wordbook_distribution = row
        .try_get::<serde_json::Value, _>("wordbookDistribution")
        .ok()
        .and_then(|v| serde_json::from_value::<Vec<WordbookAllocation>>(v).ok())
        .unwrap_or_default();
    let weekly_milestones = row
        .try_get::<serde_json::Value, _>("weeklyMilestones")
        .ok()
        .and_then(|v| serde_json::from_value::<Vec<WeeklyMilestone>>(v).ok())
        .unwrap_or_default();

    Ok(Some(LearningPlanRow {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        daily_target: row.try_get::<i64, _>("dailyTarget").unwrap_or(20),
        total_words: row.try_get::<i64, _>("totalWords").unwrap_or(0),
        estimated_completion_date: format_naive_datetime(estimated),
        wordbook_distribution,
        weekly_milestones,
        is_active: row.try_get::<bool, _>("isActive").unwrap_or(true),
        created_at: format_naive_datetime(created_at),
        updated_at: format_naive_datetime(updated_at),
    }))
}

async fn upsert_plan(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    daily_target: i64,
    total_words: i64,
    estimated_completion_date: &str,
    distribution: &[WordbookAllocation],
    milestones: &[WeeklyMilestone],
) -> Result<LearningPlanRow, AppError> {
    let existing = select_plan(proxy, user_id).await?;

    let id = existing
        .as_ref()
        .map(|p| p.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    let estimated_dt = DateTime::parse_from_rfc3339(estimated_completion_date)
        .ok()
        .map(|dt| dt.naive_utc())
        .unwrap_or(now);

    sqlx::query(
        r#"
        INSERT INTO "learning_plans"
          ("id","userId","dailyTarget","totalWords","estimatedCompletionDate","wordbookDistribution","weeklyMilestones","isActive","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
        ON CONFLICT ("userId") DO UPDATE SET
          "dailyTarget" = EXCLUDED."dailyTarget",
          "totalWords" = EXCLUDED."totalWords",
          "estimatedCompletionDate" = EXCLUDED."estimatedCompletionDate",
          "wordbookDistribution" = EXCLUDED."wordbookDistribution",
          "weeklyMilestones" = EXCLUDED."weeklyMilestones",
          "isActive" = true,
          "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(daily_target as i32)
    .bind(total_words as i32)
    .bind(estimated_dt)
    .bind(serde_json::to_value(distribution).unwrap_or_else(|_| serde_json::Value::Array(Vec::new())))
    .bind(serde_json::to_value(milestones).unwrap_or_else(|_| serde_json::Value::Array(Vec::new())))
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    select_plan(proxy, user_id)
        .await?
        .ok_or_else(|| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))
}

async fn update_plan_daily_target(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    daily_target: i64,
) -> Result<(), AppError> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "learning_plans"
        SET "dailyTarget" = $1, "updatedAt" = $2
        WHERE "userId" = $3
        "#,
    )
    .bind(daily_target as i32)
    .bind(now)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;
    Ok(())
}

async fn select_wordbooks(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    wordbook_ids: &[String],
) -> Result<Vec<WordbookRow>, AppError> {
    if wordbook_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "id","name","wordCount"
        FROM "word_books"
        WHERE "id" IN (
        "#,
    );
    {
        let mut sep = qb.separated(", ");
        for id in wordbook_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    qb.push(r#" AND ("type" = 'SYSTEM' OR "userId" = "#);
    qb.push_bind(user_id);
    qb.push(")");

    let rows = qb
        .build()
        .fetch_all(pool)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(rows
        .into_iter()
        .map(|row| WordbookRow {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            word_count: row.try_get::<i64, _>("wordCount").unwrap_or(0),
        })
        .collect())
}
