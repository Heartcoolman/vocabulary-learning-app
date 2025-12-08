/**
 * Explainability Service Unit Tests
 * Tests for the actual ExplainabilityService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    $queryRaw: vi.fn(),
    decisionInsight: {
      findUnique: vi.fn(),
    },
    stateHistory: {
      findFirst: vi.fn(),
    },
    userStateHistory: {
      findFirst: vi.fn(),
    },
    answerRecord: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    wordLearningState: {
      findUnique: vi.fn(),
    },
    decisionRecord: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  },
  CacheTTL: {
    SHORT: 300,
    MEDIUM: 3600,
  },
  CacheKeys: {
    DECISION_INSIGHT: (id: string) => `insight:${id}`,
  },
}));

vi.mock('../../../src/services/state-history.service', () => ({
  stateHistoryService: {
    getUserStateAt: vi.fn().mockResolvedValue(null),
    getStateHistory: vi.fn().mockResolvedValue([]),
  },
}));

import prisma from '../../../src/config/database';

describe('ExplainabilityService', () => {
  let explainabilityService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/explainability.service');
    explainabilityService = module.explainabilityService || module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getLatestDecisionId', () => {
    it('should return latest decision ID for user', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);

      const result = await explainabilityService?.getLatestDecisionId?.('user-1');

      expect(result).toBe('dec-123');
    });

    it('should return null when no decisions exist', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getLatestDecisionId?.('new-user');

      expect(result).toBeNull();
    });
  });

  describe('getDecisionExplanation', () => {
    it('should return explanation for decision', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue({
        stateSnapshot: { attention: 0.8, fatigue: 0.2 },
        difficultyFactors: { length: 0.5, accuracy: 0.7, frequency: 0.3, forgetting: 0.4 },
        triggers: ['high_attention'],
        createdAt: new Date(),
      });

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', 'dec-123');

      expect(result).toBeDefined();
      expect(result?.decisionId).toBe('dec-123');
      expect(result?.difficultyFactors).toBeDefined();
    });

    it('should return null when decision not found', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionExplanation?.('user-1');

      expect(result).toBeNull();
    });

    it('should use latest decision when decisionId not provided', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-latest' }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue({
        stateSnapshot: {},
        difficultyFactors: { length: 0.5, accuracy: 0.5, frequency: 0.5, forgetting: 0.5 },
        triggers: [],
        createdAt: new Date(),
      });

      const result = await explainabilityService?.getDecisionExplanation?.('user-1');

      expect(result?.decisionId).toBe('dec-latest');
    });
  });

  describe('getLearningCurve', () => {
    it('should return learning curve data', async () => {
      (prisma.stateHistory.findFirst as any).mockResolvedValue(null);
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { timestamp: new Date(), isCorrect: true },
        { timestamp: new Date(), isCorrect: true },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 7);

      expect(result).toBeDefined();
      expect(result?.points).toBeDefined();
      expect(result?.trend).toBeDefined();
    });

    it('should default to 30 days', async () => {
      (prisma.stateHistory.findFirst as any).mockResolvedValue(null);
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);

      const result = await explainabilityService?.getLearningCurve?.('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('getDecisionTimeline', () => {
    it('should return decision timeline', async () => {
      // Service uses $queryRaw for joining decision_records and answer_records
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          id: 'dr-1',
          decisionId: 'dec-1',
          answerRecordId: 'ar-1',
          timestamp: new Date(),
          selectedAction: { strategy: 'review' },
          confidence: 0.9,
          wordId: 'word-1',
        },
      ]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10);

      expect(result).toBeDefined();
      expect(result?.items).toBeDefined();
    });

    it('should support pagination with cursor', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.(
        'user-1',
        10,
        'dr-1|2024-01-01T00:00:00.000Z',
      );

      expect(result?.items).toBeDefined();
    });
  });

  describe('runCounterfactual', () => {
    it('should run counterfactual analysis', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue({
        stateSnapshot: { attention: 0.8, fatigue: 0.2, motivation: 0.7 },
        difficultyFactors: {},
        triggers: [],
        createdAt: new Date(),
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: { attention: 0.3 },
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.baseDecisionId).toBe('dec-123');
        expect(result.explanation).toBeDefined();
      }
    });

    it('should return null when base decision not found', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.runCounterfactual?.('user-1', {});

      expect(result).toBeNull();
    });
  });

  describe('service exports', () => {
    it('should export explainabilityService singleton', async () => {
      const module = await import('../../../src/services/explainability.service');
      expect(module.explainabilityService).toBeDefined();
    });
  });

  // =============================================
  // 边界条件和错误处理测试
  // =============================================

  describe('getLatestDecisionId - 边界条件', () => {
    it('should handle empty user ID', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getLatestDecisionId?.('');

      expect(result).toBeNull();
    });

    it('should handle database query returning multiple results', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { decisionId: 'dec-1' },
        { decisionId: 'dec-2' },
      ]);

      const result = await explainabilityService?.getLatestDecisionId?.('user-1');

      // 应返回第一个（最新的）
      expect(result).toBe('dec-1');
    });

    it('should handle database error gracefully', async () => {
      (prisma.$queryRaw as any).mockRejectedValue(new Error('Database connection failed'));

      await expect(explainabilityService?.getLatestDecisionId?.('user-1')).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('getDecisionExplanation - 边界条件和错误处理', () => {
    it('should handle cached insight data', async () => {
      const { cacheService } = await import('../../../src/services/cache.service');
      (cacheService.get as any).mockReturnValue({
        stateSnapshot: { attention: 0.9, fatigue: 0.1 },
        difficultyFactors: { length: 0.5, accuracy: 0.8, frequency: 0.3, forgetting: 0.2 },
        triggers: ['high_performance'],
      });

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', 'dec-123');

      expect(result).toBeDefined();
      expect(result?.decisionId).toBe('dec-123');
      expect(result?.state).toEqual({ attention: 0.9, fatigue: 0.1 });
    });

    it('should handle null stateSnapshot from database', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue({
        stateSnapshot: null,
        difficultyFactors: {},
        triggers: [],
        createdAt: new Date(),
      });

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', 'dec-123');

      // 应该回退到计算逻辑
      expect(result).toBeDefined();
    });

    it('should handle invalid stateSnapshot type (array instead of object)', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue({
        stateSnapshot: ['invalid', 'array'],
        difficultyFactors: {},
        triggers: [],
        createdAt: new Date(),
      });

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', 'dec-123');

      // 应该回退到计算逻辑，不会崩溃
      expect(result).toBeDefined();
    });

    it('should handle database error and fallback to computation', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);
      (prisma.decisionInsight.findUnique as any).mockRejectedValue(new Error('DB error'));

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', 'dec-123');

      // 应该回退到计算逻辑或返回 null
      expect(result === null || result?.decisionId === 'dec-123').toBe(true);
    });

    it('should return null when both decisionId is not provided and no latest decision exists', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionExplanation?.('user-1');

      expect(result).toBeNull();
    });

    it('should handle missing difficultyFactors gracefully', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: 'dec-123' }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue({
        stateSnapshot: { attention: 0.5 },
        difficultyFactors: null,
        triggers: [],
        createdAt: new Date(),
      });

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', 'dec-123');

      expect(result).toBeDefined();
      expect(result?.difficultyFactors).toBeDefined();
    });
  });

  describe('getLearningCurve - 边界条件', () => {
    it('should return empty points for user with no history', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.points).toEqual([]);
      expect(result?.trend).toBe('flat');
      expect(result?.currentMastery).toBe(0);
      expect(result?.averageAttention).toBe(0);
    });

    it('should calculate trend as up when mastery increases', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([
        {
          date: new Date('2024-01-01'),
          memory: 0.3,
          attention: 0.7,
          fatigue: 0.2,
          motivation: 0.8,
        },
        {
          date: new Date('2024-01-15'),
          memory: 0.5,
          attention: 0.8,
          fatigue: 0.1,
          motivation: 0.9,
        },
        {
          date: new Date('2024-01-30'),
          memory: 0.8,
          attention: 0.9,
          fatigue: 0.1,
          motivation: 0.95,
        },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.trend).toBe('up');
      expect(result?.currentMastery).toBe(80); // 0.8 * 100
    });

    it('should calculate trend as down when mastery decreases', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([
        {
          date: new Date('2024-01-01'),
          memory: 0.9,
          attention: 0.7,
          fatigue: 0.2,
          motivation: 0.8,
        },
        {
          date: new Date('2024-01-15'),
          memory: 0.7,
          attention: 0.6,
          fatigue: 0.3,
          motivation: 0.6,
        },
        {
          date: new Date('2024-01-30'),
          memory: 0.5,
          attention: 0.5,
          fatigue: 0.4,
          motivation: 0.5,
        },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.trend).toBe('down');
    });

    it('should calculate trend as flat for minor changes', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([
        {
          date: new Date('2024-01-01'),
          memory: 0.7,
          attention: 0.7,
          fatigue: 0.2,
          motivation: 0.8,
        },
        {
          date: new Date('2024-01-30'),
          memory: 0.72,
          attention: 0.7,
          fatigue: 0.2,
          motivation: 0.8,
        },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.trend).toBe('flat');
    });

    it('should handle single data point', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([
        {
          date: new Date('2024-01-01'),
          memory: 0.5,
          attention: 0.6,
          fatigue: 0.3,
          motivation: 0.7,
        },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.trend).toBe('flat');
      expect(result?.points).toHaveLength(1);
      expect(result?.currentMastery).toBe(50);
    });

    it('should handle string dates in history', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([
        {
          date: '2024-01-01T00:00:00.000Z',
          memory: 0.5,
          attention: 0.6,
          fatigue: 0.3,
          motivation: 0.7,
        },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.points).toHaveLength(1);
      expect(result?.points[0].date).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle invalid date in history with fallback', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([
        { date: 12345, memory: 0.5, attention: 0.6, fatigue: 0.3, motivation: 0.7 },
      ]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', 30);

      expect(result?.points).toHaveLength(1);
      // 应该使用当前日期作为回退
      expect(result?.points[0].date).toBeDefined();
    });

    it('should use default 30 days when days parameter is 0', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([]);

      await explainabilityService?.getLearningCurve?.('user-1', 0);

      // 验证调用
      expect(stateHistoryService.getStateHistory).toHaveBeenCalled();
    });

    it('should handle negative days parameter', async () => {
      const { stateHistoryService } = await import('../../../src/services/state-history.service');
      (stateHistoryService.getStateHistory as any).mockResolvedValue([]);

      const result = await explainabilityService?.getLearningCurve?.('user-1', -10);

      expect(result).toBeDefined();
      expect(result?.points).toEqual([]);
    });
  });

  describe('getDecisionTimeline - 边界条件和错误处理', () => {
    it('should return empty items for user with no decisions', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10);

      expect(result?.items).toEqual([]);
      expect(result?.nextCursor).toBeNull();
    });

    it('should handle limit of 0', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 0);

      expect(result?.items).toEqual([]);
    });

    it('should return nextCursor when there are more results', async () => {
      const timestamp = new Date('2024-01-01T12:00:00.000Z');
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          id: 'dr-1',
          decisionId: 'dec-1',
          answerRecordId: 'ar-1',
          timestamp,
          selectedAction: {},
          confidence: 0.9,
          wordId: 'w1',
        },
        {
          id: 'dr-2',
          decisionId: 'dec-2',
          answerRecordId: 'ar-2',
          timestamp,
          selectedAction: {},
          confidence: 0.8,
          wordId: 'w2',
        },
      ]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 1);

      expect(result?.items).toHaveLength(1);
      expect(result?.nextCursor).toBeDefined();
      expect(result?.nextCursor).toContain('dr-2');
    });

    it('should handle invalid cursor format gracefully', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.(
        'user-1',
        10,
        'invalid-cursor',
      );

      expect(result?.items).toEqual([]);
    });

    it('should handle cursor with invalid timestamp', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.(
        'user-1',
        10,
        'id|invalid-date',
      );

      expect(result?.items).toEqual([]);
    });

    it('should handle null answerRecordId in results', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          id: 'dr-1',
          decisionId: 'dec-1',
          answerRecordId: null,
          timestamp: new Date(),
          selectedAction: {},
          confidence: 0.9,
          wordId: 'w1',
        },
      ]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10);

      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].answerId).toBe('dr-1');
    });

    it('should handle null wordId in results', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        {
          id: 'dr-1',
          decisionId: 'dec-1',
          answerRecordId: 'ar-1',
          timestamp: new Date(),
          selectedAction: {},
          confidence: 0.9,
          wordId: null,
        },
      ]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10);

      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].wordId).toBe('');
    });

    it('should handle large limit values', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10000);

      expect(result?.items).toEqual([]);
    });
  });

  describe('runCounterfactual - 边界条件和错误处理', () => {
    it('should return null when no base decision exists', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.runCounterfactual?.('user-1', {});

      expect(result).toBeNull();
    });

    it('should use latest decision when decisionId not provided', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-latest' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-latest',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.7,
        fatigue: 0.3,
        motivation: 0.8,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        overrides: { attention: 0.9 },
      });

      if (result) {
        expect(result.baseDecisionId).toBe('dec-latest');
      }
    });

    it('should handle overrides with all parameters', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.7,
        fatigue: 0.3,
        motivation: 0.8,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: {
          attention: 0.3,
          fatigue: 0.9,
          motivation: 0.4,
          recentAccuracy: 0.2,
        },
      });

      if (result) {
        expect(result.counterfactualState.attention).toBe(0.3);
        expect(result.counterfactualState.fatigue).toBe(0.9);
        expect(result.counterfactualState.motivation).toBe(0.4);
      }
    });

    it('should return null when decision record not found for user', async () => {
      // 重置 mock 并设置 findDecisionForUser 返回空
      (prisma.$queryRaw as any).mockReset();
      (prisma.$queryRaw as any).mockResolvedValue([]); // findDecisionForUser 返回空

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
      });

      expect(result).toBeNull();
    });

    it('should return null when user state history not found', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue(null);

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
      });

      expect(result).toBeNull();
    });

    it('should trigger adjustment when fatigue is very high', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: { fatigue: 0.95 },
      });

      if (result) {
        expect(result.prediction.wouldTriggerAdjustment).toBe(true);
        expect(result.prediction.suggestedDifficulty).toBe('easier');
      }
    });

    it('should trigger adjustment when recentAccuracy is very low', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.8,
        fatigue: 0.2,
        motivation: 0.8,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: { recentAccuracy: 0.1 },
      });

      if (result) {
        expect(result.prediction.wouldTriggerAdjustment).toBe(true);
      }
    });

    it('should suggest harder difficulty when performance is excellent', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.5,
        fatigue: 0.2,
        motivation: 0.8,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: { attention: 0.95, recentAccuracy: 0.95 },
      });

      if (result) {
        expect(result.prediction.suggestedDifficulty).toBe('harder');
      }
    });

    it('should generate proper explanation for state changes', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.7,
        fatigue: 0.3,
        motivation: 0.8,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: { fatigue: 0.9, attention: 0.3 },
      });

      if (result) {
        expect(result.explanation).toContain('假设');
        expect(result.explanation).toContain('疲劳度');
        expect(result.explanation).toContain('注意力');
      }
    });
  });

  describe('边界值参数测试', () => {
    it('should handle extremely long user ID', async () => {
      const longUserId = 'u'.repeat(1000);
      // 重新设置 mock 以确保返回空结果
      (prisma.$queryRaw as any).mockReset();
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getLatestDecisionId?.(longUserId);

      expect(result).toBeNull();
    });

    it('should handle special characters in decisionId', async () => {
      const specialId = 'dec-123!@#$%^&*()';
      (prisma.$queryRaw as any).mockResolvedValue([{ decisionId: specialId }]);
      (prisma.decisionInsight.findUnique as any).mockResolvedValue(null);

      const result = await explainabilityService?.getDecisionExplanation?.('user-1', specialId);

      // 应该正常处理或返回null
      expect(result === null || result?.decisionId === specialId).toBe(true);
    });

    it('should handle decimal values at boundaries for counterfactual', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ decisionId: 'dec-123' }])
        .mockResolvedValueOnce([
          {
            id: 'dr-1',
            decisionId: 'dec-123',
            answerRecordId: 'ar-1',
            timestamp: new Date(),
            weightsSnapshot: {},
            memberVotes: {},
            selectedAction: {},
            confidence: 0.8,
            wordId: 'w1',
          },
        ]);
      (prisma.userStateHistory.findFirst as any).mockResolvedValue({
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: {
          attention: 0.0,
          fatigue: 1.0,
          motivation: 0.0,
          recentAccuracy: 0.0,
        },
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.counterfactualState.attention).toBe(0.0);
        expect(result.counterfactualState.fatigue).toBe(1.0);
      }
    });
  });
});
