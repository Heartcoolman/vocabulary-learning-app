import { describe, it, expect, beforeAll } from 'vitest';
import {
  ActrMemoryNative,
  CausalInferenceNative,
  ThompsonSamplingNative,
  LinUcbNative,
  type MemoryTrace,
  type CausalObservation,
  type UserState,
  type Action,
  type LinUcbContext,
} from '../index.js';

/**
 * Memory Leak Detection Tests
 *
 * These tests verify that the native Rust modules don't leak memory
 * during long-running operations or repeated instantiation.
 *
 * Run with: pnpm test:memory
 * (requires --expose-gc flag for manual GC)
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate test memory traces for ACT-R
 */
function generateTestTraces(count: number): MemoryTrace[] {
  return Array(count)
    .fill(null)
    .map((_, i) => ({
      timestamp: i * 3600,
      isCorrect: Math.random() > 0.3,
    }));
}

/**
 * Generate large observation dataset for Causal Inference
 */
function generateLargeObservations(count: number): CausalObservation[] {
  return Array(count)
    .fill(null)
    .map(() => ({
      features: Array(10)
        .fill(0)
        .map(() => Math.random()),
      treatment: Math.random() > 0.5 ? 1 : 0,
      outcome: Math.random(),
    }));
}

/**
 * Calculate linear trend from memory snapshots
 * Returns the slope (bytes per iteration)
 */
