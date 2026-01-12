use crate::amas::config::AttentionWeights;
use crate::amas::types::CognitiveProfile;

#[derive(Debug, Clone)]
pub struct AttentionFeatures {
    pub rt_mean: f64,
    pub rt_cv: f64,
    pub pace_cv: f64,
    pub pause_count: f64,
    pub switch_count: f64,
    pub drift: f64,
    pub interaction_density: f64,
    pub focus_loss: f64,
    pub recent_accuracy: f64,
    pub is_correct: Option<bool>,
    pub hint_used: bool,
    pub retry_count: i32,
    pub dwell_time: f64,
    pub visual_fatigue: f64,
    pub visual_fatigue_confidence: f64,
    pub motivation: f64,
    pub cognitive: CognitiveProfile,
    pub study_duration_minutes: f64,
    pub hour_of_day: u32,
}

impl Default for AttentionFeatures {
    fn default() -> Self {
        Self {
            rt_mean: 0.5,
            rt_cv: 0.0,
            pace_cv: 0.0,
            pause_count: 0.0,
            switch_count: 0.0,
            drift: 0.0,
            interaction_density: 0.5,
            focus_loss: 0.0,
            recent_accuracy: 0.7,
            is_correct: None,
            hint_used: false,
            retry_count: 0,
            dwell_time: 0.5,
            visual_fatigue: 0.0,
            visual_fatigue_confidence: 0.5,
            motivation: 0.5,
            cognitive: CognitiveProfile::default(),
            study_duration_minutes: 0.0,
            hour_of_day: 12,
        }
    }
}

pub struct AttentionMonitor {
    weights: AttentionWeights,
    base_smoothing: f64,
    current_value: f64,
    correct_streak: u32,
    error_streak: u32,
}

impl AttentionMonitor {
    pub fn new(weights: AttentionWeights, smoothing: f64) -> Self {
        Self {
            weights,
            base_smoothing: smoothing,
            current_value: 0.7,
            correct_streak: 0,
            error_streak: 0,
        }
    }

    pub fn update(&mut self, features: AttentionFeatures) -> f64 {
        // Original feature scores (inverted: lower is better -> higher score)
        let rt_score = 1.0 - features.rt_mean.clamp(0.0, 1.0);
        let cv_score = 1.0 - features.rt_cv.clamp(0.0, 1.0);
        let pace_score = 1.0 - features.pace_cv.clamp(0.0, 1.0);
        let pause_score = 1.0 - (features.pause_count / 10.0).clamp(0.0, 1.0);
        let switch_score = 1.0 - (features.switch_count / 5.0).clamp(0.0, 1.0);
        let drift_score = 1.0 - features.drift.clamp(0.0, 1.0);
        let interaction_score = features.interaction_density.clamp(0.0, 1.0);
        let focus_score = 1.0 - features.focus_loss.clamp(0.0, 1.0);

        // New feature scores
        let accuracy_score = features.recent_accuracy.clamp(0.0, 1.0);

        // Update streaks based on current answer
        if let Some(is_correct) = features.is_correct {
            if is_correct {
                self.correct_streak = self.correct_streak.saturating_add(1);
                self.error_streak = 0;
            } else {
                self.error_streak = self.error_streak.saturating_add(1);
                self.correct_streak = 0;
            }
        }

        // Streak score: boost for correct streak, penalty for error streak
        let streak_boost = (self.correct_streak.min(5) as f64 / 5.0) * 0.5;
        let streak_penalty = (self.error_streak.min(3) as f64 / 3.0) * 0.5;
        let streak_score = 0.5 + streak_boost - streak_penalty;

        // Hint usage penalty
        let hint_score = if features.hint_used { 0.3 } else { 1.0 };

        // Retry count penalty
        let retry_score = 1.0 - (features.retry_count as f64 / 3.0).clamp(0.0, 1.0);

        // Dwell time: U-shaped scoring (optimal ~20% of max time, ~6s)
        let dwell_norm = features.dwell_time.clamp(0.0, 1.0);
        let dwell_distance = (dwell_norm - 0.2).abs() * 2.5;
        let dwell_score = (1.0 - dwell_distance).max(0.0);

        // Visual fatigue with confidence weighting
        let vf_confidence = features.visual_fatigue_confidence.clamp(0.0, 1.0);
        let visual_fatigue_score = 1.0 - features.visual_fatigue.clamp(0.0, 1.0) * vf_confidence;

        // Motivation (higher is better)
        let motivation_score = features.motivation.clamp(0.0, 1.0);

        // Cognitive composite score
        let cognitive_avg = (features.cognitive.mem + features.cognitive.speed + features.cognitive.stability) / 3.0;
        let cognitive_score = cognitive_avg.clamp(0.0, 1.0);

        // Study duration decay (after 20 minutes, attention starts declining)
        let duration_factor = if features.study_duration_minutes <= 20.0 {
            1.0
        } else {
            let decay = ((features.study_duration_minutes - 20.0) / 60.0).clamp(0.0, 0.4);
            1.0 - decay
        };

        // Circadian rhythm factor
        let circadian_score = match features.hour_of_day {
            6..=11 => 1.0,   // Morning peak
            12..=14 => 0.75, // Post-lunch dip
            15..=19 => 0.9,  // Afternoon recovery
            20..=23 => 0.65, // Evening decline
            _ => 0.5,        // Late night low
        };

        // Weighted sum (normalized)
        let weighted_sum = self.weights.rt_mean * rt_score
            + self.weights.rt_cv * cv_score
            + self.weights.pace_cv * pace_score
            + self.weights.pause * pause_score
            + self.weights.switch * switch_score
            + self.weights.drift * drift_score
            + self.weights.interaction * interaction_score
            + self.weights.focus_loss * focus_score
            + self.weights.recent_accuracy * accuracy_score
            + self.weights.streak * streak_score
            + self.weights.hint_used * hint_score
            + self.weights.retry_count * retry_score
            + self.weights.dwell_time * dwell_score
            + self.weights.visual_fatigue * visual_fatigue_score
            + self.weights.motivation * motivation_score
            + self.weights.cognitive * cognitive_score
            + self.weights.study_duration * duration_factor
            + self.weights.circadian * circadian_score;

        // Normalize by total weights
        let raw_attention = weighted_sum / self.weights.total().max(1e-6);

        // Adaptive smoothing: higher volatility -> faster response (higher alpha)
        let volatility = (features.rt_cv + features.pace_cv + features.switch_count / 5.0) / 3.0;
        let adaptive_smoothing = (self.base_smoothing * (1.0 + 0.5 * volatility)).clamp(0.15, 0.7);

        let smoothed = adaptive_smoothing * raw_attention + (1.0 - adaptive_smoothing) * self.current_value;
        self.current_value = smoothed.clamp(0.0, 1.0);
        self.current_value
    }

    pub fn current(&self) -> f64 {
        self.current_value
    }

    pub fn reset(&mut self) {
        self.current_value = 0.7;
        self.correct_streak = 0;
        self.error_streak = 0;
    }

    pub fn set_value(&mut self, value: f64) {
        self.current_value = value.clamp(0.0, 1.0);
    }

    pub fn streaks(&self) -> (u32, u32) {
        (self.correct_streak, self.error_streak)
    }
}

impl Default for AttentionMonitor {
    fn default() -> Self {
        Self::new(AttentionWeights::default(), 0.3)
    }
}
