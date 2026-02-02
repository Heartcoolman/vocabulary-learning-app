use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::amas::types::{
    ColdStartPhase, MicroInteractions, ProcessOptions, RawEvent, StrategyParams as AmasStrategyParams,
};
use crate::db::operations::{
    insert_decision_insight, insert_decision_record, list_algorithm_metrics_daily, DecisionRecord,
};
use crate::response::{json_error, AppError};
use crate::routes::realtime::send_event;
use crate::services::delayed_reward::{enqueue_delayed_reward, EnqueueRewardInput};
use crate::services::learning_state::{upsert_word_state, WordState, WordStateUpdateData};
use crate::services::record::{create_record, CreateRecordInput};
use crate::services::state_history::{save_state_snapshot, UserStateSnapshot};
use crate::state::AppState;
use crate::amas::memory::{MdmState, MemoryEngine};
use crate::amas::vocabulary::{ConfusionPair, ContextEntry, MorphemeState};

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct SuccessMessageResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RangeQuery {
    range: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaysQuery {
    days: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetricsHistoryQuery {
    start_date: Option<String>,
    end_date: Option<String>,
    algorithm_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecisionQuery {
    decision_id: Option<String>,
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineQuery {
    limit: Option<i32>,
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEventRequest {
    word_id: String,
    is_correct: bool,
    response_time: i64,
    session_id: Option<String>,
    #[serde(default)]
    is_quit: bool,
    dwell_time: Option<i64>,
    pause_count: Option<i32>,
    switch_count: Option<i32>,
    retry_count: Option<i32>,
    focus_loss_duration: Option<i64>,
    interaction_density: Option<f64>,
    paused_time_ms: Option<i64>,
    hint_used: Option<bool>,
    // VARK interaction fields
    image_view_count: Option<i32>,
    image_zoom_count: Option<i32>,
    image_long_press_ms: Option<i64>,
    audio_play_count: Option<i32>,
    audio_replay_count: Option<i32>,
    audio_speed_adjust: Option<bool>,
    definition_read_ms: Option<i64>,
    example_read_ms: Option<i64>,
    note_write_count: Option<i32>,
    // Micro behavior fields
    #[serde(default)]
    is_guess: Option<bool>,
    micro_interaction: Option<MicroInteractions>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEventResponse {
    session_id: String,
    strategy: StrategyResponse,
    explanation: ExplanationResponse,
    state: StateResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    word_mastery_decision: Option<WordMasteryResponse>,
    reward: RewardResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    cold_start_phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    should_break: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggestion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    objective_evaluation: Option<ObjectiveEvaluationResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    multi_objective_adjusted: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ObjectiveEvaluationResponse {
    metrics: MultiObjectiveMetricsResponse,
    constraints_satisfied: bool,
    constraint_violations: Vec<ConstraintViolationResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggested_adjustments: Option<StrategyResponse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MultiObjectiveMetricsResponse {
    short_term_score: f64,
    long_term_score: f64,
    efficiency_score: f64,
    aggregated_score: f64,
    ts: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConstraintViolationResponse {
    constraint: String,
    expected: f64,
    actual: f64,
}

#[derive(Debug, Serialize)]
struct StrategyResponse {
    interval_scale: f64,
    new_ratio: f64,
    difficulty: String,
    batch_size: i32,
    hint_level: i32,
}

#[cfg(test)]
mod strategy_response_tests {
    use super::StrategyResponse;

    #[test]
    fn serializes_strategy_fields_as_snake_case() {
        let strategy = StrategyResponse {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: "mid".to_string(),
            batch_size: 8,
            hint_level: 1,
        };

        let value = serde_json::to_value(strategy).expect("StrategyResponse should serialize");
        assert!(value.get("interval_scale").is_some());
        assert!(value.get("new_ratio").is_some());
        assert!(value.get("batch_size").is_some());
        assert!(value.get("hint_level").is_some());

        assert!(value.get("intervalScale").is_none());
        assert!(value.get("newRatio").is_none());
        assert!(value.get("batchSize").is_none());
        assert!(value.get("hintLevel").is_none());
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplanationResponse {
    factors: Vec<FactorResponse>,
    changes: Vec<String>,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FactorResponse {
    name: String,
    value: f64,
    impact: String,
    percentage: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateResponse {
    #[serde(rename = "A")]
    attention: f64,
    #[serde(rename = "F")]
    fatigue: f64,
    #[serde(rename = "M")]
    motivation: f64,
    #[serde(rename = "C")]
    cognitive: CognitiveResponse,
    conf: f64,
    ts: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CognitiveResponse {
    mem: f64,
    speed: f64,
    stability: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WordMasteryResponse {
    word_id: String,
    prev_mastery: f64,
    new_mastery: f64,
    prev_interval: f64,
    new_interval: f64,
    quality: i32,
    // FSRS fields
    stability: f64,
    difficulty: f64,
    retrievability: f64,
    is_mastered: bool,
    lapses: i32,
    reps: i32,
    confidence: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RewardResponse {
    value: f64,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchEventItem {
    word_id: String,
    is_correct: bool,
    response_time: i64,
    timestamp: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchProcessRequest {
    events: Vec<BatchEventItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchProcessResponse {
    #[serde(rename = "processed")]
    processed_count: usize,
    #[serde(rename = "finalState")]
    final_state: StateResponse,
    #[serde(rename = "finalStrategy")]
    final_strategy: StrategyResponse,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/process", post(process_event))
        .route("/reset", post(reset_user))
        .route("/state", get(get_state))
        .route("/strategy", get(get_strategy))
        .route("/batch-process", post(batch_process))
        .route("/delayed-rewards", get(get_delayed_rewards))
        .route("/time-preferences", get(get_time_preferences))
        .route("/golden-time", get(get_golden_time))
        .route("/trend", get(get_trend))
        .route("/trend/history", get(get_trend_history))
        .route("/trend/intervention", get(get_trend_intervention))
        .route("/trend/report", get(get_trend_report))
        .route("/history", get(get_history))
        .route("/growth", get(get_growth))
        .route("/changes", get(get_changes))
        .route("/explain-decision", get(explain_decision))
        .route("/learning-curve", get(get_learning_curve))
        .route("/phase", get(get_phase))
        .route("/decision-timeline", get(get_decision_timeline))
        .route("/counterfactual", post(counterfactual))
        .route("/metrics/history", get(get_algorithm_metrics_history))
}

fn not_implemented() -> Response {
    json_error(
        StatusCode::NOT_IMPLEMENTED,
        "NOT_IMPLEMENTED",
        "功能尚未实现",
    )
    .into_response()
}

async fn process_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ProcessEventRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let session_id = body
        .session_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let word_id = body.word_id.clone();
    let response_time = body.response_time.max(0);

    // Load existing word state for FSRS calculation
    let existing_word_state =
        crate::services::learning_state::get_word_state(proxy.pool(), &user.id, &word_id)
            .await
            .ok()
            .flatten();

    let fsrs_word_state = existing_word_state.as_ref().map(|ws| {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let elapsed_days = ws
            .last_review_date
            .map(|lr| ((now_ms - lr) as f64 / (24.0 * 60.0 * 60.0 * 1000.0)).max(0.0))
            .unwrap_or(0.0);
        crate::amas::types::FSRSWordState {
            stability: ws.stability,
            difficulty: ws.difficulty,
            elapsed_days,
            scheduled_days: ws.scheduled_days,
            reps: ws.reps,
            lapses: ws.lapses,
            desired_retention: ws.desired_retention,
            amas_strength: ws.amas_strength,
            amas_consolidation: ws.amas_consolidation,
            amas_last_review_ts: ws.amas_last_review_ts,
            air_alpha: ws.air_alpha,
            air_beta: ws.air_beta,
        }
    });

    // Load recent answers for feature calculation
    let recent_answers = load_recent_answers(proxy.pool(), &user.id, 20).await;
    let (rt_cv, recent_accuracy) = calculate_performance_features(&recent_answers);

    // Load latest visual fatigue data (freshness < 30s, session-scoped)
    let visual_fatigue =
        load_latest_visual_fatigue(proxy.pool(), &user.id, Some(&session_id)).await;

    // Calculate study duration from session start
    let study_duration_minutes = load_session_duration_minutes(proxy.pool(), &session_id).await;

    // Load vocabulary specialization data
    let morpheme_states = load_morpheme_states_for_word(proxy.pool(), &user.id, &word_id).await;
    let confusion_pairs = load_confusion_pairs_for_word(proxy.pool(), &word_id).await;
    let recent_word_ids = load_recent_word_ids(proxy.pool(), &user.id, &session_id, 20).await;
    let context_history = load_context_history(proxy.pool(), &user.id, &word_id, 50).await;

    let raw_event = RawEvent {
        word_id: Some(body.word_id),
        is_correct: body.is_correct,
        response_time,
        dwell_time: body.dwell_time,
        pause_count: body.pause_count.unwrap_or(0),
        switch_count: body.switch_count.unwrap_or(0),
        retry_count: body.retry_count.unwrap_or(0),
        focus_loss_duration: body.focus_loss_duration,
        interaction_density: body.interaction_density,
        paused_time_ms: body.paused_time_ms,
        hint_used: body.hint_used.unwrap_or(false),
        is_quit: body.is_quit,
        is_guess: body.is_guess.unwrap_or(false),
        timestamp: chrono::Utc::now().timestamp_millis(),
        ..Default::default()
    };

    let options = ProcessOptions {
        word_state: fsrs_word_state,
        rt_cv: Some(rt_cv),
        recent_accuracy: Some(recent_accuracy),
        visual_fatigue_score: visual_fatigue.as_ref().map(|v| v.score),
        visual_fatigue_confidence: visual_fatigue.as_ref().map(|v| v.confidence),
        study_duration_minutes: Some(study_duration_minutes),
        session_id: Some(session_id.clone()),
        // UMM vocabulary specialization inputs
        morpheme_states: if morpheme_states.is_empty() {
            None
        } else {
            Some(morpheme_states.clone())
        },
        confusion_pairs: if confusion_pairs.is_empty() {
            None
        } else {
            Some(confusion_pairs.clone())
        },
        recent_word_ids: if recent_word_ids.is_empty() {
            None
        } else {
            Some(recent_word_ids.clone())
        },
        context_history: if context_history.is_empty() {
            None
        } else {
            Some(context_history.clone())
        },
        ..Default::default()
    };

    let engine = state.amas_engine();
    let result = engine
        .process_event(&user.id, raw_event, options)
        .await
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, "AMAS_ERROR", &e))?;

    // Push AMAS flow data to SSE for real-time visualization
    let weights_json = result
        .algorithm_weights
        .as_ref()
        .map(|w| {
            serde_json::json!({
                "ige": w.ige,
                "swd": w.swd,
                "heuristic": w.heuristic,
                "coldstart": w.coldstart,
            })
        })
        .unwrap_or_else(|| {
            serde_json::json!({
                "ige": 0.3,
                "swd": 0.3,
                "heuristic": 0.3,
                "coldstart": 0.1,
            })
        });
    let amas_flow_payload = serde_json::json!({
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "rawEvent": {
            "isCorrect": body.is_correct,
            "responseTime": body.response_time,
            "wordId": &word_id,
        },
        "state": {
            "attention": result.state.attention,
            "fatigue": result.state.fatigue,
            "fusedFatigue": result.state.fused_fatigue,
            "visualFatigue": result.state.visual_fatigue.as_ref().map(|v| v.score),
            "motivation": result.state.motivation,
            "cognitive": {
                "mem": result.state.cognitive.mem,
                "speed": result.state.cognitive.speed,
                "stability": result.state.cognitive.stability,
            },
        },
        "weights": weights_json,
        "reward": {
            "value": result.reward.value,
            "reason": result.reward.reason.clone(),
        },
        "decision": {
            "difficulty": result.strategy.difficulty.as_str(),
            "batchSize": result.strategy.batch_size,
            "intervalScale": result.strategy.interval_scale,
        },
    });
    send_event(
        user.id.clone(),
        Some(session_id.clone()),
        "amas-flow",
        amas_flow_payload,
    );

    // Save state snapshot for learning curve history
    let snapshot = UserStateSnapshot {
        attention: result.state.attention,
        fatigue: result.state.fatigue,
        motivation: result.state.motivation,
        memory: result.state.cognitive.mem,
        speed: result.state.cognitive.speed,
        stability: result.state.cognitive.stability,
        trend_state: result.state.trend.map(|t| t.as_str().to_string()),
    };
    if let Err(e) = save_state_snapshot(&proxy, &user.id, snapshot).await {
        tracing::warn!(error = %e, "Failed to save state snapshot");
    }

    // For quit events, skip word-scoped side effects (record, Elo, VARK, mastery updates)
    // Only the AMAS engine state update (motivation via MDS) is needed
    if body.is_quit {
        return Ok(Json(SuccessResponse {
            success: true,
            data: build_process_event_response(session_id, &result),
        }));
    }

    // Update word_learning_states based on mastery decision with FSRS data
    if let Some(ref mastery) = result.word_mastery_decision {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let mastery_level = ((mastery.retrievability * 5.0).floor() as i32).clamp(0, 5);
        let word_state = if mastery.is_mastered {
            WordState::Mastered
        } else if mastery.stability >= 10.0 {
            WordState::Reviewing
        } else if mastery.stability > 1.0 {
            WordState::Learning
        } else {
            WordState::New
        };
        let next_review_ms = now_ms + (mastery.new_interval * 24.0 * 60.0 * 60.0 * 1000.0) as i64;

        let update_data = WordStateUpdateData {
            state: Some(word_state),
            mastery_level: Some(mastery_level),
            ease_factor: None,
            review_count: None,
            last_review_date: Some(now_ms),
            next_review_date: Some(next_review_ms),
            increment_review: true,
            // FSRS fields
            stability: Some(mastery.stability),
            difficulty: Some(mastery.difficulty),
            desired_retention: None,
            lapses: Some(mastery.lapses),
            reps: Some(mastery.reps),
            scheduled_days: Some(mastery.new_interval),
            elapsed_days: Some(0.0),
            // UMM fields
            amas_strength: mastery.amas_strength,
            amas_consolidation: mastery.amas_consolidation,
            amas_last_review_ts: mastery.amas_last_review_ts,
            // AIR fields
            air_alpha: mastery.air_alpha,
            air_beta: mastery.air_beta,
        };

        if let Err(e) = upsert_word_state(&proxy, &user.id, &mastery.word_id, update_data).await {
            tracing::warn!(error = %e, "Failed to update word learning state");
        }
    }

    // Write answer record for statistics
    tracing::debug!(
        word_id = %word_id,
        response_time = body.response_time,
        is_correct = body.is_correct,
        "Creating answer record with responseTime"
    );
    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok());
    let device_type = crate::services::record::normalize_device_type(user_agent);
    let record_input = CreateRecordInput {
        word_id: word_id.clone(),
        selected_option: None,
        selected_answer: None,
        correct_answer: None,
        is_correct: body.is_correct,
        timestamp_ms: Some(chrono::Utc::now().timestamp_millis()),
        response_time: Some(body.response_time),
        dwell_time: body.dwell_time,
        session_id: Some(session_id.clone()),
        mastery_level_before: None,
        mastery_level_after: result
            .word_mastery_decision
            .as_ref()
            .map(|m| ((m.new_mastery * 5.0).round() as i64).clamp(0, 5)),
        image_view_count: body.image_view_count,
        image_zoom_count: body.image_zoom_count,
        image_long_press_ms: body.image_long_press_ms,
        audio_play_count: body.audio_play_count,
        audio_replay_count: body.audio_replay_count,
        audio_speed_adjust: body.audio_speed_adjust,
        definition_read_ms: body.definition_read_ms,
        example_read_ms: body.example_read_ms,
        note_write_count: body.note_write_count,
        device_type: Some(device_type.to_string()),
        is_guess: body.is_guess,
        indecision_index: body.micro_interaction.as_ref().and_then(|m| {
            let tl = m.trajectory_length.unwrap_or(0.0);
            let dd = m.direct_distance.unwrap_or(0.0);
            if dd < 10.0 { return None; }
            let ratio = tl / dd;
            if ratio < 1.5 { return None; }
            let sc = m.option_switch_count.unwrap_or(0) as f64;
            Some(((ratio - 1.0) * (1.0 + 0.2 * sc)).clamp(0.0, 1.0))
        }),
        reaction_latency_ms: body.micro_interaction.as_ref().and_then(|m| m.reaction_latency_ms),
        keystroke_fluency: body.micro_interaction.as_ref().and_then(|m| {
            let reaction = m.reaction_latency_ms.unwrap_or(0) as f64;
            let events = m.keystroke_events.as_ref()?;
            if events.is_empty() { return None; }

            // Calculate average hold time from keystroke events
            let hold_times: Vec<f64> = events
                .iter()
                .filter_map(|e| {
                    e.up_time.map(|up| (up - e.down_time) as f64)
                })
                .filter(|&t| t > 0.0 && t < 2000.0)
                .collect();

            if hold_times.is_empty() { return None; }
            let avg_hold = hold_times.iter().sum::<f64>() / hold_times.len() as f64;

            // Sigmoid mapping: fast reaction + short hold time = high fluency
            // Normalize: reaction 500ms optimal, hold 100ms optimal
            let reaction_score = 1.0 / (1.0 + (reaction / 500.0 - 1.0).exp());
            let hold_score = 1.0 / (1.0 + (avg_hold / 100.0 - 1.0).exp());

            Some((0.6 * reaction_score + 0.4 * hold_score).clamp(0.0, 1.0))
        }),
    };
    match create_record(&proxy, &user.id, record_input).await {
        Ok(record) => {
            // Store raw micro behavior events if present
            if let Some(ref micro) = body.micro_interaction {
                let record_id = record.id.clone();
                let pool = proxy.pool();

                // Store trajectory points
                if let Some(ref points) = micro.trajectory_points {
                    if !points.is_empty() {
                        let id = uuid::Uuid::new_v4().to_string();
                        let event_data = serde_json::json!(points);
                        if let Err(e) = sqlx::query(
                            r#"INSERT INTO "micro_behavior_events" ("id", "answerRecordId", "eventType", "eventData")
                               VALUES ($1, $2, 'trajectory', $3)"#
                        )
                        .bind(&id)
                        .bind(&record_id)
                        .bind(&event_data)
                        .execute(pool)
                        .await {
                            tracing::warn!(error = %e, "Failed to store trajectory events");
                        }
                    }
                }

                // Store hover events
                if let Some(ref hovers) = micro.hover_events {
                    if !hovers.is_empty() {
                        let id = uuid::Uuid::new_v4().to_string();
                        let event_data = serde_json::json!(hovers);
                        if let Err(e) = sqlx::query(
                            r#"INSERT INTO "micro_behavior_events" ("id", "answerRecordId", "eventType", "eventData")
                               VALUES ($1, $2, 'hover', $3)"#
                        )
                        .bind(&id)
                        .bind(&record_id)
                        .bind(&event_data)
                        .execute(pool)
                        .await {
                            tracing::warn!(error = %e, "Failed to store hover events");
                        }
                    }
                }

                // Store keystroke events
                if let Some(ref keystrokes) = micro.keystroke_events {
                    if !keystrokes.is_empty() {
                        let id = uuid::Uuid::new_v4().to_string();
                        let event_data = serde_json::json!(keystrokes);
                        if let Err(e) = sqlx::query(
                            r#"INSERT INTO "micro_behavior_events" ("id", "answerRecordId", "eventType", "eventData")
                               VALUES ($1, $2, 'keystroke', $3)"#
                        )
                        .bind(&id)
                        .bind(&record_id)
                        .bind(&event_data)
                        .execute(pool)
                        .await {
                            tracing::warn!(error = %e, "Failed to store keystroke events");
                        }
                    }
                }
            }

            // Update Elo ratings after each answer
            if let Err(e) = crate::services::elo::update_elo_ratings_db(
                &proxy,
                &user.id,
                &word_id,
                body.is_correct,
                body.response_time,
            )
            .await
            {
                tracing::warn!(error = %e, "Failed to update Elo ratings");
            }

            // Update VARK learning style model
            let vark_data = crate::amas::modeling::VarkInteractionData {
                image_view_count: body.image_view_count.unwrap_or(0),
                image_zoom_count: body.image_zoom_count.unwrap_or(0),
                image_long_press_ms: body.image_long_press_ms.unwrap_or(0),
                dwell_time: body.dwell_time.unwrap_or(0),
                audio_play_count: body.audio_play_count.unwrap_or(0),
                audio_replay_count: body.audio_replay_count.unwrap_or(0),
                audio_speed_adjust: body.audio_speed_adjust.unwrap_or(false),
                definition_read_ms: body.definition_read_ms.unwrap_or(0),
                example_read_ms: body.example_read_ms.unwrap_or(0),
                note_write_count: body.note_write_count.unwrap_or(0),
                response_time: Some(body.response_time),
                timestamp_ms: chrono::Utc::now().timestamp_millis(),
            };
            if let Err(e) = crate::amas::modeling::update_learning_style_model(
                proxy.pool(),
                &user.id,
                &vark_data,
            )
            .await
            {
                tracing::warn!(error = %e, "Failed to update VARK learning style model");
            }

            let delay_ms = 5 * 60 * 1000i64;
            let _ = enqueue_delayed_reward(
                &proxy,
                EnqueueRewardInput {
                    user_id: user.id.clone(),
                    answer_record_id: Some(record.id.clone()),
                    session_id: Some(session_id.clone()),
                    reward: result.reward.value,
                    due_ts: chrono::Utc::now().timestamp_millis() + delay_ms,
                    idempotency_key: format!("reward:{}:{}", user.id, record.id),
                },
            )
            .await;

            // Update learning session statistics (only on successful record creation)
            // Use transaction to ensure atomic updates
            if !session_id.is_empty() {
                let update_result: Result<(), sqlx::Error> = async {
                    let mut tx = proxy.pool().begin().await?;
                    let now = chrono::Utc::now().naive_utc();

                    sqlx::query(
                        r#"UPDATE "learning_sessions"
                           SET "totalQuestions" = "totalQuestions" + 1, "updatedAt" = $1
                           WHERE "id" = $2 AND "userId" = $3"#,
                    )
                    .bind(now)
                    .bind(&session_id)
                    .bind(&user.id)
                    .execute(&mut *tx)
                    .await?;

                    if let Some(ref mastery) = result.word_mastery_decision {
                        const MASTERY_THRESHOLD: f64 = 0.6;
                        if mastery.new_mastery >= MASTERY_THRESHOLD
                            && mastery.prev_mastery < MASTERY_THRESHOLD
                        {
                            sqlx::query(
                                r#"UPDATE "learning_sessions"
                                   SET "actualMasteryCount" = "actualMasteryCount" + 1, "updatedAt" = $1
                                   WHERE "id" = $2 AND "userId" = $3"#,
                            )
                            .bind(now)
                            .bind(&session_id)
                            .bind(&user.id)
                            .execute(&mut *tx)
                            .await?;
                        }
                    }

                    tx.commit().await?;
                    Ok(())
                }
                .await;

                if let Err(e) = update_result {
                    tracing::warn!(error = %e, "Failed to update learning session stats");
                }
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "Failed to create answer record");
        }
    }

    // Compute and write UMM shadow results for A/B comparison
    if let Some(ref mastery) = result.word_mastery_decision {
        let shadow_result = {
            // Build MDM state from UMM fields if available
            let mdm_state = match (mastery.amas_strength, mastery.amas_consolidation) {
                (Some(strength), Some(consolidation)) => Some(MdmState {
                    strength,
                    consolidation,
                    ..Default::default()
                }),
                _ => None,
            };

            // Convert types for memory engine
            let morpheme_states_amas: Vec<MorphemeState> = morpheme_states
                .iter()
                .map(|m| MorphemeState {
                    morpheme_id: m.morpheme_id.clone(),
                    mastery_level: m.mastery_level,
                })
                .collect();

            let confusion_pairs_amas: Vec<ConfusionPair> = confusion_pairs
                .iter()
                .map(|c| ConfusionPair {
                    confusing_word_id: c.confusing_word_id.clone(),
                    distance: c.distance,
                })
                .collect();

            let context_history_amas: Vec<ContextEntry> = context_history
                .iter()
                .map(|c| ContextEntry {
                    hour_of_day: c.hour_of_day,
                    day_of_week: c.day_of_week,
                    question_type: c.question_type.clone(),
                    device_type: c.device_type.clone(),
                })
                .collect();

            // Calculate elapsed days from last review
            let elapsed_days = existing_word_state
                .as_ref()
                .and_then(|ws| ws.last_review_date)
                .map(|lr| {
                    let now_ms = chrono::Utc::now().timestamp_millis();
                    ((now_ms - lr) as f64 / (24.0 * 60.0 * 60.0 * 1000.0)).max(0.0)
                })
                .unwrap_or(0.0);

            MemoryEngine::compute_shadow(
                mastery.new_interval,
                mastery.retrievability,
                mastery.stability,
                mastery.difficulty,
                mdm_state.as_ref(),
                elapsed_days,
                0.9, // r_target (desired retention)
                &morpheme_states_amas,
                &confusion_pairs_amas,
                &recent_word_ids,
                &context_history_amas,
            )
        };

        // Write to amas_shadow_results table
        let pool = proxy.pool();
        let now_ms = chrono::Utc::now().timestamp_millis();
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO "amas_shadow_results"
                ("userId", "wordId", "sessionId", "eventTs",
                 "fsrsInterval", "fsrsRetrievability", "fsrsStability", "fsrsDifficulty",
                 "mdmInterval", "mdmRetrievability", "mdmStrength", "mdmConsolidation",
                 "mtpBonus", "iadPenalty", "evmBonus",
                 "amasRetrievability", "amasInterval",
                 "actualRecalled", "elapsedDays", "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            "#,
        )
        .bind(&user.id)
        .bind(&word_id)
        .bind(&session_id)
        .bind(now_ms)
        .bind(shadow_result.fsrs_interval)
        .bind(shadow_result.fsrs_retrievability)
        .bind(shadow_result.fsrs_stability)
        .bind(shadow_result.fsrs_difficulty)
        .bind(shadow_result.mdm_interval)
        .bind(shadow_result.mdm_retrievability)
        .bind(shadow_result.mdm_strength)
        .bind(shadow_result.mdm_consolidation)
        .bind(shadow_result.mtp_bonus)
        .bind(shadow_result.iad_penalty)
        .bind(shadow_result.evm_bonus)
        .bind(shadow_result.amas_retrievability)
        .bind(shadow_result.amas_interval)
        .bind(body.is_correct as i32)
        .bind(existing_word_state.as_ref().and_then(|ws| ws.last_review_date).map(|lr| {
            let now_ms = chrono::Utc::now().timestamp_millis();
            ((now_ms - lr) as f64 / (24.0 * 60.0 * 60.0 * 1000.0)).max(0.0)
        }))
        .bind(now_ms)
        .execute(pool)
        .await
        {
            tracing::warn!(error = %e, "Failed to write UMM shadow result");
        }
    }

    // Write decision record for explainability
    let decision_record = DecisionRecord {
        id: Uuid::new_v4().to_string(),
        decision_id: Uuid::new_v4().to_string(),
        answer_record_id: None,
        session_id: Some(session_id.clone()),
        decision_source: "AMAS".to_string(),
        coldstart_phase: None,
        weights_snapshot: None,
        member_votes: None,
        selected_action: serde_json::to_value(&result.strategy).unwrap_or_default(),
        confidence: result
            .explanation
            .factors
            .iter()
            .map(|f| f.value)
            .sum::<f64>()
            / result.explanation.factors.len().max(1) as f64,
        reward: Some(result.reward.value),
        trace_version: 1,
        total_duration_ms: None,
        is_simulation: false,
        emotion_label: None,
        flow_score: None,
    };
    if let Err(e) = insert_decision_record(&proxy, &decision_record).await {
        tracing::warn!(error = %e, "Failed to insert decision record");
    }

    // Write decision insight for explainability analysis
    let state_snapshot = serde_json::json!({
        "attention": result.state.attention,
        "fatigue": result.state.fatigue,
        "motivation": result.state.motivation,
    });
    let difficulty_factors = serde_json::json!({
        "accuracy": result.explanation.factors.iter()
            .find(|f| f.name == "accuracy").map(|f| f.value).unwrap_or(0.5),
        "responseTime": result.explanation.factors.iter()
            .find(|f| f.name == "responseTime").map(|f| f.value).unwrap_or(0.5),
    });
    let feature_hash = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(serde_json::to_string(&result.explanation.factors).unwrap_or_default());
        hex::encode(hasher.finalize())
    };
    if let Err(e) = insert_decision_insight(
        &proxy,
        &decision_record.decision_id,
        &user.id,
        &state_snapshot,
        &difficulty_factors,
        &result.explanation.changes,
        &feature_hash,
    )
    .await
    {
        tracing::warn!(error = %e, "Failed to insert decision insight");
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: build_process_event_response(session_id, &result),
    }))
}

async fn get_state(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_, user) = require_user(&state, &headers).await?;

    let engine = state.amas_engine();
    let user_state = engine.get_user_state(&user.id).await;

    match user_state {
        Some(s) => Ok(Json(SuccessResponse {
            success: true,
            data: state_to_response(&s),
        })),
        None => Err(json_error(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "用户AMAS状态未初始化",
        )),
    }
}

async fn get_strategy(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_, user) = require_user(&state, &headers).await?;

    let engine = state.amas_engine();
    let strategy = engine.get_current_strategy(&user.id).await;

    #[derive(Serialize)]
    struct StrategyWithInit {
        #[serde(flatten)]
        strategy: StrategyResponse,
        initialized: bool,
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: StrategyWithInit {
            strategy: strategy_to_response(&strategy),
            initialized: true,
        },
    }))
}

async fn batch_process(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BatchProcessRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    if body.events.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "事件数组不能为空",
        ));
    }
    if body.events.len() > 100 {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "单次批量处理最多100条事件",
        ));
    }

    let engine = state.amas_engine();
    let mut final_state = None;
    let mut final_strategy = None;

    for event in &body.events {
        let word_id = event.word_id.clone();
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

        match engine.process_event(&user.id, raw_event, options).await {
            Ok(result) => {
                // Update word_learning_states for this event
                if let Some(ref mastery) = result.word_mastery_decision {
                    let now_ms = chrono::Utc::now().timestamp_millis();
                    let mastery_level = ((mastery.retrievability * 5.0).floor() as i32).clamp(0, 5);
                    let word_state = if mastery.is_mastered {
                        WordState::Mastered
                    } else if mastery.stability >= 10.0 {
                        WordState::Reviewing
                    } else if mastery.stability > 1.0 {
                        WordState::Learning
                    } else {
                        WordState::New
                    };
                    let next_review_ms =
                        now_ms + (mastery.new_interval * 24.0 * 60.0 * 60.0 * 1000.0) as i64;

                    let update_data = WordStateUpdateData {
                        state: Some(word_state),
                        mastery_level: Some(mastery_level),
                        ease_factor: None,
                        review_count: None,
                        last_review_date: Some(now_ms),
                        next_review_date: Some(next_review_ms),
                        increment_review: true,
                        stability: Some(mastery.stability),
                        difficulty: Some(mastery.difficulty),
                        desired_retention: None,
                        lapses: Some(mastery.lapses),
                        reps: Some(mastery.reps),
                        scheduled_days: Some(mastery.new_interval),
                        elapsed_days: Some(0.0),
                        amas_strength: mastery.amas_strength,
                        amas_consolidation: mastery.amas_consolidation,
                        amas_last_review_ts: mastery.amas_last_review_ts,
                        air_alpha: mastery.air_alpha,
                        air_beta: mastery.air_beta,
                    };

                    if let Err(e) =
                        upsert_word_state(&proxy, &user.id, &mastery.word_id, update_data).await
                    {
                        tracing::warn!(error = %e, "Failed to update word learning state in batch");
                    }
                }

                // Create answer record (same as process_event)
                let user_agent = headers
                    .get(axum::http::header::USER_AGENT)
                    .and_then(|v| v.to_str().ok());
                let device_type = crate::services::record::normalize_device_type(user_agent);
                let record_input = CreateRecordInput {
                    word_id: word_id.clone(),
                    selected_option: None,
                    selected_answer: None,
                    correct_answer: None,
                    is_correct: event.is_correct,
                    timestamp_ms: Some(event.timestamp),
                    response_time: Some(event.response_time),
                    dwell_time: None,
                    session_id: None,
                    mastery_level_before: None,
                    mastery_level_after: result
                        .word_mastery_decision
                        .as_ref()
                        .map(|m| ((m.new_mastery * 5.0).floor() as i64).clamp(0, 5)),
                    image_view_count: None,
                    image_zoom_count: None,
                    image_long_press_ms: None,
                    audio_play_count: None,
                    audio_replay_count: None,
                    audio_speed_adjust: None,
                    definition_read_ms: None,
                    example_read_ms: None,
                    note_write_count: None,
                    device_type: Some(device_type.to_string()),
                    is_guess: None,
                    indecision_index: None,
                    reaction_latency_ms: None,
                    keystroke_fluency: None,
                };
                match create_record(&proxy, &user.id, record_input).await {
                    Ok(record) => {
                        let delay_ms = 5 * 60 * 1000i64;
                        let _ = enqueue_delayed_reward(
                            &proxy,
                            EnqueueRewardInput {
                                user_id: user.id.clone(),
                                answer_record_id: Some(record.id.clone()),
                                session_id: None,
                                reward: result.reward.value,
                                due_ts: chrono::Utc::now().timestamp_millis() + delay_ms,
                                idempotency_key: format!("reward:{}:{}", user.id, record.id),
                            },
                        )
                        .await;
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to create answer record in batch");
                    }
                }

                final_state = Some(result.state);
                final_strategy = Some(result.strategy);
            }
            Err(e) => {
                tracing::warn!(error = %e, "batch process event failed");
            }
        }
    }

    let final_state = final_state.unwrap_or_default();
    let final_strategy = final_strategy.unwrap_or_default();

    Ok(Json(SuccessResponse {
        success: true,
        data: BatchProcessResponse {
            processed_count: body.events.len(),
            final_state: state_to_response(&final_state),
            final_strategy: strategy_to_response(&final_strategy),
        },
    }))
}

async fn get_delayed_rewards(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    match crate::services::delayed_reward::get_user_pending_rewards(proxy.pool(), &user.id).await {
        Ok(items) => {
            let count = items.len();
            Ok(Json(SuccessResponse {
                success: true,
                data: serde_json::json!({
                    "items": items,
                    "count": count,
                }),
            }))
        }
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_time_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    match crate::services::learning_time::get_time_preferences(&proxy, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse {
            success: true,
            data: result,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_golden_time(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    match crate::services::learning_time::is_golden_time(&proxy, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse {
            success: true,
            data: result,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_trend(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    match crate::services::trend_analysis::get_current_trend(&proxy, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse {
            success: true,
            data: result,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_trend_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DaysQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let days = query.days.unwrap_or(28) as i64;

    match crate::services::trend_analysis::get_trend_history(&proxy, &user.id, days).await {
        Ok(result) => Ok(Json(SuccessResponse {
            success: true,
            data: result,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_trend_report(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    match crate::services::trend_analysis::generate_trend_report(&proxy, &user.id).await {
        Ok(result) => Ok(Json(SuccessResponse {
            success: true,
            data: result,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let range = query.range.unwrap_or(30);

    match crate::services::state_history::get_state_history(proxy.pool(), &user.id, range).await {
        Ok(history) => Ok(Json(SuccessResponse {
            success: true,
            data: history,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_growth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let range = query.range.unwrap_or(30);

    match crate::services::state_history::get_cognitive_growth(proxy.pool(), &user.id, range).await
    {
        Ok(growth) => Ok(Json(SuccessResponse {
            success: true,
            data: growth,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn get_changes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let range = query.range.unwrap_or(30);

    match crate::services::state_history::get_significant_changes(proxy.pool(), &user.id, range)
        .await
    {
        Ok(changes) => Ok(Json(SuccessResponse {
            success: true,
            data: changes,
        })),
        Err(e) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_FAILED",
            &e,
        )),
    }
}

async fn explain_decision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DecisionQuery>,
) -> Response {
    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败")
                .into_response();
        }
    };

    let pool = proxy.pool();

    match crate::services::explainability::get_decision_explanation(
        pool,
        &auth_user.id,
        query.decision_id.as_deref(),
    )
    .await
    {
        Ok(Some(result)) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Ok(None) => Json(serde_json::json!({
            "success": true,
            "data": null,
            "message": "暂无决策记录，开始学习后将自动生成"
        }))
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "explain_decision failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

async fn get_decision_timeline(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TimelineQuery>,
) -> Response {
    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败")
                .into_response();
        }
    };

    let pool = proxy.pool();
    let limit = query.limit.unwrap_or(50).min(200);

    match crate::services::explainability::get_decision_timeline(
        pool,
        &auth_user.id,
        limit,
        query.cursor.as_deref(),
    )
    .await
    {
        Ok(result) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "get_decision_timeline failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

async fn counterfactual(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<crate::services::explainability::CounterfactualInput>,
) -> Response {
    let token = crate::auth::extract_token(&headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌")
            .into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
        .into_response();
    };

    let auth_user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败")
                .into_response();
        }
    };

    let pool = proxy.pool();

    match crate::services::explainability::run_counterfactual(pool, &auth_user.id, input).await {
        Ok(Some(result)) => Json(SuccessResponse {
            success: true,
            data: result,
        })
        .into_response(),
        Ok(None) => Json(serde_json::json!({
            "success": true,
            "data": null,
            "message": "暂无决策记录，请先进行一些学习后再运行反事实分析"
        }))
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "counterfactual failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

fn strategy_to_response(s: &AmasStrategyParams) -> StrategyResponse {
    StrategyResponse {
        interval_scale: s.interval_scale,
        new_ratio: s.new_ratio,
        difficulty: s.difficulty.as_str().to_string(),
        batch_size: s.batch_size,
        hint_level: s.hint_level,
    }
}

fn build_process_event_response(
    session_id: String,
    result: &crate::amas::types::ProcessResult,
) -> ProcessEventResponse {
    ProcessEventResponse {
        session_id,
        strategy: strategy_to_response(&result.strategy),
        explanation: ExplanationResponse {
            factors: result
                .explanation
                .factors
                .iter()
                .map(|f| FactorResponse {
                    name: f.name.clone(),
                    value: f.value,
                    impact: f.impact.clone(),
                    percentage: f.percentage,
                })
                .collect(),
            changes: result.explanation.changes.clone(),
            text: result.explanation.text.clone(),
        },
        state: state_to_response(&result.state),
        word_mastery_decision: result
            .word_mastery_decision
            .as_ref()
            .map(|w| WordMasteryResponse {
                word_id: w.word_id.clone(),
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
        cold_start_phase: result.cold_start_phase.map(|p| match p {
            ColdStartPhase::Classify => "classify".to_string(),
            ColdStartPhase::Explore => "explore".to_string(),
            ColdStartPhase::Normal => "normal".to_string(),
        }),
        should_break: if result.state.fatigue > 0.7 || result.state.attention < 0.3 {
            Some(true)
        } else {
            None
        },
        suggestion: if result.state.fatigue > 0.7 {
            Some("您已学习较长时间，建议休息一下".to_string())
        } else if result.state.attention < 0.3 {
            Some("注意力下降，建议稍作休息后继续".to_string())
        } else if result.state.motivation < -0.3 {
            Some("学习动力不足，可以尝试更简单的内容".to_string())
        } else {
            None
        },
        objective_evaluation: result
            .objective_evaluation
            .as_ref()
            .map(|oe| ObjectiveEvaluationResponse {
                metrics: MultiObjectiveMetricsResponse {
                    short_term_score: oe.metrics.short_term_score,
                    long_term_score: oe.metrics.long_term_score,
                    efficiency_score: oe.metrics.efficiency_score,
                    aggregated_score: oe.metrics.aggregated_score,
                    ts: oe.metrics.ts,
                },
                constraints_satisfied: oe.constraints_satisfied,
                constraint_violations: oe
                    .constraint_violations
                    .iter()
                    .map(|cv| ConstraintViolationResponse {
                        constraint: cv.constraint.clone(),
                        expected: cv.expected,
                        actual: cv.actual,
                    })
                    .collect(),
                suggested_adjustments: oe
                    .suggested_adjustments
                    .as_ref()
                    .map(|s| strategy_to_response(s)),
            }),
        multi_objective_adjusted: result.multi_objective_adjusted,
    }
}

fn state_to_response(s: &crate::amas::types::UserState) -> StateResponse {
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningCurvePoint {
    date: String,
    mastery: f64,
    attention: f64,
    fatigue: f64,
    motivation: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningCurveResult {
    points: Vec<LearningCurvePoint>,
    trend: String,
    current_mastery: f64,
    average_attention: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhaseResult {
    phase: String,
    description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InterventionResult {
    needs_intervention: bool,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actions: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
struct TrendHistoryPoint {
    trend_state: Option<String>,
    motivation: f64,
    memory: f64,
    speed: f64,
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
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

async fn get_learning_curve(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DaysQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let days = query.days.unwrap_or(30);
    if !(7..=90).contains(&days) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "days参数必须在7-90之间",
        ));
    }

    let today = Utc::now().date_naive();
    let start_date = today - Duration::days(days as i64);

    let pool = proxy.pool();
    let points = select_learning_curve_pg(pool, &user.id, start_date).await?;

    let mastery_values: Vec<f64> = points.iter().map(|p| p.mastery).collect();
    let trend = compute_mastery_trend(&mastery_values);
    let current_mastery = points.last().map(|p| p.mastery).unwrap_or(0.0);
    let average_attention = if points.is_empty() {
        0.0
    } else {
        points.iter().map(|p| p.attention).sum::<f64>() / points.len() as f64
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: LearningCurveResult {
            points,
            trend,
            current_mastery,
            average_attention,
        },
    }))
}

async fn select_learning_curve_pg(
    pool: &PgPool,
    user_id: &str,
    start_date: chrono::NaiveDate,
) -> Result<Vec<LearningCurvePoint>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT "date", "attention", "fatigue", "motivation", "memory"
        FROM "user_state_history"
        WHERE "userId" = $1 AND "date" >= $2
        ORDER BY "date" ASC
        "#,
    )
    .bind(user_id)
    .bind(start_date)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut points = Vec::with_capacity(rows.len());
    for row in rows {
        let date: chrono::NaiveDate = row
            .try_get("date")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let attention: f64 = row
            .try_get("attention")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let fatigue: f64 = row
            .try_get("fatigue")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let motivation: f64 = row
            .try_get("motivation")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
        let memory: f64 = row
            .try_get("memory")
            .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

        points.push(LearningCurvePoint {
            date: format!("{}T00:00:00.000Z", date.format("%Y-%m-%d")),
            mastery: memory * 100.0,
            attention,
            fatigue,
            motivation,
        });
    }

    Ok(points)
}

fn compute_mastery_trend(values: &[f64]) -> String {
    if values.len() < 2 {
        return "flat".to_string();
    }
    let delta = values[values.len() - 1] - values[0];
    if delta > 5.0 {
        return "up".to_string();
    }
    if delta < -5.0 {
        return "down".to_string();
    }
    "flat".to_string()
}

async fn get_phase(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let pool = proxy.pool();

    let phase = match load_cold_start_phase(pool, &user.id).await? {
        Some(value) => value,
        None => infer_phase_from_interactions(pool, &user.id).await?,
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: PhaseResult {
            description: phase_description(&phase).to_string(),
            phase,
        },
    }))
}

async fn load_cold_start_phase(pool: &PgPool, user_id: &str) -> Result<Option<String>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT "coldStartState"
        FROM "amas_user_states"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let Some(row) = row else { return Ok(None) };
    let value: Option<serde_json::Value> = row
        .try_get("coldStartState")
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;
    Ok(extract_phase_from_json(value.as_ref()))
}

fn extract_phase_from_json(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    match value {
        serde_json::Value::String(phase) => normalize_phase(phase).map(|v| v.to_string()),
        serde_json::Value::Object(map) => map
            .get("phase")
            .and_then(|phase| phase.as_str())
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

async fn infer_phase_from_interactions(pool: &PgPool, user_id: &str) -> Result<String, AppError> {
    let count = count_recent_interactions(pool, user_id).await?;
    if count < 5 {
        return Ok("classify".to_string());
    }
    if count < 8 {
        return Ok("explore".to_string());
    }
    Ok("normal".to_string())
}

async fn count_recent_interactions(pool: &PgPool, user_id: &str) -> Result<i64, AppError> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(1) FROM (
            SELECT 1 FROM "answer_records"
            WHERE "userId" = $1
            LIMIT 8
        ) AS t
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))
}

async fn get_trend_intervention(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let pool = proxy.pool();

    let (trend_state, consecutive_days) = load_current_trend(pool, &user.id).await?;
    let result = compute_intervention(&trend_state, consecutive_days);

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn load_current_trend(pool: &PgPool, user_id: &str) -> Result<(String, i64), AppError> {
    let trend_state: Option<String> = sqlx::query_scalar(
        r#"
        SELECT "trendState"
        FROM "amas_user_states"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let rows = sqlx::query(
        r#"
        SELECT "trendState", "motivation", "memory", "speed"
        FROM "user_state_history"
        WHERE "userId" = $1
        ORDER BY "date" DESC
        LIMIT 30
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let mut history = Vec::with_capacity(rows.len());
    for row in rows {
        let trend_state: Option<String> = row.try_get("trendState").ok();
        let motivation: f64 = row.try_get("motivation").unwrap_or(0.0);
        let memory: f64 = row.try_get("memory").unwrap_or(0.0);
        let speed: f64 = row.try_get("speed").unwrap_or(0.0);
        history.push(TrendHistoryPoint {
            trend_state,
            motivation,
            memory,
            speed,
        });
    }

    let state = trend_state
        .as_deref()
        .and_then(normalize_trend_state)
        .map(|v| v.to_string())
        .unwrap_or_else(|| calculate_trend_from_history(&history));

    let consecutive_days = calculate_consecutive_days(&history, &state);
    Ok((state, consecutive_days))
}

fn normalize_trend_state(value: &str) -> Option<&'static str> {
    match value {
        "up" => Some("up"),
        "flat" => Some("flat"),
        "stuck" => Some("stuck"),
        "down" => Some("down"),
        _ => None,
    }
}

fn calculate_trend_from_history(history: &[TrendHistoryPoint]) -> String {
    if history.len() < 2 {
        return "flat".to_string();
    }

    let recent = history.iter().take(7).collect::<Vec<_>>();
    let previous = history.iter().skip(7).take(7).collect::<Vec<_>>();

    if previous.is_empty() {
        return "flat".to_string();
    }

    let avg = |items: &[&TrendHistoryPoint]| -> f64 {
        let sum = items
            .iter()
            .map(|item| (item.motivation + item.memory + item.speed) / 3.0)
            .sum::<f64>();
        sum / items.len() as f64
    };

    let recent_avg = avg(&recent);
    let previous_avg = avg(&previous);
    let denominator = if previous_avg == 0.0 {
        1.0
    } else {
        previous_avg
    };
    let change = (recent_avg - previous_avg) / denominator;

    const TREND_CHANGE_THRESHOLD: f64 = 0.1;
    const MINOR_CHANGE_THRESHOLD: f64 = 0.05;

    if change > TREND_CHANGE_THRESHOLD {
        return "up".to_string();
    }
    if change < -TREND_CHANGE_THRESHOLD {
        return "down".to_string();
    }
    if change.abs() < MINOR_CHANGE_THRESHOLD {
        return "flat".to_string();
    }
    "stuck".to_string()
}

fn calculate_consecutive_days(history: &[TrendHistoryPoint], current_state: &str) -> i64 {
    if history.is_empty() {
        return 1;
    }
    let mut count = 0i64;
    for item in history {
        if item.trend_state.as_deref() == Some(current_state) {
            count += 1;
        } else {
            break;
        }
    }
    if count > 0 {
        count
    } else {
        1
    }
}

fn compute_intervention(trend_state: &str, consecutive_days: i64) -> InterventionResult {
    if matches!(trend_state, "up" | "flat") {
        return InterventionResult {
            needs_intervention: false,
            kind: None,
            message: None,
            actions: None,
        };
    }

    const CONSECUTIVE_DOWN_THRESHOLD: i64 = 3;

    if trend_state == "down" {
        if consecutive_days > CONSECUTIVE_DOWN_THRESHOLD {
            return InterventionResult {
                needs_intervention: true,
                kind: Some("warning".to_string()),
                message: Some(format!(
                    "您的学习状态已连续{consecutive_days}天下降，建议调整学习计划"
                )),
                actions: Some(vec![
                    "减少每日学习量".to_string(),
                    "选择更简单的词书".to_string(),
                    "调整学习时间到黄金时段".to_string(),
                    "休息一天后再继续".to_string(),
                ]),
            };
        }
        return InterventionResult {
            needs_intervention: true,
            kind: Some("suggestion".to_string()),
            message: Some("您的学习状态有所下降，建议适当调整".to_string()),
            actions: Some(vec![
                "尝试在精力充沛时学习".to_string(),
                "减少单次学习时长".to_string(),
                "增加复习比例".to_string(),
            ]),
        };
    }

    InterventionResult {
        needs_intervention: true,
        kind: Some("encouragement".to_string()),
        message: Some("您的学习进入了平台期，这是正常现象".to_string()),
        actions: Some(vec![
            "尝试新的学习方法".to_string(),
            "挑战更难的单词".to_string(),
            "设定小目标激励自己".to_string(),
        ]),
    }
}

async fn reset_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    reset_user_state(proxy.as_ref(), &user.id).await?;

    Ok(Json(SuccessMessageResponse {
        success: true,
        message: "AMAS状态已重置".to_string(),
    }))
}

async fn reset_user_state(proxy: &crate::db::DatabaseProxy, user_id: &str) -> Result<(), AppError> {
    crate::services::amas::reset_user(proxy, user_id)
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    Ok(())
}

struct RecentAnswer {
    response_time: i64,
    is_correct: bool,
}

async fn load_recent_answers(pool: &PgPool, user_id: &str, limit: i32) -> Vec<RecentAnswer> {
    let rows = sqlx::query(
        r#"
        SELECT "responseTime", "isCorrect"
        FROM "answer_records"
        WHERE "userId" = $1 AND "responseTime" IS NOT NULL
        ORDER BY "createdAt" DESC
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await;

    match rows {
        Ok(rows) => rows
            .iter()
            .filter_map(|row| {
                let rt: Option<i64> = row.try_get("responseTime").ok();
                let correct: Option<bool> = row.try_get("isCorrect").ok();
                match (rt, correct) {
                    (Some(rt), Some(c)) => Some(RecentAnswer {
                        response_time: rt,
                        is_correct: c,
                    }),
                    _ => None,
                }
            })
            .collect(),
        Err(_) => vec![],
    }
}

fn calculate_performance_features(answers: &[RecentAnswer]) -> (f64, f64) {
    if answers.is_empty() {
        return (0.0, 0.7);
    }

    let rts: Vec<f64> = answers.iter().map(|a| a.response_time as f64).collect();
    let rt_mean = rts.iter().sum::<f64>() / rts.len() as f64;
    let rt_cv = if rt_mean > 0.0 {
        let variance = rts.iter().map(|rt| (rt - rt_mean).powi(2)).sum::<f64>() / rts.len() as f64;
        variance.sqrt() / rt_mean
    } else {
        0.0
    };

    let correct_count = answers.iter().filter(|a| a.is_correct).count();
    let recent_accuracy = correct_count as f64 / answers.len() as f64;

    (rt_cv.min(2.0), recent_accuracy)
}

struct VisualFatigueData {
    score: f64,
    confidence: f64,
}

async fn load_latest_visual_fatigue(
    pool: &PgPool,
    user_id: &str,
    session_id: Option<&str>,
) -> Option<VisualFatigueData> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let freshness_threshold_ms = 30 * 1000i64;

    let row = match session_id {
        Some(sid) if !sid.is_empty() => sqlx::query(
            r#"
                SELECT "score", "confidence", "createdAt"
                FROM "visual_fatigue_records"
                WHERE "userId" = $1 AND "sessionId" = $2
                ORDER BY "createdAt" DESC
                LIMIT 1
                "#,
        )
        .bind(user_id)
        .bind(sid)
        .fetch_optional(pool)
        .await
        .ok()?,
        _ => sqlx::query(
            r#"
                SELECT "score", "confidence", "createdAt"
                FROM "visual_fatigue_records"
                WHERE "userId" = $1
                ORDER BY "createdAt" DESC
                LIMIT 1
                "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()?,
    }?;

    let created_at: chrono::NaiveDateTime = row.try_get("createdAt").ok()?;
    let record_ms = created_at.and_utc().timestamp_millis();

    if now_ms - record_ms > freshness_threshold_ms {
        return None;
    }

    Some(VisualFatigueData {
        score: row.try_get("score").ok()?,
        confidence: row.try_get("confidence").ok()?,
    })
}

async fn load_session_duration_minutes(pool: &PgPool, session_id: &str) -> f64 {
    let row = sqlx::query(
        r#"
        SELECT "startedAt"
        FROM "learning_sessions"
        WHERE "id" = $1
        LIMIT 1
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await;

    match row {
        Ok(Some(r)) => {
            let started_at: Option<chrono::NaiveDateTime> = r.try_get("startedAt").ok();
            started_at
                .map(|s| {
                    let now = chrono::Utc::now().naive_utc();
                    (now - s).num_seconds() as f64 / 60.0
                })
                .unwrap_or(0.0)
                .max(0.0)
        }
        _ => 0.0,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlgorithmMetricsHistoryItem {
    algorithm_id: String,
    day: String,
    call_count: i64,
    total_latency_us: i64,
    avg_latency_ms: f64,
    error_count: i64,
    last_called_at: Option<String>,
}

async fn get_algorithm_metrics_history(
    State(state): State<AppState>,
    Query(query): Query<MetricsHistoryQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let today = Utc::now().date_naive();
    let start_date = query
        .start_date
        .as_ref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| today - Duration::days(30));
    let end_date = query
        .end_date
        .as_ref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or(today);

    if start_date > end_date {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "startDate 不能晚于 endDate",
        ));
    }

    let rows = list_algorithm_metrics_daily(
        proxy.as_ref(),
        start_date,
        end_date,
        query.algorithm_id.as_deref(),
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to fetch algorithm metrics history");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "获取历史数据失败",
        )
    })?;

    let data: Vec<AlgorithmMetricsHistoryItem> = rows
        .into_iter()
        .map(|row| {
            let avg_latency_ms = if row.call_count > 0 {
                let avg = row.total_latency_us as f64 / row.call_count as f64 / 1000.0;
                (avg * 10000.0).round() / 10000.0
            } else {
                0.0
            };

            AlgorithmMetricsHistoryItem {
                algorithm_id: row.algorithm_id,
                day: row.day.format("%Y-%m-%d").to_string(),
                call_count: row.call_count,
                total_latency_us: row.total_latency_us,
                avg_latency_ms,
                error_count: row.error_count,
                last_called_at: row
                    .last_called_at
                    .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
            }
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

// ==================== UMM Vocabulary Specialization Data Loading ====================

use crate::amas::types::{ConfusionPairInput, ContextEntryInput, MorphemeStateInput};

/// Load morpheme mastery states for a word's morphemes
async fn load_morpheme_states_for_word(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
) -> Vec<MorphemeStateInput> {
    let result = sqlx::query(
        r#"
        SELECT ums."morphemeId", ums."masteryLevel"
        FROM "user_morpheme_states" ums
        JOIN "word_morphemes" wm ON wm."morphemeId" = ums."morphemeId"
        WHERE ums."userId" = $1 AND wm."wordId" = $2
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => rows
            .iter()
            .map(|row| MorphemeStateInput {
                morpheme_id: row.get("morphemeId"),
                mastery_level: row.get("masteryLevel"),
            })
            .collect(),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to load morpheme states");
            vec![]
        }
    }
}

/// Load confusion pairs for a word
async fn load_confusion_pairs_for_word(pool: &PgPool, word_id: &str) -> Vec<ConfusionPairInput> {
    let result = sqlx::query(
        r#"
        SELECT "word2Id" as confusing_word_id, "distance"
        FROM "confusion_pairs_cache"
        WHERE "word1Id" = $1 AND "distance" < 0.5
        UNION
        SELECT "word1Id" as confusing_word_id, "distance"
        FROM "confusion_pairs_cache"
        WHERE "word2Id" = $1 AND "distance" < 0.5
        ORDER BY "distance" ASC
        LIMIT 10
        "#,
    )
    .bind(word_id)
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => rows
            .iter()
            .map(|row| ConfusionPairInput {
                confusing_word_id: row.get("confusing_word_id"),
                distance: row.get("distance"),
            })
            .collect(),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to load confusion pairs");
            vec![]
        }
    }
}

/// Load recent word IDs from session
async fn load_recent_word_ids(
    pool: &PgPool,
    user_id: &str,
    session_id: &str,
    limit: i32,
) -> Vec<String> {
    let result = sqlx::query(
        r#"
        SELECT "wordId"
        FROM "answer_records"
        WHERE "userId" = $1 AND "sessionId" = $2
        ORDER BY "createdAt" DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(session_id)
    .bind(limit)
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => rows.iter().map(|row| row.get("wordId")).collect(),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to load recent word IDs");
            vec![]
        }
    }
}

/// Load context history for EVM (encoding variability)
async fn load_context_history(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
    limit: i32,
) -> Vec<ContextEntryInput> {
    let result = sqlx::query(
        r#"
        SELECT
            EXTRACT(HOUR FROM "createdAt")::int as hour_of_day,
            EXTRACT(DOW FROM "createdAt")::int as day_of_week,
            COALESCE("questionType", 'unknown') as question_type,
            COALESCE("deviceType", 'unknown') as device_type
        FROM "answer_records"
        WHERE "userId" = $1 AND "wordId" = $2
        ORDER BY "createdAt" DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .bind(limit)
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => rows
            .iter()
            .map(|row| {
                let hour: i32 = row.get("hour_of_day");
                let day: i32 = row.get("day_of_week");
                ContextEntryInput {
                    hour_of_day: hour as u8,
                    day_of_week: day as u8,
                    question_type: row.get("question_type"),
                    device_type: row.get("device_type"),
                }
            })
            .collect(),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to load context history");
            vec![]
        }
    }
}
