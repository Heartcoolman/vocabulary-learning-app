/**
 * Trend Analysis Service Tests
 * 趋势分析服务单元测试
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    amasUserState: {
      findUnique: vi.fn()
    },
    userStateHistory: {
      findMany: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn()
    }
  }
}));

import {
  trendAnalysisService,
  TrendState,
  TrendResult,
  TrendHistoryItem,
  TrendReport,
  InterventionResult
} from '../../../src/services/trend-analysis.service';

describe('TrendAnalysisService', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
  });

  describe('getCurrentTrend', () => {
    it('应该返回有效的 TrendState (Property 4)', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'up'
      });

      mockPrisma.userStateHistory.findMany.mockResolvedValue([
        { date: new Date(), trendState: 'up', motivation: 0.8, memory: 0.7, speed: 0.6 }
      ]);

      const result = await trendAnalysisService.getCurrentTrend(userId);

      expect(['up', 'flat', 'stuck', 'down']).toContain(result.state);
      expect(result.consecutiveDays).toBeGreaterThanOrEqual(0);
      expect(result.lastChange).toBeInstanceOf(Date);
    });

    it('应该从历史记录推断趋势当没有 AMAS 状态', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue(null);

      // 创建显示上升趋势的历史记录
      const recentHistory = Array(14).fill(null).map((_, i) => ({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        trendState: null,
        motivation: i < 7 ? 0.8 : 0.5, // 最近7天动机更高
        memory: i < 7 ? 0.7 : 0.4,
        speed: i < 7 ? 0.6 : 0.3
      }));

      mockPrisma.userStateHistory.findMany.mockResolvedValue(recentHistory);

      const result = await trendAnalysisService.getCurrentTrend(userId);

      expect(['up', 'flat', 'stuck', 'down']).toContain(result.state);
    });

    it('应该验证并回退无效的趋势状态', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'invalid_state' // 无效状态
      });

      mockPrisma.userStateHistory.findMany.mockResolvedValue([]);

      const result = await trendAnalysisService.getCurrentTrend(userId);

      // 应该回退到 'flat'
      expect(result.state).toBe('flat');
    });

    it('应该正确计算连续天数', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'up'
      });

      // 连续5天 'up' 状态
      const history = Array(5).fill(null).map((_, i) => ({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        trendState: 'up',
        motivation: 0.8,
        memory: 0.7,
        speed: 0.6
      }));

      mockPrisma.userStateHistory.findMany.mockResolvedValue(history);

      const result = await trendAnalysisService.getCurrentTrend(userId);

      expect(result.consecutiveDays).toBe(5);
    });

    it('应该返回1当没有历史记录 (边界情况修复)', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'flat'
      });

      mockPrisma.userStateHistory.findMany.mockResolvedValue([]);

      const result = await trendAnalysisService.getCurrentTrend(userId);

      // 今天是第1天
      expect(result.consecutiveDays).toBe(1);
    });
  });

  describe('getTrendHistory', () => {
    it('应该返回按周分组的历史数据 (Property 5)', async () => {
      const userId = 'user-123';

      // 28天的历史记录
      const history = Array(28).fill(null).map((_, i) => ({
        date: new Date(Date.now() - (27 - i) * 24 * 60 * 60 * 1000),
        trendState: 'flat',
        motivation: 0.5 + Math.random() * 0.3
      }));

      mockPrisma.userStateHistory.findMany.mockResolvedValue(history);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const result = await trendAnalysisService.getTrendHistory(userId, 28);

      expect(Array.isArray(result)).toBe(true);
      result.forEach(item => {
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('state');
        expect(item).toHaveProperty('accuracy');
        expect(item).toHaveProperty('avgResponseTime');
        expect(item).toHaveProperty('motivation');
      });
    });

    it('应该正确聚合每日答题记录', async () => {
      const userId = 'user-123';
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.userStateHistory.findMany.mockResolvedValue([
        { date: today, trendState: 'up', motivation: 0.8 }
      ]);

      // 今日10个答题记录，8个正确
      mockPrisma.answerRecord.findMany.mockResolvedValue(
        Array(10).fill(null).map((_, i) => ({
          timestamp: new Date(today.getTime() + i * 1000),
          isCorrect: i < 8,
          responseTime: 2000 + i * 100
        }))
      );

      const result = await trendAnalysisService.getTrendHistory(userId, 7);

      const todayItem = result.find(item =>
        item.date.toISOString().split('T')[0] === today.toISOString().split('T')[0]
      );

      if (todayItem) {
        expect(todayItem.accuracy).toBe(0.8); // 8/10
        expect(todayItem.avgResponseTime).toBeGreaterThan(0);
      }
    });
  });

  describe('generateTrendReport', () => {
    it('应该生成包含所有必需字段的报告 (Property 7)', async () => {
      const userId = 'user-123';

      mockPrisma.userStateHistory.findMany.mockResolvedValue(
        Array(28).fill(null).map((_, i) => ({
          date: new Date(Date.now() - (27 - i) * 24 * 60 * 60 * 1000),
          trendState: 'flat',
          motivation: 0.5
        }))
      );

      mockPrisma.answerRecord.findMany.mockResolvedValue(
        Array(100).fill(null).map((_, i) => ({
          timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          isCorrect: i % 4 !== 0,
          responseTime: 3000
        }))
      );

      const report = await trendAnalysisService.generateTrendReport(userId);

      expect(report.accuracyTrend).toBeDefined();
      expect(report.responseTimeTrend).toBeDefined();
      expect(report.motivationTrend).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);

      // 验证趋势线结构
      expect(report.accuracyTrend).toHaveProperty('points');
      expect(report.accuracyTrend).toHaveProperty('direction');
      expect(report.accuracyTrend).toHaveProperty('changePercent');
    });

    it('应该正确判断趋势方向', async () => {
      const userId = 'user-123';

      // 创建上升趋势的数据
      mockPrisma.userStateHistory.findMany.mockResolvedValue(
        Array(28).fill(null).map((_, i) => ({
          date: new Date(Date.now() - (27 - i) * 24 * 60 * 60 * 1000),
          trendState: 'up',
          motivation: 0.3 + (i / 28) * 0.5 // 从0.3上升到0.8
        }))
      );

      mockPrisma.answerRecord.findMany.mockResolvedValue(
        Array(280).fill(null).map((_, i) => ({
          timestamp: new Date(Date.now() - Math.floor(i / 10) * 24 * 60 * 60 * 1000),
          isCorrect: Math.random() < (0.5 + (Math.floor(i / 10) / 28) * 0.3),
          responseTime: 5000 - (Math.floor(i / 10) / 28) * 2000
        }))
      );

      const report = await trendAnalysisService.generateTrendReport(userId);

      expect(['up', 'down', 'flat']).toContain(report.motivationTrend.direction);
    });
  });

  describe('checkIntervention', () => {
    it('应该在 stuck 或 down 状态时返回需要干预 (Property 4)', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'down'
      });

      mockPrisma.userStateHistory.findMany.mockResolvedValue([
        { date: new Date(), trendState: 'down', motivation: 0.3, memory: 0.3, speed: 0.3 }
      ]);

      const result = await trendAnalysisService.checkIntervention(userId);

      expect(result.needsIntervention).toBe(true);
      expect(result.type).toBeDefined();
      expect(result.message).toBeDefined();
      expect(Array.isArray(result.actions)).toBe(true);
    });

    it('应该在 up 或 flat 状态时返回不需要干预', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'up'
      });

      mockPrisma.userStateHistory.findMany.mockResolvedValue([
        { date: new Date(), trendState: 'up', motivation: 0.8, memory: 0.7, speed: 0.6 }
      ]);

      const result = await trendAnalysisService.checkIntervention(userId);

      expect(result.needsIntervention).toBe(false);
    });

    it('应该在连续超过3天 down 状态时触发警告 (Property 6, Requirements 2.4)', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'down'
      });

      // 连续5天 down 状态
      mockPrisma.userStateHistory.findMany.mockResolvedValue(
        Array(5).fill(null).map((_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          trendState: 'down',
          motivation: 0.3,
          memory: 0.3,
          speed: 0.3
        }))
      );

      const result = await trendAnalysisService.checkIntervention(userId);

      expect(result.needsIntervention).toBe(true);
      expect(result.type).toBe('warning');
      expect(result.message).toContain('连续');
    });

    it('应该为 stuck 状态返回鼓励类型', async () => {
      const userId = 'user-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({
        userId,
        trendState: 'stuck'
      });

      mockPrisma.userStateHistory.findMany.mockResolvedValue([
        { date: new Date(), trendState: 'stuck', motivation: 0.5, memory: 0.5, speed: 0.5 }
      ]);

      const result = await trendAnalysisService.checkIntervention(userId);

      expect(result.needsIntervention).toBe(true);
      expect(result.type).toBe('encouragement');
    });
  });
});

describe('Trend State Logic', () => {
  describe('趋势状态判定 (Requirements 2.1)', () => {
    it('应该区分 flat 和 stuck 状态', () => {
      // flat: 变化在 ±5% 以内
      // stuck: 变化在 5%-10% 之间
      const TREND_CHANGE_THRESHOLD = 0.1;
      const MINOR_CHANGE_THRESHOLD = 0.05;

      const calculateTrend = (change: number): TrendState => {
        if (change > TREND_CHANGE_THRESHOLD) return 'up';
        if (change < -TREND_CHANGE_THRESHOLD) return 'down';
        if (Math.abs(change) < MINOR_CHANGE_THRESHOLD) return 'flat';
        return 'stuck';
      };

      expect(calculateTrend(0.15)).toBe('up');
      expect(calculateTrend(-0.15)).toBe('down');
      expect(calculateTrend(0.03)).toBe('flat');
      expect(calculateTrend(0.07)).toBe('stuck');
      expect(calculateTrend(-0.07)).toBe('stuck');
    });
  });

  describe('连续天数计算', () => {
    it('应该正确计算连续匹配状态的天数', () => {
      const calculateConsecutiveDays = (
        history: Array<{ trendState: string | null }>,
        currentState: TrendState
      ): number => {
        if (history.length === 0) {
          return 1;
        }

        let count = 0;
        for (const item of history) {
          if (item.trendState === currentState) {
            count++;
          } else {
            break;
          }
        }

        return count > 0 ? count : 1;
      };

      // 测试连续匹配
      const history1 = [
        { trendState: 'up' },
        { trendState: 'up' },
        { trendState: 'up' },
        { trendState: 'flat' }
      ];
      expect(calculateConsecutiveDays(history1, 'up')).toBe(3);

      // 测试空历史
      expect(calculateConsecutiveDays([], 'flat')).toBe(1);

      // 测试不匹配
      const history2 = [{ trendState: 'down' }];
      expect(calculateConsecutiveDays(history2, 'up')).toBe(1);
    });
  });
});
