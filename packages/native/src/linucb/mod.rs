#[cfg(feature = "napi")]
use napi::bindgen_prelude::*;
#[cfg(feature = "napi")]
use napi_derive::napi;
use crate::matrix::*;
use crate::sanitize::*;
use crate::types::*;

/// LinUCB 原生实现
#[cfg_attr(feature = "napi", napi)]
pub struct LinUCBNative {
    /// 协方差矩阵 A = X^T X + λI (d×d)
    a: Vec<f64>,
    /// 奖励向量 b = X^T y (d)
    b: Vec<f64>,
    /// Cholesky 分解 L (下三角, d×d)
    l: Vec<f64>,
    /// 正则化参数
    lambda: f64,
    /// 探索参数
    alpha: f64,
    /// 特征维度
    d: usize,
    /// 更新计数
    update_count: u32,
}

#[cfg_attr(feature = "napi", napi)]
impl LinUCBNative {
    /// 创建新的 LinUCB 实例
    #[cfg_attr(feature = "napi", napi(constructor))]
    pub fn new(alpha: Option<f64>, lambda: Option<f64>) -> Self {
        let alpha = alpha.unwrap_or(0.3);
        let lambda = lambda.unwrap_or(1.0).max(MIN_LAMBDA);
        let d = FEATURE_DIMENSION;
        let sqrt_lambda = lambda.sqrt();

        // A = λI
        let mut a = vec![0.0; d * d];
        for i in 0..d {
            a[i * d + i] = lambda;
        }

        // b = 0
        let b = vec![0.0; d];

        // L = √λ·I
        let mut l = vec![0.0; d * d];
        for i in 0..d {
            l[i * d + i] = sqrt_lambda;
        }

        LinUCBNative {
            a,
            b,
            l,
            lambda,
            alpha,
            d,
            update_count: 0,
        }
    }

    /// 构建 22 维特征向量
    fn build_feature_vector_internal(
        &self,
        state: &UserState,
        action: &Action,
        context: &LinUCBContext,
    ) -> Vec<f64> {
        let mut x = vec![0.0; self.d];
        let mut idx = 0;

        // 状态特征 (5维)
        x[idx] = state.mastery_level;
        idx += 1;
        x[idx] = state.recent_accuracy;
        idx += 1;
        x[idx] = (state.study_streak as f64).min(30.0) / 30.0;
        idx += 1;
        x[idx] = ((state.total_interactions as f64).ln_1p()) / 10.0;
        idx += 1;
        x[idx] = (state.average_response_time / 10000.0).min(1.0);
        idx += 1;

        // 错误率特征 (1维)
        x[idx] = 1.0 - state.recent_accuracy;
        idx += 1;

        // 动作特征 - one-hot (5维)
        let difficulty =
            Difficulty::try_from_str(&action.difficulty).unwrap_or(Difficulty::Recognition);
        let diff_idx = difficulty.to_index();
        for i in 0..5 {
            x[idx + i] = if i == diff_idx { 1.0 } else { 0.0 };
        }
        idx += 5;

        // 交互特征 (1维) - mastery * difficulty_weight
        let diff_weight = match difficulty {
            Difficulty::Recognition => 0.2,
            Difficulty::Recall => 0.4,
            Difficulty::Spelling => 0.6,
            Difficulty::Listening => 0.8,
            Difficulty::Usage => 1.0,
        };
        x[idx] = state.mastery_level * diff_weight;
        idx += 1;

        // 时间特征 (3维)
        x[idx] = context.time_of_day;
        idx += 1;
        x[idx] = (context.day_of_week as f64) / 6.0;
        idx += 1;
        x[idx] = (context.session_duration / 3600.0).min(1.0);
        idx += 1;

        // 交叉特征 (6维)
        x[idx] = state.mastery_level * state.recent_accuracy;
        idx += 1;
        x[idx] = state.mastery_level * context.time_of_day;
        idx += 1;
        x[idx] = state.recent_accuracy * diff_weight;
        idx += 1;
        x[idx] = context.time_of_day * diff_weight;
        idx += 1;
        let fatigue = context.fatigue_factor.unwrap_or(0.0);
        x[idx] = state.mastery_level * (1.0 - fatigue);
        idx += 1;
        x[idx] = state.recent_accuracy * (1.0 - fatigue);
        idx += 1;

        // 偏置项 (1维)
        x[idx] = 1.0;

        x
    }

