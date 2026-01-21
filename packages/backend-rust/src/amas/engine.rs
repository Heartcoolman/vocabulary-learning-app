use chrono::Timelike;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::amas::config::AMASConfig;
use crate::amas::decision::{
    linucb::ACTION_FEATURE_DIM, ColdStartManager, EnsembleDecision, LinUCBModel,
    ThompsonSamplingModel,
};
use crate::amas::metrics::AlgorithmId;
use crate::amas::modeling::{
    AttentionMonitor, CognitiveProfiler, FatigueEstimator, MotivationTracker, TrendAnalyzer,
};
use crate::amas::monitoring::AMASMonitor;
use crate::amas::persistence::AMASPersistence;
use crate::amas::types::*;
use crate::db::DatabaseProxy;
use crate::services::amas_config::AMASConfigService;
use crate::services::fsrs::{
    compute_fsrs_mastery_score, fsrs5_retrievability, fsrs_next_interval_with_root, FSRSState,
    Rating, RetentionSample, UserFSRSParams,
};
use crate::track_algorithm;

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
        let mut thompson = ThompsonSamplingModel::new(1.0, 1.0);
        thompson.set_context_config(config.thompson_context.bins, config.thompson_context.weight);
        Self {
            attention: AttentionMonitor::new(
                config.attention_weights.clone(),
                config.attention_smoothing,
            ),
            fatigue: FatigueEstimator::new(config.fatigue.clone()),
            cognitive: CognitiveProfiler::new(config.cognitive.clone()),
            motivation: MotivationTracker::new(config.motivation.clone()),
            trend: TrendAnalyzer::new(config.trend.clone()),
            cold_start: Some(ColdStartManager::new(config.cold_start.clone())),
            linucb: LinUCBModel::new(
                config.bandit.context_dim,
                ACTION_FEATURE_DIM,
                config.bandit.alpha,
            ),
            thompson,
        }
    }

    fn from_cold_start_state(config: &AMASConfig, cold_start: ColdStartState) -> Self {
        let mut models = Self::new(config);
        models.cold_start = Some(ColdStartManager::from_state(
            config.cold_start.clone(),
            cold_start,
        ));
        models
    }
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
        let mut new_config = AMASConfig::from_env();
        if let Some(ref proxy) = self.db_proxy {
            let service = AMASConfigService::new(Arc::clone(proxy));
            match service.get_config().await {
                Ok(db_config) => {
                    new_config.thompson_context.bins = db_config.thompson_context.bins;
                    new_config.thompson_context.weight = db_config.thompson_context.weight;
                }
                Err(err) => {
                    tracing::warn!(error = %err, "Failed to load AMAS config from DB");
                }
            }
        }
        let new_ensemble = EnsembleDecision::with_config(
            new_config.feature_flags.clone(),
            new_config.ensemble.clone(),
        );
        let thompson_bins = new_config.thompson_context.bins;
        let thompson_weight = new_config.thompson_context.weight;

        {
            let mut config = self.config.write().await;
            *config = new_config;
        }
        {
            let mut ensemble = self.ensemble.write().await;
            *ensemble = new_ensemble;
        }
        {
            let mut model_map = self.user_models.write().await;
            for models in model_map.values_mut() {
                models
                    .thompson
                    .set_context_config(thompson_bins, thompson_weight);
            }
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

        let new_user_state =
            self.update_modeling(&mut models, &event, &state.user_state, &options, &config);

        let cold_start_result = if let Some(ref mut cs) = models.cold_start {
            if !cs.is_complete() {
                let accuracy = if event.is_correct { 1.0 } else { 0.0 };
                let signals = crate::amas::decision::coldstart::ColdStartSignals {
                    attention: new_user_state.attention,
                    motivation: new_user_state.motivation,
                    cognitive_mem: new_user_state.cognitive.mem,
                    rt_variance: options.rt_cv.unwrap_or(0.5),
                };
                track_algorithm!(
                    AlgorithmId::ColdStartManager,
                    cs.update_with_signals(accuracy, event.response_time, &signals)
                )
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

            let linucb_action = if config.feature_flags.linucb_enabled {
                track_algorithm!(
                    AlgorithmId::LinUCB,
                    models.linucb.select_action(
                        &new_user_state,
                        &feature_vector,
                        &strategy_candidates
                    )
                )
            } else {
                None
            };
            let conf_map = &config.ensemble.confidence_map;
            let linucb_confidence = linucb_action.as_ref().map(|a| {
                models.linucb.get_confidence_with_params(
                    &feature_vector,
                    a,
                    conf_map.linucb_exploration_scale,
                    conf_map.min_confidence,
                    conf_map.max_confidence,
                )
            });

            let thompson_action = if config.feature_flags.thompson_enabled {
                track_algorithm!(
                    AlgorithmId::Thompson,
                    models.thompson.select_action(
                        &new_user_state,
                        &feature_vector,
                        &strategy_candidates
                    )
                )
            } else {
                None
            };
            let thompson_confidence = thompson_action.as_ref().map(|a| {
                models.thompson.get_confidence_with_params(
                    &new_user_state,
                    a,
                    conf_map.thompson_ess_k,
                    conf_map.min_confidence,
                    conf_map.max_confidence,
                )
            });

            let ensemble = self.ensemble.read().await;
            let (raw_strategy, candidates) = track_algorithm!(
                AlgorithmId::Heuristic,
                ensemble.decide(
                    &new_user_state,
                    &feature_vector,
                    &current_strategy,
                    thompson_action.as_ref(),
                    thompson_confidence,
                    linucb_action.as_ref(),
                    linucb_confidence,
                )
            );

            let session_info = crate::amas::decision::ensemble::SessionInfo {
                total_sessions: options.total_sessions.unwrap_or(0),
                duration_minutes: options.study_duration_minutes.unwrap_or(0.0),
            };
            let filtered_strategy =
                ensemble.post_filter(raw_strategy, &new_user_state, Some(&session_info));

            (filtered_strategy, candidates)
        };

        let reward = self.compute_reward(&event, &new_user_state, &options, &config);

        if cold_start_result.is_none() {
            let linucb_feature = models.linucb.build_features(&feature_vector, &new_strategy);
            models.linucb.update(&linucb_feature, reward.value);
            models
                .thompson
                .update(&new_user_state, &new_strategy, reward.value);

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

        // Calculate interval using FSRS when word state is available
        let word_mastery_decision = event.word_id.as_ref().map(|wid| {
            let rating = Rating::from_correct(event.is_correct, event.response_time);
            let fsrs_params = state
                .user_fsrs_params
                .as_ref()
                .map(|p| p.effective_params())
                .unwrap_or_default();

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
                let desired_retention = self.adjust_fsrs_retention(
                    ws.desired_retention,
                    &new_user_state,
                    &options,
                    &config,
                );
                let root_bonus = options
                    .root_features
                    .as_ref()
                    .map(|rf| (rf.avg_root_mastery / 5.0).clamp(0.0, 1.0))
                    .unwrap_or(0.0);
                let result = track_algorithm!(
                    AlgorithmId::Fsrs,
                    fsrs_next_interval_with_root(
                        &fsrs_state,
                        rating,
                        desired_retention,
                        &fsrs_params,
                        root_bonus,
                    )
                );
                let now_ts = chrono::Utc::now().timestamp_millis();
                let last_review_ts = if ws.elapsed_days > 0.0 {
                    Some(now_ts - (ws.elapsed_days * 86_400_000.0) as i64)
                } else {
                    None
                };
                let retrievability =
                    fsrs5_retrievability(ws.stability, ws.elapsed_days, last_review_ts, now_ts);

                // AMAS comprehensive mastery decision
                let (fsrs_score, _fsrs_conf) = compute_fsrs_mastery_score(&result.state, rating);
                let is_first_attempt = ws.reps == 0;

                // Cognitive state adjustment (0-30 points)
                let cognitive_score = (new_user_state.cognitive.mem * 0.4
                    + new_user_state.cognitive.speed * 0.3
                    + new_user_state.cognitive.stability * 0.3)
                    * 20.0;
                let attention_bonus = new_user_state.attention * 10.0;
                let fatigue_penalty = new_user_state
                    .fused_fatigue
                    .unwrap_or(new_user_state.fatigue)
                    * 10.0;
                let user_state_score = cognitive_score + attention_bonus - fatigue_penalty;

                // First attempt fast correct bonus
                let first_attempt_bonus = if is_first_attempt && rating == Rating::Easy {
                    15.0
                } else {
                    0.0
                };

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
                let root_bonus = options
                    .root_features
                    .as_ref()
                    .map(|rf| (rf.avg_root_mastery / 5.0).clamp(0.0, 1.0))
                    .unwrap_or(0.0);
                let desired_retention =
                    self.adjust_fsrs_retention(0.9, &new_user_state, &options, &config);
                let result = track_algorithm!(
                    AlgorithmId::Fsrs,
                    fsrs_next_interval_with_root(
                        &fsrs_state,
                        rating,
                        desired_retention,
                        &fsrs_params,
                        root_bonus,
                    )
                );

                // AMAS comprehensive mastery decision for new word
                let (fsrs_score, _) = compute_fsrs_mastery_score(&result.state, rating);

                // Cognitive state adjustment (0-30 points)
                let cognitive_score = (new_user_state.cognitive.mem * 0.4
                    + new_user_state.cognitive.speed * 0.3
                    + new_user_state.cognitive.stability * 0.3)
                    * 20.0;
                let attention_bonus = new_user_state.attention * 10.0;
                let fatigue_penalty = new_user_state
                    .fused_fatigue
                    .unwrap_or(new_user_state.fatigue)
                    * 10.0;
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

        // Collect Bayesian FSRS sample for parameter optimization
        if let (Some(ref ws), Some(ref _wmd)) = (&options.word_state, &word_mastery_decision) {
            if ws.reps > 0 && ws.elapsed_days > 0.0 {
                let sample = RetentionSample {
                    stability: ws.stability,
                    elapsed_days: ws.elapsed_days,
                    actual_recalled: event.is_correct,
                };
                let user_params = state
                    .user_fsrs_params
                    .get_or_insert_with(UserFSRSParams::default);
                if let Some(ref mut bayesian) = user_params.bayesian {
                    bayesian.add_sample(sample);
                    if bayesian.samples.len() >= 20 {
                        bayesian.optimize(0.01);
                    }
                } else {
                    let mut bayesian = crate::services::fsrs::BayesianFSRSParams::default();
                    bayesian.add_sample(sample);
                    user_params.bayesian = Some(bayesian);
                }
            }
        }

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
                    "thompson" => weights.thompson = normalize(c.weight, c.confidence),
                    "linucb" => weights.linucb = normalize(c.weight, c.confidence),
                    "heuristic" => weights.heuristic = normalize(c.weight, c.confidence),
                    "actr" => weights.actr = normalize(c.weight, c.confidence),
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
            user_fsrs_params: None,
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
                let mut linucb = m.linucb.clone();
                linucb.ensure_dimensions(
                    config.bandit.context_dim,
                    ACTION_FEATURE_DIM,
                    config.bandit.alpha,
                );
                let mut thompson = m.thompson.clone();
                thompson.set_context_config(
                    config.thompson_context.bins,
                    config.thompson_context.weight,
                );
                let mut attention = AttentionMonitor::new(
                    config.attention_weights.clone(),
                    config.attention_smoothing,
                );
                attention.set_value(state.user_state.attention);

                let mut fatigue = FatigueEstimator::new(config.fatigue.clone());
                fatigue.set_value(state.user_state.fatigue);

                let mut cognitive = CognitiveProfiler::new(config.cognitive.clone());
                cognitive.set_profile(state.user_state.cognitive.clone());

                let mut motivation = MotivationTracker::new(config.motivation.clone());
                motivation.set_value(state.user_state.motivation);

                return UserModels {
                    attention,
                    fatigue,
                    cognitive,
                    motivation,
                    trend: TrendAnalyzer::new(config.trend.clone()),
                    cold_start: m.cold_start.as_ref().map(|cs| {
                        ColdStartManager::from_state(config.cold_start.clone(), cs.state().clone())
                    }),
                    linucb,
                    thompson,
                };
            }
        }

        // Restore bandit models from persisted state
        let mut linucb = state
            .bandit_model
            .as_ref()
            .and_then(|b| b.linucb_state.as_ref())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(|| {
                LinUCBModel::new(
                    config.bandit.context_dim,
                    ACTION_FEATURE_DIM,
                    config.bandit.alpha,
                )
            });
        linucb.ensure_dimensions(
            config.bandit.context_dim,
            ACTION_FEATURE_DIM,
            config.bandit.alpha,
        );

        let mut thompson = state
            .bandit_model
            .as_ref()
            .and_then(|b| b.thompson_params.as_ref())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(|| ThompsonSamplingModel::new(1.0, 1.0));
        thompson.set_context_config(config.thompson_context.bins, config.thompson_context.weight);

        let mut attention =
            AttentionMonitor::new(config.attention_weights.clone(), config.attention_smoothing);
        attention.set_value(state.user_state.attention);

        let mut fatigue = FatigueEstimator::new(config.fatigue.clone());
        fatigue.set_value(state.user_state.fatigue);

        let mut cognitive = CognitiveProfiler::new(config.cognitive.clone());
        cognitive.set_profile(state.user_state.cognitive.clone());

        let mut motivation = MotivationTracker::new(config.motivation.clone());
        motivation.set_value(state.user_state.motivation);

        let models = UserModels {
            attention,
            fatigue,
            cognitive,
            motivation,
            trend: TrendAnalyzer::new(config.trend.clone()),
            cold_start: state
                .cold_start_state
                .as_ref()
                .map(|cs| ColdStartManager::from_state(config.cold_start.clone(), cs.clone())),
            linucb: linucb.clone(),
            thompson: thompson.clone(),
        };

        let mut model_map = self.user_models.write().await;

        let mut attention2 =
            AttentionMonitor::new(config.attention_weights.clone(), config.attention_smoothing);
        attention2.set_value(state.user_state.attention);

        let mut fatigue2 = FatigueEstimator::new(config.fatigue.clone());
        fatigue2.set_value(state.user_state.fatigue);

        let mut cognitive2 = CognitiveProfiler::new(config.cognitive.clone());
        cognitive2.set_profile(state.user_state.cognitive.clone());

        let mut motivation2 = MotivationTracker::new(config.motivation.clone());
        motivation2.set_value(state.user_state.motivation);

        model_map.insert(
            user_id.to_string(),
            UserModels {
                attention: attention2,
                fatigue: fatigue2,
                cognitive: cognitive2,
                motivation: motivation2,
                trend: TrendAnalyzer::new(config.trend.clone()),
                cold_start: state
                    .cold_start_state
                    .as_ref()
                    .map(|cs| ColdStartManager::from_state(config.cold_start.clone(), cs.clone())),
                linucb,
                thompson,
            },
        );

        models
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
        models: &mut UserModels,
        event: &RawEvent,
        prev_state: &UserState,
        options: &ProcessOptions,
        config: &AMASConfig,
    ) -> UserState {
        use crate::amas::modeling::attention::AttentionFeatures;
        use crate::amas::modeling::cognitive::CognitiveInput;
        use crate::amas::modeling::fatigue::FatigueFeatures;
        use crate::amas::modeling::fatigue_fusion::fuse_fatigue;
        use crate::amas::modeling::motivation::MotivationEvent;

        let rt_norm =
            (event.response_time as f64 / config.perception.max_response_time as f64).min(1.0);

        let dwell_norm = event
            .dwell_time
            .map(|ms| (ms as f64 / config.perception.max_response_time as f64).min(1.0))
            .unwrap_or(rt_norm);

        let hour_of_day = chrono::Local::now().hour();

        let attention = track_algorithm!(
            AlgorithmId::AttentionMonitor,
            models.attention.update(AttentionFeatures {
                rt_mean: rt_norm,
                rt_cv: options.rt_cv.unwrap_or(0.0),
                pace_cv: options.pace_cv.unwrap_or(0.0),
                pause_count: event.pause_count as f64,
                switch_count: event.switch_count as f64,
                drift: 0.0,
                interaction_density: event.interaction_density.unwrap_or(0.5),
                focus_loss: event
                    .focus_loss_duration
                    .map(|ms| ms as f64 / 60000.0)
                    .unwrap_or(0.0),
                recent_accuracy: options.recent_accuracy.unwrap_or(0.7),
                is_correct: Some(event.is_correct),
                hint_used: event.hint_used,
                retry_count: event.retry_count,
                dwell_time: dwell_norm,
                visual_fatigue: options.visual_fatigue_score.unwrap_or(0.0),
                visual_fatigue_confidence: options.visual_fatigue_confidence.unwrap_or(0.5),
                motivation: prev_state.motivation,
                cognitive: prev_state.cognitive.clone(),
                study_duration_minutes: options.study_duration_minutes.unwrap_or(0.0),
                hour_of_day,
            })
        );

        let break_minutes = event.paused_time_ms.map(|ms| ms as f64 / 60000.0);
        let fatigue = track_algorithm!(
            AlgorithmId::FatigueEstimator,
            models.fatigue.update(FatigueFeatures {
                error_rate_trend: if event.is_correct { -0.05 } else { 0.1 },
                rt_increase_rate: rt_norm,
                repeat_errors: event.retry_count,
                break_minutes,
            })
        );

        let recent_accuracy =
            options
                .recent_accuracy
                .unwrap_or(if event.is_correct { 0.8 } else { 0.6 });
        let error_variance = recent_accuracy * (1.0 - recent_accuracy);

        let cognitive = track_algorithm!(
            AlgorithmId::CognitiveProfiler,
            models.cognitive.update(CognitiveInput {
                accuracy: if event.is_correct { 1.0 } else { 0.0 },
                avg_response_time: event.response_time,
                error_variance,
            })
        );

        // Integrate ACT-R memory model if enabled and history is available
        let actr_mem = if config.feature_flags.actr_memory_enabled {
            track_algorithm!(AlgorithmId::ActrMemory, self.compute_actr_memory(options))
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

        let motivation = track_algorithm!(
            AlgorithmId::MotivationTracker,
            models.motivation.update(MotivationEvent {
                is_correct: event.is_correct,
                is_quit: false,
                streak_length: models.motivation.streak(),
            })
        );

        let mastery_score =
            (final_cognitive.mem + final_cognitive.speed + final_cognitive.stability) / 3.0;
        let trend = track_algorithm!(
            AlgorithmId::TrendAnalyzer,
            models.trend.update(mastery_score)
        );

        let conf = (config.confidence_decay * prev_state.conf
            + (1.0 - config.confidence_decay) * 0.7)
            .max(config.min_confidence);

        let fused = fuse_fatigue(
            fatigue,
            options.visual_fatigue_score,
            options.visual_fatigue_confidence,
            options.study_duration_minutes.unwrap_or(0.0),
        );

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

    fn adjust_fsrs_retention(
        &self,
        base_retention: f64,
        state: &UserState,
        options: &ProcessOptions,
        config: &AMASConfig,
    ) -> f64 {
        let cfg = &config.fsrs_personalization;
        let accuracy = options.recent_accuracy.unwrap_or(0.7);
        let cognitive = (state.cognitive.mem + state.cognitive.stability) / 2.0;
        let fatigue = state.fused_fatigue.unwrap_or(state.fatigue);
        let motivation = (state.motivation + 1.0) / 2.0;

        let delta = cfg.accuracy_weight * (accuracy - 0.7)
            + cfg.cognitive_weight * (cognitive - 0.5)
            - cfg.fatigue_weight * (fatigue - 0.3)
            + cfg.motivation_weight * (motivation - 0.5);

        let base = base_retention.clamp(cfg.min_retention, cfg.max_retention);
        (base + delta).clamp(cfg.min_retention, cfg.max_retention)
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
                percentage: ((fatigue_value - 0.5) * 100.0) as f64,
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
                        percentage: (pref_score * 100.0) as f64,
                    });
                } else if pref_score <= 0.2 {
                    factors.push(DecisionFactor {
                        name: "学习习惯".to_string(),
                        value: pref_score,
                        impact: "非偏好时段降低负担".to_string(),
                        percentage: (pref_score * 100.0) as f64,
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
