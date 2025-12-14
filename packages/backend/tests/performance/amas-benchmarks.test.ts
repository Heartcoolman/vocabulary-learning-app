/**
 * AMAS 性能基准测试
 *
 * 测试 AMAS 核心组件的性能指标
 * 运行方式: npm run test:performance
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  PerformanceMeasure,
  StatisticsCalculator,
  PerformanceValidator,
  MemoryMonitor,
  PerformanceThreshold,
  PerformanceTestResult,
} from '../helpers/performance-utils';
import { OnlineLoop } from '../../src/amas/core/online-loop';
import { OfflineLoop } from '../../src/amas/core/offline-loop';
import { FeatureBuilder } from '../../src/amas/perception/feature-builder';
import { LinUCBAdapter } from '../../src/amas/adapters/linucb-adapter';
import type { RawEvent, UserState, OnlineLoopInput } from '../../src/amas/types';

// ==================== 性能阈值配置 ====================

const AMAS_THRESHOLDS: Record<string, PerformanceThreshold> = {
  // Online Loop - 最关键,必须 <50ms
  'online-loop.process': {
    name: 'AMAS Online Loop (full cycle)',
    avgThreshold: 50,
    p95Threshold: 80,
    p99Threshold: 100,
  },
  'online-loop.feature-build': {
    name: 'Feature Builder',
    avgThreshold: 5,
    p95Threshold: 10,
    p99Threshold: 15,
  },
  'online-loop.cognitive-update': {
    name: 'Cognitive Model Update',
    avgThreshold: 10,
    p95Threshold: 15,
    p99Threshold: 20,
  },
  'online-loop.decision': {
    name: 'Decision Policy',
    avgThreshold: 20,
    p95Threshold: 30,
    p99Threshold: 40,
  },
  'online-loop.reward': {
    name: 'Reward Evaluation',
    avgThreshold: 5,
    p95Threshold: 10,
    p99Threshold: 15,
  },

  // Offline Loop - 可以慢一些,但也要合理
  'offline-loop.update': {
    name: 'AMAS Offline Loop (model update)',
    avgThreshold: 200,
    p95Threshold: 300,
    p99Threshold: 500,
  },

  // 个体组件
  'linucb.select': {
    name: 'LinUCB.selectAction()',
    avgThreshold: 10,
    p95Threshold: 15,
    p99Threshold: 20,
  },
  'linucb.update': {
    name: 'LinUCB.update()',
    avgThreshold: 15,
    p95Threshold: 25,
    p99Threshold: 35,
  },
};

// ==================== 测试数据 ====================

const TEST_ITERATIONS = 500;

// 模拟用户状态
const createMockUserState = (): UserState => ({
  A: 0.8, // Attention
  F: 0.2, // Fatigue
  M: 0.7, // Motivation
  C: {
    // Cognitive Profile
    mem: 0.75,
    speed: 0.65,
  },
});

// 模拟原始事件
const createMockEvent = (correct: boolean): RawEvent => ({
  type: 'answer_submitted',
  timestamp: Date.now(),
  userId: 'test-user-123',
  payload: {
    wordId: `word-${Math.floor(Math.random() * 1000)}`,
    correct,
    responseTime: 2000 + Math.random() * 3000,
    difficulty: 0.5 + Math.random() * 0.3,
  },
});

// 模拟 Online Loop 输入
const createMockOnlineInput = (): OnlineLoopInput => ({
  event: createMockEvent(Math.random() > 0.3),
  currentState: createMockUserState(),
  userId: 'test-user-123',
  recentErrorRate: 0.2 + Math.random() * 0.2,
  recentResponseTime: 2000 + Math.random() * 1000,
  timeBucket: Math.floor(Math.random() * 24),
  interactionCount: Math.floor(Math.random() * 100),
});

// ==================== 测试套件 ====================

describe('AMAS Performance Benchmarks', () => {
  const results: PerformanceTestResult[] = [];
  let onlineLoop: OnlineLoop;
  let offlineLoop: OfflineLoop;

  beforeAll(() => {
    console.log('\n🚀 Starting AMAS Performance Benchmarks...\n');
    console.log(`Test Configuration:`);
    console.log(`  - Iterations per test: ${TEST_ITERATIONS}`);
    console.log(`  - Online Loop target: <50ms (P95 <80ms, P99 <100ms)`);
    console.log(`  - Offline Loop target: <200ms`);
    console.log('');

    // 初始化 AMAS 组件
    onlineLoop = new OnlineLoop();
    offlineLoop = new OfflineLoop();
  });

  // ==================== Online Loop 性能测试 ====================

  describe('Online Loop Performance (Critical Path)', () => {
    it('should complete full Online Loop cycle within threshold', async () => {
      const durations: number[] = [];
      const metaStats = {
        featureBuild: [] as number[],
        cognitiveUpdate: [] as number[],
        decision: [] as number[],
        reward: [] as number[],
      };

      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const input = createMockOnlineInput();

        const { result, duration } = await PerformanceMeasure.measureAsync(() =>
          onlineLoop.process(input),
        );

        durations.push(duration);

        // 收集子组件性能数据
        if (result.meta) {
          metaStats.featureBuild.push(result.meta.featureBuildTime);
          metaStats.cognitiveUpdate.push(result.meta.cognitiveUpdateTime);
          metaStats.decision.push(result.meta.decisionTime);
          metaStats.reward.push(result.meta.rewardTime);
        }
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, AMAS_THRESHOLDS['online-loop.process']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      // 子组件性能分析
      if (metaStats.featureBuild.length > 0) {
        console.log(`\n  Sub-component breakdown:`);
        console.log(
          `    Feature Build: ${StatisticsCalculator.calculateStats(metaStats.featureBuild).avg.toFixed(3)}ms`,
        );
        console.log(
          `    Cognitive Update: ${StatisticsCalculator.calculateStats(metaStats.cognitiveUpdate).avg.toFixed(3)}ms`,
        );
        console.log(
          `    Decision: ${StatisticsCalculator.calculateStats(metaStats.decision).avg.toFixed(3)}ms`,
        );
        console.log(
          `    Reward: ${StatisticsCalculator.calculateStats(metaStats.reward).avg.toFixed(3)}ms`,
        );
      }

      expect(result.passed).toBe(true);
    });

    it('should handle rapid successive calls efficiently', async () => {
      const rapidCalls = 100;
      const inputs = Array.from({ length: rapidCalls }, () => createMockOnlineInput());

      const { duration } = await PerformanceMeasure.measureAsync(async () => {
        for (const input of inputs) {
          await onlineLoop.process(input);
        }
      });

      const avgPerCall = duration / rapidCalls;

      console.log(`✓ Rapid successive calls (${rapidCalls} calls):`);
      console.log(`  Total: ${duration.toFixed(3)}ms`);
      console.log(`  Avg per call: ${avgPerCall.toFixed(3)}ms`);

      // 平均每次调用应该在阈值内
      expect(avgPerCall).toBeLessThan(AMAS_THRESHOLDS['online-loop.process'].avgThreshold!);
    });

    it('should maintain performance under varying user states', async () => {
      const scenarios = [
        { name: 'High Attention, Low Fatigue', state: { A: 0.9, F: 0.1, M: 0.8 } },
        { name: 'Low Attention, High Fatigue', state: { A: 0.3, F: 0.8, M: 0.4 } },
        { name: 'Medium Everything', state: { A: 0.5, F: 0.5, M: 0.5 } },
      ];

      console.log(`\n  Performance across different user states:`);

      for (const scenario of scenarios) {
        const durations: number[] = [];

        for (let i = 0; i < 100; i++) {
          const input = createMockOnlineInput();
          input.currentState = {
            ...scenario.state,
            C: { mem: 0.7, speed: 0.6 },
          };

          const { duration } = await PerformanceMeasure.measureAsync(() =>
            onlineLoop.process(input),
          );
          durations.push(duration);
        }

        const stats = StatisticsCalculator.calculateStats(durations);
        console.log(
          `    ${scenario.name}: Avg ${stats.avg.toFixed(3)}ms, P95 ${stats.p95.toFixed(3)}ms`,
        );

        expect(stats.avg).toBeLessThan(AMAS_THRESHOLDS['online-loop.process'].avgThreshold!);
      }
    });
  });

  // ==================== Feature Builder 性能测试 ====================

  describe('Feature Builder Performance', () => {
    const featureBuilder = new FeatureBuilder();

    it('should build feature vectors within threshold', async () => {
      const durations: number[] = [];

      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const input = createMockOnlineInput();

        const { duration } = await PerformanceMeasure.measureAsync(() =>
          featureBuilder.build({
            userState: input.currentState,
            event: input.event,
            context: {
              recentErrorRate: input.recentErrorRate,
              recentResponseTime: input.recentResponseTime,
              timeBucket: input.timeBucket,
            },
          }),
        );

        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(
        stats,
        AMAS_THRESHOLDS['online-loop.feature-build'],
      );
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(result.passed).toBe(true);
    });
  });

  // ==================== LinUCB Adapter 性能测试 ====================

  describe('LinUCB Adapter Performance', () => {
    const linucb = new LinUCBAdapter({ dimension: 22, alpha: 1.0 });
    const actions = [
      { interval_scale: 1.0, new_ratio: 0.3, batch_size: 10 },
      { interval_scale: 0.8, new_ratio: 0.5, batch_size: 15 },
      { interval_scale: 1.2, new_ratio: 0.2, batch_size: 8 },
    ];

    it('should select action within threshold', async () => {
      const durations: number[] = [];
      const features = new Array(22).fill(0).map(() => Math.random());

      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const { duration } = await PerformanceMeasure.measureAsync(() =>
          linucb.selectAction({
            features,
            actions,
            context: {},
          }),
        );

        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, AMAS_THRESHOLDS['linucb.select']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(result.passed).toBe(true);
    });

    it('should update model within threshold', async () => {
      const durations: number[] = [];
      const features = new Array(22).fill(0).map(() => Math.random());
      const action = actions[0];

      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const reward = Math.random();

        const { duration } = await PerformanceMeasure.measureAsync(() =>
          linucb.update({
            features,
            action,
            reward,
            context: {},
          }),
        );

        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, AMAS_THRESHOLDS['linucb.update']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(result.passed).toBe(true);
    });
  });

  // ==================== Offline Loop 性能测试 ====================

  describe('Offline Loop Performance', () => {
    it('should complete model update within threshold', async () => {
      const durations: number[] = [];
      const iterations = 50; // Offline Loop 执行次数较少

      for (let i = 0; i < iterations; i++) {
        const input = {
          userId: 'test-user-123',
          sessionData: Array.from({ length: 10 }, () => ({
            state: createMockUserState(),
            action: {
              interval_scale: 1.0 + Math.random() * 0.4 - 0.2,
              new_ratio: 0.3 + Math.random() * 0.3,
              batch_size: 8 + Math.floor(Math.random() * 8),
            },
            reward: Math.random(),
            features: new Array(22).fill(0).map(() => Math.random()),
          })),
        };

        const { duration } = await PerformanceMeasure.measureAsync(() => offlineLoop.update(input));

        durations.push(duration);
      }

      const stats = StatisticsCalculator.calculateStats(durations);
      const result = PerformanceValidator.validate(stats, AMAS_THRESHOLDS['offline-loop.update']);
      results.push(result);

      console.log(`✓ ${result.testName}`);
      console.log(`  ${StatisticsCalculator.formatStats(stats)}`);

      expect(result.passed).toBe(true);
    });
  });

  // ==================== 内存使用测试 ====================

  describe('AMAS Memory Usage', () => {
    it('should report memory baseline', () => {
      const baseline = MemoryMonitor.snapshot();

      console.log('\n📊 AMAS Memory Baseline:');
      console.log(`  ${MemoryMonitor.format(baseline)}`);
      console.log('');

      expect(baseline.heapUsed).toBeGreaterThan(0);
    });

    it('should not leak memory on repeated Online Loop calls', async () => {
      const iterations = 1000;
      const maxGrowthMB = 15;

      const { leaked, growth } = await MemoryMonitor.detectLeak(
        async () => {
          const input = createMockOnlineInput();
          await onlineLoop.process(input);
        },
        iterations,
        maxGrowthMB,
      );

      console.log(`✓ Online Loop memory leak test (${iterations} iterations)`);
      console.log(`  Growth: ${growth.toFixed(2)} MB (max: ${maxGrowthMB} MB)`);

      expect(leaked).toBe(false);
    });

    it('should not leak memory on LinUCB operations', async () => {
      const linucb = new LinUCBAdapter({ dimension: 22, alpha: 1.0 });
      const actions = [
        { interval_scale: 1.0, new_ratio: 0.3, batch_size: 10 },
        { interval_scale: 0.8, new_ratio: 0.5, batch_size: 15 },
      ];
      const iterations = 1000;
      const maxGrowthMB = 10;

      const { leaked, growth } = await MemoryMonitor.detectLeak(
        async () => {
          const features = new Array(22).fill(0).map(() => Math.random());
          const result = await linucb.selectAction({ features, actions, context: {} });
          await linucb.update({
            features,
            action: result.action,
            reward: Math.random(),
            context: {},
          });
        },
        iterations,
        maxGrowthMB,
      );

      console.log(`✓ LinUCB memory leak test (${iterations} iterations)`);
      console.log(`  Growth: ${growth.toFixed(2)} MB (max: ${maxGrowthMB} MB)`);

      expect(leaked).toBe(false);
    });
  });

  // ==================== 并发性能测试 ====================

  describe('AMAS Concurrency Performance', () => {
    it('should handle concurrent Online Loop processing', async () => {
      const concurrentUsers = 50;
      const requestsPerUser = 10;

      const startTime = performance.now();

      await Promise.all(
        Array.from({ length: concurrentUsers }, async () => {
          const userOnlineLoop = new OnlineLoop(); // 每个用户独立实例
          for (let i = 0; i < requestsPerUser; i++) {
            const input = createMockOnlineInput();
            await userOnlineLoop.process(input);
          }
        }),
      );

      const duration = performance.now() - startTime;
      const totalRequests = concurrentUsers * requestsPerUser;
      const throughput = (totalRequests / duration) * 1000;
      const avgPerRequest = duration / totalRequests;

      console.log(`✓ Concurrent Online Loop processing:`);
      console.log(`  Concurrent users: ${concurrentUsers}`);
      console.log(`  Requests per user: ${requestsPerUser}`);
      console.log(`  Total requests: ${totalRequests}`);
      console.log(`  Total duration: ${duration.toFixed(3)}ms`);
      console.log(`  Avg per request: ${avgPerRequest.toFixed(3)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(0)} req/s`);

      // 平均每个请求应该在阈值内
      expect(avgPerRequest).toBeLessThan(AMAS_THRESHOLDS['online-loop.process'].avgThreshold!);
    });
  });

  // ==================== 总结 ====================

  describe('AMAS Performance Summary', () => {
    it('should display all performance results', () => {
      const report = PerformanceValidator.generateReport(results);
      console.log(report);

      const allPassed = results.every((r) => r.passed);
      expect(allPassed).toBe(true);
    });

    it('should display performance thresholds', () => {
      console.log('📋 AMAS Performance Thresholds:');
      Object.values(AMAS_THRESHOLDS).forEach((threshold) => {
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
