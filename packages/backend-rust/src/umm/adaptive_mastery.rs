//! Adaptive Mastery Decision Algorithm
//!
//! Dynamically determines word mastery based on individual user characteristics:
//! - Personal cognitive profile (memory, speed, stability)
//! - Historical performance patterns
//! - Current learning session context
//! - MDM memory state
//!
//! The algorithm adapts the mastery threshold per user rather than using fixed values.

use crate::amas::types::{CognitiveProfile, DifficultyLevel, UserState};
use crate::umm::mdm::MdmState;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// User's personal mastery baseline computed from their cognitive profile
#[derive(Debug, Clone)]
pub struct PersonalBaseline {
    /// Base threshold (0-100) - higher means stricter
    pub base_threshold: f64,
    /// Combined cognitive factor (0-1)
    pub cognitive_factor: f64,
    /// Speed factor - fast learners need fewer reps
    pub speed_factor: f64,
    /// Stability factor - stable learners retain better
    pub stability_factor: f64,
    /// Memory factor - affects how quickly strength accumulates
    pub memory_factor: f64,
}

impl PersonalBaseline {
    /// Compute personal baseline from cognitive profile using all three factors
    pub fn from_cognitive(cognitive: &CognitiveProfile) -> Self {
        // Combined cognitive factor: weighted average of speed, mem, stability
        // Speed has highest weight (learning efficiency)
        // Memory second (retention ability)
        // Stability third (consistency)
        let cognitive_factor =
            cognitive.speed * 0.4 + cognitive.mem * 0.35 + cognitive.stability * 0.25;

        // Base threshold ranges from 35 (excellent learner) to 70 (struggling learner)
        // Center is 52.5 at cognitive_factor = 0.5
        let base_threshold = 70.0 - cognitive_factor * 35.0;

        Self {
            base_threshold: base_threshold.clamp(35.0, 70.0),
            cognitive_factor,
            speed_factor: cognitive.speed,
            stability_factor: cognitive.stability,
            memory_factor: cognitive.mem,
        }
    }

    /// Apply difficulty level adjustment
    pub fn adjusted_threshold(&self, difficulty: DifficultyLevel) -> f64 {
        let difficulty_multiplier = match difficulty {
            DifficultyLevel::Easy => 0.75,
            DifficultyLevel::Mid => 1.0,
            DifficultyLevel::Hard => 1.25,
        };
        (self.base_threshold * difficulty_multiplier).clamp(25.0, 80.0)
    }
}

/// Historical mastery attempt record for adaptive threshold
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasteryAttempt {
    /// Score achieved
    pub score: f64,
    /// Threshold at the time
    pub threshold: f64,
    /// Whether it was mastered
    pub mastered: bool,
    /// Timestamp
    pub timestamp: i64,
}

/// Adaptive history tracker for dynamic threshold adjustment
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MasteryHistory {
    /// Recent mastery attempts (last N)
    pub attempts: VecDeque<MasteryAttempt>,
    /// Running average of score-threshold margin
    pub avg_margin: f64,
    /// Count of "near miss" attempts (within 10% of threshold)
    pub near_miss_count: i32,
    /// Count of "easy pass" attempts (>20% above threshold)
    pub easy_pass_count: i32,
}

impl MasteryHistory {
    const MAX_HISTORY: usize = 20;
    const NEAR_MISS_THRESHOLD: f64 = 0.1; // Within 10% of threshold
    const EASY_PASS_THRESHOLD: f64 = 0.2; // 20% above threshold

    pub fn new() -> Self {
        Self::default()
    }

    /// Record a new mastery attempt
    pub fn record(&mut self, score: f64, threshold: f64, mastered: bool, timestamp: i64) {
        let margin = (score - threshold) / threshold;

        // Update counters
        if !mastered && margin > -Self::NEAR_MISS_THRESHOLD {
            self.near_miss_count += 1;
        }
        if mastered && margin > Self::EASY_PASS_THRESHOLD {
            self.easy_pass_count += 1;
        }

        // Add to history
        self.attempts.push_back(MasteryAttempt {
            score,
            threshold,
            mastered,
            timestamp,
        });

        // Maintain history size
        while self.attempts.len() > Self::MAX_HISTORY {
            let removed = self.attempts.pop_front().unwrap();
            let old_margin = (removed.score - removed.threshold) / removed.threshold;
            if !removed.mastered && old_margin > -Self::NEAR_MISS_THRESHOLD {
                self.near_miss_count = (self.near_miss_count - 1).max(0);
            }
            if removed.mastered && old_margin > Self::EASY_PASS_THRESHOLD {
                self.easy_pass_count = (self.easy_pass_count - 1).max(0);
            }
        }

        // Update running average
        self.avg_margin = self.compute_avg_margin();
    }

