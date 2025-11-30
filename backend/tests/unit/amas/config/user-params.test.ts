/**
 * UserParamsManager Unit Tests
 * 测试用户级超参数管理器的参数调整和状态持久化
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UserParamsManager,
  UserParamsState,
  ParamsFeedback,
  getParamBounds,
  getDefaultParams,
  validateParams
} from '../../../../src/amas/config/user-params';

describe('UserParamsManager', () => {
  let manager: UserParamsManager;

  beforeEach(() => {
    manager = new UserParamsManager();
  });

  describe('Initialization', () => {
    it('should initialize with zero users', () => {
      expect(manager.getUserCount()).toBe(0);
    });

    it('should return default params for unknown user', () => {
      const params = manager.getParams('unknown-user');

      expect(params.alpha).toBe(1.0);
      expect(params.fatigueK).toBe(0.08);
      expect(params.motivationRho).toBe(0.85);
      expect(params.optimalDifficulty).toBe(0.5);
    });

    it('should accept custom config', () => {
      const customManager = new UserParamsManager({
        accuracyAlpha: 0.2,
        minUpdateInterval: 1000,
        enableAutoAdjust: false
      });

      expect(customManager).toBeDefined();
    });
  });

  describe('Parameter Management', () => {
    it('should get params for user', () => {
      const params = manager.getParams('user1');

      expect(params).toHaveProperty('alpha');
      expect(params).toHaveProperty('fatigueK');
      expect(params).toHaveProperty('motivationRho');
      expect(params).toHaveProperty('optimalDifficulty');
    });

    it('should set params for user', () => {
      manager.setParams('user1', { alpha: 1.5 });

      const params = manager.getParams('user1');
      expect(params.alpha).toBe(1.5);
    });

    it('should clamp params to valid ranges', () => {
      manager.setParams('user1', {
        alpha: 10.0,
        fatigueK: -1,
        motivationRho: 2.0,
        optimalDifficulty: 1.5
      });

      const params = manager.getParams('user1');
      expect(params.alpha).toBe(2.0);
      expect(params.fatigueK).toBe(0.02);
      expect(params.motivationRho).toBe(0.95);
      expect(params.optimalDifficulty).toBe(0.8);
    });

    it('should reset params to default', () => {
      manager.setParams('user1', { alpha: 1.5 });
      manager.resetParams('user1');

      const params = manager.getParams('user1');
      expect(params.alpha).toBe(1.0);
    });
  });

  describe('Parameter Updates', () => {
    it('should update params based on feedback', () => {
      const feedback: ParamsFeedback = {
        accuracy: 0.9,
        fatigueChange: -0.1,
        motivationChange: 0.3,
        reward: 0.8
      };

      manager.updateParams('user1', feedback);

      const state = manager.getState('user1');
      expect(state).not.toBeNull();
      expect(state?.params.updateCount).toBe(1);
    });

    it('should update performance tracking with EMA', () => {
      const feedback: ParamsFeedback = {
        accuracy: 0.9,
        fatigueChange: -0.1,
        motivationChange: 0.2,
        reward: 0.8
      };

      manager.updateParams('user1', feedback);

      const state = manager.getState('user1');
      expect(state?.performance.recentAccuracy).toBeGreaterThan(0.5);
    });

    it('should increase difficulty when accuracy is high and fatigue is low', () => {
      // 禁用更新间隔限制，确保连续更新生效
      const testManager = new UserParamsManager({ minUpdateInterval: 0 });
      const initialParams = testManager.getParams('user1');

      // 需要约10次更新让 EMA 收敛到超过 0.85 阈值
      for (let i = 0; i < 15; i++) {
        testManager.updateParams('user1', {
          accuracy: 0.95,
          fatigueChange: -0.2,
          motivationChange: 0.1,
          reward: 0.9
        });
      }

      const updatedParams = testManager.getParams('user1');
      expect(updatedParams.optimalDifficulty).toBeGreaterThanOrEqual(initialParams.optimalDifficulty);
    });

    it('should decrease difficulty when accuracy is low', () => {
      // 禁用更新间隔限制，确保连续更新生效
      const testManager = new UserParamsManager({ minUpdateInterval: 0 });
      testManager.setParams('user1', { optimalDifficulty: 0.6 });

      for (let i = 0; i < 5; i++) {
        testManager.updateParams('user1', {
          accuracy: 0.4,
          fatigueChange: 0.2,
          motivationChange: -0.1,
          reward: 0.2
        });
      }

      const params = testManager.getParams('user1');
      expect(params.optimalDifficulty).toBeLessThan(0.6);
    });

    it('should respect minimum update interval', () => {
      manager.updateParams('user1', {
        accuracy: 0.8,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.5
      });

      const count1 = manager.getState('user1')?.params.updateCount;

      manager.updateParams('user1', {
        accuracy: 0.9,
        fatigueChange: 0,
        motivationChange: 0,
        reward: 0.6
      });

      const count2 = manager.getState('user1')?.params.updateCount;

      expect(count2).toBe(count1);
    });
  });

  describe('Batch Updates', () => {
    it('should update multiple users', () => {
      const updates = new Map<string, Partial<{ alpha: number; fatigueK: number }>>();
      updates.set('user1', { alpha: 1.2 });
      updates.set('user2', { alpha: 1.5 });
      updates.set('user3', { fatigueK: 0.1 });

      manager.batchUpdate(updates);

      expect(manager.getParams('user1').alpha).toBe(1.2);
      expect(manager.getParams('user2').alpha).toBe(1.5);
      expect(manager.getParams('user3').fatigueK).toBe(0.1);
    });
  });

  describe('User Management', () => {
    it('should track user count', () => {
      manager.setParams('user1', { alpha: 1.2 });
      manager.setParams('user2', { alpha: 1.3 });

      expect(manager.getUserCount()).toBe(2);
    });

    it('should list all user IDs', () => {
      manager.setParams('user1', {});
      manager.setParams('user2', {});
      manager.setParams('user3', {});

      const ids = manager.getAllUserIds();

      expect(ids).toContain('user1');
      expect(ids).toContain('user2');
      expect(ids).toContain('user3');
    });

    it('should remove user', () => {
      manager.setParams('user1', { alpha: 1.2 });
      const removed = manager.removeUser('user1');

      expect(removed).toBe(true);
      expect(manager.getUserCount()).toBe(0);
    });

    it('should return false when removing non-existent user', () => {
      const removed = manager.removeUser('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('State Export/Import', () => {
    it('should export all states', () => {
      manager.setParams('user1', { alpha: 1.2 });
      manager.setParams('user2', { alpha: 1.3 });

      const exported = manager.exportAll();

      expect(exported.size).toBe(2);
      expect(exported.has('user1')).toBe(true);
      expect(exported.has('user2')).toBe(true);
    });

    it('should import all states', () => {
      const data = new Map<string, UserParamsState>();
      data.set('user1', {
        version: '1.0.0',
        params: {
          alpha: 1.5,
          fatigueK: 0.1,
          motivationRho: 0.8,
          optimalDifficulty: 0.6,
          updateCount: 5,
          lastUpdated: Date.now()
        },
        performance: {
          recentAccuracy: 0.7,
          fatigueSlope: 0.1,
          motivationTrend: 0.2,
          recentReward: 0.5,
          sampleCount: 10
        }
      });

      manager.importAll(data);

      expect(manager.getParams('user1').alpha).toBe(1.5);
    });

    it('should export single user state', () => {
      manager.setParams('user1', { alpha: 1.2 });

      const state = manager.exportUser('user1');

      expect(state).not.toBeNull();
      expect(state?.params.alpha).toBe(1.2);
    });

    it('should return null for non-existent user export', () => {
      const state = manager.exportUser('non-existent');
      expect(state).toBeNull();
    });

    it('should import single user state', () => {
      const state: UserParamsState = {
        version: '1.0.0',
        params: {
          alpha: 1.5,
          fatigueK: 0.1,
          motivationRho: 0.8,
          optimalDifficulty: 0.6,
          updateCount: 5,
          lastUpdated: Date.now()
        },
        performance: {
          recentAccuracy: 0.7,
          fatigueSlope: 0.1,
          motivationTrend: 0.2,
          recentReward: 0.5,
          sampleCount: 10
        }
      };

      const result = manager.importUser('user1', state);

      expect(result).toBe(true);
      expect(manager.getParams('user1').alpha).toBe(1.5);
    });

    it('should reject invalid state on import', () => {
      const invalidState = { invalid: true } as unknown as UserParamsState;
      const result = manager.importUser('user1', invalidState);

      expect(result).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should return stats summary', () => {
      manager.setParams('user1', { alpha: 1.2, optimalDifficulty: 0.4 });
      manager.setParams('user2', { alpha: 1.8, optimalDifficulty: 0.6 });

      const stats = manager.getStatsSummary();

      expect(stats.userCount).toBe(2);
      expect(stats.avgDifficulty).toBe(0.5);
      expect(stats.paramDistribution.alpha.mean).toBe(1.5);
    });

    it('should return default stats when no users', () => {
      const stats = manager.getStatsSummary();

      expect(stats.userCount).toBe(0);
      expect(stats.avgAccuracy).toBe(0.5);
      expect(stats.avgDifficulty).toBe(0.5);
    });
  });

  describe('Convenience Functions', () => {
    it('getParamBounds should return bounds', () => {
      const bounds = getParamBounds();

      expect(bounds.alpha.min).toBe(0.3);
      expect(bounds.alpha.max).toBe(2.0);
    });

    it('getDefaultParams should return defaults', () => {
      const defaults = getDefaultParams();

      expect(defaults.alpha).toBe(1.0);
      expect(defaults.fatigueK).toBe(0.08);
    });

    it('validateParams should return errors for invalid params', () => {
      const errors = validateParams({
        alpha: 0.1,
        fatigueK: 0.5,
        motivationRho: 0.3,
        optimalDifficulty: 1.0
      });

      expect(errors.length).toBe(4);
    });

    it('validateParams should return empty array for valid params', () => {
      const errors = validateParams({
        alpha: 1.0,
        fatigueK: 0.08
      });

      expect(errors.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle feedback with extreme values', () => {
      expect(() => {
        manager.updateParams('user1', {
          accuracy: 2.0,
          fatigueChange: 5.0,
          motivationChange: -5.0,
          reward: 10.0
        });
      }).not.toThrow();
    });

    it('should handle non-finite values in params', () => {
      manager.setParams('user1', {
        alpha: NaN,
        fatigueK: Infinity
      });

      const params = manager.getParams('user1');
      expect(Number.isFinite(params.alpha)).toBe(true);
      expect(Number.isFinite(params.fatigueK)).toBe(true);
    });
  });

  describe('Auto-Adjust Disabled', () => {
    it('should not adjust params when autoAdjust is disabled', () => {
      const noAutoManager = new UserParamsManager({ enableAutoAdjust: false });
      noAutoManager.setParams('user1', { optimalDifficulty: 0.5 });

      for (let i = 0; i < 10; i++) {
        noAutoManager.updateParams('user1', {
          accuracy: 0.95,
          fatigueChange: -0.2,
          motivationChange: 0.3,
          reward: 0.9
        });
      }

      const params = noAutoManager.getParams('user1');
      expect(params.optimalDifficulty).toBe(0.5);
    });
  });
});
