/**
 * 认证相关的 React Query Hooks
 *
 * 提供用户认证功能的查询和变更操作，包括：
 * - 获取当前登录用户
 * - 用户登录
 * - 用户注册
 * - 用户登出
 *
 * 使用 React Query 最佳实践：
 * - 配置合适的 staleTime 和 gcTime
 * - 实现乐观更新
 * - 配置错误重试策略
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import { authClient, type User } from '../../services/client';
import StorageService from '../../services/StorageService';

/**
 * 登录参数
 */
export interface LoginParams {
  email: string;
  password: string;
}

/**
 * 注册参数
 */
export interface RegisterParams {
  email: string;
  password: string;
  username: string;
}

/**
 * 认证响应
 */
export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * 获取当前登录用户
 *
 * 特点：
 * - 10分钟的缓存时间（用户信息相对稳定）
 * - 仅在有 token 时启用查询
 * - 401 错误时自动清除缓存
 *
 * @returns 当前用户信息查询结果
 */
export function useCurrentUser() {
  return useQuery<User | null, Error>({
    queryKey: queryKeys.auth.currentUser(),
    queryFn: async () => {
      const token = authClient.getToken();
      if (!token) {
        return null;
      }
      try {
        return await authClient.getCurrentUser();
      } catch (error) {
        // 401 错误时返回 null，由 authClient 内部处理 token 清除
        if (error instanceof Error && error.message.includes('401')) {
          return null;
        }
        throw error;
      }
    },
    staleTime: CACHE_TIME.LONG, // 10分钟
    gcTime: GC_TIME.VERY_LONG, // 30分钟
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: (failureCount, error) => {
      // 认证错误不重试
      if (error.message.includes('401') || error.message.includes('认证')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * 用户登录 Mutation Hook
 *
 * 成功后：
 * - 保存 token
 * - 更新当前用户缓存
 * - 初始化本地存储
 *
 * @returns 登录 mutation
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<AuthResponse, Error, LoginParams>({
    mutationFn: async ({ email, password }) => {
      const response = await authClient.login(email, password);
      if (!response.token) {
        throw new Error('登录响应中缺少认证令牌');
      }
      return response;
    },
    onSuccess: async (data) => {
      // 保存 token
      authClient.setToken(data.token);

      // 乐观更新：立即更新用户缓存
      queryClient.setQueryData(queryKeys.auth.currentUser(), data.user);

      // 初始化本地存储
      await StorageService.setCurrentUser(data.user.id);

      // 使相关查询失效，确保获取最新数据
      await queryClient.invalidateQueries({ queryKey: queryKeys.user.all });
    },
    onError: (error) => {
      // 登录失败时确保清除任何残留状态
      authClient.clearToken();
      queryClient.setQueryData(queryKeys.auth.currentUser(), null);
    },
  });
}

/**
 * 用户注册 Mutation Hook
 *
 * 成功后：
 * - 保存 token
 * - 更新当前用户缓存
 * - 初始化本地存储
 *
 * @returns 注册 mutation
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation<AuthResponse, Error, RegisterParams>({
    mutationFn: async ({ email, password, username }) => {
      const response = await authClient.register(email, password, username);
      if (!response.token) {
        throw new Error('注册响应中缺少认证令牌');
      }
      return response;
    },
    onSuccess: async (data) => {
      // 保存 token
      authClient.setToken(data.token);

      // 乐观更新：立即更新用户缓存
      queryClient.setQueryData(queryKeys.auth.currentUser(), data.user);

      // 初始化本地存储
      await StorageService.setCurrentUser(data.user.id);
    },
    onError: () => {
      // 注册失败时确保清除任何残留状态
      authClient.clearToken();
      queryClient.setQueryData(queryKeys.auth.currentUser(), null);
    },
  });
}

/**
 * 用户登出 Mutation Hook
 *
 * 成功后：
 * - 清除 token
 * - 清除用户缓存
 * - 清除本地存储
 * - 清除所有查询缓存
 *
 * @returns 登出 mutation
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await authClient.logout();
      } catch (error) {
        // 即使服务端登出失败，也继续清理本地状态
        console.warn('服务端登出失败，继续清理本地状态:', error);
      }
    },
    onSettled: async () => {
      // 无论成功失败都清理本地状态
      authClient.clearToken();

      // 清除用户缓存
      queryClient.setQueryData(queryKeys.auth.currentUser(), null);

      // 清除本地存储
      await StorageService.setCurrentUser(null);
      await StorageService.clearLocalData();

      // 清除所有查询缓存
      queryClient.clear();
    },
  });
}

/**
 * 手动刷新认证状态的 Hook
 *
 * @returns 刷新函数
 */
export function useRefreshAuth() {
  const queryClient = useQueryClient();

  const refreshCurrentUser = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.currentUser() });
  };

  const clearAuth = async () => {
    authClient.clearToken();
    queryClient.setQueryData(queryKeys.auth.currentUser(), null);
    await StorageService.setCurrentUser(null);
  };

  return {
    refreshCurrentUser,
    clearAuth,
  };
}

/**
 * 预加载当前用户的 Hook
 *
 * @returns 预加载函数
 */
export function usePrefetchAuth() {
  const queryClient = useQueryClient();

  const prefetchCurrentUser = async () => {
    const token = authClient.getToken();
    if (!token) return;

    await queryClient.prefetchQuery({
      queryKey: queryKeys.auth.currentUser(),
      queryFn: () => authClient.getCurrentUser(),
      staleTime: CACHE_TIME.LONG,
    });
  };

  return {
    prefetchCurrentUser,
  };
}

/**
 * 认证状态 Hook
 *
 * 提供便捷的认证状态检查
 *
 * @returns 认证状态
 */
export function useAuthStatus() {
  const { data: user, isLoading, error } = useCurrentUser();

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
  };
}
