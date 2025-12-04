/**
 * FatigueEstimator Unit Tests
 *
 * Tests for the fatigue estimation model that tracks user tiredness
 * using exponential decay and capacity-based accumulation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FatigueEstimator,
  FatigueFeatures
} from '../../../../src/amas/modeling/fatigue-estimator';

describe('FatigueEstimator', () => {
  let estimator: FatigueEstimator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
    estimator = new FatigueEstimator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default fatigue value of 0.1', () => {
      expect(estimator.get()).toBe(0.1);
    });

    it('should accept custom initial fatigue value', () => {
      const custom = new FatigueEstimator(undefined, 0.5);
      expect(custom.get()).toBe(0.5);
    });

    it('should clamp initial fatigue to [0.05, 1.0] range', () => {
      const low = new FatigueEstimator(undefined, 0);
      expect(low.get()).toBe(0.05);

      const high = new FatigueEstimator(undefined, 1.5);
      expect(high.get()).toBe(1.0);
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should increase fatigue with high error rate trend', () => {
      const initial = estimator.get();
      const features: FatigueFeatures = {
        error_rate_trend: 0.5,
        rt_increase_rate: 0,
        repeat_errors: 0,
        breakMinutes: 0
      };

      const result = estimator.update(features);
      expect(result).toBeGreaterThan(initial);
    });

    it('should increase fatigue with response time increase', () => {
      const initial = estimator.get();
      const features: FatigueFeatures = {
        error_rate_trend: 0,
        rt_increase_rate: 0.5,
        repeat_errors: 0,
        breakMinutes: 0
      };

      const result = estimator.update(features);
      expect(result).toBeGreaterThan(initial);
    });

    it('should increase fatigue with repeat errors', () => {
      const initial = estimator.get();
      const features: FatigueFeatures = {
        error_rate_trend: 0,
        rt_increase_rate: 0,
        repeat_errors: 3,
        breakMinutes: 0
      };

      const result = estimator.update(features);
      expect(result).toBeGreaterThan(initial);
    });

    it('should decay fatigue with break time', () => {
      // First accumulate some fatigue
      estimator.update({
        error_rate_trend: 0.8,
        rt_increase_rate: 0.5,
        repeat_errors: 5,
        breakMinutes: 0
      });

      const fatigued = estimator.get();

      // Now take a break
      const afterBreak = estimator.update({
        error_rate_trend: 0,
        rt_increase_rate: 0,
        repeat_errors: 0,
        breakMinutes: 10
      });

      expect(afterBreak).toBeLessThan(fatigued);
    });

    it('should reset fatigue to 0.1 after long break', () => {
      // Accumulate fatigue
      for (let i = 0; i < 10; i++) {
        estimator.update({
          error_rate_trend: 0.5,
          rt_increase_rate: 0.3,
          repeat_errors: 2,
          breakMinutes: 0
        });
      }

      // Long break (default threshold is 120 minutes)
      const afterLongBreak = estimator.update({
        error_rate_trend: 0,
        rt_increase_rate: 0,
        repeat_errors: 0,
        breakMinutes: 150
      });

      expect(afterLongBreak).toBe(0.1);
    });

    it('should apply capacity-based discount at high fatigue', () => {
      // Get to high fatigue first
      const highFatigueEstimator = new FatigueEstimator(undefined, 0.8);

      const increase1 = highFatigueEstimator.update({
        error_rate_trend: 0.3,
        rt_increase_rate: 0.2,
        repeat_errors: 1,
        breakMinutes: 0
      });

      // At high fatigue, new fatigue should be harder to accumulate
      const lowFatigueEstimator = new FatigueEstimator(undefined, 0.2);
      const increase2 = lowFatigueEstimator.update({
        error_rate_trend: 0.3,
        rt_increase_rate: 0.2,
        repeat_errors: 1,
        breakMinutes: 0
      });

      // Low fatigue should increase more in absolute terms
      const lowDelta = increase2 - 0.2;
      const highDelta = increase1 - 0.8;

      expect(lowDelta).toBeGreaterThan(highDelta);
    });

    it('should keep fatigue in [0.05, 1.0] range', () => {
      // Extreme fatigue accumulation
      for (let i = 0; i < 100; i++) {
        estimator.update({
          error_rate_trend: 1.0,
          rt_increase_rate: 1.0,
          repeat_errors: 10,
          breakMinutes: 0
        });
      }

      expect(estimator.get()).toBeLessThanOrEqual(1.0);
      expect(estimator.get()).toBeGreaterThanOrEqual(0.05);
    });
  });

  // ==================== updateFromEvent Tests ====================

  describe('updateFromEvent', () => {
    it('should increase fatigue on incorrect answer', () => {
      const initial = estimator.get();
      estimator.updateFromEvent(false, 3000, 3000, false);
      expect(estimator.get()).toBeGreaterThan(initial);
    });

    it('should increase fatigue on slow response', () => {
      const initial = estimator.get();
      estimator.updateFromEvent(true, 6000, 3000, false);
      expect(estimator.get()).toBeGreaterThan(initial);
    });

    it('should increase fatigue more on repeat error', () => {
      const estimator1 = new FatigueEstimator();
      const estimator2 = new FatigueEstimator();

      estimator1.updateFromEvent(false, 3000, 3000, false);
      estimator2.updateFromEvent(false, 3000, 3000, true);

      expect(estimator2.get()).toBeGreaterThan(estimator1.get());
    });

    it('should cap response time increase rate at 1.0', () => {
      // Extremely slow response (10x baseline)
      estimator.updateFromEvent(true, 32000, 3200, false);

      // Should still be reasonable
      expect(estimator.get()).toBeLessThan(0.5);
    });
  });

  // ==================== Break Detection Tests ====================

  describe('break detection', () => {
    it('should indicate need for break when fatigue > 0.6', () => {
      const highFatigue = new FatigueEstimator(undefined, 0.65);
      expect(highFatigue.needsBreak()).toBe(true);

      const lowFatigue = new FatigueEstimator(undefined, 0.5);
      expect(lowFatigue.needsBreak()).toBe(false);
    });

    it('should indicate need for forced break when fatigue > 0.8', () => {
      const veryHighFatigue = new FatigueEstimator(undefined, 0.85);
      expect(veryHighFatigue.needsForcedBreak()).toBe(true);

      const moderateFatigue = new FatigueEstimator(undefined, 0.75);
      expect(moderateFatigue.needsForcedBreak()).toBe(false);
    });
  });

  // ==================== Recovery Prediction Tests ====================

  describe('recovery prediction', () => {
    it('should predict lower fatigue after break', () => {
      const estimator = new FatigueEstimator(undefined, 0.6);
      const predicted = estimator.predictFatigueAfterBreak(30);

      expect(predicted).toBeLessThan(0.6);
    });

    it('should compute required break time for target fatigue', () => {
      const estimator = new FatigueEstimator(undefined, 0.7);
      const breakTime = estimator.computeRequiredBreakTime(0.3);

      expect(breakTime).toBeGreaterThan(0);
    });
  });

  // ==================== State Management Tests ====================

  describe('state management', () => {
    it('should reset to default value', () => {
      estimator.update({
        error_rate_trend: 0.5,
        rt_increase_rate: 0.3,
        repeat_errors: 2,
        breakMinutes: 0
      });

      estimator.reset();
      expect(estimator.get()).toBe(0.1);
    });

    it('should reset to custom value', () => {
      estimator.reset(0.5);
      expect(estimator.get()).toBe(0.5);
    });

    it('should persist and restore state correctly', () => {
      estimator.update({
        error_rate_trend: 0.4,
        rt_increase_rate: 0.2,
        repeat_errors: 1,
        breakMinutes: 0
      });

      const state = estimator.getState();
      expect(state).toHaveProperty('F');
      expect(state).toHaveProperty('lastUpdateTime');

      const newEstimator = new FatigueEstimator();
      newEstimator.setState(state);

      expect(newEstimator.get()).toBe(estimator.get());
    });
  });

  // ==================== Parameter Configuration Tests ====================

  describe('parameter configuration', () => {
    it('should allow setting custom parameters', () => {
      estimator.setParams({
        beta: 0.5,
        gamma: 0.3,
        delta: 0.2,
        k: 0.01
      });

      // Should work without error
      const result = estimator.update({
        error_rate_trend: 0.3,
        rt_increase_rate: 0.2,
        repeat_errors: 1,
        breakMinutes: 0
      });

      expect(result).toBeGreaterThan(0);
    });

    it('should allow partial parameter updates', () => {
      estimator.setParams({ beta: 0.8 });

      const result = estimator.update({
        error_rate_trend: 0.5,
        rt_increase_rate: 0,
        repeat_errors: 0,
        breakMinutes: 0
      });

      expect(result).toBeGreaterThan(0.1);
    });
  });

  // ==================== Session Management Tests ====================

  describe('session management', () => {
    it('should mark session end for recovery model', () => {
      // Should not throw
      expect(() => estimator.markSessionEnd()).not.toThrow();
    });
  });
});
