/**
 * AMAS Learning Layer - Math Utilities
 * 数学工具函数库
 *
 * 核心功能:
 * - Cholesky Rank-1 增量更新 (O(d²) vs O(d³))
 * - 数值稳定的线性代数操作
 * - 向量/矩阵工具函数
 *
 * 数学背景:
 * LinUCB算法需要维护协方差矩阵A及其Cholesky分解L
 * 每次更新: A' = A + xx^T
 * 传统方法: 重新计算L' = cholesky(A') 需要O(d³)
 * 增量方法: 直接更新L' from L 只需O(d²)
 */

// ==================== 常量 ====================

/** 数值稳定性：最小正数 */
const EPSILON = 1e-10;

/** Cholesky对角线最小值（防止奇异） */
const MIN_DIAG = 1e-6;

/** 数值稳定性：防溢出上限（保护Cholesky步骤） */
const MAX_MAGNITUDE = 1e12;

// ==================== Cholesky相关 ====================

/**
 * Cholesky Rank-1 增量更新结果
 */
export interface Rank1UpdateResult {
  /** 更新后的L矩阵 */
  L: Float32Array;
  /** 更新是否成功 */
  success: boolean;
}

/**
 * Cholesky Rank-1 增量更新
 *
 * 当 A' = A + xx^T 时，增量更新L使得 L'L'^T = A'
 * 复杂度: O(d²) vs 完整分解的O(d³)
 *
 * 算法参考: Gill, Golub, Murray, and Saunders (1974)
 * "Methods for Modifying Matrix Factorizations"
 *
 * @param L 现有Cholesky因子 (d×d, 下三角存储, 行优先)
 * @param x 增量向量 (d维)
 * @param d 维度
 * @param minDiag 对角线最小值（默认1e-6）
 * @returns 包含更新后L矩阵和成功标志的结果对象
 */
export function choleskyRank1Update(
  L: Float32Array,
  x: Float32Array,
  d: number,
  minDiag = MIN_DIAG
): Rank1UpdateResult {
  const safeMinDiag = Math.max(minDiag, MIN_DIAG);

  // 输入验证
  if (
    !Number.isFinite(d) ||
    d <= 0 ||
    !L ||
    !x ||
    L.length < d * d ||
    x.length < d
  ) {
    console.warn('[math-utils] choleskyRank1Update: 无效输入');
    return { L: new Float32Array(L ?? []), success: false };
  }

  // 创建工作副本（避免修改原始数据）
  const next = new Float32Array(L);
  const w = new Float32Array(d);

  // 复制并验证x向量
  for (let i = 0; i < d; i++) {
    const xi = x[i];
    w[i] = Number.isFinite(xi) ? xi : 0;
  }

  // Rank-1更新主循环
  for (let k = 0; k < d; k++) {
    const Lkk = next[k * d + k];
    const xk = w[k];

    // 检查当前对角元素有效性
    if (
      !Number.isFinite(Lkk) ||
      Lkk < safeMinDiag ||
      Math.abs(Lkk) > MAX_MAGNITUDE
    ) {
      console.warn(`[math-utils] 对角元素无效: L[${k},${k}]=${Lkk}`);
      return { L: new Float32Array(L), success: false };
    }

    // 计算新的对角元素: r = sqrt(Lkk² + xk²)
    // 使用 hypot 避免在大幅度下发生溢出
    const r = Math.hypot(Lkk, xk);

    if (!Number.isFinite(r) || r < safeMinDiag || r > MAX_MAGNITUDE) {
      console.warn(`[math-utils] 新对角元素无效: r=${r}`);
      return { L: new Float32Array(L), success: false };
    }

    // Givens旋转参数
    const c = r / Lkk;  // cos-like
    const s = xk / Lkk; // sin-like

    if (!Number.isFinite(c) || !Number.isFinite(s) || Math.abs(c) < EPSILON) {
      console.warn('[math-utils] Givens旋转参数无效');
      return { L: new Float32Array(L), success: false };
    }

    // 更新对角元素
    next[k * d + k] = r;

    // 更新第k列下方的元素
    for (let i = k + 1; i < d; i++) {
      const Lik = next[i * d + k];
      const xi = w[i];

      // 应用Givens旋转
      const updatedLik = (Lik + s * xi) / c;
      const updatedXi = c * xi - s * Lik;

      // 数值检查
      if (
        !Number.isFinite(updatedLik) ||
        !Number.isFinite(updatedXi) ||
        Math.abs(updatedLik) > MAX_MAGNITUDE ||
        Math.abs(updatedXi) > MAX_MAGNITUDE
      ) {
        console.warn(`[math-utils] 更新产生无效值: L[${i},${k}]=${updatedLik}`);
        return { L: new Float32Array(L), success: false };
      }

      next[i * d + k] = updatedLik;
      w[i] = updatedXi;
    }
  }

  // 最终对角线完整性检查
  for (let i = 0; i < d; i++) {
    const diag = next[i * d + i];
    if (
      !Number.isFinite(diag) ||
      diag < safeMinDiag ||
      Math.abs(diag) > MAX_MAGNITUDE
    ) {
      console.warn(`[math-utils] 最终对角元素无效: L[${i},${i}]=${diag}`);
      return { L: new Float32Array(L), success: false };
    }
  }

  return { L: next, success: true };
}

/**
 * 完整Cholesky分解 (用于初始化或回退)
 *
 * 分解: A = LL^T，其中L是下三角矩阵
 *
 * @param A 对称正定矩阵 (d×d, 行优先存储)
 * @param d 维度
 * @param lambda 正则化系数（用于处理非SPD情况）
 * @returns Cholesky因子L
 */
