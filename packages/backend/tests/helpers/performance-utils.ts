/**
 * 性能测试工具类
 * 提供统一的性能测量、统计和报告功能
 */

export interface PerformanceStats {
  /** 平均值 (ms) */
  avg: number;
  /** 中位数 P50 (ms) */
  p50: number;
  /** P95 百分位 (ms) */
  p95: number;
  /** P99 百分位 (ms) */
  p99: number;
  /** 最小值 (ms) */
  min: number;
  /** 最大值 (ms) */
  max: number;
  /** 总样本数 */
  count: number;
  /** 标准差 (ms) */
  stdDev: number;
}

export interface PerformanceThreshold {
  /** 操作名称 */
  name: string;
  /** 平均响应时间阈值 (ms) */
  avgThreshold?: number;
  /** P95 响应时间阈值 (ms) */
  p95Threshold?: number;
  /** P99 响应时间阈值 (ms) */
  p99Threshold?: number;
}

export interface PerformanceTestResult {
  /** 测试名称 */
  testName: string;
  /** 性能统计 */
  stats: PerformanceStats;
  /** 是否通过阈值检查 */
  passed: boolean;
  /** 阈值配置 */
  threshold: PerformanceThreshold;
  /** 失败原因 */
  failureReason?: string;
}

export interface MemorySnapshot {
  /** 堆内存使用 (MB) */
  heapUsed: number;
  /** 堆内存总量 (MB) */
  heapTotal: number;
  /** 外部内存 (MB) */
  external: number;
  /** RSS 常驻内存 (MB) */
  rss: number;
  /** 数组缓冲区 (MB) */
  arrayBuffers: number;
}

/**
 * 性能测量工具类
 */
export class PerformanceMeasure {
  /**
   * 测量同步函数执行时间
   */
  static measureSync<T>(fn: () => T): { result: T; duration: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    return { result, duration };
  }

  /**
   * 测量异步函数执行时间
   */
  static async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  }

  /**
   * 批量测量多次执行
   */
  static measureMultiple<T>(fn: () => T, iterations: number): number[] {
    const durations: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const { duration } = this.measureSync(fn);
      durations.push(duration);
    }
    return durations;
  }

  /**
   * 批量测量异步函数多次执行
   */
  static async measureMultipleAsync<T>(
    fn: () => Promise<T>,
    iterations: number,
  ): Promise<number[]> {
    const durations: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measureAsync(fn);
      durations.push(duration);
    }
    return durations;
  }
}

/**
 * 统计计算工具
 */
export class StatisticsCalculator {
  /**
   * 计算性能统计数据
   */
  static calculateStats(durations: number[]): PerformanceStats {
    if (durations.length === 0) {
      throw new Error('Cannot calculate stats for empty array');
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, d) => acc + d, 0);
    const avg = sum / count;

    // 计算标准差
    const variance = sorted.reduce((acc, d) => acc + Math.pow(d - avg, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    // 计算百分位数
    const p50 = this.percentile(sorted, 0.5);
    const p95 = this.percentile(sorted, 0.95);
    const p99 = this.percentile(sorted, 0.99);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return { avg, p50, p95, p99, min, max, count, stdDev };
  }

  /**
   * 计算百分位数
   */
  static percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 格式化统计信息为字符串
   */
  static formatStats(stats: PerformanceStats): string {
    return [
      `Count: ${stats.count}`,
      `Avg: ${stats.avg.toFixed(3)}ms`,
      `P50: ${stats.p50.toFixed(3)}ms`,
      `P95: ${stats.p95.toFixed(3)}ms`,
      `P99: ${stats.p99.toFixed(3)}ms`,
      `Min: ${stats.min.toFixed(3)}ms`,
      `Max: ${stats.max.toFixed(3)}ms`,
      `StdDev: ${stats.stdDev.toFixed(3)}ms`,
    ].join(', ');
  }
}

/**
 * 性能阈值验证器
 */
export class PerformanceValidator {
  /**
   * 验证性能是否满足阈值要求
   */
  static validate(stats: PerformanceStats, threshold: PerformanceThreshold): PerformanceTestResult {
    let passed = true;
    const failures: string[] = [];

    if (threshold.avgThreshold !== undefined && stats.avg > threshold.avgThreshold) {
      passed = false;
      failures.push(`Avg ${stats.avg.toFixed(3)}ms exceeds threshold ${threshold.avgThreshold}ms`);
    }

    if (threshold.p95Threshold !== undefined && stats.p95 > threshold.p95Threshold) {
      passed = false;
      failures.push(`P95 ${stats.p95.toFixed(3)}ms exceeds threshold ${threshold.p95Threshold}ms`);
    }

    if (threshold.p99Threshold !== undefined && stats.p99 > threshold.p99Threshold) {
      passed = false;
      failures.push(`P99 ${stats.p99.toFixed(3)}ms exceeds threshold ${threshold.p99Threshold}ms`);
    }

    return {
      testName: threshold.name,
      stats,
      passed,
      threshold,
      failureReason: failures.length > 0 ? failures.join('; ') : undefined,
    };
  }

