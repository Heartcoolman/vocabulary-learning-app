/**
 * 学习配置相关的 React Query Hooks
 *
 * 提供学习配置的查询功能，包括：
 * - 获取用户学习配置
 * - 获取今日学习单词
 * - 获取学习进度
 *
 * 使用 DATA_CACHE_CONFIG 中的预设配置
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { DATA_CACHE_CONFIG, CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import { apiClient } from '../../services/client';
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
 * - 使用 DATA_CACHE_CONFIG.studyConfig 预设配置（静态数据）
 * - 配置数据不经常变化
 */
export function useStudyConfig() {
  return useQuery<StudyConfig>({
    queryKey: queryKeys.studyConfig.config(),
    queryFn: async () => {
      return await apiClient.getStudyConfig();
    },
    ...DATA_CACHE_CONFIG.studyConfig,
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
      const response = await apiClient.getTodayWords();
      return {
        words: response.words.map((w) => ({
          id: w.id,
          spelling: w.spelling,
          phonetic: w.phonetic ?? '',
          meanings: w.meanings,
          examples: w.examples,
          audioUrl: w.audioUrl ?? undefined,
          isNew: true as boolean, // 默认为新词
        })),
        progress: response.progress,
      };
    },
    staleTime: CACHE_TIME.REALTIME, // 30秒
    gcTime: GC_TIME.SHORT, // 5分钟
    enabled,
  });
}

/**
 * 获取学习进度
 *
 * 特点：
 * - 使用 DATA_CACHE_CONFIG.studyProgress 预设配置（实时数据）
 * - 进度会随着学习实时变化
 *
 * @param enabled - 是否启用查询，默认true
 */
export function useStudyProgress(enabled = true) {
  return useQuery<StudyProgressResponse>({
    queryKey: queryKeys.studyConfig.progress(),
    queryFn: async () => {
      return await apiClient.getStudyProgress();
    },
    ...DATA_CACHE_CONFIG.studyProgress,
    enabled,
  });
}
