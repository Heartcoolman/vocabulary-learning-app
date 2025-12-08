import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient, {
  UserDetailedStatistics,
  UserLearningData,
  UserLearningHeatmap,
} from '../../services/client';

/**
 * 获取用户详细统计数据的 Query Hook
 */
export function useUserStatistics(userId: string) {
  return useQuery({
    queryKey: queryKeys.admin.userStatistics.detail(userId),
    queryFn: async () => {
      const data = await apiClient.adminGetUserStatistics(userId);
      return data;
    },
    enabled: !!userId,
    // 统计数据可以缓存更久一些
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 获取用户学习数据的 Query Hook
 */
export function useUserLearningData(userId: string, limit: number = 100) {
  return useQuery({
    queryKey: queryKeys.admin.userLearning.data(userId, limit),
    queryFn: async () => {
      const data = await apiClient.adminGetUserLearningData(userId, limit);
      return data;
    },
    enabled: !!userId,
    staleTime: 3 * 60 * 1000,
  });
}

/**
 * 获取用户学习热力图数据的 Query Hook
 * @param userId 用户ID
 * @param days 天数（可选，默认获取所有数据）
 */
export function useUserLearningHeatmap(userId: string, days?: number) {
  return useQuery({
    queryKey: queryKeys.admin.userLearning.heatmap(userId, days?.toString() ?? '', ''),
    queryFn: async () => {
      const data = await apiClient.adminGetUserLearningHeatmap(userId, days);
      return data;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 热力图数据可以缓存更久
  });
}

/**
 * 获取用户学习记录的 Query Hook
 */
export function useUserLearningRecords(
  userId: string,
  params: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
  } = {},
) {
  const { page = 1, pageSize = 50, startDate, endDate } = params;

  return useQuery({
    queryKey: queryKeys.admin.userLearning.records(userId, {
      page,
      pageSize,
      startDate,
      endDate,
    }),
    queryFn: async () => {
      // 使用 adminGetUserLearningData，传入 pageSize 作为 limit
      const data = await apiClient.adminGetUserLearningData(userId, pageSize);
      return data;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * 获取用户学习趋势数据的 Query Hook
 */
export function useUserLearningTrend(userId: string, days: number = 30) {
  return useQuery({
    queryKey: queryKeys.admin.userLearning.trend(userId, days),
    queryFn: async () => {
      // 使用热力图数据计算趋势，传入天数参数
      const heatmapData = await apiClient.adminGetUserLearningHeatmap(userId, days);

      // 计算趋势指标
      const totalActivity = heatmapData.reduce((sum, day) => sum + day.activityLevel, 0);
      const averageActivity = heatmapData.length > 0 ? totalActivity / heatmapData.length : 0;
      const averageAccuracy =
        heatmapData.length > 0
          ? heatmapData.reduce((sum, day) => sum + day.accuracy, 0) / heatmapData.length
          : 0;
      const averageScore =
        heatmapData.length > 0
          ? heatmapData.reduce((sum, day) => sum + day.averageScore, 0) / heatmapData.length
          : 0;

      return {
        heatmapData,
        totalActivity,
        averageActivity,
        averageAccuracy,
        averageScore,
        days,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 批量获取多个用户的统计数据（用于对比分析）
 */
export function useBatchUserStatistics(userIds: string[]) {
  return useQuery({
    queryKey: queryKeys.admin.userStatistics.batch(userIds),
    queryFn: async () => {
      const results = await Promise.allSettled(
        userIds.map((userId) => apiClient.adminGetUserStatistics(userId)),
      );

      return results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<UserDetailedStatistics>).value);
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
