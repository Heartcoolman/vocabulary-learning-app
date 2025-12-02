/**
 * State History Service Tests
 * 状态历史服务单元测试
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    userStateHistory: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

import {
  stateHistoryService,
  StateHistoryItem,
  CognitiveGrowthResult,
  SignificantChange,
  UserState
} from '../../../src/services/state-history.service';

describe('StateHistoryService', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
  });

  describe('saveStateSnapshot', () => {
    it('应该创建新记录当今天没有记录', async () => {
      const userId = 'user-123';
      const state: UserState = {
        A: 0.8,
        F: 0.3,
        M: 0.7,
        C: { memory: 0.6, speed: 0.7, stability: 0.8 },
        T: 'up'
      };

      mockPrisma.userStateHistory.upsert.mockResolvedValue({});

      await stateHistoryService.saveStateSnapshot(userId, state);

      expect(mockPrisma.userStateHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId,
            attention: 0.8,
            fatigue: 0.3,
            motivation: 0.7,
            memory: 0.6,
            speed: 0.7,
            stability: 0.8,
            trendState: 'up'
          })
        })
      );
    });

    it('应该使用EMA更新当今天已有记录 (Property 16)', async () => {
      const userId = 'user-123';
      const existingRecord = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
        trendState: 'flat'
      };

      const newState: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.9,
        C: { memory: 0.7, speed: 0.8, stability: 0.9 }
      };

      mockPrisma.userStateHistory.findUnique.mockResolvedValue(existingRecord);
      mockPrisma.userStateHistory.upsert.mockResolvedValue({});

      await stateHistoryService.saveStateSnapshot(userId, newState);

      expect(mockPrisma.userStateHistory.upsert).toHaveBeenCalled();

      // 验证EMA计算 (alpha = 0.3)
      const upsertCall = mockPrisma.userStateHistory.upsert.mock.calls[0][0];
      const expectedAttention = 0.3 * 0.8 + 0.7 * 0.5; // 0.59
      expect(upsertCall.update.attention).toBeCloseTo(expectedAttention, 2);
    });
  });

  describe('getStateHistory', () => {
    it('应该返回指定天数范围内的记录 (Property 15, Requirements 5.1)', async () => {
      const userId = 'user-123';

      const mockHistory = Array(7).fill(null).map((_, i) => ({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        attention: 0.7,
        fatigue: 0.3,
        motivation: 0.6,
        memory: 0.5,
        speed: 0.6,
        stability: 0.7,
        trendState: 'flat'
      }));

      mockPrisma.userStateHistory.findMany.mockResolvedValue(mockHistory);

      const result = await stateHistoryService.getStateHistory(userId, 7);

      expect(result).toHaveLength(7);
      result.forEach(item => {
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('attention');
        expect(item).toHaveProperty('fatigue');
        expect(item).toHaveProperty('motivation');
        expect(item).toHaveProperty('memory');
        expect(item).toHaveProperty('speed');
        expect(item).toHaveProperty('stability');
      });
    });

    it('应该支持具体日期范围', async () => {
      const userId = 'user-123';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockPrisma.userStateHistory.findMany.mockResolvedValue([]);

      await stateHistoryService.getStateHistory(userId, { start: startDate, end: endDate });

      expect(mockPrisma.userStateHistory.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { date: 'asc' }
      });
    });
  });

  describe('getCognitiveGrowth', () => {
    it('应该对比当前和30天前的认知画像 (Property 17, Requirements 5.3)', async () => {
      const userId = 'user-123';

      const currentRecord = {
        date: new Date(),
        memory: 0.8,
        speed: 0.7,
        stability: 0.9
      };

      const pastRecord = {
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        memory: 0.5,
        speed: 0.5,
        stability: 0.6
      };

      mockPrisma.userStateHistory.findFirst
        .mockResolvedValueOnce(currentRecord)
        .mockResolvedValueOnce(pastRecord);

      const result = await stateHistoryService.getCognitiveGrowth(userId);

      expect(result.current.memory).toBe(0.8);
      expect(result.past.memory).toBe(0.5);
      expect(result.changes.memory).toBeCloseTo(0.3, 2);
      expect(result.changes.speed).toBeCloseTo(0.2, 2);
      expect(result.changes.stability).toBeCloseTo(0.3, 2);
      expect(result.period).toBe(30);
      expect(result.hasData).toBe(true);
    });

    it('应该返回默认值当没有历史数据', async () => {
      const userId = 'user-123';

      mockPrisma.userStateHistory.findFirst.mockResolvedValue(null);

      const result = await stateHistoryService.getCognitiveGrowth(userId);

      expect(result.hasData).toBe(false);
      expect(result.current.memory).toBe(0.5);
      expect(result.past.memory).toBe(0.5);
      expect(result.changes.memory).toBe(0);
    });

    it('应该返回 hasData=false 当只有当前数据没有历史数据', async () => {
      const userId = 'user-123';

      mockPrisma.userStateHistory.findFirst
        .mockResolvedValueOnce({ memory: 0.8, speed: 0.7, stability: 0.9 })
        .mockResolvedValueOnce(null);

      const result = await stateHistoryService.getCognitiveGrowth(userId);

      expect(result.hasData).toBe(false);
    });
  });

  describe('getSignificantChanges', () => {
    it('应该识别变化超过20%的指标 (Property 18, Requirements 5.5)', async () => {
      const userId = 'user-123';

      const history = [
        {
          date: new Date('2024-01-01'),
          attention: 0.5,
          fatigue: 0.5,
          motivation: 0.5,
          memory: 0.5,
          speed: 0.5,
          stability: 0.5,
          trendState: null
        },
        {
          date: new Date('2024-01-07'),
          attention: 0.8, // +60%
          fatigue: 0.3, // -40%
          motivation: 0.55, // +10% (不显著)
          memory: 0.7, // +40%
          speed: 0.5, // 0% (不显著)
          stability: 0.5, // 0% (不显著)
          trendState: null
        }
      ];

      mockPrisma.userStateHistory.findMany.mockResolvedValue(history);

      const result = await stateHistoryService.getSignificantChanges(userId, 7);

      // 应该包含 attention, fatigue, memory 的显著变化
      const significantMetrics = result.map(c => c.metric);
      expect(significantMetrics).toContain('attention');
      expect(significantMetrics).toContain('fatigue');
      expect(significantMetrics).toContain('memory');

      // 验证变化方向
      const attentionChange = result.find(c => c.metric === 'attention');
      expect(attentionChange?.direction).toBe('up');
      expect(attentionChange?.isPositive).toBe(true);

      const fatigueChange = result.find(c => c.metric === 'fatigue');
      expect(fatigueChange?.direction).toBe('down');
      expect(fatigueChange?.isPositive).toBe(true); // 疲劳度下降是好事
    });

    it('应该返回空数组当历史记录不足', async () => {
      const userId = 'user-123';

      mockPrisma.userStateHistory.findMany.mockResolvedValue([]);

      const result = await stateHistoryService.getSignificantChanges(userId, 7);

      expect(result).toEqual([]);
    });

    it('应该按变化幅度排序', async () => {
      const userId = 'user-123';

      const history = [
        {
          date: new Date('2024-01-01'),
          attention: 0.5,
          fatigue: 0.5,
          motivation: 0.5,
          memory: 0.5,
          speed: 0.5,
          stability: 0.5,
          trendState: null
        },
        {
          date: new Date('2024-01-07'),
          attention: 0.9, // +80%
          fatigue: 0.3, // -40%
          motivation: 0.8, // +60%
          memory: 0.6, // +20%
          speed: 0.5,
          stability: 0.5,
          trendState: null
        }
      ];

      mockPrisma.userStateHistory.findMany.mockResolvedValue(history);

      const result = await stateHistoryService.getSignificantChanges(userId, 7);

      // 验证按绝对变化幅度降序排列
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i - 1].changePercent)).toBeGreaterThanOrEqual(
          Math.abs(result[i].changePercent)
        );
      }
    });

    it('应该正确处理起始值接近0的情况', async () => {
      const userId = 'user-123';

      const history = [
        {
          date: new Date('2024-01-01'),
          attention: 0.5,
          fatigue: 0.5,
          motivation: 0, // 起始值为0
          memory: 0.5,
          speed: 0.5,
          stability: 0.5,
          trendState: null
        },
        {
          date: new Date('2024-01-07'),
          attention: 0.5,
          fatigue: 0.5,
          motivation: 0.5, // 从0变为0.5
          memory: 0.5,
          speed: 0.5,
          stability: 0.5,
          trendState: null
        }
      ];

      mockPrisma.userStateHistory.findMany.mockResolvedValue(history);

      const result = await stateHistoryService.getSignificantChanges(userId, 7);

      // motivation 从0变为0.5，绝对变化0.5 >= 0.2阈值，应标记为显著
      const motivationChange = result.find(c => c.metric === 'motivation');
      expect(motivationChange).toBeDefined();
      expect(motivationChange?.direction).toBe('up');
    });
  });

  describe('getStateByDate', () => {
    it('应该返回指定日期的状态', async () => {
      const userId = 'user-123';
      const targetDate = new Date('2024-01-15');

      const mockRecord = {
        date: targetDate,
        attention: 0.7,
        fatigue: 0.3,
        motivation: 0.6,
        memory: 0.5,
        speed: 0.6,
        stability: 0.7,
        trendState: 'up'
      };

      mockPrisma.userStateHistory.findUnique.mockResolvedValue(mockRecord);

      const result = await stateHistoryService.getStateByDate(userId, targetDate);

      expect(result).not.toBeNull();
      expect(result!.attention).toBe(0.7);
      expect(result!.trendState).toBe('up');
    });

    it('应该返回null当没有找到记录', async () => {
      mockPrisma.userStateHistory.findUnique.mockResolvedValue(null);

      const result = await stateHistoryService.getStateByDate('user-123', new Date());

      expect(result).toBeNull();
    });
  });

  describe('getHistorySummary', () => {
    it('应该返回指标平均值', async () => {
      const userId = 'user-123';

      const mockHistory = [
        { date: new Date(), attention: 0.8, fatigue: 0.2, motivation: 0.7, memory: 0.6, speed: 0.7, stability: 0.8 },
        { date: new Date(), attention: 0.6, fatigue: 0.4, motivation: 0.5, memory: 0.4, speed: 0.5, stability: 0.6 }
      ];

      mockPrisma.userStateHistory.findMany.mockResolvedValue(mockHistory);

      const result = await stateHistoryService.getHistorySummary(userId, 7);

      expect(result.recordCount).toBe(2);
      expect(result.avgAttention).toBeCloseTo(0.7, 2);
      expect(result.avgFatigue).toBeCloseTo(0.3, 2);
      expect(result.avgMotivation).toBeCloseTo(0.6, 2);
    });

    it('应该返回零值当没有记录', async () => {
      mockPrisma.userStateHistory.findMany.mockResolvedValue([]);

      const result = await stateHistoryService.getHistorySummary('user-123', 7);

      expect(result.recordCount).toBe(0);
      expect(result.avgAttention).toBe(0);
      expect(result.avgFatigue).toBe(0);
    });
  });

  describe('deleteUserHistory', () => {
    it('应该删除用户所有历史记录', async () => {
      const userId = 'user-123';

      mockPrisma.userStateHistory.deleteMany.mockResolvedValue({ count: 30 });

      await stateHistoryService.deleteUserHistory(userId);

      expect(mockPrisma.userStateHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId }
      });
    });
  });
});

describe('Significant Change Detection Logic', () => {
  describe('正负判断', () => {
    it('应该正确判断指标变化的正负性', () => {
      const POSITIVE_WHEN_DOWN = ['fatigue'];

      const isPositiveChange = (
        metric: string,
        direction: 'up' | 'down'
      ): boolean => {
        return POSITIVE_WHEN_DOWN.includes(metric)
          ? direction === 'down'
          : direction === 'up';
      };

      // 疲劳度下降是好事
      expect(isPositiveChange('fatigue', 'down')).toBe(true);
      expect(isPositiveChange('fatigue', 'up')).toBe(false);

      // 其他指标上升是好事
      expect(isPositiveChange('attention', 'up')).toBe(true);
      expect(isPositiveChange('attention', 'down')).toBe(false);
      expect(isPositiveChange('memory', 'up')).toBe(true);
    });
  });

  describe('变化百分比计算', () => {
    it('应该正确计算变化百分比', () => {
      const calculateChangePercent = (startValue: number, endValue: number): number => {
        if (Math.abs(startValue) < 0.001) {
          return (endValue - startValue) * 100;
        }
        return ((endValue - startValue) / Math.abs(startValue)) * 100;
      };

      expect(calculateChangePercent(0.5, 0.75)).toBeCloseTo(50, 1);
      expect(calculateChangePercent(0.8, 0.4)).toBeCloseTo(-50, 1);
      expect(calculateChangePercent(0, 0.3)).toBeCloseTo(30, 1);
    });
  });
});
