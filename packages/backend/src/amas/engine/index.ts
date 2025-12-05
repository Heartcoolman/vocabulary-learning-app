/**
 * AMAS Engine - 模块导出入口
 *
 * 提供统一的导出接口，保持向后兼容
 */

// 核心引擎
export { AMASEngine } from './engine-core';

// 类型定义
export {
  DecisionModel,
  UserModels,
  TimeoutFlag,
  StateRepository,
  ModelRepository,
  Logger,
  MemoryStateRepository,
  MemoryModelRepository,
  EngineDependencies,
  ProcessOptions,
  ProcessResult,
  clamp,
  // Thompson 探索钩子
  ThompsonExploreHook,
  ExploreContext
} from './engine-types';

// 子管理器（供高级用户使用）
export { ResilienceManager } from './engine-resilience';
export { IsolationManager } from './engine-isolation';
export { ModelingManager } from './engine-modeling';
export { LearningManager, DecisionContext, ActionSelection } from './engine-learning';
export { PersistenceManager, DefaultPersistenceManager } from './engine-persistence';
export {
  DecisionTracer,
  DecisionTraceParams,
  StageTiming,
  DefaultDecisionTracer,
  NoopDecisionTracer,
  createDecisionTracer
} from './engine-decision-trace';

// 特征向量构建模块
export {
  FeatureVector,
  FeatureContext,
  FeatureVectorBuilder,
  FeatureLabel,
  FEATURE_LABELS,
  DefaultFeatureVectorBuilder,
  createFeatureVectorBuilder
} from './engine-feature-vector';

// 奖励配置缓存模块
export {
  RewardProfileCacheItem,
  RewardCacheStats,
  RewardCacheManager,
  RewardCacheConfig,
  DefaultRewardCacheManager,
  NoopRewardCacheManager,
  createRewardCacheManager
} from './engine-reward-cache';
