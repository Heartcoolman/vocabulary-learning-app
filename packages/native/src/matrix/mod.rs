use crate::types::{EPSILON, MIN_LAMBDA, MIN_RANK1_DIAG};

/// Cholesky 分解 - 将正定矩阵 A 分解为 L * L^T
/// 参考: packages/backend/src/amas/learning/math-utils.ts 第 179-235 行
pub fn cholesky_decompose(a: &[f64], d: usize, lambda: f64) -> Vec<f64> {
    let safe_lambda = lambda.max(MIN_LAMBDA);
    let mut l = vec![0.0; d * d];

    // 复制 A 到工作矩阵（添加正则化）
    let mut work = a.to_vec();
    for i in 0..d {
        work[i * d + i] += safe_lambda * EPSILON; // 微小正则化
    }

    for i in 0..d {
        for j in 0..=i {
            let mut sum = work[i * d + j];

            for k in 0..j {
                sum -= l[i * d + k] * l[j * d + k];
            }

            if i == j {
                // 对角线元素
                if sum <= 0.0 {
                    // 数值修复：使用最小值
                    l[i * d + i] = safe_lambda.sqrt();
                } else {
                    l[i * d + i] = sum.sqrt();
                }
            } else {
                // 非对角线元素
                let diag = l[j * d + j];
                if diag.abs() > EPSILON {
                    l[i * d + j] = sum / diag;
                } else {
                    l[i * d + j] = 0.0;
                }
            }
        }
    }

    l
}

/// Cholesky Rank-1 更新 - 使用 Givens 旋转
/// L_new * L_new^T = L * L^T + x * x^T
/// 参考: packages/backend/src/amas/learning/math-utils.ts 第 59-166 行
///
/// 返回 true 如果更新成功，false 如果需要完整重算
pub fn cholesky_rank1_update(l: &mut [f64], x: &[f64], d: usize, min_diag: f64) -> bool {
    let safe_min_diag = min_diag.max(MIN_RANK1_DIAG);
    let mut x_work = x.to_vec();

    for k in 0..d {
        let l_kk = l[k * d + k];
        let x_k = x_work[k];

        // 计算 Givens 旋转参数
        let r = (l_kk * l_kk + x_k * x_k).sqrt();

        if r < safe_min_diag {
            // 数值不稳定，需要完整重算
            return false;
        }

        let c = l_kk / r; // cos
        let s = x_k / r; // sin

        // 更新 L[k,k]
        l[k * d + k] = r;

        // 更新 L[i,k] 和 x_work[i] for i > k
        for i in (k + 1)..d {
            let l_ik = l[i * d + k];
            let x_i = x_work[i];

            l[i * d + k] = c * l_ik + s * x_i;
            x_work[i] = -s * l_ik + c * x_i;
        }
    }

    // 检查对角线元素
    for i in 0..d {
        if l[i * d + i] < safe_min_diag || l[i * d + i].is_nan() {
            return false;
        }
    }

    true
}

/// 使用 Cholesky 分解求解线性系统 A * x = b
/// 其中 A = L * L^T
/// 参考: packages/backend/src/amas/learning/math-utils.ts 第 251-290 行
pub fn solve_cholesky(l: &[f64], b: &[f64], d: usize) -> Vec<f64> {
    // 1. 前向替换: L * y = b
    let y = solve_triangular_lower(l, b, d);

    // 2. 后向替换: L^T * x = y
    solve_triangular_upper_transpose(l, &y, d)
}

/// 求解下三角系统 L * x = b (前向替换)
pub fn solve_triangular_lower(l: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut x = vec![0.0; n];

    for i in 0..n {
        let mut sum = b[i];
        for j in 0..i {
            sum -= l[i * n + j] * x[j];
        }

        let diag = l[i * n + i];
        if diag.abs() > EPSILON {
            x[i] = sum / diag;
        } else {
            x[i] = 0.0;
        }
    }

    x
}

