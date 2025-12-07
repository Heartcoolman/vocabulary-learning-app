/**
 * Causal Inference Native Wrapper with Smart Routing and Circuit Breaker
 * 使用智能路由和 CircuitBreaker 熔断器的因果推断 Native 包装器
 *
 * 功能:
 * - 智能路由: 根据操作复杂度自动选择 Native 或 TypeScript 实现
 * - 熔断降级: Native 失败时自动降级到 TypeScript
 * - 提供调用统计和健康监控
 * - 支持 Prometheus 指标埋点
 *
 * 性能特征:
 * - bootstrapSE: 强制使用 Native (3318x 加速!)
 * - fitPropensity: 强制使用 Native (107x 加速)
 * - getPropensityScore: 强制使用 TypeScript (简单公式)
 * - estimateATE: 根据数据量决定 (阈值 200)
 */

import type {
  CausalInferenceNative as CausalInferenceNativeClass,
  CausalInferenceConfig as NativeCausalInferenceConfig,
  CausalObservation as NativeCausalObservation,
  CausalEstimate as NativeCausalEstimate,
  PropensityDiagnostics as NativePropensityDiagnostics,
  StrategyComparison as NativeStrategyComparison,
  CausalInferenceState as NativeCausalInferenceState,
} from '@danci/native';

import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitState,
} from '../common/circuit-breaker';

import { SmartRouter, RouteDecision } from '../common/smart-router';

import {
  CausalInference,
  CausalInferenceConfig,
  CausalInferenceState,
  CausalObservation,
  CausalEstimate,
  PropensityDiagnostics,
  StrategyComparison,
} from './causal-inference';

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
 * Causal Inference Wrapper 配置选项
 */
export interface CausalInferenceWrapperConfig extends CausalInferenceConfig {
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
export interface CausalInferenceWrapperStats {
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
  amasLogger.warn('[CausalInferenceNativeWrapper] Native module not available, will use TypeScript fallback');
}

// ==================== 熔断器默认配置 ====================

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Partial<CircuitBreakerOptions> = {
  failureThreshold: 0.5,  // 50% 失败率触发熔断
  windowSize: 20,         // 20 个样本的滑动窗口
  openDurationMs: 60000,  // 60 秒后尝试半开
  halfOpenProbe: 3,       // 半开状态允许 3 个探测请求
};

// ==================== CausalInferenceNativeWrapper 类 ====================

/**
 * 因果推断 Native 包装器
 *
 * 使用 CircuitBreaker 熔断器实现自动降级:
 * - CLOSED: 正常使用 Native 实现
 * - OPEN: 完全使用 TypeScript 降级实现
 * - HALF_OPEN: 探测性使用 Native，成功则恢复，失败则重新熔断
 *
 * @example
 * ```typescript
 * const wrapper = new CausalInferenceNativeWrapper({
 *   propensityMin: 0.05,
 *   propensityMax: 0.95,
 *   failureThreshold: 0.5,
 *   recoveryTimeout: 60000,
 * });
 *
 * wrapper.addObservation({ features: [...], treatment: 1, outcome: 0.8, timestamp: Date.now() });
 * wrapper.fit();
 * const estimate = wrapper.estimateATE();
 *
 * console.log(wrapper.getStats());
 * ```
 */
export class CausalInferenceNativeWrapper {
  private native: InstanceType<typeof CausalInferenceNativeClass> | null = null;
  private readonly fallback: CausalInference;
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

  constructor(config: CausalInferenceWrapperConfig = {}) {
    const {
      propensityMin = 0.05,
      propensityMax = 0.95,
      learningRate = 0.1,
      regularization = 0.01,
      maxIterations = 1000,
      convergenceThreshold = 1e-6,
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
        amasLogger.info({ from, to }, '[CausalInferenceNativeWrapper] Circuit breaker state changed');
        this.updateMetricState(to);
      },
      onEvent: (evt) => {
        if (evt.type === 'open') {
          amasLogger.warn({ reason: evt.reason }, '[CausalInferenceNativeWrapper] Circuit breaker opened');
        } else if (evt.type === 'close') {
          amasLogger.info('[CausalInferenceNativeWrapper] Circuit breaker closed, native recovered');
        }
      },
    });

    // 尝试初始化 Native 模块
    if (this.nativeEnabled && NativeModule?.CausalInferenceNative) {
      try {
        const nativeConfig: NativeCausalInferenceConfig = {
          propensityMin,
          propensityMax,
          learningRate,
          regularization,
          maxIterations,
          convergenceThreshold,
        };
        this.native = new NativeModule.CausalInferenceNative(nativeConfig);
        amasLogger.info('[CausalInferenceNativeWrapper] Native module initialized');
      } catch (e) {
        amasLogger.warn(
          { error: e instanceof Error ? e.message : String(e) },
          '[CausalInferenceNativeWrapper] Failed to initialize native module'
        );
        this.native = null;
      }
    }

