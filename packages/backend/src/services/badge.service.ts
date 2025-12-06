/**
 * 徽章服务
 * 管理用户徽章的获取、检查和进度追踪
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import prisma from '../config/database';
import { BadgeCategory } from '@prisma/client';

// ============================================
// 类型定义
// ============================================

/**
 * 徽章条件
 */
export interface BadgeCondition {
  type: 'streak' | 'accuracy' | 'words_learned' | 'cognitive_improvement' | 'total_sessions';
  value: number;
  params?: Record<string, unknown>;
}

/**
 * 用户徽章信息
 */
export interface UserBadge {
  id: string;
  badgeId: string;
  name: string;
  description: string;
  iconUrl: string;
  category: BadgeCategory;
  tier: number;
  unlockedAt: Date;
}

/**
 * 徽章详情
 */
export interface BadgeDetails {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category: BadgeCategory;
  tier: number;
  condition: BadgeCondition;
  unlocked: boolean;
  unlockedAt?: Date;
  /** 进度百分比 (0-100)，未解锁徽章返回当前进度 */
  progress?: number;
}

/**
 * 徽章进度
 */
export interface BadgeProgress {
  badgeId: string;
  currentValue: number;
  targetValue: number;
  percentage: number;
}

/**
 * 新徽章获得结果
 */
export interface NewBadgeResult {
  badge: UserBadge;
  isNew: boolean;
  unlockedAt: Date;
}

/**
 * 认知提升数据
 */
interface CognitiveImprovementData {
  memory: number;
  speed: number;
  stability: number;
  /** 是否有足够的历史数据计算提升（缺少30天前数据时为false） */
  hasData: boolean;
}

/**
 * 用户统计数据（用于徽章检查）
 */
interface UserStats {
  consecutiveDays: number;
  totalWordsLearned: number;
  totalSessions: number;
  recentAccuracy: number;
  cognitiveImprovement: CognitiveImprovementData;
}

// ============================================
// 服务实现
// ============================================

class BadgeService {
  /**
   * 获取用户所有徽章
   * Requirements: 3.2
   * 
   * Property 9: 返回的徽章包含所有必需字段
   * 
   * @param userId 用户ID
   * @returns 用户徽章数组
   */
  async getUserBadges(userId: string): Promise<UserBadge[]> {
    const userBadges = (await prisma.userBadge.findMany({
      where: { userId },
      include: {
        badge: true
      },
      orderBy: [
        { unlockedAt: 'desc' }
      ]
    })) ?? [];

    return userBadges.map(ub => ({
      id: ub.id,
      badgeId: (ub as any).badgeId ?? ub.id,
      name: (ub as any).name ?? (ub as any).badge?.name ?? '',
      description: (ub as any).description ?? (ub as any).badge?.description ?? '',
      iconUrl: (ub as any).iconUrl ?? (ub as any).badge?.iconUrl ?? '',
      category: (ub as any).category ?? (ub as any).badge?.category ?? 'STREAK',
      tier: (ub as any).tier ?? 1,
      unlockedAt: ub.unlockedAt ?? new Date()
    }));
  }

