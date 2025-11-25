/**
 * Metrics Collector - 指标采集器
 * 从遥测系统采集指标，计算统计值
 */

import { telemetry } from '../common/telemetry';
import { MetricValue } from './alert-engine';
import { DEFAULT_SLO, SLOConfig } from './alert-config';

/**
 * 指标统计
 */
export interface MetricStats {
  /** 指标名称 */
  name: string;
  /** 计数 */
  count: number;
  /** 平均值 */
  mean: number;
  /** P50 */
  p50: number;
  /** P95 */
  p95: number;
  /** P99 */
  p99: number;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 标准差 */
  stdDev: number;
}

/**
 * 系统健康状态
 */
export interface HealthStatus {
  /** 整体状态 */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** 组件健康度 */
  components: {
    decision: ComponentHealth;
    circuit: ComponentHealth;
    reward: ComponentHealth;
  };
  /** SLO 达成情况 */
  slo: {
    decisionLatency: boolean;
    errorRate: boolean;
    circuitHealth: boolean;
    rewardQueueHealth: boolean;
  };
  /** 检查时间 */
  checkedAt: Date;
}

/**
 * 组件健康度
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  metrics?: Record<string, number>;
}

/**
 * 指标采集器
 */
export class MetricsCollector {
  private sloConfig: SLOConfig;
  private collectionInterval: number;
  private intervalHandle?: NodeJS.Timeout;

  // 指标缓存
  private decisionLatencies: number[] = [];
  private errorCounts: number = 0;
  private successCounts: number = 0;
  private degradationCounts: number = 0;
  private timeoutCounts: number = 0;
  private circuitOpenCounts: number = 0;
  private circuitCheckCounts: number = 0;
  private rewardSuccessCounts: number = 0;
  private rewardFailureCounts: number = 0;

  // 窗口大小
  private readonly WINDOW_SIZE = 1000;

  constructor(sloConfig: SLOConfig = DEFAULT_SLO, collectionIntervalMs: number = 60000) {
    this.sloConfig = sloConfig;
    this.collectionInterval = collectionIntervalMs;
  }

  /**
   * 启动采集
   */
  start(): void {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(() => {
      this.collectMetrics();
    }, this.collectionInterval);

    console.log(`[MetricsCollector] Started (interval: ${this.collectionInterval}ms)`);
  }

  /**
   * 停止采集
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      console.log('[MetricsCollector] Stopped');
    }
  }

  /**
   * 记录决策延迟
   */
  recordDecisionLatency(latencyMs: number): void {
    this.decisionLatencies.push(latencyMs);
    if (this.decisionLatencies.length > this.WINDOW_SIZE) {
      this.decisionLatencies.shift();
    }
  }

  /**
   * 记录错误
   */
  recordError(): void {
    this.errorCounts++;
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this.successCounts++;
  }

  /**
   * 记录降级
   */
  recordDegradation(): void {
    this.degradationCounts++;
  }

  /**
   * 记录超时
   */
  recordTimeout(): void {
    this.timeoutCounts++;
  }

  /**
   * 记录熔断器状态
   */
  recordCircuitState(isOpen: boolean): void {
    this.circuitCheckCounts++;
    if (isOpen) {
      this.circuitOpenCounts++;
    }
  }

  /**
   * 记录延迟奖励结果
   */
  recordRewardResult(success: boolean): void {
    if (success) {
      this.rewardSuccessCounts++;
    } else {
      this.rewardFailureCounts++;
    }
  }

  /**
   * 采集所有指标
   */
  collectMetrics(): MetricValue[] {
    const now = Date.now();
    const metrics: MetricValue[] = [];

    // 决策延迟
    if (this.decisionLatencies.length > 0) {
      const latencyStats = this.calculateStats(this.decisionLatencies);
      metrics.push(
        { metric: 'amas.decision.latency_p95', value: latencyStats.p95, timestamp: now },
        { metric: 'amas.decision.latency_p99', value: latencyStats.p99, timestamp: now },
        { metric: 'amas.decision.latency_mean', value: latencyStats.mean, timestamp: now }
      );
    }

    // 错误率
    const totalRequests = this.successCounts + this.errorCounts;
    if (totalRequests > 0) {
      const errorRate = this.errorCounts / totalRequests;
      metrics.push({ metric: 'amas.error_rate', value: errorRate, timestamp: now });
    }

    // 降级率
    if (totalRequests > 0) {
      const degradationRate = this.degradationCounts / totalRequests;
      metrics.push({ metric: 'amas.degradation_rate', value: degradationRate, timestamp: now });
    }

    // 超时率
    if (totalRequests > 0) {
      const timeoutRate = this.timeoutCounts / totalRequests;
      metrics.push({ metric: 'amas.timeout_rate', value: timeoutRate, timestamp: now });
    }

    // 熔断器打开率
    if (this.circuitCheckCounts > 0) {
      const circuitOpenRate = this.circuitOpenCounts / this.circuitCheckCounts;
      metrics.push({ metric: 'amas.circuit.open_rate', value: circuitOpenRate, timestamp: now });
    }

    // 延迟奖励失败率
    const totalRewards = this.rewardSuccessCounts + this.rewardFailureCounts;
    if (totalRewards > 0) {
      const rewardFailureRate = this.rewardFailureCounts / totalRewards;
      metrics.push({ metric: 'amas.reward.failure_rate', value: rewardFailureRate, timestamp: now });
    }

    return metrics;
  }

