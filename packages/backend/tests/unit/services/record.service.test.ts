/**
 * Record Service Unit Tests
 *
 * Tests for the learning record service that manages user answer history.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock must be defined inline without external variable references
vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn()
    },
    word: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    learningSession: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    $transaction: vi.fn((fn: any) => {
      if (typeof fn === 'function') {
        const prisma = require('../../../src/config/database').default;
        return fn(prisma);
      }
      return Promise.all(fn);
    })
  }
}));

vi.mock('../../../src/services/word-mastery.service', () => ({
  wordMasteryService: {
    updateMastery: vi.fn().mockResolvedValue(undefined),
    recordReview: vi.fn().mockResolvedValue(undefined),
    batchRecordReview: vi.fn().mockResolvedValue(undefined)
  }
}));

import prisma from '../../../src/config/database';
import { RecordService } from '../../../src/services/record.service';

describe('RecordService', () => {
  let recordService: RecordService;

  beforeEach(() => {
    vi.clearAllMocks();
    recordService = new RecordService();
  });

  describe('getRecordsByUserId', () => {
    it('should return paginated records', async () => {
      const mockRecords = [
        { id: 'rec-1', userId: 'user-1', wordId: 'word-1', isCorrect: true },
        { id: 'rec-2', userId: 'user-1', wordId: 'word-2', isCorrect: false }
      ];

      (prisma.answerRecord.findMany as any).mockResolvedValue(mockRecords);
      (prisma.answerRecord.count as any).mockResolvedValue(10);

      const result = await recordService.getRecordsByUserId('user-1', {
        page: 1,
        pageSize: 10
      });

      expect(result.data).toEqual(mockRecords);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(10);
    });

    it('should use default pagination when not provided', async () => {
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);
      (prisma.answerRecord.count as any).mockResolvedValue(0);

      await recordService.getRecordsByUserId('user-1');

      expect(prisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0
        })
      );
    });

    it('should cap page size at 100', async () => {
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);
      (prisma.answerRecord.count as any).mockResolvedValue(0);

      await recordService.getRecordsByUserId('user-1', { pageSize: 500 });

      expect(prisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100
        })
      );
    });

    it('should handle page number less than 1', async () => {
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);
      (prisma.answerRecord.count as any).mockResolvedValue(0);

      await recordService.getRecordsByUserId('user-1', { page: -5 });

      expect(prisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0
        })
      );
    });
  });

  describe('createRecord', () => {
    const validRecordData = {
      wordId: 'word-1',
      isCorrect: true,
      responseTime: 2500,
      timestamp: Date.now()
    };

    beforeEach(() => {
      (prisma.word.findUnique as any).mockResolvedValue({
        id: 'word-1',
        wordBook: { type: 'SYSTEM', userId: null }
      });
    });

    it('should create a new answer record', async () => {
      const mockCreated = { id: 'rec-1', userId: 'user-1', ...validRecordData };
      (prisma.answerRecord.create as any).mockResolvedValue(mockCreated);

      const result = await recordService.createRecord('user-1', validRecordData);

      expect(result).toEqual(mockCreated);
      expect(prisma.answerRecord.create).toHaveBeenCalled();
    });

    it('should throw error for non-existent word', async () => {
      (prisma.word.findUnique as any).mockResolvedValue(null);

      await expect(
        recordService.createRecord('user-1', validRecordData)
      ).rejects.toThrow('单词不存在');
    });

    it('should throw error for word from other users private wordbook', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        id: 'word-1',
        wordBook: { type: 'USER', userId: 'other-user' }
      });

      await expect(
        recordService.createRecord('user-1', validRecordData)
      ).rejects.toThrow('无权访问');
    });

    it('should reject timestamps too far in the future', async () => {
      const futureRecord = {
        ...validRecordData,
        timestamp: Date.now() + 2 * 60 * 60 * 1000
      };

      await expect(
        recordService.createRecord('user-1', futureRecord)
      ).rejects.toThrow(/不能超过当前时间/);
    });

    it('should reject timestamps too far in the past', async () => {
      const pastRecord = {
        ...validRecordData,
        timestamp: Date.now() - 48 * 60 * 60 * 1000
      };

      await expect(
        recordService.createRecord('user-1', pastRecord)
      ).rejects.toThrow(/不能早于24小时/);
    });
  });

  describe('batchCreateRecords', () => {
    beforeEach(() => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'word-1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'word-2', wordBook: { type: 'SYSTEM', userId: null } }
      ]);
    });

    it('should create multiple records', async () => {
      const records = [
        { wordId: 'word-1', isCorrect: true, responseTime: 2000, timestamp: Date.now() },
        { wordId: 'word-2', isCorrect: false, responseTime: 3000, timestamp: Date.now() }
      ];

      (prisma.answerRecord.createMany as any).mockResolvedValue({ count: 2 });

      const result = await recordService.batchCreateRecords('user-1', records);

      expect(result.count).toBe(2);
    });

    it('should reject batch larger than MAX_BATCH_SIZE', async () => {
      const largeRecords = Array.from({ length: 1500 }, (_, i) => ({
        wordId: `word-${i}`,
        isCorrect: true,
        responseTime: 2000,
        timestamp: Date.now()
      }));

      await expect(
        recordService.batchCreateRecords('user-1', largeRecords)
      ).rejects.toThrow(/批量操作/);
    });

    it('should throw error when all words are inaccessible', async () => {
      (prisma.word.findMany as any).mockResolvedValue([]);

      const records = [
        { wordId: 'word-1', isCorrect: true, responseTime: 2000, timestamp: Date.now() }
      ];

      await expect(
        recordService.batchCreateRecords('user-1', records)
      ).rejects.toThrow(/无权访问/);
    });
  });

  describe('getStatistics', () => {
    it('should return user learning statistics', async () => {
      (prisma.wordBook.findMany as any).mockResolvedValue([{ id: 'wb-1' }]);
      (prisma.word.count as any).mockResolvedValue(1000);
      (prisma.answerRecord.count as any)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(75);
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);

      const stats = await recordService.getStatistics('user-1');

      expect(stats.totalWords).toBe(1000);
      expect(stats.totalRecords).toBe(100);
      expect(stats.correctRate).toBe(0.75);
    });

    it('should handle user with no records', async () => {
      (prisma.wordBook.findMany as any).mockResolvedValue([]);
      (prisma.word.count as any).mockResolvedValue(0);
      (prisma.answerRecord.count as any).mockResolvedValue(0);
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);

      const stats = await recordService.getStatistics('new-user');

      expect(stats.totalRecords).toBe(0);
      expect(stats.correctRate).toBe(0);
    });
  });

  describe('exports', () => {
    it('should export RecordService class', async () => {
      const module = await import('../../../src/services/record.service');
      expect(module.RecordService).toBeDefined();
    });

    it('should export default singleton', async () => {
      const module = await import('../../../src/services/record.service');
      expect(module.default).toBeDefined();
    });
  });
});
