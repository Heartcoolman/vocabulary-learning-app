/**
 * HeuristicLearner Unit Tests
 * 测试启发式基准学习器的打分逻辑和EMA更新
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HeuristicLearner,
  HeuristicContext,
  HeuristicState
} from '../../../../src/amas/learning/heuristic';
import { Action, UserState } from '../../../../src/amas/types';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('HeuristicLearner', () => {
  let heuristic: HeuristicLearner;

  const mockUserState: UserState = {
    ability: 0.5,
    A: 0.7,
    F: 0.3,
    M: 0.0,
    C: { mem: 0.6, speed: 0.5 }
  };

  const mockContext: HeuristicContext = {
    recentErrorRate: 0.3,
    recentResponseTime: 2000,
    timeBucket: 14
  };

  beforeEach(() => {
    heuristic = new HeuristicLearner();
  });

  describe('Initialization', () => {
    it('should initialize with zero update count', () => {
      expect(heuristic.getUpdateCount()).toBe(0);
    });

    it('should have initial average reward of 0', () => {
      expect(heuristic.getAvgReward()).toBe(0);
    });

    it('should have initial average error rate of 0.5', () => {
      expect(heuristic.getAvgErrorRate()).toBe(0.5);
    });
  });

  describe('Action Selection', () => {
    it('should select an action from the list', () => {
      const selection = heuristic.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.action).toBeDefined();
      expect(ACTION_SPACE).toContainEqual(selection.action);
    });

    it('should return score as number', () => {
      const selection = heuristic.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(typeof selection.score).toBe('number');
      expect(Number.isFinite(selection.score)).toBe(true);
    });

    it('should return confidence between 0.1 and 0.9', () => {
      const selection = heuristic.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.confidence).toBeGreaterThanOrEqual(0.1);
      expect(selection.confidence).toBeLessThanOrEqual(0.9);
    });

    it('should include breakdown in meta', () => {
      const selection = heuristic.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.meta).toBeDefined();
      expect(selection.meta).toHaveProperty('breakdown');
      expect(selection.meta?.breakdown).toHaveProperty('support');
      expect(selection.meta?.breakdown).toHaveProperty('difficulty');
      expect(selection.meta?.breakdown).toHaveProperty('motivation');
      expect(selection.meta?.breakdown).toHaveProperty('pace');
      expect(selection.meta?.breakdown).toHaveProperty('loadPenalty');
    });

    it('should throw on empty action list', () => {
      expect(() => {
        heuristic.selectAction(mockUserState, [], mockContext);
      }).toThrow();
    });
  });

  describe('Scoring Logic', () => {
    it('should prefer easy actions when fatigue is high', () => {
      const fatiguedState: UserState = {
        ...mockUserState,
        F: 0.9
      };

      const selection = heuristic.selectAction(fatiguedState, ACTION_SPACE, mockContext);

      expect(selection.action.difficulty).toBe('easy');
    });

    it('should prefer harder actions when fatigue is low and memory is high', () => {
      const freshState: UserState = {
        ...mockUserState,
        F: 0.1,
        C: { mem: 0.9, speed: 0.7 }
      };
      const goodContext: HeuristicContext = {
        ...mockContext,
        recentErrorRate: 0.1
      };

      const selection = heuristic.selectAction(freshState, ACTION_SPACE, goodContext);

      expect(['mid', 'hard']).toContain(selection.action.difficulty);
    });

    it('should prefer higher hint level when error rate is high', () => {
      const strugglingContext: HeuristicContext = {
        ...mockContext,
        recentErrorRate: 0.8
      };
      const fatiguedState: UserState = {
        ...mockUserState,
        F: 0.7
      };

      const selection = heuristic.selectAction(fatiguedState, ACTION_SPACE, strugglingContext);

      expect(selection.action.hint_level).toBeGreaterThanOrEqual(1);
    });
  });

  describe('EMA Updates', () => {
    it('should update average reward with EMA', () => {
      const initialReward = heuristic.getAvgReward();

      heuristic.update(mockUserState, ACTION_SPACE[0], 1.0, mockContext);

      expect(heuristic.getAvgReward()).toBeGreaterThan(initialReward);
    });

    it('should update average error rate with EMA', () => {
      const lowErrorContext: HeuristicContext = {
        ...mockContext,
        recentErrorRate: 0.1
      };

      heuristic.update(mockUserState, ACTION_SPACE[0], 0.8, lowErrorContext);

      expect(heuristic.getAvgErrorRate()).toBeLessThan(0.5);
    });

    it('should increment update count', () => {
      heuristic.update(mockUserState, ACTION_SPACE[0], 0.5, mockContext);
      heuristic.update(mockUserState, ACTION_SPACE[0], 0.5, mockContext);

      expect(heuristic.getUpdateCount()).toBe(2);
    });

    it('should derive error rate from reward when context lacks it', () => {
      const noErrorRateContext: HeuristicContext = {
        recentResponseTime: 2000,
        timeBucket: 14
      } as HeuristicContext;

      heuristic.update(mockUserState, ACTION_SPACE[0], 1.0, noErrorRateContext);

      expect(heuristic.getAvgErrorRate()).toBeLessThan(0.5);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      heuristic.update(mockUserState, ACTION_SPACE[0], 0.7, mockContext);
      heuristic.update(mockUserState, ACTION_SPACE[0], 0.8, mockContext);

      const state = heuristic.getState();

      expect(state.updateCount).toBe(2);
      expect(state.avgReward).toBeGreaterThan(0);
      expect(state.version).toBeDefined();
    });

    it('should restore state correctly', () => {
      const state: HeuristicState = {
        version: '1.0.0',
        updateCount: 10,
        avgReward: 0.5,
        avgErrorRate: 0.3,
        lastUpdated: Date.now()
      };

      heuristic.setState(state);

      expect(heuristic.getUpdateCount()).toBe(10);
      expect(heuristic.getAvgReward()).toBe(0.5);
      expect(heuristic.getAvgErrorRate()).toBe(0.3);
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        heuristic.setState(null as unknown as HeuristicState);
      }).not.toThrow();
    });

    it('should clamp restored values to valid ranges', () => {
      const invalidState: HeuristicState = {
        version: '1.0.0',
        updateCount: -5,
        avgReward: 2.0,
        avgErrorRate: 1.5,
        lastUpdated: Date.now()
      };

      heuristic.setState(invalidState);

      expect(heuristic.getUpdateCount()).toBeGreaterThanOrEqual(0);
      expect(heuristic.getAvgReward()).toBeLessThanOrEqual(1);
      expect(heuristic.getAvgErrorRate()).toBeLessThanOrEqual(1);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      heuristic.update(mockUserState, ACTION_SPACE[0], 0.8, mockContext);
      heuristic.update(mockUserState, ACTION_SPACE[0], 0.9, mockContext);

      heuristic.reset();

      expect(heuristic.getUpdateCount()).toBe(0);
      expect(heuristic.getAvgReward()).toBe(0);
      expect(heuristic.getAvgErrorRate()).toBe(0.5);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = heuristic.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.minSamplesForReliability).toBe(1);
    });
  });

  describe('Context Biases', () => {
    it('should apply fatigue bias', () => {
      const biasedContext: HeuristicContext = {
        ...mockContext,
        fatigueBias: 0.3
      };

      const selection1 = heuristic.selectAction(mockUserState, ACTION_SPACE, mockContext);
      const selection2 = heuristic.selectAction(mockUserState, ACTION_SPACE, biasedContext);

      expect(selection1.score).not.toBe(selection2.score);
    });

    it('should apply motivation bias', () => {
      const biasedContext: HeuristicContext = {
        ...mockContext,
        motivationBias: 0.2
      };

      const selection1 = heuristic.selectAction(mockUserState, ACTION_SPACE, mockContext);
      const selection2 = heuristic.selectAction(mockUserState, ACTION_SPACE, biasedContext);

      expect(selection1.score).not.toBe(selection2.score);
    });
  });

  describe('Edge Cases', () => {
    it('should handle NaN in user state', () => {
      const badState: UserState = {
        ability: NaN,
        A: NaN,
        F: NaN,
        M: NaN,
        C: { mem: NaN, speed: NaN }
      };

      expect(() => {
        heuristic.selectAction(badState, ACTION_SPACE, mockContext);
      }).not.toThrow();
    });

    it('should handle extreme reward values', () => {
      expect(() => {
        heuristic.update(mockUserState, ACTION_SPACE[0], 100, mockContext);
        heuristic.update(mockUserState, ACTION_SPACE[0], -100, mockContext);
      }).not.toThrow();

      expect(heuristic.getAvgReward()).toBeGreaterThanOrEqual(-1);
      expect(heuristic.getAvgReward()).toBeLessThanOrEqual(1);
    });
  });
});
