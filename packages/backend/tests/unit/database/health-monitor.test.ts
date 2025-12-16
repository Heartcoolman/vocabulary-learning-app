/**
 * 健康监控器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthMonitor, createHealthMonitor } from '../../../src/database/proxy/health-monitor';
import { DatabaseAdapter } from '../../../src/database/adapters/types';

// 模拟数据库适配器
function createMockAdapter(healthy: boolean, latency: number = 10): DatabaseAdapter {
  return {
    type: 'postgresql',
    isConnected: vi.fn().mockReturnValue(healthy),
    connect: vi.fn(),
    disconnect: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({
      healthy,
      latency,
      error: healthy ? undefined : 'Connection failed',
    }),
    getModel: vi.fn(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    bulkInsert: vi.fn(),
    bulkUpsert: vi.fn(),
    getTableData: vi.fn(),
    getTableRowCount: vi.fn(),
    getAllTableNames: vi.fn(),
  } as unknown as DatabaseAdapter;
}

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;
  let mockAdapter: DatabaseAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAdapter = createMockAdapter(true);
  });

  afterEach(() => {
    if (healthMonitor) {
      healthMonitor.stop();
    }
    vi.useRealTimers();
  });

  describe('初始化', () => {
    it('应该正确创建健康监控器', () => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });

      expect(healthMonitor).toBeDefined();
      expect(healthMonitor.getConsecutiveFailures()).toBe(0);
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(0);
    });
  });

  describe('健康检查', () => {
    beforeEach(() => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });
    });

    it('checkNow 应该执行立即检查', async () => {
      const result = await healthMonitor.checkNow();

      expect(result.healthy).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('健康检查成功应该增加连续成功计数', async () => {
      await healthMonitor.checkNow();
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(1);
      expect(healthMonitor.getConsecutiveFailures()).toBe(0);

      await healthMonitor.checkNow();
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(2);
    });

    it('健康检查失败应该增加连续失败计数', async () => {
      mockAdapter = createMockAdapter(false);
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });

      await healthMonitor.checkNow();
      expect(healthMonitor.getConsecutiveFailures()).toBe(1);
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(0);

      await healthMonitor.checkNow();
      expect(healthMonitor.getConsecutiveFailures()).toBe(2);
    });

    it('成功后失败应该重置成功计数', async () => {
      // 先成功两次
      await healthMonitor.checkNow();
      await healthMonitor.checkNow();
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(2);

      // 切换到失败
      (mockAdapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
        healthy: false,
        error: 'Connection failed',
      });

      await healthMonitor.checkNow();
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(0);
      expect(healthMonitor.getConsecutiveFailures()).toBe(1);
    });
  });

  describe('阈值检测', () => {
    beforeEach(() => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 2,
        minRecoveryIntervalMs: 1000,
      });
    });

    it('达到故障阈值应该返回 true', async () => {
      mockAdapter = createMockAdapter(false);
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 2,
        minRecoveryIntervalMs: 1000,
      });

      await healthMonitor.checkNow();
      await healthMonitor.checkNow();
      expect(healthMonitor.isFailureThresholdReached()).toBe(false);

      await healthMonitor.checkNow();
      expect(healthMonitor.isFailureThresholdReached()).toBe(true);
    });

    it('达到恢复阈值应该返回 true', async () => {
      // 先标记为已降级
      healthMonitor.markDegraded();

      // 等待最小恢复间隔
      vi.advanceTimersByTime(1100);

      await healthMonitor.checkNow();
      expect(healthMonitor.isRecoveryThresholdReached()).toBe(false);

      await healthMonitor.checkNow();
      expect(healthMonitor.isRecoveryThresholdReached()).toBe(true);
    });

    it('在最小恢复间隔内不应该判定为恢复', async () => {
      mockAdapter = createMockAdapter(false);
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 2,
        minRecoveryIntervalMs: 30000,
      });

      // 触发故障
      await healthMonitor.checkNow();
      await healthMonitor.checkNow();
      await healthMonitor.checkNow();

      // 切换到成功
      (mockAdapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
        healthy: true,
        latency: 10,
      });

      await healthMonitor.checkNow();
      await healthMonitor.checkNow();

      // 连续成功达到阈值，但未达到最小恢复间隔
      expect(healthMonitor.getConsecutiveSuccesses()).toBe(2);
      expect(healthMonitor.isRecoveryThresholdReached()).toBe(false);
    });
  });

  describe('事件触发', () => {
    beforeEach(() => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 2,
        recoveryThreshold: 2,
        minRecoveryIntervalMs: 100,
      });
    });

    it('应该在健康检查时触发 health-check 事件', async () => {
      const handler = vi.fn();
      healthMonitor.on('health-check', handler);

      await healthMonitor.checkNow();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: true,
        }),
      );
    });

    it('应该在检测到故障时触发 failure-detected 事件', async () => {
      mockAdapter = createMockAdapter(false);
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 2,
        recoveryThreshold: 2,
        minRecoveryIntervalMs: 100,
      });

      const handler = vi.fn();
      healthMonitor.on('failure-detected', handler);

      await healthMonitor.checkNow();

      expect(handler).toHaveBeenCalledWith(1);
    });

    it('应该在达到故障阈值时触发 threshold-reached 事件', async () => {
      mockAdapter = createMockAdapter(false);
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 2,
        recoveryThreshold: 2,
        minRecoveryIntervalMs: 100,
      });

      const handler = vi.fn();
      healthMonitor.on('threshold-reached', handler);

      await healthMonitor.checkNow();
      expect(handler).not.toHaveBeenCalled();

      await healthMonitor.checkNow();
      expect(handler).toHaveBeenCalledWith('failure');
    });
  });

  describe('定时检查', () => {
    it('start 应该启动定时健康检查', async () => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 1000,
        timeoutMs: 500,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });

      healthMonitor.start();

      // 等待第一次检查
      await vi.advanceTimersByTimeAsync(1100);

      expect(mockAdapter.healthCheck).toHaveBeenCalled();
    });

    it('stop 应该停止定时健康检查', async () => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 1000,
        timeoutMs: 500,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });

      healthMonitor.start();
      healthMonitor.stop();

      const callCount = (mockAdapter.healthCheck as ReturnType<typeof vi.fn>).mock.calls.length;

      await vi.advanceTimersByTimeAsync(3000);

      expect((mockAdapter.healthCheck as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callCount,
      );
    });
  });

  describe('状态管理', () => {
    beforeEach(() => {
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });
    });

    it('reset 应该重置所有计数器', async () => {
      await healthMonitor.checkNow();
      await healthMonitor.checkNow();

      healthMonitor.reset();

      expect(healthMonitor.getConsecutiveSuccesses()).toBe(0);
      expect(healthMonitor.getConsecutiveFailures()).toBe(0);
      expect(healthMonitor.getLastResult()).toBeNull();
    });

    it('markRecovered 应该重置故障计数', async () => {
      mockAdapter = createMockAdapter(false);
      healthMonitor = createHealthMonitor(mockAdapter, {
        intervalMs: 5000,
        timeoutMs: 3000,
        failureThreshold: 3,
        recoveryThreshold: 5,
        minRecoveryIntervalMs: 30000,
      });

      await healthMonitor.checkNow();
      await healthMonitor.checkNow();

      healthMonitor.markRecovered();

      expect(healthMonitor.getConsecutiveFailures()).toBe(0);
    });

    it('markDegraded 应该重置成功计数', async () => {
      await healthMonitor.checkNow();
      await healthMonitor.checkNow();

      healthMonitor.markDegraded();

      expect(healthMonitor.getConsecutiveSuccesses()).toBe(0);
    });
  });
});