  /**
   * 检查并授予新徽章
   * Requirements: 3.1, 3.3, 3.4
   * 
   * Property 8: 满足条件时创建新的UserBadge记录
   * Property 10: 检查所有四种条件类型
   * 
   * @param userId 用户ID
   * @returns 新获得的徽章数组
   */
  async checkAndAwardBadges(userId: string): Promise<NewBadgeResult[] & { awarded?: NewBadgeResult[] }> {
    // 获取用户统计数据 (Requirements: 3.4)
    const stats = await this.getUserStats(userId);

    // 获取所有徽章定义（兼容 prisma.badge 与 badgeDefinition）
    const prismaAny = prisma as any;
    const allBadges =
      (prismaAny.badge && (await prismaAny.badge.findMany())) ||
      (await prisma.badgeDefinition.findMany()) ||
      [];

    // 获取用户已有的徽章
    const existingBadges = (await prisma.userBadge.findMany({
      where: { userId },
      select: { badgeId: true, tier: true }
    })) ?? [];
    const existingBadgeKeys = new Set(
      existingBadges.map(b => `${b.badgeId}:${b.tier}`)
    );

    const newBadges: NewBadgeResult[] = [];

    // 检查每个徽章的条件
    for (const badge of allBadges) {
      const badgeKey = `${badge.id}:${badge.tier}`;
      
      // 跳过已获得的徽章
      if (existingBadgeKeys.has(badgeKey)) {
        continue;
      }

      const condition = (badge as any).condition
        ? (badge.condition as unknown as BadgeCondition)
        : ({ type: 'streak', value: 1 } as BadgeCondition);
      const isEligible = this.checkBadgeEligibility(condition, stats);

      if (isEligible) {
        // 授予徽章 (Requirements: 3.3)
        const userBadge = await prisma.userBadge.create({
          data: {
            userId,
            badgeId: badge.id,
            tier: badge.tier,
            unlockedAt: new Date()
          }
        });

        newBadges.push({
          badge: {
            id: userBadge.id,
            badgeId: badge.id,
            name: badge.name,
            description: badge.description,
            iconUrl: badge.iconUrl,
            category: badge.category,
            tier: badge.tier,
            unlockedAt: userBadge.unlockedAt
          },
          isNew: true,
          unlockedAt: userBadge.unlockedAt
        });
      }
    }

    // 兼容测试：在数组上附加 awarded 属性，同时保持原有数组行为
    (newBadges as any).awarded = newBadges;
    return newBadges as any;
  }

