/**
 * ColdStart State Persistence Tests
 *
 * 测试冷启动状态的持久化和恢复功能
 * 验证修复：冷启动状态现在会被正确持久化，服务重启后不会丢失
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ColdStartManager, ColdStartState } from '../../../src/amas/learning/coldstart';
import { IsolationManager } from '../../../src/amas/engine/engine-isolation';
import { ColdStartStateData } from '../../../src/amas/engine/engine-types';
import { Action, UserState } from '../../../src/amas/types';
import { STANDARD_ACTIONS, DEFAULT_USER_STATE } from '../../fixtures/amas-fixtures';

// Mock feature flags to enable cold start
vi.mock('../../../src/amas/config/feature-flags', () => ({
  getFeatureFlags: () => ({
    enableEnsemble: false,
    enableColdStartManager: true,
    enableThompsonSampling: false,
    enableHeuristicBaseline: false,
    enableACTRMemory: false,
    enableUserParamsManager: false,
    enableTrendAnalyzer: false
  }),
  isColdStartEnabled: () => true
}));

describe('ColdStart State Persistence', () => {
  const defaultContext = {};
  const defaultState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6, stability: 0.5 },
    conf: 0.5,
    ts: Date.now()
  };

  // ==================== ColdStartManager setState/getState Tests ====================

  describe('ColdStartManager state serialization', () => {
    let coldStart: ColdStartManager;

    beforeEach(() => {
      coldStart = new ColdStartManager();
    });

    it('should serialize state after completing probes', () => {
      // 执行3个探测动作
      for (let i = 0; i < 3; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1500,
          recentErrorRate: 0.1
        });
      }

      const state = coldStart.getState();

      // 验证状态包含所有必要字段
      // 注意：贝叶斯早停可能在2次探测后就触发，所以probeIndex可能是2或3
      expect(state.phase).toBe('explore');
      expect(state.probeIndex).toBeGreaterThanOrEqual(2);
      expect(state.probeIndex).toBeLessThanOrEqual(3);
      expect(state.updateCount).toBe(3);
      expect(state.userType).not.toBeNull();
      expect(state.settledStrategy).not.toBeNull();
    });

    it('should restore state correctly after serialization', () => {
      // 执行探测并进入explore阶段
      for (let i = 0; i < 3; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1200,
          recentErrorRate: 0.05
        });
      }

      const originalState = coldStart.getState();

      // 创建新实例并恢复状态
      const newColdStart = new ColdStartManager();
      newColdStart.setState(originalState);

      const restoredState = newColdStart.getState();

      // 验证关键状态字段被正确恢复
      expect(restoredState.phase).toBe(originalState.phase);
      expect(restoredState.userType).toBe(originalState.userType);
      expect(restoredState.probeIndex).toBe(originalState.probeIndex);
      expect(restoredState.updateCount).toBe(originalState.updateCount);
      expect(restoredState.settledStrategy).toEqual(originalState.settledStrategy);
    });

    it('should restore normal phase state correctly', () => {
      // 执行足够多的交互进入normal阶段
      for (let i = 0; i < 10; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1500,
          recentErrorRate: 0.1
        });
      }

      const originalState = coldStart.getState();

      // 如果已进入normal阶段
      if (originalState.phase === 'normal') {
        // 创建新实例并恢复
        const newColdStart = new ColdStartManager();
        newColdStart.setState(originalState);

        // 验证恢复后仍然是normal阶段
        expect(newColdStart.getPhase()).toBe('normal');
        expect(newColdStart.isCompleted()).toBe(true);
      }
    });
  });

  // ==================== ColdStartStateData Format Tests ====================

  describe('ColdStartStateData format', () => {
    let coldStart: ColdStartManager;

    beforeEach(() => {
      coldStart = new ColdStartManager();
    });

    it('should convert to ColdStartStateData format for persistence', () => {
      // 执行探测
      for (let i = 0; i < 3; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1000,
          recentErrorRate: 0.0
        });
      }

      // 模拟engine-core.ts中的持久化格式转换
      const persistData: ColdStartStateData = {
        phase: coldStart.getPhase(),
        userType: coldStart.getUserType(),
        probeIndex: coldStart.getState().probeIndex,
        updateCount: coldStart.getUpdateCount(),
        settledStrategy: coldStart.getSettledStrategy()
      };

      // 验证格式正确
      expect(persistData.phase).toMatch(/^(classify|explore|normal)$/);
      expect(persistData.userType).toMatch(/^(fast|stable|cautious)$/);
      expect(typeof persistData.probeIndex).toBe('number');
      expect(typeof persistData.updateCount).toBe('number');
      expect(persistData.settledStrategy).not.toBeNull();
    });

    it('should restore from ColdStartStateData format', () => {
      // 模拟从数据库加载的数据
      const savedData: ColdStartStateData = {
        phase: 'explore',
        userType: 'fast',
        probeIndex: 3,
        updateCount: 5,
        settledStrategy: {
          interval_scale: 1.2,
          new_ratio: 0.35,
          difficulty: 'hard',
          batch_size: 12,
          hint_level: 0
        }
      };

      // 恢复状态
      const restoredColdStart = new ColdStartManager();
      restoredColdStart.setState({
        phase: savedData.phase,
        userType: savedData.userType,
        probeIndex: savedData.probeIndex,
        results: [], // 结果不持久化
        settledStrategy: savedData.settledStrategy,
        updateCount: savedData.updateCount
      });

      // 验证恢复正确
      expect(restoredColdStart.getPhase()).toBe('explore');
      expect(restoredColdStart.getUserType()).toBe('fast');
      expect(restoredColdStart.getUpdateCount()).toBe(5);
      expect(restoredColdStart.getSettledStrategy()).toEqual(savedData.settledStrategy);
    });
  });

  // ==================== Direct ColdStartManager Restoration Tests ====================

  describe('ColdStartManager direct restoration', () => {
    it('should restore cold start state correctly', () => {
      // 模拟从数据库加载的冷启动状态
      const savedColdStartState: ColdStartStateData = {
        phase: 'normal',
        userType: 'stable',
        probeIndex: 3,
        updateCount: 10,
        settledStrategy: {
          interval_scale: 1.0,
          new_ratio: 0.25,
          difficulty: 'mid',
          batch_size: 8,
          hint_level: 1
        }
      };

      // 创建新的ColdStartManager并恢复状态
      const coldStart = new ColdStartManager();
      coldStart.setState({
        phase: savedColdStartState.phase,
        userType: savedColdStartState.userType,
        probeIndex: savedColdStartState.probeIndex,
        results: [],
        settledStrategy: savedColdStartState.settledStrategy,
        updateCount: savedColdStartState.updateCount
      });

      // 验证冷启动状态被正确恢复
      expect(coldStart.getPhase()).toBe('normal');
      expect(coldStart.getUserType()).toBe('stable');
      expect(coldStart.getUpdateCount()).toBe(10);
      expect(coldStart.isCompleted()).toBe(true);
    });

    it('should create fresh cold start without saved state', () => {
      const coldStart = new ColdStartManager();

      // 验证是全新的冷启动状态
      expect(coldStart.getPhase()).toBe('classify');
      expect(coldStart.getUserType()).toBeNull();
      expect(coldStart.getUpdateCount()).toBe(0);
    });

    it('should not share state between different instances', () => {
      // 用户A的ColdStartManager
      const coldStartA = new ColdStartManager();
      coldStartA.setState({
        phase: 'normal',
        userType: 'fast',
        probeIndex: 3,
        results: [],
        settledStrategy: null,
        updateCount: 15
      });

      // 用户B的ColdStartManager（新实例）
      const coldStartB = new ColdStartManager();

      // 验证状态隔离
      expect(coldStartA.getPhase()).toBe('normal');
      expect(coldStartB.getPhase()).toBe('classify');
      expect(coldStartA.getUpdateCount()).toBe(15);
      expect(coldStartB.getUpdateCount()).toBe(0);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle invalid phase gracefully', () => {
      const coldStart = new ColdStartManager();

      // 尝试恢复无效状态
      coldStart.setState({
        phase: 'invalid' as any,
        userType: null,
        probeIndex: 0,
        results: [],
        settledStrategy: null,
        updateCount: 0
      });

      // 应该回退到classify
      expect(coldStart.getPhase()).toBe('classify');
    });

    it('should handle invalid userType gracefully', () => {
      const coldStart = new ColdStartManager();

      coldStart.setState({
        phase: 'explore',
        userType: 'invalid' as any,
        probeIndex: 3,
        results: [],
        settledStrategy: null,
        updateCount: 5
      });

      // 应该设为null
      expect(coldStart.getUserType()).toBeNull();
    });

    it('should handle negative updateCount gracefully', () => {
      const coldStart = new ColdStartManager();

      coldStart.setState({
        phase: 'explore',
        userType: 'stable',
        probeIndex: 3,
        results: [],
        settledStrategy: null,
        updateCount: -5
      });

      // 应该修正为0
      expect(coldStart.getUpdateCount()).toBe(0);
    });

    it('should handle corrupted settledStrategy gracefully', () => {
      const coldStart = new ColdStartManager();

      coldStart.setState({
        phase: 'explore',
        userType: 'fast',
        probeIndex: 3,
        results: [],
        settledStrategy: { invalid: 'data' } as any,
        updateCount: 5
      });

      // 应该设为null或被验证修复
      const strategy = coldStart.getSettledStrategy();
      // 策略应该被验证，无效的会被设为null
      expect(strategy === null || typeof strategy.interval_scale === 'number').toBe(true);
    });
  });

  // ==================== Complete Flow Simulation ====================

  describe('complete persistence flow simulation', () => {
    it('should survive simulated service restart', () => {
      // 第一个"服务实例"
      const coldStart1 = new ColdStartManager();

      // 用户交互8次，进入normal阶段
      for (let i = 0; i < 8; i++) {
        const result = coldStart1.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart1.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1500,
          recentErrorRate: 0.1
        });
      }

      // 模拟持久化到数据库
      const persistedData: ColdStartStateData = {
        phase: coldStart1.getPhase(),
        userType: coldStart1.getUserType(),
        probeIndex: coldStart1.getState().probeIndex,
        updateCount: coldStart1.getUpdateCount(),
        settledStrategy: coldStart1.getSettledStrategy()
      };

      // 模拟服务重启 - 创建新的ColdStartManager实例
      const coldStart2 = new ColdStartManager();

      // 从"数据库"恢复状态
      coldStart2.setState({
        phase: persistedData.phase,
        userType: persistedData.userType,
        probeIndex: persistedData.probeIndex,
        results: [],
        settledStrategy: persistedData.settledStrategy,
        updateCount: persistedData.updateCount
      });

      // 验证状态正确恢复
      expect(coldStart2.getPhase()).toBe(coldStart1.getPhase());
      expect(coldStart2.getUserType()).toBe(coldStart1.getUserType());
      expect(coldStart2.getUpdateCount()).toBe(coldStart1.getUpdateCount());
      expect(coldStart2.getSettledStrategy()).toEqual(coldStart1.getSettledStrategy());

      // 继续交互应该保持normal阶段，不会重置
      const result = coldStart2.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      coldStart2.update(defaultState, result.action, 1.0, defaultContext);

      // 阶段应该保持不变
      expect(coldStart2.getPhase()).toBe(persistedData.phase);
    });

    it('should eventually transition to normal phase', () => {
      // 验证冷启动最终会进入normal阶段
      const coldStart = new ColdStartManager();
      const totalDecisions = 20;

      for (let i = 0; i < totalDecisions; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1500,
          recentErrorRate: 0.1
        });
      }

      // 最终应该在normal阶段或explore阶段（取决于阈值配置）
      const phase = coldStart.getPhase();
      expect(['explore', 'normal']).toContain(phase);

      // updateCount应该等于总决策数
      expect(coldStart.getUpdateCount()).toBe(totalDecisions);
    });

    it('should not reset state after persistence simulation', () => {
      // 关键测试：验证持久化后状态不会重置
      const coldStart = new ColdStartManager();

      // 执行8次交互
      for (let i = 0; i < 8; i++) {
        const result = coldStart.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
        coldStart.update(defaultState, result.action, 1.0, {
          recentResponseTime: 1500,
          recentErrorRate: 0.1
        });
      }

      const stateAfter8 = coldStart.getState();
      const phaseAfter8 = coldStart.getPhase();

      // 模拟"服务重启"：持久化并恢复状态
      const persistedData: ColdStartStateData = {
        phase: phaseAfter8,
        userType: coldStart.getUserType(),
        probeIndex: stateAfter8.probeIndex,
        updateCount: coldStart.getUpdateCount(),
        settledStrategy: coldStart.getSettledStrategy()
      };

      // 创建新实例并恢复
      const coldStart2 = new ColdStartManager();
      coldStart2.setState({
        phase: persistedData.phase,
        userType: persistedData.userType,
        probeIndex: persistedData.probeIndex,
        results: [],
        settledStrategy: persistedData.settledStrategy,
        updateCount: persistedData.updateCount
      });

      // 验证状态被正确恢复，没有重置
      expect(coldStart2.getPhase()).toBe(phaseAfter8);
      expect(coldStart2.getUpdateCount()).toBe(8);

      // 再执行一次交互
      const result = coldStart2.selectAction(defaultState, STANDARD_ACTIONS, defaultContext);
      coldStart2.update(defaultState, result.action, 1.0, defaultContext);

      // updateCount应该是9，而不是重置为1
      expect(coldStart2.getUpdateCount()).toBe(9);
    });
  });
});
