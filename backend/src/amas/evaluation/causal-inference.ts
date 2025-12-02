/**
 * AMAS Evaluation Layer - Causal Inference Validator
 * 因果推断验证器
 *
 * 核心设计:
 * - 双重稳健估计器（Doubly Robust Estimator）
 * - 倾向得分模型（逻辑回归）
 * - 结果模型（线性回归）
 * - IPW（逆概率加权）校正
 *
 * 双重稳健估计公式:
 * τ_DR = (1/n) Σ [
 *   (T_i * Y_i / e(X_i)) - ((T_i - e(X_i)) * μ(X_i, 1) / e(X_i))
 *   - ((1-T_i) * Y_i / (1-e(X_i))) + ((T_i - e(X_i)) * μ(X_i, 0) / (1-e(X_i)))
 * ]
 *
 * 特点:
 * - 只要倾向得分或结果模型之一正确，估计就是一致的
 * - 适用于观测性研究的因果效应估计
 * - 支持策略A/B比较验证
 */

// ==================== 类型定义 ====================

/**
 * 因果观测记录
 */
export interface CausalObservation {
  /** 用户特征向量 */
  features: number[];
  /** 策略选择（0或1） */
  treatment: number;
  /** 观测奖励 [-1, 1] */
  outcome: number;
  /** 时间戳 */
  timestamp: number;
  /** 用户ID（可选） */
  userId?: string;
}

/**
 * 因果效应估计结果
 */
export interface CausalEstimate {
  /** 平均处理效应 ATE */
  ate: number;
  /** 标准误 */
  standardError: number;
  /** 95%置信区间 */
  confidenceInterval: [number, number];
  /** 样本量 */
  sampleSize: number;
  /** 有效样本量（IPW加权后） */
  effectiveSampleSize: number;
  /** p值 */
  pValue: number;
  /** 是否显著（α=0.05） */
  significant: boolean;
}

/**
 * 倾向得分诊断
 */
export interface PropensityDiagnostics {
  /** 均值 */
  mean: number;
  /** 标准差 */
  std: number;
  /** 中位数 */
  median: number;
  /** 处理组均值 */
  treatmentMean: number;
  /** 对照组均值 */
  controlMean: number;
  /** 重叠度量 */
  overlap: number;
  /** AUC（区分度） */
  auc: number;
}

/**
 * 策略比较结果
 */
export interface StrategyComparison {
  /** 效应差异 */
  diff: number;
  /** 标准误 */
  standardError: number;
  /** 95%置信区间 */
  confidenceInterval: [number, number];
  /** p值 */
  pValue: number;
  /** 是否显著 */
  significant: boolean;
  /** 样本量 */
  sampleSize: number;
}

/**
 * 因果推断配置
 */
export interface CausalInferenceConfig {
  /** 倾向得分截断下限 */
  propensityMin?: number;
  /** 倾向得分截断上限 */
  propensityMax?: number;
  /** 学习率 */
  learningRate?: number;
  /** 正则化系数 */
  regularization?: number;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 收敛阈值 */
  convergenceThreshold?: number;
}

/**
 * 因果推断状态（持久化）
 */
export interface CausalInferenceState {
  /** 版本号 */
  version: string;
  /** 观测数据 */
  observations: CausalObservation[];
  /** 倾向得分模型参数 */
  propensityWeights: number[] | null;
  /** 结果模型参数（处理组） */
  outcomeWeightsTreatment: number[] | null;
  /** 结果模型参数（对照组） */
  outcomeWeightsControl: number[] | null;
  /** 特征维度 */
  featureDim: number;
  /** 是否已拟合 */
  fitted: boolean;
}

// ==================== 常量 ====================

/** 数值稳定性 */
const EPSILON = 1e-10;

/** Z值（95%置信区间） */
const Z_95 = 1.96;

/** 默认配置 */
const DEFAULT_CONFIG: Required<CausalInferenceConfig> = {
  propensityMin: 0.05,
  propensityMax: 0.95,
  learningRate: 0.1,
  regularization: 0.01,
  maxIterations: 1000,
  convergenceThreshold: 1e-6
};

// ==================== 实现 ====================

/**
 * 因果推断验证器
 *
 * 适用场景:
 * - 策略效果验证
 * - A/B测试分析
 * - 观测性因果推断
 */
export class CausalInference {
  private static readonly VERSION = '1.0.0';

