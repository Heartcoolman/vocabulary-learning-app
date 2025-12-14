/**
 * AMAS Engine - 弹性保护模块
 *
 * 提供超时保护、熔断器和智能降级能力
 */

import { CircuitBreaker, createDefaultCircuitBreaker } from '../common/circuit-breaker';
import { telemetry } from '../common/telemetry';
import { intelligentFallback, FallbackReason } from '../decision/fallback';
import { ACTION_SPACE } from '../config/action-space';
import {
  Logger,
  ProcessOptions,
  ProcessResult,
  StateRepository,
  TimeoutFlag,
} from './engine-types';
import { UserState, Action } from '../types';
import { shouldForceCircuitOpen, getSimulateFallbackReason } from '../../config/debug-config';

/**
 * 弹性保护管理器
 *
 * 负责：
 * - 超时保护（100ms）
 * - 熔断器管理
 * - 智能降级策略
 */
export class ResilienceManager {
  private circuit: CircuitBreaker;
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;

    // 初始化熔断器
    this.circuit = createDefaultCircuitBreaker(
      (evt) => {
        telemetry.record('amas.circuit.event', evt);
      },
      (from, to) => {
        telemetry.record('amas.circuit.transition', { from, to });
        this.logger?.warn(`Circuit breaker transition: ${from} → ${to}`);
      },
    );
  }

  /**
   * 检查熔断器是否允许执行
   * 支持通过调试配置强制打开熔断器
   */
  canExecute(): boolean {
    // 检查调试配置是否强制打开熔断器
    if (shouldForceCircuitOpen()) {
      this.logger?.warn('Circuit breaker forced OPEN by debug config');
      return false;
    }
    return this.circuit.canExecute();
  }

  /**
   * 获取调试配置中的模拟降级原因
   * 如果设置了模拟原因，返回该原因；否则返回 null
   */
  getDebugFallbackReason(): FallbackReason | null {
    const reason = getSimulateFallbackReason();
    if (reason && ['timeout', 'circuit_open', 'degraded_state', 'error'].includes(reason)) {
      return reason as FallbackReason;
    }
    return null;
  }

  /**
   * 记录成功执行
   */
  recordSuccess(): void {
    this.circuit.recordSuccess();
  }

  /**
   * 记录失败执行
   */
  recordFailure(errorMessage: string): void {
    this.circuit.recordFailure(errorMessage);
  }

  /**
   * 执行超时保护
   *
   * @param fn 需要执行的异步函数
   * @param timeoutMs 超时时间（毫秒）
   * @param userId 用户ID（用于日志）
   * @param abortController 用于取消内部操作的 AbortController
   * @param onTimeout 超时时的回调函数
   */
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    userId: string,
    abortController?: AbortController,
    onTimeout?: () => void,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        telemetry.increment('amas.timeout', { path: 'decision' });
        this.logger?.warn('Decision timeout', { userId, timeoutMs });
        // 触发取消信号，通知内部操作停止
        abortController?.abort();
        // 执行超时回调（设置标志位）
        onTimeout?.();
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutHandle!);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      throw error;
    }
  }

  /**
   * 创建智能降级结果
   */
  async createIntelligentFallbackResult(
    userId: string,
    reason: FallbackReason,
    opts: ProcessOptions,
    stateLoader: () => Promise<UserState>,
    interactionCountGetter: (userId: string, provided?: number) => number,
    eventTimestamp?: number,
  ): Promise<ProcessResult> {
    const state = await stateLoader();
    const interactionCount = interactionCountGetter(userId, opts.interactionCount);
    const recentErrorRate = opts.recentAccuracy !== undefined ? 1 - opts.recentAccuracy : undefined;

    // 使用事件时间而非当前时间，确保离线回放正确性
    const hour =
      eventTimestamp !== undefined ? new Date(eventTimestamp).getHours() : new Date().getHours();

    // 使用智能降级策略
    const fallbackResult = intelligentFallback(state, reason, {
      interactionCount,
      recentErrorRate,
      hour,
    });

    return {
      strategy: fallbackResult.strategy,
      action: fallbackResult.action,
      explanation: fallbackResult.explanation,
      state,
      reward: 0,
      suggestion: null,
      shouldBreak: false,
    };
  }

  /**
   * 创建简单降级结果（向后兼容）
   * @deprecated 使用 createIntelligentFallbackResult 代替
   */
  async createFallbackResult(
    userId: string,
    stateLoader: () => Promise<UserState>,
    interactionCountGetter: (userId: string, provided?: number) => number,
  ): Promise<ProcessResult> {
    return this.createIntelligentFallbackResult(
      userId,
      'degraded_state',
      {},
      stateLoader,
      interactionCountGetter,
    );
  }

  /**
   * 记录降级事件
   */
  recordDegradation(reason: string, meta?: Record<string, unknown>): void {
    telemetry.increment('amas.degradation', { reason, ...meta });
  }

  /**
   * 记录延迟指标
   */
  recordLatency(latencyMs: number): void {
    telemetry.histogram('amas.decision.latency', latencyMs);
  }
}
