/**
 * AMAS Policies Module
 * 决策策略模块统一导出
 */

// 策略注册表
export {
  ISimpleDecisionPolicy,
  PolicyFactory,
  PolicyRegistry,
  policyRegistry,
} from './policy-registry';

// 内置策略
export { FatigueBasedPolicy, createFatigueBasedPolicy } from './fatigue-based';

// 单词选择策略
export {
  IWordSelector,
  BaseWordSelector,
  WordCandidate,
  SelectionContext,
  SelectionResult,
} from './word-selector.interface';

export {
  MicroSessionPolicy,
  defaultMicroSessionPolicy,
  createMicroSessionPolicy,
} from './micro-session-policy';
