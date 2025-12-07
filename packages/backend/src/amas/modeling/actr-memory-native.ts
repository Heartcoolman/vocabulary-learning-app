/**
 * ACT-R Memory Native Wrapper with Smart Routing and Circuit Breaker
 * 使用智能路由和 CircuitBreaker 熔断器的 ACT-R 记忆模型 Native 包装器
 *
 * 功能:
 * - 智能路由: 根据操作复杂度自动选择 Native 或 TypeScript 实现
 * - 熔断降级: Native 失败时自动降级到 TypeScript
 * - 提供调用统计和健康监控
 * - 支持 Prometheus 指标埋点
 *
 * 性能特征:
 * - computeOptimalInterval: 强制使用 Native (60次二分搜索)
 * - retrievalProbability: 强制使用 TypeScript (简单公式，NAPI 开销大)
 * - computeActivation: 根据痕迹数量决定 (阈值 500)
 */

import type {
  ACTRMemoryNative as ACTRMemoryNativeClass,
  ACTRConfig as NativeACTRConfig,
  ReviewTrace as NativeReviewTrace,
  ActivationResult as NativeActivationResult,
  RecallPrediction as NativeRecallPrediction,
  IntervalPrediction as NativeIntervalPrediction,
} from '@danci/native';

import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitState,
} from '../common/circuit-breaker';

import { SmartRouter, RouteDecision } from '../common/smart-router';

import {
  ACTRMemoryModel,
  ACTROptions,
  ACTRState,
  ACTRContext,
  ReviewTrace,
  ActivationResult,
  RecallPrediction,
  IntervalPrediction,
  CognitiveProfile,
} from './actr-memory';

import { Action, UserState } from '../types';
import { ActionSelection, LearnerCapabilities } from '../learning/base-learner';

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
 * ACT-R Wrapper 配置选项
 */
export interface ACTRWrapperConfig {
  /** 衰减率 d (默认 0.5) */
  decay?: number;
  /** 回忆阈值 τ (默认 0.3) */
  threshold?: number;
  /** 噪声缩放 s (默认 0.4) */
  noiseScale?: number;
  /** 最优间隔搜索上限（秒，默认7天） */
  maxSearchSeconds?: number;
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
export interface ACTRWrapperStats {
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

// ==================== Native 模块加载 ====================

let NativeModule: typeof import('@danci/native') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeModule = require('@danci/native');
} catch (e) {
  amasLogger.warn('[ACTRMemoryNativeWrapper] Native module not available, will use TypeScript fallback');
}

// ==================== 熔断器默认配置 ====================

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Partial<CircuitBreakerOptions> = {
  failureThreshold: 0.5,  // 50% 失败率触发熔断
  windowSize: 20,         // 20 个样本的滑动窗口
  openDurationMs: 60000,  // 60 秒后尝试半开
  halfOpenProbe: 3,       // 半开状态允许 3 个探测请求
};

// ==================== ACTRMemoryNativeWrapper 类 ====================

/**
 * ACT-R 记忆模型 Native 包装器
 *
 * 使用 CircuitBreaker 熔断器实现自动降级:
 * - CLOSED: 正常使用 Native 实现
 * - OPEN: 完全使用 TypeScript 降级实现
 * - HALF_OPEN: 探测性使用 Native，成功则恢复，失败则重新熔断
 *
 * @example
 * ```typescript
 * const wrapper = new ACTRMemoryNativeWrapper({
 *   decay: 0.5,
 *   threshold: 0.3,
 *   failureThreshold: 0.5,
 *   recoveryTimeout: 60000,
 * });
 *
 * const activation = wrapper.computeActivation(traces, 0.5, true);
 * const prediction = wrapper.retrievalProbability(traces);
 * const interval = wrapper.predictOptimalInterval(traces, 0.9);
 *
 * console.log(wrapper.getStats());
 * ```
 */
export class ACTRMemoryNativeWrapper {
  private native: InstanceType<typeof ACTRMemoryNativeClass> | null = null;
  private readonly fallback: ACTRMemoryModel;
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

