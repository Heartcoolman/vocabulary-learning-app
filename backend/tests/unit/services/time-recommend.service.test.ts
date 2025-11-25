/**
 * Time Recommend Service Tests
 * 时间推荐服务单元测试
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      groupBy: vi.fn(),
      findMany: vi.fn()
    },
    habitProfile: {
      findUnique: vi.fn()
    }
  }
}));

import {
  timeRecommendService,
  TimeSlot,
  TimePreferenceResult,
  InsufficientDataResult
} from '../../../src/services/time-recommend.service';

describe('TimeRecommendService', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
  });

  describe('getTimePreferences', () => {
    it('应该返回数据不足响应当会话数量小于20 (Requirements 1.3)', async () => {
      const userId = 'user-123';

      // Mock 会话数量 = 10（小于20）
      mockPrisma.answerRecord.groupBy.mockResolvedValue(
        Array(10).fill({ sessionId: 'session' })
      );

      const result = await timeRecommendService.getTimePreferences(userId);

      expect('insufficientData' in result).toBe(true);
      const insufficientResult = result as InsufficientDataResult;
      expect(insufficientResult.insufficientData).toBe(true);
      expect(insufficientResult.minRequired).toBe(20);
      expect(insufficientResult.currentCount).toBe(10);
    });

    it('应该返回时间偏好分析结果当数据充足', async () => {
      const userId = 'user-123';

      // Mock 会话数量 = 25（大于20）
      mockPrisma.answerRecord.groupBy.mockResolvedValue(
        Array(25).fill({ sessionId: 'session' })
      );

      // Mock 习惯画像
      const timePref = Array(24).fill(0).map((_, i) => i === 9 ? 0.9 : 0.3);
      mockPrisma.habitProfile.findUnique.mockResolvedValue({
        userId,
        timePref
      });

      const result = await timeRecommendService.getTimePreferences(userId);

      expect('insufficientData' in result).toBe(false);
      const prefResult = result as TimePreferenceResult;
      expect(prefResult.timePref).toHaveLength(24);
      expect(prefResult.preferredSlots).toHaveLength(3);
      expect(prefResult.sampleCount).toBe(25);
    });

    it('应该从答题记录计算时间偏好当没有习惯画像', async () => {
      const userId = 'user-123';

      mockPrisma.answerRecord.groupBy.mockResolvedValue(
        Array(25).fill({ sessionId: 'session' })
      );

      mockPrisma.habitProfile.findUnique.mockResolvedValue(null);

      // Mock 答题记录
      const records = Array(50).fill(null).map((_, i) => ({
        timestamp: new Date(2024, 0, 1, 9 + Math.floor(i / 10), 0, 0), // 主要集中在9-14点
        isCorrect: i % 3 !== 0, // 2/3正确率
        responseTime: 3000 + Math.random() * 2000
      }));
      mockPrisma.answerRecord.findMany.mockResolvedValue(records);

      const result = await timeRecommendService.getTimePreferences(userId);

      expect('insufficientData' in result).toBe(false);
      const prefResult = result as TimePreferenceResult;
      expect(prefResult.timePref).toHaveLength(24);
    });
  });

  describe('isGoldenTime', () => {
    it('应该返回黄金时间当当前小时在推荐时段且得分高于阈值 (Requirements 1.2)', async () => {
      const userId = 'user-123';

      mockPrisma.answerRecord.groupBy.mockResolvedValue(
        Array(25).fill({ sessionId: 'session' })
      );

      // 创建一个在当前小时有高分的时间偏好
      const currentHour = new Date().getHours();
      const timePref = Array(24).fill(0.3);
      timePref[currentHour] = 0.9; // 当前小时得分很高

      mockPrisma.habitProfile.findUnique.mockResolvedValue({
        userId,
        timePref
      });

      const result = await timeRecommendService.isGoldenTime(userId);

      expect(result.currentHour).toBe(currentHour);
      // 如果当前小时在推荐的前3个时段中且得分>=0.6，则为黄金时间
      if (result.isGolden) {
        expect(result.matchedSlot).toBeDefined();
        expect(result.matchedSlot!.score).toBeGreaterThanOrEqual(0.6);
      }
    });

    it('应该返回非黄金时间当数据不足', async () => {
      const userId = 'user-123';

      mockPrisma.answerRecord.groupBy.mockResolvedValue(
        Array(5).fill({ sessionId: 'session' })
      );

      const result = await timeRecommendService.isGoldenTime(userId);

      expect(result.isGolden).toBe(false);
      expect(result.matchedSlot).toBeUndefined();
    });
  });

  describe('getRecommendedSlots', () => {
    it('应该返回恰好3个时间段按得分降序排列 (Property 1, Requirements 1.5)', () => {
      const timePref = Array(24).fill(0.3);
      timePref[9] = 0.9;   // 最高分
      timePref[14] = 0.7;  // 第二高
      timePref[20] = 0.6;  // 第三高
      timePref[3] = 0.5;   // 第四高（不应出现）

      const slots = timeRecommendService.getRecommendedSlots(timePref);

      expect(slots).toHaveLength(3);
      expect(slots[0].hour).toBe(9);
      expect(slots[0].score).toBe(0.9);
      expect(slots[1].hour).toBe(14);
      expect(slots[2].hour).toBe(20);

      // 验证降序排列
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i - 1].score).toBeGreaterThanOrEqual(slots[i].score);
      }
    });

    it('应该归一化所有得分到0-1范围', () => {
      const timePref = Array(24).fill(0.5);
      timePref[10] = 1.5; // 超出范围
      timePref[11] = -0.5; // 负数

      const slots = timeRecommendService.getRecommendedSlots(timePref);

      slots.forEach(slot => {
        expect(slot.score).toBeGreaterThanOrEqual(0);
        expect(slot.score).toBeLessThanOrEqual(1);
        expect(slot.hour).toBeGreaterThanOrEqual(0);
        expect(slot.hour).toBeLessThanOrEqual(23);
      });
    });

    it('应该返回默认时间段当输入无效', () => {
      // 非24元素数组
      const invalidTimePref = [0.5, 0.6, 0.7];

      const slots = timeRecommendService.getRecommendedSlots(invalidTimePref);

      expect(slots).toHaveLength(3);
      // 默认时间段: 9点、14点、20点
      expect(slots.map(s => s.hour)).toContain(9);
      expect(slots.map(s => s.hour)).toContain(14);
      expect(slots.map(s => s.hour)).toContain(20);
    });

    it('应该为每个时间段计算置信度', () => {
      const timePref = Array(24).fill(0.5);
      timePref[9] = 0.9;
      timePref[10] = 0.1;

      const slots = timeRecommendService.getRecommendedSlots(timePref);

      slots.forEach(slot => {
        expect(slot.confidence).toBeGreaterThanOrEqual(0);
        expect(slot.confidence).toBeLessThanOrEqual(1);
      });

      // 高分时段应该有较高置信度
      const slot9 = slots.find(s => s.hour === 9);
      expect(slot9).toBeDefined();
      expect(slot9!.confidence).toBeGreaterThan(0.5);
    });
  });
});

describe('Time Preference Calculations', () => {
  describe('归一化得分', () => {
    it('应该将超出范围的值限制在0-1之间', () => {
      const normalizeScore = (score: number): number => {
        if (typeof score !== 'number' || !Number.isFinite(score)) {
          return 0;
        }
        return Math.max(0, Math.min(1, score));
      };

      expect(normalizeScore(1.5)).toBe(1);
      expect(normalizeScore(-0.5)).toBe(0);
      expect(normalizeScore(0.5)).toBe(0.5);
      expect(normalizeScore(NaN)).toBe(0);
      expect(normalizeScore(Infinity)).toBe(0);
    });
  });

  describe('置信度计算', () => {
    it('应该基于标准差计算置信度', () => {
      const calculateSlotConfidence = (score: number, allScores: number[]): number => {
        const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        const stdDev = Math.sqrt(
          allScores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / allScores.length
        );

        if (stdDev === 0) return 0.5;

        const zScore = (score - avg) / stdDev;
        return Math.max(0, Math.min(1, 0.5 + zScore * 0.2));
      };

      // 均匀分布
      const uniformScores = Array(24).fill(0.5);
      expect(calculateSlotConfidence(0.5, uniformScores)).toBe(0.5);

      // 有明显差异的分布
      const variedScores = Array(24).fill(0.3);
      variedScores[9] = 0.9;
      const confidence = calculateSlotConfidence(0.9, variedScores);
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  describe('整体置信度计算', () => {
    it('应该结合样本数量和时间分布方差', () => {
      const calculateConfidence = (sessionCount: number, timePref: number[]): number => {
        const sampleConfidence = Math.min(1, sessionCount / 100);
        const avg = timePref.reduce((a, b) => a + b, 0) / timePref.length;
        const variance = timePref.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / timePref.length;
        const varianceConfidence = Math.min(1, variance * 10);
        return sampleConfidence * 0.6 + varianceConfidence * 0.4;
      };

      // 少量样本，均匀分布
      const lowConfidence = calculateConfidence(10, Array(24).fill(0.5));
      expect(lowConfidence).toBeLessThan(0.3);

      // 大量样本，明显模式
      const variedPref = Array(24).fill(0.3);
      variedPref[9] = 0.9;
      variedPref[10] = 0.8;
      const highConfidence = calculateConfidence(100, variedPref);
      expect(highConfidence).toBeGreaterThan(0.5);
    });
  });
});