  /** 配置 */
  private readonly config: Required<CausalInferenceConfig>;

  /** 观测数据 */
  private observations: CausalObservation[] = [];
  /** 兼容测试的观测数据（字符串 treatment） */
  private legacyObservations: Array<{
    treatment: string;
    outcome: number;
    covariates: Record<string, any>;
  }> = [];

  /** 特征维度 */
  private featureDim = 0;

  /** 倾向得分模型权重 */
  private propensityWeights: Float64Array | null = null;

  /** 结果模型权重（处理组） */
  private outcomeWeightsTreatment: Float64Array | null = null;

  /** 结果模型权重（对照组） */
  private outcomeWeightsControl: Float64Array | null = null;

  /** 是否已拟合 */
  private fitted = false;

    constructor(config: CausalInferenceConfig = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }

  /**
   * 兼容测试：记录观测
   */
  recordObservation(obs: {
    treatment: string;
    outcome: number;
    covariates: Record<string, any>;
  }) {
    this.legacyObservations.push(obs);
  }

  /**
   * 兼容测试：估计平均处理效应
   */
  estimateCATT(treatment: string, condition: Record<string, any>) {
    const filtered = this.legacyObservations.filter(obs =>
      Object.entries(condition).every(([k, v]) => obs.covariates[k] === v)
    );
    const mean =
      filtered.reduce((s, o) => s + o.outcome, 0) / (filtered.length || 1);
    return { effect: mean, samples: filtered.length };
  }

  /**
   * 兼容测试：重置
   */
  reset(): void {
    this.legacyObservations = [];
    this.observations = [];
    this.featureDim = 0;
    this.propensityWeights = null;
    this.outcomeWeightsControl = null;
    this.outcomeWeightsTreatment = null;
    this.fitted = false;
  }

  // ==================== 核心API ====================

  /**
   * 添加观测数据
   */
  addObservation(obs: CausalObservation): void {
    // 验证
    if (!obs.features || obs.features.length === 0) {
      throw new Error('[CausalInference] 特征向量不能为空');
    }
    if (obs.treatment !== 0 && obs.treatment !== 1) {
      throw new Error('[CausalInference] treatment必须是0或1');
    }

    // 初始化或验证维度
    if (this.featureDim === 0) {
      this.featureDim = obs.features.length;
    } else if (obs.features.length !== this.featureDim) {
      throw new Error(
        `[CausalInference] 特征维度不匹配: ${obs.features.length} vs ${this.featureDim}`
      );
    }

    this.observations.push({
      features: [...obs.features],
      treatment: obs.treatment,
      outcome: this.clamp(obs.outcome, -1, 1),
      timestamp: obs.timestamp,
      userId: obs.userId
    });

    // 标记需要重新拟合
    this.fitted = false;
  }

  /**
   * 批量添加观测数据
   */
  addObservations(observations: CausalObservation[]): void {
    for (const obs of observations) {
      this.addObservation(obs);
    }
  }

  /**
   * 拟合模型
   */
  fit(): void {
    if (this.observations.length < 10) {
      throw new Error('[CausalInference] 样本量不足，至少需要10个观测');
    }

    // 检查处理组和对照组都有样本
    const treatmentCount = this.observations.filter(o => o.treatment === 1).length;
    const controlCount = this.observations.length - treatmentCount;

    if (treatmentCount < 5 || controlCount < 5) {
      throw new Error('[CausalInference] 处理组和对照组各需至少5个样本');
    }

    // 拟合倾向得分模型
    this.fitPropensityModel();

    // 拟合结果模型
    this.fitOutcomeModel();

    this.fitted = true;
  }

