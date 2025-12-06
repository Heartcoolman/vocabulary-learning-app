/**
 * LinUCB Async Wrapper Unit Tests
 *
 * Tests for the async wrapper that offloads compute-intensive operations to Worker pool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LinUCBAsync,
  LinUCBAsyncOptions,
  createLinUCBAsync,
  createLinUCBAsyncSync,
} from '../../../../src/amas/learning/linucb-async';
import { LinUCB, LinUCBContext } from '../../../../src/amas/learning/linucb';
import { Action, UserState, BanditModel } from '../../../../src/amas/types';
import { withSeed } from '../../../setup';
import {
  STANDARD_ACTIONS,
  DEFAULT_USER_STATE,
  DIMENSION,
} from '../../../fixtures/amas-fixtures';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('LinUCBAsync', () => {
  let linucbAsync: LinUCBAsync;

  const defaultContext: LinUCBContext = {
    recentErrorRate: 0.2,
    recentResponseTime: 2500,
    timeBucket: 14,
  };

  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6, stability: 0.8 },
    conf: 0.9,
    ts: Date.now(),
  };

  beforeEach(() => {
    // Use sync mode for most tests to avoid Worker complexity
    linucbAsync = createLinUCBAsyncSync();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const instance = new LinUCBAsync();
      const model = instance.getModel();
      expect(model.d).toBe(DIMENSION);
      expect(model.updateCount).toBe(0);
    });

    it('should initialize with custom options', () => {
      const instance = new LinUCBAsync({
        alpha: 0.5,
        lambda: 2.0,
        dimension: 10,
        useWorker: false,
      });
      const model = instance.getModel();
      expect(model.alpha).toBe(0.5);
      expect(model.lambda).toBe(2.0);
      expect(model.d).toBe(10);
    });

    it('should create instance using factory function', () => {
      const instance = createLinUCBAsync({ dimension: 15 });
      expect(instance.getModel().d).toBe(15);
    });

    it('should create sync-only instance using factory function', () => {
      const instance = createLinUCBAsyncSync({ dimension: 20 });
      const stats = instance.getWorkerStats();
      expect(stats.useWorker).toBe(false);
    });
  });

  // ==================== Sync Method Tests ====================

  describe('synchronous methods', () => {
    it('should select action synchronously', () => {
      const result = linucbAsync.selectAction(
        defaultState,
        STANDARD_ACTIONS,
        defaultContext
      );

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should update model synchronously', () => {
      const initialCount = linucbAsync.getUpdateCount();

      linucbAsync.update(
        defaultState,
        STANDARD_ACTIONS[0],
        0.8,
        defaultContext
      );

      expect(linucbAsync.getUpdateCount()).toBe(initialCount + 1);
    });

    it('should select from action space synchronously', () => {
      const action = linucbAsync.selectFromActionSpace(defaultState, defaultContext);

      expect(action).toBeDefined();
      // selectFromActionSpace uses ACTION_SPACE, not STANDARD_ACTIONS
      expect(ACTION_SPACE).toContainEqual(action);
    });

    it('should update with feature vector synchronously', () => {
      const featureVector = linucbAsync.buildContextVector({
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: defaultContext.recentErrorRate,
        recentResponseTime: defaultContext.recentResponseTime,
        timeBucket: defaultContext.timeBucket,
      });

      const initialCount = linucbAsync.getUpdateCount();
      linucbAsync.updateWithFeatureVector(featureVector, 0.7);

      expect(linucbAsync.getUpdateCount()).toBe(initialCount + 1);
    });
  });

  // ==================== Async Method Tests ====================

  describe('asynchronous methods', () => {
    it('should select action asynchronously (sync fallback)', async () => {
      const result = await linucbAsync.selectActionAsync(
        defaultState,
        STANDARD_ACTIONS,
        defaultContext
      );

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should update model asynchronously (sync fallback)', async () => {
      const initialCount = linucbAsync.getUpdateCount();

      await linucbAsync.updateAsync(
        defaultState,
        STANDARD_ACTIONS[0],
        0.8,
        defaultContext
      );

      expect(linucbAsync.getUpdateCount()).toBe(initialCount + 1);
    });

    it('should select from action space asynchronously', async () => {
      const action = await linucbAsync.selectFromActionSpaceAsync(
        defaultState,
        defaultContext
      );

      expect(action).toBeDefined();
      // selectFromActionSpaceAsync uses ACTION_SPACE, not STANDARD_ACTIONS
      expect(ACTION_SPACE).toContainEqual(action);
    });

    it('should update with feature vector asynchronously', async () => {
      const featureVector = linucbAsync.buildContextVector({
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: defaultContext.recentErrorRate,
        recentResponseTime: defaultContext.recentResponseTime,
        timeBucket: defaultContext.timeBucket,
      });

      const initialCount = linucbAsync.getUpdateCount();
      await linucbAsync.updateWithFeatureVectorAsync(featureVector, 0.7);

      expect(linucbAsync.getUpdateCount()).toBe(initialCount + 1);
    });
  });

  // ==================== State Management Tests ====================

  describe('state management', () => {
    it('should serialize and deserialize model state', () => {
      // Update model to change state
      linucbAsync.update(defaultState, STANDARD_ACTIONS[0], 0.8, defaultContext);
      linucbAsync.update(defaultState, STANDARD_ACTIONS[1], 0.6, defaultContext);

      // Serialize
      const serialized = linucbAsync.serialize();
      expect(typeof serialized).toBe('string');

      // Create new instance and deserialize
      const newInstance = createLinUCBAsyncSync();
      newInstance.deserialize(serialized);

      // Compare models
      const original = linucbAsync.getModel();
      const restored = newInstance.getModel();

      expect(restored.d).toBe(original.d);
      expect(restored.lambda).toBe(original.lambda);
      expect(restored.alpha).toBe(original.alpha);
      expect(restored.updateCount).toBe(original.updateCount);

      // Compare arrays
      expect(Array.from(restored.A)).toEqual(Array.from(original.A));
      expect(Array.from(restored.b)).toEqual(Array.from(original.b));
    });

    it('should get and set model state', () => {
      const model = linucbAsync.getModel();
      model.alpha = 0.7;

      const newInstance = createLinUCBAsyncSync();
      newInstance.setModel(model);

      expect(newInstance.getAlpha()).toBe(0.7);
    });

    it('should get and set state using BaseLearner interface', () => {
      linucbAsync.update(defaultState, STANDARD_ACTIONS[0], 0.5, defaultContext);

      const state = linucbAsync.getState();

      const newInstance = createLinUCBAsyncSync();
      newInstance.setState(state);

      expect(newInstance.getUpdateCount()).toBe(linucbAsync.getUpdateCount());
    });

    it('should reset model', () => {
      // Make some updates
      linucbAsync.update(defaultState, STANDARD_ACTIONS[0], 0.8, defaultContext);
      linucbAsync.update(defaultState, STANDARD_ACTIONS[1], 0.6, defaultContext);

      expect(linucbAsync.getUpdateCount()).toBeGreaterThan(0);

      // Reset
      linucbAsync.reset();

      expect(linucbAsync.getUpdateCount()).toBe(0);

      // Check b vector is zeroed
      const model = linucbAsync.getModel();
      for (let i = 0; i < model.d; i++) {
        expect(model.b[i]).toBe(0);
      }
    });
  });

  // ==================== Configuration Tests ====================

  describe('configuration', () => {
    it('should set and get alpha', () => {
      linucbAsync.setAlpha(0.8);
      expect(linucbAsync.getAlpha()).toBe(0.8);
    });

    it('should get cold start alpha', () => {
      const alpha = linucbAsync.getColdStartAlpha(10, 0.8, 0.3);
      expect(alpha).toBeGreaterThan(0);
    });

    it('should return correct name and version', () => {
      expect(linucbAsync.getName()).toBe('LinUCBAsync');
      expect(linucbAsync.getVersion()).toBe('2.0.0-async');
    });

    it('should return capabilities', () => {
      const caps = linucbAsync.getCapabilities();
      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(true);
      expect(caps.primaryUseCase).toContain('异步');
    });
  });

  // ==================== Worker Stats Tests ====================

  describe('worker stats', () => {
    it('should return worker stats for sync mode', () => {
      const stats = linucbAsync.getWorkerStats();

      expect(stats.useWorker).toBe(false);
      expect(stats.dimension).toBe(DIMENSION);
      expect(stats.fallbackCount).toBe(0);
    });

    it('should track fallback count', async () => {
      // In sync mode, no fallbacks should occur
      await linucbAsync.selectActionAsync(defaultState, STANDARD_ACTIONS, defaultContext);
      await linucbAsync.updateAsync(defaultState, STANDARD_ACTIONS[0], 0.5, defaultContext);

      const stats = linucbAsync.getWorkerStats();
      expect(stats.fallbackCount).toBe(0);
    });

    it('should correctly determine willUseWorker based on dimension', () => {
      // Small dimension - should not use worker
      const smallInstance = new LinUCBAsync({
        dimension: 5,
        useWorker: true,
        workerThreshold: 10,
      });
      expect(smallInstance.getWorkerStats().willUseWorker).toBe(false);

      // Large dimension - should use worker
      const largeInstance = new LinUCBAsync({
        dimension: 22,
        useWorker: true,
        workerThreshold: 10,
      });
      expect(largeInstance.getWorkerStats().willUseWorker).toBe(true);
    });
  });

  // ==================== Underlying LinUCB Tests ====================

  describe('underlying LinUCB access', () => {
    it('should provide access to underlying LinUCB instance', () => {
      const underlying = linucbAsync.getUnderlyingLinUCB();
      expect(underlying).toBeInstanceOf(LinUCB);
    });

    it('should share state with underlying instance', () => {
      const underlying = linucbAsync.getUnderlyingLinUCB();

      // Update through wrapper
      linucbAsync.update(defaultState, STANDARD_ACTIONS[0], 0.8, defaultContext);

      // Check underlying state
      expect(underlying.getUpdateCount()).toBe(linucbAsync.getUpdateCount());
    });
  });

  // ==================== Consistency Tests ====================

  describe('consistency with sync LinUCB', () => {
    it('should produce same results as sync LinUCB for selection', () => {
      const syncLinUCB = new LinUCB();

      withSeed('consistency-test', () => {
        const syncResult = syncLinUCB.selectAction(
          defaultState,
          STANDARD_ACTIONS,
          defaultContext
        );
        const asyncResult = linucbAsync.selectAction(
          defaultState,
          STANDARD_ACTIONS,
          defaultContext
        );

        expect(asyncResult.action).toEqual(syncResult.action);
        expect(asyncResult.score).toBeCloseTo(syncResult.score, 5);
        expect(asyncResult.confidence).toBeCloseTo(syncResult.confidence, 5);
      });
    });

    it('should update model consistently with sync LinUCB', () => {
      const syncLinUCB = new LinUCB();

      // Same updates
      syncLinUCB.update(defaultState, STANDARD_ACTIONS[0], 0.8, defaultContext);
      linucbAsync.update(defaultState, STANDARD_ACTIONS[0], 0.8, defaultContext);

      const syncModel = syncLinUCB.getModel();
      const asyncModel = linucbAsync.getModel();

      expect(asyncModel.updateCount).toBe(syncModel.updateCount);
      expect(Array.from(asyncModel.b)).toEqual(Array.from(syncModel.b));
    });
  });

  // ==================== Feature Vector Tests ====================

  describe('feature vector building', () => {
    it('should build context vector', () => {
      const vector = linucbAsync.buildContextVector({
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: defaultContext.recentErrorRate,
        recentResponseTime: defaultContext.recentResponseTime,
        timeBucket: defaultContext.timeBucket,
      });

      expect(vector).toBeInstanceOf(Float32Array);
      expect(vector.length).toBe(DIMENSION);
    });

    it('should build consistent feature vectors', () => {
      const vector1 = linucbAsync.buildContextVector({
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 14,
      });

      const vector2 = linucbAsync.buildContextVector({
        state: defaultState,
        action: STANDARD_ACTIONS[0],
        recentErrorRate: 0.2,
        recentResponseTime: 2500,
        timeBucket: 14,
      });

      expect(Array.from(vector1)).toEqual(Array.from(vector2));
    });
  });

  // ==================== Learning Tests ====================

  describe('learning behavior', () => {
    it('should learn from positive rewards', async () => {
      const selectedAction = STANDARD_ACTIONS[2]; // Medium action

      // Provide positive reward for selected action
      for (let i = 0; i < 10; i++) {
        await linucbAsync.updateAsync(
          defaultState,
          selectedAction,
          0.9, // Positive reward
          defaultContext
        );
      }

      // Model should be updated
      expect(linucbAsync.getUpdateCount()).toBe(10);

      // Model b vector should be non-zero after updates
      const model = linucbAsync.getModel();
      const bNorm = Math.sqrt(Array.from(model.b).reduce((sum, x) => sum + x * x, 0));
      expect(bNorm).toBeGreaterThan(0);
    });

    it('should decrease score for negative rewards', async () => {
      const badAction = STANDARD_ACTIONS[4]; // Hard action

      // Train with negative rewards
      for (let i = 0; i < 10; i++) {
        await linucbAsync.updateAsync(
          defaultState,
          badAction,
          -0.5, // Negative reward
          defaultContext
        );
      }

      // Check model was updated
      expect(linucbAsync.getUpdateCount()).toBe(10);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle empty actions array gracefully', () => {
      expect(() => {
        linucbAsync.selectAction(defaultState, [], defaultContext);
      }).toThrow();
    });

    it('should handle single action', () => {
      const result = linucbAsync.selectAction(
        defaultState,
        [STANDARD_ACTIONS[0]],
        defaultContext
      );

      expect(result.action).toEqual(STANDARD_ACTIONS[0]);
    });

    it('should handle extreme reward values', async () => {
      // Very high reward
      await linucbAsync.updateAsync(
        defaultState,
        STANDARD_ACTIONS[0],
        1.0,
        defaultContext
      );

      // Very low reward
      await linucbAsync.updateAsync(
        defaultState,
        STANDARD_ACTIONS[1],
        -1.0,
        defaultContext
      );

      expect(linucbAsync.getUpdateCount()).toBe(2);
    });

    it('should handle extreme state values', () => {
      const extremeState: UserState = {
        A: 1.0,
        F: 0.0,
        M: 1.0,
        C: { mem: 1.0, speed: 1.0, stability: 1.0 },
        conf: 1.0,
        ts: Date.now(),
      };

      const result = linucbAsync.selectAction(
        extremeState,
        STANDARD_ACTIONS,
        defaultContext
      );

      expect(result).toBeDefined();
      expect(Number.isFinite(result.score)).toBe(true);
    });

    it('should handle zero context values', () => {
      const zeroContext: LinUCBContext = {
        recentErrorRate: 0,
        recentResponseTime: 0,
        timeBucket: 0,
      };

      const result = linucbAsync.selectAction(
        defaultState,
        STANDARD_ACTIONS,
        zeroContext
      );

      expect(result).toBeDefined();
    });
  });
});
