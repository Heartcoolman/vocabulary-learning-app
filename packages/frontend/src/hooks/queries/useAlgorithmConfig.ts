/**
 * 算法配置相关的 React Query Hooks
 *
 * 提供算法配置的查询功能，包括：
 * - 获取当前激活的算法配置
 * - 获取配置历史记录
 *
 * 配置了1小时的长缓存时间，因为配置不经常变化
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/ApiClient';
import type { AlgorithmConfig, ConfigHistory } from '../../types/models';

/**
 * 获取当前激活的算法配置
 *
 * 特点：
 * - 1小时的长缓存时间（配置不经常变化）
 * - 5分钟的数据保鲜时间
 * - 启用后台更新
 */
export function useAlgorithmConfig() {
  return useQuery<AlgorithmConfig>({
    queryKey: queryKeys.algorithmConfig.active(),
    queryFn: async () => {
      return await apiClient.getAlgorithmConfig();
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 60, // 1小时（长缓存）
    refetchOnWindowFocus: false, // 配置不需要频繁重新获取
    refetchOnReconnect: false,
  });
}

/**
 * 获取算法配置的历史记录
 *
 * @param limit - 限制返回的记录数量，默认50条
 * @param enabled - 是否启用查询，默认true
 */
export function useConfigHistory(limit?: number, enabled = true) {
  return useQuery<ConfigHistory[]>({
    queryKey: queryKeys.algorithmConfig.history(limit),
    queryFn: async () => {
      return await apiClient.getConfigHistory(limit);
    },
    staleTime: 1000 * 60 * 2, // 2分钟
    gcTime: 1000 * 60 * 10, // 10分钟
    enabled,
  });
}

/**
 * 获取算法配置预设列表
 *
 * 特点：
 * - 较长的缓存时间，因为预设列表很少变化
 */
export function useAlgorithmConfigPresets() {
  return useQuery<AlgorithmConfig[]>({
    queryKey: queryKeys.algorithmConfig.presets(),
    queryFn: async () => {
      // 假设后端有这个接口，如果没有需要实现
      const response = await apiClient.request<{ success: boolean; data: AlgorithmConfig[] }>(
        '/api/algorithm-config/presets'
      );
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10分钟
    gcTime: 1000 * 60 * 60, // 1小时
    refetchOnWindowFocus: false,
  });
}
