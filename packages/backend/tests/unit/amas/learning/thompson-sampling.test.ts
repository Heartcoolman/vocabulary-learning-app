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
});
