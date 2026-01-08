use crate::amas::config::TrendParams;
use crate::amas::types::TrendState;
use std::collections::VecDeque;

pub struct TrendAnalyzer {
    params: TrendParams,
    history: VecDeque<f64>,
    current_trend: TrendState,
}

impl TrendAnalyzer {
    pub fn new(params: TrendParams) -> Self {
        Self {
            params,
            history: VecDeque::with_capacity(100),
            current_trend: TrendState::Flat,
        }
    }

    pub fn update(&mut self, mastery_score: f64) -> TrendState {
        self.history.push_back(mastery_score);

        if self.history.len() > self.params.window_size {
            self.history.pop_front();
        }

        if self.history.len() < 5 {
            self.current_trend = TrendState::Flat;
            return self.current_trend;
        }

        let slope = self.compute_slope();
        let variance = self.compute_variance();

        self.current_trend = if slope > self.params.up_threshold {
            TrendState::Up
        } else if slope < self.params.down_threshold {
            TrendState::Down
        } else if variance < self.params.stuck_variance_threshold && slope.abs() < 0.01 {
            TrendState::Stuck
        } else {
            TrendState::Flat
        };

        self.current_trend
    }

    pub fn current(&self) -> TrendState {
        self.current_trend
    }

    pub fn reset(&mut self) {
        self.history.clear();
        self.current_trend = TrendState::Flat;
    }

    fn compute_slope(&self) -> f64 {
        if self.history.len() < 2 {
            return 0.0;
        }

        let n = self.history.len() as f64;
        let sum_x: f64 = (0..self.history.len()).map(|i| i as f64).sum();
        let sum_y: f64 = self.history.iter().sum();
        let sum_xy: f64 = self
            .history
            .iter()
            .enumerate()
            .map(|(i, y)| i as f64 * y)
            .sum();
        let sum_xx: f64 = (0..self.history.len()).map(|i| (i as f64).powi(2)).sum();

        let denominator = n * sum_xx - sum_x.powi(2);
        if denominator.abs() < 1e-10 {
            return 0.0;
        }

        (n * sum_xy - sum_x * sum_y) / denominator
    }

    fn compute_variance(&self) -> f64 {
        if self.history.is_empty() {
            return 0.0;
        }

        let mean = self.history.iter().sum::<f64>() / self.history.len() as f64;
        self.history.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / self.history.len() as f64
    }
}

impl Default for TrendAnalyzer {
    fn default() -> Self {
        Self::new(TrendParams::default())
    }
}
