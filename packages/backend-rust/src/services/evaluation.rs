use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CausalObservationInput {
    pub user_id: Option<String>,
    pub features: Vec<f64>,
    pub treatment: i32,
    pub outcome: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CausalObservationRecord {
    pub id: String,
    pub user_id: Option<String>,
    pub features: Vec<f64>,
    pub treatment: i32,
    pub outcome: f64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CausalEstimate {
    pub ate: f64,
    pub ate_se: f64,
    pub confidence_interval: (f64, f64),
    pub p_value: f64,
    pub sample_size: i64,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyComparison {
    pub strategy_a: String,
    pub strategy_b: String,
    pub effect_difference: f64,
    pub is_significant: bool,
    pub confidence_level: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryEvaluation {
    pub word_id: String,
    pub score: f64,
    pub recall_probability: f64,
    pub stability: f64,
    pub confidence: f64,
    pub is_mastered: bool,
    pub needs_review: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatorConfig {
    pub srs_weight: f64,
    pub accuracy_weight: f64,
    pub actr_weight: f64,
    pub threshold: f64,
    pub fatigue_impact: f64,
}

impl Default for EvaluatorConfig {
    fn default() -> Self {
        Self {
            srs_weight: 0.3,
            accuracy_weight: 0.3,
            actr_weight: 0.4,
            threshold: 0.7,
            fatigue_impact: 0.1,
        }
    }
}

pub async fn add_observation(
    proxy: &DatabaseProxy,
    input: CausalObservationInput,
) -> Result<CausalObservationRecord, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = Utc::now().timestamp_millis();
    let pool = proxy.pool();

    sqlx::query(
        r#"INSERT INTO "causal_observations" ("id","userId","features","treatment","outcome","timestamp")
           VALUES ($1,$2,$3,$4,$5,$6)"#,
    )
    .bind(&id)
    .bind(&input.user_id)
    .bind(&input.features)
    .bind(input.treatment)
    .bind(input.outcome)
    .bind(timestamp)
    .execute(pool)
    .await
    .map_err(|e| format!("写入失败: {e}"))?;

    Ok(CausalObservationRecord {
        id,
        user_id: input.user_id,
        features: input.features,
        treatment: input.treatment,
        outcome: input.outcome,
        timestamp,
    })
}

pub async fn get_observations(
    pool: &PgPool,
    limit: i32,
) -> Result<Vec<CausalObservationRecord>, String> {
    let rows = sqlx::query(
        r#"SELECT "id", "userId", "features", "treatment", "outcome", "timestamp"
           FROM "causal_observations" ORDER BY "timestamp" DESC LIMIT $1"#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    Ok(rows.iter().map(|row| CausalObservationRecord {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").ok(),
        features: row.try_get::<Vec<f64>, _>("features").unwrap_or_default(),
        treatment: row.try_get("treatment").unwrap_or(0),
        outcome: row.try_get("outcome").unwrap_or(0.0),
        timestamp: row.try_get("timestamp").unwrap_or(0),
    }).collect())
}

pub async fn estimate_strategy_effect(pool: &PgPool) -> Result<Option<CausalEstimate>, String> {
    let observations = get_observations(pool, 1000).await?;

    if observations.len() < 10 {
        return Ok(None);
    }

    let (treatment_records, control_records): (Vec<_>, Vec<_>) = observations
        .iter()
        .partition(|o| o.treatment == 1);

    let treatment_outcomes: Vec<f64> = treatment_records.iter().map(|o| o.outcome).collect();
    let control_outcomes: Vec<f64> = control_records.iter().map(|o| o.outcome).collect();

    if treatment_outcomes.len() < 5 || control_outcomes.len() < 5 {
        return Ok(None);
    }

    let treatment_mean = treatment_outcomes.iter().sum::<f64>() / treatment_outcomes.len() as f64;
    let control_mean = control_outcomes.iter().sum::<f64>() / control_outcomes.len() as f64;
    let ate = treatment_mean - control_mean;

    let treatment_var = variance(&treatment_outcomes);
    let control_var = variance(&control_outcomes);
    let ate_se = ((treatment_var / treatment_outcomes.len() as f64) + (control_var / control_outcomes.len() as f64)).sqrt();

    let z = 1.96;
    let ci_low = ate - z * ate_se;
    let ci_high = ate + z * ate_se;

    let t_stat = if ate_se > 0.0 { ate / ate_se } else { 0.0 };
    let p_value = 2.0 * (1.0 - normal_cdf(t_stat.abs()));

    Ok(Some(CausalEstimate {
        ate,
        ate_se,
        confidence_interval: (ci_low, ci_high),
        p_value,
        sample_size: observations.len() as i64,
        method: "difference_in_means".to_string(),
    }))
}

pub async fn evaluate_word_mastery(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
    user_fatigue: Option<f64>,
    config: &EvaluatorConfig,
) -> Result<MasteryEvaluation, String> {
    let state_row = sqlx::query(
        r#"SELECT "masteryLevel", "easeFactor", "reviewCount" FROM "word_learning_states"
           WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let score_row = sqlx::query(
        r#"SELECT "score", "correctCount", "incorrectCount" FROM "word_scores"
           WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let trace_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "word_review_traces" WHERE "userId" = $1 AND "wordId" = $2"#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let mastery_level: i32 = state_row.as_ref().and_then(|r| r.try_get("masteryLevel").ok()).unwrap_or(0);
    let ease_factor: f64 = state_row.as_ref().and_then(|r| r.try_get("easeFactor").ok()).unwrap_or(2.5);
    let review_count: i32 = state_row.as_ref().and_then(|r| r.try_get("reviewCount").ok()).unwrap_or(0);
    let score: f64 = score_row.as_ref().and_then(|r| r.try_get("score").ok()).unwrap_or(50.0);
    let correct_count: i32 = score_row.as_ref().and_then(|r| r.try_get("correctCount").ok()).unwrap_or(0);
    let incorrect_count: i32 = score_row.as_ref().and_then(|r| r.try_get("incorrectCount").ok()).unwrap_or(0);

    let _ = score;
    let total_attempts = correct_count + incorrect_count;
    let recent_accuracy = if total_attempts > 0 {
        correct_count as f64 / total_attempts as f64
    } else {
        0.0
    };

    let normalized_srs = (mastery_level as f64 / 10.0).min(1.0);
    let recall_probability = compute_recall_probability(trace_count, ease_factor, review_count);

    let raw_score = config.srs_weight * normalized_srs
        + config.accuracy_weight * recent_accuracy
        + config.actr_weight * recall_probability;

    let confidence = compute_confidence(trace_count, review_count);
    let stability = ease_factor / 2.5;

    let fatigue = user_fatigue.unwrap_or(0.0);
    let warning = if fatigue > 0.7 {
        Some("疲劳度较高，评估结果可能偏低".to_string())
    } else {
        None
    };

    let is_mastered = raw_score >= config.threshold;
    let needs_review = raw_score < 0.5 || trace_count < 3;

    Ok(MasteryEvaluation {
        word_id: word_id.to_string(),
        score: (raw_score * 100.0).round() / 100.0,
        recall_probability: (recall_probability * 100.0).round() / 100.0,
        stability: (stability * 100.0).round() / 100.0,
        confidence: (confidence * 100.0).round() / 100.0,
        is_mastered,
        needs_review,
        warning,
    })
}

pub async fn batch_evaluate_word_mastery(
    pool: &PgPool,
    user_id: &str,
    word_ids: &[String],
    user_fatigue: Option<f64>,
    config: &EvaluatorConfig,
) -> Result<Vec<MasteryEvaluation>, String> {
    let mut results = Vec::with_capacity(word_ids.len());
    for word_id in word_ids {
        let eval = evaluate_word_mastery(pool, user_id, word_id, user_fatigue, config).await?;
        results.push(eval);
    }
    Ok(results)
}

fn variance(values: &[f64]) -> f64 {
    if values.is_empty() { return 0.0; }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64
}

fn normal_cdf(x: f64) -> f64 {
    0.5 * (1.0 + erf(x / std::f64::consts::SQRT_2))
}

fn erf(x: f64) -> f64 {
    let a1 = 0.254829592;
    let a2 = -0.284496736;
    let a3 = 1.421413741;
    let a4 = -1.453152027;
    let a5 = 1.061405429;
    let p = 0.3275911;

    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let x = x.abs();
    let t = 1.0 / (1.0 + p * x);
    let y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x * x).exp();
    sign * y
}

fn compute_recall_probability(trace_count: i64, ease_factor: f64, review_count: i32) -> f64 {
    if trace_count == 0 {
        return 0.3;
    }
    let base = 0.9_f64.powf(1.0 / (1.0 + review_count as f64 * 0.1));
    let stability_bonus = (ease_factor - 2.5) * 0.1;
    let trace_bonus = (trace_count as f64 / 20.0).min(0.1);
    (base + stability_bonus + trace_bonus).clamp(0.0, 1.0)
}

fn compute_confidence(trace_count: i64, review_count: i32) -> f64 {
    let trace_conf = (trace_count as f64 / 10.0).min(0.5);
    let review_conf = (review_count as f64 / 10.0).min(0.5);
    trace_conf + review_conf
}
