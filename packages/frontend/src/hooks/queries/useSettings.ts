/**
 * 用户设置相关的 React Query Hooks
 *
 * 提供用户学习设置的查询和更新功能，包括：
 * - 学习配置（每日单词数、选中的词书等）
 * - 学习目标配置
 * - 奖励配置（学习模式）
 * - 认知画像配置
 *
 * 配置了较长的缓存时间，因为设置不经常变化
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_PRESETS } from '../../lib/cacheConfig';
import ApiClient from '../../services/client';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 学习目标配置接口
 */
export interface LearningObjectives {
  userId: string;
  mode: 'exam' | 'daily' | 'travel' | 'custom';
  primaryObjective: 'accuracy' | 'retention' | 'efficiency';
  minAccuracy?: number;
  maxDailyTime?: number;
  targetRetention?: number;
  weightShortTerm: number;
  weightLongTerm: number;
  weightEfficiency: number;
}

/**
 * 奖励配置（学习模式）接口
 */
export interface RewardProfile {
  currentProfile: string;
  availableProfiles: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

/**
 * Chronotype 画像接口
 */
export interface ChronotypeProfile {
  category: 'morning' | 'evening' | 'intermediate';
  peakHours: number[];
  confidence: number;
  learningHistory: Array<{
    hour: number;
    performance: number;
    sampleCount: number;
  }>;
}

/**
 * 学习风格画像接口
 */
export interface LearningStyleProfile {
  style: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  confidence: number;
  scores: {
    visual: number;
    auditory: number;
    kinesthetic: number;
  };
}

/**
 * 完整认知画像接口
 */
export interface CognitiveProfile {
  chronotype: ChronotypeProfile;
  learningStyle: LearningStyleProfile;
}

// ==================== 学习目标 ====================

/**
 * 获取用户学习目标配置
 */
export function useLearningObjectives() {
  const { isAuthenticated } = useAuth();

  return useQuery<LearningObjectives>({
    queryKey: [...queryKeys.user.settings(), 'objectives'],
    queryFn: async () => {
      return await ApiClient.getLearningObjectives();
    },
    enabled: isAuthenticated,
    ...QUERY_PRESETS.stable,
  });
}

/**
 * 更新学习目标配置
 */
export function useUpdateLearningObjectives() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, Omit<LearningObjectives, 'userId'>>({
    mutationFn: async (objectives) => {
      await ApiClient.updateLearningObjectives(objectives);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.user.settings(), 'objectives'],
      });
    },
  });
}

/**
 * 切换学习模式
 */
export function useSwitchLearningMode() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { mode: LearningObjectives['mode']; reason?: string }>({
    mutationFn: async ({ mode, reason }) => {
      await ApiClient.switchLearningMode(mode, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.user.settings(), 'objectives'],
      });
    },
  });
}

/**
 * 获取学习模式建议
 */
export function useLearningModeSuggestions() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.user.settings(), 'modeSuggestions'],
    queryFn: async () => {
      return await ApiClient.getLearningObjectiveSuggestions();
    },
    enabled: isAuthenticated,
    ...QUERY_PRESETS.standard,
  });
}

// ==================== 奖励配置 ====================

/**
 * 获取用户奖励配置（学习模式）
 */
export function useRewardProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<RewardProfile>({
    queryKey: [...queryKeys.user.settings(), 'reward'],
    queryFn: async () => {
      return await ApiClient.getUserRewardProfile();
    },
    enabled: isAuthenticated,
    ...QUERY_PRESETS.stable,
  });
}

/**
 * 更新用户奖励配置
 */
export function useUpdateRewardProfile() {
  const queryClient = useQueryClient();

  return useMutation<{ currentProfile: string; message: string }, Error, string>({
    mutationFn: async (profileId) => {
      return await ApiClient.updateUserRewardProfile(profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.user.settings(), 'reward'],
      });
    },
  });
}

// ==================== 认知画像 ====================

/**
 * 获取用户 Chronotype 画像
 */
export function useChronotypeProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<ChronotypeProfile>({
    queryKey: [...queryKeys.user.settings(), 'chronotype'],
    queryFn: async () => {
      return await ApiClient.getChronotypeProfile();
    },
    enabled: isAuthenticated,
    ...QUERY_PRESETS.stable,
  });
}

/**
 * 获取用户学习风格画像
 */
export function useLearningStyleProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<LearningStyleProfile>({
    queryKey: [...queryKeys.user.settings(), 'learningStyle'],
    queryFn: async () => {
      return await ApiClient.getLearningStyleProfile();
    },
    enabled: isAuthenticated,
    ...QUERY_PRESETS.stable,
  });
}

/**
 * 获取用户完整认知画像（Chronotype + Learning Style）
 */
export function useCognitiveProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<CognitiveProfile>({
    queryKey: [...queryKeys.user.settings(), 'cognitive'],
    queryFn: async () => {
      return await ApiClient.getCognitiveProfile();
    },
    enabled: isAuthenticated,
    ...QUERY_PRESETS.stable,
  });
}

// ==================== 刷新工具 ====================

/**
 * 手动刷新设置数据的 Hook
 */
export function useRefreshSettings() {
  const queryClient = useQueryClient();

  const refreshLearningSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.studyConfig.config() });
  };

  const refreshLearningObjectives = async () => {
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.user.settings(), 'objectives'],
    });
  };

  const refreshRewardProfile = async () => {
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.user.settings(), 'reward'],
    });
  };

  const refreshCognitiveProfile = async () => {
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.user.settings(), 'chronotype'],
    });
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.user.settings(), 'learningStyle'],
    });
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.user.settings(), 'cognitive'],
    });
  };

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.user.settings() });
  };

  return {
    refreshLearningSettings,
    refreshLearningObjectives,
    refreshRewardProfile,
    refreshCognitiveProfile,
    refreshAll,
  };
}
