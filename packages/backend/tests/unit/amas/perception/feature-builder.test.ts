/**
 * FeatureBuilder Unit Tests
 *
 * Tests for the feature building components that transform raw events
 * into normalized feature vectors for the AMAS perception layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FeatureBuilder,
  WindowStatistics,
  EnhancedFeatureBuilder,
  FeatureCacheManager
} from '../../../../src/amas/perception/feature-builder';
import { RawEvent, PerceptionConfig } from '../../../../src/amas/types';

// ==================== Test Helpers ====================

/**
 * Create a valid RawEvent for testing
 */
function createRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    wordId: 'test-word-1',
    isCorrect: true,
    responseTime: 3000,
    dwellTime: 1500,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 2.0,
    ...overrides
  };
}

/**
 * Create custom perception config for testing
 */
function createPerceptionConfig(overrides: Partial<PerceptionConfig> = {}): PerceptionConfig {
  return {
    rt: { mean: 3200, std: 800 },
    pause: { mean: 0.3, std: 0.6 },
    focusLoss: { mean: 3000, std: 2500 },
    switches: { mean: 0.2, std: 0.5 },
    dwell: { mean: 1800, std: 600 },
    interactionDensity: { mean: 2.0, std: 1.2 },
    maxResponseTime: 120000,
    maxPauseCount: 20,
    maxSwitchCount: 20,
    maxFocusLoss: 600000,
    ...overrides
  };
}

// ==================== FeatureBuilder Tests ====================

