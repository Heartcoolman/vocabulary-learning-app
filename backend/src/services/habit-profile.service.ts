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
  recordSessionEnd(
    userId: string,
    sessionDurationMinutes: number,
    wordCount: number
  ): void {
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
        console.log(
          `[HabitProfile] 样本不足，跳过持久化: userId=${userId}, timeEvents=${profile.samples.timeEvents}`
        );
        return false;
      }

      await prisma.habitProfile.upsert({
        where: { userId },
        update: {
          timePref: profile.timePref,
          rhythmPref: profile.rhythmPref,
          updatedAt: new Date()
        },
        create: {
          userId,
          timePref: profile.timePref,
          rhythmPref: profile.rhythmPref
        }
      });

      console.log(
        `[HabitProfile] 已持久化: userId=${userId}, timeEvents=${profile.samples.timeEvents}, preferredSlots=${profile.preferredTimeSlots.join(',')}`
      );
      return true;
    } catch (error) {
      console.error(`[HabitProfile] 持久化失败: userId=${userId}`, error);
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
          sessionId: true
        }
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
          const startTs = timestamps[0] instanceof Date 
            ? timestamps[0].getTime() 
            : new Date(timestamps[0]).getTime();
          const endTs = timestamps[timestamps.length - 1] instanceof Date
            ? timestamps[timestamps.length - 1].getTime()
            : new Date(timestamps[timestamps.length - 1]).getTime();
          const durationMinutes = (endTs - startTs) / 60000;
          if (durationMinutes > 0 && durationMinutes < 180) {
            recognizer.updateSessionDuration(durationMinutes);
          }
        }
        recognizer.updateBatchSize(timestamps.length);
      }

      console.log(
        `[HabitProfile] 从历史记录初始化完成: userId=${userId}, records=${records.length}, sessions=${sessionGroups.size}`
      );
    } catch (error) {
      console.error(`[HabitProfile] 初始化失败: userId=${userId}`, error);
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