    /// 计算 UCB 统计信息
    fn compute_ucb_stats_internal(&self, x: &[f64]) -> UCBStats {
        // θ = A^{-1} b = L^{-T} L^{-1} b
        let theta = solve_cholesky(&self.l, &self.b, self.d);

        // exploitation = θ^T x
        let exploitation = dot_product(&theta, x);

        // confidence = √(x^T A^{-1} x)
        let quadratic = compute_quadratic_form(&self.l, x, self.d);
        let confidence = quadratic.sqrt();

        // score = exploitation + α * confidence
        let score = exploitation + self.alpha * confidence;

        UCBStats {
            theta,
            exploitation,
            confidence,
            score,
        }
    }

    /// 构建 22 维特征向量（使用类型化 Action）
    fn build_feature_vector_typed_internal(
        &self,
        state: &UserState,
        action: &ActionTyped,
        context: &LinUCBContext,
    ) -> Vec<f64> {
        let mut x = vec![0.0; self.d];
        let mut idx = 0;

        // 状态特征 (5维)
        x[idx] = state.mastery_level;
        idx += 1;
        x[idx] = state.recent_accuracy;
        idx += 1;
        x[idx] = (state.study_streak as f64).min(30.0) / 30.0;
        idx += 1;
        x[idx] = ((state.total_interactions as f64).ln_1p()) / 10.0;
        idx += 1;
        x[idx] = (state.average_response_time / 10000.0).min(1.0);
        idx += 1;

        // 错误率特征 (1维)
        x[idx] = 1.0 - state.recent_accuracy;
        idx += 1;

        // 动作特征 - one-hot (5维)
        // 直接使用枚举，无需字符串解析
        let diff_idx = action.difficulty.to_index();
        for i in 0..5 {
            x[idx + i] = if i == diff_idx { 1.0 } else { 0.0 };
        }
        idx += 5;

        // 交互特征 (1维) - mastery * difficulty_weight
        let diff_weight = match action.difficulty {
            Difficulty::Recognition => 0.2,
            Difficulty::Recall => 0.4,
            Difficulty::Spelling => 0.6,
            Difficulty::Listening => 0.8,
            Difficulty::Usage => 1.0,
        };
        x[idx] = state.mastery_level * diff_weight;
        idx += 1;

        // 时间特征 (3维)
        x[idx] = context.time_of_day;
        idx += 1;
        x[idx] = (context.day_of_week as f64) / 6.0;
        idx += 1;
        x[idx] = (context.session_duration / 3600.0).min(1.0);
        idx += 1;

        // 交叉特征 (6维)
        x[idx] = state.mastery_level * state.recent_accuracy;
        idx += 1;
        x[idx] = state.mastery_level * context.time_of_day;
        idx += 1;
        x[idx] = state.recent_accuracy * diff_weight;
        idx += 1;
        x[idx] = context.time_of_day * diff_weight;
        idx += 1;
        let fatigue = context.fatigue_factor.unwrap_or(0.0);
        x[idx] = state.mastery_level * (1.0 - fatigue);
        idx += 1;
        x[idx] = state.recent_accuracy * (1.0 - fatigue);
        idx += 1;

        // 偏置项 (1维)
        x[idx] = 1.0;

        x
    }

    /// 选择动作（类型化版本，性能更优）
    #[cfg_attr(feature = "napi", napi)]
    pub fn select_action_typed(
        &self,
        state: UserState,
        actions: Vec<ActionTyped>,
        context: LinUCBContext,
    ) -> ActionSelectionTyped {
        // 空列表保护：返回默认值避免 panic
        if actions.is_empty() {
            return ActionSelectionTyped {
                selected_index: 0,
                selected_action: ActionTyped {
                    word_id: String::new(),
                    difficulty: Difficulty::Recognition,
                    scheduled_at: None,
                },
                exploitation: 0.0,
                exploration: 0.0,
                score: f64::NEG_INFINITY,
                all_scores: vec![],
            };
        }

        let mut best_idx = 0;
        let mut best_score = f64::NEG_INFINITY;
        let mut all_scores = Vec::with_capacity(actions.len());
        let mut best_exploitation = 0.0;
        let mut best_exploration = 0.0;

        for (idx, action) in actions.iter().enumerate() {
            let mut x = self.build_feature_vector_typed_internal(&state, action, &context);
            sanitize_feature_vector(&mut x);

            let stats = self.compute_ucb_stats_internal(&x);
            all_scores.push(stats.score);

            if stats.score > best_score {
                best_score = stats.score;
                best_idx = idx;
                best_exploitation = stats.exploitation;
                best_exploration = stats.confidence;
            }
        }

        ActionSelectionTyped {
            selected_index: best_idx as u32,
            selected_action: actions[best_idx].clone(),
            exploitation: best_exploitation,
            exploration: best_exploration,
            score: best_score,
            all_scores,
        }
    }

