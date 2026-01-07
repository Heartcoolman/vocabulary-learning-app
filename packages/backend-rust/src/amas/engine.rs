use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Timelike;

use crate::amas::config::AMASConfig;
use crate::amas::decision::{ColdStartManager, EnsembleDecision, LinUCBModel, ThompsonSamplingModel};
use crate::amas::modeling::{
    AttentionMonitor, CognitiveProfiler, FatigueEstimator, MotivationTracker, TrendAnalyzer,
};
use crate::amas::persistence::AMASPersistence;
use crate::amas::types::*;
use crate::db::DatabaseProxy;
use crate::services::fsrs::{FSRSParams, FSRSState, Rating, fsrs_next_interval, fsrs_next_interval_with_root, fsrs_retrievability, compute_fsrs_mastery_score};

struct UserModels {
    attention: AttentionMonitor,
    fatigue: FatigueEstimator,
    cognitive: CognitiveProfiler,
    motivation: MotivationTracker,
    trend: TrendAnalyzer,
    cold_start: Option<ColdStartManager>,
    linucb: LinUCBModel,
    thompson: ThompsonSamplingModel,
}

impl UserModels {
    fn new(config: &AMASConfig) -> Self {
        Self {
            attention: AttentionMonitor::new(config.attention_weights.clone(), config.attention_smoothing),
            fatigue: FatigueEstimator::new(config.fatigue.clone()),
            cognitive: CognitiveProfiler::new(config.cognitive.clone()),
            motivation: MotivationTracker::new(config.motivation.clone()),
            trend: TrendAnalyzer::new(config.trend.clone()),
            cold_start: Some(ColdStartManager::new(config.cold_start.clone())),
            linucb: LinUCBModel::new(config.bandit.context_dim, config.bandit.alpha),
            thompson: ThompsonSamplingModel::new(1.0, 1.0),
        }
    }

    fn from_cold_start_state(config: &AMASConfig, cold_start: ColdStartState) -> Self {
        let mut models = Self::new(config);
        models.cold_start = Some(ColdStartManager::from_state(config.cold_start.clone(), cold_start));
        models
    }
}

pub struct AMASEngine {
    config: Arc<RwLock<AMASConfig>>,
    persistence: Option<Arc<AMASPersistence>>,
    ensemble: Arc<RwLock<EnsembleDecision>>,
    user_models: Arc<RwLock<HashMap<String, UserModels>>>,
    user_states: Arc<RwLock<HashMap<String, PersistedAMASState>>>,
}

