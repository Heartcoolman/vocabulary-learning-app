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

  /** 环形缓冲区存储样本 */
  private sampleBuffer: Array<{ at: number; ok: boolean }>;
  /** 环形缓冲区写入位置 */
  private sampleIndex = 0;
  /** 实际样本数量 */
  private sampleCount = 0;

  private halfOpenRemaining = 0;

  /** 状态转换锁，防止并发transition */
  private transitioning = false;

  constructor(private readonly opts: CircuitBreakerOptions) {
    // 预分配环形缓冲区
    this.sampleBuffer = new Array(opts.windowSize);
  }

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
        return this.halfOpenRemaining > 0;
      }
      return false; // 仍在熔断状态
    }

    // HALF_OPEN状态下限制探测请求数量
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenRemaining > 0) {
        this.halfOpenRemaining -= 1;
        return true;
      }
      return false; // 探测请求已用完，等待结果
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
      // 使用tryTransition确保只有一个请求能触发状态转换
      // halfOpenRemaining在canExecute中已递减，这里检查是否所有探测都已完成
      if (this.halfOpenRemaining <= 0) {
        this.tryTransition('CLOSED'); // 所有探测成功,恢复正常
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
      this.sampleCount >= this.opts.windowSize
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
    this.sampleBuffer = new Array(this.opts.windowSize);
    this.sampleIndex = 0;
    this.sampleCount = 0;
    this.halfOpenRemaining = 0;
    this.transitioning = false;
  }

  /**
   * 强制进入OPEN状态（手动熔断）
   * @param reason 熔断原因
   */
  forceOpen(reason?: string): void {
    this.open(Date.now(), reason ?? 'force_open');
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
   * 尝试状态转换（带同步保护）
   * @param to 目标状态
   * @returns 是否成功转换
   */
  private tryTransition(to: CircuitState): boolean {
    if (this.transitioning || to === this.state) {
      return false;
    }
    this.transitioning = true;
    try {
      this.transition(to);
      return true;
    } finally {
      this.transitioning = false;
    }
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
      this.sampleBuffer = new Array(this.opts.windowSize);
      this.sampleIndex = 0;
      this.sampleCount = 0;
    }

    // 触发状态变更回调
    this.opts.onStateChange?.(from, to);

    // 触发事件回调
    const eventType =
      to === 'CLOSED' ? 'close' : to === 'HALF_OPEN' ? 'half_open' : 'open';
    this.emit(eventType);
  }

  /**
   * 添加样本到滑动窗口（使用环形缓冲区，O(1)复杂度）
   * @param sample 样本
   */
  private pushSample(sample: { at: number; ok: boolean }): void {
    // 使用环形缓冲区存储样本
    this.sampleBuffer[this.sampleIndex] = sample;
    this.sampleIndex = (this.sampleIndex + 1) % this.opts.windowSize;

    if (this.sampleCount < this.opts.windowSize) {
      this.sampleCount += 1;
    }

    // 基于时间的窗口裁剪 (标记过期样本为undefined)
    if (this.opts.windowDurationMs) {
      const cutoffTime = sample.at - this.opts.windowDurationMs;
      let validCount = 0;
      for (let i = 0; i < this.sampleCount; i++) {
        const s = this.sampleBuffer[i];
        if (s && s.at >= cutoffTime) {
          validCount++;
        } else if (s) {
          // 标记为过期（通过设置为undefined）
          this.sampleBuffer[i] = undefined as unknown as { at: number; ok: boolean };
        }
      }
      this.sampleCount = validCount;
    }

    // 触发事件回调
    this.emit(sample.ok ? 'success' : 'failure');
  }

  /**
   * 计算失败率
   * @returns 失败率 (0-1)
   */
  private computeFailureRate(): number {
    let validCount = 0;
    let failures = 0;

    for (let i = 0; i < this.opts.windowSize; i++) {
      const s = this.sampleBuffer[i];
      if (s) {
        validCount++;
        if (!s.ok) {
          failures++;
        }
      }
    }

    if (validCount === 0) return 0;
    return failures / validCount;
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
