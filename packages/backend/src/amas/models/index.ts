/**
 * AMAS 模型导出
 */

// 情绪和心流检测
export * from './emotion-detector';
export * from './flow-detector';

// 认知模型统一模块（包含ACT-R记忆模型）
export * from './cognitive';

// 权威实现 - 保持独立
// 注意：为避免命名冲突，从 forgetting-curve 显式导出需要的项
export {
  type MemoryTrace,
  type HalfLifeUpdate,
  type CognitiveConfig,
  calculateForgettingFactor,
  updateHalfLife,
  computeOptimalInterval as computeOptimalIntervalFC, // 重命名避免与ACT-R冲突
  estimateRetention,
  batchCalculateForgettingFactors,
  ForgettingCurveAdapter,
} from './forgetting-curve';

export * from './fatigue-estimator';
