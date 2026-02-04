use chrono::Timelike;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::amas::config::AMASConfig;
use crate::amas::decision::{ColdStartManager, EnsembleDecision};
use crate::amas::metrics::AlgorithmId;
use crate::amas::modeling::{
    ActiveUserClassifier, AdaptiveItemResponse, AdfFeatures, AdfState, AirItemParams, AirResponse,
    AirUserState, AttentionDynamicsFilter, AucState, BayesianCognitiveProfiler,
    BcpObservation, BcpState, CognitiveFatigueInput, MdsEvent,
    MentalFatigueInput, MotivationDynamics, MtdState, MultiScaleTrendDetector,
    PlForgettingConfig, PlForgettingCurve, PlForgettingInput, ProbeResponse,
    TriPoolFatigue, TriPoolFatigueState,
};
use crate::amas::monitoring::AMASMonitor;
use crate::amas::persistence::AMASPersistence;
use crate::amas::types::*;
use crate::db::DatabaseProxy;
use crate::track_algorithm;
use crate::amas::decision::{IgeModel, SwdModel};
use crate::amas::memory::{
    compute_adaptive_mastery_with_history, MasteryContext, MasteryHistory, MemoryEngine,
    MdmState, MsmtModel, ReviewEvent as MsmtReviewEvent,
};
use crate::amas::memory::mdm::compute_quality as mdm_compute_quality;
use crate::amas::vocabulary::{ConfusionPair, ContextEntry, MorphemeState};
use crate::services::user_profile::get_reward_profile;

struct UserModels {
    cold_start: Option<ColdStartManager>,
    ige: IgeModel,
    swd: SwdModel,
}

impl UserModels {
    fn new(config: &AMASConfig) -> Self {
        Self {
            cold_start: Some(ColdStartManager::new(config.cold_start.clone())),
            ige: IgeModel::new(),
            swd: SwdModel::new(),
        }
    }

    fn from_cold_start_state(config: &AMASConfig, cold_start: ColdStartState) -> Self {
        Self {
            cold_start: Some(ColdStartManager::from_state(
                config.cold_start.clone(),
                cold_start,
            )),
            ige: IgeModel::new(),
            swd: SwdModel::new(),
        }
    }
}

