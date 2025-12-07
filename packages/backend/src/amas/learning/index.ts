/**
 * AMAS Learning Module
 *
 * 提供学习算法相关的导出，包括 LinUCB 的原生包装器
 */

// 导出 Native Wrapper (旧版，保留兼容性)
export { LinUCBNativeWrapper, type NativeWrapperStats } from './native-wrapper';

// 导出 LinUCB Native Wrapper (新版，使用 CircuitBreaker)
export {
  LinUCBNativeWrapper as LinUCBNativeWrapperV2,
  createLinUCBNativeWrapper,
  createLinUCBNativeWrapperFallback,
  type LinUCBWrapperConfig,
  type LinUCBWrapperStats,
  type NativeLinUCBContext,
  type NativeCompatAction,
  type NativeCompatUserState,
} from './linucb-native-wrapper';

// Thompson Sampling
export {
  ThompsonSampling,
  type ThompsonSamplingOptions,
  type ThompsonSamplingState,
  type ThompsonContext,
  defaultThompsonSampling,
} from './thompson-sampling';

// Thompson Sampling Native Wrapper
export {
  ThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapper,
  createThompsonSamplingNativeWrapperFallback,
  type ThompsonSamplingWrapperConfig,
  type ThompsonSamplingWrapperStats,
  type BetaSampleResult,
  type BatchSampleResult,
} from './thompson-sampling-native';

// 重新导出其他学习相关模块（如果存在）
// export * from './linucb';
