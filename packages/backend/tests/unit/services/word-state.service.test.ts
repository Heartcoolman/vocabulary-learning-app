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
      count: vi.fn().mockResolvedValue(0)
    },
    word: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([])
    },
    $transaction: vi.fn()
  }
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn()
  },
  CacheKeys: {
    USER_LEARNING_STATE: (userId: string, wordId: string) => `ls:${userId}:${wordId}`,
    USER_LEARNING_STATES: (userId: string) => `ls:${userId}:all`,
    USER_DUE_WORDS: (userId: string) => `due:${userId}`,
    USER_STATS: (userId: string) => `stats:${userId}`
  },
  CacheTTL: {
    LEARNING_STATE: 3600,
    USER_STATS: 300,
    NULL_CACHE: 60
  }
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
      expect(cacheService.set).toHaveBeenCalledWith(
        'ls:u1:w1',
        '__NULL__',
        60
      );
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
        { userId: 'u1', wordId: 'w2', state: 'NEW' }
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
        { userId: 'u1', wordId: 'w2', state: 'MASTERED' }
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
        { userId: 'u1', wordId: 'w1', state: 'LEARNING', nextReviewDate: new Date() }
      ];
      (prisma.wordLearningState.findMany as any).mockResolvedValue(dueWords);

      const result = await wordStateService.getDueWords('u1');

      expect(result).toEqual(dueWords);
      // 验证调用了findMany，包含userId和OR条件
      expect(prisma.wordLearningState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            OR: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getWordsByState', () => {
    it('should filter words by state', async () => {
      const masteredWords = [
        { userId: 'u1', wordId: 'w1', state: 'MASTERED' }
      ];
      (prisma.wordLearningState.findMany as any).mockResolvedValue(masteredWords);

      const result = await wordStateService.getWordsByState('u1', 'MASTERED');

      expect(result).toEqual(masteredWords);
      expect(prisma.wordLearningState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', state: 'MASTERED' }
        })
      );
    });
  });

  describe('upsertWordState', () => {
    beforeEach(() => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'SYSTEM', userId: null }
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
        lastReviewDate: new Date(now)
      });

      await wordStateService.upsertWordState('u1', 'w1', {
        lastReviewDate: now
      });

      expect(prisma.wordLearningState.upsert).toHaveBeenCalled();
    });

    it('should reject future timestamps', async () => {
      const futureTime = Date.now() + 2 * 60 * 60 * 1000;

      await expect(
        wordStateService.upsertWordState('u1', 'w1', {
          lastReviewDate: futureTime
        })
      ).rejects.toThrow('时间戳不能超过当前时间1小时');
    });

    it('should reject timestamps too far in past', async () => {
      const oldTime = Date.now() - 400 * 24 * 60 * 60 * 1000;

      await expect(
        wordStateService.upsertWordState('u1', 'w1', {
          lastReviewDate: oldTime
        })
      ).rejects.toThrow('时间戳不能早于1年前');
    });

    it('should throw for inaccessible word', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        wordBook: { type: 'USER', userId: 'other-user' }
      });

      await expect(
        wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' })
      ).rejects.toThrow('无权访问该单词');
    });

    it('should throw for non-existent word', async () => {
      (prisma.word.findUnique as any).mockResolvedValue(null);

      await expect(
        wordStateService.upsertWordState('u1', 'w1', { state: 'NEW' })
      ).rejects.toThrow('单词不存在');
    });
  });

  describe('batchUpdateWordStates', () => {
    beforeEach(() => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } },
        { id: 'w2', wordBook: { type: 'SYSTEM', userId: null } }
      ]);
      (prisma.$transaction as any).mockResolvedValue([]);
    });

    it('should batch update multiple states', async () => {
      await wordStateService.batchUpdateWordStates('u1', [
        { wordId: 'w1', data: { state: 'LEARNING' } },
        { wordId: 'w2', data: { state: 'REVIEWING' } }
      ]);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw for inaccessible words', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', wordBook: { type: 'SYSTEM', userId: null } }
      ]);

      await expect(
        wordStateService.batchUpdateWordStates('u1', [
          { wordId: 'w1', data: { state: 'LEARNING' } },
          { wordId: 'w2', data: { state: 'LEARNING' } }
        ])
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
        masteredWords: 25
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
});
