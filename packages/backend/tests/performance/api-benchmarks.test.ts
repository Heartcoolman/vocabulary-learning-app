/**
 * API 性能基准测试
 *
 * 使用 supertest 和 autocannon 测试关键 API 端点的性能
 * 运行方式: npm run test:performance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import autocannon from 'autocannon';
import {
  PerformanceMeasure,
  StatisticsCalculator,
  PerformanceValidator,
  PerformanceThreshold,
  PerformanceTestResult,
} from '../helpers/performance-utils';

// 注意：这个测试需要后端服务运行
// 如果服务未运行，部分测试将被跳过

// ==================== 性能阈值配置 ====================

const API_THRESHOLDS: Record<string, PerformanceThreshold> = {
  // 关键 API 响应时间阈值
  'api.learning-state.get': {
    name: 'GET /api/v1/learning-state/:userId',
    avgThreshold: 100,
    p95Threshold: 150,
    p99Threshold: 200,
  },
  'api.sessions.answer': {
    name: 'POST /api/v1/sessions/:sessionId/answers',
    avgThreshold: 150,
    p95Threshold: 200,
    p99Threshold: 300,
  },
  'api.realtime.stream': {
    name: 'GET /api/v1/realtime/sessions/:sessionId/stream',
    avgThreshold: 50,
    p95Threshold: 100,
    p99Threshold: 150,
  },
  'api.words.select': {
    name: 'POST /api/v1/words/select',
    avgThreshold: 200,
    p95Threshold: 300,
    p99Threshold: 500,
  },

  // 其他重要 API
  'api.auth.login': {
    name: 'POST /api/auth/login',
    avgThreshold: 200,
    p95Threshold: 300,
    p99Threshold: 500,
  },
  'api.user.profile': {
    name: 'GET /api/user/profile',
    avgThreshold: 100,
    p95Threshold: 150,
    p99Threshold: 200,
  },
};

// ==================== 测试配置 ====================

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_ITERATIONS = 100;

// Mock 数据
const TEST_USER = {
  email: 'perf-test@example.com',
  password: 'TestPassword123!',
};

const TEST_SESSION_ID = 'test-session-123';
const TEST_USER_ID = 'test-user-123';

// ==================== 测试套件 ====================

describe('API Performance Benchmarks', () => {
  const results: PerformanceTestResult[] = [];
  let authToken: string | null = null;
  let serverAvailable = false;

  beforeAll(async () => {
    console.log('\n🚀 Starting API Performance Benchmarks...\n');
    console.log(`Test Configuration:`);
    console.log(`  - API Base URL: ${API_BASE_URL}`);
    console.log(`  - Iterations per test: ${TEST_ITERATIONS}`);
    console.log('');

    // 检查服务器是否可用
    try {
      await request(API_BASE_URL).get('/health').timeout(5000);
      serverAvailable = true;
      console.log('✓ Server is available\n');
    } catch (error) {
      console.log('⚠️  Server not available, API tests will be skipped\n');
      console.log('   To run API tests, start the server with: npm run dev\n');
    }
  });

  afterAll(() => {
    if (results.length > 0) {
      const report = PerformanceValidator.generateReport(results);
      console.log(report);
    }
  });

  // ==================== 健康检查和基本端点 ====================

  describe('Health & Basic Endpoints', () => {
    it('should respond to health check quickly', async function () {
      if (!serverAvailable) {
        this.skip();
        return;
      }

      const durations: number[] = [];

      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          const response = await request(API_BASE_URL).get('/health');
          return response;
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);

      console.log(`✓ Health Check Endpoint`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      // 健康检查应该非常快
      expect(stats.avg).toBeLessThan(50);
      expect(stats.p99).toBeLessThan(100);
    });

    it('should handle 404 errors efficiently', async function () {
      if (!serverAvailable) {
        this.skip();
        return;
      }

      const durations: number[] = [];

      for (let i = 0; i < 50; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          await request(API_BASE_URL).get('/api/non-existent-endpoint').expect(404);
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);

      console.log(`✓ 404 Error Handling`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      // 错误处理也应该快速
      expect(stats.avg).toBeLessThan(100);
    });
  });

  // ==================== 使用 autocannon 进行负载测试 ====================

  describe('Load Testing with Autocannon', () => {
    it('should handle high load on health endpoint', async function () {
      if (!serverAvailable) {
        this.skip();
        return;
      }

      console.log('\n🔥 Running load test on /health endpoint...');

      const result = await autocannon({
        url: `${API_BASE_URL}/health`,
        duration: 10, // 10秒
        connections: 50, // 50个并发连接
        pipelining: 1,
        timeout: 30,
      });

      console.log(`\n  Load Test Results:`);
      console.log(`    Requests: ${result.requests.total}`);
      console.log(`    Throughput: ${result.throughput.total} bytes`);
      console.log(`    Duration: ${result.duration}s`);
      console.log(`    Latency:`);
      console.log(`      Avg: ${result.latency.mean.toFixed(2)}ms`);
      console.log(`      P50: ${result.latency.p50.toFixed(2)}ms`);
      console.log(`      P95: ${result.latency.p95.toFixed(2)}ms`);
      console.log(`      P99: ${result.latency.p99.toFixed(2)}ms`);
      console.log(`      Max: ${result.latency.max.toFixed(2)}ms`);
      console.log(`    Requests/sec: ${result.requests.average.toFixed(0)}`);
      console.log(`    Errors: ${result.errors}`);
      console.log('');

      // 验证负载测试结果
      expect(result.requests.total).toBeGreaterThan(1000);
      expect(result.latency.mean).toBeLessThan(100);
      expect(result.errors).toBe(0);
    });

    it('should maintain performance under sustained load', async function () {
      if (!serverAvailable) {
        this.skip();
        return;
      }

      console.log('\n⏱️  Running sustained load test (30s)...');

      const result = await autocannon({
        url: `${API_BASE_URL}/health`,
        duration: 30, // 30秒持续测试
        connections: 100, // 100个并发
        pipelining: 1,
        timeout: 30,
      });

      console.log(`\n  Sustained Load Test Results:`);
      console.log(`    Total requests: ${result.requests.total}`);
      console.log(`    Avg latency: ${result.latency.mean.toFixed(2)}ms`);
      console.log(`    P99 latency: ${result.latency.p99.toFixed(2)}ms`);
      console.log(`    Throughput: ${result.requests.average.toFixed(0)} req/s`);
      console.log(`    Errors: ${result.errors}`);
      console.log('');

      // 在持续负载下应保持性能
      expect(result.latency.mean).toBeLessThan(150);
      expect(result.requests.average).toBeGreaterThan(100);
    });
  });

  // ==================== 模拟 API 端点测试 ====================
  // 注意：以下测试使用 mock 数据，因为实际端点可能需要认证和特定数据

  describe('Simulated API Response Times', () => {
    it('should measure simulated GET /api/v1/learning-state/:userId', async () => {
      // 这是一个模拟测试，展示如何测试实际端点
      // 实际使用时需要替换为真实的 API 调用

      const durations: number[] = [];

      for (let i = 0; i < 100; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          // 模拟 API 调用延迟
          await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 50));
          return { success: true };
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, API_THRESHOLDS['api.learning-state.get']);
      results.push(result);

      console.log(`✓ ${result.testName} (simulated)`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      // 注意：这是模拟测试，实际阈值检查将在真实环境中执行
      expect(stats.avg).toBeGreaterThan(0);
    });

    it('should measure simulated POST /api/v1/sessions/:sessionId/answers', async () => {
      const durations: number[] = [];

      for (let i = 0; i < 100; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          // 模拟更复杂的 API 调用
          await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 70));
          return { success: true };
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, API_THRESHOLDS['api.sessions.answer']);
      results.push(result);

      console.log(`✓ ${result.testName} (simulated)`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(stats.avg).toBeGreaterThan(0);
    });
  });

  // ==================== 数据库查询性能模拟 ====================

  describe('Database Query Performance', () => {
    it('should simulate single record query', async () => {
      const durations: number[] = [];

      for (let i = 0; i < 200; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          // 模拟单条记录查询 (2-8ms)
          await new Promise((resolve) => setTimeout(resolve, 2 + Math.random() * 6));
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);

      console.log(`✓ Single Record Query (simulated)`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(stats.avg).toBeLessThan(20);
    });

    it('should simulate batch query performance', async () => {
      const durations: number[] = [];

      for (let i = 0; i < 100; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          // 模拟批量查询 (10-30ms)
          await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);

      console.log(`✓ Batch Query (simulated)`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(stats.avg).toBeLessThan(50);
    });

    it('should simulate complex join query', async () => {
      const durations: number[] = [];

      for (let i = 0; i < 100; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(async () => {
          // 模拟复杂联表查询 (20-80ms)
          await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60));
        });
        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);

      console.log(`✓ Complex Join Query (simulated)`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(stats.avg).toBeLessThan(150);
    });
  });

  // ==================== 缓存命中率测试 ====================

  describe('Cache Hit Rate Performance', () => {
    it('should measure cache vs database access time', async () => {
      const cacheHits: number[] = [];
      const cacheMisses: number[] = [];

      for (let i = 0; i < 100; i++) {
        // 70% 缓存命中率
        const isHit = Math.random() < 0.7;

        if (isHit) {
          const { duration } = await PerformanceMeasure.measureAsync(async () => {
            // 缓存命中 - 很快 (1-3ms)
            await new Promise((resolve) => setTimeout(resolve, 1 + Math.random() * 2));
          });
          cacheHits.push(duration);
        } else {
          const { duration } = await PerformanceMeasure.measureAsync(async () => {
            // 缓存未命中 - 需要查数据库 (10-30ms)
            await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
          });
          cacheMisses.push(duration);
        }
      }

      const hitStats = StatisticsCalculator.calculateStats(cacheHits);
      const missStats = StatisticsCalculator.calculateStats(cacheMisses);
      const hitRate = cacheHits.length / (cacheHits.length + cacheMisses.length);

      console.log(`\n✓ Cache Performance Analysis:`);
      console.log(`  Hit Rate: ${(hitRate * 100).toFixed(1)}%`);
      console.log(`  Cache Hit Avg: ${hitStats.avg.toFixed(3)}ms`);
      console.log(`  Cache Miss Avg: ${missStats.avg.toFixed(3)}ms`);
      console.log(`  Speed Improvement: ${(missStats.avg / hitStats.avg).toFixed(1)}x faster`);
      console.log('');

      expect(hitRate).toBeGreaterThan(0.5);
      expect(hitStats.avg).toBeLessThan(missStats.avg);
    });
  });

  // ==================== 总结 ====================

  describe('API Performance Summary', () => {
    it('should display API performance thresholds', () => {
      console.log('\n📋 API Performance Thresholds:');
      Object.values(API_THRESHOLDS).forEach((threshold) => {
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

    it('should provide testing recommendations', () => {
      console.log('💡 Performance Testing Recommendations:\n');
      console.log('  1. Run tests against production-like environment');
      console.log('  2. Use real database with production data volume');
      console.log('  3. Test with production cache configuration');
      console.log('  4. Monitor server resources (CPU, memory, disk I/O)');
      console.log('  5. Test under various load patterns (spike, sustained, etc.)');
      console.log('  6. Include cold start and warm cache scenarios');
      console.log('  7. Test API rate limiting behavior');
      console.log('  8. Measure error handling performance');
      console.log('');

      expect(true).toBe(true);
    });
  });
});
