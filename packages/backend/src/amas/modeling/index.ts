/**
 * AMAS Modeling Layer - 用户状态建模层
 */

export { AttentionMonitor } from './attention-monitor';
export { FatigueEstimator } from './fatigue-estimator';
export { CognitiveProfiler } from './cognitive-profiler';
export { MotivationTracker } from './motivation-tracker';
export { TrendAnalyzer, type TrendState } from './trend-analyzer';
export {
  calculateForgettingFactor,
  batchCalculateForgettingFactors,
  type MemoryTrace,
} from './forgetting-curve';

// ACT-R 记忆模型
export {
  ACTRMemoryModel,
  type ACTROptions,
  type ACTRState,
  type ACTRContext,
  type ReviewTrace,
  type ActivationResult,
  type RecallPrediction,
  type IntervalPrediction,
  type CognitiveProfile,
  computeActivation,
  computeRecallProbability,
  computeOptimalInterval,
  defaultACTRMemoryModel,
} from './actr-memory';

// ACT-R 记忆模型 Native 包装器
export {
  ACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapperFallback,
  type ACTRWrapperConfig,
  type ACTRWrapperStats,
} from '../models/actr-memory-native';

// 视觉疲劳处理器
export {
  VisualFatigueProcessor,
  createVisualFatigueProcessor,
  defaultVisualFatigueProcessor,
  DEFAULT_VISUAL_PROCESSOR_CONFIG,
  type VisualFatigueProcessorConfig,
  type ProcessedVisualFatigue,
  type UserVisualProfile,
} from './visual-fatigue-processor';

// 疲劳融合引擎
export {
  FatigueFusionEngine,
  createFatigueFusionEngine,
  defaultFatigueFusionEngine,
  DEFAULT_FUSION_CONFIG,
  type FusionInput,
  type FusionResult,
} from './fatigue-fusion-engine';

// 动态权重计算器
export {
  DynamicWeightCalculator,
  createDynamicWeightCalculator,
  defaultDynamicWeightCalculator,
  DEFAULT_DYNAMIC_WEIGHT_CONFIG,
  type DynamicWeightConfig,
  type UserVisualHistory,
  type SceneContext,
} from './dynamic-weight-calculator';

// 认知视觉融合器
export {
  CognitiveVisualFusion,
  createCognitiveVisualFusion,
  defaultCognitiveVisualFusion,
  DEFAULT_COGNITIVE_VISUAL_FUSION_CONFIG,
  type CognitiveVisualFusionConfig,
  type CognitiveFusionResult,
  type AttentionFusionConfig,
  type MotivationFusionConfig,
  type StabilityFusionConfig,
} from './cognitive-visual-fusion';

// 个性化阈值学习器
export {
  ThresholdLearner,
  createThresholdLearner,
  defaultThresholdLearner,
  DEFAULT_THRESHOLD_LEARNER_CONFIG,
  type ThresholdLearnerConfig,
  type ThresholdObservation,
} from './threshold-learner';

// 视觉疲劳集成入口（统一 API）
export {
  VisualFatigueIntegration,
  createVisualFatigueIntegration,
  defaultVisualFatigueIntegration,
  DEFAULT_INTEGRATION_CONFIG,
  quickFuseFatigue,
  shouldSuggestBreak as shouldSuggestVisualBreak,
  shouldForceBreak as shouldForceVisualBreak,
  type VisualFatigueIntegrationConfig,
  type IntegrationInput,
  type IntegrationResult,
} from './visual-fatigue-integration';
