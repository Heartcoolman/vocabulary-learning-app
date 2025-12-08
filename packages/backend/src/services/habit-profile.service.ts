/**
 * 习惯画像服务
 * 负责计算和持久化用户学习习惯画像
 *
 * 修复问题: HabitProfile 表只读不写
 * - 使用 HabitRecognizer 计算习惯画像
 * - 在学习事件中记录时间偏好
 * - 在会话结束时持久化到数据库
 */

import prisma from '../config/database';
import { HabitRecognizer, HabitProfile } from '../amas/modeling/habit-recognizer';
import { serviceLogger } from '../logger';
import type { LearningSession as PrismaLearningSession } from '@prisma/client';

/**
 * 时间偏好数据类型 (HabitProfile.timePref JSON字段)
 */
interface TimePrefData {
  preferredTimes?: number[];
  slots?: number[];
  avgSessionDuration?: number;
  consistency?: number;
}

/**
 * Prisma LearningSession 类型的扩展（兼容旧字段名）
 */
type LearningSessionWithAliases = PrismaLearningSession & {
  startTime?: Date;
  duration?: number;
  sessionDuration?: number;
};

// 用户习惯识别器实例缓存 (内存中保持状态累积)
const userRecognizers = new Map<string, HabitRecognizer>();

/**
 * 获取用户专属的习惯识别器实例
 */
function getRecognizer(userId: string): HabitRecognizer {
  let recognizer = userRecognizers.get(userId);
  if (!recognizer) {
    recognizer = new HabitRecognizer();
    userRecognizers.set(userId, recognizer);
  }
  return recognizer;
}

class HabitProfileService {
  /**
   * 获取用户习惯画像（兼容测试）
   */
  async getProfile(userId: string) {
    const profile = await prisma.habitProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return {
        userId,
        preferredTimes: [],
        avgSessionDuration: 0,
        consistency: 0,
      };
    }

