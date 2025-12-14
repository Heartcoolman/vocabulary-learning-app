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

      // 更新用户的习惯画像到数据库
      await prisma.user.update({
        where: { id: userId },
        data: {
          habitProfile: profile as unknown as Record<string, unknown>,
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
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { habitProfile: true },
      });

      if (user?.habitProfile && typeof user.habitProfile === 'object') {
        const profile = user.habitProfile as unknown as HabitProfile;
        return profile;
      }

      return null;
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
