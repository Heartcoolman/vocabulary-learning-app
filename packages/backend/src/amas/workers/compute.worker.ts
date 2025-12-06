/**
 * AMAS Compute Worker - Worker 线程实现
 * 计算密集型任务处理器
 *
 * 核心功能:
 * - LinUCB 算法的矩阵运算
 * - 贝叶斯优化的高斯过程计算
 * - Cholesky 分解与更新
 *
 * 注意事项:
 * - 此文件在 Worker 线程中运行，无法访问主线程资源
 * - 使用纯计算逻辑，不依赖外部状态
 * - 所有数据通过序列化传递，使用 number[] 而非 Float32Array
 */

import type {
  ComputeTask,
  LinUCBSelectPayload,
  LinUCBSelectResult,
  LinUCBUpdatePayload,
  LinUCBUpdateResult,
  BayesianOptimizePayload,
  BayesianSuggestResult,
  CholeskyDecomposePayload,
  CholeskyDecomposeResult,
  CholeskyRank1UpdatePayload,
  CholeskyRank1UpdateResult,
} from './pool';

// ==================== 数值常量 ====================

/** 数值稳定性：最小正数 */
const EPSILON = 1e-10;

/** Cholesky 对角线最小值 */
const MIN_DIAG = 1e-6;

/** 数值稳定性：防溢出上限 */
const MAX_MAGNITUDE = 1e12;

// ==================== Worker 入口函数 ====================

/**
 * Worker 入口函数
 * Piscina 会调用此函数处理任务
 */
export default async function computeWorker(
  task: ComputeTask
): Promise<unknown> {
  switch (task.type) {
    case 'linucb_select':
      return computeLinUCBSelection(task.payload as LinUCBSelectPayload);

    case 'linucb_update':
      return computeLinUCBUpdate(task.payload as LinUCBUpdatePayload);

    case 'bayesian_suggest':
      return computeBayesianSuggest(task.payload as BayesianOptimizePayload);

    case 'bayesian_optimize':
      return computeBayesianSuggest(task.payload as BayesianOptimizePayload);

    case 'cholesky_decompose':
      return computeCholeskyDecomposition(task.payload as CholeskyDecomposePayload);

    case 'cholesky_rank1_update':
      return computeCholeskyRank1Update(task.payload as CholeskyRank1UpdatePayload);

    default:
      throw new Error(`Unknown task type: ${(task as { type: string }).type}`);
  }
}

// ==================== LinUCB 计算 ====================

/**
 * LinUCB 选择计算
 * 计算所有候选动作的 UCB 分数，返回最优动作
 *
 * UCB 公式: score = θ^T x + α * sqrt(x^T A^(-1) x)
 */
function computeLinUCBSelection(payload: LinUCBSelectPayload): LinUCBSelectResult {
  const { model, featureVectors } = payload;
  const { d, alpha, b, L } = model;

  // 转换为 Float64Array 进行高精度计算
  const L64 = new Float64Array(L);
  const b64 = new Float64Array(b);

  // 计算 θ = A^(-1) b = (LL^T)^(-1) b
  const theta = solveCholeskySystem(L64, b64, d);

  let bestIndex = 0;
  let bestScore = -Infinity;
  let bestConfidence = 0;
  let bestExploitation = 0;

  for (let i = 0; i < featureVectors.length; i++) {
    const x = new Float64Array(featureVectors[i]);

    // 利用项: θ^T x
    const exploitation = dotProduct(theta, x);

    // 置信度: sqrt(x^T A^(-1) x)
    const confidence = computeConfidenceWidth(L64, x, d);

    // UCB 分数
    const score = exploitation + alpha * confidence;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
      bestConfidence = confidence;
      bestExploitation = exploitation;
    }
  }

  return {
    bestIndex,
    score: bestScore,
    confidence: bestConfidence,
    exploitation: bestExploitation,
  };
}

