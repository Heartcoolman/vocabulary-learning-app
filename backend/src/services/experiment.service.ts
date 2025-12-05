/**
 * 实验管理服务
 * 提供 A/B 测试实验的创建、管理和统计分析功能
 */

import { PrismaClient, ABExperimentStatus, ABTrafficAllocation, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../logger';

// ==================== 类型定义 ====================

export interface CreateExperimentInput {
  name: string;
  description?: string;
  trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
  minSampleSize: number;
  significanceLevel: number;
  minimumDetectableEffect: number;
  autoDecision: boolean;
  variants: Array<{
    id: string;
    name: string;
    weight: number;
    isControl: boolean;
    parameters: Record<string, unknown>;
  }>;
}

export interface ExperimentStatus {
  status: 'running' | 'completed' | 'stopped';
  pValue: number;
  effectSize: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  isSignificant: boolean;
  statisticalPower: number;
  sampleSizes: Array<{
    variantId: string;
    sampleCount: number;
  }>;
  winner: string | null;
  recommendation: string;
  reason: string;
  isActive: boolean;
}

export interface ExperimentListItem {
  id: string;
  name: string;
  description: string | null;
  status: ABExperimentStatus;
  trafficAllocation: ABTrafficAllocation;
  minSampleSize: number;
  significanceLevel: number;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  variantCount: number;
  totalSamples: number;
}

// ==================== 服务实现 ====================

class ExperimentService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * 创建新实验
   */
  async createExperiment(input: CreateExperimentInput): Promise<{ id: string; name: string }> {
    const { name, description, trafficAllocation, minSampleSize, significanceLevel, minimumDetectableEffect, autoDecision, variants } = input;

    // 验证变体权重
    if (variants.length < 2) {
      throw new Error('实验至少需要两个变体');
    }

    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      throw new Error('变体权重总和必须为 1');
    }

    const controlCount = variants.filter(v => v.isControl).length;
    if (controlCount !== 1) {
      throw new Error('必须有且仅有一个控制组');
    }

    // 映射流量分配类型
    const allocationMap: Record<string, ABTrafficAllocation> = {
      'EVEN': ABTrafficAllocation.EVEN,
      'WEIGHTED': ABTrafficAllocation.WEIGHTED,
      'DYNAMIC': ABTrafficAllocation.DYNAMIC,
    };

    const experiment = await this.prisma.aBExperiment.create({
      data: {
        name,
        description,
        trafficAllocation: allocationMap[trafficAllocation] || ABTrafficAllocation.WEIGHTED,
        minSampleSize,
        significanceLevel,
        minimumDetectableEffect,
        autoDecision,
        status: ABExperimentStatus.DRAFT,
        variants: {
          create: variants.map(v => ({
            id: v.id,
            name: v.name,
            weight: v.weight,
            isControl: v.isControl,
            parameters: v.parameters as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        variants: true,
      },
    });

    logger.info({ experimentId: experiment.id, name: experiment.name }, '实验创建成功');

    return {
      id: experiment.id,
      name: experiment.name,
    };
  }

  /**
   * 获取实验列表
   */
  async listExperiments(params: {
    status?: ABExperimentStatus;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ experiments: ExperimentListItem[]; total: number }> {
    const { status, page = 1, pageSize = 20 } = params;

    const where = status ? { status } : {};

    const [experiments, total] = await Promise.all([
      this.prisma.aBExperiment.findMany({
        where,
        include: {
          variants: true,
          metrics: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aBExperiment.count({ where }),
    ]);

    const items: ExperimentListItem[] = experiments.map(exp => ({
      id: exp.id,
      name: exp.name,
      description: exp.description,
      status: exp.status,
      trafficAllocation: exp.trafficAllocation,
      minSampleSize: exp.minSampleSize,
      significanceLevel: exp.significanceLevel,
      startedAt: exp.startedAt,
      endedAt: exp.endedAt,
      createdAt: exp.createdAt,
      updatedAt: exp.updatedAt,
      variantCount: exp.variants.length,
      totalSamples: exp.metrics.reduce((sum, m) => sum + m.sampleCount, 0),
    }));

    return { experiments: items, total };
  }

  /**
   * 获取实验详情
   */
  async getExperiment(experimentId: string) {
    const experiment = await this.prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        metrics: true,
      },
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    return experiment;
  }

  /**
   * 获取实验状态（统计分析）
   */
  async getExperimentStatus(experimentId: string): Promise<ExperimentStatus> {
    const experiment = await this.prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        metrics: true,
      },
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    // 计算样本量
    const sampleSizes = experiment.metrics.map(m => ({
      variantId: m.variantId,
      sampleCount: m.sampleCount,
    }));

    const totalSamples = sampleSizes.reduce((sum, s) => sum + s.sampleCount, 0);

    // 获取控制组和实验组指标
    const controlVariant = experiment.variants.find(v => v.isControl);
    const treatmentVariant = experiment.variants.find(v => !v.isControl);

    if (!controlVariant || !treatmentVariant) {
      return this.getDefaultStatus(experiment.status, sampleSizes);
    }

    const controlMetrics = experiment.metrics.find(m => m.variantId === controlVariant.id);
    const treatmentMetrics = experiment.metrics.find(m => m.variantId === treatmentVariant.id);

    // 如果没有数据，返回默认状态
    if (!controlMetrics || !treatmentMetrics || controlMetrics.sampleCount === 0 || treatmentMetrics.sampleCount === 0) {
      return this.getDefaultStatus(experiment.status, sampleSizes);
    }

    // 计算效应量
    const controlMean = controlMetrics.averageReward;
    const treatmentMean = treatmentMetrics.averageReward;
    const effectSize = controlMean !== 0 ? (treatmentMean - controlMean) / controlMean : 0;

    // 计算统计显著性（简化的 t-test）
    const { pValue, isSignificant, confidenceInterval } = this.calculateSignificance(
      controlMetrics,
      treatmentMetrics,
      experiment.significanceLevel
    );

    // 计算统计功效
    const statisticalPower = this.calculatePower(
      controlMetrics.sampleCount,
      treatmentMetrics.sampleCount,
      effectSize,
      experiment.significanceLevel
    );

    // 确定获胜者和建议
    let winner: string | null = null;
    let recommendation = '';
    let reason = '';

    if (isSignificant && effectSize > experiment.minimumDetectableEffect) {
      winner = effectSize > 0 ? treatmentVariant.id : controlVariant.id;
      recommendation = `建议采用 ${winner === treatmentVariant.id ? treatmentVariant.name : controlVariant.name}`;
      reason = `效应量 ${(effectSize * 100).toFixed(1)}% 超过最小可检测效应 ${(experiment.minimumDetectableEffect * 100).toFixed(1)}%，且统计显著`;
    } else if (totalSamples < experiment.minSampleSize) {
      recommendation = '继续收集数据';
      reason = `当前样本量 ${totalSamples} 未达到最小要求 ${experiment.minSampleSize}`;
    } else if (!isSignificant) {
      recommendation = '无显著差异，可考虑结束实验';
      reason = `p值 ${pValue.toFixed(4)} 大于显著性水平 ${experiment.significanceLevel}`;
    } else {
      recommendation = '效应量较小，建议继续观察';
      reason = `效应量 ${(effectSize * 100).toFixed(1)}% 未达到最小可检测效应`;
    }

    // 映射状态
    const statusMap: Record<ABExperimentStatus, 'running' | 'completed' | 'stopped'> = {
      [ABExperimentStatus.DRAFT]: 'stopped',
      [ABExperimentStatus.RUNNING]: 'running',
      [ABExperimentStatus.COMPLETED]: 'completed',
      [ABExperimentStatus.ABORTED]: 'stopped',
    };

    return {
      status: statusMap[experiment.status],
      pValue,
      effectSize,
      confidenceInterval,
      isSignificant,
      statisticalPower,
      sampleSizes,
      winner,
      recommendation,
      reason,
      isActive: experiment.status === ABExperimentStatus.RUNNING,
    };
  }

  /**
   * 启动实验
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = await this.prisma.aBExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    if (experiment.status !== ABExperimentStatus.DRAFT) {
      throw new Error('只能启动草稿状态的实验');
    }

    if (experiment.variants.length < 2) {
      throw new Error('实验至少需要两个变体');
    }

    // 初始化指标记录
    await this.prisma.$transaction([
      // 更新实验状态
      this.prisma.aBExperiment.update({
        where: { id: experimentId },
        data: {
          status: ABExperimentStatus.RUNNING,
          startedAt: new Date(),
        },
      }),
      // 创建指标记录
      ...experiment.variants.map(variant =>
        this.prisma.aBExperimentMetrics.upsert({
          where: {
            experimentId_variantId: {
              experimentId,
              variantId: variant.id,
            },
          },
          update: {},
          create: {
            experimentId,
            variantId: variant.id,
            sampleCount: 0,
            primaryMetric: 0,
            averageReward: 0,
            stdDev: 0,
            m2: 0,
          },
        })
      ),
    ]);

    logger.info({ experimentId }, '实验已启动');
  }

  /**
   * 停止实验
   */
  async stopExperiment(experimentId: string): Promise<void> {
    const experiment = await this.prisma.aBExperiment.findUnique({
      where: { id: experimentId },
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    if (experiment.status !== ABExperimentStatus.RUNNING) {
      throw new Error('只能停止运行中的实验');
    }

    await this.prisma.aBExperiment.update({
      where: { id: experimentId },
      data: {
        status: ABExperimentStatus.COMPLETED,
        endedAt: new Date(),
      },
    });

    logger.info({ experimentId }, '实验已停止');
  }

  /**
   * 删除实验
   */
  async deleteExperiment(experimentId: string): Promise<void> {
    const experiment = await this.prisma.aBExperiment.findUnique({
      where: { id: experimentId },
    });

    if (!experiment) {
      throw new Error('实验不存在');
    }

    if (experiment.status === ABExperimentStatus.RUNNING) {
      throw new Error('无法删除运行中的实验');
    }

    await this.prisma.aBExperiment.delete({
      where: { id: experimentId },
    });

    logger.info({ experimentId }, '实验已删除');
  }

  /**
   * 记录实验指标（用于用户参与实验时更新指标）
   */
  async recordMetric(experimentId: string, variantId: string, reward: number): Promise<void> {
    const metrics = await this.prisma.aBExperimentMetrics.findUnique({
      where: {
        experimentId_variantId: {
          experimentId,
          variantId,
        },
      },
    });

    if (!metrics) {
      throw new Error('指标记录不存在');
    }

    // Welford 算法更新均值和方差
    const n = metrics.sampleCount + 1;
    const delta = reward - metrics.averageReward;
    const newMean = metrics.averageReward + delta / n;
    const delta2 = reward - newMean;
    const newM2 = metrics.m2 + delta * delta2;
    const newStdDev = n > 1 ? Math.sqrt(newM2 / (n - 1)) : 0;

    await this.prisma.aBExperimentMetrics.update({
      where: {
        experimentId_variantId: {
          experimentId,
          variantId,
        },
      },
      data: {
        sampleCount: n,
        averageReward: newMean,
        m2: newM2,
        stdDev: newStdDev,
        primaryMetric: newMean, // 主要指标使用平均奖励
      },
    });
  }

  // ==================== 私有方法 ====================

  /**
   * 计算统计显著性
   */
  private calculateSignificance(
    controlMetrics: { averageReward: number; stdDev: number; sampleCount: number },
    treatmentMetrics: { averageReward: number; stdDev: number; sampleCount: number },
    significanceLevel: number
  ): { pValue: number; isSignificant: boolean; confidenceInterval: { lower: number; upper: number } } {
    const n1 = controlMetrics.sampleCount;
    const n2 = treatmentMetrics.sampleCount;
    const mean1 = controlMetrics.averageReward;
    const mean2 = treatmentMetrics.averageReward;
    const std1 = controlMetrics.stdDev;
    const std2 = treatmentMetrics.stdDev;

    // 合并标准误
    const se = Math.sqrt((std1 * std1) / n1 + (std2 * std2) / n2);

    // 效应差
    const diff = mean2 - mean1;

    // t 统计量
    const t = se > 0 ? diff / se : 0;

    // 自由度（Welch-Satterthwaite）
    const df = se > 0
      ? Math.pow((std1 * std1) / n1 + (std2 * std2) / n2, 2) /
        (Math.pow((std1 * std1) / n1, 2) / (n1 - 1) + Math.pow((std2 * std2) / n2, 2) / (n2 - 1))
      : 1;

    // 简化的 p 值计算（使用正态近似）
    const pValue = 2 * (1 - this.normalCDF(Math.abs(t)));

    // 95% 置信区间
    const zCritical = 1.96;
    const margin = zCritical * se;
    const relativeDiff = mean1 !== 0 ? diff / mean1 : 0;
    const relativeMargin = mean1 !== 0 ? margin / Math.abs(mean1) : 0;

    return {
      pValue: Math.max(0, Math.min(1, pValue)),
      isSignificant: pValue < significanceLevel,
      confidenceInterval: {
        lower: relativeDiff - relativeMargin,
        upper: relativeDiff + relativeMargin,
      },
    };
  }

  /**
   * 计算统计功效
   */
  private calculatePower(
    n1: number,
    n2: number,
    effectSize: number,
    alpha: number
  ): number {
    // 简化的功效计算
    const pooledN = 2 / (1 / n1 + 1 / n2);
    const nonCentrality = Math.abs(effectSize) * Math.sqrt(pooledN / 2);
    const zAlpha = this.normalQuantile(1 - alpha / 2);
    const power = 1 - this.normalCDF(zAlpha - nonCentrality);
    return Math.max(0, Math.min(1, power));
  }

  /**
   * 标准正态分布 CDF
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * 标准正态分布分位数（近似）
   */
  private normalQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [
      -3.969683028665376e1,
      2.209460984245205e2,
      -2.759285104469687e2,
      1.383577518672690e2,
      -3.066479806614716e1,
      2.506628277459239e0,
    ];
    const b = [
      -5.447609879822406e1,
      1.615858368580409e2,
      -1.556989798598866e2,
      6.680131188771972e1,
      -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3,
      -3.223964580411365e-1,
      -2.400758277161838e0,
      -2.549732539343734e0,
      4.374664141464968e0,
      2.938163982698783e0,
    ];
    const d = [
      7.784695709041462e-3,
      3.224671290700398e-1,
      2.445134137142996e0,
      3.754408661907416e0,
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
   * 获取默认状态
   */
  private getDefaultStatus(
    status: ABExperimentStatus,
    sampleSizes: Array<{ variantId: string; sampleCount: number }>
  ): ExperimentStatus {
    const statusMap: Record<ABExperimentStatus, 'running' | 'completed' | 'stopped'> = {
      [ABExperimentStatus.DRAFT]: 'stopped',
      [ABExperimentStatus.RUNNING]: 'running',
      [ABExperimentStatus.COMPLETED]: 'completed',
      [ABExperimentStatus.ABORTED]: 'stopped',
    };

    return {
      status: statusMap[status],
      pValue: 1,
      effectSize: 0,
      confidenceInterval: { lower: 0, upper: 0 },
      isSignificant: false,
      statisticalPower: 0,
      sampleSizes,
      winner: null,
      recommendation: '数据不足，无法进行分析',
      reason: '需要更多样本数据',
      isActive: status === ABExperimentStatus.RUNNING,
    };
  }
}

// 导出单例
export const experimentService = new ExperimentService();
