/**
 * AMAS Engine Performance Tests
 *
 * 性能测试套件，验证核心组件的性能指标
 * 运行方式: npx vitest run tests/performance --reporter=verbose
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ColdStartManager } from '../../src/amas/learning/coldstart';
import { UserState, Action } from '../../src/amas/types';

// 性能阈值配置
const PERF_THRESHOLDS = {
  // ColdStart 阈值 (ms)
  coldstart_select: 5,
  coldstart_update: 10,

  // 特征向量构建阈值 (ms)
  feature_build: 2,

  // Engine 端到端阈值 (ms)
  engine_process: 50,
  engine_process_p99: 100,
};

// 性能测量工具
function measureTime<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  return { result, duration };
}

function calculateStats(durations: number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, d) => acc + d, 0);
  const avg = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return { avg, p50, p95, p99, min, max };
}

describe('AMAS Performance Tests', () => {
  describe('ColdStart Manager Performance', () => {
    const defaultState: UserState = {
      A: 0.8,
      F: 0.2,
      M: 0.5,
      C: { mem: 0.7, speed: 0.6 }
    };

    const actions: Action[] = [
      { interval_scale: 1.0, new_ratio: 0.3, batch_size: 10 },
      { interval_scale: 0.8, new_ratio: 0.5, batch_size: 15 },
      { interval_scale: 1.2, new_ratio: 0.2, batch_size: 8 },
    ];

    it('should select action within threshold', () => {
      const iterations = 500;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const coldStart = new ColdStartManager();
        const { duration } = measureTime(() => coldStart.selectAction(defaultState, actions, {}));
        durations.push(duration);
      }

      const stats = calculateStats(durations);
      console.log(`ColdStart Select - Avg: ${stats.avg.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms, P99: ${stats.p99.toFixed(3)}ms`);

      expect(stats.avg).toBeLessThan(PERF_THRESHOLDS.coldstart_select);
    });

    it('should update within threshold', () => {
      const iterations = 500;
      const durations: number[] = [];
      const action = actions[0];

      for (let i = 0; i < iterations; i++) {
        const coldStart = new ColdStartManager();
        coldStart.selectAction(defaultState, actions, {});
        const { duration } = measureTime(() =>
          coldStart.update(defaultState, action, Math.random(), { recentResponseTime: 2000, recentErrorRate: 0.2 })
        );
        durations.push(duration);
      }

      const stats = calculateStats(durations);
      console.log(`ColdStart Update - Avg: ${stats.avg.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms, P99: ${stats.p99.toFixed(3)}ms`);

      expect(stats.avg).toBeLessThan(PERF_THRESHOLDS.coldstart_update);
    });

    it('should handle rapid phase transitions', () => {
      const iterations = 100;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const coldStart = new ColdStartManager();

        const { duration } = measureTime(() => {
          // 模拟完整的冷启动流程
          for (let j = 0; j < 5; j++) {
            const result = coldStart.selectAction(defaultState, actions, {});
            coldStart.update(defaultState, result.action, Math.random(), {
              recentResponseTime: 1500 + Math.random() * 1000,
              recentErrorRate: Math.random() * 0.3
            });
          }
        });
        durations.push(duration);
      }

      const stats = calculateStats(durations);
      console.log(`ColdStart Full Flow - Avg: ${stats.avg.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms`);

      // 完整流程不应超过 50ms
      expect(stats.avg).toBeLessThan(50);
    });
  });

  describe('Feature Vector Performance', () => {
    it('should build feature vector efficiently', () => {
      const iterations = 1000;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { duration } = measureTime(() => {
          // 模拟 22 维特征向量构建
          const features = new Array(22).fill(0).map(() => Math.random());
          // 归一化
          const norm = Math.sqrt(features.reduce((sum, f) => sum + f * f, 0));
          return features.map(f => f / norm);
        });
        durations.push(duration);
      }

      const stats = calculateStats(durations);
      console.log(`Feature Vector Build - Avg: ${stats.avg.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms`);

      expect(stats.avg).toBeLessThan(PERF_THRESHOLDS.feature_build);
    });
  });

  describe('Matrix Operations Performance', () => {
    it('should perform matrix multiplication efficiently', () => {
      const dimension = 22;
      const iterations = 500;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const A = Array.from({ length: dimension }, () =>
          Array.from({ length: dimension }, () => Math.random())
        );
        const v = Array.from({ length: dimension }, () => Math.random());

        const { duration } = measureTime(() => {
          // 矩阵向量乘法 O(d²)
          return A.map(row => row.reduce((sum, a, j) => sum + a * v[j], 0));
        });
        durations.push(duration);
      }

      const stats = calculateStats(durations);
      console.log(`Matrix-Vector Multiply (d=${dimension}) - Avg: ${stats.avg.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms`);

      // O(d²) 操作应该很快
      expect(stats.avg).toBeLessThan(1);
    });

    it('should handle rank-1 update efficiently', () => {
      const dimension = 22;
      const iterations = 500;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const A = Array.from({ length: dimension }, () =>
          Array.from({ length: dimension }, () => Math.random())
        );
        const x = Array.from({ length: dimension }, () => Math.random());

        const { duration } = measureTime(() => {
          // Rank-1 更新: A += x * x^T
          for (let i = 0; i < dimension; i++) {
            for (let j = 0; j < dimension; j++) {
              A[i][j] += x[i] * x[j];
            }
          }
          return A;
        });
        durations.push(duration);
      }

      const stats = calculateStats(durations);
      console.log(`Rank-1 Update (d=${dimension}) - Avg: ${stats.avg.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms`);

      expect(stats.avg).toBeLessThan(2);
    });
  });

  describe('Memory Usage', () => {
    it('should report memory baseline', () => {
      const initialMemory = process.memoryUsage();

      console.log('\n=== Memory Baseline ===');
      console.log(`Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Heap Total: ${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
      console.log(`External: ${(initialMemory.external / 1024 / 1024).toFixed(2)} MB`);
      console.log(`RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`);
      console.log('========================\n');

      expect(initialMemory.heapUsed).toBeGreaterThan(0);
    });

    it('should not leak memory on repeated ColdStart operations', () => {
      const iterations = 1000;
      const initialMemory = process.memoryUsage().heapUsed;

      const actions: Action[] = [
        { interval_scale: 1.0, new_ratio: 0.3, batch_size: 10 },
        { interval_scale: 0.8, new_ratio: 0.5, batch_size: 15 },
      ];

      const state: UserState = {
        A: 0.8, F: 0.2, M: 0.5, C: { mem: 0.7, speed: 0.6 }
      };

      for (let i = 0; i < iterations; i++) {
        const coldStart = new ColdStartManager();
        const result = coldStart.selectAction(state, actions, {});
        coldStart.update(state, result.action, Math.random(), {
          recentResponseTime: 2000,
          recentErrorRate: 0.2
        });
      }

      // 尝试触发 GC
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`Memory growth after ${iterations} ColdStart operations: ${memoryGrowth.toFixed(2)} MB`);

      // 内存增长不应超过 20MB
      expect(memoryGrowth).toBeLessThan(20);
    });
  });
});

describe('Performance Regression Tests', () => {
  it('should report performance summary', () => {
    console.log('\n=== Performance Thresholds ===');
    console.log(`ColdStart Select: < ${PERF_THRESHOLDS.coldstart_select}ms`);
    console.log(`ColdStart Update: < ${PERF_THRESHOLDS.coldstart_update}ms`);
    console.log(`Feature Build: < ${PERF_THRESHOLDS.feature_build}ms`);
    console.log(`Engine Process: < ${PERF_THRESHOLDS.engine_process}ms`);
    console.log(`Engine Process P99: < ${PERF_THRESHOLDS.engine_process_p99}ms`);
    console.log('==============================\n');

    expect(true).toBe(true);
  });
});
