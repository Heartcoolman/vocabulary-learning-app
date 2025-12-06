/**
 * AMAS Worker Pool - Piscina Worker Pool Configuration
 * Worker 池配置
 *
 * 核心功能:
 * - 使用 Piscina 管理 Worker 线程池
 * - 卸载 LinUCB/贝叶斯优化的计算密集型任务
 * - 防止矩阵运算阻塞 Event Loop
 *
 * 设计原则:
 * - 单例模式确保全局只有一个 Worker 池
 * - 懒加载初始化，按需创建 Worker
 * - 优雅关闭，确保资源正确释放
 */

import Piscina from 'piscina';
import { resolve } from 'path';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 计算任务类型
 */
export type ComputeTaskType =
  | 'linucb_select'
  | 'linucb_update'
  | 'bayesian_optimize'
  | 'bayesian_suggest'
  | 'cholesky_decompose'
  | 'cholesky_rank1_update';

/**
 * 计算任务接口
 */
export interface ComputeTask<T = unknown> {
  /** 任务类型 */
  type: ComputeTaskType;
  /** 任务载荷 */
  payload: T;
  /** 任务优先级（可选，默认为 0） */
  priority?: number;
}

/**
 * LinUCB 选择任务载荷
 */
export interface LinUCBSelectPayload {
  /** 模型参数 */
  model: {
    d: number;
    alpha: number;
    A: number[];
    b: number[];
    L: number[];
  };
  /** 候选动作的特征向量列表 */
  featureVectors: number[][];
}

/**
 * LinUCB 选择结果
 */
export interface LinUCBSelectResult {
  /** 最优动作索引 */
  bestIndex: number;
  /** UCB 分数 */
  score: number;
  /** 置信度 */
  confidence: number;
  /** 利用项 */
  exploitation: number;
}

/**
 * LinUCB 更新任务载荷
 */
export interface LinUCBUpdatePayload {
  /** 当前模型参数 */
  model: {
    d: number;
    lambda: number;
    A: number[];
    b: number[];
    L: number[];
  };
  /** 特征向量 */
  featureVector: number[];
  /** 奖励值 */
  reward: number;
}

/**
 * LinUCB 更新结果
 */
export interface LinUCBUpdateResult {
  /** 更新后的 A 矩阵 */
  A: number[];
  /** 更新后的 b 向量 */
  b: number[];
  /** 更新后的 L 矩阵 */
  L: number[];
  /** 是否成功 */
  success: boolean;
}

/**
 * 贝叶斯优化任务载荷
 */
export interface BayesianOptimizePayload {
  /** 观测历史 */
  observations: Array<{
    params: number[];
    value: number;
  }>;
  /** 参数空间边界 */
  paramBounds: Array<{
    min: number;
    max: number;
    step?: number;
  }>;
  /** 核函数长度尺度 */
  lengthScale: number[];
  /** 输出方差 */
  outputVariance: number;
  /** 噪声方差 */
  noiseVariance: number;
  /** UCB 探索系数 beta */
  beta: number;
}

/**
 * 贝叶斯优化建议结果
 */
export interface BayesianSuggestResult {
  /** 建议的下一个采样点 */
  nextPoint: number[];
  /** 采集函数值 */
  acquisitionValue: number;
}

/**
 * Cholesky 分解任务载荷
 */
export interface CholeskyDecomposePayload {
  /** 输入矩阵（行优先存储） */
  matrix: number[];
  /** 维度 */
  d: number;
  /** 正则化系数 */
  lambda: number;
}

/**
 * Cholesky 分解结果
 */
export interface CholeskyDecomposeResult {
  /** Cholesky 因子 L */
  L: number[];
  /** 是否成功 */
  success: boolean;
}

/**
 * Cholesky Rank-1 更新任务载荷
 */
export interface CholeskyRank1UpdatePayload {
  /** 当前 L 矩阵 */
  L: number[];
  /** 更新向量 */
  x: number[];
  /** 维度 */
  d: number;
  /** 对角线最小值 */
  minDiag?: number;
}

/**
 * Cholesky Rank-1 更新结果
 */
export interface CholeskyRank1UpdateResult {
  /** 更新后的 L 矩阵 */
  L: number[];
  /** 是否成功 */
  success: boolean;
}

/**
 * Worker 池统计信息
 */
export interface PoolStats {
  /** 已完成任务数 */
  completed: number;
  /** 等待中任务数 */
  pending: number;
  /** 运行中任务数 */
  running: number;
  /** 平均等待时间 (ms) */
  waitTime: number;
  /** 平均运行时间 (ms) */
  runTime: number;
  /** 线程数 */
  threads: number;
}

/**
 * Worker 池配置
 */
