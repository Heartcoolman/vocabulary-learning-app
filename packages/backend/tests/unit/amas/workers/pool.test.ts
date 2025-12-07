/**
 * Worker Pool Tests
 *
 * 测试 AMAS Worker Pool 核心功能：
 * 1. 单例模式 - getComputePool
 * 2. 池初始化与配置
 * 3. 池销毁 - destroyComputePool
 * 4. 状态检查 - isPoolInitialized
 * 5. 统计信息 - getPoolStats
 * 6. 任务执行 - runComputeTask
 * 7. 便捷方法 - runLinUCBSelect, runLinUCBUpdate, etc.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockLogger } from '../../../setup';

// Mock Piscina 实例
const mockPiscinaInstance = {
  run: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
  completed: 100,
  queueSize: 5,
  utilization: 0.5,
  waitTime: { mean: 10 },
  runTime: { mean: 50 },
  threads: [1, 2],
};

// Mock Piscina 类
class MockPiscina {
  run = mockPiscinaInstance.run;
  destroy = mockPiscinaInstance.destroy;
  get completed() { return mockPiscinaInstance.completed; }
  get queueSize() { return mockPiscinaInstance.queueSize; }
  get utilization() { return mockPiscinaInstance.utilization; }
  get waitTime() { return mockPiscinaInstance.waitTime; }
  get runTime() { return mockPiscinaInstance.runTime; }
  get threads() { return mockPiscinaInstance.threads; }
}

// 在模块加载前 mock
vi.mock('piscina', () => ({
  default: MockPiscina,
}));

vi.mock('../../../../src/logger', () => ({
  amasLogger: mockLogger,
}));

// 动态导入以确保 mock 生效
let getComputePool: typeof import('../../../../src/amas/workers/pool').getComputePool;
let destroyComputePool: typeof import('../../../../src/amas/workers/pool').destroyComputePool;
let isPoolInitialized: typeof import('../../../../src/amas/workers/pool').isPoolInitialized;
let getPoolStats: typeof import('../../../../src/amas/workers/pool').getPoolStats;
let runComputeTask: typeof import('../../../../src/amas/workers/pool').runComputeTask;
let runLinUCBSelect: typeof import('../../../../src/amas/workers/pool').runLinUCBSelect;
let runLinUCBUpdate: typeof import('../../../../src/amas/workers/pool').runLinUCBUpdate;
let runBayesianSuggest: typeof import('../../../../src/amas/workers/pool').runBayesianSuggest;
let runCholeskyDecompose: typeof import('../../../../src/amas/workers/pool').runCholeskyDecompose;
let runCholeskyRank1Update: typeof import('../../../../src/amas/workers/pool').runCholeskyRank1Update;

describe('ComputePool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 重置模块以清除单例状态
    vi.resetModules();

    // 重新 mock
    vi.doMock('piscina', () => ({
      default: MockPiscina,
    }));

    vi.doMock('../../../../src/logger', () => ({
      amasLogger: mockLogger,
    }));

    // 重新导入模块
    const poolModule = await import('../../../../src/amas/workers/pool');
    getComputePool = poolModule.getComputePool;
    destroyComputePool = poolModule.destroyComputePool;
    isPoolInitialized = poolModule.isPoolInitialized;
    getPoolStats = poolModule.getPoolStats;
    runComputeTask = poolModule.runComputeTask;
    runLinUCBSelect = poolModule.runLinUCBSelect;
    runLinUCBUpdate = poolModule.runLinUCBUpdate;
    runBayesianSuggest = poolModule.runBayesianSuggest;
    runCholeskyDecompose = poolModule.runCholeskyDecompose;
    runCholeskyRank1Update = poolModule.runCholeskyRank1Update;
  });

  afterEach(async () => {
    // 确保每个测试后销毁池
    try {
      await destroyComputePool();
    } catch {
      // 忽略销毁错误
    }
  });

  // ==================== 单例模式测试 ====================

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const pool1 = getComputePool();
      const pool2 = getComputePool();

      expect(pool1).toBe(pool2);
    });

    it('should initialize pool lazily', () => {
      expect(isPoolInitialized()).toBe(false);

      getComputePool();

      expect(isPoolInitialized()).toBe(true);
    });

    it('should only apply config on first initialization', () => {
      // 第一次带配置
      getComputePool({ minThreads: 2, maxThreads: 4 });

      // 第二次带不同配置 - 应该返回同一个实例
      const pool2 = getComputePool({ minThreads: 1, maxThreads: 8 });

      expect(pool2).toBeDefined();
      // 验证仍然是单例
      expect(isPoolInitialized()).toBe(true);
    });
  });

  // ==================== 池初始化测试 ====================

  describe('Pool Initialization', () => {
    it('should initialize with valid configuration', () => {
      const pool = getComputePool();

      expect(pool).toBeDefined();
      expect(isPoolInitialized()).toBe(true);
    });

    it('should apply custom config', () => {
      const pool = getComputePool({
        minThreads: 2,
        maxThreads: 8,
        idleTimeout: 60000,
      });

      expect(pool).toBeDefined();
    });

    it('should log initialization', () => {
      getComputePool();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          minThreads: expect.any(Number),
          maxThreads: expect.any(Number),
        }),
        expect.stringContaining('Worker 池已初始化')
      );
    });
  });

  // ==================== 池销毁测试 ====================

  describe('Pool Destruction', () => {
    it('should destroy pool and reset state', async () => {
      getComputePool();
      expect(isPoolInitialized()).toBe(true);

      await destroyComputePool();

      expect(isPoolInitialized()).toBe(false);
      expect(mockPiscinaInstance.destroy).toHaveBeenCalled();
    });

    it('should log destruction', async () => {
      getComputePool();
      await destroyComputePool();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('正在销毁 Worker 池')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Worker 池已销毁')
      );
    });

    it('should handle destroy when pool not initialized', async () => {
      expect(isPoolInitialized()).toBe(false);

      // 不应该抛出错误
      await expect(destroyComputePool()).resolves.not.toThrow();
    });

    it('should allow re-initialization after destruction', async () => {
      getComputePool();
      await destroyComputePool();

      expect(isPoolInitialized()).toBe(false);

      // 重新初始化
      const pool = getComputePool();

      expect(isPoolInitialized()).toBe(true);
      expect(pool).toBeDefined();
    });
  });

  // ==================== 状态检查测试 ====================

  describe('Pool Status Check', () => {
    it('should return false when not initialized', () => {
      expect(isPoolInitialized()).toBe(false);
    });

    it('should return true after initialization', () => {
      getComputePool();
      expect(isPoolInitialized()).toBe(true);
    });

    it('should return false after destruction', async () => {
      getComputePool();
      await destroyComputePool();
      expect(isPoolInitialized()).toBe(false);
    });
  });

  // ==================== 统计信息测试 ====================

  describe('Pool Statistics', () => {
    it('should return empty stats when pool not initialized', () => {
      const stats = getPoolStats();

      expect(stats).toEqual({
        completed: 0,
        pending: 0,
        running: 0,
        waitTime: 0,
        runTime: 0,
        threads: 0,
      });
    });

    it('should return pool stats when initialized', () => {
      getComputePool();

      const stats = getPoolStats();

      expect(stats.completed).toBe(100);
      expect(stats.pending).toBe(5);
      expect(stats.waitTime).toBe(10);
      expect(stats.runTime).toBe(50);
      expect(stats.threads).toBe(2);
    });

    it('should calculate running tasks from utilization', () => {
      getComputePool({ maxThreads: 4 });

      const stats = getPoolStats();

      // utilization 是 0.5，运行中的任务数等于 utilization * maxThreads
      expect(typeof stats.running).toBe('number');
    });
  });

  // ==================== 任务执行测试 ====================

  describe('Task Execution', () => {
    it('should execute task through pool', async () => {
      const expectedResult = { bestIndex: 0, score: 1.5 };
      mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

      const task = {
        type: 'linucb_select' as const,
        payload: { model: {}, featureVectors: [] },
      };

      const result = await runComputeTask(task);

      expect(mockPiscinaInstance.run).toHaveBeenCalledWith(
        task,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
      expect(result).toEqual(expectedResult);
    });

    it('should log and rethrow error on task failure', async () => {
      const error = new Error('Task execution failed');
      mockPiscinaInstance.run.mockRejectedValueOnce(error);

      const task = {
        type: 'linucb_update' as const,
        payload: {},
      };

      await expect(runComputeTask(task)).rejects.toThrow('Task execution failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'linucb_update',
          error,
        }),
        expect.stringContaining('任务执行失败')
      );
    });

    it('should handle timeout', async () => {
      // 模拟超时
      mockPiscinaInstance.run.mockRejectedValueOnce(new Error('Timeout'));

      const task = {
        type: 'bayesian_suggest' as const,
        payload: {},
      };

      await expect(runComputeTask(task)).rejects.toThrow();
    });
  });

  // ==================== 便捷方法测试 ====================

  describe('Convenience Methods', () => {
    describe('runLinUCBSelect', () => {
      it('should run linucb_select task', async () => {
        const expectedResult = {
          bestIndex: 1,
          score: 2.5,
          confidence: 0.8,
          exploitation: 1.7,
        };
        mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

        const payload = {
          model: {
            d: 3,
            alpha: 1.0,
            A: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            b: [0, 0, 0],
            L: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          },
          featureVectors: [[1, 0, 0], [0, 1, 0]],
        };

        const result = await runLinUCBSelect(payload);

        expect(mockPiscinaInstance.run).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'linucb_select',
            payload,
          }),
          expect.any(Object)
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('runLinUCBUpdate', () => {
      it('should run linucb_update task', async () => {
        const expectedResult = {
          A: [2, 0, 0, 1],
          b: [0.5, 0],
          L: [1.41, 0, 0, 1],
          success: true,
        };
        mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

        const payload = {
          model: {
            d: 2,
            lambda: 1.0,
            A: [1, 0, 0, 1],
            b: [0, 0],
            L: [1, 0, 0, 1],
          },
          featureVector: [1, 0],
          reward: 0.5,
        };

        const result = await runLinUCBUpdate(payload);

        expect(mockPiscinaInstance.run).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'linucb_update',
            payload,
          }),
          expect.any(Object)
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('runBayesianSuggest', () => {
      it('should run bayesian_suggest task', async () => {
        const expectedResult = {
          nextPoint: [0.7, 0.3],
          acquisitionValue: 1.2,
        };
        mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

        const payload = {
          observations: [
            { params: [0.5, 0.5], value: 0.8 },
          ],
          paramBounds: [
            { min: 0, max: 1 },
            { min: 0, max: 1 },
          ],
          lengthScale: [0.1, 0.1],
          outputVariance: 1.0,
          noiseVariance: 0.01,
          beta: 2.0,
        };

        const result = await runBayesianSuggest(payload);

        expect(mockPiscinaInstance.run).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'bayesian_suggest',
            payload,
          }),
          expect.any(Object)
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('runCholeskyDecompose', () => {
      it('should run cholesky_decompose task', async () => {
        const expectedResult = {
          L: [2, 0, 1, 2],
          success: true,
        };
        mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

        const payload = {
          matrix: [4, 2, 2, 5],
          d: 2,
          lambda: 0.01,
        };

        const result = await runCholeskyDecompose(payload);

        expect(mockPiscinaInstance.run).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'cholesky_decompose',
            payload,
          }),
          expect.any(Object)
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('runCholeskyRank1Update', () => {
      it('should run cholesky_rank1_update task', async () => {
        const expectedResult = {
          L: [1.41, 0, 0.35, 1.02],
          success: true,
        };
        mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

        const payload = {
          L: [1, 0, 0, 1],
          x: [0.5, 0.5],
          d: 2,
          minDiag: 1e-6,
        };

        const result = await runCholeskyRank1Update(payload);

        expect(mockPiscinaInstance.run).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'cholesky_rank1_update',
            payload,
          }),
          expect.any(Object)
        );
        expect(result).toEqual(expectedResult);
      });
    });
  });

  // ==================== 并发测试 ====================

  describe('Concurrency', () => {
    it('should handle multiple concurrent tasks', async () => {
      const results = [
        { bestIndex: 0, score: 1.0, confidence: 0.5, exploitation: 0.5 },
        { bestIndex: 1, score: 1.5, confidence: 0.6, exploitation: 0.9 },
        { bestIndex: 2, score: 2.0, confidence: 0.7, exploitation: 1.3 },
      ];

      let callIndex = 0;
      mockPiscinaInstance.run.mockImplementation(() => {
        return Promise.resolve(results[callIndex++]);
      });

      const tasks = [
        runLinUCBSelect({
          model: { d: 2, alpha: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
          featureVectors: [[1, 0]],
        }),
        runLinUCBSelect({
          model: { d: 2, alpha: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
          featureVectors: [[0, 1]],
        }),
        runLinUCBSelect({
          model: { d: 2, alpha: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
          featureVectors: [[1, 1]],
        }),
      ];

      const allResults = await Promise.all(tasks);

      expect(allResults).toHaveLength(3);
      expect(mockPiscinaInstance.run).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed task types concurrently', async () => {
      mockPiscinaInstance.run.mockImplementation((task: any) => {
        switch (task.type) {
          case 'linucb_select':
            return Promise.resolve({ bestIndex: 0, score: 1.0, confidence: 0.5, exploitation: 0.5 });
          case 'linucb_update':
            return Promise.resolve({ A: [], b: [], L: [], success: true });
          case 'bayesian_suggest':
            return Promise.resolve({ nextPoint: [0.5], acquisitionValue: 1.0 });
          default:
            return Promise.resolve({});
        }
      });

      const tasks = [
        runLinUCBSelect({
          model: { d: 2, alpha: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
          featureVectors: [[1, 0]],
        }),
        runLinUCBUpdate({
          model: { d: 2, lambda: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
          featureVector: [1, 0],
          reward: 0.5,
        }),
        runBayesianSuggest({
          observations: [],
          paramBounds: [{ min: 0, max: 1 }],
          lengthScale: [0.1],
          outputVariance: 1,
          noiseVariance: 0.01,
          beta: 2,
        }),
      ];

      const results = await Promise.all(tasks);

      expect(results[0]).toHaveProperty('bestIndex');
      expect(results[1]).toHaveProperty('success');
      expect(results[2]).toHaveProperty('nextPoint');
    });
  });

  // ==================== 错误处理测试 ====================

  describe('Error Handling', () => {
    it('should propagate task execution errors', async () => {
      const error = new Error('Worker crashed');
      mockPiscinaInstance.run.mockRejectedValueOnce(error);

      await expect(runLinUCBSelect({
        model: { d: 2, alpha: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
        featureVectors: [[1, 0]],
      })).rejects.toThrow('Worker crashed');
    });

    it('should log task type on error', async () => {
      const error = new Error('Computation error');
      mockPiscinaInstance.run.mockRejectedValueOnce(error);

      try {
        await runCholeskyDecompose({
          matrix: [1, 0, 0, 1],
          d: 2,
          lambda: 0.01,
        });
      } catch {
        // 预期会抛出错误
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'cholesky_decompose',
        }),
        expect.any(String)
      );
    });

    it('should handle abort signal timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockPiscinaInstance.run.mockRejectedValueOnce(abortError);

      await expect(runLinUCBUpdate({
        model: { d: 2, lambda: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
        featureVector: [1, 0],
        reward: 0.5,
      })).rejects.toThrow();
    });
  });

  // ==================== 类型安全测试 ====================

  describe('Type Safety', () => {
    it('should return correctly typed LinUCBSelectResult', async () => {
      const expectedResult = {
        bestIndex: 0,
        score: 1.5,
        confidence: 0.8,
        exploitation: 0.7,
      };
      mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

      const result = await runLinUCBSelect({
        model: { d: 2, alpha: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
        featureVectors: [[1, 0]],
      });

      // TypeScript 编译时检查
      const bestIndex: number = result.bestIndex;
      const score: number = result.score;
      const confidence: number = result.confidence;
      const exploitation: number = result.exploitation;

      expect(typeof bestIndex).toBe('number');
      expect(typeof score).toBe('number');
      expect(typeof confidence).toBe('number');
      expect(typeof exploitation).toBe('number');
    });

    it('should return correctly typed LinUCBUpdateResult', async () => {
      const expectedResult = {
        A: [2, 0, 0, 1],
        b: [0.5, 0],
        L: [1.41, 0, 0, 1],
        success: true,
      };
      mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

      const result = await runLinUCBUpdate({
        model: { d: 2, lambda: 1, A: [1, 0, 0, 1], b: [0, 0], L: [1, 0, 0, 1] },
        featureVector: [1, 0],
        reward: 0.5,
      });

      expect(Array.isArray(result.A)).toBe(true);
      expect(Array.isArray(result.b)).toBe(true);
      expect(Array.isArray(result.L)).toBe(true);
      expect(typeof result.success).toBe('boolean');
    });

    it('should return correctly typed BayesianSuggestResult', async () => {
      const expectedResult = {
        nextPoint: [0.5, 0.3],
        acquisitionValue: 1.2,
      };
      mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

      const result = await runBayesianSuggest({
        observations: [],
        paramBounds: [{ min: 0, max: 1 }, { min: 0, max: 1 }],
        lengthScale: [0.1, 0.1],
        outputVariance: 1,
        noiseVariance: 0.01,
        beta: 2,
      });

      expect(Array.isArray(result.nextPoint)).toBe(true);
      expect(typeof result.acquisitionValue).toBe('number');
    });

    it('should return correctly typed CholeskyDecomposeResult', async () => {
      const expectedResult = {
        L: [2, 0, 1, 2],
        success: true,
      };
      mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

      const result = await runCholeskyDecompose({
        matrix: [4, 2, 2, 5],
        d: 2,
        lambda: 0.01,
      });

      expect(Array.isArray(result.L)).toBe(true);
      expect(typeof result.success).toBe('boolean');
    });

    it('should return correctly typed CholeskyRank1UpdateResult', async () => {
      const expectedResult = {
        L: [1.41, 0, 0.35, 1.02],
        success: true,
      };
      mockPiscinaInstance.run.mockResolvedValueOnce(expectedResult);

      const result = await runCholeskyRank1Update({
        L: [1, 0, 0, 1],
        x: [0.5, 0.5],
        d: 2,
      });

      expect(Array.isArray(result.L)).toBe(true);
      expect(typeof result.success).toBe('boolean');
    });
  });
});
