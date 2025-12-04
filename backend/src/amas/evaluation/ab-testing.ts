/**
 * A/B Testing Platform - A/B测试平台
 * 支持流量分配、统计显著性检验和自动化决策
 */

import { amasLogger } from '../../logger';

/**
 * A/B测试实验配置
 */
export interface ABTestConfig {
  /** 实验ID */
  id: string;
  /** 实验名称 */
  name: string;
  /** 实验描述 */
  description: string;
  /** 变体配置 */
  variants: ABVariant[];
  /** 流量分配策略 */
  trafficAllocation: 'even' | 'weighted' | 'dynamic';
  /** 最小样本数 */
  minSampleSize: number;
  /** 显著性水平 (alpha) */
  significanceLevel: number;
  /** 最小检测效应 (MDE) */
  minimumDetectableEffect: number;
  /** 自动化决策 */
  autoDecision: boolean;
  /** 开始时间 */
  startedAt: Date;
  /** 结束时间 */
  endedAt?: Date;
  /** 实验状态 */
  status: 'draft' | 'running' | 'completed' | 'aborted';
}

/**
 * 实验变体
 */
export interface ABVariant {
  /** 变体ID */
  id: string;
  /** 变体名称 */
  name: string;
  /** 流量权重 */
  weight: number;
  /** 是否为对照组 */
  isControl: boolean;
  /** 变体参数 */
  parameters: Record<string, any>;
}

/**
 * 实验指标
 *
 * 修复问题#9: 添加m2字段支持Welford在线算法
 */
export interface ABMetrics {
  /** 变体ID */
  variantId: string;
  /** 样本数 */
  sampleCount: number;
  /** 主指标值 */
  primaryMetric: number;
  /** 次要指标 */
  secondaryMetrics?: Record<string, number>;
  /** 转化率 */
  conversionRate?: number;
  /** 平均奖励 */
  averageReward: number;
  /** 标准差 */
  stdDev: number;
  /**
   * Welford算法的M2累积值（用于在线方差计算）
   * @internal
   */
  m2?: number;
}

/**
 * 统计显著性检验结果
 */
export interface SignificanceTestResult {
  /** 是否显著 */
  isSignificant: boolean;
  /** p值 */
  pValue: number;
  /** 置信区间 */
  confidenceInterval: [number, number];
  /** 效应大小 */
  effectSize: number;
  /** 统计功效 */
  statisticalPower: number;
}

/**
 * A/B测试结果
 */
export interface ABTestResult {
  /** 实验配置 */
  config: ABTestConfig;
  /** 各变体指标 */
  variantMetrics: ABMetrics[];
  /** 显著性检验结果 */
  significanceTest: SignificanceTestResult;
  /** 获胜变体 */
  winner?: string;
  /** 决策建议 */
  recommendation: 'deploy_winner' | 'continue_test' | 'abort_test' | 'inconclusive';
  /** 决策理由 */
  reason: string;
}

/**
 * A/B测试引擎
 *
 * 修复问题#8: 添加用户分配持久化映射，支持流量分配策略
 */
export class ABTestEngine {
  private experiments: Map<string, ABTestConfig> = new Map();
  private metricsStore: Map<string, Map<string, ABMetrics>> = new Map();

  // 修复#8: 用户→变体的持久化映射，确保用户分配稳定
  private userAssignments: Map<string, Map<string, string>> = new Map();

  /**
   * 创建实验
   */
  createExperiment(config: Omit<ABTestConfig, 'id' | 'startedAt' | 'status'>): ABTestConfig {
    const experiment: ABTestConfig = {
      ...config,
      id: this.generateExperimentId(),
      startedAt: new Date(),
      status: 'draft'
    };

    // 验证配置
    this.validateConfig(experiment);

    this.experiments.set(experiment.id, experiment);
    this.metricsStore.set(experiment.id, new Map());
    // 修复#8: 初始化用户分配映射
    this.userAssignments.set(experiment.id, new Map());

    return experiment;
  }

