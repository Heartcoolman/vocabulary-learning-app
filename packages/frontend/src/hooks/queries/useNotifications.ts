/**
 * 通知系统 React Query Hooks
 *
 * 提供通知的查询和变更操作：
 * - 获取通知列表
 * - 获取通知统计（60秒轮询，遵循 C1）
 * - 标记已读（单条/批量/全部）
 * - 删除通知（单条/批量）
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import {
  notificationClient,
  type Notification,
  type NotificationStats,
  type NotificationQueryParams,
} from '../../services/client';

/**
 * 获取通知列表
 *
 * @param params 查询参数（status, type, priority, limit, offset）
 * @param options 额外配置
 */
export function useNotifications(
  params?: NotificationQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery<Notification[], Error>({
    queryKey: queryKeys.notifications.list((params ?? {}) as Record<string, unknown>),
    queryFn: () => notificationClient.getNotifications(params),
    staleTime: CACHE_TIME.SHORT,
    gcTime: GC_TIME.MEDIUM,
    enabled: options?.enabled !== false,
  });
}

/**
 * 获取通知统计
 *
 * 遵循 C1: 60秒轮询刷新
 */
export function useNotificationStats(options?: { enabled?: boolean }) {
  return useQuery<NotificationStats, Error>({
    queryKey: queryKeys.notifications.stats(),
    queryFn: () => notificationClient.getStats(),
    staleTime: CACHE_TIME.SHORT,
    gcTime: GC_TIME.MEDIUM,
    refetchInterval: 60000, // C1: 60秒轮询
    enabled: options?.enabled !== false,
  });
}

/**
 * 标记单条通知已读
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => notificationClient.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * 批量标记通知已读
 */
export function useBatchMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation<{ affected: number }, Error, string[]>({
    mutationFn: (ids) => notificationClient.batchMarkAsRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * 标记全部通知已读
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: () => notificationClient.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * 删除单条通知
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => notificationClient.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * 批量删除通知
 */
export function useBatchDeleteNotifications() {
  const queryClient = useQueryClient();

  return useMutation<{ affected: number }, Error, string[]>({
    mutationFn: (ids) => notificationClient.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
