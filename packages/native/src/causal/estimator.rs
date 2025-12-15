use super::*;
use napi_derive::napi;
use rand::prelude::*;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rayon::prelude::*;

/// 数值稳定性常量
const EPSILON: f64 = 1e-10;
/// 权重截断上限（防止极端倾向得分）
const MAX_WEIGHT: f64 = 20.0;
/// Z值（95%置信区间）
const Z_95: f64 = 1.96;

/// 因果推断 Native 实现
#[napi]
pub struct CausalInferenceNative {
    /// 倾向得分模型权重（包含截距项）
    propensity_weights: Vec<f64>,
    /// 处理组结果模型权重（包含截距项）
    outcome_weights_treatment: Vec<f64>,
    /// 对照组结果模型权重（包含截距项）
    outcome_weights_control: Vec<f64>,
    /// 特征维度（不含截距项）
    feature_dim: usize,
    /// 是否已拟合
    fitted: bool,
    /// 配置参数
    propensity_min: f64,
    propensity_max: f64,
    learning_rate: f64,
    regularization: f64,
    max_iterations: u32,
    convergence_threshold: f64,
}

#[napi]
impl CausalInferenceNative {
    /// 创建新的因果推断实例
    #[napi(constructor)]
    pub fn new(feature_dim: u32, config: Option<CausalInferenceConfig>) -> Self {
        let config = config.unwrap_or_default();
        let d = feature_dim as usize + 1; // +1 for intercept
        Self {
            propensity_weights: vec![0.0; d],
            outcome_weights_treatment: vec![0.0; d],
            outcome_weights_control: vec![0.0; d],
            feature_dim: feature_dim as usize,
            fitted: false,
            propensity_min: config.propensity_min.unwrap_or(0.05),
            propensity_max: config.propensity_max.unwrap_or(0.95),
            learning_rate: config.learning_rate.unwrap_or(0.1),
            regularization: config.regularization.unwrap_or(0.01),
            max_iterations: config.max_iterations.unwrap_or(1000),
            convergence_threshold: config.convergence_threshold.unwrap_or(1e-6),
        }
    }

    /// 训练倾向得分模型（逻辑回归 + 梯度下降 + L2正则化）
    #[napi]
    pub fn fit_propensity(&mut self, observations: Vec<CausalObservation>) {
        if observations.is_empty() {
            return;
        }

        let n = observations.len();
        let d = self.feature_dim + 1; // 维度+1用于截距项
        let mut weights = vec![0.0; d];

        let mut prev_loss = f64::INFINITY;

        // 梯度下降
        for _iter in 0..self.max_iterations {
            let mut gradients = vec![0.0; d];
            let mut loss = 0.0;

            for obs in &observations {
                // 添加截距项（特征末尾加1）
                let features_with_bias = Self::add_bias(&obs.features);
                let logit = Self::dot_product(&features_with_bias, &weights);
                let pred = Self::sigmoid(logit);

                let treatment = obs.treatment as f64;
                // 交叉熵损失
                loss += -treatment * (pred + EPSILON).ln()
                    - (1.0 - treatment) * (1.0 - pred + EPSILON).ln();

                // 梯度计算
                let error = pred - treatment;
                for j in 0..d {
                    gradients[j] += error * features_with_bias[j];
                }
            }

            // 添加L2正则化（不对截距项正则化）
            for j in 0..(d - 1) {
                loss += (self.regularization / 2.0) * weights[j] * weights[j];
                gradients[j] += self.regularization * weights[j];
            }

            // 更新权重
            for j in 0..d {
                weights[j] -= self.learning_rate * gradients[j] / n as f64;
            }

            // 检查收敛
            if (prev_loss - loss).abs() < self.convergence_threshold {
                break;
            }
            prev_loss = loss;
        }

        self.propensity_weights = weights;
    }

    /// 训练结果模型（Ridge回归 + Cholesky分解）
    /// 分别训练处理组和对照组模型
    #[napi]
    pub fn fit_outcome(&mut self, observations: Vec<CausalObservation>) {
        // 分离处理组和对照组
        let treatment_obs: Vec<_> = observations
            .iter()
            .filter(|o| o.treatment == 1)
            .cloned()
            .collect();
        let control_obs: Vec<_> = observations
            .iter()
            .filter(|o| o.treatment == 0)
            .cloned()
            .collect();

        // 拟合处理组模型
        self.outcome_weights_treatment = self.fit_linear_regression(&treatment_obs);

        // 拟合对照组模型
        self.outcome_weights_control = self.fit_linear_regression(&control_obs);
    }

