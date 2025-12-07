/**
 * 获取下一批学习单词 Hook
 *
 * 支持按需加载和AMAS驱动的智能单词推荐
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import apiClient from '../../services/ApiClient';

/**
 * 获取下一批单词的参数
 */
export interface NextWordsParams {
  /** 当前学习中的单词ID列表 */
  currentWordIds: string[];
  /** 已掌握的单词ID列表 */
  masteredWordIds: string[];
  /** 学习会话ID */
  sessionId: string;
  /** 需要获取的单词数量 */
  count?: number;
}

/**
 * 单词信息
 */
export interface WordInfo {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  difficulty: number;
  isNew: boolean;
}

/**
 * 学习策略信息
 */
export interface NextWordsStrategy {
  /** 新词比例 */
  new_ratio: number;
  /** 难度等级 */
  difficulty: 'easy' | 'mid' | 'hard';
  /** 批量大小 */
  batch_size: number;
  /** 会话长度 */
  session_length: number;
  /** 复习比例 */
  review_ratio: number;
}

/**
 * 获取下一批单词的结果
 */
export interface NextWordsResult {
  /** 单词列表 */
  words: WordInfo[];
  /** 推荐策略 */
  strategy: NextWordsStrategy;
  /** 推荐原因 */
  reason: string;
}

/**
 * React Query 键工厂
 */
export const nextWordsKeys = {
  all: ['nextWords'] as const,
  details: () => [...nextWordsKeys.all, 'detail'] as const,
  detail: (params: NextWordsParams) => [...nextWordsKeys.details(), params] as const,
};

/**
 * 获取下一批学习单词
 *
 * 此 hook 用于动态获取下一批学习单词，基于 AMAS 算法智能推荐。
 * 通常在当前单词队列即将耗尽时调用。
 *
 * @param params - 查询参数
 * @param queryOptions - React Query 配置
 *
 * @example
 * ```tsx
 * const { data, isLoading, refetch } = useNextWords(
 *   {
 *     currentWordIds: ['word1', 'word2'],
 *     masteredWordIds: ['word3'],
 *     sessionId: 'session-123',
 *     count: 5
 *   },
 *   {
 *     enabled: false // 手动触发
 *   }
 * );
 *
 * // 当需要更多单词时
 * const loadMore = async () => {
 *   const result = await refetch();
 *   if (result.data) {
 *     addWordsToQueue(result.data.words);
 *   }
 * };
 * ```
 *
 * @example
 * 在学习流程中自动加载：
 * ```tsx
 * const { currentWords, masteredWords } = useWordQueue();
 *
 * // 当剩余单词少于阈值时自动获取
 * const shouldFetch = currentWords.length < 3;
 *
 * const { data } = useNextWords(
 *   {
 *     currentWordIds: currentWords.map(w => w.id),
 *     masteredWordIds: masteredWords.map(w => w.id),
 *     sessionId,
 *     count: 5
 *   },
 *   {
 *     enabled: shouldFetch && !!sessionId,
 *     staleTime: 0 // 每次都获取最新推荐
 *   }
 * );
 *
 * useEffect(() => {
 *   if (data?.words) {
 *     addWordsToQueue(data.words);
 *   }
 * }, [data]);
 * ```
 */
export function useNextWords(
  params: NextWordsParams,
  queryOptions?: Omit<UseQueryOptions<NextWordsResult, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<NextWordsResult, Error>({
    queryKey: nextWordsKeys.detail(params),
    queryFn: async () => {
      return await apiClient.getNextWords(params);
    },
    // 默认禁用自动查询，需要手动触发
    enabled: false,
    // 不缓存，每次都获取最新推荐
    staleTime: 0,
    gcTime: 0,
    // 不重试，避免重复请求
    retry: false,
    ...queryOptions,
  });
}

/**
 * 手动获取下一批单词
 *
 * 这是一个简化的 API，直接返回 Promise，不使用 React Query 缓存。
 * 适用于不需要状态管理的场景。
 *
 * @param params - 查询参数
 * @returns Promise<NextWordsResult>
 *
 * @example
 * ```tsx
 * import { fetchNextWords } from './useNextWords';
 *
 * async function loadMoreWords() {
 *   try {
 *     const result = await fetchNextWords({
 *       currentWordIds: ['word1', 'word2'],
 *       masteredWordIds: ['word3'],
 *       sessionId: 'session-123',
 *       count: 5
 *     });
 *
 *     console.log('获取到新单词:', result.words);
 *     console.log('推荐策略:', result.strategy);
 *   } catch (error) {
 *     console.error('获取失败:', error);
 *   }
 * }
 * ```
 */
export async function fetchNextWords(params: NextWordsParams): Promise<NextWordsResult> {
  return await apiClient.getNextWords(params);
}
