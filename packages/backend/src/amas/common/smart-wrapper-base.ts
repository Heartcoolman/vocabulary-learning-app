/**
 * Smart Wrapper Base - 智能包装器基类
 * 为 Native/TypeScript 混合实现提供统一的路由和熔断降级基础设施
 *
 * 功能:
 * - 基于 SmartRouter 的智能路由决策
 * - 集成 CircuitBreaker 的熔断降级
 * - 统一的性能监控和统计
 * - 自动的错误处理和恢复
 */

import { SmartRouter, RouteDecision, RouteOptions } from './smart-router';
import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitState,
} from './circuit-breaker';

import {
  recordNativeCall,
  recordNativeFailure,
  recordNativeDuration,
  updateCircuitBreakerState,
  type NativeMethod,
} from '../../monitoring/amas-metrics';

import { amasLogger } from '../../logger';

/**
 * 包装器统计信息
 */
export interface WrapperStats {
  /** Native 成功调用次数 */
  nativeCalls: number;
  /** 降级调用次数 */
  fallbackCalls: number;
  /** Native 调用失败次数 */
  failures: number;
  /** 熔断器状态 */
  circuitState: CircuitState;
  /** 是否启用 Native */
  nativeEnabled: boolean;
  /** Native 模块是否可用 */
  nativeAvailable: boolean;
  /** 当前失败率 */
  failureRate: number;
  /** 智能路由决策统计 */
  routeDecisions?: {
    native: number;
    typescript: number;
  };
}

/**
 * 智能执行选项
 */
export interface SmartExecuteOptions extends RouteOptions {
  /** 操作方法名 (用于 metrics) */
  method?: NativeMethod;
  /** 是否记录性能指标 */
  recordMetrics?: boolean;
}

/**
 * 熔断器默认配置
 */
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Partial<CircuitBreakerOptions> = {
  failureThreshold: 0.5,  // 50% 失败率触发熔断
  windowSize: 20,         // 20 个样本的滑动窗口
  openDurationMs: 60000,  // 60 秒后尝试半开
  halfOpenProbe: 3,       // 半开状态允许 3 个探测请求
};

/**
 * 智能包装器基类配置
 */
export interface SmartWrapperBaseConfig {
  /** 模块名称 (用于日志和指标) */
  moduleName: string;
  /** 熔断器失败率阈值 (0-1) */
  failureThreshold?: number;
  /** 熔断器滑动窗口大小 */
  windowSize?: number;
  /** 熔断器 OPEN 状态持续时长 (ms) */
  recoveryTimeout?: number;
  /** 熔断器 HALF_OPEN 状态探测请求数 */
  halfOpenProbe?: number;
  /** 是否启用 Native 模块 */
  useNative?: boolean;
}

/**
 * 智能包装器基类
 *
 * 提供 Native/TypeScript 混合实现的通用基础设施:
 * - 智能路由: 根据操作复杂度自动选择最优实现
 * - 熔断降级: Native 失败时自动降级到 TypeScript
 * - 性能监控: 记录调用时间和成功率
 *
 * @template TNative Native 实现类型
 * @template TFallback TypeScript 降级实现类型
 *
 * @example
 * ```typescript
 * class MyNativeWrapper extends SmartWrapperBase<NativeClass, FallbackClass> {
 *   constructor(config: MyConfig) {
 *     super({
 *       moduleName: 'myModule',
 *       ...config,
 *     });
 *     // 初始化 native 和 fallback
 *   }
 *
 *   someMethod(data: Data): Result {
 *     return this.smartExecute(
 *       'someMethod',
 *       () => this.native!.someMethod(data),
 *       () => this.fallback.someMethod(data),
 *       { dataSize: data.length }
 *     );
 *   }
 * }
 * ```
 */
export abstract class SmartWrapperBase<TNative, TFallback> {
  protected native: TNative | null = null;
  protected abstract fallback: TFallback;
  protected readonly circuitBreaker: CircuitBreaker;
  protected readonly moduleName: string;
  protected readonly nativeEnabled: boolean;

  protected stats = {
    nativeCalls: 0,
    fallbackCalls: 0,
    failures: 0,
    routeDecisions: {
      native: 0,
      typescript: 0,
    },
  };

