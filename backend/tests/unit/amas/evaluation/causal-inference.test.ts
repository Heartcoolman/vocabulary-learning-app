/**
 * CausalInference Unit Tests
 * 测试因果推断验证器的ATE估计和倾向得分
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CausalInference,
  CausalObservation,
  CausalInferenceState,
  createCausalInference,
  computeIPWWeight
} from '../../../../src/amas/evaluation/causal-inference';

describe('CausalInference', () => {
  let causal: CausalInference;

  const generateObservations = (
    n: number,
    treatmentEffect: number
  ): CausalObservation[] => {
    const observations: CausalObservation[] = [];

    for (let i = 0; i < n; i++) {
      const features = [
        Math.random(),
        Math.random(),
        Math.random()
      ];
      const treatment = Math.random() > 0.5 ? 1 : 0;
      const baseOutcome = features[0] * 0.3 + features[1] * 0.2 + Math.random() * 0.2;
      const outcome = treatment === 1
        ? baseOutcome + treatmentEffect
        : baseOutcome;

      observations.push({
        features,
        treatment,
        outcome: Math.max(-1, Math.min(1, outcome)),
        timestamp: Date.now() + i
      });
    }

    return observations;
  };

  beforeEach(() => {
    causal = new CausalInference();
  });

  describe('Initialization', () => {
    it('should initialize with zero observations', () => {
      expect(causal.getObservationCount()).toBe(0);
    });

    it('should accept custom config', () => {
      const customCausal = createCausalInference({
        propensityMin: 0.1,
        propensityMax: 0.9,
        learningRate: 0.05
      });

      expect(customCausal).toBeDefined();
    });
  });

  describe('Adding Observations', () => {
    it('should add single observation', () => {
      const obs: CausalObservation = {
        features: [0.5, 0.3, 0.7],
        treatment: 1,
        outcome: 0.8,
        timestamp: Date.now()
      };

      causal.addObservation(obs);

      expect(causal.getObservationCount()).toBe(1);
    });

    it('should add batch observations', () => {
      const observations = generateObservations(20, 0.1);
      causal.addObservations(observations);

      expect(causal.getObservationCount()).toBe(20);
    });

    it('should throw on empty features', () => {
      expect(() => {
        causal.addObservation({
          features: [],
          treatment: 1,
          outcome: 0.5,
          timestamp: Date.now()
        });
      }).toThrow();
    });

    it('should throw on invalid treatment', () => {
      expect(() => {
        causal.addObservation({
          features: [0.5, 0.3],
          treatment: 2,
          outcome: 0.5,
          timestamp: Date.now()
        });
      }).toThrow();
    });

    it('should throw on dimension mismatch', () => {
      causal.addObservation({
        features: [0.5, 0.3],
        treatment: 1,
        outcome: 0.5,
        timestamp: Date.now()
      });

      expect(() => {
        causal.addObservation({
          features: [0.5, 0.3, 0.7],
          treatment: 0,
          outcome: 0.4,
          timestamp: Date.now()
        });
      }).toThrow();
    });

    it('should clamp outcome to [-1, 1]', () => {
      causal.addObservation({
        features: [0.5],
        treatment: 1,
        outcome: 2.0,
        timestamp: Date.now()
      });

      const state = causal.getState();
      expect(state.observations[0].outcome).toBe(1);
    });
  });

  describe('Model Fitting', () => {
    it('should fit with sufficient data', () => {
      const observations = generateObservations(20, 0.1);
      causal.addObservations(observations);

      expect(() => {
        causal.fit();
      }).not.toThrow();
    });

    it('should throw with insufficient total samples', () => {
      const observations = generateObservations(5, 0.1);
      causal.addObservations(observations);

      expect(() => {
        causal.fit();
      }).toThrow();
    });

    it('should throw with insufficient treatment group', () => {
      const observations: CausalObservation[] = [];

      for (let i = 0; i < 15; i++) {
        observations.push({
          features: [Math.random()],
          treatment: 0,
          outcome: Math.random(),
          timestamp: Date.now() + i
        });
      }

      observations.push({
        features: [Math.random()],
        treatment: 1,
        outcome: Math.random(),
        timestamp: Date.now()
      });

      causal.addObservations(observations);

      expect(() => {
        causal.fit();
      }).toThrow();
    });
  });

  describe('ATE Estimation', () => {
    it('should estimate ATE', () => {
      const observations = generateObservations(50, 0.2);
      causal.addObservations(observations);

      const estimate = causal.estimateATE();

      expect(estimate).toHaveProperty('ate');
      expect(estimate).toHaveProperty('standardError');
      expect(estimate).toHaveProperty('confidenceInterval');
      expect(estimate).toHaveProperty('pValue');
      expect(estimate).toHaveProperty('significant');
    });

    it('should return confidence interval', () => {
      const observations = generateObservations(50, 0.2);
      causal.addObservations(observations);

      const estimate = causal.estimateATE();

      expect(estimate.confidenceInterval[0]).toBeLessThan(estimate.ate);
      expect(estimate.confidenceInterval[1]).toBeGreaterThan(estimate.ate);
    });

    it('should detect significant positive effect', () => {
      const observations = generateObservations(100, 0.5);
      causal.addObservations(observations);

      const estimate = causal.estimateATE();

      expect(estimate.ate).toBeGreaterThan(0);
    });
  });

  describe('CATE Estimation', () => {
    it('should estimate CATE for given features', () => {
      const observations = generateObservations(50, 0.2);
      causal.addObservations(observations);

      const estimate = causal.estimateCATTE([0.5, 0.5, 0.5]);

      expect(estimate).toHaveProperty('ate');
      expect(estimate).toHaveProperty('standardError');
    });
  });

  describe('Propensity Scores', () => {
    it('should return propensity score between bounds', () => {
      const observations = generateObservations(30, 0.1);
      causal.addObservations(observations);
      causal.fit();

      const score = causal.getPropensityScore([0.5, 0.5, 0.5]);

      expect(score).toBeGreaterThanOrEqual(0.05);
      expect(score).toBeLessThanOrEqual(0.95);
    });

    it('should return 0.5 before fitting', () => {
      causal.addObservation({
        features: [0.5],
        treatment: 1,
        outcome: 0.5,
        timestamp: Date.now()
      });

      const score = causal.getPropensityScore([0.5]);
      expect(score).toBe(0.5);
    });
  });

  describe('Propensity Diagnostics', () => {
    it('should return diagnostic metrics', () => {
      const observations = generateObservations(50, 0.1);
      causal.addObservations(observations);

      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics).toHaveProperty('mean');
      expect(diagnostics).toHaveProperty('std');
      expect(diagnostics).toHaveProperty('median');
      expect(diagnostics).toHaveProperty('treatmentMean');
      expect(diagnostics).toHaveProperty('controlMean');
      expect(diagnostics).toHaveProperty('overlap');
      expect(diagnostics).toHaveProperty('auc');
    });

    it('should have overlap between 0 and 1', () => {
      const observations = generateObservations(50, 0.1);
      causal.addObservations(observations);

      const diagnostics = causal.diagnosePropensity();

      expect(diagnostics.overlap).toBeGreaterThanOrEqual(0);
      expect(diagnostics.overlap).toBeLessThanOrEqual(1);
    });
  });

  describe('Strategy Comparison', () => {
    it('should compare two strategies', () => {
      const observations = generateObservations(50, 0.2);
      causal.addObservations(observations);

      const comparison = causal.compareStrategies(1, 0);

      expect(comparison).toHaveProperty('diff');
      expect(comparison).toHaveProperty('standardError');
      expect(comparison).toHaveProperty('pValue');
      expect(comparison).toHaveProperty('significant');
    });
  });

  describe('Outcome Prediction', () => {
    it('should predict outcome for treatment', () => {
      const observations = generateObservations(30, 0.1);
      causal.addObservations(observations);
      causal.fit();

      const prediction = causal.predictOutcome([0.5, 0.5, 0.5], 1);

      expect(typeof prediction).toBe('number');
      expect(Number.isFinite(prediction)).toBe(true);
    });

    it('should return 0 before fitting', () => {
      causal.addObservation({
        features: [0.5],
        treatment: 1,
        outcome: 0.5,
        timestamp: Date.now()
      });

      const prediction = causal.predictOutcome([0.5], 1);
      expect(prediction).toBe(0);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      const observations = generateObservations(20, 0.1);
      causal.addObservations(observations);
      causal.fit();

      const state = causal.getState();

      expect(state.version).toBeDefined();
      expect(state.observations.length).toBe(20);
      expect(state.fitted).toBe(true);
      expect(state.propensityWeights).not.toBeNull();
    });

    it('should restore state correctly', () => {
      const observations = generateObservations(20, 0.1);
      causal.addObservations(observations);
      causal.fit();

      const state = causal.getState();
      const newCausal = new CausalInference();
      newCausal.setState(state);

      expect(newCausal.getObservationCount()).toBe(20);
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        causal.setState(null as unknown as CausalInferenceState);
      }).not.toThrow();
    });
  });

  describe('Clear', () => {
    it('should clear all data', () => {
      const observations = generateObservations(20, 0.1);
      causal.addObservations(observations);
      causal.fit();

      causal.clear();

      expect(causal.getObservationCount()).toBe(0);
    });
  });

  describe('Convenience Functions', () => {
    it('createCausalInference should create instance', () => {
      const instance = createCausalInference({ learningRate: 0.05 });
      expect(instance).toBeInstanceOf(CausalInference);
    });

    it('computeIPWWeight should compute weight for treatment', () => {
      const weight = computeIPWWeight(1, 0.5);
      expect(weight).toBe(2);
    });

    it('computeIPWWeight should compute weight for control', () => {
      const weight = computeIPWWeight(0, 0.5);
      expect(weight).toBe(2);
    });

    it('computeIPWWeight should clip extreme propensities', () => {
      const weight = computeIPWWeight(1, 0.01, 0.05, 0.95);
      expect(weight).toBe(20);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single feature dimension', () => {
      for (let i = 0; i < 20; i++) {
        causal.addObservation({
          features: [Math.random()],
          treatment: i % 2,
          outcome: Math.random() - 0.5,
          timestamp: Date.now() + i
        });
      }

      expect(() => {
        causal.fit();
      }).not.toThrow();
    });

    it('should handle imbalanced treatment groups', () => {
      for (let i = 0; i < 30; i++) {
        causal.addObservation({
          features: [Math.random(), Math.random()],
          treatment: i < 25 ? 0 : 1,
          outcome: Math.random() - 0.5,
          timestamp: Date.now() + i
        });
      }

      expect(() => {
        causal.fit();
      }).not.toThrow();
    });
  });
});
