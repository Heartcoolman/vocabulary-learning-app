/**
 * AMAS 决策流水线监控指标
 *
 * 提供 Prometheus 格式的监控指标，用于追踪：
 * - 决策记录写入性能
 * - 队列状态
 * - 缓存命中率
 * - 流水线阶段耗时
 */

import { alertMonitoringService } from './monitoring-service';

type LabelValue = string | Record<string, string | number>;

function serializeLabel(label?: LabelValue): string | undefined {
  if (!label) return undefined;
  if (typeof label === 'string') return encodeURIComponent(label);

  const entries = Object.entries(label)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}:${encodeURIComponent(String(v))}`);

  return entries.length > 0 ? entries.join('|') : undefined;
}

function parseLabel(key: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of key.split('|')) {
    const [k, ...rest] = part.split(':');
    if (k) {
      const value = rest.join(':');
      result[decodeURIComponent(k)] = decodeURIComponent(value);
    }
  }
  return result;
}

function formatPrometheusLabel(labels: Record<string, string | number>): string {
  const parts = Object.entries(labels)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const escaped = String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
      return `${k}="${escaped}"`;
    });
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

// ==================== 简单计数器实现 ====================

class Counter {
  private value = 0;
  private labels: Map<string, number> = new Map();

  inc(labelValue?: LabelValue, amount = 1): void {
    this.value += amount;
    const key = serializeLabel(labelValue);
    if (key) {
      const current = this.labels.get(key) || 0;
      this.labels.set(key, current + amount);
    }
  }

  get(labelValue?: LabelValue): number {
    const key = serializeLabel(labelValue);
    if (key) return this.labels.get(key) || 0;
    return this.value;
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = { _total: this.value };
    for (const [key, val] of this.labels) {
      result[key] = val;
    }
    return result;
  }

  entries(): [string, number][] {
    return Array.from(this.labels.entries());
  }

  reset(): void {
    this.value = 0;
    this.labels.clear();
  }
}

class Gauge {
  private value = 0;

  set(value: number): void {
    this.value = value;
  }

  inc(amount = 1): void {
    this.value += amount;
  }

  dec(amount = 1): void {
    this.value -= amount;
  }

  get(): number {
    return this.value;
  }
}

/**
 * Bucket-based histogram for Prometheus-compatible metrics.
 *
 * Advantages over sliding-window:
 * - Bounded memory (no sample storage)
 * - O(1) observe operation
 * - sum/count always consistent
 * - Standard Prometheus format
 *
 * Usage:
 * - HTTP latency (seconds): [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, +Inf]
 * - DB query (milliseconds): [10, 50, 100, 200, 500, 1000, 2000, 5000, +Inf]
 */
class BucketHistogram {
  private buckets: number[];
  private counts: number[];
  private sum = 0;
  private count = 0;

  constructor(buckets: number[]) {
    // Ensure buckets are sorted and add +Inf
    this.buckets = [...buckets.sort((a, b) => a - b), Infinity];
    this.counts = new Array(this.buckets.length).fill(0);
  }

  observe(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;

    this.sum += value;
    this.count += 1;

    // Increment bucket count (le = less than or equal)
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i] += 1;
      }
    }
  }

  /**
   * Get approximate quantiles from bucket distribution.
   * Uses linear interpolation within buckets.
   */
  getStats(): { avg: number; p50: number; p95: number; p99: number; count: number } {
    if (this.count === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0, count: 0 };
    }

    const avg = this.sum / this.count;
    const p50 = this.quantile(0.5);
    const p95 = this.quantile(0.95);
    const p99 = this.quantile(0.99);

    return { avg, p50, p95, p99, count: this.count };
  }

  /**
   * Calculate quantile using linear interpolation between buckets.
   */
  private quantile(q: number): number {
    const targetCount = this.count * q;
    let cumulative = 0;

    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.counts[i];

      if (cumulative >= targetCount) {
        // Linear interpolation within bucket
        const bucketStart = i > 0 ? this.buckets[i - 1] : 0;
        const bucketEnd = this.buckets[i];

        if (bucketEnd === Infinity) {
          // Extrapolate from previous bucket
          return bucketStart * 2;
        }

        const prevCumulative = cumulative - this.counts[i];
        const fraction = (targetCount - prevCumulative) / this.counts[i];
        return bucketStart + (bucketEnd - bucketStart) * fraction;
      }
    }

    return this.buckets[this.buckets.length - 2] || 0;
  }

  /**
   * Get bucket data for Prometheus export.
   */
  getBuckets(): Array<{ le: number; count: number }> {
    return this.buckets.map((le, i) => ({ le, count: this.counts[i] }));
  }

  getSum(): number {
    return this.sum;
  }

  getCount(): number {
    return this.count;
  }

  reset(): void {
    this.counts.fill(0);
    this.sum = 0;
    this.count = 0;
  }
}

/**
 * Legacy sliding-window histogram (deprecated, kept for compatibility).
 * Use BucketHistogram for new metrics.
 */
class SlidingWindowHistogram {
  private values: number[] = [];
  private sum = 0;
  private count = 0;

  observe(value: number): void {
    this.values.push(value);
    this.sum += value;
    this.count += 1;

    // Fixed: decrement count when evicting to keep sum/count consistent
    if (this.values.length > 1000) {
      const removed = this.values.shift()!;
      this.sum -= removed;
      this.count -= 1; // Day 14 fix: now count matches window size
    }
  }

  getStats(): { avg: number; p50: number; p95: number; p99: number; count: number } {
    if (this.values.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0, count: 0 };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const avg = this.sum / this.values.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { avg, p50, p95, p99, count: this.count };
  }

  reset(): void {
    this.values = [];
    this.sum = 0;
    this.count = 0;
  }
}

// Histogram buckets for different metric types
const HTTP_LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]; // seconds
const DB_QUERY_BUCKETS = [10, 50, 100, 200, 500, 1000, 2000, 5000]; // milliseconds
const DECISION_LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2000, 5000]; // milliseconds
const NATIVE_LATENCY_BUCKETS = [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1]; // seconds

/**
 * Labeled histogram for metrics that need label dimensions.
 * Each unique label combination gets its own BucketHistogram instance.
 */
class LabeledBucketHistogram {
  private buckets: number[];
  private histograms: Map<string, BucketHistogram> = new Map();

  constructor(buckets: number[]) {
    this.buckets = buckets;
  }

  observe(labels: Record<string, string>, value: number): void {
    const key = serializeLabel(labels);
    if (!key) return;

    let histogram = this.histograms.get(key);
    if (!histogram) {
      histogram = new BucketHistogram(this.buckets);
      this.histograms.set(key, histogram);
    }
    histogram.observe(value);
  }

  getHistogram(labels: Record<string, string>): BucketHistogram | undefined {
    const key = serializeLabel(labels);
    return key ? this.histograms.get(key) : undefined;
  }

  entries(): [string, BucketHistogram][] {
    return Array.from(this.histograms.entries());
  }

  reset(): void {
    this.histograms.clear();
  }
}

// ==================== 指标定义 ====================

export const amasMetrics = {
  // 决策记录
  decisionWriteTotal: new Counter(),
  decisionWriteSuccess: new Counter(),
  decisionWriteFailed: new Counter(),
  decisionWriteDuration: new BucketHistogram(DECISION_LATENCY_BUCKETS),

  // 队列状态
  queueSize: new Gauge(),
  queueBackpressureTotal: new Counter(),
  queueBackpressureTimeout: new Counter(),

  // 缓存
  cacheHits: new Counter(),
  cacheMisses: new Counter(),

  // 流水线阶段
  pipelineStageTotal: new Counter(),
  pipelineStageDuration: new BucketHistogram(DECISION_LATENCY_BUCKETS),

  // AMAS 决策质量
  decisionConfidence: new BucketHistogram([0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99]), // confidence score 0-1
  inferenceLatency: new BucketHistogram(DECISION_LATENCY_BUCKETS),
  modelDriftTotal: new Counter(),
  actionTotal: new Counter(),

  // 数据库查询
  dbQueryDuration: new BucketHistogram(DB_QUERY_BUCKETS),
  dbQueryTotal: new Counter(),
  dbSlowQueryTotal: new Counter(),

  // HTTP 请求
  httpRequestTotal: new Counter(),
  httpRequestDuration: new BucketHistogram(HTTP_LATENCY_BUCKETS),
  httpRequestDropped: new Counter(),
  httpRequest5xxTotal: new Counter(), // Dedicated 5xx counter for efficient alert evaluation

  // 错误
  errorTotal: new Counter(),

  // Native 模块调用
  nativeCallsTotal: new Counter(), // labels: method (selectAction/update), status (success/fallback)
  nativeFailuresTotal: new Counter(), // Native 调用失败次数
  nativeDuration: new LabeledBucketHistogram(NATIVE_LATENCY_BUCKETS), // Native 调用延迟 (秒), labels: method (selectAction/update)
  nativeCircuitBreakerState: new Gauge(), // 熔断器状态: 0=closed, 1=open, 2=half-open

  // AMAS模块运行状态追踪
  moduleCallTotal: new Counter(), // labels: module, status (success/skipped/error)
  moduleLastCallTime: new Map<string, number>(), // 模块最后调用时间
  moduleErrorMessages: new Map<string, string>(), // 模块最后错误信息
};

// ==================== 模块状态追踪 ====================

export type ModuleCallStatus = 'success' | 'skipped' | 'error';

/**
 * 记录模块调用状态
 */
export function recordModuleCall(
  module: string,
  status: ModuleCallStatus,
  errorMessage?: string,
): void {
  amasMetrics.moduleCallTotal.inc({ module, status });
  amasMetrics.moduleLastCallTime.set(module, Date.now());
  if (status === 'error' && errorMessage) {
    amasMetrics.moduleErrorMessages.set(module, errorMessage);
  } else if (status === 'success') {
    amasMetrics.moduleErrorMessages.delete(module);
  }
}

/**
 * 获取模块运行状态
 */
export function getModuleStatus(module: string): {
  totalCalls: number;
  successCalls: number;
  skippedCalls: number;
  errorCalls: number;
  lastCallTime: number | null;
  lastError: string | null;
  status: 'healthy' | 'warning' | 'error' | 'disabled' | 'idle';
} {
  const success = amasMetrics.moduleCallTotal.get({ module, status: 'success' });
  const skipped = amasMetrics.moduleCallTotal.get({ module, status: 'skipped' });
  const error = amasMetrics.moduleCallTotal.get({ module, status: 'error' });
  const total = success + skipped + error;
  const lastCallTime = amasMetrics.moduleLastCallTime.get(module) || null;
  const lastError = amasMetrics.moduleErrorMessages.get(module) || null;

  let status: 'healthy' | 'warning' | 'error' | 'disabled' | 'idle' = 'idle';
  if (total === 0) {
    status = 'idle';
  } else if (skipped > 0 && success === 0 && error === 0) {
    status = 'disabled';
  } else if (error > 0) {
    const errorRate = error / total;
    status = errorRate > 0.1 ? 'error' : 'warning';
  } else if (success > 0) {
    status = 'healthy';
  }

  return {
    totalCalls: total,
    successCalls: success,
    skippedCalls: skipped,
    errorCalls: error,
    lastCallTime,
    lastError,
    status,
  };
}

/**
 * 获取所有模块状态
 */
export function getAllModuleStatuses(): Record<string, ReturnType<typeof getModuleStatus>> {
  const modules = new Set<string>();
  for (const [key] of amasMetrics.moduleCallTotal.entries()) {
    const parsed = parseLabel(key);
    if (parsed.module) modules.add(parsed.module);
  }
  const result: Record<string, ReturnType<typeof getModuleStatus>> = {};
  for (const module of modules) {
    result[module] = getModuleStatus(module);
  }
  return result;
}

// ==================== 便捷函数 ====================

/**
 * 记录决策写入成功
 */
export function recordWriteSuccess(durationMs: number): void {
  amasMetrics.decisionWriteTotal.inc();
  amasMetrics.decisionWriteSuccess.inc();
  amasMetrics.decisionWriteDuration.observe(durationMs);
}

/**
 * 记录决策写入失败
 */
export function recordWriteFailure(error?: string): void {
  amasMetrics.decisionWriteTotal.inc();
  amasMetrics.decisionWriteFailed.inc();
  if (error) {
    amasMetrics.errorTotal.inc(error);
  }
}

/**
 * 更新队列大小
 */
export function updateQueueSize(size: number): void {
  amasMetrics.queueSize.set(size);
}

/**
 * 记录队列回压
 */
export function recordBackpressure(): void {
  amasMetrics.queueBackpressureTotal.inc();
}

/**
 * 记录队列回压超时（数据可能丢失）
 */
export function recordBackpressureTimeout(): void {
  amasMetrics.queueBackpressureTimeout.inc();
  amasMetrics.errorTotal.inc('backpressure_timeout');
}

/**
 * 记录缓存命中
 */
export function recordCacheHit(cacheKey?: string): void {
  amasMetrics.cacheHits.inc(cacheKey);
}

/**
 * 记录缓存未命中
 */
export function recordCacheMiss(cacheKey?: string): void {
  amasMetrics.cacheMisses.inc(cacheKey);
}

/**
 * 记录流水线阶段
 */
export function recordPipelineStage(stageName: string, durationMs: number): void {
  amasMetrics.pipelineStageTotal.inc(stageName);
  amasMetrics.pipelineStageDuration.observe(durationMs);
}

export function recordDecisionConfidence(confidence: number): void {
  if (!Number.isFinite(confidence)) return;
  amasMetrics.decisionConfidence.observe(confidence);
}

export function recordInferenceLatencyMs(latencyMs: number): void {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  amasMetrics.inferenceLatency.observe(latencyMs);
}

export function recordModelDrift(label?: LabelValue): void {
  amasMetrics.modelDriftTotal.inc(label);
}

export function recordActionSelection(labels: Record<string, string | number>): void {
  amasMetrics.actionTotal.inc(labels);
}

export interface DbQueryMetric {
  model?: string;
  action?: string;
  durationMs: number;
  slow?: boolean;
}

export function recordDbQuery(metric: DbQueryMetric): void {
  if (!Number.isFinite(metric.durationMs) || metric.durationMs < 0) return;
  const model =
    metric.model && metric.model.length > 48
      ? metric.model.substring(0, 48)
      : metric.model || 'unknown';
  const action =
    metric.action && metric.action.length > 48
      ? metric.action.substring(0, 48)
      : metric.action || 'unknown';

  amasMetrics.dbQueryTotal.inc({ model, action });
  amasMetrics.dbQueryDuration.observe(metric.durationMs);
  if (metric.slow) {
    amasMetrics.dbSlowQueryTotal.inc({ model });
  }
}

export interface HttpRequestMetric {
  route: string;
  method: string;
  status: number;
  durationSeconds: number;
}

export function recordHttpRequest(metric: HttpRequestMetric): void {
  const labels = {
    route: metric.route,
    method: metric.method.toUpperCase(),
    status: metric.status,
  };
  amasMetrics.httpRequestTotal.inc(labels);
  amasMetrics.httpRequestDuration.observe(metric.durationSeconds);

  // Track 5xx errors separately for efficient alert evaluation (avoids per-tick label scan)
  if (metric.status >= 500 && metric.status < 600) {
    amasMetrics.httpRequest5xxTotal.inc();
  }
}

export function recordHttpDrop(reason = 'unknown'): void {
  amasMetrics.httpRequestDropped.inc({ reason });
}

// ==================== Native 模块指标 ====================

export type NativeMethod = 'selectAction' | 'update';
export type NativeStatus = 'success' | 'fallback';

/**
 * 记录 Native 模块调用
 * @param method - 调用的方法 (selectAction/update)
 * @param status - 调用状态 (success/fallback)
 */
export function recordNativeCall(method: NativeMethod, status: NativeStatus): void {
  amasMetrics.nativeCallsTotal.inc({ method, status });
}

/**
 * 记录 Native 模块调用失败
 */
export function recordNativeFailure(): void {
  amasMetrics.nativeFailuresTotal.inc();
}

/**
 * 记录 Native 模块调用延迟
 * @param method - 调用的方法 (selectAction/update)
 * @param durationMs - 调用耗时（毫秒）
 */
export function recordNativeDuration(method: NativeMethod, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  amasMetrics.nativeDuration.observe({ method }, durationMs);
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * 更新熔断器状态
 * @param state - 熔断器状态 (closed/open/half-open)
 */
export function updateCircuitBreakerState(state: CircuitBreakerState): void {
  const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
  amasMetrics.nativeCircuitBreakerState.set(stateValue);
}

// 别名，保持向后兼容
export const updateNativeCircuitBreakerState = updateCircuitBreakerState;

// ==================== 指标导出 ====================

/**
 * 获取所有指标（用于 /metrics 端点）
 */
export function getAllMetrics(): Record<string, unknown> {
  const writeStats = amasMetrics.decisionWriteDuration.getStats();
  const stageStats = amasMetrics.pipelineStageDuration.getStats();
  const httpStats = amasMetrics.httpRequestDuration.getStats();
  const confidenceStats = amasMetrics.decisionConfidence.getStats();
  const inferenceStats = amasMetrics.inferenceLatency.getStats();
  const dbStats = amasMetrics.dbQueryDuration.getStats();

  const cacheHits = amasMetrics.cacheHits.get();
  const cacheMisses = amasMetrics.cacheMisses.get();
  const cacheHitRate = cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0;

  return {
    decision: {
      writeTotal: amasMetrics.decisionWriteTotal.get(),
      writeSuccess: amasMetrics.decisionWriteSuccess.get(),
      writeFailed: amasMetrics.decisionWriteFailed.get(),
      writeDuration: writeStats,
    },
    queue: {
      currentSize: amasMetrics.queueSize.get(),
      backpressureTotal: amasMetrics.queueBackpressureTotal.get(),
      backpressureTimeout: amasMetrics.queueBackpressureTimeout.get(),
    },
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: Math.round(cacheHitRate * 1000) / 1000,
    },
    pipeline: {
      stageTotal: amasMetrics.pipelineStageTotal.getAll(),
      stageDuration: stageStats,
    },
    amasDecision: {
      confidence: confidenceStats,
      inferenceLatencyMs: inferenceStats,
      modelDrift: amasMetrics.modelDriftTotal.getAll(),
      actionDistribution: Object.fromEntries(
        amasMetrics.actionTotal.entries().map(([key, count]) => {
          const labels = parseLabel(key);
          const readable = `D${labels.difficulty}|B${labels.batch_size}|H${labels.hint_level}|I${labels.interval_scale}|N${labels.new_ratio}`;
          return [readable, count];
        }),
      ),
    },
    db: {
      durationMs: dbStats,
      total: amasMetrics.dbQueryTotal.getAll(),
      slow: amasMetrics.dbSlowQueryTotal.getAll(),
    },
    http: {
      total: amasMetrics.httpRequestTotal.get(),
      duration: httpStats,
      dropped: amasMetrics.httpRequestDropped.getAll(),
      byRoute: Object.fromEntries(
        amasMetrics.httpRequestTotal.entries().map(([key, count]) => {
          const labels = parseLabel(key);
          const readable = `${labels.route || 'unknown'} ${labels.method || 'UNKNOWN'} ${labels.status || '0'}`;
          return [readable, count];
        }),
      ),
    },
    errors: amasMetrics.errorTotal.getAll(),
  };
}

/**
 * 导出 Prometheus 格式的指标
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = [];

  // 决策写入
  lines.push('# HELP amas_decision_write_total Total decision write attempts');
  lines.push('# TYPE amas_decision_write_total counter');
  lines.push(`amas_decision_write_total ${amasMetrics.decisionWriteTotal.get()}`);

  lines.push('# HELP amas_decision_write_success_total Successful decision writes');
  lines.push('# TYPE amas_decision_write_success_total counter');
  lines.push(`amas_decision_write_success_total ${amasMetrics.decisionWriteSuccess.get()}`);

  lines.push('# HELP amas_decision_write_failed_total Failed decision writes');
  lines.push('# TYPE amas_decision_write_failed_total counter');
  lines.push(`amas_decision_write_failed_total ${amasMetrics.decisionWriteFailed.get()}`);

  // 队列
  lines.push('# HELP amas_queue_size Current queue size');
  lines.push('# TYPE amas_queue_size gauge');
  lines.push(`amas_queue_size ${amasMetrics.queueSize.get()}`);

  lines.push('# HELP amas_queue_backpressure_total Queue backpressure events');
  lines.push('# TYPE amas_queue_backpressure_total counter');
  lines.push(`amas_queue_backpressure_total ${amasMetrics.queueBackpressureTotal.get()}`);

  lines.push(
    '# HELP amas_queue_backpressure_timeout_total Queue backpressure timeout events (data loss)',
  );
  lines.push('# TYPE amas_queue_backpressure_timeout_total counter');
  lines.push(`amas_queue_backpressure_timeout_total ${amasMetrics.queueBackpressureTimeout.get()}`);

  // 缓存
  lines.push('# HELP amas_cache_hits_total Cache hits');
  lines.push('# TYPE amas_cache_hits_total counter');
  lines.push(`amas_cache_hits_total ${amasMetrics.cacheHits.get()}`);

  lines.push('# HELP amas_cache_misses_total Cache misses');
  lines.push('# TYPE amas_cache_misses_total counter');
  lines.push(`amas_cache_misses_total ${amasMetrics.cacheMisses.get()}`);

  // 写入延迟
  const writeStats = amasMetrics.decisionWriteDuration.getStats();
  lines.push('# HELP amas_decision_write_duration_ms Decision write duration');
  lines.push('# TYPE amas_decision_write_duration_ms summary');
  lines.push(`amas_decision_write_duration_ms{quantile="0.5"} ${writeStats.p50}`);
  lines.push(`amas_decision_write_duration_ms{quantile="0.95"} ${writeStats.p95}`);
  lines.push(`amas_decision_write_duration_ms{quantile="0.99"} ${writeStats.p99}`);
  lines.push(`amas_decision_write_duration_ms_sum ${writeStats.avg * writeStats.count}`);
  lines.push(`amas_decision_write_duration_ms_count ${writeStats.count}`);

  // AMAS 决策置信度
  const confidenceStats = amasMetrics.decisionConfidence.getStats();
  lines.push('# HELP amas_decision_confidence LinUCB UCB confidence');
  lines.push('# TYPE amas_decision_confidence summary');
  lines.push(`amas_decision_confidence{quantile="0.5"} ${confidenceStats.p50}`);
  lines.push(`amas_decision_confidence{quantile="0.95"} ${confidenceStats.p95}`);
  lines.push(`amas_decision_confidence{quantile="0.99"} ${confidenceStats.p99}`);
  lines.push(`amas_decision_confidence_sum ${confidenceStats.avg * confidenceStats.count}`);
  lines.push(`amas_decision_confidence_count ${confidenceStats.count}`);

  // AMAS 推理延迟
  const inferenceStats = amasMetrics.inferenceLatency.getStats();
  lines.push('# HELP amas_inference_latency_ms Inference latency (learning layer)');
  lines.push('# TYPE amas_inference_latency_ms summary');
  lines.push(`amas_inference_latency_ms{quantile="0.5"} ${inferenceStats.p50}`);
  lines.push(`amas_inference_latency_ms{quantile="0.95"} ${inferenceStats.p95}`);
  lines.push(`amas_inference_latency_ms{quantile="0.99"} ${inferenceStats.p99}`);
  lines.push(`amas_inference_latency_ms_sum ${inferenceStats.avg * inferenceStats.count}`);
  lines.push(`amas_inference_latency_ms_count ${inferenceStats.count}`);

  // AMAS 模型漂移
  lines.push('# HELP amas_model_drift_total Model drift or parameter change events');
  lines.push('# TYPE amas_model_drift_total counter');
  lines.push(`amas_model_drift_total ${amasMetrics.modelDriftTotal.get()}`);
  for (const [labelKey, count] of amasMetrics.modelDriftTotal.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`amas_model_drift_total${labels} ${count}`);
  }

  // AMAS 动作分布
  lines.push('# HELP amas_action_total Action selection distribution');
  lines.push('# TYPE amas_action_total counter');
  lines.push(`amas_action_total ${amasMetrics.actionTotal.get()}`);
  for (const [labelKey, count] of amasMetrics.actionTotal.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`amas_action_total${labels} ${count}`);
  }

  // 数据库查询延迟
  const dbStats = amasMetrics.dbQueryDuration.getStats();
  lines.push('# HELP amas_db_query_duration_ms Database query duration');
  lines.push('# TYPE amas_db_query_duration_ms summary');
  lines.push(`amas_db_query_duration_ms{quantile="0.5"} ${dbStats.p50}`);
  lines.push(`amas_db_query_duration_ms{quantile="0.95"} ${dbStats.p95}`);
  lines.push(`amas_db_query_duration_ms{quantile="0.99"} ${dbStats.p99}`);
  lines.push(`amas_db_query_duration_ms_sum ${dbStats.avg * dbStats.count}`);
  lines.push(`amas_db_query_duration_ms_count ${dbStats.count}`);

  // 数据库查询计数
  lines.push('# HELP amas_db_query_total Database query count');
  lines.push('# TYPE amas_db_query_total counter');
  lines.push(`amas_db_query_total ${amasMetrics.dbQueryTotal.get()}`);
  for (const [labelKey, count] of amasMetrics.dbQueryTotal.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`amas_db_query_total${labels} ${count}`);
  }

  // 慢查询
  lines.push('# HELP amas_db_slow_query_total Slow database queries (>200ms)');
  lines.push('# TYPE amas_db_slow_query_total counter');
  lines.push(`amas_db_slow_query_total ${amasMetrics.dbSlowQueryTotal.get()}`);
  for (const [labelKey, count] of amasMetrics.dbSlowQueryTotal.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`amas_db_slow_query_total${labels} ${count}`);
  }

  // HTTP 请求计数
  lines.push('# HELP http_request_total Total HTTP requests (sampled by route)');
  lines.push('# TYPE http_request_total counter');
  lines.push(`http_request_total ${amasMetrics.httpRequestTotal.get()}`);
  for (const [labelKey, count] of amasMetrics.httpRequestTotal.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`http_request_total${labels} ${count}`);
  }

  // HTTP 请求延迟
  const httpStats = amasMetrics.httpRequestDuration.getStats();
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds (sampled)');
  lines.push('# TYPE http_request_duration_seconds summary');
  lines.push(`http_request_duration_seconds{quantile="0.5"} ${httpStats.p50}`);
  lines.push(`http_request_duration_seconds{quantile="0.95"} ${httpStats.p95}`);
  lines.push(`http_request_duration_seconds{quantile="0.99"} ${httpStats.p99}`);
  lines.push(`http_request_duration_seconds_sum ${httpStats.avg * httpStats.count}`);
  lines.push(`http_request_duration_seconds_count ${httpStats.count}`);

  // HTTP 指标丢弃
  lines.push('# HELP http_request_dropped_total Dropped HTTP metric events (sampling/queue)');
  lines.push('# TYPE http_request_dropped_total counter');
  lines.push(`http_request_dropped_total ${amasMetrics.httpRequestDropped.get()}`);
  for (const [labelKey, count] of amasMetrics.httpRequestDropped.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`http_request_dropped_total${labels} ${count}`);
  }

  // Native 模块调用
  lines.push('# HELP amas_native_calls_total Native module call count');
  lines.push('# TYPE amas_native_calls_total counter');
  lines.push(`amas_native_calls_total ${amasMetrics.nativeCallsTotal.get()}`);
  for (const [labelKey, count] of amasMetrics.nativeCallsTotal.entries()) {
    const labels = formatPrometheusLabel(parseLabel(labelKey));
    lines.push(`amas_native_calls_total${labels} ${count}`);
  }

  // Native 模块调用失败
  lines.push('# HELP amas_native_failures_total Native module call failures');
  lines.push('# TYPE amas_native_failures_total counter');
  lines.push(`amas_native_failures_total ${amasMetrics.nativeFailuresTotal.get()}`);

  // Native 模块调用延迟 (带标签的直方图)
  lines.push('# HELP amas_native_duration_seconds Native module call duration in seconds');
  lines.push('# TYPE amas_native_duration_seconds histogram');
  for (const [labelKey, histogram] of amasMetrics.nativeDuration.entries()) {
    const labels = parseLabel(labelKey);
    const methodLabel = labels.method || 'unknown';
    // 输出每个 bucket
    for (const bucket of histogram.getBuckets()) {
      const leStr = bucket.le === Infinity ? '+Inf' : bucket.le.toString();
      lines.push(
        `amas_native_duration_seconds_bucket{method="${methodLabel}",le="${leStr}"} ${bucket.count}`,
      );
    }
    // 输出 sum 和 count
    lines.push(`amas_native_duration_seconds_sum{method="${methodLabel}"} ${histogram.getSum()}`);
    lines.push(
      `amas_native_duration_seconds_count{method="${methodLabel}"} ${histogram.getCount()}`,
    );
  }

  // 熔断器状态
  lines.push(
    '# HELP amas_native_circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half-open)',
  );
  lines.push('# TYPE amas_native_circuit_breaker_state gauge');
  lines.push(`amas_native_circuit_breaker_state ${amasMetrics.nativeCircuitBreakerState.get()}`);

  return lines.join('\n');
}

/**
 * 收集关键指标快照，供管理端 API 使用
 */
export function collectMonitoringSnapshot() {
  const httpStats = amasMetrics.httpRequestDuration.getStats();
  const activeAlerts = alertMonitoringService.getActiveAlerts();

  return {
    timestamp: Date.now(),
    http: {
      totalRequests: amasMetrics.httpRequestTotal.get(),
      errorRequests5xx: amasMetrics.httpRequest5xxTotal.get(),
      requestDuration: {
        avg: httpStats.avg,
        p50: httpStats.p50,
        p95: httpStats.p95,
        p99: httpStats.p99,
        count: httpStats.count,
      },
    },
    alerts: activeAlerts,
  };
}

/**
 * 重置所有指标（用于测试）
 */
export function resetAllMetrics(): void {
  amasMetrics.decisionWriteTotal.reset();
  amasMetrics.decisionWriteSuccess.reset();
  amasMetrics.decisionWriteFailed.reset();
  amasMetrics.decisionWriteDuration.reset();
  amasMetrics.queueSize.set(0);
  amasMetrics.queueBackpressureTotal.reset();
  amasMetrics.queueBackpressureTimeout.reset();
  amasMetrics.cacheHits.reset();
  amasMetrics.cacheMisses.reset();
  amasMetrics.pipelineStageTotal.reset();
  amasMetrics.pipelineStageDuration.reset();
  amasMetrics.decisionConfidence.reset();
  amasMetrics.inferenceLatency.reset();
  amasMetrics.modelDriftTotal.reset();
  amasMetrics.actionTotal.reset();
  amasMetrics.dbQueryDuration.reset();
  amasMetrics.dbQueryTotal.reset();
  amasMetrics.dbSlowQueryTotal.reset();
  amasMetrics.httpRequestTotal.reset();
  amasMetrics.httpRequestDuration.reset();
  amasMetrics.httpRequestDropped.reset();
  amasMetrics.errorTotal.reset();
  amasMetrics.nativeCallsTotal.reset();
  amasMetrics.nativeFailuresTotal.reset();
  amasMetrics.nativeDuration.reset();
  amasMetrics.nativeCircuitBreakerState.set(0);
}
