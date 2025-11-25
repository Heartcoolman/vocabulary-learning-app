/**
 * Circuit Breaker - 熔断器
 * 用于异常检测和自动降级
 *
 * 功能:
 * - 滑动窗口统计失败率
 * - 三态管理: CLOSED(正常) → OPEN(熔断) → HALF_OPEN(探测) → CLOSED
 * - 事件回调用于监控埋点
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** 失败率阈值 (0-1), 超过此值触发熔断 */
  failureThreshold: number;
  /** 滑动窗口大小(样本数) */
  windowSize: number;
  /** 滑动窗口时间范围(毫秒), 超过此时间的样本将被淘汰 */
  windowDurationMs?: number;
  /** OPEN状态持续时长(毫秒), 之后进入HALF_OPEN */
  openDurationMs: number;
  /** HALF_OPEN状态下允许的探测请求数 */
  halfOpenProbe: number;
  /** 状态转换回调 */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** 事件回调(成功/失败/状态变更) */
  onEvent?: (evt: {
    type: 'success' | 'failure' | 'open' | 'half_open' | 'close';
    at: number;
    reason?: string;
  }) => void;
}

/**
 * 熔断器实现
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private lastOpenedAt = 0;
  private samples: Array<{ at: number; ok: boolean }> = [];
  private halfOpenRemaining = 0;

  constructor(private readonly opts: CircuitBreakerOptions) {}

  /**
   * 检查是否可以执行请求
   * @param now 当前时间戳
   * @returns true表示可以执行
   */
  canExecute(now = Date.now()): boolean {
    if (this.state === 'OPEN') {
      // 检查是否到达半开时间
      if (now - this.lastOpenedAt >= this.opts.openDurationMs) {
        this.transition('HALF_OPEN');
        this.halfOpenRemaining = this.opts.halfOpenProbe;
        return true;
      }
      return false; // 仍在熔断状态
    }
    return true;
  }

  /**
   * 记录成功执行
   * @param now 当前时间戳
   */
  recordSuccess(now = Date.now()): void {
    this.pushSample({ at: now, ok: true });

    // HALF_OPEN状态下探测成功
    if (this.state === 'HALF_OPEN') {
      this.halfOpenRemaining -= 1;
      if (this.halfOpenRemaining <= 0) {
        this.transition('CLOSED'); // 所有探测成功,恢复正常
      }
    }
  }

  /**
   * 记录失败执行
   * @param reason 失败原因
   * @param now 当前时间戳
   */
  recordFailure(reason?: string, now = Date.now()): void {
    this.pushSample({ at: now, ok: false });

    // HALF_OPEN状态下探测失败,立即重新熔断
    if (this.state === 'HALF_OPEN') {
      this.open(now, reason);
      return;
    }

    // CLOSED状态下检查失败率
    const failureRate = this.computeFailureRate();
    if (
      this.state === 'CLOSED' &&
      failureRate >= this.opts.failureThreshold &&
      this.samples.length >= this.opts.windowSize
    ) {
      this.open(now, reason);
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 获取当前失败率
   */
  getFailureRate(): number {
    return this.computeFailureRate();
  }

  /**
   * 重置熔断器状态
   */
  reset(): void {
    this.state = 'CLOSED';
    this.lastOpenedAt = 0;
    this.samples = [];
    this.halfOpenRemaining = 0;
  }

  /**
   * 进入OPEN状态
   * @param now 当前时间戳
   * @param reason 熔断原因
   */
  private open(now: number, reason?: string): void {
    this.lastOpenedAt = now;
    this.transition('OPEN');
    this.emit('open', reason);
  }

  /**
   * 状态转换
   * @param to 目标状态
   */
  private transition(to: CircuitState): void {
    if (to === this.state) return;

    const from = this.state;
    this.state = to;

    // 修复: 转换到CLOSED状态时清空历史失败样本，避免抖动
    if (to === 'CLOSED') {
      this.samples = [];
    }

    // 触发状态变更回调
    this.opts.onStateChange?.(from, to);

    // 触发事件回调
    const eventType =
      to === 'CLOSED' ? 'close' : to === 'HALF_OPEN' ? 'half_open' : 'open';
    this.emit(eventType);
  }

  /**
   * 添加样本到滑动窗口
   * @param sample 样本
   */
  private pushSample(sample: { at: number; ok: boolean }): void {
    this.samples.push(sample);

    // 基于数量的窗口裁剪
    if (this.samples.length > this.opts.windowSize) {
      this.samples.shift();
    }

    // 基于时间的窗口裁剪 (淘汰过期样本)
    if (this.opts.windowDurationMs) {
      const cutoffTime = sample.at - this.opts.windowDurationMs;
      this.samples = this.samples.filter(s => s.at >= cutoffTime);
    }

    // 触发事件回调
    this.emit(sample.ok ? 'success' : 'failure');
  }

  /**
   * 计算失败率
   * @returns 失败率 (0-1)
   */
  private computeFailureRate(): number {
    if (this.samples.length === 0) return 0;
    const failures = this.samples.filter(s => !s.ok).length;
    return failures / this.samples.length;
  }

  /**
   * 触发事件回调
   * @param type 事件类型
   * @param reason 原因
   */
  private emit(
    type: 'success' | 'failure' | 'open' | 'half_open' | 'close',
    reason?: string
  ): void {
    this.opts.onEvent?.({ type, at: Date.now(), reason });
  }
}

/**
 * 创建默认配置的熔断器
 * @returns 熔断器实例
 */
export function createDefaultCircuitBreaker(
  onEvent?: CircuitBreakerOptions['onEvent'],
  onStateChange?: CircuitBreakerOptions['onStateChange']
): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 0.5, // 50%失败率触发熔断
    windowSize: 20, // 20个样本的滑动窗口
    windowDurationMs: 60000, // 60秒时间窗口，过期样本自动淘汰
    openDurationMs: 5000, // 5秒后尝试半开
    halfOpenProbe: 2, // 半开状态允许2个探测请求
    onEvent,
    onStateChange
  });
}