function calculateTrend(data: number[]): number {
  const n = data.length;
  if (n < 2) return 0;

  const sumX = (n * (n - 1)) / 2;
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = data.reduce((sum, y, x) => sum + x * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Force garbage collection if available
 */
function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

/**
 * Get current heap memory usage in bytes
 */
function getHeapUsed(): number {
  return process.memoryUsage().heapUsed;
}

/**
 * Format bytes to human-readable MB
 */
function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

/**
 * Generate test UserState for LinUCB
 */
function generateUserState(): UserState {
  return {
    masteryLevel: Math.random(),
    recentAccuracy: Math.random(),
    studyStreak: Math.floor(Math.random() * 30),
    totalInteractions: Math.floor(Math.random() * 1000),
    averageResponseTime: 1000 + Math.random() * 4000,
  };
}

/**
 * Generate test Actions for LinUCB
 */
function generateActions(count: number): Action[] {
  const difficulties = ['recognition', 'recall', 'spelling', 'listening', 'usage'];
  return Array(count)
    .fill(null)
    .map((_, i) => ({
      wordId: `word_${i}`,
      difficulty: difficulties[i % difficulties.length],
      scheduledAt: undefined,
    }));
}

/**
 * Generate test context for LinUCB
 */
function generateContext(): LinUcbContext {
  return {
    timeOfDay: Math.random(),
    dayOfWeek: Math.floor(Math.random() * 7),
    sessionDuration: Math.floor(Math.random() * 3600),
    fatigueFactor: Math.random() * 0.5,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Memory Leak Detection', () => {
  beforeAll(() => {
    // Warm up - ensure modules are loaded
    new ActrMemoryNative();
    new CausalInferenceNative(10);
    new ThompsonSamplingNative();
    new LinUcbNative();
    forceGC();
  });

  describe('1. Instance Creation/Destruction', () => {
    it('should not leak memory when creating/destroying ACTRMemoryNative instances', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 10000; i++) {
        const instance = new ActrMemoryNative();
        const traces = generateTestTraces(10);
        instance.computeActivation(traces, Date.now() / 1000);
        // Instance goes out of scope and should be GC'd
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[ACTRMemoryNative] Memory growth after 10,000 instances: ${growth.toFixed(2)}MB`);
      console.log(`  Initial: ${formatMB(initialMemory)}MB, Final: ${formatMB(finalMemory)}MB`);

      expect(growth).toBeLessThan(10);
    });

    it('should not leak memory when creating/destroying LinUcbNative instances', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      const state = generateUserState();
      const actions = generateActions(5);
      const context = generateContext();

      for (let i = 0; i < 10000; i++) {
        const instance = new LinUcbNative(0.3, 1.0);
        instance.selectAction(state, actions, context);
        instance.update(state, actions[0], Math.random(), context);
        // Instance goes out of scope
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[LinUcbNative] Memory growth after 10,000 instances: ${growth.toFixed(2)}MB`);
      console.log(`  Initial: ${formatMB(initialMemory)}MB, Final: ${formatMB(finalMemory)}MB`);

      expect(growth).toBeLessThan(10);
    });

    it('should not leak memory when creating/destroying ThompsonSamplingNative instances', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 10000; i++) {
        const instance = new ThompsonSamplingNative();
        instance.batchSample(['action_a', 'action_b', 'action_c']);
        instance.update('action_a', Math.random() > 0.5);
        // Instance goes out of scope
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[ThompsonSamplingNative] Memory growth after 10,000 instances: ${growth.toFixed(2)}MB`);
      console.log(`  Initial: ${formatMB(initialMemory)}MB, Final: ${formatMB(finalMemory)}MB`);

      expect(growth).toBeLessThan(10);
    });

    it('should not leak memory when creating/destroying CausalInferenceNative instances', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 1000; i++) {
        const instance = new CausalInferenceNative(10);
        const observations = generateLargeObservations(100);
        instance.fitPropensity(observations);
        // Instance goes out of scope
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[CausalInferenceNative] Memory growth after 1,000 instances: ${growth.toFixed(2)}MB`);
      console.log(`  Initial: ${formatMB(initialMemory)}MB, Final: ${formatMB(finalMemory)}MB`);

      expect(growth).toBeLessThan(20);
    });
  });

  describe('2. Large Data Processing', () => {
    it('should handle large observation data without memory leak (CausalInference)', () => {
      const instance = new CausalInferenceNative(10);
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 100; i++) {
        // Generate and process large observation dataset
        const observations = generateLargeObservations(10000);
        instance.fitPropensity(observations);
        instance.estimateAte(observations);
        // Data goes out of scope, should be released
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[CausalInference Large Data] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  Processed: 100 batches of 10,000 observations each`);

      expect(growth).toBeLessThan(20);
    });

    it('should handle large trace data without memory leak (ACTRMemory)', () => {
      const instance = new ActrMemoryNative();
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 1000; i++) {
        // Generate large trace data
        const traces = generateTestTraces(1000);
        instance.computeActivation(traces, Date.now() / 1000);
        instance.retrievalProbability(Math.random() * 2 - 1);
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[ACTRMemory Large Data] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  Processed: 1,000 batches of 1,000 traces each`);

      expect(growth).toBeLessThan(10);
    });

    it('should handle batch updates without memory leak (LinUCB)', () => {
      const instance = new LinUcbNative(0.3, 1.0);
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 100; i++) {
        // Generate batch data
        const featureVecs = Array.from({ length: 1000 }, () =>
          Array.from({ length: 22 }, () => Math.random())
        );
        const rewards = Array.from({ length: 1000 }, () => Math.random());

        instance.updateBatch(featureVecs, rewards);
        instance.reset(); // Reset to clear accumulated state
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[LinUCB Batch Updates] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  Processed: 100 batches of 1,000 updates each`);

      expect(growth).toBeLessThan(20);
    });
  });

  describe('3. Long-Running Operations', () => {
    it('should be stable during long-running ThompsonSampling operations', () => {
      const instance = new ThompsonSamplingNative();
      const actionKeys = ['action_a', 'action_b', 'action_c', 'action_d', 'action_e'];
      const memorySnapshots: number[] = [];

      forceGC();

      for (let batch = 0; batch < 50; batch++) {
        // Simulate a batch of operations
        for (let i = 0; i < 1000; i++) {
          instance.batchSample(actionKeys);
          const selectedAction = actionKeys[Math.floor(Math.random() * actionKeys.length)];
          instance.update(selectedAction, Math.random() > 0.5);
        }

        forceGC();
        memorySnapshots.push(getHeapUsed());
      }

      // Calculate memory trend
      const trend = calculateTrend(memorySnapshots);
      const totalGrowth = (memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]) / 1024 / 1024;

      console.log(`[ThompsonSampling Long-Running] Memory trend: ${trend.toFixed(2)} bytes/batch`);
      console.log(`  Total growth over 50 batches: ${totalGrowth.toFixed(2)}MB`);
      console.log(`  First snapshot: ${formatMB(memorySnapshots[0])}MB`);
      console.log(`  Last snapshot: ${formatMB(memorySnapshots[memorySnapshots.length - 1])}MB`);

      // Memory should not have a significant upward trend
      // Note: V8 GC behavior can cause some variance, allow 500KB/batch for stability
      expect(trend).toBeLessThan(500000); // < 500KB per batch
    });

    it('should be stable during long-running LinUCB operations', () => {
      const instance = new LinUcbNative(0.3, 1.0);
      const state = generateUserState();
      const actions = generateActions(10);
      const context = generateContext();
      const memorySnapshots: number[] = [];

      forceGC();

      for (let batch = 0; batch < 50; batch++) {
        // Simulate a batch of operations
        for (let i = 0; i < 1000; i++) {
          const selection = instance.selectAction(state, actions, context);
          instance.update(state, selection.selectedAction, Math.random(), context);
        }

        forceGC();
        memorySnapshots.push(getHeapUsed());
      }

      const trend = calculateTrend(memorySnapshots);
      const totalGrowth = (memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]) / 1024 / 1024;

      console.log(`[LinUCB Long-Running] Memory trend: ${trend.toFixed(2)} bytes/batch`);
      console.log(`  Total growth over 50 batches: ${totalGrowth.toFixed(2)}MB`);
      console.log(`  Operations per batch: 1,000 select + 1,000 update`);

      expect(trend).toBeLessThan(100000);
    });

    it('should be stable during long-running ACTRMemory operations', () => {
      const instance = new ActrMemoryNative();
      const memorySnapshots: number[] = [];

      forceGC();

      for (let batch = 0; batch < 50; batch++) {
        // Simulate a batch of operations
        for (let i = 0; i < 1000; i++) {
          const traces = generateTestTraces(50);
          const activation = instance.computeActivation(traces, Date.now() / 1000);
          instance.retrievalProbability(activation);
        }

        forceGC();
        memorySnapshots.push(getHeapUsed());
      }

      const trend = calculateTrend(memorySnapshots);
      const totalGrowth = (memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]) / 1024 / 1024;

      console.log(`[ACTRMemory Long-Running] Memory trend: ${trend.toFixed(2)} bytes/batch`);
      console.log(`  Total growth over 50 batches: ${totalGrowth.toFixed(2)}MB`);

      expect(trend).toBeLessThan(100000);
    });
  });

  describe('4. Concurrent Operations', () => {
    it('should handle concurrent ACTRMemoryNative operations without leaks', async () => {
      forceGC();
      const initialMemory = getHeapUsed();

      const promises = Array(100)
        .fill(null)
        .map(async () => {
          const instance = new ActrMemoryNative();
          for (let i = 0; i < 100; i++) {
            const traces = generateTestTraces(20);
            instance.computeActivation(traces, Date.now() / 1000);
          }
        });

      await Promise.all(promises);

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[ACTRMemory Concurrent] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  100 concurrent instances, 100 operations each`);

      expect(growth).toBeLessThan(15);
    });

    it('should handle concurrent LinUcbNative operations without leaks', async () => {
      const state = generateUserState();
      const actions = generateActions(5);
      const context = generateContext();

      forceGC();
      const initialMemory = getHeapUsed();

      const promises = Array(100)
        .fill(null)
        .map(async () => {
          const instance = new LinUcbNative(0.3, 1.0);
          for (let i = 0; i < 100; i++) {
            instance.selectAction(state, actions, context);
            instance.update(state, actions[i % actions.length], Math.random(), context);
          }
        });

      await Promise.all(promises);

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[LinUCB Concurrent] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  100 concurrent instances, 100 operations each`);

      expect(growth).toBeLessThan(15);
    });

    it('should handle concurrent ThompsonSamplingNative operations without leaks', async () => {
      const actionKeys = ['a', 'b', 'c', 'd', 'e'];

      forceGC();
      const initialMemory = getHeapUsed();

      const promises = Array(100)
        .fill(null)
        .map(async () => {
          const instance = new ThompsonSamplingNative();
          for (let i = 0; i < 100; i++) {
            instance.batchSample(actionKeys);
            instance.update(actionKeys[i % actionKeys.length], Math.random() > 0.5);
          }
        });

      await Promise.all(promises);

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[ThompsonSampling Concurrent] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  100 concurrent instances, 100 operations each`);

      expect(growth).toBeLessThan(15);
    });

    it('should handle mixed concurrent operations without leaks', async () => {
      forceGC();
      const initialMemory = getHeapUsed();

      const actrPromises = Array(30)
        .fill(null)
        .map(async () => {
          const instance = new ActrMemoryNative();
          for (let i = 0; i < 100; i++) {
            const traces = generateTestTraces(20);
            instance.computeActivation(traces, Date.now() / 1000);
          }
        });

      const linucbPromises = Array(30)
        .fill(null)
        .map(async () => {
          const instance = new LinUcbNative(0.3, 1.0);
          const state = generateUserState();
          const actions = generateActions(5);
          const context = generateContext();
          for (let i = 0; i < 100; i++) {
            instance.selectAction(state, actions, context);
          }
        });

      const tsPromises = Array(30)
        .fill(null)
        .map(async () => {
          const instance = new ThompsonSamplingNative();
          for (let i = 0; i < 100; i++) {
            instance.batchSample(['a', 'b', 'c']);
          }
        });

      await Promise.all([...actrPromises, ...linucbPromises, ...tsPromises]);

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[Mixed Concurrent] Memory growth: ${growth.toFixed(2)}MB`);
      console.log(`  90 concurrent instances (30 each type), 100 operations each`);

      expect(growth).toBeLessThan(20);
    });
  });

  describe('5. Reset/Clear Operations', () => {
    it('should properly release memory after LinUCB reset', () => {
      const instance = new LinUcbNative(0.3, 1.0);
      const state = generateUserState();
      const actions = generateActions(5);
      const context = generateContext();

      forceGC();
      const initialMemory = getHeapUsed();

      // Accumulate state
      for (let i = 0; i < 10000; i++) {
        instance.update(state, actions[i % actions.length], Math.random(), context);
      }

      forceGC();
      const afterAccumulateMemory = getHeapUsed();

      // Reset and continue
      for (let j = 0; j < 10; j++) {
        instance.reset();
        for (let i = 0; i < 1000; i++) {
          instance.update(state, actions[i % actions.length], Math.random(), context);
        }
      }

      forceGC();
      const finalMemory = getHeapUsed();

      const accumulationGrowth = (afterAccumulateMemory - initialMemory) / 1024 / 1024;
      const afterResetGrowth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[LinUCB Reset] Initial accumulation growth: ${accumulationGrowth.toFixed(2)}MB`);
      console.log(`[LinUCB Reset] After 10 reset cycles growth: ${afterResetGrowth.toFixed(2)}MB`);

      // Memory after resets should not be significantly more than initial accumulation
      expect(afterResetGrowth).toBeLessThan(accumulationGrowth + 5);
    });

    it('should properly release memory after ThompsonSampling reset', () => {
      const instance = new ThompsonSamplingNative();
      const actionKeys = Array(100)
        .fill(null)
        .map((_, i) => `action_${i}`);

      forceGC();
      const initialMemory = getHeapUsed();

      // Accumulate many action keys
      for (let i = 0; i < 10000; i++) {
        instance.update(actionKeys[i % actionKeys.length], Math.random() > 0.5);
      }

      forceGC();
      const afterAccumulateMemory = getHeapUsed();

      // Reset and continue
      for (let j = 0; j < 10; j++) {
        instance.reset();
        for (let i = 0; i < 1000; i++) {
          instance.update(actionKeys[i % 10], Math.random() > 0.5);
        }
      }

      forceGC();
      const finalMemory = getHeapUsed();

      const accumulationGrowth = (afterAccumulateMemory - initialMemory) / 1024 / 1024;
      const afterResetGrowth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[ThompsonSampling Reset] Initial accumulation growth: ${accumulationGrowth.toFixed(2)}MB`);
      console.log(`[ThompsonSampling Reset] After 10 reset cycles growth: ${afterResetGrowth.toFixed(2)}MB`);

      // After reset, memory should be reclaimed
      expect(afterResetGrowth).toBeLessThan(accumulationGrowth + 2);
    });
  });

  describe('6. Stress Tests', () => {
    it('should survive high-frequency operations', () => {
      const instance = new LinUcbNative(0.3, 1.0);
      const state = generateUserState();
      const actions = generateActions(5);
      const context = generateContext();

      forceGC();
      const initialMemory = getHeapUsed();

      const startTime = Date.now();
      let operationCount = 0;

      // Run for 5 seconds
      while (Date.now() - startTime < 5000) {
        instance.selectAction(state, actions, context);
        instance.update(state, actions[operationCount % actions.length], Math.random(), context);
        operationCount++;
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;
      const opsPerSecond = operationCount / 5;

      console.log(`[High-Frequency Stress] Completed ${operationCount} operations in 5s`);
      console.log(`  Rate: ${opsPerSecond.toFixed(0)} ops/sec`);
      console.log(`  Memory growth: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(50);
    });

    it('should handle rapid instance creation/destruction', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      const startTime = Date.now();
      let instanceCount = 0;

      // Create/destroy instances for 3 seconds
      while (Date.now() - startTime < 3000) {
        const instance = new LinUcbNative(0.3, 1.0);
        const state = generateUserState();
        const actions = generateActions(3);
        const context = generateContext();
        instance.selectAction(state, actions, context);
        instanceCount++;
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;
      const instancesPerSecond = instanceCount / 3;

      console.log(`[Rapid Creation Stress] Created ${instanceCount} instances in 3s`);
      console.log(`  Rate: ${instancesPerSecond.toFixed(0)} instances/sec`);
      console.log(`  Memory growth: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(20);
    });
  });

  describe('7. Edge Cases', () => {
    it('should handle empty inputs without leaks', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 10000; i++) {
        const actr = new ActrMemoryNative();
        actr.computeActivation([], Date.now() / 1000);

        const ts = new ThompsonSamplingNative();
        ts.batchSample([]);
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[Empty Inputs] Memory growth: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(5);
    });

    it('should handle very large single inputs without leaks', () => {
      forceGC();
      const initialMemory = getHeapUsed();

      // Very large trace array
      const instance = new ActrMemoryNative();
      const hugeTraces = generateTestTraces(100000);
      instance.computeActivation(hugeTraces, Date.now() / 1000);

      forceGC();
      const afterSingleOp = getHeapUsed();

      // The huge array should be released
      const growth = (afterSingleOp - initialMemory) / 1024 / 1024;

      console.log(`[Large Single Input] Memory after processing 100,000 traces: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(50);
    });

    it('should handle repeated state get/set without leaks', () => {
      const instance = new ActrMemoryNative();
      forceGC();
      const initialMemory = getHeapUsed();

      for (let i = 0; i < 10000; i++) {
        const state = instance.getState();
        instance.setState(state);
      }

      forceGC();
      const finalMemory = getHeapUsed();
      const growth = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`[State Get/Set] Memory growth after 10,000 cycles: ${growth.toFixed(2)}MB`);

      expect(growth).toBeLessThan(5);
    });
  });
});

// ============================================================================
// Summary Report
// ============================================================================

describe('Memory Test Summary', () => {
  it('should print memory usage summary', () => {
    const memUsage = process.memoryUsage();
    console.log('\n========================================');
    console.log('Final Memory Usage Summary:');
    console.log('========================================');
    console.log(`  Heap Used:     ${formatMB(memUsage.heapUsed)}MB`);
    console.log(`  Heap Total:    ${formatMB(memUsage.heapTotal)}MB`);
    console.log(`  RSS:           ${formatMB(memUsage.rss)}MB`);
    console.log(`  External:      ${formatMB(memUsage.external)}MB`);
    console.log(`  Array Buffers: ${formatMB(memUsage.arrayBuffers)}MB`);
    console.log('========================================\n');

    // This test always passes - it's just for reporting
    expect(true).toBe(true);
  });
});
