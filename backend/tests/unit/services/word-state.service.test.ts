/**
 * Word State Service Tests
 * 单词学习状态服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WordState, WordBookType } from '@prisma/client';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    word: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

// Mock cache service
vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn()
  },
  CacheKeys: {
    USER_LEARNING_STATE: (userId: string, wordId: string) => `learning_state:${userId}:${wordId}`,
    USER_LEARNING_STATES: (userId: string) => `learning_states:${userId}`,
    USER_DUE_WORDS: (userId: string) => `due_words:${userId}`,
    USER_STATS: (userId: string) => `user_stats:${userId}`
  },
  CacheTTL: {
    LEARNING_STATE: 300,
    USER_STATS: 60
  }
}));

import { wordStateService } from '../../../src/services/word-state.service';

describe('WordStateService', () => {
  let mockPrisma: any;
  let mockCacheService: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    const cacheModule = await import('../../../src/services/cache.service');
    mockCacheService = cacheModule.cacheService;
    vi.clearAllMocks();
  });

  describe('getWordState', () => {
    it('应该从缓存返回学习状态', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const cachedState = {
        userId,
        wordId,
        state: WordState.LEARNING,
        masteryLevel: 2
      };

      mockCacheService.get.mockReturnValue(cachedState);

      const result = await wordStateService.getWordState(userId, wordId);

      expect(result).toEqual(cachedState);
      expect(mockPrisma.wordLearningState.findUnique).not.toHaveBeenCalled();
    });

    it('应该从数据库查询并缓存结果', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const dbState = {
        userId,
        wordId,
        state: WordState.REVIEWING,
        masteryLevel: 3
      };

      mockCacheService.get.mockReturnValue(null);
      mockPrisma.wordLearningState.findUnique.mockResolvedValue(dbState);

      const result = await wordStateService.getWordState(userId, wordId);

      expect(result).toEqual(dbState);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('应该缓存空值防止穿透', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockPrisma.wordLearningState.findUnique.mockResolvedValue(null);

      const result = await wordStateService.getWordState('user-123', 'non-existent');

      expect(result).toBeNull();
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        '__NULL__',
        60
      );
    });

    it('应该处理空值标记', async () => {
      mockCacheService.get.mockReturnValue('__NULL__');

      const result = await wordStateService.getWordState('user-123', 'word-123');

      expect(result).toBeNull();
      expect(mockPrisma.wordLearningState.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('batchGetWordStates', () => {
    it('应该批量获取学习状态', async () => {
      const userId = 'user-123';
      const wordIds = ['word-1', 'word-2', 'word-3'];

      mockCacheService.get.mockReturnValue(null);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-1', state: WordState.NEW },
        { wordId: 'word-2', state: WordState.LEARNING }
      ]);

      const result = await wordStateService.batchGetWordStates(userId, wordIds);

      expect(result.size).toBe(2);
      expect(result.get('word-1')?.state).toBe(WordState.NEW);
      expect(result.has('word-3')).toBe(false);
    });

    it('应该合并缓存和数据库结果', async () => {
      const userId = 'user-123';
      const wordIds = ['word-1', 'word-2'];

      // word-1 在缓存中
      mockCacheService.get
        .mockReturnValueOnce({ wordId: 'word-1', state: WordState.MASTERED })
        .mockReturnValueOnce(null);

      // word-2 从数据库获取
      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-2', state: WordState.LEARNING }
      ]);

      const result = await wordStateService.batchGetWordStates(userId, wordIds);

      expect(result.size).toBe(2);
      expect(result.get('word-1')?.state).toBe(WordState.MASTERED);
      expect(result.get('word-2')?.state).toBe(WordState.LEARNING);
    });

    it('应该正确处理空值标记', async () => {
      const userId = 'user-123';
      const wordIds = ['word-1', 'word-2'];

      mockCacheService.get
        .mockReturnValueOnce('__NULL__')  // word-1 空值缓存
        .mockReturnValueOnce(null);       // word-2 需要查询

      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-2', state: WordState.NEW }
      ]);

      const result = await wordStateService.batchGetWordStates(userId, wordIds);

      // word-1 不应该出现在结果中（空值缓存命中）
      expect(result.has('word-1')).toBe(false);
      expect(result.get('word-2')?.state).toBe(WordState.NEW);
    });
  });

  describe('getUserStates', () => {
    it('应该返回用户所有学习状态', async () => {
      const userId = 'user-123';
      const states = [
        { wordId: 'word-1', state: WordState.LEARNING },
        { wordId: 'word-2', state: WordState.REVIEWING }
      ];

      mockCacheService.get.mockReturnValue(null);
      mockPrisma.wordLearningState.findMany.mockResolvedValue(states);

      const result = await wordStateService.getUserStates(userId);

      expect(result).toEqual(states);
    });

    it('应该使用缓存', async () => {
      const cachedStates = [{ wordId: 'word-1', state: WordState.NEW }];
      mockCacheService.get.mockReturnValue(cachedStates);

      const result = await wordStateService.getUserStates('user-123');

      expect(result).toEqual(cachedStates);
      expect(mockPrisma.wordLearningState.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getDueWords', () => {
    it('应该返回到期需要复习的单词', async () => {
      const userId = 'user-123';
      const now = new Date();

      mockCacheService.get.mockReturnValue(null);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-1', state: WordState.LEARNING, nextReviewDate: new Date(now.getTime() - 1000) },
        { wordId: 'word-2', state: WordState.REVIEWING, nextReviewDate: new Date(now.getTime() - 60000) }
      ]);

      const result = await wordStateService.getDueWords(userId);

      expect(result).toHaveLength(2);
    });
  });

  describe('getWordsByState', () => {
    it('应该返回指定状态的单词', async () => {
      const userId = 'user-123';

      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-1', state: WordState.MASTERED },
        { wordId: 'word-2', state: WordState.MASTERED }
      ]);

      const result = await wordStateService.getWordsByState(userId, WordState.MASTERED);

      expect(result).toHaveLength(2);
      expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledWith({
        where: { userId, state: WordState.MASTERED },
        orderBy: { updatedAt: 'desc' }
      });
    });
  });

  describe('upsertWordState', () => {
    it('应该创建或更新学习状态', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const data = { state: WordState.LEARNING, masteryLevel: 2 };

      mockPrisma.word.findUnique.mockResolvedValue({
        wordBook: { type: WordBookType.SYSTEM, userId: null }
      });

      mockPrisma.wordLearningState.upsert.mockResolvedValue({
        userId,
        wordId,
        ...data
      });

      const result = await wordStateService.upsertWordState(userId, wordId, data);

      expect(result.state).toBe(WordState.LEARNING);
      expect(mockCacheService.delete).toHaveBeenCalled();
    });

    it('应该拒绝访问其他用户的词书', async () => {
      mockPrisma.word.findUnique.mockResolvedValue({
        wordBook: { type: WordBookType.USER, userId: 'other-user' }
      });

      await expect(
        wordStateService.upsertWordState('user-123', 'word-123', {})
      ).rejects.toThrow('无权访问该单词');
    });

    it('应该拒绝不存在的单词', async () => {
      mockPrisma.word.findUnique.mockResolvedValue(null);

      await expect(
        wordStateService.upsertWordState('user-123', 'non-existent', {})
      ).rejects.toThrow('单词不存在');
    });

    it('应该验证时间戳并转换为Date对象', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const now = Date.now();
      // 使用过去30分钟作为有效时间戳
      const pastTime = now - 30 * 60 * 1000;
      // 使用未来30分钟（在1小时限制内）作为下次复习时间
      const futureTime = now + 30 * 60 * 1000;

      mockPrisma.word.findUnique.mockResolvedValue({
        wordBook: { type: WordBookType.SYSTEM, userId: null }
      });

      mockPrisma.wordLearningState.upsert.mockResolvedValue({});

      await wordStateService.upsertWordState(userId, wordId, {
        lastReviewDate: pastTime,
        nextReviewDate: futureTime
      } as any);

      expect(mockPrisma.wordLearningState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            lastReviewDate: expect.any(Date),
            nextReviewDate: expect.any(Date)
          })
        })
      );
    });
  });

  describe('batchUpdateWordStates', () => {
    it('应该批量更新学习状态', async () => {
      const userId = 'user-123';
      const updates = [
        { wordId: 'word-1', data: { state: WordState.LEARNING } },
        { wordId: 'word-2', data: { state: WordState.REVIEWING } }
      ];

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', wordBook: { type: WordBookType.SYSTEM, userId: null } },
        { id: 'word-2', wordBook: { type: WordBookType.SYSTEM, userId: null } }
      ]);

      mockPrisma.$transaction.mockResolvedValue([]);

      await wordStateService.batchUpdateWordStates(userId, updates);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('应该拒绝包含无权访问单词的批量更新', async () => {
      const userId = 'user-123';
      const updates = [
        { wordId: 'word-1', data: { state: WordState.LEARNING } },
        { wordId: 'word-2', data: { state: WordState.LEARNING } }
      ];

      // word-2 属于其他用户
      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', wordBook: { type: WordBookType.SYSTEM, userId: null } },
        { id: 'word-2', wordBook: { type: WordBookType.USER, userId: 'other-user' } }
      ]);

      await expect(
        wordStateService.batchUpdateWordStates(userId, updates)
      ).rejects.toThrow('无权访问以下单词');
    });
  });

  describe('deleteWordState', () => {
    it('应该删除学习状态并清除缓存', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';

      mockPrisma.wordLearningState.delete.mockResolvedValue({});

      await wordStateService.deleteWordState(userId, wordId);

      expect(mockPrisma.wordLearningState.delete).toHaveBeenCalled();
      expect(mockCacheService.delete).toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('应该返回用户学习统计', async () => {
      const userId = 'user-123';

      mockCacheService.get.mockReturnValue(null);
      mockPrisma.wordLearningState.count
        .mockResolvedValueOnce(100) // totalWords
        .mockResolvedValueOnce(20)  // newWords
        .mockResolvedValueOnce(30)  // learningWords
        .mockResolvedValueOnce(25)  // reviewingWords
        .mockResolvedValueOnce(25); // masteredWords

      const stats = await wordStateService.getUserStats(userId);

      expect(stats.totalWords).toBe(100);
      expect(stats.newWords).toBe(20);
      expect(stats.learningWords).toBe(30);
      expect(stats.reviewingWords).toBe(25);
      expect(stats.masteredWords).toBe(25);
    });

    it('应该使用缓存', async () => {
      const cachedStats = { totalWords: 50, newWords: 10 };
      mockCacheService.get.mockReturnValue(cachedStats);

      const stats = await wordStateService.getUserStats('user-123');

      expect(stats).toEqual(cachedStats);
      expect(mockPrisma.wordLearningState.count).not.toHaveBeenCalled();
    });
  });

  describe('clearAllCache', () => {
    it('应该清除所有缓存', () => {
      wordStateService.clearAllCache();

      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('learning_state*');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('due_words*');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('user_stats*');
    });
  });
});