    /// 完整拟合（倾向得分 + 结果模型）
    #[napi]
    pub fn fit(&mut self, observations: Vec<CausalObservation>) {
        if observations.len() < 10 {
            return; // 样本量不足
        }

        let treatment_count = observations.iter().filter(|o| o.treatment == 1).count();
        let control_count = observations.len() - treatment_count;

        if treatment_count < 5 || control_count < 5 {
            return; // 处理组和对照组样本不足
        }

        self.fit_propensity(observations.clone());
        self.fit_outcome(observations);
        self.fitted = true;
    }

    /// 计算 AIPW 双重稳健估计
    /// 公式: tau = (1/n) * sum[ mu1(X) - mu0(X) + T(Y-mu1(X))/e(X) - (1-T)(Y-mu0(X))/(1-e(X)) ]
    #[napi]
    pub fn estimate_ate(&self, observations: Vec<CausalObservation>) -> CausalEstimate {
        if observations.is_empty() || !self.fitted {
            return CausalEstimate {
                ate: 0.0,
                standard_error: 0.0,
                confidence_interval_lower: 0.0,
                confidence_interval_upper: 0.0,
                sample_size: observations.len() as u32,
                effective_sample_size: 0.0,
                p_value: 1.0,
                significant: false,
            };
        }

        let n = observations.len();
        let mut scores = Vec::with_capacity(n);
        let mut sum_weights = 0.0;
        let mut sum_weights_squared = 0.0;

        for obs in &observations {
            let e = self.get_propensity_score(&obs.features);
            let mu1 = self.predict_outcome(&obs.features, 1);
            let mu0 = self.predict_outcome(&obs.features, 0);

            // 双重稳健得分 (AIPW 估计器)
            let (score, w) = if obs.treatment == 1 {
                // 处理组: (Y - mu1)/e + mu1 - mu0
                let w = (1.0 / e.max(EPSILON)).min(MAX_WEIGHT);
                let score = w * (obs.outcome - mu1) + mu1 - mu0;
                (score, w)
            } else {
                // 对照组: mu1 - mu0 - (Y - mu0)/(1-e)
                let w = (1.0 / (1.0 - e).max(EPSILON)).min(MAX_WEIGHT);
                let score = mu1 - mu0 - w * (obs.outcome - mu0);
                (score, w)
            };

            scores.push(score);
            sum_weights += w;
            sum_weights_squared += w * w;
        }

        // 计算有效样本量: (Sigma w)^2 / Sigma w^2 (Kish's effective sample size)
        let effective_n = if sum_weights_squared > 0.0 {
            (sum_weights * sum_weights) / sum_weights_squared
        } else {
            n as f64
        };

        // 计算ATE和标准误
        let ate = Self::mean(&scores);
        let variance = Self::variance(&scores);
        let se = (variance / n as f64).sqrt();

        // 置信区间和p值
        let ci_lower = ate - Z_95 * se;
        let ci_upper = ate + Z_95 * se;
        let z_stat = ate.abs() / (se + EPSILON);
        let p_value = 2.0 * (1.0 - Self::normal_cdf(z_stat));

        CausalEstimate {
            ate,
            standard_error: se,
            confidence_interval_lower: ci_lower,
            confidence_interval_upper: ci_upper,
            sample_size: n as u32,
            effective_sample_size: effective_n,
            p_value,
            significant: p_value < 0.05,
        }
    }

