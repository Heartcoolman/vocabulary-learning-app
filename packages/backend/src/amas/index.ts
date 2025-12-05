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
export * from './config/feature-flags';
export { UserParamsManager } from './config/user-params';

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

export { TrendAnalyzer, TrendState } from './modeling/trend-analyzer';

export {
  ACTRMemoryModel,
  ACTRContext,
  ACTRState
} from './modeling/actr-memory';

// ==================== 学习层 ====================
export {
  BaseLearner,
  BaseLearnerContext,
  ActionSelection,
  LearnerCapabilities
} from './learning/base-learner';

export {
  LinUCB,
  ContextBuildInput,
  LinUCBOptions,
  defaultLinUCB
} from './learning/linucb';

export {
  ColdStartManager,
  ColdStartState
} from './learning/coldstart';

export {
  ThompsonSampling,
  ThompsonContext,
  ThompsonSamplingState
} from './learning/thompson-sampling';

export {
  HeuristicLearner,
  HeuristicContext,
  HeuristicState
} from './learning/heuristic';

export {
  ThompsonExploreHookImpl,
  createThompsonExploreHook
} from './learning/thompson-explore-hook';

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

export {
  EnsembleLearningFramework,
  EnsembleContext,
  EnsembleState,
  EnsembleWeights,
  EnsembleMember
} from './decision/ensemble';

// ==================== 评估层 ====================
export {
  CausalInference,
  CausalEstimate,
  CausalObservation,
  CausalInferenceConfig,
  CausalInferenceState,
  defaultCausalInference
} from './evaluation/causal-inference';

export {
  DelayedRewardAggregator,
  RewardSchedule,
  DelayedRewardEvent,
  AggregatedResult,
  DelayedRewardState,
  defaultDelayedRewardAggregator
} from './evaluation/delayed-reward-aggregator';

// ==================== 优化层 ====================
export {
  BayesianOptimizer,
  BayesianOptimizerConfig,
  BayesianOptimizerState,
  ParamBound,
  AcquisitionType,
  Observation,
  Posterior,
  defaultBayesianOptimizer
} from './optimization/bayesian-optimizer';

// ==================== 引擎 ====================
export {
  AMASEngine,
  StateRepository,
  ModelRepository,
  Logger,
  EngineDependencies,
  ProcessOptions,
  ProcessResult
} from './engine';
