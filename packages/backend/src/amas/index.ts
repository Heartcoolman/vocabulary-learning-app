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
  defaultFeatureBuilder,
} from './perception/feature-builder';

// ==================== 建模层 ====================
// 从 models/cognitive.ts 统一导出
export {
  AttentionMonitor,
  AttentionFeatures,
  defaultAttentionMonitor,
  CognitiveProfiler,
  RecentStats,
  defaultCognitiveProfiler,
  MotivationTracker,
  MotivationEvent,
  defaultMotivationTracker,
  TrendAnalyzer,
  TrendState,
  HabitRecognizer,
  HabitProfile,
  HabitRecognizerOptions,
  ChronotypeDetector,
  ChronotypeProfile,
  ChronotypeCategory,
  LearningStyleProfiler,
  LearningStyleProfile,
  LearningStyle,
  InteractionPatterns,
  FatigueRecoveryModel,
  FatigueRecoveryState,
} from './models/cognitive';

// 权威实现 - 保持独立
export {
  FatigueEstimator,
  FatigueFeatures,
  defaultFatigueEstimator,
} from './models/fatigue-estimator';

export {
  calculateForgettingFactor,
  updateHalfLife,
  computeOptimalInterval,
  estimateRetention,
  batchCalculateForgettingFactors,
  ForgettingCurveAdapter,
  MemoryTrace,
  HalfLifeUpdate,
  CognitiveConfig as ForgettingCurveCognitiveConfig,
} from './models/forgetting-curve';

// ACT-R 记忆模型 (已迁移到 models/cognitive.ts)
export { ACTRMemoryModel, ACTRContext, ACTRState } from './models/cognitive';

export {
  ACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapperFallback,
  type ACTRWrapperConfig,
  type ACTRWrapperStats,
} from './models/cognitive';

// ==================== 学习层 ====================
// 基础学习器接口 (从 algorithms/ 导出)
export {
  BaseLearner,
  BaseLearnerContext,
  ActionSelection as BaseLearnerActionSelection,
  LearnerCapabilities,
} from './algorithms/learners';

// 核心学习算法 (从 algorithms/ 导出)
export { LinUCB, ContextBuildInput, LinUCBOptions, defaultLinUCB } from './algorithms/learners';

export {
  ThompsonSampling,
  ThompsonContext,
  ThompsonSamplingState,
  defaultThompsonSampling,
} from './algorithms/learners';

// Native包装器 (保留在learning/，等待后续整理)
export {
  LinUCBAsync,
  LinUCBAsyncOptions,
  createLinUCBAsync,
  createLinUCBAsyncSync,
} from './learning/linucb-async';

export { ColdStartManager, ColdStartState } from './learning/coldstart';

export {
  ThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapperFallback,
  type ThompsonSamplingWrapperConfig,
  type ThompsonSamplingWrapperStats,
} from './learning/thompson-sampling-native';

export { HeuristicLearner, HeuristicContext, HeuristicState } from './learning/heuristic';

export {
  ThompsonExploreHookImpl,
  createThompsonExploreHook,
} from './learning/thompson-explore-hook';

// ==================== 决策层 ====================
export {
  mapActionToStrategy,
  mapActionDirect,
  computeStrategyDelta,
  hasSignificantChange,
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
  getActiveProtections,
} from './decision/guardrails';

export {
  generateExplanation,
  generateDetailedExplanation,
  generateShortExplanation,
  generateSuggestion,
} from './decision/explain';

export {
  EnsembleLearningFramework,
  EnsembleContext,
  EnsembleState,
  EnsembleWeights,
  EnsembleMember,
} from './decision/ensemble';

// ==================== 策略层 ====================
export {
  ISimpleDecisionPolicy,
  PolicyFactory,
  PolicyRegistry,
  policyRegistry,
  FatigueBasedPolicy,
  createFatigueBasedPolicy,
} from './policies';

// ==================== 评估层 ====================
export {
  CausalInference,
  CausalEstimate,
  CausalObservation,
  CausalInferenceConfig,
  CausalInferenceState,
  defaultCausalInference,
} from './rewards/evaluators';

export {
  CausalInferenceNativeWrapper,
  createCausalInferenceNativeWrapper,
  createCausalInferenceNativeWrapperFallback,
  type CausalInferenceWrapperConfig,
  type CausalInferenceWrapperStats,
} from './rewards/evaluators';

export {
  DelayedRewardAggregator,
  RewardSchedule,
  DelayedRewardEvent,
  AggregatedResult,
  DelayedRewardState,
  defaultDelayedRewardAggregator,
} from './rewards/delayed-reward-aggregator';

// ==================== 优化层 ====================
export {
  BayesianOptimizer,
  BayesianOptimizerConfig,
  BayesianOptimizerState,
  ParamBound,
  AcquisitionType,
  Observation,
  Posterior,
  defaultBayesianOptimizer,
} from './core/optimizer';

// ==================== Worker 池 ====================
export {
  getComputePool,
  destroyComputePool,
  isPoolInitialized,
  getPoolStats,
  runLinUCBSelect,
  runLinUCBUpdate,
  ComputePoolConfig,
  PoolStats,
} from './workers/pool';

// ==================== 引擎 ====================
export {
  AMASEngine,
  StateRepository,
  ModelRepository,
  Logger,
  EngineDependencies,
  ProcessOptions,
  ProcessResult,
  // 引擎子模块
  ResilienceManager,
  IsolationManager,
  ModelingManager,
  LearningManager,
  DecisionContext,
  ActionSelection,
  // 持久化
  PersistenceManager,
  DefaultPersistenceManager,
  // 决策轨迹
  DecisionTracer,
  DefaultDecisionTracer,
  NoopDecisionTracer,
  createDecisionTracer,
  DecisionTraceParams,
  StageTiming,
  // 特征向量
  FeatureVectorBuilder,
  DefaultFeatureVectorBuilder,
  createFeatureVectorBuilder,
  FEATURE_LABELS,
  // 奖励缓存
  RewardCacheManager,
  DefaultRewardCacheManager,
  createRewardCacheManager,
  // 类型
  DecisionModel,
  UserModels,
  ThompsonExploreHook,
  ExploreContext,
  clamp,
} from './engine';

// ==================== 通用工具 ====================
export {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerWrapperOptions,
  createDefaultCircuitBreaker,
  withCircuitBreaker,
  withCircuitBreakerAsync,
  createCircuitBreakerWrapper,
} from './common/circuit-breaker';
