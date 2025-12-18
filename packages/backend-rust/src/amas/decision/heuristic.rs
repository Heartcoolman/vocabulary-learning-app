use crate::amas::types::{DifficultyLevel, StrategyParams, UserState};

pub struct HeuristicLearner {
    fatigue_threshold: f64,
    attention_threshold: f64,
    motivation_threshold: f64,
}

impl HeuristicLearner {
    pub fn new(fatigue_threshold: f64, attention_threshold: f64, motivation_threshold: f64) -> Self {
        Self {
            fatigue_threshold,
            attention_threshold,
            motivation_threshold,
        }
    }

    pub fn suggest(&self, state: &UserState, current: &StrategyParams) -> StrategyParams {
        let mut result = current.clone();

        if state.fatigue > self.fatigue_threshold {
            result.batch_size = (result.batch_size - 2).max(5);
            result.new_ratio = (result.new_ratio - 0.1).max(0.1);
            if result.difficulty == DifficultyLevel::Hard {
                result.difficulty = DifficultyLevel::Mid;
            }
        }

        if state.attention < self.attention_threshold {
            result.hint_level = (result.hint_level + 1).min(2);
            result.batch_size = (result.batch_size - 1).max(5);
        }

        if state.motivation < self.motivation_threshold {
            result.difficulty = match result.difficulty {
                DifficultyLevel::Hard => DifficultyLevel::Mid,
                DifficultyLevel::Mid => DifficultyLevel::Easy,
                DifficultyLevel::Easy => DifficultyLevel::Easy,
            };
            result.interval_scale = (result.interval_scale * 1.1).min(1.5);
        }

        if state.motivation > 0.7 && state.fatigue < 0.3 && state.attention > 0.7 {
            result.batch_size = (result.batch_size + 2).min(16);
            result.new_ratio = (result.new_ratio + 0.05).min(0.4);
            if result.difficulty == DifficultyLevel::Easy {
                result.difficulty = DifficultyLevel::Mid;
            }
        }

        if state.cognitive.mem > 0.8 && state.cognitive.speed > 0.7 {
            result.interval_scale = (result.interval_scale * 0.9).max(0.5);
        } else if state.cognitive.mem < 0.4 {
            result.interval_scale = (result.interval_scale * 1.2).min(1.5);
            result.hint_level = (result.hint_level + 1).min(2);
        }

        result
    }

    pub fn confidence(&self, state: &UserState) -> f64 {
        let fatigue_factor: f64 = if state.fatigue > self.fatigue_threshold { 0.8 } else { 1.0 };
        let attention_factor: f64 = if state.attention < self.attention_threshold { 0.8 } else { 1.0 };
        let motivation_factor: f64 = if state.motivation < self.motivation_threshold { 0.8 } else { 1.0 };

        (fatigue_factor * attention_factor * motivation_factor).max(0.3)
    }
}

impl Default for HeuristicLearner {
    fn default() -> Self {
        Self::new(0.7, 0.4, -0.3)
    }
}
