/**
 * AMAS - Adaptive Multi-dimensional Aware System
 * 自适应多维度用户感知智能学习算法
 *
 * 模块导出索引
 */

// ==================== 核心类型 ====================
export * from './types';

// ==================== 配置 ====================
export * from './config/action-space';

// ==================== 感知层 ====================
export {
  FeatureBuilder,
  EnhancedFeatureBuilder,
  WindowStatistics,
  defaultFeatureBuilder
} from './perception/feature-builder';

// ==================== 建模层 ====================
export {
  AttentionMonitor,
  AttentionFeatures,
  defaultAttentionMonitor
} from './modeling/attention-monitor';

export {
  FatigueEstimator,
  FatigueFeatures,
  defaultFatigueEstimator
} from './modeling/fatigue-estimator';

export {
  CognitiveProfiler,
  RecentStats,
  defaultCognitiveProfiler
} from './modeling/cognitive-profiler';

export {
  MotivationTracker,
  MotivationEvent,
  defaultMotivationTracker
} from './modeling/motivation-tracker';

// ==================== 学习层 ====================
export {
  LinUCB,
  ContextBuildInput,
  LinUCBOptions,
  defaultLinUCB
} from './learning/linucb';

// ==================== 决策层 ====================
export {
  mapActionToStrategy,
  mapActionDirect,
  computeStrategyDelta,
  hasSignificantChange
} from './decision/mapper';

export {
  applyGuardrails,
  applyFatigueProtection,
  applyMotivationProtection,
  applyAttentionProtection,
  applyTrendProtection,
  shouldSuggestBreak,
  shouldForceBreak,
  isInDangerZone,
  getActiveProtections
} from './decision/guardrails';

export {
  generateExplanation,
  generateDetailedExplanation,
  generateShortExplanation,
  generateSuggestion
} from './decision/explain';

// ==================== 引擎 ====================
export {
  AMASEngine,
  StateRepository,
  ModelRepository,
  Logger,
  EngineDependencies,
  ProcessOptions,
  ProcessResult,
  defaultAMASEngine
} from './engine';
