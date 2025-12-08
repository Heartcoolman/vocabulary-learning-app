import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/client';
import type { Word } from '../../types/models';

/**
 * 获取用户学过的单词（有学习记录的）的 Query Hook
 * 用于掌握度分析页面等场景
 * 缓存时间: 5分钟（已学单词列表变化相对频繁）
 */
export function useLearnedWords() {
  return useQuery({
    queryKey: [...queryKeys.words.lists(), { learned: true }],
    queryFn: async (): Promise<Word[]> => {
      return await apiClient.getLearnedWords();
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    gcTime: 10 * 60 * 1000, // 10分钟垃圾回收
  });
}

/**
 * 获取用户的所有单词（基于选择的词书）的 Query Hook
 * 缓存时间: 5分钟
 */
export function useWords() {
  return useQuery({
    queryKey: queryKeys.words.lists(),
    queryFn: async (): Promise<Word[]> => {
      return await apiClient.getWords();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * 获取单个单词详情的 Query Hook
 * @param id 单词ID
 */
export function useWord(id: string) {
  return useQuery({
    queryKey: queryKeys.words.detail(id),
    queryFn: async (): Promise<Word> => {
      // 注意: ApiClient中没有直接的getWordById方法
      // 需要从词书中获取单词，这里先抛出错误提示需要实现
      throw new Error('获取单个单词详情需要实现getWordById方法');
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