  /**
   * 获取健康状态
   */
  getHealthStatus(): HealthStatus {
    const metrics = this.collectMetrics();
    const metricsMap = new Map(metrics.map(m => [m.metric, m.value]));

    // 评估各组件健康度
    const decisionHealth = this.evaluateDecisionHealth(metricsMap);
    const circuitHealth = this.evaluateCircuitHealth(metricsMap);
    const rewardHealth = this.evaluateRewardHealth(metricsMap);

    // 评估 SLO 达成情况
    const slo = {
      decisionLatency:
        (metricsMap.get('amas.decision.latency_p95') ?? 0) <= this.sloConfig.decisionLatencyP95,
      errorRate: (metricsMap.get('amas.error_rate') ?? 0) <= this.sloConfig.errorRate,
      circuitHealth:
        (metricsMap.get('amas.circuit.open_rate') ?? 0) <= this.sloConfig.circuitOpenRate,
      rewardQueueHealth:
        (metricsMap.get('amas.reward.failure_rate') ?? 0) <= this.sloConfig.rewardFailureRate
    };

    // 综合健康状态
    const componentStatuses = [decisionHealth.status, circuitHealth.status, rewardHealth.status];
    const overallStatus = componentStatuses.includes('unhealthy')
      ? 'unhealthy'
      : componentStatuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

    return {
      status: overallStatus,
      components: {
        decision: decisionHealth,
        circuit: circuitHealth,
        reward: rewardHealth
      },
      slo,
      checkedAt: new Date()
    };
  }

  /**
   * 评估决策组件健康度
   */
  private evaluateDecisionHealth(metrics: Map<string, number>): ComponentHealth {
    const latencyP95 = metrics.get('amas.decision.latency_p95') ?? 0;
    const latencyP99 = metrics.get('amas.decision.latency_p99') ?? 0;
    const errorRate = metrics.get('amas.error_rate') ?? 0;
    const degradationRate = metrics.get('amas.degradation_rate') ?? 0;

    if (latencyP99 > 500 || errorRate > 0.1) {
      return {
        status: 'unhealthy',
        message: '决策延迟过高或错误率超过关键阈值',
        metrics: { latencyP95, latencyP99, errorRate, degradationRate }
      };
    }

    if (latencyP95 > 150 || errorRate > 0.05 || degradationRate > 0.3) {
      return {
        status: 'degraded',
        message: '决策性能下降或降级率偏高',
        metrics: { latencyP95, latencyP99, errorRate, degradationRate }
      };
    }

    return {
      status: 'healthy',
      message: '决策组件运行正常',
      metrics: { latencyP95, latencyP99, errorRate, degradationRate }
    };
  }

  /**
   * 评估熔断器健康度
   */
  private evaluateCircuitHealth(metrics: Map<string, number>): ComponentHealth {
    const circuitOpenRate = metrics.get('amas.circuit.open_rate') ?? 0;

    if (circuitOpenRate > 0.5) {
      return {
        status: 'unhealthy',
        message: '熔断器频繁打开，服务不稳定',
        metrics: { circuitOpenRate }
      };
    }

    if (circuitOpenRate > 0.3) {
      return {
        status: 'degraded',
        message: '熔断器打开率偏高',
        metrics: { circuitOpenRate }
      };
    }

    return {
      status: 'healthy',
      message: '熔断器运行正常',
      metrics: { circuitOpenRate }
    };
  }

  /**
   * 评估延迟奖励健康度
   */
  private evaluateRewardHealth(metrics: Map<string, number>): ComponentHealth {
    const rewardFailureRate = metrics.get('amas.reward.failure_rate') ?? 0;

    if (rewardFailureRate > 0.2) {
      return {
        status: 'unhealthy',
        message: '延迟奖励失败率过高',
        metrics: { rewardFailureRate }
      };
    }

    if (rewardFailureRate > 0.1) {
      return {
        status: 'degraded',
        message: '延迟奖励失败率偏高',
        metrics: { rewardFailureRate }
      };
    }

    return {
      status: 'healthy',
      message: '延迟奖励运行正常',
      metrics: { rewardFailureRate }
    };
  }

  /**
   * 计算统计值
   */
  private calculateStats(values: number[]): MetricStats {
    if (values.length === 0) {
      return {
        name: '',
        count: 0,
        mean: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        stdDev: 0
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const variance =
      sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      name: '',
      count,
      mean,
      p50: sorted[Math.floor(count * 0.5)] || 0,
      p95: sorted[Math.floor(count * 0.95)] || 0,
      p99: sorted[Math.floor(count * 0.99)] || 0,
      min: sorted[0],
      max: sorted[count - 1],
      stdDev
    };
  }

  /**
   * 重置计数器
   */
  reset(): void {
    this.decisionLatencies = [];
    this.errorCounts = 0;
    this.successCounts = 0;
    this.degradationCounts = 0;
    this.timeoutCounts = 0;
    this.circuitOpenCounts = 0;
    this.circuitCheckCounts = 0;
    this.rewardSuccessCounts = 0;
    this.rewardFailureCounts = 0;
  }
}

/**
 * 创建默认指标采集器
 */
export function createDefaultMetricsCollector(): MetricsCollector {
  return new MetricsCollector(DEFAULT_SLO, 60000); // 每分钟采集一次
}
