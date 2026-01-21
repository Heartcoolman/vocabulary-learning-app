use crate::amas::config::ColdStartConfig;
use crate::amas::types::{ColdStartPhase, ColdStartState, StrategyParams, UserType};
use std::cmp::Ordering;

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
        match self.state.phase {
            ColdStartPhase::Classify => self.handle_classify(accuracy, response_time),
            ColdStartPhase::Explore => self.handle_explore(accuracy),
            ColdStartPhase::Normal => None,
        }
    }

    fn handle_classify(&mut self, accuracy: f64, response_time: i64) -> Option<StrategyParams> {
        let fast_score = if response_time < 2000 && accuracy > 0.8 {
            1.0
        } else {
            0.0
        };
        let stable_score = if accuracy >= 0.6 && accuracy <= 0.85 {
            1.0
        } else {
            0.0
        };
        let cautious_score = if response_time > 4000 || accuracy < 0.6 {
            1.0
        } else {
            0.0
        };

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

        let min_total_samples = self.config.min_classify_samples + self.config.min_explore_samples;
        if self.state.update_count >= min_total_samples {
            if accuracy >= self.config.explore_high_accuracy
                || accuracy <= self.config.explore_low_accuracy
            {
                return self.finish_explore(accuracy);
            }
        }

        if self.state.update_count >= self.config.classify_samples + self.config.explore_samples {
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
}

impl Default for ColdStartManager {
    fn default() -> Self {
        Self::new(ColdStartConfig::default())
    }
}
