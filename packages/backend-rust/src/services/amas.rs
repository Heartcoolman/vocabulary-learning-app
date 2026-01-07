use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::amas::types::{
    ColdStartPhase, ProcessOptions, RawEvent,
    StrategyParams as AmasStrategyParams, UserState,
};
use crate::db::DatabaseProxy;

// ========== Legacy types for backward compatibility ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyParams {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: String,
    pub batch_size: i32,
    pub hint_level: i32,
}

impl StrategyParams {
    pub fn default_strategy() -> Self {
        Self { interval_scale: 1.0, new_ratio: 0.2, difficulty: "mid".to_string(), batch_size: 8, hint_level: 1 }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DifficultyRange {
    pub min: f64,
    pub max: f64,
}

pub fn map_difficulty_level(level: &str) -> DifficultyRange {
    match level {
        "easy" => DifficultyRange { min: 0.0, max: 0.4 },
        "mid" => DifficultyRange { min: 0.2, max: 0.7 },
        "hard" => DifficultyRange { min: 0.5, max: 1.0 },
        _ => DifficultyRange { min: 0.2, max: 0.7 },
    }
}

pub fn compute_new_word_difficulty(spelling: &str, meaning_count: usize) -> f64 {
    let length_factor = (spelling.chars().count() as f64 / 15.0).min(1.0);
    let meaning_factor = (meaning_count as f64 / 5.0).min(1.0);
    length_factor * 0.6 + meaning_factor * 0.4
}

// ========== Service types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyResponse {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: String,
    pub batch_size: i32,
    pub hint_level: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveResponse {
    pub mem: f64,
    pub speed: f64,
    pub stability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateResponse {
    #[serde(rename = "A")]
    pub attention: f64,
    #[serde(rename = "F")]
    pub fatigue: f64,
    #[serde(rename = "M")]
    pub motivation: f64,
    #[serde(rename = "C")]
    pub cognitive: CognitiveResponse,
    pub conf: f64,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactorResponse {
    pub name: String,
    pub value: f64,
    pub impact: String,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationResponse {
    pub factors: Vec<FactorResponse>,
    pub changes: Vec<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordMasteryResponse {
    pub word_id: String,
    pub prev_mastery: f64,
    pub new_mastery: f64,
    pub prev_interval: f64,
    pub new_interval: f64,
    pub quality: i32,
    pub stability: f64,
    pub difficulty: f64,
    pub retrievability: f64,
    pub is_mastered: bool,
    pub lapses: i32,
    pub reps: i32,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardResponse {
    pub value: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEventResult {
    pub session_id: String,
    pub strategy: StrategyResponse,
    pub explanation: ExplanationResponse,
    pub state: StateResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_mastery_decision: Option<WordMasteryResponse>,
    pub reward: RewardResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cold_start_phase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProcessResult {
    pub processed_count: usize,
    pub final_state: StateResponse,
    pub final_strategy: StrategyResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningCurvePoint {
    pub date: String,
    pub mastery: f64,
    pub attention: f64,
    pub fatigue: f64,
    pub motivation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningCurveResult {
    pub points: Vec<LearningCurvePoint>,
    pub trend: String,
    pub current_mastery: f64,
    pub average_attention: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseResult {
    pub phase: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterventionResult {
    pub needs_intervention: bool,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelayedRewardsResult {
    pub items: Vec<serde_json::Value>,
    pub count: usize,
}

#[derive(Debug, Clone)]
pub struct TrendHistoryPoint {
    pub trend_state: Option<String>,
    pub motivation: f64,
    pub memory: f64,
    pub speed: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEventInput {
    pub word_id: String,
    pub is_correct: bool,
    pub response_time: i64,
    pub session_id: Option<String>,
    pub dwell_time: Option<i64>,
    pub pause_count: Option<i32>,
    pub switch_count: Option<i32>,
    pub retry_count: Option<i32>,
    pub focus_loss_duration: Option<i64>,
    pub interaction_density: Option<f64>,
    pub paused_time_ms: Option<i64>,
    pub hint_used: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchEventItem {
    pub word_id: String,
    pub is_correct: bool,
    pub response_time: i64,
    pub timestamp: i64,
}

pub struct AMASService;

impl AMASService {
    pub fn strategy_to_response(s: &AmasStrategyParams) -> StrategyResponse {
        StrategyResponse {
            interval_scale: s.interval_scale,
            new_ratio: s.new_ratio,
            difficulty: s.difficulty.as_str().to_string(),
            batch_size: s.batch_size,
            hint_level: s.hint_level,
        }
    }

    pub fn state_to_response(s: &UserState) -> StateResponse {
        StateResponse {
            attention: s.attention,
            fatigue: s.fatigue,
            motivation: s.motivation,
            cognitive: CognitiveResponse {
                mem: s.cognitive.mem,
                speed: s.cognitive.speed,
                stability: s.cognitive.stability,
            },
            conf: s.conf,
            ts: s.ts,
        }
    }

    pub fn cold_start_phase_to_string(phase: ColdStartPhase) -> String {
        match phase {
            ColdStartPhase::Classify => "classify".to_string(),
            ColdStartPhase::Explore => "explore".to_string(),
            ColdStartPhase::Normal => "normal".to_string(),
        }
    }
}

// ========== process_event ==========
pub async fn process_event(
    engine: &crate::amas::AMASEngine,
    user_id: &str,
    input: ProcessEventInput,
    session_id: String,
) -> Result<ProcessEventResult, String> {
    let raw_event = RawEvent {
        word_id: Some(input.word_id),
        is_correct: input.is_correct,
        response_time: input.response_time,
        dwell_time: input.dwell_time,
        pause_count: input.pause_count.unwrap_or(0),
        switch_count: input.switch_count.unwrap_or(0),
        retry_count: input.retry_count.unwrap_or(0),
        focus_loss_duration: input.focus_loss_duration,
        interaction_density: input.interaction_density,
        paused_time_ms: input.paused_time_ms,
        hint_used: input.hint_used.unwrap_or(false),
        timestamp: Utc::now().timestamp_millis(),
        ..Default::default()
    };

    let options = ProcessOptions::default();
    let result = engine.process_event(user_id, raw_event, options).await?;

    Ok(ProcessEventResult {
        session_id,
        strategy: AMASService::strategy_to_response(&result.strategy),
        explanation: ExplanationResponse {
            factors: result.explanation.factors.iter().map(|f| FactorResponse {
                name: f.name.clone(),
                value: f.value,
                impact: f.impact.clone(),
                percentage: f.percentage,
            }).collect(),
            changes: result.explanation.changes.clone(),
            text: result.explanation.text.clone(),
        },
        state: AMASService::state_to_response(&result.state),
        word_mastery_decision: result.word_mastery_decision.map(|w| WordMasteryResponse {
            word_id: w.word_id,
            prev_mastery: w.prev_mastery,
            new_mastery: w.new_mastery,
            prev_interval: w.prev_interval,
            new_interval: w.new_interval,
            quality: w.quality,
            stability: w.stability,
            difficulty: w.difficulty,
            retrievability: w.retrievability,
            is_mastered: w.is_mastered,
            lapses: w.lapses,
            reps: w.reps,
            confidence: w.confidence,
        }),
        reward: RewardResponse {
            value: result.reward.value,
            reason: result.reward.reason.clone(),
        },
        cold_start_phase: result.cold_start_phase.map(AMASService::cold_start_phase_to_string),
    })
}

// ========== batch_process ==========
pub async fn batch_process(
    engine: &crate::amas::AMASEngine,
    user_id: &str,
    events: Vec<BatchEventItem>,
) -> Result<BatchProcessResult, String> {
    let mut final_state = None;
    let mut final_strategy = None;

    for event in &events {
        let raw_event = RawEvent {
            word_id: Some(event.word_id.clone()),
            is_correct: event.is_correct,
            response_time: event.response_time,
            timestamp: event.timestamp,
            ..Default::default()
        };

        let options = ProcessOptions {
            skip_update: Some(false),
            ..Default::default()
        };

        if let Ok(result) = engine.process_event(user_id, raw_event, options).await {
            final_state = Some(result.state);
            final_strategy = Some(result.strategy);
        }
    }

    let final_state = final_state.unwrap_or_default();
    let final_strategy = final_strategy.unwrap_or_default();

    Ok(BatchProcessResult {
        processed_count: events.len(),
        final_state: AMASService::state_to_response(&final_state),
        final_strategy: AMASService::strategy_to_response(&final_strategy),
    })
}

// ========== get_state ==========
pub async fn get_state(
    engine: &crate::amas::AMASEngine,
    user_id: &str,
) -> Option<StateResponse> {
    engine.get_user_state(user_id).await.map(|s| AMASService::state_to_response(&s))
}

// ========== get_strategy ==========
pub async fn get_strategy(
    engine: &crate::amas::AMASEngine,
    user_id: &str,
) -> StrategyResponse {
    let strategy = engine.get_current_strategy(user_id).await;
    AMASService::strategy_to_response(&strategy)
}

// ========== get_delayed_rewards ==========
pub fn get_delayed_rewards() -> DelayedRewardsResult {
    DelayedRewardsResult { items: vec![], count: 0 }
}

// ========== get_learning_curve ==========
pub async fn get_learning_curve(
    proxy: &DatabaseProxy,
    user_id: &str,
    days: i32,
) -> Result<LearningCurveResult, String> {
    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(days as i64);

    let pool = proxy.pool();
    let points = select_learning_curve_pg(&pool, user_id, start_date).await?;

    let mastery_values: Vec<f64> = points.iter().map(|p| p.mastery).collect();
    let trend = compute_mastery_trend(&mastery_values);
    let current_mastery = points.last().map(|p| p.mastery).unwrap_or(0.0);
    let average_attention = if points.is_empty() {
        0.0
    } else {
        points.iter().map(|p| p.attention).sum::<f64>() / points.len() as f64
    };

    Ok(LearningCurveResult { points, trend, current_mastery, average_attention })
}

async fn select_learning_curve_pg(
    pool: &PgPool,
    user_id: &str,
    start_date: NaiveDate,
) -> Result<Vec<LearningCurvePoint>, String> {
    let rows = sqlx::query(
        r#"SELECT "date", "attention", "fatigue", "motivation", "memory"
           FROM "user_state_history" WHERE "userId" = $1 AND "date" >= $2 ORDER BY "date" ASC"#,
    )
    .bind(user_id)
    .bind(start_date)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("数据库查询失败: {e}"))?;

    let mut points = Vec::with_capacity(rows.len());
    for row in rows {
        let date: NaiveDate = row.try_get("date").map_err(|e| format!("解析失败: {e}"))?;
        let attention: f64 = row.try_get("attention").unwrap_or(0.0);
        let fatigue: f64 = row.try_get("fatigue").unwrap_or(0.0);
        let motivation: f64 = row.try_get("motivation").unwrap_or(0.0);
        let memory: f64 = row.try_get("memory").unwrap_or(0.0);
        points.push(LearningCurvePoint {
            date: format!("{}T00:00:00.000Z", date.format("%Y-%m-%d")),
            mastery: memory * 100.0,
            attention, fatigue, motivation,
        });
    }
    Ok(points)
}

fn compute_mastery_trend(values: &[f64]) -> String {
    if values.len() < 2 { return "flat".to_string(); }
    let delta = values[values.len() - 1] - values[0];
    if delta > 5.0 { return "up".to_string(); }
    if delta < -5.0 { return "down".to_string(); }
    "flat".to_string()
}

// ========== get_phase ==========
pub async fn get_phase(proxy: &DatabaseProxy, user_id: &str) -> Result<PhaseResult, String> {
    let pool = proxy.pool();
    let phase = match load_cold_start_phase(&pool, user_id).await? {
        Some(p) => p,
        None => infer_phase_from_interactions(&pool, user_id).await?,
    };
    Ok(PhaseResult { description: phase_description(&phase).to_string(), phase })
}

async fn load_cold_start_phase(pool: &PgPool, user_id: &str) -> Result<Option<String>, String> {
    let row = sqlx::query(r#"SELECT "coldStartState" FROM "amas_user_states" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("查询失败: {e}"))?;
    let Some(row) = row else { return Ok(None) };
    let value: Option<serde_json::Value> = row.try_get("coldStartState").ok();
    Ok(extract_phase_from_json(value.as_ref()))
}

fn extract_phase_from_json(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    match value {
        serde_json::Value::String(p) => normalize_phase(p).map(|v| v.to_string()),
        serde_json::Value::Object(m) => m.get("phase")
            .and_then(|p| p.as_str())
            .and_then(normalize_phase)
            .map(|v| v.to_string()),
        _ => None,
    }
}

fn normalize_phase(phase: &str) -> Option<&'static str> {
    match phase {
        "classify" => Some("classify"),
        "explore" => Some("explore"),
        "normal" => Some("normal"),
        _ => None,
    }
}

fn phase_description(phase: &str) -> &'static str {
    match phase {
        "classify" => "分类阶段：正在了解你的学习特点",
        "explore" => "探索阶段：正在尝试不同的学习策略",
        "normal" => "正常运行：已为你定制最优学习策略",
        _ => "未知阶段",
    }
}

async fn infer_phase_from_interactions(pool: &PgPool, user_id: &str) -> Result<String, String> {
    let count = count_recent_interactions(pool, user_id).await?;
    if count < 5 { return Ok("classify".to_string()); }
    if count < 8 { return Ok("explore".to_string()); }
    Ok("normal".to_string())
}

async fn count_recent_interactions(pool: &PgPool, user_id: &str) -> Result<i64, String> {
    sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(1) FROM (SELECT 1 FROM "answer_records" WHERE "userId" = $1 LIMIT 8) AS t"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))
}

// ========== get_trend_intervention ==========
pub async fn get_trend_intervention(proxy: &DatabaseProxy, user_id: &str) -> Result<InterventionResult, String> {
    let pool = proxy.pool();
    let (trend_state, consecutive_days) = load_current_trend(&pool, user_id).await?;
    Ok(compute_intervention(&trend_state, consecutive_days))
}

async fn load_current_trend(pool: &PgPool, user_id: &str) -> Result<(String, i64), String> {
    let trend_state: Option<String> = sqlx::query_scalar(
        r#"SELECT "trendState" FROM "amas_user_states" WHERE "userId" = $1"#,
    ).bind(user_id).fetch_optional(pool).await.map_err(|e| format!("查询失败: {e}"))?;

    let rows = sqlx::query(
        r#"SELECT "trendState", "motivation", "memory", "speed" FROM "user_state_history"
           WHERE "userId" = $1 ORDER BY "date" DESC LIMIT 30"#,
    ).bind(user_id).fetch_all(pool).await.map_err(|e| format!("查询失败: {e}"))?;

    let history: Vec<TrendHistoryPoint> = rows.iter().map(|row| TrendHistoryPoint {
        trend_state: row.try_get("trendState").ok(),
        motivation: row.try_get("motivation").unwrap_or(0.0),
        memory: row.try_get("memory").unwrap_or(0.0),
        speed: row.try_get("speed").unwrap_or(0.0),
    }).collect();

    let state = trend_state.as_deref()
        .and_then(normalize_trend_state)
        .map(|v| v.to_string())
        .unwrap_or_else(|| calculate_trend_from_history(&history));
    let consecutive_days = calculate_consecutive_days(&history, &state);
    Ok((state, consecutive_days))
}

fn normalize_trend_state(value: &str) -> Option<&'static str> {
    match value { "up" => Some("up"), "flat" => Some("flat"), "stuck" => Some("stuck"), "down" => Some("down"), _ => None }
}

fn calculate_trend_from_history(history: &[TrendHistoryPoint]) -> String {
    if history.len() < 2 { return "flat".to_string(); }
    let recent: Vec<_> = history.iter().take(7).collect();
    let previous: Vec<_> = history.iter().skip(7).take(7).collect();
    if previous.is_empty() { return "flat".to_string(); }

    let avg = |items: &[&TrendHistoryPoint]| -> f64 {
        items.iter().map(|i| (i.motivation + i.memory + i.speed) / 3.0).sum::<f64>() / items.len() as f64
    };
    let (recent_avg, previous_avg) = (avg(&recent), avg(&previous));
    let change = (recent_avg - previous_avg) / if previous_avg == 0.0 { 1.0 } else { previous_avg };

    if change > 0.1 { "up".to_string() }
    else if change < -0.1 { "down".to_string() }
    else if change.abs() < 0.05 { "flat".to_string() }
    else { "stuck".to_string() }
}

fn calculate_consecutive_days(history: &[TrendHistoryPoint], current_state: &str) -> i64 {
    if history.is_empty() { return 1; }
    let mut count = 0i64;
    for item in history {
        if item.trend_state.as_deref() == Some(current_state) { count += 1; } else { break; }
    }
    if count > 0 { count } else { 1 }
}

fn compute_intervention(trend_state: &str, consecutive_days: i64) -> InterventionResult {
    if matches!(trend_state, "up" | "flat") {
        return InterventionResult { needs_intervention: false, kind: None, message: None, actions: None };
    }
    if trend_state == "down" {
        if consecutive_days > 3 {
            return InterventionResult {
                needs_intervention: true,
                kind: Some("warning".to_string()),
                message: Some(format!("您的学习状态已连续{consecutive_days}天下降，建议调整学习计划")),
                actions: Some(vec![
                    "减少每日学习量".into(), "选择更简单的词书".into(),
                    "调整学习时间到黄金时段".into(), "休息一天后再继续".into(),
                ]),
            };
        }
        return InterventionResult {
            needs_intervention: true,
            kind: Some("suggestion".to_string()),
            message: Some("您的学习状态有所下降，建议适当调整".to_string()),
            actions: Some(vec!["尝试在精力充沛时学习".into(), "减少单次学习时长".into(), "增加复习比例".into()]),
        };
    }
    InterventionResult {
        needs_intervention: true,
        kind: Some("encouragement".to_string()),
        message: Some("您的学习进入了平台期，这是正常现象".to_string()),
        actions: Some(vec!["尝试新的学习方法".into(), "挑战更难的单词".into(), "设定小目标激励自己".into()]),
    }
}

// ========== reset_user ==========
pub async fn reset_user(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<(), String> {
    let now = Utc::now().naive_utc();
    let now_ms = Utc::now().timestamp_millis();
    let state_id = uuid::Uuid::new_v4().to_string();
    let model_id = uuid::Uuid::new_v4().to_string();
    let default_cognitive = serde_json::json!({ "mem": 0.5, "speed": 0.5, "stability": 0.5 });
    let default_model = serde_json::json!({});

    let pool = proxy.pool();
    sqlx::query(
        r#"INSERT INTO "amas_user_states" ("id","userId","attention","fatigue","motivation","confidence",
           "cognitiveProfile","habitProfile","trendState","coldStartState","lastUpdateTs","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT ("userId") DO UPDATE SET "attention"=EXCLUDED."attention","fatigue"=EXCLUDED."fatigue",
           "motivation"=EXCLUDED."motivation","confidence"=EXCLUDED."confidence","cognitiveProfile"=EXCLUDED."cognitiveProfile",
           "habitProfile"=EXCLUDED."habitProfile","trendState"=EXCLUDED."trendState","coldStartState"=EXCLUDED."coldStartState",
           "lastUpdateTs"=EXCLUDED."lastUpdateTs","updatedAt"=EXCLUDED."updatedAt""#,
    )
    .bind(&state_id).bind(user_id).bind(0.7f64).bind(0.0f64).bind(0.0f64).bind(0.5f64)
    .bind(&default_cognitive).bind(Option::<serde_json::Value>::None)
    .bind(Option::<String>::None).bind(Option::<serde_json::Value>::None)
    .bind(now_ms).bind(now)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    sqlx::query(
        r#"INSERT INTO "amas_user_models" ("id","userId","modelData","updatedAt") VALUES ($1,$2,$3,$4)
           ON CONFLICT ("userId") DO UPDATE SET "modelData"=EXCLUDED."modelData","updatedAt"=EXCLUDED."updatedAt""#,
    )
    .bind(&model_id).bind(user_id).bind(&default_model).bind(now)
    .execute(pool).await.map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}