    /// 选择动作
    #[cfg_attr(feature = "napi", napi)]
    pub fn select_action(
        &self,
        state: UserState,
        actions: Vec<Action>,
        context: LinUCBContext,
    ) -> ActionSelection {
        // 空列表保护：返回默认值避免 panic
        if actions.is_empty() {
            return ActionSelection {
                selected_index: 0,
                selected_action: Action {
                    word_id: String::new(),
                    difficulty: String::new(),
                    scheduled_at: None,
                },
                exploitation: 0.0,
                exploration: 0.0,
                score: f64::NEG_INFINITY,
                all_scores: vec![],
            };
        }

        let mut best_idx = 0;
        let mut best_score = f64::NEG_INFINITY;
        let mut all_scores = Vec::with_capacity(actions.len());
        let mut best_exploitation = 0.0;
        let mut best_exploration = 0.0;

        for (idx, action) in actions.iter().enumerate() {
            let mut x = self.build_feature_vector_internal(&state, action, &context);
            sanitize_feature_vector(&mut x);

            let stats = self.compute_ucb_stats_internal(&x);
            all_scores.push(stats.score);

            if stats.score > best_score {
                best_score = stats.score;
                best_idx = idx;
                best_exploitation = stats.exploitation;
                best_exploration = stats.confidence;
            }
        }

        ActionSelection {
            selected_index: best_idx as u32,
            selected_action: actions[best_idx].clone(),
            exploitation: best_exploitation,
            exploration: best_exploration,
            score: best_score,
            all_scores,
        }
    }

    /// 批量选择动作
    #[cfg_attr(feature = "napi", napi)]
    pub fn select_action_batch(
        &self,
        states: Vec<UserState>,
        actions_list: Vec<Vec<Action>>,
        contexts: Vec<LinUCBContext>,
    ) -> Vec<ActionSelection> {
        let len = states.len().min(actions_list.len()).min(contexts.len());
        let mut results = Vec::with_capacity(len);

        for i in 0..len {
            let result = self.select_action(
                states[i].clone(),
                actions_list[i].clone(),
                contexts[i].clone(),
            );
            results.push(result);
        }

        results
    }

    /// 更新模型
    #[cfg_attr(feature = "napi", napi)]
    pub fn update(
        &mut self,
        state: UserState,
        action: Action,
        reward: f64,
        context: LinUCBContext,
    ) {
        let mut x = self.build_feature_vector_internal(&state, &action, &context);
        self.update_with_feature_vector_internal(&mut x, reward);
    }

    /// 使用 Float64Array 更新（零拷贝）
    #[cfg(feature = "napi")]
    #[cfg_attr(feature = "napi", napi)]
    pub fn update_with_float64_array(&mut self, feature_vec: Float64Array, reward: f64) {
        let mut x: Vec<f64> = feature_vec.to_vec();
        self.update_with_feature_vector_internal(&mut x, reward);
    }

    /// 使用特征向量更新
    #[cfg_attr(feature = "napi", napi)]
    pub fn update_with_feature_vector(&mut self, feature_vec: Vec<f64>, reward: f64) {
        let mut x = feature_vec;
        self.update_with_feature_vector_internal(&mut x, reward);
    }

