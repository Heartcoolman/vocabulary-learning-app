/**
 * useWordMutations - 单词 CRUD Mutation Hooks
 *
 * 功能：
 * - 创建、更新、删除单词
 * - 批量操作
 * - 自动缓存失效和更新
 * - 乐观更新支持
 * - 与 React Query 集成
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { wordService } from '../../services/word.service';
import type { CreateWordDto, UpdateWordDto } from '../../services/word.service';
import type { Word } from '../../types/models';

/**
 * 创建单词的 Mutation Hook
 *
 * @example
 * ```tsx
 * function CreateWordForm() {
 *   const { mutate, isPending } = useCreateWord({
 *     onSuccess: (word) => {
 *       toast.success(`创建成功: ${word.spelling}`);
 *     },
 *     onError: (error) => {
 *       toast.error(`创建失败: ${error.message}`);
 *     },
 *   });
 *
 *   const handleSubmit = (data: CreateWordDto) => {
 *     mutate(data);
 *   };
 *
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 * ```
 */
export function useCreateWord(options?: {
  onSuccess?: (data: Word) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWordDto) => {
      const response = await wordService.createWord(data);
      return response.data;
    },
    onSuccess: (data) => {
      // 使单词列表查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      // 调用自定义回调
      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 更新单词的 Mutation Hook
 *
 * @example
 * ```tsx
 * function EditWordForm({ wordId }: { wordId: string }) {
 *   const { mutate, isPending } = useUpdateWord({
 *     onSuccess: () => {
 *       toast.success('更新成功');
 *     },
 *   });
 *
 *   const handleUpdate = (data: UpdateWordDto) => {
 *     mutate({ id: wordId, data });
 *   };
 *
 *   return <form>...</form>;
 * }
 * ```
 */
export function useUpdateWord(options?: {
  onSuccess?: (data: Word) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWordDto }) => {
      const response = await wordService.updateWord(id, data);
      return response.data;
    },
    onSuccess: (data) => {
      // 使单词列表查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      // 使单词详情查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.detail(data.id) });
      // 调用自定义回调
      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 删除单词的 Mutation Hook
 *
 * @example
 * ```tsx
 * function DeleteWordButton({ wordId }: { wordId: string }) {
 *   const { mutate, isPending } = useDeleteWord({
 *     onSuccess: () => {
 *       toast.success('删除成功');
 *       navigate('/words');
 *     },
 *   });
 *
 *   return (
 *     <button
 *       onClick={() => mutate(wordId)}
 *       disabled={isPending}
 *     >
 *       删除
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeleteWord(options?: {
  onSuccess?: (deletedId: string) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await wordService.deleteWord(id);
      return id;
    },
    onSuccess: (deletedId) => {
      // 使单词列表查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      // 使单词详情查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.detail(deletedId) });
      // 调用自定义回调
      options?.onSuccess?.(deletedId);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 批量创建单词的 Mutation Hook
 *
 * @example
 * ```tsx
 * function BatchImport() {
 *   const { mutate, isPending, progress } = useBatchCreateWords({
 *     onSuccess: (words) => {
 *       toast.success(`成功导入 ${words.length} 个单词`);
 *     },
 *   });
 *
 *   const handleImport = (words: CreateWordDto[]) => {
 *     mutate(words);
 *   };
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useBatchCreateWords(options?: {
  onSuccess?: (data: Word[]) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (words: CreateWordDto[]) => {
      const response = await wordService.batchCreateWords(words);
      return response.data;
    },
    onSuccess: (data) => {
      // 使单词列表查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      // 调用自定义回调
      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 组合 Hook - 提供所有单词 CRUD 操作
 *
 * @example
 * ```tsx
 * function WordManager() {
 *   const {
 *     createWord,
 *     updateWord,
 *     deleteWord,
 *     batchCreate,
 *     isCreating,
 *     isUpdating,
 *     isDeleting,
 *   } = useWordMutations({
 *     onCreateSuccess: (word) => console.log('Created:', word),
 *     onUpdateSuccess: (word) => console.log('Updated:', word),
 *     onDeleteSuccess: (id) => console.log('Deleted:', id),
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useWordMutations(options?: {
  onCreateSuccess?: (data: Word) => void;
  onUpdateSuccess?: (data: Word) => void;
  onDeleteSuccess?: (deletedId: string) => void;
  onBatchCreateSuccess?: (data: Word[]) => void;
  onError?: (error: Error) => void;
}) {
  const createMutation = useCreateWord({
    onSuccess: options?.onCreateSuccess,
    onError: options?.onError,
  });

  const updateMutation = useUpdateWord({
    onSuccess: options?.onUpdateSuccess,
    onError: options?.onError,
  });

  const deleteMutation = useDeleteWord({
    onSuccess: options?.onDeleteSuccess,
    onError: options?.onError,
  });

  const batchCreateMutation = useBatchCreateWords({
    onSuccess: options?.onBatchCreateSuccess,
    onError: options?.onError,
  });

  return {
    // 创建单词
    createWord: createMutation.mutate,
    createWordAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    // 更新单词
    updateWord: updateMutation.mutate,
    updateWordAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // 删除单词
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
