/**
 * Mastery Learning Service Tests
 * 掌握度学习服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    learningSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    word: {
      findMany: vi.fn()
    },
    wordScore: {
      findMany: vi.fn()
    },
    wordLearningState: {
      findMany: vi.fn()
    },
    word_frequency: {
      findMany: vi.fn()
    },
    userStudyConfig: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    answerRecord: {
      groupBy: vi.fn(),
      findMany: vi.fn()
    },
    $queryRaw: vi.fn()
  }
}));

// Mock study-config.service
vi.mock('../../../src/services/study-config.service', () => ({
  default: {
    getUserStudyConfig: vi.fn(),
    getTodayWords: vi.fn()
  }
}));

import { masteryLearningService, AdjustWordsRequest } from '../../../src/services/mastery-learning.service';

describe('MasteryLearningService', () => {
  let mockPrisma: any;
  let mockStudyConfigService: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    const studyConfigModule = await import('../../../src/services/study-config.service');
    mockStudyConfigService = studyConfigModule.default;
    vi.clearAllMocks();
  });

  describe('getWordsForMasteryMode', () => {
    it('应该返回目标数量2倍的单词', async () => {
      const userId = 'user-123';
      const targetCount = 10;

      mockStudyConfigService.getUserStudyConfig.mockResolvedValue({
        dailyMasteryTarget: targetCount,
        dailyWordCount: 20,
        selectedWordBookIds: ['book-1']
      });

      mockStudyConfigService.getTodayWords.mockResolvedValue({
        words: Array(25).fill(null).map((_, i) => ({
          id: `word-${i}`,
          spelling: `word${i}`,
          phonetic: `/word${i}/`,
          meanings: [`meaning${i}`],
          examples: [`example${i}`]
        }))
      });

      const result = await masteryLearningService.getWordsForMasteryMode(userId, targetCount);

      expect(result.words.length).toBeLessThanOrEqual(targetCount * 2);
      expect(result.meta.mode).toBe('mastery');
      expect(result.meta.targetCount).toBe(targetCount);
    });

    it('应该使用默认配置当未指定targetCount', async () => {
      const userId = 'user-123';

      mockStudyConfigService.getUserStudyConfig.mockResolvedValue({
        dailyMasteryTarget: 15,
        dailyWordCount: 20,
        selectedWordBookIds: ['book-1']
      });

      mockStudyConfigService.getTodayWords.mockResolvedValue({
        words: Array(30).fill(null).map((_, i) => ({
          id: `word-${i}`,
          spelling: `word${i}`,
          phonetic: `/word${i}/`,
          meanings: [`meaning${i}`],
          examples: [`example${i}`]
        }))
      });

      const result = await masteryLearningService.getWordsForMasteryMode(userId);

      expect(result.meta.targetCount).toBe(15);
    });

    it('应该补充新词当当前单词不足', async () => {
      const userId = 'user-123';
      const targetCount = 10;

      mockStudyConfigService.getUserStudyConfig.mockResolvedValue({
        dailyMasteryTarget: targetCount,
        selectedWordBookIds: ['book-1'],
        studyMode: 'sequential'
      });

      mockStudyConfigService.getTodayWords.mockResolvedValue({
        words: Array(5).fill(null).map((_, i) => ({
          id: `word-${i}`,
          spelling: `word${i}`,
          phonetic: `/word${i}/`,
          meanings: [`meaning${i}`],
          examples: [`example${i}`]
        }))
      });

      // Mock 补充单词查询
      mockPrisma.word.findMany.mockResolvedValue(
        Array(15).fill(null).map((_, i) => ({
          id: `new-word-${i}`,
          spelling: `newword${i}`,
          phonetic: `/newword${i}/`,
          meanings: [`newmeaning${i}`],
          examples: [`newexample${i}`]
        }))
      );

      const result = await masteryLearningService.getWordsForMasteryMode(userId, targetCount);

      expect(result.words.length).toBeGreaterThan(5);
    });
  });

  describe('ensureLearningSession', () => {
    it('应该创建新会话当sessionId不存在', async () => {
      const userId = 'user-123';
      const targetCount = 10;

      mockPrisma.learningSession.create.mockResolvedValue({
        id: 'new-session-id',
        userId,
        targetMasteryCount: targetCount
      });

      const sessionId = await masteryLearningService.ensureLearningSession(userId, targetCount);

      expect(sessionId).toBe('new-session-id');
      expect(mockPrisma.learningSession.create).toHaveBeenCalled();
    });

    it('应该返回已有会话ID当会话存在且属于当前用户', async () => {
      const userId = 'user-123';
      const existingSessionId = 'existing-session';
      const targetCount = 10;

      mockPrisma.learningSession.findUnique.mockResolvedValue({
        id: existingSessionId,
        userId
      });

      mockPrisma.learningSession.update.mockResolvedValue({
        id: existingSessionId,
        userId,
        targetMasteryCount: targetCount
      });

      const sessionId = await masteryLearningService.ensureLearningSession(
        userId,
        targetCount,
        existingSessionId
      );

      expect(sessionId).toBe(existingSessionId);
    });

    it('应该抛出错误当会话属于其他用户', async () => {
      const userId = 'user-123';
      const existingSessionId = 'existing-session';

      mockPrisma.learningSession.findUnique.mockResolvedValue({
        id: existingSessionId,
        userId: 'other-user'
      });

      await expect(
        masteryLearningService.ensureLearningSession(userId, 10, existingSessionId)
      ).rejects.toThrow('belongs to another user');
    });

    it('应该拒绝无效的targetMasteryCount', async () => {
      const userId = 'user-123';

      await expect(
        masteryLearningService.ensureLearningSession(userId, 0)
      ).rejects.toThrow('Invalid targetMasteryCount');

      await expect(
        masteryLearningService.ensureLearningSession(userId, 101)
      ).rejects.toThrow('Invalid targetMasteryCount');
    });
  });

  describe('syncSessionProgress', () => {
    it('应该更新会话进度', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';
      const progress = {
        actualMasteryCount: 5,
        totalQuestions: 15
      };

      mockPrisma.learningSession.updateMany.mockResolvedValue({ count: 1 });

      await masteryLearningService.syncSessionProgress(sessionId, userId, progress);

      expect(mockPrisma.learningSession.updateMany).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: {
          actualMasteryCount: progress.actualMasteryCount,
          totalQuestions: progress.totalQuestions
        }
      });
    });
  });

  describe('getSessionProgress', () => {
    it('应该返回会话进度', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';

      mockPrisma.learningSession.findFirst.mockResolvedValue({
        targetMasteryCount: 10,
        actualMasteryCount: 5,
        totalQuestions: 15,
        startedAt: new Date(),
        endedAt: null
      });

      const progress = await masteryLearningService.getSessionProgress(sessionId, userId);

      expect(progress.targetMasteryCount).toBe(10);
      expect(progress.actualMasteryCount).toBe(5);
      expect(progress.isCompleted).toBe(false);
    });

    it('应该正确判断会话完成状态', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';

      mockPrisma.learningSession.findFirst.mockResolvedValue({
        targetMasteryCount: 10,
        actualMasteryCount: 10,
        totalQuestions: 20,
        startedAt: new Date(),
        endedAt: new Date()
      });

      const progress = await masteryLearningService.getSessionProgress(sessionId, userId);

      expect(progress.isCompleted).toBe(true);
    });

    it('应该抛出错误当会话不存在', async () => {
      mockPrisma.learningSession.findFirst.mockResolvedValue(null);

      await expect(
        masteryLearningService.getSessionProgress('non-existent', 'user-123')
      ).rejects.toThrow('Session not found');
    });
  });

  describe('adjustWordsForUser', () => {
    const mockRequest: AdjustWordsRequest = {
      userId: 'user-123',
      sessionId: 'session-123',
      currentWordIds: ['word-1', 'word-2', 'word-3'],
      masteredWordIds: ['word-1'],
      userState: { fatigue: 0.3, attention: 0.8, motivation: 0.7 },
      recentPerformance: { accuracy: 0.75, avgResponseTime: 2000, consecutiveWrong: 0 },
      adjustReason: 'periodic'
    };

    beforeEach(() => {
      mockStudyConfigService.getUserStudyConfig.mockResolvedValue({
        selectedWordBookIds: ['book-1'],
        studyMode: 'sequential'
      });
    });

    it('应该移除已掌握的单词', async () => {
      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', spelling: 'apple' },
        { id: 'word-2', spelling: 'banana' },
        { id: 'word-3', spelling: 'cherry' }
      ]);

      mockPrisma.wordScore.findMany.mockResolvedValue([
        { wordId: 'word-1', totalAttempts: 5, correctAttempts: 5 },
        { wordId: 'word-2', totalAttempts: 5, correctAttempts: 3 },
        { wordId: 'word-3', totalAttempts: 5, correctAttempts: 4 }
      ]);

      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);
      mockPrisma.word_frequency.findMany.mockResolvedValue([]);

      // Mock 候选词查询
      mockPrisma.word.findMany
        .mockResolvedValueOnce([
          { id: 'word-1', spelling: 'apple' },
          { id: 'word-2', spelling: 'banana' },
          { id: 'word-3', spelling: 'cherry' }
        ])
        .mockResolvedValueOnce([
          { id: 'new-word-1', spelling: 'date', phonetic: '/deɪt/', meanings: ['日期'], examples: ['Today is a good date.'], audioUrl: null }
        ]);

      const result = await masteryLearningService.adjustWordsForUser(mockRequest);

      expect(result.adjustments.remove).toContain('word-1');
    });

    it('应该在疲劳度高时降低难度范围', async () => {
      const fatigueRequest = {
        ...mockRequest,
        userState: { fatigue: 0.8, attention: 0.5, motivation: 0.4 },
        adjustReason: 'fatigue' as const
      };

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', spelling: 'apple' },
        { id: 'word-2', spelling: 'banana' },
        { id: 'word-3', spelling: 'cherry' }
      ]);
      mockPrisma.wordScore.findMany.mockResolvedValue([]);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);
      mockPrisma.word_frequency.findMany.mockResolvedValue([]);

      const result = await masteryLearningService.adjustWordsForUser(fatigueRequest);

      expect(result.targetDifficulty.max).toBeLessThanOrEqual(0.4);
      expect(result.reason).toContain('疲劳');
    });

    it('应该在连续错误时降低难度', async () => {
      const strugglingRequest = {
        ...mockRequest,
        recentPerformance: { accuracy: 0.4, avgResponseTime: 3000, consecutiveWrong: 3 },
        adjustReason: 'struggling' as const
      };

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', spelling: 'apple' },
        { id: 'word-2', spelling: 'banana' },
        { id: 'word-3', spelling: 'cherry' }
      ]);
      mockPrisma.wordScore.findMany.mockResolvedValue([]);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);
      mockPrisma.word_frequency.findMany.mockResolvedValue([]);

      const result = await masteryLearningService.adjustWordsForUser(strugglingRequest);

      expect(result.targetDifficulty.max).toBeLessThanOrEqual(0.3);
    });

    it('应该在表现优秀时提高难度', async () => {
      const excellingRequest = {
        ...mockRequest,
        recentPerformance: { accuracy: 0.95, avgResponseTime: 1000, consecutiveWrong: 0 },
        userState: { fatigue: 0.1, attention: 0.9, motivation: 0.8 },
        adjustReason: 'excelling' as const
      };

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', spelling: 'apple' },
        { id: 'word-2', spelling: 'banana' },
        { id: 'word-3', spelling: 'cherry' }
      ]);
      mockPrisma.wordScore.findMany.mockResolvedValue([]);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);
      mockPrisma.word_frequency.findMany.mockResolvedValue([]);

      const result = await masteryLearningService.adjustWordsForUser(excellingRequest);

      expect(result.targetDifficulty.min).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe('batchComputeDifficulty', () => {
    it('应该正确计算单词难度', async () => {
      const userId = 'user-123';
      const wordIds = ['word-1', 'word-2'];

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-1', spelling: 'cat' },        // 短单词
        { id: 'word-2', spelling: 'extraordinary' } // 长单词
      ]);

      mockPrisma.wordScore.findMany.mockResolvedValue([
        { wordId: 'word-1', totalAttempts: 10, correctAttempts: 9 }, // 高正确率
        { wordId: 'word-2', totalAttempts: 10, correctAttempts: 3 }  // 低正确率
      ]);

      mockPrisma.word_frequency.findMany.mockResolvedValue([]);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);

      const result = await masteryLearningService.batchComputeDifficulty(userId, wordIds);

      // cat: 短单词 + 高正确率 = 低难度
      expect(result['word-1']).toBeLessThan(0.3);
      // extraordinary: 长单词 + 低正确率 = 高难度
      expect(result['word-2']).toBeGreaterThan(0.5);
    });

    it('应该为新词返回默认难度', async () => {
      const userId = 'user-123';
      const wordIds = ['new-word'];

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'new-word', spelling: 'medium' }
      ]);

      mockPrisma.wordScore.findMany.mockResolvedValue([]);
      mockPrisma.word_frequency.findMany.mockResolvedValue([]);
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);

      const result = await masteryLearningService.batchComputeDifficulty(userId, wordIds);

      // 新词默认准确率0.5
      expect(result['new-word']).toBeGreaterThan(0.3);
      expect(result['new-word']).toBeLessThan(0.7);
    });

    it('应该返回空对象当wordIds为空', async () => {
      const result = await masteryLearningService.batchComputeDifficulty('user-123', []);
      expect(result).toEqual({});
    });
  });
});
