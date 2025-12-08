/**
 * Word State Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    word: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn(),
  },
  CacheKeys: {
    USER_LEARNING_STATE: (userId: string, wordId: string) => `ls:${userId}:${wordId}`,
    USER_LEARNING_STATES: (userId: string) => `ls:${userId}:all`,
    USER_DUE_WORDS: (userId: string) => `due:${userId}`,
    USER_STATS: (userId: string) => `stats:${userId}`,
  },
  CacheTTL: {
    LEARNING_STATE: 3600,
    USER_STATS: 300,
    NULL_CACHE: 60,
  },
}));

import prisma from '../../../src/config/database';
import { cacheService } from '../../../src/services/cache.service';

describe('WordStateService', () => {
  let wordStateService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    (cacheService.get as any).mockReturnValue(null);
    const module = await import('../../../src/services/word-state.service');
    wordStateService = module.wordStateService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getWordState', () => {
    it('should return cached state if available', async () => {
      const cachedState = { userId: 'u1', wordId: 'w1', state: 'LEARNING' };
      (cacheService.get as any).mockReturnValue(cachedState);

      const result = await wordStateService.getWordState('u1', 'w1');

      expect(result).toEqual(cachedState);
      expect(prisma.wordLearningState.findUnique).not.toHaveBeenCalled();
    });

    it('should return null for null marker in cache', async () => {
      (cacheService.get as any).mockReturnValue('__NULL__');

      const result = await wordStateService.getWordState('u1', 'w1');

      expect(result).toBeNull();
      expect(prisma.wordLearningState.findUnique).not.toHaveBeenCalled();
    });

    it('should query database and cache result', async () => {
      const dbState = { userId: 'u1', wordId: 'w1', state: 'LEARNING' };
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(dbState);

      const result = await wordStateService.getWordState('u1', 'w1');

      expect(result).toEqual(dbState);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should cache null marker for non-existent state', async () => {
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await wordStateService.getWordState('u1', 'w1');

      expect(result).toBeNull();
      // 服务使用 CacheTTL.NULL_CACHE (60秒) 缓存空值标记
      expect(cacheService.set).toHaveBeenCalledWith('ls:u1:w1', '__NULL__', 60);
    });
  });

  describe('batchGetWordStates', () => {
    it('should return cached states for cache hits', async () => {
      const cachedState = { userId: 'u1', wordId: 'w1', state: 'LEARNING' };
      (cacheService.get as any).mockImplementation((key: string) => {
        if (key.includes('w1')) return cachedState;
        if (key.includes('w2')) return '__NULL__';
        return null;
      });

      const result = await wordStateService.batchGetWordStates('u1', ['w1', 'w2', 'w3']);

      expect(result.get('w1')).toEqual(cachedState);
      expect(result.has('w2')).toBe(false);
    });

    it('should batch query uncached words', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([
        { userId: 'u1', wordId: 'w1', state: 'LEARNING' },
        { userId: 'u1', wordId: 'w2', state: 'NEW' },
      ]);

      const result = await wordStateService.batchGetWordStates('u1', ['w1', 'w2', 'w3']);

      expect(result.size).toBe(2);
      expect(prisma.wordLearningState.findMany).toHaveBeenCalled();
    });
  });

  describe('getUserStates', () => {
    it('should return all states for user', async () => {
      const states = [
        { userId: 'u1', wordId: 'w1', state: 'LEARNING' },
        { userId: 'u1', wordId: 'w2', state: 'MASTERED' },
      ];
      (prisma.wordLearningState.findMany as any).mockResolvedValue(states);

      const result = await wordStateService.getUserStates('u1');

      expect(result).toEqual(states);
    });

    it('should use cached data if available', async () => {
      const cachedStates = [{ userId: 'u1', wordId: 'w1' }];
      (cacheService.get as any).mockReturnValue(cachedStates);

      const result = await wordStateService.getUserStates('u1');

      expect(result).toEqual(cachedStates);
      expect(prisma.wordLearningState.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getDueWords', () => {
    it('should return words due for review', async () => {
      const dueWords = [
        { userId: 'u1', wordId: 'w1', state: 'LEARNING', nextReviewDate: new Date() },
      ];
      (prisma.wordLearningState.findMany as any).mockResolvedValue(dueWords);

      const result = await wordStateService.getDueWords('u1');

      expect(result).toEqual(dueWords);
      // 验证调用了findMany，包含userId和OR条件
      expect(prisma.wordLearningState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('getWordsByState', () => {
    it('should filter words by state', async () => {
      const masteredWords = [{ userId: 'u1', wordId: 'w1', state: 'MASTERED' }];
      (prisma.wordLearningState.findMany as any).mockResolvedValue(masteredWords);

      const result = await wordStateService.getWordsByState('u1', 'MASTERED');

      expect(result).toEqual(masteredWords);
      expect(prisma.wordLearningState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', state: 'MASTERED' },
        }),
      );
    });
  });

  describe('upsertWordState', () => {
    beforeEach(() => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null },
      });
    });

    it('should create new state', async () => {
      const newState = { userId: 'u1', wordId: 'w1', state: 'NEW' };
      (prisma.wordLearningState.upsert as any).mockResolvedValue(newState);

      const result = await wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' });

      expect(result).toEqual(newState);
      expect(cacheService.delete).toHaveBeenCalled();
    });

    it('should convert timestamp to Date', async () => {
      const now = Date.now();
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        lastReviewDate: new Date(now),
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        lastReviewDate: now,
      });

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should reject future timestamps', async () => {
      const futureTime = Date.now() + 2 * 60 * 60 * 1000;

      await expect(
        wordStateService.upsertWordState('u1', 'w1', {
          lastReviewDate: futureTime,
        }),
      ).rejects.toThrow('时间戳不能超过当前时间1小时');
    });

    it('should reject timestamps too far in past', async () => {
      const oldTime = Date.now() - 400 * 24 * 60 * 60 * 1000;

      await expect(
        wordStateService.upsertWordState('u1', 'w1', {
          lastReviewDate: oldTime,
        }),
      ).rejects.toThrow('时间戳不能早于1年前');
    });

    it('should throw for inaccessible word', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'USER', userId: 'other-user' },
      });

      await expect(wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' })).rejects.toThrow(
        '无权访问该单词',
      );
    });

    it('should throw for non-existent word', async () => {
      (prisma.word.findUnique as any).mockResolvedValue(null);

      await expect(wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' })).rejects.toThrow(
        '单词不存在',
      );
    });
  });

  describe('batchUpdateWordStates', () => {
    beforeEach(() => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'w2', wordBook: { type: 'SYSTEM', userId: null } },
      ]);
      (prisma.$transaction as any).mockResolvedValue([]);
    });

    it('should batch update multiple states', async () => {
      await wordStateService.batchUpdateWordStates('u1', [
        { wordId: 'w1', data: { state: 'LEARNING' } },
        { wordId: 'w2', data: { state: 'REVIEWING' } },
      ]);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw for inaccessible words', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
      ]);

      await expect(
        wordStateService.batchUpdateWordStates('u1', [
          { wordId: 'w1', data: { state: 'LEARNING' } },
          { wordId: 'w2', data: { state: 'LEARNING' } },
        ]),
      ).rejects.toThrow('无权访问以下单词');
    });
  });

  describe('deleteWordState', () => {
    it('should delete state and invalidate cache', async () => {
      (prisma.wordLearningState.delete as any).mockResolvedValue({});

      await wordStateService.deleteWordState('u1', 'w1');

      expect(prisma.wordLearningState.delete).toHaveBeenCalled();
      expect(cacheService.delete).toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      (prisma.wordLearningState.count as any)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(25);

      const result = await wordStateService.getUserStats('u1');

      expect(result).toEqual({
        totalWords: 100,
        newWords: 20,
        learningWords: 30,
        reviewingWords: 25,
        masteredWords: 25,
      });
    });

    it('should use cached stats if available', async () => {
      const cachedStats = { totalWords: 50 };
      (cacheService.get as any).mockReturnValue(cachedStats);

      const result = await wordStateService.getUserStats('u1');

      expect(result).toEqual(cachedStats);
      expect(prisma.wordLearningState.count).not.toHaveBeenCalled();
    });
  });

  describe('clearAllCache', () => {
    it('should clear all related cache patterns', () => {
      wordStateService.clearAllCache();

      expect(cacheService.deletePattern).toHaveBeenCalledWith('learning_state*');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('due_words*');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('user_stats*');
    });
  });

  // =============================================
  // 边界条件和错误处理测试
  // =============================================

  describe('getWordState - 边界条件', () => {
    it('should handle empty userId', async () => {
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await wordStateService.getWordState('', 'w1');

      expect(result).toBeNull();
    });

    it('should handle empty wordId', async () => {
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await wordStateService.getWordState('u1', '');

      expect(result).toBeNull();
    });

    it('should handle database error gracefully', async () => {
      (prisma.wordLearningState.findUnique as any).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(wordStateService.getWordState('u1', 'w1')).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle very long userId and wordId', async () => {
      const longUserId = 'u'.repeat(500);
      const longWordId = 'w'.repeat(500);
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await wordStateService.getWordState(longUserId, longWordId);

      expect(result).toBeNull();
    });
  });

  describe('batchGetWordStates - 边界条件', () => {
    it('should return empty map for empty wordIds array', async () => {
      const result = await wordStateService.batchGetWordStates('u1', []);

      expect(result.size).toBe(0);
      expect(prisma.wordLearningState.findMany).not.toHaveBeenCalled();
    });

    it('should handle single wordId in batch', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([
        { userId: 'u1', wordId: 'w1', state: 'LEARNING' },
      ]);

      const result = await wordStateService.batchGetWordStates('u1', ['w1']);

      expect(result.size).toBe(1);
      expect(result.get('w1')).toBeDefined();
    });

    it('should handle all items from cache', async () => {
      const cachedState1 = { userId: 'u1', wordId: 'w1', state: 'LEARNING' };
      const cachedState2 = { userId: 'u1', wordId: 'w2', state: 'MASTERED' };
      (cacheService.get as any).mockImplementation((key: string) => {
        if (key.includes('w1')) return cachedState1;
        if (key.includes('w2')) return cachedState2;
        return null;
      });

      const result = await wordStateService.batchGetWordStates('u1', ['w1', 'w2']);

      expect(result.size).toBe(2);
      expect(prisma.wordLearningState.findMany).not.toHaveBeenCalled();
    });

    it('should handle partial cache hits', async () => {
      const cachedState = { userId: 'u1', wordId: 'w1', state: 'LEARNING' };
      (cacheService.get as any).mockImplementation((key: string) => {
        if (key.includes('w1')) return cachedState;
        return null;
      });
      (prisma.wordLearningState.findMany as any).mockResolvedValue([
        { userId: 'u1', wordId: 'w2', state: 'NEW' },
      ]);

      const result = await wordStateService.batchGetWordStates('u1', ['w1', 'w2', 'w3']);

      expect(result.size).toBe(2);
      expect(result.get('w1')).toEqual(cachedState);
      expect(result.has('w3')).toBe(false); // w3 not found in DB
    });

    it('should handle large batch of wordIds', async () => {
      const wordIds = Array.from({ length: 1000 }, (_, i) => `w${i}`);
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await wordStateService.batchGetWordStates('u1', wordIds);

      expect(result.size).toBe(0);
      expect(prisma.wordLearningState.findMany).toHaveBeenCalled();
    });

    it('should cache null marker for unfound words', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([
        { userId: 'u1', wordId: 'w1', state: 'LEARNING' },
      ]);

      await wordStateService.batchGetWordStates('u1', ['w1', 'w2']);

      // w2 not found, should cache null marker
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('w2'),
        '__NULL__',
        expect.any(Number),
      );
    });

    it('should handle duplicate wordIds in input', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([
        { userId: 'u1', wordId: 'w1', state: 'LEARNING' },
      ]);

      const result = await wordStateService.batchGetWordStates('u1', ['w1', 'w1', 'w1']);

      expect(result.size).toBe(1);
    });
  });

  describe('getUserStates - 边界条件', () => {
    it('should return empty array for user with no states', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await wordStateService.getUserStates('u1');

      expect(result).toEqual([]);
    });

    it('should handle empty userId', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await wordStateService.getUserStates('');

      expect(result).toEqual([]);
    });
  });

  describe('getDueWords - 边界条件', () => {
    it('should return empty array when no words are due', async () => {
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await wordStateService.getDueWords('u1');

      expect(result).toEqual([]);
    });

    it('should include NEW state words with null nextReviewDate', async () => {
      const newWord = { userId: 'u1', wordId: 'w1', state: 'NEW', nextReviewDate: null };
      (prisma.wordLearningState.findMany as any).mockResolvedValue([newWord]);

      const result = await wordStateService.getDueWords('u1');

      expect(result).toContainEqual(newWord);
    });

    it('should handle empty userId', async () => {
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await wordStateService.getDueWords('');

      expect(result).toEqual([]);
    });
  });

  describe('getWordsByState - 边界条件', () => {
    it('should return empty array for state with no words', async () => {
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

      const result = await wordStateService.getWordsByState('u1', 'MASTERED' as any);

      expect(result).toEqual([]);
    });

    it('should handle all valid states', async () => {
      const states = ['NEW', 'LEARNING', 'REVIEWING', 'MASTERED'];
      for (const state of states) {
        (prisma.wordLearningState.findMany as any).mockResolvedValue([]);

        const result = await wordStateService.getWordsByState('u1', state as any);

        expect(result).toEqual([]);
        expect(prisma.wordLearningState.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: 'u1', state },
          }),
        );
      }
    });
  });

  describe('upsertWordState - 边界条件和错误处理', () => {
    beforeEach(() => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null },
      });
    });

    it('should handle timestamp of 0 as null', async () => {
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        lastReviewDate: null,
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        lastReviewDate: 0 as any,
      });

      expect(prisma.wordLearningState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            lastReviewDate: null,
          }),
        }),
      );
    });

    it('should handle timestamp just within future limit', async () => {
      const justWithinLimit = Date.now() + 59 * 60 * 1000; // 59 minutes in future
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        lastReviewDate: new Date(justWithinLimit),
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        lastReviewDate: justWithinLimit,
      });

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should handle timestamp just at past limit', async () => {
      const justWithinLimit = Date.now() - 364 * 24 * 60 * 60 * 1000; // 364 days ago
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        lastReviewDate: new Date(justWithinLimit),
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        lastReviewDate: justWithinLimit,
      });

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should reject invalid timestamp (NaN)', async () => {
      await expect(
        wordStateService.upsertWordState('u1', 'w1', {
          lastReviewDate: NaN as any,
        }),
      ).rejects.toThrow('无效的时间戳格式');
    });

    it('should handle multiple timestamp fields conversion', async () => {
      const now = Date.now();
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        lastReviewDate: new Date(now),
        nextReviewDate: new Date(now + 1000),
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        lastReviewDate: now,
        nextReviewDate: now + 1000,
      } as any);

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should not allow data to override userId and wordId', async () => {
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        state: 'LEARNING',
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        userId: 'attacker',
        wordId: 'hacked',
        state: 'LEARNING' as any,
      } as any);

      // 验证使用的是原始的userId和wordId
      expect(prisma.wordLearningState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            unique_user_word: {
              userId: 'u1',
              wordId: 'w1',
            },
          },
        }),
      );
    });

    it("should allow access to user's own word in user wordbook", async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'USER', userId: 'u1' },
      });
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        state: 'NEW',
      });

      const result = await wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' as any });

      expect(result).toBeDefined();
    });

    it('should handle database error during upsert', async () => {
      (prisma.wordLearningState.upsert as any).mockRejectedValue(new Error('Database error'));

      await expect(
        wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' as any }),
      ).rejects.toThrow('Database error');
    });
  });

  describe('batchUpdateWordStates - 边界条件和错误处理', () => {
    beforeEach(() => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'w2', wordBook: { type: 'SYSTEM', userId: null } },
      ]);
      (prisma.$transaction as any).mockResolvedValue([]);
    });

    it('should handle empty updates array', async () => {
      await wordStateService.batchUpdateWordStates('u1', []);

      // 空数组仍会调用事务（传入空数组），但不会造成问题
      expect(prisma.$transaction).toHaveBeenCalledWith([]);
    });

    it('should handle duplicate wordIds in updates', async () => {
      await wordStateService.batchUpdateWordStates('u1', [
        { wordId: 'w1', data: { state: 'LEARNING' as any } },
        { wordId: 'w1', data: { state: 'REVIEWING' as any } },
      ]);

      // 应该处理重复的wordId
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw error with detailed inaccessible word IDs', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
      ]);

      await expect(
        wordStateService.batchUpdateWordStates('u1', [
          { wordId: 'w1', data: { state: 'LEARNING' as any } },
          { wordId: 'w2', data: { state: 'LEARNING' as any } },
          { wordId: 'w3', data: { state: 'LEARNING' as any } },
        ]),
      ).rejects.toThrow('无权访问以下单词: w2, w3');
    });

    it('should reject batch with any invalid timestamp', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'w2', wordBook: { type: 'SYSTEM', userId: null } },
      ]);

      const futureTime = Date.now() + 2 * 60 * 60 * 1000;

      await expect(
        wordStateService.batchUpdateWordStates('u1', [
          { wordId: 'w1', data: { state: 'LEARNING' as any } },
          { wordId: 'w2', data: { lastReviewDate: futureTime } as any },
        ]),
      ).rejects.toThrow('时间戳校验失败');
    });

    it('should handle batch with mixed valid and timestamp=0', async () => {
      await wordStateService.batchUpdateWordStates('u1', [
        { wordId: 'w1', data: { state: 'LEARNING' as any } },
        { wordId: 'w2', data: { lastReviewDate: 0 } as any },
      ]);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should collect all timestamp errors before throwing', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'w2', wordBook: { type: 'SYSTEM', userId: null } },
      ]);

      const futureTime = Date.now() + 2 * 60 * 60 * 1000;
      const oldTime = Date.now() - 400 * 24 * 60 * 60 * 1000;

      await expect(
        wordStateService.batchUpdateWordStates('u1', [
          { wordId: 'w1', data: { lastReviewDate: futureTime } as any },
          { wordId: 'w2', data: { lastReviewDate: oldTime } as any },
        ]),
      ).rejects.toThrow(/时间戳校验失败[\s\S]*w1[\s\S]*w2/);
    });

    it('should handle large batch updates', async () => {
      const updates = Array.from({ length: 100 }, (_, i) => ({
        wordId: `w${i + 1}`,
        data: { state: 'LEARNING' as any },
      }));

      (prisma.word.findMany as any).mockResolvedValue(
        updates.map((u) => ({ id: u.wordId, wordBook: { type: 'SYSTEM', userId: null } })),
      );

      await wordStateService.batchUpdateWordStates('u1', updates);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle transaction failure', async () => {
      (prisma.$transaction as any).mockRejectedValue(new Error('Transaction failed'));

      await expect(
        wordStateService.batchUpdateWordStates('u1', [
          { wordId: 'w1', data: { state: 'LEARNING' as any } },
        ]),
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('deleteWordState - 边界条件和错误处理', () => {
    it('should handle delete of non-existent state', async () => {
      (prisma.wordLearningState.delete as any).mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      await expect(wordStateService.deleteWordState('u1', 'non-existent')).rejects.toThrow(
        'Record to delete does not exist',
      );
    });

    it('should handle empty userId', async () => {
      (prisma.wordLearningState.delete as any).mockResolvedValue({});

      await wordStateService.deleteWordState('', 'w1');

      expect(prisma.wordLearningState.delete).toHaveBeenCalled();
    });

    it('should clear correct caches after delete', async () => {
      (prisma.wordLearningState.delete as any).mockResolvedValue({});

      await wordStateService.deleteWordState('u1', 'w1');

      // 验证清除了单词级别缓存和用户级别缓存
      expect(cacheService.delete).toHaveBeenCalledWith('ls:u1:w1');
      expect(cacheService.delete).toHaveBeenCalledWith('ls:u1:all');
      expect(cacheService.delete).toHaveBeenCalledWith('due:u1');
      expect(cacheService.delete).toHaveBeenCalledWith('stats:u1');
    });
  });

  describe('getUserStats - 边界条件', () => {
    it('should return zeros for user with no words', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.count as any).mockResolvedValue(0);

      const result = await wordStateService.getUserStats('u1');

      expect(result).toEqual({
        totalWords: 0,
        newWords: 0,
        learningWords: 0,
        reviewingWords: 0,
        masteredWords: 0,
      });
    });

    it('should handle database error during stats calculation', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.count as any).mockRejectedValue(new Error('Database error'));

      await expect(wordStateService.getUserStats('u1')).rejects.toThrow('Database error');
    });

    it('should cache computed stats', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.count as any)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);

      await wordStateService.getUserStats('u1');

      expect(cacheService.set).toHaveBeenCalledWith(
        'stats:u1',
        { totalWords: 10, newWords: 2, learningWords: 3, reviewingWords: 3, masteredWords: 2 },
        expect.any(Number),
      );
    });
  });

  describe('边界值和特殊输入���试', () => {
    it('should handle special characters in userId', async () => {
      const specialUserId = 'user-123!@#$%^&*()';
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await wordStateService.getWordState(specialUserId, 'w1');

      expect(result).toBeNull();
    });

    it('should handle Unicode characters in wordId', async () => {
      const unicodeWordId = '单词-测试-🎓';
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await wordStateService.getWordState('u1', unicodeWordId);

      expect(result).toBeNull();
    });

    it('should handle null and undefined in data fields', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null },
      });
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        state: 'NEW',
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        state: 'NEW' as any,
        incorrectCount: null as any,
        correctCount: undefined,
      } as any);

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should handle extremely large counts', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null },
      });
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        correctCount: Number.MAX_SAFE_INTEGER,
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        correctCount: Number.MAX_SAFE_INTEGER,
      } as any);

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should handle negative counts gracefully', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null },
      });
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        correctCount: -1,
      });

      // 服务层不验证负数，由数据库约束处理
      await wordStateService.upsertWordState('u1', 'w1', {
        correctCount: -1,
      } as any);

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });
  });

  describe('并发和缓存一致性测试', () => {
    it('should handle concurrent getWordState calls', async () => {
      (cacheService.get as any).mockReturnValue(null);
      (prisma.wordLearningState.findUnique as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        state: 'LEARNING',
      });

      const promises = Array.from({ length: 10 }, () => wordStateService.getWordState('u1', 'w1'));

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result?.state).toBe('LEARNING');
      });
    });

    it('should invalidate all related caches on upsert', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null },
      });
      (prisma.wordLearningState.upsert as any).mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        state: 'LEARNING',
      });

      await wordStateService.upsertWordState('u1', 'w1', { state: 'LEARNING' as any });

      expect(cacheService.delete).toHaveBeenCalledWith('ls:u1:w1');
      expect(cacheService.delete).toHaveBeenCalledWith('ls:u1:all');
      expect(cacheService.delete).toHaveBeenCalledWith('due:u1');
      expect(cacheService.delete).toHaveBeenCalledWith('stats:u1');
    });

    it('should invalidate caches without wordId after batch update', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
      ]);
      (prisma.$transaction as any).mockResolvedValue([]);

      await wordStateService.batchUpdateWordStates('u1', [
        { wordId: 'w1', data: { state: 'LEARNING' as any } },
      ]);

      // batch update 只清除用户级别缓存，不清除单词级别缓存
      expect(cacheService.delete).toHaveBeenCalledWith('ls:u1:all');
      expect(cacheService.delete).toHaveBeenCalledWith('due:u1');
      expect(cacheService.delete).toHaveBeenCalledWith('stats:u1');
    });
  });
});