export interface ComputePoolConfig {
  /** 最小线程数 */
  minThreads?: number;
  /** 最大线程数 */
  maxThreads?: number;
  /** 空闲超时时间 (ms) */
  idleTimeout?: number;
  /** 任务超时时间 (ms) */
  taskTimeout?: number;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: Required<ComputePoolConfig> = {
  minThreads: 1,
  maxThreads: Math.max(1, Math.floor(require('os').cpus().length / 2)),
  idleTimeout: 30000,
  taskTimeout: 60000,
};

// ==================== 单例 Worker 池 ====================

let pool: Piscina | null = null;
let poolConfig: Required<ComputePoolConfig> = { ...DEFAULT_CONFIG };

/**
 * 获取 Worker 文件路径
 * 支持开发模式 (.ts) 和生产模式 (.js)
 */
function getWorkerFilename(): string {
  // 在生产环境中使用编译后的 .js 文件
  // 在开发环境中，由于使用 tsx，.ts 文件也可以工作
  const jsPath = resolve(__dirname, 'compute.worker.js');
  const tsPath = resolve(__dirname, 'compute.worker.ts');

  // 优先使用 .js 文件（生产环境）
  try {
    require.resolve(jsPath);
    return jsPath;
  } catch {
    // 回退到 .ts 文件（开发环境）
    return tsPath;
  }
}

/**
 * 获取计算 Worker 池（单例）
 *
 * @param config 可选配置，仅在首次创建时生效
 * @returns Piscina 实例
 */
export function getComputePool(config?: ComputePoolConfig): Piscina {
  if (!pool) {
    poolConfig = { ...DEFAULT_CONFIG, ...config };

    pool = new Piscina({
      filename: getWorkerFilename(),
      minThreads: poolConfig.minThreads,
      maxThreads: poolConfig.maxThreads,
      idleTimeout: poolConfig.idleTimeout,
    });

    amasLogger.info(
      {
        minThreads: poolConfig.minThreads,
        maxThreads: poolConfig.maxThreads,
        idleTimeout: poolConfig.idleTimeout,
      },
      '[ComputePool] Worker 池已初始化'
    );
  }
  return pool;
}

/**
 * 销毁计算 Worker 池
 * 在应用关闭时调用以释放资源
 */
export async function destroyComputePool(): Promise<void> {
  if (pool) {
    amasLogger.info('[ComputePool] 正在销毁 Worker 池...');
    await pool.destroy();
    pool = null;
    amasLogger.info('[ComputePool] Worker 池已销毁');
  }
}

/**
 * 检查 Worker 池是否已初始化
 */
export function isPoolInitialized(): boolean {
  return pool !== null;
}

/**
 * 获取 Worker 池统计信息
 */
export function getPoolStats(): PoolStats {
  if (!pool) {
    return {
      completed: 0,
      pending: 0,
      running: 0,
      waitTime: 0,
      runTime: 0,
      threads: 0,
    };
  }

  return {
    completed: pool.completed,
    pending: pool.queueSize,
    running: pool.utilization * poolConfig.maxThreads,
    waitTime: pool.waitTime?.mean ?? 0,
    runTime: pool.runTime?.mean ?? 0,
    threads: pool.threads.length,
  };
}

// ==================== 任务执行接口 ====================

/**
 * 在 Worker 池中执行计算任务
 *
 * @param task 计算任务
 * @returns 任务结果
 */
export async function runComputeTask<TPayload, TResult>(
  task: ComputeTask<TPayload>
): Promise<TResult> {
  const p = getComputePool();

  try {
    const result = await p.run(task, {
      // 设置任务超时
      signal: AbortSignal.timeout(poolConfig.taskTimeout),
    });
    return result as TResult;
  } catch (error) {
    amasLogger.error(
      { taskType: task.type, error },
      '[ComputePool] 任务执行失败'
    );
    throw error;
  }
}

// ==================== 便捷方法 ====================

/**
 * 执行 LinUCB 选择计算
 */
export async function runLinUCBSelect(
  payload: LinUCBSelectPayload
): Promise<LinUCBSelectResult> {
  return runComputeTask<LinUCBSelectPayload, LinUCBSelectResult>({
    type: 'linucb_select',
    payload,
  });
}

/**
 * 执行 LinUCB 更新计算
 */
export async function runLinUCBUpdate(
  payload: LinUCBUpdatePayload
): Promise<LinUCBUpdateResult> {
  return runComputeTask<LinUCBUpdatePayload, LinUCBUpdateResult>({
    type: 'linucb_update',
    payload,
  });
}

/**
 * 执行贝叶斯优化建议计算
 */
export async function runBayesianSuggest(
  payload: BayesianOptimizePayload
): Promise<BayesianSuggestResult> {
  return runComputeTask<BayesianOptimizePayload, BayesianSuggestResult>({
    type: 'bayesian_suggest',
    payload,
  });
}

/**
 * 执行 Cholesky 分解
 */
export async function runCholeskyDecompose(
  payload: CholeskyDecomposePayload
): Promise<CholeskyDecomposeResult> {
  return runComputeTask<CholeskyDecomposePayload, CholeskyDecomposeResult>({
    type: 'cholesky_decompose',
    payload,
  });
}

/**
 * 执行 Cholesky Rank-1 更新
 */
export async function runCholeskyRank1Update(
  payload: CholeskyRank1UpdatePayload
): Promise<CholeskyRank1UpdateResult> {
  return runComputeTask<CholeskyRank1UpdatePayload, CholeskyRank1UpdateResult>({
    type: 'cholesky_rank1_update',
    payload,
  });
}