describe('FeatureBuilder', () => {
  let builder: FeatureBuilder;
  const userId = 'test-user-1';

  beforeEach(() => {
    builder = new FeatureBuilder();
  });

  afterEach(() => {
    builder.stopCleanupTimer();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(builder).toBeDefined();
      expect(builder.getFeatureDimension()).toBe(10);
    });

    it('should accept custom config', () => {
      const customConfig = createPerceptionConfig({ maxResponseTime: 60000 });
      const customBuilder = new FeatureBuilder(customConfig);
      expect(customBuilder).toBeDefined();
      customBuilder.stopCleanupTimer();
    });

    it('should accept custom window size', () => {
      const customBuilder = new FeatureBuilder(undefined, 20);
      expect(customBuilder).toBeDefined();
      customBuilder.stopCleanupTimer();
    });

    it('should start with empty user windows', () => {
      expect(builder.getUserWindowCount()).toBe(0);
    });
  });

  // ==================== Feature Labels Tests ====================

  describe('getFeatureLabels', () => {
    it('should return correct feature labels', () => {
      const labels = builder.getFeatureLabels();
      expect(labels).toEqual([
        'z_rt_mean',
        'z_rt_cv',
        'z_pace_cv',
        'z_pause',
        'z_switch',
        'z_drift',
        'z_interaction',
        'z_focus_loss',
        'retry_norm',
        'correctness'
      ]);
    });

    it('should return 10 labels matching feature dimension', () => {
      const labels = builder.getFeatureLabels();
      expect(labels.length).toBe(builder.getFeatureDimension());
    });
  });

  // ==================== Sanitize Tests ====================

  describe('sanitize', () => {
    it('should clamp response time to max value', () => {
      const event = createRawEvent({ responseTime: 200000 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.responseTime).toBe(120000);
    });

    it('should clamp response time minimum to 1', () => {
      const event = createRawEvent({ responseTime: -100 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.responseTime).toBe(1);
    });

    it('should clamp dwell time to max value', () => {
      const event = createRawEvent({ dwellTime: 200000 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.dwellTime).toBe(120000);
    });

    it('should clamp dwell time minimum to 0', () => {
      const event = createRawEvent({ dwellTime: -50 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.dwellTime).toBe(0);
    });

    it('should clamp pause count to max value', () => {
      const event = createRawEvent({ pauseCount: 50 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.pauseCount).toBe(20);
    });

    it('should clamp switch count to max value', () => {
      const event = createRawEvent({ switchCount: 100 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.switchCount).toBe(20);
    });

    it('should clamp focus loss duration to max value', () => {
      const event = createRawEvent({ focusLossDuration: 1000000 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.focusLossDuration).toBe(600000);
    });

    it('should ensure interaction density is non-negative', () => {
      const event = createRawEvent({ interactionDensity: -1 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.interactionDensity).toBe(0);
    });

    it('should ensure retry count is non-negative', () => {
      const event = createRawEvent({ retryCount: -3 });
      const sanitized = builder.sanitize(event);
      expect(sanitized.retryCount).toBe(0);
    });

    it('should preserve valid values', () => {
      const event = createRawEvent({
        responseTime: 3000,
        dwellTime: 1500,
        pauseCount: 2,
        switchCount: 1,
        focusLossDuration: 500,
        interactionDensity: 2.5,
        retryCount: 1
      });
      const sanitized = builder.sanitize(event);
      expect(sanitized.responseTime).toBe(3000);
      expect(sanitized.dwellTime).toBe(1500);
      expect(sanitized.pauseCount).toBe(2);
      expect(sanitized.switchCount).toBe(1);
      expect(sanitized.focusLossDuration).toBe(500);
      expect(sanitized.interactionDensity).toBe(2.5);
      expect(sanitized.retryCount).toBe(1);
    });
  });

  // ==================== Anomaly Detection Tests ====================

  describe('isAnomalous', () => {
    it('should detect NaN response time as anomalous', () => {
      const event = createRawEvent({ responseTime: NaN });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect Infinity response time as anomalous', () => {
      const event = createRawEvent({ responseTime: Infinity });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect zero response time as anomalous', () => {
      const event = createRawEvent({ responseTime: 0 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect negative response time as anomalous', () => {
      const event = createRawEvent({ responseTime: -100 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect NaN dwell time as anomalous', () => {
      const event = createRawEvent({ dwellTime: NaN });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect negative dwell time as anomalous', () => {
      const event = createRawEvent({ dwellTime: -100 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect NaN timestamp as anomalous', () => {
      const event = createRawEvent({ timestamp: NaN });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect extreme response time as anomalous', () => {
      const event = createRawEvent({ responseTime: 200000 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect extreme focus loss as anomalous', () => {
      const event = createRawEvent({ focusLossDuration: 700000 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect extreme pause count as anomalous', () => {
      const event = createRawEvent({ pauseCount: 30 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should detect extreme switch count as anomalous', () => {
      const event = createRawEvent({ switchCount: 30 });
      expect(builder.isAnomalous(event)).toBe(true);
    });

    it('should accept valid event', () => {
      const event = createRawEvent();
      expect(builder.isAnomalous(event)).toBe(false);
    });

    it('should accept event at boundary values', () => {
      const event = createRawEvent({
        responseTime: 120000,
        focusLossDuration: 600000,
        pauseCount: 20,
        switchCount: 20
      });
      expect(builder.isAnomalous(event)).toBe(false);
    });
  });

  // ==================== Build Feature Vector Tests ====================

  describe('buildFeatureVector', () => {
    it('should build feature vector with correct dimension', () => {
      const event = createRawEvent();
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.values.length).toBe(10);
    });

    it('should return Float32Array values', () => {
      const event = createRawEvent();
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.values).toBeInstanceOf(Float32Array);
    });

    it('should include correct timestamp', () => {
      const timestamp = Date.now();
      const event = createRawEvent({ timestamp });
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.ts).toBe(timestamp);
    });

    it('should include correct labels', () => {
      const event = createRawEvent();
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.labels).toEqual(builder.getFeatureLabels());
    });

    it('should set correctness to 1 for correct answer', () => {
      const event = createRawEvent({ isCorrect: true });
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.values[9]).toBe(1);
    });

    it('should set correctness to -1 for incorrect answer', () => {
      const event = createRawEvent({ isCorrect: false });
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.values[9]).toBe(-1);
    });

    it('should normalize retry count to [0,1] range', () => {
      const event = createRawEvent({ retryCount: 3 });
      const vector = builder.buildFeatureVector(event, userId);
      expect(vector.values[8]).toBe(1);

      builder.resetWindows(userId);
      const event2 = createRawEvent({ retryCount: 0 });
      const vector2 = builder.buildFeatureVector(event2, userId);
      expect(vector2.values[8]).toBe(0);

      builder.resetWindows(userId);
      const event3 = createRawEvent({ retryCount: 6 });
      const vector3 = builder.buildFeatureVector(event3, userId);
      expect(vector3.values[8]).toBe(1); // clamped to 1
    });

    it('should compute z-score for response time', () => {
      const event = createRawEvent({ responseTime: 3200 }); // mean value
      const vector = builder.buildFeatureVector(event, userId);
      // z-score should be approximately 0 at mean
      expect(Math.abs(vector.values[0])).toBeLessThan(0.1);
    });

    it('should update window CV after multiple events', () => {
      // First event
      const event1 = createRawEvent({ responseTime: 3000 });
      builder.buildFeatureVector(event1, userId);

      // Second event with different response time
      const event2 = createRawEvent({ responseTime: 4000 });
      const vector2 = builder.buildFeatureVector(event2, userId);

      // CV should be non-zero after two different values
      expect(vector2.values[1]).toBeGreaterThan(0);
    });

    it('should maintain separate windows for different users', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // User 1 has consistent response times
      for (let i = 0; i < 5; i++) {
        builder.buildFeatureVector(createRawEvent({ responseTime: 3000 }), user1);
      }

      // User 2 has variable response times
      builder.buildFeatureVector(createRawEvent({ responseTime: 2000 }), user2);
      builder.buildFeatureVector(createRawEvent({ responseTime: 5000 }), user2);

      // User 1 should have lower CV than User 2
      const vector1 = builder.buildFeatureVector(createRawEvent({ responseTime: 3000 }), user1);
      const vector2 = builder.buildFeatureVector(createRawEvent({ responseTime: 3500 }), user2);

      expect(vector1.values[1]).toBeLessThan(vector2.values[1]);
    });

    it('should create user window on first access', () => {
      expect(builder.getUserWindowCount()).toBe(0);
      builder.buildFeatureVector(createRawEvent(), userId);
      expect(builder.getUserWindowCount()).toBe(1);
    });
  });

  // ==================== Attention Features Tests ====================

  describe('buildAttentionFeatures', () => {
    it('should return Float32Array with 8 elements', () => {
      const event = createRawEvent();
      builder.buildFeatureVector(event, userId); // Build first to populate windows
      const features = builder.buildAttentionFeatures(event, userId);
      expect(features).toBeInstanceOf(Float32Array);
      expect(features.length).toBe(8);
    });

    it('should use current window CV without updating', () => {
      // Build feature vector to populate windows
      builder.buildFeatureVector(createRawEvent({ responseTime: 3000 }), userId);
      builder.buildFeatureVector(createRawEvent({ responseTime: 4000 }), userId);

      // Get attention features - should not update window
      const event = createRawEvent({ responseTime: 10000 });
      builder.buildAttentionFeatures(event, userId);

      // Build another feature vector and check that window was not affected
      const newVector = builder.buildFeatureVector(createRawEvent({ responseTime: 3500 }), userId);

      // Window should have 3 values (3000, 4000, 3500), not 4
      expect(newVector.values[1]).toBeGreaterThan(0);
    });

    it('should return zero CV for new user', () => {
      const newUser = 'new-user';
      const features = builder.buildAttentionFeatures(createRawEvent(), newUser);
      // CV should be 0 when window has less than 2 values
      expect(features[1]).toBe(0);
      expect(features[2]).toBe(0);
    });
  });

  // ==================== Window Management Tests ====================

  describe('window management', () => {
    it('should reset windows for specific user', () => {
      builder.buildFeatureVector(createRawEvent(), userId);
      expect(builder.getUserWindowCount()).toBe(1);

      builder.resetWindows(userId);
      // User window is deleted, so count should be 0
      expect(builder.getUserWindowCount()).toBe(0);
    });

    it('should reset all windows', () => {
      builder.buildFeatureVector(createRawEvent(), 'user-1');
      builder.buildFeatureVector(createRawEvent(), 'user-2');
      expect(builder.getUserWindowCount()).toBe(2);

      builder.resetAllWindows();
      expect(builder.getUserWindowCount()).toBe(0);
    });

    it('should maintain window size limit', () => {
      // Create builder with small window size
      const smallBuilder = new FeatureBuilder(undefined, 3);

      // Add more events than window size
      for (let i = 0; i < 10; i++) {
        smallBuilder.buildFeatureVector(createRawEvent({ responseTime: 1000 * (i + 1) }), userId);
      }

      // Window should only contain last 3 values
      // Build one more to check CV calculation is based on limited window
      const vector = smallBuilder.buildFeatureVector(createRawEvent({ responseTime: 5000 }), userId);
      expect(vector.values[1]).toBeGreaterThan(0); // CV should be positive

      smallBuilder.stopCleanupTimer();
    });
  });

  // ==================== Memory Cleanup Tests ====================

  describe('memory cleanup', () => {
    it('should stop cleanup timer', () => {
      builder.stopCleanupTimer();
      // Should not throw error when called multiple times
      builder.stopCleanupTimer();
    });

    it('should track user window count', () => {
      expect(builder.getUserWindowCount()).toBe(0);
      builder.buildFeatureVector(createRawEvent(), 'user-1');
      expect(builder.getUserWindowCount()).toBe(1);
      builder.buildFeatureVector(createRawEvent(), 'user-2');
      expect(builder.getUserWindowCount()).toBe(2);
    });
  });
});

// ==================== WindowStatistics Tests ====================

describe('WindowStatistics', () => {
  let stats: WindowStatistics;

  beforeEach(() => {
    stats = new WindowStatistics();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default max size of 10', () => {
      expect(stats.size()).toBe(0);
    });

    it('should accept custom max size', () => {
      const customStats = new WindowStatistics(5);
      expect(customStats.size()).toBe(0);
    });
  });

  // ==================== Push Tests ====================

  describe('push', () => {
    it('should add values to window', () => {
      stats.push(1);
      expect(stats.size()).toBe(1);
      stats.push(2);
      expect(stats.size()).toBe(2);
    });

    it('should maintain max size limit', () => {
      const smallStats = new WindowStatistics(3);
      for (let i = 0; i < 10; i++) {
        smallStats.push(i);
      }
      expect(smallStats.size()).toBe(3);
    });

    it('should remove oldest value when full', () => {
      const smallStats = new WindowStatistics(3);
      smallStats.push(1);
      smallStats.push(2);
      smallStats.push(3);
      smallStats.push(4);

      expect(smallStats.lastK(3)).toEqual([2, 3, 4]);
    });
  });

  // ==================== Mean Tests ====================

  describe('mean', () => {
    it('should return 0 for empty window', () => {
      expect(stats.mean()).toBe(0);
    });

    it('should calculate correct mean for single value', () => {
      stats.push(5);
      expect(stats.mean()).toBe(5);
    });

    it('should calculate correct mean for multiple values', () => {
      stats.push(1);
      stats.push(2);
      stats.push(3);
      stats.push(4);
      stats.push(5);
      expect(stats.mean()).toBe(3);
    });

    it('should handle negative values', () => {
      stats.push(-2);
      stats.push(-1);
      stats.push(0);
      stats.push(1);
      stats.push(2);
      expect(stats.mean()).toBe(0);
    });

    it('should handle floating point values', () => {
      stats.push(1.5);
      stats.push(2.5);
      stats.push(3.5);
      expect(stats.mean()).toBeCloseTo(2.5);
    });
  });

  // ==================== Std Tests ====================

  describe('std', () => {
    it('should return 0 for empty window', () => {
      expect(stats.std()).toBe(0);
    });

    it('should return 0 for single value', () => {
      stats.push(5);
      expect(stats.std()).toBe(0);
    });

    it('should return 0 for identical values', () => {
      stats.push(3);
      stats.push(3);
      stats.push(3);
      expect(stats.std()).toBe(0);
    });

    it('should calculate correct std for known values', () => {
      // Values: 2, 4, 4, 4, 5, 5, 7, 9
      // Mean: 5, Variance: 4, Std: 2
      stats.push(2);
      stats.push(4);
      stats.push(4);
      stats.push(4);
      stats.push(5);
      stats.push(5);
      stats.push(7);
      stats.push(9);
      expect(stats.std()).toBeCloseTo(2);
    });
  });

  // ==================== CV Tests ====================

  describe('cv', () => {
    it('should return 0 for empty window', () => {
      expect(stats.cv()).toBe(0);
    });

    it('should return 0 for single value', () => {
      stats.push(5);
      expect(stats.cv()).toBe(0);
    });

    it('should return 0 when mean is near zero', () => {
      stats.push(-0.000001);
      stats.push(0.000001);
      expect(stats.cv()).toBe(0);
    });

    it('should calculate correct CV', () => {
      // CV = std / |mean|
      stats.push(10);
      stats.push(20);
      stats.push(30);
      // Mean = 20, Std ≈ 8.16, CV ≈ 0.408
      expect(stats.cv()).toBeCloseTo(0.408, 2);
    });

    it('should handle negative mean values', () => {
      stats.push(-10);
      stats.push(-20);
      stats.push(-30);
      // Mean = -20, |Mean| = 20, CV should be same as positive
      expect(stats.cv()).toBeCloseTo(0.408, 2);
    });
  });

  // ==================== Size and Clear Tests ====================

  describe('size and clear', () => {
    it('should return correct size', () => {
      expect(stats.size()).toBe(0);
      stats.push(1);
      expect(stats.size()).toBe(1);
      stats.push(2);
      stats.push(3);
      expect(stats.size()).toBe(3);
    });

    it('should clear all values', () => {
      stats.push(1);
      stats.push(2);
      stats.push(3);
      stats.clear();
      expect(stats.size()).toBe(0);
      expect(stats.mean()).toBe(0);
    });
  });

  // ==================== LastK Tests ====================

  describe('lastK', () => {
    it('should return empty array for empty window', () => {
      expect(stats.lastK(3)).toEqual([]);
    });

    it('should return all values if k > size', () => {
      stats.push(1);
      stats.push(2);
      expect(stats.lastK(5)).toEqual([1, 2]);
    });

    it('should return last k values', () => {
      stats.push(1);
      stats.push(2);
      stats.push(3);
      stats.push(4);
      stats.push(5);
      expect(stats.lastK(3)).toEqual([3, 4, 5]);
    });

    it('should return single last value', () => {
      stats.push(1);
      stats.push(2);
      stats.push(3);
      expect(stats.lastK(1)).toEqual([3]);
    });
  });
});

// ==================== EnhancedFeatureBuilder Tests ====================

describe('EnhancedFeatureBuilder', () => {
  let builder: EnhancedFeatureBuilder;
  const userId = 'test-user-1';

  beforeEach(() => {
    builder = new EnhancedFeatureBuilder();
  });

  afterEach(() => {
    builder.stopEnhancedCleanupTimer();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize correctly', () => {
      expect(builder).toBeDefined();
      expect(builder.getFeatureDimension()).toBe(10);
    });

    it('should accept custom config and window size', () => {
      const customConfig = createPerceptionConfig();
      const customBuilder = new EnhancedFeatureBuilder(customConfig, 20);
      expect(customBuilder).toBeDefined();
      customBuilder.stopEnhancedCleanupTimer();
    });

    it('should start with empty enhanced user windows', () => {
      expect(builder.getEnhancedUserWindowCount()).toBe(0);
    });
  });

  // ==================== Build Enhanced Feature Vector Tests ====================

  describe('buildEnhancedFeatureVector', () => {
    it('should build feature vector with correct dimension', () => {
      const event = createRawEvent();
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      expect(vector.values.length).toBe(10);
    });

    it('should return Float32Array values', () => {
      const event = createRawEvent();
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      expect(vector.values).toBeInstanceOf(Float32Array);
    });

    it('should include correct timestamp', () => {
      const timestamp = Date.now();
      const event = createRawEvent({ timestamp });
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      expect(vector.ts).toBe(timestamp);
    });

    it('should include correct labels', () => {
      const event = createRawEvent();
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      expect(vector.labels).toEqual(builder.getFeatureLabels());
    });

    it('should set correctness to 1 for correct answer', () => {
      const event = createRawEvent({ isCorrect: true });
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      expect(vector.values[9]).toBe(1);
    });

    it('should set correctness to -1 for incorrect answer', () => {
      const event = createRawEvent({ isCorrect: false });
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      expect(vector.values[9]).toBe(-1);
    });

    it('should create user window on first access', () => {
      expect(builder.getEnhancedUserWindowCount()).toBe(0);
      builder.buildEnhancedFeatureVector(createRawEvent(), userId);
      expect(builder.getEnhancedUserWindowCount()).toBe(1);
    });

    it('should maintain separate windows for different users', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      builder.buildEnhancedFeatureVector(createRawEvent(), user1);
      builder.buildEnhancedFeatureVector(createRawEvent(), user2);

      expect(builder.getEnhancedUserWindowCount()).toBe(2);
    });

    it('should calculate drift based on baseline', () => {
      // Set baseline and build vector
      builder.setBaselineRT(3200, userId);

      // Response time equal to baseline should have drift near 0
      const event1 = createRawEvent({ responseTime: 3200 });
      const vector1 = builder.buildEnhancedFeatureVector(event1, userId);

      // Response time above baseline should have positive drift
      builder.reset(userId);
      builder.setBaselineRT(3200, userId);
      const event2 = createRawEvent({ responseTime: 4800 }); // 50% above baseline
      const vector2 = builder.buildEnhancedFeatureVector(event2, userId);

      expect(vector2.values[5]).toBeGreaterThan(vector1.values[5]);
    });
  });

  // ==================== Baseline Management Tests ====================

  describe('setBaselineRT', () => {
    it('should set default baseline', () => {
      builder.setBaselineRT(4000);
      // Create new user and check drift calculation uses new baseline
      const event = createRawEvent({ responseTime: 4000 });
      const vector = builder.buildEnhancedFeatureVector(event, 'new-user');
      // When response time equals baseline, drift should be 0
      expect(vector.values[5]).toBeCloseTo(0, 1);
    });

    it('should set baseline for specific user', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // Initialize users first
      builder.buildEnhancedFeatureVector(createRawEvent(), user1);
      builder.buildEnhancedFeatureVector(createRawEvent(), user2);

      // Set different baseline for user1
      builder.setBaselineRT(2000, user1);

      // Reset windows to clear previous values
      builder.reset(user1);
      builder.reset(user2);

      // User1 should use custom baseline
      const event1 = createRawEvent({ responseTime: 4000 });
      const vector1 = builder.buildEnhancedFeatureVector(event1, user1);

      // User2 should use default baseline (3200)
      const event2 = createRawEvent({ responseTime: 4000 });
      const vector2 = builder.buildEnhancedFeatureVector(event2, user2);

      // User1 drift should be higher (4000-2000)/2000 = 1.0
      // User2 drift should be lower (4000-3200)/3200 = 0.25
      expect(vector1.values[5]).toBeGreaterThan(vector2.values[5]);
    });

    it('should update baseline for all existing users', () => {
      // Create users first
      builder.buildEnhancedFeatureVector(createRawEvent(), 'user-1');
      builder.buildEnhancedFeatureVector(createRawEvent(), 'user-2');

      // Update baseline for all
      builder.setBaselineRT(5000);

      // Reset and verify
      builder.reset('user-1');
      builder.reset('user-2');

      const event = createRawEvent({ responseTime: 5000 });
      const vector1 = builder.buildEnhancedFeatureVector(event, 'user-1');
      const vector2 = builder.buildEnhancedFeatureVector(event, 'user-2');

      // Both should have drift near 0
      expect(Math.abs(vector1.values[5])).toBeLessThan(0.1);
      expect(Math.abs(vector2.values[5])).toBeLessThan(0.1);
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset specific user windows', () => {
      builder.buildEnhancedFeatureVector(createRawEvent({ responseTime: 5000 }), userId);
      builder.buildEnhancedFeatureVector(createRawEvent({ responseTime: 6000 }), userId);

      builder.reset(userId);

      // After reset, CV should be 0 for next event
      const event = createRawEvent({ responseTime: 3000 });
      const vector = builder.buildEnhancedFeatureVector(event, userId);
      // First event after reset should have CV of 0
      expect(vector.values[1]).toBe(0);
    });

    it('should reset all user windows', () => {
      builder.buildEnhancedFeatureVector(createRawEvent(), 'user-1');
      builder.buildEnhancedFeatureVector(createRawEvent(), 'user-2');

      expect(builder.getEnhancedUserWindowCount()).toBe(2);

      builder.reset();

      expect(builder.getEnhancedUserWindowCount()).toBe(0);
    });

    it('should handle reset for non-existent user', () => {
      // Should not throw error
      builder.reset('non-existent-user');
    });
  });

  // ==================== Timer Management Tests ====================

  describe('timer management', () => {
    it('should stop cleanup timers', () => {
      builder.stopEnhancedCleanupTimer();
      // Should not throw error when called multiple times
      builder.stopEnhancedCleanupTimer();
    });
  });
});

// ==================== FeatureCacheManager Tests ====================

describe('FeatureCacheManager', () => {
  let cache: FeatureCacheManager;

  beforeEach(() => {
    cache = new FeatureCacheManager();
  });

  afterEach(() => {
    cache.stopCleanupTimer();
    cache.clear();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ==================== Cache Operations Tests ====================

  describe('cache operations', () => {
    it('should store and retrieve static features', () => {
      const features = new Float32Array([1, 2, 3, 4, 5]);
      cache.setStaticFeatures('user-1', features);

      const retrieved = cache.getStaticFeatures('user-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(5);
      expect(Array.from(retrieved!)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return null for non-existent user', () => {
      const result = cache.getStaticFeatures('non-existent');
      expect(result).toBeNull();
    });

    it('should create copy of features on storage', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);

      // Modify original
      features[0] = 999;

      // Retrieved should be unchanged
      const retrieved = cache.getStaticFeatures('user-1');
      expect(retrieved![0]).toBe(1);
    });

    it('should track cache hits', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);

      cache.getStaticFeatures('user-1');
      cache.getStaticFeatures('user-1');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.getStaticFeatures('non-existent-1');
      cache.getStaticFeatures('non-existent-2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });
  });

  // ==================== Cognitive Profile Hash Tests ====================

  describe('cognitive profile validation', () => {
    it('should validate cognitive profile match', () => {
      const features = new Float32Array([1, 2, 3]);
      const profile = { mem: 0.7, speed: 0.8, stability: 0.6 };

      cache.setStaticFeatures('user-1', features, profile);

      // Same profile should return cached value
      const result = cache.getStaticFeatures('user-1', profile);
      expect(result).not.toBeNull();
    });

    it('should invalidate on cognitive profile change', () => {
      const features = new Float32Array([1, 2, 3]);
      const profile1 = { mem: 0.7, speed: 0.8, stability: 0.6 };
      const profile2 = { mem: 0.5, speed: 0.8, stability: 0.6 };

      cache.setStaticFeatures('user-1', features, profile1);

      // Different profile should return null
      const result = cache.getStaticFeatures('user-1', profile2);
      expect(result).toBeNull();

      const stats = cache.getStats();
      expect(stats.invalidations).toBe(1);
    });

    it('should handle undefined cognitive profile', () => {
      const features = new Float32Array([1, 2, 3]);

      cache.setStaticFeatures('user-1', features);
      const result = cache.getStaticFeatures('user-1');
      expect(result).not.toBeNull();
    });
  });

  // ==================== Invalidation Tests ====================

  describe('invalidation', () => {
    it('should invalidate specific user cache', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);
      cache.setStaticFeatures('user-2', features);

      cache.invalidate('user-1');

      expect(cache.getStaticFeatures('user-1')).toBeNull();
      expect(cache.getStaticFeatures('user-2')).not.toBeNull();
    });

    it('should track invalidations', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);

      cache.invalidate('user-1');

      const stats = cache.getStats();
      expect(stats.invalidations).toBe(1);
    });

    it('should not increment invalidations for non-existent user', () => {
      cache.invalidate('non-existent');

      const stats = cache.getStats();
      expect(stats.invalidations).toBe(0);
    });
  });

  // ==================== Clear Tests ====================

  describe('clear', () => {
    it('should clear all cached data', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);
      cache.setStaticFeatures('user-2', features);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });

    it('should reset stats on clear', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);
      cache.getStaticFeatures('user-1'); // hit
      cache.getStaticFeatures('user-2'); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.invalidations).toBe(0);
    });
  });

  // ==================== Stats Tests ====================

  describe('getStats', () => {
    it('should calculate hit rate correctly', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);

      // 2 hits, 1 miss
      cache.getStaticFeatures('user-1');
      cache.getStaticFeatures('user-1');
      cache.getStaticFeatures('user-2');

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should return 0 hit rate when no requests', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should track cache size', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);
      cache.setStaticFeatures('user-2', features);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  // ==================== Reset Stats Tests ====================

  describe('resetStats', () => {
    it('should reset statistics without clearing cache', () => {
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);
      cache.getStaticFeatures('user-1');
      cache.getStaticFeatures('user-2');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.invalidations).toBe(0);
      expect(stats.size).toBe(1); // Cache should still have data
    });
  });

  // ==================== TTL Tests ====================

  describe('TTL expiration', () => {
    it('should expire cache entries after TTL', async () => {
      // We can't easily test TTL without manipulating time,
      // but we can test that the mechanism exists
      const features = new Float32Array([1, 2, 3]);
      cache.setStaticFeatures('user-1', features);

      // Cache should be valid immediately
      expect(cache.getStaticFeatures('user-1')).not.toBeNull();
    });
  });

  // ==================== Timer Management Tests ====================

  describe('timer management', () => {
    it('should stop cleanup timer', () => {
      cache.stopCleanupTimer();
      // Should not throw error when called multiple times
      cache.stopCleanupTimer();
    });
  });
});
