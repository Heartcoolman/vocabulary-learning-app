use crate::types::{
    DiagnosticResult, EPSILON, MAX_COVARIANCE, MAX_FEATURE_ABS, MIN_LAMBDA, MIN_RANK1_DIAG,
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
        } else if *val > MAX_FEATURE_ABS {
            *val = MAX_FEATURE_ABS;
        } else if *val < -MAX_FEATURE_ABS {
            *val = -MAX_FEATURE_ABS;
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
    // 每 100 次更新强制重算
    if update_count % 100 == 0 {
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

    #[test]
    fn test_has_invalid_values() {
        assert!(!has_invalid_values(&[1.0, 2.0, 3.0]));
        assert!(has_invalid_values(&[1.0, f64::NAN, 3.0]));
        assert!(has_invalid_values(&[1.0, f64::INFINITY, 3.0]));
    }

    #[test]
    fn test_sanitize_feature_vector() {
        let mut x = vec![1.0, f64::NAN, 100.0, -100.0];
        sanitize_feature_vector(&mut x);
        assert_eq!(x[0], 1.0);
        assert_eq!(x[1], 0.0);
        assert_eq!(x[2], MAX_FEATURE_ABS);
        assert_eq!(x[3], -MAX_FEATURE_ABS);
    }
}
