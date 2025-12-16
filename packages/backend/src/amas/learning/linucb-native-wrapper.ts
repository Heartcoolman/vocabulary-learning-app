/**
 * LinUCB Native Wrapper with Circuit Breaker
 * 使用 CircuitBreaker 熔断器的 LinUCB Native 包装器
 *
 * 功能:
 * - 自动在 Native (Rust) 实现和 TypeScript 降级实现之间切换
 * - 使用标准 CircuitBreaker 进行熔断控制
 * - 提供调用统计和健康监控
 * - 支持 Prometheus 指标埋点
 */

import type {
  LinUcbNative as LinUCBNativeClass,
  UserState as NativeUserState,
  Action as NativeAction,
  LinUcbContext as NativeContext,
  ActionSelection as NativeActionSelection,
  DiagnosticResult,
  BanditModel as NativeBanditModel,
} from '@danci/native';

import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from '../common/circuit-breaker';

import { LinUCB, LinUCBContext as TSLinUCBContext } from '../algorithms/learners';

import { Action as TSAction, UserState as TSUserState, BanditModel } from '../types';

import { ActionSelection, LearnerCapabilities } from '../algorithms/learners';

import {
  recordNativeCall,
  recordNativeFailure,
  recordNativeDuration,
  updateCircuitBreakerState,
  type NativeMethod,
} from '../../monitoring/amas-metrics';

import { amasLogger } from '../../logger';

import { env } from '../../config/env';

// ==================== 类型定义 ====================

/**
 * LinUCB Wrapper 配置选项
 */
export interface LinUCBWrapperConfig {
  /** LinUCB alpha 参数 (探索系数) */
  alpha?: number;
  /** LinUCB lambda 参数 (正则化系数) */
  lambda?: number;
  /** 特征维度 */
  dimension?: number;
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
export interface LinUCBWrapperStats {
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
}

/**
 * Native LinUCB 上下文 (与 Native 类型对齐)
 */
export interface NativeLinUCBContext {
  timeOfDay: number;
  dayOfWeek: number;
  sessionDuration: number;
  fatigueFactor?: number;
}

/**
 * 简化的 Action 类型 (兼容 Native)
 */
export interface NativeCompatAction {
  wordId: string;
  difficulty: string;
  scheduledAt?: number | Date | null;
}

/**
 * 简化的 UserState 类型 (兼容 Native)
 */
export interface NativeCompatUserState {
  masteryLevel: number;
  recentAccuracy: number;
  studyStreak: number;
  totalInteractions: number;
  averageResponseTime: number;
}

// ==================== Native 模块加载 ====================

let NativeModule: typeof import('@danci/native') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeModule = require('@danci/native');
} catch (e) {
  amasLogger.warn(
    '[LinUCBNativeWrapper] Native module not available, will use TypeScript fallback',
  );
}

// ==================== 熔断器默认配置 ====================

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Partial<CircuitBreakerOptions> = {
  failureThreshold: 0.5, // 50% 失败率触发熔断
  windowSize: 20, // 20 个样本的滑动窗口
  openDurationMs: 60000, // 60 秒后尝试半开
  halfOpenProbe: 3, // 半开状态允许 3 个探测请求
};

// ==================== LinUCBNativeWrapper 类 ====================

