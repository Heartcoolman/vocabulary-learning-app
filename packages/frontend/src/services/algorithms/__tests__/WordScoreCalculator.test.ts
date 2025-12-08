/**
 * WordScoreCalculator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WordScoreCalculator } from '../WordScoreCalculator';
import { WordScore, AnswerRecord, AlgorithmConfig } from '../../../types/models';

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

// 创建模拟答题记录
const createMockAnswerRecord = (overrides?: Partial<AnswerRecord>): AnswerRecord => ({
  id: 'record-1',
  userId: 'user-1',
  wordId: 'word-1',
  selectedAnswer: 'answer',
  correctAnswer: 'correct',
  isCorrect: true,
  timestamp: Date.now(),
  responseTime: 3000,
  dwellTime: 5000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('WordScoreCalculator', () => {
  let calculator: WordScoreCalculator;
  let config: AlgorithmConfig;

  beforeEach(() => {
    config = createMockConfig();
    calculator = new WordScoreCalculator(config);
  });

  describe('calculateAccuracyScore', () => {
    it('should return 0 when no attempts', () => {
      const score = createMockWordScore({ totalAttempts: 0, correctAttempts: 0 });
      const result = calculator.calculateAccuracyScore(score);
      expect(result).toBe(0);
    });

    it('should calculate full score (40) when 100% accuracy', () => {
      const score = createMockWordScore({ totalAttempts: 10, correctAttempts: 10 });
      const result = calculator.calculateAccuracyScore(score);
      expect(result).toBe(40);
    });

    it('should calculate proportional score based on accuracy', () => {
      const score = createMockWordScore({ totalAttempts: 10, correctAttempts: 5 });
      const result = calculator.calculateAccuracyScore(score);
      expect(result).toBe(20); // 50% accuracy = 40 * 0.5 = 20
    });

    it('should calculate score for 70% accuracy', () => {
      const score = createMockWordScore({ totalAttempts: 10, correctAttempts: 7 });
      const result = calculator.calculateAccuracyScore(score);
      expect(result).toBe(28); // 70% accuracy = 40 * 0.7 = 28
    });
  });

  describe('calculateSpeedScore', () => {
    it('should return 0 when average response time is 0', () => {
      const score = createMockWordScore({ averageResponseTime: 0 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(0);
    });

    it('should return 30 for excellent speed (< 3000ms)', () => {
      const score = createMockWordScore({ averageResponseTime: 2000 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(30);
    });

    it('should return 20 for good speed (3000-5000ms)', () => {
      const score = createMockWordScore({ averageResponseTime: 4000 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(20);
    });

    it('should return 10 for average speed (5000-10000ms)', () => {
      const score = createMockWordScore({ averageResponseTime: 7000 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(10);
    });

    it('should return 0 for slow speed (> 10000ms)', () => {
      const score = createMockWordScore({ averageResponseTime: 15000 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(0);
    });

    it('should handle boundary case at exactly 3000ms', () => {
      const score = createMockWordScore({ averageResponseTime: 3000 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(20); // >= 3000ms falls into good category
    });

    it('should handle boundary case at exactly 5000ms', () => {
      const score = createMockWordScore({ averageResponseTime: 5000 });
      const result = calculator.calculateSpeedScore(score);
      expect(result).toBe(10); // >= 5000ms falls into average category
    });
  });

  describe('calculateStabilityScore', () => {
    it('should return 0 when no records', () => {
      const result = calculator.calculateStabilityScore([]);
      expect(result).toBe(0);
    });

    it('should return 20 when all 5 answers are correct', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.calculateStabilityScore(records);
      expect(result).toBe(20);
    });

    it('should return 10 when 1 answer is wrong in last 5', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.calculateStabilityScore(records);
      expect(result).toBe(10);
    });

    it('should return 0 when 2 or more answers are wrong', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.calculateStabilityScore(records);
      expect(result).toBe(0);
    });

    it('should only consider last 5 records even if more are provided', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: false }), // 会被忽略
        createMockAnswerRecord({ isCorrect: false }), // 会被忽略
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.calculateStabilityScore(records);
      expect(result).toBe(20); // 最后5次全对
    });

    it('should handle fewer than 5 records', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.calculateStabilityScore(records);
      expect(result).toBe(20); // 3次全对
    });
  });

  describe('calculateProficiencyScore', () => {
    it('should return 0 when average dwell time is 0', () => {
      const score = createMockWordScore({ averageDwellTime: 0 });
      const result = calculator.calculateProficiencyScore(score);
      expect(result).toBe(0);
    });

    it('should return 10 for fast dwell time (< 5000ms)', () => {
      const score = createMockWordScore({ averageDwellTime: 3000 });
      const result = calculator.calculateProficiencyScore(score);
      expect(result).toBe(10);
    });

    it('should return 5 for medium dwell time (5000-10000ms)', () => {
      const score = createMockWordScore({ averageDwellTime: 7000 });
      const result = calculator.calculateProficiencyScore(score);
      expect(result).toBe(5);
    });

    it('should return 0 for slow dwell time (> 10000ms)', () => {
      const score = createMockWordScore({ averageDwellTime: 15000 });
      const result = calculator.calculateProficiencyScore(score);
      expect(result).toBe(0);
    });
  });

  describe('calculateScore', () => {
    it('should calculate total score using all components and weights', () => {
      const score = createMockWordScore({
        totalAttempts: 10,
        correctAttempts: 10, // 100% accuracy -> accuracyScore = 40
        averageResponseTime: 2000, // excellent -> speedScore = 30
        averageDwellTime: 3000, // fast -> proficiencyScore = 10
      });
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ]; // 全对 -> stabilityScore = 20

      const result = calculator.calculateScore(score, records);

      // 总分 = (accuracyScore/40)*40 + (speedScore/30)*30 + (stabilityScore/20)*20 + (proficiencyScore/10)*10
      // = (40/40)*40 + (30/30)*30 + (20/20)*20 + (10/10)*10 = 40 + 30 + 20 + 10 = 100
      expect(result.totalScore).toBe(100);
      expect(result.accuracyScore).toBe(40);
      expect(result.speedScore).toBe(30);
      expect(result.stabilityScore).toBe(20);
      expect(result.proficiencyScore).toBe(10);
    });

    it('should return low score for poor performance', () => {
      const score = createMockWordScore({
        totalAttempts: 10,
        correctAttempts: 2, // 20% accuracy -> accuracyScore = 8
        averageResponseTime: 15000, // slow -> speedScore = 0
        averageDwellTime: 15000, // slow -> proficiencyScore = 0
      });
      const records = [
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: false }),
      ]; // 4次错 -> stabilityScore = 0

      const result = calculator.calculateScore(score, records);

      expect(result.accuracyScore).toBe(8);
      expect(result.speedScore).toBe(0);
      expect(result.stabilityScore).toBe(0);
      expect(result.proficiencyScore).toBe(0);
      // totalScore = (8/40)*40 + 0 + 0 + 0 = 8
      expect(result.totalScore).toBe(8);
    });

    it('should include updatedAt in result', () => {
      const score = createMockWordScore();
      const records: AnswerRecord[] = [];

      const result = calculator.calculateScore(score, records);

      expect(result.updatedAt).toBeDefined();
      expect(typeof result.updatedAt).toBe('number');
    });
  });

  describe('updateScoreStatistics', () => {
    it('should increment totalAttempts', () => {
      const score = createMockWordScore({ totalAttempts: 10, correctAttempts: 7 });
      const record = createMockAnswerRecord({ isCorrect: true });

      const result = calculator.updateScoreStatistics(score, record);

      expect(result.totalAttempts).toBe(11);
    });

    it('should increment correctAttempts when answer is correct', () => {
      const score = createMockWordScore({ totalAttempts: 10, correctAttempts: 7 });
      const record = createMockAnswerRecord({ isCorrect: true });

      const result = calculator.updateScoreStatistics(score, record);

      expect(result.correctAttempts).toBe(8);
    });

    it('should not increment correctAttempts when answer is wrong', () => {
      const score = createMockWordScore({ totalAttempts: 10, correctAttempts: 7 });
      const record = createMockAnswerRecord({ isCorrect: false });

      const result = calculator.updateScoreStatistics(score, record);

      expect(result.correctAttempts).toBe(7);
    });

    it('should update average response time', () => {
      const score = createMockWordScore({
        totalAttempts: 4,
        averageResponseTime: 5000, // total = 20000
      });
      const record = createMockAnswerRecord({ responseTime: 10000 });

      const result = calculator.updateScoreStatistics(score, record);

      // (20000 + 10000) / 5 = 6000
      expect(result.averageResponseTime).toBe(6000);
    });

    it('should update average dwell time', () => {
      const score = createMockWordScore({
        totalAttempts: 4,
        averageDwellTime: 8000, // total = 32000
      });
      const record = createMockAnswerRecord({ dwellTime: 3000 });

      const result = calculator.updateScoreStatistics(score, record);

      // (32000 + 3000) / 5 = 7000
      expect(result.averageDwellTime).toBe(7000);
    });

    it('should handle undefined responseTime', () => {
      const score = createMockWordScore({
        totalAttempts: 4,
        averageResponseTime: 5000,
      });
      const record = createMockAnswerRecord({ responseTime: undefined });

      const result = calculator.updateScoreStatistics(score, record);

      // (20000 + 0) / 5 = 4000
      expect(result.averageResponseTime).toBe(4000);
    });

    it('should handle first attempt', () => {
      const score = createMockWordScore({
        totalAttempts: 0,
        correctAttempts: 0,
        averageResponseTime: 0,
        averageDwellTime: 0,
      });
      const record = createMockAnswerRecord({
        isCorrect: true,
        responseTime: 3000,
        dwellTime: 5000,
      });

      const result = calculator.updateScoreStatistics(score, record);

      expect(result.totalAttempts).toBe(1);
      expect(result.correctAttempts).toBe(1);
      expect(result.averageResponseTime).toBe(3000);
      expect(result.averageDwellTime).toBe(5000);
    });
  });

  describe('updateRecentAccuracy', () => {
    it('should return 0 when no records', () => {
      const result = calculator.updateRecentAccuracy([]);
      expect(result).toBe(0);
    });

    it('should calculate accuracy for last 5 records', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.updateRecentAccuracy(records);
      expect(result).toBe(0.8); // 4/5 = 0.8
    });

    it('should only use last 5 records if more are provided', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.updateRecentAccuracy(records);
      expect(result).toBe(1); // 最后5次全对
    });

    it('should handle fewer than 5 records', () => {
      const records = [
        createMockAnswerRecord({ isCorrect: true }),
        createMockAnswerRecord({ isCorrect: false }),
        createMockAnswerRecord({ isCorrect: true }),
      ];
      const result = calculator.updateRecentAccuracy(records);
      expect(result).toBeCloseTo(0.667, 2); // 2/3
    });
  });

  describe('needsIntensivePractice', () => {
    it('should return true when score is below 40', () => {
      const score = createMockWordScore({ totalScore: 30 });
      expect(calculator.needsIntensivePractice(score)).toBe(true);
    });

    it('should return false when score is 40 or above', () => {
      const score = createMockWordScore({ totalScore: 40 });
      expect(calculator.needsIntensivePractice(score)).toBe(false);
    });

    it('should return false for high score', () => {
      const score = createMockWordScore({ totalScore: 80 });
      expect(calculator.needsIntensivePractice(score)).toBe(false);
    });
  });

  describe('isMastered', () => {
    it('should return true when score > 80 and consecutive high score >= 3', () => {
      const score = createMockWordScore({ totalScore: 85 });
      expect(calculator.isMastered(score, 3)).toBe(true);
    });

    it('should return false when score > 80 but consecutive high score < 3', () => {
      const score = createMockWordScore({ totalScore: 85 });
      expect(calculator.isMastered(score, 2)).toBe(false);
    });

    it('should return false when score <= 80 even with high consecutive count', () => {
      const score = createMockWordScore({ totalScore: 80 });
      expect(calculator.isMastered(score, 5)).toBe(false);
    });

    it('should return false for low score with low consecutive count', () => {
      const score = createMockWordScore({ totalScore: 50 });
      expect(calculator.isMastered(score, 1)).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update the configuration', () => {
      const newConfig = createMockConfig();
      newConfig.speedThresholds = {
        excellent: 2000,
        good: 4000,
        average: 8000,
        slow: 8000,
      };

      calculator.updateConfig(newConfig);

      // 验证新配置生效
      const score = createMockWordScore({ averageResponseTime: 2500 });
      const speedScore = calculator.calculateSpeedScore(score);
      // 2500ms 在新配置中属于 good（2000-4000），应该返回 20
      expect(speedScore).toBe(20);
    });
  });
});