    fn compute_avg_margin(&self) -> f64 {
        if self.attempts.is_empty() {
            return 0.0;
        }
        let sum: f64 = self
            .attempts
            .iter()
            .map(|a| (a.score - a.threshold) / a.threshold)
            .sum();
        sum / self.attempts.len() as f64
    }

    /// Compute threshold adjustment based on history
    /// Returns a multiplier (0.85 to 1.15) to apply to base threshold
    pub fn threshold_adjustment(&self) -> f64 {
        if self.attempts.len() < 3 {
            return 1.0; // Not enough data
        }

        let total = self.attempts.len() as f64;
        let near_miss_ratio = self.near_miss_count as f64 / total;
        let easy_pass_ratio = self.easy_pass_count as f64 / total;

        // If many near misses, lower threshold (make it easier)
        // If many easy passes, raise threshold (make it harder)
        let adjustment = if near_miss_ratio > 0.4 {
            // More than 40% near misses -> lower threshold by up to 15%
            0.85 + (0.4 - near_miss_ratio).max(-0.15) * 0.5
        } else if easy_pass_ratio > 0.5 {
            // More than 50% easy passes -> raise threshold by up to 15%
            1.0 + (easy_pass_ratio - 0.5).min(0.3) * 0.5
        } else {
            // Normal case: slight adjustment based on average margin
            1.0 + self.avg_margin.clamp(-0.1, 0.1) * 0.5
        };

        adjustment.clamp(0.85, 1.15)
    }
}

/// Context for adaptive mastery decision
#[derive(Debug, Clone)]
pub struct MasteryContext {
    /// Is this the first attempt for this word?
    pub is_first_attempt: bool,
    /// Number of correct answers so far
    pub correct_count: i32,
    /// Number of total attempts
    pub total_attempts: i32,
    /// Response time in milliseconds
    pub response_time_ms: i64,
    /// Was hint used?
    pub hint_used: bool,
    /// Consecutive correct answers
    pub consecutive_correct: i32,
}

/// Adaptive mastery decision result
#[derive(Debug, Clone)]
pub struct AdaptiveMasteryResult {
    pub is_mastered: bool,
    pub confidence: f64,
    pub score: f64,
    pub threshold: f64,
    pub factors: MasteryFactors,
}

/// Breakdown of factors contributing to mastery decision
#[derive(Debug, Clone, Default)]
pub struct MasteryFactors {
    pub mdm_contribution: f64,
    pub cognitive_contribution: f64,
    pub performance_contribution: f64,
    pub context_contribution: f64,
}

/// Compute adaptive mastery decision with optional history-based adjustment
pub fn compute_adaptive_mastery(
    mdm: &MdmState,
    user_state: &UserState,
    context: &MasteryContext,
    difficulty: DifficultyLevel,
    is_correct: bool,
) -> AdaptiveMasteryResult {
    compute_adaptive_mastery_with_history(mdm, user_state, context, difficulty, is_correct, None)
}

