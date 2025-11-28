/**
 * ThompsonSampling Unit Tests
 * 测试Thompson采样算法的Beta分布采样、上下文感知和状态持久化
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThompsonSampling,
  ThompsonContext,
  ThompsonSamplingState
} from '../../../../src/amas/learning/thompson-sampling';
import { Action, UserState } from '../../../../src/amas/types';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('ThompsonSampling', () => {
  let thompson: ThompsonSampling;

  const mockUserState: UserState = {
    ability: 0.5,
    A: 0.7,
    F: 0.3,
    M: 0.0,
    C: { mem: 0.5, speed: 0.5 }
  };

  const mockContext: ThompsonContext = {
    recentErrorRate: 0.3,
    recentResponseTime: 2000,
    timeBucket: 14
  };

  beforeEach(() => {
    thompson = new ThompsonSampling();
  });

  describe('Initialization', () => {
    it('should initialize with zero update count', () => {
      expect(thompson.getUpdateCount()).toBe(0);
    });

    it('should use default priors when not specified', () => {
      const state = thompson.getState();
      expect(state.priorAlpha).toBe(1);
      expect(state.priorBeta).toBe(1);
    });

    it('should accept custom priors', () => {
      const customThompson = new ThompsonSampling({
        priorAlpha: 2,
        priorBeta: 3
      });
      const state = customThompson.getState();
      expect(state.priorAlpha).toBe(2);
      expect(state.priorBeta).toBe(3);
    });
  });

  describe('Action Selection', () => {
    it('should select an action from the list', () => {
      const selection = thompson.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.action).toBeDefined();
      expect(ACTION_SPACE).toContainEqual(selection.action);
    });

    it('should return score between 0 and 1', () => {
      const selection = thompson.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.score).toBeGreaterThanOrEqual(0);
      expect(selection.score).toBeLessThanOrEqual(1);
    });

    it('should return confidence between 0 and 1', () => {
      const selection = thompson.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.confidence).toBeGreaterThanOrEqual(0);
      expect(selection.confidence).toBeLessThanOrEqual(1);
    });

    it('should include meta information', () => {
      const selection = thompson.selectAction(mockUserState, ACTION_SPACE, mockContext);

      expect(selection.meta).toBeDefined();
      expect(selection.meta).toHaveProperty('actionKey');
      expect(selection.meta).toHaveProperty('contextKey');
    });

    it('should throw on empty action list', () => {
      expect(() => {
        thompson.selectAction(mockUserState, [], mockContext);
      }).toThrow();
    });
  });

  describe('Learning', () => {
    it('should update count after update', () => {
      const selection = thompson.selectAction(mockUserState, ACTION_SPACE, mockContext);
      thompson.update(mockUserState, selection.action, 0.5, mockContext);

      expect(thompson.getUpdateCount()).toBe(1);
    });

    it('should increase alpha on positive reward', () => {
      const action = ACTION_SPACE[0];
      const stateBefore = thompson.getState();

      thompson.update(mockUserState, action, 1.0, mockContext);

      const stateAfter = thompson.getState();
      const actionKey = Object.keys(stateAfter.global)[0];

      if (actionKey && stateBefore.global[actionKey]) {
        expect(stateAfter.global[actionKey].alpha)
          .toBeGreaterThan(stateBefore.global[actionKey].alpha);
      }
    });

    it('should increase beta on negative reward', () => {
      const action = ACTION_SPACE[0];

      thompson.update(mockUserState, action, 1.0, mockContext);
      const stateAfter1 = thompson.getState();

      thompson.update(mockUserState, action, -1.0, mockContext);
      const stateAfter2 = thompson.getState();

      const actionKey = Object.keys(stateAfter2.global)[0];
      expect(stateAfter2.global[actionKey].beta)
        .toBeGreaterThan(stateAfter1.global[actionKey].beta);
    });

    it('should increase confidence with more samples', () => {
      const action = ACTION_SPACE[0];

      // 使用单动作列表，确保比较的是同一个动作的置信度变化
      const selection1 = thompson.selectAction(mockUserState, [action], mockContext);

      for (let i = 0; i < 20; i++) {
        thompson.update(mockUserState, action, Math.random() > 0.5 ? 1 : -1, mockContext);
      }

      const selection2 = thompson.selectAction(mockUserState, [action], mockContext);

      expect(selection2.confidence).toBeGreaterThan(selection1.confidence);
    });
  });

  describe('Expected Reward', () => {
    it('should return prior expected value for unseen action', () => {
      const unseenAction: Action = {
        interval_scale: 9.9,
        new_ratio: 0.99,
        difficulty: 'hard',
        batch_size: 99,
        hint_level: 9
      };

      const expected = thompson.getExpectedReward(unseenAction);
      expect(expected).toBeCloseTo(0.5, 1);
    });

    it('should update expected reward after learning', () => {
      const action = ACTION_SPACE[0];

      for (let i = 0; i < 10; i++) {
        thompson.update(mockUserState, action, 1.0, mockContext);
      }

      const expected = thompson.getExpectedReward(action);
      expect(expected).toBeGreaterThan(0.5);
    });
  });

  describe('Sample Count', () => {
    it('should return zero for unseen action', () => {
      const unseenAction: Action = {
        interval_scale: 9.9,
        new_ratio: 0.99,
        difficulty: 'hard',
        batch_size: 99,
        hint_level: 9
      };

      expect(thompson.getSampleCount(unseenAction)).toBe(0);
    });

    it('should count samples correctly', () => {
      const action = ACTION_SPACE[0];

      for (let i = 0; i < 5; i++) {
        thompson.update(mockUserState, action, 0.5, mockContext);
      }

      expect(thompson.getSampleCount(action)).toBe(5);
    });
  });

  describe('State Persistence', () => {
    it('should export and restore state correctly', () => {
      const action = ACTION_SPACE[0];

      for (let i = 0; i < 5; i++) {
        thompson.update(mockUserState, action, 0.7, mockContext);
      }

      const state = thompson.getState();
      expect(state.updateCount).toBe(5);

      const newThompson = new ThompsonSampling();
      newThompson.setState(state);

      expect(newThompson.getUpdateCount()).toBe(5);
      expect(newThompson.getSampleCount(action)).toBe(5);
    });

    it('should handle version mismatch gracefully', () => {
      const state: ThompsonSamplingState = {
        version: '0.0.1',
        priorAlpha: 1,
        priorBeta: 1,
        updateCount: 10,
        global: {},
        contextual: {}
      };

      expect(() => {
        thompson.setState(state);
      }).not.toThrow();

      expect(thompson.getUpdateCount()).toBe(10);
    });

    it('should handle prior mismatch', () => {
      const customThompson = new ThompsonSampling({ priorAlpha: 2, priorBeta: 2 });
      const state: ThompsonSamplingState = {
        version: '1.0.0',
        priorAlpha: 1,
        priorBeta: 1,
        updateCount: 5,
        global: { 'test': { alpha: 3, beta: 2 } },
        contextual: {}
      };

      expect(() => {
        customThompson.setState(state);
      }).not.toThrow();
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      const action = ACTION_SPACE[0];

      for (let i = 0; i < 5; i++) {
        thompson.update(mockUserState, action, 0.7, mockContext);
      }

      thompson.reset();

      expect(thompson.getUpdateCount()).toBe(0);
      expect(thompson.getSampleCount(action)).toBe(0);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = thompson.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.minSamplesForReliability).toBe(5);
    });
  });

  describe('Context Handling', () => {
    it('should handle missing context fields', () => {
      const partialContext = { recentErrorRate: 0.5 } as ThompsonContext;

      expect(() => {
        thompson.selectAction(mockUserState, ACTION_SPACE, partialContext);
      }).not.toThrow();
    });

    it('should handle extreme context values', () => {
      const extremeContext: ThompsonContext = {
        recentErrorRate: 1.5,
        recentResponseTime: -100,
        timeBucket: 30
      };

      expect(() => {
        thompson.selectAction(mockUserState, ACTION_SPACE, extremeContext);
      }).not.toThrow();
    });
  });
});
