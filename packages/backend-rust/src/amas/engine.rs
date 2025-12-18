use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::amas::config::AMASConfig;
use crate::amas::decision::{ColdStartManager, EnsembleDecision};
use crate::amas::modeling::{
    AttentionMonitor, CognitiveProfiler, FatigueEstimator, MotivationTracker, TrendAnalyzer,
};
use crate::amas::persistence::AMASPersistence;
use crate::amas::types::*;
use crate::db::DatabaseProxy;

struct UserModels {
    attention: AttentionMonitor,
    fatigue: FatigueEstimator,
    cognitive: CognitiveProfiler,
    motivation: MotivationTracker,
    trend: TrendAnalyzer,
    cold_start: Option<ColdStartManager>,
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
        }
    }

    fn from_cold_start_state(config: &AMASConfig, cold_start: ColdStartState) -> Self {
        let mut models = Self::new(config);
        models.cold_start = Some(ColdStartManager::from_state(config.cold_start.clone(), cold_start));
        models
    }
}

pub struct AMASEngine {
    config: AMASConfig,
    persistence: Option<Arc<AMASPersistence>>,
    ensemble: EnsembleDecision,
    user_models: Arc<RwLock<HashMap<String, UserModels>>>,
    user_states: Arc<RwLock<HashMap<String, PersistedAMASState>>>,
}

