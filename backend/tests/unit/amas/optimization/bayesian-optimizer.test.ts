/**
 * BayesianOptimizer Unit Tests
 * 测试贝叶斯超参数优化器的GP后验和采集函数
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BayesianOptimizer,
  BayesianOptimizerState,
  ParamBound,
  getDefaultParamSpace,
  createAMASOptimizer
} from '../../../../src/amas/optimization/bayesian-optimizer';

describe('BayesianOptimizer', () => {
  let optimizer: BayesianOptimizer;

  const simpleObjective = (params: number[]): number => {
    const [x, y] = params;
    return -((x - 0.5) ** 2 + (y - 0.5) ** 2);
  };

  const simpleParamSpace: ParamBound[] = [
    { name: 'x', min: 0, max: 1 },
    { name: 'y', min: 0, max: 1 }
  ];

  beforeEach(() => {
    optimizer = new BayesianOptimizer({
      paramSpace: simpleParamSpace,
      initialSamples: 3,
      maxEvaluations: 20
    });
  });

  describe('Initialization', () => {
    it('should initialize with zero evaluations', () => {
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('should have no best initially', () => {
      expect(optimizer.getBest()).toBeNull();
    });

    it('should use default param space when not specified', () => {
      const defaultOptimizer = new BayesianOptimizer();
      const space = defaultOptimizer.getParamSpace();

      expect(space.length).toBe(4);
      expect(space[0].name).toBe('alpha');
    });

    it('should accept custom config', () => {
      const customOptimizer = new BayesianOptimizer({
        acquisitionType: 'ei',
        beta: 3.0,
        maxEvaluations: 100
      });

      expect(customOptimizer).toBeDefined();
    });
  });

  describe('Suggestion', () => {
    it('should suggest params within bounds', () => {
      const suggestion = optimizer.suggestNext();

      expect(suggestion[0]).toBeGreaterThanOrEqual(0);
      expect(suggestion[0]).toBeLessThanOrEqual(1);
      expect(suggestion[1]).toBeGreaterThanOrEqual(0);
      expect(suggestion[1]).toBeLessThanOrEqual(1);
    });

    it('should return random samples during initial phase', () => {
      const suggestions = new Set<string>();

      for (let i = 0; i < 3; i++) {
        const suggestion = optimizer.suggestNext();
        suggestions.add(suggestion.join(','));
        optimizer.recordEvaluation(suggestion, simpleObjective(suggestion));
      }

      expect(suggestions.size).toBe(3);
    });

    it('should use GP after initial samples', () => {
      for (let i = 0; i < 5; i++) {
        const suggestion = optimizer.suggestNext();
        optimizer.recordEvaluation(suggestion, simpleObjective(suggestion));
      }

      const suggestion = optimizer.suggestNext();
      expect(suggestion.length).toBe(2);
    });
  });

  describe('Evaluation Recording', () => {
    it('should record evaluation', () => {
      const params = [0.5, 0.5];
      optimizer.recordEvaluation(params, 0.8);

      expect(optimizer.getEvaluationCount()).toBe(1);
    });

    it('should update best', () => {
      optimizer.recordEvaluation([0.3, 0.3], 0.5);
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const best = optimizer.getBest();
      expect(best?.value).toBe(0.8);
      expect(best?.params).toEqual([0.5, 0.5]);
    });

    it('should throw on dimension mismatch', () => {
      expect(() => {
        optimizer.recordEvaluation([0.5], 0.8);
      }).toThrow();
    });

    it('should keep best as highest value', () => {
      optimizer.recordEvaluation([0.5, 0.5], 0.9);
      optimizer.recordEvaluation([0.3, 0.3], 0.7);
      optimizer.recordEvaluation([0.7, 0.7], 0.8);

      const best = optimizer.getBest();
      expect(best?.value).toBe(0.9);
    });
  });

  describe('Posterior', () => {
    it('should return prior for no observations', () => {
      const posterior = optimizer.getPosterior([0.5, 0.5]);

      expect(posterior.mean).toBe(0);
      expect(posterior.std).toBeGreaterThan(0);
    });

    it('should update posterior after observations', () => {
      optimizer.recordEvaluation([0.5, 0.5], 0.8);
      optimizer.recordEvaluation([0.3, 0.3], 0.6);
      optimizer.recordEvaluation([0.7, 0.7], 0.7);

      const posterior = optimizer.getPosterior([0.5, 0.5]);

      expect(posterior.mean).not.toBe(0);
    });

    it('should have lower variance near observations', () => {
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const nearPosterior = optimizer.getPosterior([0.5, 0.5]);
      const farPosterior = optimizer.getPosterior([0.1, 0.9]);

      expect(nearPosterior.variance).toBeLessThan(farPosterior.variance);
    });
  });

  describe('Acquisition Functions', () => {
    it('should compute UCB', () => {
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const ucb = optimizer.computeUCB([0.5, 0.5]);

      expect(typeof ucb).toBe('number');
      expect(Number.isFinite(ucb)).toBe(true);
    });

    it('should compute EI', () => {
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const ei = optimizer.computeEI([0.5, 0.5]);

      expect(typeof ei).toBe('number');
      expect(Number.isFinite(ei)).toBe(true);
      expect(ei).toBeGreaterThanOrEqual(0);
    });

    it('should return high value for unexplored regions', () => {
      optimizer.recordEvaluation([0.1, 0.1], 0.5);

      const exploredUCB = optimizer.computeUCB([0.1, 0.1]);
      const unexploredUCB = optimizer.computeUCB([0.9, 0.9]);

      expect(unexploredUCB).toBeGreaterThan(exploredUCB);
    });
  });

  describe('Batch Suggestion', () => {
    it('should suggest multiple points', () => {
      for (let i = 0; i < 3; i++) {
        const suggestion = optimizer.suggestNext();
        optimizer.recordEvaluation(suggestion, simpleObjective(suggestion));
      }

      const batch = optimizer.suggestBatch(3);

      expect(batch.length).toBe(3);
      batch.forEach(suggestion => {
        expect(suggestion.length).toBe(2);
      });
    });

    it('should suggest diverse points', () => {
      for (let i = 0; i < 5; i++) {
        const suggestion = optimizer.suggestNext();
        optimizer.recordEvaluation(suggestion, simpleObjective(suggestion));
      }

      const batch = optimizer.suggestBatch(3);
      const points = batch.map(p => p.join(','));
      const uniquePoints = new Set(points);

      expect(uniquePoints.size).toBe(3);
    });
  });

  describe('Stopping Condition', () => {
    it('should not stop initially', () => {
      expect(optimizer.shouldStop()).toBe(false);
    });

    it('should stop after max evaluations', () => {
      for (let i = 0; i < 20; i++) {
        const suggestion = optimizer.suggestNext();
        optimizer.recordEvaluation(suggestion, Math.random());
      }

      expect(optimizer.shouldStop()).toBe(true);
    });
  });

  describe('Observations', () => {
    it('should return observation history', () => {
      optimizer.recordEvaluation([0.3, 0.3], 0.6);
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const observations = optimizer.getObservations();

      expect(observations.length).toBe(2);
      expect(observations[0].params).toEqual([0.3, 0.3]);
      expect(observations[0].value).toBe(0.6);
    });
  });

  describe('Parameter Conversion', () => {
    it('should convert params to object', () => {
      const obj = optimizer.paramsToObject([0.5, 0.7]);

      expect(obj.x).toBe(0.5);
      expect(obj.y).toBe(0.7);
    });

    it('should convert object to params', () => {
      const params = optimizer.objectToParams({ x: 0.5, y: 0.7 });

      expect(params).toEqual([0.5, 0.7]);
    });

    it('should use default for missing keys', () => {
      const params = optimizer.objectToParams({ x: 0.5 });

      expect(params[0]).toBe(0.5);
      expect(params[1]).toBe(0.5);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      optimizer.recordEvaluation([0.3, 0.3], 0.6);
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const state = optimizer.getState();

      expect(state.version).toBeDefined();
      expect(state.observations.length).toBe(2);
      expect(state.best?.value).toBe(0.8);
      expect(state.evaluationCount).toBe(2);
    });

    it('should restore state correctly', () => {
      optimizer.recordEvaluation([0.3, 0.3], 0.6);
      optimizer.recordEvaluation([0.5, 0.5], 0.8);

      const state = optimizer.getState();
      const newOptimizer = new BayesianOptimizer({ paramSpace: simpleParamSpace });
      newOptimizer.setState(state);

      expect(newOptimizer.getEvaluationCount()).toBe(2);
      expect(newOptimizer.getBest()?.value).toBe(0.8);
    });

    it('should rebuild best from observations if missing', () => {
      const state: BayesianOptimizerState = {
        version: '1.0.0',
        observations: [
          { params: [0.3, 0.3], value: 0.6, timestamp: Date.now() },
          { params: [0.5, 0.5], value: 0.9, timestamp: Date.now() }
        ],
        best: null,
        evaluationCount: 2
      };

      const newOptimizer = new BayesianOptimizer({ paramSpace: simpleParamSpace });
      newOptimizer.setState(state);

      expect(newOptimizer.getBest()?.value).toBe(0.9);
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        optimizer.setState(null as unknown as BayesianOptimizerState);
      }).not.toThrow();
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      optimizer.recordEvaluation([0.5, 0.5], 0.8);
      optimizer.recordEvaluation([0.3, 0.3], 0.6);

      optimizer.reset();

      expect(optimizer.getEvaluationCount()).toBe(0);
      expect(optimizer.getBest()).toBeNull();
      expect(optimizer.getObservations().length).toBe(0);
    });
  });

  describe('Convenience Functions', () => {
    it('getDefaultParamSpace should return AMAS param space', () => {
      const space = getDefaultParamSpace();

      expect(space.length).toBe(4);
      expect(space.map(p => p.name)).toEqual([
        'alpha',
        'fatigueK',
        'motivationRho',
        'optimalDifficulty'
      ]);
    });

    it('createAMASOptimizer should create configured optimizer', () => {
      const amasOptimizer = createAMASOptimizer(30);

      const space = amasOptimizer.getParamSpace();
      expect(space[0].name).toBe('alpha');
    });
  });

  describe('Discretization', () => {
    it('should discretize suggestions when step is specified', () => {
      const discreteOptimizer = new BayesianOptimizer({
        paramSpace: [
          { name: 'x', min: 0, max: 1, step: 0.1 },
          { name: 'y', min: 0, max: 1, step: 0.2 }
        ],
        initialSamples: 3
      });

      for (let i = 0; i < 5; i++) {
        const suggestion = discreteOptimizer.suggestNext();
        discreteOptimizer.recordEvaluation(suggestion, Math.random());

        const xRemainder = (suggestion[0] * 10) % 1;
        const yRemainder = (suggestion[1] * 5) % 1;

        expect(xRemainder).toBeCloseTo(0, 5);
        expect(yRemainder).toBeCloseTo(0, 5);
      }
    });
  });

  describe('Optimization Quality', () => {
    it('should find good solution for simple problem', () => {
      for (let i = 0; i < 15; i++) {
        const suggestion = optimizer.suggestNext();
        const value = simpleObjective(suggestion);
        optimizer.recordEvaluation(suggestion, value);
      }

      const best = optimizer.getBest();
      expect(best).not.toBeNull();
      expect(best!.value).toBeGreaterThan(-0.1);
    });
  });

  describe('EI Acquisition', () => {
    it('should use EI when configured', () => {
      const eiOptimizer = new BayesianOptimizer({
        paramSpace: simpleParamSpace,
        acquisitionType: 'ei',
        initialSamples: 3
      });

      for (let i = 0; i < 5; i++) {
        const suggestion = eiOptimizer.suggestNext();
        eiOptimizer.recordEvaluation(suggestion, simpleObjective(suggestion));
      }

      const ei = eiOptimizer.computeEI([0.5, 0.5]);
      expect(ei).toBeGreaterThanOrEqual(0);
    });
  });
});
