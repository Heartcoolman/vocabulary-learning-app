/**
 * Word Score Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WordBookType } from '@prisma/client';

vi.mock('../../../src/config/database', () => ({
  default: {
    wordScore: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn()
    },
    word: {
      findUnique: vi.fn()
    },
    learningRecord: {
      findMany: vi.fn()
    },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns))
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
    WORD_SCORE: (userId: string, wordId: string) => `word_score:${userId}:${wordId}`,
    WORD_SCORES: (userId: string) => `word_scores:${userId}`
  },
  CacheTTL: {
    WORD_SCORE: 1800
  }
}));

describe('WordScoreService', () => {
  let service: any;
  let prisma: any;
  let cacheService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = (await import('../../../src/config/database')).default;
    cacheService = (await import('../../../src/services/cache.service')).cacheService;

    const module = await import('../../../src/services/word-score.service');
    service = module.wordScoreService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('calculateScore', () => {
    it('should return 0 for word with no records', async () => {
      prisma.learningRecord.findMany.mockResolvedValue([]);

      const result = await service.calculateScore('user-1', 'word-1');

      expect(result).toEqual({ userId: 'user-1', wordId: 'word-1', score: 0 });
    });

    it('should calculate score based on accuracy and time', async () => {
      prisma.learningRecord.findMany.mockResolvedValue([
        { isCorrect: true, responseTime: 1000 },
        { isCorrect: true, responseTime: 2000 },
        { isCorrect: false, responseTime: 3000 }
      ]);

      const result = await service.calculateScore('user-1', 'word-1');

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('getWordScore', () => {
    it('should return cached score if available', async () => {
      const cachedScore = { userId: 'user-1', wordId: 'word-1', totalScore: 80 };
      cacheService.get.mockReturnValue(cachedScore);

      const result = await service.getWordScore('user-1', 'word-1');

      expect(result).toEqual(cachedScore);
      expect(prisma.wordScore.findUnique).not.toHaveBeenCalled();
    });

    it('should query database if not cached', async () => {
      cacheService.get.mockReturnValue(null);
      const dbScore = { userId: 'user-1', wordId: 'word-1', totalScore: 75 };
      prisma.wordScore.findUnique.mockResolvedValue(dbScore);

      const result = await service.getWordScore('user-1', 'word-1');

      expect(result).toEqual(dbScore);
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('getWordScores', () => {
    it('should return empty array for empty wordIds', async () => {
      const result = await service.getWordScores('user-1', []);

      expect(result).toEqual([]);
    });

    it('should return scores for multiple words', async () => {
      const scores = [
        { userId: 'user-1', wordId: 'w1', score: 80 },
        { userId: 'user-1', wordId: 'w2', score: 60 }
      ];
      prisma.wordScore.findMany.mockResolvedValue(scores);

      const result = await service.getWordScores('user-1', ['w1', 'w2']);

      expect(result).toEqual(scores);
    });
  });

  describe('batchGetWordScores', () => {
    it('should return cached scores and query uncached', async () => {
      const cachedScore = { userId: 'user-1', wordId: 'w1', totalScore: 80 };
      cacheService.get
        .mockReturnValueOnce(cachedScore)
        .mockReturnValueOnce(null);

      prisma.wordScore.findMany.mockResolvedValue([
        { userId: 'user-1', wordId: 'w2', totalScore: 60 }
      ]);

      const result = await service.batchGetWordScores('user-1', ['w1', 'w2']);

      expect(result.get('w1')).toEqual(cachedScore);
      expect(result.get('w2')?.totalScore).toBe(60);
    });
  });

  describe('getUserWordScores', () => {
    it('should return cached scores if available', async () => {
      const cachedScores = [{ wordId: 'w1', totalScore: 80 }];
      cacheService.get.mockReturnValue(cachedScores);

      const result = await service.getUserWordScores('user-1');

      expect(result).toEqual(cachedScores);
    });

    it('should query database if not cached', async () => {
      cacheService.get.mockReturnValue(null);
      const dbScores = [
        { wordId: 'w1', totalScore: 90 },
        { wordId: 'w2', totalScore: 70 }
      ];
      prisma.wordScore.findMany.mockResolvedValue(dbScores);

      const result = await service.getUserWordScores('user-1');

      expect(result).toEqual(dbScores);
    });
  });

  describe('getLowScoreWords', () => {
    it('should return words below threshold', async () => {
      const lowScores = [{ wordId: 'w1', totalScore: 30 }];
      prisma.wordScore.findMany.mockResolvedValue(lowScores);

      const result = await service.getLowScoreWords('user-1', 40);

      expect(result).toEqual(lowScores);
      expect(prisma.wordScore.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', totalScore: { lt: 40 } },
        orderBy: { totalScore: 'asc' }
      });
    });
  });

  describe('getHighScoreWords', () => {
    it('should return words above threshold', async () => {
      const highScores = [{ wordId: 'w1', totalScore: 90 }];
      prisma.wordScore.findMany.mockResolvedValue(highScores);

      const result = await service.getHighScoreWords('user-1', 80);

      expect(result).toEqual(highScores);
    });
  });

  describe('upsertWordScore', () => {
    it('should upsert score and invalidate cache', async () => {
      prisma.word.findUnique.mockResolvedValue({
        wordBook: { type: WordBookType.SYSTEM, userId: null }
      });
      const upsertedScore = { userId: 'user-1', wordId: 'word-1', totalScore: 85 };
      prisma.wordScore.upsert.mockResolvedValue(upsertedScore);

      const result = await service.upsertWordScore('user-1', 'word-1', { totalScore: 85 });

      expect(result).toEqual(upsertedScore);
      expect(cacheService.delete).toHaveBeenCalled();
    });

    it('should throw error for non-existent word', async () => {
      prisma.word.findUnique.mockResolvedValue(null);

      await expect(service.upsertWordScore('user-1', 'word-1', {}))
        .rejects.toThrow('单词不存在');
    });

    it('should throw error for unauthorized access', async () => {
      prisma.word.findUnique.mockResolvedValue({
        wordBook: { type: WordBookType.USER, userId: 'other-user' }
      });

      await expect(service.upsertWordScore('user-1', 'word-1', {}))
        .rejects.toThrow('无权访问该单词');
    });
  });

  describe('deleteWordScore', () => {
    it('should delete score and invalidate cache', async () => {
      prisma.wordScore.delete.mockResolvedValue({});

      await service.deleteWordScore('user-1', 'word-1');

      expect(prisma.wordScore.delete).toHaveBeenCalled();
      expect(cacheService.delete).toHaveBeenCalled();
    });
  });

  describe('getUserScoreStats', () => {
    it('should return default stats for empty scores', async () => {
      cacheService.get.mockReturnValue([]);

      const result = await service.getUserScoreStats('user-1');

      expect(result).toEqual({
        averageScore: 0,
        highScoreCount: 0,
        mediumScoreCount: 0,
        lowScoreCount: 0
      });
    });

    it('should calculate stats correctly', async () => {
      cacheService.get.mockReturnValue([
        { totalScore: 90 },
        { totalScore: 60 },
        { totalScore: 30 }
      ]);

      const result = await service.getUserScoreStats('user-1');

      expect(result.averageScore).toBe(60);
      expect(result.highScoreCount).toBe(1);
      expect(result.mediumScoreCount).toBe(1);
      expect(result.lowScoreCount).toBe(1);
    });
  });

  describe('clearAllCache', () => {
    it('should clear all word score cache', () => {
      service.clearAllCache();

      expect(cacheService.deletePattern).toHaveBeenCalledWith('word_score*');
    });
  });
});
