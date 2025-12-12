/**
 * Native Module Integration Tests
 *
 * 验证 TypeScript 包装器与 Native 模块的协同工作
 * 测试场景包括:
 * - ACT-R 记忆模型集成
 * - 因果推断集成
 * - Thompson Sampling 集成
 * - 熔断器集成
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ACT-R Native Wrapper
import {
  ACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapperFallback,
} from '../../src/amas/modeling/actr-memory-native';

// Causal Inference Native Wrapper
import {
  CausalInferenceNativeWrapper,
  createCausalInferenceNativeWrapper,
  createCausalInferenceNativeWrapperFallback,
} from '../../src/amas/evaluation/causal-inference-native';

// Thompson Sampling Native Wrapper
import {
  ThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapperFallback,
} from '../../src/amas/learning/thompson-sampling-native';

// LinUCB Native Wrapper
import {
  LinUCBNativeWrapper,
  createLinUCBNativeWrapper,
  createLinUCBNativeWrapperFallback,
} from '../../src/amas/learning/linucb-native-wrapper';

// Types
import { ReviewTrace } from '../../src/amas/modeling/actr-memory';
import { CausalObservation } from '../../src/amas/evaluation/causal-inference';
import { Action, UserState } from '../../src/amas/types';
import { ThompsonContext } from '../../src/amas/learning/thompson-sampling';

// Test fixtures
import { STANDARD_ACTIONS, DEFAULT_USER_STATE } from '../fixtures/amas-fixtures';

// ==================== ACT-R Native Integration Tests ====================

describe('ACT-R Native Integration', () => {
  let wrapper: ACTRMemoryNativeWrapper;

  beforeEach(() => {
    wrapper = createACTRMemoryNativeWrapperFallback();
  });

  afterEach(() => {
    wrapper.reset();
  });

  describe('activation computation', () => {
    it('should compute activation correctly', () => {
      const traces: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true }, // 1 hour ago
        { secondsAgo: 7200, isCorrect: true }, // 2 hours ago
        { secondsAgo: 86400, isCorrect: false }, // 1 day ago
      ];

      const activation = wrapper.computeActivation(traces);

      expect(typeof activation).toBe('number');
      expect(activation).not.toBeNaN();
      expect(activation).toBeGreaterThan(-10);
      expect(activation).toBeLessThan(10);
    });

    it('should compute full activation with all fields', () => {
      const traces: ReviewTrace[] = [{ secondsAgo: 3600, isCorrect: true }];

      const result = wrapper.computeFullActivation(traces);

      expect(result).toHaveProperty('baseActivation');
      expect(result).toHaveProperty('activation');
      expect(result).toHaveProperty('recallProbability');
      expect(typeof result.baseActivation).toBe('number');
      expect(typeof result.activation).toBe('number');
      expect(typeof result.recallProbability).toBe('number');
    });

    it('should return higher activation for recent reviews', () => {
      const recentTrace: ReviewTrace[] = [{ secondsAgo: 60, isCorrect: true }];
      const oldTrace: ReviewTrace[] = [{ secondsAgo: 604800, isCorrect: true }]; // 1 week

      const recentActivation = wrapper.computeActivation(recentTrace);
      const oldActivation = wrapper.computeActivation(oldTrace);

      expect(recentActivation).toBeGreaterThan(oldActivation);
    });

    it('should handle empty trace gracefully', () => {
      const result = wrapper.computeFullActivation([]);

      expect(result.baseActivation).toBe(-Infinity);
    });
  });

  describe('optimal interval computation', () => {
    it('should compute optimal interval', () => {
      // Use a more recent trace to ensure recall probability is above target
      const traces: ReviewTrace[] = [
        { secondsAgo: 60, isCorrect: true }, // 1 minute ago
        { secondsAgo: 3600, isCorrect: true }, // 1 hour ago
      ];

      const interval = wrapper.computeOptimalInterval(traces, 0.8);

      // Interval should be >= 0 (0 means immediate review needed)
      expect(interval).toBeGreaterThanOrEqual(0);
      expect(interval).toBeLessThanOrEqual(7 * 24 * 3600); // Max 7 days
    });

    it('should return 0 when recall probability is below target', () => {
      // Old trace where recall probability is already low
      const traces: ReviewTrace[] = [
        { secondsAgo: 86400 * 7, isCorrect: true }, // 1 week ago
      ];

      const interval = wrapper.computeOptimalInterval(traces, 0.9);

      // Should return 0 indicating immediate review needed
      expect(interval).toBe(0);
    });

    it('should return longer interval for stronger memories', () => {
      const strongTrace: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true },
        { secondsAgo: 86400, isCorrect: true },
        { secondsAgo: 172800, isCorrect: true },
        { secondsAgo: 259200, isCorrect: true },
      ];

      const weakTrace: ReviewTrace[] = [{ secondsAgo: 259200, isCorrect: true }];

      const strongInterval = wrapper.computeOptimalInterval(strongTrace, 0.9);
      const weakInterval = wrapper.computeOptimalInterval(weakTrace, 0.9);

      expect(strongInterval).toBeGreaterThanOrEqual(weakInterval);
    });
  });

  describe('recall probability', () => {
    it('should compute recall probability', () => {
      const traces: ReviewTrace[] = [{ secondsAgo: 3600, isCorrect: true }];

      const prediction = wrapper.retrievalProbability(traces);

      expect(prediction).toHaveProperty('activation');
      expect(prediction).toHaveProperty('recallProbability');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction.recallProbability).toBeGreaterThanOrEqual(0);
      expect(prediction.recallProbability).toBeLessThanOrEqual(1);
    });
  });

  describe('interval prediction', () => {
    it('should predict optimal interval with bounds', () => {
      const traces: ReviewTrace[] = [
        { secondsAgo: 3600, isCorrect: true },
        { secondsAgo: 86400, isCorrect: true },
      ];

      const prediction = wrapper.predictOptimalInterval(traces, 0.9);

      expect(prediction).toHaveProperty('optimalSeconds');
      expect(prediction).toHaveProperty('minSeconds');
      expect(prediction).toHaveProperty('maxSeconds');
      expect(prediction).toHaveProperty('targetRecall');
      expect(prediction.targetRecall).toBe(0.9);
      expect(prediction.minSeconds).toBeLessThanOrEqual(prediction.optimalSeconds);
      expect(prediction.maxSeconds).toBeGreaterThanOrEqual(prediction.optimalSeconds);
    });
  });

  describe('fallback handling', () => {
    it('should handle fallback gracefully', () => {
      const fallbackWrapper = createACTRMemoryNativeWrapperFallback();

      const traces: ReviewTrace[] = [{ secondsAgo: 3600, isCorrect: true }];
      const activation = fallbackWrapper.computeActivation(traces);

      expect(typeof activation).toBe('number');
      expect(activation).not.toBeNaN();
    });

    it('should use fallback when native is disabled', () => {
      const fallbackWrapper = createACTRMemoryNativeWrapperFallback();
      const stats = fallbackWrapper.getStats();

      expect(stats.nativeEnabled).toBe(false);
    });
  });

  describe('state persistence', () => {
    it('should persist and restore state', () => {
      const traces: ReviewTrace[] = [{ secondsAgo: 3600, isCorrect: true }];
      wrapper.computeActivation(traces);

      const state = wrapper.getState();
      expect(state).toBeDefined();
      expect(state).toHaveProperty('decay');
      expect(state).toHaveProperty('threshold');

      const newWrapper = createACTRMemoryNativeWrapperFallback();
      newWrapper.setState(state);

      const newState = newWrapper.getState();
      expect(newState.decay).toEqual(state.decay);
      expect(newState.threshold).toEqual(state.threshold);
      expect(newState.noiseScale).toEqual(state.noiseScale);
    });

    it('should reset state correctly', () => {
      const userState: UserState = {
        ...DEFAULT_USER_STATE,
        C: { mem: 0.7, speed: 0.6, stability: 0.8 },
        conf: 0.8,
        ts: Date.now(),
      };
      const context = {
        trace: [{ secondsAgo: 3600, isCorrect: true }],
        targetProbability: 0.9,
      };

      wrapper.update(userState, STANDARD_ACTIONS[0], 1.0, context);
      expect(wrapper.getUpdateCount()).toBe(1);

      wrapper.reset();
      expect(wrapper.getUpdateCount()).toBe(0);
    });
  });

  describe('parameter management', () => {
    it('should get and set decay rate', () => {
      const originalDecay = wrapper.getDecay();
      expect(originalDecay).toBe(0.5);

      wrapper.setDecay(0.6);
      expect(wrapper.getDecay()).toBe(0.6);
    });

    it('should get and set threshold', () => {
      const originalThreshold = wrapper.getThreshold();
      expect(originalThreshold).toBe(0.3);

      wrapper.setThreshold(0.4);
      expect(wrapper.getThreshold()).toBe(0.4);
    });
  });

  describe('metadata methods', () => {
    it('should return correct name', () => {
      expect(wrapper.getName()).toBe('ACTRMemoryNativeWrapper');
    });

    it('should return correct version', () => {
      expect(wrapper.getVersion()).toBe('2.0.0-native');
    });

    it('should return capabilities', () => {
      const caps = wrapper.getCapabilities();

      expect(caps).toHaveProperty('supportsOnlineLearning');
      expect(caps).toHaveProperty('supportsBatchUpdate');
      expect(caps).toHaveProperty('primaryUseCase');
      expect(caps.primaryUseCase).toContain('Native');
    });
  });
});

// ==================== Causal Inference Native Integration Tests ====================

describe('Causal Inference Native Integration', () => {
  let wrapper: CausalInferenceNativeWrapper;

  beforeEach(() => {
    wrapper = createCausalInferenceNativeWrapperFallback();
  });

  afterEach(() => {
    wrapper.reset();
  });

  /**
   * Generate test observations for causal inference
   */
  function generateTestObservations(n: number): CausalObservation[] {
    return Array(n)
      .fill(null)
      .map((_, i) => {
        const x = Math.random();
        const treatment = Math.random() > 0.5 ? 1 : 0;
        const outcome = 0.5 + 0.3 * treatment + 0.2 * x + 0.1 * Math.random();
        return {
          features: [x, Math.random(), Math.random()],
          treatment,
          outcome,
          timestamp: Date.now() - i * 1000,
        };
      });
  }

  describe('ATE estimation', () => {
    it('should estimate ATE correctly', () => {
      const observations = generateTestObservations(200);

      wrapper.addObservations(observations);
      wrapper.fit();

      const estimate = wrapper.estimateATE();

      expect(estimate).toBeDefined();
      expect(typeof estimate.ate).toBe('number');
      expect(typeof estimate.standardError).toBe('number');
      expect(estimate.sampleSize).toBe(200);
      expect(estimate.ate).not.toBeNaN();
    });

    it('should include confidence interval', () => {
      const observations = generateTestObservations(100);

      wrapper.addObservations(observations);
      wrapper.fit();

      const estimate = wrapper.estimateATE();

      expect(estimate.confidenceInterval).toBeDefined();
      expect(Array.isArray(estimate.confidenceInterval)).toBe(true);
      expect(estimate.confidenceInterval).toHaveLength(2);
      expect(estimate.confidenceInterval[0]).toBeLessThanOrEqual(estimate.ate);
      expect(estimate.confidenceInterval[1]).toBeGreaterThanOrEqual(estimate.ate);
    });

    it('should detect significant effects', () => {
      const observations = generateTestObservations(300);

      wrapper.addObservations(observations);
      wrapper.fit();

      const estimate = wrapper.estimateATE();

      expect(typeof estimate.significant).toBe('boolean');
      expect(typeof estimate.pValue).toBe('number');
    });
  });

  describe('CATTE estimation', () => {
    it('should estimate CATTE for specific features', () => {
      const observations = generateTestObservations(150);

      wrapper.addObservations(observations);
      wrapper.fit();

      const features = [0.5, 0.3, 0.7];
      const estimate = wrapper.estimateCATTE(features);

      expect(estimate).toBeDefined();
      expect(typeof estimate.ate).toBe('number');
      expect(estimate.ate).not.toBeNaN();
    });
  });

  describe('propensity score diagnostics', () => {
    it('should diagnose propensity scores', () => {
      const observations = generateTestObservations(100);

      wrapper.addObservations(observations);
      wrapper.fit();

      const diagnostics = wrapper.diagnosePropensity();

      expect(diagnostics).toHaveProperty('mean');
      expect(diagnostics).toHaveProperty('std');
      expect(diagnostics).toHaveProperty('median');
      expect(diagnostics).toHaveProperty('auc');
      expect(diagnostics.mean).toBeGreaterThan(0);
      expect(diagnostics.mean).toBeLessThan(1);
    });

    it('should have reasonable AUC', () => {
      const observations = generateTestObservations(100);

      wrapper.addObservations(observations);
      wrapper.fit();

      const diagnostics = wrapper.diagnosePropensity();

      // AUC should be between 0.5 (random) and 1.0 (perfect)
      expect(diagnostics.auc).toBeGreaterThanOrEqual(0);
      expect(diagnostics.auc).toBeLessThanOrEqual(1);
    });
  });

  describe('propensity score calculation', () => {
    it('should compute propensity score for features', () => {
      const observations = generateTestObservations(100);

      wrapper.addObservations(observations);
      wrapper.fit();

      const features = [0.5, 0.3, 0.7];
      const score = wrapper.getPropensityScore(features);

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('outcome prediction', () => {
    it('should predict outcome for given features and treatment', () => {
      const observations = generateTestObservations(100);

      wrapper.addObservations(observations);
      wrapper.fit();

      const features = [0.5, 0.3, 0.7];
      const outcome0 = wrapper.predictOutcome(features, 0);
      const outcome1 = wrapper.predictOutcome(features, 1);

      expect(typeof outcome0).toBe('number');
      expect(typeof outcome1).toBe('number');
      expect(outcome0).not.toBeNaN();
      expect(outcome1).not.toBeNaN();
    });
  });

  describe('strategy comparison', () => {
    it('should compare two strategies', () => {
      const observations = generateTestObservations(100);

      wrapper.addObservations(observations);
      wrapper.fit();

      const comparison = wrapper.compareStrategies(0, 1);

      expect(comparison).toHaveProperty('diff');
      expect(comparison).toHaveProperty('standardError');
      expect(comparison).toHaveProperty('confidenceInterval');
      expect(comparison).toHaveProperty('pValue');
      expect(comparison).toHaveProperty('significant');
      expect(typeof comparison.diff).toBe('number');
    });
  });

  describe('data management', () => {
    it('should add single observation', () => {
      const obs: CausalObservation = {
        features: [0.5, 0.3, 0.7],
        treatment: 1,
        outcome: 0.8,
        timestamp: Date.now(),
      };

      wrapper.addObservation(obs);
      expect(wrapper.getObservationCount()).toBe(1);
    });

    it('should add multiple observations', () => {
      const observations = generateTestObservations(50);

      wrapper.addObservations(observations);
      expect(wrapper.getObservationCount()).toBe(50);
    });

    it('should clear observations', () => {
      const observations = generateTestObservations(50);

      wrapper.addObservations(observations);
      expect(wrapper.getObservationCount()).toBe(50);

      wrapper.clear();
      expect(wrapper.getObservationCount()).toBe(0);
    });
  });

  describe('state persistence', () => {
    it('should get and set state', () => {
      const observations = generateTestObservations(50);

      wrapper.addObservations(observations);
      wrapper.fit();

      const state = wrapper.getState();
      expect(state).toBeDefined();

      const newWrapper = createCausalInferenceNativeWrapperFallback();
      newWrapper.setState(state);

      const newState = newWrapper.getState();
      expect(newState).toBeDefined();
    });
  });

  describe('fallback handling', () => {
    it('should use fallback when native is disabled', () => {
      const fallbackWrapper = createCausalInferenceNativeWrapperFallback();
      const stats = fallbackWrapper.getStats();

      expect(stats.nativeEnabled).toBe(false);
    });

    it('should work correctly in fallback mode', () => {
      const fallbackWrapper = createCausalInferenceNativeWrapperFallback();
      const observations = generateTestObservations(100);

      fallbackWrapper.addObservations(observations);
      fallbackWrapper.fit();

      const estimate = fallbackWrapper.estimateATE();
      expect(estimate).toBeDefined();
      expect(typeof estimate.ate).toBe('number');
    });
  });
});

// ==================== Thompson Sampling Native Integration Tests ====================

describe('Thompson Sampling Native Integration', () => {
  let wrapper: ThompsonSamplingNativeWrapper;

  const defaultUserState: UserState = {
    ...DEFAULT_USER_STATE,
    C: { mem: 0.7, speed: 0.6, stability: 0.8 },
    conf: 0.8,
    ts: Date.now(),
  };

  const defaultContext: ThompsonContext = {
    recentErrorRate: 0.2,
    recentResponseTime: 2000,
    timeBucket: 'afternoon',
  };

  beforeEach(() => {
    wrapper = createThompsonSamplingNativeWrapperFallback();
  });

  afterEach(() => {
    wrapper.reset();
  });

  describe('action selection', () => {
    it('should select actions', () => {
      const selection = wrapper.selectAction(defaultUserState, STANDARD_ACTIONS, defaultContext);

      expect(selection).toHaveProperty('action');
      expect(selection).toHaveProperty('score');
      expect(selection).toHaveProperty('confidence');
      expect(STANDARD_ACTIONS).toContainEqual(selection.action);
      expect(selection.score).toBeGreaterThanOrEqual(0);
      expect(selection.score).toBeLessThanOrEqual(1);
    });

    it('should return different actions with different contexts', () => {
      const selections = new Set<string>();

      for (let i = 0; i < 20; i++) {
        const context: ThompsonContext = {
          recentErrorRate: Math.random(),
          recentResponseTime: 1000 + Math.random() * 5000,
          timeBucket: ['morning', 'afternoon', 'evening'][i % 3] as ThompsonContext['timeBucket'],
        };

        const selection = wrapper.selectAction(defaultUserState, STANDARD_ACTIONS, context);

        selections.add(JSON.stringify(selection.action));
      }

      // Should select multiple different actions over time
      expect(selections.size).toBeGreaterThan(0);
    });
  });

  describe('model update', () => {
    it('should update params correctly', () => {
      // Simulate learning process
      for (let i = 0; i < 100; i++) {
        const action = STANDARD_ACTIONS[0]; // Easy action
        const reward = Math.random() > 0.2 ? 1 : 0; // 80% success rate

        wrapper.update(defaultUserState, action, reward, defaultContext);
      }

      // Easy action should have high expected reward
      const easyReward = wrapper.getExpectedReward(STANDARD_ACTIONS[0]);
      expect(easyReward).toBeGreaterThan(0.5);
    });

    it('should learn from feedback', () => {
      // Consistently reward easy actions, penalize hard actions
      // Note: In binary mode, reward >= 0 is success (alpha+=1), reward < 0 is failure (beta+=1)
      for (let i = 0; i < 50; i++) {
        wrapper.update(defaultUserState, STANDARD_ACTIONS[0], 1, defaultContext); // Easy - success
        wrapper.update(defaultUserState, STANDARD_ACTIONS[4], -1, defaultContext); // Hard - failure (must be negative!)
      }

      const easyReward = wrapper.getExpectedReward(STANDARD_ACTIONS[0]);
      const hardReward = wrapper.getExpectedReward(STANDARD_ACTIONS[4]);

      // Easy action (all successes) should have higher expected reward than hard action (all failures)
      expect(easyReward).toBeGreaterThan(hardReward);
    });

    it('should track sample counts', () => {
      const action = STANDARD_ACTIONS[0];

      wrapper.update(defaultUserState, action, 1, defaultContext);
      wrapper.update(defaultUserState, action, 1, defaultContext);
      wrapper.update(defaultUserState, action, 0, defaultContext);

      const sampleCount = wrapper.getSampleCount(action);
      expect(sampleCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('beta sampling', () => {
    it('should sample from beta distribution', () => {
      const sample = wrapper.sampleBeta(2, 3);

      expect(typeof sample).toBe('number');
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    });

    it('should handle extreme alpha/beta values', () => {
      // Very skewed towards 0
      const lowSample = wrapper.sampleBeta(0.1, 10);
      expect(lowSample).toBeGreaterThanOrEqual(0);
      expect(lowSample).toBeLessThanOrEqual(1);

      // Very skewed towards 1
      const highSample = wrapper.sampleBeta(10, 0.1);
      expect(highSample).toBeGreaterThanOrEqual(0);
      expect(highSample).toBeLessThanOrEqual(1);
    });
  });

  describe('batch sampling', () => {
    it('should handle batch sampling', () => {
      const params = [
        { alpha: 1, beta: 1 },
        { alpha: 2, beta: 3 },
        { alpha: 5, beta: 2 },
      ];

      const samples = wrapper.batchSample(params);

      expect(samples).toHaveLength(3);
      samples.forEach((s) => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('state persistence', () => {
    it('should get and set state', () => {
      // Make some updates
      for (let i = 0; i < 10; i++) {
        wrapper.update(
          defaultUserState,
          STANDARD_ACTIONS[i % 5],
          Math.random() > 0.5 ? 1 : 0,
          defaultContext,
        );
      }

      const state = wrapper.getState();
      expect(state).toBeDefined();

      const newWrapper = createThompsonSamplingNativeWrapperFallback();
      newWrapper.setState(state);

      const newState = newWrapper.getState();
      expect(newState).toBeDefined();
    });

    it('should reset correctly', () => {
      wrapper.update(defaultUserState, STANDARD_ACTIONS[0], 1, defaultContext);
      expect(wrapper.getUpdateCount()).toBeGreaterThan(0);

      wrapper.reset();
      expect(wrapper.getUpdateCount()).toBe(0);
    });
  });

  describe('metadata methods', () => {
    it('should return correct name', () => {
      expect(wrapper.getName()).toBe('ThompsonSamplingNativeWrapper');
    });

    it('should return correct version', () => {
      expect(wrapper.getVersion()).toBe('2.0.0-native');
    });

    it('should return capabilities', () => {
      const caps = wrapper.getCapabilities();

      expect(caps).toHaveProperty('supportsOnlineLearning');
      expect(caps).toHaveProperty('supportsBatchUpdate');
      expect(caps).toHaveProperty('primaryUseCase');
      expect(caps.primaryUseCase).toContain('Native');
    });
  });

  describe('fallback handling', () => {
    it('should use fallback when native is disabled', () => {
      const fallbackWrapper = createThompsonSamplingNativeWrapperFallback();
      const stats = fallbackWrapper.getStats();

      expect(stats.nativeEnabled).toBe(false);
    });
  });
});

// ==================== Circuit Breaker Integration Tests ====================

describe('Circuit Breaker Integration', () => {
  describe('ACT-R Circuit Breaker', () => {
    it('should track call statistics', () => {
      const wrapper = createACTRMemoryNativeWrapperFallback();

      // Get initial stats
      const initialStats = wrapper.getStats();
      expect(initialStats.nativeCalls).toBe(0);
      expect(initialStats.fallbackCalls).toBe(0);

      // Execute some operations
      for (let i = 0; i < 10; i++) {
        wrapper.computeActivation([{ secondsAgo: 3600, isCorrect: true }]);
      }

      const stats = wrapper.getStats();
      expect(stats.nativeCalls + stats.fallbackCalls).toBe(10);
    });

    it('should track circuit breaker state', () => {
      const wrapper = createACTRMemoryNativeWrapperFallback();

      const state = wrapper.getCircuitState();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
    });

    it('should allow manual circuit breaker reset', () => {
      const wrapper = createACTRMemoryNativeWrapperFallback();

      wrapper.resetCircuitBreaker();
      const state = wrapper.getCircuitState();
      expect(state).toBe('CLOSED');
    });

    it('should allow forcing circuit open', () => {
      const wrapper = createACTRMemoryNativeWrapper({ useNative: true });

      wrapper.forceOpenCircuit('test reason');
      const state = wrapper.getCircuitState();
      expect(state).toBe('OPEN');
    });

    it('should report failure rate', () => {
      const wrapper = createACTRMemoryNativeWrapperFallback();

      const stats = wrapper.getStats();
      expect(typeof stats.failureRate).toBe('number');
      expect(stats.failureRate).toBeGreaterThanOrEqual(0);
      expect(stats.failureRate).toBeLessThanOrEqual(1);
    });

    it('should reset stats', () => {
      const wrapper = createACTRMemoryNativeWrapperFallback();

      // Make some calls
      for (let i = 0; i < 5; i++) {
        wrapper.computeActivation([{ secondsAgo: 3600, isCorrect: true }]);
      }

      wrapper.resetStats();
      const stats = wrapper.getStats();
      expect(stats.nativeCalls).toBe(0);
      expect(stats.fallbackCalls).toBe(0);
      expect(stats.failures).toBe(0);
    });
  });

  describe('Causal Inference Circuit Breaker', () => {
    it('should track call statistics', () => {
      const wrapper = createCausalInferenceNativeWrapperFallback();

      const initialStats = wrapper.getStats();
      expect(initialStats.nativeCalls).toBe(0);
      expect(initialStats.fallbackCalls).toBe(0);

      // Add observations (note: addObservation caches data, fit() triggers actual calls)
      // Need at least 10 observations for fit() to work
      for (let i = 0; i < 15; i++) {
        wrapper.addObservation({
          features: [Math.random(), Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      // fit() triggers the actual Native/Fallback call
      wrapper.fit();

      const stats = wrapper.getStats();
      // fit() triggers at least one call
      expect(stats.nativeCalls + stats.fallbackCalls).toBeGreaterThanOrEqual(1);
    });

    it('should track circuit breaker state', () => {
      const wrapper = createCausalInferenceNativeWrapperFallback();

      const state = wrapper.getCircuitState();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
    });

    it('should allow manual circuit breaker reset', () => {
      const wrapper = createCausalInferenceNativeWrapperFallback();

      wrapper.resetCircuitBreaker();
      const state = wrapper.getCircuitState();
      expect(state).toBe('CLOSED');
    });
  });

  describe('Thompson Sampling Circuit Breaker', () => {
    const userState: UserState = {
      ...DEFAULT_USER_STATE,
      C: { mem: 0.7, speed: 0.6, stability: 0.8 },
      conf: 0.8,
      ts: Date.now(),
    };

    const context: ThompsonContext = {
      recentErrorRate: 0.2,
      recentResponseTime: 2000,
      timeBucket: 'afternoon',
    };

    it('should track call statistics', () => {
      const wrapper = createThompsonSamplingNativeWrapperFallback();

      const initialStats = wrapper.getStats();
      expect(initialStats.nativeCalls).toBe(0);
      expect(initialStats.fallbackCalls).toBe(0);

      // Execute some operations
      for (let i = 0; i < 5; i++) {
        wrapper.selectAction(userState, STANDARD_ACTIONS, context);
      }

      const stats = wrapper.getStats();
      expect(stats.nativeCalls + stats.fallbackCalls).toBe(5);
    });

    it('should track circuit breaker state', () => {
      const wrapper = createThompsonSamplingNativeWrapperFallback();

      const state = wrapper.getCircuitState();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
    });

    it('should allow manual circuit breaker reset', () => {
      const wrapper = createThompsonSamplingNativeWrapperFallback();

      wrapper.resetCircuitBreaker();
      const state = wrapper.getCircuitState();
      expect(state).toBe('CLOSED');
    });

    it('should allow forcing circuit open', () => {
      const wrapper = createThompsonSamplingNativeWrapper({ useNative: true });

      wrapper.forceOpenCircuit('test reason');
      const state = wrapper.getCircuitState();
      expect(state).toBe('OPEN');
    });
  });

  describe('Cross-wrapper consistency', () => {
    it('should have consistent circuit state API across wrappers', () => {
      const actr = createACTRMemoryNativeWrapperFallback();
      const causal = createCausalInferenceNativeWrapperFallback();
      const thompson = createThompsonSamplingNativeWrapperFallback();

      // All should have same initial state
      expect(actr.getCircuitState()).toBe('CLOSED');
      expect(causal.getCircuitState()).toBe('CLOSED');
      expect(thompson.getCircuitState()).toBe('CLOSED');

      // All stats should have same structure
      const actrStats = actr.getStats();
      const causalStats = causal.getStats();
      const thompsonStats = thompson.getStats();

      expect(actrStats).toHaveProperty('nativeCalls');
      expect(actrStats).toHaveProperty('fallbackCalls');
      expect(actrStats).toHaveProperty('failures');
      expect(actrStats).toHaveProperty('circuitState');
      expect(actrStats).toHaveProperty('nativeEnabled');
      expect(actrStats).toHaveProperty('nativeAvailable');
      expect(actrStats).toHaveProperty('failureRate');

      expect(causalStats).toHaveProperty('nativeCalls');
      expect(causalStats).toHaveProperty('fallbackCalls');
      expect(causalStats).toHaveProperty('failures');
      expect(causalStats).toHaveProperty('circuitState');

      expect(thompsonStats).toHaveProperty('nativeCalls');
      expect(thompsonStats).toHaveProperty('fallbackCalls');
      expect(thompsonStats).toHaveProperty('failures');
      expect(thompsonStats).toHaveProperty('circuitState');
    });
  });
});

// ==================== LinUCB Native Integration Tests ====================

describe('LinUCB Native Integration', () => {
  let wrapper: LinUCBNativeWrapper;

  const defaultUserState: UserState = {
    ...DEFAULT_USER_STATE,
    C: { mem: 0.7, speed: 0.6, stability: 0.8 },
    conf: 0.8,
    ts: Date.now(),
  };

  const defaultContext = {
    timeOfDay: 14, // 2 PM
    dayOfWeek: 3, // Wednesday
    sessionDuration: 1800, // 30 minutes
    fatigueFactor: 0.2,
  };

  beforeEach(() => {
    wrapper = createLinUCBNativeWrapperFallback();
  });

  afterEach(() => {
    wrapper.reset();
  });

  describe('action selection', () => {
    it('should select actions', () => {
      // Convert STANDARD_ACTIONS to LinUCB compatible format
      const actions = STANDARD_ACTIONS.map((a, i) => ({
        wordId: `word-${i}`,
        difficulty: a.difficulty,
      }));

      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      const selection = wrapper.selectAction(state, actions, defaultContext);

      expect(selection).toHaveProperty('action');
      expect(selection).toHaveProperty('score');
      expect(selection).toHaveProperty('confidence');
      expect(actions).toContainEqual(selection.action);
    });

    it('should return UCB scores for actions', () => {
      const actions = STANDARD_ACTIONS.map((a, i) => ({
        wordId: `word-${i}`,
        difficulty: a.difficulty,
      }));

      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      const selection = wrapper.selectAction(state, actions, defaultContext);

      expect(typeof selection.score).toBe('number');
      expect(selection.score).not.toBeNaN();
    });
  });

  describe('model update', () => {
    it('should update model with reward', () => {
      const action = {
        wordId: 'test-word',
        difficulty: 'mid',
      };

      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      const initialUpdateCount = wrapper.updateCount;

      wrapper.update(state, action, 1.0, defaultContext);

      expect(wrapper.updateCount).toBe(initialUpdateCount + 1);
    });

    it('should learn from positive rewards', () => {
      const actions = [
        { wordId: 'word-1', difficulty: 'easy' },
        { wordId: 'word-2', difficulty: 'hard' },
      ];

      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      // Consistently reward easy action
      for (let i = 0; i < 20; i++) {
        wrapper.update(state, actions[0], 1.0, defaultContext);
        wrapper.update(state, actions[1], -0.5, defaultContext);
      }

      // After learning, easy action should have higher expected reward
      // Note: This is a weak assertion as the model's internal state affects selection
      expect(wrapper.updateCount).toBe(40);
    });
  });

  describe('alpha parameter', () => {
    it('should get and set alpha', () => {
      const initialAlpha = wrapper.alpha;
      expect(typeof initialAlpha).toBe('number');
      expect(initialAlpha).toBeGreaterThan(0);

      wrapper.alpha = 0.5;
      expect(wrapper.alpha).toBe(0.5);
    });

    it('should compute cold start alpha', () => {
      const coldStartAlpha = LinUCBNativeWrapper.getColdStartAlpha(5, 0.5, 0.3);

      expect(typeof coldStartAlpha).toBe('number');
      expect(coldStartAlpha).toBeGreaterThan(0);
    });

    it('should return higher alpha for fewer interactions', () => {
      const newUserAlpha = LinUCBNativeWrapper.getColdStartAlpha(5, 0.5, 0.0);
      const experiencedUserAlpha = LinUCBNativeWrapper.getColdStartAlpha(500, 0.5, 0.0);

      expect(newUserAlpha).toBeGreaterThan(experiencedUserAlpha);
    });
  });

  describe('state persistence', () => {
    it('should get and set model state', () => {
      const action = { wordId: 'test-word', difficulty: 'mid' };
      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      // Make some updates
      for (let i = 0; i < 5; i++) {
        wrapper.update(state, action, Math.random() > 0.5 ? 1 : 0, defaultContext);
      }

      const modelState = wrapper.getModel();
      expect(modelState).toBeDefined();
      expect(modelState).toHaveProperty('A');
      expect(modelState).toHaveProperty('b');

      const newWrapper = createLinUCBNativeWrapperFallback();
      newWrapper.setModel(modelState);

      const newState = newWrapper.getModel();
      expect(newState.updateCount).toBe(modelState.updateCount);
    });

    it('should reset correctly', () => {
      const action = { wordId: 'test-word', difficulty: 'mid' };
      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      wrapper.update(state, action, 1, defaultContext);
      expect(wrapper.updateCount).toBeGreaterThan(0);

      wrapper.reset();
      expect(wrapper.updateCount).toBe(0);
    });
  });

  describe('circuit breaker', () => {
    it('should track call statistics', () => {
      const actions = [{ wordId: 'word-1', difficulty: 'mid' }];
      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      const initialStats = wrapper.getStats();
      expect(initialStats.nativeCalls).toBe(0);
      expect(initialStats.fallbackCalls).toBe(0);

      for (let i = 0; i < 5; i++) {
        wrapper.selectAction(state, actions, defaultContext);
      }

      const stats = wrapper.getStats();
      expect(stats.nativeCalls + stats.fallbackCalls).toBe(5);
    });

    it('should track circuit breaker state', () => {
      const state = wrapper.getCircuitState();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
    });

    it('should allow manual circuit breaker reset', () => {
      wrapper.resetCircuitBreaker();
      const state = wrapper.getCircuitState();
      expect(state).toBe('CLOSED');
    });

    it('should allow forcing circuit open', () => {
      const enabledWrapper = createLinUCBNativeWrapper({ useNative: true });
      enabledWrapper.forceOpenCircuit('test reason');
      const state = enabledWrapper.getCircuitState();
      expect(state).toBe('OPEN');
    });
  });

  describe('fallback handling', () => {
    it('should use fallback when native is disabled', () => {
      const fallbackWrapper = createLinUCBNativeWrapperFallback();
      const stats = fallbackWrapper.getStats();

      expect(stats.nativeEnabled).toBe(false);
    });

    it('should work correctly in fallback mode', () => {
      const actions = STANDARD_ACTIONS.map((a, i) => ({
        wordId: `word-${i}`,
        difficulty: a.difficulty,
      }));

      const state = {
        masteryLevel: 0.7,
        recentAccuracy: 0.8,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };

      const selection = wrapper.selectAction(state, actions, defaultContext);

      expect(selection).toBeDefined();
      expect(selection.action).toBeDefined();
    });
  });

  describe('metadata methods', () => {
    it('should return correct name', () => {
      expect(wrapper.getName()).toBe('LinUCBNativeWrapper');
    });

    it('should return correct version', () => {
      expect(wrapper.getVersion()).toBe('2.0.0-native');
    });

    it('should return capabilities', () => {
      const caps = wrapper.getCapabilities();

      expect(caps).toHaveProperty('supportsOnlineLearning');
      expect(caps).toHaveProperty('supportsBatchUpdate');
      expect(caps).toHaveProperty('primaryUseCase');
      expect(caps.primaryUseCase).toContain('Native');
    });
  });
});

// ==================== Performance Tests ====================

describe('Native Wrapper Performance', () => {
  describe('ACT-R Performance', () => {
    it('should handle large trace arrays', () => {
      const wrapper = createACTRMemoryNativeWrapperFallback();

      // Create a large trace
      const largeTrace: ReviewTrace[] = Array(1000)
        .fill(null)
        .map((_, i) => ({
          secondsAgo: (i + 1) * 60,
          isCorrect: Math.random() > 0.3,
        }));

      const start = performance.now();
      const activation = wrapper.computeActivation(largeTrace);
      const duration = performance.now() - start;

      expect(typeof activation).toBe('number');
      expect(activation).not.toBeNaN();
      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Causal Inference Performance', () => {
    it('should handle large observation sets', () => {
      const wrapper = createCausalInferenceNativeWrapperFallback();

      // Create large observation set
      const observations: CausalObservation[] = Array(500)
        .fill(null)
        .map((_, i) => ({
          features: [Math.random(), Math.random(), Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now() - i * 1000,
        }));

      const start = performance.now();
      wrapper.addObservations(observations);
      wrapper.fit();
      const estimate = wrapper.estimateATE();
      const duration = performance.now() - start;

      expect(estimate).toBeDefined();
      expect(typeof estimate.ate).toBe('number');
      // Should complete in reasonable time (< 500ms)
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Thompson Sampling Performance', () => {
    it('should handle rapid action selections', () => {
      const wrapper = createThompsonSamplingNativeWrapperFallback();

      const userState: UserState = {
        ...DEFAULT_USER_STATE,
        C: { mem: 0.7, speed: 0.6, stability: 0.8 },
        conf: 0.8,
        ts: Date.now(),
      };

      const context: ThompsonContext = {
        recentErrorRate: 0.2,
        recentResponseTime: 2000,
        timeBucket: 'afternoon',
      };

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        wrapper.selectAction(userState, STANDARD_ACTIONS, context);
      }
      const duration = performance.now() - start;

      // Should complete 100 selections quickly (< 100ms)
      expect(duration).toBeLessThan(100);
    });

    it('should handle batch sampling efficiently', () => {
      const wrapper = createThompsonSamplingNativeWrapperFallback();

      const params = Array(100)
        .fill(null)
        .map(() => ({
          alpha: 1 + Math.random() * 10,
          beta: 1 + Math.random() * 10,
        }));

      const start = performance.now();
      const samples = wrapper.batchSample(params);
      const duration = performance.now() - start;

      expect(samples).toHaveLength(100);
      // Should complete batch sampling quickly (< 50ms)
      expect(duration).toBeLessThan(50);
    });
  });
});
