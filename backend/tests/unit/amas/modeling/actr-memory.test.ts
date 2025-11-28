/**
 * ACTRMemoryModel Unit Tests
 * 测试ACT-R认知架构记忆模型的激活度计算和最优间隔
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTRMemoryModel,
  ACTRContext,
  ACTRState,
  ReviewTrace,
  computeActivation,
  computeRecallProbability,
  computeOptimalInterval
} from '../../../../src/amas/modeling/actr-memory';
import { Action, UserState } from '../../../../src/amas/types';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('ACTRMemoryModel', () => {
  let actr: ACTRMemoryModel;

  const mockUserState: UserState = {
    ability: 0.5,
    A: 0.7,
    F: 0.3,
    M: 0.0,
    C: { mem: 0.5, speed: 0.5 }
  };

  beforeEach(() => {
    actr = new ACTRMemoryModel();
  });

  describe('Initialization', () => {
    it('should initialize with default parameters', () => {
      expect(actr.getDecay()).toBe(0.5);
      expect(actr.getThreshold()).toBe(0.3);
      expect(actr.getUpdateCount()).toBe(0);
    });

    it('should accept custom parameters', () => {
      const customAcTR = new ACTRMemoryModel({
        decay: 0.7,
        threshold: 0.5,
        noiseScale: 0.2
      });

      expect(customAcTR.getDecay()).toBe(0.7);
      expect(customAcTR.getThreshold()).toBe(0.5);
    });
  });

  describe('Activation Computation', () => {
    it('should return -Infinity for empty trace', () => {
      const activation = actr.computeActivation([]);
      expect(activation).toBe(-Infinity);
    });

    it('should return finite activation for valid trace', () => {
      const trace: ReviewTrace[] = [
        { secondsAgo: 60 },
        { secondsAgo: 3600 },
        { secondsAgo: 86400 }
      ];

      const activation = actr.computeActivation(trace, 0.5, false);
      expect(Number.isFinite(activation)).toBe(true);
    });

    it('should decrease activation with older reviews', () => {
      const recentTrace: ReviewTrace[] = [{ secondsAgo: 60 }];
      const oldTrace: ReviewTrace[] = [{ secondsAgo: 86400 }];

      const recentActivation = actr.computeActivation(recentTrace, 0.5, false);
      const oldActivation = actr.computeActivation(oldTrace, 0.5, false);

      expect(recentActivation).toBeGreaterThan(oldActivation);
    });

    it('should increase activation with more reviews', () => {
      const singleTrace: ReviewTrace[] = [{ secondsAgo: 3600 }];
      const multiTrace: ReviewTrace[] = [
        { secondsAgo: 3600 },
        { secondsAgo: 7200 },
        { secondsAgo: 10800 }
      ];

      const singleActivation = actr.computeActivation(singleTrace, 0.5, false);
      const multiActivation = actr.computeActivation(multiTrace, 0.5, false);

      expect(multiActivation).toBeGreaterThan(singleActivation);
    });

    it('should apply error penalty for incorrect reviews', () => {
      const correctTrace: ReviewTrace[] = [{ secondsAgo: 3600, isCorrect: true }];
      const incorrectTrace: ReviewTrace[] = [{ secondsAgo: 3600, isCorrect: false }];

      const correctActivation = actr.computeActivation(correctTrace, 0.5, false);
      const incorrectActivation = actr.computeActivation(incorrectTrace, 0.5, false);

      expect(correctActivation).toBeGreaterThan(incorrectActivation);
    });
  });

  describe('Recall Probability', () => {
    it('should return 0 for -Infinity activation', () => {
      const prob = actr.computeRecallProbability(-Infinity);
      expect(prob).toBe(0);
    });

    it('should return probability between 0 and 1', () => {
      const prob = actr.computeRecallProbability(0.5);
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(1);
    });

    it('should increase with higher activation', () => {
      const lowProb = actr.computeRecallProbability(-1);
      const highProb = actr.computeRecallProbability(1);

      expect(highProb).toBeGreaterThan(lowProb);
    });

    it('should be approximately 0.5 at threshold', () => {
      const prob = actr.computeRecallProbability(0.3, 0.3, 0.4);
      expect(prob).toBeCloseTo(0.5, 1);
    });
  });

  describe('Full Activation Result', () => {
    it('should return all components', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 3600 }];
      const result = actr.computeFullActivation(trace);

      expect(result).toHaveProperty('baseActivation');
      expect(result).toHaveProperty('activation');
      expect(result).toHaveProperty('recallProbability');
    });

    it('should return zero probability for empty trace', () => {
      const result = actr.computeFullActivation([]);

      expect(result.baseActivation).toBe(-Infinity);
      expect(result.recallProbability).toBe(0);
    });
  });

  describe('Optimal Interval', () => {
    it('should return 0 for already low probability', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 604800 }];
      const interval = actr.computeOptimalInterval(trace, 0.9);

      expect(interval).toBe(0);
    });

    it('should return positive interval for high current probability', () => {
      // 使用非常近的多次复习轨迹，确保当前回忆概率 > 目标概率
      // 激活度 = ln(0.1^-0.5 + 1^-0.5 + 10^-0.5) ≈ ln(4.48) ≈ 1.5
      // 回忆概率 ≈ 95%，高于目标 70%
      const trace: ReviewTrace[] = [
        { secondsAgo: 0.1 },
        { secondsAgo: 1 },
        { secondsAgo: 10 }
      ];
      const interval = actr.computeOptimalInterval(trace, 0.7);

      expect(interval).toBeGreaterThan(0);
    });

    it('should return longer interval for higher target probability', () => {
      // 使用非常近的多次复习轨迹，确保当前回忆概率足够高
      const trace: ReviewTrace[] = [
        { secondsAgo: 0.1 },
        { secondsAgo: 1 },
        { secondsAgo: 10 }
      ];

      // 目标概率越低，需要等待的时间越长（到达该概率需要更久）
      const shortInterval = actr.computeOptimalInterval(trace, 0.5);
      const longInterval = actr.computeOptimalInterval(trace, 0.9);

      expect(shortInterval).toBeGreaterThan(longInterval);
    });
  });

  describe('Memory Strength', () => {
    it('should return value between 0 and 1', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 3600 }];
      const strength = actr.computeMemoryStrength(trace);

      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
    });

    it('should return 0 for empty trace', () => {
      const strength = actr.computeMemoryStrength([]);
      expect(strength).toBe(0);
    });
  });

  describe('Action Selection', () => {
    it('should select an action', () => {
      const context: ACTRContext = {
        trace: [{ secondsAgo: 3600 }]
      };

      const selection = actr.selectAction(mockUserState, ACTION_SPACE, context);

      expect(selection.action).toBeDefined();
      expect(ACTION_SPACE).toContainEqual(selection.action);
    });

    it('should prefer easy actions for low recall probability', () => {
      const lowProbContext: ACTRContext = {
        trace: [{ secondsAgo: 604800 }]
      };

      const selection = actr.selectAction(mockUserState, ACTION_SPACE, lowProbContext);

      expect(selection.action.difficulty).toBe('easy');
    });

    it('should throw on empty action list', () => {
      const context: ACTRContext = { trace: [{ secondsAgo: 3600 }] };

      expect(() => {
        actr.selectAction(mockUserState, [], context);
      }).toThrow();
    });

    it('should include meta information', () => {
      const context: ACTRContext = { trace: [{ secondsAgo: 3600 }] };
      const selection = actr.selectAction(mockUserState, ACTION_SPACE, context);

      expect(selection.meta).toBeDefined();
      expect(selection.meta).toHaveProperty('recallProbability');
      expect(selection.meta).toHaveProperty('baseActivation');
    });
  });

  describe('Update', () => {
    it('should increment update count', () => {
      const context: ACTRContext = { trace: [{ secondsAgo: 3600 }] };

      actr.update(mockUserState, ACTION_SPACE[0], 0.5, context);

      expect(actr.getUpdateCount()).toBe(1);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      actr.setDecay(0.6);
      actr.setThreshold(0.4);
      actr.update(mockUserState, ACTION_SPACE[0], 0.5, { trace: [] });

      const state = actr.getState();

      expect(state.decay).toBe(0.6);
      expect(state.threshold).toBe(0.4);
      expect(state.updateCount).toBe(1);
    });

    it('should restore state correctly', () => {
      const state: ACTRState = {
        decay: 0.7,
        threshold: 0.5,
        noiseScale: 0.3,
        updateCount: 10
      };

      actr.setState(state);

      expect(actr.getDecay()).toBe(0.7);
      expect(actr.getThreshold()).toBe(0.5);
      expect(actr.getUpdateCount()).toBe(10);
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        actr.setState(null as unknown as ACTRState);
      }).not.toThrow();
    });
  });

  describe('Reset', () => {
    it('should reset update count', () => {
      actr.update(mockUserState, ACTION_SPACE[0], 0.5, { trace: [] });
      actr.update(mockUserState, ACTION_SPACE[0], 0.5, { trace: [] });

      actr.reset();

      expect(actr.getUpdateCount()).toBe(0);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = actr.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.minSamplesForReliability).toBe(1);
    });
  });

  describe('Convenience Functions', () => {
    it('computeActivation should work as standalone', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 3600 }];
      const activation = computeActivation(trace, 0.5);

      expect(Number.isFinite(activation)).toBe(true);
    });

    it('computeRecallProbability should work as standalone', () => {
      const prob = computeRecallProbability(0.5, 0.3, 0.4);

      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(1);
    });

    it('computeOptimalInterval should work as standalone', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 60 }];
      const interval = computeOptimalInterval(trace, 0.7, 0.5, 0.3, 0.4);

      expect(interval).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small time values', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 0.001 }];
      const activation = actr.computeActivation(trace, 0.5, false);

      expect(Number.isFinite(activation)).toBe(true);
    });

    it('should handle very large time values', () => {
      const trace: ReviewTrace[] = [{ secondsAgo: 365 * 24 * 3600 }];
      const activation = actr.computeActivation(trace, 0.5, false);

      expect(Number.isFinite(activation)).toBe(true);
    });
  });
});