/**
 * LinUCB 更新计算
 * 更新协方差矩阵 A 和向量 b，以及 Cholesky 因子 L
 *
 * 更新公式:
 * A' = A + x x^T
 * b' = b + r x
 */
function computeLinUCBUpdate(payload: LinUCBUpdatePayload): LinUCBUpdateResult {
  const { model, featureVector, reward } = payload;
  const { d, lambda } = model;

  // 转换输入
  const A = new Float64Array(model.A);
  const b = new Float64Array(model.b);
  const L = new Float64Array(model.L);
  const x = new Float64Array(featureVector);

  // 验证输入
  if (hasInvalidValues(x)) {
    return {
      A: Array.from(A),
      b: Array.from(b),
      L: Array.from(L),
      success: false,
    };
  }

  // A += x x^T
  addOuterProduct(A, x, d);

  // b += r * x
  addScaledVector(b, x, reward, d);

  // 尝试 Rank-1 增量更新 Cholesky 因子
  const updateResult = choleskyRank1Update(L, x, d, Math.max(lambda * 0.01, MIN_DIAG));

  let finalL: Float64Array;
  if (updateResult.success) {
    finalL = updateResult.L;
  } else {
    // 增量更新失败，回退到完整分解
    finalL = choleskyDecompose(A, d, lambda);
  }

  return {
    A: Array.from(A),
    b: Array.from(b),
    L: Array.from(finalL),
    success: true,
  };
}

// ==================== 贝叶斯优化计算 ====================

/**
 * 贝叶斯优化建议计算
 * 基于高斯过程和 UCB 采集函数建议下一个采样点
 */
function computeBayesianSuggest(payload: BayesianOptimizePayload): BayesianSuggestResult {
  const {
    observations,
    paramBounds,
    lengthScale,
    outputVariance,
    noiseVariance,
    beta,
  } = payload;

  const dim = paramBounds.length;
  const n = observations.length;

  // 如果没有足够观测，返回随机采样
  if (n < 2) {
    const nextPoint = paramBounds.map((bound) => {
      let value = bound.min + Math.random() * (bound.max - bound.min);
      if (bound.step) {
        value = Math.round((value - bound.min) / bound.step) * bound.step + bound.min;
      }
      return clamp(value, bound.min, bound.max);
    });
    return { nextPoint, acquisitionValue: 1.0 };
  }

  // 构建核矩阵 K + σ²I
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const kij = matern52Kernel(
        observations[i].params,
        observations[j].params,
        lengthScale,
        outputVariance
      );
      K[i * n + j] = kij;
      K[j * n + i] = kij;
    }
    // 添加噪声方差
    K[i * n + i] += noiseVariance + 1e-6;
  }

  // Cholesky 分解
  const L = choleskyDecomposeGP(K, n);

  // 计算 α = L^T \ (L \ y)
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = observations[i].value;
  }
  const z = solveTriangularLower(L, y, n);
  const alpha = solveTriangularUpper(L, z, n);

  // 最大化 UCB 采集函数
  let bestPoint = randomSample(paramBounds);
  let bestAcq = computeUCB(bestPoint, observations, L, alpha, lengthScale, outputVariance, beta, n);

  // 网格搜索 + 随机采样
  const gridSize = 5;
  const grid = generateGrid(paramBounds, gridSize);

  for (const point of grid) {
    const acq = computeUCB(point, observations, L, alpha, lengthScale, outputVariance, beta, n);
    if (acq > bestAcq) {
      bestAcq = acq;
      bestPoint = point;
    }
  }

  // 随机采样增强
  for (let i = 0; i < 50; i++) {
    const point = randomSample(paramBounds);
    const acq = computeUCB(point, observations, L, alpha, lengthScale, outputVariance, beta, n);
    if (acq > bestAcq) {
      bestAcq = acq;
      bestPoint = point;
    }
  }

  // 局部优化
  bestPoint = localOptimize(
    bestPoint,
    paramBounds,
    (x) => computeUCB(x, observations, L, alpha, lengthScale, outputVariance, beta, n)
  );

  // 离散化
  const discretizedPoint = bestPoint.map((value, i) => {
    const bound = paramBounds[i];
    if (bound.step) {
      value = Math.round((value - bound.min) / bound.step) * bound.step + bound.min;
    }
    return clamp(value, bound.min, bound.max);
  });

  return {
    nextPoint: discretizedPoint,
    acquisitionValue: bestAcq,
  };
}

