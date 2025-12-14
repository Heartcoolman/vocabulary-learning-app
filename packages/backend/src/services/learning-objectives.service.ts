/**
 * Learning Objectives Service
 * 学习目标管理服务
 */

import prisma from '../config/database';
import { LearningObjectives, LearningObjectiveMode } from '../amas/types';
import { MultiObjectiveOptimizer } from '../amas/core/multi-objective-optimizer';

export class LearningObjectivesService {
  /**
   * 获取用户学习目标配置
   */
  static async getUserObjectives(userId: string): Promise<LearningObjectives | null> {
    const record = await prisma.userLearningObjectives.findUnique({
      where: { userId },
    });

    if (!record) {
      return null;
    }

    return {
      userId: record.userId,
      mode: record.mode as LearningObjectiveMode,
      primaryObjective: record.primaryObjective as 'accuracy' | 'retention' | 'efficiency',
      minAccuracy: record.minAccuracy ?? undefined,
      maxDailyTime: record.maxDailyTime ?? undefined,
      targetRetention: record.targetRetention ?? undefined,
      weightShortTerm: record.weightShortTerm,
      weightLongTerm: record.weightLongTerm,
      weightEfficiency: record.weightEfficiency,
    };
  }

  /**
   * 创建或更新用户学习目标
   */
  static async upsertUserObjectives(objectives: LearningObjectives): Promise<LearningObjectives> {
    const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

    const record = await prisma.userLearningObjectives.upsert({
      where: { userId: objectives.userId },
      create: {
        userId: normalized.userId,
        mode: normalized.mode,
        primaryObjective: normalized.primaryObjective,
        minAccuracy: normalized.minAccuracy,
        maxDailyTime: normalized.maxDailyTime,
        targetRetention: normalized.targetRetention,
        weightShortTerm: normalized.weightShortTerm,
        weightLongTerm: normalized.weightLongTerm,
        weightEfficiency: normalized.weightEfficiency,
      },
      update: {
        mode: normalized.mode,
        primaryObjective: normalized.primaryObjective,
        minAccuracy: normalized.minAccuracy,
        maxDailyTime: normalized.maxDailyTime,
        targetRetention: normalized.targetRetention,
        weightShortTerm: normalized.weightShortTerm,
        weightLongTerm: normalized.weightLongTerm,
        weightEfficiency: normalized.weightEfficiency,
        updatedAt: new Date(),
      },
    });

    return {
      userId: record.userId,
      mode: record.mode as LearningObjectiveMode,
      primaryObjective: record.primaryObjective as 'accuracy' | 'retention' | 'efficiency',
      minAccuracy: record.minAccuracy ?? undefined,
      maxDailyTime: record.maxDailyTime ?? undefined,
      targetRetention: record.targetRetention ?? undefined,
      weightShortTerm: record.weightShortTerm,
      weightLongTerm: record.weightLongTerm,
      weightEfficiency: record.weightEfficiency,
    };
  }

  /**
   * 快速切换模式
   */
  static async switchMode(
    userId: string,
    mode: LearningObjectiveMode,
    reason: 'manual' | 'auto_adjust' | 'experiment' = 'manual',
  ): Promise<LearningObjectives> {
    const currentObjectives = await this.getUserObjectives(userId);

    const presetConfig = MultiObjectiveOptimizer.getPresetMode(mode);

    const newObjectives: LearningObjectives = {
      userId,
      mode,
      primaryObjective: presetConfig.primaryObjective || 'accuracy',
      minAccuracy: presetConfig.minAccuracy,
      maxDailyTime: presetConfig.maxDailyTime,
      targetRetention: presetConfig.targetRetention,
      weightShortTerm: presetConfig.weightShortTerm || 0.4,
      weightLongTerm: presetConfig.weightLongTerm || 0.4,
      weightEfficiency: presetConfig.weightEfficiency || 0.2,
    };

    const updated = await this.upsertUserObjectives(newObjectives);

    if (currentObjectives) {
      await this.recordObjectiveHistory(userId, currentObjectives, updated, reason);
    }

    return updated;
  }

  /**
   * 记录目标切换历史
   */
  private static async recordObjectiveHistory(
    userId: string,
    before: LearningObjectives,
    after: LearningObjectives,
    reason: string,
  ): Promise<void> {
    const existingObjective = await prisma.userLearningObjectives.findUnique({
      where: { userId },
    });

    if (!existingObjective) {
      return;
    }

    await prisma.objectiveHistory.create({
      data: {
        userId,
        objectiveId: existingObjective.id,
        reason,
        beforeMetrics: {
          mode: before.mode,
          weights: {
            shortTerm: before.weightShortTerm,
            longTerm: before.weightLongTerm,
            efficiency: before.weightEfficiency,
          },
        },
        afterMetrics: {
          mode: after.mode,
          weights: {
            shortTerm: after.weightShortTerm,
            longTerm: after.weightLongTerm,
            efficiency: after.weightEfficiency,
          },
        },
      },
    });
  }

  /**
   * 获取模式建议
   */
  static async getSuggestions(userId: string): Promise<{
    currentMode: LearningObjectiveMode;
    suggestedModes: Array<{
      mode: LearningObjectiveMode;
      reason: string;
      config: Partial<LearningObjectives>;
    }>;
  }> {
    const currentObjectives = await this.getUserObjectives(userId);

    if (!currentObjectives) {
      return {
        currentMode: 'daily',
        suggestedModes: [
          {
            mode: 'daily',
            reason: '平衡短期和长期记忆，适合日常学习',
            config: MultiObjectiveOptimizer.getPresetMode('daily'),
          },
        ],
      };
    }

    const suggestions: Array<{
      mode: LearningObjectiveMode;
      reason: string;
      config: Partial<LearningObjectives>;
    }> = [];

    const modes: LearningObjectiveMode[] = ['exam', 'daily', 'travel', 'custom'];

    for (const mode of modes) {
      if (mode === currentObjectives.mode) continue;

      let reason = '';
      switch (mode) {
        case 'exam':
          reason = '提升准确率，适合备考冲刺';
          break;
        case 'daily':
          reason = '平衡学习，适合长期记忆';
          break;
        case 'travel':
          reason = '快速学习，适合时间有限';
          break;
        case 'custom':
          reason = '自定义配置，灵活调整';
          break;
      }

      suggestions.push({
        mode,
        reason,
        config: MultiObjectiveOptimizer.getPresetMode(mode),
      });
    }

    return {
      currentMode: currentObjectives.mode,
      suggestedModes: suggestions,
    };
  }

  /**
   * 获取目标切换历史
   */
  static async getObjectiveHistory(
    userId: string,
    limit: number = 10,
  ): Promise<
    Array<{
      timestamp: Date;
      reason: string;
      beforeMode: string;
      afterMode: string;
    }>
  > {
    const records = await prisma.objectiveHistory.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return records.map((record) => ({
      timestamp: record.timestamp,
      reason: record.reason,
      beforeMode: (record.beforeMetrics as any).mode,
      afterMode: (record.afterMetrics as any).mode,
    }));
  }

  /**
   * 删除用户学习目标
   */
  static async deleteUserObjectives(userId: string): Promise<void> {
    await prisma.userLearningObjectives.delete({
      where: { userId },
    });
  }
}