    // 初始化 TypeScript 降级实现
    this.fallback = new CausalInference({
      propensityMin,
      propensityMax,
      learningRate,
      regularization,
      maxIterations,
      convergenceThreshold,
    });
  }

  // ==================== 数据管理方法 ====================

  /**
   * 添加观测数据
   */
  addObservation(obs: CausalObservation): void {
    const method: NativeMethod = 'update';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const nativeObs = this.toNativeObservation(obs);
        this.native!.addObservation(nativeObs);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        // 同时更新 fallback 以保持一致
        this.fallback.addObservation(obs);
        return;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native addObservation failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    this.fallback.addObservation(obs);
  }

  /**
   * 批量添加观测数据
   */
  addObservations(observations: CausalObservation[]): void {
    const method: NativeMethod = 'update';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const nativeObs = observations.map(o => this.toNativeObservation(o));
        this.native!.addObservations(nativeObs);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        // 同时更新 fallback 以保持一致
        this.fallback.addObservations(observations);
        return;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native addObservations failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    this.fallback.addObservations(observations);
  }

  /**
   * 记录观测（兼容旧 API）
   */
  recordObservation(obs: {
    treatment: string;
    outcome: number;
    covariates: Record<string, any>;
  }): void {
    // 直接委托给 fallback，因为涉及字符串 treatment 映射
    this.fallback.recordObservation(obs);

    // 如果 native 可用，也同步
    if (this.native) {
      try {
        // Native 可能不支持字符串 treatment，跳过同步
        // 保持数据一致性由 fallback 处理
      } catch (e) {
        // 忽略
      }
    }
  }

  // ==================== 核心方法 ====================

  /**
   * 拟合模型
   *
   * 智能路由决策: 强制使用 Native
   * 原因: 矩阵运算密集，107x 加速
   */
  fit(): void {
    const method: NativeMethod = 'update';

    // 复杂操作，强制使用 Native (配置中已设置 forceRoute: USE_NATIVE)
    const decision = SmartRouter.decide('causal.fit', {
      dataSize: this.fallback.getObservationCount(),
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
        this.native.fit();

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        // 同时拟合 fallback 以保持一致
        this.fallback.fit();
        return;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native fit failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    this.fallback.fit();
  }

  /**
   * 估计平均处理效应 (ATE)
   *
   * 智能路由决策:
   * - 样本数 >= 200: 使用 Native
   * - 样本数 < 200: 使用 TypeScript
   */
  estimateATE(): CausalEstimate;
  estimateATE(
    treatmentA: string,
    treatmentB: string
  ): { effect: number; treated: number; control: number; samples: number };
  estimateATE(
    treatmentA?: string,
    treatmentB?: string
  ): CausalEstimate | { effect: number; treated: number; control: number; samples: number } {
    // 字符串 treatment 的简化版本直接使用 fallback
    if (typeof treatmentA === 'string' && typeof treatmentB === 'string') {
      this.stats.routeDecisions.typescript++;
      return this.fallback.estimateATE(treatmentA, treatmentB);
    }

    const method: NativeMethod = 'selectAction';

    // 使用智能路由决策
    const decision = SmartRouter.decide('causal.estimateATE', {
      dataSize: this.fallback.getObservationCount(),
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
        const result = this.native.estimateATE();

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeCausalEstimate(result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native estimateATE failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.estimateATE();
  }

  /**
   * 估计条件平均处理效应 (CATE)
   */
  estimateCATTE(features: number[]): CausalEstimate {
    const method: NativeMethod = 'selectAction';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const result = this.native!.estimateCATTE(features);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeCausalEstimate(result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native estimateCATTE failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.estimateCATTE(features);
  }

  /**
   * 估计条件平均处理效应（兼容旧 API）
   */
  estimateCATT(
    treatment: string,
    condition: Record<string, any>
  ): { effect: number; samples: number } {
    // 直接委托给 fallback
    return this.fallback.estimateCATT(treatment, condition);
  }

  /**
   * 获取倾向得分
   *
   * 智能路由决策: 强制使用 TypeScript
   * 原因: 简单公式计算，NAPI 开销大于计算本身
   */
  getPropensityScore(features: number[]): number;
  getPropensityScore(
    treatment: string,
    covariates?: Record<string, any>
  ): number;
  getPropensityScore(
    featuresOrTreatment: number[] | string,
    covariates: Record<string, any> = {}
  ): number {
    // 字符串 treatment 版本直接使用 fallback
    if (typeof featuresOrTreatment === 'string') {
      this.stats.routeDecisions.typescript++;
      this.stats.fallbackCalls++;
      return this.fallback.getPropensityScore(featuresOrTreatment, covariates);
    }

    const features = featuresOrTreatment;

    // 简单公式，强制使用 TypeScript (配置中已设置 forceRoute: USE_TYPESCRIPT)
    const decision = SmartRouter.decide('causal.getPropensityScore', {
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
    return this.fallback.getPropensityScore(features);
  }

  /**
   * 预测结果
   */
  predictOutcome(features: number[], treatment: number): number {
    const method: NativeMethod = 'selectAction';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const result = this.native!.predictOutcome(features, treatment);

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
          '[CausalInferenceNativeWrapper] Native predictOutcome failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.predictOutcome(features, treatment);
  }

  /**
   * 诊断倾向得分分布
   */
  diagnosePropensity(): PropensityDiagnostics {
    const method: NativeMethod = 'selectAction';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const result = this.native!.diagnosePropensity();

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativePropensityDiagnostics(result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native diagnosePropensity failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.diagnosePropensity();
  }

  /**
   * 比较两个策略
   */
  compareStrategies(strategyA: number, strategyB: number): StrategyComparison {
    const method: NativeMethod = 'selectAction';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const result = this.native!.compareStrategies(strategyA, strategyB);

        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeStrategyComparison(result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[CausalInferenceNativeWrapper] Native compareStrategies failed, falling back'
        );
      }
    }

    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.fallback.compareStrategies(strategyA, strategyB);
  }

  // ==================== 状态管理 ====================

  /**
   * 获取状态
   */
  getState(): CausalInferenceState {
    return this.fallback.getState();
  }

  /**
   * 设置状态
   */
  setState(state: CausalInferenceState): void {
    this.fallback.setState(state);
    // 如果有 Native 实例，也同步状态
    if (this.native) {
      try {
        this.native.setState(state as unknown as NativeCausalInferenceState);
      } catch (e) {
        amasLogger.warn({ error: e }, '[CausalInferenceNativeWrapper] setState to native failed');
      }
    }
  }

  /**
   * 获取观测数量
   */
  getObservationCount(): number {
    return this.fallback.getObservationCount();
  }

  /**
   * 清除数据
   */
  clear(): void {
    this.fallback.clear();
    if (this.native) {
      try {
        this.native.clear();
      } catch (e) {
        amasLogger.warn({ error: e }, '[CausalInferenceNativeWrapper] clear native failed');
      }
    }
    this.resetStats();
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.fallback.reset();
    if (this.native) {
      try {
        this.native.reset();
      } catch (e) {
        amasLogger.warn({ error: e }, '[CausalInferenceNativeWrapper] reset native failed');
      }
    }
    this.resetStats();
  }

  // ==================== 统计和状态 ====================

  /**
   * 获取统计信息
   */
  getStats(): CausalInferenceWrapperStats {
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
    amasLogger.info('[CausalInferenceNativeWrapper] Circuit breaker manually reset');
  }

  /**
   * 强制打开熔断器
   */
  forceOpenCircuit(reason?: string): void {
    this.circuitBreaker.forceOpen(reason);
  }

  /**
   * 获取底层 CausalInference 实例
   */
  getFallbackInstance(): CausalInference {
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
   * 转换 CausalObservation 到 Native 格式
   */
  private toNativeObservation(obs: CausalObservation): NativeCausalObservation {
    return {
      features: [...obs.features],
      treatment: obs.treatment,
      outcome: obs.outcome,
      timestamp: obs.timestamp,
      userId: obs.userId,
    };
  }

  /**
   * 转换 Native CausalEstimate 到 TS 格式
   */
  private fromNativeCausalEstimate(result: NativeCausalEstimate): CausalEstimate {
    return {
      ate: result.ate,
      standardError: result.standardError,
      confidenceInterval: result.confidenceInterval as [number, number],
      sampleSize: result.sampleSize,
      effectiveSampleSize: result.effectiveSampleSize,
      pValue: result.pValue,
      significant: result.significant,
    };
  }

  /**
   * 转换 Native PropensityDiagnostics 到 TS 格式
   */
  private fromNativePropensityDiagnostics(result: NativePropensityDiagnostics): PropensityDiagnostics {
    return {
      mean: result.mean,
      std: result.std,
      median: result.median,
      treatmentMean: result.treatmentMean,
      controlMean: result.controlMean,
      overlap: result.overlap,
      auc: result.auc,
    };
  }

  /**
   * 转换 Native StrategyComparison 到 TS 格式
   */
  private fromNativeStrategyComparison(result: NativeStrategyComparison): StrategyComparison {
    return {
      diff: result.diff,
      standardError: result.standardError,
      confidenceInterval: result.confidenceInterval as [number, number],
      pValue: result.pValue,
      significant: result.significant,
      sampleSize: result.sampleSize,
    };
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 CausalInferenceNativeWrapper 实例
 */
export function createCausalInferenceNativeWrapper(
  config?: CausalInferenceWrapperConfig
): CausalInferenceNativeWrapper {
  return new CausalInferenceNativeWrapper(config);
}

/**
 * 创建禁用 Native 的 CausalInferenceNativeWrapper (用于测试)
 */
export function createCausalInferenceNativeWrapperFallback(
  config?: Omit<CausalInferenceWrapperConfig, 'useNative'>
): CausalInferenceNativeWrapper {
  return new CausalInferenceNativeWrapper({ ...config, useNative: false });
}

export default CausalInferenceNativeWrapper;