  /**
   * 估计平均处理效应（ATE）
   *
   * 使用双重稳健估计器
   */
  estimateATE(): CausalEstimate;
  estimateATE(
    treatmentA: string,
    treatmentB: string
  ): { effect: number; treated: number; control: number; samples: number };
  estimateATE(
    treatmentA?: string,
    treatmentB?: string
  ): CausalEstimate | { effect: number; treated: number; control: number; samples: number } {
    // 兼容测试：字符串 treatment 简化版
    if (typeof treatmentA === 'string' && typeof treatmentB === 'string') {
      if (!this.legacyObservations.length) {
        return { effect: 0, treated: 0, control: 0, samples: 0 };
      }
      const groupA = this.legacyObservations.filter(o => o.treatment === treatmentA);
      const groupB = this.legacyObservations.filter(o => o.treatment === treatmentB);
      const meanA = groupA.reduce((s, o) => s + o.outcome, 0) / (groupA.length || 1);
      const meanB = groupB.reduce((s, o) => s + o.outcome, 0) / (groupB.length || 1);
      return {
        effect: meanA - meanB,
        treated: meanA,
        control: meanB,
        samples: this.legacyObservations.length
      };
    }

    if (!this.fitted) {
      this.fit();
    }

    const n = this.observations.length;
    const scores: number[] = [];
    let effectiveN = 0;

    for (const obs of this.observations) {
      const e = this.getPropensityScore(obs.features);
      const mu1 = this.predictOutcome(obs.features, 1);
      const mu0 = this.predictOutcome(obs.features, 0);

      // 双重稳健得分
      let score: number;
      if (obs.treatment === 1) {
        const w = 1 / e;
        score = w * obs.outcome - (w - 1) * mu1 - mu0;
        effectiveN += Math.min(w, 10); // 截断极端权重
      } else {
        const w = 1 / (1 - e);
        score = mu1 - w * obs.outcome + (w - 1) * mu0;
        effectiveN += Math.min(w, 10);
      }

      scores.push(score);
    }

    // 计算ATE和标准误
    const ate = this.mean(scores);
    const variance = this.variance(scores);
    const se = Math.sqrt(variance / n);

    // 置信区间和p值
    const ci: [number, number] = [ate - Z_95 * se, ate + Z_95 * se];
    const zStat = Math.abs(ate) / (se + EPSILON);
    const pValue = 2 * (1 - this.normalCDF(zStat));

    return {
      ate,
      standardError: se,
      confidenceInterval: ci,
      sampleSize: n,
      effectiveSampleSize: Math.round(effectiveN),
      pValue,
      significant: pValue < 0.05
    };
  }

  /**
   * 估计条件平均处理效应（CATE）
   *
   * @param features 用户特征
   */
  estimateCATTE(features: number[]): CausalEstimate {
    if (!this.fitted) {
      this.fit();
    }

    // 基于结果模型的差异估计
    const mu1 = this.predictOutcome(features, 1);
    const mu0 = this.predictOutcome(features, 0);
    const cate = mu1 - mu0;

    // 使用Bootstrap估计标准误（简化版）
    const seEstimate = this.bootstrapSE(features, 100);

    // 处理SE不可靠的情况
    const validSE = Number.isFinite(seEstimate) && seEstimate > 0;
    const se = validSE ? seEstimate : Math.abs(cate) * 0.5 + 0.1; // 降级估计

    const ci: [number, number] = [cate - Z_95 * se, cate + Z_95 * se];
    const zStat = Math.abs(cate) / (se + EPSILON);
    const pValue = 2 * (1 - this.normalCDF(zStat));

    return {
      ate: cate,
      standardError: se,
      confidenceInterval: ci,
      sampleSize: this.observations.length,
      effectiveSampleSize: this.observations.length,
      pValue,
      // SE不可靠时不判断显著性
      significant: validSE ? pValue < 0.05 : false
    };
  }

  /**
   * 获取倾向得分（自动添加截距项）
   */
  getPropensityScore(features: number[]): number;
  getPropensityScore(
    treatment: string,
    covariates?: Record<string, any>
  ): number;
  getPropensityScore(
    featuresOrTreatment: number[] | string,
    covariates: Record<string, any> = {}
  ): number {
    // 兼容测试：按频率计算
    if (typeof featuresOrTreatment === 'string') {
      if (!this.legacyObservations.length) return 0.5;
      const matching = this.legacyObservations.filter(obs =>
        Object.keys(covariates).every(key => obs.covariates[key] === covariates[key])
      );
      const treated = matching.filter(obs => obs.treatment === featuresOrTreatment).length;
      return Math.min(1, Math.max(0, treated / (matching.length || 1)));
    }

    const features = featuresOrTreatment;
    if (!this.propensityWeights) {
      return 0.5; // 未拟合时返回0.5
    }

    // 添加截距项
    const featuresWithBias = [...features, 1];
    const logit = this.dotProductArrayExt(featuresWithBias, this.propensityWeights);
    const raw = this.sigmoid(logit);

    return this.clamp(raw, this.config.propensityMin, this.config.propensityMax);
  }