/**
 * Matern 5/2 核函数
 */
function matern52Kernel(
  x1: number[],
  x2: number[],
  lengthScale: number[],
  outputVariance: number
): number {
  let r2 = 0;
  for (let i = 0; i < x1.length; i++) {
    const diff = (x1[i] - x2[i]) / lengthScale[i];
    r2 += diff * diff;
  }
  const r = Math.sqrt(r2);
  const sqrt5r = Math.sqrt(5) * r;

  return outputVariance * (1 + sqrt5r + (5 * r2) / 3) * Math.exp(-sqrt5r);
}

/**
 * 计算 UCB 采集函数值
 */
function computeUCB(
  x: number[],
  observations: Array<{ params: number[]; value: number }>,
  L: Float64Array,
  alpha: Float64Array,
  lengthScale: number[],
  outputVariance: number,
  beta: number,
  n: number
): number {
  // 计算 k*
  const kStar = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    kStar[i] = matern52Kernel(x, observations[i].params, lengthScale, outputVariance);
  }

  // 均值: μ = k*^T * α
  let mean = 0;
  for (let i = 0; i < n; i++) {
    mean += kStar[i] * alpha[i];
  }

  // 方差: σ² = k(x,x) - v^T * v, where L*v = k*
  const kxx = matern52Kernel(x, x, lengthScale, outputVariance);
  const v = solveTriangularLower(L, kStar, n);
  let vTv = 0;
  for (let i = 0; i < n; i++) {
    vTv += v[i] * v[i];
  }
  const variance = Math.max(EPSILON, kxx - vTv);

  return mean + beta * Math.sqrt(variance);
}

// ==================== Cholesky 分解计算 ====================

/**
 * Cholesky 分解计算
 */
function computeCholeskyDecomposition(
  payload: CholeskyDecomposePayload
): CholeskyDecomposeResult {
  const { matrix, d, lambda } = payload;
  const A = new Float64Array(matrix);
  const L = choleskyDecompose(A, d, lambda);

  return {
    L: Array.from(L),
    success: !hasInvalidValues64(L),
  };
}

/**
 * Cholesky Rank-1 更新计算
 */
function computeCholeskyRank1Update(
  payload: CholeskyRank1UpdatePayload
): CholeskyRank1UpdateResult {
  const { L: inputL, x: inputX, d, minDiag = MIN_DIAG } = payload;

  const L = new Float64Array(inputL);
  const x = new Float64Array(inputX);

  const result = choleskyRank1Update(L, x, d, minDiag);

  return {
    L: Array.from(result.L),
    success: result.success,
  };
}

// ==================== 矩阵/向量运算工具 ====================

/**
 * 完整 Cholesky 分解
 */
function choleskyDecompose(
  A: Float64Array,
  d: number,
  lambda: number
): Float64Array {
  const safeLambda = Math.max(lambda, MIN_DIAG);
  const L = new Float64Array(d * d);

  // 对称化处理
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      const avg = (A[i * d + j] + A[j * d + i]) / 2;
      A[i * d + j] = avg;
      A[j * d + i] = avg;
    }
  }

  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * d + j];

      for (let k = 0; k < j; k++) {
        sum -= L[i * d + k] * L[j * d + k];
      }

      if (i === j) {
        if (sum <= EPSILON || !Number.isFinite(sum)) {
          sum = safeLambda + EPSILON;
        }
        L[i * d + j] = Math.sqrt(Math.min(Math.max(sum, EPSILON), MAX_MAGNITUDE));
      } else {
        const denom = Math.max(L[j * d + j], Math.sqrt(safeLambda));
        L[i * d + j] = sum / denom;
      }
    }
  }

  return L;
}

