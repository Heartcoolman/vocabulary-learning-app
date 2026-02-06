use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtdConfig {
    pub window_short: usize,
    pub window_medium: usize,
    pub window_long: usize,
    pub cusum_k: f64,
    pub cusum_h: f64,
    pub slope_threshold_up: f64,
    pub slope_threshold_flat: f64,
    pub variance_threshold_stuck: f64,
}

impl Default for MtdConfig {
    fn default() -> Self {
        Self {
            window_short: 5,
            window_medium: 15,
            window_long: 30,
            cusum_k: 0.5,
            cusum_h: 4.0,
            slope_threshold_up: 0.02,
            slope_threshold_flat: 0.01,
            variance_threshold_stuck: 0.005,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MtdTrendState {
    Up,
    Down,
    Flat,
    Stuck,
    ChangePoint,
}

impl MtdTrendState {
    /// Convert MTD trend state to baseline TrendState for delegation
    pub fn to_trend_state(&self) -> crate::amas::types::TrendState {
        use crate::amas::types::TrendState;
        match self {
            MtdTrendState::Up => TrendState::Up,
            MtdTrendState::Down => TrendState::Down,
            MtdTrendState::Flat => TrendState::Flat,
            MtdTrendState::Stuck => TrendState::Stuck,
            // ChangePoint maps to Flat (neutral) since it indicates transition
            MtdTrendState::ChangePoint => TrendState::Flat,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtdState {
    pub samples: Vec<f64>,
    pub cusum_high: f64,
    pub cusum_low: f64,
    pub running_mean: f64,
    pub sample_count: u32,
}

impl Default for MtdState {
    fn default() -> Self {
        Self {
            samples: Vec::new(),
            cusum_high: 0.0,
            cusum_low: 0.0,
            running_mean: 0.5,
            sample_count: 0,
        }
    }
}

pub struct MultiScaleTrendDetector {
    config: MtdConfig,
}

impl Default for MultiScaleTrendDetector {
    fn default() -> Self {
        Self::new(MtdConfig::default())
    }
}

impl MultiScaleTrendDetector {
    pub fn new(config: MtdConfig) -> Self {
        Self { config }
    }

    fn linear_slope(values: &[f64]) -> f64 {
        let n = values.len() as f64;
        if n < 2.0 {
            return 0.0;
        }
        let x_mean = (n - 1.0) / 2.0;
        let y_mean: f64 = values.iter().sum::<f64>() / n;
        let mut num = 0.0;
        let mut den = 0.0;
        for (i, &y) in values.iter().enumerate() {
            let x = i as f64;
            num += (x - x_mean) * (y - y_mean);
            den += (x - x_mean) * (x - x_mean);
        }
        if den.abs() < 1e-12 {
            0.0
        } else {
            num / den
        }
    }

    fn variance(values: &[f64]) -> f64 {
        let n = values.len() as f64;
        if n < 2.0 {
            return 0.0;
        }
        let mean = values.iter().sum::<f64>() / n;
        values.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / n
    }

    pub fn update(&self, state: &mut MtdState, value: f64) -> MtdTrendState {
        state.samples.push(value.clamp(0.0, 1.0));
        let max_window = self.config.window_long + 5;
        if state.samples.len() > max_window {
            state.samples.drain(0..state.samples.len() - max_window);
        }

        state.sample_count += 1;
        let alpha = 0.05;
        state.running_mean = alpha * value + (1.0 - alpha) * state.running_mean;

        // CUSUM change-point detection
        state.cusum_high =
            (state.cusum_high + value - state.running_mean - self.config.cusum_k).max(0.0);
        state.cusum_low =
            (state.cusum_low - value + state.running_mean - self.config.cusum_k).max(0.0);

        let change_detected =
            state.cusum_high > self.config.cusum_h || state.cusum_low > self.config.cusum_h;

        if change_detected {
            state.cusum_high = 0.0;
            state.cusum_low = 0.0;
            return MtdTrendState::ChangePoint;
        }

        let n = state.samples.len();
        let slope_short = if n >= self.config.window_short {
            Self::linear_slope(&state.samples[n - self.config.window_short..])
        } else {
            Self::linear_slope(&state.samples)
        };
        let slope_medium = if n >= self.config.window_medium {
            Self::linear_slope(&state.samples[n - self.config.window_medium..])
        } else {
            Self::linear_slope(&state.samples)
        };
        let slope_long = if n >= self.config.window_long {
            Self::linear_slope(&state.samples[n - self.config.window_long..])
        } else {
            Self::linear_slope(&state.samples)
        };

        let consistent = slope_short.signum() == slope_medium.signum()
            && slope_medium.signum() == slope_long.signum();

        let var = if n >= self.config.window_medium {
            Self::variance(&state.samples[n - self.config.window_medium..])
        } else {
            Self::variance(&state.samples)
        };

        if consistent && slope_medium.abs() > self.config.slope_threshold_up {
            if slope_medium > 0.0 {
                MtdTrendState::Up
            } else {
                MtdTrendState::Down
            }
        } else if var < self.config.variance_threshold_stuck
            && slope_medium.abs() < self.config.slope_threshold_flat
        {
            MtdTrendState::Stuck
        } else {
            MtdTrendState::Flat
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upward_trend() {
        let mtd = MultiScaleTrendDetector::default();
        let mut state = MtdState::default();
        for i in 0..30 {
            mtd.update(&mut state, 0.3 + i as f64 * 0.02);
        }
        let result = mtd.update(&mut state, 0.9);
        assert!(result == MtdTrendState::Up || result == MtdTrendState::ChangePoint);
    }

    #[test]
    fn test_downward_trend() {
        let mtd = MultiScaleTrendDetector::default();
        let mut state = MtdState::default();
        for i in 0..30 {
            mtd.update(&mut state, 0.8 - i as f64 * 0.02);
        }
        let result = mtd.update(&mut state, 0.1);
        assert!(result == MtdTrendState::Down || result == MtdTrendState::ChangePoint);
    }

    #[test]
    fn test_flat_noisy() {
        let mtd = MultiScaleTrendDetector::default();
        let mut state = MtdState::default();
        let mut last = MtdTrendState::Flat;
        for i in 0..30 {
            let noise = if i % 2 == 0 { 0.01 } else { -0.01 };
            last = mtd.update(&mut state, 0.5 + noise);
        }
        assert!(last == MtdTrendState::Flat || last == MtdTrendState::Stuck);
    }

    #[test]
    fn test_change_point_detection() {
        let mtd = MultiScaleTrendDetector::new(MtdConfig {
            cusum_k: 0.1,
            cusum_h: 1.0,
            ..Default::default()
        });
        let mut state = MtdState::default();
        // Stable phase
        for _ in 0..20 {
            mtd.update(&mut state, 0.5);
        }
        // Sudden jump
        let mut found_change = false;
        for _ in 0..15 {
            let r = mtd.update(&mut state, 0.9);
            if r == MtdTrendState::ChangePoint {
                found_change = true;
                break;
            }
        }
        assert!(found_change, "Should detect change point after sudden jump");
    }

    #[test]
    fn test_sample_buffer_bounded() {
        let mtd = MultiScaleTrendDetector::default();
        let mut state = MtdState::default();
        for i in 0..100 {
            mtd.update(&mut state, (i as f64 % 10.0) / 10.0);
        }
        assert!(state.samples.len() <= 35);
    }
}
