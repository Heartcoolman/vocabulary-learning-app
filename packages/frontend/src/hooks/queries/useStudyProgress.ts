import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { DATA_CACHE_CONFIG } from '../../lib/cacheConfig';
import { apiClient, type StudyProgress } from '../../services/client';

/**
 * 获取学习进度的 Query Hook
 *
 * 配置说明:
 * - 使用 DATA_CACHE_CONFIG.studyProgress 预设配置（实时数据）
 * - staleTime: 30秒 - 学习进度数据可以容忍30秒的过期时间
 * - refetchOnWindowFocus: true - 窗口重新获得焦点时刷新
 * - refetchOnMount: true - 组件挂载时刷新
 */
export function useStudyProgress(): UseQueryResult<StudyProgress, Error> {
  return useQuery<StudyProgress, Error>({
    queryKey: queryKeys.studyProgress.current(),
    queryFn: async (): Promise<StudyProgress> => {
      return await apiClient.getStudyProgress();
    },
    staleTime: DATA_CACHE_CONFIG.studyProgress.staleTime,
    gcTime: DATA_CACHE_CONFIG.studyProgress.gcTime,
    retry: DATA_CACHE_CONFIG.studyProgress.retry,
    refetchOnWindowFocus: DATA_CACHE_CONFIG.studyProgress.refetchOnWindowFocus,
    refetchOnMount: DATA_CACHE_CONFIG.studyProgress.refetchOnMount,
    refetchOnReconnect: true,
  }) as UseQueryResult<StudyProgress, Error>;
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
