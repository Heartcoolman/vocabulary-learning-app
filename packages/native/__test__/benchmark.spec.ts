import { describe, it, expect } from 'vitest';
import { LinUcbNative } from '../index.js';

describe('Performance Benchmarks', () => {
  const state = {
    masteryLevel: 0.5,
    recentAccuracy: 0.7,
    studyStreak: 5,
    totalInteractions: 100,
    averageResponseTime: 2000,
  };

  const actions = [
    { wordId: 'w1', difficulty: 'recognition', scheduledAt: undefined },
    { wordId: 'w2', difficulty: 'recall', scheduledAt: undefined },
    { wordId: 'w3', difficulty: 'spelling', scheduledAt: undefined },
    { wordId: 'w4', difficulty: 'listening', scheduledAt: undefined },
    { wordId: 'w5', difficulty: 'usage', scheduledAt: undefined },
  ];

  const context = {
    timeOfDay: 0.5,
    dayOfWeek: 3,
    sessionDuration: 1800,
    fatigueFactor: 0.2,
  };

  describe('selectAction Performance (3.4.1)', () => {
    it('should complete 1000 selectAction calls in reasonable time', () => {
      const linucb = new LinUcbNative(0.3, 1.0);
      const iterations = 1000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        linucb.selectAction(state, actions, context);
      }
      const elapsed = performance.now() - start;

      const avgMs = elapsed / iterations;
      console.log(
        `selectAction: ${avgMs.toFixed(4)}ms avg (${iterations} iterations, ${elapsed.toFixed(2)}ms total)`,
      );

      // 目标: < 0.5ms per call
      expect(avgMs).toBeLessThan(0.5);
    });

    it('should handle large action sets efficiently', () => {
      const linucb = new LinUcbNative(0.3, 1.0);

      // 创建 50 个动作
      const manyActions = Array.from({ length: 50 }, (_, i) => ({
        wordId: `word${i}`,
        difficulty: ['recognition', 'recall', 'spelling', 'listening', 'usage'][i % 5],
        scheduledAt: undefined,
      }));

      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        linucb.selectAction(state, manyActions, context);
      }
      const elapsed = performance.now() - start;

      const avgMs = elapsed / iterations;
      console.log(`selectAction (50 actions): ${avgMs.toFixed(4)}ms avg`);

      // 50 个动作应该 < 5ms
      expect(avgMs).toBeLessThan(5);
    });
  });

  describe('update Performance (3.4.2)', () => {
    it('should complete 1000 update calls in reasonable time', () => {
      const linucb = new LinUcbNative(0.3, 1.0);
      const iterations = 1000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        linucb.update(state, actions[i % actions.length], Math.random(), context);
      }
      const elapsed = performance.now() - start;

      const avgMs = elapsed / iterations;
      console.log(
        `update: ${avgMs.toFixed(4)}ms avg (${iterations} iterations, ${elapsed.toFixed(2)}ms total)`,
      );

      // 目标: < 0.5ms per call
      expect(avgMs).toBeLessThan(0.5);
    });

    it('should maintain performance after many updates', () => {
      const linucb = new LinUcbNative(0.3, 1.0);

      // 先进行 1000 次更新
      for (let i = 0; i < 1000; i++) {
        linucb.update(state, actions[i % actions.length], Math.random(), context);
      }

      // 测试后续更新性能
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        linucb.update(state, actions[i % actions.length], Math.random(), context);
      }
      const elapsed = performance.now() - start;

      const avgMs = elapsed / iterations;
      console.log(`update (after 1000 updates): ${avgMs.toFixed(4)}ms avg`);

      // 应该仍然 < 1ms
      expect(avgMs).toBeLessThan(1);
    });
  });

  describe('Batch API Performance (3.4.3)', () => {
    it('should be faster than individual updates for batch', () => {
      const batchSize = 100;
      const featureVecs = Array.from({ length: batchSize }, () =>
        Array.from({ length: 22 }, () => Math.random()),
      );
      const rewards = Array.from({ length: batchSize }, () => Math.random());

      // 测试批量 API
      const linucb1 = new LinUcbNative(0.3, 1.0);
      const startBatch = performance.now();
      linucb1.updateBatch(featureVecs, rewards);
      const elapsedBatch = performance.now() - startBatch;

      // 测试逐个更新
      const linucb2 = new LinUcbNative(0.3, 1.0);
      const startIndividual = performance.now();
      for (let i = 0; i < batchSize; i++) {
        linucb2.updateWithFeatureVector(featureVecs[i], rewards[i]);
      }
      const elapsedIndividual = performance.now() - startIndividual;

      console.log(`Batch (${batchSize}): ${elapsedBatch.toFixed(4)}ms`);
      console.log(`Individual (${batchSize}): ${elapsedIndividual.toFixed(4)}ms`);
      console.log(`Speedup: ${(elapsedIndividual / elapsedBatch).toFixed(2)}x`);

      // 批量 API 应该更快（或至少相当）
      // 由于 FFI 开销，批量 API 可能有优势
      expect(elapsedBatch).toBeLessThan(elapsedIndividual * 2); // 允许一些波动
    });

    it('should handle Float64Array efficiently', () => {
      const linucb = new LinUcbNative(0.3, 1.0);
      const featureVec = new Float64Array(22);
      for (let i = 0; i < 22; i++) {
        featureVec[i] = Math.random();
      }

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        linucb.updateWithFloat64Array(featureVec, Math.random());
      }
      const elapsed = performance.now() - start;

      const avgMs = elapsed / iterations;
      console.log(`updateWithFloat64Array: ${avgMs.toFixed(4)}ms avg`);

      // Float64Array 应该 < 0.3ms (零拷贝优势)
      expect(avgMs).toBeLessThan(0.3);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory during repeated operations', () => {
      const linucb = new LinUcbNative(0.3, 1.0);

      // 记录初始内存（如果可用）
      const initialMemory = process.memoryUsage?.().heapUsed;

      // 进行大量操作
      for (let i = 0; i < 10000; i++) {
        linucb.selectAction(state, actions, context);
        linucb.update(state, actions[i % actions.length], Math.random(), context);
      }

      // 强制 GC（如果可用）
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage?.().heapUsed;

      if (initialMemory && finalMemory) {
        const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024;
        console.log(`Memory growth: ${memoryGrowth.toFixed(2)}MB`);

        // 内存增长应该 < 50MB
        expect(memoryGrowth).toBeLessThan(50);
      }
    });
  });

  describe('Throughput', () => {
    it('should achieve target throughput for mixed workload', () => {
      const linucb = new LinUcbNative(0.3, 1.0);
      const duration = 1000; // 1 秒
      let selectCount = 0;
      let updateCount = 0;

      const start = performance.now();
      while (performance.now() - start < duration) {
        // 模拟真实工作负载：每次选择后更新
        linucb.selectAction(state, actions, context);
        selectCount++;

        linucb.update(state, actions[selectCount % actions.length], Math.random(), context);
        updateCount++;
      }

      const elapsed = performance.now() - start;
      const opsPerSecond = (selectCount + updateCount) / (elapsed / 1000);

      console.log(`Throughput: ${opsPerSecond.toFixed(0)} ops/sec`);
      console.log(`  - selectAction: ${selectCount} calls`);
      console.log(`  - update: ${updateCount} calls`);

      // 目标: > 2000 ops/sec
      expect(opsPerSecond).toBeGreaterThan(2000);
    });
  });
});
