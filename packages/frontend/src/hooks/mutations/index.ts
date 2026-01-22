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
export * from './useAdminMutations';

// 学习相关 mutations
export * from './useSyncProgress';
export * from './useAdjustWords';
// Note: useWordMutations exports useCreateWord, useUpdateWord, useDeleteWord, useBatchCreateWords
// which conflict with queries/useWords.ts exports. We only export useWordMutations here.
export { useWordMutations } from './useWordMutations';

// OTA 更新相关
export { useOTAUpdate, otaUpdateKeys } from './useOTAUpdate';

// 后端重启
export { useRestartBackend, restartBackendKeys } from './useRestartBackend';
