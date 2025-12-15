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
import { QUERY_PRESETS, CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import { apiClient } from '../../services/client';
import type { AlgorithmConfig, ConfigHistory } from '../../types/models';
import { AlgorithmConfigService } from '../../services/algorithms/AlgorithmConfigService';

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
    // 使用 stable 预设 - 算法配置不经常变化
    ...QUERY_PRESETS.stable,
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
    staleTime: CACHE_TIME.MEDIUM_SHORT, // 2分钟
    gcTime: GC_TIME.MEDIUM, // 10分钟
    enabled,
  });
}

/**
 * 获取算法配置预设列表
 *
 * 特点：
 * - 优先从后端API获取预设
 * - API失败时回退到本地默认预设
 * - 较长的缓存时间，因为预设列表很少变化
 */
export function useAlgorithmConfigPresets() {
  return useQuery<AlgorithmConfig[]>({
    queryKey: queryKeys.algorithmConfig.presets(),
    queryFn: async () => {
      try {
        // 优先从后端API获取预设
        const presets = await apiClient.getAllAlgorithmConfigs();
        if (presets && presets.length > 0) {
          return presets;
        }
      } catch (error) {
        console.warn('获取后端预设失败，使用本地默认配置:', error);
      }

      // 回退到本地默认配置
      const defaults = new AlgorithmConfigService().getDefaultConfig();

      const localPresets: AlgorithmConfig[] = [
        defaults,
        {
          ...defaults,
          id: 'balanced',
          name: '均衡模式',
          description: '更平衡的新词/复习权重，适合日常学习',
          priorityWeights: {
            ...defaults.priorityWeights,
            newWord: 30,
            errorRate: 30,
            overdueTime: 25,
            wordScore: 15,
          },
          scoreWeights: {
            ...defaults.scoreWeights,
            accuracy: 35,
            speed: 30,
            stability: 25,
            proficiency: 10,
          },
        },
        {
          ...defaults,
          id: 'speed-first',
          name: '提速模式',
          description: '提高新词比例并收紧速度阈值，适合冲刺记忆',
          reviewIntervals: [1, 2, 4, 8, 15],
          priorityWeights: {
            ...defaults.priorityWeights,
            newWord: 50,
            errorRate: 20,
            overdueTime: 20,
            wordScore: 10,
          },
          speedThresholds: { excellent: 2500, good: 4000, average: 8000, slow: 12000 },
        },
        {
          ...defaults,
          id: 'stability-first',
          name: '稳态复习',
          description: '加大复习间隔并提高错误率权重，适合稳固长期记忆',
          reviewIntervals: [1, 3, 7, 15, 30, 60],
          priorityWeights: {
            ...defaults.priorityWeights,
            newWord: 20,
            errorRate: 40,
            overdueTime: 30,
            wordScore: 10,
          },
          consecutiveCorrectThreshold: 6,
          consecutiveWrongThreshold: 2,
        },
      ];

      return localPresets;
    },
    staleTime: CACHE_TIME.LONG, // 10分钟
    gcTime: GC_TIME.STATIC, // 1小时
    refetchOnWindowFocus: false,
  });
}
