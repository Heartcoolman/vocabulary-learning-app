import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/ApiClient';
import type { WordBook } from '../../types/models';

/**
 * 获取系统词书列表的 Query Hook
 * 缓存时间: 10分钟 (系统词书变化不频繁)
 */
export function useSystemWordBooks() {
  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type: 'system' }),
    queryFn: async () => {
      return await apiClient.getSystemWordBooks();
    },
    staleTime: 10 * 60 * 1000, // 10分钟缓存
    gcTime: 15 * 60 * 1000, // 15分钟垃圾回收
  });
}

/**
 * 获取用户词书列表的 Query Hook
 * 缓存时间: 10分钟
 */
export function useUserWordBooks() {
  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type: 'user' }),
    queryFn: async () => {
      return await apiClient.getUserWordBooks();
    },
    staleTime: 10 * 60 * 1000, // 10分钟缓存
    gcTime: 15 * 60 * 1000, // 15分钟垃圾回收
  });
}

/**
 * 获取所有可用词书（系统 + 用户）的 Query Hook
 * 缓存时间: 10分钟
 */
export function useAllAvailableWordBooks() {
  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type: 'all' }),
    queryFn: async () => {
      return await apiClient.getAllAvailableWordBooks();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * 获取单个词书详情的 Query Hook
 * @param id 词书ID
 */
export function useWordBook(id: string) {
  return useQuery({
    queryKey: queryKeys.wordbooks.detail(id),
    queryFn: async () => {
      return await apiClient.getWordBookById(id);
    },
    enabled: !!id, // 只有ID存在时才执行查询
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * 获取词书中的单词列表的 Query Hook
 * @param wordBookId 词书ID
 */
export function useWordBookWords(wordBookId: string) {
  return useQuery({
    queryKey: [...queryKeys.wordbooks.detail(wordBookId), 'words'],
    queryFn: async () => {
      return await apiClient.getWordBookWords(wordBookId);
    },
    enabled: !!wordBookId,
    staleTime: 5 * 60 * 1000, // 单词列表缓存5分钟
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * 搜索单词的 Query Hook
 * @param query 搜索关键词
 * @param limit 返回结果数量限制
 */
export function useSearchWords(query: string, limit: number = 20) {
  return useQuery({
    queryKey: queryKeys.words.search(query),
    queryFn: async () => {
      return await apiClient.searchWords(query, limit);
    },
    enabled: query.length > 0, // 只有搜索词不为空时才执行查询
    staleTime: 2 * 60 * 1000, // 搜索结果缓存2分钟
    gcTime: 5 * 60 * 1000,
  });
}
