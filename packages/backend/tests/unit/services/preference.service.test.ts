/**
 * PreferenceService Unit Tests
 * 用户偏好服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
const mockUserPreferenceFindUnique = vi.fn();
const mockUserPreferenceCreate = vi.fn();
const mockUserPreferenceUpdate = vi.fn();
const mockUserPreferenceUpsert = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    userPreference: {
      findUnique: (...args: any[]) => mockUserPreferenceFindUnique(...args),
      create: (...args: any[]) => mockUserPreferenceCreate(...args),
      update: (...args: any[]) => mockUserPreferenceUpdate(...args),
      upsert: (...args: any[]) => mockUserPreferenceUpsert(...args),
    },
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  serviceLogger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

describe('PreferenceService', () => {
  let preferenceService: any;
  const userId = 'test-user-id';

  const defaultPreferences = {
    id: 'pref-id',
    userId,
    preferredStudyTimeStart: '09:00',
    preferredStudyTimeEnd: '21:00',
    preferredDifficulty: 'adaptive',
    dailyGoalEnabled: true,
    dailyGoalWords: 20,
    enableForgettingAlerts: true,
    enableAchievements: true,
    enableReminders: true,
    enableSystemNotif: true,
    reminderFrequency: 'daily',
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    theme: 'light',
    language: 'zh-CN',
    soundEnabled: true,
    animationEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const module = await import('../../../src/services/preference.service');
    preferenceService = module.preferenceService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getPreferences', () => {
    it('应该返回用户现有的偏好设置', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.getPreferences(userId);

      expect(mockUserPreferenceFindUnique).toHaveBeenCalledWith({
        where: { userId },
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: 'pref-id',
          userId,
          theme: 'light',
        }),
      );
    });

    it('应该为新用户创建默认偏好设置', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(null);
      mockUserPreferenceCreate.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.getPreferences(userId);

      expect(mockUserPreferenceCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          preferredStudyTimeStart: '09:00',
          dailyGoalEnabled: true,
        }),
      });

      expect(result).toBeDefined();
    });
  });

  describe('getGroupedPreferences', () => {
    it('应该返回分组的偏好设置', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.getGroupedPreferences(userId);

      expect(result).toEqual({
        learning: expect.objectContaining({
          preferredStudyTimeStart: '09:00',
          preferredStudyTimeEnd: '21:00',
          preferredDifficulty: 'adaptive',
          dailyGoalEnabled: true,
          dailyGoalWords: 20,
        }),
        notification: expect.objectContaining({
          enableForgettingAlerts: true,
          enableAchievements: true,
          enableReminders: true,
          enableSystemNotif: true,
          reminderFrequency: 'daily',
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
        }),
        ui: expect.objectContaining({
          theme: 'light',
          language: 'zh-CN',
          soundEnabled: true,
          animationEnabled: true,
        }),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('updatePreferences', () => {
    it('应该更新学习偏好', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);
      mockUserPreferenceUpdate.mockResolvedValue({
        ...defaultPreferences,
        dailyGoalWords: 30,
      });

      await preferenceService.updatePreferences(userId, {
        learning: {
          dailyGoalWords: 30,
        },
      });

      expect(mockUserPreferenceUpdate).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          dailyGoalWords: 30,
        }),
      });
    });

    it('应该更新通知偏好', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);
      mockUserPreferenceUpdate.mockResolvedValue({
        ...defaultPreferences,
        enableForgettingAlerts: false,
      });

      await preferenceService.updatePreferences(userId, {
        notification: {
          enableForgettingAlerts: false,
        },
      });

      expect(mockUserPreferenceUpdate).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          enableForgettingAlerts: false,
        }),
      });
    });

    it('应该更新界面偏好', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);
      mockUserPreferenceUpdate.mockResolvedValue({
        ...defaultPreferences,
        theme: 'dark',
      });

      await preferenceService.updatePreferences(userId, {
        ui: {
          theme: 'dark',
        },
      });

      expect(mockUserPreferenceUpdate).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          theme: 'dark',
        }),
      });
    });

    it('应该过滤undefined值', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);
      mockUserPreferenceUpdate.mockResolvedValue(defaultPreferences);

      await preferenceService.updatePreferences(userId, {
        learning: {
          dailyGoalWords: 30,
          preferredDifficulty: undefined,
        },
      });

      const callArgs = mockUserPreferenceUpdate.mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('preferredDifficulty');
      expect(callArgs.data).toHaveProperty('dailyGoalWords', 30);
    });
  });

  describe('getLearningPreferences', () => {
    it('应该返回学习偏好设置', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.getLearningPreferences(userId);

      expect(result).toEqual({
        preferredStudyTimeStart: '09:00',
        preferredStudyTimeEnd: '21:00',
        preferredDifficulty: 'adaptive',
        dailyGoalEnabled: true,
        dailyGoalWords: 20,
      });
    });
  });

  describe('getNotificationPreferences', () => {
    it('应该返回通知偏好设置', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.getNotificationPreferences(userId);

      expect(result).toEqual({
        enableForgettingAlerts: true,
        enableAchievements: true,
        enableReminders: true,
        enableSystemNotif: true,
        reminderFrequency: 'daily',
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });
    });
  });

  describe('getUIPreferences', () => {
    it('应该返回界面偏好设置', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.getUIPreferences(userId);

      expect(result).toEqual({
        theme: 'light',
        language: 'zh-CN',
        soundEnabled: true,
        animationEnabled: true,
      });
    });
  });

  describe('resetPreferences', () => {
    it('应该重置偏好设置为默认值', async () => {
      mockUserPreferenceUpsert.mockResolvedValue(defaultPreferences);

      const result = await preferenceService.resetPreferences(userId);

      expect(mockUserPreferenceUpsert).toHaveBeenCalledWith({
        where: { userId },
        update: expect.objectContaining({
          preferredStudyTimeStart: '09:00',
          dailyGoalEnabled: true,
        }),
        create: expect.objectContaining({
          userId,
          preferredStudyTimeStart: '09:00',
          dailyGoalEnabled: true,
        }),
      });

      expect(result).toBeDefined();
    });
  });

  describe('isInQuietHours', () => {
    it('应该正确判断是否在免打扰时间（跨天情况）', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      // Mock current time to be 23:00
      const mockDate = new Date();
      mockDate.setHours(23, 0, 0, 0);
      vi.setSystemTime(mockDate);

      const result = await preferenceService.isInQuietHours(userId);

      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('应该正确判断是否在免打扰时间（非跨天情况）', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue({
        ...defaultPreferences,
        quietHoursStart: '12:00',
        quietHoursEnd: '14:00',
      });

      // Mock current time to be 13:00
      const mockDate = new Date();
      mockDate.setHours(13, 0, 0, 0);
      vi.setSystemTime(mockDate);

      const result = await preferenceService.isInQuietHours(userId);

      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('应该在免打扰时间外返回false', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue(defaultPreferences);

      // Mock current time to be 10:00
      const mockDate = new Date();
      mockDate.setHours(10, 0, 0, 0);
      vi.setSystemTime(mockDate);

      const result = await preferenceService.isInQuietHours(userId);

      expect(result).toBe(false);

      vi.useRealTimers();
    });

    it('应该在未设置免打扰时间时返回false', async () => {
      mockUserPreferenceFindUnique.mockResolvedValue({
        ...defaultPreferences,
        quietHoursStart: null,
        quietHoursEnd: null,
      });

      const result = await preferenceService.isInQuietHours(userId);

      expect(result).toBe(false);
    });
  });
});
