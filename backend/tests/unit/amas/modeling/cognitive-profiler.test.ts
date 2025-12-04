/**
 * CognitiveProfiler Unit Tests
 *
 * Tests for the cognitive profiling model that tracks user learning abilities
 * across memory, speed, and stability dimensions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CognitiveProfiler,
  RecentStats
} from '../../../../src/amas/modeling/cognitive-profiler';

describe('CognitiveProfiler', () => {
  let profiler: CognitiveProfiler;

  beforeEach(() => {
    profiler = new CognitiveProfiler();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default profile values of 0.5', () => {
      const profile = profiler.get();
      expect(profile.mem).toBe(0.5);
      expect(profile.speed).toBe(0.5);
      expect(profile.stability).toBe(0.5);
    });

    it('should accept custom initial profile', () => {
      const custom = new CognitiveProfiler(undefined, undefined, {
        mem: 0.7,
        speed: 0.8,
        stability: 0.6
      });
      const profile = custom.get();
      expect(profile.mem).toBe(0.7);
      expect(profile.speed).toBe(0.8);
      expect(profile.stability).toBe(0.6);
    });

    it('should start with sample count of 0', () => {
      expect(profiler.getSampleCount()).toBe(0);
    });

    it('should start with lambda of 0', () => {
      expect(profiler.getLambda()).toBe(0);
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should update memory dimension based on accuracy', () => {
      const stats: RecentStats = {
        accuracy: 0.9,
        avgResponseTime: 2500,
        errorVariance: 0.1
      };

      const result = profiler.update(stats);
      expect(result.mem).toBeGreaterThan(0.5);
    });

    it('should update speed dimension based on response time', () => {
      // Fast response (lower than reference)
      const fastStats: RecentStats = {
        accuracy: 0.5,
        avgResponseTime: 2000,
        errorVariance: 0.1
      };
      const profiler1 = new CognitiveProfiler();
      const fast = profiler1.update(fastStats);

      // Slow response (higher than reference)
      const slowStats: RecentStats = {
        accuracy: 0.5,
        avgResponseTime: 8000,
        errorVariance: 0.1
      };
      const profiler2 = new CognitiveProfiler();
      const slow = profiler2.update(slowStats);

      expect(fast.speed).toBeGreaterThan(slow.speed);
    });

    it('should update stability dimension based on error variance', () => {
      // Low variance = high stability
      const stableStats: RecentStats = {
        accuracy: 0.5,
        avgResponseTime: 3000,
        errorVariance: 0.05
      };
      const profiler1 = new CognitiveProfiler();
      const stable = profiler1.update(stableStats);

      // High variance = low stability
      const unstableStats: RecentStats = {
        accuracy: 0.5,
        avgResponseTime: 3000,
        errorVariance: 0.4
      };
      const profiler2 = new CognitiveProfiler();
      const unstable = profiler2.update(unstableStats);

      expect(stable.stability).toBeGreaterThan(unstable.stability);
    });

    it('should increment sample count on each update', () => {
      expect(profiler.getSampleCount()).toBe(0);

      profiler.update({ accuracy: 0.8, avgResponseTime: 3000, errorVariance: 0.1 });
      expect(profiler.getSampleCount()).toBe(1);

      profiler.update({ accuracy: 0.7, avgResponseTime: 3500, errorVariance: 0.15 });
      expect(profiler.getSampleCount()).toBe(2);
    });

    it('should increase lambda as sample count grows', () => {
      const initialLambda = profiler.getLambda();

      for (let i = 0; i < 10; i++) {
        profiler.update({ accuracy: 0.7, avgResponseTime: 3000, errorVariance: 0.1 });
      }

      expect(profiler.getLambda()).toBeGreaterThan(initialLambda);
    });

    it('should apply EMA smoothing to long-term profile', () => {
      // First update with high values
      profiler.update({ accuracy: 1.0, avgResponseTime: 1000, errorVariance: 0 });
      const firstLongTerm = profiler.getLongTerm();

      // Second update with low values
      profiler.update({ accuracy: 0.0, avgResponseTime: 10000, errorVariance: 0.5 });
      const secondLongTerm = profiler.getLongTerm();

      // Long-term should change but not dramatically due to EMA
      expect(secondLongTerm.mem).toBeLessThan(firstLongTerm.mem);
      expect(secondLongTerm.mem).toBeGreaterThan(0); // Not immediately 0
    });

    it('should keep all dimensions in [0,1] range', () => {
      // Extreme stats
      profiler.update({ accuracy: 2.0, avgResponseTime: 100, errorVariance: 10 });

      const profile = profiler.get();
      expect(profile.mem).toBeGreaterThanOrEqual(0);
      expect(profile.mem).toBeLessThanOrEqual(1);
      expect(profile.speed).toBeGreaterThanOrEqual(0);
      expect(profile.speed).toBeLessThanOrEqual(1);
      expect(profile.stability).toBeGreaterThanOrEqual(0);
      expect(profile.stability).toBeLessThanOrEqual(1);
    });
  });

  // ==================== updateFromEvent Tests ====================

  describe('updateFromEvent', () => {
    it('should update from single event with correct answer', () => {
      const result = profiler.updateFromEvent(true, 2000, 0);
      expect(result.mem).toBeGreaterThan(0.5);
    });

    it('should update from single event with incorrect answer', () => {
      const result = profiler.updateFromEvent(false, 4000, 0.3);
      expect(result.mem).toBeLessThanOrEqual(0.5);
    });

    it('should factor in recent error rate for stability', () => {
      const profiler1 = new CognitiveProfiler();
      const stable = profiler1.updateFromEvent(true, 3000, 0.1);

      const profiler2 = new CognitiveProfiler();
      const unstable = profiler2.updateFromEvent(true, 3000, 0.5);

      expect(stable.stability).toBeGreaterThan(unstable.stability);
    });
  });

  // ==================== Fusion Behavior Tests ====================

  describe('long-term / short-term fusion', () => {
    it('should weight short-term more when sample count is low', () => {
      // First update
      profiler.update({ accuracy: 0.9, avgResponseTime: 2000, errorVariance: 0.05 });

      const lambda = profiler.getLambda();
      expect(lambda).toBeLessThan(0.5); // Low lambda = more short-term weight
    });

    it('should weight long-term more as sample count grows', () => {
      for (let i = 0; i < 50; i++) {
        profiler.update({ accuracy: 0.7, avgResponseTime: 3000, errorVariance: 0.1 });
      }

      const lambda = profiler.getLambda();
      expect(lambda).toBeGreaterThan(0.5); // High lambda = more long-term weight
    });

    it('lambda should approach 1 asymptotically', () => {
      for (let i = 0; i < 1000; i++) {
        profiler.update({ accuracy: 0.7, avgResponseTime: 3000, errorVariance: 0.1 });
      }

      const lambda = profiler.getLambda();
      expect(lambda).toBeGreaterThan(0.95);
      expect(lambda).toBeLessThanOrEqual(1);
    });
  });

  // ==================== State Management Tests ====================

  describe('state management', () => {
    it('should reset to default values', () => {
      profiler.update({ accuracy: 0.9, avgResponseTime: 2000, errorVariance: 0.05 });
      profiler.update({ accuracy: 0.8, avgResponseTime: 2500, errorVariance: 0.1 });

      profiler.reset();

      expect(profiler.getSampleCount()).toBe(0);
      const profile = profiler.getLongTerm();
      expect(profile.mem).toBe(0.5);
      expect(profile.speed).toBe(0.5);
      expect(profile.stability).toBe(0.5);
    });

    it('should reset to custom profile', () => {
      profiler.reset({ mem: 0.8, speed: 0.7, stability: 0.9 });

      const profile = profiler.getLongTerm();
      expect(profile.mem).toBe(0.8);
      expect(profile.speed).toBe(0.7);
      expect(profile.stability).toBe(0.9);
    });

    it('should persist and restore state correctly', () => {
      profiler.update({ accuracy: 0.85, avgResponseTime: 2500, errorVariance: 0.08 });
      profiler.update({ accuracy: 0.9, avgResponseTime: 2200, errorVariance: 0.06 });

      const state = profiler.getState();
      expect(state).toHaveProperty('C_long');
      expect(state).toHaveProperty('sampleCount');
      expect(state.sampleCount).toBe(2);

      const newProfiler = new CognitiveProfiler();
      newProfiler.setState(state);

      expect(newProfiler.getSampleCount()).toBe(2);
      expect(newProfiler.getLongTerm()).toEqual(profiler.getLongTerm());
    });

    it('should clamp restored state values', () => {
      const invalidState = {
        C_long: { mem: 1.5, speed: -0.3, stability: 2.0 },
        sampleCount: -5
      };

      profiler.setState(invalidState);

      const profile = profiler.getLongTerm();
      expect(profile.mem).toBe(1);
      expect(profile.speed).toBe(0);
      expect(profile.stability).toBe(1);
      expect(profiler.getSampleCount()).toBe(0);
    });
  });

  // ==================== Configuration Tests ====================

  describe('configuration', () => {
    it('should allow setting normalization parameters', () => {
      profiler.setNormalizationParams({
        referenceRT: 4000,
        minRT: 500,
        referenceVariance: 0.3
      });

      // Should work without error
      const result = profiler.update({
        accuracy: 0.7,
        avgResponseTime: 3000,
        errorVariance: 0.15
      });

      expect(result.mem).toBeGreaterThan(0);
    });
  });

  // ==================== Alias Tests ====================

  describe('aliases', () => {
    it('getProfile should be alias for get', () => {
      profiler.update({ accuracy: 0.8, avgResponseTime: 2500, errorVariance: 0.1 });

      const get = profiler.get();
      const getProfile = profiler.getProfile();

      expect(get).toEqual(getProfile);
    });
  });
});
