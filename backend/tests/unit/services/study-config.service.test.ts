/**
 * Study Config Service Tests
 * 学习配置服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    userStudyConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    word: {
      findMany: vi.fn()
    },
    wordLearningState: {
      findMany: vi.fn()
    },
    wordScore: {
      findMany: vi.fn()
    },
    answerRecord: {
      groupBy: vi.fn(),
      findMany: vi.fn()
    },
    $queryRaw: vi.fn()
  }
}));

import StudyConfigService from '../../../src/services/study-config.service';

describe('StudyConfigService', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
  });

  describe('getUserStudyConfig', () => {
    it('应该返回用户配置', async () => {
      const userId = 'user-123';
      const config = {
        userId,
        selectedWordBookIds: ['book-1', 'book-2'],
        dailyWordCount: 30,
        studyMode: 'random'
      };

      mockPrisma.userStudyConfig.findUnique.mockResolvedValue(config);

      const result = await StudyConfigService.getUserStudyConfig(userId);

      expect(result).toEqual(config);
    });

    it('应该为新用户创建默认配置', async () => {
      const userId = 'new-user';
      const defaultConfig = {
        userId,
        selectedWordBookIds: [],
        dailyWordCount: 20,
        studyMode: 'sequential'
      };

      mockPrisma.userStudyConfig.findUnique.mockResolvedValue(null);
      mockPrisma.userStudyConfig.create.mockResolvedValue(defaultConfig);

      const result = await StudyConfigService.getUserStudyConfig(userId);

      expect(result.dailyWordCount).toBe(20);
      expect(result.studyMode).toBe('sequential');
    });
  });

  describe('updateStudyConfig', () => {
    it('应该更新学习配置', async () => {
      const userId = 'user-123';
      const data = {
        selectedWordBookIds: ['book-1'],
        dailyWordCount: 25,
        studyMode: 'random' as const
      };

      mockPrisma.wordBook.findMany.mockResolvedValue([
        { id: 'book-1', type: 'SYSTEM' }
      ]);

      mockPrisma.userStudyConfig.upsert.mockResolvedValue({
        userId,
        ...data
      });

      const result = await StudyConfigService.updateStudyConfig(userId, data);

      expect(result.dailyWordCount).toBe(25);
      expect(result.studyMode).toBe('random');
    });

    it('应该拒绝无权访问的词书', async () => {
      const userId = 'user-123';
      const data = {
        selectedWordBookIds: ['book-1', 'book-2'],
        dailyWordCount: 20
      };

      // 只有 book-1 可访问
      mockPrisma.wordBook.findMany.mockResolvedValue([
        { id: 'book-1', type: 'SYSTEM' }
      ]);

      await expect(
        StudyConfigService.updateStudyConfig(userId, data)
      ).rejects.toThrow('无权访问以下词书');
    });

    it('应该允许空词书列表', async () => {
      const userId = 'user-123';
      const data = {
        selectedWordBookIds: [],
        dailyWordCount: 15
      };

      mockPrisma.userStudyConfig.upsert.mockResolvedValue({
        userId,
        ...data
      });

      const result = await StudyConfigService.updateStudyConfig(userId, data);

      expect(result.selectedWordBookIds).toEqual([]);
    });

    it('应该允许访问用户自己的词书', async () => {
      const userId = 'user-123';
      const data = {
        selectedWordBookIds: ['user-book-1'],
        dailyWordCount: 20
      };

      mockPrisma.wordBook.findMany.mockResolvedValue([
        { id: 'user-book-1', type: 'USER', userId }
      ]);

      mockPrisma.userStudyConfig.upsert.mockResolvedValue({
        userId,
        ...data
      });

      const result = await StudyConfigService.updateStudyConfig(userId, data);

      expect(result.selectedWordBookIds).toContain('user-book-1');
    });
  });

  describe('getTodayWords', () => {
    beforeEach(() => {
      mockPrisma.userStudyConfig.findUnique.mockResolvedValue({
        userId: 'user-123',
        selectedWordBookIds: ['book-1'],
        dailyWordCount: 10,
        studyMode: 'sequential'
      });

      mockPrisma.wordBook.findMany.mockResolvedValue([
        { id: 'book-1', type: 'SYSTEM' }
      ]);
    });

    it('应该返回今日学习单词', async () => {
      const userId = 'user-123';

      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-1', state: 'LEARNING', nextReviewDate: new Date(Date.now() - 1000), word: { id: 'word-1', spelling: 'apple' } }
      ]);

      mockPrisma.wordScore.findMany.mockResolvedValue([]);

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-2', spelling: 'banana' },
        { id: 'word-3', spelling: 'cherry' }
      ]);

      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const result = await StudyConfigService.getTodayWords(userId);

      expect(result.words).toBeDefined();
      expect(result.progress).toBeDefined();
    });

    it('应该返回空列表当没有选择词书', async () => {
      mockPrisma.userStudyConfig.findUnique.mockResolvedValue({
        userId: 'user-123',
        selectedWordBookIds: [],
        dailyWordCount: 10
      });

      const result = await StudyConfigService.getTodayWords('user-123');

      expect(result.words).toEqual([]);
      expect(result.progress.todayTarget).toBe(10);
    });

    it('应该标记新词和复习词', async () => {
      const userId = 'user-123';
      const now = new Date();

      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        {
          wordId: 'word-1',
          state: 'LEARNING',
          nextReviewDate: new Date(now.getTime() - 1000),
          word: { id: 'word-1', spelling: 'review-word' }
        }
      ]);

      mockPrisma.wordScore.findMany.mockResolvedValue([]);

      mockPrisma.word.findMany.mockResolvedValue([
        { id: 'word-2', spelling: 'new-word' }
      ]);

      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const result = await StudyConfigService.getTodayWords(userId);

      const reviewWord = result.words.find((w: any) => w.id === 'word-1');
      const newWord = result.words.find((w: any) => w.id === 'word-2');

      expect(reviewWord?.isNew).toBe(false);
      expect(newWord?.isNew).toBe(true);
    });

    it('应该在随机模式下使用随机排序', async () => {
      mockPrisma.userStudyConfig.findUnique.mockResolvedValue({
        userId: 'user-123',
        selectedWordBookIds: ['book-1'],
        dailyWordCount: 10,
        studyMode: 'random'
      });

      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);
      mockPrisma.wordScore.findMany.mockResolvedValue([]);

      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'word-1', spelling: 'random-word' }
      ]);

      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      await StudyConfigService.getTodayWords('user-123');

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('应该按优先级排序到期复习词', async () => {
      const now = new Date();

      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        {
          wordId: 'word-1',
          state: 'LEARNING',
          nextReviewDate: new Date(now.getTime() - 86400000), // 1天前到期
          word: { id: 'word-1', spelling: 'old-due' }
        },
        {
          wordId: 'word-2',
          state: 'LEARNING',
          nextReviewDate: new Date(now.getTime() - 1000), // 刚到期
          word: { id: 'word-2', spelling: 'new-due' }
        }
      ]);

      mockPrisma.wordScore.findMany.mockResolvedValue([
        { wordId: 'word-1', totalAttempts: 5, correctAttempts: 2, totalScore: 40 },
        { wordId: 'word-2', totalAttempts: 5, correctAttempts: 4, totalScore: 80 }
      ]);

      mockPrisma.word.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const result = await StudyConfigService.getTodayWords('user-123');

      // word-1 优先级更高（逾期更久+得分更低+错误率更高）
      if (result.words.length >= 2) {
        expect(result.words[0].id).toBe('word-1');
      }
    });
  });

  describe('getStudyProgress', () => {
    it('应该返回学习进度', async () => {
      const userId = 'user-123';

      mockPrisma.userStudyConfig.findUnique.mockResolvedValue({
        userId,
        selectedWordBookIds: ['book-1'],
        dailyWordCount: 20
      });

      mockPrisma.wordBook.findMany.mockResolvedValue([{ id: 'book-1' }]);

      mockPrisma.answerRecord.groupBy
        .mockResolvedValueOnce([{ wordId: 'w1' }, { wordId: 'w2' }]) // today
        .mockResolvedValueOnce([{ wordId: 'w1' }, { wordId: 'w2' }, { wordId: 'w3' }]); // total

      mockPrisma.answerRecord.findMany.mockResolvedValue([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: true }
      ]);

      const progress = await StudyConfigService.getStudyProgress(userId);

      expect(progress.todayStudied).toBe(2);
      expect(progress.todayTarget).toBe(20);
      expect(progress.totalStudied).toBe(3);
      expect(progress.correctRate).toBe(75); // 3/4 = 75%
    });

    it('应该返回空进度当没有选择词书', async () => {
      mockPrisma.userStudyConfig.findUnique.mockResolvedValue({
        userId: 'user-123',
        selectedWordBookIds: [],
        dailyWordCount: 20
      });

      const progress = await StudyConfigService.getStudyProgress('user-123');

      expect(progress.todayStudied).toBe(0);
      expect(progress.totalStudied).toBe(0);
      expect(progress.correctRate).toBe(0);
    });

    it('应该处理零记录情况', async () => {
      mockPrisma.userStudyConfig.findUnique.mockResolvedValue({
        userId: 'user-123',
        selectedWordBookIds: ['book-1'],
        dailyWordCount: 20
      });

      mockPrisma.wordBook.findMany.mockResolvedValue([{ id: 'book-1' }]);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);

      const progress = await StudyConfigService.getStudyProgress('user-123');

      expect(progress.correctRate).toBe(0);
    });
  });
});
