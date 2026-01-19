use crate::amas::config::FatigueParams;

#[derive(Debug, Clone)]
pub struct FatigueFeatures {
    pub error_rate_trend: f64,
    pub rt_increase_rate: f64,
    pub repeat_errors: i32,
    pub break_minutes: Option<f64>,
}

impl Default for FatigueFeatures {
    fn default() -> Self {
        Self {
            error_rate_trend: 0.0,
            rt_increase_rate: 0.0,
            repeat_errors: 0,
            break_minutes: None,
        }
    }
}

pub struct FatigueEstimator {
    params: FatigueParams,
    current_value: f64,
    last_update_ts: i64,
}

impl FatigueEstimator {
    pub fn new(params: FatigueParams) -> Self {
        Self {
            params,
            current_value: 0.0,
            last_update_ts: chrono::Utc::now().timestamp_millis(),
        }
    }

    pub fn update(&mut self, features: FatigueFeatures) -> f64 {
        if let Some(break_min) = features.break_minutes {
            if break_min >= self.params.long_break_threshold {
                self.current_value = 0.0;
                self.last_update_ts = chrono::Utc::now().timestamp_millis();
                return self.current_value;
            }
        }

        let error_component = self.params.beta * features.error_rate_trend.max(0.0);
        let rt_component = self.params.gamma * features.rt_increase_rate.max(0.0);
        let repeat_component = self.params.delta * (features.repeat_errors as f64 / 5.0).min(1.0);

        let delta_fatigue = error_component + rt_component + repeat_component;
        let decay = (-self.params.k).exp();

        self.current_value = (self.current_value * decay + delta_fatigue).clamp(0.0, 1.0);
        self.last_update_ts = chrono::Utc::now().timestamp_millis();

        self.current_value
    }

    pub fn current(&self) -> f64 {
        self.current_value
    }

    pub fn reset(&mut self) {
        self.current_value = 0.0;
        self.last_update_ts = chrono::Utc::now().timestamp_millis();
    }

    pub fn set_value(&mut self, value: f64) {
        self.current_value = value.clamp(0.0, 1.0);
    }

    pub fn apply_time_decay(&mut self, elapsed_minutes: f64) {
        let decay_factor = (-self.params.k * elapsed_minutes / 10.0).exp();
        self.current_value *= decay_factor;
    }
}

impl Default for FatigueEstimator {
    fn default() -> Self {
        Self::new(FatigueParams::default())
    }
}
