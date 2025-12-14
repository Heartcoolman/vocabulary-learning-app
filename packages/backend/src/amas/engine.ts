/**
 * AMAS Engine - 兼容层
 *
 * 此文件保留为向后兼容，实际实现已合并到 core/engine.ts
 *
 * @deprecated 推荐直接从 './core/engine' 导入
 */

// 重导出所有内容，保持向后兼容
export {
  AMASEngine,
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
  ResilienceManager,
  IsolationManager,
  ModelingManager,
  LearningManager,
  DecisionContext,
  ActionSelection,
  PersistenceManager,
  DefaultPersistenceManager,
  DecisionTracer,
  DefaultDecisionTracer,
  NoopDecisionTracer,
  createDecisionTracer,
  DecisionTraceParams,
  StageTiming,
  PipelineStage,
  FeatureVectorBuilder,
  DefaultFeatureVectorBuilder,
  createFeatureVectorBuilder,
  FeatureContext,
  FeatureLabel,
  FEATURE_LABELS,
  RewardCacheManager,
  DefaultRewardCacheManager,
  NoopRewardCacheManager,
  createRewardCacheManager,
  RewardCacheConfig,
  RewardCacheStats,
  RewardProfileCacheItem,
  // Thompson 探索钩子
  ThompsonExploreHook,
  ExploreContext,
} from './core/engine';
