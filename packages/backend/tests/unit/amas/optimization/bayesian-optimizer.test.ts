/**
 * BayesianOptimizer Unit Tests
 *
 * Tests for the Gaussian Process based hyperparameter optimization module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  BayesianOptimizer,
  BayesianOptimizerConfig,
  ParamBound,
  getDefaultParamSpace,
  createAMASOptimizer
} from '../../../../src/amas/optimization/bayesian-optimizer';

describe('BayesianOptimizer', () => {
  let optimizer: BayesianOptimizer;

  beforeEach(() => {
    optimizer = new BayesianOptimizer();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(optimizer).toBeDefined();
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('should accept custom param space', () => {
      const customSpace: ParamBound[] = [
        { name: 'param1', min: 0, max: 1 },
        { name: 'param2', min: -1, max: 1, step: 0.1 }
      ];

      const customOptimizer = new BayesianOptimizer({ paramSpace: customSpace });
      const space = customOptimizer.getParamSpace();

      expect(space.length).toBe(2);
      expect(space[0].name).toBe('param1');
    });

    it('should accept UCB acquisition type', () => {
      const ucbOptimizer = new BayesianOptimizer({ acquisitionType: 'ucb' });
      expect(ucbOptimizer).toBeDefined();
    });

    it('should accept EI acquisition type', () => {
      const eiOptimizer = new BayesianOptimizer({ acquisitionType: 'ei' });
      expect(eiOptimizer).toBeDefined();
    });

    it('should accept custom beta parameter', () => {
      const customOptimizer = new BayesianOptimizer({ beta: 3.0 });
      expect(customOptimizer).toBeDefined();
    });
  });

  // ==================== suggestNext Tests ====================

  describe('suggestNext', () => {
    it('should return random sample during initial phase', () => {
      const suggestion = optimizer.suggestNext();

      expect(suggestion).toBeInstanceOf(Array);
      expect(suggestion.length).toBe(4); // Default AMAS param space has 4 dimensions
    });

    it('should return samples within bounds', () => {
      const space = optimizer.getParamSpace();

      for (let i = 0; i < 10; i++) {
        const suggestion = optimizer.suggestNext();

        suggestion.forEach((value, idx) => {
          expect(value).toBeGreaterThanOrEqual(space[idx].min);
          expect(value).toBeLessThanOrEqual(space[idx].max);
        });
      }
    });

    it('should use GP after initial samples', () => {
      // Add initial samples
      for (let i = 0; i < 6; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random());
      }

      // Now it should use GP
      const suggestion = optimizer.suggestNext();
      expect(suggestion).toBeInstanceOf(Array);
    });

    it('should discretize values when step is specified', () => {
      const space: ParamBound[] = [
        { name: 'discrete', min: 0, max: 1, step: 0.1 }
      ];

      const customOptimizer = new BayesianOptimizer({ paramSpace: space });

      for (let i = 0; i < 10; i++) {
        const suggestion = customOptimizer.suggestNext();
        // Value should be a multiple of 0.1
        const value = suggestion[0];
        const remainder = (value * 10) % 1;
        expect(Math.abs(remainder)).toBeLessThan(0.001);
      }
    });
  });

  // ==================== recordEvaluation Tests ====================

  describe('recordEvaluation', () => {
    it('should record evaluation', () => {
      const params = [0.5, 0.1, 0.8, 0.4];
      optimizer.recordEvaluation(params, 0.75);

      expect(optimizer.getEvaluationCount()).toBe(1);
    });

    it('should throw error for dimension mismatch', () => {
      expect(() => {
        optimizer.recordEvaluation([0.5, 0.1], 0.75); // Wrong dimension
      }).toThrow('参数维度不匹配');
    });

    it('should update best when better value found', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.5);
      optimizer.recordEvaluation([0.6, 0.15, 0.85, 0.5], 0.8);

      const best = optimizer.getBest();

      expect(best?.value).toBe(0.8);
    });

    it('should not update best when worse value found', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.8);
      optimizer.recordEvaluation([0.6, 0.15, 0.85, 0.5], 0.5);

      const best = optimizer.getBest();

      expect(best?.value).toBe(0.8);
    });
  });

  // ==================== getBest Tests ====================

  describe('getBest', () => {
    it('should return null when no evaluations', () => {
      const best = optimizer.getBest();

      expect(best).toBeNull();
    });

    it('should return best params and value', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      optimizer.recordEvaluation([0.7, 0.12, 0.75, 0.5], 0.9);
      optimizer.recordEvaluation([0.6, 0.11, 0.82, 0.45], 0.7);

      const best = optimizer.getBest();

      expect(best).not.toBeNull();
      expect(best?.value).toBe(0.9);
      expect(best?.params).toEqual([0.7, 0.12, 0.75, 0.5]);
    });

    it('should return copy of params', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);

      const best1 = optimizer.getBest();
      const best2 = optimizer.getBest();

      expect(best1?.params).toEqual(best2?.params);
      expect(best1?.params).not.toBe(best2?.params); // Different references
    });
  });

  // ==================== getPosterior Tests ====================

  describe('getPosterior', () => {
    it('should return prior when no observations', () => {
      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(posterior.mean).toBe(0);
      expect(posterior.std).toBeGreaterThan(0);
    });

    it('should return posterior after observations', () => {
      // Add observations
      for (let i = 0; i < 6; i++) {
        optimizer.recordEvaluation(
          [0.5 + i * 0.05, 0.1 + i * 0.01, 0.8, 0.4],
          0.5 + i * 0.1
        );
      }

      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(posterior).toHaveProperty('mean');
      expect(posterior).toHaveProperty('std');
      expect(posterior).toHaveProperty('variance');
      expect(posterior.variance).toBeCloseTo(posterior.std ** 2, 5);
    });
  });

  // ==================== computeAcquisition Tests ====================

  describe('computeAcquisition', () => {
    it('should compute UCB by default', () => {
      const acq = optimizer.computeAcquisition([0.5, 0.1, 0.8, 0.4]);

      expect(typeof acq).toBe('number');
      expect(acq).toBe(1.0); // No observations, encourages exploration
    });

    it('should compute EI when configured', () => {
      const eiOptimizer = new BayesianOptimizer({ acquisitionType: 'ei' });

      const acq = eiOptimizer.computeAcquisition([0.5, 0.1, 0.8, 0.4]);

      expect(typeof acq).toBe('number');
    });

    it('should return meaningful UCB after observations', () => {
      for (let i = 0; i < 6; i++) {
        optimizer.recordEvaluation(
          [0.5 + i * 0.1, 0.1, 0.8, 0.4],
          i * 0.1
        );
      }

      const acq1 = optimizer.computeUCB([0.5, 0.1, 0.8, 0.4]);
      const acq2 = optimizer.computeUCB([1.0, 0.1, 0.8, 0.4]);

      // Both should be finite numbers
      expect(Number.isFinite(acq1)).toBe(true);
      expect(Number.isFinite(acq2)).toBe(true);
    });

    it('should return meaningful EI after observations', () => {
      const eiOptimizer = new BayesianOptimizer({ acquisitionType: 'ei' });

      for (let i = 0; i < 6; i++) {
        eiOptimizer.recordEvaluation(
          [0.5 + i * 0.1, 0.1, 0.8, 0.4],
          i * 0.1
        );
      }

      const acq = eiOptimizer.computeEI([0.5, 0.1, 0.8, 0.4]);

      expect(Number.isFinite(acq)).toBe(true);
    });
  });

  // ==================== suggestBatch Tests ====================

  describe('suggestBatch', () => {
    it('should return requested number of suggestions', () => {
      const batch = optimizer.suggestBatch(3);

      expect(batch.length).toBe(3);
      batch.forEach(suggestion => {
        expect(suggestion.length).toBe(4);
      });
    });

    it('should return diverse suggestions', () => {
      const batch = optimizer.suggestBatch(5);

      // Check that not all suggestions are identical
      const firstSuggestion = JSON.stringify(batch[0]);
      const allSame = batch.every(s => JSON.stringify(s) === firstSuggestion);

      expect(allSame).toBe(false);
    });
  });

  // ==================== shouldStop Tests ====================

  describe('shouldStop', () => {
    it('should not stop initially', () => {
      expect(optimizer.shouldStop()).toBe(false);
    });

    it('should stop after max evaluations', () => {
      const smallOptimizer = new BayesianOptimizer({ maxEvaluations: 5 });

      for (let i = 0; i < 5; i++) {
        smallOptimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], Math.random());
      }

      expect(smallOptimizer.shouldStop()).toBe(true);
    });
  });

  // ==================== getObservations Tests ====================

  describe('getObservations', () => {
    it('should return empty array initially', () => {
      const obs = optimizer.getObservations();

      expect(obs).toEqual([]);
    });

    it('should return all observations', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      optimizer.recordEvaluation([0.6, 0.12, 0.75, 0.5], 0.7);

      const obs = optimizer.getObservations();

      expect(obs.length).toBe(2);
      expect(obs[0]).toHaveProperty('params');
      expect(obs[0]).toHaveProperty('value');
      expect(obs[0]).toHaveProperty('timestamp');
    });

    it('should return copies of observations', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);

      const obs1 = optimizer.getObservations();
      const obs2 = optimizer.getObservations();

      expect(obs1[0].params).toEqual(obs2[0].params);
      expect(obs1[0].params).not.toBe(obs2[0].params); // Different references
    });
  });

  // ==================== Parameter Conversion Tests ====================

  describe('paramsToObject', () => {
    it('should convert params array to named object', () => {
      const params = [1.0, 0.08, 0.85, 0.5];
      const obj = optimizer.paramsToObject(params);

      expect(obj.alpha).toBe(1.0);
      expect(obj.fatigueK).toBe(0.08);
      expect(obj.motivationRho).toBe(0.85);
      expect(obj.optimalDifficulty).toBe(0.5);
    });
  });

  describe('objectToParams', () => {
    it('should convert named object to params array', () => {
      const obj = {
        alpha: 1.0,
        fatigueK: 0.08,
        motivationRho: 0.85,
        optimalDifficulty: 0.5
      };

      const params = optimizer.objectToParams(obj);

      expect(params).toEqual([1.0, 0.08, 0.85, 0.5]);
    });

    it('should use midpoint for missing values', () => {
      const obj = { alpha: 1.0 };
      const params = optimizer.objectToParams(obj);

      expect(params[0]).toBe(1.0);
      // Other values should be midpoints
      expect(params.length).toBe(4);
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should export state', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);

      const state = optimizer.getState();

      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('observations');
      expect(state).toHaveProperty('best');
      expect(state).toHaveProperty('evaluationCount');
    });

    it('should import state', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      optimizer.recordEvaluation([0.6, 0.12, 0.75, 0.5], 0.8);

      const state = optimizer.getState();

      const newOptimizer = new BayesianOptimizer();
      newOptimizer.setState(state);

      expect(newOptimizer.getEvaluationCount()).toBe(2);
      expect(newOptimizer.getBest()?.value).toBe(0.8);
    });

    it('should handle invalid state gracefully', () => {
      // @ts-ignore - Testing invalid input
      optimizer.setState(null);

      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('should rebuild best from observations if missing', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      optimizer.recordEvaluation([0.6, 0.12, 0.75, 0.5], 0.9);

      const state = optimizer.getState();
      state.best = null; // Simulate missing best

      const newOptimizer = new BayesianOptimizer();
      newOptimizer.setState(state);

      expect(newOptimizer.getBest()?.value).toBe(0.9);
    });
  });

  // ==================== reset Tests ====================

  describe('reset', () => {
    it('should clear all data', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.6);
      optimizer.recordEvaluation([0.6, 0.12, 0.75, 0.5], 0.8);

      optimizer.reset();

      expect(optimizer.getEvaluationCount()).toBe(0);
      expect(optimizer.getBest()).toBeNull();
      expect(optimizer.getObservations()).toEqual([]);
    });
  });

  // ==================== Optimization Quality Tests ====================

  describe('optimization quality', () => {
    it('should find good solution for simple function', () => {
      // Simple quadratic: maximize -(x - 0.7)^2
      const simpleSpace: ParamBound[] = [{ name: 'x', min: 0, max: 1 }];

      const simpleOptimizer = new BayesianOptimizer({
        paramSpace: simpleSpace,
        maxEvaluations: 20
      });

      // Run optimization
      for (let i = 0; i < 20; i++) {
        const params = simpleOptimizer.suggestNext();
        const x = params[0];
        const value = -Math.pow(x - 0.7, 2);
        simpleOptimizer.recordEvaluation(params, value);
      }

      const best = simpleOptimizer.getBest();

      // Should find value close to 0.7
      expect(best).not.toBeNull();
      expect(Math.abs(best!.params[0] - 0.7)).toBeLessThan(0.2);
    });
  });

  // ==================== Numerical Stability Tests ====================

  describe('numerical stability', () => {
    it('should handle many observations without NaN', () => {
      for (let i = 0; i < 50; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random());
      }

      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(Number.isFinite(posterior.mean)).toBe(true);
      expect(Number.isFinite(posterior.std)).toBe(true);
    });

    it('should handle nearly identical observations', () => {
      // Add very similar observations
      for (let i = 0; i < 10; i++) {
        optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.5 + i * 0.001);
      }

      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);

      expect(Number.isFinite(posterior.mean)).toBe(true);
    });
  });
});

// ==================== Helper Function Tests ====================

describe('getDefaultParamSpace', () => {
  it('should return default AMAS param space', () => {
    const space = getDefaultParamSpace();

    expect(space.length).toBe(4);
    expect(space.map(p => p.name)).toContain('alpha');
    expect(space.map(p => p.name)).toContain('fatigueK');
    expect(space.map(p => p.name)).toContain('motivationRho');
    expect(space.map(p => p.name)).toContain('optimalDifficulty');
  });

  it('should return copy of space', () => {
    const space1 = getDefaultParamSpace();
    const space2 = getDefaultParamSpace();

    expect(space1).toEqual(space2);
    expect(space1).not.toBe(space2);
  });
});

describe('createAMASOptimizer', () => {
  it('should create optimizer with AMAS defaults', () => {
    const optimizer = createAMASOptimizer();

    expect(optimizer).toBeInstanceOf(BayesianOptimizer);
    expect(optimizer.getParamSpace().length).toBe(4);
  });

  it('should accept custom max evaluations', () => {
    const optimizer = createAMASOptimizer(100);

    // Record 99 evaluations
    for (let i = 0; i < 99; i++) {
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, Math.random());
    }

    expect(optimizer.shouldStop()).toBe(false);

    optimizer.recordEvaluation(optimizer.suggestNext(), Math.random());
    expect(optimizer.shouldStop()).toBe(true);
  });
});