    /// 批量更新
    #[cfg_attr(feature = "napi", napi)]
    pub fn update_batch(&mut self, feature_vecs: Vec<Vec<f64>>, rewards: Vec<f64>) -> u32 {
        let mut success_count = 0u32;
        for (x, &r) in feature_vecs.into_iter().zip(rewards.iter()) {
            let mut x = x;
            if x.len() == self.d {
                self.update_with_feature_vector_internal(&mut x, r);
                success_count += 1;
            }
        }
        success_count
    }

    /// 内部更新实现
    fn update_with_feature_vector_internal(&mut self, x: &mut [f64], reward: f64) {
        if x.len() != self.d {
            return;
        }

        // 清理特征向量
        sanitize_feature_vector(x);

        // 检查是否需要完整重算
        let need_recompute = needs_full_recompute(self.update_count, &self.l, self.d);

        // A += x * x^T
        rank1_update_matrix(&mut self.a, x, self.d);

        // b += r * x
        vec_add_scaled(&mut self.b, x, reward);

        // 更新 Cholesky 分解
        if need_recompute {
            // 完整重算
            sanitize_covariance(&mut self.a, self.d, self.lambda);
            self.l = cholesky_decompose(&self.a, self.d, self.lambda);
        } else {
            // Rank-1 更新
            let success = cholesky_rank1_update(&mut self.l, x, self.d, MIN_RANK1_DIAG);
            if !success {
                // 更新失败，完整重算
                sanitize_covariance(&mut self.a, self.d, self.lambda);
                self.l = cholesky_decompose(&self.a, self.d, self.lambda);
            }
        }

        self.update_count += 1;
    }

    /// 健康诊断
    #[cfg_attr(feature = "napi", napi)]
    pub fn diagnose(&self) -> DiagnosticResult {
        diagnose_model(&self.a, &self.l, self.d)
    }

    /// 自检
    #[cfg_attr(feature = "napi", napi)]
    pub fn self_test(&self) -> bool {
        let diag = self.diagnose();
        diag.is_healthy
    }

    /// 获取模型
    #[cfg_attr(feature = "napi", napi)]
    pub fn get_model(&self) -> BanditModel {
        BanditModel {
            a_matrix: self.a.clone(),
            b: self.b.clone(),
            l_matrix: self.l.clone(),
            lambda: self.lambda,
            alpha: self.alpha,
            d: self.d as u32,
            update_count: self.update_count,
        }
    }

    /// 设置模型
    #[cfg_attr(feature = "napi", napi)]
    pub fn set_model(&mut self, model: BanditModel) {
        if model.d as usize == self.d {
            self.a = model.a_matrix;
            self.b = model.b;
            self.l = model.l_matrix;
            self.lambda = model.lambda;
            self.alpha = model.alpha;
            self.update_count = model.update_count;
        }
    }

    /// 重置模型
    #[cfg_attr(feature = "napi", napi)]
    pub fn reset(&mut self) {
        *self = LinUCBNative::new(Some(self.alpha), Some(self.lambda));
    }

    /// 获取 alpha
    #[cfg_attr(feature = "napi", napi(getter))]
    pub fn alpha(&self) -> f64 {
        self.alpha
    }

    /// 设置 alpha
    #[cfg_attr(feature = "napi", napi(setter))]
    pub fn set_alpha(&mut self, value: f64) {
        self.alpha = value.max(0.0);
    }

    /// 获取更新计数
    #[cfg_attr(feature = "napi", napi(getter))]
    pub fn update_count(&self) -> u32 {
        self.update_count
    }
}

