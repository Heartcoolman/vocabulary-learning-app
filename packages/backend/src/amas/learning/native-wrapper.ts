/**
 * Native LinUCB 包装器
 * 提供熔断器模式和自动降级功能
 */

import type {
  LinUcbNative as NativeLinUCB,
  UserState as NativeUserState,
  Action as NativeAction,
  LinUcbContext as NativeContext,
  ActionSelection as NativeActionSelection,
  DiagnosticResult,
  BanditModel,
} from '@danci/native';

// 导入环境配置
import { env } from '../../config/env';

// 导入日志
import { amasLogger } from '../../logger';

// 导入 Prometheus 指标
import {
  recordNativeCall,
  recordNativeFailure,
  recordNativeDuration,
  updateCircuitBreakerState,
  type NativeMethod,
} from '../../monitoring/amas-metrics';

// 尝试加载 native 模块
let NativeModule: typeof import('@danci/native') | null = null;
try {
  NativeModule = require('@danci/native');
} catch (e) {
  amasLogger.warn('[NativeWrapper] Native module not available, will use TypeScript fallback');
}

// 类型定义（与现有 TS 类型兼容）
export interface UserState {
  masteryLevel: number;
  recentAccuracy: number;
  studyStreak: number;
  totalInteractions: number;
  averageResponseTime: number;
}

export interface Action {
  wordId: string;
  difficulty: string;
  scheduledAt?: Date | null;
}

export interface LinUCBContext {
  timeOfDay: number;
  dayOfWeek: number;
  sessionDuration: number;
  fatigueFactor?: number;
}

export interface ActionSelection {
  selectedIndex: number;
  selectedAction: Action;
  exploitation: number;
  exploration: number;
  score: number;
  allScores: number[];
}

export interface NativeWrapperStats {
  useNative: boolean;
  nativeAvailable: boolean;
  failureCount: number;
  isCircuitOpen: boolean;
  lastFailureTime: number | null;
  totalNativeCalls: number;
  totalFallbackCalls: number;
}

/**
 * 熔断器配置
 */
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // 失败次数阈值
  recoveryTimeout: 60000, // 恢复尝试间隔 (60秒)
  halfOpenMaxCalls: 3, // 半开状态最大尝试次数
};

/**
 * LinUCB Native 包装器
 * 自动在 Native 和 TypeScript 实现之间切换
 */
export class LinUCBNativeWrapper {
  private nativeInstance: InstanceType<typeof NativeLinUCB> | null = null;
  private tsInstance: any = null; // TypeScript LinUCB 实例

  // 熔断器状态
  private failureCount = 0;
  private isCircuitOpen = false;
  private lastFailureTime: number | null = null;
  private halfOpenCallCount = 0;

  // 统计信息
  private totalNativeCalls = 0;
  private totalFallbackCalls = 0;

  // 配置
  private readonly alpha: number;
  private readonly lambda: number;
  private readonly useNativeEnabled: boolean;

  constructor(alpha: number = 0.3, lambda: number = 1.0, tsLinUCBFactory?: () => any) {
    this.alpha = alpha;
    this.lambda = lambda;
    this.useNativeEnabled = env.AMAS_USE_NATIVE;

    // 初始化 Native 实例
    if (this.useNativeEnabled && NativeModule) {
      try {
        this.nativeInstance = new NativeModule.LinUcbNative(alpha, lambda);
      } catch (e) {
        amasLogger.error({ error: e }, '[NativeWrapper] Failed to create native instance');
        this.nativeInstance = null;
      }
    }

    // 初始化 TS 实例（作为降级备选）
    if (tsLinUCBFactory) {
      this.tsInstance = tsLinUCBFactory();
    }
  }