/// Compute adaptive mastery decision with history-based threshold adjustment
pub fn compute_adaptive_mastery_with_history(
    mdm: &MdmState,
    user_state: &UserState,
    context: &MasteryContext,
    difficulty: DifficultyLevel,
    is_correct: bool,
    history: Option<&MasteryHistory>,
) -> AdaptiveMasteryResult {
    // 1. Compute personal baseline using combined cognitive factors
    let baseline = PersonalBaseline::from_cognitive(&user_state.cognitive);
    let mut threshold = baseline.adjusted_threshold(difficulty);

    // 2. Apply history-based adjustment
    if let Some(hist) = history {
        threshold *= hist.threshold_adjustment();
        threshold = threshold.clamp(25.0, 80.0);
    }

    // 3. MDM contribution (0-35 points)
    // Enhanced: cognitive_factor boosts the weight
    let strength_weight = 2.0 + baseline.cognitive_factor; // 2.0-3.0
    let consolidation_weight = 8.0 + baseline.memory_factor * 4.0; // 8-12
    let mdm_contribution =
        (mdm.strength * strength_weight + mdm.consolidation * consolidation_weight).min(35.0);

    // 4. Cognitive state contribution (0-25 points)
    let attention_score = user_state.attention * 10.0;
    let fatigue_penalty = user_state.fused_fatigue.unwrap_or(user_state.fatigue) * 8.0;
    let motivation_bonus = (user_state.motivation - 0.5).max(0.0) * 10.0;
    let cognitive_contribution =
        (attention_score - fatigue_penalty + motivation_bonus).clamp(0.0, 25.0);

    // 5. Performance contribution (0-30 points)
    let performance_contribution = if is_correct {
        // Speed relative to user's typical speed (adaptive)
        let expected_time = 2500.0 + (1.0 - baseline.speed_factor) * 7500.0; // 2.5-10 seconds
        let speed_score = if context.response_time_ms as f64 <= expected_time {
            15.0 * (1.0 - (context.response_time_ms as f64 / expected_time / 2.0)).max(0.5)
        } else {
            15.0 * (expected_time / context.response_time_ms as f64).max(0.3)
        };

        // Accuracy bonus
        let accuracy = if context.total_attempts > 0 {
            context.correct_count as f64 / context.total_attempts as f64
        } else {
            1.0
        };
        let accuracy_score = accuracy * 10.0;

        // Consecutive correct bonus (enhanced for stable learners)
        let streak_multiplier = 2.5 + baseline.stability_factor * 1.5; // 2.5-4.0
        let streak_score = (context.consecutive_correct as f64).sqrt() * streak_multiplier;

        (speed_score + accuracy_score + streak_score.min(7.0)).min(30.0)
    } else {
        0.0
    };

    // 6. Context contribution (0-15 points)
    let context_contribution = if is_correct {
        let mut bonus = 0.0;

        // First attempt bonus - enhanced for high cognitive factor users
        if context.is_first_attempt && context.response_time_ms < 5000 {
            bonus += 6.0 + baseline.cognitive_factor * 6.0; // 6-12 points
        }

        // No hint bonus
        if !context.hint_used {
            bonus += 3.0;
        }

        bonus.min(15.0)
    } else {
        0.0
    };

    // 7. Total score and decision
    let score =
        mdm_contribution + cognitive_contribution + performance_contribution + context_contribution;
    let is_mastered = score >= threshold;

    // Confidence based on margin
    let margin = score - threshold;
    let confidence = sigmoid(margin / 10.0);

    AdaptiveMasteryResult {
        is_mastered,
        confidence,
        score,
        threshold,
        factors: MasteryFactors {
            mdm_contribution,
            cognitive_contribution,
            performance_contribution,
            context_contribution,
        },
    }
}

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_mdm() -> MdmState {
        MdmState::new()
    }

    fn default_user_state() -> UserState {
        UserState::default()
    }

    fn fast_learner_state() -> UserState {
        let mut state = UserState::default();
        state.cognitive.speed = 0.8;
        state.cognitive.mem = 0.7;
        state.cognitive.stability = 0.6;
        state.attention = 0.8;
        state
    }

    fn slow_learner_state() -> UserState {
        let mut state = UserState::default();
        state.cognitive.speed = 0.3;
        state.cognitive.mem = 0.4;
        state.cognitive.stability = 0.5;
        state
    }

    #[test]
    fn test_combined_cognitive_factor() {
        let fast = PersonalBaseline::from_cognitive(&CognitiveProfile {
            speed: 0.8,
            mem: 0.7,
            stability: 0.6,
        });
        let slow = PersonalBaseline::from_cognitive(&CognitiveProfile {
            speed: 0.3,
            mem: 0.4,
            stability: 0.5,
        });

        // Fast learner should have lower threshold
        assert!(
            fast.base_threshold < slow.base_threshold,
            "Fast learner threshold {} should be lower than slow learner {}",
            fast.base_threshold,
            slow.base_threshold
        );

        // Combined factor should reflect all three metrics
        assert!(fast.cognitive_factor > 0.6);
        assert!(slow.cognitive_factor < 0.5);
    }

    #[test]
    fn test_fast_learner_first_correct_easy() {
        let mut mdm = default_mdm();
        mdm.update(0.9, 1000);

        let context = MasteryContext {
            is_first_attempt: true,
            correct_count: 1,
            total_attempts: 1,
            response_time_ms: 2000,
            hint_used: false,
            consecutive_correct: 1,
        };

        let result = compute_adaptive_mastery(
            &mdm,
            &fast_learner_state(),
            &context,
            DifficultyLevel::Easy,
            true,
        );

        assert!(
            result.is_mastered,
            "Fast learner should master on first quick correct (easy). Score: {}, Threshold: {}",
            result.score, result.threshold
        );
    }

    #[test]
    fn test_slow_learner_needs_more_attempts() {
        let mdm = default_mdm();

        let context = MasteryContext {
            is_first_attempt: true,
            correct_count: 1,
            total_attempts: 1,
            response_time_ms: 4000,
            hint_used: false,
            consecutive_correct: 1,
        };

        let result = compute_adaptive_mastery(
            &mdm,
            &slow_learner_state(),
            &context,
            DifficultyLevel::Mid,
            true,
        );

        assert!(
            !result.is_mastered,
            "Slow learner should not master on first attempt (mid mode)"
        );
    }

    #[test]
    fn test_history_lowers_threshold_on_near_misses() {
        let mut history = MasteryHistory::new();
        let now = 1000i64;

        // Record several near misses (score just below threshold)
        for i in 0..10 {
            history.record(48.0, 50.0, false, now + i);
        }

        let adjustment = history.threshold_adjustment();
        assert!(
            adjustment < 1.0,
            "Near misses should lower threshold. Adjustment: {}",
            adjustment
        );
    }

    #[test]
    fn test_history_raises_threshold_on_easy_passes() {
        let mut history = MasteryHistory::new();
        let now = 1000i64;

        // Record several easy passes (score well above threshold)
        for i in 0..10 {
            history.record(70.0, 50.0, true, now + i);
        }

        let adjustment = history.threshold_adjustment();
        assert!(
            adjustment > 1.0,
            "Easy passes should raise threshold. Adjustment: {}",
            adjustment
        );
    }

    #[test]
    fn test_threshold_varies_by_difficulty() {
        let baseline = PersonalBaseline::from_cognitive(&CognitiveProfile::default());

        let easy_threshold = baseline.adjusted_threshold(DifficultyLevel::Easy);
        let mid_threshold = baseline.adjusted_threshold(DifficultyLevel::Mid);
        let hard_threshold = baseline.adjusted_threshold(DifficultyLevel::Hard);

        assert!(easy_threshold < mid_threshold);
        assert!(mid_threshold < hard_threshold);
    }

    #[test]
    fn test_consecutive_correct_helps() {
        let mut mdm = default_mdm();
        mdm.update(0.8, 1000);
        mdm.update(0.8, 2000);

        let context_1 = MasteryContext {
            is_first_attempt: false,
            correct_count: 1,
            total_attempts: 2,
            response_time_ms: 3000,
            hint_used: false,
            consecutive_correct: 1,
        };

        let context_3 = MasteryContext {
            is_first_attempt: false,
            correct_count: 3,
            total_attempts: 4,
            response_time_ms: 3000,
            hint_used: false,
            consecutive_correct: 3,
        };

        let result_1 = compute_adaptive_mastery(
            &mdm,
            &default_user_state(),
            &context_1,
            DifficultyLevel::Mid,
            true,
        );

        let result_3 = compute_adaptive_mastery(
            &mdm,
            &default_user_state(),
            &context_3,
            DifficultyLevel::Mid,
            true,
        );

        assert!(
            result_3.score > result_1.score,
            "More consecutive correct should give higher score"
        );
    }
}
