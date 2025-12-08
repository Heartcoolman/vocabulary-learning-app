/**
 * 学习计划相关的 React Query Hooks
 *
 * 提供学习计划的查询和管理功能，包括：
 * - 获取当前学习计划
 * - 生成新的学习计划
 * - 调整学习计划
 * - 获取计划进度
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_PRESETS, CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import ApiClient from '../../services/client';
import { useAuth } from '../../contexts/AuthContext';
import type { LearningPlan, PlanOptions, PlanProgress } from '../../types/amas-enhanced';

/**
 * 学习计划查询键
 */
const planQueryKeys = {
  all: ['learningPlan'] as const,
  plan: () => [...planQueryKeys.all, 'plan'] as const,
  progress: () => [...planQueryKeys.all, 'progress'] as const,
};

/**
 * 获取当前学习计划
 *
 * 如果用户尚未创建计划，返回 null
 *
 * 特点：
 * - 10分钟缓存时间（计划相对稳定）
 * - 挂载时刷新
 */
export function useLearningPlan() {
  const { isAuthenticated } = useAuth();

  return useQuery<LearningPlan | null>({
    queryKey: planQueryKeys.plan(),
    queryFn: async () => {
      return await ApiClient.getLearningPlan();
    },
    enabled: isAuthenticated,
    staleTime: CACHE_TIME.LONG,
    gcTime: GC_TIME.VERY_LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

/**
 * 获取学习计划进度
 *
 * 特点：
 * - 2分钟缓存时间（进度变化较频繁）
 * - 窗口焦点时刷新
 */
export function usePlanProgress() {
  const { isAuthenticated } = useAuth();

  return useQuery<PlanProgress & { status: string }>({
    queryKey: planQueryKeys.progress(),
    queryFn: async () => {
      return await ApiClient.getPlanProgress();
    },
    enabled: isAuthenticated,
    staleTime: CACHE_TIME.MEDIUM_SHORT,
    gcTime: GC_TIME.MEDIUM,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

/**
 * 生成新的学习计划
 *
 * 成功后会刷新计划和进度数据
 */
export function useGenerateLearningPlan() {
  const queryClient = useQueryClient();

  return useMutation<LearningPlan, Error, PlanOptions | undefined>({
    mutationFn: async (options) => {
      return await ApiClient.generateLearningPlan(options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.plan() });
      queryClient.invalidateQueries({ queryKey: planQueryKeys.progress() });
    },
  });
}

/**
 * 调整学习计划
 *
 * 根据用户当前状态和学习表现调整计划
 */
export function useAdjustLearningPlan() {
  const queryClient = useQueryClient();

  return useMutation<LearningPlan, Error, string | undefined>({
    mutationFn: async (reason) => {
      return await ApiClient.adjustLearningPlan(reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKeys.plan() });
      queryClient.invalidateQueries({ queryKey: planQueryKeys.progress() });
    },
  });
}

/**
 * 手动刷新学习计划的 Hook
 */
export function useRefreshLearningPlan() {
  const queryClient = useQueryClient();

  const refreshPlan = async () => {
    await queryClient.invalidateQueries({ queryKey: planQueryKeys.plan() });
  };

  const refreshProgress = async () => {
    await queryClient.invalidateQueries({ queryKey: planQueryKeys.progress() });
  };

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: planQueryKeys.all });
  };

  return {
    refreshPlan,
    refreshProgress,
    refreshAll,
  };
}

// 导出查询键供外部使用
export { planQueryKeys };
