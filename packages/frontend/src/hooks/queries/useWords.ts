/**
 * 单词相关的 React Query Hooks
 *
 * 提供单词 CRUD 操作的完整支持，包括：
 * - 获取单词列表
 * - 获取单个单词详情
 * - 搜索单词
 * - 创建、更新、删除单词（带乐观更新）
 *
 * 使用 React Query 最佳实践：
 * - 配置合适的 staleTime 和 gcTime
 * - 实现乐观更新
 * - 配置错误重试策略
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../lib/queryKeys';
import { DATA_CACHE_CONFIG } from '../../lib/cacheConfig';
import { wordClient } from '../../services/client';

import type { Word } from '@danci/shared';

/**
 * 创建单词的参数
 */
export interface CreateWordParams {
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  wordBookId?: string;
}

/**
 * 更新单词的参数
 */
export interface UpdateWordParams {
  id: string;
  data: Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt'>>;
}

/**
 * 获取单词列表的 Query Hook
 *
 * @param filters - 可选的过滤条件
 * @returns 单词列表查询结果
 */
export function useWords(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.words.list(filters || {}),
    queryFn: async () => {
      return await wordClient.getWords();
    },
    ...DATA_CACHE_CONFIG.words,
  });
}

/**
 * 获取单个单词详情的 Query Hook
 *
 * @param id - 单词 ID
 * @returns 单词详情查询结果
 */
export function useWord(id: string) {
  const { data: words } = useWords();

  return useQuery({
    queryKey: queryKeys.words.detail(id),
    queryFn: async () => {
      // 首先尝试从缓存的单词列表中获取
      const cachedWord = words?.find((w) => w.id === id);
      if (cachedWord) {
        return cachedWord;
      }
      // 如果缓存中没有，从列表中获取
      const allWords = await wordClient.getWords();
      const word = allWords.find((w) => w.id === id);
      if (!word) {
        throw new Error(`单词不存在: ${id}`);
      }
      return word;
    },
    enabled: !!id,
    ...DATA_CACHE_CONFIG.words,
  });
}

/**
 * 搜索单词的 Query Hook
 *
 * @param query - 搜索关键词
 * @returns 搜索结果
 */
export function useSearchWords(query: string) {
  return useQuery({
    queryKey: queryKeys.words.search(query),
    queryFn: async () => {
      return await wordClient.searchWords(query);
    },
    enabled: query.length > 0,
    ...DATA_CACHE_CONFIG.words,
  });
}

/**
 * 创建单词的 Mutation Hook（带乐观更新）
 *
 * @returns 创建单词的 mutation
 */
export function useCreateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWordParams) => {
      return await wordClient.createWord(data);
    },
    // 乐观更新：在请求发送前立即更新 UI
    onMutate: async (newWordData) => {
      // 取消正在进行的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: queryKeys.words.lists() });

      // 保存之前的数据用于回滚
      const previousWords = queryClient.getQueryData<Word[]>(queryKeys.words.list({}));

      // 创建临时单词对象
      const optimisticWord: Word = {
        id: `temp-${Date.now()}`, // 临时 ID
        spelling: newWordData.spelling,
        phonetic: newWordData.phonetic,
        meanings: newWordData.meanings,
        examples: newWordData.examples,
        audioUrl: newWordData.audioUrl,
        wordBookId: newWordData.wordBookId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 乐观更新缓存
      queryClient.setQueryData<Word[]>(queryKeys.words.list({}), (old) => {
        return old ? [optimisticWord, ...old] : [optimisticWord];
      });

      return { previousWords };
    },
    // 错误时回滚
    onError: (err, newWord, context) => {
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.words.list({}), context.previousWords);
      }
    },
    // 成功或失败后都重新获取数据
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
    },
  });
}

/**
 * 更新单词的 Mutation Hook（带乐观更新）
 *
 * @returns 更新单词的 mutation
 */
export function useUpdateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateWordParams) => {
      return await wordClient.updateWord(id, data);
    },
    // 乐观更新
    onMutate: async ({ id, data }) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: queryKeys.words.lists() });
      await queryClient.cancelQueries({ queryKey: queryKeys.words.detail(id) });

      // 保存之前的数据
      const previousWords = queryClient.getQueryData<Word[]>(queryKeys.words.list({}));
      const previousWord = queryClient.getQueryData<Word>(queryKeys.words.detail(id));

      // 乐观更新列表缓存
      queryClient.setQueryData<Word[]>(queryKeys.words.list({}), (old) => {
        if (!old) return old;
        return old.map((word) =>
          word.id === id ? { ...word, ...data, updatedAt: Date.now() } : word,
        );
      });

      // 乐观更新详情缓存
      queryClient.setQueryData<Word | undefined>(
        queryKeys.words.detail(id),
        (old: Word | undefined) => {
          if (!old) return old;
          return { ...old, ...data, updatedAt: Date.now() };
        },
      );

      return { previousWords, previousWord };
    },
    // 错误时回滚
    onError: (err, { id }, context) => {
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.words.list({}), context.previousWords);
      }
      if (context?.previousWord) {
        queryClient.setQueryData(queryKeys.words.detail(id), context.previousWord);
      }
    },
    // 成功后刷新相关查询
    onSettled: (data, error, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.words.detail(id) });
    },
  });
}

