/**
 * AMAS Modeling Layer - 用户状态建模层
 */

export { AttentionMonitor } from './attention-monitor';
export { FatigueEstimator } from './fatigue-estimator';
export { CognitiveProfiler } from './cognitive-profiler';
export { MotivationTracker } from './motivation-tracker';
export { HabitRecognizer, type HabitProfile } from './habit-recognizer';
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
} from './actr-memory-native';

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
