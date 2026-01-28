use crate::amas::config::ColdStartConfig;
use crate::amas::types::{
    ColdStartPhase, ColdStartState, ContinuousUserProfile, StrategyParams, UserType,
};
use std::cmp::Ordering;

#[derive(Debug, Clone, Default)]
pub struct ColdStartSignals {
    pub attention: f64,
    pub motivation: f64,
    pub cognitive_mem: f64,
    pub rt_variance: f64,
    pub has_signals: bool,
}

pub struct ColdStartManager {
    config: ColdStartConfig,
    state: ColdStartState,
}

impl ColdStartManager {
    pub fn new(config: ColdStartConfig) -> Self {
        Self {
            config,
            state: ColdStartState::default(),
        }
    }

    pub fn from_state(config: ColdStartConfig, state: ColdStartState) -> Self {
        Self { config, state }
    }

    pub fn update(&mut self, accuracy: f64, response_time: i64) -> Option<StrategyParams> {
        self.update_with_signals(accuracy, response_time, &ColdStartSignals::default())
    }

    pub fn update_with_signals(
        &mut self,
        accuracy: f64,
        response_time: i64,
        signals: &ColdStartSignals,
    ) -> Option<StrategyParams> {
        // Update continuous profile in parallel with discrete classification
        self.update_continuous_profile(accuracy, response_time, signals);

        match self.state.phase {
            ColdStartPhase::Classify => self.handle_classify(accuracy, response_time, signals),
            ColdStartPhase::Explore => self.handle_explore(accuracy),
            ColdStartPhase::Normal => self.handle_normal(),
        }
    }

    fn update_continuous_profile(
        &mut self,
        accuracy: f64,
        response_time: i64,
        signals: &ColdStartSignals,
    ) {
        let profile = self
            .state
            .continuous_profile
            .get_or_insert_with(ContinuousUserProfile::default);
        profile.update(
            accuracy,
            response_time,
            signals.attention,
            signals.motivation,
        );
    }

    fn handle_normal(&self) -> Option<StrategyParams> {
        // In Normal phase, use continuous profile if confidence is high enough
        if let Some(ref profile) = self.state.continuous_profile {
            if profile.min_confidence() > 0.6 {
                return Some(profile.to_strategy());
            }
        }
        // Otherwise return settled strategy
        self.state.settled_strategy.clone()
    }

    fn handle_classify(
        &mut self,
        accuracy: f64,
        response_time: i64,
        signals: &ColdStartSignals,
    ) -> Option<StrategyParams> {
        let fast_score = self.compute_fast_score(accuracy, response_time, signals);
        let stable_score = self.compute_stable_score(accuracy, signals);
        let cautious_score = self.compute_cautious_score(accuracy, response_time, signals);

        self.state.classification_scores[0] += fast_score;
        self.state.classification_scores[1] += stable_score;
        self.state.classification_scores[2] += cautious_score;

        self.state.update_count += 1;

        if self.state.update_count >= self.config.min_classify_samples {
            if let Some(user_type) = self.classify_confident_user_type() {
                self.state.user_type = Some(user_type);
                self.state.phase = ColdStartPhase::Explore;
                self.state.probe_index = 0;
                return Some(StrategyParams::for_user_type(user_type));
            }
        }

        if self.state.update_count >= self.config.classify_samples {
            let max_idx = self
                .state
                .classification_scores
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
                .map(|(i, _)| i)
                .unwrap_or(1);

            self.state.user_type = Some(match max_idx {
                0 => UserType::Fast,
                2 => UserType::Cautious,
                _ => UserType::Stable,
            });

            // Initialize continuous profile from detected user type
            if self.state.continuous_profile.is_none() {
                self.state.continuous_profile = Some(ContinuousUserProfile::from_user_type(
                    self.state.user_type.unwrap(),
                ));
            }

            self.state.phase = ColdStartPhase::Explore;
            self.state.probe_index = 0;

            return Some(StrategyParams::for_user_type(self.state.user_type.unwrap()));
        }

        // 分类完成前也返回临时策略，实现从第1题开始个性化
        let provisional_type = if response_time < 2000 && accuracy > 0.8 {
            UserType::Fast
        } else if response_time > 4000 || accuracy < 0.6 {
            UserType::Cautious
        } else {
            UserType::Stable
        };
        Some(StrategyParams::for_user_type(provisional_type))
    }