/**
 * 删除单词的 Mutation Hook（带乐观更新）
 *
 * @returns 删除单词的 mutation
 */
export function useDeleteWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await wordClient.deleteWord(id);
      return id;
    },
    // 乐观更新
    onMutate: async (id) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: queryKeys.words.lists() });
      await queryClient.cancelQueries({ queryKey: queryKeys.words.detail(id) });

      // 保存之前的数据
      const previousWords = queryClient.getQueryData<Word[]>(queryKeys.words.list({}));

      // 乐观删除
      queryClient.setQueryData<Word[]>(queryKeys.words.list({}), (old) => {
        if (!old) return old;
        return old.filter((word) => word.id !== id);
      });

      // 移除详情缓存
      queryClient.removeQueries({ queryKey: queryKeys.words.detail(id) });

      return { previousWords };
    },
    // 错误时回滚
    onError: (err, id, context) => {
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.words.list({}), context.previousWords);
      }
    },
    // 成功后刷新相关查询
    onSettled: (deletedId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      if (deletedId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.words.detail(deletedId) });
      }
    },
  });
}

/**
 * 批量创建单词的 Mutation Hook
 *
 * @returns 批量创建单词的 mutation
 */
export function useBatchCreateWords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (words: CreateWordParams[]) => {
      return await wordClient.batchCreateWords(words);
    },
    onSuccess: () => {
      // 批量创建后刷新列表
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
    },
  });
}

/**
 * 获取已学习单词的 Query Hook
 *
 * @returns 已学习单词列表
 */
export function useLearnedWords() {
  return useQuery({
    queryKey: queryKeys.words.learned(),
    queryFn: async () => {
      return await wordClient.getLearnedWords();
    },
    ...DATA_CACHE_CONFIG.learnedWords,
  });
}

/**
 * 组合 Hook - 提供所有单词查询和操作
 *
 * @example
 * ```tsx
 * function WordManager() {
 *   const {
 *     words,
 *     isLoading,
 *     createWord,
 *     updateWord,
 *     deleteWord,
 *     isCreating,
 *     isUpdating,
 *     isDeleting,
 *   } = useWordOperations();
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useWordOperations(filters?: Record<string, unknown>) {
  const wordsQuery = useWords(filters);
  const createMutation = useCreateWord();
  const updateMutation = useUpdateWord();
  const deleteMutation = useDeleteWord();
  const batchCreateMutation = useBatchCreateWords();

  return {
    // 查询结果
    words: wordsQuery.data,
    isLoading: wordsQuery.isLoading,
    isError: wordsQuery.isError,
    error: wordsQuery.error,
    refetch: wordsQuery.refetch,

    // 创建
    createWord: createMutation.mutate,
    createWordAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    // 更新
    updateWord: updateMutation.mutate,
    updateWordAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // 删除
    deleteWord: deleteMutation.mutate,
    deleteWordAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,

    // 批量创建
    batchCreate: batchCreateMutation.mutate,
    batchCreateAsync: batchCreateMutation.mutateAsync,
    isBatchCreating: batchCreateMutation.isPending,
    batchCreateError: batchCreateMutation.error,

    // 全局状态
    isAnyPending:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      batchCreateMutation.isPending,
  };
}

/**
 * 刷新单词数据的 Hook
 *
 * @returns 刷新函数
 */
export function useRefreshWords() {
  const queryClient = useQueryClient();

  const refreshWords = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
  };

  const refreshWord = async (id: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.words.detail(id) });
  };

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.words.all });
  };

  return {
    refreshWords,
    refreshWord,
    refreshAll,
  };
}

/**
 * 预加载单词数据的 Hook
 *
 * @returns 预加载函数
 */
export function usePrefetchWords() {
  const queryClient = useQueryClient();

  const prefetchWords = async () => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.words.list({}),
      queryFn: () => wordClient.getWords(),
      ...DATA_CACHE_CONFIG.words,
    });
  };

  return {
    prefetchWords,
  };
}
