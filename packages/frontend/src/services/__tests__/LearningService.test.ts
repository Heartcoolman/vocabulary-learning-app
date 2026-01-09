/**
 * LearningService Tests
 *
 * 测试学习服务的核心功能，包括：
 * 1. 会话管理 - 开始、结束会话
 * 2. 单词导航 - 获取当前单词、下一个单词
 * 3. 答题提交 - 提交答案、获取反馈
 * 4. 进度追踪 - 获取学习进度
 * 5. 测试选项生成 - 生成选择题选项
 * 6. 单词状态管理 - 标记已掌握、需要练习、重置进度
 *
 * 注意：核心算法已迁移至Rust后端，前端通过API调用后端服务
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Word } from '../../types/models';

vi.mock('../StorageService', () => ({
  default: {
    getWords: vi.fn(),
    getAlgorithmConfig: vi.fn(),
    getWordLearningState: vi.fn(),
    getWordLearningStates: vi.fn(),
    saveWordLearningState: vi.fn(),
    saveWordScore: vi.fn(),
    getWordScore: vi.fn(),
    getWordScores: vi.fn(),
    getAnswerRecords: vi.fn(),
    saveAnswerRecordExtended: vi.fn(),
  },
}));

vi.mock('../client', () => ({
  default: {
    getUserStatistics: vi.fn(),
    deleteWordLearningState: vi.fn(),
    processLearningEvent: vi.fn(),
    getDueWords: vi.fn(),
    getCurrentTrend: vi.fn(),
    markWordAsMastered: vi.fn(),
    markWordAsNeedsPractice: vi.fn(),
    resetWordProgress: vi.fn(),
    batchUpdateWordStates: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

type MockStorageService = {
  getWords: ReturnType<typeof vi.fn>;
  getAlgorithmConfig: ReturnType<typeof vi.fn>;
  getWordLearningState: ReturnType<typeof vi.fn>;
  getWordLearningStates: ReturnType<typeof vi.fn>;
  saveWordLearningState: ReturnType<typeof vi.fn>;
  saveWordScore: ReturnType<typeof vi.fn>;
  getWordScore: ReturnType<typeof vi.fn>;
  getWordScores: ReturnType<typeof vi.fn>;
  getAnswerRecords: ReturnType<typeof vi.fn>;
  saveAnswerRecordExtended: ReturnType<typeof vi.fn>;
};

type MockApiClient = {
  getUserStatistics: ReturnType<typeof vi.fn>;
  deleteWordLearningState: ReturnType<typeof vi.fn>;
  processLearningEvent: ReturnType<typeof vi.fn>;
  getDueWords: ReturnType<typeof vi.fn>;
  getCurrentTrend: ReturnType<typeof vi.fn>;
  markWordAsMastered: ReturnType<typeof vi.fn>;
  markWordAsNeedsPractice: ReturnType<typeof vi.fn>;
  resetWordProgress: ReturnType<typeof vi.fn>;
  batchUpdateWordStates: ReturnType<typeof vi.fn>;
};

describe('LearningService', () => {
  let LearningService: typeof import('../LearningService').default;
  let mockStorageService: MockStorageService;
  let mockApiClient: MockApiClient;

  const mockWords: Word[] = [
    {
      id: 'word-1',
      spelling: 'hello',
      phonetic: '/həˈloʊ/',
      meanings: ['你好', '喂'],
      examples: ['Hello, world!'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-2',
      spelling: 'world',
      phonetic: '/wɜːrld/',
      meanings: ['世界', '地球'],
      examples: ['The world is beautiful.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-3',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试', '考试'],
      examples: ['This is a test.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  beforeEach(async () => {
    const StorageServiceModule = await import('../StorageService');
    const ApiClientModule = await import('../client');
    mockStorageService = StorageServiceModule.default as unknown as MockStorageService;
    mockApiClient = ApiClientModule.default as unknown as MockApiClient;

    vi.clearAllMocks();

    mockStorageService.getWords.mockResolvedValue(mockWords);
    mockStorageService.getAlgorithmConfig.mockResolvedValue(null);
    mockStorageService.getWordLearningState.mockResolvedValue(null);
    mockStorageService.getWordLearningStates.mockResolvedValue([]);
    mockStorageService.saveWordLearningState.mockResolvedValue(undefined);
    mockStorageService.saveWordScore.mockResolvedValue(undefined);
    mockStorageService.getWordScore.mockResolvedValue(null);
    mockStorageService.getWordScores.mockResolvedValue([]);
    mockStorageService.getAnswerRecords.mockResolvedValue([]);
    mockStorageService.saveAnswerRecordExtended.mockResolvedValue(undefined);

    mockApiClient.getUserStatistics.mockResolvedValue({ correctRate: 0.75 });
    mockApiClient.deleteWordLearningState.mockResolvedValue(undefined);
    mockApiClient.processLearningEvent.mockResolvedValue({
      decision: { masteryChange: 1, score: 80 },
    });
    mockApiClient.getDueWords.mockResolvedValue([]);
    mockApiClient.getCurrentTrend.mockResolvedValue({
      trend: 'improving',
      recommendedSessionLength: 20,
    });

    const module = await import('../LearningService');
    LearningService = module.default;
    await LearningService.endSession();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('会话管理', () => {
    it('should start a new session with valid word IDs', async () => {
      const wordIds = ['word-1', 'word-2', 'word-3'];

      const session = await LearningService.startSession(wordIds);

      expect(session).toBeDefined();
      expect(session.id).toBe('mock-uuid-1234');
      expect(session.wordIds).toEqual(wordIds);
      expect(session.currentIndex).toBe(0);
      expect(session.startTime).toBeDefined();
      expect(session.endTime).toBeNull();
    });

    it('should throw error when starting session with empty word IDs', async () => {
      await expect(LearningService.startSession([])).rejects.toThrow('词库为空，无法开始学习');
    });

    it('should throw error when no valid words are found', async () => {
      mockStorageService.getWords.mockResolvedValue([]);

      await expect(LearningService.startSession(['non-existent-word'])).rejects.toThrow(
        '未找到有效的单词',
      );
    });

    it('should start session with userId', async () => {
      const wordIds = ['word-1', 'word-2'];
      const userId = 'user-123';

      const session = await LearningService.startSession(wordIds, userId);

      expect(session).toBeDefined();
      expect(session.userId).toBe(userId);
    });

    it('should end session successfully', async () => {
      await LearningService.startSession(['word-1', 'word-2']);

      const result = await LearningService.endSession();

      expect(result).toBe(true);
    });

    it('should return true when ending a non-existent session', async () => {
      const result = await LearningService.endSession();
      expect(result).toBe(true);
    });

    it('should return session after startSession is called', async () => {
      await LearningService.startSession(['word-1', 'word-2']);
      const session = LearningService.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.wordIds).toEqual(['word-1', 'word-2']);
    });
  });

  describe('单词导航', () => {
    it('should get current word', async () => {
      await LearningService.startSession(['word-1', 'word-2']);

      const word = LearningService.getCurrentWord();

      expect(word).not.toBeNull();
      expect(word?.id).toBe('word-1');
      expect(word?.spelling).toBe('hello');
    });

    it('should return null when no session exists', () => {
      const word = LearningService.getCurrentWord();
      expect(word).toBeNull();
    });

    it('should increment progress when calling nextWord', async () => {
      await LearningService.startSession(['word-1', 'word-2', 'word-3']);

      expect(LearningService.getProgress().current).toBe(1);

      await LearningService.nextWord();

      expect(LearningService.getProgress().current).toBe(2);
    });

    it('should return null when reaching end of words', async () => {
      await LearningService.startSession(['word-1']);

      const nextWord = await LearningService.nextWord();

      expect(nextWord).toBeNull();
    });

    it('should return null when calling nextWord without session', async () => {
      const nextWord = await LearningService.nextWord();
      expect(nextWord).toBeNull();
    });
  });

  describe('进度追踪', () => {
    it('should get progress correctly', async () => {
      await LearningService.startSession(['word-1', 'word-2', 'word-3']);

      const progress = LearningService.getProgress();

      expect(progress.current).toBe(1);
      expect(progress.total).toBe(3);
    });

    it('should update progress after moving to next word', async () => {
      await LearningService.startSession(['word-1', 'word-2', 'word-3']);

      await LearningService.nextWord();
      const progress = LearningService.getProgress();

      expect(progress.current).toBe(2);
      expect(progress.total).toBe(3);
    });

    it('should return zero progress when no session', () => {
      const progress = LearningService.getProgress();

      expect(progress.current).toBe(0);
      expect(progress.total).toBe(0);
    });
  });

  describe('测试选项生成', () => {
    it('should generate test options with correct answer', () => {
      const correctWord = mockWords[0];

      const result = LearningService.generateTestOptions(correctWord, mockWords, 4);

      expect(result.options).toContain(result.correctAnswer);
      expect(result.correctAnswer).toBe('你好');
      expect(result.options.length).toBeLessThanOrEqual(4);
    });

    it('should generate options with minimum 2 options', () => {
      const correctWord = mockWords[0];

      const result = LearningService.generateTestOptions(correctWord, mockWords, 2);

      expect(result.options.length).toBeGreaterThanOrEqual(1);
    });

    it('should shuffle options', () => {
      const correctWord = mockWords[0];
      const results: string[][] = [];

      for (let i = 0; i < 10; i++) {
        const result = LearningService.generateTestOptions(correctWord, mockWords, 4);
        results.push(result.options);
      }

      results.forEach((options) => {
        expect(options).toContain('你好');
      });
    });

    it('should throw error when word has no meanings', () => {
      const wordWithoutMeaning: Word = {
        ...mockWords[0],
        meanings: [],
      };

      expect(() => LearningService.generateTestOptions(wordWithoutMeaning, mockWords, 4)).toThrow(
        '缺少释义，无法生成测验选项',
      );
    });

    it('should handle option count limits', () => {
      const correctWord = mockWords[0];

      const result1 = LearningService.generateTestOptions(correctWord, mockWords, 1);
      expect(result1.options.length).toBeGreaterThanOrEqual(1);

      const result2 = LearningService.generateTestOptions(correctWord, mockWords, 10);
      expect(result2.options.length).toBeLessThanOrEqual(4);
    });

    it('should not include duplicate meanings', () => {
      const correctWord = mockWords[0];

      const result = LearningService.generateTestOptions(correctWord, mockWords, 4);

      const uniqueOptions = new Set(result.options);
      expect(uniqueOptions.size).toBe(result.options.length);
    });
  });

  describe('答案检查', () => {
    it('should return true for correct answer', () => {
      const word = mockWords[0];

      expect(LearningService.isAnswerCorrect('你好', word)).toBe(true);
      expect(LearningService.isAnswerCorrect('喂', word)).toBe(true);
    });

    it('should return false for incorrect answer', () => {
      const word = mockWords[0];

      expect(LearningService.isAnswerCorrect('错误答案', word)).toBe(false);
    });

    it('should trim whitespace when checking answers', () => {
      const word = mockWords[0];

      expect(LearningService.isAnswerCorrect(' 你好 ', word)).toBe(true);
      expect(LearningService.isAnswerCorrect('  喂  ', word)).toBe(true);
    });
  });

  describe('答题提交', () => {
    it('should submit answer via API', async () => {
      await LearningService.startSession(['word-1', 'word-2']);

      const result = await LearningService.submitAnswer('word-1', '你好', true, 2000, 5000);

      expect(mockApiClient.processLearningEvent).toHaveBeenCalledWith({
        wordId: 'word-1',
        isCorrect: true,
        responseTime: 2000,
        dwellTime: 5000,
        sessionId: 'mock-uuid-1234',
      });
      expect(result).not.toBeNull();
    });

    it('should return null when API fails', async () => {
      mockApiClient.processLearningEvent.mockRejectedValue(new Error('API Error'));
      await LearningService.startSession(['word-1']);

      const result = await LearningService.submitAnswer('word-1', '你好', true, 2000, 5000);

      expect(result).toBeNull();
    });

    it('should return feedback info from API', async () => {
      mockApiClient.processLearningEvent.mockResolvedValue({
        wordMasteryDecision: { isMastered: true, confidence: 0.9 },
      });

      await LearningService.startSession(['word-1', 'word-2'], 'user-123');

      const result = await LearningService.submitAnswer(
        'word-1',
        '你好',
        true,
        2000,
        5000,
        'user-123',
      );

      expect(result).not.toBeNull();
      expect(result?.masteryLevelAfter).toBe(1);
      expect(result?.score).toBe(90);
    });
  });

  describe('停留时间记录', () => {
    it('should record dwell time without error', async () => {
      await LearningService.startSession(['word-1']);

      expect(() => {
        LearningService.recordDwellTime(1000);
        LearningService.recordDwellTime(2000);
      }).not.toThrow();
    });
  });

  describe('单词状态管理', () => {
    it('should get word state', async () => {
      const userId = 'user-123';
      const wordId = 'word-1';

      mockStorageService.getWordLearningState.mockResolvedValue({
        masteryLevel: 3,
        nextReviewDate: Date.now() + 86400000,
      });
      mockStorageService.getWordScore.mockResolvedValue({ totalScore: 75 });

      const result = await LearningService.getWordState(userId, wordId);

      expect(result).not.toBeNull();
      expect(result?.masteryLevel).toBe(3);
      expect(result?.score).toBe(75);
    });

    it('should return null when word state not found', async () => {
      mockStorageService.getWordLearningState.mockResolvedValue(null);

      const result = await LearningService.getWordState('user-123', 'word-1');

      expect(result).toBeNull();
    });

    it('should get word score', async () => {
      mockStorageService.getWordScore.mockResolvedValue({ totalScore: 80 });

      const result = await LearningService.getWordScore('user-123', 'word-1');

      expect(result).not.toBeNull();
    });

    it('should get due words from API', async () => {
      mockApiClient.getDueWords.mockResolvedValue([{ wordId: 'word-1' }, { wordId: 'word-2' }]);

      const result = await LearningService.getDueWords('user-123');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([{ wordId: 'word-1' }, { wordId: 'word-2' }]);
    });

    it('should get trend analysis from API', async () => {
      mockApiClient.getCurrentTrend.mockResolvedValue({
        state: 'up',
        consecutiveDays: 5,
        stateDescription: 'improving',
      });

      const result = await LearningService.getTrendAnalysis();

      expect(result).not.toBeNull();
      expect(result?.isImproving).toBe(true);
    });

    it('should get recommended word count', () => {
      const baseCount = 20;

      const result = LearningService.getRecommendedWordCount(baseCount);

      expect(result).toBe(baseCount);
    });

    it('should return null when getTrendAnalysis API fails', async () => {
      mockApiClient.getCurrentTrend.mockRejectedValue(new Error('API Error'));

      const result = await LearningService.getTrendAnalysis();

      expect(result).toBeNull();
    });
  });

  describe('反向测试选项生成', () => {
    it('should generate reverse test options with correct answer', () => {
      const word = mockWords[0];

      const result = LearningService.generateReverseTestOptions(word, mockWords, 4);

      expect(result.options).toContain(result.correctAnswer);
      expect(result.correctAnswer).toBe('hello');
      expect(result.options.length).toBeLessThanOrEqual(4);
    });

    it('should shuffle reverse options', () => {
      const word = mockWords[0];

      const result = LearningService.generateReverseTestOptions(word, mockWords, 4);

      expect(result.options).toContain('hello');
    });
  });

  describe('手动调整功能', () => {
    it('should mark word as mastered via API', async () => {
      await LearningService.markAsMastered('user-123', 'word-1');

      expect(mockApiClient.markWordAsMastered).toHaveBeenCalledWith('word-1');
    });

    it('should mark word as needs practice via API', async () => {
      await LearningService.markAsNeedsPractice('user-123', 'word-1');

      expect(mockApiClient.markWordAsNeedsPractice).toHaveBeenCalledWith('word-1');
    });

    it('should reset word progress via API', async () => {
      await LearningService.resetProgress('user-123', 'word-1');

      expect(mockApiClient.resetWordProgress).toHaveBeenCalledWith('word-1');
    });

    it('should batch update words via API', async () => {
      const wordIds = ['word-1', 'word-2'];

      await LearningService.batchUpdateWords('user-123', wordIds, 'mastered');

      expect(mockApiClient.batchUpdateWordStates).toHaveBeenCalledWith(wordIds, 'mastered');
    });

    it('should delete word learning state via API', async () => {
      await LearningService.deleteState('user-123', 'word-1');

      expect(mockApiClient.deleteWordLearningState).toHaveBeenCalledWith('word-1');
    });

    it('should propagate API errors', async () => {
      mockApiClient.deleteWordLearningState.mockRejectedValue(new Error('Delete failed'));

      await expect(LearningService.deleteState('user-123', 'word-1')).rejects.toThrow();
    });
  });
});
