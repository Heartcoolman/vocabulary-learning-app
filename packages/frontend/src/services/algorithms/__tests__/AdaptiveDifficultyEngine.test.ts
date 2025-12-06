/**
 * AdaptiveDifficultyEngine Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveDifficultyEngine } from '../AdaptiveDifficultyEngine';
import { AlgorithmConfig } from '../../../types/models';

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

describe('AdaptiveDifficultyEngine', () => {
  let engine: AdaptiveDifficultyEngine;
  let config: AlgorithmConfig;

  beforeEach(() => {
    config = createMockConfig();
    engine = new AdaptiveDifficultyEngine(config);
  });

  describe('adjustDifficulty', () => {
    it('should not adjust when interval requirement not met', () => {
      // 设置 lastAdjustmentSession 为当前 session
      engine.adjustDifficulty(10, 5, 0, 1); // 触发调整

      // 立即再次调整应该失败（间隔为1）
      const result = engine.adjustDifficulty(15, 5, 0, 1);

      expect(result.shouldAdjust).toBe(false);
      expect(result.reason).toBe('未达到最小调整间隔');
    });

    it('should increase difficulty when consecutive correct threshold met', () => {
      const result = engine.adjustDifficulty(10, 5, 0, 1);

      expect(result.shouldAdjust).toBe(true);
      expect(result.newWordCount).toBe(15); // 10 + 50% = 15
      expect(result.reason).toContain('连续答对');
    });

    it('should decrease difficulty when consecutive wrong threshold met', () => {
      const result = engine.adjustDifficulty(10, 0, 3, 1);

      expect(result.shouldAdjust).toBe(true);
      expect(result.newWordCount).toBe(7); // 10 - 30% = 7
      expect(result.reason).toContain('连续答错');
    });

    it('should not decrease below minimum of 5 words', () => {
      const result = engine.adjustDifficulty(6, 0, 3, 1);

      expect(result.shouldAdjust).toBe(true);
      expect(result.newWordCount).toBe(5); // 不能低于 5
    });

    it('should not adjust when thresholds not met', () => {
      const result = engine.adjustDifficulty(10, 3, 1, 1);

      expect(result.shouldAdjust).toBe(false);
      expect(result.reason).toBe('未达到调整阈值');
    });

    it('should allow adjustment after interval passes', () => {
      // 第一次调整
      engine.adjustDifficulty(10, 5, 0, 1);

      // 等待一个 session 后调整
      const result = engine.adjustDifficulty(15, 5, 0, 2);

      expect(result.shouldAdjust).toBe(true);
    });

    it('should prioritize correct threshold over wrong threshold', () => {
      // 如果同时满足两个阈值，先检查正确阈值
      const result = engine.adjustDifficulty(10, 5, 3, 1);

      expect(result.shouldAdjust).toBe(true);
      expect(result.newWordCount).toBe(15); // 增加难度
    });
  });

  describe('calculateNewWordRatio', () => {
    it('should return high accuracy ratio for accuracy > 0.9', () => {
      const ratio = engine.calculateNewWordRatio(0.95);
      expect(ratio).toBe(0.5); // highAccuracy
    });

    it('should return low accuracy ratio for accuracy < 0.6', () => {
      const ratio = engine.calculateNewWordRatio(0.5);
      expect(ratio).toBe(0.1); // lowAccuracy
    });

    it('should return default ratio for normal accuracy', () => {
      const ratio = engine.calculateNewWordRatio(0.75);
      expect(ratio).toBe(0.3); // default
    });

    it('should handle boundary case at exactly 0.9', () => {
      const ratio = engine.calculateNewWordRatio(0.9);
      expect(ratio).toBe(0.3); // default (not > 0.9)
    });

    it('should handle boundary case at exactly 0.6', () => {
      const ratio = engine.calculateNewWordRatio(0.6);
      expect(ratio).toBe(0.3); // default (not < 0.6)
    });
  });

  describe('recordSessionStats', () => {
    it('should record session statistics', () => {
      const stats = {
        sessionId: 'session-1',
        totalWords: 10,
        correctCount: 8,
        wrongCount: 2,
        consecutiveCorrect: 5,
        consecutiveWrong: 0,
        accuracy: 0.8,
        timestamp: Date.now(),
      };

      engine.recordSessionStats(stats);

      const history = engine.getSessionHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toEqual(stats);
    });

    it('should keep only last 10 sessions', () => {
      for (let i = 0; i < 15; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 8,
          wrongCount: 2,
          consecutiveCorrect: 5,
          consecutiveWrong: 0,
          accuracy: 0.8,
          timestamp: Date.now() + i,
        });
      }

      const history = engine.getSessionHistory();
      expect(history.length).toBe(10);
      expect(history[0].sessionId).toBe('session-5'); // 前5个被移除
    });
  });

  describe('getSessionHistory', () => {
    it('should return copy of session history', () => {
      const stats = {
        sessionId: 'session-1',
        totalWords: 10,
        correctCount: 8,
        wrongCount: 2,
        consecutiveCorrect: 5,
        consecutiveWrong: 0,
        accuracy: 0.8,
        timestamp: Date.now(),
      };

      engine.recordSessionStats(stats);

      const history = engine.getSessionHistory();
      history.push({} as any); // 修改返回的数组

      // 原始历史不应该被修改
      expect(engine.getSessionHistory().length).toBe(1);
    });
  });

  describe('analyzeTrend', () => {
    it('should return insufficient data message when < 3 sessions', () => {
      engine.recordSessionStats({
        sessionId: 'session-1',
        totalWords: 10,
        correctCount: 8,
        wrongCount: 2,
        consecutiveCorrect: 5,
        consecutiveWrong: 0,
        accuracy: 0.8,
        timestamp: Date.now(),
      });

      const trend = engine.analyzeTrend();

      expect(trend.isImproving).toBe(false);
      expect(trend.averageAccuracy).toBe(0);
      expect(trend.recommendation).toBe('数据不足，继续学习');
    });

    it('should detect improving trend', () => {
      // 添加5个session，后面的正确率更高
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 6 + i, // 6, 7, 8, 9, 10
          wrongCount: 4 - i,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.6 + i * 0.1, // 0.6, 0.7, 0.8, 0.9, 1.0
          timestamp: Date.now() + i,
        });
      }

      const trend = engine.analyzeTrend();

      expect(trend.isImproving).toBe(true);
    });

    it('should detect declining trend', () => {
      // 添加5个session，后面的正确率更低
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 10 - i, // 10, 9, 8, 7, 6
          wrongCount: i,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 1.0 - i * 0.1, // 1.0, 0.9, 0.8, 0.7, 0.6
          timestamp: Date.now() + i,
        });
      }

      const trend = engine.analyzeTrend();

      expect(trend.isImproving).toBe(false);
    });

    it('should calculate correct average accuracy', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 8,
          wrongCount: 2,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.8,
          timestamp: Date.now() + i,
        });
      }

      const trend = engine.analyzeTrend();

      expect(trend.averageAccuracy).toBe(0.8);
    });

    it('should provide appropriate recommendation for excellent improving performance', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 8 + Math.floor(i / 2),
          wrongCount: 2,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.85 + i * 0.02, // 0.85 -> 0.93
          timestamp: Date.now() + i,
        });
      }

      const trend = engine.analyzeTrend();

      expect(trend.recommendation).toContain('表现优秀');
    });

    it('should provide appropriate recommendation for low declining performance', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 6 - Math.floor(i / 2),
          wrongCount: 4,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.55 - i * 0.02, // 0.55 -> 0.47
          timestamp: Date.now() + i,
        });
      }

      const trend = engine.analyzeTrend();

      expect(trend.recommendation).toContain('减少学习量');
    });
  });

  describe('resetAdjustmentHistory', () => {
    it('should reset all history', () => {
      // 添加一些会话历史
      engine.recordSessionStats({
        sessionId: 'session-1',
        totalWords: 10,
        correctCount: 8,
        wrongCount: 2,
        consecutiveCorrect: 5,
        consecutiveWrong: 0,
        accuracy: 0.8,
        timestamp: Date.now(),
      });

      // 触发一次调整
      engine.adjustDifficulty(10, 5, 0, 1);

      // 重置
      engine.resetAdjustmentHistory();

      expect(engine.getSessionHistory().length).toBe(0);

      // 应该可以立即调整（lastAdjustmentSession 被重置为 0）
      const result = engine.adjustDifficulty(10, 5, 0, 1);
      expect(result.shouldAdjust).toBe(true);
    });
  });

  describe('getRecommendedWordCount', () => {
    it('should return base count when no session history', () => {
      const count = engine.getRecommendedWordCount(10);

      expect(count).toBe(10);
    });

    it('should increase count for excellent improving performance', () => {
      // 添加表现优秀且在进步的会话
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 8 + Math.floor(i / 2),
          wrongCount: 2,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.85 + i * 0.02, // 进步中，> 0.85
          timestamp: Date.now() + i,
        });
      }

      const count = engine.getRecommendedWordCount(10);

      expect(count).toBe(12); // 10 * 1.2 = 12
    });

    it('should decrease count for poor declining performance', () => {
      // 添加表现差且在退步的会话
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 6 - Math.floor(i / 2),
          wrongCount: 4,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.55 - i * 0.02, // 退步中，< 0.6
          timestamp: Date.now() + i,
        });
      }

      const count = engine.getRecommendedWordCount(10);

      expect(count).toBe(7); // 10 * 0.7 = 7
    });

    it('should not decrease below minimum of 5', () => {
      // 添加表现差的会话
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 4 - Math.floor(i / 2),
          wrongCount: 6,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.4 - i * 0.05, // 很差
          timestamp: Date.now() + i,
        });
      }

      const count = engine.getRecommendedWordCount(6);

      expect(count).toBe(5); // 不能低于 5
    });

    it('should return base count for normal performance', () => {
      // 添加正常表现的会话
      for (let i = 0; i < 5; i++) {
        engine.recordSessionStats({
          sessionId: `session-${i}`,
          totalWords: 10,
          correctCount: 7,
          wrongCount: 3,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          accuracy: 0.7, // 正常
          timestamp: Date.now() + i,
        });
      }

      const count = engine.getRecommendedWordCount(10);

      expect(count).toBe(10); // 保持不变
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = createMockConfig();
      newConfig.consecutiveCorrectThreshold = 3;
      newConfig.consecutiveWrongThreshold = 2;

      engine.updateConfig(newConfig);

      // 验证新配置生效：3次连续正确就应该触发调整
      const result = engine.adjustDifficulty(10, 3, 0, 1);
      expect(result.shouldAdjust).toBe(true);
    });

    it('should update new word ratio thresholds', () => {
      const newConfig = createMockConfig();
      newConfig.newWordRatio = {
        default: 0.4,
        highAccuracy: 0.6,
        lowAccuracy: 0.2,
        highAccuracyThreshold: 0.9,
        lowAccuracyThreshold: 0.5,
      };

      engine.updateConfig(newConfig);

      // 0.85 现在应该返回 default (0.4) 而不是 highAccuracy
      const ratio = engine.calculateNewWordRatio(0.85);
      expect(ratio).toBe(0.4);
    });
  });
});
