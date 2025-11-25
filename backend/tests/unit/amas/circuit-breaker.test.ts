/**
 * Circuit Breaker Tests
 * 熔断器单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitState } from '../../../src/amas/common/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  let onStateChange: ReturnType<typeof vi.fn>;
  let onEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onStateChange = vi.fn();
    onEvent = vi.fn();

    breaker = new CircuitBreaker({
      failureThreshold: 0.5,
      windowSize: 10,
      openDurationMs: 1000,
      halfOpenProbe: 2,
      onStateChange,
      onEvent
    });
  });

  describe('初始状态', () => {
    it('应该初始化为CLOSED状态', () => {
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canExecute()).toBe(true);
    });

    it('应该允许执行请求', () => {
      expect(breaker.canExecute()).toBe(true);
    });
  });

  describe('成功记录', () => {
    it('应该记录成功并保持CLOSED状态', () => {
      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureRate()).toBe(0);
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      );
    });
  });

  describe('失败记录和熔断', () => {
    it('应该在失败率超过阈值时打开熔断器', () => {
      // 记录10个请求: 6个失败，4个成功 (60%失败率)
      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canExecute()).toBe(false);
      expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'open' })
      );
    });

    it('应该在样本不足时不触发熔断', () => {
      // 只有5个样本，窗口大小为10
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureRate()).toBe(1);
    });

    it('应该在失败率低于阈值时保持CLOSED', () => {
      // 10个请求: 4个失败，6个成功 (40%失败率)
      for (let i = 0; i < 6; i++) breaker.recordSuccess();
      for (let i = 0; i < 4; i++) breaker.recordFailure();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureRate()).toBe(0.4);
    });
  });

  describe('OPEN状态', () => {
    beforeEach(() => {
      // 触发熔断
      for (let i = 0; i < 10; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('OPEN');
    });

    it('应该拒绝执行请求', () => {
      expect(breaker.canExecute()).toBe(false);
    });

    it('应该在持续时间后转为HALF_OPEN', () => {
      const now = Date.now();

      // 1秒后检查
      expect(breaker.canExecute(now + 1100)).toBe(true);
      expect(breaker.getState()).toBe('HALF_OPEN');
      expect(onStateChange).toHaveBeenCalledWith('OPEN', 'HALF_OPEN');
    });
  });

  describe('HALF_OPEN状态', () => {
    beforeEach(() => {
      // 触发熔断并进入半开状态
      for (let i = 0; i < 10; i++) {
        breaker.recordFailure();
      }
      const now = Date.now();
      breaker.canExecute(now + 1100); // 触发HALF_OPEN
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('应该在探测成功后转为CLOSED', () => {
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('HALF_OPEN');

      breaker.recordSuccess(); // 第二次成功
      expect(breaker.getState()).toBe('CLOSED');
      expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'CLOSED');
    });

    it('应该在探测失败后立即重新打开', () => {
      breaker.recordFailure();

      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canExecute()).toBe(false);
      expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'OPEN');
    });

    it('应该允许探测请求', () => {
      expect(breaker.canExecute()).toBe(true);
    });
  });

  describe('滑动窗口', () => {
    it('应该维护窗口大小', () => {
      // 记录20个请求，但窗口大小为10
      for (let i = 0; i < 20; i++) {
        breaker.recordSuccess();
      }

      // 失败率应该基于最近10个请求
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      // 最近10个请求: 5个成功，5个失败 = 50%
      expect(breaker.getFailureRate()).toBe(0.5);
    });
  });

  describe('重置', () => {
    it('应该重置所有状态', () => {
      // 触发熔断
      for (let i = 0; i < 10; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('OPEN');

      // 重置
      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureRate()).toBe(0);
      expect(breaker.canExecute()).toBe(true);
    });
  });

  describe('事件回调', () => {
    it('应该触发成功事件', () => {
      breaker.recordSuccess();

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          at: expect.any(Number)
        })
      );
    });

    it('应该触发失败事件', () => {
      breaker.recordFailure('test failure');

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'failure',
          at: expect.any(Number)
        })
      );
    });

    it('应该触发状态转换事件', () => {
      // 触发熔断
      for (let i = 0; i < 10; i++) {
        breaker.recordFailure();
      }

      expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'open',
          at: expect.any(Number)
        })
      );
    });
  });
});
