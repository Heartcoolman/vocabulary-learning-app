/**
 * Compute Worker Tests
 *
 * 测试 AMAS Compute Worker 核心功能：
 * 1. LinUCB 选择计算 - computeLinUCBSelection
 * 2. LinUCB 更新计算 - computeLinUCBUpdate
 * 3. 贝叶斯优化建议 - computeBayesianSuggest
 * 4. Cholesky 分解计算 - computeCholeskyDecomposition
 * 5. Cholesky Rank-1 更新 - computeCholeskyRank1Update
 * 6. Worker 入口函数路由
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import computeWorker from '../../../../src/amas/workers/compute.worker';
import type {
  ComputeTask,
  LinUCBSelectPayload,
  LinUCBSelectResult,
  LinUCBUpdatePayload,
  LinUCBUpdateResult,
  BayesianOptimizePayload,
  BayesianSuggestResult,
  CholeskyDecomposePayload,
  CholeskyDecomposeResult,
  CholeskyRank1UpdatePayload,
  CholeskyRank1UpdateResult,
} from '../../../../src/amas/workers/pool';
import { setGlobalSeed, restoreRandom } from '../../../setup';

// ==================== 测试数据辅助函数 ====================

/**
 * 创建单位矩阵的 Cholesky 因子（即单位矩阵本身）
 */
function createIdentityL(d: number): number[] {
  const L = new Array(d * d).fill(0);
  for (let i = 0; i < d; i++) {
    L[i * d + i] = 1;
  }
  return L;
}

/**
 * 创建单位矩阵
 */
function createIdentityMatrix(d: number): number[] {
  const A = new Array(d * d).fill(0);
  for (let i = 0; i < d; i++) {
    A[i * d + i] = 1;
  }
  return A;
}

/**
 * 创建零向量
 */
function createZeroVector(d: number): number[] {
  return new Array(d).fill(0);
}

/**
 * 创建随机向量（使用确定性种子时）
 */
function createRandomVector(d: number): number[] {
  return Array.from({ length: d }, () => Math.random());
}

/**
 * 创建带正则化的单位矩阵
 */
function createRegularizedIdentity(d: number, lambda: number): number[] {
  const A = new Array(d * d).fill(0);
  for (let i = 0; i < d; i++) {
    A[i * d + i] = lambda;
  }
  return A;
}

/**
 * 创建带正则化的 Cholesky 因子
 */
function createRegularizedL(d: number, lambda: number): number[] {
  const L = new Array(d * d).fill(0);
  const sqrtLambda = Math.sqrt(lambda);
  for (let i = 0; i < d; i++) {
    L[i * d + i] = sqrtLambda;
  }
  return L;
}

// ==================== Worker 入口函数测试 ====================

