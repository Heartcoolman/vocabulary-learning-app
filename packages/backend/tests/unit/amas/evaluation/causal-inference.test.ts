/**
 * CausalInference Unit Tests
 *
 * Tests for the causal inference validation module using doubly robust estimation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CausalInference,
  CausalObservation,
  createCausalInference,
  computeIPWWeight,
} from '../../../../src/amas/rewards/evaluators';

describe('CausalInference', () => {
  let causal: CausalInference;

  beforeEach(() => {
    causal = new CausalInference();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(causal.getObservationCount()).toBe(0);
    });

    it('should accept custom config', () => {
      const customCausal = new CausalInference({
        propensityMin: 0.1,
        propensityMax: 0.9,
        learningRate: 0.05,
      });

      expect(customCausal.getObservationCount()).toBe(0);
    });
  });

  // ==================== addObservation Tests ====================

  describe('addObservation', () => {
    it('should add valid observation', () => {
      const obs: CausalObservation = {
        features: [0.5, 0.3, 0.8],
        treatment: 1,
        outcome: 0.6,
        timestamp: Date.now(),
      };

      causal.addObservation(obs);

      expect(causal.getObservationCount()).toBe(1);
    });

    it('should throw error for empty features', () => {
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
          treatment: 2, // Invalid: must be 0 or 1
          outcome: 0.5,
          timestamp: Date.now(),
        });
      }).toThrow('treatment必须是0或1');
    });

    it('should throw error for dimension mismatch', () => {
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

    it('should clamp outcome to [-1, 1]', () => {
      causal.addObservation({
        features: [0.5],
        treatment: 1,
        outcome: 2.0, // Should be clamped to 1
        timestamp: Date.now(),
      });

      // No error should be thrown
      expect(causal.getObservationCount()).toBe(1);
    });
  });

  // ==================== addObservations Tests ====================

  describe('addObservations', () => {
    it('should add multiple observations', () => {
      const observations: CausalObservation[] = [
        { features: [0.5], treatment: 1, outcome: 0.6, timestamp: Date.now() },
        { features: [0.3], treatment: 0, outcome: 0.4, timestamp: Date.now() },
        { features: [0.8], treatment: 1, outcome: 0.7, timestamp: Date.now() },
      ];

      causal.addObservations(observations);

      expect(causal.getObservationCount()).toBe(3);
    });
  });

  // ==================== fit Tests ====================

  describe('fit', () => {
    it('should throw error with insufficient samples', () => {
      causal.addObservation({
        features: [0.5],
        treatment: 1,
        outcome: 0.6,
        timestamp: Date.now(),
      });

      expect(() => {
        causal.fit();
      }).toThrow('样本量不足');
    });

    it('should throw error without both treatment and control groups', () => {
      // Add only treatment group
      for (let i = 0; i < 10; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: 1,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      expect(() => {
        causal.fit();
      }).toThrow('处理组和对照组各需至少5个样本');
    });

    it('should fit successfully with sufficient balanced data', () => {
      // Add balanced treatment and control groups
      for (let i = 0; i < 10; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      // Should not throw
      causal.fit();
    });
  });

  // ==================== estimateATE Tests ====================

  describe('estimateATE', () => {
    beforeEach(() => {
      // Create balanced dataset with clear treatment effect
      for (let i = 0; i < 20; i++) {
        const treatment = i % 2;
        causal.addObservation({
          features: [Math.random(), Math.random()],
          treatment,
          outcome: treatment === 1 ? 0.7 : 0.3, // Clear effect
          timestamp: Date.now(),
        });
      }
    });

    it('should estimate ATE with confidence interval', () => {
      const estimate = causal.estimateATE();

      expect(estimate).toHaveProperty('ate');
      expect(estimate).toHaveProperty('standardError');
      expect(estimate).toHaveProperty('confidenceInterval');
      expect(estimate).toHaveProperty('pValue');
      expect(estimate).toHaveProperty('significant');
    });

    it('should detect positive treatment effect', () => {
      const estimate = causal.estimateATE();

      // Treatment effect should be positive (0.7 - 0.3 = 0.4)
      expect(estimate.ate).toBeGreaterThan(0);
    });

    it('should return valid confidence interval', () => {
      const estimate = causal.estimateATE();

      const [lower, upper] = estimate.confidenceInterval;
      expect(lower).toBeLessThan(upper);
      expect(estimate.ate).toBeGreaterThanOrEqual(lower);
      expect(estimate.ate).toBeLessThanOrEqual(upper);
    });
  });

  // ==================== estimateCATTE Tests ====================

  describe('estimateCATTE', () => {
    beforeEach(() => {
      for (let i = 0; i < 20; i++) {
        const treatment = i % 2;
        causal.addObservation({
          features: [Math.random(), Math.random()],
          treatment,
          outcome: treatment === 1 ? 0.7 : 0.3,
          timestamp: Date.now(),
        });
      }
    });

    it('should estimate conditional effect for specific features', () => {
      const estimate = causal.estimateCATTE([0.5, 0.5]);

      expect(estimate).toHaveProperty('ate');
      expect(estimate).toHaveProperty('standardError');
      expect(estimate).toHaveProperty('confidenceInterval');
    });
  });

  // ==================== getPropensityScore Tests ====================

  describe('getPropensityScore', () => {
    beforeEach(() => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }
      causal.fit();
    });

    it('should return propensity score in valid range', () => {
      const score = causal.getPropensityScore([0.5]);

      expect(score).toBeGreaterThanOrEqual(0.05);
      expect(score).toBeLessThanOrEqual(0.95);
    });

    it('should return 0.5 when not fitted', () => {
      const newCausal = new CausalInference();
      const score = newCausal.getPropensityScore([0.5]);

      expect(score).toBe(0.5);
    });
  });

  // ==================== diagnosePropensity Tests ====================

  describe('diagnosePropensity', () => {
    beforeEach(() => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }
    });

    it('should return propensity diagnostics', () => {
      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics).toHaveProperty('mean');
      expect(diagnostics).toHaveProperty('std');
      expect(diagnostics).toHaveProperty('median');
      expect(diagnostics).toHaveProperty('treatmentMean');
      expect(diagnostics).toHaveProperty('controlMean');
      expect(diagnostics).toHaveProperty('overlap');
      expect(diagnostics).toHaveProperty('auc');
    });

    it('should have mean in valid range', () => {
      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics.mean).toBeGreaterThanOrEqual(0);
      expect(diagnostics.mean).toBeLessThanOrEqual(1);
    });
  });

  // ==================== compareStrategies Tests ====================

  describe('compareStrategies', () => {
    beforeEach(() => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: i % 2 === 1 ? 0.8 : 0.4,
          timestamp: Date.now(),
        });
      }
    });

    it('should compare two strategies', () => {
      const comparison = causal.compareStrategies(1, 0);

      expect(comparison).toHaveProperty('diff');
      expect(comparison).toHaveProperty('standardError');
      expect(comparison).toHaveProperty('confidenceInterval');
      expect(comparison).toHaveProperty('pValue');
      expect(comparison).toHaveProperty('significant');
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should export and import state', () => {
      for (let i = 0; i < 10; i++) {
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

      expect(newCausal.getObservationCount()).toBe(10);
    });

    it('should handle invalid state gracefully', () => {
      // @ts-ignore - Testing invalid input
      causal.setState(null);

      expect(causal.getObservationCount()).toBe(0);
    });
  });

  // ==================== clear/reset Tests ====================

  describe('clear and reset', () => {
    it('should clear all data', () => {
      for (let i = 0; i < 5; i++) {
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

    it('should reset all state', () => {
      for (let i = 0; i < 5; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random(),
          timestamp: Date.now(),
        });
      }

      causal.reset();

      expect(causal.getObservationCount()).toBe(0);
    });
  });

  // ==================== Legacy API Tests ====================

  describe('legacy API compatibility', () => {
    it('should support recordObservation with string treatment', () => {
      causal.recordObservation({
        treatment: 'strategyA',
        outcome: 0.8,
        covariates: { accuracy: 0.7, fatigue: 0.3 },
      });

      causal.recordObservation({
        treatment: 'strategyB',
        outcome: 0.5,
        covariates: { accuracy: 0.5, fatigue: 0.5 },
      });

      expect(causal.getObservationCount()).toBe(2);
    });

    it('should support estimateATE with string treatments', () => {
      for (let i = 0; i < 10; i++) {
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

    it('should support getPropensityScore with string treatment', () => {
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
  });
});

// ==================== Helper Function Tests ====================

describe('createCausalInference', () => {
  it('should create CausalInference instance', () => {
    const causal = createCausalInference();

    expect(causal).toBeInstanceOf(CausalInference);
  });

  it('should accept custom config', () => {
    const causal = createCausalInference({ learningRate: 0.05 });

    expect(causal).toBeInstanceOf(CausalInference);
  });
});

describe('computeIPWWeight', () => {
  it('should compute weight for treatment group', () => {
    const weight = computeIPWWeight(1, 0.5);

    expect(weight).toBe(2.0); // 1 / 0.5
  });

  it('should compute weight for control group', () => {
    const weight = computeIPWWeight(0, 0.5);

    expect(weight).toBe(2.0); // 1 / (1 - 0.5)
  });

  it('should clip propensity to min bound', () => {
    const weight = computeIPWWeight(1, 0.01, 0.05, 0.95);

    expect(weight).toBe(20); // 1 / 0.05
  });

  it('should clip propensity to max bound', () => {
    const weight = computeIPWWeight(1, 0.99, 0.05, 0.95);

    expect(weight).toBeCloseTo(1 / 0.95, 2);
  });
});