  /**
   * 生成性能报告
   */
  static generateReport(results: PerformanceTestResult[]): string {
    const lines: string[] = [];
    lines.push('\n=== Performance Test Results ===\n');

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    for (const result of results) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      lines.push(`${status} - ${result.testName}`);
      lines.push(`  ${StatisticsCalculator.formatStats(result.stats)}`);

      if (!result.passed && result.failureReason) {
        lines.push(`  Reason: ${result.failureReason}`);
      }
      lines.push('');
    }

    lines.push(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);
    lines.push('===============================\n');

    return lines.join('\n');
  }
}

/**
 * 内存使用监控器
 */
export class MemoryMonitor {
  /**
   * 获取当前内存快照
   */
  static snapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed / 1024 / 1024,
      heapTotal: mem.heapTotal / 1024 / 1024,
      external: mem.external / 1024 / 1024,
      rss: mem.rss / 1024 / 1024,
      arrayBuffers: mem.arrayBuffers / 1024 / 1024,
    };
  }

  /**
   * 比较两个内存快照的差异
   */
  static diff(before: MemorySnapshot, after: MemorySnapshot): MemorySnapshot {
    return {
      heapUsed: after.heapUsed - before.heapUsed,
      heapTotal: after.heapTotal - before.heapTotal,
      external: after.external - before.external,
      rss: after.rss - before.rss,
      arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    };
  }

  /**
   * 格式化内存快照
   */
  static format(snapshot: MemorySnapshot): string {
    return [
      `Heap Used: ${snapshot.heapUsed.toFixed(2)} MB`,
      `Heap Total: ${snapshot.heapTotal.toFixed(2)} MB`,
      `External: ${snapshot.external.toFixed(2)} MB`,
      `RSS: ${snapshot.rss.toFixed(2)} MB`,
      `Array Buffers: ${snapshot.arrayBuffers.toFixed(2)} MB`,
    ].join(', ');
  }

  /**
   * 尝试触发垃圾回收
   */
  static triggerGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * 检测内存泄漏
   */
  static async detectLeak<T>(
    fn: () => T | Promise<T>,
    iterations: number,
    maxGrowthMB: number,
  ): Promise<{ leaked: boolean; growth: number }> {
    // 预热并触发初始 GC
    for (let i = 0; i < 10; i++) {
      await fn();
    }
    this.triggerGC();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const before = this.snapshot();

    // 执行测试迭代
    for (let i = 0; i < iterations; i++) {
      await fn();
    }

    // 触发 GC 并等待
    this.triggerGC();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = this.snapshot();
    const growth = after.heapUsed - before.heapUsed;

    return {
      leaked: growth > maxGrowthMB,
      growth,
    };
  }
}

/**
 * 并发测试工具
 */
export class ConcurrencyTester {
  /**
   * 并发执行测试
   */
  static async runConcurrent<T>(
    fn: () => Promise<T>,
    concurrency: number,
    totalRequests: number,
  ): Promise<{
    durations: number[];
    errors: number;
    totalTime: number;
    throughput: number;
  }> {
    const durations: number[] = [];
    let errors = 0;
    const start = performance.now();

    const batches = Math.ceil(totalRequests / concurrency);

    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrency, totalRequests - batch * concurrency);
      const promises = Array.from({ length: batchSize }, async () => {
        try {
          const { duration } = await PerformanceMeasure.measureAsync(fn);
          durations.push(duration);
        } catch (error) {
          errors++;
        }
      });

      await Promise.all(promises);
    }

    const totalTime = performance.now() - start;
    const throughput = (totalRequests / totalTime) * 1000; // requests per second

    return {
      durations,
      errors,
      totalTime,
      throughput,
    };
  }
}

/**
 * 缓存性能测试工具
 */
export class CachePerformanceTester {
  /**
   * 测试缓存命中率
   */
  static async testHitRate<K, V>(
    getCached: (key: K) => Promise<V | null>,
    keys: K[],
    iterations: number,
  ): Promise<{
    hitRate: number;
    avgHitTime: number;
    avgMissTime: number;
  }> {
    let hits = 0;
    let misses = 0;
    const hitTimes: number[] = [];
    const missTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      for (const key of keys) {
        const { result, duration } = await PerformanceMeasure.measureAsync(() => getCached(key));

        if (result !== null) {
          hits++;
          hitTimes.push(duration);
        } else {
          misses++;
          missTimes.push(duration);
        }
      }
    }

    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;
    const avgHitTime =
      hitTimes.length > 0 ? hitTimes.reduce((a, b) => a + b, 0) / hitTimes.length : 0;
    const avgMissTime =
      missTimes.length > 0 ? missTimes.reduce((a, b) => a + b, 0) / missTimes.length : 0;

    return { hitRate, avgHitTime, avgMissTime };
  }
}
