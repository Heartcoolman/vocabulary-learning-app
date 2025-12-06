/**
 * ActionSpace Unit Tests
 *
 * Tests for the action space configuration and constants
 */

import { describe, it, expect } from 'vitest';
import {
  ACTION_SPACE,
  DEFAULT_STRATEGY,
  COLD_START_STRATEGY,
  DEFAULT_ATTENTION_WEIGHTS,
  DEFAULT_FATIGUE_PARAMS,
  DEFAULT_MOTIVATION_PARAMS,
  DEFAULT_PERCEPTION_CONFIG,
  REWARD_WEIGHTS,
  MIN_ATTENTION,
  MID_ATTENTION,
  HIGH_FATIGUE,
  CRITICAL_FATIGUE,
  LOW_MOTIVATION,
  CRITICAL_MOTIVATION,
  HIGH_MOTIVATION,
  DEFAULT_ALPHA,
  DEFAULT_LAMBDA,
  DEFAULT_DIMENSION,
  CLASSIFY_PHASE_THRESHOLD,
  EXPLORE_PHASE_THRESHOLD,
  CLASSIFY_TRIGGER,
  EARLY_STOP_CONFIG,
  getActionIndex,
  getPriorAlpha
} from '../../../../src/amas/config/action-space';

describe('ActionSpace Configuration', () => {
  // ==================== Threshold Constants Tests ====================

  describe('threshold constants', () => {
    it('should define attention thresholds', () => {
      expect(MIN_ATTENTION).toBe(0.3);
      expect(MID_ATTENTION).toBe(0.5);
    });

    it('should define fatigue thresholds', () => {
      expect(HIGH_FATIGUE).toBe(0.6);
      expect(CRITICAL_FATIGUE).toBe(0.8);
      expect(CRITICAL_FATIGUE).toBeGreaterThan(HIGH_FATIGUE);
    });

    it('should define motivation thresholds', () => {
      expect(LOW_MOTIVATION).toBe(-0.3);
      expect(CRITICAL_MOTIVATION).toBe(-0.5);
      expect(HIGH_MOTIVATION).toBe(0.5);
      expect(HIGH_MOTIVATION).toBeGreaterThan(LOW_MOTIVATION);
    });
  });

  // ==================== LinUCB Parameters Tests ====================

  describe('LinUCB parameters', () => {
    it('should define default alpha', () => {
      expect(DEFAULT_ALPHA).toBe(1.0);
    });

    it('should define default lambda', () => {
      expect(DEFAULT_LAMBDA).toBe(1.0);
    });

    it('should define feature dimension', () => {
      expect(DEFAULT_DIMENSION).toBe(22);
    });
  });

  // ==================== Cold Start Thresholds Tests ====================

  describe('cold start thresholds', () => {
    it('should define classify phase threshold', () => {
      expect(CLASSIFY_PHASE_THRESHOLD).toBe(5);
    });

    it('should define explore phase threshold', () => {
      expect(EXPLORE_PHASE_THRESHOLD).toBe(8);
      expect(EXPLORE_PHASE_THRESHOLD).toBeGreaterThan(CLASSIFY_PHASE_THRESHOLD);
    });

    it('should define classify trigger', () => {
      expect(CLASSIFY_TRIGGER).toBe(3);
    });

    it('should define early stop config', () => {
      expect(EARLY_STOP_CONFIG).toHaveProperty('confidenceThreshold');
      expect(EARLY_STOP_CONFIG).toHaveProperty('minProbes');
      expect(EARLY_STOP_CONFIG).toHaveProperty('strongEvidenceMultiplier');

      expect(EARLY_STOP_CONFIG.confidenceThreshold).toBeGreaterThan(0.5);
      expect(EARLY_STOP_CONFIG.minProbes).toBeGreaterThan(0);
    });
  });

  // ==================== Model Parameters Tests ====================

  describe('attention weights', () => {
    it('should define all attention weight factors', () => {
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('rt_mean');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('rt_cv');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('pace_cv');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('pause');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('switch');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('drift');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('interaction');
      expect(DEFAULT_ATTENTION_WEIGHTS).toHaveProperty('focus_loss');
    });

    it('should have focus_loss as highest positive weight', () => {
      const positiveWeights = Object.entries(DEFAULT_ATTENTION_WEIGHTS)
        .filter(([key, value]) => value > 0 && key !== 'focus_loss')
        .map(([_, value]) => value);

      positiveWeights.forEach(weight => {
        expect(DEFAULT_ATTENTION_WEIGHTS.focus_loss).toBeGreaterThanOrEqual(weight);
      });
    });
  });

  describe('fatigue parameters', () => {
    it('should define all fatigue model parameters', () => {
      expect(DEFAULT_FATIGUE_PARAMS).toHaveProperty('beta');
      expect(DEFAULT_FATIGUE_PARAMS).toHaveProperty('gamma');
      expect(DEFAULT_FATIGUE_PARAMS).toHaveProperty('delta');
      expect(DEFAULT_FATIGUE_PARAMS).toHaveProperty('k');
      expect(DEFAULT_FATIGUE_PARAMS).toHaveProperty('longBreakThreshold');
    });

    it('should have reasonable parameter ranges', () => {
      expect(DEFAULT_FATIGUE_PARAMS.beta).toBeGreaterThan(0);
      expect(DEFAULT_FATIGUE_PARAMS.gamma).toBeGreaterThan(0);
      expect(DEFAULT_FATIGUE_PARAMS.k).toBeGreaterThan(0);
      expect(DEFAULT_FATIGUE_PARAMS.longBreakThreshold).toBeGreaterThan(0);
    });
  });

  describe('motivation parameters', () => {
    it('should define all motivation model parameters', () => {
      expect(DEFAULT_MOTIVATION_PARAMS).toHaveProperty('rho');
      expect(DEFAULT_MOTIVATION_PARAMS).toHaveProperty('kappa');
      expect(DEFAULT_MOTIVATION_PARAMS).toHaveProperty('lambda');
      expect(DEFAULT_MOTIVATION_PARAMS).toHaveProperty('mu');
    });

    it('should have rho in valid decay range', () => {
      expect(DEFAULT_MOTIVATION_PARAMS.rho).toBeGreaterThan(0);
      expect(DEFAULT_MOTIVATION_PARAMS.rho).toBeLessThan(1);
    });
  });

  describe('perception config', () => {
    it('should define RT statistics', () => {
      expect(DEFAULT_PERCEPTION_CONFIG.rt).toHaveProperty('mean');
      expect(DEFAULT_PERCEPTION_CONFIG.rt).toHaveProperty('std');
    });

    it('should define max limits', () => {
      expect(DEFAULT_PERCEPTION_CONFIG.maxResponseTime).toBeGreaterThan(0);
      expect(DEFAULT_PERCEPTION_CONFIG.maxPauseCount).toBeGreaterThan(0);
      expect(DEFAULT_PERCEPTION_CONFIG.maxSwitchCount).toBeGreaterThan(0);
      expect(DEFAULT_PERCEPTION_CONFIG.maxFocusLoss).toBeGreaterThan(0);
    });
  });

  // ==================== Reward Weights Tests ====================

  describe('reward weights', () => {
    it('should define all reward weight factors', () => {
      expect(REWARD_WEIGHTS).toHaveProperty('correct');
      expect(REWARD_WEIGHTS).toHaveProperty('fatigue');
      expect(REWARD_WEIGHTS).toHaveProperty('speed');
      expect(REWARD_WEIGHTS).toHaveProperty('frustration');
      expect(REWARD_WEIGHTS).toHaveProperty('engagement');
    });

    it('should have correct as highest weight', () => {
      expect(REWARD_WEIGHTS.correct).toBeGreaterThanOrEqual(REWARD_WEIGHTS.fatigue);
      expect(REWARD_WEIGHTS.correct).toBeGreaterThanOrEqual(REWARD_WEIGHTS.speed);
      expect(REWARD_WEIGHTS.correct).toBeGreaterThanOrEqual(REWARD_WEIGHTS.engagement);
    });
  });

  // ==================== Default Strategy Tests ====================

  describe('DEFAULT_STRATEGY', () => {
    it('should define all strategy parameters', () => {
      expect(DEFAULT_STRATEGY).toHaveProperty('interval_scale');
      expect(DEFAULT_STRATEGY).toHaveProperty('new_ratio');
      expect(DEFAULT_STRATEGY).toHaveProperty('difficulty');
      expect(DEFAULT_STRATEGY).toHaveProperty('batch_size');
      expect(DEFAULT_STRATEGY).toHaveProperty('hint_level');
    });

    it('should have balanced default values', () => {
      expect(DEFAULT_STRATEGY.interval_scale).toBe(1.0);
      expect(DEFAULT_STRATEGY.new_ratio).toBe(0.2);
      expect(DEFAULT_STRATEGY.difficulty).toBe('mid');
      expect(DEFAULT_STRATEGY.batch_size).toBe(8);
      expect(DEFAULT_STRATEGY.hint_level).toBe(1);
    });
  });

  describe('COLD_START_STRATEGY', () => {
    it('should define all strategy parameters', () => {
      expect(COLD_START_STRATEGY).toHaveProperty('interval_scale');
      expect(COLD_START_STRATEGY).toHaveProperty('new_ratio');
      expect(COLD_START_STRATEGY).toHaveProperty('difficulty');
      expect(COLD_START_STRATEGY).toHaveProperty('batch_size');
      expect(COLD_START_STRATEGY).toHaveProperty('hint_level');
    });

    it('should be more conservative than default', () => {
      expect(COLD_START_STRATEGY.difficulty).toBe('easy');
      expect(COLD_START_STRATEGY.new_ratio).toBeLessThanOrEqual(DEFAULT_STRATEGY.new_ratio);
    });
  });

  // ==================== Action Space Tests ====================

  describe('ACTION_SPACE', () => {
    it('should contain expected number of actions', () => {
      expect(ACTION_SPACE.length).toBe(24);
    });

    it('should have valid action structure for all actions', () => {
      ACTION_SPACE.forEach((action, index) => {
        expect(action).toHaveProperty('interval_scale');
        expect(action).toHaveProperty('new_ratio');
        expect(action).toHaveProperty('difficulty');
        expect(action).toHaveProperty('batch_size');
        expect(action).toHaveProperty('hint_level');

        // Validate ranges
        expect(action.interval_scale).toBeGreaterThan(0);
        expect(action.new_ratio).toBeGreaterThanOrEqual(0);
        expect(action.new_ratio).toBeLessThanOrEqual(1);
        expect(['easy', 'mid', 'hard']).toContain(action.difficulty);
        expect(action.batch_size).toBeGreaterThan(0);
        expect(action.hint_level).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include conservative actions for low attention', () => {
      const conservativeActions = ACTION_SPACE.filter(
        a => a.difficulty === 'easy' && a.batch_size <= 5
      );

      expect(conservativeActions.length).toBeGreaterThan(0);
    });

    it('should include challenging actions for high performers', () => {
      const challengingActions = ACTION_SPACE.filter(
        a => a.difficulty === 'hard' && a.batch_size >= 12
      );

      expect(challengingActions.length).toBeGreaterThan(0);
    });

    it('should have diverse interval scales', () => {
      const scales = new Set(ACTION_SPACE.map(a => a.interval_scale));

      expect(scales.size).toBeGreaterThan(3);
    });

    it('should have diverse batch sizes', () => {
      const batchSizes = new Set(ACTION_SPACE.map(a => a.batch_size));

      expect(batchSizes.size).toBeGreaterThan(3);
    });

    it('should have all difficulty levels', () => {
      const difficulties = new Set(ACTION_SPACE.map(a => a.difficulty));

      expect(difficulties.has('easy')).toBe(true);
      expect(difficulties.has('mid')).toBe(true);
      expect(difficulties.has('hard')).toBe(true);
    });
  });

  // ==================== getActionIndex Tests ====================

  describe('getActionIndex', () => {
    it('should return correct index for existing action', () => {
      const action = ACTION_SPACE[5];
      const index = getActionIndex(action);

      expect(index).toBe(5);
    });

    it('should return -1 for non-existing action', () => {
      const nonExistingAction = {
        interval_scale: 99,
        new_ratio: 99,
        difficulty: 'easy' as const,
        batch_size: 99,
        hint_level: 99
      };

      const index = getActionIndex(nonExistingAction);

      expect(index).toBe(-1);
    });

    it('should match exact action properties', () => {
      const action = { ...ACTION_SPACE[0] };

      // Exact match should work
      expect(getActionIndex(action)).toBe(0);

      // Modified action should not match
      action.batch_size = 999;
      expect(getActionIndex(action)).toBe(-1);
    });

    it('should work for all actions in space', () => {
      ACTION_SPACE.forEach((action, expectedIndex) => {
        const foundIndex = getActionIndex(action);
        expect(foundIndex).toBe(expectedIndex);
      });
    });
  });

  // ==================== getPriorAlpha Tests ====================

  describe('getPriorAlpha', () => {
    it('should return lower alpha for classify phase', () => {
      const alpha = getPriorAlpha('classify', true);

      expect(alpha).toBe(0.5);
    });

    it('should return higher alpha for explore phase with good performance', () => {
      const alpha = getPriorAlpha('explore', true);

      expect(alpha).toBe(2.0);
    });

    it('should return lower alpha for explore phase with poor performance', () => {
      const alpha = getPriorAlpha('explore', false);

      expect(alpha).toBe(1.0);
    });

    it('should return moderate alpha for normal phase', () => {
      const alpha = getPriorAlpha('normal', true);

      expect(alpha).toBe(0.7);
    });

    it('should return default for unknown phase', () => {
      // @ts-ignore - Testing unknown phase
      const alpha = getPriorAlpha('unknown', true);

      expect(alpha).toBe(DEFAULT_ALPHA);
    });

    it('should encourage more exploration in explore phase with good performance', () => {
      const exploreGood = getPriorAlpha('explore', true);
      const explorePoor = getPriorAlpha('explore', false);

      expect(exploreGood).toBeGreaterThan(explorePoor);
    });
  });

  // ==================== Action Space Coverage Tests ====================

  describe('action space coverage', () => {
    it('should cover low to high interval scales', () => {
      const minScale = Math.min(...ACTION_SPACE.map(a => a.interval_scale));
      const maxScale = Math.max(...ACTION_SPACE.map(a => a.interval_scale));

      expect(minScale).toBeLessThanOrEqual(0.5);
      expect(maxScale).toBeGreaterThanOrEqual(1.5);
    });

    it('should cover conservative to aggressive new ratios', () => {
      const minRatio = Math.min(...ACTION_SPACE.map(a => a.new_ratio));
      const maxRatio = Math.max(...ACTION_SPACE.map(a => a.new_ratio));

      expect(minRatio).toBeLessThanOrEqual(0.1);
      expect(maxRatio).toBeGreaterThanOrEqual(0.4);
    });

    it('should include actions with hints enabled and disabled', () => {
      const withHints = ACTION_SPACE.filter(a => a.hint_level > 0);
      const withoutHints = ACTION_SPACE.filter(a => a.hint_level === 0);

      expect(withHints.length).toBeGreaterThan(0);
      expect(withoutHints.length).toBeGreaterThan(0);
    });
  });
});
