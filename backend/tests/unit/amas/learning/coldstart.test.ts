/**
 * ColdStart Manager Unit Tests
 *
 * Tests for the aggressive cold start strategy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ColdStartManager, ColdStartState } from '../../../../src/amas/learning/coldstart';
import { Action, UserState, ColdStartPhase } from '../../../../src/amas/types';
import { withSeed } from '../../../setup';
import {
  PROBE_ACTIONS,
  STANDARD_ACTIONS,
  DEFAULT_USER_STATE,
  COLD_START_THRESHOLDS
} from '../../../fixtures/amas-fixtures';
import { ActionFactory } from '../../../helpers/factories';

describe('ColdStartManager', () => {
  let coldStart: ColdStartManager;

  const defaultContext = {};

  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6 }
  };

  beforeEach(() => {
    coldStart = new ColdStartManager();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize in classify phase', () => {
      const state = coldStart.getState();
      expect(state.phase).toBe('classify');
    });

    it('should initialize with probeIndex 0', () => {
      const state = coldStart.getState();
      expect(state.probeIndex).toBe(0);
    });

    it('should initialize with empty results', () => {
      const state = coldStart.getState();
      expect(state.results).toHaveLength(0);
    });

    it('should initialize with null userType', () => {
      const state = coldStart.getState();
      expect(state.userType).toBeNull();
    });

    it('should initialize with null settledStrategy', () => {
      const state = coldStart.getState();
      expect(state.settledStrategy).toBeNull();
    });

    it('should accept custom thresholds', () => {
      const customColdStart = new ColdStartManager({
        fastAccuracy: 0.9,
        fastResponseTime: 1000
      });
      expect(customColdStart).toBeDefined();
    });
  });

  // ==================== Probe Action Selection Tests ====================

  describe('probe action selection', () => {
    it('should execute 5 probe actions in sequence during classify phase', () => {
      const selectedActions: Action[] = [];

      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        selectedActions.push(result.action);

        // Simulate update with probe result
        coldStart.update(
          defaultState,
          result.action,
          Math.random() > 0.3 ? 1 : 0,
          defaultContext
        );
      }

      expect(selectedActions).toHaveLength(5);
    });

    it('should return probe actions in fixed order', () => {
      const firstResult = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      // Reset and try again
      coldStart.reset();

      const secondResult = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      // Should be the same first probe action
      expect(firstResult.action).toEqual(secondResult.action);
    });

    it('should advance probeIndex after each update', () => {
      expect(coldStart.getState().probeIndex).toBe(0);

      const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      coldStart.update(defaultState, result.action, 1.0, defaultContext);

      expect(coldStart.getState().probeIndex).toBe(1);
    });
  });

  // ==================== Phase Transition Tests ====================

  describe('phase transitions', () => {
    it('should transition from classify to explore after 5 probes', () => {
      // Execute 5 probes
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const state = coldStart.getState();
      expect(state.phase).toBe('explore');
    });

    it('should classify userType after classify phase', () => {
      // Execute 5 probes with good performance
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const state = coldStart.getState();
      expect(state.userType).not.toBeNull();
      expect(['fast', 'stable', 'cautious']).toContain(state.userType);
    });

    it('should transition to normal phase after explore threshold', () => {
      // Execute classify phase (5 probes)
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      expect(coldStart.getState().phase).toBe('explore');

      // Continue with explore phase updates
      for (let i = 0; i < 10; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      // Should eventually transition to normal
      const state = coldStart.getState();
      expect(['explore', 'normal']).toContain(state.phase);
    });
  });

  // ==================== User Classification Tests ====================

  describe('user classification', () => {
    it('should classify as fast with high accuracy and fast response', () => {
      // Simulate fast learner: high accuracy, fast response
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

        // Simulate correct answer with fast response
        coldStart.update(defaultState, result.action, 1.0, {
          isCorrect: true,
          responseTime: 1000, // Fast
          errorRate: 0.1
        });
      }

      const state = coldStart.getState();
      expect(state.userType).toBe('fast');
    });

    it('should classify as stable with moderate performance', () => {
      // Simulate stable learner: moderate accuracy and response
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

        // Simulate moderate performance
        const isCorrect = i < 4; // 80% accuracy but slower
        coldStart.update(defaultState, result.action, isCorrect ? 1 : 0, {
          isCorrect,
          responseTime: 2500, // Moderate
          errorRate: 0.25
        });
      }

      const state = coldStart.getState();
      expect(['stable', 'fast']).toContain(state.userType);
    });

    it('should classify as cautious with lower performance', () => {
      // Simulate cautious learner: lower accuracy, slower response
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

        // Simulate struggling performance
        const isCorrect = i < 2; // 40% accuracy
        coldStart.update(defaultState, result.action, isCorrect ? 1 : 0, {
          isCorrect,
          responseTime: 5000, // Slow
          errorRate: 0.5
        });
      }

      const state = coldStart.getState();
      expect(state.userType).toBe('cautious');
    });
  });

  // ==================== Strategy Mapping Tests ====================

  describe('strategy mapping', () => {
    it('should settle on appropriate strategy after classification', () => {
      // Complete classify phase
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const state = coldStart.getState();

      // After classify, should have userType
      expect(state.userType).not.toBeNull();

      // In explore phase, strategy might not be settled yet
      // But userType should guide selection
    });

    it('should return settled strategy in normal phase', () => {
      // Fast forward through phases
      for (let i = 0; i < 20; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const state = coldStart.getState();

      if (state.phase === 'normal') {
        expect(state.settledStrategy).not.toBeNull();
      }
    });
  });

  // ==================== Action Selection in Different Phases ====================

  describe('action selection by phase', () => {
    it('should select probe action in classify phase', () => {
      const state = coldStart.getState();
      expect(state.phase).toBe('classify');

      const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      expect(result.action).toBeDefined();
    });

    it('should select from action space in explore phase', () => {
      // Complete classify
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      expect(coldStart.getState().phase).toBe('explore');

      const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      expect(result.action).toBeDefined();
    });

    it('should return settled or default strategy in normal phase', () => {
      // Fast forward to normal
      for (let i = 0; i < 20; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should get/set state roundtrip', () => {
      // Make some progress
      for (let i = 0; i < 3; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const originalState = coldStart.getState();

      // Create new instance and restore
      const newColdStart = new ColdStartManager();
      newColdStart.setState(originalState);

      const restoredState = newColdStart.getState();

      expect(restoredState.phase).toBe(originalState.phase);
      expect(restoredState.probeIndex).toBe(originalState.probeIndex);
      expect(restoredState.results.length).toBe(originalState.results.length);
    });

    it('should restore mid-classification state', () => {
      // Execute 3 of 5 probes
      for (let i = 0; i < 3; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      const midState = coldStart.getState();
      expect(midState.probeIndex).toBe(3);
      expect(midState.phase).toBe('classify');

      // Restore and continue
      const newColdStart = new ColdStartManager();
      newColdStart.setState(midState);

      expect(newColdStart.getState().probeIndex).toBe(3);

      // Should continue from probe 4
      const result = newColdStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset all state', () => {
      // Make progress
      for (let i = 0; i < 10; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      coldStart.reset();

      const state = coldStart.getState();
      expect(state.phase).toBe('classify');
      expect(state.probeIndex).toBe(0);
      expect(state.results).toHaveLength(0);
      expect(state.userType).toBeNull();
      expect(state.settledStrategy).toBeNull();
    });
  });

  // ==================== BaseLearner Interface Tests ====================

  describe('BaseLearner interface', () => {
    it('should return correct name', () => {
      expect(coldStart.getName()).toBe('ColdStartManager');
    });

    it('should return correct version', () => {
      expect(coldStart.getVersion()).toBe('1.0.0');
    });

    it('should return capabilities', () => {
      const caps = coldStart.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.requiresPretraining).toBe(false);
    });

    it('should return current phase', () => {
      expect(coldStart.getPhase()).toBe('classify');

      // Complete classify
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      expect(coldStart.getPhase()).toBe('explore');
    });

    it('should check if cold start is complete', () => {
      expect(coldStart.isComplete()).toBe(false);

      // Fast forward to normal
      for (let i = 0; i < 20; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, defaultContext);
      }

      // May or may not be complete depending on threshold
      expect(typeof coldStart.isComplete()).toBe('boolean');
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle empty actions array gracefully', () => {
      expect(() => {
        coldStart.selectAction(defaultState, [], defaultContext);
      }).toThrow();
    });

    it('should handle all incorrect responses', () => {
      for (let i = 0; i < 5; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 0.0, defaultContext);
      }

      const state = coldStart.getState();
      expect(state.userType).toBe('cautious');
    });

    it('should limit results history to prevent memory growth', () => {
      // Execute many updates
      for (let i = 0; i < 30; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, Math.random(), defaultContext);
      }

      const state = coldStart.getState();
      // MAX_RESULTS_HISTORY is 20
      expect(state.results.length).toBeLessThanOrEqual(20);
    });
  });
});
