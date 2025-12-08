import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient, { StudyProgress } from '../../services/client';

/**
 * 获取学习进度的 Query Hook
 *
 * 配置说明:
 * - staleTime: 30秒 - 学习进度数据可以容忍30秒的过期时间
 * - refetchOnWindowFocus: true - 窗口重新获得焦点时刷新
 * - refetchOnReconnect: true - 网络重连时刷新
 */
export function useStudyProgress(): UseQueryResult<StudyProgress, Error> {
  return useQuery({
    queryKey: queryKeys.studyProgress.current(),
    queryFn: async () => {
      const data = await apiClient.getStudyProgress();
      return data;
    },
    staleTime: 30 * 1000, // 30秒
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * 带刷新功能的学习进度Hook
 * 兼容旧版API返回格式
 */
export function useStudyProgressWithRefresh() {
  const query = useStudyProgress();

  return {
    progress: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}
