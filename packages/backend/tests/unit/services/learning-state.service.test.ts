/**
 * Learning State Service Unit Tests
 *
 * 测试统一学习状态管理服务，包括：
 * - 学习状态管理（WordStateService 功能）
 * - 分数计算与更新（WordScoreService 功能）
 * - 掌握度评估（WordMasteryService 功能）
 * - 事件发布机制
 * - 缓存策略
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WordState } from '@prisma/client';

// ============ Mock 配置 ============

// Mock 数据库
const mockPrisma = {
  wordLearningState: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  wordScore: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  answerRecord: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn(),
  },
  word: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn((callback) => {
    if (typeof callback === 'function') {
      return callback(mockPrisma);
    }
    return Promise.all(callback);
  }),
};

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma,
}));

// Mock 缓存服务
const mockCacheService = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
};

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: mockCacheService,
  CacheKeys: {
    USER_LEARNING_STATE: (userId: string, wordId: string) => `state:${userId}:${wordId}`,
    USER_LEARNING_STATES: (userId: string) => `states:${userId}`,
    USER_DUE_WORDS: (userId: string) => `due:${userId}`,
    WORD_SCORE: (userId: string, wordId: string) => `score:${userId}:${wordId}`,
    WORD_SCORES: (userId: string) => `scores:${userId}`,
  },
  CacheTTL: {
    SHORT: 300,
    MEDIUM: 3600,
    LONG: 86400,
  },
}));

// Mock EventBus
const mockEventBus = {
  publish: vi.fn(),
};

vi.mock('../../../src/core/event-bus', () => ({
  getEventBus: vi.fn(() => mockEventBus),
}));

// Mock DecisionEventsService
vi.mock('../../../src/services/decision-events.service', () => ({
  decisionEventsService: {
    recordEvent: vi.fn(),
  },
}));

// Mock WordMasteryEvaluator
const mockEvaluator = {
  evaluate: vi.fn(),
};

vi.mock('../../../src/amas/rewards/evaluators', () => ({
  WordMasteryEvaluator: vi.fn(() => mockEvaluator),
}));

// Mock WordMemoryTracker
const mockMemoryTracker = {
  trackReview: vi.fn(),
  getMemoryState: vi.fn(),
  clearHistory: vi.fn(),
};

vi.mock('../../../src/amas/tracking/word-memory-tracker', () => ({
  WordMemoryTracker: vi.fn(() => mockMemoryTracker),
}));

// Mock ACTRMemoryModel
vi.mock('../../../src/amas/models/cognitive', () => ({
  ACTRMemoryModel: {
    calculateActivation: vi.fn(),
    predictRecall: vi.fn(),
  },
}));

// ============ 导入被测试模块 ============
import { LearningStateService } from '../../../src/services/learning-state.service';

// ============ 测试数据 ============

const mockUserId = 'user-123';
const mockWordId = 'word-456';

const mockWordLearningState = {
  id: 'state-1',
  userId: mockUserId,
  wordId: mockWordId,
  state: WordState.LEARNING,
  masteryLevel: 3,
  easeFactor: 2.5,
  reviewCount: 5,
  lastReviewDate: new Date('2025-12-10T10:00:00Z'),
  nextReviewDate: new Date('2025-12-15T10:00:00Z'),
  currentInterval: 5,
  consecutiveCorrect: 2,
  consecutiveWrong: 0,
  halfLife: 3.5,
  createdAt: new Date('2025-12-01T00:00:00Z'),
  updatedAt: new Date('2025-12-10T10:00:00Z'),
};

const mockWordScore = {
  id: 'score-1',
  userId: mockUserId,
  wordId: mockWordId,
  totalScore: 75,
  accuracyScore: 80,
  speedScore: 70,
  stabilityScore: 75,
  proficiencyScore: 75,
  totalAttempts: 10,
  correctAttempts: 8,
  createdAt: new Date('2025-12-01T00:00:00Z'),
  updatedAt: new Date('2025-12-10T10:00:00Z'),
};

const mockMasteryEvaluation = {
  isMastered: false,
  score: 0.75,
  confidence: 0.85,
  needsReview: false,
  recallProbability: 0.82,
  retention: 0.78,
};

const mockWord = {
  id: mockWordId,
  spelling: 'example',
  phonetic: '/ɪɡˈzæmpəl/',
  meanings: ['例子', '范例'],
  examples: ['For example, ...'],
  audioUrl: null,
  wordBookId: 'book-1',
  createdAt: new Date('2025-12-01T00:00:00Z'),
  updatedAt: new Date('2025-12-01T00:00:00Z'),
};

// ============ 测试套件 ============

describe('LearningStateService', () => {
  let service: LearningStateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LearningStateService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== 学习状态管理 ====================

  describe('学习状态管理', () => {
    describe('getWordState', () => {
      it('应该从缓存获取学习状态', async () => {
        mockCacheService.get.mockResolvedValueOnce(mockWordLearningState);

        const result = await service.getWordState(mockUserId, mockWordId);

        expect(result).toEqual(mockWordLearningState);
        expect(mockCacheService.get).toHaveBeenCalledWith(
          expect.stringContaining(`state:${mockUserId}:${mockWordId}`),
        );
        expect(mockPrisma.wordLearningState.findUnique).not.toHaveBeenCalled();
      });

      it('应该在缓存失效时查询数据库', async () => {
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);

        const result = await service.getWordState(mockUserId, mockWordId);

        expect(result).toEqual(mockWordLearningState);
        expect(mockPrisma.wordLearningState.findUnique).toHaveBeenCalledWith({
          where: {
            unique_user_word: { userId: mockUserId, wordId: mockWordId },
          },
        });
        expect(mockCacheService.set).toHaveBeenCalled();
      });

      it('应该处理不存在的学习状态', async () => {
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(null);

        const result = await service.getWordState(mockUserId, mockWordId);

        expect(result).toBeNull();
      });

      it('应该缓存 null 值防止缓存穿透', async () => {
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(null);

        await service.getWordState(mockUserId, mockWordId);

        expect(mockCacheService.set).toHaveBeenCalledWith(
          expect.stringContaining(`state:${mockUserId}:${mockWordId}`),
          null,
          expect.any(Number),
        );
      });
    });

    describe('updateWordState', () => {
      it('应该更新学习状态并清除缓存', async () => {
        const updateData = {
          state: WordState.REVIEWING,
          masteryLevel: 4,
          reviewCount: 10,
        };

        mockPrisma.wordLearningState.update.mockResolvedValueOnce({
          ...mockWordLearningState,
          ...updateData,
        });

        const result = await service.updateWordState(mockUserId, mockWordId, updateData);

        expect(result).toMatchObject(updateData);
        expect(mockPrisma.wordLearningState.update).toHaveBeenCalledWith({
          where: {
            unique_user_word: { userId: mockUserId, wordId: mockWordId },
          },
          data: updateData,
        });
        expect(mockCacheService.delete).toHaveBeenCalledWith(
          expect.stringContaining(`state:${mockUserId}:${mockWordId}`),
        );
      });

      it('应该在状态迁移时发布事件', async () => {
        const updateData = {
          state: WordState.MASTERED,
          masteryLevel: 5,
        };

        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);
        mockPrisma.wordLearningState.update.mockResolvedValueOnce({
          ...mockWordLearningState,
          ...updateData,
        });

        await service.updateWordState(mockUserId, mockWordId, updateData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          'WORD_MASTERED',
          expect.objectContaining({
            userId: mockUserId,
            wordId: mockWordId,
          }),
        );
      });
    });

    describe('batchGetWordStates', () => {
      it('应该批量获取学习状态', async () => {
        const wordIds = ['word-1', 'word-2', 'word-3'];
        const mockStates = wordIds.map((id) => ({
          ...mockWordLearningState,
          wordId: id,
        }));

        mockCacheService.get.mockResolvedValue(null);
        mockPrisma.wordLearningState.findMany.mockResolvedValueOnce(mockStates);

        const result = await service.batchGetWordStates(mockUserId, wordIds);

        expect(result).toHaveLength(3);
        expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledWith({
          where: {
            userId: mockUserId,
            wordId: { in: wordIds },
          },
        });
      });

      it('应该优化 N+1 查询（单次数据库查询）', async () => {
        const wordIds = ['word-1', 'word-2', 'word-3'];
        mockCacheService.get.mockResolvedValue(null);
        mockPrisma.wordLearningState.findMany.mockResolvedValueOnce([]);

        await service.batchGetWordStates(mockUserId, wordIds);

        // 应该只调用一次 findMany，而不是每个 wordId 调用一次 findUnique
        expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledTimes(1);
        expect(mockPrisma.wordLearningState.findUnique).not.toHaveBeenCalled();
      });
    });

    describe('getDueWords', () => {
      it('应该获取到期复习词列表', async () => {
        const now = new Date();
        const dueStates = [
          {
            ...mockWordLearningState,
            wordId: 'word-1',
            nextReviewDate: new Date(now.getTime() - 86400000),
          },
          {
            ...mockWordLearningState,
            wordId: 'word-2',
            nextReviewDate: new Date(now.getTime() - 172800000),
          },
        ];

        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordLearningState.findMany.mockResolvedValueOnce(dueStates);

        const result = await service.getDueWords(mockUserId);

        expect(result).toHaveLength(2);
        expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledWith({
          where: {
            userId: mockUserId,
            nextReviewDate: { lte: expect.any(Date) },
            state: { in: ['NEW', 'LEARNING', 'REVIEWING'] },
          },
          include: { word: true },
        });
      });

      it('应该按优先级排序复习词', async () => {
        const dueStates = [
          { ...mockWordLearningState, wordId: 'word-1', nextReviewDate: new Date('2025-12-10') },
          { ...mockWordLearningState, wordId: 'word-2', nextReviewDate: new Date('2025-12-05') },
        ];

        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordLearningState.findMany.mockResolvedValueOnce(dueStates);

        const result = await service.getDueWords(mockUserId);

        // word-2 逾期更久，应该排在前面
        expect(result[0].wordId).toBe('word-2');
        expect(result[1].wordId).toBe('word-1');
      });

      it('应该过滤已排除的单词', async () => {
        const excludeIds = ['word-1'];
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordLearningState.findMany.mockResolvedValueOnce([]);

        await service.getDueWords(mockUserId, excludeIds);

        expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            wordId: { notIn: excludeIds },
          }),
          include: { word: true },
        });
      });
    });
  });

  // ==================== 分数计算与更新 ====================

  describe('分数计算与更新', () => {
    describe('getWordScore', () => {
      it('应该获取单词得分', async () => {
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordScore.findUnique.mockResolvedValueOnce(mockWordScore);

        const result = await service.getWordScore(mockUserId, mockWordId);

        expect(result).toEqual(mockWordScore);
        expect(mockPrisma.wordScore.findUnique).toHaveBeenCalledWith({
          where: {
            unique_user_word_score: { userId: mockUserId, wordId: mockWordId },
          },
        });
      });

      it('应该缓存得分信息', async () => {
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.wordScore.findUnique.mockResolvedValueOnce(mockWordScore);

        await service.getWordScore(mockUserId, mockWordId);

        expect(mockCacheService.set).toHaveBeenCalledWith(
          expect.stringContaining(`score:${mockUserId}:${mockWordId}`),
          mockWordScore,
          expect.any(Number),
        );
      });
    });

    describe('updateWordScore', () => {
      it('应该正确计算加权总分', async () => {
        // accuracy(40%) + speed(20%) + stability(20%) + proficiency(20%)
        const scoreData = {
          accuracyScore: 80, // 80 * 0.4 = 32
          speedScore: 70, // 70 * 0.2 = 14
          stabilityScore: 75, // 75 * 0.2 = 15
          proficiencyScore: 75, // 75 * 0.2 = 15
        };
        const expectedTotal = 32 + 14 + 15 + 15; // = 76

        mockPrisma.wordScore.upsert.mockResolvedValueOnce({
          ...mockWordScore,
          ...scoreData,
          totalScore: expectedTotal,
        });

        const result = await service.updateWordScore(mockUserId, mockWordId, scoreData);

        expect(result.totalScore).toBe(expectedTotal);
      });

      it('应该更新各维度得分', async () => {
        const scoreData = {
          accuracyScore: 90,
          speedScore: 85,
          stabilityScore: 80,
          proficiencyScore: 88,
        };

        mockPrisma.wordScore.upsert.mockResolvedValueOnce({
          ...mockWordScore,
          ...scoreData,
        });

        const result = await service.updateWordScore(mockUserId, mockWordId, scoreData);

        expect(result).toMatchObject(scoreData);
        expect(mockCacheService.delete).toHaveBeenCalled();
      });

      it('应该处理极端得分值（0 和 100）', async () => {
        const minScoreData = {
          accuracyScore: 0,
          speedScore: 0,
          stabilityScore: 0,
          proficiencyScore: 0,
        };

        mockPrisma.wordScore.upsert.mockResolvedValueOnce({
          ...mockWordScore,
          ...minScoreData,
          totalScore: 0,
        });

        const result = await service.updateWordScore(mockUserId, mockWordId, minScoreData);
        expect(result.totalScore).toBe(0);

        const maxScoreData = {
          accuracyScore: 100,
          speedScore: 100,
          stabilityScore: 100,
          proficiencyScore: 100,
        };

        mockPrisma.wordScore.upsert.mockResolvedValueOnce({
          ...mockWordScore,
          ...maxScoreData,
          totalScore: 100,
        });

        const result2 = await service.updateWordScore(mockUserId, mockWordId, maxScoreData);
        expect(result2.totalScore).toBe(100);
      });
    });

    describe('batchCalculateScores', () => {
      it('应该批量计算并更新得分', async () => {
        const wordIds = ['word-1', 'word-2'];
        const mockAnswerStats = [
          { wordId: 'word-1', isCorrect: true, _count: { id: 8 } },
          { wordId: 'word-1', isCorrect: false, _count: { id: 2 } },
          { wordId: 'word-2', isCorrect: true, _count: { id: 7 } },
          { wordId: 'word-2', isCorrect: false, _count: { id: 3 } },
        ];

        mockPrisma.answerRecord.groupBy.mockResolvedValueOnce(mockAnswerStats);
        mockPrisma.wordScore.upsert.mockResolvedValue(mockWordScore);

        const results = await service.batchCalculateScores(mockUserId, wordIds);

        expect(results).toHaveLength(2);
        expect(mockPrisma.wordScore.upsert).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ==================== 掌握度评估 ====================

  describe('掌握度评估', () => {
    describe('evaluateWordMastery', () => {
      it('应该评估单词掌握度', async () => {
        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);
        mockPrisma.wordScore.findUnique.mockResolvedValueOnce(mockWordScore);
        mockPrisma.answerRecord.findMany.mockResolvedValueOnce([]);
        mockEvaluator.evaluate.mockReturnValueOnce(mockMasteryEvaluation);

        const result = await service.evaluateWordMastery(mockUserId, mockWordId);

        expect(result).toEqual(mockMasteryEvaluation);
        expect(mockEvaluator.evaluate).toHaveBeenCalled();
      });

      it('应该识别掌握度阈值（isMastered）', async () => {
        const masteredState = {
          ...mockWordLearningState,
          state: WordState.MASTERED,
          masteryLevel: 5,
        };

        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(masteredState);
        mockPrisma.wordScore.findUnique.mockResolvedValueOnce({
          ...mockWordScore,
          totalScore: 95,
        });
        mockPrisma.answerRecord.findMany.mockResolvedValueOnce([]);
        mockEvaluator.evaluate.mockReturnValueOnce({
          ...mockMasteryEvaluation,
          isMastered: true,
          score: 0.95,
        });

        const result = await service.evaluateWordMastery(mockUserId, mockWordId);

        expect(result.isMastered).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0.9);
      });

      it('应该处理无学习记录的单词', async () => {
        mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(null);
        mockPrisma.wordScore.findUnique.mockResolvedValueOnce(null);
        mockPrisma.answerRecord.findMany.mockResolvedValueOnce([]);

        const result = await service.evaluateWordMastery(mockUserId, mockWordId);

        expect(result).toBeNull();
      });
    });

    describe('trackReview', () => {
      it('应该追踪复习事件', async () => {
        const reviewEvent = {
          wordId: mockWordId,
          timestamp: Date.now(),
          isCorrect: true,
          responseTime: 2000,
        };

        mockMemoryTracker.trackReview.mockReturnValueOnce({
          activation: 0.8,
          retention: 0.85,
        });

        await service.trackReview(mockUserId, reviewEvent);

        expect(mockMemoryTracker.trackReview).toHaveBeenCalledWith(
          expect.objectContaining({
            wordId: mockWordId,
            isCorrect: true,
          }),
        );
      });
    });

    describe('getMasteryStats', () => {
      it('应该统计用户掌握度分布', async () => {
        const mockStates = [
          { ...mockWordLearningState, state: WordState.MASTERED, masteryLevel: 5 },
          { ...mockWordLearningState, state: WordState.REVIEWING, masteryLevel: 4 },
          { ...mockWordLearningState, state: WordState.LEARNING, masteryLevel: 2 },
          { ...mockWordLearningState, state: WordState.NEW, masteryLevel: 0 },
        ];

        mockPrisma.wordLearningState.findMany.mockResolvedValueOnce(mockStates);
        mockPrisma.wordScore.findMany.mockResolvedValueOnce([
          { ...mockWordScore, totalScore: 95 },
          { ...mockWordScore, totalScore: 80 },
          { ...mockWordScore, totalScore: 50 },
          { ...mockWordScore, totalScore: 0 },
        ]);

        const result = await service.getMasteryStats(mockUserId);

        expect(result).toMatchObject({
          totalWords: 4,
          masteredWords: 1,
          reviewingWords: 1,
          learningWords: 1,
          newWords: 1,
        });
        expect(result.averageScore).toBeGreaterThan(0);
      });
    });
  });

  // ==================== 事件发布机制 ====================

  describe('事件发布机制', () => {
    it('应该在单词掌握时发布 WORD_MASTERED 事件', async () => {
      const updateData = { state: WordState.MASTERED };
      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);
      mockPrisma.wordLearningState.update.mockResolvedValueOnce({
        ...mockWordLearningState,
        ...updateData,
      });

      await service.updateWordState(mockUserId, mockWordId, updateData);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'WORD_MASTERED',
        expect.objectContaining({
          userId: mockUserId,
          wordId: mockWordId,
        }),
      );
    });

    it('应该在遗忘风险高时发布 FORGETTING_RISK 事件', async () => {
      const highRiskState = {
        ...mockWordLearningState,
        nextReviewDate: new Date(Date.now() - 7 * 86400000), // 逾期 7 天
      };

      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(highRiskState);

      await service.checkForgettingRisk(mockUserId, mockWordId);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'FORGETTING_RISK',
        expect.objectContaining({
          userId: mockUserId,
          wordId: mockWordId,
          riskLevel: expect.stringMatching(/high|critical/),
        }),
      );
    });

    it('应该在事件发布失败时记录错误但不影响主流程', async () => {
      mockEventBus.publish.mockRejectedValueOnce(new Error('Event bus down'));

      const updateData = { state: WordState.REVIEWING };
      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);
      mockPrisma.wordLearningState.update.mockResolvedValueOnce({
        ...mockWordLearningState,
        ...updateData,
      });

      // 不应该抛出错误
      await expect(
        service.updateWordState(mockUserId, mockWordId, updateData),
      ).resolves.toBeDefined();
    });
  });

  // ==================== 缓存策略 ====================

  describe('缓存策略', () => {
    it('应该在更新后清除相关缓存', async () => {
      const updateData = { masteryLevel: 4 };
      mockPrisma.wordLearningState.update.mockResolvedValueOnce({
        ...mockWordLearningState,
        ...updateData,
      });

      await service.updateWordState(mockUserId, mockWordId, updateData);

      expect(mockCacheService.delete).toHaveBeenCalledWith(
        expect.stringContaining(`state:${mockUserId}:${mockWordId}`),
      );
      expect(mockCacheService.delete).toHaveBeenCalledWith(
        expect.stringContaining(`states:${mockUserId}`),
      );
      expect(mockCacheService.delete).toHaveBeenCalledWith(
        expect.stringContaining(`due:${mockUserId}`),
      );
    });

    it('应该设置正确的 TTL', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);

      await service.getWordState(mockUserId, mockWordId);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        mockWordLearningState,
        3600, // 1 hour
      );
    });
  });

  // ==================== 错误处理 ====================

  describe('错误处理', () => {
    it('应该处理数据库连接失败', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      mockPrisma.wordLearningState.findUnique.mockRejectedValueOnce(
        new Error('Connection timeout'),
      );

      await expect(service.getWordState(mockUserId, mockWordId)).rejects.toThrow(
        'Connection timeout',
      );
    });

    it('应该处理缓存服务不可用（降级到数据库）', async () => {
      mockCacheService.get.mockRejectedValueOnce(new Error('Redis down'));
      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(mockWordLearningState);

      const result = await service.getWordState(mockUserId, mockWordId);

      expect(result).toEqual(mockWordLearningState);
      expect(mockPrisma.wordLearningState.findUnique).toHaveBeenCalled();
    });
  });

  // ==================== 边界条件 ====================

  describe('边界条件', () => {
    it('应该处理首次学习（reviewCount = 0）', async () => {
      const newState = {
        ...mockWordLearningState,
        reviewCount: 0,
        state: WordState.NEW,
      };

      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(newState);

      const result = await service.getWordState(mockUserId, mockWordId);

      expect(result.reviewCount).toBe(0);
      expect(result.state).toBe(WordState.NEW);
    });

    it('应该处理极高掌握度（masteryLevel = 5, stability = 1.0）', async () => {
      const masteredState = {
        ...mockWordLearningState,
        state: WordState.MASTERED,
        masteryLevel: 5,
      };

      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(masteredState);
      mockPrisma.wordScore.findUnique.mockResolvedValueOnce({
        ...mockWordScore,
        totalScore: 100,
        stabilityScore: 100,
      });
      mockPrisma.answerRecord.findMany.mockResolvedValueOnce([]);
      mockEvaluator.evaluate.mockReturnValueOnce({
        isMastered: true,
        score: 1.0,
        confidence: 1.0,
        needsReview: false,
        recallProbability: 1.0,
        retention: 1.0,
      });

      const result = await service.evaluateWordMastery(mockUserId, mockWordId);

      expect(result.isMastered).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('应该处理空答题历史', async () => {
      mockPrisma.wordLearningState.findUnique.mockResolvedValueOnce(null);
      mockPrisma.answerRecord.findMany.mockResolvedValueOnce([]);

      const result = await service.evaluateWordMastery(mockUserId, mockWordId);

      expect(result).toBeNull();
    });

    it('应该处理大量单词的批量查询（100+ 单词）', async () => {
      const wordIds = Array.from({ length: 150 }, (_, i) => `word-${i}`);
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.wordLearningState.findMany.mockResolvedValueOnce([]);

      const result = await service.batchGetWordStates(mockUserId, wordIds);

      expect(result).toBeDefined();
      expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== 性能测试 ====================

  describe('性能测试', () => {
    it('应该在 100ms 内完成单次状态查询（缓存命中）', async () => {
      mockCacheService.get.mockResolvedValueOnce(mockWordLearningState);

      const start = Date.now();
      await service.getWordState(mockUserId, mockWordId);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('应该在 500ms 内完成 100 个词的批量查询', async () => {
      const wordIds = Array.from({ length: 100 }, (_, i) => `word-${i}`);
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.wordLearningState.findMany.mockResolvedValueOnce([]);

      const start = Date.now();
      await service.batchGetWordStates(mockUserId, wordIds);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });
});