    /// Bootstrap 标准误估计（使用 Rayon 并行化）
    #[napi]
    pub fn bootstrap_se(&self, observations: Vec<CausalObservation>, n_bootstrap: Option<u32>) -> f64 {
        let n_bootstrap = n_bootstrap.unwrap_or(100) as usize;
        let n = observations.len();

        if n < 10 || !self.fitted {
            return 0.0;
        }

        // 使用 Rayon 并行计算
        let estimates: Vec<f64> = (0..n_bootstrap)
            .into_par_iter()
            .filter_map(|seed| {
                // 每个线程使用不同的种子
                let mut rng = ChaCha8Rng::seed_from_u64(seed as u64);

                // 重采样
                let sample: Vec<CausalObservation> = (0..n)
                    .map(|_| {
                        let idx = rng.gen_range(0..n);
                        observations[idx].clone()
                    })
                    .collect();

                // 检查重采样后的数据是否有效
                let treatment_obs: Vec<_> =
                    sample.iter().filter(|o| o.treatment == 1).collect();
                let control_obs: Vec<_> =
                    sample.iter().filter(|o| o.treatment == 0).collect();

                if treatment_obs.len() < 3 || control_obs.len() < 3 {
                    return None;
                }

                // 在重采样数据上计算ATE
                let mut temp_estimator = CausalInferenceNative::new(
                    self.feature_dim as u32,
                    Some(CausalInferenceConfig {
                        propensity_min: Some(self.propensity_min),
                        propensity_max: Some(self.propensity_max),
                        learning_rate: Some(self.learning_rate),
                        regularization: Some(self.regularization),
                        max_iterations: Some(self.max_iterations),
                        convergence_threshold: Some(self.convergence_threshold),
                    }),
                );
                temp_estimator.fit(sample.clone());

                if temp_estimator.fitted {
                    Some(temp_estimator.estimate_ate(sample).ate)
                } else {
                    None
                }
            })
            .collect();

        if estimates.len() < 10 {
            return 0.0;
        }

        Self::variance(&estimates).sqrt()
    }

    /// 诊断倾向得分分布
    #[napi]
    pub fn diagnose_propensity(&self, observations: Vec<CausalObservation>) -> PropensityDiagnostics {
        if observations.is_empty() {
            return PropensityDiagnostics {
                mean: 0.5,
                std: 0.0,
                median: 0.5,
                treatment_mean: 0.5,
                control_mean: 0.5,
                overlap: 0.0,
                auc: 0.5,
            };
        }

        let scores: Vec<f64> = observations
            .iter()
            .map(|o| self.get_propensity_score(&o.features))
            .collect();

        let treatment_scores: Vec<f64> = observations
            .iter()
            .filter(|o| o.treatment == 1)
            .map(|o| self.get_propensity_score(&o.features))
            .collect();

        let control_scores: Vec<f64> = observations
            .iter()
            .filter(|o| o.treatment == 0)
            .map(|o| self.get_propensity_score(&o.features))
            .collect();

        // 计算重叠度量（直方图重叠）
        let overlap = Self::compute_overlap(&treatment_scores, &control_scores);

        // 计算AUC
        let labels: Vec<u8> = observations.iter().map(|o| o.treatment).collect();
        let auc = Self::compute_auc(&scores, &labels);

        PropensityDiagnostics {
            mean: Self::mean(&scores),
            std: Self::variance(&scores).sqrt(),
            median: Self::median(&scores),
            treatment_mean: if treatment_scores.is_empty() {
                0.5
            } else {
                Self::mean(&treatment_scores)
            },
            control_mean: if control_scores.is_empty() {
                0.5
            } else {
                Self::mean(&control_scores)
            },
            overlap,
            auc,
        }
    }

    /// 获取倾向得分（自动添加截距项）
    #[napi]
    pub fn get_propensity_score(&self, features: &[f64]) -> f64 {
        let features_with_bias = Self::add_bias(features);
        let logit = Self::dot_product(&features_with_bias, &self.propensity_weights);
        let raw = Self::sigmoid(logit);
        raw.clamp(self.propensity_min, self.propensity_max)
    }

    /// 预测结果（自动添加截距项）
    #[napi]
    pub fn predict_outcome(&self, features: &[f64], treatment: u8) -> f64 {
        let weights = if treatment == 1 {
            &self.outcome_weights_treatment
        } else {
            &self.outcome_weights_control
        };

        let features_with_bias = Self::add_bias(features);
        Self::dot_product(&features_with_bias, weights)
    }

    /// 检查是否已拟合
    #[napi]
    pub fn is_fitted(&self) -> bool {
        self.fitted
    }

    /// 获取特征维度
    #[napi]
    pub fn get_feature_dim(&self) -> u32 {
        self.feature_dim as u32
    }

    /// 重置模型
    #[napi]
    pub fn reset(&mut self) {
        let d = self.feature_dim + 1;
        self.propensity_weights = vec![0.0; d];
        self.outcome_weights_treatment = vec![0.0; d];
        self.outcome_weights_control = vec![0.0; d];
        self.fitted = false;
    }
}

// 私有实现方法
impl CausalInferenceNative {
    /// 添加截距项（在特征末尾加1）
    fn add_bias(features: &[f64]) -> Vec<f64> {
        let mut result = features.to_vec();
        result.push(1.0);
        result
    }

