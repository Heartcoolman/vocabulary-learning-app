/**
 * Mastery Learning Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    word: {
      findMany: vi.fn()
    },
    wordScore: {
      findMany: vi.fn()
    },
    wordFrequency: {
      findMany: vi.fn()
    },
    learningSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    $queryRaw: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../../../src/services/study-config.service', () => ({
  default: {
    getUserStudyConfig: vi.fn().mockResolvedValue({
      selectedWordBookIds: ['wb-1'],
      dailyMasteryTarget: 20,
      dailyWordCount: 20,
      studyMode: 'random'
    })
  }
}));

vi.mock('../../../src/services/amas.service', () => ({
  amasService: {
    getCurrentStrategy: vi.fn().mockResolvedValue({
      new_ratio: 0.3,
      difficulty: 'mid',
      interval_scale: 1.0
    }),
    getDefaultStrategy: vi.fn().mockReturnValue({
      new_ratio: 0.2,
      difficulty: 'mid',
      interval_scale: 1.0
    })
  }
}));

vi.mock('../../../src/services/difficulty-cache.service', () => ({
  default: {
    getCachedBatch: vi.fn().mockResolvedValue({}),
    setCached: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../../src/services/metrics.service', () => ({
  recordDifficultyComputationTime: vi.fn(),
  recordQueueAdjustmentDuration: vi.fn()
}));

vi.mock('../../../src/amas/modeling/forgetting-curve', () => ({
  calculateForgettingFactor: vi.fn().mockReturnValue(0.7)
}));

import prisma from '../../../src/config/database';
import { amasService } from '../../../src/services/amas.service';
import studyConfigService from '../../../src/services/study-config.service';

describe('MasteryLearningService', () => {
  let masteryLearningService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/mastery-learning.service');
    masteryLearningService = module.masteryLearningService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getWordsForMasteryMode', () => {
    beforeEach(() => {
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', spelling: 'apple', phonetic: '/æpl/', meanings: ['苹果'], examples: [], audioUrl: null },
        { id: 'w2', spelling: 'banana', phonetic: '/bəˈnænə/', meanings: ['香蕉'], examples: [], audioUrl: null }
      ]);
      (prisma.wordScore.findMany as any).mockResolvedValue([]);
      (prisma.wordFrequency.findMany as any).mockResolvedValue([]);
    });

    it('should return initial batch of words', async () => {
      const result = await masteryLearningService.getWordsForMasteryMode('user-1');

      expect(result.words).toBeDefined();
      expect(result.meta.mode).toBe('mastery');
      expect(result.meta.strategy).toBeDefined();
    });

    it('should respect target count', async () => {
      const result = await masteryLearningService.getWordsForMasteryMode('user-1', 30);

      expect(result.meta.targetCount).toBe(30);
    });

    it('should use AMAS strategy for word selection', async () => {
      await masteryLearningService.getWordsForMasteryMode('user-1');

      expect(amasService.getCurrentStrategy).toHaveBeenCalledWith('user-1');
    });

    it('should fallback to default strategy', async () => {
      (amasService.getCurrentStrategy as any).mockResolvedValue(null);

      const result = await masteryLearningService.getWordsForMasteryMode('user-1');

      expect(result.meta.strategy).toBeDefined();
      expect(amasService.getDefaultStrategy).toHaveBeenCalled();
    });
  });

  describe('getNextWords', () => {
    beforeEach(() => {
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w3', spelling: 'cat', phonetic: '/kæt/', meanings: ['猫'], examples: [], audioUrl: null }
      ]);
      (prisma.wordScore.findMany as any).mockResolvedValue([]);
      (prisma.wordFrequency.findMany as any).mockResolvedValue([]);
    });

    it('should fetch next batch of words', async () => {
      const result = await masteryLearningService.getNextWords('user-1', {
        currentWordIds: ['w1', 'w2'],
        masteredWordIds: ['w0'],
        sessionId: 'session-1'
      });

      expect(result.words).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should exclude current and mastered words', async () => {
      await masteryLearningService.getNextWords('user-1', {
        currentWordIds: ['w1'],
        masteredWordIds: ['w2'],
        sessionId: 'session-1',
        count: 5
      });

      expect(prisma.word.findMany).toHaveBeenCalled();
    });
  });

  describe('ensureLearningSession', () => {
    it('should create new session', async () => {
      (prisma.learningSession.findUnique as any).mockResolvedValue(null);
      (prisma.learningSession.create as any).mockResolvedValue({
        id: 'session-new',
        userId: 'user-1',
        targetMasteryCount: 20
      });

      const sessionId = await masteryLearningService.ensureLearningSession('user-1', 20);

      expect(sessionId).toBe('session-new');
      expect(prisma.learningSession.create).toHaveBeenCalled();
    });

    it('should return existing session if matches user', async () => {
      (prisma.learningSession.findUnique as any).mockResolvedValue({
        id: 'session-existing',
        userId: 'user-1'
      });
      (prisma.learningSession.update as any).mockResolvedValue({});

      const sessionId = await masteryLearningService.ensureLearningSession('user-1', 20, 'session-existing');

      expect(sessionId).toBe('session-existing');
    });

    it('should throw for session belonging to another user', async () => {
      (prisma.learningSession.findUnique as any).mockResolvedValue({
        id: 'session-other',
        userId: 'other-user'
      });

      await expect(
        masteryLearningService.ensureLearningSession('user-1', 20, 'session-other')
      ).rejects.toThrow('belongs to another user');
    });

    it('should reject invalid target count', async () => {
      await expect(
        masteryLearningService.ensureLearningSession('user-1', 0)
      ).rejects.toThrow('Invalid targetMasteryCount');

      await expect(
        masteryLearningService.ensureLearningSession('user-1', 101)
      ).rejects.toThrow('Invalid targetMasteryCount');
    });
  });

  describe('getSessionProgress', () => {
    it('should return session progress', async () => {
      (prisma.learningSession.findFirst as any).mockResolvedValue({
        targetMasteryCount: 20,
        actualMasteryCount: 10,
        totalQuestions: 25,
        startedAt: new Date(),
        endedAt: null
      });

      const progress = await masteryLearningService.getSessionProgress('session-1', 'user-1');

      expect(progress.targetMasteryCount).toBe(20);
      expect(progress.actualMasteryCount).toBe(10);
      expect(progress.isCompleted).toBe(false);
    });

    it('should throw for non-existent session', async () => {
      (prisma.learningSession.findFirst as any).mockResolvedValue(null);

      await expect(
        masteryLearningService.getSessionProgress('session-404', 'user-1')
      ).rejects.toThrow('Session not found');
    });
  });

  describe('syncSessionProgress', () => {
    it('should update session progress', async () => {
      (prisma.learningSession.updateMany as any).mockResolvedValue({ count: 1 });

      await masteryLearningService.syncSessionProgress('session-1', 'user-1', {
        actualMasteryCount: 15,
        totalQuestions: 30
      });

      expect(prisma.learningSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1', userId: 'user-1' }
        })
      );
    });
  });

  describe('adjustWordsForUser', () => {
    beforeEach(() => {
      (prisma.word.findMany as any).mockResolvedValue([]);
      (prisma.wordScore.findMany as any).mockResolvedValue([]);
      (prisma.wordFrequency.findMany as any).mockResolvedValue([]);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);
      (studyConfigService.getUserStudyConfig as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1'],
        studyMode: 'random'
      });
    });

    it('should adjust words for fatigue', async () => {
      const result = await masteryLearningService.adjustWordsForUser({
        userId: 'user-1',
        sessionId: 'session-1',
        currentWordIds: ['w1', 'w2'],
        masteredWordIds: [],
        userState: { fatigue: 0.8, attention: 0.5, motivation: 0.4 },
        recentPerformance: { accuracy: 0.6, avgResponseTime: 3000, consecutiveWrong: 1 },
        adjustReason: 'fatigue'
      });

      expect(result.adjustments).toBeDefined();
      expect(result.targetDifficulty.max).toBeLessThanOrEqual(0.4);
      expect(result.reason).toContain('疲劳');
    });

    it('should adjust words for struggling', async () => {
      const result = await masteryLearningService.adjustWordsForUser({
        userId: 'user-1',
        sessionId: 'session-1',
        currentWordIds: ['w1'],
        masteredWordIds: [],
        userState: { fatigue: 0.2, attention: 0.7, motivation: 0.5 },
        recentPerformance: { accuracy: 0.3, avgResponseTime: 5000, consecutiveWrong: 3 },
        adjustReason: 'struggling'
      });

      expect(result.targetDifficulty.max).toBeLessThanOrEqual(0.3);
      expect(result.reason).toContain('错误');
    });

    it('should adjust words for excelling', async () => {
      const result = await masteryLearningService.adjustWordsForUser({
        userId: 'user-1',
        sessionId: 'session-1',
        currentWordIds: ['w1'],
        masteredWordIds: ['w0'],
        userState: { fatigue: 0.1, attention: 0.9, motivation: 0.8 },
        recentPerformance: { accuracy: 0.95, avgResponseTime: 1500, consecutiveWrong: 0 },
        adjustReason: 'excelling'
      });

      expect(result.targetDifficulty.min).toBeGreaterThanOrEqual(0.4);
      expect(result.reason).toContain('优秀');
    });

    it('should calculate next check-in interval', async () => {
      const result = await masteryLearningService.adjustWordsForUser({
        userId: 'user-1',
        sessionId: 'session-1',
        currentWordIds: [],
        masteredWordIds: [],
        recentPerformance: { accuracy: 0.3, avgResponseTime: 3000, consecutiveWrong: 2 },
        adjustReason: 'periodic'
      });

      expect(result.nextCheckIn).toBe(1);
    });
  });

  describe('batchComputeDifficulty', () => {
    beforeEach(() => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', spelling: 'test' }
      ]);
      (prisma.wordScore.findMany as any).mockResolvedValue([]);
      (prisma.wordFrequency.findMany as any).mockResolvedValue([]);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);
    });

    it('should compute difficulty for words', async () => {
      const result = await masteryLearningService.batchComputeDifficulty('user-1', ['w1']);

      expect(result['w1']).toBeDefined();
      expect(result['w1']).toBeGreaterThanOrEqual(0);
      expect(result['w1']).toBeLessThanOrEqual(1);
    });

    it('should return empty for empty input', async () => {
      const result = await masteryLearningService.batchComputeDifficulty('user-1', []);

      expect(result).toEqual({});
    });

    it('should use cached values when available', async () => {
      const { default: difficultyCacheService } = await import('../../../src/services/difficulty-cache.service');
      (difficultyCacheService.getCachedBatch as any).mockResolvedValue({
        'w1': 0.5
      });

      const result = await masteryLearningService.batchComputeDifficulty('user-1', ['w1']);

      expect(result['w1']).toBe(0.5);
      expect(prisma.word.findMany).not.toHaveBeenCalled();
    });
  });
});
