/**
 * 行为疲劳服务
 *
 * 提供行为疲劳数据的访问接口，用于视觉疲劳融合引擎。
 * 从 AMAS 引擎获取真正的行为疲劳值，而非硬编码。
 */

import prisma from '../config/database';
import { cachedStateRepository } from '../amas/repositories';
import { serviceLogger } from '../logger';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';

/**
 * 用户学习会话信息
 */
interface UserSessionInfo {
  /** 会话开始时间 */
  startedAt: Date;
  /** 学习时长（分钟） */
  durationMinutes: number;
  /** 最后活动时间 */
  lastActivityAt: Date;
}

class BehaviorFatigueService {
  /**
   * 获取用户的行为疲劳值
   *
   * 从 AMAS 用户状态中获取真正的疲劳度 F 值。
   * 疲劳度基于：错误率趋势、响应时间变化、重复错误等行为特征计算。
   *
   * @param userId 用户ID
   * @returns 行为疲劳值 [0, 1]，0=精力充沛，1=极度疲劳
   */
  async getBehaviorFatigue(userId: string): Promise<number> {
    try {
      // 从缓存仓库获取用户状态
      const userState = await cachedStateRepository.loadState(userId);

      if (userState && typeof userState.F === 'number') {
        // F 是 AMAS 引擎中的疲劳度值 [0.05, 1.0]
        serviceLogger.debug({ userId, fatigue: userState.F.toFixed(3) }, '获取行为疲劳值成功');
        return userState.F;
      }

      // 如果没有用户状态，返回默认值（较低的疲劳度）
      serviceLogger.debug({ userId }, '未找到用户状态，使用默认行为疲劳值');
      return 0.1; // 默认较低疲劳度
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '获取行为疲劳值失败，使用默认值');
      return 0.1; // 出错时返回默认值
    }
  }

  /**
   * 获取用户当前学习会话的时长（分钟）
   *
   * 用于计算时间疲劳因素。
   *
   * @param userId 用户ID
   * @returns 学习时长（分钟）
   */
  async getStudyDurationMinutes(userId: string): Promise<number> {
    try {
      // 先检查缓存
      const cacheKey = `behavior_fatigue:session_duration:${userId}`;
      const cached = cacheService.get<number>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 查询用户最近的活跃学习会话
      const recentSession = await prisma.learningSession.findFirst({
        where: {
          userId,
          // 未结束或最近30分钟内结束的会话
          OR: [
            { endedAt: null },
            {
              endedAt: {
                gte: new Date(Date.now() - 30 * 60 * 1000),
              },
            },
          ],
        },
        orderBy: { startedAt: 'desc' },
        select: {
          startedAt: true,
          endedAt: true,
        },
      });

      if (!recentSession) {
        // 没有活跃会话
        cacheService.set(cacheKey, 0, 60); // 缓存1分钟
        return 0;
      }

      // 计算学习时长
      const startTime = recentSession.startedAt.getTime();
      const endTime = recentSession.endedAt?.getTime() ?? Date.now();
      const durationMinutes = Math.max(0, (endTime - startTime) / 60000);

      // 缓存结果（短时间缓存，因为时长会变化）
      cacheService.set(cacheKey, durationMinutes, 30); // 缓存30秒

      serviceLogger.debug(
        { userId, durationMinutes: durationMinutes.toFixed(1) },
        '获取学习时长成功',
      );

      return durationMinutes;
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '获取学习时长失败，使用默认值');
      return 0; // 出错时返回0
    }
  }

  /**
   * 获取用户当前学习会话信息
   *
   * @param userId 用户ID
   * @returns 会话信息或 null
   */
  async getCurrentSessionInfo(userId: string): Promise<UserSessionInfo | null> {
    try {
      const activeSession = await prisma.learningSession.findFirst({
        where: {
          userId,
          endedAt: null,
        },
        orderBy: { startedAt: 'desc' },
        select: {
          startedAt: true,
          answerRecords: {
            orderBy: { timestamp: 'desc' },
            take: 1,
            select: { timestamp: true },
          },
        },
      });

      if (!activeSession) {
        return null;
      }

      const now = Date.now();
      const startTime = activeSession.startedAt.getTime();
      const lastActivityTime = activeSession.answerRecords[0]?.timestamp.getTime() ?? startTime;

      return {
        startedAt: activeSession.startedAt,
        durationMinutes: (now - startTime) / 60000,
        lastActivityAt: new Date(lastActivityTime),
      };
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '获取会话信息失败');
      return null;
    }
  }

  /**
   * 获取用户最近的学习表现指标
   *
   * 用于补充行为疲劳的判断。
   *
   * @param userId 用户ID
   * @returns 最近表现指标
   */
  async getRecentPerformance(userId: string): Promise<{
    recentAccuracy: number;
    recentAvgResponseTime: number;
    answerCount: number;
  }> {
    try {
      // 获取最近30分钟的答题记录
      const recentRecords = await prisma.answerRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: new Date(Date.now() - 30 * 60 * 1000),
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: {
          isCorrect: true,
          responseTime: true,
        },
      });

      if (recentRecords.length === 0) {
        return {
          recentAccuracy: 0.5,
          recentAvgResponseTime: 5000,
          answerCount: 0,
        };
      }

      const correctCount = recentRecords.filter((r) => r.isCorrect).length;
      const recentAccuracy = correctCount / recentRecords.length;

      const totalResponseTime = recentRecords.reduce((sum, r) => sum + (r.responseTime || 0), 0);
      const recentAvgResponseTime = totalResponseTime / recentRecords.length;

      return {
        recentAccuracy,
        recentAvgResponseTime,
        answerCount: recentRecords.length,
      };
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '获取最近表现指标失败');
      return {
        recentAccuracy: 0.5,
        recentAvgResponseTime: 5000,
        answerCount: 0,
      };
    }
  }

  /**
   * 计算综合行为疲劳指数
   *
   * 结合 AMAS 疲劳度和最近表现计算综合指数。
   *
   * @param userId 用户ID
   * @returns 综合行为疲劳指数 [0, 1]
   */
  async getComprehensiveBehaviorFatigue(userId: string): Promise<{
    fatigue: number;
    confidence: number;
    breakdown: {
      amasFatigue: number;
      performanceFatigue: number;
      timeFatigue: number;
    };
  }> {
    // 并行获取所有数据
    const [amasFatigue, studyDuration, performance] = await Promise.all([
      this.getBehaviorFatigue(userId),
      this.getStudyDurationMinutes(userId),
      this.getRecentPerformance(userId),
    ]);

    // 基于表现计算疲劳（错误率高 = 可能疲劳）
    // 正常准确率约 70-80%，低于 60% 可能疲劳
    const accuracyFatigue =
      performance.recentAccuracy < 0.6 ? (0.6 - performance.recentAccuracy) / 0.6 : 0;

    // 基于响应时间计算疲劳（响应慢 = 可能疲劳）
    // 正常响应时间约 3-5 秒，超过 8 秒可能疲劳
    const rtFatigue =
      performance.recentAvgResponseTime > 8000
        ? Math.min(1, (performance.recentAvgResponseTime - 8000) / 10000)
        : 0;

    const performanceFatigue = accuracyFatigue * 0.6 + rtFatigue * 0.4;

    // 基于学习时长计算时间疲劳
    // 30分钟后开始累积，60分钟达到中等疲劳
    const timeFatigue = studyDuration > 30 ? Math.min(1, (studyDuration - 30) / 60) : 0;

    // 综合计算
    // AMAS 疲劳权重最高（已经综合了多种行为信号）
    const compositeFatigue = amasFatigue * 0.5 + performanceFatigue * 0.3 + timeFatigue * 0.2;

    // 计算置信度（基于数据量）
    const confidence = Math.min(1, performance.answerCount / 10);

    return {
      fatigue: Math.min(1, Math.max(0, compositeFatigue)),
      confidence,
      breakdown: {
        amasFatigue,
        performanceFatigue,
        timeFatigue,
      },
    };
  }
}

export const behaviorFatigueService = new BehaviorFatigueService();
