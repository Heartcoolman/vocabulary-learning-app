/**
 * 配置相关的 React Query Mutation Hooks
 *
 * 提供配置的变更操作，包括：
 * - 更新算法配置
 * - 重置算法配置
 * - 更新学习配置
 *
 * 所有变更操作会自动触发相关查询的 invalidation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/ApiClient';
import type { AlgorithmConfig, StudyConfig } from '../../types/models';

/**
 * 更新算法配置的参数
 */
export interface UpdateAlgorithmConfigParams {
  configId: string;
  config: Partial<AlgorithmConfig>;
  changeReason?: string;
}

/**
 * 更新学习配置的参数
 */
export interface UpdateStudyConfigParams {
  selectedWordBookIds: string[];
  dailyWordCount: number;
  studyMode?: string;
}

/**
 * 更新算法配置
 *
 * 成功后会自动触发以下查询的 invalidation：
 * - 当前激活的算法配置
 * - 配置历史记录
 * - 配置预设列表
 */
export function useUpdateAlgorithmConfig() {
  const queryClient = useQueryClient();

  return useMutation<AlgorithmConfig, Error, UpdateAlgorithmConfigParams>({
    mutationFn: async ({ configId, config, changeReason }) => {
      return await apiClient.updateAlgorithmConfig(configId, config, changeReason);
    },
    onSuccess: () => {
      // 使所有相关查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.algorithmConfig.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.algorithmConfig.histories() });
      queryClient.invalidateQueries({ queryKey: queryKeys.algorithmConfig.presets() });
    },
  });
}

/**
 * 重置算法配置为默认值
 *
 * 成功后会自动触发以下查询的 invalidation：
 * - 当前激活的算法配置
 * - 配置历史记录
 */
export function useResetAlgorithmConfig() {
  const queryClient = useQueryClient();

  return useMutation<AlgorithmConfig, Error, string>({
    mutationFn: async (configId: string) => {
      return await apiClient.resetAlgorithmConfig(configId);
    },
    onSuccess: () => {
      // 使所有相关查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.algorithmConfig.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.algorithmConfig.histories() });
    },
  });
}

/**
 * 更新学习配置
 *
 * 成功后会自动触发以下查询的 invalidation：
 * - 用户学习配置
 * - 今日学习单词
 * - 学习进度
 */
export function useUpdateStudyConfig() {
  const queryClient = useQueryClient();

  return useMutation<StudyConfig, Error, UpdateStudyConfigParams>({
    mutationFn: async (data) => {
      return await apiClient.updateStudyConfig(data);
    },
    onSuccess: () => {
      // 使所有相关查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.studyConfig.config() });
      queryClient.invalidateQueries({ queryKey: queryKeys.studyConfig.todayWords() });
      queryClient.invalidateQueries({ queryKey: queryKeys.studyConfig.progress() });

      // 学习配置变更可能影响单词列表，也需要刷新
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
    },
  });
}
