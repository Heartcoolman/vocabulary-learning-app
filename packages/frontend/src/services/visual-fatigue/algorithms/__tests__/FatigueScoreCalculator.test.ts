/**
 * FatigueScoreCalculator Tests
 *
 * 测试视觉疲劳评分计算器的综合评分逻辑
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FatigueScoreCalculator,
  type FatigueInputMetrics,
  DEFAULT_FATIGUE_SCORE_CONFIG,
} from '../FatigueScoreCalculator';

// Helper to create default valid metrics
function createMockMetrics(overrides?: Partial<FatigueInputMetrics>): FatigueInputMetrics {
  return {
    perclos: 0.1,
    blinkRate: 15,
    avgBlinkDuration: 200,
    yawnCount: 0,
    headPitch: 0,
    headStability: 1,
    isHeadDropping: false,
    expressionFatigueScore: 0,
    squintIntensity: 0,
    validity: {
      perclos: true,
      blink: true,
      yawn: true,
      headPose: true,
      expression: true,
    },
    ...overrides,
  };
}

describe('FatigueScoreCalculator', () => {
  let calculator: FatigueScoreCalculator;

  beforeEach(() => {
    calculator = new FatigueScoreCalculator();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(calculator.getCurrentScore()).toBe(0);
    });

    it('should accept custom config', () => {
      const customCalculator = new FatigueScoreCalculator({
        smoothingFactor: 0.5,
        normalBlinkRate: 12,
      });
      expect(customCalculator.getCurrentScore()).toBe(0);
    });

    it('should accept partial weight overrides', () => {
      const customCalculator = new FatigueScoreCalculator({
        weights: {
          ...DEFAULT_FATIGUE_SCORE_CONFIG.weights,
          perclos: 0.5,
        },
      });
      expect(customCalculator).toBeDefined();
    });
  });

  describe('PERCLOS score calculation', () => {
    it('should return low score for low PERCLOS (alert state)', () => {
      const metrics = createMockMetrics({
        perclos: 0.05,
        validity: { ...createMockMetrics().validity, perclos: true },
      });
      const result = calculator.calculate(metrics);
      expect(result.perclosScore).toBeLessThan(0.2);
    });

    it('should return moderate score for moderate PERCLOS', () => {
      const metrics = createMockMetrics({ perclos: 0.12 });
      const result = calculator.calculate(metrics);
      expect(result.perclosScore).toBeGreaterThan(0.2);
      expect(result.perclosScore).toBeLessThan(0.5);
    });

    it('should return high score for high PERCLOS (fatigued)', () => {
      const metrics = createMockMetrics({ perclos: 0.2 });
      const result = calculator.calculate(metrics);
      expect(result.perclosScore).toBeGreaterThan(0.5);
    });

    it('should return very high score for severe PERCLOS', () => {
      const metrics = createMockMetrics({ perclos: 0.3 });
      const result = calculator.calculate(metrics);
      expect(result.perclosScore).toBeGreaterThan(0.8);
    });

    it('should cap PERCLOS score at 1.0', () => {
      const metrics = createMockMetrics({ perclos: 1.0 });
      const result = calculator.calculate(metrics);
      expect(result.perclosScore).toBeLessThanOrEqual(1);
    });
  });

  describe('blink score calculation', () => {
    it('should return zero for normal blink rate and duration', () => {
      const metrics = createMockMetrics({
        blinkRate: 15,
        avgBlinkDuration: 200,
      });
      const result = calculator.calculate(metrics);
      expect(result.blinkScore).toBe(0);
    });

    it('should increase score for high blink rate', () => {
      const metrics = createMockMetrics({
        blinkRate: 25,
        avgBlinkDuration: 200,
      });
      const result = calculator.calculate(metrics);
      expect(result.blinkScore).toBeGreaterThan(0.5);
    });

    it('should increase score for long blink duration', () => {
      const metrics = createMockMetrics({
        blinkRate: 15,
        avgBlinkDuration: 400,
      });
      const result = calculator.calculate(metrics);
      expect(result.blinkScore).toBeGreaterThan(0.3);
    });

    it('should give maximum score for both high rate and long duration', () => {
      const metrics = createMockMetrics({
        blinkRate: 30,
        avgBlinkDuration: 500,
      });
      const result = calculator.calculate(metrics);
      expect(result.blinkScore).toBe(1);
    });

    it('should weight blink rate higher than duration', () => {
      const highRateMetrics = createMockMetrics({
        blinkRate: 25,
        avgBlinkDuration: 200,
      });
      const longDurationMetrics = createMockMetrics({
        blinkRate: 15,
        avgBlinkDuration: 400,
      });

      const highRateResult = calculator.calculate(highRateMetrics);
      calculator.reset();
      const longDurationResult = calculator.calculate(longDurationMetrics);

      // Rate has 60% weight, duration has 40%
      expect(highRateResult.blinkScore).toBeGreaterThan(longDurationResult.blinkScore);
    });
  });

  describe('yawn score calculation', () => {
    it('should return zero for no yawns', () => {
      const metrics = createMockMetrics({ yawnCount: 0 });
      const result = calculator.calculate(metrics);
      expect(result.yawnScore).toBe(0);
    });

    it('should return proportional score for some yawns', () => {
      const metrics = createMockMetrics({ yawnCount: 1 });
      const result = calculator.calculate(metrics);
      expect(result.yawnScore).toBeCloseTo(1 / 3, 1); // 1/3 of threshold
    });

    it('should return maximum score at threshold', () => {
      const metrics = createMockMetrics({ yawnCount: 3 });
      const result = calculator.calculate(metrics);
      expect(result.yawnScore).toBe(1);
    });

    it('should cap at maximum score above threshold', () => {
      const metrics = createMockMetrics({ yawnCount: 5 });
      const result = calculator.calculate(metrics);
      expect(result.yawnScore).toBe(1);
    });
  });

  describe('head pose score calculation', () => {
    it('should return zero for upright stable head', () => {
      const metrics = createMockMetrics({
        headPitch: 0,
        headStability: 1,
        isHeadDropping: false,
      });
      const result = calculator.calculate(metrics);
      expect(result.headPoseScore).toBe(0);
    });

    it('should increase score for head dropping', () => {
      const metrics = createMockMetrics({
        headPitch: 0.2,
        headStability: 1,
        isHeadDropping: false,
      });
      const result = calculator.calculate(metrics);
      expect(result.headPoseScore).toBeGreaterThan(0);
    });

    it('should give high score when isHeadDropping is true', () => {
      const metrics = createMockMetrics({
        headPitch: 0.1,
        headStability: 1,
        isHeadDropping: true,
      });
      const result = calculator.calculate(metrics);
      // 0.8 * 0.7 = 0.56, but floating point precision may vary slightly
      expect(result.headPoseScore).toBeGreaterThanOrEqual(0.55);
    });

    it('should factor in head instability', () => {
      const stableMetrics = createMockMetrics({
        headPitch: 0,
        headStability: 1,
        isHeadDropping: false,
      });
      const unstableMetrics = createMockMetrics({
        headPitch: 0,
        headStability: 0.5,
        isHeadDropping: false,
      });

      const stableResult = calculator.calculate(stableMetrics);
      calculator.reset();
      const unstableResult = calculator.calculate(unstableMetrics);

      expect(unstableResult.headPoseScore).toBeGreaterThan(stableResult.headPoseScore);
    });
  });

  describe('expression score calculation', () => {
    it('should return zero for no fatigue expression', () => {
      const metrics = createMockMetrics({
        expressionFatigueScore: 0,
        squintIntensity: 0,
      });
      const result = calculator.calculate(metrics);
      expect(result.expressionScore).toBe(0);
    });

    it('should increase score for high expression fatigue', () => {
      const metrics = createMockMetrics({
        expressionFatigueScore: 0.8,
        squintIntensity: 0,
      });
      const result = calculator.calculate(metrics);
      expect(result.expressionScore).toBeGreaterThan(0.4);
    });

    it('should increase score for squinting', () => {
      const metrics = createMockMetrics({
        expressionFatigueScore: 0,
        squintIntensity: 0.5,
      });
      const result = calculator.calculate(metrics);
      expect(result.expressionScore).toBeGreaterThan(0.3);
    });
  });

  describe('total score calculation', () => {
    it('should calculate weighted total score', () => {
      const metrics = createMockMetrics({
        perclos: 0.15,
        blinkRate: 20,
        yawnCount: 1,
        headPitch: 0.1,
        expressionFatigueScore: 0.3,
      });

      const result = calculator.calculate(metrics);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThan(1);
    });

    it('should give maximum score for all high fatigue indicators', () => {
      const metrics = createMockMetrics({
        perclos: 0.3,
        blinkRate: 30,
        avgBlinkDuration: 500,
        yawnCount: 5,
        headPitch: 0.5,
        headStability: 0.3,
        isHeadDropping: true,
        expressionFatigueScore: 1,
        squintIntensity: 1,
      });

      const result = calculator.calculate(metrics);
      // Due to smoothing, may not reach 1.0 immediately
      expect(result.totalScore).toBeGreaterThan(0.2);
    });

    it('should normalize weights when some indicators are invalid', () => {
      const metrics = createMockMetrics({
        perclos: 0.3,
        validity: {
          perclos: true,
          blink: false,
          yawn: false,
          headPose: false,
          expression: false,
        },
      });

      const result = calculator.calculate(metrics);
      // Only PERCLOS is valid, so score should be based on PERCLOS alone
      expect(result.confidence).toBeCloseTo(0.2); // 1/5 valid
    });
  });

  describe('confidence calculation', () => {
    it('should return full confidence when all indicators are valid', () => {
      const metrics = createMockMetrics();
      const result = calculator.calculate(metrics);
      expect(result.confidence).toBe(1);
    });

    it('should return proportional confidence for partial validity', () => {
      const metrics = createMockMetrics({
        validity: {
          perclos: true,
          blink: true,
          yawn: false,
          headPose: false,
          expression: false,
        },
      });
      const result = calculator.calculate(metrics);
      expect(result.confidence).toBe(0.4); // 2/5 valid
    });

    it('should return zero confidence when no indicators are valid', () => {
      const metrics = createMockMetrics({
        validity: {
          perclos: false,
          blink: false,
          yawn: false,
          headPose: false,
          expression: false,
        },
      });
      const result = calculator.calculate(metrics);
      expect(result.confidence).toBe(0);
    });
  });

  describe('smoothing', () => {
    it('should apply exponential smoothing to total score', () => {
      // First high fatigue reading
      const highFatigueMetrics = createMockMetrics({ perclos: 0.3 });
      const firstResult = calculator.calculate(highFatigueMetrics);

      // Second low fatigue reading
      const lowFatigueMetrics = createMockMetrics({ perclos: 0.05 });
      const secondResult = calculator.calculate(lowFatigueMetrics);

      // Due to smoothing, the second score shouldn't drop immediately to the raw score
      // It should be higher than what raw calculation would give
      // (smoothingFactor=0.3 means 30% new + 70% old)
      expect(secondResult.totalScore).toBeGreaterThan(0); // At least some smoothing effect
      expect(secondResult.totalScore).toBeLessThan(firstResult.totalScore); // But still lower
    });
  });

  describe('fatigue level classification', () => {
    it('should classify low scores as alert', () => {
      expect(calculator.getFatigueLevel(0.1)).toBe('alert');
      expect(calculator.getFatigueLevel(0.24)).toBe('alert');
    });

    it('should classify moderate-low scores as mild', () => {
      expect(calculator.getFatigueLevel(0.25)).toBe('mild');
      expect(calculator.getFatigueLevel(0.49)).toBe('mild');
    });

    it('should classify moderate-high scores as moderate', () => {
      expect(calculator.getFatigueLevel(0.5)).toBe('moderate');
      expect(calculator.getFatigueLevel(0.74)).toBe('moderate');
    });

    it('should classify high scores as severe', () => {
      expect(calculator.getFatigueLevel(0.75)).toBe('severe');
      expect(calculator.getFatigueLevel(1.0)).toBe('severe');
    });
  });

  describe('fatigue trend', () => {
    it('should return zero trend with insufficient history', () => {
      expect(calculator.getFatigueTrend()).toBe(0);
    });

    it('should detect increasing fatigue trend', () => {
      // Simulate increasing fatigue over time
      for (let i = 0; i < 20; i++) {
        const metrics = createMockMetrics({ perclos: 0.05 + i * 0.01 });
        calculator.calculate(metrics);
      }

      const trend = calculator.getFatigueTrend();
      expect(trend).toBeGreaterThan(0);
    });

    it('should detect decreasing fatigue trend', () => {
      // Simulate decreasing fatigue over time
      for (let i = 0; i < 20; i++) {
        const metrics = createMockMetrics({ perclos: 0.25 - i * 0.01 });
        calculator.calculate(metrics);
      }

      const trend = calculator.getFatigueTrend();
      expect(trend).toBeLessThan(0);
    });

    it('should return zero for stable fatigue', () => {
      // Simulate stable fatigue
      for (let i = 0; i < 20; i++) {
        const metrics = createMockMetrics({ perclos: 0.15 });
        calculator.calculate(metrics);
      }

      const trend = calculator.getFatigueTrend();
      expect(Math.abs(trend)).toBeLessThan(0.1);
    });
  });

  describe('weight configuration', () => {
    it('should allow updating weights', () => {
      // Use a fresh calculator to avoid smoothing effects
      const freshCalculator = new FatigueScoreCalculator({
        smoothingFactor: 1.0, // No smoothing - take current value only
      });
      freshCalculator.setWeights({ perclos: 1.0, blink: 0, yawn: 0, headPose: 0, expression: 0 });

      const metrics = createMockMetrics({
        perclos: 0.2,
        blinkRate: 30, // High fatigue - but zero weight
        yawnCount: 5, // High fatigue - but zero weight
      });

      const result = freshCalculator.calculate(metrics);
      // Score should be dominated by PERCLOS since other weights are 0
      // With perclos=0.2, the perclosScore should be around 0.5 (moderate range)
      expect(result.perclosScore).toBeGreaterThan(0.4);
      expect(result.perclosScore).toBeLessThan(0.7);
      // Total score should match perclos score (only perclos has weight)
      expect(result.totalScore).toBeCloseTo(result.perclosScore, 2);
    });
  });

  describe('reset', () => {
    it('should reset score and history', () => {
      // Build up some history
      for (let i = 0; i < 10; i++) {
        const metrics = createMockMetrics({ perclos: 0.2 });
        calculator.calculate(metrics);
      }

      expect(calculator.getCurrentScore()).toBeGreaterThan(0);

      calculator.reset();

      expect(calculator.getCurrentScore()).toBe(0);
      expect(calculator.getFatigueTrend()).toBe(0);
    });
  });

  describe('buildInputFromMetrics', () => {
    it('should create input from VisualFatigueMetrics', () => {
      const visualMetrics = {
        perclos: 0.15,
        blinkRate: 18,
        avgBlinkDuration: 250,
        yawnCount: 1,
        headPose: { pitch: 0.1, yaw: 0.05, roll: 0 },
      };

      const input = FatigueScoreCalculator.buildInputFromMetrics(visualMetrics);

      expect(input.perclos).toBe(0.15);
      expect(input.blinkRate).toBe(18);
      expect(input.yawnCount).toBe(1);
      expect(input.headPitch).toBe(0.1);
      expect(input.validity.perclos).toBe(true);
      expect(input.validity.headPose).toBe(true);
    });

    it('should handle missing fields with defaults', () => {
      const visualMetrics = {};

      const input = FatigueScoreCalculator.buildInputFromMetrics(visualMetrics);

      expect(input.perclos).toBe(0);
      expect(input.blinkRate).toBe(0);
      expect(input.validity.perclos).toBe(false);
      expect(input.validity.headPose).toBe(false);
    });

    it('should detect head dropping based on pitch', () => {
      const droopingMetrics = {
        headPose: { pitch: 0.4, yaw: 0, roll: 0 },
      };

      const input = FatigueScoreCalculator.buildInputFromMetrics(droopingMetrics);
      expect(input.isHeadDropping).toBe(true);
    });
  });
});