    /// 点积计算
    fn dot_product(a: &[f64], b: &[f64]) -> f64 {
        a.iter()
            .zip(b.iter())
            .map(|(x, y)| x * y)
            .sum()
    }

    /// Sigmoid 函数（带数值稳定性处理）
    fn sigmoid(x: f64) -> f64 {
        if x > 20.0 {
            1.0 - EPSILON
        } else if x < -20.0 {
            EPSILON
        } else {
            1.0 / (1.0 + (-x).exp())
        }
    }

    /// 均值
    fn mean(arr: &[f64]) -> f64 {
        if arr.is_empty() {
            return 0.0;
        }
        arr.iter().sum::<f64>() / arr.len() as f64
    }

    /// 方差（样本方差，使用 n-1）
    fn variance(arr: &[f64]) -> f64 {
        if arr.len() < 2 {
            return 0.0;
        }
        let m = Self::mean(arr);
        let sum_sq: f64 = arr.iter().map(|x| (x - m).powi(2)).sum();
        sum_sq / (arr.len() - 1) as f64
    }

    /// 中位数
    fn median(arr: &[f64]) -> f64 {
        if arr.is_empty() {
            return 0.0;
        }
        let mut sorted = arr.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let mid = sorted.len() / 2;
        if !sorted.len().is_multiple_of(2) {
            sorted[mid]
        } else {
            (sorted[mid - 1] + sorted[mid]) / 2.0
        }
    }

    /// 标准正态CDF（近似计算）
    fn normal_cdf(x: f64) -> f64 {
        let a1 = 0.254829592;
        let a2 = -0.284496736;
        let a3 = 1.421413741;
        let a4 = -1.453152027;
        let a5 = 1.061405429;
        let p = 0.3275911;

        let sign = if x < 0.0 { -1.0 } else { 1.0 };
        let x = x.abs();

        let t = 1.0 / (1.0 + p * x);
        let y = 1.0
            - (a1 * t + a2 * t.powi(2) + a3 * t.powi(3) + a4 * t.powi(4) + a5 * t.powi(5))
                * (-x * x / 2.0).exp();

        0.5 * (1.0 + sign * y)
    }

    /// 拟合线性回归（OLS with Ridge，自动添加截距项）
    fn fit_linear_regression(&self, data: &[CausalObservation]) -> Vec<f64> {
        let n = data.len();
        let d = self.feature_dim + 1; // +1 for intercept

        if n == 0 {
            return vec![0.0; d];
        }

        // 构建 X^T X + lambda*I
        let mut xtx = vec![0.0; d * d];
        let mut xty = vec![0.0; d];

        for obs in data {
            let features_with_bias = Self::add_bias(&obs.features);
            for i in 0..d {
                xty[i] += features_with_bias[i] * obs.outcome;
                for j in 0..d {
                    xtx[i * d + j] += features_with_bias[i] * features_with_bias[j];
                }
            }
        }

        // 添加正则化（不对截距项正则化）
        for i in 0..(d - 1) {
            xtx[i * d + i] += self.regularization * n as f64;
        }

        // 使用 Cholesky 分解求解
        Self::solve_linear_system(&xtx, &xty, d)
    }

    /// 求解线性系统（Cholesky分解）
    fn solve_linear_system(a: &[f64], b: &[f64], n: usize) -> Vec<f64> {
        // Cholesky分解: A = L * L^T
        let mut l = vec![0.0; n * n];

        for i in 0..n {
            for j in 0..=i {
                let mut sum = a[i * n + j];
                for k in 0..j {
                    sum -= l[i * n + k] * l[j * n + k];
                }

                if i == j {
                    l[i * n + j] = (sum.max(EPSILON)).sqrt();
                } else {
                    l[i * n + j] = sum / (l[j * n + j] + EPSILON);
                }
            }
        }

        // 前向替换: L * y = b
        let mut y = vec![0.0; n];
        for i in 0..n {
            let mut sum = b[i];
            for j in 0..i {
                sum -= l[i * n + j] * y[j];
            }
            y[i] = sum / (l[i * n + i] + EPSILON);
        }

        // 后向替换: L^T * x = y
        let mut x = vec![0.0; n];
        for i in (0..n).rev() {
            let mut sum = y[i];
            for j in (i + 1)..n {
                sum -= l[j * n + i] * x[j];
            }
            x[i] = sum / (l[i * n + i] + EPSILON);
        }

        x
    }

