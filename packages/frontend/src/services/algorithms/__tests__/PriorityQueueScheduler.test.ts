/**
 * PriorityQueueScheduler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PriorityQueueScheduler } from '../PriorityQueueScheduler';
import { WordLearningState, WordScore, WordState, AlgorithmConfig } from '../../../types/models';

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

describe('PriorityQueueScheduler', () => {
  let scheduler: PriorityQueueScheduler;
  let config: AlgorithmConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfig();
    scheduler = new PriorityQueueScheduler(config);
  });

  describe('calculatePriority', () => {
    it('should give highest priority to new words', () => {
      const newWordState = createMockLearningState({
        wordId: 'new-word',
        state: WordState.NEW,
      });

      const priority = scheduler.calculatePriority(newWordState, undefined);

      // 新单词应该获得 newWord 权重 (40)
      expect(priority).toBeGreaterThanOrEqual(40);
    });

    it('should give higher priority to words with high error rate', () => {
      const state = createMockLearningState({
        wordId: 'word-1',
        state: WordState.LEARNING,
      });
      const highErrorScore = createMockWordScore({
        wordId: 'word-1',
        totalAttempts: 10,
        correctAttempts: 4, // 60% error rate
      });

      const priority = scheduler.calculatePriority(state, highErrorScore);

      // 错误率超过 50% 应该获得满分 errorRate 权重
      expect(priority).toBeGreaterThan(0);
    });

    it('should give higher priority to overdue words', () => {
      const now = Date.now();
      const overdueState = createMockLearningState({
        wordId: 'overdue-word',
        state: WordState.LEARNING,
        nextReviewDate: now - 7 * 24 * 60 * 60 * 1000, // 7天前到期
      });

      vi.setSystemTime(now);
      const priority = scheduler.calculatePriority(overdueState, undefined);
      vi.useRealTimers();

      // 逾期7天应该获得满分 overdueTime 权重 (20)
      expect(priority).toBeGreaterThanOrEqual(20);
    });

    it('should give higher priority to words with low score', () => {
      const state = createMockLearningState({
        wordId: 'word-1',
        state: WordState.LEARNING,
      });
      const lowScore = createMockWordScore({
        wordId: 'word-1',
        totalScore: 30, // 低于 40 分
      });

      const priority = scheduler.calculatePriority(state, lowScore);

      // 低分单词应该获得 wordScore 权重 (10)
      expect(priority).toBeGreaterThanOrEqual(10);
    });

    it('should return 0 priority for non-new word without score or overdue', () => {
      const futureReviewState = createMockLearningState({
        wordId: 'word-1',
        state: WordState.LEARNING,
        nextReviewDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 未来7天
      });

      const priority = scheduler.calculatePriority(futureReviewState, undefined);

      expect(priority).toBe(0);
    });

    it('should combine multiple priority factors', () => {
      const now = Date.now();
      const state = createMockLearningState({
        wordId: 'word-1',
        state: WordState.LEARNING,
        nextReviewDate: now - 3 * 24 * 60 * 60 * 1000, // 3天前到期
      });
      const score = createMockWordScore({
        wordId: 'word-1',
        totalAttempts: 10,
        correctAttempts: 3, // 70% error rate
        totalScore: 25, // 低分
      });

      vi.setSystemTime(now);
      const priority = scheduler.calculatePriority(state, score);
      vi.useRealTimers();

      // 应该综合多个因素
      expect(priority).toBeGreaterThan(30);
    });
  });

  describe('generateLearningQueue', () => {
    it('should generate a queue with specified target count', () => {
      const states = [
        createMockLearningState({ wordId: 'word-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-2', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-3', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-4', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-5', state: WordState.NEW }),
      ];
      const scores = new Map<string, WordScore>();

      const queue = scheduler.generateLearningQueue(states, scores, 3, 0.7);

      expect(queue.length).toBe(3);
    });

    it('should prioritize new words based on user accuracy', () => {
      const now = Date.now();
      const states = [
        createMockLearningState({ wordId: 'new-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'new-2', state: WordState.NEW }),
        createMockLearningState({
          wordId: 'review-1',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
        createMockLearningState({
          wordId: 'review-2',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
      ];
      const scores = new Map<string, WordScore>();

      vi.setSystemTime(now);
      // 高正确率用户应该获得更多新单词
      const highAccuracyQueue = scheduler.generateLearningQueue(states, scores, 4, 0.9);
      vi.useRealTimers();

      // 高正确率时，新单词比例为 0.5 (highAccuracy)
      const newWordCount = highAccuracyQueue.filter(id => id.startsWith('new-')).length;
      expect(newWordCount).toBeGreaterThanOrEqual(1);
    });

    it('should reduce new word ratio for low accuracy users', () => {
      const now = Date.now();
      const states = [
        createMockLearningState({ wordId: 'new-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'new-2', state: WordState.NEW }),
        createMockLearningState({ wordId: 'new-3', state: WordState.NEW }),
        createMockLearningState({ wordId: 'new-4', state: WordState.NEW }),
        createMockLearningState({
          wordId: 'review-1',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
        createMockLearningState({
          wordId: 'review-2',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
        createMockLearningState({
          wordId: 'review-3',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
        createMockLearningState({
          wordId: 'review-4',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
      ];
      const scores = new Map<string, WordScore>();

      vi.setSystemTime(now);
      // 低正确率用户应该获得更少新单词
      const lowAccuracyQueue = scheduler.generateLearningQueue(states, scores, 8, 0.5);
      vi.useRealTimers();

      // 低正确率时，新单词比例为 0.1 (lowAccuracy)
      // targetCount=8, newWordRatio=0.1, 所以新单词数量 = round(8 * 0.1) = 1
      // 但如果复习单词不足，会用新单词补充
      const newWordCount = lowAccuracyQueue.filter(id => id.startsWith('new-')).length;
      const reviewWordCount = lowAccuracyQueue.filter(id => id.startsWith('review-')).length;

      // 验证低正确率时，复习单词优先（占更大比例）
      expect(reviewWordCount).toBeGreaterThanOrEqual(newWordCount);
    });

    it('should return empty queue when no words available', () => {
      const states: WordLearningState[] = [];
      const scores = new Map<string, WordScore>();

      const queue = scheduler.generateLearningQueue(states, scores, 10, 0.7);

      expect(queue).toEqual([]);
    });

    it('should handle case when target count exceeds available words', () => {
      const states = [
        createMockLearningState({ wordId: 'word-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-2', state: WordState.NEW }),
      ];
      const scores = new Map<string, WordScore>();

      const queue = scheduler.generateLearningQueue(states, scores, 10, 0.7);

      expect(queue.length).toBe(2); // 只返回可用的单词
    });
  });

  describe('mixNewAndReviewWords', () => {
    it('should mix new words and review words based on counts', () => {
      const newWords = [
        createMockLearningState({ wordId: 'new-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'new-2', state: WordState.NEW }),
        createMockLearningState({ wordId: 'new-3', state: WordState.NEW }),
      ];
      const reviewWords = [
        createMockLearningState({ wordId: 'review-1', state: WordState.LEARNING }),
        createMockLearningState({ wordId: 'review-2', state: WordState.LEARNING }),
        createMockLearningState({ wordId: 'review-3', state: WordState.LEARNING }),
      ];
      const scores = new Map<string, WordScore>();

      const result = scheduler.mixNewAndReviewWords(newWords, reviewWords, 2, 2, scores);

      expect(result.length).toBe(4);
      expect(result.filter(id => id.startsWith('new-')).length).toBe(2);
      expect(result.filter(id => id.startsWith('review-')).length).toBe(2);
    });

    it('should prioritize overdue review words', () => {
      const now = Date.now();
      const newWords = [
        createMockLearningState({ wordId: 'new-1', state: WordState.NEW }),
      ];
      const reviewWords = [
        createMockLearningState({
          wordId: 'overdue',
          state: WordState.LEARNING,
          nextReviewDate: now - 7 * 24 * 60 * 60 * 1000, // 7天前到期
        }),
        createMockLearningState({
          wordId: 'not-overdue',
          state: WordState.LEARNING,
          nextReviewDate: now + 24 * 60 * 60 * 1000, // 明天到期
        }),
      ];
      const scores = new Map<string, WordScore>();

      vi.setSystemTime(now);
      const result = scheduler.mixNewAndReviewWords(newWords, reviewWords, 1, 1, scores);
      vi.useRealTimers();

      expect(result).toContain('overdue');
    });

    it('should prioritize words with high error rate', () => {
      const newWords: WordLearningState[] = [];
      const reviewWords = [
        createMockLearningState({ wordId: 'high-error', state: WordState.LEARNING }),
        createMockLearningState({ wordId: 'low-error', state: WordState.LEARNING }),
      ];
      const scores = new Map<string, WordScore>([
        ['high-error', createMockWordScore({
          wordId: 'high-error',
          totalAttempts: 10,
          correctAttempts: 3, // 70% error rate
        })],
        ['low-error', createMockWordScore({
          wordId: 'low-error',
          totalAttempts: 10,
          correctAttempts: 9, // 10% error rate
        })],
      ]);

      const result = scheduler.mixNewAndReviewWords(newWords, reviewWords, 0, 1, scores);

      expect(result[0]).toBe('high-error');
    });
  });

  describe('getDueWords', () => {
    it('should return words that are due for review', () => {
      const now = Date.now();
      const states = [
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
        createMockLearningState({
          wordId: 'not-due',
          state: WordState.LEARNING,
          nextReviewDate: now + 24 * 60 * 60 * 1000,
        }),
        createMockLearningState({
          wordId: 'new-word',
          state: WordState.NEW,
          nextReviewDate: now - 1000,
        }),
      ];

      vi.setSystemTime(now);
      const dueWords = scheduler.getDueWords(states);
      vi.useRealTimers();

      expect(dueWords).toContain('due-1');
      expect(dueWords).toContain('due-2');
      expect(dueWords).not.toContain('not-due');
      expect(dueWords).not.toContain('new-word'); // 新单词不计入到期
    });

    it('should return empty array when no words are due', () => {
      const now = Date.now();
      const states = [
        createMockLearningState({
          wordId: 'word-1',
          state: WordState.LEARNING,
          nextReviewDate: now + 24 * 60 * 60 * 1000,
        }),
      ];

      vi.setSystemTime(now);
      const dueWords = scheduler.getDueWords(states);
      vi.useRealTimers();

      expect(dueWords).toEqual([]);
    });

    it('should handle words without nextReviewDate', () => {
      const states = [
        createMockLearningState({
          wordId: 'word-1',
          state: WordState.LEARNING,
          nextReviewDate: null as unknown as number,
        }),
      ];

      const dueWords = scheduler.getDueWords(states);

      expect(dueWords).toEqual([]);
    });
  });

  describe('getUpcomingWords', () => {
    it('should return words due within specified days', () => {
      const now = Date.now();
      const states = [
        createMockLearningState({
          wordId: 'upcoming-1',
          state: WordState.LEARNING,
          nextReviewDate: now + 2 * 24 * 60 * 60 * 1000, // 2天后
        }),
        createMockLearningState({
          wordId: 'upcoming-2',
          state: WordState.REVIEWING,
          nextReviewDate: now + 5 * 24 * 60 * 60 * 1000, // 5天后
        }),
        createMockLearningState({
          wordId: 'too-far',
          state: WordState.LEARNING,
          nextReviewDate: now + 10 * 24 * 60 * 60 * 1000, // 10天后
        }),
        createMockLearningState({
          wordId: 'overdue',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000, // 已经到期
        }),
      ];

      vi.setSystemTime(now);
      const upcomingWords = scheduler.getUpcomingWords(states, 7);
      vi.useRealTimers();

      expect(upcomingWords).toContain('upcoming-1');
      expect(upcomingWords).toContain('upcoming-2');
      expect(upcomingWords).not.toContain('too-far');
      expect(upcomingWords).not.toContain('overdue');
    });

    it('should not include NEW state words', () => {
      const now = Date.now();
      const states = [
        createMockLearningState({
          wordId: 'new-word',
          state: WordState.NEW,
          nextReviewDate: now + 24 * 60 * 60 * 1000,
        }),
      ];

      vi.setSystemTime(now);
      const upcomingWords = scheduler.getUpcomingWords(states, 7);
      vi.useRealTimers();

      expect(upcomingWords).not.toContain('new-word');
    });

    it('should return empty array when no upcoming words', () => {
      const now = Date.now();
      const states = [
        createMockLearningState({
          wordId: 'word-1',
          state: WordState.LEARNING,
          nextReviewDate: now + 30 * 24 * 60 * 60 * 1000, // 30天后
        }),
      ];

      vi.setSystemTime(now);
      const upcomingWords = scheduler.getUpcomingWords(states, 7);
      vi.useRealTimers();

      expect(upcomingWords).toEqual([]);
    });
  });

  describe('updateConfig', () => {
    it('should update the configuration', () => {
      const newConfig = createMockConfig();
      newConfig.priorityWeights = {
        newWord: 50,
        errorRate: 25,
        overdueTime: 15,
        wordScore: 10,
      };

      scheduler.updateConfig(newConfig);

      // 验证新配置生效：新单词权重变为 50
      const newWordState = createMockLearningState({
        wordId: 'new-word',
        state: WordState.NEW,
      });
      const priority = scheduler.calculatePriority(newWordState, undefined);

      expect(priority).toBeGreaterThanOrEqual(50);
    });
  });
});
