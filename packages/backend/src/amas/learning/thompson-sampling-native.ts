/**
 * Thompson Sampling Native Wrapper with Smart Routing and Circuit Breaker
 * 使用智能路由和 CircuitBreaker 熔断器的 Thompson Sampling Native 包装器
 *
 * 功能:
 * - 智能路由: 根据操作复杂度自动选择 Native 或 TypeScript 实现
 * - 熔断降级: Native 失败时自动降级到 TypeScript
 * - 提供调用统计和健康监控
 * - 支持 Prometheus 指标埋点
 *
 * 性能特征:
 * - sampleBeta: 强制使用 TypeScript (单次采样，NAPI 开销大)
 * - batchSample: 根据数量决定 (阈值 50)
 * - selectAction: 根据动作数量决定 (阈值 20)
 * - getExpectedReward: 强制使用 TypeScript (简单除法，14x 更快)
 */

import type {
  ThompsonSamplingNative as ThompsonSamplingNativeClass,
  ThompsonSamplingConfig as NativeThompsonSamplingConfig,
  ThompsonSamplingState as NativeThompsonSamplingState,
  BetaParams as NativeBetaParams,
  ActionSelection as NativeActionSelection,
} from '@danci/native';

import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitState,
} from '../common/circuit-breaker';

import { SmartRouter, RouteDecision } from '../common/smart-router';

import {
  ThompsonSampling,
  ThompsonSamplingOptions,
  ThompsonSamplingState,
  ThompsonContext,
} from './thompson-sampling';

import { Action, UserState } from '../types';
import { ActionSelection, LearnerCapabilities } from './base-learner';

import {
  recordNativeCall,
  recordNativeFailure,
  recordNativeDuration,
  updateCircuitBreakerState,
  type NativeMethod,
} from '../../monitoring/amas-metrics';

import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * Thompson Sampling Wrapper 配置选项
 */
export interface ThompsonSamplingWrapperConfig extends ThompsonSamplingOptions {
  /** 熔断器失败率阈值 (0-1) */
  failureThreshold?: number;
  /** 熔断器滑动窗口大小 */
  windowSize?: number;
  /** 熔断器 OPEN 状态持续时长 (ms) */
  recoveryTimeout?: number;
  /** 熔断器 HALF_OPEN 状态探测请求数 */
  halfOpenProbe?: number;
  /** 是否启用 Native 模块 (默认: true) */
  useNative?: boolean;
}

/**
 * Wrapper 统计信息
 */
export interface ThompsonSamplingWrapperStats {
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
  routeDecisions: {
    native: number;
    typescript: number;
  };
}

/**
 * Beta 采样结果
 */
export interface BetaSampleResult {
  /** 采样值 */
  sample: number;
  /** Alpha 参数 */
  alpha: number;
  /** Beta 参数 */
  beta: number;
}

/**
 * 批量采样结果
 */
export interface BatchSampleResult {
  /** 采样值数组 */
  samples: number[];
  /** 参数数组 */
  params: Array<{ alpha: number; beta: number }>;
}

// ==================== Native 模块加载 ====================

let NativeModule: typeof import('@danci/native') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeModule = require('@danci/native');
} catch (e) {
  amasLogger.warn('[ThompsonSamplingNativeWrapper] Native module not available, will use TypeScript fallback');
}

// ==================== 熔断器默认配置 ====================

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Partial<CircuitBreakerOptions> = {
  failureThreshold: 0.5,  // 50% 失败率触发熔断
  windowSize: 20,         // 20 个样本的滑动窗口
  openDurationMs: 60000,  // 60 秒后尝试半开
  halfOpenProbe: 3,       // 半开状态允许 3 个探测请求
};

// ==================== ThompsonSamplingNativeWrapper 类 ====================

/**
 * Thompson Sampling Native 包装器
 *
 * 使用 CircuitBreaker 熔断器实现自动降级:
 * - CLOSED: 正常使用 Native 实现
 * - OPEN: 完全使用 TypeScript 降级实现
 * - HALF_OPEN: 探测性使用 Native，成功则恢复，失败则重新熔断
 *
 * @example
 * ```typescript
 * const wrapper = new ThompsonSamplingNativeWrapper({
 *   priorAlpha: 1,
 *   priorBeta: 1,
 *   failureThreshold: 0.5,
 *   recoveryTimeout: 60000,
 * });
 *
 * const result = wrapper.selectAction(state, actions, context);
 * wrapper.update(state, action, reward, context);
 *
 * console.log(wrapper.getStats());
 * ```
 */