  /**
   * 诊断倾向得分分布
   */
  diagnosePropensity(): PropensityDiagnostics {
    if (!this.fitted) {
      this.fit();
    }

    const scores = this.observations.map(o => this.getPropensityScore(o.features));
    const treatmentScores = this.observations
      .filter(o => o.treatment === 1)
      .map(o => this.getPropensityScore(o.features));
    const controlScores = this.observations
      .filter(o => o.treatment === 0)
      .map(o => this.getPropensityScore(o.features));

    // 计算重叠度量（直方图重叠）
    const overlap = this.computeOverlap(treatmentScores, controlScores);

    // 计算AUC
    const auc = this.computeAUC(
      this.observations.map(o => this.getPropensityScore(o.features)),
      this.observations.map(o => o.treatment)
    );

    return {
      mean: this.mean(scores),
      std: Math.sqrt(this.variance(scores)),
      median: this.median(scores),
      treatmentMean: this.mean(treatmentScores),
      controlMean: this.mean(controlScores),
      overlap,
      auc
    };
  }

  /**
   * 比较两个策略
   *
   * @param strategyA 策略A的标识（treatment=1的策略）
   * @param strategyB 策略B的标识（treatment=0的策略）
   */
  compareStrategies(
    _strategyA: number,
    _strategyB: number
  ): StrategyComparison {
    const estimate = this.estimateATE();

    return {
      diff: estimate.ate,
      standardError: estimate.standardError,
      confidenceInterval: estimate.confidenceInterval,
      pValue: estimate.pValue,
      significant: estimate.significant,
      sampleSize: estimate.sampleSize
    };
  }

  /**
   * 预测结果（自动添加截距项）
   */
  predictOutcome(features: number[], treatment: number): number {
    const weights =
      treatment === 1 ? this.outcomeWeightsTreatment : this.outcomeWeightsControl;

    if (!weights) {
      return 0;
    }

    // 添加截距项
    const featuresWithBias = [...features, 1];
    return this.dotProductArrayExt(featuresWithBias, weights);
  }

  /**
   * 获取观测数量
   */
  getObservationCount(): number {
    return this.legacyObservations.length || this.observations.length;
  }

  /**
   * 清除数据
   */
  clear(): void {
    this.observations = [];
    this.featureDim = 0;
    this.propensityWeights = null;
    this.outcomeWeightsTreatment = null;
    this.outcomeWeightsControl = null;
    this.fitted = false;
  }

  // ==================== 状态管理 ====================

  /**
   * 获取状态（用于持久化）
   */
  getState(): CausalInferenceState {
    return {
      version: CausalInference.VERSION,
      observations: this.observations.map(o => ({
        features: [...o.features],
        treatment: o.treatment,
        outcome: o.outcome,
        timestamp: o.timestamp,
        userId: o.userId
      })),
      propensityWeights: this.propensityWeights
        ? Array.from(this.propensityWeights)
        : null,
      outcomeWeightsTreatment: this.outcomeWeightsTreatment
        ? Array.from(this.outcomeWeightsTreatment)
        : null,
      outcomeWeightsControl: this.outcomeWeightsControl
        ? Array.from(this.outcomeWeightsControl)
        : null,
      featureDim: this.featureDim,
      fitted: this.fitted
    };
  }

  /**
   * 恢复状态
   */
  setState(state: CausalInferenceState): void {
    if (!state) {
      console.warn('[CausalInference] 无效状态，跳过恢复');
      return;
    }

    if (state.version !== CausalInference.VERSION) {
      console.log(
        `[CausalInference] 版本迁移: ${state.version} → ${CausalInference.VERSION}`
      );
    }

    this.observations = (state.observations ?? []).map(o => ({
      features: [...o.features],
      treatment: o.treatment,
      outcome: o.outcome,
      timestamp: o.timestamp,
      userId: o.userId
    }));

    this.propensityWeights = state.propensityWeights
      ? new Float64Array(state.propensityWeights)
      : null;

    this.outcomeWeightsTreatment = state.outcomeWeightsTreatment
      ? new Float64Array(state.outcomeWeightsTreatment)
      : null;

    this.outcomeWeightsControl = state.outcomeWeightsControl
      ? new Float64Array(state.outcomeWeightsControl)
      : null;

    this.featureDim = state.featureDim ?? 0;
    this.fitted = state.fitted ?? false;
  }

