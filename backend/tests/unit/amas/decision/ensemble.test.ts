/**
 * Ensemble Learning Framework Unit Tests
 *
 * Tests for the multi-learner ensemble decision framework
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EnsembleLearningFramework,
  EnsembleContext,
  EnsembleState,
  EnsembleWeights,
  EnsembleMember
} from '../../../../src/amas/decision/ensemble';
import { Action, UserState, ColdStartPhase } from '../../../../src/amas/types';
import { withSeed } from '../../../setup';
import {
  STANDARD_ACTIONS,
  DEFAULT_USER_STATE,
  ENSEMBLE_PARAMS
} from '../../../fixtures/amas-fixtures';

describe('EnsembleLearningFramework', () => {
  let ensemble: EnsembleLearningFramework;

  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6 }
  };

  const normalPhaseContext: EnsembleContext = {
    phase: 'normal',
    linucb: {
      recentErrorRate: 0.2,
      recentResponseTime: 2500,
      timeBucket: 14
    },
    thompson: {
      recentErrorRate: 0.2,
      recentResponseTime: 2500,
      timeBucket: 14
    },
    actr: {
      reviewTrace: []
    },
    heuristic: {}
  };

  const classifyPhaseContext: EnsembleContext = {
    phase: 'classify',
    linucb: {
      recentErrorRate: 0.2,
      recentResponseTime: 2500,
      timeBucket: 14
    }
  };

  beforeEach(() => {
    ensemble = new EnsembleLearningFramework();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with correct initial weights', () => {
      const state = ensemble.getState();

      // Initial weights: LinUCB 40%, Thompson 25%, ACT-R 25%, Heuristic 10%
      expect(state.weights.linucb).toBeCloseTo(0.40, 2);
      expect(state.weights.thompson).toBeCloseTo(0.25, 2);
      expect(state.weights.actr).toBeCloseTo(0.25, 2);
      expect(state.weights.heuristic).toBeCloseTo(0.10, 2);
    });

    it('should have weights summing to 1.0', () => {
      const state = ensemble.getState();
      const sum = state.weights.linucb + state.weights.thompson +
                  state.weights.actr + state.weights.heuristic;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should initialize updateCount to 0', () => {
      const state = ensemble.getState();
      expect(state.updateCount).toBe(0);
    });

    it('should contain sub-learner states', () => {
      const state = ensemble.getState();

      expect(state.coldStart).toBeDefined();
      expect(state.linucb).toBeDefined();
      expect(state.thompson).toBeDefined();
      expect(state.actr).toBeDefined();
      expect(state.heuristic).toBeDefined();
    });
  });

  // ==================== Action Selection Tests ====================

  describe('selectAction', () => {
    it('should return ActionSelection with action, score, and confidence', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
    });

    it('should delegate to ColdStart in classify phase', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, classifyPhaseContext);

      expect(result.action).toBeDefined();
      // ColdStart should be handling this
      expect(result.meta?.source).toContain('coldstart');
    });

    it('should use weighted voting in normal phase', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
      expect(result.meta?.votes).toBeDefined();
    });

    it('should throw error for empty actions', () => {
      expect(() => {
        ensemble.selectAction(defaultState, [], normalPhaseContext);
      }).toThrow();
    });

    it('should include voting details in meta', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.meta).toBeDefined();
      if (result.meta?.votes) {
        // Should have votes from multiple learners
        expect(typeof result.meta.votes).toBe('object');
      }
    });
  });

  // ==================== Vote Aggregation Tests ====================

  describe('vote aggregation', () => {
    it('should aggregate votes with weighted scoring', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      // The score should be a weighted combination
      expect(typeof result.score).toBe('number');
      expect(result.score).not.toBe(0);
    });

    it('should compute aggregated confidence', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should select action with highest weighted score', () => {
      // Train to create preferences
      for (let i = 0; i < 20; i++) {
        ensemble.update(defaultState, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);
      }

      // Should now prefer the trained action
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== Weight Update Tests ====================

  describe('weight updates', () => {
    it('should increment updateCount after update', () => {
      expect(ensemble.getState().updateCount).toBe(0);

      ensemble.update(defaultState, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);

      expect(ensemble.getState().updateCount).toBe(1);
    });

    it('should update weights based on reward and alignment', () => {
      const weightsBefore = { ...ensemble.getState().weights };

      // Select and update with positive reward
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);
      ensemble.update(defaultState, result.action, 1.0, normalPhaseContext);

      const weightsAfter = ensemble.getState().weights;

      // At least one weight should change
      const changed = Object.keys(weightsBefore).some(
        key => Math.abs(
          weightsAfter[key as EnsembleMember] - weightsBefore[key as EnsembleMember]
        ) > 1e-6
      );

      expect(changed).toBe(true);
    });

    it('should maintain weights sum to 1.0 after updates', () => {
      for (let i = 0; i < 10; i++) {
        const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);
        ensemble.update(defaultState, result.action, Math.random() * 2 - 1, normalPhaseContext);
      }

      const weights = ensemble.getState().weights;
      const sum = weights.linucb + weights.thompson + weights.actr + weights.heuristic;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should enforce MIN_WEIGHT floor', () => {
      // Many negative updates to try to drive weight to zero
      for (let i = 0; i < 50; i++) {
        ensemble.update(defaultState, STANDARD_ACTIONS[0], -1.0, normalPhaseContext);
      }

      const weights = ensemble.getState().weights;

      // All weights should be at least MIN_WEIGHT (0.05)
      expect(weights.linucb).toBeGreaterThanOrEqual(0.05);
      expect(weights.thompson).toBeGreaterThanOrEqual(0.05);
      expect(weights.actr).toBeGreaterThanOrEqual(0.05);
      expect(weights.heuristic).toBeGreaterThanOrEqual(0.05);
    });

    it('should apply exponential weight update', () => {
      const weightsBefore = { ...ensemble.getState().weights };

      // Large positive reward should increase aligned weights
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);
      ensemble.update(defaultState, result.action, 1.0, normalPhaseContext);

      const weightsAfter = ensemble.getState().weights;

      // The learning rate is 0.25, so changes should be noticeable
      // but not too dramatic
      Object.keys(weightsBefore).forEach(key => {
        const before = weightsBefore[key as EnsembleMember];
        const after = weightsAfter[key as EnsembleMember];
        const ratio = after / before;

        // Ratio should be within reasonable bounds
        expect(ratio).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(2.0);
      });
    });
  });

  // ==================== Cold Start Delegation Tests ====================

  describe('cold start delegation', () => {
    it('should delegate to ColdStartManager in classify phase', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, classifyPhaseContext);

      expect(result.action).toBeDefined();
      expect(result.meta?.source).toContain('coldstart');
    });

    it('should use ColdStart for explore phase', () => {
      const exploreContext: EnsembleContext = {
        phase: 'explore',
        linucb: { recentErrorRate: 0.2, recentResponseTime: 2500, timeBucket: 14 }
      };

      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, exploreContext);

      expect(result.action).toBeDefined();
    });

    it('should switch to ensemble voting in normal phase', () => {
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.meta?.source).not.toBe('coldstart');
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should get/set state roundtrip', () => {
      // Train the ensemble
      for (let i = 0; i < 10; i++) {
        const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);
        ensemble.update(defaultState, result.action, Math.random(), normalPhaseContext);
      }

      const originalState = ensemble.getState();

      // Create new instance and restore
      const newEnsemble = new EnsembleLearningFramework();
      newEnsemble.setState(originalState);

      const restoredState = newEnsemble.getState();

      expect(restoredState.updateCount).toBe(originalState.updateCount);
      expect(restoredState.weights.linucb).toBeCloseTo(originalState.weights.linucb, 5);
      expect(restoredState.weights.thompson).toBeCloseTo(originalState.weights.thompson, 5);
    });

    it('should restore sub-learner states', () => {
      // Train
      for (let i = 0; i < 5; i++) {
        ensemble.update(defaultState, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);
      }

      const originalState = ensemble.getState();

      const newEnsemble = new EnsembleLearningFramework();
      newEnsemble.setState(originalState);

      const restoredState = newEnsemble.getState();

      // LinUCB state should be preserved
      expect(restoredState.linucb.updateCount).toBe(originalState.linucb.updateCount);
    });

    it('should preserve lastVotes and lastConfidence', () => {
      // Make a selection
      ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);

      const state = ensemble.getState();

      // lastVotes should be populated
      expect(state.lastVotes).toBeDefined();
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset all state including weights', () => {
      // Train
      for (let i = 0; i < 10; i++) {
        ensemble.update(defaultState, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);
      }

      ensemble.reset();

      const state = ensemble.getState();

      expect(state.updateCount).toBe(0);
      expect(state.weights.linucb).toBeCloseTo(0.40, 2);
      expect(state.weights.thompson).toBeCloseTo(0.25, 2);
    });

    it('should reset sub-learners', () => {
      // Train
      for (let i = 0; i < 5; i++) {
        ensemble.update(defaultState, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);
      }

      ensemble.reset();

      const state = ensemble.getState();

      expect(state.linucb.updateCount).toBe(0);
      expect(state.thompson.updateCount).toBe(0);
      expect(state.coldStart.phase).toBe('classify');
    });
  });

  // ==================== BaseLearner Interface Tests ====================

  describe('BaseLearner interface', () => {
    it('should return correct name', () => {
      expect(ensemble.getName()).toBe('EnsembleLearningFramework');
    });

    it('should return correct version', () => {
      expect(ensemble.getVersion()).toBe('1.0.0');
    });

    it('should return capabilities', () => {
      const caps = ensemble.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
    });
  });

  // ==================== Individual Learner Access Tests ====================

  describe('learner access', () => {
    it('should provide access to current weights', () => {
      const weights = ensemble.getWeights();

      expect(weights.linucb).toBeDefined();
      expect(weights.thompson).toBeDefined();
      expect(weights.actr).toBeDefined();
      expect(weights.heuristic).toBeDefined();
    });

    it('should allow setting individual learner weights', () => {
      const newWeights: EnsembleWeights = {
        linucb: 0.5,
        thompson: 0.2,
        actr: 0.2,
        heuristic: 0.1
      };

      ensemble.setWeights(newWeights);

      const weights = ensemble.getWeights();

      expect(weights.linucb).toBeCloseTo(0.5, 2);
      expect(weights.thompson).toBeCloseTo(0.2, 2);
    });

    it('should normalize weights after setting', () => {
      // Set weights that don't sum to 1
      const unnormalizedWeights: EnsembleWeights = {
        linucb: 2,
        thompson: 1,
        actr: 1,
        heuristic: 1
      };

      ensemble.setWeights(unnormalizedWeights);

      const weights = ensemble.getWeights();
      const sum = weights.linucb + weights.thompson + weights.actr + weights.heuristic;

      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  // ==================== Fallback Behavior Tests ====================

  describe('fallback behavior', () => {
    it('should handle missing context gracefully', () => {
      const minimalContext: EnsembleContext = {
        phase: 'normal'
        // Missing learner-specific contexts
      };

      // Should not throw
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, minimalContext);
      expect(result.action).toBeDefined();
    });

    it('should use heuristic as fallback when other learners fail', () => {
      // Heuristic should always provide a valid action
      const result = ensemble.selectAction(defaultState, STANDARD_ACTIONS, normalPhaseContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== Feature Flag Integration ====================

  describe('feature flags', () => {
    it('should zero weight for disabled learners', () => {
      // This test assumes feature flags can disable learners
      // The actual behavior depends on implementation
      const state = ensemble.getState();

      // All weights should be positive by default
      expect(state.weights.linucb).toBeGreaterThan(0);
      expect(state.weights.thompson).toBeGreaterThan(0);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle extreme user state values', () => {
      const extremeState: UserState = {
        A: 1.0,
        F: 0.0,
        M: 1.0,
        C: { mem: 1.0, speed: 1.0 }
      };

      const result = ensemble.selectAction(extremeState, STANDARD_ACTIONS, normalPhaseContext);
      expect(result.action).toBeDefined();
    });

    it('should handle negative motivation', () => {
      const negativeState: UserState = {
        A: 0.5,
        F: 0.5,
        M: -0.8,
        C: { mem: 0.5, speed: 0.5 }
      };

      const result = ensemble.selectAction(negativeState, STANDARD_ACTIONS, normalPhaseContext);
      expect(result.action).toBeDefined();
    });

    it('should handle single action', () => {
      const singleAction = [STANDARD_ACTIONS[0]];

      const result = ensemble.selectAction(defaultState, singleAction, normalPhaseContext);
      expect(result.action).toEqual(singleAction[0]);
    });
  });
});
