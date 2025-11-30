/**
 * WordMemoryTracker Unit Tests
 * 测试单词记忆轨迹追踪器
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WordMemoryTracker, ReviewEvent } from '../../../../src/amas/tracking/word-memory-tracker';

// Mock Prisma client
vi.mock('../../../../src/config/database', () => ({
  default: {
    wordReviewTrace: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

import prisma from '../../../../src/config/database';

describe('WordMemoryTracker', () => {
  let tracker: WordMemoryTracker;
  const userId = 'test-user-id';
  const wordId = 'test-word-id';

  beforeEach(() => {
    tracker = new WordMemoryTracker();
    vi.clearAllMocks();
  });

  describe('recordReview', () => {
    it('should record a review event', async () => {
      const event: ReviewEvent = {
        timestamp: Date.now(),
        isCorrect: true,
        responseTime: 1500
      };

      await tracker.recordReview(userId, wordId, event);

      expect(prisma.wordReviewTrace.create).toHaveBeenCalledWith({
        data: {
          userId,
          wordId,
          timestamp: expect.any(Date),
          isCorrect: true,
          responseTime: 1500
        }
      });
    });

    it('should handle incorrect answer', async () => {
      const event: ReviewEvent = {
        timestamp: Date.now(),
        isCorrect: false,
        responseTime: 3000
      };

      await tracker.recordReview(userId, wordId, event);

      expect(prisma.wordReviewTrace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isCorrect: false,
          responseTime: 3000
        })
      });
    });
  });

  describe('batchRecordReview', () => {
    it('should batch record multiple review events', async () => {
      const events = [
        { wordId: 'word-1', event: { timestamp: Date.now(), isCorrect: true, responseTime: 1000 } },
        { wordId: 'word-2', event: { timestamp: Date.now(), isCorrect: false, responseTime: 2000 } }
      ];

      await tracker.batchRecordReview(userId, events);

      expect(prisma.wordReviewTrace.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ wordId: 'word-1', isCorrect: true }),
          expect.objectContaining({ wordId: 'word-2', isCorrect: false })
        ])
      });
    });
  });

  describe('getReviewTrace', () => {
    it('should return review trace with secondsAgo calculated', async () => {
      const now = Date.now();
      const mockRecords = [
        { timestamp: new Date(now - 3600000), isCorrect: true },
        { timestamp: new Date(now - 7200000), isCorrect: false }
      ];

      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue(mockRecords as any);

      const trace = await tracker.getReviewTrace(userId, wordId);

      expect(trace).toHaveLength(2);
      expect(trace[0].secondsAgo).toBeGreaterThanOrEqual(3600);
      expect(trace[0].isCorrect).toBe(true);
      expect(trace[1].secondsAgo).toBeGreaterThanOrEqual(7200);
      expect(trace[1].isCorrect).toBe(false);
    });

    it('should respect limit parameter', async () => {
      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue([]);

      await tracker.getReviewTrace(userId, wordId, 10);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('should cap limit at maximum', async () => {
      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue([]);

      await tracker.getReviewTrace(userId, wordId, 500);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

    it('should return empty array when no records', async () => {
      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue([]);

      const trace = await tracker.getReviewTrace(userId, wordId);

      expect(trace).toEqual([]);
    });
  });

  describe('batchGetMemoryState', () => {
    it('should return memory states for multiple words', async () => {
      const now = Date.now();
      const mockRecords = [
        { wordId: 'word-1', timestamp: new Date(now - 3600000), isCorrect: true },
        { wordId: 'word-1', timestamp: new Date(now - 7200000), isCorrect: true },
        { wordId: 'word-2', timestamp: new Date(now - 1800000), isCorrect: false }
      ];

      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue(mockRecords as any);

      const states = await tracker.batchGetMemoryState(userId, ['word-1', 'word-2', 'word-3']);

      expect(states.size).toBe(3);
      
      const state1 = states.get('word-1');
      expect(state1?.reviewCount).toBe(2);
      expect(state1?.trace).toHaveLength(2);

      const state2 = states.get('word-2');
      expect(state2?.reviewCount).toBe(1);

      const state3 = states.get('word-3');
      expect(state3?.reviewCount).toBe(0);
      expect(state3?.trace).toEqual([]);
    });

    it('should return empty map for empty wordIds', async () => {
      const states = await tracker.batchGetMemoryState(userId, []);

      expect(states.size).toBe(0);
      expect(prisma.wordReviewTrace.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getUserReviewStats', () => {
    it('should return user review statistics', async () => {
      vi.mocked(prisma.wordReviewTrace.aggregate).mockResolvedValue({
        _count: { id: 100 },
        _avg: { responseTime: 2000 }
      } as any);

      vi.mocked(prisma.wordReviewTrace.count).mockResolvedValue(80);

      vi.mocked(prisma.wordReviewTrace.groupBy).mockResolvedValue([
        { wordId: 'word-1' },
        { wordId: 'word-2' },
        { wordId: 'word-3' }
      ] as any);

      const stats = await tracker.getUserReviewStats(userId);

      expect(stats.totalReviews).toBe(100);
      expect(stats.uniqueWords).toBe(3);
      expect(stats.correctCount).toBe(80);
      expect(stats.incorrectCount).toBe(20);
      expect(stats.averageResponseTime).toBe(2000);
    });
  });

  describe('cleanupOldRecords', () => {
    it('should delete old records', async () => {
      vi.mocked(prisma.wordReviewTrace.deleteMany).mockResolvedValue({ count: 50 });

      const deleted = await tracker.cleanupOldRecords(userId, 30 * 24 * 3600 * 1000);

      expect(deleted).toBe(50);
      expect(prisma.wordReviewTrace.deleteMany).toHaveBeenCalledWith({
        where: {
          userId,
          timestamp: { lt: expect.any(Date) }
        }
      });
    });
  });

  describe('trimWordRecords', () => {
    it('should trim word records to max limit', async () => {
      const keepRecords = [{ id: 'rec-1' }, { id: 'rec-2' }, { id: 'rec-3' }];
      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue(keepRecords as any);
      vi.mocked(prisma.wordReviewTrace.deleteMany).mockResolvedValue({ count: 10 });

      const deleted = await tracker.trimWordRecords(userId, wordId, 3);

      expect(deleted).toBe(10);
      expect(prisma.wordReviewTrace.deleteMany).toHaveBeenCalledWith({
        where: {
          userId,
          wordId,
          id: { notIn: ['rec-1', 'rec-2', 'rec-3'] }
        }
      });
    });

    it('should return 0 when no records to keep', async () => {
      vi.mocked(prisma.wordReviewTrace.findMany).mockResolvedValue([]);

      const deleted = await tracker.trimWordRecords(userId, wordId, 3);

      expect(deleted).toBe(0);
      expect(prisma.wordReviewTrace.deleteMany).not.toHaveBeenCalled();
    });
  });
});