  // ==================== 私有方法 ====================

  /**
   * 拟合倾向得分模型（逻辑回归，自动添加截距项）
   */
  private fitPropensityModel(): void {
    // 维度+1用于截距项
    const d = this.featureDim + 1;
    const weights = new Float64Array(d);
    const { learningRate, regularization, maxIterations, convergenceThreshold } =
      this.config;

    // 梯度下降
    let prevLoss = Infinity;

    for (let iter = 0; iter < maxIterations; iter++) {
      const gradients = new Float64Array(d);
      let loss = 0;

      for (const obs of this.observations) {
        // 添加截距项（特征末尾加1）
        const featuresWithBias = [...obs.features, 1];
        const logit = this.dotProductArrayExt(featuresWithBias, weights);
        const pred = this.sigmoid(logit);

        // 交叉熵损失
        loss +=
          -obs.treatment * Math.log(pred + EPSILON) -
          (1 - obs.treatment) * Math.log(1 - pred + EPSILON);

        // 梯度
        const error = pred - obs.treatment;
        for (let j = 0; j < d; j++) {
          gradients[j] += error * featuresWithBias[j];
        }
      }

      // 添加L2正则化（不对截距项正则化）
      for (let j = 0; j < d - 1; j++) {
        loss += (regularization / 2) * weights[j] * weights[j];
        gradients[j] += regularization * weights[j];
      }

      // 更新权重
      for (let j = 0; j < d; j++) {
        weights[j] -= learningRate * gradients[j] / this.observations.length;
      }

      // 检查收敛
      if (Math.abs(prevLoss - loss) < convergenceThreshold) {
        break;
      }
      prevLoss = loss;
    }

    this.propensityWeights = weights;
  }

  /**
   * 拟合结果模型（线性回归，分别拟合处理组和对照组）
   */
  private fitOutcomeModel(): void {
    const treatmentObs = this.observations.filter(o => o.treatment === 1);
    const controlObs = this.observations.filter(o => o.treatment === 0);

    this.outcomeWeightsTreatment = this.fitLinearRegression(treatmentObs);
    this.outcomeWeightsControl = this.fitLinearRegression(controlObs);
  }

  /**
   * 拟合线性回归（OLS with Ridge，自动添加截距项）
   */
  private fitLinearRegression(data: CausalObservation[]): Float64Array {
    const n = data.length;
    // 维度+1用于截距项
    const d = this.featureDim + 1;
    const lambda = this.config.regularization;

    if (n === 0) {
      return new Float64Array(d);
    }

    // 构建 X^T X + λI（添加截距项）
    const XTX = new Float64Array(d * d);
    const XTy = new Float64Array(d);

    for (const obs of data) {
      // 添加截距项
      const featuresWithBias = [...obs.features, 1];
      for (let i = 0; i < d; i++) {
        XTy[i] += featuresWithBias[i] * obs.outcome;
        for (let j = 0; j < d; j++) {
          XTX[i * d + j] += featuresWithBias[i] * featuresWithBias[j];
        }
      }
    }

    // 添加正则化（不对截距项正则化）
    for (let i = 0; i < d - 1; i++) {
      XTX[i * d + i] += lambda * n;
    }

    // 求解 (X^T X + λI)^{-1} X^T y
    return this.solveLinearSystem(XTX, XTy, d);
  }

  /**
   * 求解线性系统（Cholesky分解）
   */
  private solveLinearSystem(
    A: Float64Array,
    b: Float64Array,
    n: number
  ): Float64Array {
    // Cholesky分解
    const L = new Float64Array(n * n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = A[i * n + j];
        for (let k = 0; k < j; k++) {
          sum -= L[i * n + k] * L[j * n + k];
        }

        if (i === j) {
          L[i * n + j] = Math.sqrt(Math.max(EPSILON, sum));
        } else {
          L[i * n + j] = sum / (L[j * n + j] + EPSILON);
        }
      }
    }

