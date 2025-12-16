/**
 * AMAS 监控 - 指标采集器
 *
 * 职责：
 * - 采集关键运行指标（延迟、错误率、熔断状态、奖励处理结果）
 * - 提供 `collectMetrics()` 输出（用于告警引擎评估）
 * - 提供 `getHealthStatus()` 输出（用于系统健康检查）
 */

import { DEFAULT_SLO, SLOConfig } from './alert-config';

export type HealthLevel = 'healthy' | 'degraded' | 'unhealthy';

export interface MetricPoint {
  metric: string;
  value: number;
  timestamp: number;
}

export interface ComponentHealth {
  status: HealthLevel;
  details: Record<string, unknown>;
}

export interface HealthStatus {
  status: HealthLevel;
  components: {
    decision: ComponentHealth;
    circuit: ComponentHealth;
    reward: ComponentHealth;
  };
  slo: {
    decisionLatency: Record<string, unknown>;
    errorRate: Record<string, unknown>;
    circuitHealth: Record<string, unknown>;
    rewardQueueHealth: Record<string, unknown>;
  };
  checkedAt: Date;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const clampedP = Math.max(0, Math.min(1, p));
  const idx = Math.floor(clampedP * (sorted.length - 1));
  return sorted[idx];
}

function computeStats(values: number[]): { mean: number; p95: number; p99: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    mean,
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function worstHealth(a: HealthLevel, b: HealthLevel): HealthLevel {
  const order: Record<HealthLevel, number> = { healthy: 0, degraded: 1, unhealthy: 2 };
  return order[a] >= order[b] ? a : b;
}

export class MetricsCollector {
  private readonly slo: SLOConfig;
  private running = false;
  private timer?: NodeJS.Timeout;

  private readonly latencyWindowSize = 1000;
  private decisionLatencies: number[] = [];

  private outcomeTotal = 0;
  private errorCount = 0;
  private degradationCount = 0;
  private timeoutCount = 0;

  private circuitTotal = 0;
  private circuitOpenCount = 0;

  private rewardTotal = 0;
  private rewardFailureCount = 0;

  constructor(slo: SLOConfig = DEFAULT_SLO) {
    this.slo = slo;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // 当前采集器为内存聚合器；保留心跳定时器以满足调用方“start/stop”语义。
    this.timer = setInterval(() => {}, 60_000);
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  recordDecisionLatency(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.decisionLatencies.push(ms);
    if (this.decisionLatencies.length > this.latencyWindowSize) {
      this.decisionLatencies.splice(0, this.decisionLatencies.length - this.latencyWindowSize);
    }
  }

  recordSuccess(): void {
    this.outcomeTotal += 1;
  }

  recordError(): void {
    this.outcomeTotal += 1;
    this.errorCount += 1;
  }

  recordDegradation(): void {
    this.outcomeTotal += 1;
    this.degradationCount += 1;
  }

  recordTimeout(): void {
    this.outcomeTotal += 1;
    this.errorCount += 1;
    this.timeoutCount += 1;
  }

  recordCircuitState(isOpen: boolean): void {
    this.circuitTotal += 1;
    if (isOpen) this.circuitOpenCount += 1;
  }

  recordRewardResult(success: boolean): void {
    this.rewardTotal += 1;
    if (!success) this.rewardFailureCount += 1;
  }

  collectMetrics(): MetricPoint[] {
    const hasAny =
      this.decisionLatencies.length > 0 ||
      this.outcomeTotal > 0 ||
      this.circuitTotal > 0 ||
      this.rewardTotal > 0;
    if (!hasAny) return [];

    const ts = Date.now();
    const metrics: MetricPoint[] = [];

    const latencyStats = computeStats(this.decisionLatencies);
    if (latencyStats) {
      metrics.push({
        metric: 'amas.decision.latency_mean',
        value: latencyStats.mean,
        timestamp: ts,
      });
      metrics.push({ metric: 'amas.decision.latency_p95', value: latencyStats.p95, timestamp: ts });
      metrics.push({ metric: 'amas.decision.latency_p99', value: latencyStats.p99, timestamp: ts });
    }

    if (this.outcomeTotal > 0) {
      metrics.push({
        metric: 'amas.error_rate',
        value: clamp01(this.errorCount / this.outcomeTotal),
        timestamp: ts,
      });
      metrics.push({
        metric: 'amas.degradation_rate',
        value: clamp01(this.degradationCount / this.outcomeTotal),
        timestamp: ts,
      });
      metrics.push({
        metric: 'amas.timeout_rate',
        value: clamp01(this.timeoutCount / this.outcomeTotal),
        timestamp: ts,
      });
    }

    if (this.circuitTotal > 0) {
      metrics.push({
        metric: 'amas.circuit.open_rate',
        value: clamp01(this.circuitOpenCount / this.circuitTotal),
        timestamp: ts,
      });
    }

    if (this.rewardTotal > 0) {
      metrics.push({
        metric: 'amas.reward.failure_rate',
        value: clamp01(this.rewardFailureCount / this.rewardTotal),
        timestamp: ts,
      });
    }

    return metrics;
  }

  getHealthStatus(): HealthStatus {
    const checkedAt = new Date();
    const latencyStats = computeStats(this.decisionLatencies);
    const p95 = latencyStats?.p95 ?? NaN;
    const p99 = latencyStats?.p99 ?? NaN;
    const mean = latencyStats?.mean ?? NaN;

    const errorRate = this.outcomeTotal > 0 ? clamp01(this.errorCount / this.outcomeTotal) : 0;
    const circuitOpenRate =
      this.circuitTotal > 0 ? clamp01(this.circuitOpenCount / this.circuitTotal) : 0;
    const rewardFailureRate =
      this.rewardTotal > 0 ? clamp01(this.rewardFailureCount / this.rewardTotal) : 0;

    const latencyStatus: HealthLevel =
      Number.isFinite(p99) && p99 > this.slo.decisionLatencyP99
        ? 'unhealthy'
        : Number.isFinite(p95) && p95 > this.slo.decisionLatencyP95
          ? 'degraded'
          : 'healthy';

    const errorStatus: HealthLevel =
      errorRate > this.slo.errorRateUnhealthy
        ? 'unhealthy'
        : errorRate > this.slo.errorRateDegraded
          ? 'degraded'
          : 'healthy';

    const decisionStatus = worstHealth(latencyStatus, errorStatus);

    const circuitStatus: HealthLevel =
      circuitOpenRate > this.slo.circuitOpenRateUnhealthy
        ? 'unhealthy'
        : circuitOpenRate > this.slo.circuitOpenRateDegraded
          ? 'degraded'
          : 'healthy';

    const rewardStatus: HealthLevel =
      rewardFailureRate > this.slo.rewardFailureRateUnhealthy
        ? 'unhealthy'
        : rewardFailureRate > this.slo.rewardFailureRateDegraded
          ? 'degraded'
          : 'healthy';

    const overall = worstHealth(worstHealth(decisionStatus, circuitStatus), rewardStatus);

    return {
      status: overall,
      components: {
        decision: {
          status: decisionStatus,
          details: {
            latency: {
              mean,
              p95,
              p99,
              thresholds: { p95: this.slo.decisionLatencyP95, p99: this.slo.decisionLatencyP99 },
            },
            errorRate,
          },
        },
        circuit: { status: circuitStatus, details: { openRate: circuitOpenRate } },
        reward: { status: rewardStatus, details: { failureRate: rewardFailureRate } },
      },
      slo: {
        decisionLatency: {
          p95: this.slo.decisionLatencyP95,
          p99: this.slo.decisionLatencyP99,
          currentP95: p95,
          currentP99: p99,
          status: latencyStatus,
        },
        errorRate: {
          degraded: this.slo.errorRateDegraded,
          unhealthy: this.slo.errorRateUnhealthy,
          current: errorRate,
          status: errorStatus,
        },
        circuitHealth: {
          degraded: this.slo.circuitOpenRateDegraded,
          unhealthy: this.slo.circuitOpenRateUnhealthy,
          current: circuitOpenRate,
          status: circuitStatus,
        },
        rewardQueueHealth: {
          degraded: this.slo.rewardFailureRateDegraded,
          unhealthy: this.slo.rewardFailureRateUnhealthy,
          current: rewardFailureRate,
          status: rewardStatus,
        },
      },
      checkedAt,
    };
  }

  reset(): void {
    this.decisionLatencies = [];
    this.outcomeTotal = 0;
    this.errorCount = 0;
    this.degradationCount = 0;
    this.timeoutCount = 0;
    this.circuitTotal = 0;
    this.circuitOpenCount = 0;
    this.rewardTotal = 0;
    this.rewardFailureCount = 0;
  }
}

export function createDefaultMetricsCollector(): MetricsCollector {
  return new MetricsCollector(DEFAULT_SLO);
}
