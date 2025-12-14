/**
 * AMAS Core Module - 核心处理循环
 *
 * 提供两个主要处理循环：
 * - Online Loop: 实时处理（<50ms），用于即时决策和状态更新
 * - Offline Loop: 异步处理（分钟级），用于延迟奖励和参数更新
 */

// Online Loop - 实时处理循环 (<50ms)
export {
  OnlineLoop,
  defaultOnlineLoop,
  type OnlineLoopInput,
  type OnlineLoopOutput,
  type OnlineLoopConfig,
} from './online-loop';

// Offline Loop - 异步处理循环（分钟级）
export {
  OfflineLoop,
  OfflineLoopConfig,
  DelayedRewardProcessor,
  RewardEvaluator,
  ParamUpdater,
  RewardEvaluationResult,
  ParamUpdateResult,
  RewardApplier,
  UserStateProvider,
} from './offline-loop';

// Re-export shared dependencies
export {
  DelayedRewardAggregator,
  AggregatedResult,
  RewardBreakdown,
  RewardSchedule,
  DelayedRewardEvent,
  DelayedRewardState,
} from '../rewards/delayed-reward-aggregator';

export { WordMasteryEvaluator, MasteryEvaluation, EvaluatorConfig } from '../rewards/evaluators';

// Optimizer - 贝叶斯超参数优化器
export {
  BayesianOptimizer,
  BayesianOptimizerConfig,
  BayesianOptimizerState,
  ParamBound,
  Observation,
  Posterior,
  AcquisitionType,
  defaultBayesianOptimizer,
  getDefaultParamSpace,
  createAMASOptimizer,
} from './optimizer';

// Multi-Objective Optimizer - 多目标优化器
export { MultiObjectiveOptimizer } from './multi-objective-optimizer';