  constructor(config: ACTRWrapperConfig = {}) {
    const {
      decay = 0.5,
      threshold = 0.3,
      noiseScale = 0.4,
      maxSearchSeconds,
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
        amasLogger.info({ from, to }, '[ACTRMemoryNativeWrapper] Circuit breaker state changed');
        this.updateMetricState(to);
      },
      onEvent: (evt) => {
        if (evt.type === 'open') {
          amasLogger.warn({ reason: evt.reason }, '[ACTRMemoryNativeWrapper] Circuit breaker opened');
        } else if (evt.type === 'close') {
          amasLogger.info('[ACTRMemoryNativeWrapper] Circuit breaker closed, native recovered');
        }
      },
    });

    // 尝试初始化 Native 模块
    if (this.nativeEnabled && NativeModule?.ACTRMemoryNative) {
      try {
        const nativeConfig: NativeACTRConfig = {
          decay,
          threshold,
          noiseScale,
          maxSearchSeconds,
        };
        this.native = new NativeModule.ACTRMemoryNative(nativeConfig);
        amasLogger.info('[ACTRMemoryNativeWrapper] Native module initialized');
      } catch (e) {
        amasLogger.warn(
          { error: e instanceof Error ? e.message : String(e) },
          '[ACTRMemoryNativeWrapper] Failed to initialize native module'
        );
        this.native = null;
      }
    }