    /// 计算重叠度量（直方图重叠）
    fn compute_overlap(scores1: &[f64], scores2: &[f64]) -> f64 {
        if scores1.is_empty() || scores2.is_empty() {
            return 0.0;
        }

        let bins = 20;
        let mut hist1 = vec![0.0; bins];
        let mut hist2 = vec![0.0; bins];

        for &s in scores1 {
            let bin = ((s * bins as f64) as usize).min(bins - 1);
            hist1[bin] += 1.0 / scores1.len() as f64;
        }

        for &s in scores2 {
            let bin = ((s * bins as f64) as usize).min(bins - 1);
            hist2[bin] += 1.0 / scores2.len() as f64;
        }

        // 重叠面积
        hist1
            .iter()
            .zip(hist2.iter())
            .map(|(h1, h2)| h1.min(*h2))
            .sum()
    }

    /// 计算AUC（ROC曲线下面积）
    fn compute_auc(scores: &[f64], labels: &[u8]) -> f64 {
        if scores.len() != labels.len() || scores.is_empty() {
            return 0.5;
        }

        let n_pos = labels.iter().filter(|&&l| l == 1).count();
        let n_neg = labels.len() - n_pos;

        if n_pos == 0 || n_neg == 0 {
            return 0.5;
        }

        // 按分数排序
        let mut pairs: Vec<(f64, u8)> = scores
            .iter()
            .zip(labels.iter())
            .map(|(&s, &l)| (s, l))
            .collect();
        pairs.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        let mut auc = 0.0;
        let mut tp_sum = 0.0;

        for (_, label) in pairs {
            if label == 1 {
                tp_sum += 1.0;
            } else {
                auc += tp_sum;
            }
        }

        auc / (n_pos as f64 * n_neg as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 创建测试观测数据
    fn create_test_observations(n: usize, seed: u64) -> Vec<CausalObservation> {
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let mut observations = Vec::with_capacity(n);

        for _ in 0..n {
            // 特征: 2维
            let x1: f64 = rng.gen_range(-1.0..1.0);
            let x2: f64 = rng.gen_range(-1.0..1.0);

            // 真实倾向得分基于特征
            let true_propensity = 1.0 / (1.0 + (-0.5 * x1 + 0.3 * x2).exp());

            // 根据倾向得分分配处理
            let treatment = if rng.gen::<f64>() < true_propensity {
                1
            } else {
                0
            };

            // 真实因果效应: ATE = 0.5
            let base_outcome = 0.2 * x1 - 0.1 * x2;
            let treatment_effect = if treatment == 1 { 0.5 } else { 0.0 };
            let noise: f64 = rng.gen_range(-0.1..0.1);
            let outcome = base_outcome + treatment_effect + noise;

            observations.push(CausalObservation {
                features: vec![x1, x2],
                treatment,
                outcome: outcome.clamp(-1.0, 1.0),
                timestamp: None,
                user_id: None,
            });
        }

        observations
    }

    #[test]
    fn test_new_estimator() {
        let estimator = CausalInferenceNative::new(3, None);
        assert_eq!(estimator.feature_dim, 3);
        assert!(!estimator.fitted);
        assert_eq!(estimator.propensity_weights.len(), 4); // 3 + 1 for bias
    }

    #[test]
    fn test_sigmoid() {
        // 测试sigmoid函数边界值
        assert!((CausalInferenceNative::sigmoid(0.0) - 0.5).abs() < EPSILON);
        assert!(CausalInferenceNative::sigmoid(20.0) > 0.99);
        assert!(CausalInferenceNative::sigmoid(-20.0) < 0.01);
        assert!(CausalInferenceNative::sigmoid(100.0) > 0.99); // 数值稳定性
        assert!(CausalInferenceNative::sigmoid(-100.0) < 0.01); // 数值稳定性
    }

    #[test]
    fn test_dot_product() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![4.0, 5.0, 6.0];
        assert!((CausalInferenceNative::dot_product(&a, &b) - 32.0).abs() < EPSILON);
    }

    #[test]
    fn test_mean() {
        let arr = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert!((CausalInferenceNative::mean(&arr) - 3.0).abs() < EPSILON);

        let empty: Vec<f64> = vec![];
        assert_eq!(CausalInferenceNative::mean(&empty), 0.0);
    }

    #[test]
    fn test_variance() {
        let arr = vec![2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0];
        let var = CausalInferenceNative::variance(&arr);
        assert!((var - 4.571428571428571).abs() < 0.001);

        let single = vec![5.0];
        assert_eq!(CausalInferenceNative::variance(&single), 0.0);
    }

    #[test]
    fn test_median() {
        let odd = vec![1.0, 3.0, 5.0, 7.0, 9.0];
        assert!((CausalInferenceNative::median(&odd) - 5.0).abs() < EPSILON);

        let even = vec![1.0, 2.0, 3.0, 4.0];
        assert!((CausalInferenceNative::median(&even) - 2.5).abs() < EPSILON);

        let empty: Vec<f64> = vec![];
        assert_eq!(CausalInferenceNative::median(&empty), 0.0);
    }

    #[test]
    fn test_median_single_element() {
        // 单元素数组（奇数情况的边界）
        let single = vec![42.0];
        assert!((CausalInferenceNative::median(&single) - 42.0).abs() < EPSILON);
    }

    #[test]
    fn test_median_two_elements() {
        // 两个元素（偶数情况的边界）
        let two = vec![10.0, 20.0];
        assert!((CausalInferenceNative::median(&two) - 15.0).abs() < EPSILON);
    }

    #[test]
    fn test_median_unsorted_input() {
        // 验证函数内部排序正确工作
        let unsorted = vec![9.0, 1.0, 5.0, 3.0, 7.0];
        assert!((CausalInferenceNative::median(&unsorted) - 5.0).abs() < EPSILON);
    }

    #[test]
    fn test_median_with_negative_numbers() {
        // 包含负数
        let with_negatives = vec![-5.0, -1.0, 0.0, 1.0, 5.0];
        assert!((CausalInferenceNative::median(&with_negatives) - 0.0).abs() < EPSILON);
    }

    #[test]
    fn test_normal_cdf() {
        // 测试标准正态分布CDF
        assert!((CausalInferenceNative::normal_cdf(0.0) - 0.5).abs() < 0.01);
        assert!((CausalInferenceNative::normal_cdf(1.96) - 0.975).abs() < 0.01);
        assert!((CausalInferenceNative::normal_cdf(-1.96) - 0.025).abs() < 0.01);
    }

    #[test]
    fn test_add_bias() {
        let features = vec![1.0, 2.0, 3.0];
        let with_bias = CausalInferenceNative::add_bias(&features);
        assert_eq!(with_bias, vec![1.0, 2.0, 3.0, 1.0]);
    }

    #[test]
    fn test_fit_propensity() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit_propensity(observations);

        // 检查权重已更新
        assert!(
            estimator
                .propensity_weights
                .iter()
                .any(|&w| w.abs() > EPSILON)
        );
    }

