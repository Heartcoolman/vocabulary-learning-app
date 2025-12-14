/**
 * AMAS 算法层统一导出
 *
 * 本模块整合了所有核心学习算法，替代原 learning/ 目录
 */

// ==================== 基础学习器接口 ====================
export {
  // 接口和类型
  type ActionSelection,
  type BaseLearner,
  type BaseLearnerContext,
  type LearnerCapabilities,
  AbstractBaseLearner,
} from './learners';

// ==================== LinUCB 算法 ====================
export {
  // 类和实例
  LinUCB,
  defaultLinUCB,
  // 类型
  type LinUCBContext,
  type LinUCBOptions,
  type ContextBuildInput,
} from './learners';

// ==================== Thompson Sampling 算法 ====================
export {
  // 类和实例
  ThompsonSampling,
  defaultThompsonSampling,
  // 类型
  type ThompsonContext,
  type ThompsonSamplingOptions,
  type ThompsonSamplingState,
} from './learners';
