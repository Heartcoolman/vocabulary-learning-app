/**
 * AMAS 决策流水线监控指标
 *
 * 提供 Prometheus 格式的监控指标，用于追踪：
 * - 决策记录写入性能
 * - 队列状态
 * - 缓存命中率
 * - 流水线阶段耗时
 */

// ==================== 简单计数器实现 ====================

class Counter {
  private value = 0;
  private labels: Map<string, number> = new Map();

  inc(labelValue?: string, amount = 1): void {
    // 无论是否有标签，都累加到 _total
    this.value += amount;
    if (labelValue) {
      const current = this.labels.get(labelValue) || 0;
      this.labels.set(labelValue, current + amount);
    }
  }

  get(labelValue?: string): number {
    if (labelValue) {
      return this.labels.get(labelValue) || 0;
    }
    return this.value;
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = { _total: this.value };
    for (const [key, val] of this.labels) {
      result[key] = val;
    }
    return result;
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

class Histogram {
  private values: number[] = [];
  private sum = 0;
  private count = 0;

  observe(value: number): void {
    this.values.push(value);
    this.sum += value;
    this.count += 1;

    // 保持最近 1000 个值
    if (this.values.length > 1000) {
      const removed = this.values.shift()!;
      this.sum -= removed;
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

// ==================== 指标定义 ====================

export const amasMetrics = {
  // 决策记录
  decisionWriteTotal: new Counter(),
  decisionWriteSuccess: new Counter(),
  decisionWriteFailed: new Counter(),
  decisionWriteDuration: new Histogram(),

  // 队列状态
  queueSize: new Gauge(),
  queueBackpressureTotal: new Counter(),
  queueBackpressureTimeout: new Counter(),

  // 缓存
  cacheHits: new Counter(),
  cacheMisses: new Counter(),

  // 流水线阶段
  pipelineStageTotal: new Counter(),
  pipelineStageDuration: new Histogram(),

  // 错误
  errorTotal: new Counter()
};

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

// ==================== 指标导出 ====================

/**
 * 获取所有指标（用于 /metrics 端点）
 */
export function getAllMetrics(): Record<string, unknown> {
  const writeStats = amasMetrics.decisionWriteDuration.getStats();
  const stageStats = amasMetrics.pipelineStageDuration.getStats();

  const cacheHits = amasMetrics.cacheHits.get();
  const cacheMisses = amasMetrics.cacheMisses.get();
  const cacheHitRate = cacheHits + cacheMisses > 0
    ? cacheHits / (cacheHits + cacheMisses)
    : 0;

  return {
    decision: {
      writeTotal: amasMetrics.decisionWriteTotal.get(),
      writeSuccess: amasMetrics.decisionWriteSuccess.get(),
      writeFailed: amasMetrics.decisionWriteFailed.get(),
      writeDuration: writeStats
    },
    queue: {
      currentSize: amasMetrics.queueSize.get(),
      backpressureTotal: amasMetrics.queueBackpressureTotal.get(),
      backpressureTimeout: amasMetrics.queueBackpressureTimeout.get()
    },
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: Math.round(cacheHitRate * 1000) / 1000
    },
    pipeline: {
      stageTotal: amasMetrics.pipelineStageTotal.getAll(),
      stageDuration: stageStats
    },
    errors: amasMetrics.errorTotal.getAll()
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

  lines.push('# HELP amas_queue_backpressure_timeout_total Queue backpressure timeout events (data loss)');
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

  return lines.join('\n');
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
  amasMetrics.errorTotal.reset();
}
