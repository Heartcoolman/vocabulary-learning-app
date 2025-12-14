/**
 * AMAS Learning Module
 *
 * 注意：核心学习算法（LinUCB、Thompson Sampling、BaseLearner接口）
 * 已迁移到 ../algorithms/learners.ts
 *
 * 本模块保留：
 * - Native包装器（LinUCB、Thompson Sampling）
 * - 辅助学习器（ColdStart、Heuristic）
 * - 工具函数（math-utils）
 * - 扩展功能（linucb-async、thompson-explore-hook）
 */

// ==================== Native 包装器 ====================

// 导出 Native Wrapper (旧版，保留兼容性)
export { LinUCBNativeWrapper, type NativeWrapperStats } from './native-wrapper';

// 导出 LinUCB Native Wrapper (新版，使用 CircuitBreaker)
export {
  LinUCBNativeWrapper as LinUCBNativeWrapperV2,
  createLinUCBNativeWrapper,
  createLinUCBNativeWrapperFallback,
  type LinUCBWrapperConfig,
  type LinUCBWrapperStats,
  type NativeLinUCBContext,
  type NativeCompatAction,
  type NativeCompatUserState,
} from './linucb-native-wrapper';

// Thompson Sampling Native Wrapper
export {
  ThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapperFallback,
  type ThompsonSamplingWrapperConfig,
  type ThompsonSamplingWrapperStats,
  type BetaSampleResult,
  type BatchSampleResult,
} from './thompson-sampling-native';

// ==================== 辅助学习器 ====================

// 冷启动管理器
export { ColdStartManager, type ColdStartState } from './coldstart';

// 启发式学习器
export { HeuristicLearner, type HeuristicContext, type HeuristicState } from './heuristic';

// ==================== 扩展功能 ====================

// LinUCB 异步版本
export {
  LinUCBAsync,
  type LinUCBAsyncOptions,
  createLinUCBAsync,
  createLinUCBAsyncSync,
} from './linucb-async';

// Thompson Sampling 探索钩子
export { ThompsonExploreHookImpl, createThompsonExploreHook } from './thompson-explore-hook';

// ==================== 工具函数 ====================

// 数学工具（供内部使用）
export {
  choleskyRank1Update,
  addOuterProduct,
  addScaledVector,
  hasInvalidValues,
} from './math-utils';