    fn handle_explore(&mut self, accuracy: f64) -> Option<StrategyParams> {
        self.state.update_count += 1;

        // Calculate actual explore samples. Use min_classify_samples as baseline since
        // early transition can happen before reaching classify_samples. Ensure non-negative.
        let classify_baseline = self
            .config
            .min_classify_samples
            .min(self.state.update_count - 1);
        let explore_samples = (self.state.update_count - classify_baseline).max(1);

        // Early exit only if we have enough explore samples AND accuracy is extreme
        if explore_samples >= self.config.min_explore_samples
            && (accuracy >= self.config.explore_high_accuracy
                || accuracy <= self.config.explore_low_accuracy)
            {
                return self.finish_explore(accuracy);
            }

        if explore_samples >= self.config.explore_samples {
            return self.finish_explore(accuracy);
        }

        if self.state.probe_index < self.config.probe_sequence.len() as i32 {
            let probe_idx = self.config.probe_sequence[self.state.probe_index as usize];
            self.state.probe_index += 1;

            let user_type = match probe_idx {
                0 => UserType::Fast,
                2 => UserType::Cautious,
                _ => UserType::Stable,
            };

            return Some(StrategyParams::for_user_type(user_type));
        }

        None
    }

    fn classify_confident_user_type(&self) -> Option<UserType> {
        let total: f64 = self.state.classification_scores.iter().sum();
        if total <= 1e-6 {
            return None;
        }
        let mut indexed: Vec<(usize, f64)> = self
            .state
            .classification_scores
            .iter()
            .copied()
            .enumerate()
            .collect();
        indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
        let (top_idx, top_score) = indexed[0];
        let second_score = indexed.get(1).map(|(_, s)| *s).unwrap_or(0.0);
        let margin = (top_score - second_score) / total.max(1e-6);
        if margin < self.config.classify_confidence_margin {
            return None;
        }
        Some(match top_idx {
            0 => UserType::Fast,
            2 => UserType::Cautious,
            _ => UserType::Stable,
        })
    }

    fn finish_explore(&mut self, accuracy: f64) -> Option<StrategyParams> {
        self.state.phase = ColdStartPhase::Normal;

        let user_type = self.state.user_type.unwrap_or(UserType::Stable);
        let base_strategy = StrategyParams::for_user_type(user_type);

        let adjusted = if accuracy >= self.config.explore_high_accuracy {
            StrategyParams {
                difficulty: crate::amas::types::DifficultyLevel::Hard,
                new_ratio: (base_strategy.new_ratio + 0.1).min(0.4),
                ..base_strategy
            }
        } else if accuracy <= self.config.explore_low_accuracy {
            StrategyParams {
                difficulty: crate::amas::types::DifficultyLevel::Easy,
                new_ratio: (base_strategy.new_ratio - 0.1).max(0.1),
                hint_level: 2,
                ..base_strategy
            }
        } else {
            base_strategy
        };

        self.state.settled_strategy = Some(adjusted.clone());
        Some(adjusted)
    }

    pub fn phase(&self) -> ColdStartPhase {
        self.state.phase
    }

    pub fn state(&self) -> &ColdStartState {
        &self.state
    }

    pub fn is_complete(&self) -> bool {
        matches!(self.state.phase, ColdStartPhase::Normal)
    }

    pub fn user_type(&self) -> Option<UserType> {
        self.state.user_type
    }

    pub fn settled_strategy(&self) -> Option<&StrategyParams> {
        self.state.settled_strategy.as_ref()
    }

    fn compute_fast_score(
        &self,
        accuracy: f64,
        response_time: i64,
        signals: &ColdStartSignals,
    ) -> f64 {
        let mut score = 0.0;
        if response_time < 2000 && accuracy > 0.8 {
            score += 1.0;
        }
        // Only apply signal-based scoring when signals are provided
        if signals.has_signals {
            if signals.attention > 0.7 {
                score += 0.3;
            }
            if signals.rt_variance < 0.3 {
                score += 0.2;
            }
            if signals.cognitive_mem > 0.7 {
                score += 0.2;
            }
        }
        score
    }

    fn compute_stable_score(&self, accuracy: f64, signals: &ColdStartSignals) -> f64 {
        let mut score = 0.0;
        if (0.6..=0.85).contains(&accuracy) {
            score += 1.0;
        }
        // Only apply signal-based scoring when signals are provided
        if signals.has_signals {
            if signals.cognitive_mem > 0.5 && signals.cognitive_mem <= 0.8 {
                score += 0.3;
            }
            if signals.motivation > 0.0 && signals.motivation < 0.5 {
                score += 0.2;
            }
            if signals.rt_variance >= 0.3 && signals.rt_variance <= 0.6 {
                score += 0.2;
            }
        }
        score
    }

    fn compute_cautious_score(
        &self,
        accuracy: f64,
        response_time: i64,
        signals: &ColdStartSignals,
    ) -> f64 {
        let mut score = 0.0;
        if response_time > 4000 || accuracy < 0.6 {
            score += 1.0;
        }
        // Only apply signal-based scoring when signals are provided
        if signals.has_signals {
            if signals.motivation < 0.0 {
                score += 0.3;
            }
            if signals.attention < 0.5 {
                score += 0.2;
            }
            if signals.rt_variance > 0.6 {
                score += 0.2;
            }
        }
        score
    }
}

