/**
 * AMAS Optimization Layer - Bayesian Hyperparameter Optimizer
 * 贝叶斯超参数优化器
 *
 * 核心设计:
 * - 高斯过程（GP）建模目标函数
 * - 支持GP-UCB和Expected Improvement (EI)两种采集函数
 * - 支持4维参数空间优化
 *
 * 采集函数:
 * - UCB: μ(x) + β * σ(x)  (探索-利用平衡由β控制)
 * - EI: E[max(f(x) - f*, 0)]
 *
 * 算法流程:
 * 1. 初始化：随机采样建立先验
 * 2. 循环：
 *    a. 用GP拟合已有观测
 *    b. 计算采集函数最大化点
 *    c. 评估该点
 *    d. 加入观测集
 *
 * 核函数: Matern 5/2
 * K(x, x') = σ² * (1 + √5*r + 5r²/3) * exp(-√5*r)
 * 其中 r = ||x - x'|| / l
 */

// ==================== 类型定义 ====================

/**
 * 参数边界定义
 */
export interface ParamBound {
  /** 参数名称 */
  name: string;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 离散步长（可选） */
  step?: number;
}

/**
 * 采集函数类型
 */
export type AcquisitionType = 'ucb' | 'ei';

/**
 * 优化器配置
 */
export interface BayesianOptimizerConfig {
  /** 参数空间定义（可选，默认使用AMAS超参数空间） */
  paramSpace?: ParamBound[];
  /** 采集函数类型（默认ucb） */
  acquisitionType?: AcquisitionType;
  /** UCB探索系数 β */
  beta?: number;
  /** 核函数长度尺度（每维一个） */
  lengthScale?: number[];
  /** 输出方差 σ² */
  outputVariance?: number;
  /** 噪声方差 */
  noiseVariance?: number;
  /** 最大评估次数 */
  maxEvaluations?: number;
  /** 初始随机采样数 */
  initialSamples?: number;
  /** 数值稳定性抖动 */
  jitter?: number;
}

/**
 * 观测记录
 */
export interface Observation {
  /** 参数值 */
  params: number[];
  /** 观测值 */
  value: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 后验分布
 */
export interface Posterior {
  /** 均值 */
  mean: number;
  /** 标准差 */
  std: number;
  /** 方差 */
  variance: number;
}

/**
 * 优化器状态（持久化）
 */
export interface BayesianOptimizerState {
  /** 版本号 */
  version: string;
  /** 观测历史 */
  observations: Observation[];
  /** 当前最优 */
  best: { params: number[]; value: number } | null;
  /** 评估计数 */
  evaluationCount: number;
}

// ==================== 常量 ====================

/** 默认参数空间（AMAS超参数） */
const DEFAULT_PARAM_SPACE: ParamBound[] = [
  { name: 'alpha', min: 0.3, max: 2.0, step: 0.1 },
  { name: 'fatigueK', min: 0.02, max: 0.2, step: 0.01 },
  { name: 'motivationRho', min: 0.6, max: 0.95, step: 0.05 },
  { name: 'optimalDifficulty', min: 0.2, max: 0.8, step: 0.1 }
];

/** 数值稳定性 */
const EPSILON = 1e-10;

/** 标准正态分布CDF近似系数 */
const NORM_CDF_A1 = 0.254829592;
const NORM_CDF_A2 = -0.284496736;
const NORM_CDF_A3 = 1.421413741;
const NORM_CDF_A4 = -1.453152027;
const NORM_CDF_A5 = 1.061405429;
const NORM_CDF_P = 0.3275911;

// ==================== 实现 ====================

/**
 * 贝叶斯超参数优化器
 *
 * 适用场景:
 * - 超参数自动调优
 * - 黑盒函数优化
 * - 样本有限的优化问题
 */
export class BayesianOptimizer {
  private static readonly VERSION = '1.0.0';

  /** 参数空间 */
  private readonly paramSpace: ParamBound[];

  /** 维度 */
  private readonly dim: number;

  /** 采集函数类型 */
  private readonly acquisitionType: AcquisitionType;

  /** UCB探索系数 */
  private readonly beta: number;

  /** 核函数长度尺度 */
  private readonly lengthScale: number[];

  /** 输出方差 */
  private readonly outputVariance: number;

  /** 噪声方差 */
  private readonly noiseVariance: number;

