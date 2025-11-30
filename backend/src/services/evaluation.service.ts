/**
 * AMAS Evaluation Service
 * 评估服务
 *
 * 功能:
 * - 因果推断验证（CausalInference）
 * - A/B测试实验管理（ABTestEngine）
 * - 策略效果评估
 */

import {
  ABExperiment,
  ABVariant,
  ABExperimentMetrics,
  ABUserAssignment,
  CausalObservation as PrismaCausalObservation,
  ABExperimentStatus,
  ABTrafficAllocation,
  Prisma
} from '@prisma/client';
import prisma from '../config/database';
import {
  CausalInference,
  CausalObservation,
  CausalEstimate,
  ABTestEngine,
  ABTestConfig,
  ABVariant as ABVariantType,
  ABMetrics,
  ABTestResult,
  createABTestEngine
} from '../amas';
import {
  isCausalInferenceEnabled,
  isABTestEngineEnabled
} from '../amas/config/feature-flags';

// ==================== 类型定义 ====================

/** 创建实验参数 */
export interface CreateExperimentParams {
  name: string;
  description?: string;
  trafficAllocation?: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
  minSampleSize?: number;
  significanceLevel?: number;
  minimumDetectableEffect?: number;
  autoDecision?: boolean;
  variants: Array<{
    name: string;
    weight?: number;
    isControl?: boolean;
    parameters?: Record<string, unknown>;
  }>;
}

/** 因果观测输入参数 */
export interface CausalObservationInput {
  userId?: string;
  features: number[];
  treatment: number;
  outcome: number;
}

/** 策略效果比较结果 */
export interface StrategyComparisonResult {
  strategyA: number;
  strategyB: number;
  effectDifference: number;
  isSignificant: boolean;
  confidenceInterval: [number, number];
  sampleSizeA: number;
  sampleSizeB: number;
}

// ==================== 评估服务类 ====================

/**
 * 评估服务
 * 提供因果推断和A/B测试功能
 */
export class EvaluationService {
  /** 因果推断实例（惰性初始化） */
  private causalInference: CausalInference | null = null;

  /** A/B测试引擎实例（惰性初始化） */
  private abTestEngine: ABTestEngine | null = null;

  /** 内存中的实验配置缓存 */
  private experimentsCache: Map<string, ABTestConfig> = new Map();

  constructor() {
    this.initializeModules();
  }

  /**
   * 初始化模块（按功能开关）
   */
  private initializeModules(): void {
    if (isCausalInferenceEnabled()) {
      this.causalInference = new CausalInference();
    }
    if (isABTestEngineEnabled()) {
      this.abTestEngine = createABTestEngine();
    }
  }

  // ==================== 因果推断 API ====================

  /**
   * 记录因果观测数据
   * @param input 观测输入
   * @returns 创建的观测记录
   */
  async recordCausalObservation(
    input: CausalObservationInput
  ): Promise<PrismaCausalObservation | null> {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return null;
    }

    // 验证输入
    if (input.treatment !== 0 && input.treatment !== 1) {
      throw new Error('treatment 必须为 0 或 1');
    }
    if (input.outcome < -1 || input.outcome > 1) {
      throw new Error('outcome 必须在 [-1, 1] 范围内');
    }

    const timestamp = Date.now();

    // 记录到内存模型
    const observation: CausalObservation = {
      features: input.features,
      treatment: input.treatment,
      outcome: input.outcome,
      timestamp
    };
    this.causalInference.addObservation(observation);

    // 持久化到数据库
    const record = await prisma.causalObservation.create({
      data: {
        userId: input.userId ?? null,
        features: input.features,
        treatment: input.treatment,
        outcome: input.outcome,
        timestamp: BigInt(timestamp)
      }
    });