/// 计算冷启动 alpha (独立函数)
#[cfg_attr(feature = "napi", napi)]
pub fn get_cold_start_alpha(interaction_count: u32, recent_accuracy: f64, fatigue: f64) -> f64 {
    let base_alpha = 0.3;

    // 交互越少，探索越多
    let interaction_factor = if interaction_count < 10 {
        2.0
    } else if interaction_count < 50 {
        1.5
    } else if interaction_count < 200 {
        1.2
    } else {
        1.0
    };

    // 准确率不稳定时增加探索
    let accuracy_factor = if !(0.3..=0.9).contains(&recent_accuracy) {
        1.3
    } else {
        1.0
    };

    // 疲劳时减少探索（更保守）
    let fatigue_factor = 1.0 - fatigue * 0.3;

    base_alpha * interaction_factor * accuracy_factor * fatigue_factor
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_state() -> UserState {
        UserState {
            mastery_level: 0.5,
            recent_accuracy: 0.7,
            study_streak: 5,
            total_interactions: 100,
            average_response_time: 2000.0,
        }
    }

    fn create_test_context() -> LinUCBContext {
        LinUCBContext {
            time_of_day: 0.5,
            day_of_week: 3,
            session_duration: 1800.0,
            fatigue_factor: Some(0.2),
        }
    }

    fn create_test_action(word_id: &str, difficulty: &str) -> Action {
        Action {
            word_id: word_id.to_string(),
            difficulty: difficulty.to_string(),
            scheduled_at: None,
        }
    }

    fn create_test_action_typed(word_id: &str, difficulty: Difficulty) -> ActionTyped {
        ActionTyped {
            word_id: word_id.to_string(),
            difficulty,
            scheduled_at: None,
        }
    }

    // ==================== Bug Fix Tests ====================

    /// 测试修复: select_action 空列表不应 panic
    #[test]
    fn test_select_action_empty_list_no_panic() {
        let linucb = LinUCBNative::new(None, None);
        let state = create_test_state();
        let context = create_test_context();
        let empty_actions: Vec<Action> = vec![];

        // 这个调用在修复前会 panic，修复后应返回默认值
        let result = linucb.select_action(state, empty_actions, context);

        assert_eq!(result.selected_index, 0);
        assert!(result.selected_action.word_id.is_empty());
        assert!(result.selected_action.difficulty.is_empty());
        assert_eq!(result.exploitation, 0.0);
        assert_eq!(result.exploration, 0.0);
        assert!(result.score.is_infinite() && result.score < 0.0); // NEG_INFINITY
        assert!(result.all_scores.is_empty());
    }

    /// 测试修复: select_action_typed 空列表不应 panic
    #[test]
    fn test_select_action_typed_empty_list_no_panic() {
        let linucb = LinUCBNative::new(None, None);
        let state = create_test_state();
        let context = create_test_context();
        let empty_actions: Vec<ActionTyped> = vec![];

        // 这个调用在修复前会 panic，修复后应返回默认值
        let result = linucb.select_action_typed(state, empty_actions, context);

        assert_eq!(result.selected_index, 0);
        assert!(result.selected_action.word_id.is_empty());
        assert_eq!(result.selected_action.difficulty, Difficulty::Recognition);
        assert_eq!(result.exploitation, 0.0);
        assert_eq!(result.exploration, 0.0);
        assert!(result.score.is_infinite() && result.score < 0.0); // NEG_INFINITY
        assert!(result.all_scores.is_empty());
    }

    /// 测试: select_action 正常情况仍然工作
    #[test]
    fn test_select_action_normal_case() {
        let linucb = LinUCBNative::new(None, None);
        let state = create_test_state();
        let context = create_test_context();
        let actions = vec![
            create_test_action("word1", "recognition"),
            create_test_action("word2", "recall"),
        ];

        let result = linucb.select_action(state, actions, context);

        assert!(result.selected_index < 2);
        assert!(!result.selected_action.word_id.is_empty());
        assert_eq!(result.all_scores.len(), 2);
    }

    /// 测试: select_action_typed 正常情况仍然工作
    #[test]
    fn test_select_action_typed_normal_case() {
        let linucb = LinUCBNative::new(None, None);
        let state = create_test_state();
        let context = create_test_context();
        let actions = vec![
            create_test_action_typed("word1", Difficulty::Recognition),
            create_test_action_typed("word2", Difficulty::Recall),
        ];

        let result = linucb.select_action_typed(state, actions, context);

        assert!(result.selected_index < 2);
        assert!(!result.selected_action.word_id.is_empty());
        assert_eq!(result.all_scores.len(), 2);
    }

    /// 测试: 单个 action 的边界情况
    #[test]
    fn test_select_action_single_action() {
        let linucb = LinUCBNative::new(None, None);
        let state = create_test_state();
        let context = create_test_context();
        let actions = vec![create_test_action("word1", "recognition")];

        let result = linucb.select_action(state, actions, context);

        assert_eq!(result.selected_index, 0);
        assert_eq!(result.selected_action.word_id, "word1");
        assert_eq!(result.all_scores.len(), 1);
    }
}
