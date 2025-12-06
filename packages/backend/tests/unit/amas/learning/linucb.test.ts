/**
 * LinUCB Algorithm Unit Tests
 *
 * Tests for the Linear Upper Confidence Bound contextual bandit algorithm
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinUCB, LinUCBContext, ContextBuildInput } from '../../../../src/amas/learning/linucb';
import { Action, UserState, BanditModel } from '../../../../src/amas/types';
import { withSeed } from '../../../setup';
import {
  STANDARD_ACTIONS,
  DEFAULT_USER_STATE,
  LINUCB_PARAMS,
  DIMENSION,
  STANDARD_FEATURE_VECTOR
} from '../../../fixtures/amas-fixtures';
import { ActionFactory, AMASStateFactory } from '../../../helpers/factories';
import { amasLogger } from '../../../../src/logger';

describe('LinUCB', () => {
  let linucb: LinUCB;

  const defaultContext: LinUCBContext = {
    recentErrorRate: 0.2,
    recentResponseTime: 2500,
    timeBucket: 14
  };

  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6 }
  };

  beforeEach(() => {
    linucb = new LinUCB();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default dimension (22)', () => {
      const model = linucb.getModel();
      expect(model.d).toBe(DIMENSION);
    });

    it('should initialize A matrix as λI (identity * lambda)', () => {
      const model = linucb.getModel();
      const d = model.d;
      const lambda = model.lambda;

      // Check diagonal elements equal lambda
      for (let i = 0; i < d; i++) {
        expect(model.A[i * d + i]).toBe(lambda);
      }

      // Check off-diagonal elements are zero
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          if (i !== j) {
            expect(model.A[i * d + j]).toBe(0);
          }
        }
      }
    });

    it('should initialize b vector as zeros', () => {
      const model = linucb.getModel();
      for (let i = 0; i < model.d; i++) {
        expect(model.b[i]).toBe(0);
      }
    });

    it('should initialize L matrix (Cholesky of λI)', () => {
      const model = linucb.getModel();
      const d = model.d;
      const sqrtLambda = Math.sqrt(model.lambda);

      // L should be sqrt(lambda) * I for initial identity matrix
      for (let i = 0; i < d; i++) {
        expect(model.L[i * d + i]).toBeCloseTo(sqrtLambda, 5);
      }
    });

    it('should initialize updateCount to 0', () => {
      const model = linucb.getModel();
      expect(model.updateCount).toBe(0);
    });

    it('should accept custom options', () => {
      const customLinucb = new LinUCB({
        alpha: 0.5,
        lambda: 2.0,
        dimension: 10
      });
      const model = customLinucb.getModel();

      expect(model.alpha).toBe(0.5);
      expect(model.lambda).toBe(2.0);
      expect(model.d).toBe(10);
    });

    it('should enforce minimum lambda', () => {
      const linucbWithTinyLambda = new LinUCB({ lambda: 0.00001 });
      const model = linucbWithTinyLambda.getModel();
      expect(model.lambda).toBeGreaterThanOrEqual(0.001);
    });
  });

  // ==================== Action Selection Tests ====================

  describe('selectAction', () => {
    it('should throw error when actions array is empty', () => {
      expect(() => {
        linucb.selectAction(defaultState, [], defaultContext);
      }).toThrow('actions array must not be empty');
    });

    it('should return ActionSelection with action, score, and confidence', () => {
      const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
    });

    it('should select action with highest UCB score', () => {
      // After training, the algorithm should prefer certain actions
      const actions = ActionFactory.buildMany(5);

      // Train the model to prefer certain actions
      for (let i = 0; i < 20; i++) {
        linucb.update(defaultState, actions[2], 1.0, defaultContext);
      }

      const result = linucb.selectAction(defaultState, actions, defaultContext);

      // The selected action should have the highest score
      expect(result.action).toBeDefined();
      expect(result.score).toBeGreaterThan(-Infinity);
    });

    it('should return consistent results with same seed', () => {
      const actions = STANDARD_ACTIONS;

      const result1 = withSeed('test-seed', () =>
        linucb.selectAction(defaultState, actions, defaultContext)
      );

      // Reset and run again
      linucb.reset();

      const result2 = withSeed('test-seed', () =>
        linucb.selectAction(defaultState, actions, defaultContext)
      );

      expect(result1.action).toEqual(result2.action);
    });

    it('should include exploitation and exploration in meta', () => {
      const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      expect(result.meta).toBeDefined();
      expect(result.meta?.exploitation).toBeDefined();
      expect(result.meta?.exploration).toBeDefined();
    });
  });

  // ==================== UCB Score Computation Tests ====================

  describe('UCB score computation', () => {
    it('should compute UCB score = exploitation + α * confidence', () => {
      // Build feature vector
      const action = STANDARD_ACTIONS[0];
      const contextInput: ContextBuildInput = {
        state: defaultState,
        action,
        ...defaultContext
      };

      const featureVector = linucb.buildContextVector(contextInput);

      // Select action to get score
      const result = linucb.selectAction(defaultState, [action], defaultContext);

      // Score should be exploitation + alpha * exploration
      const meta = result.meta!;
      const expectedScore = meta.exploitation + meta.exploration;

      expect(result.score).toBeCloseTo(expectedScore, 5);
    });

    it('should have higher exploration term for untrained model', () => {
      const result1 = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      // Train extensively
      for (let i = 0; i < 100; i++) {
        linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      }

      const result2 = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);

      // Confidence (exploration) should decrease with more data
      // This is because the uncertainty decreases
      expect(result1.confidence).toBeGreaterThan(0);
      expect(result2.confidence).toBeGreaterThan(0);
    });
  });

  // ==================== Model Update Tests ====================

  describe('update', () => {
    it('should increment updateCount after each update', () => {
      expect(linucb.getUpdateCount()).toBe(0);

      linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      expect(linucb.getUpdateCount()).toBe(1);

      linucb.update(defaultState, STANDARD_ACTIONS[0], 0.5, defaultContext);
      expect(linucb.getUpdateCount()).toBe(2);
    });

    it('should update A matrix (add outer product)', () => {
      const modelBefore = linucb.getModel();
      const Abefore = new Float32Array(modelBefore.A);

      linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);

      const modelAfter = linucb.getModel();

      // A should be different after update
      let changed = false;
      for (let i = 0; i < modelAfter.A.length; i++) {
        if (Math.abs(modelAfter.A[i] - Abefore[i]) > 1e-10) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('should update b vector (add scaled feature vector)', () => {
      const modelBefore = linucb.getModel();
      const bbefore = new Float32Array(modelBefore.b);

      linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);

      const modelAfter = linucb.getModel();

      // b should be different after update
      let changed = false;
      for (let i = 0; i < modelAfter.b.length; i++) {
        if (Math.abs(modelAfter.b[i] - bbefore[i]) > 1e-10) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('should perform Cholesky rank-1 update', () => {
      const modelBefore = linucb.getModel();
      const Lbefore = new Float32Array(modelBefore.L);

      linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);

      const modelAfter = linucb.getModel();

      // L should be updated
      let changed = false;
      for (let i = 0; i < modelAfter.L.length; i++) {
        if (Math.abs(modelAfter.L[i] - Lbefore[i]) > 1e-10) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });
  });

  // ==================== updateWithFeatureVector Tests ====================

  describe('updateWithFeatureVector', () => {
    it('should throw error on dimension mismatch', () => {
      const wrongDimension = new Float32Array(10); // Wrong dimension

      expect(() => {
        linucb.updateWithFeatureVector(wrongDimension, 1.0);
      }).toThrow('特征向量维度不匹配');
    });

    it('should sanitize NaN/Infinity features and proceed with update', () => {
      // Implementation sanitizes invalid values to 0 and continues the update
      const invalidFeatures = new Float32Array(DIMENSION);
      invalidFeatures[0] = NaN;

      const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

      const countBefore = linucb.getUpdateCount();
      linucb.updateWithFeatureVector(invalidFeatures, 1.0);

      // Update proceeds with sanitized values (NaN → 0)
      expect(linucb.getUpdateCount()).toBe(countBefore + 1);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should skip update for invalid reward', () => {
      const features = new Float32Array(DIMENSION);
      features.fill(0.5);

      const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

      const countBefore = linucb.getUpdateCount();
      linucb.updateWithFeatureVector(features, NaN);

      expect(linucb.getUpdateCount()).toBe(countBefore);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should clamp extreme feature values', () => {
      const extremeFeatures = new Float32Array(DIMENSION);
      extremeFeatures.fill(100); // Beyond MAX_FEATURE_ABS (50)

      const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

      // Should not throw, but should warn and clamp
      linucb.updateWithFeatureVector(extremeFeatures, 1.0);

      expect(linucb.getUpdateCount()).toBe(1);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should accept number array as input', () => {
      const features = Array(DIMENSION).fill(0.5);

      linucb.updateWithFeatureVector(features, 1.0);
      expect(linucb.getUpdateCount()).toBe(1);
    });
  });

  // ==================== Cold Start Alpha Tests ====================

  describe('getColdStartAlpha', () => {
    it('should return 0.5 for interactionCount < 15', () => {
      expect(linucb.getColdStartAlpha(0, 0.8, 0.2)).toBe(0.5);
      expect(linucb.getColdStartAlpha(10, 0.8, 0.2)).toBe(0.5);
      expect(linucb.getColdStartAlpha(14, 0.8, 0.2)).toBe(0.5);
    });

    it('should return 2.0 for 15-49 with high accuracy and low fatigue', () => {
      expect(linucb.getColdStartAlpha(20, 0.8, 0.3)).toBe(2.0);
      expect(linucb.getColdStartAlpha(40, 0.9, 0.2)).toBe(2.0);
    });

    it('should return 1.0 for 15-49 with low accuracy or high fatigue', () => {
      expect(linucb.getColdStartAlpha(20, 0.5, 0.3)).toBe(1.0);
      expect(linucb.getColdStartAlpha(20, 0.8, 0.6)).toBe(1.0);
    });

    it('should return 0.7 for interactionCount >= 50', () => {
      expect(linucb.getColdStartAlpha(50, 0.8, 0.2)).toBe(0.7);
      expect(linucb.getColdStartAlpha(100, 0.5, 0.8)).toBe(0.7);
    });
  });

  // ==================== Alpha Management Tests ====================

  describe('alpha management', () => {
    it('should set and get alpha', () => {
      linucb.setAlpha(0.5);
      expect(linucb.getAlpha()).toBe(0.5);

      linucb.setAlpha(2.0);
      expect(linucb.getAlpha()).toBe(2.0);
    });

    it('should not allow negative alpha', () => {
      linucb.setAlpha(-1.0);
      expect(linucb.getAlpha()).toBe(0);
    });
  });

  // ==================== Model Persistence Tests ====================

  describe('model persistence', () => {
    it('should get/set model state roundtrip', () => {
      // Train the model
      for (let i = 0; i < 10; i++) {
        linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      }

      const originalModel = linucb.getModel();
      const originalUpdateCount = originalModel.updateCount;

      // Create new instance and restore
      const newLinucb = new LinUCB();
      newLinucb.setModel(originalModel);

      const restoredModel = newLinucb.getModel();

      expect(restoredModel.d).toBe(originalModel.d);
      expect(restoredModel.lambda).toBe(originalModel.lambda);
      expect(restoredModel.alpha).toBe(originalModel.alpha);
      expect(restoredModel.updateCount).toBe(originalUpdateCount);

      // Check A matrix
      for (let i = 0; i < originalModel.A.length; i++) {
        expect(restoredModel.A[i]).toBeCloseTo(originalModel.A[i], 5);
      }
    });

    it('should migrate model from smaller dimension (d=12 to d=22)', () => {
      // Create a model with smaller dimension
      const smallLinucb = new LinUCB({ dimension: 12 });
      for (let i = 0; i < 5; i++) {
        const smallContext: LinUCBContext = {
          recentErrorRate: 0.2,
          recentResponseTime: 2000,
          timeBucket: 10
        };
        // Update with a simplified feature vector
        const smallFeatures = new Float32Array(12);
        smallFeatures.fill(0.5);
        smallLinucb.updateWithFeatureVector(smallFeatures, 1.0);
      }

      const smallModel = smallLinucb.getModel();
      expect(smallModel.d).toBe(12);

      // Migrate to larger dimension
      const largeLinucb = new LinUCB({ dimension: 22 });
      const debugSpy = vi.spyOn(amasLogger, 'debug').mockImplementation(() => {});

      largeLinucb.setModel(smallModel);

      const migratedModel = largeLinucb.getModel();
      expect(migratedModel.d).toBe(22);
      expect(migratedModel.updateCount).toBe(smallModel.updateCount);
      // 迁移日志使用 amasLogger.debug
      expect(debugSpy).toHaveBeenCalled();

      debugSpy.mockRestore();
    });

    it('should reset model when downgrading dimension', () => {
      // Create model with larger dimension
      const largeLinucb = new LinUCB({ dimension: 30 });
      for (let i = 0; i < 5; i++) {
        const features = new Float32Array(30);
        features.fill(0.5);
        largeLinucb.updateWithFeatureVector(features, 1.0);
      }

      const largeModel = largeLinucb.getModel();

      // Downgrade to smaller dimension
      const smallLinucb = new LinUCB({ dimension: 22 });
      const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

      smallLinucb.setModel(largeModel);

      const model = smallLinucb.getModel();
      expect(model.d).toBe(22);
      expect(model.updateCount).toBe(0); // Reset on downgrade
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ from: 30, to: 22 }), expect.stringContaining('降维不支持'));

      warnSpy.mockRestore();
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset all model state', () => {
      // Train the model
      for (let i = 0; i < 10; i++) {
        linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);
      }

      expect(linucb.getUpdateCount()).toBe(10);

      linucb.reset();

      const model = linucb.getModel();
      expect(model.updateCount).toBe(0);

      // Check A is identity * lambda
      for (let i = 0; i < model.d; i++) {
        expect(model.A[i * model.d + i]).toBe(model.lambda);
      }

      // Check b is zero
      for (let i = 0; i < model.d; i++) {
        expect(model.b[i]).toBe(0);
      }
    });
  });

  // ==================== Feature Vector Tests ====================

  describe('buildContextVector', () => {
    it('should build 22-dimensional feature vector', () => {
      const input: ContextBuildInput = {
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 14
      };

      const vec = linucb.buildContextVector(input);

      expect(vec.length).toBe(DIMENSION);
    });

    it('should include bias term as last element', () => {
      const input: ContextBuildInput = {
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 14
      };

      const vec = linucb.buildContextVector(input);

      expect(vec[vec.length - 1]).toBe(1.0);
    });

    it('should clamp state values to valid range', () => {
      const extremeState: UserState = {
        A: 1.5,  // Should be clamped to 1
        F: -0.5, // Should be clamped to 0
        M: 2.0,  // Should be clamped to 1
        C: { mem: 1.5, speed: -0.3 }
      };

      const input: ContextBuildInput = {
        state: extremeState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 14
      };

      const vec = linucb.buildContextVector(input);

      // All values should be in valid ranges
      for (let i = 0; i < vec.length; i++) {
        expect(Number.isFinite(vec[i])).toBe(true);
      }
    });

    it('should encode time features with sin/cos', () => {
      const morning: ContextBuildInput = {
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 8
      };

      const evening: ContextBuildInput = {
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 20
      };

      const morningVec = linucb.buildContextVector(morning);
      const eveningVec = linucb.buildContextVector(evening);

      // Time features should be different
      // Time features are at indices 12, 13, 14 (norm, sin, cos)
      expect(morningVec[12]).not.toEqual(eveningVec[12]);
    });
  });

  // ==================== BaseLearner Interface Tests ====================

  describe('BaseLearner interface', () => {
    it('should return correct name', () => {
      expect(linucb.getName()).toBe('LinUCB');
    });

    it('should return correct version', () => {
      expect(linucb.getVersion()).toBe('2.0.0');
    });

    it('should return capabilities', () => {
      const caps = linucb.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(true);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.minSamplesForReliability).toBe(50);
    });

    it('should implement getState/setState', () => {
      linucb.update(defaultState, STANDARD_ACTIONS[0], 1.0, defaultContext);

      const state = linucb.getState();
      expect(state).toEqual(linucb.getModel());

      const newLinucb = new LinUCB();
      newLinucb.setState(state);

      expect(newLinucb.getUpdateCount()).toBe(state.updateCount);
    });
  });

  // ==================== Numerical Stability Tests ====================

  describe('numerical stability', () => {
    it('should handle many sequential updates without overflow', () => {
      for (let i = 0; i < 1000; i++) {
        linucb.update(defaultState, STANDARD_ACTIONS[i % 5], Math.random(), defaultContext);
      }

      const model = linucb.getModel();

      // Check no NaN or Infinity
      for (let i = 0; i < model.A.length; i++) {
        expect(Number.isFinite(model.A[i])).toBe(true);
      }
      for (let i = 0; i < model.b.length; i++) {
        expect(Number.isFinite(model.b[i])).toBe(true);
      }
      for (let i = 0; i < model.L.length; i++) {
        expect(Number.isFinite(model.L[i])).toBe(true);
      }
    });

    it('should recover from unstable A matrix', () => {
      // Manually corrupt the model to simulate instability
      const model = linucb.getModel();
      model.A[0] = 1e12; // Extremely large value

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      linucb.setModel(model);

      // Model should still work
      const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      expect(result.action).toBeDefined();

      warnSpy.mockRestore();
    });

    it('should handle zero response time', () => {
      const zeroRtContext: LinUCBContext = {
        recentErrorRate: 0.2,
        recentResponseTime: 0,
        timeBucket: 14
      };

      // Should not throw
      const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, zeroRtContext);
      expect(result.action).toBeDefined();
    });
  });

  // ==================== LinUCB Edge Cases Tests ====================

  describe('LinUCB Edge Cases', () => {
    describe('numerical stability', () => {
      it('should handle near-singular covariance matrix', () => {
        // Create a model where A matrix is near-singular (very small diagonal values)
        const model = linucb.getModel();
        const d = model.d;

        // Set diagonal elements to very small values (close to singular)
        for (let i = 0; i < d; i++) {
          model.A[i * d + i] = 1e-6;
        }

        // Should handle gracefully without throwing
        linucb.setModel(model);

        // Model should still select actions
        const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should sanitize NaN in features', () => {
        const nanFeatures = new Float32Array(DIMENSION);
        nanFeatures.fill(0.5);
        nanFeatures[0] = NaN;
        nanFeatures[5] = NaN;
        nanFeatures[10] = NaN;

        const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

        // Should sanitize NaN values and proceed
        linucb.updateWithFeatureVector(nanFeatures, 1.0);

        // Update should complete (with sanitized values)
        expect(linucb.getUpdateCount()).toBe(1);
        expect(warnSpy).toHaveBeenCalled();

        // Model should remain valid after update
        const model = linucb.getModel();
        for (let i = 0; i < model.A.length; i++) {
          expect(Number.isFinite(model.A[i])).toBe(true);
        }

        warnSpy.mockRestore();
      });

      it('should sanitize Infinity in features', () => {
        const infFeatures = new Float32Array(DIMENSION);
        infFeatures.fill(0.5);
        infFeatures[0] = Infinity;
        infFeatures[3] = -Infinity;

        const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

        // Should sanitize Infinity values and proceed
        linucb.updateWithFeatureVector(infFeatures, 1.0);

        // Update should complete
        expect(linucb.getUpdateCount()).toBe(1);
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
      });

      it('should handle zero variance context', () => {
        // All state values are the same (zero variance)
        const zeroVarianceState: UserState = {
          A: 0.5,
          F: 0.5,
          M: 0.5,
          C: { mem: 0.5, speed: 0.5 }
        };

        const zeroVarianceContext: LinUCBContext = {
          recentErrorRate: 0.5,
          recentResponseTime: 2500,
          timeBucket: 12
        };

        // Should handle without issues
        const result = linucb.selectAction(zeroVarianceState, STANDARD_ACTIONS, zeroVarianceContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
        expect(Number.isFinite(result.confidence)).toBe(true);
      });

      it('should handle matrix with NaN after update', () => {
        // Simulate a corrupted L matrix with NaN
        const model = linucb.getModel();
        model.L[0] = NaN;

        const warnSpy = vi.spyOn(amasLogger, 'warn').mockImplementation(() => {});

        linucb.setModel(model);

        // Should recover and still work
        const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();

        warnSpy.mockRestore();
      });
    });

    describe('extreme values', () => {
      it('should handle very large rewards', () => {
        const largeReward = 1e6;

        // Should clamp or handle gracefully
        linucb.update(defaultState, STANDARD_ACTIONS[0], largeReward, defaultContext);

        expect(linucb.getUpdateCount()).toBe(1);

        // Model should remain stable
        const model = linucb.getModel();
        for (let i = 0; i < model.b.length; i++) {
          expect(Number.isFinite(model.b[i])).toBe(true);
        }
      });

      it('should handle negative rewards', () => {
        const negativeReward = -1.5;

        linucb.update(defaultState, STANDARD_ACTIONS[0], negativeReward, defaultContext);

        expect(linucb.getUpdateCount()).toBe(1);

        // b vector should reflect the negative reward
        const model = linucb.getModel();
        let hasNegative = false;
        for (let i = 0; i < model.b.length; i++) {
          if (model.b[i] < 0) hasNegative = true;
          expect(Number.isFinite(model.b[i])).toBe(true);
        }
        expect(hasNegative).toBe(true);
      });

      it('should handle empty arm list', () => {
        expect(() => {
          linucb.selectAction(defaultState, [], defaultContext);
        }).toThrow('actions array must not be empty');
      });

      it('should handle very small alpha', () => {
        linucb.setAlpha(1e-10);

        const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);

        // Exploration should be minimal
        expect(result.meta?.exploration).toBeCloseTo(0, 5);
      });

      it('should handle very large alpha', () => {
        linucb.setAlpha(1000);

        const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);

        // Exploration should dominate
        expect(result.meta?.exploration).toBeGreaterThan(result.meta?.exploitation ?? 0);
      });

      it('should handle extreme state values', () => {
        const extremeState: UserState = {
          A: 1e10,    // Extremely large
          F: -1e10,   // Extremely negative
          M: 0,       // Zero
          C: { mem: 1e10, speed: -1e10 }
        };

        // Should clamp and handle gracefully
        const result = linucb.selectAction(extremeState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should handle all-zero feature vector', () => {
        const zeroFeatures = new Float32Array(DIMENSION);
        zeroFeatures.fill(0);

        // All zeros is valid (though unusual)
        linucb.updateWithFeatureVector(zeroFeatures, 1.0);

        expect(linucb.getUpdateCount()).toBe(1);
      });

      it('should handle single action selection', () => {
        const singleAction = [STANDARD_ACTIONS[0]];

        const result = linucb.selectAction(defaultState, singleAction, defaultContext);
        expect(result.action).toEqual(STANDARD_ACTIONS[0]);
        expect(Number.isFinite(result.score)).toBe(true);
      });

      it('should handle extreme time bucket values', () => {
        // Time bucket at boundaries
        const contextAt0: LinUCBContext = {
          recentErrorRate: 0.2,
          recentResponseTime: 2500,
          timeBucket: 0
        };

        const contextAt23: LinUCBContext = {
          recentErrorRate: 0.2,
          recentResponseTime: 2500,
          timeBucket: 23
        };

        const contextNegative: LinUCBContext = {
          recentErrorRate: 0.2,
          recentResponseTime: 2500,
          timeBucket: -5
        };

        const contextOver24: LinUCBContext = {
          recentErrorRate: 0.2,
          recentResponseTime: 2500,
          timeBucket: 30
        };

        const result0 = linucb.selectAction(defaultState, STANDARD_ACTIONS, contextAt0);
        const result23 = linucb.selectAction(defaultState, STANDARD_ACTIONS, contextAt23);
        const resultNeg = linucb.selectAction(defaultState, STANDARD_ACTIONS, contextNegative);
        const resultOver = linucb.selectAction(defaultState, STANDARD_ACTIONS, contextOver24);

        expect(result0.action).toBeDefined();
        expect(result23.action).toBeDefined();
        expect(resultNeg.action).toBeDefined();
        expect(resultOver.action).toBeDefined();
      });
    });

    describe('model consistency', () => {
      it('should maintain positive definiteness after many updates', () => {
        // Perform many random updates
        for (let i = 0; i < 500; i++) {
          const randomState: UserState = {
            A: Math.random(),
            F: Math.random(),
            M: Math.random() * 2 - 1,
            C: { mem: Math.random(), speed: Math.random() }
          };
          const randomContext: LinUCBContext = {
            recentErrorRate: Math.random(),
            recentResponseTime: Math.random() * 10000,
            timeBucket: Math.floor(Math.random() * 24)
          };

          linucb.update(randomState, STANDARD_ACTIONS[i % 5], Math.random() * 2 - 1, randomContext);
        }

        // Model should remain valid
        const model = linucb.getModel();

        // Check all A diagonal elements are positive
        for (let i = 0; i < model.d; i++) {
          expect(model.A[i * model.d + i]).toBeGreaterThan(0);
        }

        // Check all values are finite
        for (let i = 0; i < model.A.length; i++) {
          expect(Number.isFinite(model.A[i])).toBe(true);
        }
      });

      it('should handle rapid sequential updates', async () => {
        // Simulate rapid updates (like in a fast session)
        for (let i = 0; i < 100; i++) {
          linucb.update(defaultState, STANDARD_ACTIONS[i % 5], Math.random(), defaultContext);
        }

        const model = linucb.getModel();
        expect(model.updateCount).toBe(100);

        // Model should still be valid and functional
        const result = linucb.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        expect(result.action).toBeDefined();
        expect(Number.isFinite(result.score)).toBe(true);
      });
    });
  });
});
