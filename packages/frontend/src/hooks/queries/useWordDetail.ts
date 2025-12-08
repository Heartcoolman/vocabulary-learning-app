/**
 * useWordDetail - 单词详情 Query Hook
 *
 * 功能：
 * - 获取单个单词的详细信息
 * - 支持条件查询（enabled）
 * - 自动缓存管理
 * - 与 React Query 集成
 */

import { useQuery, useQueries } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { wordService } from '../../services/word.service';
import type { Word } from '../../types/models';

export interface UseWordDetailOptions {
  /**
   * 单词ID
   */
  id: string;
  /**
   * 是否启用查询，默认为 true
   * 当 id 为空时自动禁用
   */
  enabled?: boolean;
  /**
   * 缓存时间（毫秒），默认 10 分钟
   */
  staleTime?: number;
}

export interface UseWordDetailResult {
  /**
   * 单词详情
   */
  word: Word | undefined;
  /**
   * 是否加载中
   */
  isLoading: boolean;
  /**
   * 是否正在获取数据
   */
  isFetching: boolean;
  /**
   * 错误信息
   */
  error: Error | null;
  /**
   * 是否成功
   */
  isSuccess: boolean;
  /**
   * 是否错误
   */
  isError: boolean;
  /**
   * 重新获取数据
   */
  refetch: () => void;
}

/**
 * 获取单词详情的 Hook
 *
 * @example
 * ```tsx
 * function WordDetailComponent({ wordId }: { wordId: string }) {
 *   const { word, isLoading, error, refetch } = useWordDetail({
 *     id: wordId,
 *   });
 *
 *   if (isLoading) return <div>加载中...</div>;
 *   if (error) return <div>错误: {error.message}</div>;
 *   if (!word) return <div>单词不存在</div>;
 *
 *   return (
 *     <div>
 *       <h1>{word.spelling}</h1>
 *       <p>{word.phonetic}</p>
 *       <button onClick={() => refetch()}>刷新</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWordDetail(options: UseWordDetailOptions): UseWordDetailResult {
  const { id, enabled = true, staleTime = 10 * 60 * 1000 } = options;

  // 只有当 id 存在且 enabled 为 true 时才执行查询
  const shouldFetch = Boolean(id && enabled);

  const { data, isLoading, isFetching, error, isSuccess, isError, refetch } = useQuery({
    queryKey: queryKeys.words.detail(id),
    queryFn: async () => {
      const response = await wordService.getWordById(id);
      return response.data;
    },
    enabled: shouldFetch,
    // 缓存时间
    staleTime,
    // GC 时间设置为缓存时间的 2 倍
    gcTime: staleTime * 2,
    // 失败重试配置
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    word: data,
    isLoading,
    isFetching,
    error: error as Error | null,
    isSuccess,
    isError,
    refetch,
  };
}

/**
 * 批量获取单词详情的 Hook
 * 使用 useQueries 并发获取多个单词详情
 *
 * @example
 * ```tsx
 * function WordListComponent({ wordIds }: { wordIds: string[] }) {
 *   const words = useWordDetails(wordIds);
 *
 *   return (
 *     <div>
 *       {words.map(({ word, isLoading }) => (
 *         isLoading ? <div>加载中...</div> : <div>{word?.spelling}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWordDetails(ids: string[]) {
  const staleTime = 10 * 60 * 1000;

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.words.detail(id),
      queryFn: async () => {
        const response = await wordService.getWordById(id);
        return response.data;
      },
      enabled: Boolean(id),
      staleTime,
      gcTime: staleTime * 2,
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    })),
  });

  return results.map((result) => ({
    word: result.data as Word | undefined,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error as Error | null,
    isSuccess: result.isSuccess,
    isError: result.isError,
    refetch: result.refetch,
  }));
}

/**
 * 简化版的单词详情 Hook - 只返回必要的字段
 *
 * @example
 * ```tsx
 * const { word, isLoading } = useSimpleWordDetail(wordId);
 * ```
 */
export function useSimpleWordDetail(id: string) {
  const { word, isLoading, error } = useWordDetail({ id });

  return {
    word,
    isLoading,
    error,
  };
}
