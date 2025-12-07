/**
 * useWordSearch - 单词搜索 Query Hook（支持防抖）
 *
 * 功能：
 * - 支持搜索关键词防抖
 * - 自动管理搜索状态
 * - 智能启用/禁用查询
 * - 与 React Query 集成
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../lib/queryKeys';
import { wordService } from '../../services/word.service';

import type { SearchWordResult } from '../../services/word.service';

export interface UseWordSearchOptions {
  /**
   * 搜索关键词
   */
  query: string;
  /**
   * 防抖延迟时间（毫秒），默认 300ms
   */
  debounceMs?: number;
  /**
   * 返回结果数量限制，默认 20
   */
  limit?: number;
  /**
   * 是否启用搜索，默认为 true
   */
  enabled?: boolean;
  /**
   * 最小搜索长度，默认为 1
   * 当搜索词长度小于此值时，不会触发搜索
   */
  minSearchLength?: number;
}

export interface UseWordSearchResult {
  /**
   * 搜索结果
   */
  results: SearchWordResult[];
  /**
   * 是否正在搜索
   */
  isSearching: boolean;
  /**
   * 是否加载中（包含防抖等待时间）
   */
  isLoading: boolean;
  /**
   * 错误信息
   */
  error: Error | null;
  /**
   * 是否有搜索结果
   */
  hasResults: boolean;
  /**
   * 防抖后的搜索词
   */
  debouncedQuery: string;
}

/**
 * 单词搜索 Hook（支持防抖）
 *
 * @example
 * ```tsx
 * function SearchComponent() {
 *   const [query, setQuery] = useState('');
 *   const { results, isSearching, isLoading } = useWordSearch({
 *     query,
 *     debounceMs: 300,
 *     limit: 10,
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         value={query}
 *         onChange={e => setQuery(e.target.value)}
 *         placeholder="搜索单词..."
 *       />
 *       {isLoading && <span>搜索中...</span>}
 *       {results.map(word => <div key={word.id}>{word.spelling}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWordSearch(options: UseWordSearchOptions): UseWordSearchResult {
  const {
    query,
    debounceMs = 300,
    limit = 20,
    enabled = true,
    minSearchLength = 1,
  } = options;

  // 防抖处理
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    // 如果查询词为空或长度不足，立即更新
    if (!query.trim() || query.length < minSearchLength) {
      setDebouncedQuery(query);
      setIsDebouncing(false);
      return;
    }

    // 开始防抖
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setIsDebouncing(false);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, debounceMs, minSearchLength]);

  // 判断是否应该执行查询
  const shouldFetch = useMemo(() => {
    return (
      enabled &&
      debouncedQuery.trim().length >= minSearchLength &&
      !isDebouncing
    );
  }, [enabled, debouncedQuery, minSearchLength, isDebouncing]);

  // 使用 React Query 执行搜索
  const {
    data,
    isLoading: isQueryLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.words.search(debouncedQuery),
    queryFn: async () => {
      const response = await wordService.searchWords(debouncedQuery, limit);
      return response.data;
    },
    enabled: shouldFetch,
    // 搜索结果缓存 5 分钟
    staleTime: 5 * 60 * 1000,
    // 缓存时间 10 分钟
    gcTime: 10 * 60 * 1000,
  });

  // 组合加载状态
  const isLoading = isDebouncing || isQueryLoading;

  return {
    results: data || [],
    isSearching: isQueryLoading,
    isLoading,
    error: error as Error | null,
    hasResults: (data?.length ?? 0) > 0,
    debouncedQuery,
  };
}

/**
 * 简化版的搜索 Hook - 只返回必要的字段
 *
 * @example
 * ```tsx
 * const { results, isLoading } = useSimpleWordSearch('hello');
 * ```
 */
export function useSimpleWordSearch(query: string, debounceMs: number = 300) {
  const { results, isLoading, error } = useWordSearch({
    query,
    debounceMs,
  });

  return {
    results,
    isLoading,
    error,
  };
}
