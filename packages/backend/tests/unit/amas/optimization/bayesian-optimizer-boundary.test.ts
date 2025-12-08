/**
 * BayesianOptimizer Boundary Condition Tests
 *
 * Tests for extreme inputs, edge cases, numerical stability and convergence
 * Target: 90%+ coverage for AMAS core algorithms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BayesianOptimizer,
  ParamBound,
  getDefaultParamSpace,
} from '../../../../src/amas/optimization/bayesian-optimizer';

describe('BayesianOptimizer - Boundary Conditions', () => {
  let optimizer: BayesianOptimizer;

  beforeEach(() => {
    optimizer = new BayesianOptimizer();
  });

  // ==================== Extreme Input Values Tests ====================

  describe('extreme parameter values', () => {
    it('should handle parameter space with very small range', () => {
      const tinySpace: ParamBound[] = [{ name: 'tiny', min: 0.0, max: 0.0001 }];

      const tinyOptimizer = new BayesianOptimizer({ paramSpace: tinySpace });
      const suggestion = tinyOptimizer.suggestNext();

      expect(suggestion[0]).toBeGreaterThanOrEqual(0.0);
      expect(suggestion[0]).toBeLessThanOrEqual(0.0001);
    });

    it('should handle parameter space with very large range', () => {
      const largeSpace: ParamBound[] = [{ name: 'large', min: -1e6, max: 1e6 }];

      const largeOptimizer = new BayesianOptimizer({ paramSpace: largeSpace });
      const suggestion = largeOptimizer.suggestNext();

      expect(suggestion[0]).toBeGreaterThanOrEqual(-1e6);
      expect(suggestion[0]).toBeLessThanOrEqual(1e6);
    });

    it('should handle negative parameter bounds', () => {
      const negativeSpace: ParamBound[] = [{ name: 'negative', min: -100, max: -10 }];

      const negativeOptimizer = new BayesianOptimizer({ paramSpace: negativeSpace });
      const suggestion = negativeOptimizer.suggestNext();

      expect(suggestion[0]).toBeGreaterThanOrEqual(-100);
      expect(suggestion[0]).toBeLessThanOrEqual(-10);
    });

    it('should handle single point parameter space (min === max)', () => {
      const singlePointSpace: ParamBound[] = [{ name: 'single', min: 0.5, max: 0.5 }];

      const singleOptimizer = new BayesianOptimizer({ paramSpace: singlePointSpace });
      const suggestion = singleOptimizer.suggestNext();

      expect(suggestion[0]).toBeCloseTo(0.5, 5);
    });

    it('should handle extremely small step size', () => {
      const smallStepSpace: ParamBound[] = [{ name: 'smallStep', min: 0, max: 1, step: 1e-10 }];

      const smallStepOptimizer = new BayesianOptimizer({ paramSpace: smallStepSpace });
      const suggestion = smallStepOptimizer.suggestNext();

      expect(suggestion[0]).toBeGreaterThanOrEqual(0);
      expect(suggestion[0]).toBeLessThanOrEqual(1);
    });

    it('should handle very large step size', () => {
      const largeStepSpace: ParamBound[] = [{ name: 'largeStep', min: 0, max: 10, step: 5 }];

      const largeStepOptimizer = new BayesianOptimizer({ paramSpace: largeStepSpace });

      for (let i = 0; i < 10; i++) {
        const suggestion = largeStepOptimizer.suggestNext();
        // Values should be multiples of 5: 0, 5, or 10
        expect([0, 5, 10]).toContain(suggestion[0]);
      }
    });

    it('should handle extreme evaluation values', () => {
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 1e10);
      optimizer.recordEvaluation(optimizer.suggestNext(), -1e10);

      const best = optimizer.getBest();
      expect(best).not.toBeNull();
      expect(best?.value).toBe(1e10);
    });

    it('should handle very small evaluation values', () => {
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 1e-15);

      const best = optimizer.getBest();
      expect(best?.value).toBe(1e-15);
    });
  });

  // ==================== Empty/Missing Data Tests ====================

  describe('empty and missing data handling', () => {
    it('should return null for getBest when no evaluations', () => {
      expect(optimizer.getBest()).toBeNull();
    });

    it('should return empty array for getObservations when no evaluations', () => {
      expect(optimizer.getObservations()).toEqual([]);
    });

    it('should return 0 for getEvaluationCount when no evaluations', () => {
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('should throw error for dimension mismatch in recordEvaluation', () => {
      expect(() => {
        optimizer.recordEvaluation([0.5], 1.0);
      }).toThrow('参数维度不匹配');
    });

    it('should handle null state restoration gracefully', () => {
      // @ts-ignore
      optimizer.setState(null);
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('should handle empty state restoration', () => {
      // @ts-ignore
      optimizer.setState({});
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('should handle state with missing best', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      const state = optimizer.getState();
      state.best = null;

      const newOptimizer = new BayesianOptimizer();
      newOptimizer.setState(state);

      // Should rebuild best from observations
      expect(newOptimizer.getBest()?.value).toBe(0.6);
    });

    it('should handle objectToParams with missing values', () => {
      const partial = { alpha: 1.0 };
      const params = optimizer.objectToParams(partial);

      expect(params.length).toBe(4);
      expect(params[0]).toBe(1.0);
      // Other values should be midpoints
    });
  });

  // ==================== Algorithm Convergence Tests ====================

  describe('algorithm convergence', () => {
    it('should converge on simple quadratic function', () => {
      const simpleSpace: ParamBound[] = [{ name: 'x', min: 0, max: 1 }];
      const simpleOptimizer = new BayesianOptimizer({
        paramSpace: simpleSpace,
        maxEvaluations: 30,
      });

      for (let i = 0; i < 30; i++) {
        const params = simpleOptimizer.suggestNext();
        const x = params[0];
        // Maximum at x = 0.7
        const value = -Math.pow(x - 0.7, 2);
        simpleOptimizer.recordEvaluation(params, value);
      }

      const best = simpleOptimizer.getBest();
      expect(best).not.toBeNull();
      expect(Math.abs(best!.params[0] - 0.7)).toBeLessThan(0.3);
    });

    it('should improve best value over iterations', () => {
      const values: number[] = [];

      for (let i = 0; i < 20; i++) {
        const params = optimizer.suggestNext();
        // Simple function: sum of params normalized
        const value = params.reduce((a, b) => a + b, 0) / params.length;
        optimizer.recordEvaluation(params, value);
        values.push(optimizer.getBest()!.value);
      }

      // Best value should generally improve or stay the same
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] - 0.001);
      }
    });

    it('should handle flat objective function', () => {
      for (let i = 0; i < 15; i++) {
        const params = optimizer.suggestNext();
        // Constant value
        optimizer.recordEvaluation(params, 0.5);
      }

      const best = optimizer.getBest();
      expect(best?.value).toBe(0.5);

      // Should still be able to suggest next
      const suggestion = optimizer.suggestNext();
      expect(suggestion.length).toBe(4);
    });

    it('should handle noisy objective function', () => {
      for (let i = 0; i < 20; i++) {
        const params = optimizer.suggestNext();
        // Base value + noise
        const baseValue = params[0];
        const noise = (Math.random() - 0.5) * 0.5;
        optimizer.recordEvaluation(params, baseValue + noise);
      }

      const best = optimizer.getBest();
      expect(best).not.toBeNull();
      expect(Number.isFinite(best!.value)).toBe(true);
    });
  });

  // ==================== Numerical Stability Tests ====================

  describe('numerical stability', () => {
    it('should handle many observations without NaN in posterior', () => {
      for (let i = 0; i < 100; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random());
      }

      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(Number.isFinite(posterior.mean)).toBe(true);
      expect(Number.isFinite(posterior.std)).toBe(true);
      expect(Number.isFinite(posterior.variance)).toBe(true);
      expect(posterior.std).toBeGreaterThanOrEqual(0);
    });

    it('should handle nearly identical observations', () => {
      const baseParams = [0.5, 0.1, 0.8, 0.4];

      for (let i = 0; i < 20; i++) {
        // Add tiny perturbations
        const params = baseParams.map((p) => p + (Math.random() - 0.5) * 1e-10);
        optimizer.recordEvaluation(params, 0.5 + i * 0.001);
      }

      const posterior = optimizer.getPosterior(baseParams);

      expect(Number.isFinite(posterior.mean)).toBe(true);
      expect(Number.isFinite(posterior.std)).toBe(true);
    });

    it('should produce finite acquisition values for all parameter combinations', () => {
      // Add some observations
      for (let i = 0; i < 10; i++) {
        optimizer.recordEvaluation(optimizer.suggestNext(), Math.random());
      }

      const testPoints = [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0.5, 0.5, 0.5, 0.5],
        [0.1, 0.9, 0.1, 0.9],
      ];

      for (const point of testPoints) {
        const space = optimizer.getParamSpace();
        const scaledPoint = point.map((v, i) => space[i].min + v * (space[i].max - space[i].min));

        const ucb = optimizer.computeUCB(scaledPoint);
        expect(Number.isFinite(ucb)).toBe(true);
      }
    });

    it('should handle computation with extreme beta values', () => {
      const highBetaOptimizer = new BayesianOptimizer({ beta: 1000 });
      highBetaOptimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.5);

      const ucb = highBetaOptimizer.computeUCB([0.6, 0.12, 0.75, 0.5]);
      expect(Number.isFinite(ucb)).toBe(true);
    });

    it('should handle zero variance in EI computation', () => {
      const eiOptimizer = new BayesianOptimizer({ acquisitionType: 'ei' });

      // Add exact same observation multiple times
      for (let i = 0; i < 10; i++) {
        eiOptimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.5);
      }

      const ei = eiOptimizer.computeEI([0.5, 0.1, 0.8, 0.4]);
      expect(Number.isFinite(ei)).toBe(true);
    });
  });

  // ==================== Batch Suggestion Tests ====================

  describe('batch suggestions', () => {
    it('should return correct number of suggestions in batch', () => {
      const batch = optimizer.suggestBatch(5);

      expect(batch.length).toBe(5);
      batch.forEach((suggestion) => {
        expect(suggestion.length).toBe(4);
      });
    });

    it('should return diverse suggestions in batch', () => {
      const batch = optimizer.suggestBatch(5);

      // Check that not all suggestions are identical
      const first = JSON.stringify(batch[0]);
      const allSame = batch.every((s) => JSON.stringify(s) === first);

      expect(allSame).toBe(false);
    });

    it('should handle batch size of 1', () => {
      const batch = optimizer.suggestBatch(1);

      expect(batch.length).toBe(1);
      expect(batch[0].length).toBe(4);
    });

    it('should handle large batch size', () => {
      const batch = optimizer.suggestBatch(50);

      expect(batch.length).toBe(50);
    });

    it('should not permanently modify observations after batch', () => {
      const initialCount = optimizer.getEvaluationCount();
      optimizer.suggestBatch(10);

      expect(optimizer.getEvaluationCount()).toBe(initialCount);
    });
  });

  // ==================== Error Recovery Tests ====================

  describe('error recovery', () => {
    it('should recover from Cholesky decomposition issues', () => {
      // Add many observations that might cause numerical issues
      for (let i = 0; i < 50; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random() * 0.001); // Very small variance
      }

      // Should still be able to compute posterior
      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);
      expect(Number.isFinite(posterior.mean)).toBe(true);
    });

    it('should handle state restoration with invalid observations', () => {
      const state = optimizer.getState();
      state.observations = [{ params: [0.5, 0.1, 0.8, 0.4], value: NaN, timestamp: Date.now() }];

      const newOptimizer = new BayesianOptimizer();
      newOptimizer.setState(state);

      // Should handle gracefully
      const suggestion = newOptimizer.suggestNext();
      expect(suggestion.length).toBe(4);
    });

    it('should reset cleanly', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordEvaluation(optimizer.suggestNext(), Math.random());
      }

      optimizer.reset();

      expect(optimizer.getEvaluationCount()).toBe(0);
      expect(optimizer.getBest()).toBeNull();
      expect(optimizer.getObservations()).toEqual([]);
    });

    it('should handle version mismatch in state restoration', () => {
      const state = optimizer.getState();
      state.version = '0.0.1';

      const newOptimizer = new BayesianOptimizer();
      // Should handle version mismatch gracefully
      newOptimizer.setState(state);

      expect(newOptimizer.getEvaluationCount()).toBe(0);
    });
  });

  // ==================== Stopping Criteria Tests ====================

  describe('stopping criteria', () => {
    it('should not stop initially', () => {
      expect(optimizer.shouldStop()).toBe(false);
    });

    it('should stop after max evaluations', () => {
      const smallOptimizer = new BayesianOptimizer({ maxEvaluations: 5 });

      for (let i = 0; i < 5; i++) {
        expect(smallOptimizer.shouldStop()).toBe(false);
        smallOptimizer.recordEvaluation(smallOptimizer.suggestNext(), Math.random());
      }

      expect(smallOptimizer.shouldStop()).toBe(true);
    });

    it('should respect custom max evaluations', () => {
      const customOptimizer = new BayesianOptimizer({ maxEvaluations: 3 });

      for (let i = 0; i < 3; i++) {
        customOptimizer.recordEvaluation(customOptimizer.suggestNext(), Math.random());
      }

      expect(customOptimizer.shouldStop()).toBe(true);
    });
  });

  // ==================== Configuration Tests ====================

  describe('configuration handling', () => {
    it('should use default config when none provided', () => {
      const defaultOptimizer = new BayesianOptimizer();
      expect(defaultOptimizer.getParamSpace().length).toBe(4);
    });

    it('should accept custom noise variance', () => {
      const noisyOptimizer = new BayesianOptimizer({ noiseVariance: 0.5 });

      noisyOptimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      const posterior = noisyOptimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(Number.isFinite(posterior.mean)).toBe(true);
    });

    it('should accept custom length scales', () => {
      const customOptimizer = new BayesianOptimizer({
        lengthScale: [0.1, 0.1, 0.1, 0.1],
      });

      customOptimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      const suggestion = customOptimizer.suggestNext();

      expect(suggestion.length).toBe(4);
    });

    it('should accept custom output variance', () => {
      const customOptimizer = new BayesianOptimizer({ outputVariance: 2.0 });

      const posterior = customOptimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(posterior.variance).toBeCloseTo(2.0, 1);
    });

    it('should accept custom initial samples', () => {
      const customOptimizer = new BayesianOptimizer({ initialSamples: 10 });

      // First 10 suggestions should be random
      for (let i = 0; i < 10; i++) {
        const params = customOptimizer.suggestNext();
        customOptimizer.recordEvaluation(params, Math.random());
      }

      expect(customOptimizer.getEvaluationCount()).toBe(10);
    });
  });

  // ==================== Prior Distribution Tests ====================

  describe('prior distribution', () => {
    it('should return correct prior when no observations', () => {
      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(posterior.mean).toBe(0);
      expect(posterior.std).toBeCloseTo(Math.sqrt(1.0), 5); // sqrt(outputVariance)
    });

    it('should have UCB equal to 1.0 for no observations', () => {
      const ucb = optimizer.computeUCB([0.5, 0.1, 0.8, 0.4]);

      expect(ucb).toBe(1.0);
    });

    it('should have EI equal to 1.0 for no observations', () => {
      const eiOptimizer = new BayesianOptimizer({ acquisitionType: 'ei' });
      const ei = eiOptimizer.computeEI([0.5, 0.1, 0.8, 0.4]);

      expect(ei).toBe(1.0);
    });
  });
});
