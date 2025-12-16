/**
 * 数据库状态机单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DatabaseStateMachine,
  createStateMachine,
} from '../../../src/database/proxy/state-machine';

describe('DatabaseStateMachine', () => {
  let stateMachine: DatabaseStateMachine;

  beforeEach(() => {
    stateMachine = createStateMachine('NORMAL');
  });

  describe('初始状态', () => {
    it('应该以 NORMAL 状态启动', () => {
      expect(stateMachine.getState()).toBe('NORMAL');
      expect(stateMachine.isNormal()).toBe(true);
      expect(stateMachine.isDegraded()).toBe(false);
      expect(stateMachine.isSyncing()).toBe(false);
    });

    it('可以指定初始状态', () => {
      const degradedMachine = createStateMachine('DEGRADED');
      expect(degradedMachine.getState()).toBe('DEGRADED');
    });
  });

  describe('状态转换', () => {
    it('NORMAL -> DEGRADED 应该成功', () => {
      const result = stateMachine.degraded('PG down');
      expect(result).toBe(true);
      expect(stateMachine.getState()).toBe('DEGRADED');
    });

    it('DEGRADED -> SYNCING 应该成功', () => {
      stateMachine.degraded('PG down');
      const result = stateMachine.startSync('PG recovered');
      expect(result).toBe(true);
      expect(stateMachine.getState()).toBe('SYNCING');
    });

    it('SYNCING -> NORMAL 应该成功', () => {
      stateMachine.degraded('PG down');
      stateMachine.startSync('PG recovered');
      const result = stateMachine.recover('Sync complete');
      expect(result).toBe(true);
      expect(stateMachine.getState()).toBe('NORMAL');
    });

    it('SYNCING -> DEGRADED 应该成功（同步失败）', () => {
      stateMachine.degraded('PG down');
      stateMachine.startSync('PG recovered');
      const result = stateMachine.syncFailed('Sync failed');
      expect(result).toBe(true);
      expect(stateMachine.getState()).toBe('DEGRADED');
    });

    it('NORMAL -> SYNCING 应该失败（无效转换）', () => {
      const result = stateMachine.startSync('Invalid');
      expect(result).toBe(false);
      expect(stateMachine.getState()).toBe('NORMAL');
    });

    it('DEGRADED -> NORMAL 应该失败（无效转换）', () => {
      stateMachine.degraded('PG down');
      const result = stateMachine.recover('Invalid');
      expect(result).toBe(false);
      expect(stateMachine.getState()).toBe('DEGRADED');
    });
  });

  describe('状态检查', () => {
    it('canTransitionTo 应该正确检查有效转换', () => {
      expect(stateMachine.canTransitionTo('DEGRADED')).toBe(true);
      expect(stateMachine.canTransitionTo('SYNCING')).toBe(false);
      expect(stateMachine.canTransitionTo('NORMAL')).toBe(false);
    });
  });

  describe('事件触发', () => {
    it('应该在状态变化时触发事件', () => {
      const handler = vi.fn();
      stateMachine.on('state-changed', handler);

      stateMachine.degraded('Test');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'NORMAL',
          to: 'DEGRADED',
          reason: 'Test',
        }),
      );
    });

    it('应该在进入特定状态时触发对应事件', () => {
      const degradedHandler = vi.fn();
      const syncHandler = vi.fn();
      const normalHandler = vi.fn();

      stateMachine.on('enter-degraded', degradedHandler);
      stateMachine.on('enter-syncing', syncHandler);
      stateMachine.on('enter-normal', normalHandler);

      stateMachine.degraded('Test');
      expect(degradedHandler).toHaveBeenCalledTimes(1);

      stateMachine.startSync('Test');
      expect(syncHandler).toHaveBeenCalledTimes(1);

      stateMachine.recover('Test');
      expect(normalHandler).toHaveBeenCalledTimes(1);
    });

    it('应该在无效转换时触发 transition-blocked 事件', () => {
      const handler = vi.fn();
      stateMachine.on('transition-blocked', handler);

      stateMachine.startSync('Invalid');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('统计信息', () => {
    it('应该正确记录状态变化次数', () => {
      stateMachine.degraded('Test');
      stateMachine.startSync('Test');
      stateMachine.recover('Test');

      const stats = stateMachine.getStats();
      expect(stats.stateChangeCount).toBe(3);
    });

    it('应该记录最近的转换历史', () => {
      stateMachine.degraded('Reason 1');
      stateMachine.startSync('Reason 2');

      const history = stateMachine.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].reason).toBe('Reason 1');
      expect(history[1].reason).toBe('Reason 2');
    });

    it('getLastTransition 应该返回最近一次转换', () => {
      stateMachine.degraded('First');
      stateMachine.startSync('Second');

      const lastTransition = stateMachine.getLastTransition();
      expect(lastTransition?.reason).toBe('Second');
    });
  });

  describe('重置', () => {
    it('reset 应该恢复初始状态', () => {
      stateMachine.degraded('Test');
      stateMachine.reset();

      expect(stateMachine.getState()).toBe('NORMAL');
      expect(stateMachine.getHistory()).toHaveLength(0);
      expect(stateMachine.getStats().stateChangeCount).toBe(0);
    });
  });
});
