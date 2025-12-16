/**
 * 健康检查监控器
 *
 * 定期检查 PostgreSQL 健康状态
 * 检测故障并触发状态切换
 */

import { EventEmitter } from 'events';
import { DatabaseAdapter, HealthCheckConfig } from '../adapters/types';

// ============================================
// 类型定义
// ============================================

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  timestamp: number;
}

/**
 * 健康监控事件
 */
export interface HealthMonitorEvents {
  'health-check': (result: HealthCheckResult) => void;
  'failure-detected': (consecutiveFailures: number) => void;
  'recovery-detected': (consecutiveSuccesses: number) => void;
  'threshold-reached': (type: 'failure' | 'recovery') => void;
}

// ============================================
// 健康监控器
// ============================================

/**
 * PostgreSQL 健康检查监控器
 * 使用滑动窗口机制，更平滑地处理网络波动
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthCheckConfig;
  private adapter: DatabaseAdapter;
  private checkTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastCheckResult: HealthCheckResult | null = null;
  private running = false;
  private lastFailureTime: number | null = null;

  // 滑动窗口：记录最近N次检查结果
  private readonly windowSize = 10;
  private checkHistory: boolean[] = [];

  constructor(adapter: DatabaseAdapter, config: HealthCheckConfig) {
    super();
    this.adapter = adapter;
    this.config = config;
  }

  /**
   * 启动健康检查
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNextCheck();
  }

  /**
   * 停止健康检查
   */
  stop(): void {
    this.running = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * 立即执行健康检查
   */
  async checkNow(): Promise<HealthCheckResult> {
    const result = await this.performHealthCheck();
    this.processResult(result);
    return result;
  }

  /**
   * 获取最近一次检查结果
   */
  getLastResult(): HealthCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * 获取连续失败次数
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * 获取连续成功次数
   */
  getConsecutiveSuccesses(): number {
    return this.consecutiveSuccesses;
  }

  /**
   * 检查是否达到故障阈值
   */
  isFailureThresholdReached(): boolean {
    return this.consecutiveFailures >= this.config.failureThreshold;
  }

  /**
   * 检查是否达到恢复阈值
   */
  isRecoveryThresholdReached(): boolean {
    // 确保距离上次故障有足够的间隔
    if (this.lastFailureTime) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure < this.config.minRecoveryIntervalMs) {
        return false;
      }
    }
    return this.consecutiveSuccesses >= this.config.recoveryThreshold;
  }

  /**
   * 重置计数器
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastCheckResult = null;
  }

  /**
   * 标记已恢复（重置故障计数）
   */
  markRecovered(): void {
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }

  /**
   * 标记已降级（重置成功计数）
   */
  markDegraded(): void {
    this.consecutiveSuccesses = 0;
  }

  /**
   * 安排下次检查
   */
  private scheduleNextCheck(): void {
    if (!this.running) {
      return;
    }

    this.checkTimer = setTimeout(async () => {
      if (!this.running) return;

      const result = await this.performHealthCheck();
      this.processResult(result);
      this.scheduleNextCheck();
    }, this.config.intervalMs);

    // 允许进程退出
    if (this.checkTimer.unref) {
      this.checkTimer.unref();
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<HealthCheckResult> {
    try {
      const checkResult = await this.adapter.healthCheck(this.config.timeoutMs);
      return {
        healthy: checkResult.healthy,
        latency: checkResult.latency,
        error: checkResult.error,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 处理检查结果
   * 使用滑动窗口机制，避免单次失败重置所有成功计数
   */
  private processResult(result: HealthCheckResult): void {
    this.lastCheckResult = result;
    this.emit('health-check', result);

    // 添加到滑动窗口
    this.checkHistory.push(result.healthy);
    if (this.checkHistory.length > this.windowSize) {
      this.checkHistory.shift();
    }

    if (result.healthy) {
      // 健康检查成功
      this.consecutiveSuccesses++;
      // 使用滑动窗口：只有当窗口中所有检查都失败时才重置成功计数
      // 单次失败不再重置
      const recentFailures = this.checkHistory.filter((h) => !h).length;
      if (recentFailures >= this.config.failureThreshold) {
        this.consecutiveFailures = recentFailures;
      } else {
        this.consecutiveFailures = 0;
      }

      this.emit('recovery-detected', this.consecutiveSuccesses);

      if (this.isRecoveryThresholdReached()) {
        this.emit('threshold-reached', 'recovery');
      }
    } else {
      // 健康检查失败
      this.consecutiveFailures++;
      // 使用滑动窗口：只有当窗口中所有检查都成功时才重置失败计数
      const recentSuccesses = this.checkHistory.filter((h) => h).length;
      if (recentSuccesses >= this.config.recoveryThreshold) {
        this.consecutiveSuccesses = recentSuccesses;
      } else {
        this.consecutiveSuccesses = 0;
      }
      this.lastFailureTime = Date.now();

      this.emit('failure-detected', this.consecutiveFailures);

      if (this.isFailureThresholdReached()) {
        this.emit('threshold-reached', 'failure');
      }
    }
  }
}

/**
 * 创建健康监控器
 */
export function createHealthMonitor(
  adapter: DatabaseAdapter,
  config: HealthCheckConfig,
): HealthMonitor {
  return new HealthMonitor(adapter, config);
}
