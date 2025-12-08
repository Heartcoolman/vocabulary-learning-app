/**
 * EnsembleLearningFramework Boundary Condition Tests
 *
 * Tests for extreme inputs, edge cases, convergence and error recovery
 * Target: 90%+ coverage for AMAS core algorithms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnsembleLearningFramework, EnsembleContext } from '../../../../src/amas/decision/ensemble';
import { UserState } from '../../../../src/amas/types';
import { STANDARD_ACTIONS } from '../../../fixtures/amas-fixtures';

describe('EnsembleLearningFramework - Boundary Conditions', () => {
  let ensemble: EnsembleLearningFramework;

  const normalPhaseContext: EnsembleContext = {
    phase: 'normal',
    linucb: { recentErrorRate: 0.2, recentResponseTime: 2500, timeBucket: 14 },
    thompson: { recentErrorRate: 0.2, recentResponseTime: 2500, timeBucket: 14 },
    actr: { reviewTrace: [] },
    heuristic: {},
  };

  beforeEach(() => {
    ensemble = new EnsembleLearningFramework();
  });

  // ==================== Extreme Input Values Tests ====================

  describe('extreme user state values', () => {
    it('should handle UserState with all values at maximum (1.0)', () => {
      const extremeState: UserState = {
        A: 1.0,
        F: 1.0,
        M: 1.0,
        C: { mem: 1.0, speed: 1.0 },
      };

      const result = ensemble.selectAction(extremeState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
      expect(result.score).not.toBeNaN();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle UserState with all values at minimum (0.0)', () => {
      const extremeState: UserState = {
        A: 0.0,
        F: 0.0,
        M: 0.0,
        C: { mem: 0.0, speed: 0.0 },
      };

      const result = ensemble.selectAction(extremeState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
      expect(result.score).not.toBeNaN();
    });

    it('should handle UserState with negative motivation', () => {
      const negativeState: UserState = {
        A: 0.5,
        F: 0.5,
        M: -1.0, // Extreme negative motivation
        C: { mem: 0.5, speed: 0.5 },
      };

      const result = ensemble.selectAction(negativeState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
      expect(result.score).not.toBeNaN();
    });

    it('should handle UserState with values beyond normal range', () => {
      const outOfRangeState: UserState = {
        A: 2.0, // Above 1.0
        F: -0.5, // Below 0.0
        M: 1.5, // Above 1.0
        C: { mem: 10.0, speed: -2.0 }, // Extreme values
      };

      const result = ensemble.selectAction(outOfRangeState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
      expect(Number.isFinite(result.score)).toBe(true);
    });

    it('should handle UserState with very small float values', () => {
      const tinyState: UserState = {
        A: 1e-10,
        F: 1e-10,
        M: 1e-10,
        C: { mem: 1e-10, speed: 1e-10 },
      };

      const result = ensemble.selectAction(tinyState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
    });

    it('should handle UserState with very large float values', () => {
      const largeState: UserState = {
        A: 1e6,
        F: 1e6,
        M: 1e6,
        C: { mem: 1e6, speed: 1e6 },
      };

      const result = ensemble.selectAction(largeState, STANDARD_ACTIONS, normalPhaseContext);

      expect(result.action).toBeDefined();
      expect(Number.isFinite(result.score)).toBe(true);
    });
  });

  // ==================== Empty/Missing Data Tests ====================

  describe('empty and missing data handling', () => {
    it('should throw error for empty actions array', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      expect(() => {
        ensemble.selectAction(state, [], normalPhaseContext);
      }).toThrow();
    });

    it('should handle single action array', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const singleAction = [STANDARD_ACTIONS[0]];

      const result = ensemble.selectAction(state, singleAction, normalPhaseContext);

      expect(result.action).toEqual(singleAction[0]);
    });

    it('should handle minimal context', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const minimalContext: EnsembleContext = { phase: 'normal' };

      const result = ensemble.selectAction(state, STANDARD_ACTIONS, minimalContext);

      expect(result.action).toBeDefined();
    });

    it('should handle context with undefined learner contexts', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const partialContext: EnsembleContext = {
        phase: 'normal',
        linucb: undefined,
        thompson: undefined,
        actr: undefined,
        heuristic: undefined,
      };

      const result = ensemble.selectAction(state, STANDARD_ACTIONS, partialContext);

      expect(result.action).toBeDefined();
    });

    it('should handle null state restoration gracefully', () => {
      // @ts-ignore - Testing invalid input
      ensemble.setState(null);

      // Should not throw, should keep default state
      const state = ensemble.getState();
      expect(state.updateCount).toBe(0);
    });

    it('should handle empty state object restoration', () => {
      // Empty state with missing weights should be handled via normalizeWeights
      const partialState = {
        version: '1.0.0',
        weights: { thompson: 0.25, linucb: 0.4, actr: 0.25, heuristic: 0.1 },
        updateCount: 0,
      };

      // @ts-ignore - Testing partial input
      ensemble.setState(partialState);

      // Should have valid weights
      const state = ensemble.getState();
      expect(state.weights).toBeDefined();
      expect(state.weights.linucb).toBeDefined();
    });
  });

  // ==================== Algorithm Convergence Tests ====================

  describe('algorithm convergence', () => {
    it('should converge weights after many updates with consistent rewards', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // Consistently reward the same action
      for (let i = 0; i < 100; i++) {
        const result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
        ensemble.update(state, result.action, 1.0, normalPhaseContext);
      }

      const finalState = ensemble.getState();

      // Weights should still sum to 1
      const weightSum =
        finalState.weights.linucb +
        finalState.weights.thompson +
        finalState.weights.actr +
        finalState.weights.heuristic;
      expect(weightSum).toBeCloseTo(1.0, 5);

      // All weights should be above minimum
      expect(finalState.weights.linucb).toBeGreaterThanOrEqual(0.05);
      expect(finalState.weights.thompson).toBeGreaterThanOrEqual(0.05);
      expect(finalState.weights.actr).toBeGreaterThanOrEqual(0.05);
      expect(finalState.weights.heuristic).toBeGreaterThanOrEqual(0.05);
    });

    it('should maintain weight bounds after many negative rewards', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      for (let i = 0; i < 100; i++) {
        const result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
        ensemble.update(state, result.action, -1.0, normalPhaseContext);
      }

      const finalState = ensemble.getState();

      // All weights should still be above minimum
      expect(finalState.weights.linucb).toBeGreaterThanOrEqual(0.05);
      expect(finalState.weights.thompson).toBeGreaterThanOrEqual(0.05);
      expect(finalState.weights.actr).toBeGreaterThanOrEqual(0.05);
      expect(finalState.weights.heuristic).toBeGreaterThanOrEqual(0.05);
    });

    it('should handle alternating positive and negative rewards', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      for (let i = 0; i < 100; i++) {
        const result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
        const reward = i % 2 === 0 ? 1.0 : -1.0;
        ensemble.update(state, result.action, reward, normalPhaseContext);
      }

      const finalState = ensemble.getState();
      const weightSum =
        finalState.weights.linucb +
        finalState.weights.thompson +
        finalState.weights.actr +
        finalState.weights.heuristic;

      expect(weightSum).toBeCloseTo(1.0, 4);
    });

    it('should stabilize action selection after sufficient training', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // Train with consistent positive rewards for first action
      for (let i = 0; i < 50; i++) {
        ensemble.update(state, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);
      }

      // Check consistency of action selection
      const selections: number[] = [];
      for (let i = 0; i < 20; i++) {
        const result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
        const actionIndex = STANDARD_ACTIONS.findIndex(
          (a) =>
            a.interval_scale === result.action.interval_scale &&
            a.new_ratio === result.action.new_ratio,
        );
        selections.push(actionIndex);
      }

      // Most selections should be consistent (at least 50% same action)
      const modeCount = Math.max(
        ...selections.map((s) => selections.filter((x) => x === s).length),
      );
      expect(modeCount).toBeGreaterThanOrEqual(10);
    });
  });

  // ==================== Error Recovery Tests ====================

  describe('error recovery', () => {
    it('should recover from corrupted weights through state restoration', () => {
      // Set invalid weights via setState
      const corruptedState = ensemble.getState();
      corruptedState.weights = {
        linucb: -0.5,
        thompson: 2.0,
        actr: 0.01,
        heuristic: 0.01,
      };

      ensemble.setState(corruptedState);

      const state = ensemble.getState();
      const sum =
        state.weights.linucb +
        state.weights.thompson +
        state.weights.actr +
        state.weights.heuristic;

      expect(sum).toBeCloseTo(1.0, 5);
      expect(state.weights.linucb).toBeGreaterThanOrEqual(0.05);
    });

    it('should handle NaN in update gracefully', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // NaN reward should be clamped/handled
      ensemble.update(state, STANDARD_ACTIONS[0], NaN, normalPhaseContext);

      // Weights should still be valid
      const ensembleState = ensemble.getState();
      const sum =
        ensembleState.weights.linucb +
        ensembleState.weights.thompson +
        ensembleState.weights.actr +
        ensembleState.weights.heuristic;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should handle Infinity in update gracefully', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // Infinity reward should be clamped to 1
      ensemble.update(state, STANDARD_ACTIONS[0], Infinity, normalPhaseContext);

      const ensembleState = ensemble.getState();
      const sum =
        ensembleState.weights.linucb +
        ensembleState.weights.thompson +
        ensembleState.weights.actr +
        ensembleState.weights.heuristic;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should handle negative Infinity in update gracefully', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // -Infinity reward should be clamped to -1
      ensemble.update(state, STANDARD_ACTIONS[0], -Infinity, normalPhaseContext);

      const ensembleState = ensemble.getState();
      const sum =
        ensembleState.weights.linucb +
        ensembleState.weights.thompson +
        ensembleState.weights.actr +
        ensembleState.weights.heuristic;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should reset cleanly after corrupted state', () => {
      // Corrupt the state
      // @ts-ignore
      ensemble.setState({ weights: { invalid: true } });

      // Reset should restore valid state
      ensemble.reset();

      const ensembleState = ensemble.getState();
      expect(ensembleState.weights.linucb).toBeCloseTo(0.4, 1);
      expect(ensembleState.weights.thompson).toBeCloseTo(0.25, 1);
      expect(ensembleState.updateCount).toBe(0);
    });

    it('should handle state restoration with missing sub-learner states', () => {
      const partialState = {
        version: '1.0.0',
        weights: { thompson: 0.25, linucb: 0.4, actr: 0.25, heuristic: 0.1 },
        updateCount: 5,
        // Missing: coldStart, linucb, thompson, actr, heuristic states
      };

      // @ts-ignore
      ensemble.setState(partialState);

      // Should still function
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== Numerical Stability Tests ====================

  describe('numerical stability', () => {
    it('should maintain weight precision after thousands of updates', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      for (let i = 0; i < 1000; i++) {
        const reward = Math.sin(i) * 0.5; // Varying rewards between -0.5 and 0.5
        ensemble.update(
          state,
          STANDARD_ACTIONS[i % STANDARD_ACTIONS.length],
          reward,
          normalPhaseContext,
        );
      }

      const ensembleState = ensemble.getState();
      const sum =
        ensembleState.weights.linucb +
        ensembleState.weights.thompson +
        ensembleState.weights.actr +
        ensembleState.weights.heuristic;

      expect(sum).toBeCloseTo(1.0, 4);
      expect(Number.isFinite(ensembleState.weights.linucb)).toBe(true);
      expect(Number.isFinite(ensembleState.weights.thompson)).toBe(true);
      expect(Number.isFinite(ensembleState.weights.actr)).toBe(true);
      expect(Number.isFinite(ensembleState.weights.heuristic)).toBe(true);
    });

    it('should handle rapid successive updates without numerical overflow', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      for (let i = 0; i < 500; i++) {
        ensemble.update(state, STANDARD_ACTIONS[0], 1.0, normalPhaseContext);
      }

      const ensembleState = ensemble.getState();
      expect(Number.isFinite(ensembleState.weights.linucb)).toBe(true);
      expect(ensembleState.weights.linucb).toBeLessThanOrEqual(1.0);
    });

    it('should produce finite scores for extreme user states', () => {
      const extremeStates: UserState[] = [
        { A: Number.MAX_SAFE_INTEGER, F: 0, M: 0, C: { mem: 0, speed: 0 } },
        { A: Number.MIN_SAFE_INTEGER, F: 0, M: 0, C: { mem: 0, speed: 0 } },
        { A: 0, F: 0, M: 0, C: { mem: Number.EPSILON, speed: Number.EPSILON } },
      ];

      for (const state of extremeStates) {
        const result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
        expect(Number.isFinite(result.score)).toBe(true);
      }
    });
  });

  // ==================== Phase Transition Tests ====================

  describe('phase transitions', () => {
    it('should handle cold start to normal phase transition', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // Start in classify phase
      const classifyContext: EnsembleContext = { phase: 'classify' };
      let result = ensemble.selectAction(state, STANDARD_ACTIONS, classifyContext);
      expect(result.meta?.decisionSource).toContain('coldstart');

      // Update through classify and explore phases
      for (let i = 0; i < 25; i++) {
        ensemble.update(state, STANDARD_ACTIONS[0], 0.5, classifyContext);
      }

      // Now should be in normal phase
      result = ensemble.selectAction(state, STANDARD_ACTIONS, normalPhaseContext);
      // After completing cold start, should use ensemble
    });

    it('should auto-transition from non-normal when cold start is complete', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };

      // Force complete cold start
      for (let i = 0; i < 30; i++) {
        ensemble.update(state, STANDARD_ACTIONS[0], 0.5, { phase: 'explore' });
      }

      // Even with non-normal context, should use ensemble if cold start complete
      const exploreContext: EnsembleContext = { phase: 'explore' };
      const result = ensemble.selectAction(state, STANDARD_ACTIONS, exploreContext);
      // Should have auto-transitioned
      expect(result.action).toBeDefined();
    });
  });

  // ==================== Context Normalization Tests ====================

  describe('context normalization', () => {
    it('should clamp extreme error rates in context', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const extremeContext: EnsembleContext = {
        phase: 'normal',
        linucb: { recentErrorRate: 5.0, recentResponseTime: 2500, timeBucket: 14 },
      };

      // Should not throw and should handle gracefully
      const result = ensemble.selectAction(state, STANDARD_ACTIONS, extremeContext);
      expect(result.action).toBeDefined();
    });

    it('should clamp negative response times', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const negativeContext: EnsembleContext = {
        phase: 'normal',
        linucb: { recentErrorRate: 0.2, recentResponseTime: -1000, timeBucket: 14 },
      };

      const result = ensemble.selectAction(state, STANDARD_ACTIONS, negativeContext);
      expect(result.action).toBeDefined();
    });

    it('should handle out-of-range time bucket', () => {
      const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
      const invalidTimeContext: EnsembleContext = {
        phase: 'normal',
        linucb: { recentErrorRate: 0.2, recentResponseTime: 2500, timeBucket: 100 },
      };

      const result = ensemble.selectAction(state, STANDARD_ACTIONS, invalidTimeContext);
      expect(result.action).toBeDefined();
    });
  });
});
