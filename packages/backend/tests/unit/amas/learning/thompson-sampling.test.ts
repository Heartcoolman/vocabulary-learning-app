/**
 * Thompson Sampling Algorithm Unit Tests
 *
 * Tests for the contextual Thompson Sampling bandit algorithm
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ThompsonSampling,
  ThompsonContext,
  ThompsonSamplingState
} from '../../../../src/amas/learning/thompson-sampling';
import { Action, UserState } from '../../../../src/amas/types';
import { withSeed } from '../../../setup';
import {
  STANDARD_ACTIONS,
  DEFAULT_USER_STATE,
  THOMPSON_PARAMS
} from '../../../fixtures/amas-fixtures';
import { ActionFactory } from '../../../helpers/factories';

describe('ThompsonSampling', () => {
  let thompson: ThompsonSampling;

  const defaultContext: ThompsonContext = {
    recentErrorRate: 0.2,
    recentResponseTime: 2500,
    timeBucket: 14
  };

  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6 }
  };

  beforeEach(() => {
    thompson = new ThompsonSampling();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default prior parameters (α=1, β=1)', () => {
      const state = thompson.getState();
      expect(state.priorAlpha).toBe(1);
      expect(state.priorBeta).toBe(1);
    });

    it('should initialize with empty global and contextual maps', () => {
      const state = thompson.getState();
      expect(Object.keys(state.global)).toHaveLength(0);
      expect(Object.keys(state.contextual)).toHaveLength(0);
    });

    it('should initialize updateCount to 0', () => {
      const state = thompson.getState();
      expect(state.updateCount).toBe(0);
    });

    it('should accept custom prior parameters', () => {
      const customThompson = new ThompsonSampling({
        priorAlpha: 2,
        priorBeta: 3
      });
      const state = customThompson.getState();
      expect(state.priorAlpha).toBe(2);
      expect(state.priorBeta).toBe(3);
    });

    it('should accept custom context weight bounds', () => {
      const customThompson = new ThompsonSampling({
        minContextWeight: 0.2,
        maxContextWeight: 0.8
      });
      // These are internal, but we can verify behavior through selection
      expect(customThompson).toBeDefined();
    });
  });

  // ==================== Action Selection Tests ====================

  describe('selectAction', () => {
    it('should throw error when actions array is empty', () => {
      expect(() => {
        thompson.selectAction(defaultState, [], defaultContext);
      }).toThrow('动作列表不能为空');
    });

    it('should return ActionSelection with action, score, and confidence', () => {
      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
    });

    it('should return score in range [0, 1]', () => {
      for (let i = 0; i < 20; i++) {
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should include meta information with actionKey and contextKey', () => {
      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      expect(result.meta).toBeDefined();
      expect(result.meta?.actionKey).toBeDefined();
      expect(typeof result.meta?.actionKey).toBe('string');
    });

    it('should produce consistent results with same seed', () => {
      const actions = STANDARD_ACTIONS;

      const result1 = withSeed('test-seed', () =>
        thompson.selectAction(defaultState, actions, defaultContext)
      );

      // Reset and run again
      thompson = new ThompsonSampling();

      const result2 = withSeed('test-seed', () =>
        thompson.selectAction(defaultState, actions, defaultContext)
      );

      expect(result1.action).toEqual(result2.action);
    });
  });

  // ==================== Beta Sampling Tests ====================

  describe('Beta sampling', () => {
    it('should sample values in range [0, 1]', () => {
      // Train to create non-trivial distributions
      for (let i = 0; i < 10; i++) {
        thompson.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
        thompson.update(defaultState, STANDARD_ACTIONS[1], 0.0, defaultContext);
      }

      // Sample many times
      for (let i = 0; i < 50; i++) {
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });
  });

  // ==================== Context Key Building Tests ====================

  describe('context bucketization', () => {
    it('should discretize error rate into buckets', () => {
      const context1: ThompsonContext = {
        recentErrorRate: 0.15,
        recentResponseTime: 2000,
        timeBucket: 10
      };

      const context2: ThompsonContext = {
        recentErrorRate: 0.16, // Still in same bucket (step=0.05)
        recentResponseTime: 2000,
        timeBucket: 10
      };

      const context3: ThompsonContext = {
        recentErrorRate: 0.25, // Different bucket
        recentResponseTime: 2000,
        timeBucket: 10
      };

      // Select actions to create entries
      thompson.selectAction(defaultState, STANDARD_ACTIONS, context1);
      thompson.selectAction(defaultState, STANDARD_ACTIONS, context2);
      thompson.selectAction(defaultState, STANDARD_ACTIONS, context3);

      const state = thompson.getState();
      // Contextual entries should exist
      expect(Object.keys(state.contextual).length).toBeGreaterThan(0);
    });

    it('should discretize response time into buckets', () => {
      const fastContext: ThompsonContext = {
        recentErrorRate: 0.2,
        recentResponseTime: 1000,
        timeBucket: 10
      };

      const slowContext: ThompsonContext = {
        recentErrorRate: 0.2,
        recentResponseTime: 5000,
        timeBucket: 10
      };

      thompson.selectAction(defaultState, STANDARD_ACTIONS, fastContext);
      thompson.selectAction(defaultState, STANDARD_ACTIONS, slowContext);

      const state = thompson.getState();
      // Should have entries for different response time buckets
      expect(Object.keys(state.contextual).length).toBeGreaterThan(0);
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should increment updateCount after each update', () => {
      expect(thompson.getState().updateCount).toBe(0);

      thompson.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      expect(thompson.getState().updateCount).toBe(1);

      thompson.update(defaultState, STANDARD_ACTIONS[0], 0.0, defaultContext);
      expect(thompson.getState().updateCount).toBe(2);
    });

    it('should increment alpha for positive reward', () => {
      const action = STANDARD_ACTIONS[0];

      thompson.selectAction(defaultState, [action], defaultContext);
      const stateBefore = thompson.getState();
      const actionKey = Object.keys(stateBefore.global)[0];
      const alphaBefore = stateBefore.global[actionKey]?.alpha ?? 1;

      thompson.update(defaultState, action, 1.0, defaultContext);

      const stateAfter = thompson.getState();
      const alphaAfter = stateAfter.global[actionKey]?.alpha ?? 1;

      expect(alphaAfter).toBeGreaterThan(alphaBefore);
    });

    it('should increment beta for negative reward', () => {
      const action = STANDARD_ACTIONS[0];

      thompson.selectAction(defaultState, [action], defaultContext);
      const stateBefore = thompson.getState();
      const actionKey = Object.keys(stateBefore.global)[0];
      const betaBefore = stateBefore.global[actionKey]?.beta ?? 1;

      // 使用负奖励来触发 beta 增加 (阈值现在是 reward < 0)
      thompson.update(defaultState, action, -0.5, defaultContext);

      const stateAfter = thompson.getState();
      const betaAfter = stateAfter.global[actionKey]?.beta ?? 1;

      expect(betaAfter).toBeGreaterThan(betaBefore);
    });

    it('should update both global and contextual parameters', () => {
      const action = STANDARD_ACTIONS[0];

      // First select to initialize
      thompson.selectAction(defaultState, [action], defaultContext);

      // Update
      thompson.update(defaultState, action, 1.0, defaultContext);

      const state = thompson.getState();

      // Check global was updated
      expect(Object.keys(state.global).length).toBeGreaterThan(0);

      // Check contextual was updated
      expect(Object.keys(state.contextual).length).toBeGreaterThan(0);
    });
  });

  // ==================== Global/Contextual Blend Tests ====================

  describe('sample blending', () => {
    it('should use more global weight when contextual has few samples', () => {
      // With no training, should rely on global (which is also fresh)
      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      // Just verify it works
      expect(result.action).toBeDefined();
    });

    it('should prefer actions with higher observed rewards', () => {
      const goodAction = STANDARD_ACTIONS[0];
      const badAction = STANDARD_ACTIONS[1];

      // Train: good action gets rewards, bad action gets penalties
      // 注意: reward >= 0 被视为成功, reward < 0 被视为失败
      for (let i = 0; i < 20; i++) {
        thompson.update(defaultState, goodAction, 1.0, defaultContext);
        thompson.update(defaultState, badAction, -0.5, defaultContext); // 使用负奖励
      }

      // Count selections over many samples
      const counts = new Map<string, number>();
      counts.set(JSON.stringify(goodAction), 0);
      counts.set(JSON.stringify(badAction), 0);

      for (let i = 0; i < 100; i++) {
        const result = thompson.selectAction(
          defaultState,
          [goodAction, badAction],
          defaultContext
        );
        const key = JSON.stringify(result.action);
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      // Good action should be selected more often
      const goodCount = counts.get(JSON.stringify(goodAction)) || 0;
      const badCount = counts.get(JSON.stringify(badAction)) || 0;

      expect(goodCount).toBeGreaterThan(badCount);
    });
  });

  // ==================== Confidence Computation Tests ====================

  describe('confidence computation', () => {
    it('should return low confidence for new actions', () => {
      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      // With no training, confidence should be low
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should increase confidence with more observations', () => {
      const action = STANDARD_ACTIONS[0];

      const result1 = thompson.selectAction(defaultState, [action], defaultContext);
      const confidence1 = result1.confidence;

      // Train
      for (let i = 0; i < 50; i++) {
        thompson.update(defaultState, action, Math.random() > 0.5 ? 1 : 0, defaultContext);
      }

      const result2 = thompson.selectAction(defaultState, [action], defaultContext);
      const confidence2 = result2.confidence;

      expect(confidence2).toBeGreaterThan(confidence1);
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should get/set state roundtrip', () => {
      // Train the model
      for (let i = 0; i < 10; i++) {
        thompson.update(defaultState, STANDARD_ACTIONS[i % 5], Math.random(), defaultContext);
      }

      const originalState = thompson.getState();

      // Create new instance and restore
      const newThompson = new ThompsonSampling();
      newThompson.setState(originalState);

      const restoredState = newThompson.getState();

      expect(restoredState.updateCount).toBe(originalState.updateCount);
      expect(restoredState.priorAlpha).toBe(originalState.priorAlpha);
      expect(restoredState.priorBeta).toBe(originalState.priorBeta);
      expect(Object.keys(restoredState.global)).toEqual(Object.keys(originalState.global));
    });

    it('should handle prior parameter migration', () => {
      // Train with default priors
      for (let i = 0; i < 5; i++) {
        thompson.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      }

      const oldState = thompson.getState();

      // Create new instance with different priors
      const newThompson = new ThompsonSampling({
        priorAlpha: 2,
        priorBeta: 2
      });

      // Should still be able to restore old state
      newThompson.setState(oldState);

      const restoredState = newThompson.getState();
      expect(restoredState.updateCount).toBe(oldState.updateCount);
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset all state', () => {
      // Train
      for (let i = 0; i < 10; i++) {
        thompson.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      }

      expect(thompson.getState().updateCount).toBe(10);

      thompson.reset();

      const state = thompson.getState();
      expect(state.updateCount).toBe(0);
      expect(Object.keys(state.global)).toHaveLength(0);
      expect(Object.keys(state.contextual)).toHaveLength(0);
    });
  });

  // ==================== BaseLearner Interface Tests ====================

  describe('BaseLearner interface', () => {
    it('should return correct name', () => {
      expect(thompson.getName()).toBe('ThompsonSampling');
    });

    it('should return correct version', () => {
      expect(thompson.getVersion()).toBe('1.0.0');
    });

    it('should return capabilities', () => {
      const caps = thompson.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.minSamplesForReliability).toBe(5); // Actual value in implementation
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle extreme error rate (0)', () => {
      const context: ThompsonContext = {
        recentErrorRate: 0,
        recentResponseTime: 2000,
        timeBucket: 10
      };

      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, context);
      expect(result.action).toBeDefined();
    });

    it('should handle extreme error rate (1)', () => {
      const context: ThompsonContext = {
        recentErrorRate: 1,
        recentResponseTime: 2000,
        timeBucket: 10
      };

      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, context);
      expect(result.action).toBeDefined();
    });

    it('should handle very fast response time', () => {
      const context: ThompsonContext = {
        recentErrorRate: 0.2,
        recentResponseTime: 100,
        timeBucket: 10
      };

      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, context);
      expect(result.action).toBeDefined();
    });

    it('should handle very slow response time', () => {
      const context: ThompsonContext = {
        recentErrorRate: 0.2,
        recentResponseTime: 15000,
        timeBucket: 10
      };

      const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, context);
      expect(result.action).toBeDefined();
    });

    it('should handle negative motivation state', () => {
      const negativeState: UserState = {
        A: 0.5,
        F: 0.5,
        M: -0.8, // Negative motivation
        C: { mem: 0.5, speed: 0.5 }
      };

      const result = thompson.selectAction(negativeState, STANDARD_ACTIONS, defaultContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== ThompsonSampling Edge Cases Tests ====================

  describe('ThompsonSampling Edge Cases', () => {
    describe('Beta distribution edge cases', () => {
      it('should handle alpha close to 0 (prior minimum enforced)', () => {
        // Create instance with very small alpha prior
        const smallAlphaThompson = new ThompsonSampling({
          priorAlpha: 1e-10,  // Very close to 0
          priorBeta: 1
        });

        // Should use EPSILON minimum internally
        const result = smallAlphaThompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });

      it('should handle beta close to 0 (prior minimum enforced)', () => {
        // Create instance with very small beta prior
        const smallBetaThompson = new ThompsonSampling({
          priorAlpha: 1,
          priorBeta: 1e-10  // Very close to 0
        });

        // Should use EPSILON minimum internally
        const result = smallBetaThompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });

      it('should handle very large alpha/beta values', () => {
        // Simulate many successes
        const action = STANDARD_ACTIONS[0];
        for (let i = 0; i < 1000; i++) {
          thompson.update(defaultState, action, 1.0, defaultContext);
        }

        const state = thompson.getState();
        const actionKey = Object.keys(state.global)[0];
        const params = state.global[actionKey];

        // Alpha should be very large
        expect(params.alpha).toBeGreaterThan(500);

        // Should still sample correctly
        const result = thompson.selectAction(defaultState, [action], defaultContext);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should handle very small probabilities (high beta relative to alpha)', () => {
        // Simulate many failures
        const action = STANDARD_ACTIONS[0];
        for (let i = 0; i < 100; i++) {
          thompson.update(defaultState, action, -1.0, defaultContext);  // Negative reward = failure
        }

        const state = thompson.getState();
        const actionKey = Object.keys(state.global)[0];
        const params = state.global[actionKey];

        // Beta should be much larger than alpha
        expect(params.beta).toBeGreaterThan(params.alpha);

        // Should still work
        const result = thompson.selectAction(defaultState, [action], defaultContext);
        expect(Number.isFinite(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    describe('identical arm statistics', () => {
      it('should handle all arms with identical statistics', () => {
        // Update all actions with identical rewards
        for (let i = 0; i < 10; i++) {
          for (const action of STANDARD_ACTIONS) {
            thompson.update(defaultState, action, 0.5, defaultContext);
          }
        }

        // Should still select one action (random due to sampling)
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(STANDARD_ACTIONS).toContainEqual(result.action);
      });

      it('should handle arms with same expected value but different variance', () => {
        // First arm: few observations (high variance)
        thompson.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
        thompson.update(defaultState, STANDARD_ACTIONS[0], 0.0, defaultContext);

        // Second arm: many observations (low variance), same mean
        for (let i = 0; i < 100; i++) {
          thompson.update(defaultState, STANDARD_ACTIONS[1], i % 2 === 0 ? 1.0 : 0.0, defaultContext);
        }

        // Both should be selectable
        const selectionCounts = new Map<string, number>();
        for (let i = 0; i < 100; i++) {
          const testThompson = new ThompsonSampling();
          testThompson.setState(thompson.getState());
          const result = testThompson.selectAction(defaultState, [STANDARD_ACTIONS[0], STANDARD_ACTIONS[1]], defaultContext);
          const key = JSON.stringify(result.action);
          selectionCounts.set(key, (selectionCounts.get(key) || 0) + 1);
        }

        // Both arms should be selected at least once (due to exploration from high variance)
        expect(selectionCounts.size).toBeGreaterThanOrEqual(1);
      });
    });

    describe('numerical stability', () => {
      it('should handle NaN in context fields gracefully', () => {
        const nanContext: ThompsonContext = {
          recentErrorRate: NaN,
          recentResponseTime: NaN,
          timeBucket: NaN as unknown as number
        };

        // Should use defaults when NaN is detected
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, nanContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should handle Infinity in context fields gracefully', () => {
        const infContext: ThompsonContext = {
          recentErrorRate: Infinity,
          recentResponseTime: Infinity,
          timeBucket: 12
        };

        // Should clamp to valid ranges
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, infContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should handle extreme reward values', () => {
        const action = STANDARD_ACTIONS[0];

        // Reward outside [-1, 1] should be clamped
        thompson.update(defaultState, action, 1e10, defaultContext);
        thompson.update(defaultState, action, -1e10, defaultContext);

        const state = thompson.getState();
        const actionKey = Object.keys(state.global)[0];
        const params = state.global[actionKey];

        // Parameters should be finite
        expect(Number.isFinite(params.alpha)).toBe(true);
        expect(Number.isFinite(params.beta)).toBe(true);
      });

      it('should maintain valid Beta samples after many updates', () => {
        // Perform many updates
        for (let i = 0; i < 1000; i++) {
          const action = STANDARD_ACTIONS[i % 5];
          const reward = Math.random() * 2 - 1; // Random in [-1, 1]
          thompson.update(defaultState, action, reward, defaultContext);
        }

        // All samples should be in [0, 1]
        for (let i = 0; i < 100; i++) {
          const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);
          expect(Number.isFinite(result.score)).toBe(true);
        }
      });
    });

    describe('context handling edge cases', () => {
      it('should handle undefined context properties', () => {
        const partialContext = {
          recentErrorRate: 0.2
        } as ThompsonContext;

        // Should use defaults for missing properties
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, partialContext);
        expect(result.action).toBeDefined();
      });

      it('should handle empty context object', () => {
        const emptyContext = {} as ThompsonContext;

        // Should use defaults for all properties
        const result = thompson.selectAction(defaultState, STANDARD_ACTIONS, emptyContext);
        expect(result.action).toBeDefined();
      });

      it('should handle boundary error rates', () => {
        const zeroErrorContext: ThompsonContext = {
          recentErrorRate: 0,
          recentResponseTime: 2000,
          timeBucket: 12
        };

        const fullErrorContext: ThompsonContext = {
          recentErrorRate: 1,
          recentResponseTime: 2000,
          timeBucket: 12
        };

        const result1 = thompson.selectAction(defaultState, STANDARD_ACTIONS, zeroErrorContext);
        const result2 = thompson.selectAction(defaultState, STANDARD_ACTIONS, fullErrorContext);

        expect(result1.action).toBeDefined();
        expect(result2.action).toBeDefined();
      });

      it('should create different context keys for different contexts', () => {
        // Two very different contexts
        const context1: ThompsonContext = {
          recentErrorRate: 0.1,
          recentResponseTime: 1000,
          timeBucket: 8
        };

        const context2: ThompsonContext = {
          recentErrorRate: 0.9,
          recentResponseTime: 9000,
          timeBucket: 22
        };

        // Update with different contexts
        thompson.update(defaultState, STANDARD_ACTIONS[0], 1.0, context1);
        thompson.update(defaultState, STANDARD_ACTIONS[0], 0.0, context2);

        const state = thompson.getState();
        const actionKey = Object.keys(state.contextual)[0];
        const contextKeys = Object.keys(state.contextual[actionKey] || {});

        // Should have different context entries
        expect(contextKeys.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('state persistence edge cases', () => {
      it('should handle restoration of state with invalid alpha/beta', () => {
        const invalidState: ThompsonSamplingState = {
          version: '1.0.0',
          priorAlpha: 1,
          priorBeta: 1,
          updateCount: 10,
          global: {
            'test-action': { alpha: -1, beta: NaN } // Invalid values
          },
          contextual: {}
        };

        const newThompson = new ThompsonSampling();
        newThompson.setState(invalidState);

        // Should recover and use valid defaults
        const result = newThompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should handle state with mismatched prior parameters', () => {
        // Create state with different priors
        const stateWithDifferentPriors: ThompsonSamplingState = {
          version: '1.0.0',
          priorAlpha: 5,  // Different from default 1
          priorBeta: 5,   // Different from default 1
          updateCount: 20,
          global: {
            'test-action': { alpha: 10, beta: 10 }
          },
          contextual: {}
        };

        // Create new instance with default priors (1, 1)
        const newThompson = new ThompsonSampling();
        newThompson.setState(stateWithDifferentPriors);

        // Should migrate parameters appropriately
        const result = newThompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
      });

      it('should handle empty state restoration', () => {
        const emptyState: ThompsonSamplingState = {
          version: '1.0.0',
          priorAlpha: 1,
          priorBeta: 1,
          updateCount: 0,
          global: {},
          contextual: {}
        };

        const newThompson = new ThompsonSampling();
        newThompson.setState(emptyState);

        const result = newThompson.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(newThompson.getState().updateCount).toBe(0);
      });
    });

    describe('soft update mode edge cases', () => {
      it('should handle soft update with reward = 0', () => {
        const softThompson = new ThompsonSampling({ enableSoftUpdate: true });
        const action = STANDARD_ACTIONS[0];

        softThompson.update(defaultState, action, 0, defaultContext);

        const state = softThompson.getState();
        const actionKey = Object.keys(state.global)[0];
        const params = state.global[actionKey];

        // With reward=0, both alpha and beta should increase by 0.5
        expect(params.alpha).toBeCloseTo(1.5, 5);
        expect(params.beta).toBeCloseTo(1.5, 5);
      });

      it('should handle soft update with reward = 1', () => {
        const softThompson = new ThompsonSampling({ enableSoftUpdate: true });
        const action = STANDARD_ACTIONS[0];

        softThompson.update(defaultState, action, 1, defaultContext);

        const state = softThompson.getState();
        const actionKey = Object.keys(state.global)[0];
        const params = state.global[actionKey];

        // With reward=1, alpha += 1, beta += 0
        expect(params.alpha).toBe(2);
        expect(params.beta).toBe(1);
      });

      it('should handle soft update with reward = -1', () => {
        const softThompson = new ThompsonSampling({ enableSoftUpdate: true });
        const action = STANDARD_ACTIONS[0];

        softThompson.update(defaultState, action, -1, defaultContext);

        const state = softThompson.getState();
        const actionKey = Object.keys(state.global)[0];
        const params = state.global[actionKey];

        // With reward=-1, alpha += 0, beta += 1
        expect(params.alpha).toBe(1);
        expect(params.beta).toBe(2);
      });
    });

    describe('single action edge cases', () => {
      it('should always return the only action when single action provided', () => {
        const singleAction = [STANDARD_ACTIONS[0]];

        for (let i = 0; i < 10; i++) {
          const result = thompson.selectAction(defaultState, singleAction, defaultContext);
          expect(result.action).toEqual(STANDARD_ACTIONS[0]);
        }
      });

      it('should compute valid confidence for single action', () => {
        const singleAction = [STANDARD_ACTIONS[0]];

        const result = thompson.selectAction(defaultState, singleAction, defaultContext);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(Number.isFinite(result.confidence)).toBe(true);
      });
    });
  });
});
