/**
 * AMAS Metrics Service
 * 延迟奖励系统监控指标服务
 *
 * 提供轻量级的指标收集，支持后续升级到Prometheus
 */

import prisma from '../config/database';

// ==================== 指标类型定义 ====================

interface CounterMetric {
  name: string;
  help: string;
  values: Map<string, number>;
}

interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}

interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  values: number[];
  sum: number;
  count: number;
}

// ==================== 指标存储 ====================

const counters = new Map<string, CounterMetric>();
const gauges = new Map<string, GaugeMetric>();
const histograms = new Map<string, HistogramMetric>();

// ==================== Counter 操作 ====================

/**
 * 创建或获取Counter指标
 */
function getOrCreateCounter(name: string, help: string): CounterMetric {
  let counter = counters.get(name);
  if (!counter) {
    counter = { name, help, values: new Map() };
    counters.set(name, counter);
  }
  return counter;
}

/**
 * Counter递增
 */
export function incCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
  const counter = counters.get(name);
  if (!counter) return;

  const labelKey = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');

  const current = counter.values.get(labelKey) ?? 0;
  counter.values.set(labelKey, current + value);
}

// ==================== Gauge 操作 ====================

/**
 * 创建或获取Gauge指标
 */
function getOrCreateGauge(name: string, help: string): GaugeMetric {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = { name, help, value: 0 };
    gauges.set(name, gauge);
  }
  return gauge;
}

/**
 * 设置Gauge值
 */
export function setGauge(name: string, value: number): void {
  const gauge = gauges.get(name);
  if (gauge) {
    gauge.value = value;
  }
}

/**
 * Gauge递增
 */
export function incGauge(name: string, value = 1): void {
  const gauge = gauges.get(name);
  if (gauge) {
    gauge.value += value;
  }
}

/**
 * Gauge递减
 */
export function decGauge(name: string, value = 1): void {
  const gauge = gauges.get(name);
  if (gauge) {
    gauge.value -= value;
  }
}

// ==================== Histogram 操作 ====================

/**
 * 创建或获取Histogram指标
 */
function getOrCreateHistogram(
  name: string,
  help: string,
  buckets: number[]
): HistogramMetric {
  let histogram = histograms.get(name);
  if (!histogram) {
    histogram = {
      name,
      help,
      buckets: [...buckets].sort((a, b) => a - b),
      values: new Array(buckets.length).fill(0),
      sum: 0,
      count: 0
    };
    histograms.set(name, histogram);
  }
  return histogram;
}

/**
 * 记录Histogram观测值
 */
export function observeHistogram(name: string, value: number): void {
  const histogram = histograms.get(name);
  if (!histogram) return;

  histogram.sum += value;
  histogram.count += 1;

  // 更新桶计数
  for (let i = 0; i < histogram.buckets.length; i++) {
    if (value <= histogram.buckets[i]) {
      histogram.values[i] += 1;
    }
  }
}

// ==================== AMAS 指标定义 ====================

// 延迟奖励队列长度
getOrCreateGauge('amas_reward_queue_length', '当前延迟奖励队列中待处理任务数');

// 奖励处理计数（按状态分组）
getOrCreateCounter('amas_reward_processed_total', '延迟奖励处理总次数');

// FeatureVector持久化计数（按状态分组）
getOrCreateCounter('amas_feature_vector_saved_total', 'FeatureVector持久化总次数');

