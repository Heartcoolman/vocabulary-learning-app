/**
 * Record Service Unit Tests
 *
 * Tests for the learning record service that manages user answer history.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  answerRecord: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn()
  },
  wordLearningState: {
    upsert: vi.fn()
  },
  $transaction: vi.fn((fn) => fn(mockPrisma))
};

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
}));

vi.mock('../../../src/services/word-mastery.service', () => ({
  wordMasteryService: {
    updateMastery: vi.fn().mockResolvedValue(undefined)
  }
}));

import { RecordService } from '../../../src/services/record.service';

describe('RecordService', () => {
  let recordService: RecordService;

  beforeEach(() => {
    vi.clearAllMocks();
    recordService = new RecordService();
  });

  // ==================== Get Records Tests ====================

  describe('getRecordsByUserId', () => {
    it('should return paginated records', async () => {
      const mockRecords = [
        { id: 'rec-1', userId: 'user-1', wordId: 'word-1', isCorrect: true },
        { id: 'rec-2', userId: 'user-1', wordId: 'word-2', isCorrect: false }
      ];

      mockPrisma.answerRecord.findMany.mockResolvedValue(mockRecords);
      mockPrisma.answerRecord.count.mockResolvedValue(10);

      const result = await recordService.getRecordsByUserId('user-1', {
        page: 1,
        pageSize: 10
      });

      expect(result.data).toEqual(mockRecords);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(10);
    });

    it('should use default pagination when not provided', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.count.mockResolvedValue(0);

      await recordService.getRecordsByUserId('user-1');

      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50, // default pageSize
          skip: 0
        })
      );
    });

    it('should cap page size at 100', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.count.mockResolvedValue(0);

      await recordService.getRecordsByUserId('user-1', { pageSize: 500 });

      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100
        })
      );
    });

    it('should handle page number less than 1', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.count.mockResolvedValue(0);

      await recordService.getRecordsByUserId('user-1', { page: -5 });

      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0 // page 1
        })
      );
    });
  });

  // ==================== Create Record Tests ====================

  describe('createRecord', () => {
    const validRecord = {
      userId: 'user-1',
      wordId: 'word-1',
      isCorrect: true,
      responseTimeMs: 2500,
      timestamp: Date.now()
    };

    it('should create a new answer record', async () => {
      const mockCreated = { id: 'rec-1', ...validRecord };
      mockPrisma.answerRecord.create.mockResolvedValue(mockCreated);

      const result = await recordService.createRecord(validRecord);

      expect(result).toEqual(mockCreated);
      expect(mockPrisma.answerRecord.create).toHaveBeenCalled();
    });

    it('should reject timestamps too far in the future', async () => {
      const futureRecord = {
        ...validRecord,
        timestamp: Date.now() + 2 * 60 * 60 * 1000 // 2 hours in future
      };

      await expect(recordService.createRecord(futureRecord)).rejects.toThrow(
        /不能超过当前时间/
      );
    });

    it('should reject timestamps too far in the past', async () => {
      const pastRecord = {
        ...validRecord,
        timestamp: Date.now() - 48 * 60 * 60 * 1000 // 48 hours ago
      };

      await expect(recordService.createRecord(pastRecord)).rejects.toThrow(
        /不能早于24小时/
      );
    });
  });

  // ==================== Batch Create Tests ====================

  describe('createBatchRecords', () => {
    it('should create multiple records', async () => {
      const records = [
        {
          userId: 'user-1',
          wordId: 'word-1',
          isCorrect: true,
          responseTimeMs: 2000,
          timestamp: Date.now()
        },
        {
          userId: 'user-1',
          wordId: 'word-2',
          isCorrect: false,
          responseTimeMs: 3000,
          timestamp: Date.now()
        }
      ];

      mockPrisma.answerRecord.createMany.mockResolvedValue({ count: 2 });

      const result = await recordService.createBatchRecords(records);

      expect(result.count).toBe(2);
    });

    it('should reject batch larger than MAX_BATCH_SIZE', async () => {
      const largeRecords = Array.from({ length: 1500 }, (_, i) => ({
        userId: 'user-1',
        wordId: `word-${i}`,
        isCorrect: true,
        responseTimeMs: 2000,
        timestamp: Date.now()
      }));

      await expect(recordService.createBatchRecords(largeRecords)).rejects.toThrow(
        /批量操作/
      );
    });
  });

  // ==================== Statistics Tests ====================

  describe('getStatistics', () => {
    it('should return user learning statistics', async () => {
      mockPrisma.answerRecord.count.mockResolvedValue(100);
      mockPrisma.answerRecord.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 2500 }
      });
      mockPrisma.answerRecord.groupBy.mockResolvedValue([
        { isCorrect: true, _count: 75 },
        { isCorrect: false, _count: 25 }
      ]);

      const stats = await recordService.getStatistics('user-1');

      expect(stats.totalAnswers).toBe(100);
      expect(stats.avgResponseTime).toBe(2500);
    });

    it('should handle user with no records', async () => {
      mockPrisma.answerRecord.count.mockResolvedValue(0);
      mockPrisma.answerRecord.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: null }
      });
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);

      const stats = await recordService.getStatistics('new-user');

      expect(stats.totalAnswers).toBe(0);
      expect(stats.correctRate).toBe(0);
    });
  });

  // ==================== Recent Records Tests ====================

  describe('getRecentRecords', () => {
    it('should return records from specified time range', async () => {
      const mockRecords = [
        { id: 'rec-1', timestamp: new Date() }
      ];
      mockPrisma.answerRecord.findMany.mockResolvedValue(mockRecords);

      const result = await recordService.getRecentRecords('user-1', 24);

      expect(result).toEqual(mockRecords);
      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            timestamp: expect.any(Object)
          })
        })
      );
    });
  });

  // ==================== Word Records Tests ====================

  describe('getRecordsByWord', () => {
    it('should return records for specific word', async () => {
      const mockRecords = [
        { id: 'rec-1', wordId: 'word-1', isCorrect: true },
        { id: 'rec-2', wordId: 'word-1', isCorrect: false }
      ];
      mockPrisma.answerRecord.findMany.mockResolvedValue(mockRecords);

      const result = await recordService.getRecordsByWord('user-1', 'word-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            wordId: 'word-1'
          }
        })
      );
    });
  });
});
