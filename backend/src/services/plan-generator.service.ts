/**
 * 学习计划生成服务
 * 基于用户习惯画像和策略参数生成个性化学习计划
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

// ============================================
// 类型定义
// ============================================

/**
 * 词书分配
 */
export interface WordbookAllocation {
  wordbookId: string;
  wordbookName?: string;
  percentage: number;
  priority: number;
}

/**
 * 周里程碑
 */
export interface WeeklyMilestone {
  week: number;
  target: number;
  description: string;
  completed?: boolean;
}

/**
 * 学习计划
 */
export interface LearningPlan {
  id: string;
  userId: string;
  dailyTarget: number;
  /** 兼容旧版命名 */
  dailyGoal?: number;
  totalWords: number;
  estimatedCompletionDate: Date;
  wordbookDistribution: WordbookAllocation[];
  weeklyMilestones: WeeklyMilestone[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 计划生成选项
 */
export interface PlanOptions {
  targetDays?: number;
  dailyTarget?: number;
  /** 兼容旧版：总目标单词数 */
  targetWords?: number;
  /** 兼容旧版：剩余天数 */
  daysRemaining?: number;
  /** 兼容旧版：每日目标 */
  dailyGoal?: number;
  wordbookIds?: string[];
}

/**
 * 计划进度
 */
export interface PlanProgress {
  completedToday: number;
  targetToday: number;
  weeklyProgress: number;
  overallProgress: number;
  onTrack: boolean;
  deviation: number;
}

// ============================================
// 常量配置
// ============================================

/** 默认每日目标单词数 */
const DEFAULT_DAILY_TARGET = 20;

/** 偏差阈值（超过20%需要调整） */
const DEVIATION_THRESHOLD = 0.2;

// ============================================
// 服务实现
// ============================================

class PlanGeneratorService {
  /**
   * 生成学习计划
   * Requirements: 4.1, 4.2, 4.4, 4.5
   * 
   * Property 11: 生成的计划包含dailyTarget、weeklyMilestones、
   * estimatedCompletionDate和wordbookDistribution
   * Property 12: 预计完成日期 = ceil(总单词数 / 每日目标)
   * Property 14: 多词书按优先级分配百分比，总和为100%
   * 
   * @param userId 用户ID
   * @param options 计划选项
   * @returns 学习计划
   */
  async generatePlan(
    userId: string,
    options: PlanOptions = {}
  ): Promise<LearningPlan> {
    const targetWordsOverride = options.targetWords;
    const daysRemaining = options.daysRemaining;
    const explicitDailyGoal = options.dailyGoal;

    // 获取用户学习配置
    const studyConfig = await prisma.userStudyConfig.findUnique({
      where: { userId }
    });

    // 确定词书列表
    const wordbookIds = options.wordbookIds ||
                        studyConfig?.selectedWordBookIds ||
                        [];

    // 获取词书信息（安全校验：仅允许系统词书或用户自己的词书）
    const wordbooks =
      (await prisma.wordBook.findMany({
        where: {
          id: { in: wordbookIds },
          OR: [
            { type: 'SYSTEM' },
            { userId }
          ]
        },
        select: { id: true, name: true, wordCount: true }
      })) ?? [];

    // 校验词书权限：确保所有请求的词书都已获取到
    if (wordbookIds.length > 0 && wordbooks.length !== wordbookIds.length) {
      const foundIds = new Set(wordbooks.map(wb => wb.id));
      const unauthorizedIds = wordbookIds.filter(id => !foundIds.has(id));
      throw AppError.forbidden(
        `无权访问以下词书: ${unauthorizedIds.join(', ')}`
      );
    }

    // 计算总单词数（允许 targetWords 覆盖）
    const totalWords = targetWordsOverride ??
      wordbooks.reduce((sum, wb) => sum + wb.wordCount, 0);

    // 确定每日目标和完成天数 (Requirements: 4.1, 4.2)
    // 支持两种模式：
    // 1. 用户指定 targetDays：根据目标天数反推每日单词量
    // 2. 用户指定 dailyTarget：根据每日目标计算完成天数
    let dailyTarget: number;
    let daysToComplete: number;

    if ((options.targetDays && options.targetDays > 0) || (daysRemaining && daysRemaining > 0)) {
      // 用户指定了目标天数，根据天数计算每日目标
      daysToComplete = options.targetDays ?? daysRemaining ?? 0;
      // 如果用户同时指定了每日目标，优先使用用户指定的值
      if ((options.dailyTarget && options.dailyTarget > 0) || (explicitDailyGoal && explicitDailyGoal > 0)) {
        dailyTarget = options.dailyTarget ?? explicitDailyGoal!;
      } else {
        // 根据目标天数反推每日单词量，向上取整确保能按时完成
        dailyTarget = Math.max(1, Math.ceil(totalWords / Math.max(1, daysToComplete)));
      }
    } else {
      // 未指定目标天数，使用传统模式根据每日目标计算
      dailyTarget = options.dailyTarget ||
                    explicitDailyGoal ||
                    studyConfig?.dailyWordCount ||
                    DEFAULT_DAILY_TARGET;
      // Property 12: ceil(N / T) 天
      daysToComplete = Math.ceil(totalWords / dailyTarget);
    }

    // 计算预计完成日期
    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + daysToComplete);

    // 生成词书分配 (Requirements: 4.5)
    // Property 14: 按优先级分配，总和100%
    const wordbookDistribution = this.calculateWordbookDistribution(wordbooks);

    // 生成周里程碑 (Requirements: 4.4)
    const weeklyMilestones = this.generateWeeklyMilestones(
      totalWords,
      dailyTarget,
      daysToComplete
    );

    // 保存或更新计划
    const plan =
      (await prisma.learningPlan.upsert({
        where: { userId },
        update: {
          dailyTarget,
          totalWords,
          estimatedCompletionDate,
          wordbookDistribution: wordbookDistribution as unknown as object,
          weeklyMilestones: weeklyMilestones as unknown as object,
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          userId,
          dailyTarget,
          totalWords,
          estimatedCompletionDate,
          wordbookDistribution: wordbookDistribution as unknown as object,
          weeklyMilestones: weeklyMilestones as unknown as object,
          isActive: true
        }
      })) ?? {
        id: `plan-${userId}`,
        userId,
        dailyTarget,
        totalWords,
        estimatedCompletionDate,
        wordbookDistribution,
        weeklyMilestones,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

    return this.mapPlanToResult(plan);
  }

  /**
   * 获取当前计划
   * 
   * @param userId 用户ID
   * @returns 学习计划或null
   */
  async getCurrentPlan(userId: string): Promise<LearningPlan | null> {
    const plan = await prisma.learningPlan.findUnique({
      where: { userId }
    });

    if (!plan) return null;

    return this.mapPlanToResult(plan);
  }

  /**
   * 兼容旧版的计划获取（按 userId 或 planId）
   */
  async getPlan(identifier: string): Promise<LearningPlan | null> {
    const prismaAny = prisma as any;
    const plan =
      (prismaAny.learningPlan &&
        (await prismaAny.learningPlan.findFirst({
          where: {
            OR: [{ userId: identifier }, { id: identifier }]
          }
        }))) ||
      (await prisma.learningPlan.findFirst({
        where: {
          OR: [{ userId: identifier }, { id: identifier }]
        }
      }));

    return plan ? this.mapPlanToResult(plan) : null;
  }

  /**
   * 更新计划进度
   * Requirements: 4.3
   * 
   * Property 13: 当偏差超过20%时自动调整每日目标
   * 
   * @param userId 用户ID
   * @returns 计划进度
   */
  async updatePlanProgress(userId: string): Promise<PlanProgress> {
    const plan = await this.getCurrentPlan(userId);
    
    if (!plan) {
      return {
        completedToday: 0,
        targetToday: DEFAULT_DAILY_TARGET,
        weeklyProgress: 0,
        overallProgress: 0,
        onTrack: true,
        deviation: 0
      };
    }

    // 计算今日完成数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const completedToday = await prisma.answerRecord.count({
      where: {
        userId,
        timestamp: {
          gte: today,
          lt: tomorrow
        },
        isCorrect: true
      }
    });

    // 计算本周进度
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    const weeklyCompleted = await prisma.answerRecord.count({
      where: {
        userId,
        timestamp: { gte: weekStart },
        isCorrect: true
      }
    });

    const weeklyTarget = plan.dailyTarget * 7;
    const weeklyProgress = Math.min(100, (weeklyCompleted / weeklyTarget) * 100);

    // 计算总体进度
    const totalCompleted = await prisma.wordLearningState.count({
      where: {
        userId,
        state: { in: ['LEARNING', 'REVIEWING', 'MASTERED'] }
      }
    });

    // 使用计划中存储的实际总词数
    const totalWords = plan.totalWords;

    const overallProgress = totalWords > 0
      ? Math.min(100, (totalCompleted / totalWords) * 100)
      : 0;

    // 计算偏差 (Requirements: 4.3)
    const daysSinceStart = Math.floor(
      (Date.now() - plan.createdAt.getTime()) / (24 * 60 * 60 * 1000)
    );
    const expectedProgress = daysSinceStart * plan.dailyTarget;
    const deviation = expectedProgress > 0
      ? (totalCompleted - expectedProgress) / expectedProgress
      : 0;

    // 判断是否按计划进行
    const onTrack = Math.abs(deviation) <= DEVIATION_THRESHOLD;

    // 如果偏差过大，触发计划调整 (Property 13)
    if (!onTrack) {
      await this.adjustPlan(userId, `偏差${(deviation * 100).toFixed(1)}%`);
    }

    return {
      completedToday,
      targetToday: plan.dailyTarget,
      weeklyProgress,
      overallProgress,
      onTrack,
      deviation
    };
  }

