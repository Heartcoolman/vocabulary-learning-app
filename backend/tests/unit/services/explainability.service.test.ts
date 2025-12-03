/**
 * Explainability Service Unit Tests
 * Tests for the actual ExplainabilityService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    $queryRaw: vi.fn(),
    decisionInsight: {
      findUnique: vi.fn()
    },
    stateHistory: {
      findFirst: vi.fn()
    },
    userStateHistory: {
      findFirst: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn(),
      aggregate: vi.fn()
    },
    wordLearningState: {
      findUnique: vi.fn()
    },
    decisionRecord: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn()
  },
  CacheTTL: {
    SHORT: 300,
    MEDIUM: 3600
  },
  CacheKeys: {
    DECISION_INSIGHT: (id: string) => `insight:${id}`
  }
}));

vi.mock('../../../src/services/state-history.service', () => ({
  stateHistoryService: {
    getUserStateAt: vi.fn().mockResolvedValue(null),
    getStateHistory: vi.fn().mockResolvedValue([])
  }
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
        createdAt: new Date()
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
        createdAt: new Date()
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
        { timestamp: new Date(), isCorrect: true }
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
          wordId: 'word-1'
        }
      ]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10);

      expect(result).toBeDefined();
      expect(result?.items).toBeDefined();
    });

    it('should support pagination with cursor', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await explainabilityService?.getDecisionTimeline?.('user-1', 10, 'dr-1|2024-01-01T00:00:00.000Z');

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
        createdAt: new Date()
      });

      const result = await explainabilityService?.runCounterfactual?.('user-1', {
        decisionId: 'dec-123',
        overrides: { attention: 0.3 }
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

    // ExplainabilityService class is not exported as a named export
    it.todo('should export ExplainabilityService class');
  });
});
