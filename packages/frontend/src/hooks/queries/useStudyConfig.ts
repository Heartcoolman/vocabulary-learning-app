/**
 * 学习配置相关的 React Query Hooks
 *
 * 提供学习配置的查询功能，包括：
 * - 获取用户学习配置
 * - 获取今日学习单词
 * - 获取学习进度
 *
 * 配置了1小时的长缓存时间，因为配置不经常变化
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/ApiClient';
import type { StudyConfig } from '../../types/models';

/**
 * 今日学习单词的响应类型
 */
export interface TodayWordsResponse {
  words: Array<{
    id: string;
    spelling: string;
    phonetic: string;
    meanings: string[];
    examples: string[];
    audioUrl?: string;
    isNew: boolean;
  }>;
  progress: {
    todayStudied: number;
    todayTarget: number;
    totalStudied: number;
    correctRate: number;
  };
}

/**
 * 学习进度的响应类型
 */
export interface StudyProgressResponse {
  todayStudied: number;
  todayTarget: number;
  totalStudied: number;
  correctRate: number;
  weeklyTrend: number[];
}

/**
 * 获取用户学习配置
 *
 * 特点：
 * - 1小时的长缓存时间（配置不经常变化）
 * - 5分钟的数据保鲜时间
 * - 启用后台更新
 */
export function useStudyConfig() {
  return useQuery<StudyConfig>({
    queryKey: queryKeys.studyConfig.config(),
    queryFn: async () => {
      return await apiClient.getStudyConfig();
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 60, // 1小时（长缓存）
    refetchOnWindowFocus: false, // 配置不需要频繁重新获取
    refetchOnReconnect: false,
  });
}

/**
 * 获取今日学习单词
 *
 * 特点：
 * - 较短的缓存时间，因为单词列表会随着学习进度变化
 * - 启用后台更新
 *
 * @param enabled - 是否启用查询，默认true
 */
export function useTodayWords(enabled = true) {
  return useQuery<TodayWordsResponse>({
    queryKey: queryKeys.studyConfig.todayWords(),
    queryFn: async () => {
      const response = await apiClient.request<{ success: boolean; data: TodayWordsResponse }>(
        '/api/study-config/today-words'
      );
      return response.data;
    },
    staleTime: 1000 * 30, // 30秒
    gcTime: 1000 * 60 * 5, // 5分钟
    enabled,
  });
}

/**
 * 获取学习进度
 *
 * 特点：
 * - 较短的缓存时间，因为进度会随着学习实时变化
 * - 启用后台更新
 *
 * @param enabled - 是否启用查询，默认true
 */
export function useStudyProgress(enabled = true) {
  return useQuery<StudyProgressResponse>({
    queryKey: queryKeys.studyConfig.progress(),
    queryFn: async () => {
      const response = await apiClient.request<{ success: boolean; data: StudyProgressResponse }>(
        '/api/study-config/progress'
      );
      return response.data;
    },
    staleTime: 1000 * 30, // 30秒
    gcTime: 1000 * 60 * 5, // 5分钟
    refetchOnMount: true, // 进度数据在组件挂载时重新获取
    enabled,
  });
}