    const timePref = (profile.timePref ?? {}) as TimePrefData;
    const rhythmPref = profile.rhythmPref as { avgSessionDuration?: number } | null;
    return {
      userId: profile.userId,
      preferredTimes: timePref.preferredTimes || timePref.slots || [],
      avgSessionDuration: timePref.avgSessionDuration || rhythmPref?.avgSessionDuration || 0,
      consistency: timePref.consistency ?? 0,
    };
  }

  /**
   * 基于会话数据更新习惯画像（兼容测试）
   */
  async updateProfile(userId: string) {
    const sessions =
      (await prisma.learningSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      })) ?? [];

    if (!sessions.length) {
      return this.getProfile(userId);
    }

    // 计算首选时间段（小时）和平均时长
    const hourCounts = new Map<number, number>();
    const durations: number[] = [];

    for (const session of sessions) {
      const sessionWithAliases = session as LearningSessionWithAliases;
      const start = sessionWithAliases.startTime || sessionWithAliases.startedAt || new Date();
      const duration =
        sessionWithAliases.duration ??
        (sessionWithAliases.endedAt
          ? new Date(sessionWithAliases.endedAt).getTime() - new Date(start).getTime()
          : (sessionWithAliases.sessionDuration ?? 0));

      const hour = new Date(start).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      if (duration && Number.isFinite(duration)) {
        durations.push(duration);
      }
    }

    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([hour]) => hour)
      .slice(0, 3);

    const avgSessionDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const payload = {
      preferredTimes: sortedHours,
      avgSessionDuration,
      consistency: Math.min(1, sessions.length / 30),
    };

    const saved = await prisma.habitProfile.upsert({
      where: { userId },
      update: {
        timePref: payload,
        updatedAt: new Date(),
      },
      create: {
        userId,
        timePref: payload,
        rhythmPref: {},
      },
    });

    return {
      userId: saved.userId,
      preferredTimes: payload.preferredTimes,
      avgSessionDuration: payload.avgSessionDuration,
      consistency: payload.consistency,
    };
  }

  /**
   * 获取推荐学习时间（兼容测试）
   */
  async getRecommendedTimes(userId: string): Promise<number[]> {
    const profile = await this.getProfile(userId);
    if (profile.preferredTimes && profile.preferredTimes.length > 0) {
      return profile.preferredTimes;
    }
    // 默认推荐上午、下午和晚间
    return [9, 14, 20];
  }

  /**
   * 记录学习时间事件（每次答题时调用）
   * @param userId 用户ID
   * @param timestamp 事件时间戳
   */
  recordTimeEvent(userId: string, timestamp: number = Date.now()): void {
    const hour = new Date(timestamp).getHours();
    const recognizer = getRecognizer(userId);
    recognizer.updateTimePref(hour);
  }

  /**
   * 记录会话结束（会话结束时调用）
   * @param userId 用户ID
   * @param sessionDurationMinutes 会话时长（分钟）
   * @param wordCount 本次学习的单词数
   */
  recordSessionEnd(userId: string, sessionDurationMinutes: number, wordCount: number): void {
    const recognizer = getRecognizer(userId);
    recognizer.updateSessionDuration(sessionDurationMinutes);
    recognizer.updateBatchSize(wordCount);
  }

  /**
   * 获取当前习惯画像（内存中的）
   */
  getHabitProfile(userId: string): HabitProfile {
    const recognizer = getRecognizer(userId);
    return recognizer.getHabitProfile();
  }

  /**
   * 持久化习惯画像到数据库
   * @param userId 用户ID
   * @returns 是否成功保存
   */
  async persistHabitProfile(userId: string): Promise<boolean> {
    try {
      const recognizer = getRecognizer(userId);
      const profile = recognizer.getHabitProfile();

      // 只有当样本数足够时才持久化
      if (profile.samples.timeEvents < 10) {
        serviceLogger.info(
          { userId, timeEvents: profile.samples.timeEvents },
          '习惯画像样本不足，跳过持久化',
        );
        return false;
      }

      await prisma.habitProfile.upsert({
        where: { userId },
        update: {
          timePref: profile.timePref,
          rhythmPref: profile.rhythmPref,
          updatedAt: new Date(),
        },
        create: {
          userId,
          timePref: profile.timePref,
          rhythmPref: profile.rhythmPref,
        },
      });

      serviceLogger.info(
        {
          userId,
          timeEvents: profile.samples.timeEvents,
          preferredSlots: profile.preferredTimeSlots.join(','),
        },
        '习惯画像已持久化',
      );
      return true;
    } catch (error) {
      serviceLogger.error({ userId, error }, '习惯画像持久化失败');
      return false;
    }
  }

  /**
   * 从历史答题记录初始化习惯识别器
   * 用于服务重启后恢复用户状态
   */
  async initializeFromHistory(userId: string): Promise<void> {
    try {
      // 获取用户最近的答题记录（最多1000条）
      const records = await prisma.answerRecord.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 1000,
        select: {
          timestamp: true,
          sessionId: true,
        },
      });

      if (records.length === 0) return;

      const recognizer = getRecognizer(userId);

      // 按时间正序处理
      const sortedRecords = records.reverse();

      // 更新时间偏好
      for (const record of sortedRecords) {
        const hour = new Date(record.timestamp).getHours();
        recognizer.updateTimePref(hour);
      }

      // 计算会话统计
      const sessionGroups = new Map<string, Date[]>();
      for (const record of sortedRecords) {
        if (record.sessionId) {
          if (!sessionGroups.has(record.sessionId)) {
            sessionGroups.set(record.sessionId, []);
          }
          sessionGroups.get(record.sessionId)!.push(record.timestamp);
        }
      }

      // 更新会话时长和批量大小
      for (const [, timestamps] of sessionGroups) {
        if (timestamps.length >= 2) {
          // 确保正确获取时间戳（兼容 Date 对象和时间戳数字）
          const startTs =
            timestamps[0] instanceof Date
              ? timestamps[0].getTime()
              : new Date(timestamps[0]).getTime();
          const endTs =
            timestamps[timestamps.length - 1] instanceof Date
              ? timestamps[timestamps.length - 1].getTime()
              : new Date(timestamps[timestamps.length - 1]).getTime();
          const durationMinutes = (endTs - startTs) / 60000;
          if (durationMinutes > 0 && durationMinutes < 180) {
            recognizer.updateSessionDuration(durationMinutes);
          }
        }
        recognizer.updateBatchSize(timestamps.length);
      }

      serviceLogger.info(
        { userId, recordCount: records.length, sessionCount: sessionGroups.size },
        '从历史记录初始化习惯画像完成',
      );
    } catch (error) {
      serviceLogger.error({ userId, error }, '习惯画像初始化失败');
    }
  }

  /**
   * 重置用户的习惯识别器
   */
  resetUser(userId: string): void {
    userRecognizers.delete(userId);
  }

  /**
   * 获取所有活跃用户数量（用于监控）
   */
  getActiveUserCount(): number {
    return userRecognizers.size;
  }
}

export const habitProfileService = new HabitProfileService();
export default habitProfileService;
