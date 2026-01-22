use chrono::Timelike;

use crate::amas::types::{DifficultyLevel, StrategyParams, UserState};

pub struct HeuristicLearner {
    fatigue_threshold: f64,
    attention_threshold: f64,
    motivation_threshold: f64,
}

impl HeuristicLearner {
    pub fn new(
        fatigue_threshold: f64,
        attention_threshold: f64,
        motivation_threshold: f64,
    ) -> Self {
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

        if let Some(habit) = state.habit.as_ref() {
            if habit.samples.time_events >= 10 {
                let hour = chrono::Local::now().hour() as i32;
                let pref_score = habit.time_pref.get(hour as usize).copied().unwrap_or(0.0);
                let is_preferred = habit.preferred_time_slots.contains(&hour);
                if pref_score >= 0.6 || is_preferred {
                    result.batch_size = (result.batch_size + 1).min(16);
                    result.new_ratio = (result.new_ratio + 0.05).min(0.4);
                    if result.difficulty == DifficultyLevel::Easy {
                        result.difficulty = DifficultyLevel::Mid;
                    }
                } else if pref_score <= 0.2 {
                    result.batch_size = (result.batch_size - 1).max(5);
                    result.new_ratio = (result.new_ratio - 0.05).max(0.1);
                    result.hint_level = (result.hint_level + 1).min(2);
                }

                if habit.samples.batches >= 5 {
                    let target = habit.rhythm_pref.batch_median.round() as i32;
                    let delta = target - result.batch_size;
                    if delta.abs() >= 2 {
                        result.batch_size = (result.batch_size + delta.signum()).clamp(5, 16);
                    }
                }
            }
        }

        result
    }

    pub fn confidence(&self, state: &UserState) -> f64 {
        let fatigue_factor: f64 = if state.fatigue > self.fatigue_threshold {
            0.8
        } else {
            1.0
        };
        let attention_factor: f64 = if state.attention < self.attention_threshold {
            0.8
        } else {
            1.0
        };
        let motivation_factor: f64 = if state.motivation < self.motivation_threshold {
            0.8
        } else {
            1.0
        };

        (fatigue_factor * attention_factor * motivation_factor).max(0.3)
    }
}

impl Default for HeuristicLearner {
    fn default() -> Self {
        Self::new(0.7, 0.4, -0.3)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::amas::types::{
        CognitiveProfile, DifficultyLevel, HabitProfile, HabitSamples, RhythmPreference,
        StrategyParams, UserState,
    };

    fn sample_strategy() -> StrategyParams {
        StrategyParams {
            difficulty: DifficultyLevel::Mid,
            new_ratio: 0.2,
            batch_size: 8,
            interval_scale: 1.0,
            hint_level: 1,
        }
    }

    fn sample_user_state() -> UserState {
        UserState {
            attention: 0.7,
            fatigue: 0.3,
            cognitive: CognitiveProfile::default(),
            motivation: 0.5,
            habit: None,
            trend: None,
            conf: 0.5,
            ts: 0,
            visual_fatigue: None,
            fused_fatigue: None,
        }
    }

    #[test]
    fn new_sets_thresholds() {
        let learner = HeuristicLearner::new(0.8, 0.5, -0.2);
        assert!((learner.fatigue_threshold - 0.8).abs() < 1e-6);
        assert!((learner.attention_threshold - 0.5).abs() < 1e-6);
        assert!((learner.motivation_threshold - (-0.2)).abs() < 1e-6);
    }

    #[test]
    fn default_uses_standard_thresholds() {
        let learner = HeuristicLearner::default();
        assert!((learner.fatigue_threshold - 0.7).abs() < 1e-6);
        assert!((learner.attention_threshold - 0.4).abs() < 1e-6);
        assert!((learner.motivation_threshold - (-0.3)).abs() < 1e-6);
    }

    #[test]
    fn suggest_reduces_batch_on_high_fatigue() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.8;
        let current = StrategyParams {
            batch_size: 10,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.batch_size < 10);
    }