// Worker处理耗时
getOrCreateHistogram(
  'amas_reward_processing_duration_seconds',
  '延迟奖励处理耗时（秒）',
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

// 学习队列调整耗时
getOrCreateHistogram(
  'queue_adjustment_duration_seconds',
  '学习队列动态调整耗时（秒）',
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
);

// 难度计算耗时
getOrCreateHistogram(
  'difficulty_computation_time_seconds',
  '单词难度批量计算耗时（秒）',
  [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]
);

// ==================== 便捷函数 ====================

/**
 * 记录奖励处理结果
 */
export function recordRewardProcessed(status: 'success' | 'failure'): void {
  incCounter('amas_reward_processed_total', { status });
}

/**
 * 记录FeatureVector持久化结果
 */
export function recordFeatureVectorSaved(status: 'success' | 'failure'): void {
  incCounter('amas_feature_vector_saved_total', { status });
}

/**
 * 更新奖励队列长度
 */
export function updateRewardQueueLength(length: number): void {
  setGauge('amas_reward_queue_length', length);
}

/**
 * 记录奖励处理耗时
 */
export function recordRewardProcessingDuration(durationSeconds: number): void {
  observeHistogram('amas_reward_processing_duration_seconds', durationSeconds);
}

/**
 * 记录队列调整耗时
 */
export function recordQueueAdjustmentDuration(durationSeconds: number): void {
  observeHistogram('queue_adjustment_duration_seconds', durationSeconds);
}

/**
 * 记录难度计算耗时
 */
export function recordDifficultyComputationTime(durationSeconds: number): void {
  observeHistogram('difficulty_computation_time_seconds', durationSeconds);
}

// ==================== 指标导出 ====================

/**
 * 获取所有指标的JSON格式
 */
export function getMetricsJson(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 导出Counters
  counters.forEach((counter) => {
    const values: Record<string, number> = {};
    counter.values.forEach((v, k) => {
      values[k || 'total'] = v;
    });
    result[counter.name] = {
      type: 'counter',
      help: counter.help,
      values
    };
  });

  // 导出Gauges
  gauges.forEach((gauge) => {
    result[gauge.name] = {
      type: 'gauge',
      help: gauge.help,
      value: gauge.value
    };
  });

  // 导出Histograms
  histograms.forEach((histogram) => {
    const bucketValues: Record<string, number> = {};
    histogram.buckets.forEach((bucket, i) => {
      bucketValues[`le_${bucket}`] = histogram.values[i];
    });
    result[histogram.name] = {
      type: 'histogram',
      help: histogram.help,
      buckets: bucketValues,
      sum: histogram.sum,
      count: histogram.count
    };
  });

  return result;
}

/**
 * 获取Prometheus格式的指标文本
 */
export function getMetricsPrometheus(): string {
  const lines: string[] = [];

  // 导出Counters
  counters.forEach((counter) => {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    counter.values.forEach((v, labels) => {
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`${counter.name}${labelStr} ${v}`);
    });
  });

  // 导出Gauges
  gauges.forEach((gauge) => {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    lines.push(`${gauge.name} ${gauge.value}`);
  });

  // 导出Histograms
  histograms.forEach((histogram) => {
    lines.push(`# HELP ${histogram.name} ${histogram.help}`);
    lines.push(`# TYPE ${histogram.name} histogram`);
    let cumulative = 0;
    histogram.buckets.forEach((bucket, i) => {
      cumulative += histogram.values[i];
      lines.push(`${histogram.name}_bucket{le="${bucket}"} ${cumulative}`);
    });
    lines.push(`${histogram.name}_bucket{le="+Inf"} ${histogram.count}`);
    lines.push(`${histogram.name}_sum ${histogram.sum}`);
    lines.push(`${histogram.name}_count ${histogram.count}`);
  });

  return lines.join('\n');
}

/**
 * 重置所有指标（用于测试）
 */
export function resetAllMetrics(): void {
  counters.forEach((counter) => counter.values.clear());
  gauges.forEach((gauge) => (gauge.value = 0));
  histograms.forEach((histogram) => {
    histogram.values.fill(0);
    histogram.sum = 0;
    histogram.count = 0;
  });
}

// ==================== 测试兼容方法 ====================

/**
 * 记录指标（通用方法，用于测试兼容）
 */
export function recordMetric(name: string, value: number, timestamp?: Date): void {
  setGauge(name, value);
}

/**
 * 获取指标数据（用于测试兼容）
 */
export function getMetrics(name: string, range?: { start: Date; end: Date }): Array<{ timestamp: Date; value: number }> {
  const gauge = gauges.get(name);
  if (gauge) {
    return [{ timestamp: new Date(), value: gauge.value }];
  }
  return [];
}

/**
 * 获取聚合指标（用于测试兼容）
 */
export function getAggregatedMetrics(name: string): { avg: number; min: number; max: number; count: number } {
  const gauge = gauges.get(name);
  const value = gauge ? gauge.value : 0;
  return {
    avg: value,
    min: value,
    max: value,
    count: gauge ? 1 : 0,
  };
}

// 为面向Prisma的服务准备的别名
const legacyRecordMetric = recordMetric;
const legacyGetMetrics = getMetrics;
const legacyGetAggregatedMetrics = getAggregatedMetrics;

export class MetricsService {
  /**
   * 记录指标（优先使用数据库，回退到内存指标）
   */
  async recordMetric(name: string, value: number, timestamp: Date = new Date()) {
    const prismaAny = prisma as any;
    if (prismaAny.metric?.create) {
      return prismaAny.metric.create({
        data: { name, value, timestamp }
      });
    }
    legacyRecordMetric(name, value, timestamp);
    return { name, value, timestamp };
  }

  /**
   * 获取指定时间范围的指标
   */
  async getMetrics(
    name: string,
    range?: { start: Date; end: Date }
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    const prismaAny = prisma as any;
    if (prismaAny.metric?.findMany) {
      const records = await prismaAny.metric.findMany({
        where: {
          name,
          ...(range
            ? {
                timestamp: {
                  gte: range.start,
                  lte: range.end
                }
              }
            : {})
        },
        orderBy: { timestamp: 'asc' }
      });
      return records;
    }
    return legacyGetMetrics(name, range);
  }

  /**
   * 获取聚合指标
   */
  async getAggregatedMetrics(name: string): Promise<{
    avg: number;
    min: number;
    max: number;
    count: number;
  }> {
    const prismaAny = prisma as any;
    if (prismaAny.metric?.aggregate) {
      const result = await prismaAny.metric.aggregate({
        where: { name },
        _avg: { value: true },
        _min: { value: true },
        _max: { value: true },
        _count: { value: true },
        _sum: { value: true }
      });
      const count =
        (result as any)._count?.value ??
        (result as any)._count ??
        0;
      return {
        avg: result._avg?.value ?? 0,
        min: result._min?.value ?? 0,
        max: result._max?.value ?? 0,
        count
      };
    }
    return legacyGetAggregatedMetrics(name);
  }
}

export const metricsService = new MetricsService();
export default metricsService;
