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
    // Requires complex internal tracker mock
    it.todo('should record review event');
  });

  describe('batchRecordReview', () => {
    // Requires complex internal tracker mock
    it.todo('should record multiple review events');
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

  describe('getWordReviewHistory', () => {
    // Method not implemented in current version
    it.todo('should return review history for word');
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
