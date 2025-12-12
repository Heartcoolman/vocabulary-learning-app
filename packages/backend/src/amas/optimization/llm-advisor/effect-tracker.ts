/**
 * Effect Tracker
 * 建议效果追踪服务
 *
 * 追踪 LLM 建议应用后的实际效果，支持闭环反馈
 */

import prisma from '../../../config/database';
import { amasLogger } from '../../../logger';
import { statsCollector, WeeklyStats } from './stats-collector';
import { llmProviderService } from '../../../services/llm-provider.service';
import { llmConfig } from '../../../config/llm.config';

// ==================== 类型定义 ====================

/**
 * 效果追踪记录
 */
export interface EffectTrackingRecord {
  id: string;
  suggestionId: string;
  itemId: string;
  targetParam: string;
  oldValue: number;
  newValue: number;
  appliedAt: Date;
  metricsBeforeApply: MetricsSnapshot;
  metricsAfterApply: MetricsSnapshot | null;
  effectEvaluated: boolean;
  effectScore: number | null;
  effectAnalysis: string | null;
  evaluatedAt: Date | null;
}

/**
 * 指标快照
 */
export interface MetricsSnapshot {
  accuracy: number;
  retentionRate: number;
  avgSessionDuration: number;
  activeUserRatio: number;
  highFatigueUserRatio: number;
  lowMotivationUserRatio: number;
  avgResponseTime: number;
  totalAnswers: number;
  collectedAt: Date;
}

/**
 * 效果评估结果
 */
export interface EffectEvaluation {
  effectScore: number; // -1 到 1，负数表示负面效果
  effectAnalysis: string;
  metricsChanges: {
    metric: string;
    before: number;
    after: number;
    change: number;
    percentChange: number;
  }[];
}

/**
 * 效果历史摘要
 */
export interface EffectHistorySummary {
  id: string;
  suggestionId: string;
  targetParam: string;
  oldValue: number;
  newValue: number;
  appliedAt: Date;
  effectScore: number | null;
  effectAnalysis: string | null;
  evaluatedAt: Date | null;
}

// ==================== 服务类 ====================

/**
 * 效果追踪服务
 */
export class EffectTracker {
  /**
   * 记录建议应用
   * 在建议被应用时调用，保存应用前的指标快照
   */
  async recordApplication(
    suggestionId: string,
    itemId: string,
    targetParam: string,
    oldValue: number,
    newValue: number,
  ): Promise<EffectTrackingRecord> {
    amasLogger.info(
      {
        suggestionId,
        itemId,
        targetParam,
        oldValue,
        newValue,
      },
      '[EffectTracker] 记录建议应用',
    );

    // 收集当前指标快照
    const metricsSnapshot = await this.collectMetricsSnapshot();

    const record = await prisma.suggestionEffectTracking.create({
      data: {
        suggestionId,
        itemId,
        targetParam,
        oldValue,
        newValue,
        metricsBeforeApply: metricsSnapshot as object,
        effectEvaluated: false,
      },
    });

    return this.mapToEffectTrackingRecord(record);
  }

  /**
   * 批量记录建议应用
   */
  async recordApplicationBatch(
    applications: Array<{
      suggestionId: string;
      itemId: string;
      targetParam: string;
      oldValue: number;
      newValue: number;
    }>,
  ): Promise<EffectTrackingRecord[]> {
    if (applications.length === 0) {
      return [];
    }

    // 收集一次指标快照供所有记录使用
    const metricsSnapshot = await this.collectMetricsSnapshot();

    const records = await prisma.$transaction(
      applications.map((app) =>
        prisma.suggestionEffectTracking.create({
          data: {
            suggestionId: app.suggestionId,
            itemId: app.itemId,
            targetParam: app.targetParam,
            oldValue: app.oldValue,
            newValue: app.newValue,
            metricsBeforeApply: metricsSnapshot as object,
            effectEvaluated: false,
          },
        }),
      ),
    );

    amasLogger.info(
      {
        count: records.length,
        suggestionId: applications[0]?.suggestionId,
      },
      '[EffectTracker] 批量记录建议应用完成',
    );

    return records.map(this.mapToEffectTrackingRecord);
  }

