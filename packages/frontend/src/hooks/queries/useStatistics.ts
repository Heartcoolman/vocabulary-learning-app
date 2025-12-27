import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { CACHE_TIME, GC_TIME, REFETCH_INTERVALS, DATA_CACHE_CONFIG } from '../../lib/cacheConfig';
import { apiClient } from '../../services/client';
import { useAuth } from '../../contexts/AuthContext';

export interface StatisticsData {
  totalWords: number;
  masteryDistribution: { level: number; count: number }[];
  overallAccuracy: number;
  studyDays: number;
  consecutiveDays: number;
}

export interface DailyAccuracyPoint {
  date: string;
  accuracy: number;
}

export interface FullStatisticsData extends StatisticsData {
  dailyAccuracy: DailyAccuracyPoint[];
  weekdayHeat: number[];
}

export function useStatistics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.statistics.overview(),
    queryFn: async (): Promise<FullStatisticsData> => {
      if (!user) {
        throw new Error('请先登录');
      }
      const stats = await apiClient.getEnhancedStatistics();
      return {
        totalWords: stats.totalWords,
        masteryDistribution: stats.masteryDistribution,
        overallAccuracy: stats.correctRate,
        studyDays: stats.studyDays,
        consecutiveDays: stats.consecutiveDays,
        dailyAccuracy: stats.dailyAccuracy,
        weekdayHeat: stats.weekdayHeat,
      };
    },
    enabled: !!user,
    staleTime: CACHE_TIME.SHORT,
    gcTime: GC_TIME.MEDIUM,
    refetchInterval: user ? REFETCH_INTERVALS.FREQUENT : REFETCH_INTERVALS.DISABLED,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
}

/**
 * 获取学习进度统计
 */
export function useStudyProgress() {
  return useQuery({
    queryKey: queryKeys.studyProgress.current(),
    queryFn: async () => {
      return await apiClient.getStudyProgress();
    },
    staleTime: CACHE_TIME.SHORT, // 1分钟
    refetchInterval: REFETCH_INTERVALS.FREQUENT, // 每分钟自动刷新
  });
}

/**
 * 获取用户基础统计信息
 */
export function useUserStatistics() {
  return useQuery({
    queryKey: queryKeys.user.statistics(),
    queryFn: async () => {
      return await apiClient.getUserStatistics();
    },
    ...DATA_CACHE_CONFIG.userStatistics,
  });
}

/**
 * 获取学习记录（支持分页）
 */
export function useLearningRecords(options?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: queryKeys.learningRecords.list(options || {}),
    queryFn: async () => {
      return await apiClient.getRecords(options);
    },
    staleTime: CACHE_TIME.MEDIUM_SHORT, // 2分钟
  });
}

/**
 * 创建学习记录的 Mutation
 */
export function useCreateRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordData: Parameters<(typeof apiClient)['createRecord']>[0]) => {
      return await apiClient.createRecord(recordData);
    },
    onSuccess: () => {
      // 创建成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.learningRecords.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
    },
  });
}

/**
 * 批量创建学习记录的 Mutation
 */
export function useBatchCreateRecords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (records: Parameters<(typeof apiClient)['batchCreateRecords']>[0]) => {
      return await apiClient.batchCreateRecords(records);
    },
    onSuccess: () => {
      // 批量创建成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.learningRecords.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
    },
  });
}