    #[test]
    fn test_fit_outcome() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit_outcome(observations);

        // 检查处理组和对照组权重已更新
        assert!(
            estimator
                .outcome_weights_treatment
                .iter()
                .any(|&w| w.abs() > EPSILON)
        );
        assert!(
            estimator
                .outcome_weights_control
                .iter()
                .any(|&w| w.abs() > EPSILON)
        );
    }

    #[test]
    fn test_full_fit() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations);

        assert!(estimator.fitted);
    }

    #[test]
    fn test_estimate_ate() {
        let observations = create_test_observations(200, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations.clone());
        let estimate = estimator.estimate_ate(observations);

        // ATE应该接近真实值0.5（允许一定误差）
        assert!(estimate.ate > 0.0 && estimate.ate < 1.0);
        assert!(estimate.standard_error >= 0.0);
        assert!(estimate.confidence_interval_lower < estimate.confidence_interval_upper);
        assert!(estimate.sample_size == 200);
    }

    #[test]
    fn test_get_propensity_score() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations);

        let score = estimator.get_propensity_score(&vec![0.5, 0.5]);

        // 分数应该在配置的范围内
        assert!(score >= 0.05 && score <= 0.95);
    }

    #[test]
    fn test_predict_outcome() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations);

        let outcome_treatment = estimator.predict_outcome(&vec![0.5, 0.5], 1);
        let outcome_control = estimator.predict_outcome(&vec![0.5, 0.5], 0);

        // 处理组的预测应该与对照组不同
        assert!((outcome_treatment - outcome_control).abs() > EPSILON);
    }

    #[test]
    fn test_bootstrap_se() {
        let observations = create_test_observations(50, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations.clone());
        let se = estimator.bootstrap_se(observations, Some(20));

        // 标准误应该是正数
        assert!(se >= 0.0);
    }

    #[test]
    fn test_diagnose_propensity() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations.clone());
        let diagnostics = estimator.diagnose_propensity(observations);

        // 检查诊断结果的合理性
        assert!(diagnostics.mean >= 0.0 && diagnostics.mean <= 1.0);
        assert!(diagnostics.std >= 0.0);
        assert!(diagnostics.median >= 0.0 && diagnostics.median <= 1.0);
        assert!(diagnostics.treatment_mean >= 0.0 && diagnostics.treatment_mean <= 1.0);
        assert!(diagnostics.control_mean >= 0.0 && diagnostics.control_mean <= 1.0);
        assert!(diagnostics.overlap >= 0.0 && diagnostics.overlap <= 1.0);
        assert!(diagnostics.auc >= 0.0 && diagnostics.auc <= 1.0);
    }

    #[test]
    fn test_reset() {
        let observations = create_test_observations(100, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations);
        assert!(estimator.fitted);

        estimator.reset();
        assert!(!estimator.fitted);
        assert!(estimator.propensity_weights.iter().all(|&w| w == 0.0));
    }

    #[test]
    fn test_compute_overlap() {
        let scores1 = vec![0.3, 0.4, 0.5, 0.6, 0.7];
        let scores2 = vec![0.4, 0.5, 0.6, 0.7, 0.8];

        let overlap = CausalInferenceNative::compute_overlap(&scores1, &scores2);

        // 有重叠应该大于0
        assert!(overlap > 0.0);
    }

    #[test]
    fn test_compute_auc() {
        // 完美区分
        let scores = vec![0.9, 0.8, 0.3, 0.2];
        let labels = vec![1, 1, 0, 0];
        let auc = CausalInferenceNative::compute_auc(&scores, &labels);
        assert!((auc - 1.0).abs() < 0.01);

        // 无区分能力（完全反转）
        let inverted_scores = vec![0.2, 0.3, 0.8, 0.9];
        let inverted_labels = vec![1, 1, 0, 0];
        let inverted_auc = CausalInferenceNative::compute_auc(&inverted_scores, &inverted_labels);
        assert!(inverted_auc < 0.1); // 接近0
    }

    #[test]
    fn test_solve_linear_system() {
        // 简单的2x2系统: A = [[4, 2], [2, 2]], b = [4, 2]
        // 解应该是 x = [1, 0]
        let a = vec![4.0, 2.0, 2.0, 2.0];
        let b = vec![4.0, 2.0];
        let x = CausalInferenceNative::solve_linear_system(&a, &b, 2);

        assert!((x[0] - 1.0).abs() < 0.01);
        assert!(x[1].abs() < 0.01);
    }

    #[test]
    fn test_insufficient_samples() {
        // 测试样本不足时的行为
        let observations = create_test_observations(5, 42);
        let mut estimator = CausalInferenceNative::new(2, None);

        estimator.fit(observations.clone());
        assert!(!estimator.fitted); // 应该保持未拟合状态

        let estimate = estimator.estimate_ate(observations);
        assert_eq!(estimate.ate, 0.0); // 返回默认值
    }

    #[test]
    fn test_empty_observations() {
        let estimator = CausalInferenceNative::new(2, None);
        let empty: Vec<CausalObservation> = vec![];

        let estimate = estimator.estimate_ate(empty.clone());
        assert_eq!(estimate.ate, 0.0);

        let diagnostics = estimator.diagnose_propensity(empty);
        assert_eq!(diagnostics.mean, 0.5);
    }

    #[test]
    fn test_custom_config() {
        let config = CausalInferenceConfig {
            propensity_min: Some(0.1),
            propensity_max: Some(0.9),
            learning_rate: Some(0.05),
            regularization: Some(0.1),
            max_iterations: Some(500),
            convergence_threshold: Some(1e-5),
        };

        let estimator = CausalInferenceNative::new(2, Some(config));

        assert_eq!(estimator.propensity_min, 0.1);
        assert_eq!(estimator.propensity_max, 0.9);
        assert_eq!(estimator.learning_rate, 0.05);
        assert_eq!(estimator.regularization, 0.1);
        assert_eq!(estimator.max_iterations, 500);
        assert_eq!(estimator.convergence_threshold, 1e-5);
    }
}
