/**
 * AMAS Decision Layer - Safety Guardrails Unit Tests
 *
 * Tests for safety constraints and protection mechanisms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGuardrails,
  applyFatigueProtection,
  applyMotivationProtection,
  applyAttentionProtection,
  applyTrendProtection,
  shouldSuggestBreak,
  shouldForceBreak,
  isInDangerZone,
  getActiveProtections
} from '../../../../src/amas/decision/guardrails';
import { UserState, StrategyParams } from '../../../../src/amas/types';
import {
  MIN_ATTENTION,
  HIGH_FATIGUE,
  CRITICAL_FATIGUE,
  LOW_MOTIVATION,
  CRITICAL_MOTIVATION
} from '../../../../src/amas/config/action-space';

describe('Guardrails', () => {
  // Default test data
  const defaultUserState: UserState = {
    A: 0.8,   // High attention
    F: 0.2,   // Low fatigue
    M: 0.5,   // Medium motivation
    C: { mem: 0.7, speed: 0.6, stability: 0.7 },
    conf: 0.8,
    ts: Date.now()
  };

  const defaultParams: StrategyParams = {
    interval_scale: 1.0,
    new_ratio: 0.3,
    difficulty: 'mid',
    batch_size: 12,
    hint_level: 0
  };

  // ==================== applyFatigueProtection Tests ====================

  describe('applyFatigueProtection', () => {
    it('should not modify params when fatigue is low', () => {
      const state: UserState = { ...defaultUserState, F: 0.3 };
      const result = applyFatigueProtection(state, defaultParams);

      expect(result.interval_scale).toBe(defaultParams.interval_scale);
      expect(result.new_ratio).toBe(defaultParams.new_ratio);
      expect(result.batch_size).toBe(defaultParams.batch_size);
    });

    it('should apply high fatigue protection when F > HIGH_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: HIGH_FATIGUE + 0.1 };
      const params: StrategyParams = {
        ...defaultParams,
        interval_scale: 0.5,
        new_ratio: 0.4,
        batch_size: 15
      };

      const result = applyFatigueProtection(state, params);

      // interval_scale should be at least 1.0
      expect(result.interval_scale).toBeGreaterThanOrEqual(1.0);
      // new_ratio should be at most 0.2
      expect(result.new_ratio).toBeLessThanOrEqual(0.2);
      // batch_size should be at most 8
      expect(result.batch_size).toBeLessThanOrEqual(8);
    });

    it('should apply critical fatigue protection when F > CRITICAL_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: CRITICAL_FATIGUE + 0.1 };
      const params: StrategyParams = {
        ...defaultParams,
        difficulty: 'hard',
        hint_level: 0,
        new_ratio: 0.4,
        batch_size: 15
      };

      const result = applyFatigueProtection(state, params);

      // Critical fatigue forces easy difficulty
      expect(result.difficulty).toBe('easy');
      // hint_level should be at least 1
      expect(result.hint_level).toBeGreaterThanOrEqual(1);
      // new_ratio should be at most 0.1
      expect(result.new_ratio).toBeLessThanOrEqual(0.1);
      // batch_size should be at most 5
      expect(result.batch_size).toBeLessThanOrEqual(5);
    });

    it('should apply both high and critical protections when F > CRITICAL_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: 0.9 };
      const params: StrategyParams = {
        interval_scale: 0.5,
        new_ratio: 0.5,
        difficulty: 'hard',
        batch_size: 20,
        hint_level: 0
      };

      const result = applyFatigueProtection(state, params);

      // Both high and critical protections should be applied
      expect(result.interval_scale).toBeGreaterThanOrEqual(1.0);
      expect(result.new_ratio).toBeLessThanOrEqual(0.1); // Critical takes precedence
      expect(result.batch_size).toBeLessThanOrEqual(5);  // Critical takes precedence
      expect(result.difficulty).toBe('easy');
      expect(result.hint_level).toBeGreaterThanOrEqual(1);
    });

    it('should not mutate the original params object', () => {
      const state: UserState = { ...defaultUserState, F: 0.9 };
      const originalParams = { ...defaultParams };

      applyFatigueProtection(state, defaultParams);

      expect(defaultParams).toEqual(originalParams);
    });
  });

  // ==================== applyMotivationProtection Tests ====================

  describe('applyMotivationProtection', () => {
    it('should not modify params when motivation is normal', () => {
      const state: UserState = { ...defaultUserState, M: 0.5 };
      const result = applyMotivationProtection(state, defaultParams);

      expect(result.difficulty).toBe(defaultParams.difficulty);
      expect(result.hint_level).toBe(defaultParams.hint_level);
      expect(result.new_ratio).toBe(defaultParams.new_ratio);
    });

    it('should apply low motivation protection when M < LOW_MOTIVATION', () => {
      const state: UserState = { ...defaultUserState, M: LOW_MOTIVATION - 0.1 };
      const params: StrategyParams = {
        ...defaultParams,
        difficulty: 'hard',
        hint_level: 0,
        new_ratio: 0.4
      };

      const result = applyMotivationProtection(state, params);

      // Low motivation forces easy difficulty
      expect(result.difficulty).toBe('easy');
      // hint_level should be at least 1
      expect(result.hint_level).toBeGreaterThanOrEqual(1);
      // new_ratio should be at most 0.2
      expect(result.new_ratio).toBeLessThanOrEqual(0.2);
    });

    it('should apply critical motivation protection when M < CRITICAL_MOTIVATION', () => {
      const state: UserState = { ...defaultUserState, M: CRITICAL_MOTIVATION - 0.1 };
      const params: StrategyParams = {
        ...defaultParams,
        hint_level: 0,
        new_ratio: 0.4,
        batch_size: 15
      };

      const result = applyMotivationProtection(state, params);

      // Critical motivation forces hint_level to 2
      expect(result.hint_level).toBe(2);
      // new_ratio should be at most 0.1
      expect(result.new_ratio).toBeLessThanOrEqual(0.1);
      // batch_size should be at most 5
      expect(result.batch_size).toBeLessThanOrEqual(5);
    });

    it('should apply both low and critical protections when M < CRITICAL_MOTIVATION', () => {
      const state: UserState = { ...defaultUserState, M: -0.8 };
      const params: StrategyParams = {
        interval_scale: 1.5,
        new_ratio: 0.5,
        difficulty: 'hard',
        batch_size: 20,
        hint_level: 0
      };

      const result = applyMotivationProtection(state, params);

      // Both protections should be applied
      expect(result.difficulty).toBe('easy');
      expect(result.hint_level).toBe(2); // Critical sets to 2
      expect(result.new_ratio).toBeLessThanOrEqual(0.1);
      expect(result.batch_size).toBeLessThanOrEqual(5);
    });
  });

  // ==================== applyAttentionProtection Tests ====================

  describe('applyAttentionProtection', () => {
    it('should not modify params when attention is high', () => {
      const state: UserState = { ...defaultUserState, A: 0.8 };
      const result = applyAttentionProtection(state, defaultParams);

      expect(result.new_ratio).toBe(defaultParams.new_ratio);
      expect(result.batch_size).toBe(defaultParams.batch_size);
      expect(result.hint_level).toBe(defaultParams.hint_level);
    });

    it('should apply low attention protection when A < MIN_ATTENTION', () => {
      const state: UserState = { ...defaultUserState, A: MIN_ATTENTION - 0.1 };
      const params: StrategyParams = {
        ...defaultParams,
        new_ratio: 0.4,
        batch_size: 15,
        hint_level: 0
      };

      const result = applyAttentionProtection(state, params);

      // new_ratio should be at most 0.15
      expect(result.new_ratio).toBeLessThanOrEqual(0.15);
      // batch_size should be at most 6
      expect(result.batch_size).toBeLessThanOrEqual(6);
      // hint_level should be at least 1
      expect(result.hint_level).toBeGreaterThanOrEqual(1);
    });

    it('should keep already-constrained values', () => {
      const state: UserState = { ...defaultUserState, A: 0.1 };
      const params: StrategyParams = {
        ...defaultParams,
        new_ratio: 0.1,  // Already low
        batch_size: 5,   // Already low
        hint_level: 2    // Already high
      };

      const result = applyAttentionProtection(state, params);

      expect(result.new_ratio).toBe(0.1);
      expect(result.batch_size).toBe(5);
      expect(result.hint_level).toBe(2);
    });
  });

  // ==================== applyTrendProtection Tests ====================

  describe('applyTrendProtection', () => {
    it('should not modify params when T is undefined', () => {
      const state: UserState = { ...defaultUserState };
      delete state.T;

      const result = applyTrendProtection(state, defaultParams);

      expect(result).toEqual(defaultParams);
    });

    it('should not modify params when T is null', () => {
      const state: UserState = { ...defaultUserState, T: null as any };

      const result = applyTrendProtection(state, defaultParams);

      expect(result).toEqual(defaultParams);
    });

    it('should not modify params when T is "up"', () => {
      const state: UserState = { ...defaultUserState, T: 'up' };

      const result = applyTrendProtection(state, defaultParams);

      expect(result).toEqual(defaultParams);
    });

    it('should not modify params when T is "flat"', () => {
      const state: UserState = { ...defaultUserState, T: 'flat' };

      const result = applyTrendProtection(state, defaultParams);

      expect(result).toEqual(defaultParams);
    });

    it('should apply down trend protection when T is "down"', () => {
      const state: UserState = { ...defaultUserState, T: 'down' };
      const params: StrategyParams = {
        ...defaultParams,
        new_ratio: 0.4,
        difficulty: 'hard',
        interval_scale: 1.2
      };

      const result = applyTrendProtection(state, params);

      // new_ratio should be at most 0.1
      expect(result.new_ratio).toBeLessThanOrEqual(0.1);
      // difficulty should be easy
      expect(result.difficulty).toBe('easy');
      // interval_scale should be at most 0.7 (more frequent reviews)
      expect(result.interval_scale).toBeLessThanOrEqual(0.7);
    });

    it('should apply stuck trend protection when T is "stuck"', () => {
      const state: UserState = { ...defaultUserState, T: 'stuck' };
      const params: StrategyParams = {
        ...defaultParams,
        new_ratio: 0.4
      };

      const result = applyTrendProtection(state, params);

      // new_ratio should be at most 0.15
      expect(result.new_ratio).toBeLessThanOrEqual(0.15);
      // Other params should remain unchanged
      expect(result.difficulty).toBe(params.difficulty);
      expect(result.interval_scale).toBe(params.interval_scale);
    });
  });

  // ==================== applyGuardrails Tests ====================

  describe('applyGuardrails', () => {
    it('should apply all protections in order', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0.2,   // Low attention
        F: 0.9,   // Critical fatigue
        M: -0.6,  // Critical motivation
        T: 'down' // Down trend
      };

      const params: StrategyParams = {
        interval_scale: 1.5,
        new_ratio: 0.5,
        difficulty: 'hard',
        batch_size: 20,
        hint_level: 0
      };

      const result = applyGuardrails(state, params);

      // All protections should be applied
      expect(result.difficulty).toBe('easy');
      expect(result.hint_level).toBe(2);
      expect(result.new_ratio).toBeLessThanOrEqual(0.1);
      expect(result.batch_size).toBeLessThanOrEqual(5);
    });

    it('should return unchanged params when user state is good', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0.9,
        F: 0.1,
        M: 0.8
      };

      const result = applyGuardrails(state, defaultParams);

      expect(result).toEqual(defaultParams);
    });

    it('should combine multiple protections correctly', () => {
      // Test that the most restrictive constraints win
      const state: UserState = {
        ...defaultUserState,
        F: HIGH_FATIGUE + 0.1, // new_ratio <= 0.2
        A: MIN_ATTENTION - 0.1 // new_ratio <= 0.15
      };

      const params: StrategyParams = {
        ...defaultParams,
        new_ratio: 0.4
      };

      const result = applyGuardrails(state, params);

      // Attention protection is more restrictive (0.15 < 0.2)
      expect(result.new_ratio).toBeLessThanOrEqual(0.15);
    });
  });

  // ==================== Check Functions Tests ====================

  describe('shouldSuggestBreak', () => {
    it('should return true when F > HIGH_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: HIGH_FATIGUE + 0.1 };
      expect(shouldSuggestBreak(state)).toBe(true);
    });

    it('should return false when F <= HIGH_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: HIGH_FATIGUE };
      expect(shouldSuggestBreak(state)).toBe(false);
    });

    it('should return false when F is low', () => {
      const state: UserState = { ...defaultUserState, F: 0.2 };
      expect(shouldSuggestBreak(state)).toBe(false);
    });
  });

  describe('shouldForceBreak', () => {
    it('should return true when F > CRITICAL_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: CRITICAL_FATIGUE + 0.1 };
      expect(shouldForceBreak(state)).toBe(true);
    });

    it('should return false when F <= CRITICAL_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: CRITICAL_FATIGUE };
      expect(shouldForceBreak(state)).toBe(false);
    });

    it('should return false when F is moderate', () => {
      const state: UserState = { ...defaultUserState, F: 0.5 };
      expect(shouldForceBreak(state)).toBe(false);
    });
  });

  describe('isInDangerZone', () => {
    it('should return true when F > CRITICAL_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: CRITICAL_FATIGUE + 0.1 };
      expect(isInDangerZone(state)).toBe(true);
    });

    it('should return true when M < CRITICAL_MOTIVATION', () => {
      const state: UserState = { ...defaultUserState, M: CRITICAL_MOTIVATION - 0.1 };
      expect(isInDangerZone(state)).toBe(true);
    });

    it('should return true when A < MIN_ATTENTION', () => {
      const state: UserState = { ...defaultUserState, A: MIN_ATTENTION - 0.1 };
      expect(isInDangerZone(state)).toBe(true);
    });

    it('should return false when all metrics are safe', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0.8,
        F: 0.2,
        M: 0.5
      };
      expect(isInDangerZone(state)).toBe(false);
    });

    it('should return true when multiple danger conditions are met', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0.1,
        F: 0.95,
        M: -0.8
      };
      expect(isInDangerZone(state)).toBe(true);
    });
  });

  describe('getActiveProtections', () => {
    it('should return empty array when no protections are active', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0.8,
        F: 0.2,
        M: 0.5
      };

      const protections = getActiveProtections(state);
      expect(protections).toEqual([]);
    });

    it('should return fatigue when F > HIGH_FATIGUE', () => {
      const state: UserState = { ...defaultUserState, F: HIGH_FATIGUE + 0.1 };
      const protections = getActiveProtections(state);
      expect(protections).toContain('fatigue');
    });

    it('should return motivation when M < LOW_MOTIVATION', () => {
      const state: UserState = { ...defaultUserState, M: LOW_MOTIVATION - 0.1 };
      const protections = getActiveProtections(state);
      expect(protections).toContain('motivation');
    });

    it('should return attention when A < MIN_ATTENTION', () => {
      const state: UserState = { ...defaultUserState, A: MIN_ATTENTION - 0.1 };
      const protections = getActiveProtections(state);
      expect(protections).toContain('attention');
    });

    it('should return trend when T is "down"', () => {
      const state: UserState = { ...defaultUserState, T: 'down' };
      const protections = getActiveProtections(state);
      expect(protections).toContain('trend');
    });

    it('should return trend when T is "stuck"', () => {
      const state: UserState = { ...defaultUserState, T: 'stuck' };
      const protections = getActiveProtections(state);
      expect(protections).toContain('trend');
    });

    it('should not return trend when T is undefined', () => {
      const state: UserState = { ...defaultUserState };
      delete state.T;
      const protections = getActiveProtections(state);
      expect(protections).not.toContain('trend');
    });

    it('should not return trend when T is "up" or "flat"', () => {
      const stateUp: UserState = { ...defaultUserState, T: 'up' };
      const stateFlat: UserState = { ...defaultUserState, T: 'flat' };

      expect(getActiveProtections(stateUp)).not.toContain('trend');
      expect(getActiveProtections(stateFlat)).not.toContain('trend');
    });

    it('should return multiple protections when multiple conditions are met', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0.1,
        F: 0.9,
        M: -0.6,
        T: 'down'
      };

      const protections = getActiveProtections(state);

      expect(protections).toContain('fatigue');
      expect(protections).toContain('motivation');
      expect(protections).toContain('attention');
      expect(protections).toContain('trend');
      expect(protections.length).toBe(4);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle boundary values correctly for fatigue', () => {
      // Exactly at HIGH_FATIGUE
      const stateAtHigh: UserState = { ...defaultUserState, F: HIGH_FATIGUE };
      expect(applyFatigueProtection(stateAtHigh, defaultParams)).toEqual(defaultParams);

      // Just above HIGH_FATIGUE
      const stateAboveHigh: UserState = { ...defaultUserState, F: HIGH_FATIGUE + 0.001 };
      const resultAbove = applyFatigueProtection(stateAboveHigh, {
        ...defaultParams,
        interval_scale: 0.5
      });
      expect(resultAbove.interval_scale).toBe(1.0);
    });

    it('should handle boundary values correctly for motivation', () => {
      // Exactly at LOW_MOTIVATION
      const stateAtLow: UserState = { ...defaultUserState, M: LOW_MOTIVATION };
      expect(applyMotivationProtection(stateAtLow, defaultParams)).toEqual(defaultParams);

      // Just below LOW_MOTIVATION
      const stateBelowLow: UserState = { ...defaultUserState, M: LOW_MOTIVATION - 0.001 };
      const resultBelow = applyMotivationProtection(stateBelowLow, {
        ...defaultParams,
        difficulty: 'hard'
      });
      expect(resultBelow.difficulty).toBe('easy');
    });

    it('should handle boundary values correctly for attention', () => {
      // Exactly at MIN_ATTENTION
      const stateAtMin: UserState = { ...defaultUserState, A: MIN_ATTENTION };
      expect(applyAttentionProtection(stateAtMin, defaultParams)).toEqual(defaultParams);

      // Just below MIN_ATTENTION
      const stateBelowMin: UserState = { ...defaultUserState, A: MIN_ATTENTION - 0.001 };
      const resultBelow = applyAttentionProtection(stateBelowMin, {
        ...defaultParams,
        hint_level: 0
      });
      expect(resultBelow.hint_level).toBe(1);
    });

    it('should handle extreme parameter values', () => {
      const state: UserState = {
        ...defaultUserState,
        A: 0,
        F: 1,
        M: -1
      };

      const params: StrategyParams = {
        interval_scale: 0,
        new_ratio: 1,
        difficulty: 'hard',
        batch_size: 100,
        hint_level: 0
      };

      const result = applyGuardrails(state, params);

      // Should apply all protections without errors
      expect(result.difficulty).toBe('easy');
      expect(result.hint_level).toBe(2);
      expect(result.new_ratio).toBeLessThanOrEqual(0.1);
      expect(result.batch_size).toBeLessThanOrEqual(5);
    });
  });
});
