/**
 * EnsembleLearningFramework Unit Tests
 * 测试集成学习框架的投票聚合、权重更新和冷启动切换
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnsembleLearningFramework,
  EnsembleContext,
  EnsembleState,
  EnsembleWeights
} from '../../../../src/amas/decision/ensemble';
import { Action, UserState } from '../../../../src/amas/types';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('EnsembleLearningFramework', () => {
  let ensemble: EnsembleLearningFramework;

  const mockUserState: UserState = {
    ability: 0.5,
    A: 0.7,
    F: 0.3,
    M: 0.0,
    C: { mem: 0.5, speed: 0.5 }
  };

  const classifyContext: EnsembleContext = {
    phase: 'classify',
    base: {
      recentErrorRate: 0.3,
      recentResponseTime: 2000,
      timeBucket: 14
    }
  };

  const normalContext: EnsembleContext = {
    phase: 'normal',
    base: {
      recentErrorRate: 0.3,
      recentResponseTime: 2000,
      timeBucket: 14
    },
    actr: {
      trace: [{ secondsAgo: 3600 }]
    }
  };

  beforeEach(() => {
    ensemble = new EnsembleLearningFramework();
  });

  describe('Initialization', () => {
    it('should initialize with classify phase', () => {
      expect(ensemble.getPhase()).toBe('classify');
    });

    it('should not be warm initially', () => {
      expect(ensemble.isWarm()).toBe(false);
    });

    it('should have initial weights', () => {
      const weights = ensemble.getWeights();

      expect(weights.thompson).toBe(0.3);
      expect(weights.linucb).toBe(0.3);
      expect(weights.actr).toBe(0.2);
      expect(weights.heuristic).toBe(0.2);
    });

    it('should have zero update count initially', () => {
      expect(ensemble.getUpdateCount()).toBe(0);
    });
  });

  describe('Cold Start Phase', () => {
    it('should use coldstart manager in classify phase', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, classifyContext);

      expect(selection.meta?.decisionSource).toBe('coldstart');
      expect(selection.meta?.ensemblePhase).toBe('classify');
    });

    it('should track cold start progress', () => {
      expect(ensemble.getColdStartProgress()).toBeGreaterThanOrEqual(0);
      expect(ensemble.getColdStartProgress()).toBeLessThanOrEqual(1);
    });

    it('should update all learners during cold start', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, classifyContext);
      ensemble.update(mockUserState, selection.action, 0.5, classifyContext);

      const counts = ensemble.getMemberUpdateCounts();
      expect(counts.coldstart).toBeGreaterThan(0);
    });
  });

  describe('Normal Phase - Ensemble Decision', () => {
    it('should use ensemble voting in normal phase', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);

      expect(selection.meta?.decisionSource).toBe('ensemble');
      expect(selection.meta?.ensemblePhase).toBe('normal');
    });

    it('should include member votes in meta', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);

      expect(selection.meta?.memberVotes).toBeDefined();
    });

    it('should include weights in meta', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);

      expect(selection.meta?.weights).toBeDefined();
      expect(selection.meta?.weights).toHaveProperty('thompson');
      expect(selection.meta?.weights).toHaveProperty('linucb');
    });
  });

  describe('Action Selection', () => {
    it('should select an action from the list', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);

      expect(selection.action).toBeDefined();
      expect(ACTION_SPACE).toContainEqual(selection.action);
    });

    it('should return score as number', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);

      expect(typeof selection.score).toBe('number');
      expect(Number.isFinite(selection.score)).toBe(true);
    });

    it('should return confidence between 0 and 1', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);

      expect(selection.confidence).toBeGreaterThanOrEqual(0);
      expect(selection.confidence).toBeLessThanOrEqual(1);
    });

    it('should throw on empty action list', () => {
      expect(() => {
        ensemble.selectAction(mockUserState, [], normalContext);
      }).toThrow();
    });
  });

  describe('Learning', () => {
    it('should increment update count in normal phase', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
      ensemble.update(mockUserState, selection.action, 0.5, normalContext);

      expect(ensemble.getUpdateCount()).toBe(1);
    });

    it('should update member learners', () => {
      const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
      ensemble.update(mockUserState, selection.action, 0.5, normalContext);

      const counts = ensemble.getMemberUpdateCounts();
      expect(counts.linucb).toBeGreaterThan(0);
      expect(counts.thompson).toBeGreaterThan(0);
    });
  });

  describe('Weight Updates', () => {
    it('should update weights after learning', () => {
      const initialWeights = { ...ensemble.getWeights() };

      for (let i = 0; i < 10; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, Math.random() * 2 - 1, normalContext);
      }

      const updatedWeights = ensemble.getWeights();

      const hasChanged = (
        updatedWeights.thompson !== initialWeights.thompson ||
        updatedWeights.linucb !== initialWeights.linucb ||
        updatedWeights.actr !== initialWeights.actr ||
        updatedWeights.heuristic !== initialWeights.heuristic
      );

      expect(hasChanged).toBe(true);
    });

    it('should keep weights normalized to 1', () => {
      for (let i = 0; i < 10; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, Math.random() * 2 - 1, normalContext);
      }

      const weights = ensemble.getWeights();
      const sum = weights.thompson + weights.linucb + weights.actr + weights.heuristic;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should keep weights above minimum', () => {
      for (let i = 0; i < 50; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, -1, normalContext);
      }

      const weights = ensemble.getWeights();

      expect(weights.thompson).toBeGreaterThanOrEqual(0.05);
      expect(weights.linucb).toBeGreaterThanOrEqual(0.05);
      expect(weights.actr).toBeGreaterThanOrEqual(0.05);
      expect(weights.heuristic).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      for (let i = 0; i < 3; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, 0.5, normalContext);
      }

      const state = ensemble.getState();

      expect(state.version).toBeDefined();
      expect(state.weights).toBeDefined();
      expect(state.updateCount).toBe(3);
      expect(state.coldStart).toBeDefined();
      expect(state.linucb).toBeDefined();
      expect(state.thompson).toBeDefined();
    });

    it('should restore state correctly', () => {
      for (let i = 0; i < 5; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, 0.7, normalContext);
      }

      const state = ensemble.getState();
      const newEnsemble = new EnsembleLearningFramework();
      newEnsemble.setState(state);

      expect(newEnsemble.getUpdateCount()).toBe(5);
      expect(newEnsemble.getWeights()).toEqual(ensemble.getWeights());
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        ensemble.setState(null as unknown as EnsembleState);
      }).not.toThrow();
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      for (let i = 0; i < 5; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, 0.5, normalContext);
      }

      ensemble.reset();

      expect(ensemble.getUpdateCount()).toBe(0);
      expect(ensemble.getPhase()).toBe('classify');
      expect(ensemble.isWarm()).toBe(false);

      const weights = ensemble.getWeights();
      expect(weights.thompson).toBe(0.3);
      expect(weights.linucb).toBe(0.3);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = ensemble.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(true);
      expect(caps.requiresPretraining).toBe(false);
    });
  });

  describe('Phase Auto-Transition', () => {
    it('should auto-transition to normal when coldstart is completed', () => {
      for (let i = 0; i < 5; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, classifyContext);
        ensemble.update(mockUserState, selection.action, 0.8, classifyContext);
      }

      expect(ensemble.getPhase()).toBe('explore');
    });
  });

  describe('Context Handling', () => {
    it('should handle missing context fields', () => {
      const minimalContext: EnsembleContext = {
        phase: 'normal'
      };

      expect(() => {
        ensemble.selectAction(mockUserState, ACTION_SPACE, minimalContext);
      }).not.toThrow();
    });

    it('should handle partial member contexts', () => {
      const partialContext: EnsembleContext = {
        phase: 'normal',
        base: { recentErrorRate: 0.3 },
        linucb: { recentErrorRate: 0.2 }
      };

      expect(() => {
        ensemble.selectAction(mockUserState, ACTION_SPACE, partialContext);
      }).not.toThrow();
    });
  });

  describe('Member Update Counts', () => {
    it('should track individual member updates', () => {
      for (let i = 0; i < 3; i++) {
        const selection = ensemble.selectAction(mockUserState, ACTION_SPACE, normalContext);
        ensemble.update(mockUserState, selection.action, 0.5, normalContext);
      }

      const counts = ensemble.getMemberUpdateCounts();

      expect(counts).toHaveProperty('coldstart');
      expect(counts).toHaveProperty('thompson');
      expect(counts).toHaveProperty('linucb');
      expect(counts).toHaveProperty('actr');
      expect(counts).toHaveProperty('heuristic');
    });
  });
});