  /** 数值稳定性抖动 */
  private readonly jitter: number;

  /** 最大评估次数 */
  private readonly maxEvaluations: number;

  /** 初始随机采样数 */
  private readonly initialSamples: number;

  /** 观测历史 */
  private observations: Observation[] = [];

  /** 当前最优 */
  private best: { params: number[]; value: number } | null = null;

  /** 评估计数 */
  private evaluationCount = 0;

  /** 缓存的Cholesky分解 */
  private cachedL: Float64Array | null = null;

  /** 缓存的alpha向量 */
  private cachedAlpha: Float64Array | null = null;

  constructor(config: BayesianOptimizerConfig = {}) {
    this.paramSpace = config.paramSpace ?? DEFAULT_PARAM_SPACE;
    this.dim = this.paramSpace.length;
    this.acquisitionType = config.acquisitionType ?? 'ucb';
    this.beta = config.beta ?? 2.0;
    this.outputVariance = config.outputVariance ?? 1.0;
    this.noiseVariance = config.noiseVariance ?? 0.1;
    this.jitter = config.jitter ?? 1e-6;
    this.maxEvaluations = config.maxEvaluations ?? 50;
    this.initialSamples = config.initialSamples ?? 5;

    // 默认长度尺度为参数范围的1/4
    this.lengthScale =
      config.lengthScale ??
      this.paramSpace.map(p => (p.max - p.min) / 4);
  }

  // ==================== 核心API ====================

  /**
   * 建议下一个采样点
   *
   * @returns 参数值数组
   */
  suggestNext(): number[] {
    // 初始阶段：随机采样
    if (this.observations.length < this.initialSamples) {
      return this.randomSample();
    }

    // 更新GP缓存
    this.updateGPCache();

    // 最大化采集函数
    return this.maximizeAcquisition();
  }

  /**
   * 记录评估结果
   *
   * @param params 参数值
   * @param value 目标函数值（越大越好）
   */
  recordEvaluation(params: number[], value: number): void {
    if (params.length !== this.dim) {
      throw new Error(
        `[BayesianOptimizer] 参数维度不匹配: ${params.length} vs ${this.dim}`
      );
    }

    const observation: Observation = {
      params: [...params],
      value,
      timestamp: Date.now()
    };

    this.observations.push(observation);
    this.evaluationCount += 1;

    // 更新最优
    if (!this.best || value > this.best.value) {
      this.best = { params: [...params], value };
    }

    // 清除缓存
    this.cachedL = null;
    this.cachedAlpha = null;
  }

  /**
   * 获取当前最优参数
   */
  getBest(): { params: number[]; value: number } | null {
    return this.best ? { params: [...this.best.params], value: this.best.value } : null;
  }

  /**
   * 获取后验分布
   *
   * @param x 查询点
   * @returns 均值和标准差
   */
  getPosterior(x: number[]): Posterior {
    if (this.observations.length === 0) {
      return {
        mean: 0,
        std: Math.sqrt(this.outputVariance),
        variance: this.outputVariance
      };
    }

    this.updateGPCache();

    const n = this.observations.length;
    const kStar = new Float64Array(n);

    // 计算k*
    for (let i = 0; i < n; i++) {
      kStar[i] = this.kernel(x, this.observations[i].params);
    }

    // 均值: μ = k*^T * α
    let mean = 0;
    for (let i = 0; i < n; i++) {
      mean += kStar[i] * this.cachedAlpha![i];
    }

    // 方差: σ² = k(x,x) - v^T * v, where L*v = k*
    const kxx = this.kernel(x, x);
    const v = this.solveTriangular(this.cachedL!, kStar, n, false);
    let vTv = 0;
    for (let i = 0; i < n; i++) {
      vTv += v[i] * v[i];
    }
    const variance = Math.max(EPSILON, kxx - vTv);

    return {
      mean,
      std: Math.sqrt(variance),
      variance
    };
  }

  /**
   * 计算采集函数值
   *
   * @param x 查询点
   * @returns 采集函数值
   */
  computeAcquisition(x: number[]): number {
    if (this.acquisitionType === 'ucb') {
      return this.computeUCB(x);
    }
    return this.computeEI(x);
  }

