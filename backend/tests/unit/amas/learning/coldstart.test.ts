/**
 * ColdStartManager Unit Tests
 * 测试冷启动管理器的阶段转换、探测策略和用户分类
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ColdStartManager, ColdStartState } from '../../../../src/amas/learning/coldstart';
import { Action, UserState } from '../../../../src/amas/types';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';

describe('ColdStartManager', () => {
  let manager: ColdStartManager;

  const mockUserState: UserState = {
    ability: 0.5,
    A: 0.7,
    F: 0.3,
    M: 0.0,
    C: { mem: 0.5, speed: 0.5 }
  };

  beforeEach(() => {
    manager = new ColdStartManager();
  });

  describe('Initialization', () => {
    it('should initialize with classify phase', () => {
      expect(manager.getPhase()).toBe('classify');
      expect(manager.getUserType()).toBeNull();
      expect(manager.getSettledStrategy()).toBeNull();
      expect(manager.isCompleted()).toBe(false);
    });

    it('should have zero update count initially', () => {
      expect(manager.getUpdateCount()).toBe(0);
    });

    it('should have zero progress initially', () => {
      expect(manager.getProgress()).toBe(0);
    });
  });

  describe('Phase Transitions', () => {
    it('should transition from classify to explore after 5 probes', () => {
      const context = { recentErrorRate: 0.2, recentResponseTime: 1000 };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.8, context);
      }

      expect(manager.getPhase()).toBe('explore');
      expect(manager.getUserType()).not.toBeNull();
    });

    it('should classify user as fast with good performance', () => {
      const context = {
        recentErrorRate: 0.1,
        recentResponseTime: 1000
      };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.9, context);
      }

      expect(manager.getUserType()).toBe('fast');
    });

    it('should classify user as cautious with poor performance', () => {
      const context = {
        recentErrorRate: 0.5,
        recentResponseTime: 4000
      };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.3, context);
      }

      expect(manager.getUserType()).toBe('cautious');
    });
  });

  describe('Action Selection', () => {
    it('should return probe actions during classify phase', () => {
      const context = { recentErrorRate: 0.3, recentResponseTime: 2000 };
      const actions: Action[] = [];

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        actions.push(selection.action);
        manager.update(mockUserState, selection.action, 0.5, context);
      }

      expect(actions.length).toBe(5);
    });

    it('should return settled strategy after classification', () => {
      const context = { recentErrorRate: 0.2, recentResponseTime: 1500 };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.7, context);
      }

      const strategy = manager.getSettledStrategy();
      expect(strategy).not.toBeNull();
      expect(strategy).toHaveProperty('interval_scale');
      expect(strategy).toHaveProperty('new_ratio');
      expect(strategy).toHaveProperty('difficulty');
    });

    it('should return confidence between 0 and 1', () => {
      const context = { recentErrorRate: 0.3, recentResponseTime: 2000 };
      const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);

      expect(selection.confidence).toBeGreaterThanOrEqual(0);
      expect(selection.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Progress Tracking', () => {
    it('should increase progress during classify phase', () => {
      const context = { recentErrorRate: 0.3, recentResponseTime: 2000 };
      let prevProgress = 0;

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.5, context);

        const progress = manager.getProgress();
        expect(progress).toBeGreaterThanOrEqual(prevProgress);
        prevProgress = progress;
      }
    });

    it('should reach 0.5 progress at end of classify phase', () => {
      const context = { recentErrorRate: 0.3, recentResponseTime: 2000 };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.5, context);
      }

      expect(manager.getProgress()).toBeCloseTo(0.5, 1);
    });
  });

  describe('State Persistence', () => {
    it('should export and restore state correctly', () => {
      const context = { recentErrorRate: 0.2, recentResponseTime: 1500 };

      for (let i = 0; i < 3; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.7, context);
      }

      const state = manager.getState();
      expect(state.phase).toBe('classify');
      expect(state.probeIndex).toBe(3);
      expect(state.updateCount).toBe(3);

      const newManager = new ColdStartManager();
      newManager.setState(state);

      expect(newManager.getPhase()).toBe('classify');
      expect(newManager.getUpdateCount()).toBe(3);
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        manager.setState(null as unknown as ColdStartState);
      }).not.toThrow();

      expect(manager.getPhase()).toBe('classify');
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      const context = { recentErrorRate: 0.2, recentResponseTime: 1500 };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, 0.7, context);
      }

      manager.reset();

      expect(manager.getPhase()).toBe('classify');
      expect(manager.getUserType()).toBeNull();
      expect(manager.getUpdateCount()).toBe(0);
      expect(manager.getProgress()).toBe(0);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = manager.getCapabilities();

      expect(caps.supportsOnlineLearning).toBe(true);
      expect(caps.supportsBatchUpdate).toBe(false);
      expect(caps.requiresPretraining).toBe(false);
      expect(caps.minSamplesForReliability).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty action list', () => {
      const context = { recentErrorRate: 0.3, recentResponseTime: 2000 };

      expect(() => {
        manager.selectAction(mockUserState, [], context);
      }).toThrow();
    });

    it('should handle extreme error rates', () => {
      const context = { recentErrorRate: 1.0, recentResponseTime: 10000 };

      for (let i = 0; i < 5; i++) {
        const selection = manager.selectAction(mockUserState, ACTION_SPACE, context);
        manager.update(mockUserState, selection.action, -0.5, context);
      }

      expect(manager.getUserType()).toBe('cautious');
    });
  });
});
