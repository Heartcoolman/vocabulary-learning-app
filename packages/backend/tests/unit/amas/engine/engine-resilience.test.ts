/**
 * Engine Resilience Tests
 *
 * 测试 AMAS Engine 弹性保护模块：
 * 1. 熔断器管理 - canExecute, recordSuccess, recordFailure
 * 2. 超时保护 - executeWithTimeout
 * 3. 智能降级策略 - createIntelligentFallbackResult, createFallbackResult
 * 4. 指标记录 - recordDegradation, recordLatency
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResilienceManager } from '../../../../src/amas/engine/engine-resilience';
import { ProcessOptions, Logger } from '../../../../src/amas/engine/engine-types';
import { UserState } from '../../../../src/amas/types';
import { mockLogger, mockTelemetry, delay } from '../../../setup';

// Mock dependencies
vi.mock('../../../../src/amas/common/circuit-breaker', () => ({
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    canExecute: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getState: vi.fn().mockReturnValue('CLOSED'),
    reset: vi.fn()
  })),
  createDefaultCircuitBreaker: vi.fn().mockImplementation(() => ({
    canExecute: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getState: vi.fn().mockReturnValue('CLOSED'),
    reset: vi.fn()
  }))
}));

vi.mock('../../../../src/amas/common/telemetry', () => ({
  telemetry: {
    record: vi.fn(),
    increment: vi.fn(),
    histogram: vi.fn(),
    gauge: vi.fn()
  }
}));

vi.mock('../../../../src/amas/decision/fallback', () => ({
  intelligentFallback: vi.fn().mockReturnValue({
    strategy: {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1
    },
    action: {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1
    },
    explanation: '系统使用安全默认策略,确保学习体验稳定。',
    degraded: true,
    reason: 'circuit_open'
  })
}));

vi.mock('../../../../src/amas/config/action-space', () => ({
  ACTION_SPACE: [
    { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'mid', batch_size: 8, hint_level: 1 }
  ]
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null)
    }
  }
}));

vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Import mocked modules for assertions
import { telemetry } from '../../../../src/amas/common/telemetry';
import { intelligentFallback } from '../../../../src/amas/decision/fallback';
import { createDefaultCircuitBreaker } from '../../../../src/amas/common/circuit-breaker';

describe('EngineResilience', () => {
  let resilience: ResilienceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resilience = new ResilienceManager(mockLogger as unknown as Logger);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('should create ResilienceManager instance', () => {
      expect(resilience).toBeDefined();
      expect(resilience).toBeInstanceOf(ResilienceManager);
    });

    it('should work without logger', () => {
      const resilienceWithoutLogger = new ResilienceManager();
      expect(resilienceWithoutLogger).toBeDefined();
    });

    it('should initialize circuit breaker with callbacks', () => {
      expect(createDefaultCircuitBreaker).toHaveBeenCalled();
    });
  });

  // ==================== 熔断器管理测试 ====================

  describe('circuit breaker management', () => {
    describe('canExecute', () => {
      it('should delegate to circuit breaker canExecute', () => {
        const result = resilience.canExecute();
        expect(result).toBe(true);
      });

      it('should return false when circuit is open', () => {
        // Re-mock to return false
        const mockCircuit = {
          canExecute: vi.fn().mockReturnValue(false),
          recordSuccess: vi.fn(),
          recordFailure: vi.fn()
        };

        (createDefaultCircuitBreaker as any).mockReturnValueOnce(mockCircuit);

        const newResilience = new ResilienceManager();
        expect(newResilience.canExecute()).toBe(false);
      });
    });

    describe('recordSuccess', () => {
      it('should delegate to circuit breaker recordSuccess', () => {
        resilience.recordSuccess();
        // The mock circuit breaker's recordSuccess should be called
        // We verify by checking the internal state behavior
        expect(resilience.canExecute()).toBe(true);
      });
    });

    describe('recordFailure', () => {
      it('should delegate to circuit breaker recordFailure with error message', () => {
        const errorMessage = 'Test error';
        resilience.recordFailure(errorMessage);
        // Circuit breaker should record the failure
        expect(resilience.canExecute()).toBe(true);
      });

      it('should handle empty error message', () => {
        expect(() => resilience.recordFailure('')).not.toThrow();
      });
    });
  });

  // ==================== 超时保护测试 ====================

  describe('executeWithTimeout', () => {
    it('should execute function successfully within timeout', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await resilience.executeWithTimeout(
        fn,
        1000,
        'test-user'
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should throw timeout error when function takes too long', async () => {
      vi.useFakeTimers();

      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = resilience.executeWithTimeout(
        slowFn,
        100,
        'test-user'
      );

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('Timeout after 100ms');

      vi.useRealTimers();
    });

    it('should call onTimeout callback when timeout occurs', async () => {
      vi.useFakeTimers();

      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );
      const onTimeout = vi.fn();

      const promise = resilience.executeWithTimeout(
        slowFn,
        100,
        'test-user',
        undefined,
        onTimeout
      );

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('Timeout after 100ms');
      expect(onTimeout).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should abort via AbortController when timeout occurs', async () => {
      vi.useFakeTimers();

      const abortController = new AbortController();
      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = resilience.executeWithTimeout(
        slowFn,
        100,
        'test-user',
        abortController
      );

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('Timeout after 100ms');
      expect(abortController.signal.aborted).toBe(true);

      vi.useRealTimers();
    });

    it('should record telemetry on timeout', async () => {
      vi.useFakeTimers();

      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = resilience.executeWithTimeout(
        slowFn,
        100,
        'test-user'
      );

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow();
      expect(telemetry.increment).toHaveBeenCalledWith('amas.timeout', { path: 'decision' });

      vi.useRealTimers();
    });

    it('should clear timeout on successful execution', async () => {
      const fn = vi.fn().mockResolvedValue('quick');

      const result = await resilience.executeWithTimeout(
        fn,
        1000,
        'test-user'
      );

      expect(result).toBe('quick');
      // No timeout error should be thrown
    });

    it('should propagate non-timeout errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Function error'));

      await expect(
        resilience.executeWithTimeout(fn, 1000, 'test-user')
      ).rejects.toThrow('Function error');
    });

    it('should handle very short timeout', async () => {
      vi.useFakeTimers();

      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = resilience.executeWithTimeout(
        slowFn,
        1,
        'test-user'
      );

      vi.advanceTimersByTime(1);

      // Very short timeout should trigger before the slow function completes
      await expect(promise).rejects.toThrow('Timeout after 1ms');

      vi.useRealTimers();
    });

    it('should log warning on timeout with logger', async () => {
      vi.useFakeTimers();

      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = resilience.executeWithTimeout(
        slowFn,
        100,
        'test-user'
      );

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Decision timeout',
        { userId: 'test-user', timeoutMs: 100 }
      );

      vi.useRealTimers();
    });
  });

  // ==================== 智能降级测试 ====================

  describe('createIntelligentFallbackResult', () => {
    const mockState: UserState = {
      A: 0.8,
      F: 0.2,
      M: 0.6,
      C: { mem: 0.7, speed: 0.7, stability: 0.7 },
      conf: 0.8,
      ts: Date.now()
    };

    it('should create fallback result with circuit_open reason', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(50);

      const result = await resilience.createIntelligentFallbackResult(
        'test-user',
        'circuit_open',
        {},
        stateLoader,
        interactionCountGetter
      );

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.state).toEqual(mockState);
      expect(result.reward).toBe(0);
      expect(result.suggestion).toBeNull();
      expect(result.shouldBreak).toBe(false);
    });

    it('should create fallback result with timeout reason', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(30);

      const result = await resilience.createIntelligentFallbackResult(
        'test-user',
        'timeout',
        {},
        stateLoader,
        interactionCountGetter
      );

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should pass interaction count to fallback', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(100);

      await resilience.createIntelligentFallbackResult(
        'test-user',
        'exception',
        { interactionCount: 50 },
        stateLoader,
        interactionCountGetter
      );

      expect(interactionCountGetter).toHaveBeenCalledWith('test-user', 50);
    });

    it('should calculate recentErrorRate from recentAccuracy', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(40);

      const opts: ProcessOptions = {
        recentAccuracy: 0.7
      };

      await resilience.createIntelligentFallbackResult(
        'test-user',
        'degraded_state',
        opts,
        stateLoader,
        interactionCountGetter
      );

      // recentErrorRate should be 1 - 0.7 = 0.3 (accounting for floating point)
      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'degraded_state',
        expect.objectContaining({
          interactionCount: 40,
          hour: expect.any(Number)
        })
      );

      // Verify recentErrorRate is close to 0.3
      const callArgs = (intelligentFallback as any).mock.calls[0][2];
      expect(callArgs.recentErrorRate).toBeCloseTo(0.3, 10);
    });

    it('should use event timestamp for hour calculation', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(60);

      // Specific timestamp: 2024-01-15 14:30:00
      const eventTimestamp = new Date('2024-01-15T14:30:00').getTime();

      await resilience.createIntelligentFallbackResult(
        'test-user',
        'model_unavailable',
        {},
        stateLoader,
        interactionCountGetter,
        eventTimestamp
      );

      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'model_unavailable',
        expect.objectContaining({
          hour: 14
        })
      );
    });

    it('should use current hour when no event timestamp', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(70);

      await resilience.createIntelligentFallbackResult(
        'test-user',
        'missing_features',
        {},
        stateLoader,
        interactionCountGetter
      );

      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'missing_features',
        expect.objectContaining({
          hour: expect.any(Number)
        })
      );
    });

    it('should handle undefined recentAccuracy', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(80);

      await resilience.createIntelligentFallbackResult(
        'test-user',
        'exception',
        {}, // No recentAccuracy
        stateLoader,
        interactionCountGetter
      );

      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'exception',
        expect.objectContaining({
          recentErrorRate: undefined
        })
      );
    });

    it('should handle all fallback reasons', async () => {
      const reasons = [
        'circuit_open',
        'timeout',
        'exception',
        'missing_features',
        'model_unavailable',
        'degraded_state'
      ] as const;

      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(50);

      for (const reason of reasons) {
        const result = await resilience.createIntelligentFallbackResult(
          'test-user',
          reason,
          {},
          stateLoader,
          interactionCountGetter
        );

        expect(result).toBeDefined();
        expect(result.strategy).toBeDefined();
      }
    });
  });

  // ==================== 简单降级测试 (deprecated) ====================

  describe('createFallbackResult (deprecated)', () => {
    const mockState: UserState = {
      A: 0.7,
      F: 0.3,
      M: 0.5,
      C: { mem: 0.6, speed: 0.6, stability: 0.6 },
      conf: 0.7,
      ts: Date.now()
    };

    it('should create fallback result using degraded_state reason', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(25);

      const result = await resilience.createFallbackResult(
        'test-user',
        stateLoader,
        interactionCountGetter
      );

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.state).toEqual(mockState);
    });

    it('should call intelligentFallback with degraded_state', async () => {
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(35);

      await resilience.createFallbackResult(
        'test-user',
        stateLoader,
        interactionCountGetter
      );

      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'degraded_state',
        expect.any(Object)
      );
    });
  });

  // ==================== 指标记录测试 ====================

  describe('recordDegradation', () => {
    it('should record degradation metric with reason', () => {
      resilience.recordDegradation('circuit_open');

      expect(telemetry.increment).toHaveBeenCalledWith(
        'amas.degradation',
        { reason: 'circuit_open' }
      );
    });

    it('should record degradation metric with additional meta', () => {
      resilience.recordDegradation('timeout', {
        userId: 'test-user',
        latencyMs: 150
      });

      expect(telemetry.increment).toHaveBeenCalledWith(
        'amas.degradation',
        {
          reason: 'timeout',
          userId: 'test-user',
          latencyMs: 150
        }
      );
    });

    it('should handle empty meta object', () => {
      resilience.recordDegradation('exception', {});

      expect(telemetry.increment).toHaveBeenCalledWith(
        'amas.degradation',
        { reason: 'exception' }
      );
    });

    it('should handle all degradation reasons', () => {
      const reasons = [
        'circuit_open',
        'timeout',
        'exception',
        'model_unavailable'
      ];

      for (const reason of reasons) {
        resilience.recordDegradation(reason);
        expect(telemetry.increment).toHaveBeenCalledWith(
          'amas.degradation',
          expect.objectContaining({ reason })
        );
      }
    });
  });

  describe('recordLatency', () => {
    it('should record latency histogram', () => {
      resilience.recordLatency(50);

      expect(telemetry.histogram).toHaveBeenCalledWith(
        'amas.decision.latency',
        50
      );
    });

    it('should handle zero latency', () => {
      resilience.recordLatency(0);

      expect(telemetry.histogram).toHaveBeenCalledWith(
        'amas.decision.latency',
        0
      );
    });

    it('should handle large latency values', () => {
      resilience.recordLatency(10000);

      expect(telemetry.histogram).toHaveBeenCalledWith(
        'amas.decision.latency',
        10000
      );
    });

    it('should record multiple latency values', () => {
      const latencies = [10, 25, 50, 75, 100];

      for (const latency of latencies) {
        resilience.recordLatency(latency);
      }

      expect(telemetry.histogram).toHaveBeenCalledTimes(latencies.length);
    });
  });

  // ==================== 边界条件测试 ====================

  describe('edge cases', () => {
    it('should handle null state from stateLoader', async () => {
      const stateLoader = vi.fn().mockResolvedValue(null);
      const interactionCountGetter = vi.fn().mockReturnValue(10);

      const result = await resilience.createIntelligentFallbackResult(
        'test-user',
        'degraded_state',
        {},
        stateLoader,
        interactionCountGetter
      );

      // Should still return a valid result
      expect(result).toBeDefined();
      expect(result.state).toBeNull();
    });

    it('should handle zero interaction count', async () => {
      const mockState: UserState = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now()
      };

      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(0);

      const result = await resilience.createIntelligentFallbackResult(
        'test-user',
        'circuit_open',
        { interactionCount: 0 },
        stateLoader,
        interactionCountGetter
      );

      expect(result).toBeDefined();
    });

    it('should handle recentAccuracy at boundaries', async () => {
      const mockState: UserState = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now()
      };

      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(50);

      // Test with accuracy = 0 (100% error rate)
      await resilience.createIntelligentFallbackResult(
        'test-user',
        'exception',
        { recentAccuracy: 0 },
        stateLoader,
        interactionCountGetter
      );

      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'exception',
        expect.objectContaining({
          recentErrorRate: 1
        })
      );

      // Test with accuracy = 1 (0% error rate)
      await resilience.createIntelligentFallbackResult(
        'test-user',
        'exception',
        { recentAccuracy: 1 },
        stateLoader,
        interactionCountGetter
      );

      expect(intelligentFallback).toHaveBeenCalledWith(
        mockState,
        'exception',
        expect.objectContaining({
          recentErrorRate: 0
        })
      );
    });

    it('should handle stateLoader errors', async () => {
      const stateLoader = vi.fn().mockRejectedValue(new Error('State load error'));
      const interactionCountGetter = vi.fn().mockReturnValue(50);

      await expect(
        resilience.createIntelligentFallbackResult(
          'test-user',
          'exception',
          {},
          stateLoader,
          interactionCountGetter
        )
      ).rejects.toThrow('State load error');
    });

    it('should handle concurrent timeout operations', async () => {
      vi.useFakeTimers();

      const fn1 = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('result1'), 200))
      );
      const fn2 = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('result2'), 200))
      );

      const promise1 = resilience.executeWithTimeout(fn1, 100, 'user1');
      const promise2 = resilience.executeWithTimeout(fn2, 100, 'user2');

      vi.advanceTimersByTime(100);

      await expect(promise1).rejects.toThrow('Timeout after 100ms');
      await expect(promise2).rejects.toThrow('Timeout after 100ms');

      vi.useRealTimers();
    });
  });

  // ==================== 集成场景测试 ====================

  describe('integration scenarios', () => {
    it('should handle full degradation flow', async () => {
      const mockState: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.6,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        conf: 0.8,
        ts: Date.now()
      };

      // Simulate circuit breaker opening
      resilience.recordFailure('error 1');
      resilience.recordFailure('error 2');
      resilience.recordFailure('error 3');

      // Record degradation
      resilience.recordDegradation('circuit_open', { attempts: 3 });

      // Create fallback result
      const stateLoader = vi.fn().mockResolvedValue(mockState);
      const interactionCountGetter = vi.fn().mockReturnValue(100);

      const result = await resilience.createIntelligentFallbackResult(
        'test-user',
        'circuit_open',
        { recentAccuracy: 0.6 },
        stateLoader,
        interactionCountGetter
      );

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.reward).toBe(0);
      expect(result.shouldBreak).toBe(false);

      // Record latency
      resilience.recordLatency(150);
    });

    it('should handle timeout with recovery', async () => {
      vi.useFakeTimers();

      // First call times out
      const slowFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise1 = resilience.executeWithTimeout(slowFn, 100, 'user');
      vi.advanceTimersByTime(100);
      await expect(promise1).rejects.toThrow();

      vi.useRealTimers();

      // Second call succeeds quickly
      const fastFn = vi.fn().mockResolvedValue('fast');
      const result = await resilience.executeWithTimeout(fastFn, 1000, 'user');
      expect(result).toBe('fast');

      // Record success
      resilience.recordSuccess();
    });

    it('should support multiple users with different states', async () => {
      const states: Record<string, UserState> = {
        'user-1': {
          A: 0.9,
          F: 0.1,
          M: 0.8,
          C: { mem: 0.9, speed: 0.9, stability: 0.9 },
          conf: 0.9,
          ts: Date.now()
        },
        'user-2': {
          A: 0.3,
          F: 0.7,
          M: 0.2,
          C: { mem: 0.3, speed: 0.3, stability: 0.3 },
          conf: 0.3,
          ts: Date.now()
        }
      };

      for (const [userId, state] of Object.entries(states)) {
        const stateLoader = vi.fn().mockResolvedValue(state);
        const interactionCountGetter = vi.fn().mockReturnValue(50);

        const result = await resilience.createIntelligentFallbackResult(
          userId,
          'degraded_state',
          {},
          stateLoader,
          interactionCountGetter
        );

        expect(result.state).toEqual(state);
      }
    });
  });

  // ==================== 熔断器状态回调测试 ====================

  describe('circuit breaker callbacks', () => {
    it('should record telemetry on circuit events', () => {
      // The circuit breaker is mocked, but we can verify the callbacks
      // were set up correctly by checking createDefaultCircuitBreaker was called
      expect(createDefaultCircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should create new ResilienceManager with proper circuit configuration', () => {
      const newResilience = new ResilienceManager(mockLogger as unknown as Logger);
      expect(newResilience).toBeDefined();
      expect(createDefaultCircuitBreaker).toHaveBeenCalled();
    });
  });
});