  /**
   * 检查是否应该使用 Native 实现
   */
  private shouldUseNative(): boolean {
    if (!this.useNativeEnabled || !this.nativeInstance) {
      return false;
    }

    // 熔断器打开，检查是否可以尝试恢复
    if (this.isCircuitOpen) {
      const now = Date.now();
      if (
        this.lastFailureTime &&
        now - this.lastFailureTime >= CIRCUIT_BREAKER_CONFIG.recoveryTimeout
      ) {
        // 进入半开状态，允许尝试
        this.halfOpenCallCount++;
        if (this.halfOpenCallCount <= CIRCUIT_BREAKER_CONFIG.halfOpenMaxCalls) {
          // 更新熔断器状态指标: half-open = 2
          updateCircuitBreakerState('half-open');
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * 记录 Native 调用成功
   */
  private recordSuccess(): void {
    if (this.isCircuitOpen) {
      // 从半开状态恢复
      this.isCircuitOpen = false;
      this.failureCount = 0;
      this.halfOpenCallCount = 0;
      // 更新熔断器状态指标: closed = 0
      updateCircuitBreakerState('closed');
      amasLogger.info('[NativeWrapper] Circuit breaker closed, native recovered');
    }
    this.totalNativeCalls++;
  }

  /**
   * 记录 Native 调用失败
   */
  private recordFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      this.isCircuitOpen = true;
      this.halfOpenCallCount = 0;
      // 更新熔断器状态指标: open = 1
      updateCircuitBreakerState('open');
      amasLogger.warn(
        { failureCount: this.failureCount },
        '[NativeWrapper] Circuit breaker opened',
      );
    }

    amasLogger.error({ error: error.message }, '[NativeWrapper] Native call failed');
  }

  /**
   * 转换 UserState 到 Native 格式
   */
  private toNativeState(state: UserState): NativeUserState {
    return {
      masteryLevel: state.masteryLevel,
      recentAccuracy: state.recentAccuracy,
      studyStreak: state.studyStreak,
      totalInteractions: state.totalInteractions,
      averageResponseTime: state.averageResponseTime,
    };
  }

  /**
   * 转换 Action 到 Native 格式
   */
  private toNativeAction(action: Action): NativeAction {
    return {
      wordId: action.wordId,
      difficulty: action.difficulty,
      scheduledAt: action.scheduledAt ? action.scheduledAt.getTime() : undefined,
    };
  }

  /**
   * 转换 Context 到 Native 格式
   */
  private toNativeContext(context: LinUCBContext): NativeContext {
    return {
      timeOfDay: context.timeOfDay,
      dayOfWeek: context.dayOfWeek,
      sessionDuration: context.sessionDuration,
      fatigueFactor: context.fatigueFactor,
    };
  }

  /**
   * 转换 Native ActionSelection 到标准格式
   */
  private fromNativeSelection(result: NativeActionSelection, actions: Action[]): ActionSelection {
    // 边界检查：防止 Native 模块返回无效索引
    if (result.selectedIndex < 0 || result.selectedIndex >= actions.length) {
      amasLogger.error(
        { selectedIndex: result.selectedIndex, actionsLength: actions.length },
        '[NativeWrapper] selectedIndex out of bounds, falling back to first action',
      );
      return {
        selectedIndex: 0,
        selectedAction: actions[0],
        exploitation: 0,
        exploration: 0,
        score: 0,
        allScores: Array.from(result.allScores),
      };
    }

    return {
      selectedIndex: result.selectedIndex,
      selectedAction: actions[result.selectedIndex],
      exploitation: result.exploitation,
      exploration: result.exploration,
      score: result.score,
      allScores: Array.from(result.allScores),
    };
  }

  /**
   * 选择动作
   */
  selectAction(state: UserState, actions: Action[], context: LinUCBContext): ActionSelection {
    const method: NativeMethod = 'selectAction';

    if (this.shouldUseNative() && this.nativeInstance) {
      const startTime = performance.now();
      try {
        const nativeState = this.toNativeState(state);
        const nativeActions = actions.map((a) => this.toNativeAction(a));
        const nativeContext = this.toNativeContext(context);

        const result = this.nativeInstance.selectAction(nativeState, nativeActions, nativeContext);

        // 记录成功调用和延迟
        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');

        this.recordSuccess();
        return this.fromNativeSelection(result, actions);
      } catch (e) {
        // 记录失败
        recordNativeFailure();
        this.recordFailure(e as Error);
      }
    }

    // 降级到 TS 实现
    this.totalFallbackCalls++;
    recordNativeCall(method, 'fallback');

    if (this.tsInstance) {
      return this.tsInstance.selectAction(state, actions, context);
    }

    // 如果没有 TS 实例，返回默认选择
    amasLogger.warn('[NativeWrapper] No fallback available, returning first action');
    return {
      selectedIndex: 0,
      selectedAction: actions[0],
      exploitation: 0,
      exploration: 0,
      score: 0,
      allScores: actions.map(() => 0),
    };
  }

  /**
   * 更新模型
   */
  update(state: UserState, action: Action, reward: number, context: LinUCBContext): void {
    const method: NativeMethod = 'update';

    if (this.shouldUseNative() && this.nativeInstance) {
      const startTime = performance.now();
      try {
        const nativeState = this.toNativeState(state);
        const nativeAction = this.toNativeAction(action);
        const nativeContext = this.toNativeContext(context);

        this.nativeInstance.update(nativeState, nativeAction, reward, nativeContext);

        // 记录成功调用和延迟
        const durationMs = performance.now() - startTime;
        recordNativeDuration(method, durationMs);
        recordNativeCall(method, 'success');

        this.recordSuccess();
        return;
      } catch (e) {
        // 记录失败
        recordNativeFailure();
        this.recordFailure(e as Error);
      }
    }

    // 降级到 TS 实现
    this.totalFallbackCalls++;
    recordNativeCall(method, 'fallback');

    if (this.tsInstance) {
      this.tsInstance.update(state, action, reward, context);
    }
  }

  /**
   * 批量更新
   */
  updateBatch(featureVecs: number[][], rewards: number[]): number {
    if (this.shouldUseNative() && this.nativeInstance) {
      try {
        const count = this.nativeInstance.updateBatch(featureVecs, rewards);
        this.recordSuccess();
        return count;
      } catch (e) {
        this.recordFailure(e as Error);
      }
    }

    // 降级：逐个更新（TS 实现）
    this.totalFallbackCalls++;

    // 验证输入长度一致性
    if (featureVecs.length !== rewards.length) {
      amasLogger.warn(
        { featureVecsLength: featureVecs.length, rewardsLength: rewards.length },
        '[NativeWrapper] Batch update: input lengths mismatch',
      );
      return 0;
    }

    // 如果有 TS 实例，逐个更新
    if (this.tsInstance && typeof this.tsInstance.updateWithFeatureVector === 'function') {
      let successCount = 0;
      for (let i = 0; i < featureVecs.length; i++) {
        try {
          this.tsInstance.updateWithFeatureVector(featureVecs[i], rewards[i]);
          successCount++;
        } catch (e) {
          amasLogger.warn(
            { index: i, error: e instanceof Error ? e.message : String(e) },
            '[NativeWrapper] Batch update fallback failed for item',
          );
        }
      }
      amasLogger.info(
        { total: featureVecs.length, success: successCount },
        '[NativeWrapper] Batch update fallback completed',
      );
      return successCount;
    }

    amasLogger.warn('[NativeWrapper] No TS instance available for batch update fallback');
    return 0;
  }

  /**
   * 健康诊断
   */
  diagnose(): DiagnosticResult | null {
    if (this.nativeInstance) {
      try {
        return this.nativeInstance.diagnose();
      } catch (e) {
        amasLogger.error({ error: e }, '[NativeWrapper] Diagnose failed');
      }
    }
    return null;
  }

  /**
   * 自检
   */
  selfTest(): boolean {
    if (this.nativeInstance) {
      try {
        return this.nativeInstance.selfTest();
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /**
   * 获取模型
   */
  getModel(): BanditModel | null {
    if (this.nativeInstance) {
      try {
        return this.nativeInstance.getModel();
      } catch (e) {
        amasLogger.error({ error: e }, '[NativeWrapper] getModel failed');
      }
    }
    return null;
  }

  /**
   * 设置模型
   */
  setModel(model: BanditModel): boolean {
    if (this.nativeInstance) {
      try {
        this.nativeInstance.setModel(model);
        return true;
      } catch (e) {
        amasLogger.error({ error: e }, '[NativeWrapper] setModel failed');
      }
    }
    return false;
  }

  /**
   * 重置模型
   */
  reset(): void {
    if (this.nativeInstance) {
      try {
        this.nativeInstance.reset();
      } catch (e) {
        amasLogger.error({ error: e }, '[NativeWrapper] reset failed');
      }
    }
    if (this.tsInstance) {
      this.tsInstance.reset?.();
    }
  }

  /**
   * 获取 alpha
   */
  get alpha_value(): number {
    if (this.nativeInstance) {
      return this.nativeInstance.alpha;
    }
    return this.alpha;
  }

  /**
   * 设置 alpha
   */
  set alpha_value(value: number) {
    if (this.nativeInstance) {
      this.nativeInstance.alpha = value;
    }
  }

  /**
   * 获取更新计数
   */
  get updateCount(): number {
    if (this.nativeInstance) {
      return this.nativeInstance.updateCount;
    }
    return this.tsInstance?.updateCount ?? 0;
  }

  /**
   * 获取冷启动 alpha
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
      } catch (e) {
        // 降级计算
      }
    }

    // TS 降级实现
    const baseAlpha = 0.3;
    let interactionFactor = 1.0;
    if (interactionCount < 10) interactionFactor = 2.0;
    else if (interactionCount < 50) interactionFactor = 1.5;
    else if (interactionCount < 200) interactionFactor = 1.2;

    const accuracyFactor = recentAccuracy < 0.3 || recentAccuracy > 0.9 ? 1.3 : 1.0;
    const fatigueFactor = 1.0 - fatigue * 0.3;

    return baseAlpha * interactionFactor * accuracyFactor * fatigueFactor;
  }

  /**
   * 获取统计信息
   */
  getStats(): NativeWrapperStats {
    return {
      useNative: this.useNativeEnabled,
      nativeAvailable: this.nativeInstance !== null,
      failureCount: this.failureCount,
      isCircuitOpen: this.isCircuitOpen,
      lastFailureTime: this.lastFailureTime,
      totalNativeCalls: this.totalNativeCalls,
      totalFallbackCalls: this.totalFallbackCalls,
    };
  }

  /**
   * 强制关闭熔断器（用于测试或手动恢复）
   */
  resetCircuitBreaker(): void {
    this.failureCount = 0;
    this.isCircuitOpen = false;
    this.lastFailureTime = null;
    this.halfOpenCallCount = 0;
    amasLogger.info('[NativeWrapper] Circuit breaker manually reset');
  }
}

export default LinUCBNativeWrapper;
