/**
 * Habit Profile Service
 * 习惯画像服务
 *
 * 提供用户学习习惯画像的管理功能
 * 包装 AMAS 层的 HabitRecognizer
 */

import { HabitRecognizer, HabitProfile } from '../amas/models/cognitive';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';
import { serviceLogger } from '../logger';

/**
 * 用户习惯识别器缓存
 */
const userRecognizers = new Map<string, HabitRecognizer>();

/**
 * 习惯画像服务类
 */
class HabitProfileService {
  /**
   * 获取用户的习惯识别器（带缓存）
   */
  private getRecognizer(userId: string): HabitRecognizer {
    let recognizer = userRecognizers.get(userId);
    if (!recognizer) {
      recognizer = new HabitRecognizer();
      userRecognizers.set(userId, recognizer);
    }
    return recognizer;
  }

  /**
   * 记录时间事件
   *
   * @param userId 用户ID
   * @param timestamp 时间戳（毫秒）
   */
  recordTimeEvent(userId: string, timestamp: number): void {
    try {
      const recognizer = this.getRecognizer(userId);
      const hour = new Date(timestamp).getHours();
      recognizer.updateTimePref(hour);
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '记录时间事件失败');
    }
  }

  /**
   * 记录会话时长
   *
   * @param userId 用户ID
   * @param durationMinutes 会话时长（分钟）
   */
  recordSessionDuration(userId: string, durationMinutes: number): void {
    try {
      const recognizer = this.getRecognizer(userId);
      recognizer.updateSessionDuration(durationMinutes);
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '记录会话时长失败');
    }
  }

  /**
   * 记录批量大小
   *
   * @param userId 用户ID
   * @param batchSize 批量大小
   */
  recordBatchSize(userId: string, batchSize: number): void {
    try {
      const recognizer = this.getRecognizer(userId);
      recognizer.updateBatchSize(batchSize);
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '记录批量大小失败');
    }
  }

  /**
   * 获取用户习惯画像
   *
   * @param userId 用户ID
   */
  getHabitProfile(userId: string): HabitProfile {
    const recognizer = this.getRecognizer(userId);
    return recognizer.getHabitProfile();
  }

  /**
   * 获取偏好时间段
   *
   * @param userId 用户ID
   */
  getPreferredTimeSlots(userId: string): number[] {
    const recognizer = this.getRecognizer(userId);
    return recognizer.getPreferredTimeSlots();
  }

  /**
   * 持久化习惯画像到数据库
   *
   * @param userId 用户ID
   */
  async persistHabitProfile(userId: string): Promise<void> {
    try {
      const profile = this.getHabitProfile(userId);

      // 只有当样本数足够时才持久化（与 userProfileService 保持一致）
      if (profile.samples.timeEvents < 10) {
        serviceLogger.debug(
          { userId, timeEvents: profile.samples.timeEvents },
          '习惯画像样本不足，跳过持久化',
        );
        return;
      }

      // 保存到 habit_profiles 表
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

      serviceLogger.debug({ userId }, '习惯画像已持久化');
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '持久化习惯画像失败');
      throw error;
    }
  }

  /**
   * 从数据库恢复习惯画像
   *
   * @param userId 用户ID
   */
  async loadHabitProfile(userId: string): Promise<HabitProfile | null> {
    try {
      const record = await prisma.habitProfile.findUnique({
        where: { userId },
        select: { timePref: true, rhythmPref: true, updatedAt: true },
      });

      if (!record) {
        return null;
      }

      const timePref = record.timePref;
      const rhythmPref = record.rhythmPref;

      if (!Array.isArray(timePref) || timePref.length !== 24) {
        return null;
      }

      const preferredTimeSlots = timePref
        .map((v, hour) => ({ hour, v: typeof v === 'number' ? v : 0 }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 3)
        .map((x) => x.hour);

      return {
        timePref: timePref as number[],
        rhythmPref: (rhythmPref as HabitProfile['rhythmPref']) ?? {
          sessionMedianMinutes: 15,
          batchMedian: 8,
        },
        preferredTimeSlots,
        samples: { timeEvents: 10, sessions: 0, batches: 0 },
      };
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '加载习惯画像失败');
      return null;
    }
  }

  /**
   * 清除用户的习惯识别器缓存
   *
   * @param userId 用户ID
   */
  clearCache(userId: string): void {
    userRecognizers.delete(userId);
  }

  /**
   * 清除所有缓存
   */
  clearAllCaches(): void {
    userRecognizers.clear();
  }
}

export const habitProfileService = new HabitProfileService();
