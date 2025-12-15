import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { apiClient } from '../../services/client';
import type {
  TrendInfo,
  TrendHistoryItem,
  TrendReport,
  InterventionResult,
} from '../../types/amas-enhanced';

/**
 * 趋势分析查询键
 */
const trendQueryKeys = {
  all: ['trend'] as const,
  current: () => [...trendQueryKeys.all, 'current'] as const,
  history: (days: number) => [...trendQueryKeys.all, 'history', days] as const,
  report: () => [...trendQueryKeys.all, 'report'] as const,
  intervention: () => [...trendQueryKeys.all, 'intervention'] as const,
};

/**
 * 获取当前趋势状态
 * 每分钟自动刷新
 */
export function useCurrentTrend() {
  return useQuery({
    queryKey: trendQueryKeys.current(),
    queryFn: async (): Promise<TrendInfo & { stateDescription: string }> => {
      return await apiClient.getCurrentTrend();
    },
    staleTime: 60 * 1000, // 1分钟
    refetchInterval: 60 * 1000, // 每分钟自动刷新
    refetchOnWindowFocus: true,
  });
}

/**
 * 获取趋势历史数据
 * @param days 查询天数（默认28天）
 */
export function useTrendHistory(days: number = 28) {
  return useQuery({
    queryKey: trendQueryKeys.history(days),
    queryFn: async () => {
      return await apiClient.getTrendHistory(days);
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    refetchInterval: 5 * 60 * 1000, // 每5分钟自动刷新
  });
}

/**
 * 生成趋势报告
 * 包含详细的趋势分析和建议
 */
export function useTrendReport() {
  return useQuery({
    queryKey: trendQueryKeys.report(),
    queryFn: async (): Promise<TrendReport> => {
      return await apiClient.getTrendReport();
    },
    staleTime: 10 * 60 * 1000, // 10分钟
    refetchOnWindowFocus: true,
  });
}

/**
 * 检查是否需要干预
 * 根据用户状态提供个性化建议
 */
export function useIntervention() {
  return useQuery({
    queryKey: trendQueryKeys.intervention(),
    queryFn: async (): Promise<InterventionResult> => {
      return await apiClient.getIntervention();
    },
    staleTime: 2 * 60 * 1000, // 2分��
    refetchInterval: 5 * 60 * 1000, // 每5分钟检查一次
  });
}

/**
 * 获取黄金学习时间
 */
export function useGoldenTime() {
  return useQuery({
    queryKey: [...trendQueryKeys.all, 'goldenTime'],
    queryFn: async () => {
      return await apiClient.getGoldenTime();
    },
    staleTime: 30 * 60 * 1000, // 30分钟
  });
}

/**
 * 获取时间偏好分析
 */
export function useTimePreferences() {
  return useQuery({
    queryKey: [...trendQueryKeys.all, 'timePreferences'],
    queryFn: async () => {
      return await apiClient.getTimePreferences();
    },
    staleTime: 60 * 60 * 1000, // 1小时
  });
}

/**
 * 获取状态历史数据
 * @param range 日期范围（7, 14, 30, 90天）
 */
export function useStateHistory(range: 7 | 14 | 30 | 90 = 30) {
  return useQuery({
    queryKey: [...trendQueryKeys.all, 'stateHistory', range],
    queryFn: async () => {
      return await apiClient.getStateHistory(range);
    },
    staleTime: 5 * 60 * 1000, // 5分钟
  });
}

/**
 * 获取认知成长对比
 * @param range 对比时间范围
 */
export function useCognitiveGrowth(range: 7 | 14 | 30 | 90 = 30) {
  return useQuery({
    queryKey: [...trendQueryKeys.all, 'cognitiveGrowth', range],
    queryFn: async () => {
      return await apiClient.getCognitiveGrowth(range);
    },
    staleTime: 10 * 60 * 1000, // 10分钟
  });
}

/**
 * 获取显著变化
 * @param range 分析时间范围
 */
export function useSignificantChanges(range: 7 | 14 | 30 | 90 = 30) {
  return useQuery({
    queryKey: [...trendQueryKeys.all, 'significantChanges', range],
    queryFn: async () => {
      return await apiClient.getSignificantChanges(range);
    },
    staleTime: 10 * 60 * 1000, // 10分钟
  });
}

/**
 * 刷新趋势分析数据的辅助函数
 */
export function useRefreshTrendAnalysis() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: trendQueryKeys.all });
  };
}

/**
 * 手动触发趋势报告生成
 */
export function useGenerateTrendReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.getTrendReport();
    },
    onSuccess: () => {
      // 刷新趋势相关数据
      queryClient.invalidateQueries({ queryKey: trendQueryKeys.all });
    },
  });
}

// 导出查询键供外部使用
export { trendQueryKeys };