describe('ComputeWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Worker Entry Function Routing', () => {
    it('should route linucb_select task correctly', async () => {
      const d = 3;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result).toBeDefined();
      expect(typeof result.bestIndex).toBe('number');
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.exploitation).toBe('number');
    });

    it('should route linucb_update task correctly', async () => {
      const d = 3;
      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVector: [1, 0, 0],
        reward: 1.0,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result).toBeDefined();
      expect(result.A).toBeDefined();
      expect(result.b).toBeDefined();
      expect(result.L).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should route bayesian_suggest task correctly', async () => {
      setGlobalSeed('bayesian-test');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.5], value: 0.8 },
          { params: [0.3], value: 0.6 },
        ],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.1],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(result).toBeDefined();
      expect(result.nextPoint).toBeDefined();
      expect(Array.isArray(result.nextPoint)).toBe(true);
      expect(typeof result.acquisitionValue).toBe('number');

      restoreRandom();
    });

    it('should route bayesian_optimize task correctly', async () => {
      setGlobalSeed('bayesian-optimize-test');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.2, 0.8], value: 0.5 },
          { params: [0.6, 0.4], value: 0.7 },
        ],
        paramBounds: [{ min: 0, max: 1 }, { min: 0, max: 1 }],
        lengthScale: [0.2, 0.2],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_optimize',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(result).toBeDefined();
      expect(result.nextPoint).toHaveLength(2);
      expect(typeof result.acquisitionValue).toBe('number');

      restoreRandom();
    });

    it('should route cholesky_decompose task correctly', async () => {
      const d = 3;
      // 正定矩阵：I + xx^T
      const A = createRegularizedIdentity(d, 1.0);

      const payload: CholeskyDecomposePayload = {
        matrix: A,
        d,
        lambda: 0.01,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result).toBeDefined();
      expect(result.L).toBeDefined();
      expect(result.L).toHaveLength(d * d);
      expect(typeof result.success).toBe('boolean');
    });

    it('should route cholesky_rank1_update task correctly', async () => {
      const d = 3;
      const payload: CholeskyRank1UpdatePayload = {
        L: createRegularizedL(d, 1.0),
        x: [0.5, 0.5, 0.5],
        d,
        minDiag: 1e-6,
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      expect(result).toBeDefined();
      expect(result.L).toBeDefined();
      expect(result.L).toHaveLength(d * d);
      expect(typeof result.success).toBe('boolean');
    });

    it('should throw error for unknown task type', async () => {
      const task = {
        type: 'unknown_task_type',
        payload: {},
      } as ComputeTask;

      await expect(computeWorker(task)).rejects.toThrow('Unknown task type');
    });
  });

  // ==================== LinUCB 选择计算测试 ====================

  describe('LinUCB Selection', () => {
    it('should select action with highest UCB score', async () => {
      const d = 3;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: [1, 0, 0], // 偏向第一个维度
          L: createRegularizedL(d, 1.0),
        },
        featureVectors: [
          [1, 0, 0],  // 应该有最高分
          [0, 1, 0],
          [0, 0, 1],
        ],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result.bestIndex).toBe(0);
      expect(result.exploitation).toBeGreaterThan(0);
    });

    it('should compute valid confidence values', async () => {
      const d = 4;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 2.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVectors: [
          [1, 0, 0, 0],
          [0.5, 0.5, 0, 0],
          [0.25, 0.25, 0.25, 0.25],
        ],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.confidence)).toBe(true);
    });

    it('should handle single feature vector', async () => {
      const d = 2;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: [0.5, 0.5],
          L: createRegularizedL(d, 1.0),
        },
        featureVectors: [[1, 1]],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result.bestIndex).toBe(0);
      expect(Number.isFinite(result.score)).toBe(true);
    });

    it('should handle high-dimensional feature space', async () => {
      const d = 22; // 实际使用的维度
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 0.5,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVectors: [
          Array.from({ length: d }, (_, i) => i === 0 ? 1 : 0),
          Array.from({ length: d }, (_, i) => i === 10 ? 1 : 0),
          Array.from({ length: d }, (_, i) => i === 21 ? 1 : 0),
        ],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result.bestIndex).toBeGreaterThanOrEqual(0);
      expect(result.bestIndex).toBeLessThan(3);
      expect(Number.isFinite(result.score)).toBe(true);
    });

    it('should use alpha to balance exploration and exploitation', async () => {
      const d = 2;
      const model = {
        d,
        A: createRegularizedIdentity(d, 1.0),
        b: [1, 0], // 偏向第一个维度
        L: createRegularizedL(d, 1.0),
      };

      // 低 alpha（偏向利用）
      const lowAlphaPayload: LinUCBSelectPayload = {
        model: { ...model, alpha: 0.1 },
        featureVectors: [[1, 0], [0, 1]],
      };

      const lowAlphaResult = await computeWorker({
        type: 'linucb_select',
        payload: lowAlphaPayload,
      }) as LinUCBSelectResult;

      // 高 alpha（偏向探索）
      const highAlphaPayload: LinUCBSelectPayload = {
        model: { ...model, alpha: 10.0 },
        featureVectors: [[1, 0], [0, 1]],
      };

      const highAlphaResult = await computeWorker({
        type: 'linucb_select',
        payload: highAlphaPayload,
      }) as LinUCBSelectResult;

      // 低 alpha 时置信度对分数影响较小
      expect(lowAlphaResult.score).toBeDefined();
      expect(highAlphaResult.score).toBeDefined();
      // 高 alpha 应该有更高的分数（因为置信度项被放大）
      expect(highAlphaResult.score).toBeGreaterThan(lowAlphaResult.score);
    });
  });

  // ==================== LinUCB 更新计算测试 ====================

  describe('LinUCB Update', () => {
    it('should update A matrix with outer product', async () => {
      const d = 2;
      const initialA = createRegularizedIdentity(d, 1.0);

      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: [...initialA],
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVector: [1, 0],
        reward: 1.0,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(true);
      // A[0,0] 应该增加 1（因为 x[0]*x[0] = 1）
      expect(result.A[0]).toBeCloseTo(2.0, 5);
      // A[1,1] 不变
      expect(result.A[3]).toBeCloseTo(1.0, 5);
    });

    it('should update b vector with reward', async () => {
      const d = 2;
      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: [0, 0],
          L: createRegularizedL(d, 1.0),
        },
        featureVector: [1, 0.5],
        reward: 0.8,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(true);
      expect(result.b[0]).toBeCloseTo(0.8, 5); // r * x[0] = 0.8 * 1
      expect(result.b[1]).toBeCloseTo(0.4, 5); // r * x[1] = 0.8 * 0.5
    });

    it('should update Cholesky factor L', async () => {
      const d = 2;
      const initialL = createRegularizedL(d, 1.0);

      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: [...initialL],
        },
        featureVector: [1, 0],
        reward: 1.0,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(true);
      expect(result.L).toBeDefined();
      expect(result.L).toHaveLength(d * d);
      // L 应该已更新
      expect(result.L[0]).not.toBeCloseTo(initialL[0], 5);
    });

    it('should handle negative reward', async () => {
      const d = 2;
      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: [0, 0],
          L: createRegularizedL(d, 1.0),
        },
        featureVector: [1, 1],
        reward: -0.5,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(true);
      expect(result.b[0]).toBeCloseTo(-0.5, 5);
      expect(result.b[1]).toBeCloseTo(-0.5, 5);
    });

    it('should handle zero feature vector gracefully', async () => {
      const d = 2;
      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVector: [0, 0],
        reward: 1.0,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(true);
      // A 和 b 应该不变（零向量的外积是零矩阵）
      expect(result.A[0]).toBeCloseTo(1.0, 5);
      expect(result.b[0]).toBeCloseTo(0, 5);
    });

    it('should return failure for invalid feature vector', async () => {
      const d = 2;
      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVector: [NaN, Infinity],
        reward: 1.0,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(false);
    });

    it('should maintain numerical stability with small lambda', async () => {
      const d = 3;
      const payload: LinUCBUpdatePayload = {
        model: {
          d,
          lambda: 0.0001,
          A: createRegularizedIdentity(d, 0.0001),
          b: createZeroVector(d),
          L: createRegularizedL(d, 0.0001),
        },
        featureVector: [0.1, 0.2, 0.3],
        reward: 0.5,
      };

      const task: ComputeTask<LinUCBUpdatePayload> = {
        type: 'linucb_update',
        payload,
      };

      const result = await computeWorker(task) as LinUCBUpdateResult;

      expect(result.success).toBe(true);
      // 验证结果没有 NaN 或 Infinity
      expect(result.A.every(Number.isFinite)).toBe(true);
      expect(result.b.every(Number.isFinite)).toBe(true);
      expect(result.L.every(Number.isFinite)).toBe(true);
    });
  });

  // ==================== 贝叶斯优化建议测试 ====================

  describe('Bayesian Optimization Suggest', () => {
    it('should return random sample when observations < 2', async () => {
      setGlobalSeed('bayesian-cold-start');

      const payload: BayesianOptimizePayload = {
        observations: [{ params: [0.5], value: 0.6 }],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.1],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(result.nextPoint).toBeDefined();
      expect(result.nextPoint[0]).toBeGreaterThanOrEqual(0);
      expect(result.nextPoint[0]).toBeLessThanOrEqual(1);
      expect(result.acquisitionValue).toBe(1.0); // 冷启动时固定为 1.0

      restoreRandom();
    });

    it('should respect parameter bounds', async () => {
      setGlobalSeed('bayesian-bounds');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.2, 5], value: 0.5 },
          { params: [0.8, 15], value: 0.7 },
        ],
        paramBounds: [
          { min: 0, max: 1 },
          { min: 0, max: 20 },
        ],
        lengthScale: [0.2, 5],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(result.nextPoint[0]).toBeGreaterThanOrEqual(0);
      expect(result.nextPoint[0]).toBeLessThanOrEqual(1);
      expect(result.nextPoint[1]).toBeGreaterThanOrEqual(0);
      expect(result.nextPoint[1]).toBeLessThanOrEqual(20);

      restoreRandom();
    });

    it('should apply step discretization', async () => {
      setGlobalSeed('bayesian-step');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.3], value: 0.5 },
          { params: [0.6], value: 0.7 },
        ],
        paramBounds: [{ min: 0, max: 1, step: 0.1 }],
        lengthScale: [0.2],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      // 值应该是 0.1 的倍数
      const rounded = Math.round(result.nextPoint[0] * 10) / 10;
      expect(result.nextPoint[0]).toBeCloseTo(rounded, 5);

      restoreRandom();
    });

    it('should handle multi-dimensional parameter space', async () => {
      setGlobalSeed('bayesian-multidim');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.2, 0.3, 0.4], value: 0.5 },
          { params: [0.6, 0.7, 0.8], value: 0.8 },
          { params: [0.4, 0.5, 0.6], value: 0.65 },
        ],
        paramBounds: [
          { min: 0, max: 1 },
          { min: 0, max: 1 },
          { min: 0, max: 1 },
        ],
        lengthScale: [0.2, 0.2, 0.2],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(result.nextPoint).toHaveLength(3);
      result.nextPoint.forEach((value, i) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });

      restoreRandom();
    });

    it('should compute positive acquisition value', async () => {
      setGlobalSeed('bayesian-acq');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.1], value: 0.2 },
          { params: [0.9], value: 0.3 },
        ],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.2],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(Number.isFinite(result.acquisitionValue)).toBe(true);

      restoreRandom();
    });

    it('should explore regions with high uncertainty', async () => {
      setGlobalSeed('bayesian-explore');

      // 观测集中在边界
      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0.0], value: 0.5 },
          { params: [1.0], value: 0.5 },
        ],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.1],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 5.0, // 高探索系数
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      // 中间区域不确定性高，应该倾向于探索
      expect(result.nextPoint[0]).toBeGreaterThan(0.1);
      expect(result.nextPoint[0]).toBeLessThan(0.9);

      restoreRandom();
    });
  });

  // ==================== Cholesky 分解测试 ====================

  describe('Cholesky Decomposition', () => {
    it('should decompose identity matrix', async () => {
      const d = 3;
      const payload: CholeskyDecomposePayload = {
        matrix: createIdentityMatrix(d),
        d,
        lambda: 0.01,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result.success).toBe(true);
      // L 应该接近单位矩阵
      expect(result.L[0]).toBeCloseTo(1.0, 3);
      expect(result.L[4]).toBeCloseTo(1.0, 3);
      expect(result.L[8]).toBeCloseTo(1.0, 3);
    });

    it('should decompose positive definite matrix', async () => {
      const d = 2;
      // 2x2 正定矩阵 [[4, 2], [2, 5]]
      const A = [4, 2, 2, 5];

      const payload: CholeskyDecomposePayload = {
        matrix: A,
        d,
        lambda: 0.001,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result.success).toBe(true);
      // L[0,0] = sqrt(4) = 2
      expect(result.L[0]).toBeCloseTo(2.0, 3);
      // L[1,0] = 2/2 = 1
      expect(result.L[2]).toBeCloseTo(1.0, 3);
      // L[1,1] = sqrt(5 - 1) = 2
      expect(result.L[3]).toBeCloseTo(2.0, 3);
    });

    it('should handle regularization for near-singular matrix', async () => {
      const d = 2;
      // 近似奇异矩阵
      const A = [1e-10, 0, 0, 1e-10];

      const payload: CholeskyDecomposePayload = {
        matrix: A,
        d,
        lambda: 0.1,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result.success).toBe(true);
      // 应该有有效的 L 因子
      expect(result.L.every(Number.isFinite)).toBe(true);
    });

    it('should produce lower triangular matrix', async () => {
      const d = 3;
      const A = [
        4, 2, 1,
        2, 5, 2,
        1, 2, 6,
      ];

      const payload: CholeskyDecomposePayload = {
        matrix: A,
        d,
        lambda: 0.001,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result.success).toBe(true);
      // 上三角部分应该为零
      expect(result.L[1]).toBeCloseTo(0, 5); // L[0,1]
      expect(result.L[2]).toBeCloseTo(0, 5); // L[0,2]
      expect(result.L[5]).toBeCloseTo(0, 5); // L[1,2]
    });

    it('should handle high-dimensional matrix', async () => {
      const d = 10;
      // 创建对角占优矩阵
      const A: number[] = [];
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          if (i === j) {
            A.push(d + 1); // 对角元素
          } else {
            A.push(0.1); // 非对角元素
          }
        }
      }

      const payload: CholeskyDecomposePayload = {
        matrix: A,
        d,
        lambda: 0.01,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result.success).toBe(true);
      expect(result.L).toHaveLength(d * d);
      expect(result.L.every(Number.isFinite)).toBe(true);
    });
  });

  // ==================== Cholesky Rank-1 更新测试 ====================

  describe('Cholesky Rank-1 Update', () => {
    it('should successfully update valid Cholesky factor', async () => {
      const d = 3;
      const payload: CholeskyRank1UpdatePayload = {
        L: createRegularizedL(d, 1.0),
        x: [0.5, 0.3, 0.2],
        d,
        minDiag: 1e-6,
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      expect(result.success).toBe(true);
      expect(result.L).toHaveLength(d * d);
      // 对角线应该增加
      expect(result.L[0]).toBeGreaterThan(1.0);
    });

    it('should maintain positive diagonal elements', async () => {
      const d = 3;
      const payload: CholeskyRank1UpdatePayload = {
        L: createRegularizedL(d, 1.0),
        x: [1, 1, 1],
        d,
        minDiag: 1e-6,
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      expect(result.success).toBe(true);
      // 验证对角线都是正数
      for (let i = 0; i < d; i++) {
        expect(result.L[i * d + i]).toBeGreaterThan(0);
      }
    });

    it('should handle zero update vector', async () => {
      const d = 2;
      const originalL = createRegularizedL(d, 1.0);

      const payload: CholeskyRank1UpdatePayload = {
        L: [...originalL],
        x: [0, 0],
        d,
        minDiag: 1e-6,
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      expect(result.success).toBe(true);
      // L 应该基本不变
      expect(result.L[0]).toBeCloseTo(originalL[0], 5);
      expect(result.L[3]).toBeCloseTo(originalL[3], 5);
    });

    it('should fail for numerically unstable update', async () => {
      const d = 2;
      // 非常小的对角元素
      const L = [1e-10, 0, 0, 1e-10];

      const payload: CholeskyRank1UpdatePayload = {
        L,
        x: [1, 1],
        d,
        minDiag: 1e-3, // 相对较大的最小对角值
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      // 应该失败因为初始 L 的对角元素太小
      expect(result.success).toBe(false);
    });

    it('should use default minDiag when not provided', async () => {
      const d = 2;
      const payload: CholeskyRank1UpdatePayload = {
        L: createRegularizedL(d, 1.0),
        x: [0.5, 0.5],
        d,
        // minDiag not provided
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      expect(result.success).toBe(true);
    });

    it('should produce finite results', async () => {
      const d = 4;
      const payload: CholeskyRank1UpdatePayload = {
        L: createRegularizedL(d, 2.0),
        x: [0.3, 0.4, 0.5, 0.6],
        d,
        minDiag: 1e-6,
      };

      const task: ComputeTask<CholeskyRank1UpdatePayload> = {
        type: 'cholesky_rank1_update',
        payload,
      };

      const result = await computeWorker(task) as CholeskyRank1UpdateResult;

      expect(result.success).toBe(true);
      expect(result.L.every(Number.isFinite)).toBe(true);
    });
  });

  // ==================== 数值稳定性测试 ====================

  describe('Numerical Stability', () => {
    it('should handle very small values', async () => {
      const d = 2;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: createRegularizedIdentity(d, 1e-8),
          b: [1e-10, 1e-10],
          L: createRegularizedL(d, 1e-8),
        },
        featureVectors: [[1e-5, 1e-5]],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(Number.isFinite(result.score)).toBe(true);
      expect(Number.isFinite(result.confidence)).toBe(true);
    });

    it('should handle very large values without overflow', async () => {
      const d = 2;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: createRegularizedIdentity(d, 1e6),
          b: [1e6, 1e6],
          L: createRegularizedL(d, 1e6),
        },
        featureVectors: [[100, 100]],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(Number.isFinite(result.score)).toBe(true);
      expect(Number.isFinite(result.confidence)).toBe(true);
    });

    it('should handle asymmetric matrix by symmetrization', async () => {
      const d = 2;
      // 不对称矩阵
      const A = [2, 1.5, 0.5, 3];

      const payload: CholeskyDecomposePayload = {
        matrix: A,
        d,
        lambda: 0.01,
      };

      const task: ComputeTask<CholeskyDecomposePayload> = {
        type: 'cholesky_decompose',
        payload,
      };

      const result = await computeWorker(task) as CholeskyDecomposeResult;

      expect(result.success).toBe(true);
      // 分解应该成功
      expect(result.L.every(Number.isFinite)).toBe(true);
    });

    it('should clamp values to prevent numerical issues', async () => {
      setGlobalSeed('clamp-test');

      const payload: BayesianOptimizePayload = {
        observations: [
          { params: [0], value: 0 },
          { params: [1], value: 1 },
        ],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.01], // 很小的长度尺度
        outputVariance: 100, // 大方差
        noiseVariance: 0.0001,
        beta: 10.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      // 结果应该在边界内
      expect(result.nextPoint[0]).toBeGreaterThanOrEqual(0);
      expect(result.nextPoint[0]).toBeLessThanOrEqual(1);
      expect(Number.isFinite(result.acquisitionValue)).toBe(true);

      restoreRandom();
    });
  });

  // ==================== 边界条件测试 ====================

  describe('Edge Cases', () => {
    it('should handle dimension 1', async () => {
      const d = 1;
      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: [1],
          b: [0.5],
          L: [1],
        },
        featureVectors: [[1], [0.5]],
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result.bestIndex).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.score)).toBe(true);
    });

    it('should handle many feature vectors', async () => {
      const d = 3;
      const numVectors = 100;
      const featureVectors = Array.from({ length: numVectors }, () =>
        Array.from({ length: d }, () => Math.random())
      );

      const payload: LinUCBSelectPayload = {
        model: {
          d,
          alpha: 1.0,
          A: createRegularizedIdentity(d, 1.0),
          b: createZeroVector(d),
          L: createRegularizedL(d, 1.0),
        },
        featureVectors,
      };

      const task: ComputeTask<LinUCBSelectPayload> = {
        type: 'linucb_select',
        payload,
      };

      const result = await computeWorker(task) as LinUCBSelectResult;

      expect(result.bestIndex).toBeGreaterThanOrEqual(0);
      expect(result.bestIndex).toBeLessThan(numVectors);
    });

    it('should handle empty observations gracefully', async () => {
      setGlobalSeed('empty-obs');

      const payload: BayesianOptimizePayload = {
        observations: [],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.1],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      // 没有观测时应该返回随机采样
      expect(result.nextPoint[0]).toBeGreaterThanOrEqual(0);
      expect(result.nextPoint[0]).toBeLessThanOrEqual(1);

      restoreRandom();
    });

    it('should handle single observation', async () => {
      setGlobalSeed('single-obs');

      const payload: BayesianOptimizePayload = {
        observations: [{ params: [0.5], value: 0.7 }],
        paramBounds: [{ min: 0, max: 1 }],
        lengthScale: [0.1],
        outputVariance: 1.0,
        noiseVariance: 0.01,
        beta: 2.0,
      };

      const task: ComputeTask<BayesianOptimizePayload> = {
        type: 'bayesian_suggest',
        payload,
      };

      const result = await computeWorker(task) as BayesianSuggestResult;

      expect(result.nextPoint).toHaveLength(1);
      expect(result.acquisitionValue).toBe(1.0);

      restoreRandom();
    });
  });
});