fn restore_algorithm_state<T: Default + serde::de::DeserializeOwned>(
    algorithm_states: &Option<serde_json::Value>,
    key: &str,
) -> T {
    algorithm_states
        .as_ref()
        .and_then(|s| s.get(key))
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

pub struct AMASEngine {
    config: Arc<RwLock<AMASConfig>>,
    persistence: Option<Arc<AMASPersistence>>,
    ensemble: Arc<RwLock<EnsembleDecision>>,
    user_models: Arc<RwLock<HashMap<String, UserModels>>>,
    user_states: Arc<RwLock<HashMap<String, PersistedAMASState>>>,
    monitor: Option<Arc<AMASMonitor>>,
    db_proxy: Option<Arc<DatabaseProxy>>,
}

impl AMASEngine {
    pub fn new(config: AMASConfig, db_proxy: Option<Arc<DatabaseProxy>>) -> Self {
        let persistence = db_proxy
            .as_ref()
            .map(|proxy| Arc::new(AMASPersistence::new(Arc::clone(proxy))));
        let monitor = db_proxy
            .as_ref()
            .map(|proxy| Arc::new(AMASMonitor::new(Arc::clone(proxy))));
        let ensemble =
            EnsembleDecision::with_config(config.feature_flags.clone(), config.ensemble.clone());

        Self {
            config: Arc::new(RwLock::new(config)),
            persistence,
            ensemble: Arc::new(RwLock::new(ensemble)),
            user_models: Arc::new(RwLock::new(HashMap::new())),
            user_states: Arc::new(RwLock::new(HashMap::new())),
            monitor,
            db_proxy,
        }
    }

    pub async fn reload_config(&self) -> Result<(), String> {
        let new_config = AMASConfig::from_env();
        let new_ensemble = EnsembleDecision::with_config(
            new_config.feature_flags.clone(),
            new_config.ensemble.clone(),
        );

        {
            let mut config = self.config.write().await;
            *config = new_config;
        }
        {
            let mut ensemble = self.ensemble.write().await;
            *ensemble = new_ensemble;
        }

        tracing::info!("AMAS config reloaded");
        Ok(())
    }

    pub async fn get_config(&self) -> AMASConfig {
        self.config.read().await.clone()
    }

    pub async fn set_feature_flags(&self, flags: crate::amas::config::FeatureFlags) {
        {
            let mut config = self.config.write().await;
            config.feature_flags = flags.clone();
        }
        {
            let mut ensemble = self.ensemble.write().await;
            ensemble.set_feature_flags(flags);
        }
        tracing::info!("AMAS feature flags updated at runtime");
    }

    pub async fn process_event(
        &self,
        user_id: &str,
        event: RawEvent,
        options: ProcessOptions,
    ) -> Result<ProcessResult, String> {
        let start_time = Instant::now();
        let config = self.config.read().await.clone();

        let mut state = self.load_or_init_state(user_id).await;
        let mut models = self.get_or_init_models(user_id, &state, &config).await;

        let feature_vector = self.build_feature_vector(&event, &state.user_state, &config);

        let (new_user_state, algo_states) = self.update_modeling(
            &mut models,
            &event,
            &state.user_state,
            &options,
            &config,
            &state.algorithm_states,
        );

        let mut auc_state_to_save: Option<AucState> = None;
        let cold_start_result = if let Some(ref mut cs) = models.cold_start {
            if !cs.is_complete() {
                let accuracy = if event.is_correct { 1.0 } else { 0.0 };
                let signals = crate::amas::decision::coldstart::ColdStartSignals {
                    attention: new_user_state.attention,
                    motivation: new_user_state.motivation,
                    cognitive_mem: new_user_state.cognitive.mem,
                    rt_variance: options.rt_cv.unwrap_or(0.5),
                    has_signals: true,
                };

                // AUC classification to augment cold start
                let auc = ActiveUserClassifier::default();
                let mut auc_state: AucState =
                    restore_algorithm_state(&state.algorithm_states, "auc");
                let auc_output = track_algorithm!(
                    AlgorithmId::Auc,
                    auc.update(&mut auc_state, &ProbeResponse {
                        is_correct: event.is_correct,
                        response_time_ms: event.response_time,
                        difficulty: state.current_strategy.difficulty.difficulty_range().0,
                    })
                );

                if let Some(auc_user_type) = auc_output.classified {
                    let mapped_type = match auc_user_type {
                        crate::amas::modeling::auc::UserType::Fast => UserType::Fast,
                        crate::amas::modeling::auc::UserType::Stable => UserType::Stable,
                        crate::amas::modeling::auc::UserType::Cautious => UserType::Cautious,
                    };
                    auc_state_to_save = Some(auc_state);
                    Some(StrategyParams::for_user_type(mapped_type))
                } else {
                    auc_state_to_save = Some(auc_state);
                    track_algorithm!(
                        AlgorithmId::ColdStartManager,
                        cs.update_with_signals(accuracy, event.response_time, &signals)
                    )
                }
            } else {
                None
            }
        } else {
            None
        };

        let current_strategy = options
            .current_params
            .clone()
            .unwrap_or(state.current_strategy.clone());

        let (new_strategy, candidates) = if let Some(ref cs_strategy) = cold_start_result {
            (cs_strategy.clone(), vec![])
        } else if !config.feature_flags.ensemble_enabled {
            (current_strategy.clone(), vec![])
        } else {
            let strategy_candidates =
                self.generate_strategy_candidates(&current_strategy, &new_user_state);

            // UMM IGE for strategy exploration
            let ige_action = {
                let strategy_keys: Vec<String> = strategy_candidates
                    .iter()
                    .map(|s| format!("{:?}:{}", s.difficulty, s.batch_size))
                    .collect();
                let context_key = Some(format!(
                    "{}:{}",
                    (new_user_state.attention * 10.0).floor() as i32,
                    (new_user_state.fatigue * 10.0).floor() as i32
                ));
                track_algorithm!(
                    AlgorithmId::Ige,
                    models
                        .ige
                        .select_action(&strategy_keys, context_key.as_deref())
                        .and_then(|key| {
                            strategy_candidates
                                .iter()
                                .find(|s| format!("{:?}:{}", s.difficulty, s.batch_size) == key)
                                .cloned()
                        })
                )
            };
            let ige_confidence = ige_action.as_ref().map(|a| {
                let key = format!("{:?}:{}", a.difficulty, a.batch_size);
                models.ige.get_confidence(&key, None)
            });

            // UMM SWD for strategy decision
            let swd_context_vec: Vec<f64> = vec![
                new_user_state.attention,
                new_user_state.fatigue,
                new_user_state.motivation,
                new_user_state.cognitive.mem,
            ];
            let swd_action = {
                let strategy_keys: Vec<String> = strategy_candidates
                    .iter()
                    .map(|s| format!("{:?}:{}", s.difficulty, s.batch_size))
                    .collect();
                track_algorithm!(
                    AlgorithmId::Swd,
                    models
                        .swd
                        .select_action(&swd_context_vec, &strategy_keys)
                        .and_then(|key| {
                            strategy_candidates
                                .iter()
                                .find(|s| format!("{:?}:{}", s.difficulty, s.batch_size) == key)
                                .cloned()
                        })
                )
            };
            let swd_confidence = swd_action.as_ref().map(|a| {
                let key = format!("{:?}:{}", a.difficulty, a.batch_size);
                models.swd.get_confidence(&key)
            });
            let swd_recommendation = models.swd.recommend_additional_count(&swd_context_vec);

            let ensemble = self.ensemble.read().await;
            let (raw_strategy, candidates) = track_algorithm!(
                AlgorithmId::Heuristic,
                ensemble.decide(
                    &new_user_state,
                    &feature_vector,
                    &current_strategy,
                    ige_action.as_ref(),
                    ige_confidence,
                    swd_action.as_ref(),
                    swd_confidence,
                )
            );

            let session_info =
                options
                    .total_sessions
                    .map(|total| crate::amas::decision::ensemble::SessionInfo {
                        total_sessions: total,
                        duration_minutes: options.study_duration_minutes.unwrap_or(0.0),
                    });
            let mut filtered_strategy =
                ensemble.post_filter(raw_strategy, &new_user_state, session_info.as_ref());
            filtered_strategy.swd_recommendation = swd_recommendation;

            (filtered_strategy, candidates)
        };

        let reward = self.compute_reward(&event, &new_user_state, &options, &config);

        if cold_start_result.is_none() {
            {
                let mut ensemble = self.ensemble.write().await;
                ensemble.update_performance(&candidates, &new_strategy, reward.value);
            }
        }

        let explanation = self.build_explanation(
            &candidates,
            &new_user_state,
            &current_strategy,
            &new_strategy,
        );

        // Convert vocabulary specialization inputs
        let morpheme_states: Vec<MorphemeState> = options
            .morpheme_states
            .as_ref()
            .map(|ms| {
                ms.iter()
                    .map(|m| MorphemeState {
                        morpheme_id: m.morpheme_id.clone(),
                        mastery_level: m.mastery_level,
                    })
                    .collect()
            })
            .unwrap_or_default();

        let confusion_pairs: Vec<ConfusionPair> = options
            .confusion_pairs
            .as_ref()
            .map(|cp| {
                cp.iter()
                    .map(|c| ConfusionPair {
                        confusing_word_id: c.confusing_word_id.clone(),
                        distance: c.distance,
                    })
                    .collect()
            })
            .unwrap_or_default();

        let recent_word_ids: Vec<String> = options.recent_word_ids.clone().unwrap_or_default();

        let context_history: Vec<ContextEntry> = options
            .context_history
            .as_ref()
            .map(|ch| {
                ch.iter()
                    .map(|c| ContextEntry {
                        hour_of_day: c.hour_of_day,
                        day_of_week: c.day_of_week,
                        question_type: c.question_type.clone(),
                        device_type: c.device_type.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Load AIR user state for potential use in word mastery calculation
        let mut air_user_state_to_save: Option<AirUserState> = None;

        // Calculate interval using UMM (MDM + vocabulary specialization)
        let word_mastery_decision = event.word_id.as_ref().map(|wid| {
            let quality = mdm_compute_quality(
                event.is_correct,
                event.response_time,
                if event.hint_used { 1 } else { 0 },
            );

            // AIR: Adaptive Item Response
            let air_result = {
                let air = AdaptiveItemResponse::default();
                let mut air_user: AirUserState =
                    restore_algorithm_state(&state.algorithm_states, "air_user");

                let (init_alpha, init_beta) = options
                    .word_state
                    .as_ref()
                    .map(|ws| {
                        (
                            ws.air_alpha.unwrap_or(1.0),
                            ws.air_beta.unwrap_or(0.0),
                        )
                    })
                    .unwrap_or((1.0, 0.0));

                let mut air_item = AirItemParams {
                    alpha: init_alpha,
                    beta: init_beta,
                };

                let air_out = track_algorithm!(
                    AlgorithmId::Air,
                    air.update(&mut air_user, &mut air_item, &AirResponse {
                        is_correct: event.is_correct,
                    })
                );

                air_user_state_to_save = Some(air_user);
                Some((air_out.theta, air_out.item_alpha, air_out.item_beta, air_out.probability, air_out.confidence))
            };

            if let Some(ref ws) = options.word_state {
                let now_ts = chrono::Utc::now().timestamp_millis();
                let desired_retention =
                    self.adjust_retention(ws.desired_retention, &new_user_state, &options, &config);

                // Load or create MDM state
                let mut mdm = if let (Some(s), Some(c)) = (ws.amas_strength, ws.amas_consolidation) {
                    MdmState {
                        strength: s,
                        consolidation: c,
                        last_review_ts: ws.amas_last_review_ts.unwrap_or(0),
                    }
                } else {
                    // Migrate from FSRS
                    MdmState::from_fsrs(ws.stability, ws.difficulty)
                };

                // Compute retrievability BEFORE update (with vocabulary specialization)
                let prev_retrievability = track_algorithm!(
                    AlgorithmId::Mdm,
                    MemoryEngine::compute_retrievability(
                        &mdm,
                        ws.elapsed_days,
                        &morpheme_states,
                        &confusion_pairs,
                        &recent_word_ids,
                        &context_history,
                    )
                );

                // Update MDM state
                mdm.update(quality, now_ts);

                // Calculate interval with vocabulary specialization
                let new_interval = track_algorithm!(
                    AlgorithmId::Mdm,
                    MemoryEngine::compute_interval(
                        &mdm,
                        desired_retention,
                        &morpheme_states,
                        &confusion_pairs,
                        &recent_word_ids,
                        &context_history,
                    )
                );

                // New retrievability after update
                let new_retrievability = mdm.retrievability(0.0);

                // Adaptive mastery decision based on user's personal cognitive profile
                let mastery_context = MasteryContext {
                    is_first_attempt: ws.reps == 0,
                    correct_count: if event.is_correct {
                        ws.reps + 1
                    } else {
                        ws.reps - ws.lapses
                    },
                    total_attempts: ws.reps + 1,
                    response_time_ms: event.response_time,
                    hint_used: event.hint_used,
                    consecutive_correct: if event.is_correct {
                        // Estimate consecutive correct from lapses ratio
                        ((ws.reps - ws.lapses * 2).max(0) + 1).min(5)
                    } else {
                        0
                    },
                    indecision_index: None, // Passed via ProcessOptions in future
                    keystroke_fluency: None, // Passed via ProcessOptions in future
                };

                let mastery_result = compute_adaptive_mastery_with_history(
                    &mdm,
                    &new_user_state,
                    &mastery_context,
                    new_strategy.difficulty,
                    event.is_correct,
                    state.mastery_history.as_ref(),
                );

                WordMasteryDecision {
                    word_id: wid.clone(),
                    prev_mastery: prev_retrievability,
                    new_mastery: new_retrievability,
                    prev_interval: ws.scheduled_days,
                    new_interval: new_interval * new_strategy.interval_scale,
                    quality: if event.is_correct { 3 } else { 1 },
                    stability: mdm.strength,
                    difficulty: 1.0 - mdm.consolidation,
                    retrievability: new_retrievability,
                    // Guess veto: if user marked as guess and answered correctly, deny mastery
                    is_mastered: mastery_result.is_mastered && !(event.is_guess && event.is_correct),
                    lapses: if event.is_correct {
                        ws.lapses
                    } else {
                        ws.lapses + 1
                    },
                    reps: ws.reps + 1,
                    confidence: mastery_result.confidence,
                    amas_strength: Some(mdm.strength),
                    amas_consolidation: Some(mdm.consolidation),
                    amas_last_review_ts: Some(mdm.last_review_ts),
                    mastery_score: Some(mastery_result.score),
                    mastery_threshold: Some(mastery_result.threshold),
                    air_theta: air_result.map(|(theta, _, _, _, _)| theta),
                    air_alpha: air_result.map(|(_, alpha, _, _, _)| alpha),
                    air_beta: air_result.map(|(_, _, beta, _, _)| beta),
                    air_probability: air_result.map(|(_, _, _, prob, _)| prob),
                    air_confidence: air_result.map(|(_, _, _, _, conf)| conf),
                }
            } else {
                // New word
                let now_ts = chrono::Utc::now().timestamp_millis();
                let desired_retention =
                    self.adjust_retention(0.9, &new_user_state, &options, &config);

                let mut mdm = MdmState::new();
                mdm.update(quality, now_ts);

                let new_interval = track_algorithm!(
                    AlgorithmId::Mdm,
                    MemoryEngine::compute_interval(
                        &mdm,
                        desired_retention,
                        &morpheme_states,
                        &confusion_pairs,
                        &recent_word_ids,
                        &context_history,
                    )
                );

                let new_retrievability = mdm.retrievability(0.0);

                // Adaptive mastery decision for new word
                let mastery_context = MasteryContext {
                    is_first_attempt: true,
                    correct_count: if event.is_correct { 1 } else { 0 },
                    total_attempts: 1,
                    response_time_ms: event.response_time,
                    hint_used: event.hint_used,
                    consecutive_correct: if event.is_correct { 1 } else { 0 },
                    indecision_index: None,
                    keystroke_fluency: None,
                };

                let mastery_result = compute_adaptive_mastery_with_history(
                    &mdm,
                    &new_user_state,
                    &mastery_context,
                    new_strategy.difficulty,
                    event.is_correct,
                    state.mastery_history.as_ref(),
                );

                WordMasteryDecision {
                    word_id: wid.clone(),
                    prev_mastery: 0.0,
                    new_mastery: new_retrievability,
                    prev_interval: 0.0,
                    new_interval: new_interval * new_strategy.interval_scale,
                    quality: if event.is_correct { 3 } else { 1 },
                    stability: mdm.strength,
                    difficulty: 1.0 - mdm.consolidation,
                    retrievability: new_retrievability,
                    // Guess veto: if user marked as guess and answered correctly, deny mastery
                    is_mastered: mastery_result.is_mastered && !(event.is_guess && event.is_correct),
                    lapses: if event.is_correct { 0 } else { 1 },
                    reps: 1,
                    confidence: mastery_result.confidence,
                    amas_strength: Some(mdm.strength),
                    amas_consolidation: Some(mdm.consolidation),
                    amas_last_review_ts: Some(mdm.last_review_ts),
                    mastery_score: Some(mastery_result.score),
                    mastery_threshold: Some(mastery_result.threshold),
                    air_theta: air_result.map(|(theta, _, _, _, _)| theta),
                    air_alpha: air_result.map(|(_, alpha, _, _, _)| alpha),
                    air_beta: air_result.map(|(_, _, beta, _, _)| beta),
                    air_probability: air_result.map(|(_, _, _, prob, _)| prob),
                    air_confidence: air_result.map(|(_, _, _, _, conf)| conf),
                }
            }
        });

        // PLF: Power-Law Forgetting (shadow predictor)
        if let Some(ref ws) = options.word_state {
                let plf = PlForgettingCurve::new(PlForgettingConfig::default());
                let elapsed_ms = ws.elapsed_days * 86_400_000.0;
                let plf_out = track_algorithm!(
                    AlgorithmId::Plf,
                    plf.predict(&PlForgettingInput {
                        elapsed_ms: elapsed_ms.max(0.0),
                        review_count: ws.reps.max(0) as u32,
                        stability_days: if ws.stability > 0.0 {
                            Some(ws.stability)
                        } else {
                            None
                        },
                        difficulty: Some(ws.difficulty),
                    })
                );
                tracing::debug!(
                    user_id = %user_id,
                    word_id = ?event.word_id,
                    plf_retrievability = %plf_out.retrievability,
                    mdm_retrievability = ?word_mastery_decision.as_ref().map(|d| d.retrievability),
                    "PLF shadow prediction"
                );
            }

        let cold_start_phase = models.cold_start.as_ref().map(|cs| cs.phase());

        state.user_state = new_user_state.clone();
        state.current_strategy = new_strategy.clone();
        state.interaction_count += 1;
        state.last_updated = chrono::Utc::now().timestamp_millis();

        if let Some(ref cs) = models.cold_start {
            state.cold_start_state = Some(cs.state().clone());
        }

        // Store IGE/SWD model state for persistence
        state.bandit_model = Some(crate::amas::types::BanditModel {
            thompson_params: serde_json::to_value(&models.ige).ok(),
            linucb_state: serde_json::to_value(&models.swd).ok(),
            last_action_idx: None,
        });

        // Merge algorithm states for persistence (preserve existing states, add new ones)
        let mut final_algo_states = state
            .algorithm_states
            .as_ref()
            .and_then(|v| v.as_object())
            .cloned()
            .map(serde_json::Value::Object)
            .unwrap_or_else(|| serde_json::json!({}));

        if let (Some(final_obj), Some(delta_obj)) =
            (final_algo_states.as_object_mut(), algo_states.as_object())
        {
            for (k, v) in delta_obj {
                final_obj.insert(k.clone(), v.clone());
            }
        }
        if let Some(auc_state) = auc_state_to_save {
            if let Ok(v) = serde_json::to_value(&auc_state) {
                final_algo_states["auc"] = v;
            }
        }
        if let Some(air_user_state) = air_user_state_to_save {
            if let Ok(v) = serde_json::to_value(&air_user_state) {
                final_algo_states["air_user"] = v;
            }
        }
        if !final_algo_states.as_object().map_or(true, |o| o.is_empty()) {
            state.algorithm_states = Some(final_algo_states);
        }

        // Update mastery history for adaptive threshold
        if let Some(ref mastery) = word_mastery_decision {
            if let (Some(score), Some(threshold)) =
                (mastery.mastery_score, mastery.mastery_threshold)
            {
                let mut history = state
                    .mastery_history
                    .take()
                    .unwrap_or_else(MasteryHistory::new);
                history.record(
                    score,
                    threshold,
                    mastery.is_mastered,
                    chrono::Utc::now().timestamp_millis(),
                );
                state.mastery_history = Some(history);
            }
        }

        {
            let mut states = self.user_states.write().await;
            states.insert(user_id.to_string(), state.clone());
        }
        {
            let mut model_map = self.user_models.write().await;
            model_map.insert(user_id.to_string(), models);
        }

        if !options.skip_update.unwrap_or(false) {
            if let Some(ref persistence) = self.persistence {
                if let Err(e) = persistence.save_state(&state).await {
                    tracing::warn!(error = %e, user_id = %user_id, "Failed to save AMAS state");
                }
            }
        }

        // Compute objective evaluation
        let objective_evaluation =
            self.compute_objective_evaluation(&new_user_state, &new_strategy, &options);

        // Extract algorithm weights from candidates
        let algorithm_weights = if candidates.is_empty() {
            None
        } else {
            let total_weight: f64 = candidates.iter().map(|c| c.weight * c.confidence).sum();
            let normalize = |w: f64, c: f64| {
                if total_weight > 1e-6 {
                    (w * c) / total_weight
                } else {
                    0.0
                }
            };
            let mut weights = AlgorithmWeights::default();
            for c in &candidates {
                match c.source.as_str() {
                    "ige" => weights.ige = normalize(c.weight, c.confidence),
                    "swd" => weights.swd = normalize(c.weight, c.confidence),
                    "heuristic" => weights.heuristic = normalize(c.weight, c.confidence),
                    "coldstart" => weights.coldstart = normalize(c.weight, c.confidence),
                    _ => {}
                }
            }
            Some(weights)
        };

        let result = ProcessResult {
            state: new_user_state,
            strategy: new_strategy,
            reward,
            explanation,
            feature_vector: Some(feature_vector),
            word_mastery_decision,
            cold_start_phase,
            objective_evaluation: Some(objective_evaluation),
            multi_objective_adjusted: None,
            algorithm_weights,
        };

        // Record monitoring event
        if let Some(ref monitor) = self.monitor {
            let latency_ms = start_time.elapsed().as_millis() as i64;
            monitor
                .record_process_event(user_id, options.session_id.as_deref(), &result, latency_ms)
                .await;
        }

        Ok(result)
    }

    pub async fn get_user_state(&self, user_id: &str) -> Option<UserState> {
        {
            let states = self.user_states.read().await;
            if let Some(state) = states.get(user_id) {
                return Some(state.user_state.clone());
            }
        }
        if self.persistence.is_some() {
            let state = self.load_or_init_state(user_id).await;
            return Some(state.user_state);
        }
        None
    }

    pub async fn get_current_strategy(&self, user_id: &str) -> StrategyParams {
        {
            let states = self.user_states.read().await;
            if let Some(state) = states.get(user_id) {
                return state.current_strategy.clone();
            }
        }
        let state = self.load_or_init_state(user_id).await;
        state.current_strategy
    }

    pub async fn invalidate_cache(&self, user_id: &str) {
        {
            let mut states = self.user_states.write().await;
            states.remove(user_id);
        }
        {
            let mut models = self.user_models.write().await;
            models.remove(user_id);
        }
    }

    pub async fn cleanup_stale_users(&self, max_age_ms: i64) -> usize {
        let now = chrono::Utc::now().timestamp_millis();

        let stale_users: Vec<String> = {
            let states = self.user_states.read().await;
            states
                .iter()
                .filter(|(_, state)| now - state.last_updated > max_age_ms)
                .map(|(user_id, _)| user_id.clone())
                .collect()
        };

        let removed_count = stale_users.len();

        if !stale_users.is_empty() {
            {
                let mut states = self.user_states.write().await;
                for user_id in &stale_users {
                    states.remove(user_id);
                }
            }
            {
                let mut models = self.user_models.write().await;
                for user_id in &stale_users {
                    models.remove(user_id);
                }
            }
        }

        removed_count
    }

    pub async fn get_cache_stats(&self) -> (usize, usize) {
        let states_count = self.user_states.read().await.len();
        let models_count = self.user_models.read().await.len();
        (states_count, models_count)
    }

    async fn load_or_init_state(&self, user_id: &str) -> PersistedAMASState {
        {
            let states = self.user_states.read().await;
            if let Some(state) = states.get(user_id) {
                return state.clone();
            }
        }

        // Load reward profile from database
        let reward_profile = if let Some(ref proxy) = self.db_proxy {
            get_reward_profile(proxy.pool(), user_id)
                .await
                .ok()
                .filter(|p| p != "standard")
        } else {
            None
        };

        if let Some(ref persistence) = self.persistence {
            if let Some(mut state) = persistence.load_state(user_id).await {
                // 基于时间的疲劳衰减（会话级状态隔离）
                // 使用 user_state.ts 而非 last_updated，因为 ts 反映实际交互时间
                let elapsed_minutes =
                    (chrono::Utc::now().timestamp_millis() - state.user_state.ts) as f64 / 60000.0;
                if elapsed_minutes >= 30.0 {
                    // 30分钟以上：完全重置疲劳和注意力
                    state.user_state.fatigue = 0.0;
                    state.user_state.attention = 0.7;
                } else if elapsed_minutes > 5.0 {
                    // 5-30分钟：指数衰减疲劳度
                    let decay_factor = (-0.05 * elapsed_minutes).exp();
                    state.user_state.fatigue *= decay_factor;
                }
                // 5分钟内：保持原状态

                // Apply reward profile
                state.user_state.reward_profile = reward_profile;

                let mut states = self.user_states.write().await;
                states.insert(user_id.to_string(), state.clone());
                return state;
            }
        }

        let mut user_state = UserState::default();
        user_state.reward_profile = reward_profile;

        let new_state = PersistedAMASState {
            user_id: user_id.to_string(),
            user_state,
            bandit_model: None,
            current_strategy: StrategyParams::default(),
            cold_start_state: Some(ColdStartState::default()),
            interaction_count: 0,
            last_updated: chrono::Utc::now().timestamp_millis(),
            mastery_history: None,
            ensemble_performance: None,
            algorithm_states: None,
        };

        let mut states = self.user_states.write().await;
        states.insert(user_id.to_string(), new_state.clone());

        new_state
    }

    async fn get_or_init_models(
        &self,
        user_id: &str,
        state: &PersistedAMASState,
        config: &AMASConfig,
    ) -> UserModels {
        {
            let models = self.user_models.read().await;
            if let Some(m) = models.get(user_id) {
                return self.create_models_from_state(
                    state,
                    config,
                    m.ige.clone(),
                    m.swd.clone(),
                    m.cold_start.as_ref().map(|cs| cs.state().clone()),
                );
            }
        }

        // Restore IGE/SWD models from persisted state
        let ige: IgeModel = state
            .bandit_model
            .as_ref()
            .and_then(|b| b.thompson_params.as_ref())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let swd: SwdModel = state
            .bandit_model
            .as_ref()
            .and_then(|b| b.linucb_state.as_ref())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let models = self.create_models_from_state(
            state,
            config,
            ige.clone(),
            swd.clone(),
            state.cold_start_state.clone(),
        );

        let mut model_map = self.user_models.write().await;
        model_map.insert(
            user_id.to_string(),
            self.create_models_from_state(state, config, ige, swd, state.cold_start_state.clone()),
        );

        models
    }

    fn create_models_from_state(
        &self,
        _state: &PersistedAMASState,
        config: &AMASConfig,
        ige: IgeModel,
        swd: SwdModel,
        cold_start_state: Option<ColdStartState>,
    ) -> UserModels {
        UserModels {
            cold_start: cold_start_state
                .map(|cs| ColdStartManager::from_state(config.cold_start.clone(), cs)),
            ige,
            swd,
        }
    }

    fn build_feature_vector(
        &self,
        event: &RawEvent,
        state: &UserState,
        config: &AMASConfig,
    ) -> FeatureVector {
        let rt_norm =
            (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);
        let dwell_norm = event
            .dwell_time
            .map(|d| (d as f64 / 10000.0).min(1.0))
            .unwrap_or(0.5);
        let retry_norm = (event.retry_count as f64 / 5.0).min(1.0);

        let hour = chrono::Utc::now().hour() as usize;
        let hour_norm = hour as f64 / 24.0;
        let time_pref = state
            .habit
            .as_ref()
            .and_then(|h| h.time_pref.get(hour).copied())
            .unwrap_or(0.5);

        let values = vec![
            rt_norm,
            dwell_norm,
            if event.is_correct { 1.0 } else { 0.0 },
            retry_norm,
            state.attention,
            state.fused_fatigue.unwrap_or(state.fatigue),
            state.motivation,
            state.cognitive.mem,
            hour_norm,
            time_pref,
        ];

        let labels = vec![
            "rt_norm".to_string(),
            "dwell_norm".to_string(),
            "correct".to_string(),
            "retry_norm".to_string(),
            "attention".to_string(),
            "fatigue".to_string(),
            "motivation".to_string(),
            "memory".to_string(),
            "hour_norm".to_string(),
            "time_pref".to_string(),
        ];

        FeatureVector::new(values, labels)
    }

    fn update_modeling(
        &self,
        _models: &mut UserModels,
        event: &RawEvent,
        prev_state: &UserState,
        options: &ProcessOptions,
        config: &AMASConfig,
        algorithm_states: &Option<serde_json::Value>,
    ) -> (UserState, serde_json::Value) {
        use crate::amas::modeling::fatigue_fusion::fuse_fatigue;

        let mut new_algo_states = serde_json::json!({});

        let rt_norm =
            (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);

        let break_minutes = event.paused_time_ms.map(|ms| ms as f64 / 60000.0);

        // ADF: Attention Dynamics Filter
        let adf = AttentionDynamicsFilter::default();
        let mut adf_state: AdfState = restore_algorithm_state(algorithm_states, "adf");
        let attention = track_algorithm!(
            AlgorithmId::Adf,
            adf.update(&mut adf_state, &AdfFeatures {
                rt_norm,
                accuracy: if event.is_correct { 1.0 } else { 0.0 },
                pause_count: event.pause_count as f64,
                switch_count: event.switch_count as f64,
                focus_loss: event.focus_loss_duration.map(|ms| ms as f64 / 60000.0).unwrap_or(0.0),
                interaction_density: event.interaction_density.unwrap_or(0.5),
            })
        );
        if let Ok(v) = serde_json::to_value(&adf_state) {
            new_algo_states["adf"] = v;
        }

        // TFM: Tri-pool Fatigue Model
        let tfm = TriPoolFatigue::default();
        let mut tfm_state: TriPoolFatigueState =
            restore_algorithm_state(algorithm_states, "tfm");
        let tfm_output = track_algorithm!(
            AlgorithmId::Tfm,
            tfm.update(
                &mut tfm_state,
                &CognitiveFatigueInput {
                    error_rate_trend: if event.is_correct { -0.05 } else { 0.1 },
                    rt_increase_rate: rt_norm,
                    repeat_errors: event.retry_count,
                },
                options.visual_fatigue_raw.as_ref(),
                &MentalFatigueInput {
                    consecutive_failures: 0,
                    is_quit: event.is_quit,
                    motivation: prev_state.motivation,
                },
                break_minutes,
            )
        );
        if let Ok(v) = serde_json::to_value(&tfm_state) {
            new_algo_states["tfm"] = v;
        }
        let fatigue = tfm_output.total;

        // BCP: Bayesian Cognitive Profiling
        let recent_accuracy =
            options
                .recent_accuracy
                .unwrap_or(if event.is_correct { 0.8 } else { 0.6 });
        let error_variance = recent_accuracy * (1.0 - recent_accuracy);

        let bcp = BayesianCognitiveProfiler::default();
        let mut bcp_state: BcpState = restore_algorithm_state(algorithm_states, "bcp");
        let bcp_output = track_algorithm!(
            AlgorithmId::Bcp,
            bcp.update(&mut bcp_state, &BcpObservation {
                accuracy: if event.is_correct { 1.0 } else { 0.0 },
                speed: (1.0 - rt_norm).clamp(0.0, 1.0),
                consistency: 1.0 - error_variance,
            })
        );
        if let Ok(v) = serde_json::to_value(&bcp_state) {
            new_algo_states["bcp"] = v;
        }
        let cognitive = CognitiveProfile {
            mem: bcp_output.mem,
            speed: bcp_output.speed,
            stability: bcp_output.stability,
        };

        // MSMT: Multi-Scale Memory Trace
        let msmt_mem = track_algorithm!(AlgorithmId::Msmt, self.compute_msmt_memory(options));

        let final_cognitive = if let Some(msmt_recall) = msmt_mem {
            let blended_mem = 0.6 * cognitive.mem + 0.4 * msmt_recall;
            CognitiveProfile {
                mem: blended_mem.clamp(0.0, 1.0),
                speed: cognitive.speed,
                stability: cognitive.stability,
            }
        } else {
            cognitive
        };

        // MDS: Motivation Dynamics System
        let mds = MotivationDynamics::default();
        let motivation = track_algorithm!(
            AlgorithmId::Mds,
            mds.update(prev_state.motivation, &MdsEvent {
                is_correct: event.is_correct,
                is_quit: event.is_quit,
            })
        );

        // MTD: Multi-scale Trend Detector
        let mastery_score =
            (final_cognitive.mem + final_cognitive.speed + final_cognitive.stability) / 3.0;
        let mtd = MultiScaleTrendDetector::default();
        let mut mtd_state: MtdState = restore_algorithm_state(algorithm_states, "mtd");
        let mtd_output = track_algorithm!(AlgorithmId::Mtd, mtd.update(&mut mtd_state, mastery_score));
        if let Ok(v) = serde_json::to_value(&mtd_state) {
            new_algo_states["mtd"] = v;
        }
        let trend = mtd_output.to_trend_state();

        let conf = (config.confidence_decay * prev_state.conf
            + (1.0 - config.confidence_decay) * 0.7)
            .max(config.min_confidence);

        let fused = fuse_fatigue(
            fatigue,
            options.visual_fatigue_score,
            options.visual_fatigue_confidence,
            options.study_duration_minutes.unwrap_or(0.0),
        );

        (
            UserState {
                attention,
                fatigue,
                cognitive: final_cognitive,
                motivation,
                habit: prev_state.habit.clone(),
                trend: Some(trend),
                conf,
                ts: chrono::Utc::now().timestamp_millis(),
                visual_fatigue: options
                    .visual_fatigue_score
                    .map(|score| VisualFatigueState {
                        score,
                        confidence: options.visual_fatigue_confidence.unwrap_or(0.5),
                        freshness: 1.0,
                        trend: 0.0,
                        last_updated: chrono::Utc::now().timestamp_millis(),
                    })
                    .or_else(|| prev_state.visual_fatigue.clone()),
                fused_fatigue: Some(fused),
                reward_profile: prev_state.reward_profile.clone(),
            },
            new_algo_states,
        )
    }

    fn compute_msmt_memory(&self, options: &ProcessOptions) -> Option<f64> {
        let history = options.word_review_history.as_ref()?;
        if history.is_empty() {
            return None;
        }

        let now_hours = 0.0;
        let events: Vec<MsmtReviewEvent> = history
            .iter()
            .map(|h| MsmtReviewEvent {
                timestamp_hours: now_hours - (h.seconds_ago as f64 / 3600.0),
                is_correct: h.is_correct.unwrap_or(true),
            })
            .collect();

        let recall = MsmtModel::predict_recall(&events, now_hours);
        Some(recall.clamp(0.0, 1.0))
    }

    fn adjust_retention(
        &self,
        base_retention: f64,
        state: &UserState,
        options: &ProcessOptions,
        _config: &AMASConfig,
    ) -> f64 {
        let accuracy = options.recent_accuracy.unwrap_or(0.7);
        let cognitive = (state.cognitive.mem + state.cognitive.stability) / 2.0;
        let fatigue = state.fused_fatigue.unwrap_or(state.fatigue);
        let motivation = (state.motivation + 1.0) / 2.0;

        let delta = 0.1 * (accuracy - 0.7)
            + 0.1 * (cognitive - 0.5)
            - 0.05 * (fatigue - 0.3)
            + 0.05 * (motivation - 0.5);

        let base = base_retention.clamp(0.8, 0.95);
        (base + delta).clamp(0.8, 0.95)
    }

    fn compute_reward(
        &self,
        event: &RawEvent,
        state: &UserState,
        _options: &ProcessOptions,
        config: &AMASConfig,
    ) -> Reward {
        let accuracy_score = if event.is_correct { 1.0 } else { 0.0 };

        let speed_score = 1.0
            - (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);

        let stability_score = state.cognitive.stability;

        let retention_score = state.cognitive.mem;

        let reward_value = config.reward.accuracy_weight * accuracy_score
            + config.reward.speed_weight * speed_score
            + config.reward.stability_weight * stability_score
            + config.reward.retention_weight * retention_score;

        let reward_value = (reward_value * 2.0 - 1.0).clamp(-1.0, 1.0);

        let reason = if event.is_correct {
            if speed_score > 0.7 {
                "正确且快速回答"
            } else {
                "正确回答"
            }
        } else if event.hint_used {
            "使用提示后回答"
        } else {
            "回答错误"
        };

        Reward::new(reward_value, reason)
    }

    fn build_explanation(
        &self,
        _candidates: &[crate::amas::decision::ensemble::DecisionCandidate],
        state: &UserState,
        previous: &StrategyParams,
        strategy: &StrategyParams,
    ) -> DecisionExplanation {
        let mut factors = Vec::new();
        let fatigue_value = state.fused_fatigue.unwrap_or(state.fatigue);

        if fatigue_value > 0.5 {
            factors.push(DecisionFactor {
                name: "疲劳度".to_string(),
                value: fatigue_value,
                impact: "降低批量大小".to_string(),
                percentage: ((fatigue_value - 0.5) * 100.0),
            });
        }

        if state.attention < 0.5 {
            factors.push(DecisionFactor {
                name: "注意力".to_string(),
                value: state.attention,
                impact: "增加提示级别".to_string(),
                percentage: ((0.5 - state.attention) * 100.0),
            });
        }

        if state.motivation < 0.0 {
            factors.push(DecisionFactor {
                name: "动机".to_string(),
                value: state.motivation,
                impact: "降低难度".to_string(),
                percentage: (state.motivation.abs() * 100.0),
            });
        }

        if let Some(habit) = state.habit.as_ref() {
            if habit.samples.time_events >= 10 {
                let hour = chrono::Local::now().hour() as i32;
                let pref_score = habit.time_pref.get(hour as usize).copied().unwrap_or(0.0);
                let is_preferred = habit.preferred_time_slots.contains(&hour);
                if pref_score >= 0.6 || is_preferred {
                    factors.push(DecisionFactor {
                        name: "学习习惯".to_string(),
                        value: pref_score,
                        impact: "偏好时段提高挑战".to_string(),
                        percentage: (pref_score * 100.0),
                    });
                } else if pref_score <= 0.2 {
                    factors.push(DecisionFactor {
                        name: "学习习惯".to_string(),
                        value: pref_score,
                        impact: "非偏好时段降低负担".to_string(),
                        percentage: (pref_score * 100.0),
                    });
                }
            }
        }

        let mut changes = Vec::new();
        if previous.difficulty != strategy.difficulty {
            changes.push(format!(
                "难度: {} -> {}",
                previous.difficulty.as_str(),
                strategy.difficulty.as_str()
            ));
        } else {
            changes.push(format!("难度: {}", strategy.difficulty.as_str()));
        }
        if previous.batch_size != strategy.batch_size {
            changes.push(format!(
                "批量: {} -> {}",
                previous.batch_size, strategy.batch_size
            ));
        } else {
            changes.push(format!("批量: {}", strategy.batch_size));
        }
        if (previous.new_ratio - strategy.new_ratio).abs() > f64::EPSILON {
            changes.push(format!(
                "新词比例: {:.0}% -> {:.0}%",
                previous.new_ratio * 100.0,
                strategy.new_ratio * 100.0
            ));
        } else {
            changes.push(format!("新词比例: {:.0}%", strategy.new_ratio * 100.0));
        }

        let text = if factors.is_empty() {
            "学习状态良好，保持当前策略".to_string()
        } else {
            let factor_names: Vec<&str> = factors.iter().map(|f| f.name.as_str()).collect();
            format!("根据{}调整策略", factor_names.join("、"))
        };

        DecisionExplanation {
            factors,
            changes,
            text,
        }
    }

    fn generate_strategy_candidates(
        &self,
        current: &StrategyParams,
        state: &UserState,
    ) -> Vec<StrategyParams> {
        let mut difficulties = vec![
            DifficultyLevel::Easy,
            DifficultyLevel::Mid,
            DifficultyLevel::Hard,
        ];
        let mut new_ratios = vec![0.1, 0.2, 0.3, 0.4];
        let mut batch_sizes = vec![5, 8, 12, 16];
        let mut hint_levels = vec![0, 1, 2];

        if let Some(habit) = state.habit.as_ref() {
            if habit.samples.time_events >= 10 {
                let hour = chrono::Local::now().hour() as i32;
                let pref_score = habit.time_pref.get(hour as usize).copied().unwrap_or(0.5);
                let is_preferred = habit.preferred_time_slots.contains(&hour);
                let bias = if is_preferred {
                    pref_score.max(0.6)
                } else {
                    pref_score
                };

                if bias >= 0.6 {
                    difficulties = vec![DifficultyLevel::Mid, DifficultyLevel::Hard];
                    new_ratios = vec![0.2, 0.3, 0.4];
                    batch_sizes = vec![8, 12, 16];
                    hint_levels = vec![0, 1];
                } else if bias <= 0.2 {
                    difficulties = vec![DifficultyLevel::Easy, DifficultyLevel::Mid];
                    new_ratios = vec![0.1, 0.2, 0.3];
                    batch_sizes = vec![5, 8, 12];
                    hint_levels = vec![1, 2];
                }
            }

            if habit.samples.batches >= 5 {
                let median = habit.rhythm_pref.batch_median.round() as i32;
                if (5..=16).contains(&median) && !batch_sizes.contains(&median) {
                    batch_sizes.push(median);
                }
            }
        }

        if !difficulties.contains(&current.difficulty) {
            difficulties.push(current.difficulty);
        }
        if !new_ratios
            .iter()
            .any(|v| (*v - current.new_ratio).abs() < 1e-6)
        {
            new_ratios.push(current.new_ratio);
        }
        if !batch_sizes.contains(&current.batch_size) {
            batch_sizes.push(current.batch_size);
        }
        if !hint_levels.contains(&current.hint_level) {
            hint_levels.push(current.hint_level);
        }

        let mut candidates = Vec::with_capacity(difficulties.len() * new_ratios.len());

        for &difficulty in &difficulties {
            for &new_ratio in &new_ratios {
                candidates.push(StrategyParams {
                    difficulty,
                    new_ratio,
                    batch_size: current.batch_size,
                    interval_scale: current.interval_scale,
                    hint_level: current.hint_level,
                    swd_recommendation: None,
                });
            }
        }

        for &batch_size in &batch_sizes {
            candidates.push(StrategyParams {
                batch_size,
                ..current.clone()
            });
        }

        for &hint_level in &hint_levels {
            candidates.push(StrategyParams {
                hint_level,
                ..current.clone()
            });
        }

        candidates
    }

    fn compute_objective_evaluation(
        &self,
        state: &UserState,
        strategy: &StrategyParams,
        options: &ProcessOptions,
    ) -> ObjectiveEvaluation {
        let recent_accuracy = options.recent_accuracy.unwrap_or(0.7);
        let study_duration = options.study_duration_minutes.unwrap_or(0.0);
        let fatigue_value = state.fused_fatigue.unwrap_or(state.fatigue);

        // Short-term score: based on recent accuracy and attention
        let short_term_score = 0.6 * recent_accuracy + 0.4 * state.attention;

        // Long-term score: based on memory stability and cognitive profile
        let long_term_score = 0.5 * state.cognitive.mem
            + 0.3 * state.cognitive.stability
            + 0.2 * (1.0 - fatigue_value);

        // Efficiency score: based on speed and batch size utilization
        let batch_efficiency = (strategy.batch_size as f64 / 16.0).min(1.0);
        let efficiency_score =
            0.5 * state.cognitive.speed + 0.3 * batch_efficiency + 0.2 * (1.0 - fatigue_value);

        // Aggregated score with default weights
        let aggregated_score =
            0.3 * short_term_score + 0.4 * long_term_score + 0.3 * efficiency_score;

        // Check constraints
        let mut violations = Vec::new();
        let min_accuracy = 0.6;
        let max_daily_time = 60.0;

        if recent_accuracy < min_accuracy {
            violations.push(ConstraintViolation {
                constraint: "minAccuracy".to_string(),
                expected: min_accuracy,
                actual: recent_accuracy,
            });
        }

        if study_duration > max_daily_time {
            violations.push(ConstraintViolation {
                constraint: "maxDailyTime".to_string(),
                expected: max_daily_time,
                actual: study_duration,
            });
        }

        ObjectiveEvaluation {
            metrics: MultiObjectiveMetrics {
                short_term_score: (short_term_score * 100.0).round() / 100.0,
                long_term_score: (long_term_score * 100.0).round() / 100.0,
                efficiency_score: (efficiency_score * 100.0).round() / 100.0,
                aggregated_score: (aggregated_score * 100.0).round() / 100.0,
                ts: chrono::Utc::now().timestamp_millis(),
            },
            constraints_satisfied: violations.is_empty(),
            constraint_violations: violations,
            suggested_adjustments: None,
        }
    }
}

impl Default for AMASEngine {
    fn default() -> Self {
        Self::new(AMASConfig::default(), None)
    }
}
