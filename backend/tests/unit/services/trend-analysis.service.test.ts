/**
 * Trend Analysis Service Unit Tests
 * Tests for the actual TrendAnalysisService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { responseTime: 0 } })
    },
    wordLearningState: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([])
    },
    learningSession: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({})
    },
    userStateHistory: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    amasUserState: {
      findUnique: vi.fn().mockResolvedValue({ 
        fatigue: 0.2, 
        attention: 0.8, 
        motivation: 0.7,
        trendState: 'flat',
        consecutiveDays: 1,
        lastTrendChange: new Date()
      })
    }
  }
}));

import prisma from '../../../src/config/database';

describe('TrendAnalysisService', () => {
  let trendAnalysisService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/trend-analysis.service');
    trendAnalysisService = module.trendAnalysisService;
  });

  describe('analyzeTrend', () => {
    it('should analyze user learning trend', async () => {
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { id: 'r1', isCorrect: true, createdAt: new Date() }
      ]);

      const result = await trendAnalysisService.analyzeTrend('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('getCurrentTrend', () => {
    it('should return current trend state', async () => {
      const result = await trendAnalysisService.getCurrentTrend('user-1');

      expect(result).toBeDefined();
      expect(result.state).toBeDefined();
    });
  });

  describe('getTrendHistory', () => {
    it('should return trend history', async () => {
      // Mock records with timestamp for aggregateDailyData
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { id: 'r1', timestamp: new Date(), isCorrect: true, responseTime: 2000 },
        { id: 'r2', timestamp: new Date(), isCorrect: false, responseTime: 3000 }
      ]);

      const result = await trendAnalysisService.getTrendHistory('user-1', 7);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('generateTrendReport', () => {
    it('should generate trend report', async () => {
      // Mock records with timestamp for aggregateDailyData
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { id: 'r1', timestamp: new Date(), isCorrect: true, responseTime: 2000 }
      ]);

      const result = await trendAnalysisService.generateTrendReport('user-1');

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('checkIntervention', () => {
    it('should check if intervention is needed', async () => {
      const result = await trendAnalysisService.checkIntervention('user-1');

      expect(result).toBeDefined();
      expect(typeof result.needsIntervention).toBe('boolean');
    });
  });

  describe('getProgressReport', () => {
    it('should return progress report', async () => {
      const result = await trendAnalysisService.getProgressReport('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('exports', () => {
    it('should export trendAnalysisService singleton', async () => {
      const module = await import('../../../src/services/trend-analysis.service');
      expect(module.trendAnalysisService).toBeDefined();
    });
  });
});