export class ThompsonSamplingNativeWrapper {
  private native: InstanceType<typeof ThompsonSamplingNativeClass> | null = null;
  private readonly fallback: ThompsonSampling;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly nativeEnabled: boolean;

  private stats = {
    nativeCalls: 0,
    fallbackCalls: 0,
    failures: 0,
    routeDecisions: {
      native: 0,
      typescript: 0,
    },
  };

  constructor(config: ThompsonSamplingWrapperConfig = {}) {
    const {
      priorAlpha = 1,
      priorBeta = 1,
      minContextWeight,
      maxContextWeight,
      enableSoftUpdate,
      failureThreshold = DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold,
      windowSize = DEFAULT_CIRCUIT_BREAKER_OPTIONS.windowSize,
      recoveryTimeout = DEFAULT_CIRCUIT_BREAKER_OPTIONS.openDurationMs,
      halfOpenProbe = DEFAULT_CIRCUIT_BREAKER_OPTIONS.halfOpenProbe,
      useNative = process.env.AMAS_USE_NATIVE !== 'false',
    } = config;

    this.nativeEnabled = useNative;

    // 初始化熔断器
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: failureThreshold!,
      windowSize: windowSize!,
      openDurationMs: recoveryTimeout!,
      halfOpenProbe: halfOpenProbe!,
      onStateChange: (from, to) => {
        amasLogger.info({ from, to }, '[ThompsonSamplingNativeWrapper] Circuit breaker state changed');
        this.updateMetricState(to);
      },
      onEvent: (evt) => {
        if (evt.type === 'open') {
          amasLogger.warn({ reason: evt.reason }, '[ThompsonSamplingNativeWrapper] Circuit breaker opened');
        } else if (evt.type === 'close') {
          amasLogger.info('[ThompsonSamplingNativeWrapper] Circuit breaker closed, native recovered');
        }
      },
    });

    // 尝试初始化 Native 模块
    if (this.nativeEnabled && NativeModule?.ThompsonSamplingNative) {
      try {
        const nativeConfig: NativeThompsonSamplingConfig = {
          priorAlpha,
          priorBeta,
          minContextWeight,
          maxContextWeight,
          enableSoftUpdate,
        };
        this.native = new NativeModule.ThompsonSamplingNative(nativeConfig);
        amasLogger.info('[ThompsonSamplingNativeWrapper] Native module initialized');
      } catch (e) {
        amasLogger.warn(
          { error: e instanceof Error ? e.message : String(e) },
          '[ThompsonSamplingNativeWrapper] Failed to initialize native module'
        );
        this.native = null;
      }
    }

    // 初始化 TypeScript 降级实现
    this.fallback = new ThompsonSampling({
      priorAlpha,
      priorBeta,
      minContextWeight,
      maxContextWeight,
      enableSoftUpdate,
    });
  }

  // ==================== 核心方法 ====================

  /**
   * 选择动作
   *
   * 智能路由决策:
   * - 动作数量 >= 20: 使用 Native
   * - 动作数量 < 20: 使用 TypeScript
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: ThompsonContext
  ): ActionSelection<Action> {
    const method: NativeMethod = 'selectAction';

    // 使用智能路由决策
    const decision = SmartRouter.decide('thompson.selectAction', {
      dataSize: actions.length,
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    if (decision === RouteDecision.USE_NATIVE && this.native) {
      const startTime = performance.now();
      try {
        // 构建动作键列表
        const actionKeys = actions.map(a => this.buildActionKey(a));
        const contextKey = this.buildContextKey(state, context);

        // 调用 Native selectAction
        const result = this.native.selectAction(actionKeys, contextKey);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeActionSelection(result, actions);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[ThompsonSamplingNativeWrapper] Native selectAction failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.selectAction(state, actions, context);
  }

  /**
   * 更新模型
   *
   * 智能路由决策: 强制使用 TypeScript
   * 原因: 简单参数更新，NAPI 开销大于计算
   */
  update(
    state: UserState,
    action: Action,
    reward: number,
    context: ThompsonContext
  ): void {
    // 简单更新操作，强制使用 TypeScript (配置中已设置 forceRoute: USE_TYPESCRIPT)
    const decision = SmartRouter.decide('thompson.update', {
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 简单操作，直接用 fallback
    this.stats.fallbackCalls++;
    this.fallback.update(state, action, reward, context);
  }

  // ==================== Native 专用方法 ====================

  /**
   * 从 Beta 分布采样
   *
   * 智能路由决策: 强制使用 TypeScript
   * 原因: 单次采样，NAPI 调用开销远大于计算本身
   */
  sampleBeta(alpha: number, beta: number): number {
    // 简单操作，强制使用 TypeScript (配置中已设置 forceRoute: USE_TYPESCRIPT)
    const decision = SmartRouter.decide('thompson.sampleBeta', {
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 单次采样，直接用 fallback
    this.stats.fallbackCalls++;
    return this.sampleBetaFallback(alpha, beta);
  }

  /**
   * 批量从 Beta 分布采样
   *
   * 智能路由决策:
   * - 参数数量 >= 50: 使用 Native (批量优势)
   * - 参数数量 < 50: 使用 TypeScript (避免 NAPI 开销)
   */
  batchSample(params: Array<{ alpha: number; beta: number }>): number[] {
    const method: NativeMethod = 'selectAction';

    // 使用智能路由决策
    const decision = SmartRouter.decide('thompson.batchSample', {
      dataSize: params.length,
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    if (decision === RouteDecision.USE_NATIVE && this.native) {
      const startTime = performance.now();
      try {
        const result = this.native.batchSample(params);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return result;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[ThompsonSamplingNativeWrapper] Native batchSample failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    // Fallback: 逐个采样
    return params.map(p => this.sampleBetaFallback(p.alpha, p.beta));
  }

  /**
   * 更新 Beta 参数
   */
  updateParams(
    actionKey: string,
    contextKey: string,
    reward: number
  ): void {
    const method: NativeMethod = 'update';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        this.native!.updateParams(actionKey, contextKey, reward);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[ThompsonSamplingNativeWrapper] Native updateParams failed'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    // Fallback: 通过 fallback 实例更新（需要完整的 state/action/context）
    amasLogger.debug('[ThompsonSamplingNativeWrapper] updateParams fallback not fully supported');
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取动作的期望成功率
   */
  getExpectedReward(action: Action): number {
    return this.fallback.getExpectedReward(action);
  }

  /**
   * 获取动作的样本量
   */
  getSampleCount(action: Action): number {
    return this.fallback.getSampleCount(action);
  }

  // ==================== 状态管理 ====================

  /**
   * 获取状态
   */
  getState(): ThompsonSamplingState {
    return this.fallback.getState();
  }

  /**
   * 设置状态
   */
  setState(state: ThompsonSamplingState): void {
    this.fallback.setState(state);
    // 如果有 Native 实例，也同步状态
    if (this.native) {
      try {
        this.native.setState(state as unknown as NativeThompsonSamplingState);
      } catch (e) {
        amasLogger.warn({ error: e }, '[ThompsonSamplingNativeWrapper] setState to native failed');
      }
    }
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.fallback.reset();
    if (this.native) {
      try {
        this.native.reset();
      } catch (e) {
        amasLogger.warn({ error: e }, '[ThompsonSamplingNativeWrapper] reset native failed');
      }
    }
    this.resetStats();
  }

  // ==================== 元数据方法 ====================

  getName(): string {
    return 'ThompsonSamplingNativeWrapper';
  }

  getVersion(): string {
    return '2.0.0-native';
  }

  getCapabilities(): LearnerCapabilities {
    const fallbackCaps = this.fallback.getCapabilities();
    return {
      ...fallbackCaps,
      primaryUseCase:
        fallbackCaps.primaryUseCase +
        ' (Native 加速版本，支持熔断降级)',
    };
  }

  getUpdateCount(): number {
    return this.fallback.getUpdateCount();
  }

  // ==================== 统计和状态 ====================

  /**
   * 获取统计信息
   */
  getStats(): ThompsonSamplingWrapperStats {
    return {
      nativeCalls: this.stats.nativeCalls,
      fallbackCalls: this.stats.fallbackCalls,
      failures: this.stats.failures,
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
    amasLogger.info('[ThompsonSamplingNativeWrapper] Circuit breaker manually reset');
  }

  /**
   * 强制打开熔断器
   */
  forceOpenCircuit(reason?: string): void {
    this.circuitBreaker.forceOpen(reason);
  }

  /**
   * 获取底层 ThompsonSampling 实例
   */
  getFallbackInstance(): ThompsonSampling {
    return this.fallback;
  }

  // ==================== 私有方法 ====================

  /**
   * 判断是否应该使用 Native
   */
  private shouldUseNative(): boolean {
    if (!this.nativeEnabled || !this.native) {
      return false;
    }
    return this.circuitBreaker.canExecute();
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

  /**
   * 构建动作唯一键
   */
  private buildActionKey(action: Action): string {
    return [
      `int=${action.interval_scale}`,
      `new=${action.new_ratio}`,
      `diff=${action.difficulty}`,
      `batch=${action.batch_size}`,
      `hint=${action.hint_level}`
    ].join('|');
  }

  /**
   * 构建上下文唯一键
   */
  private buildContextKey(state: UserState, context: ThompsonContext): string {
    const errBucket = this.bucket(context.recentErrorRate, 0.05, 0, 1).toFixed(2);
    const rtBucket = this.bucket(context.recentResponseTime, 500, 50, 10000);
    const timeBucket = context.timeBucket;
    const attBucket = this.bucket(state.A, 0.1, 0, 1).toFixed(1);
    const fatBucket = this.bucket(state.F, 0.1, 0, 1).toFixed(1);
    const motNorm = (state.M + 1) / 2;
    const motBucket = this.bucket(motNorm, 0.1, 0, 1).toFixed(1);

    return `err=${errBucket}|rt=${rtBucket}|time=${timeBucket}|att=${attBucket}|fat=${fatBucket}|mot=${motBucket}`;
  }

  /**
   * 离散化连续值
   */
  private bucket(value: number, step: number, min: number, max: number): number {
    const safeValue = Number.isFinite(value) ? value : (min + max) / 2;
    const clamped = Math.max(min, Math.min(max, safeValue));
    if (step <= 0) return clamped;
    return Math.floor(clamped / step) * step;
  }

  /**
   * Beta 分布采样（Fallback 实现）
   */
  private sampleBetaFallback(alpha: number, beta: number): number {
    const EPSILON = 1e-10;
    const a = Math.max(alpha, EPSILON);
    const b = Math.max(beta, EPSILON);

    const x = this.sampleGamma(a);
    const y = this.sampleGamma(b);
    const sum = x + y;

    if (!Number.isFinite(sum) || sum <= 0) {
      return 0.5;
    }

    return x / sum;
  }

  /**
   * Gamma 分布采样（Marsaglia-Tsang 方法）
   */
  private sampleGamma(shape: number): number {
    if (shape <= 0) return 0;

    if (shape < 1) {
      const u = Math.random();
      return this.sampleGamma(1 + shape) * Math.pow(u, 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    for (let i = 0; i < 1000; i++) {
      const x = this.randomNormal();
      let v = 1 + c * x;

      if (v <= 0) continue;

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }

    return shape;
  }

  /**
   * 标准正态分布采样（Box-Muller）
   */
  private randomNormal(): number {
    const u1 = Math.max(Math.random(), 1e-12);
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 转换 Native ActionSelection 到 TS 格式
   */
  private fromNativeActionSelection(
    result: NativeActionSelection,
    actions: Action[]
  ): ActionSelection<Action> {
    const selectedIndex = result.selectedIndex ?? 0;
    const selectedAction = actions[selectedIndex] ?? actions[0];

    return {
      action: selectedAction,
      score: result.score ?? 0,
      confidence: result.confidence ?? 0,
      meta: {
        selectedIndex,
        globalSample: result.globalSample,
        contextualSample: result.contextualSample,
        native: true,
        ...result.meta,
      },
    };
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 ThompsonSamplingNativeWrapper 实例
 */
export function createThompsonSamplingNativeWrapper(
  config?: ThompsonSamplingWrapperConfig
): ThompsonSamplingNativeWrapper {
  return new ThompsonSamplingNativeWrapper(config);
}

/**
 * 创建禁用 Native 的 ThompsonSamplingNativeWrapper (用于测试)
 */
export function createThompsonSamplingNativeWrapperFallback(
  config?: Omit<ThompsonSamplingWrapperConfig, 'useNative'>
): ThompsonSamplingNativeWrapper {
  return new ThompsonSamplingNativeWrapper({ ...config, useNative: false });
}

export default ThompsonSamplingNativeWrapper;
