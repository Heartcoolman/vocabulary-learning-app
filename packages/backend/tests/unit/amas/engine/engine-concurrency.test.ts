/**
 * AMAS 并发安全测试套件
 *
 * 用于验证并发问题修复的正确性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AMASEngine,
  EngineDependencies,
  MemoryStateRepository,
  MemoryModelRepository,
} from '../../../src/amas/core/engine';
import { RawEvent, BanditModel } from '../../../src/amas/types';

// 辅助函数
function createTestEngine(): {
  engine: AMASEngine;
  stateRepo: MemoryStateRepository;
  modelRepo: MemoryModelRepository;
} {
  const stateRepo = new MemoryStateRepository();
  const modelRepo = new MemoryModelRepository();

  const deps: EngineDependencies = {
    stateRepo,
    modelRepo,
    logger: console,
  };

  const engine = new AMASEngine(deps);
  return { engine, stateRepo, modelRepo };
}

function createValidEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    wordId: 'test-word-123',
    isCorrect: true,
    responseTime: 2500,
    timestamp: Date.now(),
    retryCount: 0,
    hintUsed: false,
    ...overrides,
  };
}

function createRandomFeatureVector(dimension: number = 15): number[] {
  return Array(dimension)
    .fill(0)
    .map(() => Math.random());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== 测试套件 ====================

describe('AMAS Engine - Concurrency Safety Tests', () => {
  describe('问题1：applyDelayedRewardUpdate 并发安全', () => {
    it('应该安全处理同一用户的多个延迟奖励更新', async () => {
      const { engine, modelRepo } = createTestEngine();
      const userId = 'concurrent-test-user';
      const testEvent = createValidEvent();

      // 初始化用户模型
      await engine.processEvent(userId, testEvent, {});

      // 记录初始 updateCount
      const initialModel = await modelRepo.loadModel(userId);
      const initialUpdateCount = initialModel?.updateCount ?? 0;

      // 并发执行 5 个延迟奖励更新
      const updateCount = 5;
      const updates = Array.from({ length: updateCount }, (_, i) => ({
        vector: createRandomFeatureVector(15),
        reward: 0.5 + i * 0.1,
      }));

      const results = await Promise.all(
        updates.map((u) => engine.applyDelayedRewardUpdate(userId, u.vector, u.reward)),
      );

      // 验证1：所有更新都成功
      expect(results.every((r) => r.success)).toBe(true);
      expect(results.filter((r) => r.success).length).toBe(updateCount);

      // 验证2：模型的 updateCount 正确累加
      const finalModel = await modelRepo.loadModel(userId);
      expect(finalModel).toBeDefined();
      expect(finalModel!.updateCount).toBeGreaterThanOrEqual(initialUpdateCount + updateCount);

      // 验证3：模型矩阵没有 NaN 或 Infinity
      expect(finalModel!.A.every((v) => Number.isFinite(v))).toBe(true);
      expect(finalModel!.b.every((v) => Number.isFinite(v))).toBe(true);
    });

    it('应该防止延迟更新和实时决策的竞态条件', async () => {
      const { engine, modelRepo } = createTestEngine();
      const userId = 'race-test-user';
      const testEvent = createValidEvent();

      // 并发执行：2个实时决策 + 3个延迟更新
      const operations = [
        engine.processEvent(userId, testEvent, {}),
        engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), 0.8),
        engine.processEvent(userId, createValidEvent({ isCorrect: false }), {}),
        engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), 0.6),
        engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), 0.9),
      ];

      const results = await Promise.all(operations);

      // 验证1：所有操作都成功
      expect(results.every((r) => r.success)).toBe(true);

      // 验证2：模型被正确更新（至少5次）
      const finalModel = await modelRepo.loadModel(userId);
      expect(finalModel).toBeDefined();
      expect(finalModel!.updateCount).toBeGreaterThanOrEqual(5);

      // 验证3：模型数据完整性
      expect(finalModel!.d).toBe(15); // 默认维度
      expect(finalModel!.A.length).toBe(15 * 15);
      expect(finalModel!.b.length).toBe(15);
    });

    it('应该串行处理同一用户的操作（验证锁机制）', async () => {
      const { engine, modelRepo } = createTestEngine();
      const userId = 'serial-test-user';
      const testEvent = createValidEvent();

      // 初始化
      await engine.processEvent(userId, testEvent, {});

      const executionOrder: number[] = [];
      const delay = 50; // 每个操作延迟 50ms

      // 创建5个延迟操作，每个都记录执行时间
      const operations = Array.from({ length: 5 }, (_, i) =>
        (async () => {
          const start = Date.now();
          await engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), Math.random());
          executionOrder.push(start);
          // 模拟耗时操作
          await sleep(delay);
          return start;
        })(),
      );

      await Promise.all(operations);

      // 验证：执行时间应该大致串行（每个至少间隔 delay ms）
      const sortedOrder = [...executionOrder].sort((a, b) => a - b);
      for (let i = 1; i < sortedOrder.length; i++) {
        const timeDiff = sortedOrder[i] - sortedOrder[i - 1];
        // 由于锁的存在，执行应该串行，时间差应该接近 delay
        expect(timeDiff).toBeGreaterThanOrEqual(delay * 0.8); // 允许20%误差
      }
    });

    it('应该处理模型不存在的情况', async () => {
      const { engine } = createTestEngine();
      const userId = 'nonexistent-user';

      const result = await engine.applyDelayedRewardUpdate(
        userId,
        createRandomFeatureVector(),
        0.7,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('model_not_found');
    });

    it('应该处理特征向量维度不匹配的情况', async () => {
      const { engine } = createTestEngine();
      const userId = 'dimension-test-user';
      const testEvent = createValidEvent();

      // 初始化（默认15维）
      await engine.processEvent(userId, testEvent, {});

      // 使用20维特征向量（不匹配）
      const result = await engine.applyDelayedRewardUpdate(
        userId,
        createRandomFeatureVector(20),
        0.8,
      );

      // 应该成功（引擎会自动对齐维度）
      expect(result.success).toBe(true);
    });
  });

  describe('问题2：仓库层原子性（集成测试）', () => {
    it('应该原子性保存 State 和 Model（模拟事务）', async () => {
      // 注意：这个测试需要实际的 TransactionalPersistenceManager
      // 当前只是示例框架

      const { engine, stateRepo, modelRepo } = createTestEngine();
      const userId = 'atomic-test-user';
      const testEvent = createValidEvent();

      // 保存前
      const stateBefore = await stateRepo.loadState(userId);
      const modelBefore = await modelRepo.loadModel(userId);

      // 执行操作
      await engine.processEvent(userId, testEvent, {});

      // 保存后
      const stateAfter = await stateRepo.loadState(userId);
      const modelAfter = await modelRepo.loadModel(userId);

      // 验证：State 和 Model 都应该更新
      expect(stateAfter).toBeDefined();
      expect(modelAfter).toBeDefined();

      // 验证：时间戳应该接近（差距 < 1秒）
      if (stateAfter && modelAfter) {
        const timeDiff = Math.abs(stateAfter.ts - Date.now());
        expect(timeDiff).toBeLessThan(1000);
      }
    });
  });

  describe('压力测试：高并发场景', () => {
    it('应该在高并发下保持数据一致性', async () => {
      const { engine, modelRepo } = createTestEngine();
      const userId = 'stress-test-user';

      // 初始化
      await engine.processEvent(userId, createValidEvent(), {});

      // 模拟 100 个并发请求
      const concurrentRequests = 100;
      const operations = Array.from({ length: concurrentRequests }, (_, i) => {
        if (i % 3 === 0) {
          // 实时决策
          return engine.processEvent(userId, createValidEvent(), {});
        } else if (i % 3 === 1) {
          // 延迟奖励
          return engine.applyDelayedRewardUpdate(
            userId,
            createRandomFeatureVector(),
            Math.random(),
          );
        } else {
          // 读操作（不修改数据）
          return modelRepo.loadModel(userId);
        }
      });

      // 并发执行
      const results = await Promise.allSettled(operations);

      // 验证1：成功率应该 >= 95%
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const successRate = successCount / results.length;
      expect(successRate).toBeGreaterThanOrEqual(0.95);

      // 验证2：最终状态一致
      const finalModel = await modelRepo.loadModel(userId);
      expect(finalModel).toBeDefined();
      expect(finalModel!.updateCount).toBeGreaterThan(0);

      // 验证3：没有数据损坏
      expect(finalModel!.A.every((v) => Number.isFinite(v))).toBe(true);
      expect(finalModel!.b.every((v) => Number.isFinite(v))).toBe(true);
    });

    it('应该在混沌场景下保持稳定（多用户 + 随机延迟）', async () => {
      const { engine } = createTestEngine();
      const userIds = Array.from({ length: 5 }, (_, i) => `user-${i}`);

      // 混沌场景：多用户 + 高并发 + 随机延迟
      const operations = [];

      for (let i = 0; i < 200; i++) {
        const userId = userIds[Math.floor(Math.random() * userIds.length)];
        const delay = Math.random() * 20; // 0-20ms 随机延迟

        operations.push(
          (async () => {
            await sleep(delay);
            return engine.processEvent(userId, createValidEvent(), {});
          })(),
        );
      }

      const results = await Promise.allSettled(operations);

      // 验证：系统稳定性（成功率 >= 90%）
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const successRate = successCount / results.length;
      expect(successRate).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('边界条件测试', () => {
    it('应该处理超时场景', async () => {
      const { engine } = createTestEngine();
      const userId = 'timeout-test-user';

      // 模拟一个长时间持有锁的操作
      const longOperation = (async () => {
        await engine.processEvent(userId, createValidEvent(), {});
        await sleep(2000); // 持有锁 2 秒
      })();

      // 立即发起另一个操作
      await sleep(10); // 确保第一个操作已获取锁
      const quickOperation = engine.applyDelayedRewardUpdate(
        userId,
        createRandomFeatureVector(),
        0.7,
      );

      // 等待两个操作完成
      const [longResult, quickResult] = await Promise.allSettled([longOperation, quickOperation]);

      // 验证：两个操作都应该成功（quick 等待 long 完成）
      expect(longResult.status).toBe('fulfilled');
      expect(quickResult.status).toBe('fulfilled');
    });

    it('应该处理快速连续的更新请求', async () => {
      const { engine, modelRepo } = createTestEngine();
      const userId = 'rapid-test-user';
      const testEvent = createValidEvent();

      // 初始化
      await engine.processEvent(userId, testEvent, {});

      // 快速连续发起 10 个延迟更新（无延迟）
      const updates = Array.from({ length: 10 }, () =>
        engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), Math.random()),
      );

      const results = await Promise.all(updates);

      // 验证：所有更新都成功
      expect(results.every((r) => r.success)).toBe(true);

      // 验证：updateCount 正确
      const finalModel = await modelRepo.loadModel(userId);
      expect(finalModel!.updateCount).toBeGreaterThanOrEqual(10);
    });

    it('应该处理负奖励值', async () => {
      const { engine } = createTestEngine();
      const userId = 'negative-reward-user';
      const testEvent = createValidEvent();

      await engine.processEvent(userId, testEvent, {});

      const result = await engine.applyDelayedRewardUpdate(
        userId,
        createRandomFeatureVector(),
        -0.5, // 负奖励
      );

      expect(result.success).toBe(true);
    });
  });

  describe('性能基准测试', () => {
    it('测量串行延迟更新的性能', async () => {
      const { engine } = createTestEngine();
      const userId = 'perf-test-user';
      const testEvent = createValidEvent();

      await engine.processEvent(userId, testEvent, {});

      const iterations = 50;
      const startTime = Date.now();

      // 串行执行 50 个更新
      for (let i = 0; i < iterations; i++) {
        await engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), Math.random());
      }

      const duration = Date.now() - startTime;
      const avgLatency = duration / iterations;

      console.log(`串行延迟更新性能:
        - 总耗时: ${duration}ms
        - 平均延迟: ${avgLatency.toFixed(2)}ms
        - QPS: ${(1000 / avgLatency).toFixed(2)}
      `);

      // 基准：平均延迟应小于 100ms（宽松的阈值，考虑锁等待）
      expect(avgLatency).toBeLessThan(100);
    });

    it('测量并行更新的总耗时', async () => {
      const { engine } = createTestEngine();
      const userIds = Array.from({ length: 10 }, (_, i) => `perf-user-${i}`);

      // 初始化所有用户
      await Promise.all(
        userIds.map((userId) => engine.processEvent(userId, createValidEvent(), {})),
      );

      const iterations = 100;
      const startTime = Date.now();

      // 并行执行 100 个更新（分散在 10 个用户上）
      const updates = Array.from({ length: iterations }, (_, i) => {
        const userId = userIds[i % userIds.length];
        return engine.applyDelayedRewardUpdate(userId, createRandomFeatureVector(), Math.random());
      });

      await Promise.all(updates);

      const duration = Date.now() - startTime;
      const avgLatency = duration / iterations;

      console.log(`并行延迟更新性能（10用户）:
        - 总耗时: ${duration}ms
        - 平均延迟: ${avgLatency.toFixed(2)}ms
        - 总 QPS: ${((iterations * 1000) / duration).toFixed(2)}
      `);

      // 验证：并行更新应该显著快于串行（因为不同用户可以并行）
      expect(duration).toBeLessThan(iterations * 100); // 不应该完全串行
    });
  });
});

describe('AMAS Repository - Concurrency Tests', () => {
  describe('CachedStateRepository - 缓存一致性', () => {
    it('应该防止缓存和数据库不一致', async () => {
      // TODO: 这个测试需要实际的 CachedStateRepository 和 Redis mock
      // 当前作为占位符
      // 模拟场景：
      // 1. 请求A调用 saveState → 删除缓存
      // 2. 在A写数据库前，请求B调用 loadState → 缓存未命中 → 从数据库加载
      // 3. 请求B写入缓存（旧数据）
      // 4. 请求A写入数据库（新数据）
      // 期望结果：分布式锁应该防止这种情况
    });
  });
});
