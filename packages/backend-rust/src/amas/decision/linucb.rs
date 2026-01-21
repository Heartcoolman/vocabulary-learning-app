use serde::{Deserialize, Serialize};

use crate::amas::types::{FeatureVector, StrategyParams, UserState};

pub const ACTION_FEATURE_DIM: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinUCBModel {
    d: usize,
    alpha: f64,
    a: Vec<Vec<f64>>,
    b: Vec<f64>,
    #[serde(default)]
    context_dim: usize,
    #[serde(default)]
    action_dim: usize,
}

impl LinUCBModel {
    pub fn new(context_dim: usize, action_dim: usize, alpha: f64) -> Self {
        let d = context_dim + action_dim;
        let mut a = vec![vec![0.0; d]; d];
        for i in 0..d {
            a[i][i] = 1.0;
        }
        let b = vec![0.0; d];
        Self {
            d,
            alpha,
            a,
            b,
            context_dim,
            action_dim,
        }
    }

    pub fn select_action(
        &self,
        _state: &UserState,
        feature: &FeatureVector,
        candidates: &[StrategyParams],
    ) -> Option<StrategyParams> {
        if candidates.is_empty() {
            return None;
        }

        let mut best_score = f64::NEG_INFINITY;
        let mut best_action = None;

        for candidate in candidates {
            let x = self.build_features(feature, candidate);
            let score = self.compute_ucb(&x);
            if score > best_score {
                best_score = score;
                best_action = Some(candidate.clone());
            }
        }

        best_action
    }

    pub fn get_confidence(&self, feature: &FeatureVector, strategy: &StrategyParams) -> f64 {
        let x = self.build_features(feature, strategy);
        let exploration = self.compute_confidence(&x);
        (1.0 - 0.3 * exploration).clamp(0.4, 1.0)
    }

    pub fn ensure_dimensions(&mut self, context_dim: usize, action_dim: usize, alpha: f64) {
        let expected = context_dim + action_dim;
        if self.d != expected || self.context_dim != context_dim || self.action_dim != action_dim {
            *self = Self::new(context_dim, action_dim, alpha);
        }
    }

    pub fn build_features(
        &self,
        context: &FeatureVector,
        strategy: &StrategyParams,
    ) -> Vec<f64> {
        if self.d == 0 {
            return Vec::new();
        }
        let mut x = vec![0.0; self.d];
        let context_len = self.context_dim.min(context.values.len());
        for i in 0..context_len {
            x[i] = context.values[i];
        }
        let action_features = self.strategy_to_action_features(strategy);
        let action_len = self.action_dim.min(action_features.len());
        let offset = self.context_dim.min(self.d);
        for i in 0..action_len {
            if offset + i < x.len() {
                x[offset + i] = action_features[i];
            }
        }
        x
    }

    fn strategy_to_action_features(&self, strategy: &StrategyParams) -> Vec<f64> {
        let difficulty_val = match strategy.difficulty {
            crate::amas::types::DifficultyLevel::Easy => 0.3,
            crate::amas::types::DifficultyLevel::Mid => 0.6,
            crate::amas::types::DifficultyLevel::Hard => 0.9,
        };

        vec![
            difficulty_val,
            strategy.new_ratio,
            strategy.batch_size as f64 / 20.0,
            strategy.interval_scale,
            strategy.hint_level as f64 / 2.0,
        ]
    }

    fn compute_ucb(&self, x: &[f64]) -> f64 {
        let theta = self.solve_theta();
        let exploitation = Self::dot_product(&theta, x);
        let confidence = self.compute_confidence(x);
        exploitation + self.alpha * confidence
    }

    fn solve_theta(&self) -> Vec<f64> {
        let a_inv = self.invert_matrix(&self.a);
        Self::matrix_vector_mul(&a_inv, &self.b)
    }

    fn compute_confidence(&self, x: &[f64]) -> f64 {
        let a_inv = self.invert_matrix(&self.a);
        let temp = Self::matrix_vector_mul(&a_inv, x);
        Self::dot_product(x, &temp).sqrt()
    }

    fn invert_matrix(&self, m: &[Vec<f64>]) -> Vec<Vec<f64>> {
        let n = m.len();
        let mut aug = vec![vec![0.0; 2 * n]; n];
        for i in 0..n {
            for j in 0..n {
                aug[i][j] = m[i][j];
            }
            aug[i][n + i] = 1.0;
        }

        let mut is_singular = false;

        for i in 0..n {
            let mut max_row = i;
            for k in (i + 1)..n {
                if aug[k][i].abs() > aug[max_row][i].abs() {
                    max_row = k;
                }
            }
            aug.swap(i, max_row);

            let pivot = aug[i][i];
            if pivot.abs() < 1e-10 {
                is_singular = true;
                aug[i][i] = 1e-10;
            }

            let pivot = aug[i][i];
            for j in 0..(2 * n) {
                aug[i][j] /= pivot;
            }

            for k in 0..n {
                if k != i {
                    let factor = aug[k][i];
                    for j in 0..(2 * n) {
                        aug[k][j] -= factor * aug[i][j];
                    }
                }
            }
        }

        let mut result = vec![vec![0.0; n]; n];
        for i in 0..n {
            for j in 0..n {
                let val = aug[i][n + j];
                result[i][j] = if val.is_nan() || val.is_infinite() {
                    if i == j {
                        1.0
                    } else {
                        0.0
                    }
                } else {
                    val
                };
            }
        }

        if is_singular {
            for i in 0..n {
                result[i][i] = result[i][i].max(1e-6);
            }
        }

        result
    }

    fn matrix_vector_mul(m: &[Vec<f64>], v: &[f64]) -> Vec<f64> {
        let n = m.len();
        let mut result = vec![0.0; n];
        for i in 0..n {
            for j in 0..n {
                result[i] += m[i][j] * v[j];
            }
        }
        result
    }

    fn dot_product(a: &[f64], b: &[f64]) -> f64 {
        a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
    }

    pub fn update(&mut self, x: &[f64], reward: f64) {
        if x.len() != self.d {
            return;
        }
        for i in 0..self.d {
            for j in 0..self.d {
                self.a[i][j] += x[i] * x[j];
            }
            self.b[i] += reward * x[i];
        }
    }
}

impl Default for LinUCBModel {
    fn default() -> Self {
        Self::new(10, ACTION_FEATURE_DIM, 1.0)
    }
}
