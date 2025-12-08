/**
 * React Query Hooks 导出
 *
 * 统一导出所有 query 和 mutation hooks
 *
 * 组织结构：
 * - 认证相关：useCurrentUser, useLogin, useRegister, useLogout
 * - 用户相关：useUser, useUserStats, useUpdatePassword
 * - 单词相关：useWords, useLearnedWords, useSearchWords
 * - 词书相关：useWordBooks, useWordBook
 * - 配置相关：useStudyConfig, useSettings
 * - 学习相关：useLearningPlan, useHabitProfile, useLearningRecords, useProgress
 * - AMAS相关：useAmasState, useAmasStrategy
 * - 统计相关：useStatistics, useTrendAnalysis, useUserStats, useDailyStats
 * - 管理后台：useAdminUsers, useAdminStatistics
 */

// ==================== 认证相关 ====================
export {
  useCurrentUser,
  useLogin,
  useRegister,
  useLogout,
  useRefreshAuth,
  usePrefetchAuth,
  useAuthStatus,
  type LoginParams,
  type RegisterParams,
  type AuthResponse,
} from './useAuth';

// ==================== 用户相关 ====================
export {
  useUser,
  useUserStats as useUserBaseStats,
  useUpdatePassword,
  useRefreshUser,
  usePrefetchUser,
  type UserStatistics,
  type UpdatePasswordParams,
} from './useUser';

// ==================== 单词相关 ====================
// 导出单词相关的所有 hooks（带乐观更新）
export {
  useWords,
  useWords as useWordsFiltered,
  useWord,
  useSearchWords,
  useCreateWord,
  useUpdateWord,
  useDeleteWord,
  useBatchCreateWords,
  useLearnedWords,
  useWordOperations,
  useRefreshWords,
  usePrefetchWords,
  type CreateWordParams,
  type UpdateWordParams,
} from './useWords';
export * from './useWordSearch';
export * from './useWordDetail';

// 从 useWordBooks 显式导出存在的函数
export {
  useSystemWordBooks,
  useUserWordBooks,
  useAllAvailableWordBooks,
  useWordBook,
  useWordBookWords,
  useSearchWords as useWordBookSearchWords,
  // 新增导出
  useWordBooks,
  prefetchWordBooks,
  prefetchWordBook,
  prefetchWordBookWords,
  invalidateWordBooksCache,
  type WordBooksFilterOptions,
  type UseWordBooksOptions,
} from './useWordBooks';

// 重新导出 useLearnedWords（使用 useWords.ts 中的版本）
// 注意：useAllWords 从 useLearnedWords.ts 导出以保持向后兼容
export { useWords as useAllWords } from './useLearnedWords';

// ==================== 配置相关 ====================
// 学习配置
export { useStudyConfig } from './useStudyConfig';
// 算法配置
export {
  useAlgorithmConfig,
  useConfigHistory as useAlgorithmConfigHistory,
  useAlgorithmConfigPresets,
} from './useAlgorithmConfig';

// 用户设置（学习目标、奖励配置、认知画像）
export {
  useLearningSettings,
  useUpdateLearningSettings,
  useLearningObjectives,
  useUpdateLearningObjectives,
  useSwitchLearningMode,
  useLearningModeSuggestions,
  useRewardProfile,
  useUpdateRewardProfile,
  useChronotypeProfile,
  useLearningStyleProfile,
  useCognitiveProfile,
  useRefreshSettings,
  type LearningObjectives,
  type RewardProfile,
  type ChronotypeProfile,
  type LearningStyleProfile,
  type CognitiveProfile,
} from './useSettings';

// ==================== 学习计划相关 ====================
export {
  useLearningPlan,
  usePlanProgress,
  useGenerateLearningPlan,
  useAdjustLearningPlan,
  useRefreshLearningPlan,
  planQueryKeys,
} from './useLearningPlan';

// ==================== 习惯画像相关 ====================
export {
  useHabitProfile,
  useInitializeHabitProfile,
  useEndHabitSession,
  usePersistHabitProfile,
  useRefreshHabitProfile,
  habitProfileKeys,
} from './useHabitProfile';

// ==================== AMAS相关查询 ====================
export * from './useAmasState';
export * from './useAmasExplanation';

// ==================== 学习进度相关 ====================
export * from './useStudyProgress';
export * from './useTodayWords';
export * from './useMasteryWords';

// ==================== 统计和分析相关 ====================
export {
  useStatistics,
  useUserStatistics as useBaseUserStatistics,
  useLearningRecords as useStatisticsRecords,
  useCreateRecord,
  useBatchCreateRecords,
} from './useStatistics';
export * from './useWordMasteryStats';
export * from './useTrendAnalysis';

// 用户统计 hooks (新增)
export {
  useUserStats,
  useFullUserStats,
  useDailyStats,
  useDailyStatsRange,
  useWeeklyTrend,
  prefetchUserStats,
  prefetchDailyStats,
  invalidateUserStatsCache,
  userStatsKeys,
  type UserStats,
  type DailyStats,
  type UserLearningStats,
  type FullUserStats,
  type DailyAccuracyPoint,
  type UseUserStatsOptions,
} from './useUserStats';

// ==================== 徽章和成就相关 ====================
export * from './useBadges';
export * from './useAchievements';

// ==================== 管理后台相关 ====================
export * from './useAdminUsers';
export * from './useUserDetail';
export * from './useUserStatistics';
export * from './useAdminStatistics';
export * from './useSystemStatus';
export * from './useConfigHistory';

// ==================== 学习记录相关查询 ====================
export {
  useLearningRecords,
  useProgress,
  useStudyProgressQuery,
  useCreateLearningRecord,
  useBatchCreateRecords as useBatchCreateLearningRecords,
  useSubmitAnswerMutation,
  prefetchLearningRecords,
  prefetchProgress,
  invalidateLearningRecordsCache,
  learningRecordsKeys,
  type LearningRecordsOptions,
  type LearningRecordsResult,
  type CreateRecordInput,
  type SubmitAnswerInput,
  type StudyProgress,
} from './useLearningRecords';

export * from './useNextWords';