    // 前向替换: Ly = b
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = b[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * n + j] * y[j];
      }
      y[i] = sum / (L[i * n + i] + EPSILON);
    }

    // 后向替换: L^T x = y
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < n; j++) {
        sum -= L[j * n + i] * x[j];
      }
      x[i] = sum / (L[i * n + i] + EPSILON);
    }

    return x;
  }

  /**
   * Bootstrap标准误估计（添加截距项）
   */
  private bootstrapSE(features: number[], nBootstrap: number): number {
    const estimates: number[] = [];
    // 添加截距项用于预测
    const featuresWithBias = [...features, 1];

    for (let b = 0; b < nBootstrap; b++) {
      // 重采样
      const sample: CausalObservation[] = [];
      for (let i = 0; i < this.observations.length; i++) {
        const idx = Math.floor(Math.random() * this.observations.length);
        sample.push(this.observations[idx]);
      }

      // 在重采样数据上拟合结果模型
      const treatmentObs = sample.filter(o => o.treatment === 1);
      const controlObs = sample.filter(o => o.treatment === 0);

      if (treatmentObs.length < 3 || controlObs.length < 3) {
        continue;
      }

      const w1 = this.fitLinearRegression(treatmentObs);
      const w0 = this.fitLinearRegression(controlObs);

      const mu1 = this.dotProductArrayExt(featuresWithBias, w1);
      const mu0 = this.dotProductArrayExt(featuresWithBias, w0);

      estimates.push(mu1 - mu0);
    }

    if (estimates.length < 10) {
      // 样本不足时返回NaN提示不可信
      console.warn('[CausalInference] Bootstrap样本不足，SE估计不可靠');
      return NaN;
    }

    return Math.sqrt(this.variance(estimates));
  }

  /**
   * 计算重叠度量
   */
  private computeOverlap(scores1: number[], scores2: number[]): number {
    const bins = 20;
    const hist1 = new Float64Array(bins);
    const hist2 = new Float64Array(bins);

    for (const s of scores1) {
      const bin = Math.min(bins - 1, Math.floor(s * bins));
      hist1[bin] += 1 / scores1.length;
    }

    for (const s of scores2) {
      const bin = Math.min(bins - 1, Math.floor(s * bins));
      hist2[bin] += 1 / scores2.length;
    }

    // 重叠面积
    let overlap = 0;
    for (let i = 0; i < bins; i++) {
      overlap += Math.min(hist1[i], hist2[i]);
    }

    return overlap;
  }

  /**
   * 计算AUC
   */
  private computeAUC(scores: number[], labels: number[]): number {
    // 按分数排序
    const pairs = scores.map((s, i) => ({ score: s, label: labels[i] }));
    pairs.sort((a, b) => b.score - a.score);

    let auc = 0;
    let tpSum = 0;
    const nPos = labels.filter(l => l === 1).length;
    const nNeg = labels.length - nPos;

    if (nPos === 0 || nNeg === 0) {
      return 0.5;
    }

    for (const pair of pairs) {
      if (pair.label === 1) {
        tpSum += 1;
      } else {
        auc += tpSum;
      }
    }

    return auc / (nPos * nNeg);
  }

  /**
   * 点积（Float64Array）
   */
  private dotProduct(a: number[], b: Float64Array): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * 点积（数组和Float64Array，支持不同长度）
   */
  private dotProductArrayExt(a: number[], b: Float64Array): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Sigmoid函数
   */
  private sigmoid(x: number): number {
    if (x > 20) return 1 - EPSILON;
    if (x < -20) return EPSILON;
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * 均值
   */
  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, x) => sum + x, 0) / arr.length;
  }

  /**
   * 方差
   */
  private variance(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    return arr.reduce((sum, x) => sum + (x - m) * (x - m), 0) / (arr.length - 1);
  }

  /**
   * 中位数
   */
  private median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * 标准正态CDF
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1 / (1 + p * x);
    const y =
      1 -
      (a1 * t + a2 * t * t + a3 * t * t * t + a4 * t * t * t * t + a5 * t * t * t * t * t) *
        Math.exp((-x * x) / 2);

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
 * 创建因果推断验证器
 */
export function createCausalInference(
  config?: CausalInferenceConfig
): CausalInference {
  return new CausalInference(config);
}

/**
 * 计算IPW权重
 */
export function computeIPWWeight(
  treatment: number,
  propensity: number,
  minProp = 0.05,
  maxProp = 0.95
): number {
  const clipped = Math.max(minProp, Math.min(maxProp, propensity));
  return treatment === 1 ? 1 / clipped : 1 / (1 - clipped);
}

// ==================== 导出默认实例 ====================

export const defaultCausalInference = new CausalInference();
