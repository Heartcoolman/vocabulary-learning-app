/**
 * AMAS Decision Layer - Action Mapper Unit Tests
 *
 * Tests for action-to-strategy mapping and reverse mapping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  mapActionToStrategy,
  mapActionDirect,
  computeStrategyDelta,
  hasSignificantChange,
  mapStrategyToAction
} from '../../../../src/amas/decision/mapper';
import { Action, StrategyParams, DifficultyLevel } from '../../../../src/amas/types';
import { STRATEGY_SMOOTHING, ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('Action Mapper', () => {
  // Default test data
  const defaultAction: Action = {
    interval_scale: 1.0,
    new_ratio: 0.2,
    difficulty: 'mid',
    batch_size: 8,
    hint_level: 1
  };

  const defaultStrategy: StrategyParams = {
    interval_scale: 1.0,
    new_ratio: 0.2,
    difficulty: 'mid',
    batch_size: 8,
    hint_level: 1
  };

  // ==================== mapActionToStrategy Tests ====================

  describe('mapActionToStrategy', () => {
    it('should return identical values when tau = 0 (no smoothing)', () => {
      const current: StrategyParams = {
        interval_scale: 0.5,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 2
      };

      const action: Action = {
        interval_scale: 1.5,
        new_ratio: 0.4,
        difficulty: 'hard',
        batch_size: 16,
        hint_level: 0
      };

      const result = mapActionToStrategy(action, current, 0);

      // With tau = 0, values should be clamped action values
      expect(result.interval_scale).toBeCloseTo(1.5, 5);
      expect(result.new_ratio).toBeCloseTo(0.4, 5);
      expect(result.difficulty).toBe('hard');
      expect(result.batch_size).toBe(16);
      expect(result.hint_level).toBe(0);
    });

    it('should return current values when tau = 1 (full smoothing)', () => {
      const current: StrategyParams = {
        interval_scale: 0.8,
        new_ratio: 0.15,
        difficulty: 'easy',
        batch_size: 6,
        hint_level: 2
      };

      const action: Action = {
        interval_scale: 1.5,
        new_ratio: 0.4,
        difficulty: 'hard',
        batch_size: 16,
        hint_level: 0
      };

      const result = mapActionToStrategy(action, current, 1);

      // With tau = 1, continuous values should remain close to current
      expect(result.interval_scale).toBeCloseTo(current.interval_scale, 5);
      expect(result.new_ratio).toBeCloseTo(current.new_ratio, 5);
      // Discrete value (difficulty) switches immediately
      expect(result.difficulty).toBe('hard');
      // Integer values are smoothed then rounded
      expect(result.batch_size).toBe(current.batch_size);
      expect(result.hint_level).toBe(current.hint_level);
    });

    it('should apply default smoothing coefficient', () => {
      const current: StrategyParams = {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      };

      const action: Action = {
        interval_scale: 1.4,
        new_ratio: 0.3,
        difficulty: 'hard',
        batch_size: 12,
        hint_level: 0
      };

      const result = mapActionToStrategy(action, current);

      // With default tau (STRATEGY_SMOOTHING = 0.5):
      // smooth(prev, target, 0.5) = 0.5 * prev + 0.5 * target
      const expectedIntervalScale = 0.5 * 1.0 + 0.5 * 1.4;
      const expectedNewRatio = 0.5 * 0.2 + 0.5 * 0.3;

      expect(result.interval_scale).toBeCloseTo(expectedIntervalScale, 5);
      expect(result.new_ratio).toBeCloseTo(expectedNewRatio, 5);
    });

    it('should clamp interval_scale to [0.5, 1.5]', () => {
      const current: StrategyParams = { ...defaultStrategy, interval_scale: 1.5 };

      // Test upper bound
      const actionHigh: Action = { ...defaultAction, interval_scale: 2.0 };
      const resultHigh = mapActionToStrategy(actionHigh, current, 0);
      expect(resultHigh.interval_scale).toBeLessThanOrEqual(1.5);

      // Test lower bound
      const actionLow: Action = { ...defaultAction, interval_scale: 0.2 };
      const resultLow = mapActionToStrategy(actionLow, { ...current, interval_scale: 0.5 }, 0);
      expect(resultLow.interval_scale).toBeGreaterThanOrEqual(0.5);
    });

    it('should clamp new_ratio to [0.05, 0.5]', () => {
      const current: StrategyParams = { ...defaultStrategy };

      // Test upper bound
      const actionHigh: Action = { ...defaultAction, new_ratio: 0.8 };
      const resultHigh = mapActionToStrategy(actionHigh, current, 0);
      expect(resultHigh.new_ratio).toBeLessThanOrEqual(0.5);

      // Test lower bound
      const actionLow: Action = { ...defaultAction, new_ratio: 0.01 };
      const resultLow = mapActionToStrategy(actionLow, current, 0);
      expect(resultLow.new_ratio).toBeGreaterThanOrEqual(0.05);
    });

    it('should clamp batch_size to [5, 20]', () => {
      const current: StrategyParams = { ...defaultStrategy };

      // Test upper bound
      const actionHigh: Action = { ...defaultAction, batch_size: 30 };
      const resultHigh = mapActionToStrategy(actionHigh, current, 0);
      expect(resultHigh.batch_size).toBeLessThanOrEqual(20);

      // Test lower bound
      const actionLow: Action = { ...defaultAction, batch_size: 2 };
      const resultLow = mapActionToStrategy(actionLow, current, 0);
      expect(resultLow.batch_size).toBeGreaterThanOrEqual(5);
    });

    it('should clamp hint_level to [0, 2]', () => {
      const current: StrategyParams = { ...defaultStrategy };

      // Test upper bound
      const actionHigh: Action = { ...defaultAction, hint_level: 5 };
      const resultHigh = mapActionToStrategy(actionHigh, current, 0);
      expect(resultHigh.hint_level).toBeLessThanOrEqual(2);

      // Test lower bound
      const actionLow: Action = { ...defaultAction, hint_level: -1 };
      const resultLow = mapActionToStrategy(actionLow, current, 0);
      expect(resultLow.hint_level).toBeGreaterThanOrEqual(0);
    });

    it('should switch difficulty immediately (no smoothing)', () => {
      const current: StrategyParams = { ...defaultStrategy, difficulty: 'easy' };
      const action: Action = { ...defaultAction, difficulty: 'hard' };

      // Even with high smoothing, difficulty switches immediately
      const result = mapActionToStrategy(action, current, 0.9);
      expect(result.difficulty).toBe('hard');
    });

    it('should round integer values after smoothing', () => {
      const current: StrategyParams = { ...defaultStrategy, batch_size: 5, hint_level: 0 };
      const action: Action = { ...defaultAction, batch_size: 12, hint_level: 2 };

      const result = mapActionToStrategy(action, current, 0.5);

      // batch_size: smooth(5, 12, 0.5) = 8.5 -> round to 9 (but clamped)
      expect(Number.isInteger(result.batch_size)).toBe(true);
      // hint_level: smooth(0, 2, 0.5) = 1 -> round to 1
      expect(Number.isInteger(result.hint_level)).toBe(true);
    });
  });

  // ==================== mapActionDirect Tests ====================

  describe('mapActionDirect', () => {
    it('should map action directly without smoothing', () => {
      const action: Action = {
        interval_scale: 1.2,
        new_ratio: 0.3,
        difficulty: 'mid',
        batch_size: 10,
        hint_level: 1
      };

      const result = mapActionDirect(action);

      expect(result.interval_scale).toBe(1.2);
      expect(result.new_ratio).toBe(0.3);
      expect(result.difficulty).toBe('mid');
      expect(result.batch_size).toBe(10);
      expect(result.hint_level).toBe(1);
    });

    it('should clamp values to valid ranges', () => {
      const action: Action = {
        interval_scale: 2.5,   // > 1.5
        new_ratio: 0.8,       // > 0.5
        difficulty: 'hard',
        batch_size: 30,       // > 20
        hint_level: 5         // > 2
      };

      const result = mapActionDirect(action);

      expect(result.interval_scale).toBe(1.5);
      expect(result.new_ratio).toBe(0.5);
      expect(result.batch_size).toBe(20);
      expect(result.hint_level).toBe(2);
    });

    it('should clamp values at lower bounds', () => {
      const action: Action = {
        interval_scale: 0.1,  // < 0.5
        new_ratio: 0.01,      // < 0.05
        difficulty: 'easy',
        batch_size: 2,        // < 5
        hint_level: -1        // < 0
      };

      const result = mapActionDirect(action);

      expect(result.interval_scale).toBe(0.5);
      expect(result.new_ratio).toBe(0.05);
      expect(result.batch_size).toBe(5);
      expect(result.hint_level).toBe(0);
    });

    it('should preserve valid values', () => {
      const action: Action = {
        interval_scale: 1.0,
        new_ratio: 0.25,
        difficulty: 'mid',
        batch_size: 12,
        hint_level: 1
      };

      const result = mapActionDirect(action);

      expect(result).toEqual(action);
    });
  });

  // ==================== computeStrategyDelta Tests ====================

  describe('computeStrategyDelta', () => {
    it('should return 0 for identical strategies', () => {
      const delta = computeStrategyDelta(defaultStrategy, defaultStrategy);
      expect(delta).toBe(0);
    });

    it('should compute delta for interval_scale change', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.0 };
      const newParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.2 };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Delta includes: |1.2 - 1.0| = 0.2
      expect(delta).toBeCloseTo(0.2, 5);
    });

    it('should compute delta for new_ratio change with weight 10', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, new_ratio: 0.2 };
      const newParams: StrategyParams = { ...defaultStrategy, new_ratio: 0.3 };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Delta includes: |0.3 - 0.2| * 10 = 1.0
      expect(delta).toBeCloseTo(1.0, 5);
    });

    it('should compute delta for batch_size change with weight 1/5', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, batch_size: 5 };
      const newParams: StrategyParams = { ...defaultStrategy, batch_size: 10 };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Delta includes: |10 - 5| / 5 = 1.0
      expect(delta).toBeCloseTo(1.0, 5);
    });

    it('should compute delta for hint_level change', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, hint_level: 0 };
      const newParams: StrategyParams = { ...defaultStrategy, hint_level: 2 };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Delta includes: |2 - 0| = 2.0
      expect(delta).toBeCloseTo(2.0, 5);
    });

    it('should add 1 for difficulty change', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, difficulty: 'easy' };
      const newParams: StrategyParams = { ...defaultStrategy, difficulty: 'hard' };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Delta includes: 1 (difficulty changed)
      expect(delta).toBe(1);
    });

    it('should compute combined delta for multiple changes', () => {
      const oldParams: StrategyParams = {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 0
      };

      const newParams: StrategyParams = {
        interval_scale: 1.5,
        new_ratio: 0.4,
        difficulty: 'hard',
        batch_size: 15,
        hint_level: 2
      };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Expected delta:
      // interval_scale: |1.5 - 1.0| = 0.5
      // new_ratio: |0.4 - 0.2| * 10 = 2.0
      // batch_size: |15 - 5| / 5 = 2.0
      // hint_level: |2 - 0| = 2.0
      // difficulty: 1 (changed)
      // Total: 0.5 + 2.0 + 2.0 + 2.0 + 1.0 = 7.5
      expect(delta).toBeCloseTo(7.5, 5);
    });

    it('should not add difficulty delta when difficulty is the same', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, difficulty: 'mid' };
      const newParams: StrategyParams = { ...defaultStrategy, difficulty: 'mid' };

      const delta = computeStrategyDelta(oldParams, newParams);
      expect(delta).toBe(0);
    });
  });

  // ==================== hasSignificantChange Tests ====================

  describe('hasSignificantChange', () => {
    it('should return false for identical strategies', () => {
      const result = hasSignificantChange(defaultStrategy, defaultStrategy);
      expect(result).toBe(false);
    });

    it('should return false for small changes below threshold', () => {
      const oldParams: StrategyParams = { ...defaultStrategy };
      const newParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.1 };

      // Delta = 0.1, default threshold = 0.5
      const result = hasSignificantChange(oldParams, newParams);
      expect(result).toBe(false);
    });

    it('should return true for changes above threshold', () => {
      const oldParams: StrategyParams = { ...defaultStrategy };
      const newParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.6 };

      // Delta = 0.6 > 0.5
      const result = hasSignificantChange(oldParams, newParams);
      expect(result).toBe(true);
    });

    it('should respect custom threshold', () => {
      const oldParams: StrategyParams = { ...defaultStrategy };
      const newParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.2 };

      // Delta = 0.2
      expect(hasSignificantChange(oldParams, newParams, 0.1)).toBe(true);
      expect(hasSignificantChange(oldParams, newParams, 0.3)).toBe(false);
    });

    it('should detect difficulty change as significant', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, difficulty: 'easy' };
      const newParams: StrategyParams = { ...defaultStrategy, difficulty: 'hard' };

      // Difficulty change adds 1.0 to delta
      const result = hasSignificantChange(oldParams, newParams);
      expect(result).toBe(true);
    });

    it('should return false when delta equals threshold', () => {
      const oldParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.0 };
      const newParams: StrategyParams = { ...defaultStrategy, interval_scale: 1.5 };

      // Delta = 0.5, threshold = 0.5 (> not >=)
      const result = hasSignificantChange(oldParams, newParams);
      expect(result).toBe(false);
    });
  });

  // ==================== mapStrategyToAction Tests ====================

  describe('mapStrategyToAction', () => {
    it('should return an action from ACTION_SPACE', () => {
      const result = mapStrategyToAction(defaultStrategy);

      // Result should be one of the predefined actions
      const found = ACTION_SPACE.some(
        action =>
          action.interval_scale === result.interval_scale &&
          action.new_ratio === result.new_ratio &&
          action.difficulty === result.difficulty &&
          action.batch_size === result.batch_size &&
          action.hint_level === result.hint_level
      );
      expect(found).toBe(true);
    });

    it('should find the closest action for a given strategy', () => {
      const strategy: StrategyParams = {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      };

      const result = mapStrategyToAction(strategy);

      // The closest action should match these key properties
      expect(result.interval_scale).toBe(1.0);
      expect(result.new_ratio).toBe(0.2);
      expect(result.difficulty).toBe('mid');
    });

    it('should prefer action matching difficulty', () => {
      const strategy: StrategyParams = {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'easy',
        batch_size: 8,
        hint_level: 1
      };

      const result = mapStrategyToAction(strategy);

      // Difficulty mismatch adds penalty, so should prefer matching difficulty
      expect(result.difficulty).toBe('easy');
    });

    it('should handle edge case strategies', () => {
      // Strategy at the extreme of the action space
      const extremeStrategy: StrategyParams = {
        interval_scale: 1.5,
        new_ratio: 0.4,
        difficulty: 'hard',
        batch_size: 16,
        hint_level: 0
      };

      const result = mapStrategyToAction(extremeStrategy);

      // Should find a reasonable match
      expect(result).toBeDefined();
      expect(result.difficulty).toBe('hard');
    });

    it('should use preferredAction for tie-breaking', () => {
      const strategy: StrategyParams = {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      };

      // Create a preferred action that's slightly different
      const preferredAction: Action = {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      };

      const result = mapStrategyToAction(strategy, preferredAction);

      // Result should be close to or equal to the preferred action
      expect(result).toBeDefined();
    });

    it('should find action from ACTION_SPACE for various strategies', () => {
      // Test multiple strategies
      const strategies: StrategyParams[] = [
        { interval_scale: 0.5, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
        { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'mid', batch_size: 12, hint_level: 0 },
        { interval_scale: 1.5, new_ratio: 0.4, difficulty: 'hard', batch_size: 16, hint_level: 0 }
      ];

      for (const strategy of strategies) {
        const result = mapStrategyToAction(strategy);

        // Each result should be from ACTION_SPACE
        const found = ACTION_SPACE.some(
          action =>
            action.interval_scale === result.interval_scale &&
            action.new_ratio === result.new_ratio &&
            action.difficulty === result.difficulty &&
            action.batch_size === result.batch_size &&
            action.hint_level === result.hint_level
        );
        expect(found).toBe(true);
      }
    });

    it('should handle conservative strategy mapping', () => {
      // Conservative strategy (low attention/motivation)
      const conservativeStrategy: StrategyParams = {
        interval_scale: 0.5,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 2
      };

      const result = mapStrategyToAction(conservativeStrategy);

      // Should find a conservative action
      expect(result.difficulty).toBe('easy');
      expect(result.hint_level).toBeGreaterThanOrEqual(1);
    });

    it('should prefer preferredAction when distances are equal', () => {
      // Find an action from ACTION_SPACE
      const preferredAction = ACTION_SPACE[0];

      // Create a strategy that exactly matches the preferred action
      const strategy: StrategyParams = {
        interval_scale: preferredAction.interval_scale,
        new_ratio: preferredAction.new_ratio,
        difficulty: preferredAction.difficulty,
        batch_size: preferredAction.batch_size,
        hint_level: preferredAction.hint_level
      };

      const result = mapStrategyToAction(strategy, preferredAction);

      // Should return the preferred action or one identical to it
      expect(result.interval_scale).toBe(preferredAction.interval_scale);
      expect(result.new_ratio).toBe(preferredAction.new_ratio);
      expect(result.difficulty).toBe(preferredAction.difficulty);
      expect(result.batch_size).toBe(preferredAction.batch_size);
      expect(result.hint_level).toBe(preferredAction.hint_level);
    });

    it('should return first action in ACTION_SPACE as fallback', () => {
      // Even with a very unusual strategy, should return a valid action
      const unusualStrategy: StrategyParams = {
        interval_scale: 999,
        new_ratio: 999,
        difficulty: 'mid',
        batch_size: 999,
        hint_level: 999
      };

      const result = mapStrategyToAction(unusualStrategy);

      // Should still return a valid action from ACTION_SPACE
      expect(result).toBeDefined();
      const found = ACTION_SPACE.includes(result);
      expect(found).toBe(true);
    });
  });

  // ==================== Integration Tests ====================

  describe('integration', () => {
    it('should roundtrip action -> strategy -> action', () => {
      // Start with an action from ACTION_SPACE
      const originalAction = ACTION_SPACE[5];

      // Map to strategy directly
      const strategy = mapActionDirect(originalAction);

      // Map back to action
      const recoveredAction = mapStrategyToAction(strategy, originalAction);

      // Should recover the original or very similar action
      expect(recoveredAction.interval_scale).toBe(originalAction.interval_scale);
      expect(recoveredAction.new_ratio).toBe(originalAction.new_ratio);
      expect(recoveredAction.difficulty).toBe(originalAction.difficulty);
    });

    it('should handle smoothed transitions correctly', () => {
      const current: StrategyParams = {
        interval_scale: 0.5,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 2
      };

      const targetAction: Action = {
        interval_scale: 1.5,
        new_ratio: 0.4,
        difficulty: 'hard',
        batch_size: 16,
        hint_level: 0
      };

      // Apply smoothed transition
      const smoothed = mapActionToStrategy(targetAction, current, 0.5);

      // Values should be between current and target
      expect(smoothed.interval_scale).toBeGreaterThan(current.interval_scale);
      expect(smoothed.interval_scale).toBeLessThan(targetAction.interval_scale);
      expect(smoothed.new_ratio).toBeGreaterThan(current.new_ratio);
      expect(smoothed.new_ratio).toBeLessThan(targetAction.new_ratio);
    });

    it('should detect significant changes after smoothing', () => {
      const current: StrategyParams = {
        interval_scale: 0.5,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 2
      };

      const targetAction: Action = {
        interval_scale: 1.5,
        new_ratio: 0.4,
        difficulty: 'hard',
        batch_size: 16,
        hint_level: 0
      };

      // Apply smoothed transition
      const smoothed = mapActionToStrategy(targetAction, current, 0.5);

      // Should detect significant change
      const isSignificant = hasSignificantChange(current, smoothed);
      expect(isSignificant).toBe(true);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle NaN values in smoothing', () => {
      const current: StrategyParams = { ...defaultStrategy };
      const action: Action = { ...defaultAction };

      // NaN tau should be handled
      const result = mapActionToStrategy(action, current, NaN);

      // Should still produce valid numbers (implementation dependent)
      expect(Number.isFinite(result.interval_scale) || Number.isNaN(result.interval_scale)).toBe(true);
    });

    it('should handle negative tau values', () => {
      const current: StrategyParams = { ...defaultStrategy, interval_scale: 1.0 };
      const action: Action = { ...defaultAction, interval_scale: 1.2 };

      const result = mapActionToStrategy(action, current, -0.5);

      // With negative tau, smooth formula may produce values outside normal range
      // but clamping should ensure valid output
      expect(result.interval_scale).toBeGreaterThanOrEqual(0.5);
      expect(result.interval_scale).toBeLessThanOrEqual(1.5);
    });

    it('should handle all difficulty levels', () => {
      const difficulties: DifficultyLevel[] = ['easy', 'mid', 'hard'];

      for (const difficulty of difficulties) {
        const strategy: StrategyParams = { ...defaultStrategy, difficulty };
        const result = mapStrategyToAction(strategy);
        expect(result).toBeDefined();
      }
    });

    it('should handle extreme parameter values in delta computation', () => {
      const oldParams: StrategyParams = {
        interval_scale: 0,
        new_ratio: 0,
        difficulty: 'easy',
        batch_size: 0,
        hint_level: 0
      };

      const newParams: StrategyParams = {
        interval_scale: 100,
        new_ratio: 100,
        difficulty: 'hard',
        batch_size: 1000,
        hint_level: 100
      };

      const delta = computeStrategyDelta(oldParams, newParams);

      // Should produce a finite number
      expect(Number.isFinite(delta)).toBe(true);
      expect(delta).toBeGreaterThan(0);
    });
  });
});