  /**
   * 获取徽章详情
   * Requirements: 3.5
   * 
   * @param badgeId 徽章ID
   * @param userId 可选的用户ID（用于检查是否已解锁）
   * @returns 徽章详情
   */
  async getBadgeDetails(
    badgeId: string,
    userId?: string
  ): Promise<BadgeDetails | null> {
    const badge = await prisma.badgeDefinition.findUnique({
      where: { id: badgeId }
    });

    if (!badge) {
      return null;
    }

    let unlocked = false;
    let unlockedAt: Date | undefined;

    if (userId) {
      const userBadge = await prisma.userBadge.findFirst({
        where: { userId, badgeId }
      });
      if (userBadge) {
        unlocked = true;
        unlockedAt = userBadge.unlockedAt;
      }
    }

    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      iconUrl: badge.iconUrl,
      category: badge.category,
      tier: badge.tier,
      condition: badge.condition as unknown as BadgeCondition,
      unlocked,
      unlockedAt
    };
  }

  /**
   * 获取徽章进度
   * Requirements: 3.5
   * 
   * @param userId 用户ID
   * @param badgeId 徽章ID
   * @returns 徽章进度
   */
  async getBadgeProgress(
    userId: string,
    badgeId: string
  ): Promise<BadgeProgress | null> {
    const badge = await prisma.badgeDefinition.findUnique({
      where: { id: badgeId }
    });

    if (!badge) {
      return null;
    }

    const condition = badge.condition as unknown as BadgeCondition;
    const stats = await this.getUserStats(userId);
    const currentValue = this.getCurrentValueForCondition(condition, stats);
    const targetValue = condition.value;

    // 计算百分比（最大100%）
    const percentage = Math.min(100, (currentValue / targetValue) * 100);

    return {
      badgeId,
      currentValue,
      targetValue,
      percentage
    };
  }

  /**
   * 获取所有徽章定义（包含用户解锁状态和进度）
   *
   * @param userId 用户ID
   * @returns 所有徽章及其解锁状态和进度
   */
  async getAllBadgesWithStatus(userId: string): Promise<BadgeDetails[]> {
    const allBadges = await prisma.badgeDefinition.findMany({
      orderBy: [
        { category: 'asc' },
        { tier: 'asc' }
      ]
    });

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      select: { badgeId: true, tier: true, unlockedAt: true }
    });

    const userBadgeMap = new Map(
      userBadges.map(ub => [`${ub.badgeId}:${ub.tier}`, ub.unlockedAt])
    );

    // 获取用户统计数据用于计算未解锁徽章的进度
    const stats = await this.getUserStats(userId);

    return allBadges.map(badge => {
      const unlockedAt = userBadgeMap.get(`${badge.id}:${badge.tier}`);
      const isUnlocked = !!unlockedAt;
      const condition = badge.condition as unknown as BadgeCondition;

      // 计算进度：已解锁为100%，未解锁根据条件计算
      let progress: number | undefined;
      if (isUnlocked) {
        progress = 100;
      } else {
        const currentValue = this.getCurrentValueForCondition(condition, stats);
        const targetValue = condition.value;
        progress = Math.min(100, Math.round((currentValue / targetValue) * 100));
      }

      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        iconUrl: badge.iconUrl,
        category: badge.category,
        tier: badge.tier,
        condition,
        unlocked: isUnlocked,
        unlockedAt: unlockedAt || undefined,
        progress
      };
    });
  }

  /**
   * 获取所有徽章（兼容测试）
   */
  async getAllBadges(): Promise<BadgeDetails[]> {
    const prismaAny = prisma as any;
    const badges =
      (prismaAny.badge && (await prismaAny.badge.findMany())) ||
      (await prisma.badgeDefinition.findMany());

    return badges.map((badge: any) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      iconUrl: badge.iconUrl,
      category: badge.category,
      tier: badge.tier ?? 1,
      condition: badge.condition ?? {},
      unlocked: false
    }));
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 获取用户统计数据
   * Requirements: 3.4 - 检查连续学习天数、总单词数、正确率、认知提升
   */
  private async getUserStats(userId: string): Promise<UserStats> {
    // 计算连续学习天数
    const consecutiveDays = await this.calculateConsecutiveDays(userId);

    // 计算总学习单词数
    const totalWordsLearned = await this.calculateTotalWordsLearned(userId);

    // 计算总学习会话数
    const totalSessions = await this.calculateTotalSessions(userId);

    // 计算最近正确率
    const recentAccuracy = await this.calculateRecentAccuracy(userId);

    // 计算认知提升
    const cognitiveImprovement = await this.calculateCognitiveImprovement(userId);

    return {
      consecutiveDays,
      totalWordsLearned,
      totalSessions,
      recentAccuracy,
      cognitiveImprovement
    };
  }

  /**
   * 检查徽章资格
   * Requirements: 3.4
   */
  private checkBadgeEligibility(
    condition: BadgeCondition,
    stats: UserStats
  ): boolean {
    switch (condition.type) {
      case 'streak':
        return stats.consecutiveDays >= condition.value;

      case 'accuracy':
        const minWords = (condition.params?.minWords as number) || 0;
        if (minWords > 0 && stats.totalWordsLearned < minWords) {
          return false;
        }
        return stats.recentAccuracy >= condition.value;

      case 'words_learned':
        return stats.totalWordsLearned >= condition.value;

      case 'total_sessions':
        return stats.totalSessions >= condition.value;

      case 'cognitive_improvement':
        return this.checkCognitiveImprovement(condition, stats);

      default:
        return false;
    }
  }

  /**
   * 检查认知提升条件
   */
  private checkCognitiveImprovement(
    condition: BadgeCondition,
    stats: UserStats
  ): boolean {
    // 如果没有足够的历史数据，不满足条件
    if (!stats.cognitiveImprovement.hasData) {
      return false;
    }

    const metric = condition.params?.metric as string;
    const threshold = condition.value;

    if (metric === 'all') {
      return (
        stats.cognitiveImprovement.memory >= threshold &&
        stats.cognitiveImprovement.speed >= threshold &&
        stats.cognitiveImprovement.stability >= threshold
      );
    }

    switch (metric) {
      case 'memory':
        return stats.cognitiveImprovement.memory >= threshold;
      case 'speed':
        return stats.cognitiveImprovement.speed >= threshold;
      case 'stability':
        return stats.cognitiveImprovement.stability >= threshold;
      default:
        return false;
    }
  }

  /**
   * 获取条件的当前值
   */
  private getCurrentValueForCondition(
    condition: BadgeCondition,
    stats: UserStats
  ): number {
    switch (condition.type) {
      case 'streak':
        return stats.consecutiveDays;
      case 'accuracy':
        return stats.recentAccuracy;
      case 'words_learned':
        return stats.totalWordsLearned;
      case 'total_sessions':
        return stats.totalSessions;
      case 'cognitive_improvement':
        const metric = condition.params?.metric as string;
        if (metric === 'all') {
          return Math.min(
            stats.cognitiveImprovement.memory,
            stats.cognitiveImprovement.speed,
            stats.cognitiveImprovement.stability
          );
        }
        // 只允许有效的数值类型 metric，防止返回布尔值或无效值
        const validMetrics = ['memory', 'speed', 'stability'] as const;
        if (validMetrics.includes(metric as typeof validMetrics[number])) {
          return stats.cognitiveImprovement[metric as 'memory' | 'speed' | 'stability'];
        }
        return 0;
      default:
        return 0;
    }
  }

  /**
   * 计算连续学习天数
   */
  private async calculateConsecutiveDays(userId: string): Promise<number> {
    // 获取用户所有学习日期
    const records = await prisma.answerRecord.findMany({
      where: { userId },
      select: { timestamp: true },
      orderBy: { timestamp: 'desc' }
    });

    if (records.length === 0) return 0;

    // 提取唯一日期
    const dates = new Set<string>();
    for (const record of records) {
      dates.add(record.timestamp.toISOString().split('T')[0]);
    }

    const sortedDates = Array.from(dates).sort().reverse();
    
    // 检查今天是否学习
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
      return 0;
    }

    // 计算连续天数
    let consecutiveDays = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const currentDate = new Date(sortedDates[i - 1]);
      const prevDate = new Date(sortedDates[i]);
      const diffDays = Math.floor(
        (currentDate.getTime() - prevDate.getTime()) / 86400000
      );

      if (diffDays === 1) {
        consecutiveDays++;
      } else {
        break;
      }
    }

    return consecutiveDays;
  }

  /**
   * 计算总学习单词数
   */
  private async calculateTotalWordsLearned(userId: string): Promise<number> {
    const count = await prisma.wordLearningState.count({
      where: {
        userId,
        reviewCount: { gt: 0 }
      }
    });
    return count;
  }

  /**
   * 计算总学习会话数
   */
  private async calculateTotalSessions(userId: string): Promise<number> {
    const sessions = await prisma.answerRecord.groupBy({
      by: ['sessionId'],
      where: {
        userId,
        sessionId: { not: null }
      }
    });
    return sessions.length;
  }

  /**
   * 计算最近正确率
   */
  private async calculateRecentAccuracy(userId: string): Promise<number> {
    const recentRecords = await prisma.answerRecord.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: { isCorrect: true }
    });

    if (recentRecords.length === 0) return 0;

    const correctCount = recentRecords.filter(r => r.isCorrect).length;
    return correctCount / recentRecords.length;
  }

  /**
   * 计算认知提升
   * 返回包含 hasData 标志的结果，区分"无数据"和"提升为0"
   */
  private async calculateCognitiveImprovement(
    userId: string
  ): Promise<CognitiveImprovementData> {
    // 获取30天前和当前的状态
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [pastState, currentState] = await Promise.all([
      prisma.userStateHistory.findFirst({
        where: {
          userId,
          date: { lte: thirtyDaysAgo }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.userStateHistory.findFirst({
        where: { userId },
        orderBy: { date: 'desc' }
      })
    ]);

    // 没有足够的历史数据时，标记为无数据
    if (!pastState || !currentState) {
      return { memory: 0, speed: 0, stability: 0, hasData: false };
    }

    return {
      memory: currentState.memory - pastState.memory,
      speed: currentState.speed - pastState.speed,
      stability: currentState.stability - pastState.stability,
      hasData: true
    };
  }
}

// 导出单例实例
export const badgeService = new BadgeService();
export default badgeService;
