/**
 * Preference Service
 *
 * 职责：
 * - 管理用户偏好设置的CRUD操作
 * - 支持学习偏好、通知偏好、界面偏好三大类
 * - 提供分组查询和更新
 * - 自动创建默认偏好设置
 */

import type {
  UserPreference,
  LearningPreferences,
  NotificationPreferences,
  UIPreferences,
  UpdatePreferencesDto,
  PreferencesResponse,
} from '@danci/shared/types';
import prisma, { DatabaseClient } from '../config/database';
import { serviceLogger } from '../logger';

const logger = serviceLogger.child({ module: 'preference-service' });

/**
 * 默认偏好设置
 */
const DEFAULT_PREFERENCES = {
  // 学习偏好
  preferredStudyTimeStart: '09:00',
  preferredStudyTimeEnd: '21:00',
  preferredDifficulty: 'adaptive',
  dailyGoalEnabled: true,
  dailyGoalWords: 20,
  // 通知偏好
  enableForgettingAlerts: true,
  enableAchievements: true,
  enableReminders: true,
  enableSystemNotif: true,
  reminderFrequency: 'daily',
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  // 界面偏好
  theme: 'light',
  language: 'zh-CN',
  soundEnabled: true,
  animationEnabled: true,
};

/**
 * 用户偏好服务类
 */
class PreferenceService {
  constructor(private prisma: DatabaseClient) {
    logger.info('PreferenceService initialized');
  }

  /**
   * 获取用户偏好设置（完整）
   *
   * @param userId - 用户ID
   * @returns 用户偏好设置
   */
  async getPreferences(userId: string): Promise<UserPreference> {
    try {
      let preferences = await this.prisma.userPreference.findUnique({
        where: { userId },
      });

      // 如果不存在，创建默认偏好设置
      if (!preferences) {
        preferences = await this.createDefaultPreferences(userId);
        logger.info({ userId }, 'Created default preferences for user');
      }

      return this.mapToUserPreference(preferences);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get preferences');
      throw error;
    }
  }

