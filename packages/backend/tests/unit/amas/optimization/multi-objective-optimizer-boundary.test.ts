/**
 * MultiObjectiveOptimizer Boundary Condition Tests
 *
 * Tests for extreme inputs, edge cases, and error recovery
 * Target: 90%+ coverage for AMAS core algorithms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MultiObjectiveOptimizer } from '../../../../src/amas/optimization/multi-objective-optimizer';
import {
  LearningObjectives,
  LearningObjectiveMode,
  MultiObjectiveMetrics,
  UserState,
} from '../../../../src/amas/types';

describe('MultiObjectiveOptimizer - Boundary Conditions', () => {
  // ==================== Extreme Input Values Tests ====================

  describe('extreme input values', () => {
    describe('calculateShortTermScore', () => {
      it('should handle zero accuracy', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(0, 2000, state);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle perfect accuracy (1.0)', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(1.0, 2000, state);

        expect(score).toBeGreaterThan(0.5);
        expect(score).toBeLessThanOrEqual(1);
      });

      it('should handle accuracy > 1.0', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(1.5, 2000, state);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle negative accuracy', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(-0.5, 2000, state);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle zero response time', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, 0, state);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle very large response time', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, 100000, state);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle negative response time', () => {
        const state: UserState = { A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, -1000, state);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle extreme attention values', () => {
        const highAttention: UserState = { A: 100, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 } };
        const negativeAttention: UserState = {
          A: -0.5,
          F: 0.2,
          M: 0.5,
          C: { mem: 0.7, speed: 0.6 },
        };

        const score1 = MultiObjectiveOptimizer.calculateShortTermScore(0.8, 2000, highAttention);
        const score2 = MultiObjectiveOptimizer.calculateShortTermScore(
          0.8,
          2000,
          negativeAttention,
        );

        expect(Number.isFinite(score1)).toBe(true);
        expect(Number.isFinite(score2)).toBe(true);
      });
    });

    describe('calculateLongTermScore', () => {
      it('should handle all zero inputs', () => {
        const score = MultiObjectiveOptimizer.calculateLongTermScore(0, 0, 0);

        expect(score).toBe(0);
      });

      it('should handle all maximum inputs', () => {
        const score = MultiObjectiveOptimizer.calculateLongTermScore(1, 1, 1);

        expect(score).toBeLessThanOrEqual(1);
      });

      it('should handle values > 1', () => {
        const score = MultiObjectiveOptimizer.calculateLongTermScore(2, 2, 2);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle negative values', () => {
        const score = MultiObjectiveOptimizer.calculateLongTermScore(-0.5, -0.3, -0.2);

        expect(Number.isFinite(score)).toBe(true);
      });
    });

    describe('calculateEfficiencyScore', () => {
      it('should handle zero WPM', () => {
        const score = MultiObjectiveOptimizer.calculateEfficiencyScore(0, 0.7, 0.7);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle very high WPM', () => {
        const score = MultiObjectiveOptimizer.calculateEfficiencyScore(1000, 0.7, 0.7);

        expect(score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle zero cognitive load', () => {
        const score = MultiObjectiveOptimizer.calculateEfficiencyScore(5, 0.7, 0);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle cognitive load = 1', () => {
        const score = MultiObjectiveOptimizer.calculateEfficiencyScore(5, 0.7, 1);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle cognitive load > 1', () => {
        const score = MultiObjectiveOptimizer.calculateEfficiencyScore(5, 0.7, 2);

        expect(Number.isFinite(score)).toBe(true);
      });

      it('should handle negative WPM', () => {
        const score = MultiObjectiveOptimizer.calculateEfficiencyScore(-5, 0.7, 0.7);

        expect(Number.isFinite(score)).toBe(true);
      });
    });
  });

  // ==================== Edge Cases in Aggregation ====================

  describe('aggregation edge cases', () => {
    const createObjectives = (
      weightShort: number,
      weightLong: number,
      weightEff: number,
    ): LearningObjectives => ({
      mode: 'custom',
      primaryObjective: 'accuracy',
      weightShortTerm: weightShort,
      weightLongTerm: weightLong,
      weightEfficiency: weightEff,
    });

    it('should handle all scores at 0', () => {
      const metrics = {
        shortTermScore: 0,
        longTermScore: 0,
        efficiencyScore: 0,
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(0.4, 0.4, 0.2),
      );

      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(score)).toBe(true);
    });

    it('should handle one score at 0 and others at 1', () => {
      const metrics = {
        shortTermScore: 1,
        longTermScore: 1,
        efficiencyScore: 0,
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(0.4, 0.4, 0.2),
      );

      // Tchebycheff method: 1 - max(weighted deviations)
      expect(score).toBeLessThan(1);
    });

    it('should handle very small weights', () => {
      const metrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6,
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(1e-10, 1e-10, 1e-10),
      );

      expect(Number.isFinite(score)).toBe(true);
    });

    it('should handle one weight being 1 and others 0', () => {
      const metrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6,
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(metrics, createObjectives(1, 0, 0));

      // Should focus only on short-term score
      expect(score).toBeCloseTo(0.8, 1);
    });

    it('should handle negative scores', () => {
      const metrics = {
        shortTermScore: -0.5,
        longTermScore: -0.3,
        efficiencyScore: -0.2,
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(0.4, 0.4, 0.2),
      );

      expect(Number.isFinite(score)).toBe(true);
    });
  });

  // ==================== Constraint Checking Edge Cases ====================

  describe('constraint checking edge cases', () => {
    const createMetrics = (short: number, long: number, eff: number): MultiObjectiveMetrics => ({
      shortTermScore: short,
      longTermScore: long,
      efficiencyScore: eff,
      aggregatedScore: 0.7,
      ts: Date.now(),
    });

    it('should handle exactly at constraint boundary', () => {
      const objectives: LearningObjectives = {
        mode: 'exam',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.6,
        weightLongTerm: 0.3,
        weightEfficiency: 0.1,
        minAccuracy: 0.8,
      };

      // Exactly at boundary
      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.8, 0.8, 0.7),
        objectives,
        30 * 60 * 1000,
      );

      // Should not be a violation (>= 0.8)
      expect(result.violations.some((v) => v.constraint === 'minAccuracy')).toBe(false);
    });

    it('should handle zero session time', () => {
      const objectives: LearningObjectives = {
        mode: 'travel',
        primaryObjective: 'efficiency',
        weightShortTerm: 0.2,
        weightLongTerm: 0.3,
        weightEfficiency: 0.5,
        maxDailyTime: 60,
      };

      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.8, 0.8, 0.7),
        objectives,
        0,
      );

      expect(result.satisfied).toBe(true);
    });

    it('should handle negative session time', () => {
      const objectives: LearningObjectives = {
        mode: 'travel',
        primaryObjective: 'efficiency',
        weightShortTerm: 0.2,
        weightLongTerm: 0.3,
        weightEfficiency: 0.5,
        maxDailyTime: 60,
      };

      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.8, 0.8, 0.7),
        objectives,
        -1000,
      );

      expect(result.satisfied).toBe(true);
    });

    it('should handle undefined constraints', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2,
        // No constraints defined
      };

      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.3, 0.3, 0.3),
        objectives,
        120 * 60 * 1000,
      );

      expect(result.satisfied).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should report all violations when multiple constraints fail', () => {
      const objectives: LearningObjectives = {
        mode: 'exam',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.6,
        weightLongTerm: 0.3,
        weightEfficiency: 0.1,
        minAccuracy: 0.9,
        maxDailyTime: 30,
        targetRetention: 0.9,
      };

      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.3, 0.3, 0.3),
        objectives,
        60 * 60 * 1000,
      );

      expect(result.satisfied).toBe(false);
      expect(result.violations.length).toBe(3);
    });
  });

  // ==================== Weight Validation Edge Cases ====================

  describe('weight validation edge cases', () => {
    it('should handle weights summing to exactly 1', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.333333,
        weightLongTerm: 0.333333,
        weightEfficiency: 0.333334,
      };

      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(true);
    });

    it('should handle weights summing to 0', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0,
        weightLongTerm: 0,
        weightEfficiency: 0,
      };

      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(false);
    });

    it('should handle negative weights', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: -0.5,
        weightLongTerm: 0.8,
        weightEfficiency: 0.7,
      };

      // Sum is 1.0 but has negative weight
      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(true); // Only checks sum
    });

    it('should handle very small weights that sum close to 1', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.333333333,
        weightLongTerm: 0.333333333,
        weightEfficiency: 0.333333334,
      };

      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(true);
    });
  });

  // ==================== Weight Normalization Edge Cases ====================

  describe('weight normalization edge cases', () => {
    it('should handle all zero weights by returning equal distribution', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0,
        weightLongTerm: 0,
        weightEfficiency: 0,
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

      expect(normalized.weightShortTerm).toBeCloseTo(1 / 3, 5);
      expect(normalized.weightLongTerm).toBeCloseTo(1 / 3, 5);
      expect(normalized.weightEfficiency).toBeCloseTo(1 / 3, 5);
    });

    it('should handle negative weights in normalization', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: -0.2,
        weightLongTerm: 0.8,
        weightEfficiency: 0.6,
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);
      const sum =
        normalized.weightShortTerm + normalized.weightLongTerm + normalized.weightEfficiency;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should handle very large weights', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 1000,
        weightLongTerm: 2000,
        weightEfficiency: 1000,
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);
      const sum =
        normalized.weightShortTerm + normalized.weightLongTerm + normalized.weightEfficiency;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should preserve relative proportions after normalization', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 2,
        weightLongTerm: 4,
        weightEfficiency: 2,
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

      // LongTerm should be twice ShortTerm
      expect(normalized.weightLongTerm / normalized.weightShortTerm).toBeCloseTo(2, 2);
    });
  });

  // ==================== Strategy Evaluation Edge Cases ====================

  describe('strategy evaluation edge cases', () => {
    it('should handle all metrics at 0', () => {
      const objectives: LearningObjectives = {
        mode: 'daily',
        primaryObjective: 'retention',
        weightShortTerm: 0.3,
        weightLongTerm: 0.5,
        weightEfficiency: 0.2,
      };

      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0, longTermScore: 0, efficiencyScore: 0 },
        objectives,
        30 * 60 * 1000,
      );

      expect(evaluation.metrics.aggregatedScore).toBeDefined();
      expect(evaluation.suggestedAdjustments).toBeDefined();
    });

    it('should handle all metrics at 1', () => {
      const objectives: LearningObjectives = {
        mode: 'daily',
        primaryObjective: 'retention',
        weightShortTerm: 0.3,
        weightLongTerm: 0.5,
        weightEfficiency: 0.2,
      };

      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 1, longTermScore: 1, efficiencyScore: 1 },
        objectives,
        30 * 60 * 1000,
      );

      expect(evaluation.metrics.aggregatedScore).toBeCloseTo(1, 2);
      expect(evaluation.suggestedAdjustments).toBeUndefined();
    });

    it('should suggest adjustments for borderline poor performance', () => {
      const objectives: LearningObjectives = {
        mode: 'daily',
        primaryObjective: 'retention',
        weightShortTerm: 0.3,
        weightLongTerm: 0.5,
        weightEfficiency: 0.2,
      };

      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.59, longTermScore: 0.59, efficiencyScore: 0.59 },
        objectives,
        30 * 60 * 1000,
      );

      expect(evaluation.suggestedAdjustments).toBeDefined();
    });

    it('should include timestamp in metrics', () => {
      const objectives: LearningObjectives = {
        mode: 'daily',
        primaryObjective: 'retention',
        weightShortTerm: 0.3,
        weightLongTerm: 0.5,
        weightEfficiency: 0.2,
      };

      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.8, longTermScore: 0.7, efficiencyScore: 0.6 },
        objectives,
        30 * 60 * 1000,
      );

      expect(evaluation.metrics.ts).toBeGreaterThan(0);
    });
  });

  // ==================== Preset Mode Tests ====================

  describe('preset mode edge cases', () => {
    it('should return valid config for all preset modes', () => {
      const modes: LearningObjectiveMode[] = ['exam', 'daily', 'travel', 'custom'];

      for (const mode of modes) {
        const config = MultiObjectiveOptimizer.getPresetMode(mode);

        expect(config.mode).toBe(mode);
        expect(config.weightShortTerm).toBeDefined();
        expect(config.weightLongTerm).toBeDefined();
        expect(config.weightEfficiency).toBeDefined();

        const sum =
          (config.weightShortTerm || 0) +
          (config.weightLongTerm || 0) +
          (config.weightEfficiency || 0);
        expect(sum).toBeCloseTo(1.0, 2);
      }
    });

    it('should have different primary objectives for different modes', () => {
      const examConfig = MultiObjectiveOptimizer.getPresetMode('exam');
      const dailyConfig = MultiObjectiveOptimizer.getPresetMode('daily');
      const travelConfig = MultiObjectiveOptimizer.getPresetMode('travel');

      expect(examConfig.primaryObjective).toBe('accuracy');
      expect(dailyConfig.primaryObjective).toBe('retention');
      expect(travelConfig.primaryObjective).toBe('efficiency');
    });
  });
});
