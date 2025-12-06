/**
 * SpacedRepetitionEngine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpacedRepetitionEngine } from '../SpacedRepetitionEngine';
import { WordLearningState, WordState, AlgorithmConfig } from '../../../types/models';

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
  lastReviewDate: Date.now() - 24 * 60 * 60 * 1000, // 1天前
  nextReviewDate: Date.now(),
  currentInterval: 1,
  consecutiveCorrect: 1,
  consecutiveWrong: 0,
  createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now(),
  ...overrides,
});

describe('SpacedRepetitionEngine', () => {
  let engine: SpacedRepetitionEngine;
  let config: AlgorithmConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfig();
    engine = new SpacedRepetitionEngine(config);
  });

  describe('calculateNextReview', () => {
    it('should calculate next review date based on review count and ease factor', () => {
      const now = Date.now();
      const state = createMockLearningState({
        reviewCount: 2,
        lastReviewDate: now,
        easeFactor: 2.0,
      });

      const nextReviewDate = engine.calculateNextReviewDate(state);

      // reviewCount=2 对应 intervals[2]=7 天
      // 由于 reviewCount <= 2，不应用 easeFactor
      const expectedInterval = 7 * 24 * 60 * 60 * 1000;
      expect(nextReviewDate).toBe(now + expectedInterval);
    });

    it('should increase interval on higher review counts with ease factor applied', () => {
      const now = Date.now();
      const state = createMockLearningState({
        reviewCount: 3,
        lastReviewDate: now,
        easeFactor: 2.0,
      });

      const nextReviewDate = engine.calculateNextReviewDate(state);

      // reviewCount=3 对应 intervals[3]=15 天
      // reviewCount > 2，应用 easeFactor=2.0
      const expectedInterval = 15 * 2.0 * 24 * 60 * 60 * 1000;
      expect(nextReviewDate).toBe(now + expectedInterval);
    });

    it('should use last interval when review count exceeds intervals array length', () => {
      const now = Date.now();
      const state = createMockLearningState({
        reviewCount: 10, // 超过 intervals 数组长度
        lastReviewDate: now,
        easeFactor: 1.5,
      });

      const nextReviewDate = engine.calculateNextReviewDate(state);

      // 使用最后一个间隔 30 天，应用 easeFactor=1.5
      const expectedInterval = 30 * 1.5 * 24 * 60 * 60 * 1000;
      expect(nextReviewDate).toBe(now + expectedInterval);
    });

    it('should not apply ease factor for early reviews (reviewCount <= 2)', () => {
      const now = Date.now();
      const state1 = createMockLearningState({
        reviewCount: 1,
        lastReviewDate: now,
        easeFactor: 2.5,
      });
      const state2 = createMockLearningState({
        reviewCount: 2,
        lastReviewDate: now,
        easeFactor: 2.5,
      });

      const nextReview1 = engine.calculateNextReviewDate(state1);
      const nextReview2 = engine.calculateNextReviewDate(state2);

      // reviewCount=1 对应 intervals[1]=3 天，不应用 easeFactor
      expect(nextReview1).toBe(now + 3 * 24 * 60 * 60 * 1000);
      // reviewCount=2 对应 intervals[2]=7 天，不应用 easeFactor
      expect(nextReview2).toBe(now + 7 * 24 * 60 * 60 * 1000);
    });

    it('should ensure minimum interval of 1 day', () => {
      const now = Date.now();
      const state = createMockLearningState({
        reviewCount: 0,
        lastReviewDate: now,
        easeFactor: 0.5, // 低于正常范围的 easeFactor
      });

      const nextReviewDate = engine.calculateNextReviewDate(state);

      // 即使计算结果很小，也应保证至少 1 天的间隔
      const minInterval = 1 * 24 * 60 * 60 * 1000;
      expect(nextReviewDate - now).toBeGreaterThanOrEqual(minInterval);
    });
  });

  describe('SM-2 algorithm', () => {
    it('should update ease factor when answering correctly with fast response', () => {
      const state = createMockLearningState({
        easeFactor: 2.0,
        consecutiveCorrect: 1,
        masteryLevel: 1,
      });

      // 快速答对（< 3000ms）
      const result = engine.processCorrectAnswer(state, 2000, 0.8, 70);

      // easeFactor 应该增加 0.1
      expect(result.easeFactor).toBe(2.1);
    });

    it('should update ease factor moderately with good response time', () => {
      const state = createMockLearningState({
        easeFactor: 2.0,
        consecutiveCorrect: 1,
        masteryLevel: 1,
      });

      // 良好速度答对（3000-5000ms）
      const result = engine.processCorrectAnswer(state, 4000, 0.8, 70);

      // easeFactor 应该增加 0.05
      expect(result.easeFactor).toBe(2.05);
    });

    it('should not increase ease factor above 2.5', () => {
      const state = createMockLearningState({
        easeFactor: 2.45,
        consecutiveCorrect: 1,
        masteryLevel: 1,
      });

      const result = engine.processCorrectAnswer(state, 2000, 0.8, 70);

      expect(result.easeFactor).toBe(2.5);
    });

    it('should decrease ease factor on wrong answer', () => {
      const state = createMockLearningState({
        easeFactor: 2.0,
        consecutiveCorrect: 3,
        masteryLevel: 2,
      });

      const result = engine.processWrongAnswer(state);

      // easeFactor 应该降低 0.2
      expect(result.easeFactor).toBe(1.8);
    });

    it('should not decrease ease factor below 1.3', () => {
      const state = createMockLearningState({
        easeFactor: 1.4,
        consecutiveCorrect: 0,
        masteryLevel: 1,
      });

      const result = engine.processWrongAnswer(state);

      expect(result.easeFactor).toBe(1.3);
    });

    it('should calculate interval based on review count', () => {
      const now = Date.now();

      // 第一次复习
      const state0 = createMockLearningState({
        reviewCount: 0,
        lastReviewDate: now,
      });
      const next0 = engine.calculateNextReviewDate(state0);
      expect(next0).toBe(now + 1 * 24 * 60 * 60 * 1000); // 1天

      // 第二次复习
      const state1 = createMockLearningState({
        reviewCount: 1,
        lastReviewDate: now,
      });
      const next1 = engine.calculateNextReviewDate(state1);
      expect(next1).toBe(now + 3 * 24 * 60 * 60 * 1000); // 3天
    });

    it('should handle quality ratings through response time', () => {
      const state = createMockLearningState({
        easeFactor: 2.0,
        consecutiveCorrect: 2,
        masteryLevel: 2,
      });

      // 优秀（< 3000ms）- easeFactor + 0.1
      const excellentResult = engine.processCorrectAnswer(state, 2500, 0.8, 70);
      expect(excellentResult.easeFactor).toBe(2.1);

      // 良好（3000-5000ms）- easeFactor + 0.05
      const goodResult = engine.processCorrectAnswer(state, 4500, 0.8, 70);
      expect(goodResult.easeFactor).toBe(2.05);

      // 一般（> 5000ms）- easeFactor 不变
      const averageResult = engine.processCorrectAnswer(state, 6000, 0.8, 70);
      expect(averageResult.easeFactor).toBe(2.0);
    });
  });

  describe('getDueWords (via processCorrectAnswer/processWrongAnswer)', () => {
    it('should return due words by setting appropriate nextReviewDate', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const state = createMockLearningState({
        reviewCount: 0,
        lastReviewDate: null,
        consecutiveCorrect: 0,
        masteryLevel: 0,
        state: WordState.NEW,
      });

      const result = engine.processCorrectAnswer(state, 3000, 0.7, 50);

      // 应该设置 nextReviewDate
      expect(result.nextReviewDate).toBeDefined();
      expect(result.nextReviewDate).toBeGreaterThan(now);

      vi.useRealTimers();
    });

    it('should order by urgency - wrong answers get shorter intervals', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const state = createMockLearningState({
        reviewCount: 3,
        lastReviewDate: now,
        consecutiveCorrect: 3,
        masteryLevel: 3,
        easeFactor: 2.0,
      });

      const correctResult = engine.processCorrectAnswer(state, 3000, 0.8, 70);
      const wrongResult = engine.processWrongAnswer(state);

      // 答错后的间隔应该更短（重置为1天）
      expect(wrongResult.currentInterval).toBe(1);
      // 答对后的间隔应该更长
      expect(correctResult.currentInterval!).toBeGreaterThan(wrongResult.currentInterval!);

      vi.useRealTimers();
    });

    it('should reset interval to 1 day after wrong answer', () => {
      const state = createMockLearningState({
        reviewCount: 5,
        currentInterval: 30,
        consecutiveCorrect: 5,
      });

      const result = engine.processWrongAnswer(state);

      expect(result.currentInterval).toBe(1);
    });
  });

  describe('prediction', () => {
    it('should predict recall probability through mastery level updates', () => {
      // 测试不同掌握程度的进阶
      const state = createMockLearningState({
        masteryLevel: 1,
        consecutiveCorrect: 1, // 需要 2 次连续正确才能升到 level 2
        reviewCount: 2,
        state: WordState.LEARNING,
      });

      // 满足 level 2 的条件：requiredCorrectStreak=2, minAccuracy=0.6, minScore=50
      const result = engine.processCorrectAnswer(state, 3000, 0.7, 60);

      // consecutiveCorrect 变为 2，应该升级到 level 2
      expect(result.masteryLevel).toBe(2);
      expect(result.state).toBe(WordState.REVIEWING);
    });

    it('should predict lower recall after wrong answer (mastery decreases)', () => {
      const state = createMockLearningState({
        masteryLevel: 3,
        consecutiveCorrect: 3,
        consecutiveWrong: 0,
      });

      const result = engine.processWrongAnswer(state);

      // 掌握程度降低
      expect(result.masteryLevel).toBe(2);
      expect(result.consecutiveCorrect).toBe(0);
      expect(result.consecutiveWrong).toBe(1);
    });

    it('should cap consecutive wrong at 5', () => {
      const state = createMockLearningState({
        masteryLevel: 1,
        consecutiveWrong: 5,
      });

      const result = engine.processWrongAnswer(state);

      expect(result.consecutiveWrong).toBe(5); // 不应该超过 5
    });

    it('should transition to MASTERED state when reaching level 5', () => {
      const state = createMockLearningState({
        masteryLevel: 4,
        consecutiveCorrect: 4, // 需要 5 次连续正确才能升到 level 5
        reviewCount: 10,
        state: WordState.REVIEWING,
      });

      // 满足 level 5 的条件：requiredCorrectStreak=5, minAccuracy=0.9, minScore=90
      const result = engine.processCorrectAnswer(state, 2000, 0.95, 95);

      expect(result.masteryLevel).toBe(5);
      expect(result.state).toBe(WordState.MASTERED);
    });

    it('should not exceed mastery level 5', () => {
      const state = createMockLearningState({
        masteryLevel: 5,
        consecutiveCorrect: 10,
        state: WordState.MASTERED,
      });

      const result = engine.processCorrectAnswer(state, 2000, 1.0, 100);

      expect(result.masteryLevel).toBe(5);
    });

    it('should transition from NEW to LEARNING on first correct answer', () => {
      const state = createMockLearningState({
        masteryLevel: 0,
        consecutiveCorrect: 0,
        reviewCount: 0,
        state: WordState.NEW,
      });

      const result = engine.processCorrectAnswer(state, 3000, 0.5, 30);

      expect(result.state).toBe(WordState.LEARNING);
    });

    it('should transition to NEW state when mastery drops to 0', () => {
      const state = createMockLearningState({
        masteryLevel: 1,
        consecutiveWrong: 2,
        state: WordState.LEARNING,
      });

      const result = engine.processWrongAnswer(state);

      expect(result.masteryLevel).toBe(0);
      expect(result.state).toBe(WordState.NEW);
    });
  });

  describe('updateConfig', () => {
    it('should update algorithm configuration', () => {
      const newConfig = createMockConfig();
      newConfig.reviewIntervals = [1, 2, 4, 8, 16];

      engine.updateConfig(newConfig);

      // 验证新配置生效
      const now = Date.now();
      const state = createMockLearningState({
        reviewCount: 2,
        lastReviewDate: now,
      });

      const nextReview = engine.calculateNextReviewDate(state);
      // 使用新的 intervals[2]=4
      expect(nextReview).toBe(now + 4 * 24 * 60 * 60 * 1000);
    });
  });

  describe('updateMasteryLevel', () => {
    it('should not upgrade if accuracy is insufficient', () => {
      const state = createMockLearningState({
        masteryLevel: 1,
        consecutiveCorrect: 3,
      });

      // 正确率不满足 level 2 要求（需要 0.6）
      const result = engine.processCorrectAnswer(state, 3000, 0.5, 60);

      expect(result.masteryLevel).toBe(1);
    });

    it('should not upgrade if score is insufficient', () => {
      const state = createMockLearningState({
        masteryLevel: 1,
        consecutiveCorrect: 3,
      });

      // 分数不满足 level 2 要求（需要 50）
      const result = engine.processCorrectAnswer(state, 3000, 0.7, 40);

      expect(result.masteryLevel).toBe(1);
    });

    it('should upgrade when all conditions are met', () => {
      const state = createMockLearningState({
        masteryLevel: 2,
        consecutiveCorrect: 2, // 升到 level 3 需要 3 次
      });

      // 所有条件满足
      const result = engine.processCorrectAnswer(state, 3000, 0.75, 65);

      expect(result.masteryLevel).toBe(3);
    });
  });
});
