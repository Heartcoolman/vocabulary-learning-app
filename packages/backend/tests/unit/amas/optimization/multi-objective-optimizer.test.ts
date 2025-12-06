/**
 * MultiObjectiveOptimizer Unit Tests
 *
 * Tests for the weighted Tchebycheff multi-objective optimization module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MultiObjectiveOptimizer } from '../../../../src/amas/optimization/multi-objective-optimizer';
import {
  LearningObjectives,
  LearningObjectiveMode,
  MultiObjectiveMetrics,
  UserState
} from '../../../../src/amas/types';

describe('MultiObjectiveOptimizer', () => {
  // ==================== Preset Mode Tests ====================

  describe('getPresetMode', () => {
    it('should return exam mode configuration', () => {
      const config = MultiObjectiveOptimizer.getPresetMode('exam');

      expect(config.mode).toBe('exam');
      expect(config.primaryObjective).toBe('accuracy');
      expect(config.weightShortTerm).toBeGreaterThan(config.weightLongTerm!);
    });

    it('should return daily mode configuration', () => {
      const config = MultiObjectiveOptimizer.getPresetMode('daily');

      expect(config.mode).toBe('daily');
      expect(config.primaryObjective).toBe('retention');
      expect(config.weightLongTerm).toBeGreaterThan(config.weightShortTerm!);
    });

    it('should return travel mode configuration', () => {
      const config = MultiObjectiveOptimizer.getPresetMode('travel');

      expect(config.mode).toBe('travel');
      expect(config.primaryObjective).toBe('efficiency');
      expect(config.weightEfficiency).toBeGreaterThan(config.weightShortTerm!);
    });

    it('should return custom mode configuration', () => {
      const config = MultiObjectiveOptimizer.getPresetMode('custom');

      expect(config.mode).toBe('custom');
      expect(config.weightShortTerm).toBeCloseTo(0.4);
      expect(config.weightLongTerm).toBeCloseTo(0.4);
    });

    const modes: LearningObjectiveMode[] = ['exam', 'daily', 'travel', 'custom'];

    modes.forEach(mode => {
      it(`should have valid weights for ${mode} mode`, () => {
        const config = MultiObjectiveOptimizer.getPresetMode(mode);

        const total =
          (config.weightShortTerm || 0) +
          (config.weightLongTerm || 0) +
          (config.weightEfficiency || 0);

        expect(total).toBeCloseTo(1.0, 1);
      });
    });
  });

  // ==================== Short-Term Score Tests ====================

  describe('calculateShortTermScore', () => {
    const defaultUserState: UserState = {
      A: 0.8,
      F: 0.2,
      M: 0.5,
      C: { mem: 0.7, speed: 0.6 }
    };

    it('should return score based on accuracy and response time', () => {
      const score = MultiObjectiveOptimizer.calculateShortTermScore(
        0.9, // High accuracy
        2000, // Fast response
        defaultUserState
      );

      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should give higher score for faster response', () => {
      const fastScore = MultiObjectiveOptimizer.calculateShortTermScore(
        0.8,
        1000,
        defaultUserState
      );

      const slowScore = MultiObjectiveOptimizer.calculateShortTermScore(
        0.8,
        8000,
        defaultUserState
      );

      expect(fastScore).toBeGreaterThan(slowScore);
    });

    it('should give higher score for higher accuracy', () => {
      const highAccScore = MultiObjectiveOptimizer.calculateShortTermScore(
        0.95,
        3000,
        defaultUserState
      );

      const lowAccScore = MultiObjectiveOptimizer.calculateShortTermScore(
        0.5,
        3000,
        defaultUserState
      );

      expect(highAccScore).toBeGreaterThan(lowAccScore);
    });

    it('should include attention bonus', () => {
      const highAttentionState: UserState = {
        A: 0.95,
        F: 0.2,
        M: 0.5,
        C: { mem: 0.7, speed: 0.6 }
      };

      const lowAttentionState: UserState = {
        A: 0.3,
        F: 0.2,
        M: 0.5,
        C: { mem: 0.7, speed: 0.6 }
      };

      const highAttScore = MultiObjectiveOptimizer.calculateShortTermScore(
        0.8,
        3000,
        highAttentionState
      );

      const lowAttScore = MultiObjectiveOptimizer.calculateShortTermScore(
        0.8,
        3000,
        lowAttentionState
      );

      expect(highAttScore).toBeGreaterThan(lowAttScore);
    });

    it('should cap score at 1.0', () => {
      const score = MultiObjectiveOptimizer.calculateShortTermScore(
        1.0,
        100,
        { A: 1.0, F: 0, M: 1.0, C: { mem: 1.0, speed: 1.0 } }
      );

      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  // ==================== Long-Term Score Tests ====================

  describe('calculateLongTermScore', () => {
    it('should calculate score based on retention, review success, and stability', () => {
      const score = MultiObjectiveOptimizer.calculateLongTermScore(
        0.85, // Retention rate
        0.9,  // Review success rate
        0.8   // Memory stability
      );

      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should weight retention most heavily', () => {
      const highRetentionScore = MultiObjectiveOptimizer.calculateLongTermScore(
        0.95,
        0.5,
        0.5
      );

      const lowRetentionScore = MultiObjectiveOptimizer.calculateLongTermScore(
        0.3,
        0.9,
        0.9
      );

      expect(highRetentionScore).toBeGreaterThan(lowRetentionScore);
    });

    it('should cap score at 1.0', () => {
      const score = MultiObjectiveOptimizer.calculateLongTermScore(
        1.0,
        1.0,
        1.0
      );

      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should handle zero values', () => {
      const score = MultiObjectiveOptimizer.calculateLongTermScore(
        0,
        0,
        0
      );

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== Efficiency Score Tests ====================

  describe('calculateEfficiencyScore', () => {
    it('should calculate score based on WPM, time utilization, and cognitive load', () => {
      const score = MultiObjectiveOptimizer.calculateEfficiencyScore(
        5,    // Words per minute
        0.8,  // Time utilization
        0.7   // Optimal cognitive load
      );

      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should give higher score for higher WPM', () => {
      const highWPMScore = MultiObjectiveOptimizer.calculateEfficiencyScore(
        10,
        0.7,
        0.7
      );

      const lowWPMScore = MultiObjectiveOptimizer.calculateEfficiencyScore(
        2,
        0.7,
        0.7
      );

      expect(highWPMScore).toBeGreaterThan(lowWPMScore);
    });

    it('should prefer optimal cognitive load around 0.7', () => {
      const optimalLoadScore = MultiObjectiveOptimizer.calculateEfficiencyScore(
        5,
        0.7,
        0.7 // Optimal
      );

      const highLoadScore = MultiObjectiveOptimizer.calculateEfficiencyScore(
        5,
        0.7,
        0.95 // Too high
      );

      const lowLoadScore = MultiObjectiveOptimizer.calculateEfficiencyScore(
        5,
        0.7,
        0.3 // Too low
      );

      expect(optimalLoadScore).toBeGreaterThan(highLoadScore);
      expect(optimalLoadScore).toBeGreaterThan(lowLoadScore);
    });

    it('should cap score at 1.0', () => {
      const score = MultiObjectiveOptimizer.calculateEfficiencyScore(
        15,
        1.0,
        0.7
      );

      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  // ==================== Aggregate Objectives Tests ====================

  describe('aggregateObjectives', () => {
    const createObjectives = (
      weightShort: number,
      weightLong: number,
      weightEff: number
    ): LearningObjectives => ({
      mode: 'custom',
      primaryObjective: 'accuracy',
      weightShortTerm: weightShort,
      weightLongTerm: weightLong,
      weightEfficiency: weightEff
    });

    it('should aggregate using Tchebycheff method', () => {
      const metrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(0.4, 0.4, 0.2)
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should return 1.0 for perfect scores', () => {
      const perfectMetrics = {
        shortTermScore: 1.0,
        longTermScore: 1.0,
        efficiencyScore: 1.0
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(
        perfectMetrics,
        createObjectives(0.4, 0.4, 0.2)
      );

      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should return lower score when one objective is poor', () => {
      const balancedMetrics = {
        shortTermScore: 0.8,
        longTermScore: 0.8,
        efficiencyScore: 0.8
      };

      const unbalancedMetrics = {
        shortTermScore: 0.9,
        longTermScore: 0.9,
        efficiencyScore: 0.3
      };

      const balancedScore = MultiObjectiveOptimizer.aggregateObjectives(
        balancedMetrics,
        createObjectives(0.33, 0.33, 0.34)
      );

      const unbalancedScore = MultiObjectiveOptimizer.aggregateObjectives(
        unbalancedMetrics,
        createObjectives(0.33, 0.33, 0.34)
      );

      expect(balancedScore).toBeGreaterThan(unbalancedScore);
    });

    it('should respect weight priorities', () => {
      const metrics = {
        shortTermScore: 0.9,
        longTermScore: 0.5,
        efficiencyScore: 0.7
      };

      // Short-term focused
      const shortFocusScore = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(0.8, 0.1, 0.1)
      );

      // Long-term focused
      const longFocusScore = MultiObjectiveOptimizer.aggregateObjectives(
        metrics,
        createObjectives(0.1, 0.8, 0.1)
      );

      expect(shortFocusScore).toBeGreaterThan(longFocusScore);
    });
  });

  // ==================== Check Constraints Tests ====================

  describe('checkConstraints', () => {
    const defaultObjectives: LearningObjectives = {
      mode: 'exam',
      primaryObjective: 'accuracy',
      weightShortTerm: 0.6,
      weightLongTerm: 0.3,
      weightEfficiency: 0.1,
      minAccuracy: 0.8,
      maxDailyTime: 60,
      targetRetention: 0.75
    };

    const createMetrics = (short: number, long: number, eff: number): MultiObjectiveMetrics => ({
      shortTermScore: short,
      longTermScore: long,
      efficiencyScore: eff,
      aggregatedScore: 0.7,
      ts: Date.now()
    });

    it('should return satisfied when all constraints met', () => {
      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.85, 0.8, 0.7),
        defaultObjectives,
        30 * 60 * 1000 // 30 minutes
      );

      expect(result.satisfied).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should detect minAccuracy violation', () => {
      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.6, 0.8, 0.7), // Low short-term score
        defaultObjectives,
        30 * 60 * 1000
      );

      expect(result.satisfied).toBe(false);
      expect(result.violations.some(v => v.constraint === 'minAccuracy')).toBe(true);
    });

    it('should detect maxDailyTime violation', () => {
      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.85, 0.8, 0.7),
        defaultObjectives,
        90 * 60 * 1000 // 90 minutes - exceeds 60 minute limit
      );

      expect(result.satisfied).toBe(false);
      expect(result.violations.some(v => v.constraint === 'maxDailyTime')).toBe(true);
    });

    it('should detect targetRetention violation', () => {
      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.85, 0.5, 0.7), // Low long-term score
        defaultObjectives,
        30 * 60 * 1000
      );

      expect(result.satisfied).toBe(false);
      expect(result.violations.some(v => v.constraint === 'targetRetention')).toBe(true);
    });

    it('should report multiple violations', () => {
      const result = MultiObjectiveOptimizer.checkConstraints(
        createMetrics(0.5, 0.5, 0.5), // All low
        defaultObjectives,
        90 * 60 * 1000 // Also exceeds time
      );

      expect(result.satisfied).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });

  // ==================== Evaluate Strategy Tests ====================

  describe('evaluateStrategy', () => {
    const objectives: LearningObjectives = {
      mode: 'daily',
      primaryObjective: 'retention',
      weightShortTerm: 0.3,
      weightLongTerm: 0.5,
      weightEfficiency: 0.2
    };

    it('should return complete evaluation', () => {
      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.8, longTermScore: 0.7, efficiencyScore: 0.6 },
        objectives,
        30 * 60 * 1000
      );

      expect(evaluation).toHaveProperty('metrics');
      expect(evaluation).toHaveProperty('constraintsSatisfied');
      expect(evaluation).toHaveProperty('constraintViolations');
      expect(evaluation).toHaveProperty('suggestedAdjustments');
    });

    it('should include aggregated score in metrics', () => {
      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.8, longTermScore: 0.7, efficiencyScore: 0.6 },
        objectives,
        30 * 60 * 1000
      );

      expect(evaluation.metrics.aggregatedScore).toBeGreaterThan(0);
      expect(evaluation.metrics.ts).toBeGreaterThan(0);
    });

    it('should suggest no adjustments for good performance', () => {
      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.9, longTermScore: 0.9, efficiencyScore: 0.9 },
        objectives,
        30 * 60 * 1000
      );

      expect(evaluation.suggestedAdjustments).toBeUndefined();
    });

    it('should suggest adjustments for poor performance', () => {
      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.4, longTermScore: 0.4, efficiencyScore: 0.4 },
        objectives,
        30 * 60 * 1000
      );

      expect(evaluation.suggestedAdjustments).toBeDefined();
    });

    it('should suggest easier difficulty for low short-term score', () => {
      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.4, longTermScore: 0.6, efficiencyScore: 0.5 },
        objectives,
        30 * 60 * 1000
      );

      // shortTermScore < 0.6 should trigger difficulty adjustment
      expect(evaluation.suggestedAdjustments).toBeDefined();
      expect(evaluation.suggestedAdjustments?.difficulty).toBe('easy');
    });

    it('should suggest interval adjustment for low long-term score', () => {
      const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
        { shortTermScore: 0.8, longTermScore: 0.4, efficiencyScore: 0.7 },
        objectives,
        30 * 60 * 1000
      );

      expect(evaluation.suggestedAdjustments?.interval_scale).toBe(0.8);
    });
  });

  // ==================== Weight Validation Tests ====================

  describe('validateWeights', () => {
    it('should return true for valid weights summing to 1', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      };

      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(true);
    });

    it('should return false for weights not summing to 1', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.5,
        weightLongTerm: 0.5,
        weightEfficiency: 0.5
      };

      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(false);
    });

    it('should allow small tolerance', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.333,
        weightLongTerm: 0.333,
        weightEfficiency: 0.334
      };

      expect(MultiObjectiveOptimizer.validateWeights(objectives)).toBe(true);
    });
  });

  // ==================== Weight Normalization Tests ====================

  describe('normalizeWeights', () => {
    it('should return same weights if already normalized', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

      expect(normalized.weightShortTerm).toBeCloseTo(0.4);
      expect(normalized.weightLongTerm).toBeCloseTo(0.4);
      expect(normalized.weightEfficiency).toBeCloseTo(0.2);
    });

    it('should normalize weights that sum to more than 1', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.6,
        weightLongTerm: 0.6,
        weightEfficiency: 0.6
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);
      const sum =
        normalized.weightShortTerm +
        normalized.weightLongTerm +
        normalized.weightEfficiency;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should normalize weights that sum to less than 1', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.2,
        weightLongTerm: 0.2,
        weightEfficiency: 0.2
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);
      const sum =
        normalized.weightShortTerm +
        normalized.weightLongTerm +
        normalized.weightEfficiency;

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should handle zero weights by using equal distribution', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0,
        weightLongTerm: 0,
        weightEfficiency: 0
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

      expect(normalized.weightShortTerm).toBeCloseTo(1 / 3, 5);
      expect(normalized.weightLongTerm).toBeCloseTo(1 / 3, 5);
      expect(normalized.weightEfficiency).toBeCloseTo(1 / 3, 5);
    });

    it('should preserve relative weight proportions', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.2,
        weightEfficiency: 0.2
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

      // Short term should be twice the other two
      expect(normalized.weightShortTerm / normalized.weightLongTerm).toBeCloseTo(2, 1);
    });
  });
});