    #[test]
    fn suggest_reduces_new_ratio_on_high_fatigue() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.8;
        let current = StrategyParams {
            new_ratio: 0.3,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.new_ratio < 0.3);
    }

    #[test]
    fn suggest_downgrades_difficulty_on_high_fatigue() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.8;
        let current = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert_eq!(suggested.difficulty, DifficultyLevel::Mid);
    }

    #[test]
    fn suggest_increases_hint_on_low_attention() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.attention = 0.3;
        let current = StrategyParams {
            hint_level: 0,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.hint_level >= 1);
    }

    #[test]
    fn suggest_reduces_batch_on_low_attention() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.attention = 0.3;
        let current = StrategyParams {
            batch_size: 10,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.batch_size < 10);
    }

    #[test]
    fn suggest_downgrades_difficulty_on_low_motivation() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.motivation = -0.5;
        let current = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert_eq!(suggested.difficulty, DifficultyLevel::Mid);
    }

    #[test]
    fn suggest_increases_interval_on_low_motivation() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.motivation = -0.5;
        let current = StrategyParams {
            interval_scale: 1.0,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.interval_scale > 1.0);
    }

    #[test]
    fn suggest_boosts_on_positive_state() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.motivation = 0.8;
        state.fatigue = 0.2;
        state.attention = 0.8;
        let current = StrategyParams {
            batch_size: 8,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.batch_size > 8);
        assert!(suggested.new_ratio > 0.2);
        assert_eq!(suggested.difficulty, DifficultyLevel::Mid);
    }

    #[test]
    fn suggest_reduces_interval_on_high_cognitive() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.cognitive = CognitiveProfile {
            mem: 0.9,
            speed: 0.8,
            stability: 0.7,
        };
        let current = StrategyParams {
            interval_scale: 1.0,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.interval_scale < 1.0);
    }

    #[test]
    fn suggest_increases_interval_on_low_cognitive_mem() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.cognitive = CognitiveProfile {
            mem: 0.3,
            speed: 0.5,
            stability: 0.5,
        };
        let current = StrategyParams {
            interval_scale: 1.0,
            hint_level: 0,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.interval_scale > 1.0);
        assert!(suggested.hint_level >= 1);
    }

    #[test]
    fn suggest_uses_habit_time_preference() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        let mut time_pref = vec![0.0; 24];
        let hour = chrono::Local::now().hour() as usize;
        time_pref[hour] = 0.8;
        state.habit = Some(HabitProfile {
            time_pref,
            rhythm_pref: RhythmPreference::default(),
            preferred_time_slots: vec![hour as i32],
            samples: HabitSamples {
                time_events: 15,
                sessions: 10,
                batches: 3,
            },
        });
        let current = StrategyParams {
            batch_size: 8,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.batch_size >= 8);
    }

    #[test]
    fn suggest_uses_habit_rhythm_preference() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.habit = Some(HabitProfile {
            time_pref: vec![0.5; 24],
            rhythm_pref: RhythmPreference {
                session_median_minutes: 20.0,
                batch_median: 12.0,
            },
            preferred_time_slots: vec![],
            samples: HabitSamples {
                time_events: 15,
                sessions: 10,
                batches: 10,
            },
        });
        let current = StrategyParams {
            batch_size: 5,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.batch_size > 5);
    }

    #[test]
    fn suggest_ignores_habit_with_insufficient_samples() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.habit = Some(HabitProfile {
            time_pref: vec![0.9; 24],
            rhythm_pref: RhythmPreference::default(),
            preferred_time_slots: vec![],
            samples: HabitSamples {
                time_events: 5,
                sessions: 2,
                batches: 1,
            },
        });
        let current = sample_strategy();
        let suggested = learner.suggest(&state, &current);
        assert_eq!(suggested.batch_size, current.batch_size);
    }

    #[test]
    fn suggest_handles_none_habit() {
        let learner = HeuristicLearner::default();
        let state = sample_user_state();
        let current = sample_strategy();
        let suggested = learner.suggest(&state, &current);
        assert_eq!(suggested.batch_size, current.batch_size);
    }

    #[test]
    fn suggest_clamps_batch_size() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.9;
        state.attention = 0.2;
        let current = StrategyParams {
            batch_size: 6,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.batch_size >= 5);
    }

    #[test]
    fn suggest_clamps_new_ratio() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.9;
        let current = StrategyParams {
            new_ratio: 0.15,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.new_ratio >= 0.1);
    }

    #[test]
    fn suggest_clamps_interval_scale() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.motivation = -0.8;
        state.cognitive.mem = 0.2;
        let current = StrategyParams {
            interval_scale: 1.4,
            ..sample_strategy()
        };
        let suggested = learner.suggest(&state, &current);
        assert!(suggested.interval_scale <= 1.5);
    }

    #[test]
    fn confidence_returns_one_for_normal_state() {
        let learner = HeuristicLearner::default();
        let state = sample_user_state();
        let conf = learner.confidence(&state);
        assert!((conf - 1.0).abs() < 1e-6);
    }

    #[test]
    fn confidence_reduces_on_high_fatigue() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.8;
        let conf = learner.confidence(&state);
        assert!(conf < 1.0);
    }

    #[test]
    fn confidence_reduces_on_low_attention() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.attention = 0.3;
        let conf = learner.confidence(&state);
        assert!(conf < 1.0);
    }

    #[test]
    fn confidence_reduces_on_low_motivation() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.motivation = -0.5;
        let conf = learner.confidence(&state);
        assert!(conf < 1.0);
    }

    #[test]
    fn confidence_has_minimum_floor() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 1.0;
        state.attention = 0.0;
        state.motivation = -1.0;
        let conf = learner.confidence(&state);
        assert!(conf >= 0.3);
    }

    #[test]
    fn confidence_compounds_multiple_factors() {
        let learner = HeuristicLearner::default();
        let mut state = sample_user_state();
        state.fatigue = 0.8;
        state.attention = 0.3;
        let conf = learner.confidence(&state);
        assert!((conf - 0.64).abs() < 1e-6);
    }
}