    // 初始化 TypeScript 降级实现
    this.fallback = new ACTRMemoryModel({
      decay,
      threshold,
      noiseScale,
      maxSearchSeconds,
    });
  }

  // ==================== 核心方法 ====================

  /**
   * 计算激活度
   *
   * 智能路由决策:
   * - 痕迹数量 >= 500: 使用 Native (大规模计算优势)
   * - 痕迹数量 < 500: 使用 TypeScript (避免 NAPI 开销)
   *
   * @param trace 复习轨迹
   * @param decay 衰减率（可选）
   * @param addNoise 是否添加噪声
   * @returns 激活度值
   */
  computeActivation(
    trace: ReviewTrace[],
    decay?: number,
    addNoise = true
  ): number {
    const method: NativeMethod = 'selectAction';

    // 使用智能路由决策
    const decision = SmartRouter.decide('actr.computeActivation', {
      dataSize: trace.length,
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
        const nativeTrace = this.toNativeTrace(trace);
        const result = this.native.computeActivation(nativeTrace, decay, addNoise);

        // 记录成功
        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return result;
      } catch (e) {
        // 记录失败
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[ACTRMemoryNativeWrapper] Native computeActivation failed, falling back'
        );
      }
    }

    // 降级到 TypeScript 实现
    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.computeActivation(trace, decay, addNoise);
  }

  /**
   * 计算完整激活度信息
   *
   * 智能路由决策:
   * - 痕迹数量 >= 500: 使用 Native
   * - 痕迹数量 < 500: 使用 TypeScript
   */
  computeFullActivation(trace: ReviewTrace[]): ActivationResult {
    const method: NativeMethod = 'selectAction';

    // 使用智能路由决策
    const decision = SmartRouter.decide('actr.computeFullActivation', {
      dataSize: trace.length,
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
        const nativeTrace = this.toNativeTrace(trace);
        const result = this.native.computeFullActivation(nativeTrace);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeActivationResult(result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[ACTRMemoryNativeWrapper] Native computeFullActivation failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.computeFullActivation(trace);
  }

  /**
   * 计算回忆概率
   *
   * 智能路由决策: 强制使用 TypeScript
   * 原因: 简单公式计算，NAPI 调用开销远大于计算本身
   */
  computeRecallProbability(
    activation: number,
    threshold?: number,
    noiseScale?: number
  ): number {
    // 简单公式，强制使用 TypeScript (配置中已设置 forceRoute: USE_TYPESCRIPT)
    const decision = SmartRouter.decide('actr.computeRecallProbability', {
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 即使决策是 USE_NATIVE，这个方法由于配置强制使用 TS，所以直接用 fallback
    this.stats.fallbackCalls++;
    return this.fallback.computeRecallProbability(activation, threshold, noiseScale);
  }

  /**
   * 计算最优复习间隔
   *
   * 智能路由决策: 强制使用 Native
   * 原因: 包含约60次二分搜索迭代，Native 优势明显
   */
  computeOptimalInterval(
    trace: ReviewTrace[],
    targetProbability: number,
    decay?: number
  ): number {
    const method: NativeMethod = 'selectAction';

    // 复杂操作，强制使用 Native (配置中已设置 forceRoute: USE_NATIVE)
    const decision = SmartRouter.decide('actr.computeOptimalInterval', {
      dataSize: trace.length,
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
        const nativeTrace = this.toNativeTrace(trace);
        const result = this.native.computeOptimalInterval(nativeTrace, targetProbability, decay);

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
          '[ACTRMemoryNativeWrapper] Native computeOptimalInterval failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.computeOptimalInterval(trace, targetProbability, decay);
  }

  /**
   * 计算记忆强度
   *
   * 智能路由决策:
   * - 痕迹数量 >= 100: 使用 Native
   * - 痕迹数量 < 100: 使用 TypeScript
   */
  computeMemoryStrength(trace: ReviewTrace[]): number {
    const method: NativeMethod = 'selectAction';

    // 使用智能路由决策
    const decision = SmartRouter.decide('actr.computeMemoryStrength', {
      dataSize: trace.length,
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
        const nativeTrace = this.toNativeTrace(trace);
        const result = this.native.computeMemoryStrength(nativeTrace);

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
          '[ACTRMemoryNativeWrapper] Native computeMemoryStrength failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.computeMemoryStrength(trace);
  }

  // ==================== 便捷接口方法 ====================

  /**
   * 计算记忆提取概率（便捷接口）
   *
   * 智能路由决策: 强制使用 TypeScript
   * 原因: 简单公式计算，NAPI 开销导致 Native 慢 11x
   */
  retrievalProbability(trace: ReviewTrace[]): RecallPrediction {
    // 简单公式，强制使用 TypeScript (配置中已设置 forceRoute: USE_TYPESCRIPT)
    const decision = SmartRouter.decide('actr.retrievalProbability', {
      dataSize: trace.length,
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 由于配置强制使用 TS，直接用 fallback
    this.stats.fallbackCalls++;
    return this.fallback.retrievalProbability(trace);
  }

  /**
   * 预测最佳复习间隔（便捷接口）
   *
   * 智能路由决策: 强制使用 Native
   * 原因: 内部调用 computeOptimalInterval，包含复杂二分搜索
   */
  predictOptimalInterval(trace: ReviewTrace[], targetRecall = 0.9): IntervalPrediction {
    const method: NativeMethod = 'selectAction';

    // 复杂操作，强制使用 Native
    const decision = SmartRouter.decide('actr.predictOptimalInterval', {
      dataSize: trace.length,
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
        const nativeTrace = this.toNativeTrace(trace);
        const result = this.native.predictOptimalInterval(nativeTrace, targetRecall);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeIntervalPrediction(result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[ACTRMemoryNativeWrapper] Native predictOptimalInterval failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.predictOptimalInterval(trace, targetRecall);
  }

  /**
   * 计算个性化衰减率
   */
  computePersonalizedDecay(cogProfile?: CognitiveProfile): number {
    // 此方法计算简单，直接使用 TS 实现
    return this.fallback.computePersonalizedDecay(cogProfile);
  }

  // ==================== BaseLearner 兼容方法 ====================

  /**
   * 选择动作
   *
   * 智能路由决策:
   * - 动作数量 >= 20: 使用 Native
   * - 动作数量 < 20: 使用 TypeScript
   *
   * 注意: 当前由于 Action 类型转换复杂，实际委托给 fallback 处理
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: ACTRContext
  ): ActionSelection<Action> {
    // 使用智能路由决策
    const decision = SmartRouter.decide('actr.selectAction', {
      dataSize: actions.length,
      nativeAvailable: this.shouldUseNative(),
    });

    // 记录路由决策
    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.routeDecisions.native++;
    } else {
      this.stats.routeDecisions.typescript++;
    }

    // 当前由于 Action 类型转换复杂，统一使用 fallback
    // TODO: 实现 Native Action 序列化后可启用完整的 Native 路由
    this.stats.fallbackCalls++;
    return this.fallback.selectAction(state, actions, context);
  }

  /**
   * 更新模型
   *
   * 智能路由决策: 强制使用 TypeScript
   * 原因: 简单计数更新，NAPI 开销大于计算
   */
  update(
    state: UserState,
    action: Action,
    reward: number,
    context: ACTRContext
  ): void {
    // 简单更新操作，强制使用 TypeScript (配置中已设置 forceRoute: USE_TYPESCRIPT)
    const decision = SmartRouter.decide('actr.update', {
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

  // ==================== 状态管理 ====================

  /**
   * 获取状态
   */
  getState(): ACTRState {
    return this.fallback.getState();
  }

  /**
   * 设置状态
   */
  setState(state: ACTRState): void {
    this.fallback.setState(state);
    // 如果有 Native 实例，也同步状态
    if (this.native) {
      try {
        this.native.setState(state);
      } catch (e) {
        amasLogger.warn({ error: e }, '[ACTRMemoryNativeWrapper] setState to native failed');
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
        amasLogger.warn({ error: e }, '[ACTRMemoryNativeWrapper] reset native failed');
      }
    }
    this.resetStats();
  }

  // ==================== 参数访问 ====================

  /**
   * 获取衰减率
   */
  getDecay(): number {
    return this.fallback.getDecay();
  }

  /**
   * 设置衰减率
   */
  setDecay(decay: number): void {
    this.fallback.setDecay(decay);
    if (this.native) {
      try {
        this.native.setDecay(decay);
      } catch (e) {
        amasLogger.warn({ error: e }, '[ACTRMemoryNativeWrapper] setDecay to native failed');
      }
    }
  }

  /**
   * 获取回忆阈值
   */
  getThreshold(): number {
    return this.fallback.getThreshold();
  }

  /**
   * 设置回忆阈值
   */
  setThreshold(threshold: number): void {
    this.fallback.setThreshold(threshold);
    if (this.native) {
      try {
        this.native.setThreshold(threshold);
      } catch (e) {
        amasLogger.warn({ error: e }, '[ACTRMemoryNativeWrapper] setThreshold to native failed');
      }
    }
  }

  // ==================== 元数据方法 ====================

  getName(): string {
    return 'ACTRMemoryNativeWrapper';
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
  getStats(): ACTRWrapperStats {
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
    amasLogger.info('[ACTRMemoryNativeWrapper] Circuit breaker manually reset');
  }

  /**
   * 强制打开熔断器
   */
  forceOpenCircuit(reason?: string): void {
    this.circuitBreaker.forceOpen(reason);
  }

  /**
   * 获取底层 ACTRMemoryModel 实例
   */
  getFallbackInstance(): ACTRMemoryModel {
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

  // ==================== 类型转换方法 ====================

  /**
   * 转换 ReviewTrace 到 Native 格式
   */
  private toNativeTrace(trace: ReviewTrace[]): NativeReviewTrace[] {
    return trace.map(t => ({
      secondsAgo: t.secondsAgo,
      isCorrect: t.isCorrect,
    }));
  }

  /**
   * 转换 Native ActivationResult 到 TS 格式
   */
  private fromNativeActivationResult(result: NativeActivationResult): ActivationResult {
    return {
      baseActivation: result.baseActivation,
      activation: result.activation,
      recallProbability: result.recallProbability,
    };
  }

  /**
   * 转换 Native RecallPrediction 到 TS 格式
   */
  private fromNativeRecallPrediction(result: NativeRecallPrediction): RecallPrediction {
    return {
      activation: result.activation,
      recallProbability: result.recallProbability,
      confidence: result.confidence,
    };
  }

  /**
   * 转换 Native IntervalPrediction 到 TS 格式
   */
  private fromNativeIntervalPrediction(result: NativeIntervalPrediction): IntervalPrediction {
    return {
      optimalSeconds: result.optimalSeconds,
      minSeconds: result.minSeconds,
      maxSeconds: result.maxSeconds,
      targetRecall: result.targetRecall,
    };
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 ACTRMemoryNativeWrapper 实例
 */
export function createACTRMemoryNativeWrapper(
  config?: ACTRWrapperConfig
): ACTRMemoryNativeWrapper {
  return new ACTRMemoryNativeWrapper(config);
}

/**
 * 创建禁用 Native 的 ACTRMemoryNativeWrapper (用于测试)
 */
export function createACTRMemoryNativeWrapperFallback(
  config?: Omit<ACTRWrapperConfig, 'useNative'>
): ACTRMemoryNativeWrapper {
  return new ACTRMemoryNativeWrapper({ ...config, useNative: false });
}

export default ACTRMemoryNativeWrapper;