    return record;
  }

  /**
   * 估计策略效果（平均处理效应 ATE）
   * @returns 因果效应估计结果
   */
  async estimateStrategyEffect(): Promise<CausalEstimate | null> {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return null;
    }

    return this.causalInference.estimateATE();
  }

  /**
   * 比较两个策略的效果差异
   * @param strategyA 策略A编码
   * @param strategyB 策略B编码
   * @returns 比较结果
   */
  async compareStrategies(
    strategyA: number,
    strategyB: number
  ): Promise<StrategyComparisonResult | null> {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return null;
    }

    // 从数据库加载观测数据
    const observations = await prisma.causalObservation.findMany({
      where: {
        treatment: { in: [strategyA, strategyB] }
      },
      orderBy: { timestamp: 'asc' }
    });

    if (observations.length < 20) {
      return null; // 样本量不足
    }

    const groupA = observations.filter(o => o.treatment === strategyA);
    const groupB = observations.filter(o => o.treatment === strategyB);

    if (groupA.length < 10 || groupB.length < 10) {
      return null; // 单组样本量不足
    }

    // 计算均值和标准差
    const meanA = groupA.reduce((s, o) => s + o.outcome, 0) / groupA.length;
    const meanB = groupB.reduce((s, o) => s + o.outcome, 0) / groupB.length;

    const varA =
      groupA.reduce((s, o) => s + Math.pow(o.outcome - meanA, 2), 0) /
      (groupA.length - 1);
    const varB =
      groupB.reduce((s, o) => s + Math.pow(o.outcome - meanB, 2), 0) /
      (groupB.length - 1);

    const effectDifference = meanB - meanA;
    const pooledSE = Math.sqrt(varA / groupA.length + varB / groupB.length);

    // Z检验（双侧）
    const zScore = pooledSE > 0 ? effectDifference / pooledSE : 0;
    const isSignificant = Math.abs(zScore) > 1.96; // 95%置信水平

    // 置信区间
    const marginOfError = 1.96 * pooledSE;
    const confidenceInterval: [number, number] = [
      effectDifference - marginOfError,
      effectDifference + marginOfError
    ];

    return {
      strategyA,
      strategyB,
      effectDifference,
      isSignificant,
      confidenceInterval,
      sampleSizeA: groupA.length,
      sampleSizeB: groupB.length
    };
  }

  /**
   * 获取因果推断诊断信息
   */
  async getCausalDiagnostics(): Promise<{
    observationCount: number;
    treatmentDistribution: Record<number, number>;
    latestEstimate: CausalEstimate | null;
  } | null> {
    if (!isCausalInferenceEnabled()) {
      return null;
    }

    // 统计观测数据分布
    const distribution = await prisma.causalObservation.groupBy({
      by: ['treatment'],
      _count: { id: true }
    });

    const treatmentDistribution: Record<number, number> = {};
    let total = 0;
    for (const group of distribution) {
      treatmentDistribution[group.treatment] = group._count.id;
      total += group._count.id;
    }

    return {
      observationCount: total,
      treatmentDistribution,
      latestEstimate: this.causalInference?.estimateATE() ?? null
    };
  }

  // ==================== A/B测试 API ====================

  /**
   * 创建A/B测试实验
   * @param params 实验配置参数
   * @returns 创建的实验
   */
  async createExperiment(
    params: CreateExperimentParams
  ): Promise<ABExperiment> {
    if (!isABTestEngineEnabled()) {
      throw new Error('A/B测试引擎未启用');
    }

    // 验证变体配置
    if (!params.variants || params.variants.length < 2) {
      throw new Error('至少需要两个变体');
    }

    const hasControl = params.variants.some(v => v.isControl);
    if (!hasControl) {
      // 默认第一个为对照组
      params.variants[0].isControl = true;
    }

    // 创建实验和变体（事务）
    const experiment = await prisma.$transaction(async tx => {
      const exp = await tx.aBExperiment.create({
        data: {
          name: params.name,
          description: params.description ?? null,
          trafficAllocation:
            (params.trafficAllocation as ABTrafficAllocation) ??
            ABTrafficAllocation.WEIGHTED,
          minSampleSize: params.minSampleSize ?? 100,
          significanceLevel: params.significanceLevel ?? 0.05,
          minimumDetectableEffect: params.minimumDetectableEffect ?? 0.05,
          autoDecision: params.autoDecision ?? false,
          status: ABExperimentStatus.DRAFT
        }
      });

      // 创建变体
      for (const variant of params.variants) {
        await tx.aBVariant.create({
          data: {
            experimentId: exp.id,
            name: variant.name,
            weight: variant.weight ?? 1 / params.variants.length,
            isControl: variant.isControl ?? false,
            parameters: (variant.parameters ?? {}) as Prisma.InputJsonValue
          }
        });
      }

      // 初始化指标记录
      const variants = await tx.aBVariant.findMany({
        where: { experimentId: exp.id }
      });

      for (const v of variants) {
        await tx.aBExperimentMetrics.create({
          data: {
            experimentId: exp.id,
            variantId: v.id
          }
        });
      }

      return exp;
    });

    return experiment;
  }

  /**
   * 启动实验
   * @param experimentId 实验ID
   */
  async startExperiment(experimentId: string): Promise<ABExperiment> {
    const experiment = await prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true }
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    if (experiment.status !== ABExperimentStatus.DRAFT) {
      throw new Error('只有草稿状态的实验可以启动');
    }

    if (experiment.variants.length < 2) {
      throw new Error('至少需要两个变体');
    }

    return prisma.aBExperiment.update({
      where: { id: experimentId },
      data: {
        status: ABExperimentStatus.RUNNING,
        startedAt: new Date()
      }
    });
  }

  /**
   * 为用户分配实验变体
   * @param experimentId 实验ID
   * @param userId 用户ID
   * @returns 分配的变体
   */
  async assignVariant(
    experimentId: string,
    userId: string
  ): Promise<ABVariant | null> {
    if (!isABTestEngineEnabled()) {
      return null;
    }

    // 检查是否已分配
    const existing = await prisma.aBUserAssignment.findUnique({
      where: {
        userId_experimentId: { userId, experimentId }
      },
      include: { variant: true }
    });

    if (existing) {
      return existing.variant;
    }

    // 获取实验和变体
    const experiment = await prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true }
    });

    if (!experiment || experiment.status !== ABExperimentStatus.RUNNING) {
      return null;
    }

    // 根据权重分配变体
    const variant = this.selectVariantByWeight(experiment.variants);

    if (!variant) {
      return null;
    }

    // 持久化分配
    await prisma.aBUserAssignment.create({
      data: {
        userId,
        experimentId,
        variantId: variant.id
      }
    });

    return variant;
  }

  /**
   * 根据权重选择变体
   */
  private selectVariantByWeight(variants: ABVariant[]): ABVariant | null {
    if (variants.length === 0) return null;

    const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of variants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant;
      }
    }

    return variants[variants.length - 1];
  }

  /**
   * 记录实验指标
   * @param experimentId 实验ID
   * @param variantId 变体ID
   * @param reward 奖励值
   */
  async recordExperimentMetrics(
    experimentId: string,
    variantId: string,
    reward: number
  ): Promise<void> {
    if (!isABTestEngineEnabled()) {
      return;
    }

    // Welford在线算法更新均值和方差
    await prisma.$transaction(async tx => {
      const metrics = await tx.aBExperimentMetrics.findUnique({
        where: {
          experimentId_variantId: { experimentId, variantId }
        }
      });

      if (!metrics) {
        return;
      }

      const n = metrics.sampleCount + 1;
      const delta = reward - metrics.averageReward;
      const newMean = metrics.averageReward + delta / n;
      const delta2 = reward - newMean;
      const newM2 = metrics.m2 + delta * delta2;
      const newStdDev = n > 1 ? Math.sqrt(newM2 / (n - 1)) : 0;

      await tx.aBExperimentMetrics.update({
        where: {
          experimentId_variantId: { experimentId, variantId }
        },
        data: {
          sampleCount: n,
          averageReward: newMean,
          m2: newM2,
          stdDev: newStdDev,
          primaryMetric: newMean
        }
      });
    });
  }

  /**
   * 分析实验结果
   * @param experimentId 实验ID
   * @returns 分析结果
   */
  async analyzeExperiment(experimentId: string): Promise<{
    experiment: ABExperiment;
    metrics: ABExperimentMetrics[];
    isSignificant: boolean;
    winner: ABVariant | null;
    improvement: number;
  } | null> {
    const experiment = await prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        metrics: { include: { variant: true } }
      }
    });

    if (!experiment) {
      return null;
    }

    const controlVariant = experiment.variants.find(v => v.isControl);
    const controlMetrics = experiment.metrics.find(
      m => m.variantId === controlVariant?.id
    );

    if (!controlMetrics || controlMetrics.sampleCount < experiment.minSampleSize) {
      return {
        experiment,
        metrics: experiment.metrics,
        isSignificant: false,
        winner: null,
        improvement: 0
      };
    }

    // 找出最佳变体
    let bestVariant: ABVariant | null = null;
    let bestImprovement = 0;
    let isSignificant = false;

    for (const metrics of experiment.metrics) {
      if (metrics.variantId === controlVariant?.id) continue;
      if (metrics.sampleCount < experiment.minSampleSize) continue;

      const improvement =
        controlMetrics.averageReward > 0
          ? (metrics.averageReward - controlMetrics.averageReward) /
            controlMetrics.averageReward
          : metrics.averageReward - controlMetrics.averageReward;

      // Z检验
      const pooledSE = Math.sqrt(
        Math.pow(controlMetrics.stdDev, 2) / controlMetrics.sampleCount +
          Math.pow(metrics.stdDev, 2) / metrics.sampleCount
      );

      const zScore =
        pooledSE > 0
          ? (metrics.averageReward - controlMetrics.averageReward) / pooledSE
          : 0;

      const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
      const variantSignificant = pValue < experiment.significanceLevel;

      if (
        variantSignificant &&
        improvement > bestImprovement &&
        improvement >= experiment.minimumDetectableEffect
      ) {
        bestImprovement = improvement;
        bestVariant = experiment.variants.find(v => v.id === metrics.variantId) ?? null;
        isSignificant = true;
      }
    }

    return {
      experiment,
      metrics: experiment.metrics,
      isSignificant,
      winner: bestVariant,
      improvement: bestImprovement
    };
  }

  /**
   * 标准正态分布CDF（近似）
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 完成实验
   * @param experimentId 实验ID
   * @param deploy 是否部署获胜变体
   */
  async completeExperiment(
    experimentId: string,
    deploy = false
  ): Promise<ABExperiment> {
    const experiment = await prisma.aBExperiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    if (experiment.status !== ABExperimentStatus.RUNNING) {
      throw new Error('只有运行中的实验可以完成');
    }

    return prisma.aBExperiment.update({
      where: { id: experimentId },
      data: {
        status: ABExperimentStatus.COMPLETED,
        endedAt: new Date()
      }
    });
  }

  /**
   * 获取实验列表
   */
  async listExperiments(
    status?: ABExperimentStatus
  ): Promise<ABExperiment[]> {
    return prisma.aBExperiment.findMany({
      where: status ? { status } : undefined,
      include: { variants: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 获取实验详情
   */
  async getExperiment(experimentId: string): Promise<ABExperiment | null> {
    return prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        metrics: true,
        assignments: { take: 100 }
      }
    });
  }

  /**
   * 获取用户的变体分配
   */
  async getUserVariant(
    experimentId: string,
    userId: string
  ): Promise<ABVariant | null> {
    const assignment = await prisma.aBUserAssignment.findUnique({
      where: {
        userId_experimentId: { userId, experimentId }
      },
      include: { variant: true }
    });

    return assignment?.variant ?? null;
  }
}

// 导出单例
export const evaluationService = new EvaluationService();
