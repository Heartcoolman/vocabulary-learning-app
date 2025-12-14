/**
 * AMAS Rewards - Unified Evaluators
 * 统一奖励评估器
 *
 * 整合内容：
 * - CausalInference: 因果推断验证器（双重稳健估计）
 * - CausalInferenceNativeWrapper: Native包装器（性能优化）
 * - WordMasteryEvaluator: 单词掌握度评估器
 *
 * 重构说明：
 * - 将 evaluation/ 目录下的所有评估器统一合并到此文件
 * - 保留所有类型和接口，确保向后兼容
 * - 延迟奖励聚合器(delayed-reward-aggregator.ts)作为独立文件保留
 */

// ==================== 因果推断相关导出 ====================

// 类型定义
export type {
  CausalObservation,
  CausalEstimate,
  PropensityDiagnostics,
  StrategyComparison,
  CausalInferenceConfig,
  CausalInferenceState,
} from '../evaluation/causal-inference';

// 核心类和函数
export {
  CausalInference,
  createCausalInference,
  computeIPWWeight,
  defaultCausalInference,
} from '../evaluation/causal-inference';

// Native 包装器相关
export type {
  CausalInferenceWrapperConfig,
  CausalInferenceWrapperStats,
} from '../evaluation/causal-inference-native';

export {
  CausalInferenceNativeWrapper,
  createCausalInferenceNativeWrapper,
  createCausalInferenceNativeWrapperFallback,
} from '../evaluation/causal-inference-native';

// ==================== 单词掌握度评估器相关导出 ====================

// 类型定义
export type { EvaluatorConfig, MasteryEvaluation } from '../evaluation/word-mastery-evaluator';

// 核心类
export { WordMasteryEvaluator, wordMasteryEvaluator } from '../evaluation/word-mastery-evaluator';
