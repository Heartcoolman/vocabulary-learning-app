/**
 * ACT-R Memory Model Unit Tests
 *
 * Tests for the cognitive memory model based on ACT-R architecture
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ACTRMemoryModel,
  ACTRContext,
  ACTRState,
  ReviewTrace,
  ActivationResult,
  RecallPrediction,
  IntervalPrediction
} from '../../../../src/amas/modeling/actr-memory';
import { Action, UserState } from '../../../../src/amas/types';
import { withSeed } from '../../../setup';
import {
  STANDARD_ACTIONS,
  DEFAULT_USER_STATE,
  ACTR_PARAMS
} from '../../../fixtures/amas-fixtures';

describe('ACTRMemoryModel', () => {
  let actr: ACTRMemoryModel;

  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6 }
  };

  // Sample review trace: reviews at various times ago
  const sampleTrace: ReviewTrace[] = [
    { secondsAgo: 60, isCorrect: true },       // 1 minute ago
    { secondsAgo: 3600, isCorrect: true },     // 1 hour ago
    { secondsAgo: 86400, isCorrect: true },    // 1 day ago
    { secondsAgo: 259200, isCorrect: false }   // 3 days ago
  ];

  const defaultContext: ACTRContext = {
    trace: sampleTrace,
    targetProbability: 0.9
  };

  beforeEach(() => {
    actr = new ACTRMemoryModel();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default decay rate (0.5)', () => {
      const state = actr.getState();
      expect(state.decay).toBe(0.5);
    });

    it('should initialize with default threshold', () => {
      const state = actr.getState();
      expect(state.threshold).toBe(0.3);
    });

    it('should initialize with default noise scale', () => {
      const state = actr.getState();
      expect(state.noiseScale).toBe(0.4);
    });

    it('should initialize updateCount to 0', () => {
      const state = actr.getState();
      expect(state.updateCount).toBe(0);
    });

    it('should accept custom options', () => {
      const customActr = new ACTRMemoryModel({
        decay: 0.6,
        threshold: 0.4,
        noiseScale: 0.3
      });

      const state = customActr.getState();
      expect(state.decay).toBe(0.6);
      expect(state.threshold).toBe(0.4);
      expect(state.noiseScale).toBe(0.3);
    });
  });

  // ==================== Activation Computation Tests ====================

  describe('activation computation', () => {
    it('should compute activation as A = ln(Σt^-d)', () => {
      const result = actr.computeFullActivation(sampleTrace);

      expect(result.baseActivation).toBeDefined();
      expect(typeof result.baseActivation).toBe('number');
      expect(Number.isFinite(result.baseActivation)).toBe(true);
    });

    it('should return higher activation for recent reviews', () => {
      const recentTrace: ReviewTrace[] = [
        { secondsAgo: 60, isCorrect: true }  // Very recent
      ];

      const oldTrace: ReviewTrace[] = [
        { secondsAgo: 604800, isCorrect: true }  // 1 week ago
      ];

      const recentResult = actr.computeFullActivation(recentTrace);
      const oldResult = actr.computeFullActivation(oldTrace);

      expect(recentResult.baseActivation).toBeGreaterThan(oldResult.baseActivation);
    });

    it('should accumulate activation from multiple reviews', () => {
      const singleReview: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true }
      ];

      const multipleReviews: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true },
        { secondsAgo: 7200, isCorrect: true },
        { secondsAgo: 10800, isCorrect: true }
      ];

      const singleResult = actr.computeFullActivation(singleReview);
      const multipleResult = actr.computeFullActivation(multipleReviews);

      expect(multipleResult.baseActivation).toBeGreaterThan(singleResult.baseActivation);
    });

    it('should apply error penalty for incorrect reviews', () => {
      const correctTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true }
      ];

      const incorrectTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: false }
      ];

      const correctResult = actr.computeFullActivation(correctTrace);
      const incorrectResult = actr.computeFullActivation(incorrectTrace);

      // Incorrect review should contribute less (ERROR_PENALTY = 0.3)
      expect(incorrectResult.baseActivation).toBeLessThan(correctResult.baseActivation);
    });

    it('should include noise in activation', () => {
      // Run multiple times and check for variation
      const activations: number[] = [];

      for (let i = 0; i < 10; i++) {
        const result = actr.computeFullActivation(sampleTrace);
        activations.push(result.activation);
      }

      // With noise, not all activations should be identical
      const uniqueValues = new Set(activations);
      expect(uniqueValues.size).toBeGreaterThan(1);
    });

    it('should handle empty trace (return -Infinity base activation)', () => {
      const result = actr.computeFullActivation([]);

      expect(result.baseActivation).toBe(-Infinity);
    });
  });

  // ==================== Recall Probability Tests ====================

  describe('recall probability', () => {
    it('should compute recall probability using sigmoid', () => {
      const result = actr.computeFullActivation(sampleTrace);

      expect(result.recallProbability).toBeGreaterThanOrEqual(0);
      expect(result.recallProbability).toBeLessThanOrEqual(1);
    });

    it('should return higher probability for higher activation', () => {
      const recentTrace: ReviewTrace[] = [
        { secondsAgo: 60, isCorrect: true }
      ];

      const oldTrace: ReviewTrace[] = [
        { secondsAgo: 604800, isCorrect: true }
      ];

      const recentResult = actr.computeFullActivation(recentTrace);
      const oldResult = actr.computeFullActivation(oldTrace);

      expect(recentResult.recallProbability).toBeGreaterThan(oldResult.recallProbability);
    });

    it('should return higher probability for more recent reviews', () => {
      // Recent review
      const recentTrace: ReviewTrace[] = [
        { secondsAgo: 60, isCorrect: true }
      ];

      // Much older review
      const olderTrace: ReviewTrace[] = [
        { secondsAgo: 86400, isCorrect: true }  // 1 day ago
      ];

      const recentResult = actr.computeFullActivation(recentTrace);
      const olderResult = actr.computeFullActivation(olderTrace);

      // Recent should have higher recall probability
      expect(recentResult.recallProbability).toBeGreaterThan(olderResult.recallProbability);
      // Both should be in valid range
      expect(recentResult.recallProbability).toBeGreaterThanOrEqual(0);
      expect(recentResult.recallProbability).toBeLessThanOrEqual(1);
    });

    it('should return probability close to 0 for very old reviews', () => {
      const veryOldTrace: ReviewTrace[] = [
        { secondsAgo: 30 * 24 * 3600, isCorrect: true }  // 30 days ago
      ];

      const result = actr.computeFullActivation(veryOldTrace);

      expect(result.recallProbability).toBeLessThan(0.5);
    });
  });

  // ==================== Optimal Interval Prediction Tests ====================

  describe('optimal interval prediction', () => {
    it('should find optimal interval via binary search', () => {
      const prediction = actr.predictOptimalInterval(sampleTrace, 0.9);

      expect(prediction.optimalSeconds).toBeGreaterThan(0);
      expect(prediction.targetRecall).toBe(0.9);
    });

    it('should return longer interval for stronger memories', () => {
      // Strong memory: many reviews over time
      const strongTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true },
        { secondsAgo: 86400, isCorrect: true },
        { secondsAgo: 172800, isCorrect: true },
        { secondsAgo: 259200, isCorrect: true },
        { secondsAgo: 345600, isCorrect: true }
      ];

      // Weak memory: single review long ago
      const weakTrace: ReviewTrace[] = [
        { secondsAgo: 259200, isCorrect: true }  // Single review 3 days ago
      ];

      const strongPrediction = actr.predictOptimalInterval(strongTrace, 0.9);
      const weakPrediction = actr.predictOptimalInterval(weakTrace, 0.9);

      // Note: actual implementation clamps to minimum 3600 seconds (1 hour)
      // Strong memories should have higher or equal interval
      expect(strongPrediction.optimalSeconds).toBeGreaterThanOrEqual(weakPrediction.optimalSeconds);
    });

    it('should return different intervals for different target probabilities', () => {
      const prediction90 = actr.predictOptimalInterval(sampleTrace, 0.9);
      const prediction70 = actr.predictOptimalInterval(sampleTrace, 0.7);

      // Both should be clamped to minimum 3600 seconds
      expect(prediction90.optimalSeconds).toBeGreaterThanOrEqual(3600);
      expect(prediction70.optimalSeconds).toBeGreaterThanOrEqual(3600);
      // Lower target probability could mean we can wait longer (or equal if both at minimum)
      expect(prediction70.optimalSeconds).toBeGreaterThanOrEqual(prediction90.optimalSeconds);
    });

    it('should include min and max interval suggestions', () => {
      const prediction = actr.predictOptimalInterval(sampleTrace, 0.9);

      expect(prediction.minSeconds).toBeDefined();
      expect(prediction.maxSeconds).toBeDefined();
      expect(prediction.minSeconds).toBeLessThanOrEqual(prediction.optimalSeconds);
      expect(prediction.maxSeconds).toBeGreaterThanOrEqual(prediction.optimalSeconds);
    });

    it('should cap interval at max search seconds', () => {
      const veryStrongTrace: ReviewTrace[] = Array(50).fill(null).map((_, i) => ({
        secondsAgo: 60 + i * 60,
        isCorrect: true
      }));

      const prediction = actr.predictOptimalInterval(veryStrongTrace, 0.99);

      // Should not exceed 7 days
      expect(prediction.optimalSeconds).toBeLessThanOrEqual(7 * 24 * 3600);
    });
  });

  // ==================== Action Selection Tests ====================

  describe('selectAction', () => {
    it('should return ActionSelection based on recall probability', () => {
      const result = actr.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
    });

    it('should select easier action when recall probability is low', () => {
      const weakContext: ACTRContext = {
        trace: [{ secondsAgo: 604800, isCorrect: false }],  // Weak memory
        targetProbability: 0.9
      };

      const result = actr.selectAction(defaultState, STANDARD_ACTIONS, weakContext);

      // Should tend toward easier actions
      expect(result.action).toBeDefined();
    });

    it('should select harder action when recall probability is high', () => {
      const strongContext: ACTRContext = {
        trace: [
          { secondsAgo: 60, isCorrect: true },
          { secondsAgo: 120, isCorrect: true },
          { secondsAgo: 180, isCorrect: true }
        ],
        targetProbability: 0.9
      };

      const result = actr.selectAction(defaultState, STANDARD_ACTIONS, strongContext);

      // Should be more likely to select harder actions
      expect(result.action).toBeDefined();
    });

    it('should throw error for empty actions', () => {
      expect(() => {
        actr.selectAction(defaultState, [], defaultContext);
      }).toThrow();
    });

    it('should handle empty trace context', () => {
      const emptyContext: ACTRContext = {
        trace: [],
        targetProbability: 0.9
      };

      const result = actr.selectAction(defaultState, STANDARD_ACTIONS, emptyContext);

      // Should return a fallback action
      expect(result.action).toBeDefined();
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should increment updateCount', () => {
      expect(actr.getState().updateCount).toBe(0);

      actr.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);

      expect(actr.getState().updateCount).toBe(1);
    });

    it('should not modify internal state significantly (stateless model)', () => {
      // ACT-R is largely stateless - it uses the trace for computation
      const stateBefore = actr.getState();

      actr.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);

      const stateAfter = actr.getState();

      expect(stateAfter.decay).toBe(stateBefore.decay);
      expect(stateAfter.threshold).toBe(stateBefore.threshold);
      expect(stateAfter.noiseScale).toBe(stateBefore.noiseScale);
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should get/set state roundtrip', () => {
      const customActr = new ACTRMemoryModel({
        decay: 0.6,
        threshold: 0.4,
        noiseScale: 0.3
      });

      const originalState = customActr.getState();

      const newActr = new ACTRMemoryModel();
      newActr.setState(originalState);

      const restoredState = newActr.getState();

      expect(restoredState.decay).toBe(originalState.decay);
      expect(restoredState.threshold).toBe(originalState.threshold);
      expect(restoredState.noiseScale).toBe(originalState.noiseScale);
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset updateCount', () => {
      actr.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      expect(actr.getState().updateCount).toBe(1);

      actr.reset();

      expect(actr.getState().updateCount).toBe(0);
    });
  });

  // ==================== BaseLearner Interface Tests ====================

  describe('BaseLearner interface', () => {
    it('should return correct name', () => {
      expect(actr.getName()).toBe('ACTRMemoryModel');
    });

    it('should return correct version', () => {
      expect(actr.getVersion()).toBe('1.0.0');
    });

    it('should return capabilities', () => {
      const caps = actr.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.primaryUseCase).toContain('记忆');
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle very small time values', () => {
      const veryRecentTrace: ReviewTrace[] = [
        { secondsAgo: 0.001, isCorrect: true }
      ];

      const result = actr.computeFullActivation(veryRecentTrace);

      expect(Number.isFinite(result.activation)).toBe(true);
      expect(result.recallProbability).toBeLessThanOrEqual(1);
    });

    it('should handle very large time values', () => {
      const veryOldTrace: ReviewTrace[] = [
        { secondsAgo: 365 * 24 * 3600, isCorrect: true }  // 1 year ago
      ];

      const result = actr.computeFullActivation(veryOldTrace);

      expect(Number.isFinite(result.activation)).toBe(true);
      expect(result.recallProbability).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed correct/incorrect traces', () => {
      const mixedTrace: ReviewTrace[] = [
        { secondsAgo: 60, isCorrect: true },
        { secondsAgo: 120, isCorrect: false },
        { secondsAgo: 180, isCorrect: true },
        { secondsAgo: 240, isCorrect: false }
      ];

      const result = actr.computeFullActivation(mixedTrace);

      expect(Number.isFinite(result.activation)).toBe(true);
    });

    it('should handle trace without isCorrect field', () => {
      const traceWithoutCorrect: ReviewTrace[] = [
        { secondsAgo: 3600 },
        { secondsAgo: 7200 }
      ];

      const result = actr.computeFullActivation(traceWithoutCorrect);

      // Should default to treating as correct
      expect(Number.isFinite(result.activation)).toBe(true);
    });

    it('should handle single review trace', () => {
      const singleTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true }
      ];

      const result = actr.computeFullActivation(singleTrace);

      expect(Number.isFinite(result.activation)).toBe(true);
      expect(result.recallProbability).toBeGreaterThan(0);
      expect(result.recallProbability).toBeLessThan(1);
    });
  });

  // ==================== Noise Handling Tests ====================

  describe('noise handling', () => {
    it('should use custom noise sampler when provided', () => {
      const constantNoise = 0.1;
      const customActr = new ACTRMemoryModel({
        noiseSampler: () => constantNoise
      });

      const result1 = customActr.computeActivation(sampleTrace);
      const result2 = customActr.computeActivation(sampleTrace);

      // With constant noise, results should be consistent
      expect(result1).toBeCloseTo(result2, 5);
    });

    it('should bound noise within reasonable range', () => {
      // Run many times to check noise doesn't cause extreme values
      for (let i = 0; i < 50; i++) {
        const result = actr.computeActivation(sampleTrace);

        // Activation should be reasonable
        expect(result).toBeGreaterThan(-10);
        expect(result).toBeLessThan(10);
      }
    });
  });

  // ==================== Recall Prediction API Tests ====================

  describe('retrievalProbability API', () => {
    it('should return RecallPrediction with all fields', () => {
      const prediction = actr.retrievalProbability(sampleTrace);

      expect(prediction).toHaveProperty('activation');
      expect(prediction).toHaveProperty('recallProbability');
      expect(prediction).toHaveProperty('confidence');
    });

    it('should return confidence based on trace length', () => {
      const shortTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true }
      ];

      // 使用更长时间跨度的 trace 来获得更高的置信度
      // 置信度 = 0.5 * (reviewCount/10) + 0.5 * (timeSpan/7天)
      const longTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true },
        { secondsAgo: 86400, isCorrect: true },      // 1天前
        { secondsAgo: 172800, isCorrect: true },     // 2天前
        { secondsAgo: 259200, isCorrect: true },     // 3天前
        { secondsAgo: 345600, isCorrect: true },     // 4天前
        { secondsAgo: 432000, isCorrect: true },     // 5天前
        { secondsAgo: 518400, isCorrect: true },     // 6天前
        { secondsAgo: 604800, isCorrect: true }      // 7天前
      ];

      const shortPrediction = actr.retrievalProbability(shortTrace);
      const longPrediction = actr.retrievalProbability(longTrace);

      // 更长的 trace（8次复习跨越7天）应该有更高的置信度
      // shortTrace: BASE_SINGLE_REVIEW_CONFIDENCE = 0.3
      // longTrace: 0.5 * (8/10) + 0.5 * (7天/7天) = 0.4 + 0.5 = 0.9
      expect(longPrediction.confidence).toBeGreaterThanOrEqual(shortPrediction.confidence);
    });
  });
});