  /**
   * 计算GP-UCB采集函数
   * UCB(x) = μ(x) + β * σ(x)
   *
   * @param x 查询点
   * @returns UCB值
   */
  computeUCB(x: number[]): number {
    if (this.observations.length === 0) {
      return 1.0; // 无观测时返回高值鼓励探索
    }

    const { mean, std } = this.getPosterior(x);
    return mean + this.beta * std;
  }

  /**
   * 计算Expected Improvement
   *
   * @param x 查询点
   * @returns EI值
   */
  computeEI(x: number[]): number {
    if (this.observations.length === 0 || !this.best) {
      return 1.0; // 无观测时返回高值鼓励探索
    }

    const { mean, std } = this.getPosterior(x);

    if (std < EPSILON) {
      return 0;
    }

    const fBest = this.best.value;
    const z = (mean - fBest) / std;
    const cdf = this.normalCDF(z);
    const pdf = this.normalPDF(z);

    return (mean - fBest) * cdf + std * pdf;
  }

  /**
   * 批量建议（用于并行评估）
   *
   * @param n 建议数量
   * @returns 参数值数组的数组
   */
  suggestBatch(n: number): number[][] {
    const suggestions: number[][] = [];

    // 简单策略：依次添加虚拟观测
    const tempObservations = [...this.observations];

    for (let i = 0; i < n; i++) {
      const x = this.suggestNext();
      suggestions.push(x);

      // 添加虚拟观测（使用后验均值）
      const { mean } = this.getPosterior(x);
      this.observations.push({
        params: x,
        value: mean,
        timestamp: Date.now()
      });
      this.cachedL = null;
      this.cachedAlpha = null;
    }

    // 恢复原始观测
    this.observations = tempObservations;
    this.cachedL = null;
    this.cachedAlpha = null;

    return suggestions;
  }

  /**
   * 是否应该停止优化
   */
  shouldStop(): boolean {
    return this.evaluationCount >= this.maxEvaluations;
  }

  /**
   * 获取观测历史
   */
  getObservations(): Observation[] {
    return this.observations.map(o => ({
      params: [...o.params],
      value: o.value,
      timestamp: o.timestamp
    }));
  }

  /**
   * 获取评估次数
   */
  getEvaluationCount(): number {
    return this.evaluationCount;
  }

  /**
   * 获取参数空间
   */
  getParamSpace(): ParamBound[] {
    return this.paramSpace.map(p => ({ ...p }));
  }

  /**
   * 将参数数组转换为命名对象
   */
  paramsToObject(params: number[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (let i = 0; i < this.dim; i++) {
      result[this.paramSpace[i].name] = params[i];
    }
    return result;
  }

  /**
   * 将命名对象转换为参数数组
   */
  objectToParams(obj: Record<string, number>): number[] {
    return this.paramSpace.map(p => obj[p.name] ?? (p.min + p.max) / 2);
  }

  // ==================== 状态管理 ====================

  /**
   * 获取状态（用于持久化）
   */
  getState(): BayesianOptimizerState {
    return {
      version: BayesianOptimizer.VERSION,
      observations: this.observations.map(o => ({
        params: [...o.params],
        value: o.value,
        timestamp: o.timestamp
      })),
      best: this.best ? { params: [...this.best.params], value: this.best.value } : null,
      evaluationCount: this.evaluationCount
    };
  }

  /**
   * 恢复状态
   * 如果best为null但有观测数据，从观测中重建best
   */
  setState(state: BayesianOptimizerState): void {
    if (!state) {
      console.warn('[BayesianOptimizer] 无效状态，跳过恢复');
      return;
    }

    if (state.version !== BayesianOptimizer.VERSION) {
      console.log(
        `[BayesianOptimizer] 版本迁移: ${state.version} → ${BayesianOptimizer.VERSION}`
      );
    }

    this.observations = (state.observations ?? []).map(o => ({
      params: [...o.params],
      value: o.value,
      timestamp: o.timestamp
    }));

    this.best = state.best
      ? { params: [...state.best.params], value: state.best.value }
      : null;

    // 如果best为null但有观测数据，从观测中重建best
    if (!this.best && this.observations.length > 0) {
      let maxValue = -Infinity;
      let maxIdx = 0;
      for (let i = 0; i < this.observations.length; i++) {
        if (this.observations[i].value > maxValue) {
          maxValue = this.observations[i].value;
          maxIdx = i;
        }
      }
      this.best = {
        params: [...this.observations[maxIdx].params],
        value: maxValue
      };
      console.log('[BayesianOptimizer] 从观测数据重建best');
    }

    this.evaluationCount = state.evaluationCount ?? 0;

    // 清除缓存
    this.cachedL = null;
    this.cachedAlpha = null;
  }

  /**
   * 重置优化器
   */
  reset(): void {
    this.observations = [];
    this.best = null;
    this.evaluationCount = 0;
    this.cachedL = null;
    this.cachedAlpha = null;
  }

  // ==================== 私有方法 ====================

  /**
   * 随机采样一个点
   */
  private randomSample(): number[] {
    return this.paramSpace.map(p => {
      let value = p.min + Math.random() * (p.max - p.min);
      if (p.step) {
        value = Math.round((value - p.min) / p.step) * p.step + p.min;
      }
      return this.clamp(value, p.min, p.max);
    });
  }

  /**
   * Matern 5/2 核函数
   */
  private kernel(x1: number[], x2: number[]): number {
    let r2 = 0;
    for (let i = 0; i < this.dim; i++) {
      const diff = (x1[i] - x2[i]) / this.lengthScale[i];
      r2 += diff * diff;
    }
    const r = Math.sqrt(r2);
    const sqrt5r = Math.sqrt(5) * r;

    return (
      this.outputVariance *
      (1 + sqrt5r + (5 * r2) / 3) *
      Math.exp(-sqrt5r)
    );
  }

  /**
   * 更新GP缓存（Cholesky分解和alpha向量）
   * 使用jitter提高数值稳定性
   */
  private updateGPCache(): void {
    if (this.cachedL !== null && this.cachedAlpha !== null) {
      return;
    }

    const n = this.observations.length;
    if (n === 0) return;

    // 构建核矩阵 K + σ²I + jitter*I
    const K = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        const kij = this.kernel(
          this.observations[i].params,
          this.observations[j].params
        );
        K[i * n + j] = kij;
        K[j * n + i] = kij;
      }
      // 添加噪声方差和jitter以提高数值稳定性
      K[i * n + i] += this.noiseVariance + this.jitter;
    }