  /**
   * 评估效果
   * 定时任务调用，评估 7 天前应用的建议效果
   */
  async evaluateEffects(): Promise<EffectEvaluation[]> {
    // 查找 7 天前应用但尚未评估的记录
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const pendingRecords = await prisma.suggestionEffectTracking.findMany({
      where: {
        effectEvaluated: false,
        appliedAt: {
          lte: sevenDaysAgo,
        },
      },
      orderBy: { appliedAt: 'asc' },
      take: 10, // 每次最多评估 10 条
    });

    if (pendingRecords.length === 0) {
      amasLogger.info('[EffectTracker] 没有待评估的效果记录');
      return [];
    }

    amasLogger.info(
      {
        count: pendingRecords.length,
      },
      '[EffectTracker] 开始评估效果',
    );

    // 收集当前指标快照
    const currentMetrics = await this.collectMetricsSnapshot();

    const evaluations: EffectEvaluation[] = [];

    for (const record of pendingRecords) {
      try {
        const evaluation = await this.evaluateSingleEffect(record, currentMetrics);
        evaluations.push(evaluation);

        // 更新记录
        await prisma.suggestionEffectTracking.update({
          where: { id: record.id },
          data: {
            metricsAfterApply: currentMetrics as object,
            effectEvaluated: true,
            effectScore: evaluation.effectScore,
            effectAnalysis: evaluation.effectAnalysis,
            evaluatedAt: new Date(),
          },
        });

        amasLogger.info(
          {
            id: record.id,
            targetParam: record.targetParam,
            effectScore: evaluation.effectScore,
          },
          '[EffectTracker] 效果评估完成',
        );
      } catch (error) {
        amasLogger.error(
          {
            id: record.id,
            error: (error as Error).message,
          },
          '[EffectTracker] 效果评估失败',
        );
      }
    }

    return evaluations;
  }

  /**
   * 评估单条记录的效果
   */
  private async evaluateSingleEffect(
    record: {
      id: string;
      targetParam: string;
      oldValue: number;
      newValue: number;
      metricsBeforeApply: unknown;
    },
    currentMetrics: MetricsSnapshot,
  ): Promise<EffectEvaluation> {
    const beforeMetrics = record.metricsBeforeApply as MetricsSnapshot;

    // 计算各指标变化
    const metricsChanges = this.calculateMetricsChanges(beforeMetrics, currentMetrics);

    // 计算综合效果评分
    const effectScore = this.calculateEffectScore(metricsChanges);

    // 使用 LLM 生成效果分析（如果启用）
    let effectAnalysis = this.generateBasicAnalysis(
      record.targetParam,
      metricsChanges,
      effectScore,
    );

    if (llmConfig.enabled) {
      try {
        effectAnalysis = await this.generateLLMAnalysis(
          record.targetParam,
          record.oldValue,
          record.newValue,
          metricsChanges,
          effectScore,
        );
      } catch (error) {
        amasLogger.warn(
          {
            error: (error as Error).message,
          },
          '[EffectTracker] LLM 效果分析失败，使用基础分析',
        );
      }
    }

    return {
      effectScore,
      effectAnalysis,
      metricsChanges,
    };
  }

  /**
   * 计算指标变化
   */
  private calculateMetricsChanges(
    before: MetricsSnapshot,
    after: MetricsSnapshot,
  ): EffectEvaluation['metricsChanges'] {
    const metrics = [
      { key: 'accuracy', name: '正确率', positive: true },
      { key: 'retentionRate', name: '留存率', positive: true },
      { key: 'avgSessionDuration', name: '平均会话时长', positive: true },
      { key: 'activeUserRatio', name: '活跃用户比例', positive: true },
      { key: 'highFatigueUserRatio', name: '高疲劳用户比例', positive: false },
      { key: 'lowMotivationUserRatio', name: '低动机用户比例', positive: false },
      { key: 'avgResponseTime', name: '平均响应时间', positive: false },
    ];

    return metrics.map((m) => {
      const beforeValue = (before as unknown as Record<string, number>)[m.key] ?? 0;
      const afterValue = (after as unknown as Record<string, number>)[m.key] ?? 0;
      const change = afterValue - beforeValue;
      const percentChange = beforeValue !== 0 ? (change / beforeValue) * 100 : 0;

      return {
        metric: m.name,
        before: beforeValue,
        after: afterValue,
        change,
        percentChange,
      };
    });
  }

