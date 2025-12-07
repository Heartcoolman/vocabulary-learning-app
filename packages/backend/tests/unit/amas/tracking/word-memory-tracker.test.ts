/**
 * WordMemoryTracker Unit Tests
 *
 * Tests for the word memory tracking functionality
 * that records and retrieves user review history for ACT-R model
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  WordMemoryTracker,
  ReviewEvent,
  WordMemoryState
} from '../../../../src/amas/tracking/word-memory-tracker';

// Mock prisma
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

  const testUserId = 'user-123';
  const testWordId = 'word-456';

  const sampleReviewEvent: ReviewEvent = {
    timestamp: Date.now(),
    isCorrect: true,
    responseTime: 2000
  };

  beforeEach(() => {
    tracker = new WordMemoryTracker();
    vi.clearAllMocks();
  });

  // ==================== recordReview Tests ====================

  describe('recordReview', () => {
    it('should record a review event to database', async () => {
      (prisma.wordReviewTrace.create as Mock).mockResolvedValue({
        id: 'trace-1',
        userId: testUserId,
        wordId: testWordId,
        timestamp: new Date(sampleReviewEvent.timestamp),
        isCorrect: sampleReviewEvent.isCorrect,
        responseTime: sampleReviewEvent.responseTime
      });

      await tracker.recordReview(testUserId, testWordId, sampleReviewEvent);

      expect(prisma.wordReviewTrace.create).toHaveBeenCalledTimes(1);
      expect(prisma.wordReviewTrace.create).toHaveBeenCalledWith({
        data: {
          userId: testUserId,
          wordId: testWordId,
          timestamp: expect.any(Date),
          isCorrect: sampleReviewEvent.isCorrect,
          responseTime: sampleReviewEvent.responseTime
        }
      });
    });

    it('should record incorrect review event', async () => {
      const incorrectEvent: ReviewEvent = {
        timestamp: Date.now(),
        isCorrect: false,
        responseTime: 5000
      };

      (prisma.wordReviewTrace.create as Mock).mockResolvedValue({
        id: 'trace-2',
        userId: testUserId,
        wordId: testWordId,
        timestamp: new Date(incorrectEvent.timestamp),
        isCorrect: false,
        responseTime: 5000
      });

      await tracker.recordReview(testUserId, testWordId, incorrectEvent);

      expect(prisma.wordReviewTrace.create).toHaveBeenCalledWith({
        data: {
          userId: testUserId,
          wordId: testWordId,
          timestamp: expect.any(Date),
          isCorrect: false,
          responseTime: 5000
        }
      });
    });

    it('should convert timestamp to Date object', async () => {
      const timestamp = 1700000000000;
      const event: ReviewEvent = {
        timestamp,
        isCorrect: true,
        responseTime: 1500
      };

      (prisma.wordReviewTrace.create as Mock).mockResolvedValue({});

      await tracker.recordReview(testUserId, testWordId, event);

      const callArgs = (prisma.wordReviewTrace.create as Mock).mock.calls[0][0];
      expect(callArgs.data.timestamp).toBeInstanceOf(Date);
      expect(callArgs.data.timestamp.getTime()).toBe(timestamp);
    });
  });

  // ==================== batchRecordReview Tests ====================

  describe('batchRecordReview', () => {
    it('should batch record multiple review events', async () => {
      const events = [
        { wordId: 'word-1', event: { timestamp: Date.now(), isCorrect: true, responseTime: 1000 } },
        { wordId: 'word-2', event: { timestamp: Date.now(), isCorrect: false, responseTime: 2000 } },
        { wordId: 'word-3', event: { timestamp: Date.now(), isCorrect: true, responseTime: 1500 } }
      ];

      (prisma.wordReviewTrace.createMany as Mock).mockResolvedValue({ count: 3 });

      await tracker.batchRecordReview(testUserId, events);

      expect(prisma.wordReviewTrace.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.wordReviewTrace.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: testUserId,
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 1000
          }),
          expect.objectContaining({
            userId: testUserId,
            wordId: 'word-2',
            isCorrect: false,
            responseTime: 2000
          }),
          expect.objectContaining({
            userId: testUserId,
            wordId: 'word-3',
            isCorrect: true,
            responseTime: 1500
          })
        ])
      });
    });

    it('should handle empty events array', async () => {
      (prisma.wordReviewTrace.createMany as Mock).mockResolvedValue({ count: 0 });

      await tracker.batchRecordReview(testUserId, []);

      expect(prisma.wordReviewTrace.createMany).toHaveBeenCalledWith({
        data: []
      });
    });
  });

  // ==================== getReviewTrace Tests ====================

  describe('getReviewTrace', () => {
    it('should retrieve review trace for a word', async () => {
      const now = Date.now();
      const mockRecords = [
        { timestamp: new Date(now - 60000), isCorrect: true },  // 1 minute ago
        { timestamp: new Date(now - 3600000), isCorrect: true }, // 1 hour ago
        { timestamp: new Date(now - 86400000), isCorrect: false } // 1 day ago
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.getReviewTrace(testUserId, testWordId);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith({
        where: {
          userId: testUserId,
          wordId: testWordId
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: 50, // DEFAULT_TRACE_LIMIT
        select: {
          timestamp: true,
          isCorrect: true
        }
      });

      expect(result).toHaveLength(3);
      expect(result[0].isCorrect).toBe(true);
      expect(result[0].secondsAgo).toBeGreaterThan(0);
    });

    it('should respect custom limit parameter', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      await tracker.getReviewTrace(testUserId, testWordId, 20);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20
        })
      );
    });

    it('should cap limit at MAX_TRACE_LIMIT (100)', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      await tracker.getReviewTrace(testUserId, testWordId, 200);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100
        })
      );
    });

    it('should enforce minimum limit of 1', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      await tracker.getReviewTrace(testUserId, testWordId, 0);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1
        })
      );
    });

    it('should calculate secondsAgo correctly', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const mockRecords = [
        { timestamp: new Date(oneHourAgo), isCorrect: true }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.getReviewTrace(testUserId, testWordId);

      // Should be approximately 3600 seconds (1 hour)
      expect(result[0].secondsAgo).toBeGreaterThanOrEqual(3599);
      expect(result[0].secondsAgo).toBeLessThanOrEqual(3601);
    });

    it('should return empty array when no records exist', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      const result = await tracker.getReviewTrace(testUserId, testWordId);

      expect(result).toEqual([]);
    });
  });

  // ==================== batchGetMemoryState Tests ====================

  describe('batchGetMemoryState', () => {
    it('should return empty map for empty wordIds', async () => {
      const result = await tracker.batchGetMemoryState(testUserId, []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(prisma.wordReviewTrace.findMany).not.toHaveBeenCalled();
    });

    it('should batch fetch memory states for multiple words', async () => {
      const now = Date.now();
      const wordIds = ['word-1', 'word-2', 'word-3'];

      const mockRecords = [
        { wordId: 'word-1', timestamp: new Date(now - 60000), isCorrect: true },
        { wordId: 'word-1', timestamp: new Date(now - 3600000), isCorrect: true },
        { wordId: 'word-2', timestamp: new Date(now - 86400000), isCorrect: false },
        { wordId: 'word-3', timestamp: new Date(now - 120000), isCorrect: true }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.batchGetMemoryState(testUserId, wordIds);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith({
        where: {
          userId: testUserId,
          wordId: { in: wordIds }
        },
        orderBy: {
          timestamp: 'desc'
        },
        select: {
          wordId: true,
          timestamp: true,
          isCorrect: true
        }
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(3);

      // Verify word-1 state
      const word1State = result.get('word-1');
      expect(word1State).toBeDefined();
      expect(word1State!.wordId).toBe('word-1');
      expect(word1State!.reviewCount).toBe(2);
      expect(word1State!.trace).toHaveLength(2);
    });

    it('should include words with no records in result', async () => {
      const wordIds = ['word-1', 'word-no-records'];

      const mockRecords = [
        { wordId: 'word-1', timestamp: new Date(), isCorrect: true }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.batchGetMemoryState(testUserId, wordIds);

      expect(result.size).toBe(2);

      const noRecordsState = result.get('word-no-records');
      expect(noRecordsState).toBeDefined();
      expect(noRecordsState!.reviewCount).toBe(0);
      expect(noRecordsState!.lastReviewTs).toBe(0);
      expect(noRecordsState!.trace).toEqual([]);
    });

    it('should limit trace to MAX_TRACE_LIMIT per word', async () => {
      const now = Date.now();
      const wordIds = ['word-1'];

      // Create 150 records (more than MAX_TRACE_LIMIT of 100)
      const mockRecords = Array.from({ length: 150 }, (_, i) => ({
        wordId: 'word-1',
        timestamp: new Date(now - i * 1000),
        isCorrect: true
      }));

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.batchGetMemoryState(testUserId, wordIds);

      const word1State = result.get('word-1');
      expect(word1State!.reviewCount).toBe(150); // Total count remains
      expect(word1State!.trace).toHaveLength(100); // But trace is limited
    });

    it('should calculate lastReviewTs correctly', async () => {
      const now = Date.now();
      const recentTimestamp = now - 60000;
      const wordIds = ['word-1'];

      const mockRecords = [
        { wordId: 'word-1', timestamp: new Date(recentTimestamp), isCorrect: true },
        { wordId: 'word-1', timestamp: new Date(now - 3600000), isCorrect: false }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.batchGetMemoryState(testUserId, wordIds);

      const word1State = result.get('word-1');
      expect(word1State!.lastReviewTs).toBe(recentTimestamp);
    });

    it('should convert timestamps to ReviewTrace format', async () => {
      const now = Date.now();
      const wordIds = ['word-1'];

      const mockRecords = [
        { wordId: 'word-1', timestamp: new Date(now - 3600000), isCorrect: true }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const result = await tracker.batchGetMemoryState(testUserId, wordIds);

      const word1State = result.get('word-1');
      expect(word1State!.trace[0]).toHaveProperty('secondsAgo');
      expect(word1State!.trace[0]).toHaveProperty('isCorrect');
      expect(word1State!.trace[0].secondsAgo).toBeGreaterThanOrEqual(3599);
    });
  });

  // ==================== getUserReviewStats Tests ====================

  describe('getUserReviewStats', () => {
    it('should return user review statistics', async () => {
      (prisma.wordReviewTrace.aggregate as Mock).mockResolvedValue({
        _count: { id: 100 },
        _avg: { responseTime: 2500 }
      });

      (prisma.wordReviewTrace.count as Mock).mockResolvedValue(75);

      (prisma.wordReviewTrace.groupBy as Mock).mockResolvedValue([
        { wordId: 'word-1', _count: 10 },
        { wordId: 'word-2', _count: 15 },
        { wordId: 'word-3', _count: 20 }
      ]);

      const stats = await tracker.getUserReviewStats(testUserId);

      expect(stats).toEqual({
        totalReviews: 100,
        uniqueWords: 3,
        correctCount: 75,
        incorrectCount: 25,
        averageResponseTime: 2500
      });
    });

    it('should handle user with no reviews', async () => {
      (prisma.wordReviewTrace.aggregate as Mock).mockResolvedValue({
        _count: { id: 0 },
        _avg: { responseTime: null }
      });

      (prisma.wordReviewTrace.count as Mock).mockResolvedValue(0);

      (prisma.wordReviewTrace.groupBy as Mock).mockResolvedValue([]);

      const stats = await tracker.getUserReviewStats(testUserId);

      expect(stats).toEqual({
        totalReviews: 0,
        uniqueWords: 0,
        correctCount: 0,
        incorrectCount: 0,
        averageResponseTime: 0
      });
    });

    it('should call prisma with correct userId filter', async () => {
      (prisma.wordReviewTrace.aggregate as Mock).mockResolvedValue({
        _count: { id: 0 },
        _avg: { responseTime: null }
      });
      (prisma.wordReviewTrace.count as Mock).mockResolvedValue(0);
      (prisma.wordReviewTrace.groupBy as Mock).mockResolvedValue([]);

      await tracker.getUserReviewStats(testUserId);

      expect(prisma.wordReviewTrace.aggregate).toHaveBeenCalledWith({
        where: { userId: testUserId },
        _count: { id: true },
        _avg: { responseTime: true }
      });

      expect(prisma.wordReviewTrace.count).toHaveBeenCalledWith({
        where: { userId: testUserId, isCorrect: true }
      });

      expect(prisma.wordReviewTrace.groupBy).toHaveBeenCalledWith({
        by: ['wordId'],
        where: { userId: testUserId },
        _count: true
      });
    });
  });

  // ==================== cleanupOldRecords Tests ====================

  describe('cleanupOldRecords', () => {
    it('should delete records older than specified time', async () => {
      const olderThanMs = 30 * 24 * 60 * 60 * 1000; // 30 days

      (prisma.wordReviewTrace.deleteMany as Mock).mockResolvedValue({ count: 50 });

      const deletedCount = await tracker.cleanupOldRecords(testUserId, olderThanMs);

      expect(deletedCount).toBe(50);
      expect(prisma.wordReviewTrace.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: testUserId,
          timestamp: { lt: expect.any(Date) }
        }
      });
    });

    it('should return 0 when no records to delete', async () => {
      (prisma.wordReviewTrace.deleteMany as Mock).mockResolvedValue({ count: 0 });

      const deletedCount = await tracker.cleanupOldRecords(testUserId, 1000);

      expect(deletedCount).toBe(0);
    });

    it('should calculate cutoff date correctly', async () => {
      const olderThanMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const now = Date.now();

      (prisma.wordReviewTrace.deleteMany as Mock).mockResolvedValue({ count: 0 });

      await tracker.cleanupOldRecords(testUserId, olderThanMs);

      const callArgs = (prisma.wordReviewTrace.deleteMany as Mock).mock.calls[0][0];
      const cutoffDate = callArgs.where.timestamp.lt;

      // Cutoff should be approximately 7 days ago
      expect(cutoffDate.getTime()).toBeLessThanOrEqual(now - olderThanMs + 1000);
      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(now - olderThanMs - 1000);
    });
  });

  // ==================== trimWordRecords Tests ====================

  describe('trimWordRecords', () => {
    it('should keep most recent records and delete older ones', async () => {
      const mockKeepRecords = [
        { id: 'record-1' },
        { id: 'record-2' },
        { id: 'record-3' }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockKeepRecords);
      (prisma.wordReviewTrace.deleteMany as Mock).mockResolvedValue({ count: 10 });

      const deletedCount = await tracker.trimWordRecords(testUserId, testWordId, 3);

      expect(deletedCount).toBe(10);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith({
        where: { userId: testUserId, wordId: testWordId },
        orderBy: { timestamp: 'desc' },
        take: 3,
        select: { id: true }
      });

      expect(prisma.wordReviewTrace.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: testUserId,
          wordId: testWordId,
          id: { notIn: ['record-1', 'record-2', 'record-3'] }
        }
      });
    });

    it('should use default MAX_TRACE_LIMIT when maxRecords not specified', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([{ id: 'record-1' }]);
      (prisma.wordReviewTrace.deleteMany as Mock).mockResolvedValue({ count: 0 });

      await tracker.trimWordRecords(testUserId, testWordId);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100 // MAX_TRACE_LIMIT
        })
      );
    });

    it('should return 0 when no records exist for word', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      const deletedCount = await tracker.trimWordRecords(testUserId, testWordId, 10);

      expect(deletedCount).toBe(0);
      expect(prisma.wordReviewTrace.deleteMany).not.toHaveBeenCalled();
    });

    it('should return 0 when record count is within limit', async () => {
      const mockRecords = [
        { id: 'record-1' },
        { id: 'record-2' }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);
      (prisma.wordReviewTrace.deleteMany as Mock).mockResolvedValue({ count: 0 });

      const deletedCount = await tracker.trimWordRecords(testUserId, testWordId, 10);

      expect(deletedCount).toBe(0);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle database errors gracefully in recordReview', async () => {
      (prisma.wordReviewTrace.create as Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        tracker.recordReview(testUserId, testWordId, sampleReviewEvent)
      ).rejects.toThrow('Database error');
    });

    it('should handle concurrent batch operations', async () => {
      const events1 = [
        { wordId: 'word-1', event: { timestamp: Date.now(), isCorrect: true, responseTime: 1000 } }
      ];
      const events2 = [
        { wordId: 'word-2', event: { timestamp: Date.now(), isCorrect: false, responseTime: 2000 } }
      ];

      (prisma.wordReviewTrace.createMany as Mock).mockResolvedValue({ count: 1 });

      await Promise.all([
        tracker.batchRecordReview(testUserId, events1),
        tracker.batchRecordReview(testUserId, events2)
      ]);

      expect(prisma.wordReviewTrace.createMany).toHaveBeenCalledTimes(2);
    });

    it('should handle very large batch in batchGetMemoryState', async () => {
      const wordIds = Array.from({ length: 1000 }, (_, i) => `word-${i}`);

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      const result = await tracker.batchGetMemoryState(testUserId, wordIds);

      expect(result.size).toBe(1000);
      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: testUserId,
            wordId: { in: wordIds }
          }
        })
      );
    });

    it('should handle negative limit in getReviewTrace', async () => {
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([]);

      await tracker.getReviewTrace(testUserId, testWordId, -5);

      expect(prisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1 // Should be clamped to minimum 1
        })
      );
    });
  });

  // ==================== Integration-like Tests ====================

  describe('workflow integration', () => {
    it('should support typical review workflow', async () => {
      // Step 1: Record a review
      (prisma.wordReviewTrace.create as Mock).mockResolvedValue({});
      await tracker.recordReview(testUserId, testWordId, sampleReviewEvent);

      // Step 2: Get review trace
      const now = Date.now();
      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue([
        { timestamp: new Date(now - 60000), isCorrect: true }
      ]);
      const trace = await tracker.getReviewTrace(testUserId, testWordId);

      expect(trace).toHaveLength(1);
      expect(trace[0].isCorrect).toBe(true);
    });

    it('should support batch memory state retrieval for scheduling', async () => {
      const now = Date.now();
      const wordIds = ['word-1', 'word-2'];

      const mockRecords = [
        { wordId: 'word-1', timestamp: new Date(now - 3600000), isCorrect: true },
        { wordId: 'word-1', timestamp: new Date(now - 86400000), isCorrect: true },
        { wordId: 'word-2', timestamp: new Date(now - 172800000), isCorrect: false }
      ];

      (prisma.wordReviewTrace.findMany as Mock).mockResolvedValue(mockRecords);

      const memoryStates = await tracker.batchGetMemoryState(testUserId, wordIds);

      // word-1 has 2 reviews, more recent last review
      const word1 = memoryStates.get('word-1');
      expect(word1!.reviewCount).toBe(2);
      expect(word1!.trace).toHaveLength(2);

      // word-2 has 1 review, older
      const word2 = memoryStates.get('word-2');
      expect(word2!.reviewCount).toBe(1);
    });
  });
});
