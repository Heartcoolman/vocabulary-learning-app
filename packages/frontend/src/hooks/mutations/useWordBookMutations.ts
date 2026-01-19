import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../lib/queryKeys';
import { wordBookClient, wordClient, wordBookCenterClient } from '../../services/client';
import type { SyncResult } from '../../services/client';

import type { WordBook } from '../../types/models';

/**
 * 创建词书的 Mutation Hook
 */
export function useCreateWordBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      coverImage?: string;
    }): Promise<WordBook> => {
      return await wordBookClient.createWordBook(data);
    },
    onSuccess: () => {
      // 创建成功后，使用户词书列表查询失效，触发重新获取
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'user' }),
      });
      // 同时使所有可用词书列表失效
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'all' }),
      });
    },
  });
}

/**
 * 更新词书的 Mutation Hook
 */
export function useUpdateWordBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string; coverImage?: string };
    }): Promise<WordBook> => {
      return await wordBookClient.updateWordBook(id, data);
    },
    onSuccess: (updatedWordBook) => {
      // 更新成功后，使相关查询失效
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'user' }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'all' }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(updatedWordBook.id),
      });
    },
  });
}

/**
 * 删除词书的 Mutation Hook（带乐观更新）
 */
export function useDeleteWordBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await wordBookClient.deleteWordBook(id);
    },
    // 乐观更新：立即从缓存中移除被删除的词书
    onMutate: async (deletedId: string) => {
      // 取消正在进行的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'user' }),
      });

      // 获取当前缓存的用户词书列表
      const previousUserBooks = queryClient.getQueryData<WordBook[]>(
        queryKeys.wordbooks.list({ type: 'user' }),
      );

      // 乐观更新：从列表中移除被删除的词书
      if (previousUserBooks) {
        queryClient.setQueryData<WordBook[]>(
          queryKeys.wordbooks.list({ type: 'user' }),
          previousUserBooks.filter((book) => book.id !== deletedId),
        );
      }

      // 返回上下文对象，以便在失败时回滚
      return { previousUserBooks };
    },
    onError: (_err, _deletedId, context) => {
      // 删除失败时，回滚到之前的状态
      if (context?.previousUserBooks) {
        queryClient.setQueryData(
          queryKeys.wordbooks.list({ type: 'user' }),
          context.previousUserBooks,
        );
      }
    },
    onSettled: (data, error, deletedId) => {
      // 无论成功还是失败，都使查询失效以确保数据同步
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'user' }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.list({ type: 'all' }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(deletedId),
      });
    },
  });
}

/**
 * 向词书添加单词的 Mutation Hook
 */
export function useAddWordToWordBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wordBookId,
      wordData,
    }: {
      wordBookId: string;
      wordData: {
        spelling: string;
        phonetic: string;
        meanings: string[];
        examples: string[];
        audioUrl?: string;
      };
    }) => {
      return await wordBookClient.addWordToWordBook(wordBookId, wordData);
    },
    onSuccess: (newWord, variables) => {
      // 使词书的单词列表失效
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.wordbooks.detail(variables.wordBookId), 'words'],
      });
      // 使词书详情失效（wordCount可能变化）
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(variables.wordBookId),
      });
    },
  });
}

/**
 * 从词书删除单词的 Mutation Hook
 */
export function useRemoveWordFromWordBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wordBookId, wordId }: { wordBookId: string; wordId: string }) => {
      await wordBookClient.removeWordFromWordBook(wordBookId, wordId);
    },
    onSuccess: (data, variables) => {
      // 使词书的单词列表失效
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.wordbooks.detail(variables.wordBookId), 'words'],
      });
      // 使词书详情失效（wordCount可能变化）
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(variables.wordBookId),
      });
    },
  });
}

/**
 * 批量导入单词到词书的 Mutation Hook
 */
export function useBatchImportWords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wordBookId,
      words,
    }: {
      wordBookId: string;
      words: Array<{
        spelling: string;
        phonetic: string;
        meanings: string[];
        examples: string[];
        audioUrl?: string;
      }>;
    }) => {
      return await wordClient.batchImportWords(wordBookId, words);
    },
    onSuccess: (result, variables) => {
      // 使词书的单词列表失效
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.wordbooks.detail(variables.wordBookId), 'words'],
      });
      // 使词书详情失效
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(variables.wordBookId),
      });
    },
  });
}

/**
 * 同步词书更新的 Mutation Hook
 */
export function useSyncWordBook() {
  const queryClient = useQueryClient();

  return useMutation<SyncResult, Error, string>({
    mutationFn: (wordbookId: string) => wordBookCenterClient.syncWordBook(wordbookId),
    onSuccess: (result) => {
      // 使更新列表失效
      queryClient.invalidateQueries({ queryKey: ['wordbook-center', 'updates'] });
      // 使词书列表失效
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.lists() });
      // 使特定词书详情失效
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(result.wordbookId),
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.wordbooks.detail(result.wordbookId), 'words'],
      });
    },
  });
}
