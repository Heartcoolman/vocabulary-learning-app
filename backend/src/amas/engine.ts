/**
 * AMAS Engine - 兼容层
 *
 * 此文件保留为向后兼容，实际实现已拆分到 engine/ 目录
 *
 * @deprecated 推荐直接从 './engine/index' 导入
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
  // Thompson 探索钩子
  ThompsonExploreHook,
  ExploreContext
} from './engine/index';
