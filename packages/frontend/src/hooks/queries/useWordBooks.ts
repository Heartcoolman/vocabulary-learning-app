import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/client';
import type { WordBook, Word } from '../../types/models';

// ==================== 类型定义 ====================

/**
 * 词书列表过滤器选项
 */
export interface WordBooksFilterOptions {
  /** 词书类型过滤 */
  type?: 'system' | 'user' | 'all';
}

/**
 * 词书查询配置选项
 */
export interface UseWordBooksOptions {
  /** 是否启用查询（默认 true） */
  enabled?: boolean;
  /** 缓存过期时间（毫秒） */
  staleTime?: number;
  /** 垃圾回收时间（毫秒） */
  gcTime?: number;
}

// ==================== Query Hooks ====================

/**
 * 获取系统词书列表的 Query Hook
 * 缓存时间: 10分钟 (系统词书变化不频繁)
 */
export function useSystemWordBooks(options?: UseWordBooksOptions) {
  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type: 'system' }),
    queryFn: async () => {
      return await apiClient.getSystemWordBooks();
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // 10分钟缓存
    gcTime: options?.gcTime ?? 15 * 60 * 1000, // 15分钟垃圾回收
  });
}

/**
 * 获取用户词书列表的 Query Hook
 * 缓存时间: 10分钟
 */
export function useUserWordBooks(options?: UseWordBooksOptions) {
  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type: 'user' }),
    queryFn: async () => {
      return await apiClient.getUserWordBooks();
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // 10分钟缓存
    gcTime: options?.gcTime ?? 15 * 60 * 1000, // 15分钟垃圾回收
  });
}

/**
 * 获取所有可用词书（系统 + 用户）的 Query Hook
 * 缓存时间: 10分钟
 */
export function useAllAvailableWordBooks(options?: UseWordBooksOptions) {
  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type: 'all' }),
    queryFn: async () => {
      return await apiClient.getAllAvailableWordBooks();
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 10 * 60 * 1000,
    gcTime: options?.gcTime ?? 15 * 60 * 1000,
  });
}

/**
 * 通用词书列表查询 Hook
 * 根据过滤条件返回对应的词书列表
 *
 * @param filters - 过滤选项
 * @param options - 查询配置
 *
 * @example
 * ```tsx
 * // 获取所有词书
 * const { data: allBooks } = useWordBooks({ type: 'all' });
 *
 * // 获取系统词书
 * const { data: systemBooks } = useWordBooks({ type: 'system' });
 *
 * // 获取用户词书
 * const { data: userBooks } = useWordBooks({ type: 'user' });
 * ```
 */
export function useWordBooks(
  filters: WordBooksFilterOptions = { type: 'all' },
  options?: UseWordBooksOptions,
) {
  const type = filters.type ?? 'all';

  return useQuery({
    queryKey: queryKeys.wordbooks.list({ type }),
    queryFn: async (): Promise<WordBook[]> => {
      switch (type) {
        case 'system':
          return await apiClient.getSystemWordBooks();
        case 'user':
          return await apiClient.getUserWordBooks();
        case 'all':
        default:
          return await apiClient.getAllAvailableWordBooks();
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 10 * 60 * 1000,
    gcTime: options?.gcTime ?? 15 * 60 * 1000,
  });
}

/**
 * 获取单个词书详情的 Query Hook
 * @param id 词书ID
 * @param options 查询配置
 *
 * @example
 * ```tsx
 * const { data: wordBook, isLoading } = useWordBook('book-123');
 *
 * if (isLoading) return <div>加载中...</div>;
 *
 * return <div>{wordBook?.name}</div>;
 * ```
 */
export function useWordBook(id: string, options?: UseWordBooksOptions) {
  return useQuery({
    queryKey: queryKeys.wordbooks.detail(id),
    queryFn: async () => {
      return await apiClient.getWordBookById(id);
    },
    enabled: (options?.enabled ?? true) && !!id, // 只有ID存在时才执行查询
    staleTime: options?.staleTime ?? 10 * 60 * 1000,
    gcTime: options?.gcTime ?? 15 * 60 * 1000,
  });
}

/**
 * 获取词书中的单词列表的 Query Hook
 * @param wordBookId 词书ID
 * @param options 查询配置
 */
export function useWordBookWords(wordBookId: string, options?: UseWordBooksOptions) {
  return useQuery({
    queryKey: [...queryKeys.wordbooks.detail(wordBookId), 'words'],
    queryFn: async (): Promise<Word[]> => {
      return await apiClient.getWordBookWords(wordBookId);
    },
    enabled: (options?.enabled ?? true) && !!wordBookId,
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 单词列表缓存5分钟
    gcTime: options?.gcTime ?? 10 * 60 * 1000,
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

// ==================== 预取函数 ====================

/**
 * 预取词书列表数据
 *
 * @example
 * ```tsx
 * const queryClient = useQueryClient();
 *
 * // 鼠标悬停时预取
 * const handleMouseEnter = () => {
 *   prefetchWordBooks(queryClient, { type: 'system' });
 * };
 * ```
 */
export async function prefetchWordBooks(
  queryClient: ReturnType<typeof useQueryClient>,
  filters: WordBooksFilterOptions = { type: 'all' },
) {
  const type = filters.type ?? 'all';

  await queryClient.prefetchQuery({
    queryKey: queryKeys.wordbooks.list({ type }),
    queryFn: async () => {
      switch (type) {
        case 'system':
          return await apiClient.getSystemWordBooks();
        case 'user':
          return await apiClient.getUserWordBooks();
        case 'all':
        default:
          return await apiClient.getAllAvailableWordBooks();
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * 预取单个词书详情
 */
export async function prefetchWordBook(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.wordbooks.detail(id),
    queryFn: async () => {
      return await apiClient.getWordBookById(id);
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * 预取词书中的单词列表
 */
export async function prefetchWordBookWords(
  queryClient: ReturnType<typeof useQueryClient>,
  wordBookId: string,
) {
  await queryClient.prefetchQuery({
    queryKey: [...queryKeys.wordbooks.detail(wordBookId), 'words'],
    queryFn: async () => {
      return await apiClient.getWordBookWords(wordBookId);
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ==================== 缓存失效辅助函数 ====================

/**
 * 使词书相关缓存失效
 *
 * @param queryClient - Query Client 实例
 * @param wordBookId - 可选的词书 ID，如果提供则只使特定词书失效
 */
export function invalidateWordBooksCache(
  queryClient: ReturnType<typeof useQueryClient>,
  wordBookId?: string,
) {
  // 使列表缓存失效
  queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.lists() });

  // 如果提供了词书 ID，使详情缓存失效
  if (wordBookId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.detail(wordBookId) });
  }
}