export function choleskyDecompose(
  A: Float32Array,
  d: number,
  lambda = 1.0
): Float32Array {
  const safeLambda = Math.max(lambda, MIN_DIAG);

  if (!A || A.length < d * d || d <= 0) {
    return initIdentityMatrix(d, safeLambda);
  }

  // 复制并对称化
  const matrix = new Float32Array(A);
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      const avg = (matrix[i * d + j] + matrix[j * d + i]) / 2;
      matrix[i * d + j] = avg;
      matrix[j * d + i] = avg;
    }
  }

  const L = new Float32Array(d * d);

  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i * d + j];

      for (let k = 0; k < j; k++) {
        sum -= L[i * d + k] * L[j * d + k];
      }

      if (i === j) {
        // 对角元素
        if (sum <= EPSILON || !Number.isFinite(sum)) {
          // 使用正则化修复
          sum = safeLambda + EPSILON;
        }
        L[i * d + j] = Math.sqrt(Math.min(Math.max(sum, EPSILON), MAX_MAGNITUDE));
      } else {
        // 非对角元素
        const denom = Math.max(L[j * d + j], Math.sqrt(safeLambda));
        L[i * d + j] = sum / denom;
      }
    }
  }

  // 验证结果
  for (let i = 0; i < L.length; i++) {
    if (!Number.isFinite(L[i]) || Math.abs(L[i]) > MAX_MAGNITUDE) {
      console.warn('[math-utils] Cholesky分解失败，返回正则化单位矩阵');
      return initIdentityMatrix(d, safeLambda);
    }
  }

  return L;
}

/**
 * 解线性方程组 Ax = b (使用Cholesky分解)
 *
 * 给定L使得A = LL^T，求解x:
 * 1. Forward substitution: Ly = b
 * 2. Backward substitution: L^T x = y
 *
 * @param L Cholesky因子 (d×d)
 * @param b 右侧向量 (d维)
 * @param d 维度
 * @returns 解向量x
 */
export function solveCholesky(
  L: Float32Array,
  b: Float32Array,
  d: number
): Float32Array {
  const y = new Float32Array(d);
  const x = new Float32Array(d);

  // Forward substitution: Ly = b
  for (let i = 0; i < d; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i * d + j] * y[j];
    }
    y[i] = sum / Math.max(L[i * d + i], EPSILON);
  }

  // Backward substitution: L^T x = y
  for (let i = d - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < d; j++) {
      sum -= L[j * d + i] * x[j];
    }
    x[i] = sum / Math.max(L[i * d + i], EPSILON);
  }

  // 验证结果
  for (let i = 0; i < d; i++) {
    if (!Number.isFinite(x[i])) {
      console.warn('[math-utils] 求解失败，返回零向量');
      return new Float32Array(d);
    }
  }

  return x;
}

/**
 * 计算 sqrt(x^T A^(-1) x) (用于UCB置信区间)
 *
 * 使用Cholesky因子高效计算，避免显式求逆
 *
 * @param L Cholesky因子
 * @param x 向量
 * @param d 维度
 * @returns 置信宽度
 */
export function computeConfidenceWidth(
  L: Float32Array,
  x: Float32Array,
  d: number
): number {
  const y = new Float32Array(d);

  // Forward substitution: Ly = x
  for (let i = 0; i < d; i++) {
    let sum = x[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i * d + j] * y[j];
    }
    y[i] = sum / Math.max(L[i * d + i], EPSILON);
  }

  // ||y||^2 = x^T A^(-1) x
  let normSq = 0;
  for (let i = 0; i < d; i++) {
    normSq += y[i] * y[i];
  }

  const result = Math.sqrt(normSq);
  return Number.isFinite(result) ? result : 0;
}

// ==================== 矩阵工具 ====================

/**
 * 初始化正则化单位矩阵 (I * lambda)
 *
 * @param d 维度
 * @param lambda 正则化系数
 */
export function initIdentityMatrix(d: number, lambda: number): Float32Array {
  const I = new Float32Array(d * d);
  for (let i = 0; i < d; i++) {
    I[i * d + i] = lambda;
  }
  return I;
}

/**
 * 矩阵外积更新: A += x * x^T
 *
 * @param A 目标矩阵 (d×d, 就地修改)
 * @param x 向量 (d维)
 * @param d 维度
 */
export function addOuterProduct(
  A: Float32Array,
  x: Float32Array,
  d: number
): void {
  for (let i = 0; i < d; i++) {
    const xi = x[i];
    for (let j = 0; j < d; j++) {
      A[i * d + j] += xi * x[j];
    }
  }
}

/**
 * 向量加权更新: b += r * x
 *
 * @param b 目标向量 (就地修改)
 * @param x 源向量
 * @param r 权重
 * @param d 维度
 */
export function addScaledVector(
  b: Float32Array,
  x: Float32Array,
  r: number,
  d: number
): void {
  for (let i = 0; i < d; i++) {
    b[i] += r * x[i];
  }
}

// ==================== 向量工具 ====================

/**
 * 点积
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * 向量L2范数
 */
export function vectorNorm(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i] * x[i];
  }
  return Math.sqrt(sum);
}

/**
 * 向量归一化
 */
export function normalizeVector(x: Float32Array): Float32Array {
  const norm = vectorNorm(x);
  if (norm < EPSILON) {
    return new Float32Array(x.length);
  }
  const result = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    result[i] = x[i] / norm;
  }
  return result;
}

/**
 * 数值截断
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 检查数组中是否有无效值
 */
export function hasInvalidValues(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      return true;
    }
  }
  return false;
}