impl Default for ColdStartManager {
    fn default() -> Self {
        Self::new(ColdStartConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::amas::config::ColdStartConfig;
    use crate::amas::types::{ColdStartPhase, DifficultyLevel, UserType};

    fn fast_user_signals() -> ColdStartSignals {
        ColdStartSignals {
            attention: 0.8,
            motivation: 0.6,
            cognitive_mem: 0.8,
            rt_variance: 0.2,
            has_signals: true,
        }
    }

    fn cautious_user_signals() -> ColdStartSignals {
        ColdStartSignals {
            attention: 0.3,
            motivation: -0.2,
            cognitive_mem: 0.4,
            rt_variance: 0.8,
            has_signals: true,
        }
    }

    #[test]
    fn new_starts_in_classify_phase() {
        let manager = ColdStartManager::default();
        assert!(matches!(manager.phase(), ColdStartPhase::Classify));
        assert!(manager.user_type().is_none());
        assert!(!manager.is_complete());
    }

    #[test]
    fn from_state_restores_state() {
        let config = ColdStartConfig::default();
        let mut state = ColdStartState::default();
        state.phase = ColdStartPhase::Explore;
        state.user_type = Some(UserType::Fast);
        let manager = ColdStartManager::from_state(config, state);
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        assert_eq!(manager.user_type(), Some(UserType::Fast));
    }

    #[test]
    fn classify_fast_user() {
        let config = ColdStartConfig {
            classify_samples: 3,
            min_classify_samples: 2,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        for _ in 0..3 {
            manager.update_with_signals(0.95, 1500, &fast_user_signals());
        }
        assert_eq!(manager.user_type(), Some(UserType::Fast));
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
    }

    #[test]
    fn classify_cautious_user() {
        let config = ColdStartConfig {
            classify_samples: 3,
            min_classify_samples: 2,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        for _ in 0..3 {
            manager.update_with_signals(0.4, 5000, &cautious_user_signals());
        }
        assert_eq!(manager.user_type(), Some(UserType::Cautious));
    }

    #[test]
    fn classify_stable_user() {
        let config = ColdStartConfig {
            classify_samples: 3,
            min_classify_samples: 2,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        let stable_signals = ColdStartSignals {
            attention: 0.6,
            motivation: 0.3,
            cognitive_mem: 0.6,
            rt_variance: 0.4,
            has_signals: true,
        };
        for _ in 0..3 {
            manager.update_with_signals(0.7, 3000, &stable_signals);
        }
        assert_eq!(manager.user_type(), Some(UserType::Stable));
    }

    #[test]
    fn early_classification_with_high_confidence() {
        let config = ColdStartConfig {
            classify_samples: 5,
            min_classify_samples: 2,
            classify_confidence_margin: 0.3,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        manager.update_with_signals(0.95, 1200, &fast_user_signals());
        manager.update_with_signals(0.95, 1300, &fast_user_signals());
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        assert_eq!(manager.user_type(), Some(UserType::Fast));
    }

    #[test]
    fn explore_to_normal_on_high_accuracy() {
        let config = ColdStartConfig {
            classify_samples: 2,
            explore_samples: 5,
            min_classify_samples: 2,
            min_explore_samples: 2,
            explore_high_accuracy: 0.85,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        // First two updates: classify phase -> explore phase
        manager.update(0.9, 1500);
        manager.update(0.9, 1500);
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        // Third update: first explore sample, not enough yet
        manager.update(0.9, 1500);
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        // Fourth update: second explore sample with high accuracy triggers early exit
        manager.update(0.9, 1500);
        assert!(matches!(manager.phase(), ColdStartPhase::Normal));
        assert!(manager.is_complete());
    }

    #[test]
    fn explore_to_normal_on_low_accuracy() {
        let config = ColdStartConfig {
            classify_samples: 2,
            explore_samples: 5,
            min_classify_samples: 2,
            min_explore_samples: 2,
            explore_low_accuracy: 0.5,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        // First two updates: classify phase -> explore phase
        manager.update(0.4, 5000);
        manager.update(0.4, 5000);
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        // Third update: first explore sample, not enough yet
        manager.update(0.4, 5000);
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        // Fourth update: second explore sample with low accuracy triggers early exit
        manager.update(0.4, 5000);
        assert!(matches!(manager.phase(), ColdStartPhase::Normal));
    }

    #[test]
    fn settled_strategy_adjusted_for_high_accuracy() {
        let config = ColdStartConfig {
            classify_samples: 2,
            explore_samples: 2,
            min_classify_samples: 1,
            min_explore_samples: 1,
            explore_high_accuracy: 0.85,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        manager.update(0.9, 1500);
        manager.update(0.9, 1500);
        manager.update(0.9, 1500);
        let strategy = manager.settled_strategy().unwrap();
        assert_eq!(strategy.difficulty, DifficultyLevel::Hard);
    }

    #[test]
    fn settled_strategy_adjusted_for_low_accuracy() {
        let config = ColdStartConfig {
            classify_samples: 2,
            explore_samples: 2,
            min_classify_samples: 1,
            min_explore_samples: 1,
            explore_low_accuracy: 0.5,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        manager.update(0.3, 5000);
        manager.update(0.3, 5000);
        manager.update(0.3, 5000);
        let strategy = manager.settled_strategy().unwrap();
        assert_eq!(strategy.difficulty, DifficultyLevel::Easy);
        assert_eq!(strategy.hint_level, 2);
    }

    #[test]
    fn update_returns_provisional_strategy_during_classify() {
        let mut manager = ColdStartManager::default();
        let result = manager.update(0.9, 1500);
        assert!(result.is_some());
    }

    #[test]
    fn probe_sequence_advances_in_explore() {
        let config = ColdStartConfig {
            classify_samples: 1,
            explore_samples: 6,
            min_classify_samples: 1,
            min_explore_samples: 1,
            probe_sequence: vec![0, 1, 2, 0, 1, 2],
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        manager.update(0.7, 3000);
        assert!(matches!(manager.phase(), ColdStartPhase::Explore));
        let s1 = manager.update(0.7, 3000);
        let s2 = manager.update(0.7, 3000);
        assert!(s1.is_some());
        assert!(s2.is_some());
    }

    #[test]
    fn continuous_profile_initialized_after_classification() {
        let config = ColdStartConfig {
            classify_samples: 2,
            min_classify_samples: 1,
            ..Default::default()
        };
        let mut manager = ColdStartManager::new(config);
        manager.update(0.9, 1500);
        manager.update(0.9, 1500);
        assert!(manager.state().continuous_profile.is_some());
    }

    #[test]
    fn continuous_profile_updates_on_each_call() {
        let mut manager = ColdStartManager::default();
        manager.update_with_signals(0.8, 2000, &fast_user_signals());
        let profile = manager.state().continuous_profile.as_ref().unwrap();
        let initial_speed = profile.speed;
        manager.update_with_signals(0.9, 1000, &fast_user_signals());
        let profile = manager.state().continuous_profile.as_ref().unwrap();
        assert!(profile.speed != initial_speed || profile.confidence[0] > 0.0);
    }

    #[test]
    fn compute_fast_score_high_for_fast_user() {
        let manager = ColdStartManager::default();
        let score = manager.compute_fast_score(0.9, 1500, &fast_user_signals());
        assert!(score > 1.0);
    }

    #[test]
    fn compute_cautious_score_high_for_cautious_user() {
        let manager = ColdStartManager::default();
        let score = manager.compute_cautious_score(0.4, 5000, &cautious_user_signals());
        assert!(score > 1.0);
    }

    #[test]
    fn compute_stable_score_high_for_stable_user() {
        let manager = ColdStartManager::default();
        let stable_signals = ColdStartSignals {
            attention: 0.6,
            motivation: 0.3,
            cognitive_mem: 0.6,
            rt_variance: 0.4,
            has_signals: true,
        };
        let score = manager.compute_stable_score(0.7, &stable_signals);
        assert!(score > 1.0);
    }

    #[test]
    fn handle_normal_returns_settled_strategy() {
        let config = ColdStartConfig::default();
        let mut state = ColdStartState::default();
        state.phase = ColdStartPhase::Normal;
        state.settled_strategy = Some(StrategyParams::for_user_type(UserType::Fast));
        let manager = ColdStartManager::from_state(config, state);
        let result = manager.handle_normal();
        assert!(result.is_some());
        assert_eq!(result.unwrap().difficulty, DifficultyLevel::Hard);
    }

    #[test]
    fn handle_normal_uses_continuous_profile_when_confident() {
        let config = ColdStartConfig::default();
        let mut state = ColdStartState::default();
        state.phase = ColdStartPhase::Normal;
        state.continuous_profile = Some(ContinuousUserProfile {
            speed: 0.8,
            stability: 0.7,
            risk_tolerance: 0.8,
            engagement: 0.9,
            confidence: [0.7, 0.7, 0.7, 0.7],
        });
        let manager = ColdStartManager::from_state(config, state);
        let result = manager.handle_normal();
        assert!(result.is_some());
    }

    #[test]
    fn state_accessor_returns_current_state() {
        let mut manager = ColdStartManager::default();
        manager.update(0.8, 2000);
        let state = manager.state();
        assert_eq!(state.update_count, 1);
    }
}
