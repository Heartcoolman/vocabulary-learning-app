import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient, { TodayWordsResponse } from '../../services/ApiClient';

/**
 * 获取今日学习单词的 Query Hook
 *
 * 配置说明:
 * - staleTime: 60秒 - 今日单词列表可以容忍1分钟的过期时间
 * - refetchOnWindowFocus: true - 窗口重新获得焦点时刷新
 * - refetchOnReconnect: true - 网络重连时刷新
 */
export function useTodayWords(): UseQueryResult<TodayWordsResponse, Error> {
  return useQuery({
    queryKey: queryKeys.studyProgress.todayWords(),
    queryFn: async () => {
      const data = await apiClient.getTodayWords();
      return data;
    },
    staleTime: 60 * 1000, // 1分钟
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * 兼容旧版useStudyPlan API的Hook
 * 返回格式与旧版保持一致
 */
export function useTodayWordsCompat() {
  const query = useTodayWords();

  return {
    plan: query.data
      ? {
          words: query.data.words,
          todayStudied: query.data.progress.todayStudied,
          todayTarget: query.data.progress.todayTarget,
          totalStudied: query.data.progress.totalStudied,
          correctRate: query.data.progress.correctRate,
        }
      : null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}