impl AMASEngine {
    pub fn new(config: AMASConfig, db_proxy: Option<Arc<DatabaseProxy>>) -> Self {
        let persistence = db_proxy.map(|proxy| Arc::new(AMASPersistence::new(proxy)));
        let ensemble = EnsembleDecision::new(config.feature_flags.clone());

        Self {
            config,
            persistence,
            ensemble,
            user_models: Arc::new(RwLock::new(HashMap::new())),
            user_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn process_event(
        &self,
        user_id: &str,
        event: RawEvent,
        options: ProcessOptions,
    ) -> Result<ProcessResult, String> {
        let mut state = self.load_or_init_state(user_id).await;
        let mut models = self.get_or_init_models(user_id, &state).await;

        let feature_vector = self.build_feature_vector(&event, &state.user_state);

        let new_user_state = self.update_modeling(&mut models, &event, &state.user_state, &options);

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

        let (new_strategy, candidates) = if let Some(cs_strategy) = cold_start_result {
            (cs_strategy, vec![])
        } else {
            self.ensemble.decide(
                &new_user_state,
                &feature_vector,
                &current_strategy,
                None,
                None,
            )
        };

        let reward = self.compute_reward(&event, &new_user_state, &options);
        let explanation = self.build_explanation(&candidates, &new_user_state, &new_strategy);

        let word_mastery_decision = event.word_id.as_ref().map(|wid| WordMasteryDecision {
            word_id: wid.clone(),
            prev_mastery: state.user_state.cognitive.mem,
            new_mastery: new_user_state.cognitive.mem,
            prev_interval: current_strategy.interval_scale,
            new_interval: new_strategy.interval_scale,
            quality: if event.is_correct { 4 } else { 2 },
        });

        let cold_start_phase = models.cold_start.as_ref().map(|cs| cs.phase());

        state.user_state = new_user_state.clone();
        state.current_strategy = new_strategy.clone();
        state.interaction_count += 1;
        state.last_updated = chrono::Utc::now().timestamp_millis();

        if let Some(ref cs) = models.cold_start {
            state.cold_start_state = Some(cs.state().clone());
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
                let _ = persistence.save_state(&state).await;
            }
        }

        Ok(ProcessResult {
            state: new_user_state,
            strategy: new_strategy,
            reward,
            explanation,
            feature_vector: Some(feature_vector),
            word_mastery_decision,
            cold_start_phase,
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

    async fn load_or_init_state(&self, user_id: &str) -> PersistedAMASState {
        {
            let states = self.user_states.read().await;
            if let Some(state) = states.get(user_id) {
                return state.clone();
            }
        }

        if let Some(ref persistence) = self.persistence {
            if let Some(state) = persistence.load_state(user_id).await {
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

    async fn get_or_init_models(&self, user_id: &str, state: &PersistedAMASState) -> UserModels {
        {
            let models = self.user_models.read().await;
            if let Some(m) = models.get(user_id) {
                return UserModels {
                    attention: AttentionMonitor::new(self.config.attention_weights.clone(), self.config.attention_smoothing),
                    fatigue: FatigueEstimator::new(self.config.fatigue.clone()),
                    cognitive: CognitiveProfiler::new(self.config.cognitive.clone()),
                    motivation: MotivationTracker::new(self.config.motivation.clone()),
                    trend: TrendAnalyzer::new(self.config.trend.clone()),
                    cold_start: m.cold_start.as_ref().map(|cs| ColdStartManager::from_state(self.config.cold_start.clone(), cs.state().clone())),
                };
            }
        }

        let models = if let Some(ref cs_state) = state.cold_start_state {
            UserModels::from_cold_start_state(&self.config, cs_state.clone())
        } else {
            UserModels::new(&self.config)
        };

        let mut model_map = self.user_models.write().await;
        model_map.insert(user_id.to_string(), UserModels::new(&self.config));

        models
    }

    fn build_feature_vector(&self, event: &RawEvent, state: &UserState) -> FeatureVector {
        let rt_norm = (event.response_time as f64 / self.config.perception.max_response_time as f64).min(1.0);
        let dwell_norm = event.dwell_time.map(|d| (d as f64 / 10000.0).min(1.0)).unwrap_or(0.5);
        let retry_norm = (event.retry_count as f64 / 5.0).min(1.0);

        let values = vec![
            rt_norm,
            dwell_norm,
            if event.is_correct { 1.0 } else { 0.0 },
            retry_norm,
            state.attention,
            state.fatigue,
            state.motivation,
            state.cognitive.mem,
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
        ];

        FeatureVector::new(values, labels)
    }

    fn update_modeling(
        &self,
        models: &mut UserModels,
        event: &RawEvent,
        prev_state: &UserState,
        options: &ProcessOptions,
    ) -> UserState {
        use crate::amas::modeling::attention::AttentionFeatures;
        use crate::amas::modeling::cognitive::CognitiveInput;
        use crate::amas::modeling::fatigue::FatigueFeatures;
        use crate::amas::modeling::motivation::MotivationEvent;

        let rt_norm = (event.response_time as f64 / self.config.perception.max_response_time as f64).min(1.0);

        let attention = models.attention.update(AttentionFeatures {
            rt_mean: rt_norm,
            rt_cv: 0.0,
            pace_cv: 0.0,
            pause_count: 0.0,
            switch_count: 0.0,
            drift: 0.0,
            interaction_density: 0.5,
            focus_loss: 0.0,
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

        let motivation = models.motivation.update(MotivationEvent {
            is_correct: event.is_correct,
            is_quit: false,
            streak_length: models.motivation.streak(),
        });

        let mastery_score = (cognitive.mem + cognitive.speed + cognitive.stability) / 3.0;
        let trend = models.trend.update(mastery_score);

        let conf = (self.config.confidence_decay * prev_state.conf + (1.0 - self.config.confidence_decay) * 0.7)
            .max(self.config.min_confidence);

        UserState {
            attention,
            fatigue,
            cognitive,
            motivation,
            habit: prev_state.habit.clone(),
            trend: Some(trend),
            conf,
            ts: chrono::Utc::now().timestamp_millis(),
            visual_fatigue: prev_state.visual_fatigue.clone(),
            fused_fatigue: options.visual_fatigue_score,
        }
    }

    fn compute_reward(&self, event: &RawEvent, state: &UserState, _options: &ProcessOptions) -> Reward {
        let accuracy_score = if event.is_correct { 1.0 } else { 0.0 };

        let speed_score = 1.0 - (event.response_time as f64 / self.config.perception.max_response_time as f64).min(1.0);

        let stability_score = state.cognitive.stability;

        let retention_score = state.cognitive.mem;

        let reward_value = self.config.reward.accuracy_weight * accuracy_score
            + self.config.reward.speed_weight * speed_score
            + self.config.reward.stability_weight * stability_score
            + self.config.reward.retention_weight * retention_score;

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
}

impl Default for AMASEngine {
    fn default() -> Self {
        Self::new(AMASConfig::default(), None)
    }
}