  /**
   * 获取分组的偏好设置
   *
   * @param userId - 用户ID
   * @returns 分组的偏好设置
   */
  async getGroupedPreferences(userId: string): Promise<PreferencesResponse> {
    try {
      const preferences = await this.getPreferences(userId);

      return {
        learning: {
          preferredStudyTimeStart: preferences.preferredStudyTimeStart,
          preferredStudyTimeEnd: preferences.preferredStudyTimeEnd,
          preferredDifficulty: preferences.preferredDifficulty as any,
          dailyGoalEnabled: preferences.dailyGoalEnabled,
          dailyGoalWords: preferences.dailyGoalWords,
        },
        notification: {
          enableForgettingAlerts: preferences.enableForgettingAlerts,
          enableAchievements: preferences.enableAchievements,
          enableReminders: preferences.enableReminders,
          enableSystemNotif: preferences.enableSystemNotif,
          reminderFrequency: preferences.reminderFrequency as any,
          quietHoursStart: preferences.quietHoursStart,
          quietHoursEnd: preferences.quietHoursEnd,
        },
        ui: {
          theme: preferences.theme as any,
          language: preferences.language,
          soundEnabled: preferences.soundEnabled,
          animationEnabled: preferences.animationEnabled,
        },
        updatedAt: preferences.updatedAt,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get grouped preferences');
      throw error;
    }
  }

  /**
   * 更新偏好设置
   *
   * @param userId - 用户ID
   * @param dto - 更新数据
   * @returns 更新后的偏好设置
   */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserPreference> {
    try {
      // 确保用户偏好设置存在
      await this.ensurePreferencesExist(userId);

      // 构建更新数据
      const updateData: any = {};

      if (dto.learning) {
        Object.assign(updateData, {
          preferredStudyTimeStart: dto.learning.preferredStudyTimeStart,
          preferredStudyTimeEnd: dto.learning.preferredStudyTimeEnd,
          preferredDifficulty: dto.learning.preferredDifficulty,
          dailyGoalEnabled: dto.learning.dailyGoalEnabled,
          dailyGoalWords: dto.learning.dailyGoalWords,
        });
      }

      if (dto.notification) {
        Object.assign(updateData, {
          enableForgettingAlerts: dto.notification.enableForgettingAlerts,
          enableAchievements: dto.notification.enableAchievements,
          enableReminders: dto.notification.enableReminders,
          enableSystemNotif: dto.notification.enableSystemNotif,
          reminderFrequency: dto.notification.reminderFrequency,
          quietHoursStart: dto.notification.quietHoursStart,
          quietHoursEnd: dto.notification.quietHoursEnd,
        });
      }

      if (dto.ui) {
        Object.assign(updateData, {
          theme: dto.ui.theme,
          language: dto.ui.language,
          soundEnabled: dto.ui.soundEnabled,
          animationEnabled: dto.ui.animationEnabled,
        });
      }

      // 移除undefined值
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const updated = await this.prisma.userPreference.update({
        where: { userId },
        data: updateData,
      });

      logger.info({ userId, updates: Object.keys(updateData) }, 'Preferences updated');

      return this.mapToUserPreference(updated);
    } catch (error) {
      logger.error({ error, userId, dto }, 'Failed to update preferences');
      throw error;
    }
  }

  /**
   * 获取学习偏好
   *
   * @param userId - 用户ID
   * @returns 学习偏好
   */
  async getLearningPreferences(userId: string): Promise<LearningPreferences> {
    try {
      const preferences = await this.getPreferences(userId);

      return {
        preferredStudyTimeStart: preferences.preferredStudyTimeStart,
        preferredStudyTimeEnd: preferences.preferredStudyTimeEnd,
        preferredDifficulty: preferences.preferredDifficulty as any,
        dailyGoalEnabled: preferences.dailyGoalEnabled,
        dailyGoalWords: preferences.dailyGoalWords,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get learning preferences');
      throw error;
    }
  }

  /**
   * 更新学习偏好
   *
   * @param userId - 用户ID
   * @param preferences - 学习偏好
   */
  async updateLearningPreferences(
    userId: string,
    preferences: Partial<LearningPreferences>,
  ): Promise<void> {
    try {
      await this.updatePreferences(userId, { learning: preferences });
      logger.debug({ userId }, 'Learning preferences updated');
    } catch (error) {
      logger.error({ error, userId, preferences }, 'Failed to update learning preferences');
      throw error;
    }
  }

  /**
   * 获取通知偏好
   *
   * @param userId - 用户ID
   * @returns 通知偏好
   */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const preferences = await this.getPreferences(userId);

      return {
        enableForgettingAlerts: preferences.enableForgettingAlerts,
        enableAchievements: preferences.enableAchievements,
        enableReminders: preferences.enableReminders,
        enableSystemNotif: preferences.enableSystemNotif,
        reminderFrequency: preferences.reminderFrequency as any,
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get notification preferences');
      throw error;
    }
  }

  /**
   * 更新通知偏好
   *
   * @param userId - 用户ID
   * @param preferences - 通知偏好
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
  ): Promise<void> {
    try {
      await this.updatePreferences(userId, { notification: preferences });
      logger.debug({ userId }, 'Notification preferences updated');
    } catch (error) {
      logger.error({ error, userId, preferences }, 'Failed to update notification preferences');
      throw error;
    }
  }

  /**
   * 获取界面偏好
   *
   * @param userId - 用户ID
   * @returns 界面偏好
   */
  async getUIPreferences(userId: string): Promise<UIPreferences> {
    try {
      const preferences = await this.getPreferences(userId);

      return {
        theme: preferences.theme as any,
        language: preferences.language,
        soundEnabled: preferences.soundEnabled,
        animationEnabled: preferences.animationEnabled,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get UI preferences');
      throw error;
    }
  }

  /**
   * 更新界面偏好
   *
   * @param userId - 用户ID
   * @param preferences - 界面偏好
   */
  async updateUIPreferences(userId: string, preferences: Partial<UIPreferences>): Promise<void> {
    try {
      await this.updatePreferences(userId, { ui: preferences });
      logger.debug({ userId }, 'UI preferences updated');
    } catch (error) {
      logger.error({ error, userId, preferences }, 'Failed to update UI preferences');
      throw error;
    }
  }

  /**
   * 重置偏好设置为默认值
   *
   * @param userId - 用户ID
   */
  async resetPreferences(userId: string): Promise<UserPreference> {
    try {
      const reset = await this.prisma.userPreference.upsert({
        where: { userId },
        update: DEFAULT_PREFERENCES,
        create: {
          userId,
          ...DEFAULT_PREFERENCES,
        },
      });

      logger.info({ userId }, 'Preferences reset to defaults');

      return this.mapToUserPreference(reset);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to reset preferences');
      throw error;
    }
  }

  /**
   * 检查是否在免打扰时间段
   *
   * @param userId - 用户ID
   * @returns 是否在免打扰时间
   */
  async isInQuietHours(userId: string): Promise<boolean> {
    try {
      const preferences = await this.getNotificationPreferences(userId);

      if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
        return false;
      }

      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const [startHour, startMin] = preferences.quietHoursStart.split(':').map(Number);
      const [endHour, endMin] = preferences.quietHoursEnd.split(':').map(Number);

      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      // 处理跨天的情况（如 22:00 - 08:00）
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime <= endTime;
      } else {
        return currentTime >= startTime && currentTime <= endTime;
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to check quiet hours');
      return false;
    }
  }

  /**
   * 确保用户偏好设置存在
   */
  private async ensurePreferencesExist(userId: string): Promise<void> {
    const exists = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!exists) {
      await this.createDefaultPreferences(userId);
    }
  }

  /**
   * 创建默认偏好设置
   */
  private async createDefaultPreferences(userId: string): Promise<any> {
    return await this.prisma.userPreference.create({
      data: {
        userId,
        ...DEFAULT_PREFERENCES,
      },
    });
  }

  /**
   * 映射Prisma偏好设置到DTO
   */
  private mapToUserPreference(preferences: any): UserPreference {
    return {
      id: preferences.id,
      userId: preferences.userId,
      preferredStudyTimeStart: preferences.preferredStudyTimeStart,
      preferredStudyTimeEnd: preferences.preferredStudyTimeEnd,
      preferredDifficulty: preferences.preferredDifficulty,
      dailyGoalEnabled: preferences.dailyGoalEnabled,
      dailyGoalWords: preferences.dailyGoalWords,
      enableForgettingAlerts: preferences.enableForgettingAlerts,
      enableAchievements: preferences.enableAchievements,
      enableReminders: preferences.enableReminders,
      enableSystemNotif: preferences.enableSystemNotif,
      reminderFrequency: preferences.reminderFrequency,
      quietHoursStart: preferences.quietHoursStart,
      quietHoursEnd: preferences.quietHoursEnd,
      theme: preferences.theme,
      language: preferences.language,
      soundEnabled: preferences.soundEnabled,
      animationEnabled: preferences.animationEnabled,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }
}

// 导出单例
export const preferenceService = new PreferenceService(prisma);
export default preferenceService;
