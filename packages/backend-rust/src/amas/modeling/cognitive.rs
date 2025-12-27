use std::collections::VecDeque;
use crate::amas::config::CognitiveParams;
use crate::amas::types::CognitiveProfile;

#[derive(Debug, Clone)]
pub struct CognitiveInput {
    pub accuracy: f64,
    pub avg_response_time: i64,
    pub error_variance: f64,
}

impl Default for CognitiveInput {
    fn default() -> Self {
        Self {
            accuracy: 0.8,
            avg_response_time: 3000,
            error_variance: 0.1,
        }
    }
}

pub struct CognitiveProfiler {
    params: CognitiveParams,
    profile: CognitiveProfile,
    accuracy_history: VecDeque<f64>,
}

impl CognitiveProfiler {
    pub fn new(params: CognitiveParams) -> Self {
        Self {
            params,
            profile: CognitiveProfile::default(),
            accuracy_history: VecDeque::with_capacity(100),
        }
    }

    pub fn update(&mut self, input: CognitiveInput) -> CognitiveProfile {
        let alpha = self.params.memory_alpha;
        self.profile.mem = alpha * input.accuracy + (1.0 - alpha) * self.profile.mem;

        let normalized_speed = 1.0 - (input.avg_response_time as f64 / self.params.speed_baseline_ms / 3.0).min(1.0);
        self.profile.speed = alpha * normalized_speed + (1.0 - alpha) * self.profile.speed;

        self.accuracy_history.push_back(input.accuracy);
        if self.accuracy_history.len() > self.params.stability_window {
            self.accuracy_history.pop_front();
        }

        let stability = if self.accuracy_history.len() >= 3 {
            let variance = compute_variance(&self.accuracy_history);
            1.0 - (variance * 4.0).min(1.0)
        } else {
            0.5
        };
        self.profile.stability = alpha * stability + (1.0 - alpha) * self.profile.stability;

        self.profile.mem = self.profile.mem.clamp(0.0, 1.0);
        self.profile.speed = self.profile.speed.clamp(0.0, 1.0);
        self.profile.stability = self.profile.stability.clamp(0.0, 1.0);

        self.profile.clone()
    }

    pub fn current(&self) -> &CognitiveProfile {
        &self.profile
    }

    pub fn reset(&mut self) {
        self.profile = CognitiveProfile::default();
        self.accuracy_history.clear();
    }
}

impl Default for CognitiveProfiler {
    fn default() -> Self {
        Self::new(CognitiveParams::default())
    }
}

fn compute_variance(values: &VecDeque<f64>) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / values.len() as f64;
    variance
}