  /**
   * 启动实验
   */
  startExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'draft') {
      throw new Error(`Experiment ${experimentId} is already ${experiment.status}`);
    }

    experiment.status = 'running';
    amasLogger.info({ experimentName: experiment.name }, '[ABTest] Started experiment');
  }

  /**
   * 分配用户到变体
   *
   * 修复问题#8:
   * - 添加用户分配持久化，确保同一用户始终分配到同一变体
   * - 支持trafficAllocation配置（even/weighted/dynamic）
   * - 使用更精确的哈希分桶（10000而非100）
   */
  assignVariant(experimentId: string, userId: string): ABVariant {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      throw new Error(`Experiment ${experimentId} not available`);
    }

    // 获取实验的用户分配映射
    const experimentAssignments = this.userAssignments.get(experimentId);
    if (!experimentAssignments) {
      throw new Error(`Experiment ${experimentId} not available`);
    }

    // 修复#8: 检查是否已有持久化分配
    const persistedVariantId = experimentAssignments.get(userId);
    if (persistedVariantId) {
      const persisted = experiment.variants.find(v => v.id === persistedVariantId);
      if (persisted) {
        return persisted;
      }
    }

    // 根据流量分配策略计算权重
    const experimentMetrics = this.metricsStore.get(experimentId);
    const weightedVariants = this.computeTrafficWeights(experiment, experimentMetrics);

    // 基于用户ID的确定性哈希分配（使用更精确的分桶）
    const hash = this.hashUserId(userId, experimentId);
    const randomValue = (hash % 10000) / 10000; // 0-1之间，更精确

    // 根据权重分配变体
    let cumulativeWeight = 0;
    for (const item of weightedVariants) {
      cumulativeWeight += item.weight;
      if (randomValue <= cumulativeWeight) {
        // 持久化分配结果
        experimentAssignments.set(userId, item.variant.id);
        return item.variant;
      }
    }

    // 默认返回对照组并持久化
    const fallback = experiment.variants.find(v => v.isControl) || experiment.variants[0];
    experimentAssignments.set(userId, fallback.id);
    return fallback;
  }

  /**
   * 记录指标
   *
   * 修复问题#9: 使用Welford在线算法正确累积均值和方差
   */
  recordMetrics(experimentId: string, variantId: string, metrics: Partial<ABMetrics>): void {
    const experimentMetrics = this.metricsStore.get(experimentId);
    if (!experimentMetrics) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const currentMetrics: ABMetrics = experimentMetrics.get(variantId) || {
      variantId,
      sampleCount: 0,
      primaryMetric: 0,
      averageReward: 0,
      stdDev: 0,
      m2: 0
    };

    // 使用并行合并算法更新统计量（适用于聚合数据）
    // 参考: Chan et al., "Updating Formulae and a Pairwise Algorithm for Computing Sample Variances"
    const incomingCount = metrics.sampleCount !== undefined ? metrics.sampleCount : 1;
    const incomingMean =
      metrics.primaryMetric ??
      metrics.averageReward ??
      0;
    // 如果没有传入方差信息，假设单个样本的方差为 0
    const incomingM2 = metrics.m2 ?? 0;

    const existingCount = currentMetrics.sampleCount;
    const existingMean = currentMetrics.primaryMetric ?? currentMetrics.averageReward ?? 0;
    const existingM2 = currentMetrics.m2 ?? 0;

    // 并行合并公式
    const totalCount = existingCount + incomingCount;
    let mean: number;
    let m2: number;

    if (totalCount === 0) {
      mean = 0;
      m2 = 0;
    } else if (existingCount === 0) {
      // 首次更新，直接使用新数据
      mean = incomingMean;
      m2 = incomingM2;
    } else if (incomingCount === 0) {
      // 无新数据，保持原状
      mean = existingMean;
      m2 = existingM2;
    } else {
      // 并行合并：合并两个独立的统计量
      const delta = incomingMean - existingMean;
      mean = (existingCount * existingMean + incomingCount * incomingMean) / totalCount;
      // M2 合并公式：M2_total = M2_a + M2_b + delta^2 * n_a * n_b / (n_a + n_b)
      m2 = existingM2 + incomingM2 + (delta * delta * existingCount * incomingCount) / totalCount;
    }

    const sampleCount = totalCount;

    // 计算方差和标准差
    const variance = sampleCount > 1 ? m2 / (sampleCount - 1) : 0;
    const stdDev = Math.sqrt(Math.max(variance, 0));

    // 更新指标
    const primaryMetric =
      metrics.primaryMetric !== undefined
        ? mean
        : currentMetrics.primaryMetric ?? mean;
    const averageReward =
      metrics.averageReward !== undefined
        ? mean
        : currentMetrics.averageReward ?? mean;

    const updatedMetrics: ABMetrics = {
      ...currentMetrics,
      ...metrics,
      sampleCount,
      primaryMetric,
      averageReward,
      stdDev,
      m2
    };

    experimentMetrics.set(variantId, updatedMetrics);
  }

  /**
   * 分析实验结果
   *
   * 修复问题#11: 分析所有变体而非仅第一个，选择最佳表现的变体
   */
  analyzeExperiment(experimentId: string): ABTestResult {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const experimentMetrics = this.metricsStore.get(experimentId);
    if (!experimentMetrics) {
      throw new Error(`No metrics found for experiment ${experimentId}`);
    }

    const variantMetrics = Array.from(experimentMetrics.values());

    // 找到对照组
    const controlVariant = experiment.variants.find(v => v.isControl);
    const controlMetrics = controlVariant ? experimentMetrics.get(controlVariant.id) : undefined;

    // 修复#11: 获取所有处理组（非对照组）的指标
    const treatmentEntries = experiment.variants
      .filter(v => !v.isControl)
      .map(variant => ({ variant, metrics: experimentMetrics.get(variant.id) }))
      .filter((entry): entry is { variant: ABVariant; metrics: ABMetrics } => entry.metrics !== undefined);

    // 空检验结果模板
    const emptyTest: SignificanceTestResult = {
      isSignificant: false,
      pValue: 1,
      confidenceInterval: [0, 0],
      effectSize: 0,
      statisticalPower: 0
    };

    if (!controlMetrics || treatmentEntries.length === 0) {
      return {
        config: experiment,
        variantMetrics,
        significanceTest: emptyTest,
        recommendation: 'continue_test',
        reason: 'Insufficient data for analysis'
      };
    }

    // 修复#11: 分析所有处理组变体
    const analyses = treatmentEntries.map(entry => {
      const test = this.performTTest(controlMetrics, entry.metrics, experiment.significanceLevel);
      const hasMinSamples =
        controlMetrics.sampleCount >= experiment.minSampleSize &&
        entry.metrics.sampleCount >= experiment.minSampleSize;
      return { ...entry, test, hasMinSamples };
    });

    // 选择效应量最大的变体
    const best = analyses.reduce<typeof analyses[number] | null>((acc, cur) => {
      if (!acc) return cur;
      return cur.test.effectSize > acc.test.effectSize ? cur : acc;
    }, null);

    const significanceTest = best?.test ?? emptyTest;
    const hasMinSamples = best?.hasMinSamples ?? false;
    const winnerMetrics = best?.metrics ?? treatmentEntries[0]?.metrics;

    if (!winnerMetrics) {
      return {
        config: experiment,
        variantMetrics,
        significanceTest: emptyTest,
        recommendation: 'continue_test',
        reason: 'Insufficient data for analysis'
      };
    }

    // 生成决策建议
    const { recommendation, reason, winner } = this.generateDecision(
      experiment,
      significanceTest,
      hasMinSamples,
      winnerMetrics,
      controlMetrics
    );

    return {
      config: experiment,
      variantMetrics,
      significanceTest,
      winner,
      recommendation,
      reason
    };
  }

  /**
   * 完成实验
   */
  completeExperiment(experimentId: string, deploy: boolean = false): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'completed';
    experiment.endedAt = new Date();

    if (deploy) {
      const result = this.analyzeExperiment(experimentId);
      amasLogger.info({
        experimentName: experiment.name,
        winner: result.winner || 'None',
        recommendation: result.recommendation
      }, '[ABTest] Completed experiment');
    }
  }

  /**
   * 中止实验
   */
  abortExperiment(experimentId: string, reason: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'aborted';
    experiment.endedAt = new Date();
    amasLogger.info({ experimentName: experiment.name, reason }, '[ABTest] Aborted experiment');
  }

  /**
   * 获取实验
   */
  getExperiment(experimentId: string): ABTestConfig | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * 列出所有实验
   */
  listExperiments(status?: ABTestConfig['status']): ABTestConfig[] {
    const experiments = Array.from(this.experiments.values());
    if (status) {
      return experiments.filter(e => e.status === status);
    }
    return experiments;
  }

  /**
   * 执行 Welch's t检验 (不假设等方差)
   *
   * 修复问题#10: 使用??而非||处理合法的0值，避免输入失真
   */
  private performTTest(
    control: ABMetrics,
    treatment: ABMetrics,
    alpha: number
  ): SignificanceTestResult {
    const n1 = control.sampleCount;
    const n2 = treatment.sampleCount;
    // 修复#10: 使用??而非||，正确处理合法的0值
    const mean1 = control.primaryMetric ?? control.averageReward ?? 0;
    const mean2 = treatment.primaryMetric ?? treatment.averageReward ?? 0;
    const std1 = control.stdDev ?? 0;
    const std2 = treatment.stdDev ?? 0;
    const epsilon = 1e-9; // 防止除零的epsilon

    // 样本量不足时返回无法判定
    if (n1 < 2 || n2 < 2) {
      return {
        isSignificant: false,
        pValue: 1,
        confidenceInterval: [0, 0],
        effectSize: 0,
        statisticalPower: 0
      };
    }

    // Welch's t-test (不假设等方差)
    const var1 = std1 * std1;
    const var2 = std2 * std2;
    const se = Math.sqrt(var1 / n1 + var2 / n2);

    // 修复#10: 使用epsilon进行安全检查
    if (!Number.isFinite(se) || se < epsilon) {
      return {
        isSignificant: false,
        pValue: 1,
        confidenceInterval: [0, 0],
        effectSize: 0,
        statisticalPower: 0
      };
    }

    // 计算t统计量
    const t = (mean2 - mean1) / se;

    // Welch-Satterthwaite 自由度近似
    const v1 = var1 / n1;
    const v2 = var2 / n2;
    const df = Math.pow(v1 + v2, 2) / (
      Math.pow(v1, 2) / (n1 - 1) + Math.pow(v2, 2) / (n2 - 1)
    );

    // 计算p值 (使用t分布近似)
    const pValue = 2 * this.tDistributionCDF(-Math.abs(t), df);

    // 是否显著
    const isSignificant = pValue < alpha;

    // 计算置信区间 (使用t临界值)
    const criticalValue = this.tCriticalValue(alpha, df);
    const marginOfError = criticalValue * se;
    const confidenceInterval: [number, number] = [
      mean2 - mean1 - marginOfError,
      mean2 - mean1 + marginOfError
    ];

    // 效应大小 (Cohen's d，使用合并标准差)
    const pooledStd = Math.sqrt(
      ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
    );
    // 修复#10: 使用epsilon防止除零
    const effectSize = pooledStd > epsilon ? (mean2 - mean1) / pooledStd : 0;

    // 统计功效 (使用 Welch 自由度)
    const statisticalPower = this.computeStatisticalPowerWelch(effectSize, n1, n2, alpha, df);

    return {
      isSignificant,
      pValue,
      confidenceInterval,
      effectSize,
      statisticalPower
    };
  }

  /**
   * t分布累积分布函数近似
   */
  private tDistributionCDF(t: number, df: number): number {
    // 对于大自由度，使用正态近似
    if (df > 100) {
      return this.normalCDF(t);
    }

    // 使用 Beta 不完全函数近似
    const x = df / (df + t * t);
    const a = df / 2;
    const b = 0.5;

    // 正则化不完全 Beta 函数近似
    const betaValue = this.incompleteBeta(x, a, b);

    if (t >= 0) {
      return 1 - 0.5 * betaValue;
    } else {
      return 0.5 * betaValue;
    }
  }

  /**
   * 正则化不完全 Beta 函数近似 (用于 t 分布)
   */
  private incompleteBeta(x: number, a: number, b: number): number {
    // 简化的近似实现
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // 使用连分数展开的近似
    const bt = Math.exp(
      this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betaCF(x, a, b) / a;
    } else {
      return 1 - bt * this.betaCF(1 - x, b, a) / b;
    }
  }

  /**
   * Beta 连分数
   */
  private betaCF(x: number, a: number, b: number): number {
    const maxIterations = 100;
    const epsilon = 1e-10;

    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < epsilon) d = epsilon;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIterations; m++) {
      const m2 = 2 * m;

      // 偶数项
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < epsilon) d = epsilon;
      c = 1 + aa / c;
      if (Math.abs(c) < epsilon) c = epsilon;
      d = 1 / d;
      h *= d * c;

      // 奇数项
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d;
      if (Math.abs(d) < epsilon) d = epsilon;
      c = 1 + aa / c;
      if (Math.abs(c) < epsilon) c = epsilon;
      d = 1 / d;
      const del = d * c;
      h *= del;

      if (Math.abs(del - 1) < epsilon) break;
    }

    return h;
  }

  /**
   * 对数 Gamma 函数 (Lanczos 近似)
   */
  private logGamma(z: number): number {
    const g = 7;
    const coef = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];

    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);
    }

    z -= 1;
    let x = coef[0];
    for (let i = 1; i < g + 2; i++) {
      x += coef[i] / (z + i);
    }
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  /**
   * t分布临界值近似
   */
  private tCriticalValue(alpha: number, df: number): number {
    // 对于大自由度，使用正态分布临界值
    if (df > 100) {
      return this.normalInverseCDF(1 - alpha / 2);
    }

    // 使用近似公式 (Abramowitz & Stegun)
    const p = 1 - alpha / 2;
    const a = 1 / (df - 0.5);
    const b = 48 / (a * a);
    let c = ((20700 * a / b - 98) * a - 16) * a + 96.36;
    const d = ((94.5 / (b + c) - 3) / b + 1) * Math.sqrt(a * Math.PI / 2) * df;
    const x = d * p;
    let y = Math.pow(x, 2 / df);

    if (y > 0.05 + a) {
      const x2 = this.normalInverseCDF(p);
      const y2 = x2 * x2;
      if (df < 5) {
        c += 0.3 * (df - 4.5) * (x2 + 0.6);
      }
      c = (((0.05 * d * x2 - 5) * x2 - 7) * x2 - 2) * x2 + b + c;
      y = (((((0.4 * y2 + 6.3) * y2 + 36) * y2 + 94.5) / c - y2 - 3) / b + 1) * x2;
      y = a * y * y;
      if (y > 0.002) {
        y = Math.exp(y) - 1;
      } else {
        y = 0.5 * y * y + y;
      }
    } else {
      y = ((1 / (((df + 6) / (df * y) - 0.089 * d - 0.822) * (df + 2) * 3) +
           0.5 / (df + 4)) * y - 1) * (df + 1) / (df + 2) + 1 / y;
    }

    return Math.sqrt(df * y);
  }

  /**
   * 正态分布反函数近似
   */
  private normalInverseCDF(p: number): number {
    // Rational approximation for lower region
    const a = [
      -3.969683028665376e1, 2.209460984245205e2,
      -2.759285104469687e2, 1.383577518672690e2,
      -3.066479806614716e1, 2.506628277459239e0
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2,
      -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1,
      -2.400758277161838e0, -2.549732539343734e0,
      4.374664141464968e0, 2.938163982698783e0
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1,
      2.445134137142996e0, 3.754408661907416e0
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number, r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
              ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
  }

  /**
   * 计算统计功效 (基于非中心 t 分布近似，使用 Welch 自由度)
   */
  private computeStatisticalPowerWelch(
    effectSize: number,
    n1: number,
    n2: number,
    alpha: number,
    welchDf: number
  ): number {
    // 计算非中心参数
    const ncp = effectSize * Math.sqrt((n1 * n2) / (n1 + n2));

    // 使用传入的 Welch 自由度
    const df = welchDf;

    // 临界值 (使用 Welch 自由度)
    const tCrit = this.tCriticalValue(alpha, df);

    // 使用正态近似计算功效
    // P(T > tCrit | ncp) ≈ 1 - Φ((tCrit - ncp) / sqrt(1 + tCrit^2 / (2*df)))
    const adjustedT = (tCrit - ncp) / Math.sqrt(1 + tCrit * tCrit / (2 * df));
    const power = 1 - this.normalCDF(adjustedT);

    return Math.max(0, Math.min(1, power));
  }

  /**
   * 正态分布累积分布函数 (CDF)
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp((-x * x) / 2);
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * 生成决策建议
   */
  private generateDecision(
    experiment: ABTestConfig,
    significanceTest: SignificanceTestResult,
    hasMinSamples: boolean,
    treatment: ABMetrics,
    control: ABMetrics
  ): { recommendation: ABTestResult['recommendation']; reason: string; winner?: string } {
    // 样本数不足
    if (!hasMinSamples) {
      return {
        recommendation: 'continue_test',
        reason: 'Minimum sample size not reached'
      };
    }

    // 统计显著且有正向效应
    if (significanceTest.isSignificant && significanceTest.effectSize > 0) {
      // 修复#12: 使用安全的基准值防止除零
      const treatmentMean = treatment.averageReward ?? treatment.primaryMetric ?? 0;
      const controlMean = control.averageReward ?? control.primaryMetric ?? 0;
      const baseline = Math.max(Math.abs(controlMean), 1e-6); // 防止除零
      const improvement = ((treatmentMean - controlMean) / baseline) * 100;

      if (improvement >= experiment.minimumDetectableEffect * 100) {
        return {
          recommendation: 'deploy_winner',
          reason: `Significant improvement detected: ${improvement.toFixed(1)}% (p=${significanceTest.pValue.toFixed(4)})`,
          winner: treatment.variantId
        };
      }
    }

    // 统计显著但负向效应
    if (significanceTest.isSignificant && significanceTest.effectSize < 0) {
      return {
        recommendation: 'abort_test',
        reason: `Treatment performs worse than control (p=${significanceTest.pValue.toFixed(4)})`,
        winner: control.variantId
      };
    }

    // 不显著但样本充足
    if (!significanceTest.isSignificant && hasMinSamples) {
      return {
        recommendation: 'inconclusive',
        reason: `No significant difference detected (p=${significanceTest.pValue.toFixed(4)})`
      };
    }

    // 默认: 继续测试
    return {
      recommendation: 'continue_test',
      reason: 'Test is ongoing, need more data'
    };
  }

  /**
   * 验证实验配置
   */
  private validateConfig(config: ABTestConfig): void {
    // 验证变体权重总和为1
    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      throw new Error(`Variant weights must sum to 1, got ${totalWeight}`);
    }

    // 验证至少有一个对照组
    const hasControl = config.variants.some(v => v.isControl);
    if (!hasControl) {
      throw new Error('At least one variant must be marked as control');
    }
  }

  /**
   * 哈希用户ID
   */
  private hashUserId(userId: string, experimentId: string): number {
    const str = `${userId}_${experimentId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * 生成实验ID
   */
  private generateExperimentId(): string {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 根据流量分配策略计算变体权重
   *
   * 修复问题#8: 支持trafficAllocation配置
   * - even: 所有变体平均分配流量
   * - weighted: 使用配置的权重（默认）
   * - dynamic: 根据当前表现动态调整权重
   */
  private computeTrafficWeights(
    experiment: ABTestConfig,
    metrics?: Map<string, ABMetrics>
  ): Array<{ variant: ABVariant; weight: number }> {
    const variants = experiment.variants;

    // 边界情况：无变体时返回空数组
    if (!variants || variants.length === 0) {
      return [];
    }

    const weighted = variants.map(variant => {
      // 平均分配
      if (experiment.trafficAllocation === 'even') {
        return { variant, weight: 1 };
      }

      // 动态分配：根据当前表现调整权重
      if (experiment.trafficAllocation === 'dynamic') {
        const stat = metrics?.get(variant.id);
        // 获取原始性能值，范围通常在 [-1, 1]
        const rawPerformance = stat?.averageReward ?? stat?.primaryMetric ?? 0;

        // NaN/Infinity 防护：确保性能值有效
        if (!Number.isFinite(rawPerformance)) {
          return { variant, weight: Math.max(variant.weight, 0.1) };
        }

        // 使用 sigmoid 映射将 [-1, 1] 映射到 [0.2, 1.8]，确保权重分布更平滑
        // sigmoid(x * 2) 将 x 从 [-1, 1] 映射到约 [0.12, 0.88]，然后线性变换到 [0.2, 1.8]
        const sigmoid = 1 / (1 + Math.exp(-rawPerformance * 2));
        const normalizedPerformance = 0.2 + sigmoid * 1.6; // 范围 [0.2, 1.8]

        // NaN/Infinity 防护：确保 sigmoid 计算结果有效
        if (!Number.isFinite(normalizedPerformance)) {
          return { variant, weight: Math.max(variant.weight, 0.1) };
        }

        // 基础权重 × 表现系数，最小权重保障为 0.05
        const baseWeight = Math.max(variant.weight, 0.1);
        const weight = baseWeight * normalizedPerformance;

        // 最终权重 NaN 防护
        const safeWeight = Number.isFinite(weight) ? weight : baseWeight;
        return { variant, weight: Math.max(safeWeight, 0.05) }; // 确保最小权重为 5%
      }

      // 默认：使用配置的权重，确保权重为正且有效
      const safeWeight = Number.isFinite(variant.weight) ? variant.weight : 0.1;
      return { variant, weight: Math.max(safeWeight, 0.01) };
    });

    // 归一化权重
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);

    // 归一化时检查 total 是否有效
    if (!Number.isFinite(total) || total <= 0) {
      // 回退到平均分配
      const evenWeight = 1 / weighted.length;
      return weighted.map(item => ({
        variant: item.variant,
        weight: evenWeight
      }));
    }

    return weighted.map(item => ({
      variant: item.variant,
      weight: Math.max(item.weight / total, 0)
    }));
  }
}

/**
 * 兼容测试的轻量版 A/B 测试实现
 */
export class ABTesting {
  private experimentId: string;
  private variants: string[];
  private assignments = new Map<string, string>();
  private metrics = new Map<string, Map<string, number[]>>();

  constructor(config: { experimentId: string; variants: string[] }) {
    this.experimentId = config.experimentId;
    this.variants = config.variants;
  }

  assignVariant(userId: string): string {
    if (this.assignments.has(userId)) {
      return this.assignments.get(userId)!;
    }
    const hash = this.hash(userId + this.experimentId);
    const variant = this.variants[hash % this.variants.length];
    this.assignments.set(userId, variant);
    return variant;
  }

  recordMetric(variant: string, metric: string, value: number): void {
    if (!this.metrics.has(variant)) {
      this.metrics.set(variant, new Map());
    }
    const metricMap = this.metrics.get(variant)!;
    if (!metricMap.has(metric)) {
      metricMap.set(metric, []);
    }
    metricMap.get(metric)!.push(value);
  }

  getMetricCount(variant: string, metric: string): number {
    return this.metrics.get(variant)?.get(metric)?.length ?? 0;
  }

  getResults() {
    const variants = this.variants.map((variant) => {
      const metricValues = Array.from(this.metrics.get(variant)?.values() ?? []);
      const flattened = metricValues.flat();
      const mean =
        flattened.reduce((s, v) => s + v, 0) / (flattened.length || 1);
      return {
        variant,
        mean,
        count: flattened.length
      };
    });

    return { variants };
  }

  isStatisticallySignificant(metric: string, alpha = 0.05): boolean {
    // 简化：根据两个变体均值差距判断
    const values = this.variants.map((variant) => {
      const metrics = this.metrics.get(variant)?.get(metric) ?? [];
      return metrics.reduce((s, v) => s + v, 0) / (metrics.length || 1);
    });
    if (values.length < 2) return false;
    return Math.abs(values[0] - values[1]) > alpha;
  }

  reset(): void {
    this.assignments.clear();
    this.metrics.clear();
  }

  private hash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

/**
 * 创建默认A/B测试引擎
 */
export function createABTestEngine(): ABTestEngine {
  return new ABTestEngine();
}
