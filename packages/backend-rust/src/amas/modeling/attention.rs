use crate::amas::config::AttentionWeights;

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
        }
    }
}

pub struct AttentionMonitor {
    weights: AttentionWeights,
    smoothing: f64,
    current_value: f64,
}

impl AttentionMonitor {
    pub fn new(weights: AttentionWeights, smoothing: f64) -> Self {
        Self {
            weights,
            smoothing,
            current_value: 0.7,
        }
    }

    pub fn update(&mut self, features: AttentionFeatures) -> f64 {
        let rt_score = 1.0 - features.rt_mean.clamp(0.0, 1.0);
        let cv_score = 1.0 - features.rt_cv.clamp(0.0, 1.0);
        let pace_score = 1.0 - features.pace_cv.clamp(0.0, 1.0);
        let pause_score = 1.0 - features.pause_count.clamp(0.0, 1.0);
        let switch_score = 1.0 - features.switch_count.clamp(0.0, 1.0);
        let drift_score = 1.0 - features.drift.clamp(0.0, 1.0);
        let interaction_score = features.interaction_density.clamp(0.0, 1.0);
        let focus_score = 1.0 - features.focus_loss.clamp(0.0, 1.0);

        let raw_attention = self.weights.rt_mean * rt_score
            + self.weights.rt_cv * cv_score
            + self.weights.pace_cv * pace_score
            + self.weights.pause * pause_score
            + self.weights.switch * switch_score
            + self.weights.drift * drift_score
            + self.weights.interaction * interaction_score
            + self.weights.focus_loss * focus_score;

        let smoothed = self.smoothing * raw_attention + (1.0 - self.smoothing) * self.current_value;
        self.current_value = smoothed.clamp(0.0, 1.0);
        self.current_value
    }

    pub fn current(&self) -> f64 {
        self.current_value
    }

    pub fn reset(&mut self) {
        self.current_value = 0.7;
    }
}

impl Default for AttentionMonitor {
    fn default() -> Self {
        Self::new(AttentionWeights::default(), 0.3)
    }
}
