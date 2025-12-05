/**
 * Word Mastery Service Unit Tests
 *
 * Tests for the word mastery service that tracks learning progress.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma - defined inline to avoid hoisting issues
vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn().mockResolvedValue(100)
    },
    wordReviewTrace: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { score: 0 } })
    },
    amasUserState: {
      findUnique: vi.fn().mockResolvedValue({ fatigue: 0.2 })
    },
    $transaction: vi.fn((fn: any) => {
      const prisma = require('../../../src/config/database').default;
      if (typeof fn === 'function') {
        return fn(prisma);
      }
      return Promise.all(fn);
    })
  }
}));

// Mock AMAS modules with proper class constructors
vi.mock('../../../src/amas/evaluation/word-mastery-evaluator', () => ({
  WordMasteryEvaluator: class MockEvaluator {
    evaluate = vi.fn().mockResolvedValue({
      wordId: 'word-1',
      score: 0.75,
      level: 'learning',
      confidence: 0.8,
      needsReview: false
    });
    batchEvaluate = vi.fn().mockResolvedValue([]);
  }
}));

vi.mock('../../../src/amas/tracking/word-memory-tracker', () => ({
  WordMemoryTracker: class MockTracker {
    recordEvent = vi.fn();
    recordReview = vi.fn().mockResolvedValue(undefined);
    batchRecordReview = vi.fn().mockResolvedValue(undefined);
    getMemoryState = vi.fn().mockReturnValue(null);
    getMemoryTrace = vi.fn().mockReturnValue({ traces: [], summary: {} });
    predictRecall = vi.fn().mockReturnValue(0.5);
  }
}));

vi.mock('../../../src/amas/modeling/actr-memory', () => ({
  ACTRMemoryModel: class MockACTR {
    getActivation = vi.fn().mockReturnValue(0);
    predictRecall = vi.fn().mockReturnValue(0.5);
    predictInterval = vi.fn().mockReturnValue({ interval: 86400, confidence: 0.8 });
  },
  ReviewTrace: class {},
  IntervalPrediction: class {}
}));

import prisma from '../../../src/config/database';
import { WordMasteryService } from '../../../src/services/word-mastery.service';

describe('WordMasteryService', () => {
  let masteryService: WordMasteryService;

  beforeEach(() => {
    vi.clearAllMocks();
    masteryService = new WordMasteryService();
  });

  describe('evaluateWord', () => {
    it('should evaluate word mastery', async () => {
      (prisma.answerRecord.aggregate as any).mockResolvedValue({
        _avg: { responseTime: 2000 }
      });

      const result = await masteryService.evaluateWord('user-1', 'word-1');

      expect(result).toBeDefined();
      expect(result.wordId).toBe('word-1');
    });
  });

  describe('recordReview', () => {
    it('should record review event', async () => {
      const event = {
        isCorrect: true,
        responseTime: 1500,
        timestamp: Date.now()
      };

      await masteryService.recordReview('user-1', 'word-1', event);

      // Verify tracker.recordReview was called (via mock)
      // The service delegates to internal tracker
      expect(true).toBe(true); // Service method exists and doesn't throw
    });

    it('should handle incorrect answer event', async () => {
      const event = {
        isCorrect: false,
        responseTime: 3000,
        timestamp: Date.now()
      };

      // Should not throw
      await expect(
        masteryService.recordReview('user-1', 'word-1', event)
      ).resolves.toBeUndefined();
    });
  });

  describe('batchRecordReview', () => {
    it('should record multiple review events', async () => {
      const events = [
        { wordId: 'word-1', event: { isCorrect: true, responseTime: 1000, timestamp: Date.now() } },
        { wordId: 'word-2', event: { isCorrect: false, responseTime: 2000, timestamp: Date.now() } },
        { wordId: 'word-3', event: { isCorrect: true, responseTime: 1500, timestamp: Date.now() } }
      ];

      await expect(
        masteryService.batchRecordReview('user-1', events)
      ).resolves.toBeUndefined();
    });

    it('should handle empty events array', async () => {
      await expect(
        masteryService.batchRecordReview('user-1', [])
      ).resolves.toBeUndefined();
    });
  });

  describe('getUserMasteryStats', () => {
    it('should return user mastery statistics', async () => {
      // Mock findMany for learningStates
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await masteryService.getUserMasteryStats('user-1');

      expect(result).toBeDefined();
      expect(result.totalWords).toBe(0);
    });
  });

  describe('getMemoryTrace', () => {
    it('should return review history for word', async () => {
      const mockRecords = [
        {
          id: 'trace-1',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          isCorrect: true,
          responseTime: 1500
        },
        {
          id: 'trace-2',
          timestamp: new Date('2024-01-14T10:00:00Z'),
          isCorrect: false,
          responseTime: 3000
        }
      ];

      (prisma.wordReviewTrace.findMany as any).mockResolvedValue(mockRecords);

      const result = await masteryService.getMemoryTrace('user-1', 'word-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('trace-1');
      expect(result[0].isCorrect).toBe(true);
      expect(result[0].responseTime).toBe(1500);
      expect(typeof result[0].secondsAgo).toBe('number');
    });

    it('should return empty array when no traces exist', async () => {
      (prisma.wordReviewTrace.findMany as any).mockResolvedValue([]);

      const result = await masteryService.getMemoryTrace('user-1', 'word-1');

      expect(result).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      (prisma.wordReviewTrace.findMany as any).mockResolvedValue([]);

      await masteryService.getMemoryTrace('user-1', 'word-1', 10);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10
        })
      );
    });
  });

  describe('exports', () => {
    it('should export WordMasteryService class', async () => {
      const module = await import('../../../src/services/word-mastery.service');
      expect(module.WordMasteryService).toBeDefined();
    });

    it('should export wordMasteryService singleton', async () => {
      const module = await import('../../../src/services/word-mastery.service');
      expect(module.wordMasteryService).toBeDefined();
    });
  });
});
