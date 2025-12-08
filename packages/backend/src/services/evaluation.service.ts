/**
 * AMAS Evaluation Service
 * 评估服务
 *
 * 功能:
 * - 因果推断验证（CausalInference）
 * - 策略效果评估
 */

import { CausalObservation as PrismaCausalObservation } from '@prisma/client';
import prisma from '../config/database';
import { CausalInference, CausalObservation, CausalEstimate } from '../amas';
import { isCausalInferenceEnabled } from '../amas/config/feature-flags';

// ==================== 类型定义 ====================

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
 * 提供因果推断功能
 */
export class EvaluationService {
  /** 因��推断实例（惰性初始化） */
  private causalInference: CausalInference | null = null;

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
  }

  // ==================== 因果推断 API ====================

  /**
   * 记录因果观测数据
   * @param input 观测输入
   * @returns 创建的观测记录
   */
  async recordCausalObservation(
    input: CausalObservationInput,
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
      timestamp,
    };
    this.causalInference.addObservation(observation);

    // 持久化到数据库
    const record = await prisma.causalObservation.create({
      data: {
        userId: input.userId ?? null,
        features: input.features,
        treatment: input.treatment,
        outcome: input.outcome,
        timestamp: BigInt(timestamp),
      },
    });

    return record;
  }

  /**
   * 估计策略效果（平均处理效应 ATE）
   * @returns 因果效应估计结果，样本不足时返回 null
   */
  async estimateStrategyEffect(): Promise<CausalEstimate | null> {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return null;
    }

    try {
      return this.causalInference.estimateATE();
    } catch (error) {
      // 样本不足时返回 null 而不是抛出错误
      // 例如：'[CausalInference] 样本量不足，至少需要10个观测'
      // 或：'[CausalInference] 处理组和对照组各需至少5个样本'
      return null;
    }
  }

  /**
   * 比较两个策略的效果差异
   * @param strategyA 策略A编码
   * @param strategyB 策略B编码
   * @returns 比较结果
   */
  async compareStrategies(
    strategyA: number,
    strategyB: number,
  ): Promise<StrategyComparisonResult | null> {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return null;
    }

    // 从数据库加载观测数据
    const observations = await prisma.causalObservation.findMany({
      where: {
        treatment: { in: [strategyA, strategyB] },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (observations.length < 20) {
      return null; // 样本量不足
    }

    const groupA = observations.filter((o) => o.treatment === strategyA);
    const groupB = observations.filter((o) => o.treatment === strategyB);

    if (groupA.length < 10 || groupB.length < 10) {
      return null; // 单组样本量不足
    }

    // 计算均值和标准差
    const meanA = groupA.reduce((s, o) => s + o.outcome, 0) / groupA.length;
    const meanB = groupB.reduce((s, o) => s + o.outcome, 0) / groupB.length;

    const varA =
      groupA.reduce((s, o) => s + Math.pow(o.outcome - meanA, 2), 0) / (groupA.length - 1);
    const varB =
      groupB.reduce((s, o) => s + Math.pow(o.outcome - meanB, 2), 0) / (groupB.length - 1);

    const effectDifference = meanB - meanA;
    const pooledSE = Math.sqrt(varA / groupA.length + varB / groupB.length);

    // Z检验（双侧）
    const zScore = pooledSE > 0 ? effectDifference / pooledSE : 0;
    const isSignificant = Math.abs(zScore) > 1.96; // 95%置信水平

    // 置信区间
    const marginOfError = 1.96 * pooledSE;
    const confidenceInterval: [number, number] = [
      effectDifference - marginOfError,
      effectDifference + marginOfError,
    ];

    return {
      strategyA,
      strategyB,
      effectDifference,
      isSignificant,
      confidenceInterval,
      sampleSizeA: groupA.length,
      sampleSizeB: groupB.length,
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
      _count: { id: true },
    });

    const treatmentDistribution: Record<number, number> = {};
    let total = 0;
    for (const group of distribution) {
      treatmentDistribution[group.treatment] = group._count.id;
      total += group._count.id;
    }

    // 尝试获取最新估计，样本不足时返回 null
    let latestEstimate: CausalEstimate | null = null;
    try {
      latestEstimate = this.causalInference?.estimateATE() ?? null;
    } catch {
      // 样本不足时忽略错误，保持 latestEstimate 为 null
    }

    return {
      observationCount: total,
      treatmentDistribution,
      latestEstimate,
    };
  }
}

// 导出单例
export const evaluationService = new EvaluationService();
