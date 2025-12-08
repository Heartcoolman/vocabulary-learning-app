/**
 * 习惯画像相关的 React Query Hooks
 *
 * 提供用户习惯画像的查询和管理功能，包括：
 * - 获取习惯画像
 * - 初始化习惯画像
 * - 结束学习会话并持久化
 * - 手动持久化
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_PRESETS, CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import ApiClient from '../../services/client';
import { useAuth } from '../../contexts/AuthContext';
import type {
  HabitProfileResponse,
  InitializeProfileResponse,
  EndSessionResponse,
  PersistProfileResponse,
} from '../../types/habit-profile';

/**
 * 习惯画像查询键
 */
const habitProfileKeys = {
  all: ['habitProfile'] as const,
  profile: () => [...habitProfileKeys.all, 'profile'] as const,
};

/**
 * 获取用户习惯画像
 *
 * 返回数据库中存储的画像和内存中实时计算的画像
 *
 * 特点：
 * - 5分钟缓存时间
 * - 窗口焦点时刷新（习惯画像可能在后台变化）
 */
export function useHabitProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<HabitProfileResponse>({
    queryKey: habitProfileKeys.profile(),
    queryFn: async () => {
      return await ApiClient.getHabitProfile();
    },
    enabled: isAuthenticated,
    staleTime: CACHE_TIME.MEDIUM,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

/**
 * 从历史记录初始化习惯画像
 *
 * 用于数据恢复或首次生成习惯画像
 * 成功后会刷新习惯画像数据
 */
export function useInitializeHabitProfile() {
  const queryClient = useQueryClient();

  return useMutation<InitializeProfileResponse, Error, void>({
    mutationFn: async () => {
      return await ApiClient.initializeHabitProfile();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: habitProfileKeys.profile() });
    },
  });
}

/**
 * 结束学习会话并持久化习惯画像
 *
 * @param sessionId 学习会话ID
 */
export function useEndHabitSession() {
  const queryClient = useQueryClient();

  return useMutation<EndSessionResponse, Error, string>({
    mutationFn: async (sessionId: string) => {
      return await ApiClient.endHabitSession(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: habitProfileKeys.profile() });
    },
  });
}

/**
 * 手动触发习惯画像持久化
 *
 * 将内存中的习惯画像保存到数据库
 */
export function usePersistHabitProfile() {
  const queryClient = useQueryClient();

  return useMutation<PersistProfileResponse, Error, void>({
    mutationFn: async () => {
      return await ApiClient.persistHabitProfile();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: habitProfileKeys.profile() });
    },
  });
}

/**
 * 手动刷新习惯画像的 Hook
 */
export function useRefreshHabitProfile() {
  const queryClient = useQueryClient();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: habitProfileKeys.profile() });
  };

  return { refresh };
}

// 导出查询键供外部使用
export { habitProfileKeys };