  /**
   * 计算综合效果评分
   * 基于各指标变化的加权平均
   */
  private calculateEffectScore(changes: EffectEvaluation['metricsChanges']): number {
    // 各指标的权重和方向（正向指标变化为正时评分为正）
    const weights: Record<string, { weight: number; positive: boolean }> = {
      正确率: { weight: 0.25, positive: true },
      留存率: { weight: 0.2, positive: true },
      平均会话时长: { weight: 0.1, positive: true },
      活跃用户比例: { weight: 0.15, positive: true },
      高疲劳用户比例: { weight: 0.15, positive: false },
      低动机用户比例: { weight: 0.1, positive: false },
      平均响应时间: { weight: 0.05, positive: false },
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const change of changes) {
      const config = weights[change.metric];
      if (!config) continue;

      // 将百分比变化归一化到 -1 到 1 范围
      // 假设 ±20% 的变化对应 ±1 的评分
      let normalizedChange = change.percentChange / 20;
      normalizedChange = Math.max(-1, Math.min(1, normalizedChange));

      // 如果是负向指标，反转评分
      if (!config.positive) {
        normalizedChange = -normalizedChange;
      }

      totalScore += normalizedChange * config.weight;
      totalWeight += config.weight;
    }

    // 归一化最终评分
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * 生成基础分析文本
   */
  private generateBasicAnalysis(
    targetParam: string,
    changes: EffectEvaluation['metricsChanges'],
    effectScore: number,
  ): string {
    const positiveChanges = changes.filter((c) => c.percentChange > 1);
    const negativeChanges = changes.filter((c) => c.percentChange < -1);

    let analysis = `参数 ${targetParam} 调整后`;

    if (effectScore > 0.3) {
      analysis += '产生了积极效果。';
    } else if (effectScore < -0.3) {
      analysis += '产生了负面效果。';
    } else {
      analysis += '效果不明显。';
    }

    if (positiveChanges.length > 0) {
      analysis += ` 改善指标：${positiveChanges
        .map((c) => `${c.metric}(${c.percentChange > 0 ? '+' : ''}${c.percentChange.toFixed(1)}%)`)
        .join('、')}。`;
    }

    if (negativeChanges.length > 0) {
      analysis += ` 下降指标：${negativeChanges
        .map((c) => `${c.metric}(${c.percentChange.toFixed(1)}%)`)
        .join('、')}。`;
    }

    return analysis;
  }

  /**
   * 使用 LLM 生成效果分析
   */
  private async generateLLMAnalysis(
    targetParam: string,
    oldValue: number,
    newValue: number,
    changes: EffectEvaluation['metricsChanges'],
    effectScore: number,
  ): Promise<string> {
    const prompt = `作为自适应学习系统的优化专家，请分析以下参数调整的效果：

## 调整信息
- 参数：${targetParam}
- 旧值：${oldValue}
- 新值：${newValue}
- 综合效果评分：${effectScore.toFixed(2)}（-1到1，正数为积极效果）

## 指标变化
${changes.map((c) => `- ${c.metric}：${c.before.toFixed(3)} → ${c.after.toFixed(3)} (${c.percentChange >= 0 ? '+' : ''}${c.percentChange.toFixed(1)}%)`).join('\n')}

请用2-3句话简洁分析：
1. 这个调整是否有效
2. 主要的正面和负面影响
3. 是否建议保持这个调整`;

    const response = await llmProviderService.complete(prompt, {
      temperature: 0.3,
      maxTokens: 300,
    });

    return response.trim();
  }

  /**
   * 获取效果历史
   */
  async getEffectHistory(options?: {
    limit?: number;
    offset?: number;
    suggestionId?: string;
    evaluatedOnly?: boolean;
  }): Promise<{ items: EffectHistorySummary[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (options?.suggestionId) {
      where.suggestionId = options.suggestionId;
    }

    if (options?.evaluatedOnly) {
      where.effectEvaluated = true;
    }

    const [items, total] = await Promise.all([
      prisma.suggestionEffectTracking.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
        select: {
          id: true,
          suggestionId: true,
          targetParam: true,
          oldValue: true,
          newValue: true,
          appliedAt: true,
          effectScore: true,
          effectAnalysis: true,
          evaluatedAt: true,
        },
      }),
      prisma.suggestionEffectTracking.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * 获取用于下次 LLM 分析的效果反馈
   * 返回最近 N 条已评估的效果记录
   */
  async getRecentEffectsForFeedback(limit: number = 5): Promise<EffectHistorySummary[]> {
    const records = await prisma.suggestionEffectTracking.findMany({
      where: {
        effectEvaluated: true,
        effectScore: { not: null },
      },
      orderBy: { evaluatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        suggestionId: true,
        targetParam: true,
        oldValue: true,
        newValue: true,
        appliedAt: true,
        effectScore: true,
        effectAnalysis: true,
        evaluatedAt: true,
      },
    });

    return records;
  }

  /**
   * 获取效果统计
   */
  async getEffectStats(): Promise<{
    totalTracked: number;
    totalEvaluated: number;
    avgEffectScore: number;
    positiveEffectRatio: number;
    negativeEffectRatio: number;
  }> {
    const [totalTracked, totalEvaluated, effectScores] = await Promise.all([
      prisma.suggestionEffectTracking.count(),
      prisma.suggestionEffectTracking.count({ where: { effectEvaluated: true } }),
      prisma.suggestionEffectTracking.findMany({
        where: { effectEvaluated: true, effectScore: { not: null } },
        select: { effectScore: true },
      }),
    ]);

    const scores = effectScores.map((r) => r.effectScore).filter((s): s is number => s !== null);

    const avgEffectScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const positiveCount = scores.filter((s) => s > 0.1).length;
    const negativeCount = scores.filter((s) => s < -0.1).length;

    return {
      totalTracked,
      totalEvaluated,
      avgEffectScore,
      positiveEffectRatio: scores.length > 0 ? positiveCount / scores.length : 0,
      negativeEffectRatio: scores.length > 0 ? negativeCount / scores.length : 0,
    };
  }

  /**
   * 收集当前指标快照
   */
  private async collectMetricsSnapshot(): Promise<MetricsSnapshot> {
    try {
      // 复用 statsCollector 的数据收集逻辑
      const stats = await statsCollector.collectWeeklyStats();

      return {
        accuracy: stats.learning.avgAccuracy,
        retentionRate: 1 - stats.alerts.churnRate,
        avgSessionDuration: stats.learning.avgSessionDuration,
        activeUserRatio: stats.users.total > 0 ? stats.users.activeThisWeek / stats.users.total : 0,
        highFatigueUserRatio: stats.alerts.highFatigueUserRatio,
        lowMotivationUserRatio: stats.alerts.lowMotivationUserRatio,
        avgResponseTime: stats.learning.avgResponseTime,
        totalAnswers: stats.learning.totalAnswers,
        collectedAt: new Date(),
      };
    } catch (error) {
      amasLogger.warn(
        {
          error: (error as Error).message,
        },
        '[EffectTracker] 收集指标快照失败，使用默认值',
      );

      // 返回默认值
      return {
        accuracy: 0,
        retentionRate: 0,
        avgSessionDuration: 0,
        activeUserRatio: 0,
        highFatigueUserRatio: 0,
        lowMotivationUserRatio: 0,
        avgResponseTime: 0,
        totalAnswers: 0,
        collectedAt: new Date(),
      };
    }
  }

  /**
   * 映射数据库记录到类型
   */
  private mapToEffectTrackingRecord(record: {
    id: string;
    suggestionId: string;
    itemId: string;
    targetParam: string;
    oldValue: number;
    newValue: number;
    appliedAt: Date;
    metricsBeforeApply: unknown;
    metricsAfterApply: unknown;
    effectEvaluated: boolean;
    effectScore: number | null;
    effectAnalysis: string | null;
    evaluatedAt: Date | null;
  }): EffectTrackingRecord {
    return {
      id: record.id,
      suggestionId: record.suggestionId,
      itemId: record.itemId,
      targetParam: record.targetParam,
      oldValue: record.oldValue,
      newValue: record.newValue,
      appliedAt: record.appliedAt,
      metricsBeforeApply: record.metricsBeforeApply as MetricsSnapshot,
      metricsAfterApply: record.metricsAfterApply as MetricsSnapshot | null,
      effectEvaluated: record.effectEvaluated,
      effectScore: record.effectScore,
      effectAnalysis: record.effectAnalysis,
      evaluatedAt: record.evaluatedAt,
    };
  }
}

// ==================== 默认实例 ====================

export const effectTracker = new EffectTracker();
