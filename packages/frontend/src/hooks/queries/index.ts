/**
 * React Query Hooks 导出
 *
 * 统一导出所有 query 和 mutation hooks
 */

export * from './useWords';
export * from './useWordSearch';
export * from './useWordDetail';
export * from './useWordBooks';
export * from './useLearnedWords';

// AMAS相关查询 (Query类API)
export * from './useAmasState';
export * from './useAmasExplanation';

// 统计和分析相关查询
export { useStatistics, useRecordsWithPagination } from './useStatistics'; // 只导出需要的函数，避免与useUserStatistics冲突
export * from './useWordMasteryStats';
export * from './useTrendAnalysis';

// 配置相关查询
export * from './useAlgorithmConfig';
export * from './useStudyConfig';
export * from './useStudyProgress';
export * from './useTodayWords';
export * from './useMasteryWords';

// 徽章和成就相关查询
export * from './useBadges';
export * from './useAchievements';

// 管理后台相关查询
export * from './useAdminUsers';
export * from './useUserDetail';
export * from './useUserStatistics';
