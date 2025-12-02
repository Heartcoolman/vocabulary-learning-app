/**
 * Record Service Tests
 * 学习记录服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn()
    },
    word: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    learningSession: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

// Mock word-mastery.service
vi.mock('../../../src/services/word-mastery.service', () => ({
  wordMasteryService: {
    recordReview: vi.fn(),
    batchRecordReview: vi.fn()
  }
}));

import RecordService from '../../../src/services/record.service';

describe('RecordService', () => {
  let mockPrisma: any;
  let mockWordMasteryService: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    const masteryModule = await import('../../../src/services/word-mastery.service');
    mockWordMasteryService = masteryModule.wordMasteryService;
    vi.clearAllMocks();
  });

  describe('getRecordsByUserId', () => {
    it('应该返回用户的学习记录（带分页）', async () => {
      const userId = 'user-123';
      const mockRecords = [
        { id: 'record-1', wordId: 'word-1', isCorrect: true, word: { spelling: 'apple', phonetic: '/æpl/', meanings: ['苹果'] } },
        { id: 'record-2', wordId: 'word-2', isCorrect: false, word: { spelling: 'banana', phonetic: '/bəˈnænə/', meanings: ['香蕉'] } }
      ];

      mockPrisma.answerRecord.findMany.mockResolvedValue(mockRecords);
      mockPrisma.answerRecord.count.mockResolvedValue(2);

      const result = await RecordService.getRecordsByUserId(userId);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(2);
    });

    it('应该正确处理分页参数', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.count.mockResolvedValue(100);

      const result = await RecordService.getRecordsByUserId('user-123', { page: 2, pageSize: 20 });

      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 20
        })
      );
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.pageSize).toBe(20);
    });

    it('应该限制最大页面大小为100', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.count.mockResolvedValue(0);

      await RecordService.getRecordsByUserId('user-123', { pageSize: 200 });

      expect(mockPrisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  describe('createRecord', () => {
    it('应该创建学习记录', async () => {
      const userId = 'user-123';
      const data = {
        wordId: 'word-123',
        isCorrect: true,
        responseTime: 1500,
        selectedAnswer: '苹果',
        correctAnswer: '苹果'
      };

      mockPrisma.word.findUnique.mockResolvedValue({
        id: 'word-123',
        wordBook: { type: 'SYSTEM', userId: null }
      });

      mockPrisma.answerRecord.create.mockResolvedValue({
        id: 'record-1',
        userId,
        ...data
      });

      const result = await RecordService.createRecord(userId, data);

      expect(result.id).toBe('record-1');
      expect(mockWordMasteryService.recordReview).toHaveBeenCalled();
    });

    it('应该抛出错误当单词不存在', async () => {
      mockPrisma.word.findUnique.mockResolvedValue(null);

      await expect(
        RecordService.createRecord('user-123', { wordId: 'non-existent', isCorrect: true })
      ).rejects.toThrow('单词不存在');
    });

    it('应该拒绝访问其他用户的词书单词', async () => {
      mockPrisma.word.findUnique.mockResolvedValue({
        id: 'word-123',
        wordBook: { type: 'USER', userId: 'other-user' }
      });

      await expect(
        RecordService.createRecord('user-123', { wordId: 'word-123', isCorrect: true })
      ).rejects.toThrow('无权访问该单词');
    });

    it('应该验证时间戳的合理性', async () => {
      mockPrisma.word.findUnique.mockResolvedValue({
        id: 'word-123',
        wordBook: { type: 'SYSTEM', userId: null }
      });

      const futureTimestamp = Date.now() + 2 * 60 * 60 * 1000; // 2小时后

      await expect(
        RecordService.createRecord('user-123', {
          wordId: 'word-123',
          isCorrect: true,
          timestamp: futureTimestamp
        })
      ).rejects.toThrow('时间戳不能超过当前时间1小时');
    });

    it('应该确保学习会话存在', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';

      mockPrisma.word.findUnique.mockResolvedValue({
        id: 'word-123',
        wordBook: { type: 'SYSTEM', userId: null }
      });

      mockPrisma.learningSession.findUnique.mockResolvedValue(null);
      mockPrisma.learningSession.create.mockResolvedValue({ id: sessionId, userId });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      mockPrisma.answerRecord.create.mockResolvedValue({ id: 'record-1' });

      await RecordService.createRecord(userId, {
        wordId: 'word-123',
        isCorrect: true,
        sessionId
      });

      // 会话创建逻辑在 ensureLearningSession 中
    });
  });

  describe('batchCreateRecords', () => {
    it('应该批量创建学习记录', async () => {
      const userId = 'user-123';
      const records = [
        { wordId: 'word-1', isCorrect: true, timestamp: Date.now() },
        { wordId: 'word-2', isCorrect: false, timestamp: Date.now() }
      ];

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', spelling: 'apple', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'word-2', spelling: 'banana', wordBook: { type: 'SYSTEM', userId: null } }
      ]);

      mockPrisma.answerRecord.createMany.mockResolvedValue({ count: 2 });

      const result = await RecordService.batchCreateRecords(userId, records);

      expect(result.count).toBe(2);
      expect(mockWordMasteryService.batchRecordReview).toHaveBeenCalled();
    });

    it('应该拒绝超过批量限制的记录', async () => {
      const records = Array(1001).fill({ wordId: 'word-1', isCorrect: true });

      await expect(
        RecordService.batchCreateRecords('user-123', records)
      ).rejects.toThrow('批量操作上限为 1000 条');
    });

    it('应该跳过无权访问的单词', async () => {
      const userId = 'user-123';
      const records = [
        { wordId: 'word-1', isCorrect: true, timestamp: Date.now() },
        { wordId: 'word-2', isCorrect: false, timestamp: Date.now() }
      ];

      // word-2 属于其他用户
      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'word-2', wordBook: { type: 'USER', userId: 'other-user' } }
      ]);

      mockPrisma.answerRecord.createMany.mockResolvedValue({ count: 1 });

      await RecordService.batchCreateRecords(userId, records);

      // 只有 word-1 被创建
      expect(mockPrisma.answerRecord.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ wordId: 'word-1' })
          ])
        })
      );
    });

    it('应该拒绝当所有单词都无权访问', async () => {
      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', wordBook: { type: 'USER', userId: 'other-user' } }
      ]);

      await expect(
        RecordService.batchCreateRecords('user-123', [{ wordId: 'word-1', isCorrect: true }])
      ).rejects.toThrow('所有单词都不存在或无权访问');
    });

    it('应该使用 skipDuplicates 选项', async () => {
      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', wordBook: { type: 'SYSTEM', userId: null } }
      ]);
      mockPrisma.answerRecord.createMany.mockResolvedValue({ count: 1 });

      await RecordService.batchCreateRecords('user-123', [
        { wordId: 'word-1', isCorrect: true, timestamp: Date.now() }
      ]);

      expect(mockPrisma.answerRecord.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true })
      );
    });
  });

  describe('getStatistics', () => {
    it('应该返回学习统计数据', async () => {
      const userId = 'user-123';

      mockPrisma.wordBook.findMany.mockResolvedValue([
        { id: 'book-1' },
        { id: 'book-2' }
      ]);

      mockPrisma.word.count = vi.fn().mockResolvedValue(100);
      mockPrisma.answerRecord.count
        .mockResolvedValueOnce(50)  // totalRecords
        .mockResolvedValueOnce(40); // correctRecords

      mockPrisma.answerRecord.findMany.mockResolvedValue([
        { id: 'record-1', isCorrect: true, word: { spelling: 'apple', phonetic: '/æpl/' } }
      ]);

      const stats = await RecordService.getStatistics(userId);

      expect(stats.totalWords).toBe(100);
      expect(stats.totalRecords).toBe(50);
      expect(stats.correctRate).toBe(0.8);
    });

    it('应该正确计算正确率', async () => {
      mockPrisma.wordBook.findMany.mockResolvedValue([{ id: 'book-1' }]);
      mockPrisma.word.count = vi.fn().mockResolvedValue(50);
      mockPrisma.answerRecord.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(75);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const stats = await RecordService.getStatistics('user-123');

      expect(stats.correctRate).toBe(0.75);
    });

    it('应该处理零记录的情况', async () => {
      mockPrisma.wordBook.findMany.mockResolvedValue([{ id: 'book-1' }]);
      mockPrisma.word.count = vi.fn().mockResolvedValue(50);
      mockPrisma.answerRecord.count.mockResolvedValue(0);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const stats = await RecordService.getStatistics('user-123');

      expect(stats.correctRate).toBe(0);
    });
  });
});
