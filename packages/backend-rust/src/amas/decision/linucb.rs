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
    #[serde(default)]
    interaction_dim: usize,
    #[serde(default)]
    interaction_a: Vec<Vec<f64>>,
    #[serde(default)]
    interaction_b: Vec<f64>,
}

impl LinUCBModel {
    pub fn new(context_dim: usize, action_dim: usize, alpha: f64) -> Self {
        let d = context_dim + action_dim;
        let mut a = vec![vec![0.0; d]; d];
        for i in 0..d {
            a[i][i] = 1.0;
        }
        let b = vec![0.0; d];
        let interaction_dim = context_dim * action_dim;
        let mut interaction_a = vec![vec![0.0; interaction_dim]; interaction_dim];
        for i in 0..interaction_dim {
            interaction_a[i][i] = 1.0;
        }
        let interaction_b = vec![0.0; interaction_dim];
        Self {
            d,
            alpha,
            a,
            b,
            context_dim,
            action_dim,
            interaction_dim,
            interaction_a,
            interaction_b,
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
        self.get_confidence_with_params(feature, strategy, 0.3, 0.4, 1.0)
    }

    pub fn get_confidence_with_params(
        &self,
        feature: &FeatureVector,
        strategy: &StrategyParams,
        exploration_scale: f64,
        min_conf: f64,
        max_conf: f64,
    ) -> f64 {
        let x = self.build_features(feature, strategy);
        let exploration = self.compute_confidence(&x);
        (max_conf - exploration_scale * exploration).clamp(min_conf, max_conf)
    }

    pub fn ensure_dimensions(&mut self, context_dim: usize, action_dim: usize, alpha: f64) {
        let expected = context_dim + action_dim;
        if self.d != expected {
            *self = Self::new(context_dim, action_dim, alpha);
            return;
        }
        // Always update alpha to reflect config changes
        self.alpha = alpha;
        if self.context_dim != context_dim || self.action_dim != action_dim {
            let a_matches =
                self.a.len() == expected && self.a.iter().all(|row| row.len() == expected);
            let b_matches = self.b.len() == expected;
            if a_matches && b_matches {
                self.context_dim = context_dim;
                self.action_dim = action_dim;
            } else {
                *self = Self::new(context_dim, action_dim, alpha);
                return;
            }
        }
        let interaction_expected = context_dim.saturating_mul(action_dim);
        if self.interaction_dim != interaction_expected
            || self.interaction_a.len() != interaction_expected
            || self.interaction_b.len() != interaction_expected
        {
            self.init_interaction_model(interaction_expected);
        }
    }

    fn init_interaction_model(&mut self, interaction_dim: usize) {
        self.interaction_dim = interaction_dim;
        self.interaction_a = vec![vec![0.0; interaction_dim]; interaction_dim];
        for i in 0..interaction_dim {
            self.interaction_a[i][i] = 1.0;
        }
        self.interaction_b = vec![0.0; interaction_dim];
    }

    pub fn build_features(&self, context: &FeatureVector, strategy: &StrategyParams) -> Vec<f64> {
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
        let theta = self.solve_theta_with(&self.a, &self.b);
        let exploitation = Self::dot_product(&theta, x);

        let interaction = self.build_interaction_features_from_x(x);
        let interaction_exploitation = if interaction.is_empty() || self.interaction_dim == 0 {
            0.0
        } else {
            let interaction_theta = self.solve_theta_with(&self.interaction_a, &self.interaction_b);
            Self::dot_product(&interaction_theta, &interaction)
        };

        let confidence = self.compute_combined_confidence(x, &interaction);
        exploitation + interaction_exploitation + self.alpha * confidence
    }

    fn solve_theta_with(&self, a: &[Vec<f64>], b: &[f64]) -> Vec<f64> {
        let a_inv = self.invert_matrix(a);
        Self::matrix_vector_mul(&a_inv, b)
    }

    fn compute_confidence_with(&self, a: &[Vec<f64>], x: &[f64]) -> f64 {
        if x.is_empty() || a.is_empty() {
            return 0.0;
        }
        let a_inv = self.invert_matrix(a);
        let temp = Self::matrix_vector_mul(&a_inv, x);
        Self::dot_product(x, &temp).max(0.0).sqrt()
    }

    fn compute_combined_confidence(&self, x: &[f64], interaction: &[f64]) -> f64 {
        let base_conf = self.compute_confidence_with(&self.a, x);
        if interaction.is_empty() || self.interaction_dim == 0 {
            return base_conf;
        }
        let interaction_conf = self.compute_confidence_with(&self.interaction_a, interaction);
        (base_conf * base_conf + interaction_conf * interaction_conf).sqrt()
    }

    fn compute_confidence(&self, x: &[f64]) -> f64 {
        let interaction = self.build_interaction_features_from_x(x);
        self.compute_combined_confidence(x, &interaction)
    }

    fn build_interaction_features_from_x(&self, x: &[f64]) -> Vec<f64> {
        if self.interaction_dim == 0 || x.len() < self.context_dim {
            return Vec::new();
        }
        let context_len = self.context_dim.min(x.len());
        let action_start = self.context_dim.min(x.len());
        let action_len = self.action_dim.min(x.len().saturating_sub(action_start));
        if action_len == 0 {
            return Vec::new();
        }

        let mut interaction = vec![0.0; self.interaction_dim];
        for i in 0..context_len {
            for j in 0..action_len {
                let idx = i * self.action_dim + j;
                if idx < interaction.len() {
                    interaction[idx] = x[i] * x[action_start + j];
                }
            }
        }
        interaction
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
        Self::update_linear_model(&mut self.a, &mut self.b, x, reward);

        let interaction_expected = self.context_dim.saturating_mul(self.action_dim);
        if self.interaction_dim != interaction_expected
            || self.interaction_a.len() != interaction_expected
        {
            self.init_interaction_model(interaction_expected);
        }
        let interaction = self.build_interaction_features_from_x(x);
        if !interaction.is_empty() && interaction.len() == self.interaction_dim {
            Self::update_linear_model(
                &mut self.interaction_a,
                &mut self.interaction_b,
                &interaction,
                reward,
            );
        }
    }

    fn update_linear_model(a: &mut [Vec<f64>], b: &mut [f64], x: &[f64], reward: f64) {
        let d = x.len();
        if a.len() != d || b.len() != d {
            return;
        }
        for i in 0..d {
            if a[i].len() != d {
                continue;
            }
            for j in 0..d {
                a[i][j] += x[i] * x[j];
            }
            b[i] += reward * x[i];
        }
    }
}

impl Default for LinUCBModel {
    fn default() -> Self {
        Self::new(10, ACTION_FEATURE_DIM, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::amas::types::{
        CognitiveProfile, DifficultyLevel, FeatureVector, StrategyParams, UserState,
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

    fn sample_feature_vector(dim: usize) -> FeatureVector {
        FeatureVector::new(vec![0.5; dim], vec!["f".to_string(); dim])
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
    fn new_initializes_identity_matrices() {
        let model = LinUCBModel::new(2, 3, 0.5);
        assert_eq!(model.d, 5);
        assert_eq!(model.a.len(), 5);
        for i in 0..5 {
            assert_eq!(model.a[i][i], 1.0);
            for j in 0..5 {
                if i != j {
                    assert_eq!(model.a[i][j], 0.0);
                }
            }
        }
        assert_eq!(model.b.len(), 5);
        assert!(model.b.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn new_initializes_interaction_model() {
        let model = LinUCBModel::new(3, 2, 1.0);
        assert_eq!(model.interaction_dim, 6);
        assert_eq!(model.interaction_a.len(), 6);
        assert_eq!(model.interaction_b.len(), 6);
    }

    #[test]
    fn build_features_combines_context_and_action() {
        let model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let feature = FeatureVector::new(vec![0.1, 0.2], vec![]);
        let x = model.build_features(&feature, &sample_strategy());
        assert_eq!(x.len(), 2 + ACTION_FEATURE_DIM);
        assert!((x[0] - 0.1).abs() < 1e-6);
        assert!((x[1] - 0.2).abs() < 1e-6);
    }

    #[test]
    fn build_features_returns_empty_when_d_is_zero() {
        let mut model = LinUCBModel::new(0, 0, 1.0);
        model.d = 0;
        let feature = FeatureVector::new(vec![0.5], vec![]);
        let x = model.build_features(&feature, &sample_strategy());
        assert!(x.is_empty());
    }

    #[test]
    fn build_features_handles_short_context() {
        let model = LinUCBModel::new(5, ACTION_FEATURE_DIM, 1.0);
        let feature = FeatureVector::new(vec![0.1, 0.2], vec![]);
        let x = model.build_features(&feature, &sample_strategy());
        assert_eq!(x.len(), 5 + ACTION_FEATURE_DIM);
        assert!((x[0] - 0.1).abs() < 1e-6);
        assert!((x[1] - 0.2).abs() < 1e-6);
        assert_eq!(x[2], 0.0);
    }

    #[test]
    fn strategy_to_action_features_maps_difficulty() {
        let model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let easy = StrategyParams {
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        };
        let hard = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        };
        let easy_features = model.strategy_to_action_features(&easy);
        let hard_features = model.strategy_to_action_features(&hard);
        assert!((easy_features[0] - 0.3).abs() < 1e-6);
        assert!((hard_features[0] - 0.9).abs() < 1e-6);
    }

    #[test]
    fn select_action_returns_none_for_empty_candidates() {
        let model = LinUCBModel::default();
        let state = sample_user_state();
        let feature = sample_feature_vector(10);
        let result = model.select_action(&state, &feature, &[]);
        assert!(result.is_none());
    }

    #[test]
    fn select_action_returns_best_candidate() {
        let model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let state = sample_user_state();
        let feature = FeatureVector::new(vec![0.5, 0.5], vec![]);
        let candidates = vec![
            StrategyParams {
                difficulty: DifficultyLevel::Easy,
                ..sample_strategy()
            },
            StrategyParams {
                difficulty: DifficultyLevel::Hard,
                ..sample_strategy()
            },
        ];
        let result = model.select_action(&state, &feature, &candidates);
        assert!(result.is_some());
    }

    #[test]
    fn update_modifies_model_parameters() {
        let mut model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let feature = FeatureVector::new(vec![0.5, 0.5], vec![]);
        let x = model.build_features(&feature, &sample_strategy());
        let initial_b = model.b.clone();
        model.update(&x, 1.0);
        assert_ne!(model.b, initial_b);
    }

    #[test]
    fn update_ignores_wrong_dimension() {
        let mut model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let initial_b = model.b.clone();
        let wrong_x = vec![0.5; 3];
        model.update(&wrong_x, 1.0);
        assert_eq!(model.b, initial_b);
    }

    #[test]
    fn get_confidence_returns_valid_range() {
        let model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let feature = FeatureVector::new(vec![0.5, 0.5], vec![]);
        let conf = model.get_confidence(&feature, &sample_strategy());
        assert!(conf >= 0.0 && conf <= 1.0);
    }

    #[test]
    fn get_confidence_with_params_respects_bounds() {
        let model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let feature = FeatureVector::new(vec![0.5, 0.5], vec![]);
        let conf = model.get_confidence_with_params(&feature, &sample_strategy(), 0.5, 0.2, 0.8);
        assert!(conf >= 0.2 && conf <= 0.8);
    }

    #[test]
    fn ensure_dimensions_reinitializes_on_mismatch() {
        let mut model = LinUCBModel::new(2, 3, 1.0);
        assert_eq!(model.d, 5);
        model.ensure_dimensions(4, 5, 0.5);
        assert_eq!(model.d, 9);
        assert_eq!(model.context_dim, 4);
        assert_eq!(model.action_dim, 5);
    }

    #[test]
    fn ensure_dimensions_preserves_compatible_model() {
        let mut model = LinUCBModel::new(3, 2, 1.0);
        model.b[0] = 0.5;
        model.ensure_dimensions(3, 2, 1.0);
        assert_eq!(model.b[0], 0.5);
    }

    #[test]
    fn invert_matrix_handles_identity() {
        let model = LinUCBModel::new(2, 2, 1.0);
        let identity = vec![vec![1.0, 0.0], vec![0.0, 1.0]];
        let inv = model.invert_matrix(&identity);
        assert!((inv[0][0] - 1.0).abs() < 1e-6);
        assert!((inv[1][1] - 1.0).abs() < 1e-6);
        assert!(inv[0][1].abs() < 1e-6);
        assert!(inv[1][0].abs() < 1e-6);
    }

    #[test]
    fn invert_matrix_handles_singular() {
        let model = LinUCBModel::new(1, 1, 1.0);
        let singular = vec![vec![0.0, 0.0], vec![0.0, 0.0]];
        let inv = model.invert_matrix(&singular);
        assert!(inv[0][0] >= 1e-6);
        assert!(inv.iter().flatten().all(|v| v.is_finite()));
    }

    #[test]
    fn dot_product_computes_correctly() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![4.0, 5.0, 6.0];
        let result = LinUCBModel::dot_product(&a, &b);
        assert!((result - 32.0).abs() < 1e-6);
    }

    #[test]
    fn matrix_vector_mul_computes_correctly() {
        let m = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let v = vec![1.0, 1.0];
        let result = LinUCBModel::matrix_vector_mul(&m, &v);
        assert!((result[0] - 3.0).abs() < 1e-6);
        assert!((result[1] - 7.0).abs() < 1e-6);
    }

    #[test]
    fn confidence_decreases_after_updates() {
        let mut model = LinUCBModel::new(2, ACTION_FEATURE_DIM, 1.0);
        let feature = FeatureVector::new(vec![0.5, 0.5], vec![]);
        let strategy = sample_strategy();
        let initial_conf = model.get_confidence(&feature, &strategy);
        let x = model.build_features(&feature, &strategy);
        for _ in 0..10 {
            model.update(&x, 1.0);
        }
        let final_conf = model.get_confidence(&feature, &strategy);
        assert!(final_conf != initial_conf);
    }
}