/**
 * Cholesky 分解（用于 GP，无正则化回退）
 */
function choleskyDecomposeGP(K: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = K[i * n + j];

      for (let k = 0; k < j; k++) {
        sum -= L[i * n + k] * L[j * n + k];
      }

      if (i === j) {
        L[i * n + j] = Math.sqrt(Math.max(EPSILON, sum));
      } else {
        L[i * n + j] = sum / Math.max(L[j * n + j], EPSILON);
      }
    }
  }

  return L;
}

/**
 * Cholesky Rank-1 增量更新
 */
function choleskyRank1Update(
  L: Float64Array,
  x: Float64Array,
  d: number,
  minDiag: number
): { L: Float64Array; success: boolean } {
  const safeMinDiag = Math.max(minDiag, MIN_DIAG);
  const next = new Float64Array(L);
  const w = new Float64Array(x);

  for (let k = 0; k < d; k++) {
    const Lkk = next[k * d + k];
    const xk = w[k];

    if (!Number.isFinite(Lkk) || Lkk < safeMinDiag || Math.abs(Lkk) > MAX_MAGNITUDE) {
      return { L: new Float64Array(L), success: false };
    }

    const r = Math.hypot(Lkk, xk);

    if (!Number.isFinite(r) || r < safeMinDiag || r > MAX_MAGNITUDE) {
      return { L: new Float64Array(L), success: false };
    }

    const c = r / Lkk;
    const s = xk / Lkk;

    if (!Number.isFinite(c) || !Number.isFinite(s) || Math.abs(c) < EPSILON) {
      return { L: new Float64Array(L), success: false };
    }

    next[k * d + k] = r;

    for (let i = k + 1; i < d; i++) {
      const Lik = next[i * d + k];
      const xi = w[i];

      const updatedLik = (Lik + s * xi) / c;
      const updatedXi = c * xi - s * Lik;

      if (
        !Number.isFinite(updatedLik) ||
        !Number.isFinite(updatedXi) ||
        Math.abs(updatedLik) > MAX_MAGNITUDE ||
        Math.abs(updatedXi) > MAX_MAGNITUDE
      ) {
        return { L: new Float64Array(L), success: false };
      }

      next[i * d + k] = updatedLik;
      w[i] = updatedXi;
    }
  }

  // 最终验证
  for (let i = 0; i < d; i++) {
    const diag = next[i * d + i];
    if (!Number.isFinite(diag) || diag < safeMinDiag || Math.abs(diag) > MAX_MAGNITUDE) {
      return { L: new Float64Array(L), success: false };
    }
  }

  return { L: next, success: true };
}

/**
 * 解 Cholesky 系统 (LL^T)x = b
 */
function solveCholeskySystem(
  L: Float64Array,
  b: Float64Array,
  d: number
): Float64Array {
  // Forward substitution: Ly = b
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i * d + j] * y[j];
    }
    y[i] = sum / Math.max(L[i * d + i], EPSILON);
  }

  // Backward substitution: L^T x = y
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < d; j++) {
      sum -= L[j * d + i] * x[j];
    }
    x[i] = sum / Math.max(L[i * d + i], EPSILON);
  }

  return x;
}

/**
 * 解下三角系统 Lx = b
 */
function solveTriangularLower(
  L: Float64Array,
  b: Float64Array,
  n: number
): Float64Array {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i * n + j] * x[j];
    }
    x[i] = sum / Math.max(L[i * n + i], EPSILON);
  }
  return x;
}

/**
 * 解上三角系统 L^T x = b
 */
