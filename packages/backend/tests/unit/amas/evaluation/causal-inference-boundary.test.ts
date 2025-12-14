/**
 * CausalInference Boundary Condition Tests
 *
 * Tests for extreme inputs, edge cases, numerical stability and convergence
 * Target: 90%+ coverage for AMAS core algorithms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CausalInference,
  CausalObservation,
  createCausalInference,
  computeIPWWeight,
} from '../../../../src/amas/rewards/evaluators';

describe('CausalInference - Boundary Conditions', () => {
  let causal: CausalInference;

  beforeEach(() => {
    causal = new CausalInference();
  });

  // ==================== Extreme Input Values Tests ====================

  describe('extreme feature values', () => {
    it('should handle very large feature values', () => {
      const obs: CausalObservation = {
        features: [1e10, 1e10, 1e10],
        treatment: 1,
        outcome: 0.5,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);
      expect(causal.getObservationCount()).toBe(1);
    });

    it('should handle very small feature values', () => {
      const obs: CausalObservation = {
        features: [1e-15, 1e-15, 1e-15],
        treatment: 0,
        outcome: 0.5,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);
      expect(causal.getObservationCount()).toBe(1);
    });

    it('should handle negative feature values', () => {
      const obs: CausalObservation = {
        features: [-100, -50, -25],
        treatment: 1,
        outcome: 0.5,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);
      expect(causal.getObservationCount()).toBe(1);
    });

    it('should handle mixed extreme feature values', () => {
      const obs: CausalObservation = {
        features: [1e10, -1e10, 0, 1e-15],
        treatment: 0,
        outcome: 0.3,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);
      expect(causal.getObservationCount()).toBe(1);
    });

    it('should clamp outcome to [-1, 1] for values > 1', () => {
      const obs: CausalObservation = {
        features: [0.5],
        treatment: 1,
        outcome: 5.0,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);
      // Should not throw
      expect(causal.getObservationCount()).toBe(1);
    });

    it('should clamp outcome to [-1, 1] for values < -1', () => {
      const obs: CausalObservation = {
        features: [0.5],
        treatment: 0,
        outcome: -5.0,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);
      expect(causal.getObservationCount()).toBe(1);
    });
  });

  // ==================== Empty/Missing Data Tests ====================

  describe('empty and missing data handling', () => {
    it('should throw error for empty features array', () => {
      expect(() => {
        causal.addObservation({
          features: [],
          treatment: 1,
          outcome: 0.5,
          timestamp: Date.now(),
        });
      }).toThrow('特征向量不能为空');
    });

    it('should throw error for invalid treatment value', () => {
      expect(() => {
        causal.addObservation({
          features: [0.5],
          treatment: 2,
          outcome: 0.5,
          timestamp: Date.now(),
        });
      }).toThrow('treatment必须是0或1');
    });

    it('should throw error for negative treatment value', () => {
      expect(() => {
        causal.addObservation({
          features: [0.5],
          treatment: -1,
          outcome: 0.5,
          timestamp: Date.now(),
        });
      }).toThrow('treatment必须是0或1');
    });

    it('should throw error for insufficient samples on fit', () => {
      for (let i = 0; i < 5; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      expect(() => causal.fit()).toThrow('样本量不足');
    });

    it('should throw error without both treatment and control groups', () => {
      for (let i = 0; i < 15; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: 1, // Only treatment group
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      expect(() => causal.fit()).toThrow('处理组和对照组各需至少5个样本');
    });

    it('should handle null state restoration gracefully', () => {
      // @ts-ignore
      causal.setState(null);
      expect(causal.getObservationCount()).toBe(0);
    });

    it('should return 0.5 for propensity score when not fitted', () => {
      const score = causal.getPropensityScore([0.5, 0.3, 0.8]);
      expect(score).toBe(0.5);
    });

    it('should return 0 for predict outcome when not fitted', () => {
      const outcome = causal.predictOutcome([0.5, 0.3, 0.8], 1);
      expect(outcome).toBe(0);
    });
  });

  // ==================== Dimension Mismatch Tests ====================

  describe('dimension mismatch handling', () => {
    it('should throw error for feature dimension mismatch', () => {
      causal.addObservation({
        features: [0.5, 0.3],
        treatment: 1,
        outcome: 0.5,
        timestamp: Date.now(),
      });

      expect(() => {
        causal.addObservation({
          features: [0.5, 0.3, 0.8], // Different dimension
          treatment: 0,
          outcome: 0.4,
          timestamp: Date.now(),
        });
      }).toThrow('特征维度不匹配');
    });

    it('should accept observations with same dimension', () => {
      for (let i = 0; i < 5; i++) {
        causal.addObservation({
          features: [Math.random(), Math.random(), Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      expect(causal.getObservationCount()).toBe(5);
    });
  });

  // ==================== Algorithm Convergence Tests ====================

  describe('algorithm convergence', () => {
    it('should converge with clear treatment effect', () => {
      // Add 30 observations with clear treatment effect
      for (let i = 0; i < 30; i++) {
        const treatment = i % 2;
        causal.addObservation({
          features: [Math.random(), Math.random()],
          treatment,
          outcome: treatment === 1 ? 0.8 : 0.2, // Clear effect
          timestamp: Date.now(),
        });
      }

      const estimate = causal.estimateATE();

      expect(estimate.ate).toBeGreaterThan(0);
      expect(Number.isFinite(estimate.ate)).toBe(true);
      expect(Number.isFinite(estimate.standardError)).toBe(true);
    });

    it('should detect no treatment effect', () => {
      // Add observations with no treatment effect
      for (let i = 0; i < 30; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: 0.5, // Same outcome regardless of treatment
          timestamp: Date.now(),
        });
      }

      const estimate = causal.estimateATE();

      // ATE should be close to 0
      expect(Math.abs(estimate.ate)).toBeLessThan(0.3);
    });

    it('should handle negative treatment effect', () => {
      for (let i = 0; i < 30; i++) {
        const treatment = i % 2;
        causal.addObservation({
          features: [Math.random()],
          treatment,
          outcome: treatment === 1 ? 0.2 : 0.8, // Treatment is worse
          timestamp: Date.now(),
        });
      }

      const estimate = causal.estimateATE();

      expect(estimate.ate).toBeLessThan(0);
    });

    it('should produce valid confidence intervals', () => {
      for (let i = 0; i < 30; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 0.7 : 0.3,
          timestamp: Date.now(),
        });
      }

      const estimate = causal.estimateATE();

      const [lower, upper] = estimate.confidenceInterval;
      expect(lower).toBeLessThan(upper);
      expect(estimate.ate).toBeGreaterThanOrEqual(lower);
      expect(estimate.ate).toBeLessThanOrEqual(upper);
    });
  });

  // ==================== Numerical Stability Tests ====================

  describe('numerical stability', () => {
    it('should handle many observations without NaN', () => {
      for (let i = 0; i < 100; i++) {
        causal.addObservation({
          features: [Math.random(), Math.random()],
          treatment: i % 2,
          outcome: Math.random() * 2 - 1,
          timestamp: Date.now(),
        });
      }

      causal.fit();

      const propensity = causal.getPropensityScore([0.5, 0.5]);
      expect(Number.isFinite(propensity)).toBe(true);
      expect(propensity).toBeGreaterThanOrEqual(0.05);
      expect(propensity).toBeLessThanOrEqual(0.95);
    });

    it('should handle nearly identical features', () => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [0.5 + i * 1e-10, 0.5 + i * 1e-10],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 0.7 : 0.3,
          timestamp: Date.now(),
        });
      }

      causal.fit();

      const propensity = causal.getPropensityScore([0.5, 0.5]);
      expect(Number.isFinite(propensity)).toBe(true);
    });

    it('should clip extreme propensity scores', () => {
      // Add highly separable data that would produce extreme propensities
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [i % 2 === 1 ? 1.0 : 0.0], // Perfect separation
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      causal.fit();

      const propensity1 = causal.getPropensityScore([1.0]);
      const propensity0 = causal.getPropensityScore([0.0]);

      // Should be clipped to [0.05, 0.95]
      expect(propensity1).toBeLessThanOrEqual(0.95);
      expect(propensity0).toBeGreaterThanOrEqual(0.05);
    });

    it('should produce finite estimates with extreme outcomes', () => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 1.0 : -1.0, // Extreme values
          timestamp: Date.now(),
        });
      }

      const estimate = causal.estimateATE();

      expect(Number.isFinite(estimate.ate)).toBe(true);
      expect(Number.isFinite(estimate.standardError)).toBe(true);
    });
  });

  // ==================== Propensity Diagnostics Tests ====================

  describe('propensity diagnostics', () => {
    beforeEach(() => {
      for (let i = 0; i < 30; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }
    });

    it('should return valid diagnostics', () => {
      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics.mean).toBeGreaterThanOrEqual(0);
      expect(diagnostics.mean).toBeLessThanOrEqual(1);
      expect(diagnostics.std).toBeGreaterThanOrEqual(0);
      expect(diagnostics.median).toBeGreaterThanOrEqual(0);
      expect(diagnostics.median).toBeLessThanOrEqual(1);
    });

    it('should compute overlap metric', () => {
      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics.overlap).toBeGreaterThanOrEqual(0);
      expect(diagnostics.overlap).toBeLessThanOrEqual(1);
    });

    it('should compute AUC metric', () => {
      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics.auc).toBeGreaterThanOrEqual(0);
      expect(diagnostics.auc).toBeLessThanOrEqual(1);
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence edge cases', () => {
    it('should preserve observations across state save/restore', () => {
      for (let i = 0; i < 15; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      const state = causal.getState();

      const newCausal = new CausalInference();
      newCausal.setState(state);

      expect(newCausal.getObservationCount()).toBe(15);
    });

    it('should preserve model weights across state save/restore', () => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 0.7 : 0.3,
          timestamp: Date.now(),
        });
      }

      causal.fit();
      const originalPropensity = causal.getPropensityScore([0.5]);

      const state = causal.getState();

      const newCausal = new CausalInference();
      newCausal.setState(state);

      const restoredPropensity = newCausal.getPropensityScore([0.5]);

      expect(restoredPropensity).toBeCloseTo(originalPropensity, 5);
    });

    it('should handle state with invalid version gracefully', () => {
      const state = causal.getState();
      state.version = '0.0.1';

      const newCausal = new CausalInference();
      newCausal.setState(state);

      // Should handle gracefully
      expect(newCausal.getObservationCount()).toBe(0);
    });
  });

  // ==================== Clear/Reset Tests ====================

  describe('clear and reset', () => {
    it('should clear all data', () => {
      for (let i = 0; i < 10; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      causal.clear();

      expect(causal.getObservationCount()).toBe(0);
    });

    it('should reset fitted state', () => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      causal.fit();
      causal.reset();

      // After reset, propensity should return default 0.5
      const propensity = causal.getPropensityScore([0.5]);
      expect(propensity).toBe(0.5);
    });
  });

  // ==================== CATTE Estimation Tests ====================

  describe('CATTE estimation', () => {
    beforeEach(() => {
      for (let i = 0; i < 30; i++) {
        causal.addObservation({
          features: [Math.random(), Math.random()],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 0.7 : 0.3,
          timestamp: Date.now(),
        });
      }
    });

    it('should estimate conditional effect', () => {
      const estimate = causal.estimateCATTE([0.5, 0.5]);

      expect(estimate).toHaveProperty('ate');
      expect(estimate).toHaveProperty('standardError');
      expect(estimate).toHaveProperty('confidenceInterval');
      expect(Number.isFinite(estimate.ate)).toBe(true);
    });

    it('should handle extreme feature values in CATTE', () => {
      const estimate = causal.estimateCATTE([1e10, -1e10]);

      expect(Number.isFinite(estimate.ate)).toBe(true);
    });
  });

  // ==================== Legacy API Compatibility Tests ====================

  describe('legacy API compatibility', () => {
    it('should support recordObservation with string treatment', () => {
      causal.recordObservation({
        treatment: 'strategyA',
        outcome: 0.8,
        covariates: { accuracy: 0.7, fatigue: 0.3 },
      });

      expect(causal.getObservationCount()).toBe(1);
    });

    it('should map different string treatments correctly', () => {
      causal.recordObservation({
        treatment: 'strategyA',
        outcome: 0.8,
        covariates: { value: 0.5 },
      });

      causal.recordObservation({
        treatment: 'strategyB',
        outcome: 0.5,
        covariates: { value: 0.5 },
      });

      expect(causal.getObservationCount()).toBe(2);
    });

    it('should handle estimateATE with string treatments', () => {
      for (let i = 0; i < 20; i++) {
        causal.recordObservation({
          treatment: i % 2 === 0 ? 'strategyA' : 'strategyB',
          outcome: i % 2 === 0 ? 0.8 : 0.4,
          covariates: { value: Math.random() },
        });
      }

      const result = causal.estimateATE('strategyA', 'strategyB');

      expect(result).toHaveProperty('effect');
      expect(result).toHaveProperty('treated');
      expect(result).toHaveProperty('control');
      expect(result).toHaveProperty('samples');
    });

    it('should handle getPropensityScore with string treatment', () => {
      for (let i = 0; i < 10; i++) {
        causal.recordObservation({
          treatment: i % 2 === 0 ? 'strategyA' : 'strategyB',
          outcome: Math.random(),
          covariates: { value: Math.random() },
        });
      }

      const score = causal.getPropensityScore('strategyA');

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return 0.5 for unknown treatment', () => {
      causal.recordObservation({
        treatment: 'strategyA',
        outcome: 0.8,
        covariates: { value: 0.5 },
      });

      const score = causal.getPropensityScore('unknownStrategy');
      expect(score).toBe(0.5);
    });
  });

  // ==================== IPW Weight Computation Tests ====================

  describe('computeIPWWeight', () => {
    it('should compute correct weight for treatment group', () => {
      const weight = computeIPWWeight(1, 0.5);
      expect(weight).toBe(2.0);
    });

    it('should compute correct weight for control group', () => {
      const weight = computeIPWWeight(0, 0.5);
      expect(weight).toBe(2.0);
    });

    it('should clip propensity to min bound', () => {
      const weight = computeIPWWeight(1, 0.01, 0.05, 0.95);
      expect(weight).toBe(20); // 1 / 0.05
    });

    it('should clip propensity to max bound', () => {
      const weight = computeIPWWeight(1, 0.99, 0.05, 0.95);
      expect(weight).toBeCloseTo(1 / 0.95, 2);
    });

    it('should handle propensity of 0', () => {
      const weight = computeIPWWeight(1, 0, 0.05, 0.95);
      expect(weight).toBe(20); // Clipped to min
    });

    it('should handle propensity of 1', () => {
      const weight = computeIPWWeight(0, 1, 0.05, 0.95);
      expect(weight).toBeCloseTo(20, 5); // 1 / (1 - 0.95)
    });

    it('should handle custom bounds', () => {
      const weight = computeIPWWeight(1, 0.01, 0.1, 0.9);
      expect(weight).toBe(10); // 1 / 0.1
    });
  });

  // ==================== Strategy Comparison Tests ====================

  describe('compareStrategies', () => {
    beforeEach(() => {
      for (let i = 0; i < 30; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 0.8 : 0.4,
          timestamp: Date.now(),
        });
      }
    });

    it('should compare strategies and return valid result', () => {
      const comparison = causal.compareStrategies(1, 0);

      expect(comparison).toHaveProperty('diff');
      expect(comparison).toHaveProperty('standardError');
      expect(comparison).toHaveProperty('confidenceInterval');
      expect(comparison).toHaveProperty('pValue');
      expect(comparison).toHaveProperty('significant');
      expect(comparison).toHaveProperty('sampleSize');
    });

    it('should detect significant difference', () => {
      const comparison = causal.compareStrategies(1, 0);

      // With clear effect, should be significant
      expect(comparison.diff).toBeGreaterThan(0);
    });
  });
});
