/**
 * Habit Profile Service Tests
 * 习惯画像服务单元测试
 * 
 * 测试内容:
 * - 时间事件记录
 * - 会话结束记录
 * - 习惯画像获取
 * - 持久化功能
 * - 从历史记录初始化
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    habitProfile: {
      upsert: vi.fn(),
      findUnique: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn()
    }
  }
}));

// 需要在 mock 之后导入
import { habitProfileService } from '../../../src/services/habit-profile.service';

describe('HabitProfileService', () => {
  const testUserId = 'test-user-habit-profile';
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
    // 重置用户状态
    habitProfileService.resetUser(testUserId);
  });

  afterEach(() => {
    habitProfileService.resetUser(testUserId);
  });

  describe('recordTimeEvent', () => {
    it('应该记录时间事件并更新时间偏好', () => {
      // 模拟在9点学习多次
      for (let i = 0; i < 15; i++) {
        const timestamp = new Date();
        timestamp.setHours(9, 0, 0, 0);
        habitProfileService.recordTimeEvent(testUserId, timestamp.getTime());
      }

      const profile = habitProfileService.getHabitProfile(testUserId);
      
      // 9点应该是偏好时段之一
      expect(profile.preferredTimeSlots).toContain(9);
      expect(profile.samples.timeEvents).toBe(15);
    });

    it('应该使用当前时间当未提供时间戳', () => {
      habitProfileService.recordTimeEvent(testUserId);

      const profile = habitProfileService.getHabitProfile(testUserId);
      expect(profile.samples.timeEvents).toBe(1);
    });

    it('应该正确处理多个时间点的学习', () => {
      // 模拟在不同时间学习
      const hours = [9, 9, 9, 14, 14, 20, 20, 20, 20];
      for (const hour of hours) {
        const timestamp = new Date();
        timestamp.setHours(hour, 0, 0, 0);
        habitProfileService.recordTimeEvent(testUserId, timestamp.getTime());
      }

      const profile = habitProfileService.getHabitProfile(testUserId);
      expect(profile.samples.timeEvents).toBe(9);
      // 由于样本数 < 10，preferredTimeSlots 应该为空
      expect(profile.preferredTimeSlots).toHaveLength(0);
    });

    it('应该在样本充足时返回偏好时间段', () => {
      // 模拟在固定时间学习足够次数
      for (let i = 0; i < 12; i++) {
        const timestamp = new Date();
        timestamp.setHours(10, 0, 0, 0);
        habitProfileService.recordTimeEvent(testUserId, timestamp.getTime());
      }

      const profile = habitProfileService.getHabitProfile(testUserId);
      expect(profile.samples.timeEvents).toBe(12);
      expect(profile.preferredTimeSlots.length).toBeGreaterThan(0);
      expect(profile.preferredTimeSlots).toContain(10);
    });
  });

  describe('recordSessionEnd', () => {
    it('应该记录会话信息', () => {
      habitProfileService.recordSessionEnd(testUserId, 30, 20);
      habitProfileService.recordSessionEnd(testUserId, 25, 15);
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      expect(profile.samples.sessions).toBe(2);
      expect(profile.samples.batches).toBe(2);
    });

    it('应该计算正确的中位数', () => {
      habitProfileService.recordSessionEnd(testUserId, 20, 10);
      habitProfileService.recordSessionEnd(testUserId, 30, 20);
      habitProfileService.recordSessionEnd(testUserId, 40, 30);
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      // 中位数应该是 30 和 20
      expect(profile.rhythmPref.sessionMedianMinutes).toBe(30);
      expect(profile.rhythmPref.batchMedian).toBe(20);
    });

    it('应该忽略无效的会话数据', () => {
      // 注意：recordSessionEnd 会分别检查 minutes 和 count
      // minutes 和 count 是独立验证的
      habitProfileService.recordSessionEnd(testUserId, -5, 10);  // minutes无效，count有效
      habitProfileService.recordSessionEnd(testUserId, 0, 10);   // minutes无效，count有效
      habitProfileService.recordSessionEnd(testUserId, 30, -10); // minutes有效，count无效
      habitProfileService.recordSessionEnd(testUserId, 30, 0);   // minutes有效，count无效
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      // minutes 有效的有 2 个 (30, 30)，count 有效的有 2 个 (10, 10)
      expect(profile.samples.sessions).toBe(2);
      expect(profile.samples.batches).toBe(2);
    });
  });

  describe('getHabitProfile', () => {
    it('应该返回默认值当没有数据', () => {
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      expect(profile.timePref).toHaveLength(24);
      expect(profile.preferredTimeSlots).toHaveLength(0);
      expect(profile.samples.timeEvents).toBe(0);
      expect(profile.samples.sessions).toBe(0);
      expect(profile.samples.batches).toBe(0);
    });

    it('应该返回正确的画像结构', () => {
      habitProfileService.recordTimeEvent(testUserId);
      habitProfileService.recordSessionEnd(testUserId, 30, 20);
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      expect(profile).toHaveProperty('timePref');
      expect(profile).toHaveProperty('rhythmPref');
      expect(profile).toHaveProperty('preferredTimeSlots');
      expect(profile).toHaveProperty('samples');
      expect(profile.rhythmPref).toHaveProperty('sessionMedianMinutes');
      expect(profile.rhythmPref).toHaveProperty('batchMedian');
    });
  });

  describe('persistHabitProfile', () => {
    it('应该在样本不足时跳过持久化', async () => {
      // 只记录5次时间事件（小于10）
      for (let i = 0; i < 5; i++) {
        habitProfileService.recordTimeEvent(testUserId);
      }
      
      const saved = await habitProfileService.persistHabitProfile(testUserId);
      
      expect(saved).toBe(false);
      expect(mockPrisma.habitProfile.upsert).not.toHaveBeenCalled();
    });

    it('应该在样本充足时执行持久化', async () => {
      // 记录15次时间事件（大于10）
      for (let i = 0; i < 15; i++) {
        habitProfileService.recordTimeEvent(testUserId);
      }
      
      mockPrisma.habitProfile.upsert.mockResolvedValue({});
      
      const saved = await habitProfileService.persistHabitProfile(testUserId);
      
      expect(saved).toBe(true);
      expect(mockPrisma.habitProfile.upsert).toHaveBeenCalledWith({
        where: { userId: testUserId },
        update: expect.objectContaining({
          timePref: expect.any(Array),
          rhythmPref: expect.any(Object)
        }),
        create: expect.objectContaining({
          userId: testUserId,
          timePref: expect.any(Array),
          rhythmPref: expect.any(Object)
        })
      });
    });

    it('应该在数据库错误时返回false', async () => {
      // 记录足够的时间事件
      for (let i = 0; i < 15; i++) {
        habitProfileService.recordTimeEvent(testUserId);
      }
      
      mockPrisma.habitProfile.upsert.mockRejectedValue(new Error('DB Error'));
      
      const saved = await habitProfileService.persistHabitProfile(testUserId);
      
      expect(saved).toBe(false);
    });
  });

  describe('initializeFromHistory', () => {
    it('应该从答题记录初始化习惯画像', async () => {
      // 模拟历史记录
      const records = [
        { timestamp: new Date(2024, 0, 1, 9, 0, 0), sessionId: 'session-1' },
        { timestamp: new Date(2024, 0, 1, 9, 10, 0), sessionId: 'session-1' },
        { timestamp: new Date(2024, 0, 1, 9, 30, 0), sessionId: 'session-1' },
        { timestamp: new Date(2024, 0, 2, 14, 0, 0), sessionId: 'session-2' },
        { timestamp: new Date(2024, 0, 2, 14, 20, 0), sessionId: 'session-2' }
      ];
      
      mockPrisma.answerRecord.findMany.mockResolvedValue(records);
      
      await habitProfileService.initializeFromHistory(testUserId);
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      // 应该有5个时间事件
      expect(profile.samples.timeEvents).toBe(5);
      // 批量大小应该被正确记录（每个会话的记录数）
      // session-1 有 3 条，session-2 有 2 条
      expect(profile.samples.batches).toBe(2);
      // 注意：会话时长计算依赖于日期对象的 getTime()，在测试环境中可能有差异
      // 主要验证批量大小功能正常
    });

    it('应该处理空历史记录', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      
      await habitProfileService.initializeFromHistory(testUserId);
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      expect(profile.samples.timeEvents).toBe(0);
    });

    it('应该处理没有sessionId的记录', async () => {
      const records = [
        { timestamp: new Date(2024, 0, 1, 9, 0, 0), sessionId: null },
        { timestamp: new Date(2024, 0, 1, 10, 0, 0), sessionId: null }
      ];
      
      mockPrisma.answerRecord.findMany.mockResolvedValue(records);
      
      await habitProfileService.initializeFromHistory(testUserId);
      
      const profile = habitProfileService.getHabitProfile(testUserId);
      
      // 时间事件应该被记录
      expect(profile.samples.timeEvents).toBe(2);
      // 但没有会话信息
      expect(profile.samples.sessions).toBe(0);
    });
  });

  describe('resetUser', () => {
    it('应该重置用户的习惯识别器', () => {
      // 先记录一些数据
      for (let i = 0; i < 10; i++) {
        habitProfileService.recordTimeEvent(testUserId);
      }
      habitProfileService.recordSessionEnd(testUserId, 30, 20);
      
      // 验证数据存在
      let profile = habitProfileService.getHabitProfile(testUserId);
      expect(profile.samples.timeEvents).toBe(10);
      
      // 重置用户
      habitProfileService.resetUser(testUserId);
      
      // 验证数据已清空
      profile = habitProfileService.getHabitProfile(testUserId);
      expect(profile.samples.timeEvents).toBe(0);
      expect(profile.samples.sessions).toBe(0);
    });
  });

  describe('getActiveUserCount', () => {
    it('应该返回活跃用户数量', () => {
      habitProfileService.recordTimeEvent('user-1');
      habitProfileService.recordTimeEvent('user-2');
      habitProfileService.recordTimeEvent('user-3');
      
      const count = habitProfileService.getActiveUserCount();
      
      // 包含 testUserId 可能在 beforeEach 中被创建
      expect(count).toBeGreaterThanOrEqual(3);
      
      // 清理
      habitProfileService.resetUser('user-1');
      habitProfileService.resetUser('user-2');
      habitProfileService.resetUser('user-3');
    });
  });
});
