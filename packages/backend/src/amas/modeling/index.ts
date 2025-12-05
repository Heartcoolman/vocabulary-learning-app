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