impl AMASEngine {
    pub fn new(config: AMASConfig, db_proxy: Option<Arc<DatabaseProxy>>) -> Self {
        let persistence = db_proxy.map(|proxy| Arc::new(AMASPersistence::new(proxy)));
        let ensemble = EnsembleDecision::new(config.feature_flags.clone());

        Self {
            config: Arc::new(RwLock::new(config)),
            persistence,
            ensemble: Arc::new(RwLock::new(ensemble)),
            user_models: Arc::new(RwLock::new(HashMap::new())),
            user_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn reload_config(&self) -> Result<(), String> {
        let new_config = AMASConfig::from_env();
        let new_ensemble = EnsembleDecision::new(new_config.feature_flags.clone());

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

    pub async fn process_event(
        &self,
        user_id: &str,
        event: RawEvent,
        options: ProcessOptions,
    ) -> Result<ProcessResult, String> {
        let config = self.config.read().await.clone();
        let mut state = self.load_or_init_state(user_id).await;
        let mut models = self.get_or_init_models(user_id, &state, &config).await;

        let feature_vector = self.build_feature_vector(&event, &state.user_state, &config);

        let new_user_state = self.update_modeling(&mut models, &event, &state.user_state, &options, &config);

        let cold_start_result = if let Some(ref mut cs) = models.cold_start {
            if !cs.is_complete() {
                let accuracy = if event.is_correct { 1.0 } else { 0.0 };
                cs.update(accuracy, event.response_time)
            } else {
                None
            }
        } else {
            None
        };

        let current_strategy = options.current_params.clone().unwrap_or(state.current_strategy.clone());

        let (new_strategy, candidates) = if let Some(ref cs_strategy) = cold_start_result {
            (cs_strategy.clone(), vec![])
        } else if !config.feature_flags.ensemble_enabled {
            (current_strategy.clone(), vec![])
        } else {
            let strategy_candidates = self.generate_strategy_candidates(&current_strategy);

            let linucb_action = if config.feature_flags.linucb_enabled {
                models.linucb.select_action(&new_user_state, &feature_vector, &strategy_candidates)
            } else {
                None
            };
            let thompson_action = if config.feature_flags.thompson_enabled {
                models.thompson.select_action(&new_user_state, &feature_vector, &strategy_candidates)
            } else {
                None
            };

            let ensemble = self.ensemble.read().await;
            ensemble.decide(
                &new_user_state,
                &feature_vector,
                &current_strategy,
                thompson_action.as_ref(),
                linucb_action.as_ref(),
            )
        };

        let reward = self.compute_reward(&event, &new_user_state, &options, &config);

        if cold_start_result.is_none() {
            let feature_vec = self.strategy_to_feature(&new_strategy);
            models.linucb.update(&feature_vec, reward.value);
            models.thompson.update(&new_strategy, reward.value);
        }

        let explanation = self.build_explanation(&candidates, &new_user_state, &new_strategy);

        // Calculate interval using FSRS when word state is available
        let word_mastery_decision = event.word_id.as_ref().map(|wid| {
            let rating = Rating::from_correct(event.is_correct, event.response_time);
            let fsrs_params = FSRSParams::default();

            if let Some(ref ws) = options.word_state {
                // Use FSRS with existing word state
                let fsrs_state = FSRSState {
                    stability: ws.stability,
                    difficulty: ws.difficulty,
                    elapsed_days: ws.elapsed_days,
                    scheduled_days: ws.scheduled_days,
                    reps: ws.reps,
                    lapses: ws.lapses,
                };
                let desired_retention = ws.desired_retention.max(0.8).min(0.95);
                let root_bonus = options.root_features.as_ref()
                    .map(|rf| (rf.avg_root_mastery / 5.0).clamp(0.0, 1.0))
                    .unwrap_or(0.0);
                let result = fsrs_next_interval_with_root(&fsrs_state, rating, desired_retention, &fsrs_params, root_bonus);
                let retrievability = fsrs_retrievability(ws.stability, ws.elapsed_days);

                // AMAS comprehensive mastery decision
                let (fsrs_score, _fsrs_conf) = compute_fsrs_mastery_score(&result.state, rating);
                let is_first_attempt = ws.reps == 0;

                // Cognitive state adjustment (0-30 points)
                let cognitive_score = (
                    new_user_state.cognitive.mem * 0.4 +
                    new_user_state.cognitive.speed * 0.3 +
                    new_user_state.cognitive.stability * 0.3
                ) * 20.0;
                let attention_bonus = new_user_state.attention * 10.0;
                let fatigue_penalty = new_user_state.fatigue * 10.0;
                let user_state_score = cognitive_score + attention_bonus - fatigue_penalty;

                // First attempt fast correct bonus
                let first_attempt_bonus = if is_first_attempt && rating == Rating::Easy { 15.0 } else { 0.0 };

                let total_score = fsrs_score + user_state_score + first_attempt_bonus;
                let confidence = (total_score / 100.0).clamp(0.0, 1.0);
                let is_mastered_decision = total_score >= 60.0;

                WordMasteryDecision {
                    word_id: wid.clone(),
                    prev_mastery: retrievability,
                    new_mastery: result.retrievability,
                    prev_interval: ws.scheduled_days,
                    new_interval: result.interval_days * new_strategy.interval_scale,
                    quality: rating as i32,
                    stability: result.state.stability,
                    difficulty: result.state.difficulty,
                    retrievability: result.retrievability,
                    is_mastered: is_mastered_decision,
                    lapses: result.state.lapses,
                    reps: result.state.reps,
                    confidence,
                }
            } else {
                // New word: use FSRS with default state
                let fsrs_state = FSRSState::default();
                let root_bonus = options.root_features.as_ref()
                    .map(|rf| (rf.avg_root_mastery / 5.0).clamp(0.0, 1.0))
                    .unwrap_or(0.0);
                let result = fsrs_next_interval_with_root(&fsrs_state, rating, 0.9, &fsrs_params, root_bonus);

                // AMAS comprehensive mastery decision for new word
                let (fsrs_score, _) = compute_fsrs_mastery_score(&result.state, rating);

                // Cognitive state adjustment (0-30 points)
                let cognitive_score = (
                    new_user_state.cognitive.mem * 0.4 +
                    new_user_state.cognitive.speed * 0.3 +
                    new_user_state.cognitive.stability * 0.3
                ) * 20.0;
                let attention_bonus = new_user_state.attention * 10.0;
                let fatigue_penalty = new_user_state.fatigue * 10.0;
                let user_state_score = cognitive_score + attention_bonus - fatigue_penalty;

                // First attempt fast correct bonus (always true for new word)
                let first_attempt_bonus = if rating == Rating::Easy { 15.0 } else { 0.0 };

                let total_score = fsrs_score + user_state_score + first_attempt_bonus;
                let confidence = (total_score / 100.0).clamp(0.0, 1.0);
                let is_mastered_decision = total_score >= 60.0;

                WordMasteryDecision {
                    word_id: wid.clone(),
                    prev_mastery: 0.0,
                    new_mastery: result.retrievability,
                    prev_interval: 0.0,
                    new_interval: result.interval_days * new_strategy.interval_scale,
                    quality: rating as i32,
                    stability: result.state.stability,
                    difficulty: result.state.difficulty,
                    retrievability: result.retrievability,
                    is_mastered: is_mastered_decision,
                    lapses: result.state.lapses,
                    reps: result.state.reps,
                    confidence,
                }
            }
        });

        let cold_start_phase = models.cold_start.as_ref().map(|cs| cs.phase());

        state.user_state = new_user_state.clone();
        state.current_strategy = new_strategy.clone();
        state.interaction_count += 1;
        state.last_updated = chrono::Utc::now().timestamp_millis();

        if let Some(ref cs) = models.cold_start {
            state.cold_start_state = Some(cs.state().clone());
        }

        // Update bandit_model for persistence with actual model state
        state.bandit_model = Some(crate::amas::types::BanditModel {
            thompson_params: serde_json::to_value(&models.thompson).ok(),
            linucb_state: serde_json::to_value(&models.linucb).ok(),
            last_action_idx: None,
        });

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
        let objective_evaluation = self.compute_objective_evaluation(&new_user_state, &new_strategy, &options);

        Ok(ProcessResult {
            state: new_user_state,
            strategy: new_strategy,
            reward,
            explanation,
            feature_vector: Some(feature_vector),
            word_mastery_decision,
            cold_start_phase,
            objective_evaluation: Some(objective_evaluation),
            multi_objective_adjusted: None,
        })
    }

    pub async fn get_user_state(&self, user_id: &str) -> Option<UserState> {
        let states = self.user_states.read().await;
        states.get(user_id).map(|s| s.user_state.clone())
    }

    pub async fn get_current_strategy(&self, user_id: &str) -> StrategyParams {
        let states = self.user_states.read().await;
        states
            .get(user_id)
            .map(|s| s.current_strategy.clone())
            .unwrap_or_default()
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
            states.iter()
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

        if let Some(ref persistence) = self.persistence {
            if let Some(mut state) = persistence.load_state(user_id).await {
                // 基于时间的疲劳衰减（会话级状态隔离）
                // 使用 user_state.ts 而非 last_updated，因为 ts 反映实际交互时间
                let elapsed_minutes = (chrono::Utc::now().timestamp_millis() - state.user_state.ts) as f64 / 60000.0;
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

                let mut states = self.user_states.write().await;
                states.insert(user_id.to_string(), state.clone());
                return state;
            }
        }

        let new_state = PersistedAMASState {
            user_id: user_id.to_string(),
            user_state: UserState::default(),
            bandit_model: None,
            current_strategy: StrategyParams::default(),
            cold_start_state: Some(ColdStartState::default()),
            interaction_count: 0,
            last_updated: chrono::Utc::now().timestamp_millis(),
        };

        let mut states = self.user_states.write().await;
        states.insert(user_id.to_string(), new_state.clone());

        new_state
    }

    async fn get_or_init_models(&self, user_id: &str, state: &PersistedAMASState, config: &AMASConfig) -> UserModels {
        {
            let models = self.user_models.read().await;
            if let Some(m) = models.get(user_id) {
                return UserModels {
                    attention: AttentionMonitor::new(config.attention_weights.clone(), config.attention_smoothing),
                    fatigue: FatigueEstimator::new(config.fatigue.clone()),
                    cognitive: CognitiveProfiler::new(config.cognitive.clone()),
                    motivation: MotivationTracker::new(config.motivation.clone()),
                    trend: TrendAnalyzer::new(config.trend.clone()),
                    cold_start: m.cold_start.as_ref().map(|cs| ColdStartManager::from_state(config.cold_start.clone(), cs.state().clone())),
                    linucb: m.linucb.clone(),
                    thompson: m.thompson.clone(),
                };
            }
        }

        // Restore bandit models from persisted state
        let linucb = state.bandit_model.as_ref()
            .and_then(|b| b.linucb_state.as_ref())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(|| LinUCBModel::new(config.bandit.context_dim, config.bandit.alpha));

        let thompson = state.bandit_model.as_ref()
            .and_then(|b| b.thompson_params.as_ref())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(|| ThompsonSamplingModel::new(1.0, 1.0));

        let models = UserModels {
            attention: AttentionMonitor::new(config.attention_weights.clone(), config.attention_smoothing),
            fatigue: FatigueEstimator::new(config.fatigue.clone()),
            cognitive: CognitiveProfiler::new(config.cognitive.clone()),
            motivation: MotivationTracker::new(config.motivation.clone()),
            trend: TrendAnalyzer::new(config.trend.clone()),
            cold_start: state.cold_start_state.as_ref().map(|cs| ColdStartManager::from_state(config.cold_start.clone(), cs.clone())),
            linucb: linucb.clone(),
            thompson: thompson.clone(),
        };

        let mut model_map = self.user_models.write().await;
        model_map.insert(user_id.to_string(), UserModels {
            attention: AttentionMonitor::new(config.attention_weights.clone(), config.attention_smoothing),
            fatigue: FatigueEstimator::new(config.fatigue.clone()),
            cognitive: CognitiveProfiler::new(config.cognitive.clone()),
            motivation: MotivationTracker::new(config.motivation.clone()),
            trend: TrendAnalyzer::new(config.trend.clone()),
            cold_start: state.cold_start_state.as_ref().map(|cs| ColdStartManager::from_state(config.cold_start.clone(), cs.clone())),
            linucb,
            thompson,
        });

        models
    }

    fn build_feature_vector(&self, event: &RawEvent, state: &UserState, config: &AMASConfig) -> FeatureVector {
        let rt_norm = (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);
        let dwell_norm = event.dwell_time.map(|d| (d as f64 / 10000.0).min(1.0)).unwrap_or(0.5);
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
            state.fatigue,
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
        models: &mut UserModels,
        event: &RawEvent,
        prev_state: &UserState,
        options: &ProcessOptions,
        config: &AMASConfig,
    ) -> UserState {
        use crate::amas::modeling::attention::AttentionFeatures;
        use crate::amas::modeling::cognitive::CognitiveInput;
        use crate::amas::modeling::fatigue::FatigueFeatures;
        use crate::amas::modeling::motivation::MotivationEvent;

        let rt_norm = (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);

        let attention = models.attention.update(AttentionFeatures {
            rt_mean: rt_norm,
            rt_cv: options.rt_cv.unwrap_or(0.0),
            pace_cv: 0.0,
            pause_count: event.pause_count as f64,
            switch_count: event.switch_count as f64,
            drift: 0.0,
            interaction_density: event.interaction_density.unwrap_or(0.5),
            focus_loss: event.focus_loss_duration.map(|ms| ms as f64 / 60000.0).unwrap_or(0.0),
        });

        let break_minutes = event.paused_time_ms.map(|ms| ms as f64 / 60000.0);
        let fatigue = models.fatigue.update(FatigueFeatures {
            error_rate_trend: if event.is_correct { -0.05 } else { 0.1 },
            rt_increase_rate: rt_norm,
            repeat_errors: event.retry_count,
            break_minutes,
        });

        let recent_accuracy = options.recent_accuracy.unwrap_or(if event.is_correct { 0.8 } else { 0.6 });
        let error_variance = recent_accuracy * (1.0 - recent_accuracy);

        let cognitive = models.cognitive.update(CognitiveInput {
            accuracy: if event.is_correct { 1.0 } else { 0.0 },
            avg_response_time: event.response_time,
            error_variance,
        });

        // Integrate ACT-R memory model if enabled and history is available
        let actr_mem = if config.feature_flags.actr_memory_enabled {
            self.compute_actr_memory(options)
        } else {
            None
        };

        // Blend ACT-R memory with cognitive profile
        let final_cognitive = if let Some(actr_recall) = actr_mem {
            let blended_mem = 0.6 * cognitive.mem + 0.4 * actr_recall;
            CognitiveProfile {
                mem: blended_mem.clamp(0.0, 1.0),
                speed: cognitive.speed,
                stability: cognitive.stability,
            }
        } else {
            cognitive
        };

        let motivation = models.motivation.update(MotivationEvent {
            is_correct: event.is_correct,
            is_quit: false,
            streak_length: models.motivation.streak(),
        });

        let mastery_score = (final_cognitive.mem + final_cognitive.speed + final_cognitive.stability) / 3.0;
        let trend = models.trend.update(mastery_score);

        let conf = (config.confidence_decay * prev_state.conf + (1.0 - config.confidence_decay) * 0.7)
            .max(config.min_confidence);

        UserState {
            attention,
            fatigue,
            cognitive: final_cognitive,
            motivation,
            habit: prev_state.habit.clone(),
            trend: Some(trend),
            conf,
            ts: chrono::Utc::now().timestamp_millis(),
            visual_fatigue: prev_state.visual_fatigue.clone(),
            fused_fatigue: options.visual_fatigue_score,
        }
    }

    fn compute_actr_memory(&self, options: &ProcessOptions) -> Option<f64> {
        let history = options.word_review_history.as_ref()?;
        if history.is_empty() {
            return None;
        }

        let traces: Vec<danci_algo::MemoryTrace> = history
            .iter()
            .map(|h| danci_algo::MemoryTrace {
                timestamp: h.seconds_ago as f64,
                is_correct: h.is_correct.unwrap_or(true),
            })
            .collect();

        let model = danci_algo::ACTRMemoryNative::new(None, None, None);
        let recall = model.predict_recall(traces).recall_probability;
        Some(recall.clamp(0.0, 1.0))
    }

    fn compute_reward(&self, event: &RawEvent, state: &UserState, _options: &ProcessOptions, config: &AMASConfig) -> Reward {
        let accuracy_score = if event.is_correct { 1.0 } else { 0.0 };

        let speed_score = 1.0 - (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);

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
        strategy: &StrategyParams,
    ) -> DecisionExplanation {
        let mut factors = Vec::new();

        if state.fatigue > 0.5 {
            factors.push(DecisionFactor {
                name: "疲劳度".to_string(),
                value: state.fatigue,
                impact: "降低批量大小".to_string(),
                percentage: ((state.fatigue - 0.5) * 100.0) as f64,
            });
        }

        if state.attention < 0.5 {
            factors.push(DecisionFactor {
                name: "注意力".to_string(),
                value: state.attention,
                impact: "增加提示级别".to_string(),
                percentage: ((0.5 - state.attention) * 100.0) as f64,
            });
        }

        if state.motivation < 0.0 {
            factors.push(DecisionFactor {
                name: "动机".to_string(),
                value: state.motivation,
                impact: "降低难度".to_string(),
                percentage: (state.motivation.abs() * 100.0) as f64,
            });
        }

        let mut changes = Vec::new();
        changes.push(format!("难度: {}", strategy.difficulty.as_str()));
        changes.push(format!("批量: {}", strategy.batch_size));
        changes.push(format!("新词比例: {:.0}%", strategy.new_ratio * 100.0));

        let text = if factors.is_empty() {
            "学习状态良好，保持当前策略".to_string()
        } else {
            let factor_names: Vec<&str> = factors.iter().map(|f| f.name.as_str()).collect();
            format!("根据{}调整策略", factor_names.join("、"))
        };

        DecisionExplanation { factors, changes, text }
    }

    fn generate_strategy_candidates(&self, current: &StrategyParams) -> Vec<StrategyParams> {
        let difficulties = [DifficultyLevel::Easy, DifficultyLevel::Mid, DifficultyLevel::Hard];
        let new_ratios = [0.1, 0.2, 0.3, 0.4];
        let batch_sizes = [5, 8, 12, 16];
        let hint_levels = [0, 1, 2];

        let mut candidates = Vec::with_capacity(difficulties.len() * new_ratios.len());

        for &difficulty in &difficulties {
            for &new_ratio in &new_ratios {
                candidates.push(StrategyParams {
                    difficulty,
                    new_ratio,
                    batch_size: current.batch_size,
                    interval_scale: current.interval_scale,
                    hint_level: current.hint_level,
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

    fn strategy_to_feature(&self, strategy: &StrategyParams) -> Vec<f64> {
        let difficulty_val = match strategy.difficulty {
            DifficultyLevel::Easy => 0.3,
            DifficultyLevel::Mid => 0.6,
            DifficultyLevel::Hard => 0.9,
        };

        vec![
            difficulty_val,
            strategy.new_ratio,
            strategy.batch_size as f64 / 20.0,
            strategy.interval_scale,
            strategy.hint_level as f64 / 2.0,
        ]
    }

    fn compute_objective_evaluation(
        &self,
        state: &UserState,
        strategy: &StrategyParams,
        options: &ProcessOptions,
    ) -> ObjectiveEvaluation {
        let recent_accuracy = options.recent_accuracy.unwrap_or(0.7);
        let study_duration = options.study_duration_minutes.unwrap_or(0.0);

        // Short-term score: based on recent accuracy and attention
        let short_term_score = 0.6 * recent_accuracy + 0.4 * state.attention;

        // Long-term score: based on memory stability and cognitive profile
        let long_term_score = 0.5 * state.cognitive.mem + 0.3 * state.cognitive.stability + 0.2 * (1.0 - state.fatigue);

        // Efficiency score: based on speed and batch size utilization
        let batch_efficiency = (strategy.batch_size as f64 / 16.0).min(1.0);
        let efficiency_score = 0.5 * state.cognitive.speed + 0.3 * batch_efficiency + 0.2 * (1.0 - state.fatigue);

        // Aggregated score with default weights
        let aggregated_score = 0.3 * short_term_score + 0.4 * long_term_score + 0.3 * efficiency_score;

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