  constructor(config: SmartWrapperBaseConfig) {
    const {
      moduleName,
      failureThreshold = DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold,
      windowSize = DEFAULT_CIRCUIT_BREAKER_OPTIONS.windowSize,
      recoveryTimeout = DEFAULT_CIRCUIT_BREAKER_OPTIONS.openDurationMs,
      halfOpenProbe = DEFAULT_CIRCUIT_BREAKER_OPTIONS.halfOpenProbe,
      useNative = process.env.AMAS_USE_NATIVE !== 'false',
    } = config;

    this.moduleName = moduleName;
    this.nativeEnabled = useNative;

    // 初始化熔断器
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: failureThreshold!,
      windowSize: windowSize!,
      openDurationMs: recoveryTimeout!,
      halfOpenProbe: halfOpenProbe!,
      onStateChange: (from, to) => {
        amasLogger.info(
          { from, to, module: this.moduleName },
          `[${this.moduleName}] Circuit breaker state changed`
        );
        this.updateMetricState(to);
      },
      onEvent: (evt) => {
        if (evt.type === 'open') {
          amasLogger.warn(
            { reason: evt.reason, module: this.moduleName },
            `[${this.moduleName}] Circuit breaker opened`
          );
        } else if (evt.type === 'close') {
          amasLogger.info(
            { module: this.moduleName },
            `[${this.moduleName}] Circuit breaker closed, native recovered`
          );
        }
      },
    });
  }

  /**
   * 智能执行：自动选择最优实现
   *
   * 决策流程:
   * 1. 检查 Native 是否可用 (配置 + 熔断器状态)
   * 2. 使用 SmartRouter 决定路由
   * 3. 执行选定的实现
   * 4. 处理错误和降级
   *
   * @param operation 操作名称 (不含模块前缀)
   * @param nativeFn Native 实现函数
   * @param fallbackFn TypeScript 降级函数
   * @param options 执行选项
   * @returns 执行结果
   */
  protected smartExecute<TResult>(
    operation: string,
    nativeFn: () => TResult,
    fallbackFn: () => TResult,
    options?: SmartExecuteOptions
  ): TResult {
    const {
      dataSize,
      iterations,
      method = 'selectAction' as NativeMethod,
      recordMetrics = true,
    } = options || {};

    const fullOperation = `${this.moduleName}.${operation}`;
    const nativeAvailable = this.native !== null && this.circuitBreaker.canExecute();

    // 使用 SmartRouter 决策
    const decision = SmartRouter.decide(fullOperation, {
      dataSize,
      iterations,
      nativeAvailable: this.nativeEnabled && nativeAvailable,
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 执行决策
    if (decision === RouteDecision.USE_NATIVE && this.native && nativeAvailable) {
      return this.executeNative(nativeFn, fallbackFn, method, recordMetrics);
    }

    // 使用 TypeScript 实现
    this.stats.fallbackCalls++;
    if (recordMetrics) {
      recordNativeCall(method, 'fallback');
    }
    return fallbackFn();
  }

  /**
   * 智能异步执行
   */
  protected async smartExecuteAsync<TResult>(
    operation: string,
    nativeFn: () => Promise<TResult>,
    fallbackFn: () => Promise<TResult>,
    options?: SmartExecuteOptions
  ): Promise<TResult> {
    const {
      dataSize,
      iterations,
      method = 'selectAction' as NativeMethod,
      recordMetrics = true,
    } = options || {};

    const fullOperation = `${this.moduleName}.${operation}`;
    const nativeAvailable = this.native !== null && this.circuitBreaker.canExecute();

    // 使用 SmartRouter 决策
    const decision = SmartRouter.decide(fullOperation, {
      dataSize,
      iterations,
      nativeAvailable: this.nativeEnabled && nativeAvailable,
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 执行决策
    if (decision === RouteDecision.USE_NATIVE && this.native && nativeAvailable) {
      return this.executeNativeAsync(nativeFn, fallbackFn, method, recordMetrics);
    }

    // 使用 TypeScript 实现
    this.stats.fallbackCalls++;
    if (recordMetrics) {
      recordNativeCall(method, 'fallback');
    }
    return fallbackFn();
  }

  /**
   * 强制使用 Native 执行 (跳过智能路由)
   * 用于已知需要 Native 性能优势的场景
   */
  protected forceNative<TResult>(
    nativeFn: () => TResult,
    fallbackFn: () => TResult,
    method: NativeMethod = 'selectAction'
  ): TResult {
    if (this.native && this.nativeEnabled && this.circuitBreaker.canExecute()) {
      return this.executeNative(nativeFn, fallbackFn, method, true);
    }
    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');
    return fallbackFn();
  }

  /**
   * 强制使用 TypeScript 执行 (跳过智能路由)
   * 用于已知不需要 Native 的简单操作
   */
  protected forceTypeScript<TResult>(fallbackFn: () => TResult): TResult {
    this.stats.fallbackCalls++;
    return fallbackFn();
  }

  /**
   * 执行 Native 实现 (内部方法)
   */
  private executeNative<TResult>(
    nativeFn: () => TResult,
    fallbackFn: () => TResult,
    method: NativeMethod,
    recordMetrics: boolean
  ): TResult {
    const startTime = performance.now();

    try {
      const result = nativeFn();

      // 记录成功
      const durationMs = performance.now() - startTime;
      if (recordMetrics) {
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
      }
      this.circuitBreaker.recordSuccess();
      this.stats.nativeCalls++;

      return result;
    } catch (e) {
      // 记录失败
      const error = e instanceof Error ? e : new Error(String(e));
      if (recordMetrics) {
        recordNativeFailure();
      }
      this.circuitBreaker.recordFailure(error.message);
      this.stats.failures++;

      amasLogger.warn(
        { error: error.message, module: this.moduleName },
        `[${this.moduleName}] Native call failed, falling back to TypeScript`
      );

      // 降级到 TypeScript
      this.stats.fallbackCalls++;
      if (recordMetrics) {
        recordNativeCall(method, 'fallback');
      }
      return fallbackFn();
    }
  }

  /**
   * 执行 Native 异步实现 (内部方法)
   */
  private async executeNativeAsync<TResult>(
    nativeFn: () => Promise<TResult>,
    fallbackFn: () => Promise<TResult>,
    method: NativeMethod,
    recordMetrics: boolean
  ): Promise<TResult> {
    const startTime = performance.now();

    try {
      const result = await nativeFn();

      // 记录成功
      const durationMs = performance.now() - startTime;
      if (recordMetrics) {
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
      }
      this.circuitBreaker.recordSuccess();
      this.stats.nativeCalls++;

      return result;
    } catch (e) {
      // 记录失败
      const error = e instanceof Error ? e : new Error(String(e));
      if (recordMetrics) {
        recordNativeFailure();
      }
      this.circuitBreaker.recordFailure(error.message);
      this.stats.failures++;

      amasLogger.warn(
        { error: error.message, module: this.moduleName },
        `[${this.moduleName}] Native async call failed, falling back to TypeScript`
      );

      // 降级到 TypeScript
      this.stats.fallbackCalls++;
      if (recordMetrics) {
        recordNativeCall(method, 'fallback');
      }
      return fallbackFn();
    }
  }

  /**
   * 更新 Prometheus 指标状态
   */
  private updateMetricState(state: CircuitState): void {
    switch (state) {
      case 'CLOSED':
        updateCircuitBreakerState('closed');
        break;
      case 'OPEN':
        updateCircuitBreakerState('open');
        break;
      case 'HALF_OPEN':
        updateCircuitBreakerState('half-open');
        break;
    }
  }

  // ==================== 公共接口 ====================

  /**
   * 获取统计信息
   */
  getStats(): WrapperStats {
    return {
      ...this.stats,
      circuitState: this.circuitBreaker.getState(),
      nativeEnabled: this.nativeEnabled,
      nativeAvailable: this.native !== null,
      failureRate: this.circuitBreaker.getFailureRate(),
      routeDecisions: { ...this.stats.routeDecisions },
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      nativeCalls: 0,
      fallbackCalls: 0,
      failures: 0,
      routeDecisions: {
        native: 0,
        typescript: 0,
      },
    };
  }

  /**
   * 获取熔断器状态
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    amasLogger.info(
      { module: this.moduleName },
      `[${this.moduleName}] Circuit breaker manually reset`
    );
  }

  /**
   * 强制打开熔断器
   */
  forceOpenCircuit(reason?: string): void {
    this.circuitBreaker.forceOpen(reason);
  }

  /**
   * 检查 Native 是否可用
   */
  isNativeAvailable(): boolean {
    return this.nativeEnabled && this.native !== null;
  }

  /**
   * 检查是否可以执行 Native (考虑熔断器状态)
   */
  canExecuteNative(): boolean {
    return this.isNativeAvailable() && this.circuitBreaker.canExecute();
  }

  /**
   * 获取模块名称
   */
  getModuleName(): string {
    return this.moduleName;
  }
}

export default SmartWrapperBase;