/// 求解上三角系统 L^T * x = b (后向替换)
fn solve_triangular_upper_transpose(l: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut x = vec![0.0; n];

    for i in (0..n).rev() {
        let mut sum = b[i];
        for j in (i + 1)..n {
            // L^T[i,j] = L[j,i]
            sum -= l[j * n + i] * x[j];
        }

        let diag = l[i * n + i];
        if diag.abs() > EPSILON {
            x[i] = sum / diag;
        } else {
            x[i] = 0.0;
        }
    }

    x
}

/// 计算 x^T * A^{-1} * x 用于 UCB 置信区间
/// 使用 Cholesky 分解: A = L * L^T, 所以 A^{-1} = L^{-T} * L^{-1}
/// x^T * A^{-1} * x = ||L^{-1} * x||^2
pub fn compute_quadratic_form(l: &[f64], x: &[f64], d: usize) -> f64 {
    let z = solve_triangular_lower(l, x, d);
    z.iter().map(|&v| v * v).sum()
}

/// 矩阵向量乘法 (行优先存储)
pub fn mat_vec_mul(a: &[f64], x: &[f64], d: usize) -> Vec<f64> {
    let mut result = vec![0.0; d];
    for i in 0..d {
        for j in 0..d {
            result[i] += a[i * d + j] * x[j];
        }
    }
    result
}

/// 向量点积
pub fn dot_product(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(&x, &y)| x * y).sum()
}

/// 外积更新: A += x * x^T
pub fn rank1_update_matrix(a: &mut [f64], x: &[f64], d: usize) {
    for i in 0..d {
        for j in 0..d {
            a[i * d + j] += x[i] * x[j];
        }
    }
}

/// 向量加法: a += scale * b
pub fn vec_add_scaled(a: &mut [f64], b: &[f64], scale: f64) {
    for (ai, &bi) in a.iter_mut().zip(b.iter()) {
        *ai += scale * bi;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cholesky_identity() {
        let d = 3;
        let lambda = 1.0;
        let a = vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

        let l = cholesky_decompose(&a, d, lambda);

        // L 应该接近单位矩阵
        for i in 0..d {
            assert!((l[i * d + i] - 1.0).abs() < 0.01);
        }
    }

    #[test]
    fn test_solve_cholesky() {
        let d = 2;
        // A = [[2, 1], [1, 2]]
        let a = vec![2.0, 1.0, 1.0, 2.0];
        let b = vec![1.0, 2.0];

        let l = cholesky_decompose(&a, d, 0.0);
        let x = solve_cholesky(&l, &b, d);

        // 验证 A * x ≈ b
        let ax = mat_vec_mul(&a, &x, d);
        for i in 0..d {
            assert!((ax[i] - b[i]).abs() < 1e-6);
        }
    }

    #[test]
    fn test_cholesky_rank1_update() {
        let d = 2;
        // 初始 L (单位矩阵的 Cholesky)
        let mut l = vec![1.0, 0.0, 0.0, 1.0];
        let x = vec![0.5, 0.5];

        let success = cholesky_rank1_update(&mut l, &x, d, MIN_RANK1_DIAG);
        assert!(success);

        // 验证 L * L^T = I + x * x^T
        // L * L^T 应该是 [[1.25, 0.25], [0.25, 1.25]]
        let expected_diag = (1.0 + 0.5 * 0.5_f64).sqrt();
        assert!((l[0] - expected_diag).abs() < 0.01);
    }

    #[test]
    fn test_dot_product() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![4.0, 5.0, 6.0];
        let result = dot_product(&a, &b);
        assert!((result - 32.0).abs() < 1e-10);
    }

    #[test]
    fn test_mat_vec_mul() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let x = vec![1.0, 2.0];
        let result = mat_vec_mul(&a, &x, 2);
        assert!((result[0] - 5.0).abs() < 1e-10);
        assert!((result[1] - 11.0).abs() < 1e-10);
    }

    #[test]
    fn test_compute_quadratic_form() {
        let d = 2;
        // L = I (单位矩阵)
        let l = vec![1.0, 0.0, 0.0, 1.0];
        let x = vec![3.0, 4.0];

        // x^T * I^{-1} * x = x^T * x = 9 + 16 = 25
        let result = compute_quadratic_form(&l, &x, d);
        assert!((result - 25.0).abs() < 1e-10);
    }
}
