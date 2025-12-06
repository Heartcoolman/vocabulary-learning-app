/**
 * AMAS Workers Module - 模块导出
 * Worker 池模块入口
 *
 * 使用示例:
 *
 * ```typescript
 * import {
 *   getComputePool,
 *   destroyComputePool,
 *   runLinUCBSelect,
 *   runLinUCBUpdate,
 *   runBayesianSuggest,
 * } from './workers';
 *
 * // 初始化 Worker 池（可选，会自动懒加载）
 * const pool = getComputePool({ maxThreads: 4 });
 *
 * // 执行 LinUCB 选择
 * const result = await runLinUCBSelect({
 *   model: { d: 22, alpha: 1.0, A: [...], b: [...], L: [...] },
 *   featureVectors: [[...], [...], [...]],
 * });
 *
 * // 应用关闭时销毁 Worker 池
 * await destroyComputePool();
 * ```
 */

// 导出 Worker 池管理函数
export {
  getComputePool,
  destroyComputePool,
  isPoolInitialized,
  getPoolStats,
  runComputeTask,
} from './pool';

// 导出便捷方法
export {
  runLinUCBSelect,
  runLinUCBUpdate,
  runBayesianSuggest,
  runCholeskyDecompose,
  runCholeskyRank1Update,
} from './pool';

// 导出类型定义
export type {
  // 任务类型
  ComputeTask,
  ComputeTaskType,
  ComputePoolConfig,
  PoolStats,
  // LinUCB 相关
  LinUCBSelectPayload,
  LinUCBSelectResult,
  LinUCBUpdatePayload,
  LinUCBUpdateResult,
  // 贝叶斯优化相关
  BayesianOptimizePayload,
  BayesianSuggestResult,
  // Cholesky 相关
  CholeskyDecomposePayload,
  CholeskyDecomposeResult,
  CholeskyRank1UpdatePayload,
  CholeskyRank1UpdateResult,
} from './pool';