/**
 * LinUCB Native 包装器
 *
 * 使用 CircuitBreaker 熔断器实现自动降级:
 * - CLOSED: 正常使用 Native 实现
 * - OPEN: 完全使用 TypeScript 降级实现
 * - HALF_OPEN: 探测性使用 Native，成功则恢复，失败则重新熔断
 *
 * @example
 * ```typescript
 * const wrapper = new LinUCBNativeWrapper({
 *   alpha: 0.3,
 *   lambda: 1.0,
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
export class LinUCBNativeWrapper {
  private native: InstanceType<typeof LinUCBNativeClass> | null = null;
  private readonly fallback: LinUCB;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly nativeEnabled: boolean;

  private stats = {
    nativeCalls: 0,
    fallbackCalls: 0,
    failures: 0,
  };

  constructor(config: LinUCBWrapperConfig = {}) {
    const {
      alpha = 0.3,
      lambda = 1.0,
      dimension,
      failureThreshold = DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold,
      windowSize = DEFAULT_CIRCUIT_BREAKER_OPTIONS.windowSize,
      recoveryTimeout = DEFAULT_CIRCUIT_BREAKER_OPTIONS.openDurationMs,
      halfOpenProbe = DEFAULT_CIRCUIT_BREAKER_OPTIONS.halfOpenProbe,
      useNative = env.AMAS_USE_NATIVE,
    } = config;

    this.nativeEnabled = useNative;

    // 初始化熔断器
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: failureThreshold!,
      windowSize: windowSize!,
      openDurationMs: recoveryTimeout!,
      halfOpenProbe: halfOpenProbe!,
      onStateChange: (from, to) => {
        amasLogger.info({ from, to }, '[LinUCBNativeWrapper] Circuit breaker state changed');
        this.updateMetricState(to);
      },
      onEvent: (evt) => {
        if (evt.type === 'open') {
          amasLogger.warn({ reason: evt.reason }, '[LinUCBNativeWrapper] Circuit breaker opened');
        } else if (evt.type === 'close') {
          amasLogger.info('[LinUCBNativeWrapper] Circuit breaker closed, native recovered');
        }
      },
    });

    // 尝试初始化 Native 模块
    if (this.nativeEnabled && NativeModule) {
      try {
        this.native = new NativeModule.LinUcbNative(alpha, lambda);
        amasLogger.info('[LinUCBNativeWrapper] Native module initialized');
      } catch (e) {
        amasLogger.warn(
          { error: e instanceof Error ? e.message : String(e) },
          '[LinUCBNativeWrapper] Failed to initialize native module',
        );
        this.native = null;
      }
    }

    // 初始化 TypeScript 降级实现
    this.fallback = new LinUCB({
      alpha,
      lambda,
      dimension,
    });
  }

  // ==================== 核心方法 ====================

  /**
   * 选择动作
   */
  selectAction(
    state: NativeCompatUserState,
    actions: NativeCompatAction[],
    context: NativeLinUCBContext,
  ): ActionSelection<NativeCompatAction> {
    const method: NativeMethod = 'selectAction';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const nativeState = this.toNativeState(state);
        const nativeActions = actions.map((a) => this.toNativeAction(a));
        const nativeContext = this.toNativeContext(context);

        const result = this.native!.selectAction(nativeState, nativeActions, nativeContext);

        // 记录成功
        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return this.fromNativeSelection(result, actions);
      } catch (e) {
        // 记录失败
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[LinUCBNativeWrapper] Native selectAction failed, falling back',
        );
      }
    }

    // 降级到 TypeScript 实现
    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    return this.selectActionWithFallback(state, actions, context);
  }

  /**
   * 更新模型
   */
  update(
    state: NativeCompatUserState,
    action: NativeCompatAction,
    reward: number,
    context: NativeLinUCBContext,
  ): void {
    const method: NativeMethod = 'update';

    if (this.shouldUseNative()) {
      const startTime = performance.now();
      try {
        const nativeState = this.toNativeState(state);
        const nativeAction = this.toNativeAction(action);
        const nativeContext = this.toNativeContext(context);

        this.native!.update(nativeState, nativeAction, reward, nativeContext);

        // 记录成功
        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;

        return;
      } catch (e) {
        // 记录失败
        const error = e instanceof Error ? e : new Error(String(e));
        recordNativeFailure();
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;

        amasLogger.warn(
          { error: error.message },
          '[LinUCBNativeWrapper] Native update failed, falling back',
        );
      }
    }

    // 降级到 TypeScript 实现
    this.stats.fallbackCalls++;
    recordNativeCall(method, 'fallback');

    this.updateWithFallback(state, action, reward, context);
  }

  /**
   * 使用特征向量更新 (零拷贝 Float64Array)
   */
  updateWithFloat64Array(featureVec: Float64Array, reward: number): void {
    if (this.shouldUseNative()) {
      try {
        this.native!.updateWithFloat64Array(featureVec, reward);
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;
        return;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;
      }
    }

    // 降级：转换为 Float32Array
    this.stats.fallbackCalls++;
    const floatVec = new Float32Array(featureVec);
    this.fallback.updateWithFeatureVector(floatVec, reward);
  }

  /**
   * 使用特征向量更新
   */
  updateWithFeatureVector(featureVec: number[], reward: number): void {
    if (this.shouldUseNative()) {
      try {
        this.native!.updateWithFeatureVector(featureVec, reward);
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;
        return;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;
      }
    }

    // 降级
    this.stats.fallbackCalls++;
    this.fallback.updateWithFeatureVector(new Float32Array(featureVec), reward);
  }

  /**
   * 批量更新
   */
  updateBatch(featureVecs: number[][], rewards: number[]): number {
    if (this.shouldUseNative()) {
      try {
        const count = this.native!.updateBatch(featureVecs, rewards);
        this.circuitBreaker.recordSuccess();
        this.stats.nativeCalls++;
        return count;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        this.circuitBreaker.recordFailure(error.message);
        this.stats.failures++;
      }
    }

    // 降级：逐个更新
    this.stats.fallbackCalls++;
    let count = 0;
    for (let i = 0; i < featureVecs.length && i < rewards.length; i++) {
      this.fallback.updateWithFeatureVector(new Float32Array(featureVecs[i]), rewards[i]);
      count++;
    }
    return count;
  }

  // ==================== 诊断方法 ====================

  /**
   * 健康诊断
   */
  diagnose(): DiagnosticResult | null {
    if (this.native) {
      try {
        return this.native.diagnose();
      } catch (e) {
        amasLogger.error({ error: e }, '[LinUCBNativeWrapper] diagnose failed');
      }
    }
    return null;
  }

  /**
   * 自检
   */
  selfTest(): boolean {
    if (this.native) {
      try {
        return this.native.selfTest();
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  // ==================== 模型管理 ====================

  /**
   * 获取模型
   */
  getModel(): BanditModel {
    if (this.shouldUseNative() && this.native) {
      try {
        const nativeModel = this.native.getModel();
        return {
          d: nativeModel.d,
          lambda: nativeModel.lambda,
          alpha: nativeModel.alpha,
          A: new Float32Array(nativeModel.A),
          b: new Float32Array(nativeModel.b),
          L: new Float32Array(nativeModel.L),
          updateCount: nativeModel.updateCount,
        };
      } catch (e) {
        amasLogger.warn({ error: e }, '[LinUCBNativeWrapper] getModel from native failed');
      }
    }
    return this.fallback.getModel();
  }

  /**
   * 设置模型
   */
  setModel(model: BanditModel): void {
    // 同时设置 Native 和 Fallback
    if (this.native) {
      try {
        const nativeModel: NativeBanditModel = {
          d: model.d,
          lambda: model.lambda,
          alpha: model.alpha,
          A: Array.from(model.A),
          b: Array.from(model.b),
          L: Array.from(model.L),
          updateCount: model.updateCount,
        };
        this.native.setModel(nativeModel);
      } catch (e) {
        amasLogger.warn({ error: e }, '[LinUCBNativeWrapper] setModel to native failed');
      }
    }
    this.fallback.setModel(model);
  }

  /**
   * 重置模型
   */
  reset(): void {
    if (this.native) {
      try {
        this.native.reset();
      } catch (e) {
        amasLogger.warn({ error: e }, '[LinUCBNativeWrapper] reset native failed');
      }
    }
    this.fallback.reset();
    this.resetStats();
  }

  // ==================== 配置访问 ====================

  /**
   * 获取 alpha 值
   */
  get alpha(): number {
    if (this.native) {
      try {
        return this.native.alpha;
      } catch {
        // 降级
      }
    }
    return this.fallback.getAlpha();
  }

  /**
   * 设置 alpha 值
   */
  set alpha(value: number) {
    if (this.native) {
      try {
        this.native.alpha = value;
      } catch (e) {
        amasLogger.warn({ error: e }, '[LinUCBNativeWrapper] set alpha failed');
      }
    }
    this.fallback.setAlpha(value);
  }

  /**
   * 获取更新计数
   */
  get updateCount(): number {
    if (this.shouldUseNative() && this.native) {
      try {
        return this.native.updateCount;
      } catch {
        // 降级
      }
    }
    return this.fallback.getUpdateCount();
  }

  // ==================== 静态方法 ====================

  /**
   * 计算冷启动 alpha
   */
  static getColdStartAlpha(
    interactionCount: number,
    recentAccuracy: number,
    fatigue: number,
  ): number {
    if (NativeModule) {
      try {
        return NativeModule.LinUcbNative.getColdStartAlpha(
          interactionCount,
          recentAccuracy,
          fatigue,
        );
      } catch {
        // 降级
      }
    }

    // TypeScript 降级实现
    const baseAlpha = 0.3;
    let interactionFactor = 1.0;
    if (interactionCount < 10) interactionFactor = 2.0;
    else if (interactionCount < 50) interactionFactor = 1.5;
    else if (interactionCount < 200) interactionFactor = 1.2;

    const accuracyFactor = recentAccuracy < 0.3 || recentAccuracy > 0.9 ? 1.3 : 1.0;
    const fatigueFactor = 1.0 - fatigue * 0.3;

    return baseAlpha * interactionFactor * accuracyFactor * fatigueFactor;
  }

  // ==================== 统计和状态 ====================

  /**
   * 获取统计信息
   */
  getStats(): LinUCBWrapperStats {
    return {
      ...this.stats,
      circuitState: this.circuitBreaker.getState(),
      nativeEnabled: this.nativeEnabled,
      nativeAvailable: this.native !== null,
      failureRate: this.circuitBreaker.getFailureRate(),
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
    amasLogger.info('[LinUCBNativeWrapper] Circuit breaker manually reset');
  }

  /**
   * 强制打开熔断器
   */
  forceOpenCircuit(reason?: string): void {
    this.circuitBreaker.forceOpen(reason);
  }

  /**
   * 获取底层 LinUCB 实例 (用于高级操作)
   */
  getFallbackInstance(): LinUCB {
    return this.fallback;
  }

  // ==================== BaseLearner 兼容方法 ====================

  /**
   * 获取学习器名称
   */
  getName(): string {
    return 'LinUCBNativeWrapper';
  }

  /**
   * 获取学习器版本
   */
  getVersion(): string {
    return '2.0.0-native';
  }

  /**
   * 获取学习器能力描述
   */
  getCapabilities(): LearnerCapabilities {
    const fallbackCaps = this.fallback.getCapabilities();
    return {
      ...fallbackCaps,
      primaryUseCase: fallbackCaps.primaryUseCase + ' (Native 加速版本，支持熔断降级)',
    };
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
   * 使用 Fallback 实现 selectAction
   */
  private selectActionWithFallback(
    state: NativeCompatUserState,
    actions: NativeCompatAction[],
    context: NativeLinUCBContext,
  ): ActionSelection<NativeCompatAction> {
    // 转换为 TS 类型，传入 context 以保留疲劳度等信息
    const tsState = this.toTSState(state, context);
    const tsActions = actions.map((a) => this.toTSAction(a));
    const tsContext = this.toTSContext(context);

    const result = this.fallback.selectAction(tsState, tsActions, tsContext);

    // 找到原始 action
    const selectedAction = actions[tsActions.indexOf(result.action)];

    return {
      action: selectedAction,
      score: result.score,
      confidence: result.confidence,
      meta: {
        ...result.meta,
        fallback: true,
      },
    };
  }

  /**
   * 使用 Fallback 实现 update
   */
  private updateWithFallback(
    state: NativeCompatUserState,
    action: NativeCompatAction,
    reward: number,
    context: NativeLinUCBContext,
  ): void {
    // 转换为 TS 类型，传入 context 以保留疲劳度等信息
    const tsState = this.toTSState(state, context);
    const tsAction = this.toTSAction(action);
    const tsContext = this.toTSContext(context);

    this.fallback.update(tsState, tsAction, reward, tsContext);
  }

  // ==================== 类型转换方法 ====================

  private toNativeState(state: NativeCompatUserState): NativeUserState {
    return {
      masteryLevel: state.masteryLevel,
      recentAccuracy: state.recentAccuracy,
      studyStreak: state.studyStreak,
      totalInteractions: state.totalInteractions,
      averageResponseTime: state.averageResponseTime,
    };
  }

  private toNativeAction(action: NativeCompatAction): NativeAction {
    let scheduledAt: number | undefined;
    if (action.scheduledAt) {
      scheduledAt =
        action.scheduledAt instanceof Date ? action.scheduledAt.getTime() : action.scheduledAt;
    }

    return {
      wordId: action.wordId,
      difficulty: action.difficulty,
      scheduledAt,
    };
  }

  private toNativeContext(context: NativeLinUCBContext): NativeContext {
    return {
      timeOfDay: context.timeOfDay,
      dayOfWeek: context.dayOfWeek,
      sessionDuration: context.sessionDuration,
      fatigueFactor: context.fatigueFactor,
    };
  }

  private fromNativeSelection(
    result: NativeActionSelection,
    actions: NativeCompatAction[],
  ): ActionSelection<NativeCompatAction> {
    // 边界检查：防止 Native 模块返回无效索引
    if (result.selectedIndex < 0 || result.selectedIndex >= actions.length) {
      amasLogger.error(
        { selectedIndex: result.selectedIndex, actionsLength: actions.length },
        '[LinUCBNativeWrapper] selectedIndex out of bounds, falling back to first action',
      );
      return {
        action: actions[0],
        score: 0,
        confidence: 0,
        meta: {
          selectedIndex: 0,
          exploitation: 0,
          exploration: 0,
          allScores: Array.from(result.allScores),
          native: true,
          boundaryError: true,
        },
      };
    }

    // 修正 confidence 计算：
    // exploration = alpha * sqrt(x^T A^-1 x)，代表不确定性
    // 将 exploration 归一化到 [0, 1] 范围作为 confidence 的近似
    // 使用 tanh 函数将任意正数映射到 (0, 1)
    const rawConfidence = result.exploration;
    const confidence = Math.tanh(rawConfidence); // 归一化到 (0, 1)

    return {
      action: actions[result.selectedIndex],
      score: result.score,
      confidence,
      meta: {
        selectedIndex: result.selectedIndex,
        exploitation: result.exploitation,
        exploration: result.exploration,
        allScores: Array.from(result.allScores),
        native: true,
      },
    };
  }

  private toTSState(state: NativeCompatUserState, context?: NativeLinUCBContext): TSUserState {
    // 从 context 中恢复疲劳度，避免降级时状态丢失
    const fatigue = context?.fatigueFactor ?? 0;

    // 基于 mastery 和 accuracy 估算动机（高掌握度+高正确率 → 高动机）
    const motivation = (state.masteryLevel + state.recentAccuracy) / 2;

    return {
      A: state.recentAccuracy, // 用 accuracy 近似 attention
      F: fatigue, // 从 context 恢复疲劳度
      C: {
        mem: state.masteryLevel,
        speed: state.averageResponseTime > 0 ? 5000 / state.averageResponseTime : 1,
        stability: 1.0 - Math.abs(state.recentAccuracy - 0.5), // 根据准确率估算稳定性
      },
      M: motivation, // 基于掌握度和正确率估算动机
      conf: Math.min(state.totalInteractions / 100, 1.0), // 基于交互次数估算置信度
      ts: Date.now(), // 当前时间戳
    };
  }

  private toTSAction(action: NativeCompatAction): TSAction {
    return {
      interval_scale: 1.0,
      new_ratio: 0.3,
      difficulty: action.difficulty as 'easy' | 'mid' | 'hard',
      hint_level: 0,
      batch_size: 8,
    };
  }

  private toTSContext(context: NativeLinUCBContext): TSLinUCBContext {
    return {
      recentErrorRate: 0,
      recentResponseTime: context.sessionDuration > 0 ? context.sessionDuration / 10 : 1000,
      timeBucket: context.timeOfDay,
    };
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 LinUCBNativeWrapper 实例
 */
export function createLinUCBNativeWrapper(config?: LinUCBWrapperConfig): LinUCBNativeWrapper {
  return new LinUCBNativeWrapper(config);
}

/**
 * 创建禁用 Native 的 LinUCBNativeWrapper (用于测试)
 */
export function createLinUCBNativeWrapperFallback(
  config?: Omit<LinUCBWrapperConfig, 'useNative'>,
): LinUCBNativeWrapper {
  return new LinUCBNativeWrapper({ ...config, useNative: false });
}

export default LinUCBNativeWrapper;
