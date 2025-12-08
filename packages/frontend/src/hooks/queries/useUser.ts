/**
 * 用户相关的 React Query Hooks
 *
 * 提供用户信息的查询和更新功能，包括：
 * - 获取当前用户信息
 * - 获取用户统计数据
 * - 修改密码
 * - 更新用户设置
 *
 * 配置了合理的缓存策略，用户信息相对稳定
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { DATA_CACHE_CONFIG, CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import { authClient, type User } from '../../services/client';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 用户统计数据接口
 */
export interface UserStatistics {
  totalWords: number;
  totalRecords: number;
  correctRate: number;
}

/**
 * 获取当前用户信息
 *
 * 特点：
 * - 10分钟的缓存时间（用户信息相对稳定）
 * - 仅在已登录时启用查询
 * - 不在窗口焦点时自动刷新
 *
 * @returns 用户信息查询结果
 */
export function useUser() {
  const { isAuthenticated } = useAuth();

  return useQuery<User | null>({
    queryKey: queryKeys.user.profile(),
    queryFn: async () => {
      const token = authClient.getToken();
      if (!token) {
        return null;
      }
      return await authClient.getCurrentUser();
    },
    enabled: isAuthenticated,
    ...DATA_CACHE_CONFIG.user,
  });
}

/**
 * 获取当前用户的基础统计信息
 *
 * 特点：
 * - 5分钟的缓存时间
 * - 包含总单词数、总记录数、正确率
 *
 * @returns 用户统计数据
 */
export function useUserStats() {
  const { isAuthenticated } = useAuth();

  return useQuery<UserStatistics>({
    queryKey: queryKeys.user.statistics(),
    queryFn: async () => {
      return await authClient.getUserStatistics();
    },
    enabled: isAuthenticated,
    ...DATA_CACHE_CONFIG.userStatistics,
  });
}

/**
 * 修改密码的参数
 */
export interface UpdatePasswordParams {
  oldPassword: string;
  newPassword: string;
}

/**
 * 修改用户密码
 *
 * 成功后不会自动刷新用户信息（密码变更不影响用户数据显示）
 */
export function useUpdatePassword() {
  return useMutation<void, Error, UpdatePasswordParams>({
    mutationFn: async ({ oldPassword, newPassword }) => {
      await authClient.updatePassword(oldPassword, newPassword);
    },
  });
}

/**
 * 手动刷新用户数据的 Hook
 *
 * 提供便捷的方法来刷新用户相关的查询数据
 *
 * @example
 * ```tsx
 * const { refreshUser, refreshUserStats, refreshAll } = useRefreshUser();
 *
 * // 单独刷新用户信息
 * await refreshUser();
 *
 * // 刷新所有用户相关数据
 * refreshAll();
 * ```
 */
export function useRefreshUser() {
  const queryClient = useQueryClient();

  const refreshUser = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
  };

  const refreshUserStats = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
  };

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.user.all });
  };

  return {
    refreshUser,
    refreshUserStats,
    refreshAll,
  };
}

/**
 * 预加载用户数据的 Hook
 *
 * 用于在用户可能需要之前预先加载数据
 *
 * @example
 * ```tsx
 * const { prefetchUser } = usePrefetchUser();
 *
 * // 在页面加载时预加载
 * useEffect(() => {
 *   prefetchUser();
 * }, []);
 * ```
 */
export function usePrefetchUser() {
  const queryClient = useQueryClient();

  const prefetchUser = async () => {
    const token = authClient.getToken();
    if (!token) return;

    await queryClient.prefetchQuery({
      queryKey: queryKeys.user.profile(),
      queryFn: () => authClient.getCurrentUser(),
      staleTime: CACHE_TIME.LONG,
    });
  };

  const prefetchUserStats = async () => {
    const token = authClient.getToken();
    if (!token) return;

    await queryClient.prefetchQuery({
      queryKey: queryKeys.user.statistics(),
      queryFn: () => authClient.getUserStatistics(),
      staleTime: CACHE_TIME.MEDIUM,
    });
  };

  return {
    prefetchUser,
    prefetchUserStats,
  };
}
