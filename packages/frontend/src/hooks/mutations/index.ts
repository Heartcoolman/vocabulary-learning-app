/**
 * React Query Mutation Hooks 导出
 *
 * 统一导出所有 mutation hooks
 */

// 答题提交相关
export {
  useSubmitAnswer,
  extractAmasState,
  shouldTakeBreak,
  type SubmitAnswerParams,
  type LocalWordDecision,
  type UseSubmitAnswerOptions,
} from './useSubmitAnswer';

// 其他 mutations
export * from './useConfigMutations';
export * from './useWordBookMutations';
