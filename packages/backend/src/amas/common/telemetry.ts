/**
 * Telemetry - 遥测/埋点接口
 * 用于监控和告警
 */

import { amasLogger } from '../../logger';

/**
 * 遥测事件类型
 */
export type TelemetryEvent =
  | 'amas.circuit.event'
  | 'amas.circuit.transition'
  | 'amas.degradation'
  | 'amas.timeout'
  | 'amas.decision.latency'
  | 'amas.model.update.latency'
  | 'amas.exception';

/**
 * 遥测接口
 */
export interface Telemetry {
  /** 记录事件 */
  record(event: TelemetryEvent, data: Record<string, any>): void;
  /** 增加计数器 */
  increment(event: TelemetryEvent, labels?: Record<string, string>): void;
  /** 记录直方图/分布 */
  histogram(event: TelemetryEvent, value: number, labels?: Record<string, string>): void;
}

/**
 * 控制台遥测实现(用于开发和调试)
 */
class ConsoleTelemetry implements Telemetry {
  record(event: TelemetryEvent, data: Record<string, any>): void {
    amasLogger.debug({ event, ...data }, '[Telemetry] record');
  }

  increment(event: TelemetryEvent, labels?: Record<string, string>): void {
    amasLogger.debug({ event, labels }, '[Telemetry] increment');
  }

  histogram(event: TelemetryEvent, value: number, labels?: Record<string, string>): void {
    amasLogger.debug({ event, value, labels }, '[Telemetry] histogram');
  }
}

/**
 * 空遥测实现(用于生产环境,避免性能开销)
 */
class NoOpTelemetry implements Telemetry {
  record(): void {}
  increment(): void {}
  histogram(): void {}
}

/**
 * 聚合遥测实现(用于生产监控)
 * 可扩展对接Prometheus、Datadog等监控系统
 */
class AggregateTelemetry implements Telemetry {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  record(event: TelemetryEvent, data: Record<string, any>): void {
    // 可扩展:发送到外部监控系统
    amasLogger.debug({ event, ...data }, '[Telemetry] record');
  }

  increment(event: TelemetryEvent, labels?: Record<string, string>): void {
    const key = this.makeKey(event, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + 1);
  }

  histogram(event: TelemetryEvent, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(event, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);

    // 限制历史数据大小
    if (values.length > 1000) {
      values.shift();
    }
  }

  /**
   * 获取计数器值
   */
  getCounter(event: TelemetryEvent, labels?: Record<string, string>): number {
    const key = this.makeKey(event, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * 获取直方图统计
   */
  getHistogramStats(
    event: TelemetryEvent,
    labels?: Record<string, string>
  ): { count: number; mean: number; p95: number; p99: number } | null {
    const key = this.makeKey(event, labels);
    const values = this.histograms.get(key);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    return {
      count,
      mean,
      p95: sorted[p95Index] ?? sorted[count - 1],
      p99: sorted[p99Index] ?? sorted[count - 1]
    };
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }

  private makeKey(event: string, labels?: Record<string, string>): string {
    if (!labels) return event;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${event}{${labelStr}}`;
  }
}

/**
 * 全局遥测实例
 * 根据环境变量选择实现
 */
const createTelemetry = (): Telemetry => {
  const env = process.env.NODE_ENV;
  const telemetryMode = process.env.AMAS_TELEMETRY_MODE;

  if (telemetryMode === 'none' || telemetryMode === 'noop') {
    return new NoOpTelemetry();
  }

  if (env === 'production' || telemetryMode === 'aggregate') {
    return new AggregateTelemetry();
  }

  return new ConsoleTelemetry();
};

export const telemetry = createTelemetry();

/**
 * 用于测试的遥测实例
 */
export function createTestTelemetry(): AggregateTelemetry {
  return new AggregateTelemetry();
}
