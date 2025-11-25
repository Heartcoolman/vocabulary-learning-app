/**
 * A/B Testing Platform - A/B测试平台
 * 支持流量分配、统计显著性检验和自动化决策
 */

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
 */
export class ABTestEngine {
  private experiments: Map<string, ABTestConfig> = new Map();
  private metricsStore: Map<string, Map<string, ABMetrics>> = new Map();

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
    console.log(`[ABTest] Started experiment: ${experiment.name}`);
  }

  /**
   * 分配用户到变体
   */
  assignVariant(experimentId: string, userId: string): ABVariant {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      throw new Error(`Experiment ${experimentId} not available`);
    }

    // 基于用户ID的确定性哈希分配
    const hash = this.hashUserId(userId, experimentId);
    const randomValue = hash % 100 / 100; // 0-1之间

    // 根据权重分配变体
    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (randomValue < cumulativeWeight) {
        return variant;
      }
    }

    // 默认返回对照组
    return experiment.variants.find(v => v.isControl) || experiment.variants[0];
  }

  /**
   * 记录指标
   */
  recordMetrics(experimentId: string, variantId: string, metrics: Partial<ABMetrics>): void {
    const experimentMetrics = this.metricsStore.get(experimentId);
    if (!experimentMetrics) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const currentMetrics = experimentMetrics.get(variantId) || {
      variantId,
      sampleCount: 0,
      primaryMetric: 0,
      averageReward: 0,
      stdDev: 0
    };

    // 增量更新指标
    const updatedMetrics: ABMetrics = {
      ...currentMetrics,
      ...metrics,
      sampleCount: (currentMetrics.sampleCount || 0) + (metrics.sampleCount || 1)
    };

    experimentMetrics.set(variantId, updatedMetrics);
  }

  /**
   * 分析实验结果
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

    // 找到对照组和处理组
    const controlMetrics = variantMetrics.find(
      m => experiment.variants.find(v => v.id === m.variantId)?.isControl
    );
    const treatmentMetrics = variantMetrics.find(
      m => !experiment.variants.find(v => v.id === m.variantId)?.isControl
    );

    if (!controlMetrics || !treatmentMetrics) {
      return {
        config: experiment,
        variantMetrics,
        significanceTest: {
          isSignificant: false,
          pValue: 1,
          confidenceInterval: [0, 0],
          effectSize: 0,
          statisticalPower: 0
        },
        recommendation: 'continue_test',
        reason: 'Insufficient data for analysis'
      };
    }

    // 执行统计显著性检验
    const significanceTest = this.performTTest(controlMetrics, treatmentMetrics, experiment.significanceLevel);

    // 判断是否达到最小样本数
    const hasMinSamples = variantMetrics.every(m => m.sampleCount >= experiment.minSampleSize);

    // 生成决策建议
    const { recommendation, reason, winner } = this.generateDecision(
      experiment,
      significanceTest,
      hasMinSamples,
      treatmentMetrics,
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
      console.log(`[ABTest] Completed experiment: ${experiment.name}`);
      console.log(`[ABTest] Winner: ${result.winner || 'None'}`);
      console.log(`[ABTest] Recommendation: ${result.recommendation}`);
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
    console.log(`[ABTest] Aborted experiment: ${experiment.name}. Reason: ${reason}`);
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
   * 执行t检验
   */
  private performTTest(
    control: ABMetrics,
    treatment: ABMetrics,
    alpha: number
  ): SignificanceTestResult {
    const n1 = control.sampleCount;
    const n2 = treatment.sampleCount;
    const mean1 = control.primaryMetric || control.averageReward;
    const mean2 = treatment.primaryMetric || treatment.averageReward;
    const std1 = control.stdDev;
    const std2 = treatment.stdDev;

    // 计算合并标准差
    const pooledStd = Math.sqrt(
      ((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2)
    );

    // 计算t统计量
    const t = (mean2 - mean1) / (pooledStd * Math.sqrt(1 / n1 + 1 / n2));

    // 计算自由度
    const df = n1 + n2 - 2;

    // 计算p值 (简化: 使用正态近似)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(t)));

    // 是否显著
    const isSignificant = pValue < alpha;

    // 计算置信区间
    const criticalValue = 1.96; // 95%置信度
    const marginOfError = criticalValue * pooledStd * Math.sqrt(1 / n1 + 1 / n2);
    const confidenceInterval: [number, number] = [
      mean2 - mean1 - marginOfError,
      mean2 - mean1 + marginOfError
    ];

    // 效应大小 (Cohen's d)
    const effectSize = (mean2 - mean1) / pooledStd;

    // 统计功效 (简化计算)
    const statisticalPower = isSignificant ? 0.8 : 0.5;

    return {
      isSignificant,
      pValue,
      confidenceInterval,
      effectSize,
      statisticalPower
    };
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
      const improvement =
        ((treatment.averageReward - control.averageReward) / Math.abs(control.averageReward)) *
        100;

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
}

/**
 * 创建默认A/B测试引擎
 */
export function createABTestEngine(): ABTestEngine {
  return new ABTestEngine();
}
