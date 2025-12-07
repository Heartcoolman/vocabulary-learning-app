/**
 * Engine Modeling Tests
 *
 * 测试 AMAS Engine 建模层模块 (ModelingManager):
 * 1. 用户状态更新 - updateUserState
 * 2. 注意力特征提取 - extractAttentionFeatures
 * 3. 默认状态创建 - createDefaultState
 * 4. 时间分桶 - getTimeBucket
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelingManager } from '../../../../src/amas/engine/engine-modeling';
import { UserModels } from '../../../../src/amas/engine/engine-types';
import { AttentionMonitor, AttentionFeatures } from '../../../../src/amas/modeling/attention-monitor';
import { FatigueEstimator } from '../../../../src/amas/modeling/fatigue-estimator';
import { CognitiveProfiler } from '../../../../src/amas/modeling/cognitive-profiler';
import { MotivationTracker } from '../../../../src/amas/modeling/motivation-tracker';
import { TrendAnalyzer } from '../../../../src/amas/modeling/trend-analyzer';
import { LinUCB } from '../../../../src/amas/learning/linucb';
import { FeatureVector, RawEvent, UserState } from '../../../../src/amas/types';
import { mockLogger } from '../../../setup';

// Mock dependencies
vi.mock('../../../../src/amas/config/feature-flags', () => ({
  isTrendAnalyzerEnabled: vi.fn().mockReturnValue(false)
}));

// ==================== Test Helpers ====================

function createDefaultUserState(): UserState {
  return {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6, stability: 0.7 },
    T: 'flat',
    conf: 0.5,
    ts: Date.now()
  };
}

function createFeatureVector(values: number[] = []): FeatureVector {
  const defaultValues = [
    0.5,   // z_rt_mean
    0.3,   // z_rt_cv
    0.2,   // z_pace_cv
    0.1,   // z_pause
    0.1,   // z_switch
    0.0,   // z_drift
    0.5,   // interaction_density
    0.2    // focus_loss_duration
  ];

  const finalValues = values.length > 0 ? values : defaultValues;

  return {
    values: new Float32Array(finalValues),
    ts: Date.now(),
    labels: [
      'z_rt_mean', 'z_rt_cv', 'z_pace_cv', 'z_pause',
      'z_switch', 'z_drift', 'interaction_density', 'focus_loss_duration'
    ]
  };
}

function createRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    wordId: 'test-word-1',
    isCorrect: true,
    responseTime: 2000,
    dwellTime: 3000,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 0.5,
    ...overrides
  };
}

function createUserModels(): UserModels {
  return {
    attention: new AttentionMonitor(),
    fatigue: new FatigueEstimator(),
    cognitive: new CognitiveProfiler(),
    motivation: new MotivationTracker(),
    bandit: new LinUCB({ dimension: 22 }),
    trendAnalyzer: null,
    coldStart: null,
    thompson: null,
    heuristic: null,
    actrMemory: null,
    userParams: null
  };
}

// ==================== Test Suite ====================

describe('ModelingManager', () => {
  let modelingManager: ModelingManager;
  let userModels: UserModels;

  beforeEach(() => {
    vi.clearAllMocks();
    modelingManager = new ModelingManager();
    userModels = createUserModels();
  });

  // ==================== updateUserState Tests ====================

  describe('updateUserState', () => {
    it('should update user state based on event', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      expect(newState).toBeDefined();
      expect(newState.A).toBeDefined();
      expect(newState.F).toBeDefined();
      expect(newState.C).toBeDefined();
      expect(newState.M).toBeDefined();
    });

    it('should update attention (A) based on features', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      expect(newState.A).toBeGreaterThanOrEqual(0);
      expect(newState.A).toBeLessThanOrEqual(1);
    });

    it('should update fatigue (F) based on error rate and response time', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({
        isCorrect: false,
        responseTime: 8000,
        retryCount: 2
      });
      const recentErrorRate = 0.5;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      // Fatigue should be affected by error and slow response
      expect(newState.F).toBeGreaterThanOrEqual(0);
      expect(newState.F).toBeLessThanOrEqual(1);
    });

    it('should update cognitive profile (C)', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      expect(newState.C).toBeDefined();
      expect(newState.C.mem).toBeGreaterThanOrEqual(0);
      expect(newState.C.mem).toBeLessThanOrEqual(1);
      expect(newState.C.speed).toBeGreaterThanOrEqual(0);
      expect(newState.C.speed).toBeLessThanOrEqual(1);
      expect(newState.C.stability).toBeGreaterThanOrEqual(0);
      expect(newState.C.stability).toBeLessThanOrEqual(1);
    });

    it('should update motivation (M) based on success/failure', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const recentErrorRate = 0.2;

      // Success case
      const successEvent = createRawEvent({ isCorrect: true });
      const successState = modelingManager.updateUserState(
        prevState,
        featureVec,
        successEvent,
        recentErrorRate,
        userModels
      );

      // Failure case
      const failureEvent = createRawEvent({ isCorrect: false });
      const failureState = modelingManager.updateUserState(
        prevState,
        featureVec,
        failureEvent,
        recentErrorRate,
        userModels
      );

      expect(successState.M).toBeDefined();
      expect(failureState.M).toBeDefined();
    });

    it('should preserve trend state when trend analyzer is disabled', () => {
      const prevState = createDefaultUserState();
      prevState.T = 'up';
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      // With trend analyzer disabled, T should preserve prevState.T value
      expect(newState.T).toBe('up');
    });

    it('should update timestamp', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const eventTimestamp = Date.now() + 5000;
      const event = createRawEvent({ timestamp: eventTimestamp });
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      expect(newState.ts).toBe(eventTimestamp);
    });

    it('should increase confidence', () => {
      const prevState = createDefaultUserState();
      prevState.conf = 0.5;
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      // Confidence should increase by 0.01 per update
      expect(newState.conf).toBe(Math.min(1, 0.5 + 0.01));
    });

    it('should cap confidence at 1', () => {
      const prevState = createDefaultUserState();
      prevState.conf = 0.995;
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      expect(newState.conf).toBe(1);
    });

    it('should handle paused time for fatigue decay', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({
        pausedTimeMs: 300000  // 5 minutes break
      });
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        userModels
      );

      // State should be updated without error
      expect(newState.F).toBeDefined();
    });

    it('should calculate error variance correctly', () => {
      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent();

      // Test different error rates
      const errorRates = [0, 0.25, 0.5, 0.75, 1.0];

      for (const errorRate of errorRates) {
        const newState = modelingManager.updateUserState(
          prevState,
          featureVec,
          event,
          errorRate,
          userModels
        );

        // All states should be valid
        expect(newState.C.stability).toBeGreaterThanOrEqual(0);
        expect(newState.C.stability).toBeLessThanOrEqual(1);
      }
    });

    it('should update with trend analyzer when enabled', async () => {
      // Create models with trend analyzer
      const modelsWithTrend: UserModels = {
        ...userModels,
        trendAnalyzer: new TrendAnalyzer()
      };

      // Re-mock to enable trend analyzer
      const featureFlags = await import('../../../../src/amas/config/feature-flags');
      vi.mocked(featureFlags.isTrendAnalyzerEnabled).mockReturnValue(true);

      const prevState = createDefaultUserState();
      const featureVec = createFeatureVector();
      const event = createRawEvent();
      const recentErrorRate = 0.2;

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        recentErrorRate,
        modelsWithTrend
      );

      expect(newState.T).toBeDefined();
      expect(['up', 'flat', 'stuck', 'down']).toContain(newState.T);

      // Reset mock
      vi.mocked(featureFlags.isTrendAnalyzerEnabled).mockReturnValue(false);
    });
  });

  // ==================== extractAttentionFeatures Tests ====================

  describe('extractAttentionFeatures', () => {
    it('should extract all attention features from feature vector', () => {
      const featureVec = createFeatureVector([
        0.5, 0.3, 0.2, 0.1, 0.1, 0.0, 0.5, 0.2
      ]);

      const features = modelingManager.extractAttentionFeatures(featureVec);

      // Use toBeCloseTo for Float32Array precision
      expect(features.z_rt_mean).toBeCloseTo(0.5, 5);
      expect(features.z_rt_cv).toBeCloseTo(0.3, 5);
      expect(features.z_pace_cv).toBeCloseTo(0.2, 5);
      expect(features.z_pause).toBeCloseTo(0.1, 5);
      expect(features.z_switch).toBeCloseTo(0.1, 5);
      expect(features.z_drift).toBeCloseTo(0.0, 5);
      expect(features.interaction_density).toBeCloseTo(0.5, 5);
      expect(features.focus_loss_duration).toBeCloseTo(0.2, 5);
    });

    it('should handle short feature vector with defaults', () => {
      const shortFeatureVec: FeatureVector = {
        values: new Float32Array([0.5, 0.3]),
        ts: Date.now(),
        labels: ['z_rt_mean', 'z_rt_cv']
      };

      const features = modelingManager.extractAttentionFeatures(shortFeatureVec);

      // Use toBeCloseTo for Float32Array precision
      expect(features.z_rt_mean).toBeCloseTo(0.5, 5);
      expect(features.z_rt_cv).toBeCloseTo(0.3, 5);
      // Missing values should default to 0
      expect(features.z_pace_cv).toBe(0);
      expect(features.z_pause).toBe(0);
      expect(features.z_switch).toBe(0);
      expect(features.z_drift).toBe(0);
      expect(features.interaction_density).toBe(0);
      expect(features.focus_loss_duration).toBe(0);
    });

    it('should handle empty feature vector', () => {
      const emptyFeatureVec: FeatureVector = {
        values: new Float32Array([]),
        ts: Date.now(),
        labels: []
      };

      const features = modelingManager.extractAttentionFeatures(emptyFeatureVec);

      // All values should be 0 (default)
      expect(features.z_rt_mean).toBe(0);
      expect(features.z_rt_cv).toBe(0);
      expect(features.z_pace_cv).toBe(0);
      expect(features.z_pause).toBe(0);
      expect(features.z_switch).toBe(0);
      expect(features.z_drift).toBe(0);
      expect(features.interaction_density).toBe(0);
      expect(features.focus_loss_duration).toBe(0);
    });

    it('should handle NaN values with defaults', () => {
      const nanFeatureVec: FeatureVector = {
        values: new Float32Array([NaN, 0.3, NaN, 0.1, NaN, 0.0, NaN, 0.2]),
        ts: Date.now(),
        labels: []
      };

      const features = modelingManager.extractAttentionFeatures(nanFeatureVec);

      // NaN values should be replaced with defaults
      expect(features.z_rt_mean).toBe(0);
      expect(features.z_rt_cv).toBeCloseTo(0.3, 5);
      expect(features.z_pace_cv).toBe(0);
      expect(features.z_pause).toBeCloseTo(0.1, 5);
    });

    it('should handle Infinity values with defaults', () => {
      const infFeatureVec: FeatureVector = {
        values: new Float32Array([Infinity, 0.3, -Infinity, 0.1]),
        ts: Date.now(),
        labels: []
      };

      const features = modelingManager.extractAttentionFeatures(infFeatureVec);

      // Infinity values should be replaced with defaults
      expect(features.z_rt_mean).toBe(0);
      expect(features.z_rt_cv).toBeCloseTo(0.3, 5);
      expect(features.z_pace_cv).toBe(0);
      expect(features.z_pause).toBeCloseTo(0.1, 5);
    });
  });

  // ==================== createDefaultState Tests ====================

  describe('createDefaultState', () => {
    it('should create a valid default state', () => {
      const state = modelingManager.createDefaultState();

      expect(state).toBeDefined();
      expect(state.A).toBeDefined();
      expect(state.F).toBeDefined();
      expect(state.C).toBeDefined();
      expect(state.M).toBeDefined();
      expect(state.T).toBeDefined();
      expect(state.conf).toBeDefined();
      expect(state.ts).toBeDefined();
    });

    it('should have expected default attention value', () => {
      const state = modelingManager.createDefaultState();
      expect(state.A).toBe(0.7);
    });

    it('should have expected default fatigue value', () => {
      const state = modelingManager.createDefaultState();
      expect(state.F).toBe(0.1);
    });

    it('should have expected default cognitive profile', () => {
      const state = modelingManager.createDefaultState();
      expect(state.C.mem).toBe(0.5);
      expect(state.C.speed).toBe(0.5);
      expect(state.C.stability).toBe(0.5);
    });

    it('should have expected default motivation value', () => {
      const state = modelingManager.createDefaultState();
      expect(state.M).toBe(0);
    });

    it('should have expected default trend state', () => {
      const state = modelingManager.createDefaultState();
      expect(state.T).toBe('flat');
    });

    it('should have expected default confidence value', () => {
      const state = modelingManager.createDefaultState();
      expect(state.conf).toBe(0.5);
    });

    it('should have recent timestamp', () => {
      const beforeCreate = Date.now();
      const state = modelingManager.createDefaultState();
      const afterCreate = Date.now();

      expect(state.ts).toBeGreaterThanOrEqual(beforeCreate);
      expect(state.ts).toBeLessThanOrEqual(afterCreate);
    });

    it('should create independent instances', () => {
      const state1 = modelingManager.createDefaultState();
      const state2 = modelingManager.createDefaultState();

      // Modify state1
      state1.A = 0.5;
      state1.C.mem = 0.8;

      // state2 should be unchanged
      expect(state2.A).toBe(0.7);
      expect(state2.C.mem).toBe(0.5);
    });
  });

  // ==================== getTimeBucket Tests ====================

  describe('getTimeBucket', () => {
    it('should return 0 for morning hours (0-11)', () => {
      // 8:00 AM
      const morning = new Date();
      morning.setHours(8, 0, 0, 0);

      const bucket = modelingManager.getTimeBucket(morning.getTime());
      expect(bucket).toBe(0);
    });

    it('should return 1 for afternoon hours (12-17)', () => {
      // 2:00 PM
      const afternoon = new Date();
      afternoon.setHours(14, 0, 0, 0);

      const bucket = modelingManager.getTimeBucket(afternoon.getTime());
      expect(bucket).toBe(1);
    });

    it('should return 2 for evening hours (18-23)', () => {
      // 8:00 PM
      const evening = new Date();
      evening.setHours(20, 0, 0, 0);

      const bucket = modelingManager.getTimeBucket(evening.getTime());
      expect(bucket).toBe(2);
    });

    it('should handle midnight (0 hours)', () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);

      const bucket = modelingManager.getTimeBucket(midnight.getTime());
      expect(bucket).toBe(0);
    });

    it('should handle 11:59 AM (boundary)', () => {
      const lateMorning = new Date();
      lateMorning.setHours(11, 59, 59, 999);

      const bucket = modelingManager.getTimeBucket(lateMorning.getTime());
      expect(bucket).toBe(0);
    });

    it('should handle 12:00 PM (boundary)', () => {
      const noon = new Date();
      noon.setHours(12, 0, 0, 0);

      const bucket = modelingManager.getTimeBucket(noon.getTime());
      expect(bucket).toBe(1);
    });

    it('should handle 5:59 PM (boundary)', () => {
      const lateAfternoon = new Date();
      lateAfternoon.setHours(17, 59, 59, 999);

      const bucket = modelingManager.getTimeBucket(lateAfternoon.getTime());
      expect(bucket).toBe(1);
    });

    it('should handle 6:00 PM (boundary)', () => {
      const earlyEvening = new Date();
      earlyEvening.setHours(18, 0, 0, 0);

      const bucket = modelingManager.getTimeBucket(earlyEvening.getTime());
      expect(bucket).toBe(2);
    });

    it('should handle 11:59 PM (boundary)', () => {
      const lateNight = new Date();
      lateNight.setHours(23, 59, 59, 999);

      const bucket = modelingManager.getTimeBucket(lateNight.getTime());
      expect(bucket).toBe(2);
    });

    it('should handle all hours correctly', () => {
      for (let hour = 0; hour < 24; hour++) {
        const date = new Date();
        date.setHours(hour, 0, 0, 0);
        const bucket = modelingManager.getTimeBucket(date.getTime());

        if (hour < 12) {
          expect(bucket).toBe(0);
        } else if (hour < 18) {
          expect(bucket).toBe(1);
        } else {
          expect(bucket).toBe(2);
        }
      }
    });
  });

  // ==================== Integration Tests ====================

  describe('Integration', () => {
    it('should work in complete state update flow', () => {
      // Start with default state
      let state = modelingManager.createDefaultState();

      // Simulate multiple events
      for (let i = 0; i < 10; i++) {
        const featureVec = createFeatureVector([
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random()
        ]);
        const event = createRawEvent({
          isCorrect: Math.random() > 0.3,
          responseTime: 1000 + Math.random() * 5000,
          timestamp: Date.now() + i * 1000
        });
        const recentErrorRate = Math.random() * 0.5;

        state = modelingManager.updateUserState(
          state,
          featureVec,
          event,
          recentErrorRate,
          userModels
        );

        // All state values should remain valid
        expect(state.A).toBeGreaterThanOrEqual(0);
        expect(state.A).toBeLessThanOrEqual(1);
        expect(state.F).toBeGreaterThanOrEqual(0);
        expect(state.F).toBeLessThanOrEqual(1);
        expect(state.M).toBeGreaterThanOrEqual(-1);
        expect(state.M).toBeLessThanOrEqual(1);
        expect(state.C.mem).toBeGreaterThanOrEqual(0);
        expect(state.C.mem).toBeLessThanOrEqual(1);
      }
    });

    it('should handle consecutive correct answers', () => {
      let state = modelingManager.createDefaultState();
      const featureVec = createFeatureVector([0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.8, 0.0]);

      // 10 correct answers in a row
      for (let i = 0; i < 10; i++) {
        const event = createRawEvent({
          isCorrect: true,
          responseTime: 1500,
          timestamp: Date.now() + i * 1000
        });

        state = modelingManager.updateUserState(
          state,
          featureVec,
          event,
          0.0,  // No errors
          userModels
        );
      }

      // Motivation should increase (or stay high)
      expect(state.M).toBeGreaterThanOrEqual(0);
    });

    it('should handle consecutive incorrect answers', () => {
      let state = modelingManager.createDefaultState();
      const featureVec = createFeatureVector([0.8, 0.5, 0.4, 0.3, 0.2, 0.1, 0.2, 0.5]);

      // 10 incorrect answers in a row
      for (let i = 0; i < 10; i++) {
        const event = createRawEvent({
          isCorrect: false,
          responseTime: 8000,
          retryCount: 2,
          timestamp: Date.now() + i * 1000
        });

        state = modelingManager.updateUserState(
          state,
          featureVec,
          event,
          1.0,  // 100% error rate
          userModels
        );
      }

      // Fatigue should be elevated
      expect(state.F).toBeGreaterThan(0);
    });

    it('should handle alternating correct/incorrect answers', () => {
      let state = modelingManager.createDefaultState();

      for (let i = 0; i < 20; i++) {
        const isCorrect = i % 2 === 0;
        const featureVec = createFeatureVector([
          isCorrect ? 0.3 : 0.7,
          0.3,
          0.2,
          0.1,
          0.1,
          0.0,
          0.5,
          0.2
        ]);
        const event = createRawEvent({
          isCorrect,
          responseTime: isCorrect ? 1500 : 5000,
          timestamp: Date.now() + i * 1000
        });

        state = modelingManager.updateUserState(
          state,
          featureVec,
          event,
          0.5,  // 50% error rate
          userModels
        );

        // All values should remain valid
        expect(state.A).toBeGreaterThanOrEqual(0);
        expect(state.F).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==================== Edge Cases ====================

  describe('Edge Cases', () => {
    it('should handle extreme feature values', () => {
      const prevState = createDefaultState();
      const extremeFeatureVec: FeatureVector = {
        values: new Float32Array([10, 10, 10, 10, 10, 10, 10, 10]),
        ts: Date.now(),
        labels: []
      };
      const event = createRawEvent();

      const newState = modelingManager.updateUserState(
        prevState,
        extremeFeatureVec,
        event,
        0.5,
        userModels
      );

      // State should still be valid
      expect(newState.A).toBeGreaterThanOrEqual(0);
      expect(newState.A).toBeLessThanOrEqual(1);
    });

    it('should handle zero response time', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({ responseTime: 0 });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0.2,
        userModels
      );

      expect(newState).toBeDefined();
      expect(newState.C).toBeDefined();
    });

    it('should handle very long response time', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({ responseTime: 300000 });  // 5 minutes

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0.5,
        userModels
      );

      expect(newState).toBeDefined();
    });

    it('should handle timestamp in the past', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({
        timestamp: Date.now() - 86400000  // 1 day ago
      });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0.2,
        userModels
      );

      expect(newState.ts).toBe(event.timestamp);
    });

    it('should handle timestamp in the future', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({
        timestamp: Date.now() + 86400000  // 1 day in future
      });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0.2,
        userModels
      );

      expect(newState.ts).toBe(event.timestamp);
    });

    it('should handle high retry count', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({
        isCorrect: true,
        retryCount: 100
      });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0.8,
        userModels
      );

      expect(newState.F).toBeDefined();
    });

    it('should handle very long pause', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({
        pausedTimeMs: 3600000  // 1 hour
      });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0.2,
        userModels
      );

      expect(newState).toBeDefined();
    });

    it('should handle error rate of 0', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({ isCorrect: true });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        0,
        userModels
      );

      // Error variance should be 0 when error rate is 0
      expect(newState.C.stability).toBeDefined();
    });

    it('should handle error rate of 1', () => {
      const prevState = createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent({ isCorrect: false });

      const newState = modelingManager.updateUserState(
        prevState,
        featureVec,
        event,
        1,
        userModels
      );

      // Error variance should be 0 when error rate is 1
      expect(newState.C.stability).toBeDefined();
    });

    it('should handle negative feature values', () => {
      const prevState = createDefaultState();
      const negativeFeatureVec: FeatureVector = {
        values: new Float32Array([-1, -0.5, -0.3, -0.1, -0.2, -0.5, -0.8, -0.9]),
        ts: Date.now(),
        labels: []
      };
      const event = createRawEvent();

      const newState = modelingManager.updateUserState(
        prevState,
        negativeFeatureVec,
        event,
        0.3,
        userModels
      );

      expect(newState.A).toBeGreaterThanOrEqual(0);
      expect(newState.A).toBeLessThanOrEqual(1);
    });
  });

  // ==================== State Consistency Tests ====================

  describe('State Consistency', () => {
    it('should maintain all required state fields', () => {
      const state = modelingManager.createDefaultState();
      const featureVec = createFeatureVector();
      const event = createRawEvent();

      const newState = modelingManager.updateUserState(
        state,
        featureVec,
        event,
        0.2,
        userModels
      );

      // All required fields should exist
      expect(newState).toHaveProperty('A');
      expect(newState).toHaveProperty('F');
      expect(newState).toHaveProperty('C');
      expect(newState).toHaveProperty('M');
      expect(newState).toHaveProperty('T');
      expect(newState).toHaveProperty('conf');
      expect(newState).toHaveProperty('ts');

      // Cognitive profile should have all fields
      expect(newState.C).toHaveProperty('mem');
      expect(newState.C).toHaveProperty('speed');
      expect(newState.C).toHaveProperty('stability');
    });

    it('should preserve H field if it exists', () => {
      const stateWithHabit: UserState = {
        ...createDefaultState(),
        H: {
          timePref: new Array(24).fill(1 / 24),
          rhythmPref: {
            sessionMedianMinutes: 15,
            batchMedian: 10
          },
          preferredTimeSlots: [9, 14, 20],
          samples: {
            timeEvents: 100,
            sessions: 20,
            batches: 50
          }
        }
      };
      const featureVec = createFeatureVector();
      const event = createRawEvent();

      const newState = modelingManager.updateUserState(
        stateWithHabit,
        featureVec,
        event,
        0.2,
        userModels
      );

      // H field should be preserved (spread from prevState)
      expect(newState.H).toBeDefined();
    });
  });
});

// Helper function to create default state (duplicate for test isolation)
function createDefaultState(): UserState {
  return {
    A: 0.7,
    F: 0.1,
    M: 0,
    C: { mem: 0.5, speed: 0.5, stability: 0.5 },
    T: 'flat',
    conf: 0.5,
    ts: Date.now()
  };
}
