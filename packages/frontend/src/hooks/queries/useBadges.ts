import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { apiClient } from '../../services/client';

/**
 * 获取用户所有徽章的 Query Hook
 * Requirements: 3.2
 */
export function useUserBadges() {
  return useQuery({
    queryKey: queryKeys.badges.userBadges(),
    queryFn: async () => {
      const response = await apiClient.getUserBadges();
      return response;
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });
}

/**
 * 获取所有徽章（包含解锁状态）的 Query Hook
 * Requirements: 3.1, 3.2
 */
export function useAllBadgesWithStatus() {
  return useQuery({
    queryKey: queryKeys.badges.allWithStatus(),
    queryFn: async () => {
      const response = await apiClient.getAllBadgesWithStatus();
      return response;
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });
}

/**
 * 获取徽章详情的 Query Hook
 * Requirements: 3.5
 */
export function useBadgeDetails(badgeId: string) {
  return useQuery({
    queryKey: queryKeys.badges.detail(badgeId),
    queryFn: async () => {
      const response = await apiClient.getBadgeDetails(badgeId);
      return response;
    },
    enabled: !!badgeId,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });
}

/**
 * 获取徽章进度的 Query Hook
 * Requirements: 3.5
 */
export function useBadgeProgress(badgeId: string) {
  return useQuery({
    queryKey: queryKeys.badges.progress(badgeId),
    queryFn: async () => {
      const response = await apiClient.getBadgeProgress(badgeId);
      return response;
    },
    enabled: !!badgeId,
    staleTime: 1 * 60 * 1000, // 1分钟缓存（进度更新频繁）
  });
}

/**
 * 检查并授予新徽章的 Mutation Hook
 * Requirements: 3.1, 3.3, 3.4
 */
export function useCheckAndAwardBadges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.checkAndAwardBadges();
      return response;
    },
    onSuccess: () => {
      // 检查成功后，使徽章相关查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.badges.all });
    },
  });
}
