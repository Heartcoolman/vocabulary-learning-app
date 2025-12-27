use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyFactors {
    pub length: f64,
    pub accuracy: f64,
    pub frequency: f64,
    pub forgetting: f64,
}

impl Default for DifficultyFactors {
    fn default() -> Self {
        Self {
            length: 0.5,
            accuracy: 0.5,
            frequency: 0.5,
            forgetting: 0.5,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attention: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fatigue: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motivation: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageInfo {
    pub stage: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainResult {
    pub decision_id: String,
    pub timestamp: String,
    pub state: StateSnapshot,
    pub difficulty_factors: DifficultyFactors,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weights: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub triggers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stages: Option<Vec<StageInfo>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedAction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub difficulty: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_size: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint_level: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionInfo {
    pub decision_id: String,
    pub confidence: f64,
    pub selected_action: SelectedAction,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionTimelineItem {
    pub answer_id: String,
    pub word_id: String,
    pub timestamp: String,
    pub decision: DecisionInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionTimelineResponse {
    pub items: Vec<DecisionTimelineItem>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterfactualPrediction {
    pub would_trigger_adjustment: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_difficulty: Option<String>,
    pub estimated_accuracy_change: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterfactualResult {
    pub base_decision_id: String,
    pub base_state: StateSnapshot,
    pub counterfactual_state: StateSnapshot,
    pub prediction: CounterfactualPrediction,
    pub explanation: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterfactualOverrides {
    pub attention: Option<f64>,
    pub fatigue: Option<f64>,
    pub motivation: Option<f64>,
    pub recent_accuracy: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterfactualInput {
    pub decision_id: Option<String>,
    pub overrides: Option<CounterfactualOverrides>,
}

pub async fn get_decision_explanation(
    pg_pool: &PgPool,
    user_id: &str,
    decision_id: Option<&str>,
) -> Result<Option<ExplainResult>, String> {
    let target_id = match decision_id {
        Some(id) => id.to_string(),
        None => match get_latest_decision_id(pg_pool, user_id).await? {
            Some(id) => id,
            None => return Ok(None),
        },
    };

    query_decision_insight(pg_pool, user_id, &target_id).await
}

pub async fn get_decision_timeline(
    pg_pool: &PgPool,
    user_id: &str,
    limit: i32,
    cursor: Option<&str>,
) -> Result<DecisionTimelineResponse, String> {
    query_decision_timeline(pg_pool, user_id, limit, cursor).await
}

pub async fn run_counterfactual(
    pg_pool: &PgPool,
    user_id: &str,
    input: CounterfactualInput,
) -> Result<Option<CounterfactualResult>, String> {
    let target_id = match input.decision_id.as_deref() {
        Some(id) => id.to_string(),
        None => match get_latest_decision_id(pg_pool, user_id).await? {
            Some(id) => id,
            None => return Ok(None),
        },
    };

    compute_counterfactual(pg_pool, user_id, &target_id, input.overrides).await
}

async fn get_latest_decision_id(
    pg_pool: &PgPool,
    user_id: &str,
) -> Result<Option<String>, String> {
    let row = sqlx::query(
        r#"
        SELECT dr."decisionId"
        FROM "decision_records" dr
        JOIN "answer_records" ar ON dr."answerRecordId" = ar."id"
        WHERE ar."userId" = $1
        ORDER BY dr."timestamp" DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pg_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|r| r.get("decisionId")))
}

async fn query_decision_insight(
    pg_pool: &PgPool,
    user_id: &str,
    decision_id: &str,
) -> Result<Option<ExplainResult>, String> {
    query_decision_insight_pg(pg_pool, user_id, decision_id).await
}

async fn query_decision_insight_pg(
    pool: &PgPool,
    user_id: &str,
    decision_id: &str,
) -> Result<Option<ExplainResult>, String> {
    let insight_row = sqlx::query(
        r#"
        SELECT di."state_snapshot", di."difficulty_factors", di."triggers", di."created_at"
        FROM "decision_insights" di
        JOIN "decision_records" dr ON di."decision_id" = dr."decisionId"
        JOIN "answer_records" ar ON dr."answerRecordId" = ar."id"
        WHERE di."decision_id" = $1 AND ar."userId" = $2
        LIMIT 1
        "#,
    )
    .bind(decision_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(row) = insight_row {
        let state_snapshot: Option<serde_json::Value> = row.try_get("state_snapshot").ok();
        let difficulty_factors: Option<serde_json::Value> = row.try_get("difficulty_factors").ok();
        let triggers: Option<Vec<String>> = row.try_get("triggers").ok();
        let created_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("created_at").ok();

        let state = parse_state_snapshot(state_snapshot);
        let factors = parse_difficulty_factors(difficulty_factors);

        return Ok(Some(ExplainResult {
            decision_id: decision_id.to_string(),
            timestamp: created_at
                .map(|t| t.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            state,
            difficulty_factors: factors,
            weights: None,
            triggers,
            stages: None,
        }));
    }

    let record_row = sqlx::query(
        r#"
        SELECT dr."decisionId", dr."timestamp", dr."weightsSnapshot", dr."confidence"
        FROM "decision_records" dr
        JOIN "answer_records" ar ON dr."answerRecordId" = ar."id"
        WHERE dr."decisionId" = $1 AND ar."userId" = $2
        LIMIT 1
        "#,
    )
    .bind(decision_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(row) = record_row {
        let weights: Option<serde_json::Value> = row.try_get("weightsSnapshot").ok();
        let timestamp: Option<chrono::DateTime<chrono::Utc>> = row.try_get("timestamp").ok();

        return Ok(Some(ExplainResult {
            decision_id: decision_id.to_string(),
            timestamp: timestamp
                .map(|t| t.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            state: StateSnapshot {
                attention: None,
                fatigue: None,
                motivation: None,
            },
            difficulty_factors: DifficultyFactors::default(),
            weights,
            triggers: None,
            stages: None,
        }));
    }

    Ok(None)
}

fn parse_state_snapshot(value: Option<serde_json::Value>) -> StateSnapshot {
    let Some(obj) = value.and_then(|v| v.as_object().cloned()) else {
        return StateSnapshot {
            attention: None,
            fatigue: None,
            motivation: None,
        };
    };

    StateSnapshot {
        attention: obj.get("attention").and_then(|v| v.as_f64()),
        fatigue: obj.get("fatigue").and_then(|v| v.as_f64()),
        motivation: obj.get("motivation").and_then(|v| v.as_f64()),
    }
}

fn parse_difficulty_factors(value: Option<serde_json::Value>) -> DifficultyFactors {
    let Some(obj) = value.and_then(|v| v.as_object().cloned()) else {
        return DifficultyFactors::default();
    };

    DifficultyFactors {
        length: obj.get("length").and_then(|v| v.as_f64()).unwrap_or(0.5),
        accuracy: obj.get("accuracy").and_then(|v| v.as_f64()).unwrap_or(0.5),
        frequency: obj.get("frequency").and_then(|v| v.as_f64()).unwrap_or(0.5),
        forgetting: obj.get("forgetting").and_then(|v| v.as_f64()).unwrap_or(0.5),
    }
}

async fn query_decision_timeline(
    pg_pool: &PgPool,
    user_id: &str,
    limit: i32,
    cursor: Option<&str>,
) -> Result<DecisionTimelineResponse, String> {
    let fetch_limit = (limit + 1).min(201);
    let parsed_cursor = cursor.and_then(parse_cursor);
    query_decision_timeline_pg(pg_pool, user_id, fetch_limit, parsed_cursor.as_ref()).await
}

struct ParsedCursor {
    timestamp: String,
    id: String,
}

fn parse_cursor(cursor: &str) -> Option<ParsedCursor> {
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, cursor).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    let parts: Vec<&str> = s.split('|').collect();
    if parts.len() == 2 {
        Some(ParsedCursor {
            timestamp: parts[0].to_string(),
            id: parts[1].to_string(),
        })
    } else {
        None
    }
}

fn encode_cursor(timestamp: &str, id: &str) -> String {
    use base64::Engine;
    let raw = format!("{}|{}", timestamp, id);
    base64::engine::general_purpose::STANDARD.encode(raw.as_bytes())
}

async fn query_decision_timeline_pg(
    pool: &PgPool,
    user_id: &str,
    fetch_limit: i32,
    cursor: Option<&ParsedCursor>,
) -> Result<DecisionTimelineResponse, String> {
    let rows = if let Some(c) = cursor {
        sqlx::query(
            r#"
            SELECT dr."id", dr."decisionId", dr."answerRecordId", dr."timestamp",
                   dr."selectedAction", dr."confidence", ar."wordId"
            FROM "decision_records" dr
            JOIN "answer_records" ar ON dr."answerRecordId" = ar."id"
            WHERE ar."userId" = $1 AND (dr."timestamp", dr."id") < ($2::timestamptz, $3)
            ORDER BY dr."timestamp" DESC, dr."id" DESC
            LIMIT $4
            "#,
        )
        .bind(user_id)
        .bind(&c.timestamp)
        .bind(&c.id)
        .bind(fetch_limit)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            r#"
            SELECT dr."id", dr."decisionId", dr."answerRecordId", dr."timestamp",
                   dr."selectedAction", dr."confidence", ar."wordId"
            FROM "decision_records" dr
            JOIN "answer_records" ar ON dr."answerRecordId" = ar."id"
            WHERE ar."userId" = $1
            ORDER BY dr."timestamp" DESC, dr."id" DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(fetch_limit)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    };

    build_timeline_response_pg(rows, fetch_limit)
}

fn build_timeline_response_pg(
    rows: Vec<sqlx::postgres::PgRow>,
    fetch_limit: i32,
) -> Result<DecisionTimelineResponse, String> {
    let has_more = rows.len() as i32 > fetch_limit - 1;
    let take_count = if has_more { fetch_limit - 1 } else { rows.len() as i32 };

    let mut items = Vec::with_capacity(take_count as usize);
    let mut last_ts = String::new();
    let mut last_id = String::new();

    for (i, row) in rows.into_iter().enumerate() {
        if i as i32 >= take_count {
            break;
        }

        let id: String = row.try_get("id").unwrap_or_default();
        let decision_id: String = row.try_get("decisionId").unwrap_or_default();
        let answer_id: String = row.try_get("answerRecordId").unwrap_or_default();
        let word_id: String = row.try_get("wordId").unwrap_or_default();
        let confidence: f64 = row.try_get("confidence").unwrap_or(0.0);
        let timestamp: String = row
            .try_get::<chrono::DateTime<chrono::Utc>, _>("timestamp")
            .map(|t| t.to_rfc3339())
            .unwrap_or_default();
        let selected_action_json: serde_json::Value = row.try_get("selectedAction").unwrap_or(serde_json::Value::Null);
        let selected_action = parse_selected_action(&selected_action_json);

        last_ts = timestamp.clone();
        last_id = id.clone();

        items.push(DecisionTimelineItem {
            answer_id,
            word_id,
            timestamp,
            decision: DecisionInfo {
                decision_id,
                confidence,
                selected_action,
            },
        });
    }

    let next_cursor = if has_more {
        Some(encode_cursor(&last_ts, &last_id))
    } else {
        None
    };

    Ok(DecisionTimelineResponse { items, next_cursor })
}

fn parse_selected_action(value: &serde_json::Value) -> SelectedAction {
    let obj = match value.as_object() {
        Some(o) => o,
        None => {
            return SelectedAction {
                difficulty: None,
                batch_size: None,
                interval_scale: None,
                new_ratio: None,
                hint_level: None,
            }
        }
    };

    SelectedAction {
        difficulty: obj.get("difficulty").and_then(|v| v.as_str()).map(String::from),
        batch_size: obj.get("batch_size").or(obj.get("batchSize")).and_then(|v| v.as_i64()).map(|v| v as i32),
        interval_scale: obj.get("interval_scale").or(obj.get("intervalScale")).and_then(|v| v.as_f64()),
        new_ratio: obj.get("new_ratio").or(obj.get("newRatio")).and_then(|v| v.as_f64()),
        hint_level: obj.get("hint_level").or(obj.get("hintLevel")).and_then(|v| v.as_i64()).map(|v| v as i32),
    }
}

async fn compute_counterfactual(
    pg_pool: &PgPool,
    user_id: &str,
    decision_id: &str,
    overrides: Option<CounterfactualOverrides>,
) -> Result<Option<CounterfactualResult>, String> {
    let base_state = query_base_state(pg_pool, user_id, decision_id).await?;
    let Some(base) = base_state else {
        return Ok(None);
    };

    let overrides = overrides.unwrap_or(CounterfactualOverrides {
        attention: None,
        fatigue: None,
        motivation: None,
        recent_accuracy: None,
    });

    let cf_state = StateSnapshot {
        attention: overrides.attention.or(base.attention),
        fatigue: overrides.fatigue.or(base.fatigue),
        motivation: overrides.motivation.or(base.motivation),
    };

    let prediction = simulate_decision(&base, &cf_state, &overrides);
    let explanation = generate_counterfactual_explanation(&base, &cf_state, &prediction);

    Ok(Some(CounterfactualResult {
        base_decision_id: decision_id.to_string(),
        base_state: base,
        counterfactual_state: cf_state,
        prediction,
        explanation,
    }))
}

async fn query_base_state(
    pg_pool: &PgPool,
    user_id: &str,
    decision_id: &str,
) -> Result<Option<StateSnapshot>, String> {
    let row = sqlx::query(
        r#"
        SELECT di."state_snapshot"
        FROM "decision_insights" di
        JOIN "decision_records" dr ON di."decision_id" = dr."decisionId"
        JOIN "answer_records" ar ON dr."answerRecordId" = ar."id"
        WHERE di."decision_id" = $1 AND ar."userId" = $2
        LIMIT 1
        "#,
    )
    .bind(decision_id)
    .bind(user_id)
    .fetch_optional(pg_pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(r) = row {
        let snapshot: Option<serde_json::Value> = r.try_get("state_snapshot").ok();
        return Ok(Some(parse_state_snapshot(snapshot)));
    }

    let user_state_row = sqlx::query(
        r#"
        SELECT "attention", "fatigue", "motivation"
        FROM "amas_user_states"
        WHERE "userId" = $1
        ORDER BY "updatedAt" DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pg_pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(r) = user_state_row {
        return Ok(Some(StateSnapshot {
            attention: r.try_get("attention").ok(),
            fatigue: r.try_get("fatigue").ok(),
            motivation: r.try_get("motivation").ok(),
        }));
    }

    Ok(Some(StateSnapshot {
        attention: Some(0.7),
        fatigue: Some(0.0),
        motivation: Some(0.5),
    }))
}

fn simulate_decision(
    base: &StateSnapshot,
    cf: &StateSnapshot,
    overrides: &CounterfactualOverrides,
) -> CounterfactualPrediction {
    let base_fatigue = base.fatigue.unwrap_or(0.0);
    let cf_fatigue = cf.fatigue.unwrap_or(0.0);
    let base_attention = base.attention.unwrap_or(0.7);
    let cf_attention = cf.attention.unwrap_or(0.7);

    let fatigue_increased = cf_fatigue > base_fatigue + 0.1;
    let attention_decreased = cf_attention < base_attention - 0.1;

    let would_trigger = fatigue_increased || attention_decreased;

    let suggested_difficulty = if fatigue_increased || attention_decreased {
        Some("easier".to_string())
    } else if cf_fatigue < base_fatigue - 0.1 && cf_attention > base_attention + 0.1 {
        Some("harder".to_string())
    } else {
        None
    };

    let accuracy_change = if let Some(acc) = overrides.recent_accuracy {
        acc - 0.7
    } else {
        (cf_attention - base_attention) * 0.3 - (cf_fatigue - base_fatigue) * 0.2
    };

    CounterfactualPrediction {
        would_trigger_adjustment: would_trigger,
        suggested_difficulty,
        estimated_accuracy_change: (accuracy_change * 100.0).round() / 100.0,
    }
}

fn generate_counterfactual_explanation(
    base: &StateSnapshot,
    cf: &StateSnapshot,
    prediction: &CounterfactualPrediction,
) -> String {
    let mut parts = Vec::new();

    if let (Some(base_f), Some(cf_f)) = (base.fatigue, cf.fatigue) {
        let diff = cf_f - base_f;
        if diff.abs() > 0.05 {
            if diff > 0.0 {
                parts.push(format!("疲劳度增加 {:.0}%", diff * 100.0));
            } else {
                parts.push(format!("疲劳度降低 {:.0}%", -diff * 100.0));
            }
        }
    }

    if let (Some(base_a), Some(cf_a)) = (base.attention, cf.attention) {
        let diff = cf_a - base_a;
        if diff.abs() > 0.05 {
            if diff > 0.0 {
                parts.push(format!("注意力提升 {:.0}%", diff * 100.0));
            } else {
                parts.push(format!("注意力下降 {:.0}%", -diff * 100.0));
            }
        }
    }

    if let (Some(base_m), Some(cf_m)) = (base.motivation, cf.motivation) {
        let diff = cf_m - base_m;
        if diff.abs() > 0.05 {
            if diff > 0.0 {
                parts.push(format!("动机增强 {:.0}%", diff * 100.0));
            } else {
                parts.push(format!("动机减弱 {:.0}%", -diff * 100.0));
            }
        }
    }

    let state_changes = if parts.is_empty() {
        "状态变化较小".to_string()
    } else {
        parts.join("，")
    };

    let outcome = if prediction.would_trigger_adjustment {
        match prediction.suggested_difficulty.as_deref() {
            Some("easier") => "系统会建议降低难度",
            Some("harder") => "系统会建议提高难度",
            _ => "系统会触发策略调整",
        }
    } else {
        "系统不会触发策略调整"
    };

    format!("{}。{}。", state_changes, outcome)
}
