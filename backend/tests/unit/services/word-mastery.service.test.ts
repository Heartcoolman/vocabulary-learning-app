/**
 * Word Mastery Service Tests
 * 单词掌握度服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findMany: vi.fn()
    },
    wordReviewTrace: {
      findMany: vi.fn()
    },
    amasUserState: {
      findUnique: vi.fn()
    }
  }
}));

// Mock AMAS modules - 使用 vi.hoisted 来提升 mock 对象定义
const { mockEvaluator, mockTracker, mockActrModel } = vi.hoisted(() => ({
  mockEvaluator: {
    evaluate: vi.fn(),
    batchEvaluate: vi.fn(),
    updateConfig: vi.fn(),
    getConfig: vi.fn()
  },
  mockTracker: {
    recordReview: vi.fn(),
    batchRecordReview: vi.fn(),
    getReviewTrace: vi.fn(),
    batchGetMemoryState: vi.fn()
  },
  mockActrModel: {
    predictOptimalInterval: vi.fn()
  }
}));

vi.mock('../../../src/amas/evaluation/word-mastery-evaluator', () => ({
  WordMasteryEvaluator: function() { return mockEvaluator; }
}));

vi.mock('../../../src/amas/tracking/word-memory-tracker', () => ({
  WordMemoryTracker: function() { return mockTracker; }
}));

vi.mock('../../../src/amas/modeling/actr-memory', () => ({
  ACTRMemoryModel: function() { return mockActrModel; }
}));

import { WordMasteryService } from '../../../src/services/word-mastery.service';

describe('WordMasteryService', () => {
  let service: WordMasteryService;
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
    service = new WordMasteryService();
  });

  describe('evaluateWord', () => {
    it('应该评估单个单词的掌握度', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';

      mockPrisma.amasUserState.findUnique.mockResolvedValue({ fatigue: 0.3 });

      // Mock evaluator
      const mockEvaluation = {
        wordId,
        score: 0.75,
        isLearned: false,
        factors: {
          actrRecall: 0.8,
          accuracy: 0.85,
          stability: 0.7
        }
      };
      mockEvaluator.evaluate.mockResolvedValue(mockEvaluation);

      const result = await service.evaluateWord(userId, wordId);

      expect(result.wordId).toBe(wordId);
      expect(result.score).toBe(0.75);
    });

    it('应该使用提供的疲劳度值', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const userFatigue = 0.5;

      const mockEvaluation = {
        wordId,
        score: 0.6,
        isLearned: false,
        factors: { actrRecall: 0.7, accuracy: 0.8, stability: 0.6 }
      };
      mockEvaluator.evaluate.mockResolvedValue(mockEvaluation);

      await service.evaluateWord(userId, wordId, userFatigue);

      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        userId,
        wordId,
        userFatigue
      );
    });
  });

  describe('batchEvaluateWords', () => {
    it('应该批量评估多个单词的掌握度', async () => {
      const userId = 'user-123';
      const wordIds = ['word-1', 'word-2', 'word-3'];

      mockPrisma.amasUserState.findUnique.mockResolvedValue({ fatigue: 0.2 });

      const mockEvaluations = wordIds.map(wordId => ({
        wordId,
        score: 0.7,
        isLearned: false,
        factors: { actrRecall: 0.75, accuracy: 0.8, stability: 0.65 }
      }));
      mockEvaluator.batchEvaluate.mockResolvedValue(mockEvaluations);

      const results = await service.batchEvaluateWords(userId, wordIds);

      expect(results).toHaveLength(3);
      expect(mockEvaluator.batchEvaluate).toHaveBeenCalledWith(
        userId,
        wordIds,
        0.2
      );
    });
  });

  describe('getUserMasteryStats', () => {
    it('应该返回用户掌握度统计', async () => {
      const userId = 'user-123';

      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { wordId: 'word-1', state: 'LEARNING', masteryLevel: 2 },
        { wordId: 'word-2', state: 'REVIEWING', masteryLevel: 4 },
        { wordId: 'word-3', state: 'NEW', masteryLevel: 0 }
      ]);

      mockPrisma.amasUserState.findUnique.mockResolvedValue({ fatigue: 0.1 });

      const mockEvaluations = [
        { wordId: 'word-1', score: 0.5, isLearned: false, factors: { actrRecall: 0.6 } },
        { wordId: 'word-2', score: 0.8, isLearned: true, factors: { actrRecall: 0.9 } },
        { wordId: 'word-3', score: 0.3, isLearned: false, factors: { actrRecall: 0.4 } }
      ];
      mockEvaluator.batchEvaluate.mockResolvedValue(mockEvaluations);

      const stats = await service.getUserMasteryStats(userId);

      expect(stats.totalWords).toBe(3);
      expect(stats.masteredWords).toBe(1);
      expect(stats.learningWords).toBe(2);
      expect(stats.newWords).toBe(1);
    });

    it('应该返回空统计当用户没有学习记录', async () => {
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);

      const stats = await service.getUserMasteryStats('new-user');

      expect(stats.totalWords).toBe(0);
      expect(stats.masteredWords).toBe(0);
      expect(stats.averageScore).toBe(0);
    });
  });

  describe('recordReview', () => {
    it('应该记录复习事件', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const event = {
        timestamp: Date.now(),
        isCorrect: true,
        responseTime: 1500
      };

      mockTracker.recordReview.mockResolvedValue(undefined);

      await service.recordReview(userId, wordId, event);

      expect(mockTracker.recordReview).toHaveBeenCalledWith(
        userId,
        wordId,
        event
      );
    });
  });

  describe('batchRecordReview', () => {
    it('应该批量记录复习事件', async () => {
      const userId = 'user-123';
      const events = [
        { wordId: 'word-1', event: { timestamp: Date.now(), isCorrect: true, responseTime: 1000 } },
        { wordId: 'word-2', event: { timestamp: Date.now(), isCorrect: false, responseTime: 2000 } }
      ];

      mockTracker.batchRecordReview.mockResolvedValue(undefined);

      await service.batchRecordReview(userId, events);

      expect(mockTracker.batchRecordReview).toHaveBeenCalledWith(userId, events);
    });

    it('应该跳过空事件列表', async () => {
      mockTracker.batchRecordReview.mockClear();

      await service.batchRecordReview('user-123', []);

      expect(mockTracker.batchRecordReview).not.toHaveBeenCalled();
    });
  });

  describe('getMemoryTrace', () => {
    it('应该返回单词复习轨迹', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';
      const now = Date.now();

      mockPrisma.wordReviewTrace.findMany.mockResolvedValue([
        { id: 'trace-1', timestamp: new Date(now - 1000), isCorrect: true, responseTime: 1500 },
        { id: 'trace-2', timestamp: new Date(now - 60000), isCorrect: false, responseTime: 2500 }
      ]);

      const traces = await service.getMemoryTrace(userId, wordId);

      expect(traces).toHaveLength(2);
      expect(traces[0].isCorrect).toBe(true);
      expect(traces[1].isCorrect).toBe(false);
    });

    it('应该限制返回数量', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';

      mockPrisma.wordReviewTrace.findMany.mockResolvedValue([]);

      await service.getMemoryTrace(userId, wordId, 10);

      expect(mockPrisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('应该限制最大返回数量为100', async () => {
      mockPrisma.wordReviewTrace.findMany.mockResolvedValue([]);

      await service.getMemoryTrace('user-123', 'word-123', 200);

      expect(mockPrisma.wordReviewTrace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  describe('getWordMemoryState', () => {
    it('应该返回单词记忆状态', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';

      const mockState = {
        wordId,
        lastReview: Date.now(),
        reviewCount: 5,
        strength: 0.8
      };

      mockTracker.batchGetMemoryState.mockResolvedValue(
        new Map([[wordId, mockState]])
      );

      const state = await service.getWordMemoryState(userId, wordId);

      expect(state).toEqual(mockState);
    });

    it('应该返回null当状态不存在', async () => {
      mockTracker.batchGetMemoryState.mockResolvedValue(new Map());

      const state = await service.getWordMemoryState('user-123', 'non-existent');

      expect(state).toBeNull();
    });
  });

  describe('predictInterval', () => {
    it('应该预测最佳复习间隔', async () => {
      const userId = 'user-123';
      const wordId = 'word-123';

      const mockTrace = [
        { timestamp: Date.now() - 86400000, isCorrect: true, responseTime: 1500 }
      ];
      mockTracker.getReviewTrace.mockResolvedValue(mockTrace);

      const mockPrediction = {
        optimalInterval: 172800, // 2 days in seconds
        confidence: 0.85,
        predictedRecall: 0.9
      };
      mockActrModel.predictOptimalInterval.mockReturnValue(mockPrediction);

      const prediction = await service.predictInterval(userId, wordId);

      expect(prediction.optimalInterval).toBe(172800);
      expect(prediction.confidence).toBe(0.85);
    });

    it('应该使用指定的目标提取概率', async () => {
      const targetRecall = 0.85;

      mockTracker.getReviewTrace.mockResolvedValue([]);
      mockActrModel.predictOptimalInterval.mockReturnValue({});

      await service.predictInterval('user-123', 'word-123', targetRecall);

      expect(mockActrModel.predictOptimalInterval).toHaveBeenCalledWith(
        expect.anything(),
        targetRecall
      );
    });
  });

  describe('updateEvaluatorConfig', () => {
    it('应该更新评估器配置', () => {
      const newConfig = { masteryThreshold: 0.9 };

      service.updateEvaluatorConfig(newConfig);

      expect(mockEvaluator.updateConfig).toHaveBeenCalledWith(newConfig);
    });
  });

  describe('getEvaluatorConfig', () => {
    it('应该返回当前评估器配置', () => {
      const mockConfig = {
        masteryThreshold: 0.85,
        weights: { accuracy: 0.4, recall: 0.4, stability: 0.2 }
      };
      mockEvaluator.getConfig.mockReturnValue(mockConfig);

      const config = service.getEvaluatorConfig();

      expect(config).toEqual(mockConfig);
    });
  });
});