function solveTriangularUpper(
  L: Float64Array,
  b: Float64Array,
  n: number
): Float64Array {
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= L[j * n + i] * x[j];
    }
    x[i] = sum / Math.max(L[i * n + i], EPSILON);
  }
  return x;
}

/**
 * 计算置信宽度 sqrt(x^T A^(-1) x)
 */
function computeConfidenceWidth(
  L: Float64Array,
  x: Float64Array,
  d: number
): number {
  // Forward substitution: Ly = x
  const y = new Float64Array(d);
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

/**
 * 矩阵外积更新: A += x x^T
 */
function addOuterProduct(A: Float64Array, x: Float64Array, d: number): void {
  for (let i = 0; i < d; i++) {
    const xi = x[i];
    for (let j = 0; j < d; j++) {
      A[i * d + j] += xi * x[j];
    }
  }
}

/**
 * 向量加权更新: b += r * x
 */
function addScaledVector(b: Float64Array, x: Float64Array, r: number, d: number): void {
  for (let i = 0; i < d; i++) {
    b[i] += r * x[i];
  }
}

/**
 * 点积
 */
function dotProduct(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * 检查 Float64Array 中是否有无效值
 */
function hasInvalidValues64(arr: Float64Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      return true;
    }
  }
  return false;
}

/**
 * 检查数组中是否有无效值
 */
function hasInvalidValues(arr: Float64Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      return true;
    }
  }
  return false;
}

/**
 * 数值截断
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 随机采样
 */
function randomSample(
  paramBounds: Array<{ min: number; max: number; step?: number }>
): number[] {
  return paramBounds.map((bound) => {
    let value = bound.min + Math.random() * (bound.max - bound.min);
    if (bound.step) {
      value = Math.round((value - bound.min) / bound.step) * bound.step + bound.min;
    }
    return clamp(value, bound.min, bound.max);
  });
}

/**
 * 生成网格点
 */
function generateGrid(
  paramBounds: Array<{ min: number; max: number; step?: number }>,
  size: number
): number[][] {
  const grid: number[][] = [];
  const dim = paramBounds.length;

  const generateRecursive = (d: number, current: number[]): void => {
    if (d === dim) {
      grid.push([...current]);
      return;
    }

    const bound = paramBounds[d];
    for (let i = 0; i < size; i++) {
      const value = bound.min + ((bound.max - bound.min) * i) / (size - 1);
      current.push(value);
      generateRecursive(d + 1, current);
      current.pop();
    }
  };

  generateRecursive(0, []);
  return grid;
}

/**
 * 简单局部优化（坐标下降）
 */
function localOptimize(
  x0: number[],
  paramBounds: Array<{ min: number; max: number; step?: number }>,
  objective: (x: number[]) => number
): number[] {
  const x = [...x0];
  const dim = paramBounds.length;
  const stepSizes = paramBounds.map((b) => (b.max - b.min) / 20);
  let improved = true;
  let iterations = 0;

  while (improved && iterations < 10) {
    improved = false;
    iterations += 1;

    for (let d = 0; d < dim; d++) {
      const current = x[d];
      const currentObj = objective(x);

      // 尝试向上
      x[d] = clamp(current + stepSizes[d], paramBounds[d].min, paramBounds[d].max);
      const upObj = objective(x);

      // 尝试向下
      x[d] = clamp(current - stepSizes[d], paramBounds[d].min, paramBounds[d].max);
      const downObj = objective(x);

      // 选择最优方向
      if (upObj > currentObj && upObj >= downObj) {
        x[d] = clamp(current + stepSizes[d], paramBounds[d].min, paramBounds[d].max);
        improved = true;
      } else if (downObj > currentObj) {
        // x[d] 已经是向下的值
        improved = true;
      } else {
        x[d] = current;
      }
    }

    // 减小步长
    for (let d = 0; d < dim; d++) {
      stepSizes[d] *= 0.8;
    }
  }

  return x;
}
