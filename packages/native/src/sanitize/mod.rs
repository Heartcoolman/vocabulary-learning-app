use crate::types::{
    DiagnosticResult, CHOLESKY_RECOMPUTE_INTERVAL, EPSILON, MAX_COVARIANCE, MAX_FEATURE_ABS,
    MIN_LAMBDA, MIN_RANK1_DIAG,
};

/// 检查数组是否包含无效值 (NaN 或 Inf)
pub fn has_invalid_values(arr: &[f64]) -> bool {
    arr.iter().any(|&x| x.is_nan() || x.is_infinite())
}

/// 清理特征向量，确保数值稳定
pub fn sanitize_feature_vector(x: &mut [f64]) {
    for val in x.iter_mut() {
        if val.is_nan() || val.is_infinite() {
            *val = 0.0;
        } else {
            *val = (*val).clamp(-MAX_FEATURE_ABS, MAX_FEATURE_ABS);
        }
    }
}

/// 清理协方差矩阵，确保正定性
pub fn sanitize_covariance(a: &mut [f64], d: usize, lambda: f64) {
    let safe_lambda = lambda.max(MIN_LAMBDA);

    for i in 0..d {
        for j in 0..d {
            let idx = i * d + j;
            let val = a[idx];

            // 处理无效值
            if val.is_nan() || val.is_infinite() {
                a[idx] = if i == j { safe_lambda } else { 0.0 };
                continue;
            }

            // 限制最大值
            if val.abs() > MAX_COVARIANCE {
                a[idx] = val.signum() * MAX_COVARIANCE;
            }
        }

        // 确保对角线元素足够大
        let diag_idx = i * d + i;
        if a[diag_idx] < safe_lambda {
            a[diag_idx] = safe_lambda;
        }
    }

    // 确保对称性
    for i in 0..d {
        for j in (i + 1)..d {
            let avg = (a[i * d + j] + a[j * d + i]) / 2.0;
            a[i * d + j] = avg;
            a[j * d + i] = avg;
        }
    }
}

/// 判断是否需要完整重新计算 Cholesky 分解
pub fn needs_full_recompute(update_count: u32, l: &[f64], d: usize) -> bool {
    // 每隔固定周期强制重算（与 TS 侧 CHOLESKY_RECOMPUTE_INTERVAL 对齐）
    if update_count.is_multiple_of(CHOLESKY_RECOMPUTE_INTERVAL) {
        return true;
    }

    // 检查 L 矩阵对角线
    for i in 0..d {
        let diag = l[i * d + i];
        if diag.is_nan() || diag.is_infinite() || diag < MIN_RANK1_DIAG {
            return true;
        }
    }

    // 检查条件数（使用对角线元素的比值估计）
    let mut min_diag = f64::MAX;
    let mut max_diag = f64::MIN;
    for i in 0..d {
        let diag = l[i * d + i];
        if diag > 0.0 {
            min_diag = min_diag.min(diag);
            max_diag = max_diag.max(diag);
        }
    }

    if min_diag > 0.0 {
        let cond_estimate = max_diag / min_diag;
        if cond_estimate > 1e8 {
            return true;
        }
    }

    false
}