    // Cholesky分解（带失败检测）
    this.cachedL = this.cholesky(K, n);

    // 检查分解是否成功
    let validDecomp = true;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(this.cachedL[i * n + i]) || this.cachedL[i * n + i] <= 0) {
        validDecomp = false;
        break;
      }
    }

    if (!validDecomp) {
      console.warn('[BayesianOptimizer] Cholesky分解失败，增加jitter重试');
      // 增加jitter重试
      for (let i = 0; i < n; i++) {
        K[i * n + i] += 1e-4;
      }
      this.cachedL = this.cholesky(K, n);
    }

    // 计算α = L^T \ (L \ y)
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      y[i] = this.observations[i].value;
    }

    const z = this.solveTriangular(this.cachedL, y, n, false);
    this.cachedAlpha = this.solveTriangular(this.cachedL, z, n, true);
  }

  /**
   * Cholesky分解
   */
  private cholesky(A: Float64Array, n: number): Float64Array {
    const L = new Float64Array(n * n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L[i * n + k] * L[j * n + k];
        }

        if (i === j) {
          const diag = A[i * n + i] - sum;
          L[i * n + j] = Math.sqrt(Math.max(EPSILON, diag));
        } else {
          L[i * n + j] = (A[i * n + j] - sum) / L[j * n + j];
        }
      }
    }

    return L;
  }

  /**
   * 求解三角系统 Lx = b 或 L^T x = b
   */
  private solveTriangular(
    L: Float64Array,
    b: Float64Array,
    n: number,
    transpose: boolean
  ): Float64Array {
    const x = new Float64Array(n);

    if (!transpose) {
      // 前向替换: Lx = b
      for (let i = 0; i < n; i++) {
        let sum = b[i];
        for (let j = 0; j < i; j++) {
          sum -= L[i * n + j] * x[j];
        }
        x[i] = sum / L[i * n + i];
      }
    } else {
      // 后向替换: L^T x = b
      for (let i = n - 1; i >= 0; i--) {
        let sum = b[i];
        for (let j = i + 1; j < n; j++) {
          sum -= L[j * n + i] * x[j];
        }
        x[i] = sum / L[i * n + i];
      }
    }

    return x;
  }

  /**
   * 最大化采集函数（简单网格搜索+局部优化）
   */
  private maximizeAcquisition(): number[] {
    let bestX = this.randomSample();
    let bestAcq = this.computeAcquisition(bestX);

    // 粗网格搜索
    const gridSize = 5;
    const grid = this.generateGrid(gridSize);

    for (const x of grid) {
      const acq = this.computeAcquisition(x);
      if (acq > bestAcq) {
        bestAcq = acq;
        bestX = x;
      }
    }

    // 随机采样增强
    for (let i = 0; i < 100; i++) {
      const x = this.randomSample();
      const acq = this.computeAcquisition(x);
      if (acq > bestAcq) {
        bestAcq = acq;
        bestX = x;
      }
    }

    // 简单局部优化（坐标下降）
    bestX = this.localOptimize(bestX);

    // 离散化
    return this.discretize(bestX);
  }

  /**
   * 生成网格点
   */
  private generateGrid(size: number): number[][] {
    const grid: number[][] = [];

    const generateRecursive = (dim: number, current: number[]): void => {
      if (dim === this.dim) {
        grid.push([...current]);
        return;
      }

      const p = this.paramSpace[dim];
      for (let i = 0; i < size; i++) {
        const value = p.min + ((p.max - p.min) * i) / (size - 1);
        current.push(value);
        generateRecursive(dim + 1, current);
        current.pop();
      }
    };

    generateRecursive(0, []);
    return grid;
  }

  /**
   * 简单局部优化
   */
  private localOptimize(x0: number[]): number[] {
    const x = [...x0];
    const stepSizes = this.paramSpace.map(p => (p.max - p.min) / 20);
    let improved = true;
    let iterations = 0;

    while (improved && iterations < 10) {
      improved = false;
      iterations += 1;

      for (let d = 0; d < this.dim; d++) {
        const current = x[d];
        const currentAcq = this.computeAcquisition(x);

        // 尝试向上
        x[d] = this.clamp(
          current + stepSizes[d],
          this.paramSpace[d].min,
          this.paramSpace[d].max
        );
        const upAcq = this.computeAcquisition(x);

        // 尝试向下
        x[d] = this.clamp(
          current - stepSizes[d],
          this.paramSpace[d].min,
          this.paramSpace[d].max
        );
        const downAcq = this.computeAcquisition(x);

        // 选择最优方向
        if (upAcq > currentAcq && upAcq >= downAcq) {
          x[d] = this.clamp(
            current + stepSizes[d],
            this.paramSpace[d].min,
            this.paramSpace[d].max
          );
          improved = true;
        } else if (downAcq > currentAcq) {
          // x[d] 已经是向下的值
          improved = true;
        } else {
          x[d] = current;
        }
      }

      // 减小步长
      for (let d = 0; d < this.dim; d++) {
        stepSizes[d] *= 0.8;
      }
    }

    return x;
  }

  /**
   * 离散化参数
   */
  private discretize(x: number[]): number[] {
    return x.map((value, i) => {
      const p = this.paramSpace[i];
      if (p.step) {
        value = Math.round((value - p.min) / p.step) * p.step + p.min;
      }
      return this.clamp(value, p.min, p.max);
    });
  }

  /**
   * 标准正态分布PDF
   */
  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * 标准正态分布CDF（Abramowitz-Stegun近似）
   */
  private normalCDF(x: number): number {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1 / (1 + NORM_CDF_P * x);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;

    const y =
      1 -
      (NORM_CDF_A1 * t +
        NORM_CDF_A2 * t2 +
        NORM_CDF_A3 * t3 +
        NORM_CDF_A4 * t4 +
        NORM_CDF_A5 * t5) *
        Math.exp(-x * x / 2);

    return 0.5 * (1 + sign * y);
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ==================== 便捷函数 ====================

/**
 * 获取默认参数空间
 */
export function getDefaultParamSpace(): ParamBound[] {
  return DEFAULT_PARAM_SPACE.map(p => ({ ...p }));
}

/**
 * 创建AMAS超参数优化器
 */
export function createAMASOptimizer(
  maxEvaluations = 50
): BayesianOptimizer {
  return new BayesianOptimizer({
    paramSpace: DEFAULT_PARAM_SPACE,
    maxEvaluations,
    beta: 2.0,
    noiseVariance: 0.1
  });
}

// ==================== 导出默认实例 ====================

export const defaultBayesianOptimizer = new BayesianOptimizer();