  /**
   * 兼容测试的进度更新（按计划ID或用户ID）
   */
  async updateProgress(
    planIdOrUserId: string,
    progressOrWords: number | { wordsLearned?: number; progress?: number }
  ) {
    const prismaAny = prisma as any;
    const data =
      typeof progressOrWords === 'number'
        ? { progress: progressOrWords / 100, wordsLearned: progressOrWords }
        : progressOrWords;

    let updated;
    try {
      updated = await prismaAny.learningPlan.update({
        where: { id: planIdOrUserId },
        data
      });
    } catch {
      updated = await prismaAny.learningPlan.update({
        where: { userId: planIdOrUserId },
        data
      });
    }

    return updated;
  }

  /**
   * 调整计划
   * Requirements: 4.3
   * 
   * @param userId 用户ID
   * @param reason 调整原因
   * @returns 调整后的计划
   */
  async adjustPlan(userId: string, reason: string): Promise<LearningPlan> {
    const currentPlan = await this.getCurrentPlan(userId);
    
    if (!currentPlan) {
      return this.generatePlan(userId);
    }

    // 获取实际进度
    const totalCompleted = await prisma.wordLearningState.count({
      where: {
        userId,
        state: { in: ['LEARNING', 'REVIEWING', 'MASTERED'] }
      }
    });

    // 计算剩余天数
    const remainingDays = Math.max(1, Math.ceil(
      (currentPlan.estimatedCompletionDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    ));

    // 使用计划中存储的实际总词数计算剩余单词数
    const totalWords = currentPlan.totalWords;
    const remainingWords = Math.max(0, totalWords - totalCompleted);

    // 计算新的每日目标
    let newDailyTarget = Math.ceil(remainingWords / remainingDays);
    
    // 限制调整幅度（不超过原目标的50%）
    const minTarget = Math.floor(currentPlan.dailyTarget * 0.5);
    const maxTarget = Math.ceil(currentPlan.dailyTarget * 1.5);
    newDailyTarget = Math.max(minTarget, Math.min(maxTarget, newDailyTarget));

    // 更新计划
    const updatedPlan = await prisma.learningPlan.update({
      where: { userId },
      data: {
        dailyTarget: newDailyTarget,
        updatedAt: new Date()
      }
    });

    console.log(`[PlanGenerator] 计划已调整: userId=${userId}, reason=${reason}, newTarget=${newDailyTarget}`);

    return this.mapPlanToResult(updatedPlan);
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 计算词书分配
   * Property 14: 按优先级分配，总和100%
   *
   * 使用 Largest Remainder Method（最大余数法）确保百分比总和精确为100%
   */
  private calculateWordbookDistribution(
    wordbooks: Array<{ id: string; name: string; wordCount: number }>
  ): WordbookAllocation[] {
    if (wordbooks.length === 0) {
      return [];
    }

    // 按单词数量排序，单词多的优先级高
    const sorted = [...wordbooks].sort((a, b) => b.wordCount - a.wordCount);

    // 计算总权重
    const totalWeight = sorted.reduce((sum, _, index) => sum + (sorted.length - index), 0);

    // 先计算精确的百分比和取整后的值
    const items = sorted.map((wb, index) => {
      const priority = index + 1;
      const weight = sorted.length - index;
      const exactPercentage = (weight / totalWeight) * 100;
      const floorPercentage = Math.floor(exactPercentage);
      const remainder = exactPercentage - floorPercentage;

      return {
        wordbookId: wb.id,
        wordbookName: wb.name,
        priority,
        floorPercentage,
        remainder
      };
    });

    // 计算取整后的总和与100的差值
    const floorSum = items.reduce((sum, item) => sum + item.floorPercentage, 0);
    let remaining = 100 - floorSum;

    // 按余数从大到小排序，分配剩余的百分比
    const sortedByRemainder = [...items].sort((a, b) => b.remainder - a.remainder);
    for (const item of sortedByRemainder) {
      if (remaining <= 0) break;
      item.floorPercentage += 1;
      remaining -= 1;
    }

    // 按原始优先级顺序返回
    return items.map(item => ({
      wordbookId: item.wordbookId,
      wordbookName: item.wordbookName,
      percentage: item.floorPercentage,
      priority: item.priority
    }));
  }

  /**
   * 生成周里程碑
   */
  private generateWeeklyMilestones(
    totalWords: number,
    dailyTarget: number,
    totalDays: number
  ): WeeklyMilestone[] {
    const totalWeeks = Math.ceil(totalDays / 7);
    const weeklyTarget = dailyTarget * 7;
    const milestones: WeeklyMilestone[] = [];

    let cumulativeTarget = 0;
    for (let week = 1; week <= totalWeeks; week++) {
      cumulativeTarget = Math.min(totalWords, cumulativeTarget + weeklyTarget);
      
      let description: string;
      if (week === 1) {
        description = '开始学习之旅';
      } else if (week === totalWeeks) {
        description = '完成所有单词学习';
      } else if (cumulativeTarget >= totalWords * 0.5 && cumulativeTarget - weeklyTarget < totalWords * 0.5) {
        description = '完成一半进度';
      } else {
        description = `累计学习${cumulativeTarget}个单词`;
      }

      milestones.push({
        week,
        target: cumulativeTarget,
        description,
        completed: false
      });
    }

    return milestones;
  }

  /**
   * 映射数据库计划到结果类型
   */
  private mapPlanToResult(plan: {
    id: string;
    userId: string;
    dailyTarget: number;
    totalWords: number;
    estimatedCompletionDate: Date;
    wordbookDistribution: unknown;
    weeklyMilestones: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LearningPlan {
    const totalWords = (plan as any).totalWords ?? (plan as any).targetWords ?? 0;
    return {
      id: plan.id,
      userId: plan.userId,
      dailyTarget: plan.dailyTarget,
      dailyGoal: plan.dailyTarget,
      totalWords,
      estimatedCompletionDate: plan.estimatedCompletionDate,
      wordbookDistribution: plan.wordbookDistribution as WordbookAllocation[],
      weeklyMilestones: plan.weeklyMilestones as WeeklyMilestone[],
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };
  }
}

// 导出单例实例
export const planGeneratorService = new PlanGeneratorService();
export default planGeneratorService;
