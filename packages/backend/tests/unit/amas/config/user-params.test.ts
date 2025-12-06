/**
 * UserParamsManager Unit Tests
 *
 * Tests for the per-user hyperparameter adaptation module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  UserParamsManager,
  UserParams,
  UserParamsState,
  ParamsFeedback,
  getParamBounds,
  getDefaultParams,
  validateParams
} from '../../../../src/amas/config/user-params';

describe('UserParamsManager', () => {
  let manager: UserParamsManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    manager = new UserParamsManager();
  });

  afterEach(() => {
    manager.stopCleanupTimer();
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with empty user map', () => {
      expect(manager.getUserCount()).toBe(0);
    });

    it('should accept custom config', () => {
      const customManager = new UserParamsManager({
        accuracyAlpha: 0.2,
        minUpdateInterval: 10000,
        enableAutoAdjust: false
      });

      expect(customManager).toBeDefined();
      customManager.stopCleanupTimer();
    });
  });

  // ==================== getParams Tests ====================

  describe('getParams', () => {
    it('should return default params for new user', () => {
      const params = manager.getParams('new-user');

      expect(params.alpha).toBeDefined();
      expect(params.fatigueK).toBeDefined();
      expect(params.motivationRho).toBeDefined();
      expect(params.optimalDifficulty).toBeDefined();
    });

    it('should return stored params for existing user', () => {
      manager.setParams('user-1', { alpha: 1.5 });

      const params = manager.getParams('user-1');

      expect(params.alpha).toBe(1.5);
    });

    it('should return copy of params', () => {
      manager.setParams('user-1', { alpha: 1.5 });

      const params1 = manager.getParams('user-1');
      const params2 = manager.getParams('user-1');

      expect(params1).toEqual(params2);
      expect(params1).not.toBe(params2);
    });
  });

  // ==================== getState Tests ====================

  describe('getState', () => {
    it('should return null for new user', () => {
      const state = manager.getState('new-user');

      expect(state).toBeNull();
    });

    it('should return state for existing user', () => {
      manager.setParams('user-1', { alpha: 1.5 });

      const state = manager.getState('user-1');

      expect(state).not.toBeNull();
      expect(state?.params.alpha).toBe(1.5);
    });
  });

  // ==================== setParams Tests ====================

  describe('setParams', () => {
    it('should set single parameter', () => {
      manager.setParams('user-1', { alpha: 1.8 });

      expect(manager.getParams('user-1').alpha).toBe(1.8);
    });

    it('should set multiple parameters', () => {
      manager.setParams('user-1', {
        alpha: 1.8,
        fatigueK: 0.1,
        optimalDifficulty: 0.6
      });

      const params = manager.getParams('user-1');

      expect(params.alpha).toBe(1.8);
      expect(params.fatigueK).toBe(0.1);
      expect(params.optimalDifficulty).toBe(0.6);
    });

    it('should clamp values to valid range', () => {
      manager.setParams('user-1', {
        alpha: 10.0, // Should be clamped to 2.0
        fatigueK: -0.5 // Should be clamped to 0.02
      });

      const params = manager.getParams('user-1');

      expect(params.alpha).toBe(2.0);
      expect(params.fatigueK).toBe(0.02);
    });

    it('should create new user if not exists', () => {
      expect(manager.getUserCount()).toBe(0);

      manager.setParams('new-user', { alpha: 1.5 });

      expect(manager.getUserCount()).toBe(1);
    });
  });

  // ==================== updateParams Tests ====================

  describe('updateParams', () => {
    it('should update based on feedback', () => {
      const feedback: ParamsFeedback = {
        accuracy: 0.9,
        fatigueChange: -0.1,
        motivationChange: 0.1,
        reward: 0.8
      };

      manager.updateParams('user-1', feedback);

      const state = manager.getState('user-1');
      expect(state).not.toBeNull();
      expect(state?.performance.sampleCount).toBe(1);
    });

    it('should update performance tracker', () => {
      manager.updateParams('user-1', {
        accuracy: 0.9,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.5
      });

      const state = manager.getState('user-1');

      expect(state?.performance.recentAccuracy).toBeGreaterThan(0);
    });

    it('should respect minUpdateInterval', () => {
      manager.updateParams('user-1', {
        accuracy: 0.9,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.5
      });

      const state1 = manager.getState('user-1');
      const updateCount1 = state1?.params.updateCount;

      // Immediate second update should be ignored
      manager.updateParams('user-1', {
        accuracy: 0.8,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.4
      });

      const state2 = manager.getState('user-1');

      expect(state2?.params.updateCount).toBe(updateCount1);
    });

    it('should allow update after interval passes', () => {
      manager.updateParams('user-1', {
        accuracy: 0.9,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.5
      });

      // Advance time past minUpdateInterval (default 5000ms)
      vi.advanceTimersByTime(6000);

      manager.updateParams('user-1', {
        accuracy: 0.8,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.4
      });

      const state = manager.getState('user-1');

      expect(state?.params.updateCount).toBe(2);
    });
  });

  // ==================== Auto-Adjustment Tests ====================

  describe('auto-adjustment', () => {
    it('should increase difficulty when accuracy is high and fatigue is recovering', () => {
      // Create a manager with higher accuracy alpha for faster EMA convergence
      const fastManager = new UserParamsManager({
        accuracyAlpha: 0.5, // Higher alpha for faster convergence
        minUpdateInterval: 1000
      });

      // Set initial difficulty
      fastManager.setParams('user-1', { optimalDifficulty: 0.4 });

      // Wait for minUpdateInterval to pass after setParams
      vi.advanceTimersByTime(2000);

      // Simulate good performance over multiple updates
      // fatigueSlope < -0.1 (fastRecoverySlope) AND accuracy > 0.85 should increase difficulty
      for (let i = 0; i < 10; i++) {
        fastManager.updateParams('user-1', {
          accuracy: 0.95,
          fatigueChange: -0.5, // Strong negative = fatigue recovering fast
          motivationChange: 0.1,
          reward: 0.9
        });
        vi.advanceTimersByTime(2000);
      }

      const params = fastManager.getParams('user-1');

      // Difficulty should increase since accuracy is high and fatigue is recovering
      expect(params.optimalDifficulty).toBeGreaterThan(0.4);

      fastManager.stopCleanupTimer();
    });

    it('should decrease difficulty when accuracy is low', () => {
      // First, set difficulty higher
      manager.setParams('user-1', { optimalDifficulty: 0.7 });

      // Simulate poor performance
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(6000);
        manager.updateParams('user-1', {
          accuracy: 0.4, // Low accuracy
          fatigueChange: 0.1,
          motivationChange: -0.1,
          reward: 0.2
        });
      }

      const params = manager.getParams('user-1');

      expect(params.optimalDifficulty).toBeLessThan(0.7);
    });

    it('should not adjust when auto-adjust is disabled', () => {
      const noAdjustManager = new UserParamsManager({ enableAutoAdjust: false });

      noAdjustManager.setParams('user-1', { optimalDifficulty: 0.5 });

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(6000);
        noAdjustManager.updateParams('user-1', {
          accuracy: 0.95,
          fatigueChange: -0.2,
          motivationChange: 0.1,
          reward: 0.9
        });
      }

      const params = noAdjustManager.getParams('user-1');

      // Difficulty should remain unchanged
      expect(params.optimalDifficulty).toBe(0.5);

      noAdjustManager.stopCleanupTimer();
    });
  });

  // ==================== resetParams Tests ====================

  describe('resetParams', () => {
    it('should reset user to default params', () => {
      manager.setParams('user-1', {
        alpha: 1.8,
        fatigueK: 0.15,
        optimalDifficulty: 0.7
      });

      manager.resetParams('user-1');

      const params = manager.getParams('user-1');
      const defaults = getDefaultParams();

      expect(params.alpha).toBe(defaults.alpha);
      expect(params.fatigueK).toBe(defaults.fatigueK);
      expect(params.optimalDifficulty).toBe(defaults.optimalDifficulty);
    });
  });

  // ==================== batchUpdate Tests ====================

  describe('batchUpdate', () => {
    it('should update multiple users', () => {
      const updates = new Map<string, Partial<UserParams>>();
      updates.set('user-1', { alpha: 1.5 });
      updates.set('user-2', { alpha: 1.8 });
      updates.set('user-3', { alpha: 0.5 });

      manager.batchUpdate(updates);

      expect(manager.getParams('user-1').alpha).toBe(1.5);
      expect(manager.getParams('user-2').alpha).toBe(1.8);
      expect(manager.getParams('user-3').alpha).toBe(0.5);
    });
  });

  // ==================== removeUser Tests ====================

  describe('removeUser', () => {
    it('should remove user data', () => {
      manager.setParams('user-1', { alpha: 1.5 });

      const removed = manager.removeUser('user-1');

      expect(removed).toBe(true);
      expect(manager.getState('user-1')).toBeNull();
    });

    it('should return false for non-existing user', () => {
      const removed = manager.removeUser('non-existing');

      expect(removed).toBe(false);
    });
  });

  // ==================== User Management Tests ====================

  describe('user management', () => {
    it('should return all user IDs', () => {
      manager.setParams('user-1', { alpha: 1.5 });
      manager.setParams('user-2', { alpha: 1.8 });

      const ids = manager.getAllUserIds();

      expect(ids).toContain('user-1');
      expect(ids).toContain('user-2');
      expect(ids.length).toBe(2);
    });

    it('should return correct user count', () => {
      manager.setParams('user-1', { alpha: 1.5 });
      manager.setParams('user-2', { alpha: 1.8 });
      manager.setParams('user-3', { alpha: 0.5 });

      expect(manager.getUserCount()).toBe(3);
    });
  });

  // ==================== Export/Import Tests ====================

  describe('export and import', () => {
    it('should export all state', () => {
      manager.setParams('user-1', { alpha: 1.5 });
      manager.setParams('user-2', { alpha: 1.8 });

      const exported = manager.exportAll();

      expect(exported.size).toBe(2);
      expect(exported.get('user-1')?.params.alpha).toBe(1.5);
    });

    it('should import all state', () => {
      const data = new Map<string, UserParamsState>();
      data.set('user-1', {
        version: '1.0.0',
        params: {
          alpha: 1.5,
          fatigueK: 0.08,
          motivationRho: 0.85,
          optimalDifficulty: 0.5,
          updateCount: 5,
          lastUpdated: Date.now()
        },
        performance: {
          recentAccuracy: 0.8,
          fatigueSlope: 0,
          motivationTrend: 0,
          recentReward: 0.6,
          sampleCount: 10
        }
      });

      manager.importAll(data);

      expect(manager.getParams('user-1').alpha).toBe(1.5);
    });

    it('should export single user', () => {
      manager.setParams('user-1', { alpha: 1.5 });

      const exported = manager.exportUser('user-1');

      expect(exported?.params.alpha).toBe(1.5);
    });

    it('should return null for non-existing user export', () => {
      const exported = manager.exportUser('non-existing');

      expect(exported).toBeNull();
    });

    it('should import single user', () => {
      const state: UserParamsState = {
        version: '1.0.0',
        params: {
          alpha: 1.5,
          fatigueK: 0.08,
          motivationRho: 0.85,
          optimalDifficulty: 0.5,
          updateCount: 5,
          lastUpdated: Date.now()
        },
        performance: {
          recentAccuracy: 0.8,
          fatigueSlope: 0,
          motivationTrend: 0,
          recentReward: 0.6,
          sampleCount: 10
        }
      };

      const result = manager.importUser('user-1', state);

      expect(result).toBe(true);
      expect(manager.getParams('user-1').alpha).toBe(1.5);
    });

    it('should reject invalid state on import', () => {
      // @ts-ignore - Testing invalid input
      const result = manager.importUser('user-1', { invalid: 'data' });

      expect(result).toBe(false);
    });
  });

  // ==================== Statistics Tests ====================

  describe('getStatsSummary', () => {
    it('should return empty stats when no users', () => {
      const stats = manager.getStatsSummary();

      expect(stats.userCount).toBe(0);
    });

    it('should return aggregate statistics', () => {
      manager.setParams('user-1', { alpha: 1.0, optimalDifficulty: 0.4 });
      manager.setParams('user-2', { alpha: 2.0, optimalDifficulty: 0.6 });

      const stats = manager.getStatsSummary();

      expect(stats.userCount).toBe(2);
      expect(stats.paramDistribution.alpha.mean).toBe(1.5);
    });

    it('should calculate standard deviation', () => {
      manager.setParams('user-1', { alpha: 1.0 });
      manager.setParams('user-2', { alpha: 1.5 });
      manager.setParams('user-3', { alpha: 2.0 });

      const stats = manager.getStatsSummary();

      expect(stats.paramDistribution.alpha.std).toBeGreaterThan(0);
    });
  });

  // ==================== Cleanup Tests ====================

  describe('cleanup', () => {
    it('should remove expired users on cleanup', () => {
      // Create manager with short TTL
      const shortTtlManager = new UserParamsManager({
        userTtlMs: 1000, // 1 second
        cleanupIntervalMs: 500000 // Long interval to prevent auto cleanup
      });

      shortTtlManager.setParams('user-1', { alpha: 1.5 });

      // Get current time and set last access to be older than TTL
      const now = Date.now();
      const state = shortTtlManager.getState('user-1');

      // Advance time past TTL
      vi.advanceTimersByTime(2000);

      const removed = shortTtlManager.cleanup();

      expect(removed).toBe(1);
      expect(shortTtlManager.getUserCount()).toBe(0);

      shortTtlManager.stopCleanupTimer();
    });

    it('should enforce maxUsers limit', () => {
      const smallManager = new UserParamsManager({
        maxUsers: 3
      });

      // Add more users than limit
      smallManager.setParams('user-1', { alpha: 1.0 });
      vi.advanceTimersByTime(100);
      smallManager.setParams('user-2', { alpha: 1.0 });
      vi.advanceTimersByTime(100);
      smallManager.setParams('user-3', { alpha: 1.0 });
      vi.advanceTimersByTime(100);
      smallManager.setParams('user-4', { alpha: 1.0 });
      vi.advanceTimersByTime(100);
      smallManager.setParams('user-5', { alpha: 1.0 });

      smallManager.cleanup();

      expect(smallManager.getUserCount()).toBeLessThanOrEqual(3);

      smallManager.stopCleanupTimer();
    });
  });

  // ==================== Async Methods Tests ====================

  describe('async methods', () => {
    it('should update params asynchronously', async () => {
      await manager.updateParamsAsync('user-1', {
        accuracy: 0.9,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.5
      });

      const state = manager.getState('user-1');
      expect(state).not.toBeNull();
    });

    it('should set params asynchronously', async () => {
      await manager.setParamsAsync('user-1', { alpha: 1.8 });

      expect(manager.getParams('user-1').alpha).toBe(1.8);
    });
  });
});

// ==================== Helper Function Tests ====================

describe('getParamBounds', () => {
  it('should return parameter bounds', () => {
    const bounds = getParamBounds();

    expect(bounds.alpha).toHaveProperty('min');
    expect(bounds.alpha).toHaveProperty('max');
    expect(bounds.fatigueK).toHaveProperty('min');
    expect(bounds.fatigueK).toHaveProperty('max');
  });

  it('should have valid ranges', () => {
    const bounds = getParamBounds();

    expect(bounds.alpha.min).toBeLessThan(bounds.alpha.max);
    expect(bounds.fatigueK.min).toBeLessThan(bounds.fatigueK.max);
    expect(bounds.motivationRho.min).toBeLessThan(bounds.motivationRho.max);
    expect(bounds.optimalDifficulty.min).toBeLessThan(bounds.optimalDifficulty.max);
  });
});

describe('getDefaultParams', () => {
  it('should return default parameters', () => {
    const params = getDefaultParams();

    expect(params).toHaveProperty('alpha');
    expect(params).toHaveProperty('fatigueK');
    expect(params).toHaveProperty('motivationRho');
    expect(params).toHaveProperty('optimalDifficulty');
    expect(params).toHaveProperty('updateCount');
    expect(params).toHaveProperty('lastUpdated');
  });

  it('should have default alpha of 1.0', () => {
    const params = getDefaultParams();

    expect(params.alpha).toBe(1.0);
  });
});

describe('validateParams', () => {
  it('should return empty array for valid params', () => {
    const errors = validateParams({
      alpha: 1.0,
      fatigueK: 0.08,
      motivationRho: 0.85,
      optimalDifficulty: 0.5
    });

    expect(errors.length).toBe(0);
  });

  it('should return error for out-of-range alpha', () => {
    const errors = validateParams({ alpha: 5.0 });

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('alpha');
  });

  it('should return error for out-of-range fatigueK', () => {
    const errors = validateParams({ fatigueK: 0.5 });

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('fatigueK');
  });

  it('should return multiple errors for multiple violations', () => {
    const errors = validateParams({
      alpha: 5.0,
      fatigueK: 0.5,
      motivationRho: 1.5
    });

    expect(errors.length).toBe(3);
  });

  it('should ignore undefined params', () => {
    const errors = validateParams({
      alpha: undefined,
      fatigueK: 0.08
    });

    expect(errors.length).toBe(0);
  });
});