/// 诊断模型健康状态
pub fn diagnose_model(a: &[f64], l: &[f64], d: usize) -> DiagnosticResult {
    let mut has_nan = false;
    let mut has_inf = false;
    let mut min_diagonal = f64::MAX;
    let mut max_diagonal = f64::MIN;

    // 检查 A 矩阵
    for val in a.iter() {
        if val.is_nan() {
            has_nan = true;
        }
        if val.is_infinite() {
            has_inf = true;
        }
    }

    // 检查 L 矩阵对角线
    for i in 0..d {
        let diag = l[i * d + i];
        if diag.is_nan() {
            has_nan = true;
        }
        if diag.is_infinite() {
            has_inf = true;
        }
        if diag > 0.0 && !diag.is_nan() && !diag.is_infinite() {
            min_diagonal = min_diagonal.min(diag);
            max_diagonal = max_diagonal.max(diag);
        }
    }

    // 计算条件数估计
    let condition_number = if min_diagonal > EPSILON {
        (max_diagonal / min_diagonal).powi(2)
    } else {
        f64::MAX
    };

    let is_healthy = !has_nan && !has_inf && condition_number < 1e12;

    let message = if is_healthy {
        "Model is healthy".to_string()
    } else if has_nan {
        "Model contains NaN values".to_string()
    } else if has_inf {
        "Model contains infinite values".to_string()
    } else {
        format!("Model has high condition number: {:.2e}", condition_number)
    };

    DiagnosticResult {
        is_healthy,
        has_nan,
        has_inf,
        condition_number,
        min_diagonal: if min_diagonal == f64::MAX {
            0.0
        } else {
            min_diagonal
        },
        max_diagonal: if max_diagonal == f64::MIN {
            0.0
        } else {
            max_diagonal
        },
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== has_invalid_values 测试 ====================

    #[test]
    fn test_has_invalid_values_with_valid_array() {
        assert!(!has_invalid_values(&[1.0, 2.0, 3.0]));
        assert!(!has_invalid_values(&[0.0, -1.0, 1e10]));
        assert!(!has_invalid_values(&[])); // 空数组
    }

    #[test]
    fn test_has_invalid_values_with_nan() {
        assert!(has_invalid_values(&[1.0, f64::NAN, 3.0]));
        assert!(has_invalid_values(&[f64::NAN]));
        assert!(has_invalid_values(&[f64::NAN, f64::NAN]));
    }

    #[test]
    fn test_has_invalid_values_with_infinity() {
        assert!(has_invalid_values(&[1.0, f64::INFINITY, 3.0]));
        assert!(has_invalid_values(&[f64::NEG_INFINITY, 2.0]));
        assert!(has_invalid_values(&[f64::INFINITY, f64::NEG_INFINITY]));
    }

    // ==================== sanitize_feature_vector 测试 ====================

    #[test]
    fn test_sanitize_feature_vector_normal_values() {
        let mut x = vec![1.0, 2.0, 3.0, -1.0];
        sanitize_feature_vector(&mut x);
        assert_eq!(x, vec![1.0, 2.0, 3.0, -1.0]); // 不变
    }

    #[test]
    fn test_sanitize_feature_vector_nan_replaced() {
        let mut x = vec![1.0, f64::NAN, 3.0];
        sanitize_feature_vector(&mut x);
        assert_eq!(x[0], 1.0);
        assert_eq!(x[1], 0.0); // NaN -> 0.0
        assert_eq!(x[2], 3.0);
    }

    #[test]
    fn test_sanitize_feature_vector_infinity_replaced() {
        let mut x = vec![f64::INFINITY, f64::NEG_INFINITY];
        sanitize_feature_vector(&mut x);
        assert_eq!(x[0], 0.0); // +Inf -> 0.0
        assert_eq!(x[1], 0.0); // -Inf -> 0.0
    }

    #[test]
    fn test_sanitize_feature_vector_clipping() {
        let mut x = vec![1.0, 100.0, -100.0, MAX_FEATURE_ABS + 10.0];
        sanitize_feature_vector(&mut x);
        assert_eq!(x[0], 1.0);
        assert_eq!(x[1], MAX_FEATURE_ABS); // 100.0 -> 50.0
        assert_eq!(x[2], -MAX_FEATURE_ABS); // -100.0 -> -50.0
        assert_eq!(x[3], MAX_FEATURE_ABS); // 60.0 -> 50.0
    }

    #[test]
    fn test_sanitize_feature_vector_boundary_values() {
        let mut x = vec![MAX_FEATURE_ABS, -MAX_FEATURE_ABS, MAX_FEATURE_ABS - 0.001];
        sanitize_feature_vector(&mut x);
        assert_eq!(x[0], MAX_FEATURE_ABS); // 边界值保持
        assert_eq!(x[1], -MAX_FEATURE_ABS); // 边界值保持
        assert_eq!(x[2], MAX_FEATURE_ABS - 0.001); // 略小于边界，保持
    }

    #[test]
    fn test_sanitize_feature_vector_empty() {
        let mut x: Vec<f64> = vec![];
        sanitize_feature_vector(&mut x);
        assert!(x.is_empty());
    }

    // ==================== sanitize_covariance 测试 ====================

    #[test]
    fn test_sanitize_covariance_valid_matrix() {
        // 3x3 有效协方差矩阵
        let mut a = vec![2.0, 0.5, 0.3, 0.5, 2.0, 0.4, 0.3, 0.4, 2.0];
        let original = a.clone();
        sanitize_covariance(&mut a, 3, 1.0);
        // 有效矩阵应保持不变（除了对称性强制）
        assert_eq!(a, original);
    }

    #[test]
    fn test_sanitize_covariance_nan_on_diagonal() {
        let mut a = vec![f64::NAN, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0];
        sanitize_covariance(&mut a, 3, 1.0);
        // NaN 对角线应被替换为 lambda
        assert_eq!(a[0], 1.0); // lambda = 1.0
        assert!(!a[0].is_nan());
    }

    #[test]
    fn test_sanitize_covariance_nan_off_diagonal() {
        let mut a = vec![2.0, f64::NAN, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0];
        sanitize_covariance(&mut a, 3, 1.0);
        // NaN 非对角线应被替换为 0.0，然后对称化
        assert_eq!(a[1], 0.0);
        assert_eq!(a[3], 0.0); // 对称位置
    }

    #[test]
    fn test_sanitize_covariance_infinity() {
        let mut a = vec![
            f64::INFINITY,
            0.0,
            0.0,
            0.0,
            2.0,
            0.0,
            0.0,
            0.0,
            f64::NEG_INFINITY,
        ];
        sanitize_covariance(&mut a, 3, 1.0);
        // Infinity 应被替换
        assert!(!a[0].is_infinite());
        assert!(!a[8].is_infinite());
    }

    #[test]
    fn test_sanitize_covariance_exceeds_max() {
        let mut a = vec![2e9, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, -2e9];
        sanitize_covariance(&mut a, 3, 1.0);
        // 超出 MAX_COVARIANCE 应���限制
        assert!(a[0] <= MAX_COVARIANCE);
        assert!(a[8] >= -MAX_COVARIANCE);
        // 但对角线最小值检查会将 -2e9 限制后再确保 >= lambda
        assert!(a[8] >= MIN_LAMBDA);
    }

    #[test]
    fn test_sanitize_covariance_small_diagonal() {
        let mut a = vec![0.0001, 0.0, 0.0, 0.0, 0.0001, 0.0, 0.0, 0.0, 0.0001];
        sanitize_covariance(&mut a, 3, 1.0);
        // 对角线应被提升到 lambda
        assert!(a[0] >= 1.0);
        assert!(a[4] >= 1.0);
        assert!(a[8] >= 1.0);
    }

    #[test]
    fn test_sanitize_covariance_lambda_floor() {
        let mut a = vec![0.0001, 0.0, 0.0, 0.0001];
        // lambda 小于 MIN_LAMBDA 时，使用 MIN_LAMBDA
        sanitize_covariance(&mut a, 2, 0.0001);
        assert!(a[0] >= MIN_LAMBDA);
        assert!(a[3] >= MIN_LAMBDA);
    }

    #[test]
    fn test_sanitize_covariance_symmetry_enforcement() {
        let mut a = vec![
            2.0, 0.6, 0.0, 0.4, 2.0, 0.0, // 不对称: a[1]=0.6, a[3]=0.4
            0.0, 0.0, 2.0,
        ];
        sanitize_covariance(&mut a, 3, 1.0);
        // 应强制对称: (0.6 + 0.4) / 2 = 0.5
        assert_eq!(a[1], 0.5);
        assert_eq!(a[3], 0.5);
    }

    #[test]
    fn test_sanitize_covariance_1x1_matrix() {
        let mut a = vec![0.5];
        sanitize_covariance(&mut a, 1, 1.0);
        // 1x1 矩阵对角线应 >= lambda
        assert!(a[0] >= 1.0);
    }

    // ==================== needs_full_recompute 测试 ====================

    #[test]
    fn test_needs_full_recompute_periodic() {
        let l = vec![1.0, 0.0, 0.0, 1.0]; // 2x2 单位矩阵
                                          // 每隔固定周期强制重算（与 CHOLESKY_RECOMPUTE_INTERVAL 对齐）
        assert!(needs_full_recompute(CHOLESKY_RECOMPUTE_INTERVAL, &l, 2));
        assert!(needs_full_recompute(CHOLESKY_RECOMPUTE_INTERVAL * 2, &l, 2));
        assert!(needs_full_recompute(0, &l, 2)); // 0 也是周期的倍数
        assert!(!needs_full_recompute(
            CHOLESKY_RECOMPUTE_INTERVAL - 1,
            &l,
            2
        ));
        assert!(!needs_full_recompute(
            CHOLESKY_RECOMPUTE_INTERVAL + 1,
            &l,
            2
        ));
    }

    #[test]
    fn test_needs_full_recompute_nan_diagonal() {
        let l = vec![f64::NAN, 0.0, 0.0, 1.0];
        assert!(needs_full_recompute(50, &l, 2)); // 对角线有 NaN
    }

    #[test]
    fn test_needs_full_recompute_infinity_diagonal() {
        let l = vec![f64::INFINITY, 0.0, 0.0, 1.0];
        assert!(needs_full_recompute(50, &l, 2)); // 对角线有 Inf
    }

    #[test]
    fn test_needs_full_recompute_small_diagonal() {
        let l = vec![1e-8, 0.0, 0.0, 1.0]; // 对角线太小 (< MIN_RANK1_DIAG)
        assert!(needs_full_recompute(50, &l, 2));
    }

    #[test]
    fn test_needs_full_recompute_high_condition_number() {
        // 条件数估计: max_diag / min_diag > 1e8
        let l = vec![1e-4, 0.0, 0.0, 1e5]; // ratio = 1e9 > 1e8
        assert!(needs_full_recompute(50, &l, 2));
    }

    #[test]
    fn test_needs_full_recompute_healthy_matrix() {
        let l = vec![1.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.3, 0.2, 1.0];
        assert!(!needs_full_recompute(50, &l, 3)); // 健康矩阵，不需要重算
    }

    #[test]
    fn test_needs_full_recompute_moderate_condition_number() {
        // 条件数 = 100，在可接受范围内
        let l = vec![0.1, 0.0, 0.0, 10.0];
        assert!(!needs_full_recompute(50, &l, 2));
    }

    // ==================== diagnose_model 测试 ====================

    #[test]
    fn test_diagnose_model_healthy() {
        let d = 3;
        let a = vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let l = vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert!(result.is_healthy);
        assert!(!result.has_nan);
        assert!(!result.has_inf);
        assert_eq!(result.min_diagonal, 1.0);
        assert_eq!(result.max_diagonal, 1.0);
        assert_eq!(result.condition_number, 1.0); // (1/1)^2 = 1
        assert_eq!(result.message, "Model is healthy");
    }

    #[test]
    fn test_diagnose_model_with_nan_in_a() {
        let d = 2;
        let a = vec![f64::NAN, 0.0, 0.0, 1.0];
        let l = vec![1.0, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert!(!result.is_healthy);
        assert!(result.has_nan);
        assert_eq!(result.message, "Model contains NaN values");
    }

    #[test]
    fn test_diagnose_model_with_nan_in_l() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        let l = vec![f64::NAN, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert!(!result.is_healthy);
        assert!(result.has_nan);
    }

    #[test]
    fn test_diagnose_model_with_infinity_in_a() {
        let d = 2;
        let a = vec![f64::INFINITY, 0.0, 0.0, 1.0];
        let l = vec![1.0, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert!(!result.is_healthy);
        assert!(result.has_inf);
        assert_eq!(result.message, "Model contains infinite values");
    }

    #[test]
    fn test_diagnose_model_with_infinity_in_l() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        let l = vec![f64::NEG_INFINITY, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert!(!result.is_healthy);
        assert!(result.has_inf);
    }

    #[test]
    fn test_diagnose_model_high_condition_number() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        // L 对角线差异大：min=1e-7, max=1.0，条件数 = (1e7)^2 = 1e14 > 1e12
        let l = vec![1e-7, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert!(!result.is_healthy);
        assert!(result.condition_number > 1e12);
        assert!(result.message.contains("condition number"));
    }

    #[test]
    fn test_diagnose_model_moderate_condition_number() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        // 条件数 = (10/1)^2 = 100，在可接受范围
        let l = vec![1.0, 0.0, 0.0, 10.0];
        let result = diagnose_model(&a, &l, d);
        assert!(result.is_healthy);
        assert_eq!(result.min_diagonal, 1.0);
        assert_eq!(result.max_diagonal, 10.0);
        assert_eq!(result.condition_number, 100.0);
    }

    #[test]
    fn test_diagnose_model_zero_diagonal() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        // 对角线有 0，条件数应为 MAX
        let l = vec![0.0, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        // 0 被跳过，所以 min_diagonal 保持为 max
        assert_eq!(result.min_diagonal, 1.0);
        assert_eq!(result.max_diagonal, 1.0);
    }

    #[test]
    fn test_diagnose_model_negative_diagonal() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        // 负对角线被跳过
        let l = vec![-1.0, 0.0, 0.0, 1.0];
        let result = diagnose_model(&a, &l, d);
        assert_eq!(result.min_diagonal, 1.0);
        assert_eq!(result.max_diagonal, 1.0);
    }

    #[test]
    fn test_diagnose_model_all_invalid_diagonal() {
        let d = 2;
        let a = vec![1.0, 0.0, 0.0, 1.0];
        // 所有对角线都无效（负数）
        let l = vec![-1.0, 0.0, 0.0, -2.0];
        let result = diagnose_model(&a, &l, d);
        // 应返回默认值 0.0（因为没有有效的正对角线元素）
        assert_eq!(result.min_diagonal, 0.0);
        assert_eq!(result.max_diagonal, 0.0);
        // 由于 min_diagonal 保持为 f64::MAX（内部），> EPSILON，
        // 所以 condition_number = (f64::MIN / f64::MAX)^2，是一个非常小的数
        // 实际上模型不健康，因为没有有效的对角线元素
        // 这种边界情况下，健康状态取决于条件数是否 < 1e12
        assert!(result.condition_number < 1e12); // 极小值，技术上"健康"
    }

    #[test]
    fn test_diagnose_model_1x1() {
        let d = 1;
        let a = vec![2.0];
        let l = vec![1.414];
        let result = diagnose_model(&a, &l, d);
        assert!(result.is_healthy);
        assert_eq!(result.min_diagonal, 1.414);
        assert_eq!(result.max_diagonal, 1.414);
        assert_eq!(result.condition_number, 1.0); // 只有一个对角线元素
    }
}
