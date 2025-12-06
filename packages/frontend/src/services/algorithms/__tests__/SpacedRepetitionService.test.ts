/**
 * SpacedRepetitionService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpacedRepetitionService, SessionInfo } from '../SpacedRepetitionService';
import { WordStateStorage } from '../WordStateManager';
import { WordLearningState, WordScore, WordState, AlgorithmConfig } from '../../../types/models';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  learningLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// 创建模拟配置
const createMockConfig = (): AlgorithmConfig => ({
  id: 'config-1',
  name: 'Test Config',
  description: 'Test configuration',
  reviewIntervals: [1, 3, 7, 15, 30],
  consecutiveCorrectThreshold: 5,
  consecutiveWrongThreshold: 3,
  difficultyAdjustmentInterval: 1,
  priorityWeights: {
    newWord: 40,
    errorRate: 30,
    overdueTime: 20,
    wordScore: 10,
  },
  masteryThresholds: [
    { level: 1, requiredCorrectStreak: 1, minAccuracy: 0.5, minScore: 30 },
    { level: 2, requiredCorrectStreak: 2, minAccuracy: 0.6, minScore: 50 },
    { level: 3, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 60 },
    { level: 4, requiredCorrectStreak: 4, minAccuracy: 0.8, minScore: 75 },
    { level: 5, requiredCorrectStreak: 5, minAccuracy: 0.9, minScore: 90 },
  ],
  scoreWeights: {
    accuracy: 40,
    speed: 30,
    stability: 20,
    proficiency: 10,
  },
  speedThresholds: {
    excellent: 3000,
    good: 5000,
    average: 10000,
    slow: 10000,
  },
  newWordRatio: {
    default: 0.3,
    highAccuracy: 0.5,
    lowAccuracy: 0.1,
    highAccuracyThreshold: 0.85,
    lowAccuracyThreshold: 0.65,
  },
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 创建模拟学习状态
const createMockLearningState = (overrides?: Partial<WordLearningState>): WordLearningState => ({
  id: 'state-1',
  userId: 'user-1',
  wordId: 'word-1',
  state: WordState.LEARNING,
  masteryLevel: 1,
  easeFactor: 2.0,
  reviewCount: 1,
  lastReviewDate: Date.now() - 24 * 60 * 60 * 1000,
  nextReviewDate: Date.now(),
  currentInterval: 1,
  consecutiveCorrect: 1,
  consecutiveWrong: 0,
  createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now(),
  ...overrides,
});

// 创建模拟单词得分
const createMockWordScore = (overrides?: Partial<WordScore>): WordScore => ({
  id: 'score-1',
  userId: 'user-1',
  wordId: 'word-1',
  totalScore: 50,
  accuracyScore: 20,
  speedScore: 15,
  stabilityScore: 10,
  proficiencyScore: 5,
  totalAttempts: 10,
  correctAttempts: 7,
  averageResponseTime: 4000,
  averageDwellTime: 6000,
  recentAccuracy: 0.8,
  createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now(),
  ...overrides,
});

// 创建模拟存储
const createMockStorage = (): WordStateStorage => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue(null),
  batchLoadStates: vi.fn().mockResolvedValue([]),
  loadAllStates: vi.fn().mockResolvedValue([]),
  deleteState: vi.fn().mockResolvedValue(undefined),
  loadScore: vi.fn().mockResolvedValue(null),
  batchLoadScores: vi.fn().mockResolvedValue([]),
  loadRecentAnswerRecords: vi.fn().mockResolvedValue([]),
});

describe('SpacedRepetitionService', () => {
  let service: SpacedRepetitionService;
  let config: AlgorithmConfig;
  let mockStorage: WordStateStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfig();
    mockStorage = createMockStorage();
    service = new SpacedRepetitionService(config, mockStorage);
  });

  describe('startSession', () => {
    it('should create a new learning session', async () => {
      const session = await service.startSession('user-1', ['word-1', 'word-2'], 2, 0.7);

      expect(session).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.sessionId).toContain('session-user-1-');
      expect(session.currentIndex).toBe(0);
      expect(session.correctCount).toBe(0);
      expect(session.wrongCount).toBe(0);
    });

    it('should initialize states for words without existing state', async () => {
      vi.mocked(mockStorage.batchLoadStates).mockResolvedValue([]);

      await service.startSession('user-1', ['word-1', 'word-2'], 2, 0.7);

      expect(mockStorage.saveState).toHaveBeenCalledTimes(2);
    });

    it('should use existing states when available', async () => {
      const existingStates = [
        createMockLearningState({ wordId: 'word-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-2', state: WordState.NEW }),
      ];
      vi.mocked(mockStorage.batchLoadStates).mockResolvedValue(existingStates);

      await service.startSession('user-1', ['word-1', 'word-2'], 2, 0.7);

      // 不应该初始化已存在的状态
      expect(mockStorage.saveState).not.toHaveBeenCalled();
    });

    it('should respect target count', async () => {
      const states = [
        createMockLearningState({ wordId: 'word-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-2', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-3', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-4', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-5', state: WordState.NEW }),
      ];
      vi.mocked(mockStorage.batchLoadStates).mockResolvedValue(states);

      const session = await service.startSession('user-1', ['word-1', 'word-2', 'word-3', 'word-4', 'word-5'], 3, 0.7);

      expect(session.wordIds.length).toBe(3);
    });

    it('should handle empty word list', async () => {
      const session = await service.startSession('user-1', [], 10, 0.7);

      expect(session.wordIds).toEqual([]);
    });
  });

  describe('submitAnswer', () => {
    beforeEach(async () => {
      // 设置初始状态
      const existingState = createMockLearningState({
        wordId: 'word-1',
        state: WordState.LEARNING,
        masteryLevel: 1,
        consecutiveCorrect: 0,
      });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);
    });

    it('should process correct answer', async () => {
      // 先开始会话
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      const result = await service.submitAnswer(
        'user-1',
        'word-1',
        true,
        3000,
        5000,
        'correct',
        'correct'
      );

      expect(result.isCorrect).toBe(true);
      expect(result.wordState).toBeDefined();
      expect(result.wordScore).toBeDefined();
    });

    it('should process wrong answer', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      const result = await service.submitAnswer(
        'user-1',
        'word-1',
        false,
        3000,
        5000,
        'wrong',
        'correct'
      );

      expect(result.isCorrect).toBe(false);
    });

    it('should update session statistics on correct answer', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      await service.submitAnswer('user-1', 'word-1', true, 3000, 5000, 'a', 'a');

      const session = service.getCurrentSession();
      expect(session?.correctCount).toBe(1);
      expect(session?.consecutiveCorrect).toBe(1);
      expect(session?.wrongCount).toBe(0);
    });

    it('should update session statistics on wrong answer', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      await service.submitAnswer('user-1', 'word-1', false, 3000, 5000, 'b', 'a');

      const session = service.getCurrentSession();
      expect(session?.wrongCount).toBe(1);
      expect(session?.consecutiveWrong).toBe(1);
      expect(session?.correctCount).toBe(0);
    });

    it('should reset consecutive counters on alternating answers', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      await service.submitAnswer('user-1', 'word-1', true, 3000, 5000, 'a', 'a');
      await service.submitAnswer('user-1', 'word-1', true, 3000, 5000, 'a', 'a');
      await service.submitAnswer('user-1', 'word-1', false, 3000, 5000, 'b', 'a');

      const session = service.getCurrentSession();
      expect(session?.consecutiveCorrect).toBe(0);
      expect(session?.consecutiveWrong).toBe(1);
    });

    it('should initialize state if word has no state', async () => {
      vi.mocked(mockStorage.loadState).mockResolvedValue(null);

      await service.startSession('user-1', ['new-word'], 1, 0.7);
      const result = await service.submitAnswer(
        'user-1',
        'new-word',
        true,
        3000,
        5000,
        'a',
        'a'
      );

      expect(result.wordState).toBeDefined();
      expect(mockStorage.saveState).toHaveBeenCalled();
    });

    it('should return mastery level change', async () => {
      const existingState = createMockLearningState({
        wordId: 'word-1',
        masteryLevel: 1,
        consecutiveCorrect: 0,
      });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      await service.startSession('user-1', ['word-1'], 1, 0.7);
      const result = await service.submitAnswer(
        'user-1',
        'word-1',
        true,
        2000,
        3000,
        'a',
        'a'
      );

      expect(typeof result.masteryLevelChange).toBe('number');
    });
  });

  describe('endSession', () => {
    it('should end current session and return statistics', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      // Submit some answers
      const existingState = createMockLearningState({ wordId: 'word-1' });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);
      await service.submitAnswer('user-1', 'word-1', true, 3000, 5000, 'a', 'a');
      await service.submitAnswer('user-1', 'word-1', false, 3000, 5000, 'b', 'a');

      const session = await service.endSession();

      expect(session).not.toBeNull();
      expect(session?.endTime).toBeDefined();
      expect(session?.correctCount).toBe(1);
      expect(session?.wrongCount).toBe(1);
    });

    it('should return null if no active session', async () => {
      const session = await service.endSession();

      expect(session).toBeNull();
    });

    it('should clear current session after ending', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);
      await service.endSession();

      const currentSession = service.getCurrentSession();
      expect(currentSession).toBeNull();
    });
  });

  describe('getWordState', () => {
    it('should return word state from manager', async () => {
      const state = createMockLearningState({ wordId: 'word-1' });
      vi.mocked(mockStorage.loadState).mockResolvedValue(state);

      const result = await service.getWordState('user-1', 'word-1');

      expect(result).toEqual(state);
    });

    it('should return null for non-existent word', async () => {
      vi.mocked(mockStorage.loadState).mockResolvedValue(null);

      const result = await service.getWordState('user-1', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getWordScore', () => {
    it('should return word score from storage', async () => {
      const score = createMockWordScore({ wordId: 'word-1' });
      vi.mocked(mockStorage.loadScore).mockResolvedValue(score);

      const result = await service.getWordScore('user-1', 'word-1');

      expect(result).toEqual(score);
    });

    it('should return null for non-existent score', async () => {
      vi.mocked(mockStorage.loadScore).mockResolvedValue(null);

      const result = await service.getWordScore('user-1', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getDueWords', () => {
    it('should return due words from state manager', async () => {
      const now = Date.now();
      const allStates = [
        createMockLearningState({
          wordId: 'due-1',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
        createMockLearningState({
          wordId: 'due-2',
          state: WordState.REVIEWING,
          nextReviewDate: now - 24 * 60 * 60 * 1000,
        }),
      ];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      vi.setSystemTime(now);
      const dueWords = await service.getDueWords('user-1');
      vi.useRealTimers();

      expect(dueWords).toContain('due-1');
      expect(dueWords).toContain('due-2');
    });
  });

  describe('getWordsByState', () => {
    it('should return words filtered by state', async () => {
      const allStates = [
        createMockLearningState({ wordId: 'word-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-2', state: WordState.LEARNING }),
        createMockLearningState({ wordId: 'word-3', state: WordState.NEW }),
      ];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      const newWords = await service.getWordsByState('user-1', WordState.NEW);

      expect(newWords).toEqual(['word-1', 'word-3']);
    });
  });

  describe('getCurrentSession', () => {
    it('should return current session when active', async () => {
      await service.startSession('user-1', ['word-1'], 1, 0.7);

      const session = service.getCurrentSession();

      expect(session).not.toBeNull();
      expect(session?.userId).toBe('user-1');
    });

    it('should return null when no active session', () => {
      const session = service.getCurrentSession();

      expect(session).toBeNull();
    });
  });

  describe('getTrendAnalysis', () => {
    it('should return trend analysis from difficulty engine', () => {
      const trend = service.getTrendAnalysis();

      expect(trend).toHaveProperty('isImproving');
      expect(trend).toHaveProperty('averageAccuracy');
      expect(trend).toHaveProperty('recommendation');
    });
  });

  describe('getRecommendedWordCount', () => {
    it('should return recommended word count', () => {
      const count = service.getRecommendedWordCount(10);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration for all engines', () => {
      const newConfig = createMockConfig();
      newConfig.reviewIntervals = [1, 2, 4, 8, 16];

      // 不应该抛出错误
      expect(() => service.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe('clearUserCache', () => {
    it('should clear user cache without error', () => {
      expect(() => service.clearUserCache('user-1')).not.toThrow();
    });
  });

  describe('markAsMastered', () => {
    it('should mark word as mastered', async () => {
      const existingState = createMockLearningState({ wordId: 'word-1' });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      const result = await service.markAsMastered('user-1', 'word-1', 'User marked as known');

      expect(result.state).toBe(WordState.MASTERED);
      expect(result.masteryLevel).toBe(5);
      expect(result.currentInterval).toBe(30);
    });

    it('should set next review date to 30 days from now', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const existingState = createMockLearningState({ wordId: 'word-1' });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      const result = await service.markAsMastered('user-1', 'word-1');

      expect(result.nextReviewDate).toBe(now + 30 * 24 * 60 * 60 * 1000);

      vi.useRealTimers();
    });
  });

  describe('markAsNeedsPractice', () => {
    it('should reset word to new state', async () => {
      const existingState = createMockLearningState({
        wordId: 'word-1',
        state: WordState.MASTERED,
        masteryLevel: 5,
      });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      const result = await service.markAsNeedsPractice('user-1', 'word-1', 'Need more practice');

      expect(result.state).toBe(WordState.NEW);
      expect(result.masteryLevel).toBe(0);
      expect(result.consecutiveCorrect).toBe(0);
      expect(result.consecutiveWrong).toBe(0);
    });

    it('should set next review date to now', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const existingState = createMockLearningState({ wordId: 'word-1' });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      const result = await service.markAsNeedsPractice('user-1', 'word-1');

      expect(result.nextReviewDate).toBe(now);

      vi.useRealTimers();
    });
  });

  describe('resetProgress', () => {
    it('should reset word to initial state', async () => {
      const result = await service.resetProgress('user-1', 'word-1', 'Start over');

      expect(result.state).toBe(WordState.NEW);
      expect(result.masteryLevel).toBe(0);
      expect(result.reviewCount).toBe(0);
      expect(result.easeFactor).toBe(2.5);
    });
  });

  describe('batchUpdateWords', () => {
    it('should batch mark words as mastered', async () => {
      const states = [
        createMockLearningState({ wordId: 'word-1' }),
        createMockLearningState({ wordId: 'word-2' }),
      ];
      vi.mocked(mockStorage.loadState)
        .mockResolvedValueOnce(states[0])
        .mockResolvedValueOnce(states[1]);

      const results = await service.batchUpdateWords(
        'user-1',
        ['word-1', 'word-2'],
        'mastered',
        'Batch mastered'
      );

      expect(results.length).toBe(2);
      expect(results.every(r => r.state === WordState.MASTERED)).toBe(true);
    });

    it('should batch mark words as needs practice', async () => {
      const states = [
        createMockLearningState({ wordId: 'word-1', state: WordState.MASTERED }),
        createMockLearningState({ wordId: 'word-2', state: WordState.MASTERED }),
      ];
      vi.mocked(mockStorage.loadState)
        .mockResolvedValueOnce(states[0])
        .mockResolvedValueOnce(states[1]);

      const results = await service.batchUpdateWords(
        'user-1',
        ['word-1', 'word-2'],
        'needsPractice',
        'Need practice'
      );

      expect(results.length).toBe(2);
      expect(results.every(r => r.state === WordState.NEW)).toBe(true);
    });

    it('should batch reset words', async () => {
      const results = await service.batchUpdateWords(
        'user-1',
        ['word-1', 'word-2'],
        'reset',
        'Reset all'
      );

      expect(results.length).toBe(2);
      expect(results.every(r => r.state === WordState.NEW)).toBe(true);
    });

    it('should continue processing on individual failures', async () => {
      vi.mocked(mockStorage.loadState)
        .mockRejectedValueOnce(new Error('Load failed'))
        .mockResolvedValueOnce(createMockLearningState({ wordId: 'word-2' }));

      const results = await service.batchUpdateWords(
        'user-1',
        ['word-1', 'word-2'],
        'mastered'
      );

      // Should have at least one success
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
