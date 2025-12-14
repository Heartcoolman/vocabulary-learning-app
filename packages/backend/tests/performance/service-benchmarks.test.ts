/**
 * 服务层性能基准测试
 *
 * 测试核心服务方法的性能指标
 * 运行方式: npm run test:performance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PerformanceMeasure,
  StatisticsCalculator,
  PerformanceValidator,
  MemoryMonitor,
  PerformanceThreshold,
  PerformanceTestResult,
} from '../helpers/performance-utils';
import { cacheService } from '../../src/services/cache.service';
import { getEventBus } from '../../src/core/event-bus';

// ==================== 性能阈值配置 ====================

const SERVICE_THRESHOLDS: Record<string, PerformanceThreshold> = {
  // LearningStateService 目标: <10ms
  'learning-state.getWordState': {
    name: 'LearningStateService.getWordState()',
    avgThreshold: 10,
    p95Threshold: 15,
    p99Threshold: 20,
  },
  'learning-state.batchGetWordStates': {
    name: 'LearningStateService.batchGetWordStates()',
    avgThreshold: 50,
    p95Threshold: 80,
    p99Threshold: 100,
  },
  'learning-state.updateWordState': {
    name: 'LearningStateService.updateWordState()',
    avgThreshold: 20,
    p95Threshold: 30,
    p99Threshold: 40,
  },

  // UserProfileService 目标: <50ms
  'user-profile.getUserProfile': {
    name: 'UserProfileService.getUserProfile()',
    avgThreshold: 50,
    p95Threshold: 80,
    p99Threshold: 100,
  },
  'user-profile.updateProfile': {
    name: 'UserProfileService.updateProfile()',
    avgThreshold: 30,
    p95Threshold: 50,
    p99Threshold: 70,
  },

  // WordSelectionService
  'word-selection.selectWords': {
    name: 'WordSelectionService.selectWords()',
    avgThreshold: 100,
    p95Threshold: 150,
    p99Threshold: 200,
  },

  // EventBus 目标: <5ms
  'event-bus.publish': {
    name: 'EventBus.publish()',
    avgThreshold: 5,
    p95Threshold: 8,
    p99Threshold: 10,
  },

  // CacheService
  'cache.get': {
    name: 'CacheService.get()',
    avgThreshold: 2,
    p95Threshold: 5,
    p99Threshold: 10,
  },
  'cache.set': {
    name: 'CacheService.set()',
    avgThreshold: 5,
    p95Threshold: 10,
    p99Threshold: 15,
  },
};

// ==================== 测试数据 ====================

const TEST_ITERATIONS = 500;
const TEST_USER_ID = 'test-user-perf-123';
const TEST_WORD_IDS = Array.from({ length: 20 }, (_, i) => `word-${i + 1}`);

// ==================== 测试套件 ====================

describe('Service Performance Benchmarks', () => {
  const results: PerformanceTestResult[] = [];

  beforeAll(async () => {
    console.log('\n🚀 Starting Service Performance Benchmarks...\n');
    console.log(`Test Configuration:`);
    console.log(`  - Iterations per test: ${TEST_ITERATIONS}`);
    console.log(`  - Test user ID: ${TEST_USER_ID}`);
    console.log(`  - Test words: ${TEST_WORD_IDS.length}`);
    console.log('');

    // 预热缓存和服务
    await cacheService.set('warmup-key', 'warmup-value', 60);
    await cacheService.get('warmup-key');
  });

  afterAll(() => {
    // 生成最终报告
    const report = PerformanceValidator.generateReport(results);
    console.log(report);
  });

  // ==================== CacheService 性能测试 ====================

  describe('CacheService Performance', () => {
    it('should get from cache within threshold', async () => {
      const key = 'perf-test-key';
      const value = { data: 'test-value', timestamp: Date.now() };
      await cacheService.set(key, value, 60);

      const durations = await PerformanceMeasure.measureMultipleAsync(
        () => cacheService.get(key),
        TEST_ITERATIONS,
      );

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, SERVICE_THRESHOLDS['cache.get']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(result.passed).toBe(true);
    });

    it('should set to cache within threshold', async () => {
      const durations = await PerformanceMeasure.measureMultipleAsync(async () => {
        const key = `perf-test-${Math.random()}`;
        const value = { data: 'test', timestamp: Date.now() };
        await cacheService.set(key, value, 60);
      }, TEST_ITERATIONS);

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, SERVICE_THRESHOLDS['cache.set']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(result.passed).toBe(true);
    });

    it('should handle batch operations efficiently', async () => {
      const batchSize = 100;
      const operations = Array.from({ length: batchSize }, (_, i) => ({
        key: `batch-${i}`,
        value: { data: `value-${i}` },
      }));

      const { duration } = await PerformanceMeasure.measureAsync(async () => {
        await Promise.all(operations.map((op) => cacheService.set(op.key, op.value, 60)));
      });

      console.log(`✓ Cache batch operations (${batchSize} items): ${duration.toFixed(3)}ms`);

      // 批量操作应该在合理时间内完成
      expect(duration).toBeLessThan(500);
    });
  });

  // ==================== EventBus 性能测试 ====================

  describe('EventBus Performance', () => {
    it('should publish events within threshold', async () => {
      const eventBus = getEventBus();
      const eventType = 'test:performance';
      let handlerCallCount = 0;

      // 注册一个简单的处理器
      eventBus.on(eventType, async () => {
        handlerCallCount++;
      });

      const durations = await PerformanceMeasure.measureMultipleAsync(
        () =>
          eventBus.publish(eventType, {
            timestamp: Date.now(),
            data: 'test',
          }),
        TEST_ITERATIONS,
      );

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, SERVICE_THRESHOLDS['event-bus.publish']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);
      console.log(`  Handler called: ${handlerCallCount} times`);

      expect(result.passed).toBe(true);
      expect(handlerCallCount).toBeGreaterThan(0);

      // 清理
      eventBus.off(eventType);
    });

    it('should handle multiple subscribers efficiently', async () => {
      const eventBus = getEventBus();
      const eventType = 'test:multiple-subscribers';
      const subscriberCount = 5;
      let totalHandlerCalls = 0;

      // 注册多个订阅者
      for (let i = 0; i < subscriberCount; i++) {
        eventBus.on(eventType, async () => {
          totalHandlerCalls++;
        });
      }

      const { duration } = await PerformanceMeasure.measureAsync(async () => {
        for (let i = 0; i < 100; i++) {
          await eventBus.publish(eventType, { iteration: i });
        }
      });

      console.log(
        `✓ EventBus with ${subscriberCount} subscribers (100 events): ${duration.toFixed(3)}ms`,
      );
      console.log(`  Total handler calls: ${totalHandlerCalls}`);

      // 多订阅者场景应该在1秒内完成
      expect(duration).toBeLessThan(1000);
      expect(totalHandlerCalls).toBeGreaterThan(0);

      // 清理
      eventBus.off(eventType);
    });
  });

  // ==================== 内存使用测试 ====================

  describe('Memory Usage Tests', () => {
    it('should report memory baseline', () => {
      const baseline = MemoryMonitor.snapshot();

      console.log('\n📊 Memory Baseline:');
      console.log(`  ${MemoryMonitor.format(baseline)}`);
      console.log('');

      expect(baseline.heapUsed).toBeGreaterThan(0);
    });

    it('should not leak memory on cache operations', async () => {
      const iterations = 1000;
      const maxGrowthMB = 10;

      const { leaked, growth } = await MemoryMonitor.detectLeak(
        async () => {
          const key = `leak-test-${Math.random()}`;
          await cacheService.set(key, { data: 'test' }, 1);
          await cacheService.get(key);
        },
        iterations,
        maxGrowthMB,
      );

      console.log(`✓ Memory leak test (${iterations} iterations)`);
      console.log(`  Growth: ${growth.toFixed(2)} MB (max: ${maxGrowthMB} MB)`);

      expect(leaked).toBe(false);
    });

    it('should not leak memory on event publishing', async () => {
      const eventBus = getEventBus();
      const eventType = 'test:memory-leak';
      const iterations = 1000;
      const maxGrowthMB = 10;

      eventBus.on(eventType, async () => {
        // Simple handler
      });

      const { leaked, growth } = await MemoryMonitor.detectLeak(
        () => eventBus.publish(eventType, { data: 'test' }),
        iterations,
        maxGrowthMB,
      );

      console.log(`✓ EventBus memory leak test (${iterations} iterations)`);
      console.log(`  Growth: ${growth.toFixed(2)} MB (max: ${maxGrowthMB} MB)`);

      expect(leaked).toBe(false);

      // 清理
      eventBus.off(eventType);
    });
  });

  // ==================== 并发性能测试 ====================

  describe('Concurrency Performance', () => {
    it('should handle concurrent cache reads', async () => {
      const key = 'concurrent-test';
      await cacheService.set(key, { data: 'test' }, 60);

      const concurrency = 50;
      const totalRequests = 500;

      const startTime = performance.now();
      const results = await Promise.all(
        Array.from({ length: totalRequests }, () => cacheService.get(key)),
      );
      const duration = performance.now() - startTime;

      const throughput = (totalRequests / duration) * 1000;

      console.log(`✓ Concurrent cache reads:`);
      console.log(`  Total requests: ${totalRequests}`);
      console.log(`  Duration: ${duration.toFixed(3)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(0)} req/s`);
      console.log(`  Success: ${results.filter((r) => r !== null).length}`);

      expect(duration).toBeLessThan(1000);
      expect(throughput).toBeGreaterThan(100);
    });

    it('should handle concurrent event publishing', async () => {
      const eventBus = getEventBus();
      const eventType = 'test:concurrent-publish';
      let handlerCalls = 0;

      eventBus.on(eventType, async () => {
        handlerCalls++;
      });

      const totalEvents = 500;
      const startTime = performance.now();

      await Promise.all(
        Array.from({ length: totalEvents }, (_, i) => eventBus.publish(eventType, { index: i })),
      );

      const duration = performance.now() - startTime;
      const throughput = (totalEvents / duration) * 1000;

      console.log(`✓ Concurrent event publishing:`);
      console.log(`  Total events: ${totalEvents}`);
      console.log(`  Duration: ${duration.toFixed(3)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(0)} events/s`);
      console.log(`  Handler calls: ${handlerCalls}`);

      expect(duration).toBeLessThan(2000);

      // 清理
      eventBus.off(eventType);
    });
  });

  // ==================== 总结 ====================

  describe('Performance Summary', () => {
    it('should display performance thresholds', () => {
      console.log('\n📋 Performance Thresholds:');
      Object.values(SERVICE_THRESHOLDS).forEach((threshold) => {
        console.log(`  ${threshold.name}:`);
        if (threshold.avgThreshold) {
          console.log(`    Avg: < ${threshold.avgThreshold}ms`);
        }
        if (threshold.p95Threshold) {
          console.log(`    P95: < ${threshold.p95Threshold}ms`);
        }
        if (threshold.p99Threshold) {
          console.log(`    P99: < ${threshold.p99Threshold}ms`);
        }
      });
      console.log('');

      expect(true).toBe(true);
    });
  });
});
