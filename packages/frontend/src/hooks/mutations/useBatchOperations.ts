/**
 * useBatchOperations - 批量操作 Mutation Hook
 *
 * 功能：
 * - 批量导入单词
 * - 批量删除单词
 * - 批量更新单词状态
 * - 批量创建学习记录
 * - 支持进度跟踪
 * - 支持错误处理和重试
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { wordClient, learningClient } from '../../services/client';
import type { AnswerRecord } from '../../types/models';
import { WordImportData } from '../../utils/importParsers';

/**
 * 批量操作进度信息
 */
export interface BatchOperationProgress {
  /** 当前进度（0-100） */
  progress: number;
  /** 当前阶段描述 */
  stage: string;
  /** 已处理的数量 */
  processed: number;
  /** 总数量 */
  total: number;
  /** 成功数量 */
  succeeded: number;
  /** 失败数量 */
  failed: number;
  /** 错误列表 */
  errors: Array<{ index: number; message: string }>;
}

/**
 * 批量导入参数
 */
export interface BatchImportParams {
  /** 词书ID */
  wordBookId: string;
  /** 单词数据 */
  words: WordImportData[];
  /** 批次大小（默认100） */
  batchSize?: number;
  /** 是否跳过重复 */
  skipDuplicates?: boolean;
}

/**
 * 批量导入结果
 */
export interface BatchImportResult {
  /** 成功导入的数量 */
  imported: number;
  /** 失败的数量 */
  failed: number;
  /** 跳过的数量 */
  skipped: number;
  /** 错误信息列表 */
  errors: string[];
  /** 导入的单词ID列表 */
  wordIds: string[];
}

/**
 * 批量删除参数
 */
export interface BatchDeleteParams {
  /** 要删除的单词ID列表 */
  wordIds: string[];
  /** 批次大小（默认50） */
  batchSize?: number;
}

/**
 * 批量删除结果
 */
export interface BatchDeleteResult {
  /** 成功删除的数量 */
  deleted: number;
  /** 失败的数量 */
  failed: number;
  /** 错误信息列表 */
  errors: Array<{ wordId: string; message: string }>;
}

/**
 * 批量更新状态参数
 */
export interface BatchUpdateStatusParams {
  /** 要更新的单词ID列表 */
  wordIds: string[];
  /** 新状态 */
  status: 'active' | 'archived' | 'deleted';
}

/**
 * 批量更新结果
 */
export interface BatchUpdateResult {
  /** 成功更新的数量 */
  updated: number;
  /** 失败的数量 */
  failed: number;
  /** 错误信息列表 */
  errors: Array<{ wordId: string; message: string }>;
}

/**
 * 批量创建记录参数
 */
export interface BatchCreateRecordsParams {
  /** 学习记录列表 */
  records: Omit<AnswerRecord, 'id'>[];
  /** 批次大小（默认100） */
  batchSize?: number;
}

/**
 * 批量创建记录结果
 */
export interface BatchCreateRecordsResult {
  /** 成功创建的数量 */
  created: number;
  /** 失败的数量 */
  failed: number;
  /** 错误信息列表 */
  errors: string[];
  /** 创建的记录ID列表 */
  recordIds: string[];
}

/**
 * 分批处理数据
 */
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[], batchIndex: number) => Promise<R[]>,
  onProgress?: (progress: BatchOperationProgress) => void,
): Promise<{
  results: R[];
  errors: Array<{ index: number; message: string }>;
}> {
  const results: R[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchIndex = Math.floor(i / batchSize);

    onProgress?.({
      progress: Math.round((batchIndex / totalBatches) * 100),
      stage: `处理批次 ${batchIndex + 1}/${totalBatches}`,
      processed: i,
      total: items.length,
      succeeded: results.length,
      failed: errors.length,
      errors,
    });

    try {
      const batchResults = await processor(batch, batchIndex);
      results.push(...batchResults);
    } catch (error) {
      // 记录批次错误
      batch.forEach((_, idx) => {
        errors.push({
          index: i + idx,
          message: error instanceof Error ? error.message : '未知错误',
        });
      });
    }
  }

  onProgress?.({
    progress: 100,
    stage: '完成',
    processed: items.length,
    total: items.length,
    succeeded: results.length,
    failed: errors.length,
    errors,
  });

  return { results, errors };
}

/**
 * 批量导入单词的 Mutation Hook
 *
 * @example
 * ```tsx
 * function ImportForm() {
 *   const [progress, setProgress] = useState<BatchOperationProgress | null>(null);
 *   const { mutate, isPending } = useBatchImport({
 *     onSuccess: (result) => {
 *       toast.success(`成功导入 ${result.imported} 个单词`);
 *     },
 *     onProgress: setProgress,
 *   });
 *
 *   const handleImport = (words: WordImportData[]) => {
 *     mutate({ wordBookId: 'book-id', words });
 *   };
 *
 *   return (
 *     <div>
 *       {progress && <ProgressBar value={progress.progress} />}
 *       <button onClick={handleImport}>导入</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useBatchImport(options?: {
  onSuccess?: (result: BatchImportResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BatchOperationProgress) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchImportParams): Promise<BatchImportResult> => {
      const { wordBookId, words } = params;

      options?.onProgress?.({
        progress: 0,
        stage: '开始导入',
        processed: 0,
        total: words.length,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      // 使用后端的批量导入API
      try {
        const result = await wordClient.batchImportWords(wordBookId, words);

        options?.onProgress?.({
          progress: 100,
          stage: '完成',
          processed: words.length,
          total: words.length,
          succeeded: result.imported,
          failed: result.failed,
          errors: (result.errors || []).map((msg, idx) => ({ index: idx, message: msg })),
        });

        return {
          imported: result.imported,
          failed: result.failed,
          skipped: 0,
          errors: result.errors || [],
          wordIds: [], // 后端可能不返回ID列表
        };
      } catch (error) {
        throw new Error(`批量导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    },
    onSuccess: (result) => {
      // 使单词列表缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.all });

      options?.onSuccess?.(result);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 批量删除单词的 Mutation Hook
 *
 * @example
 * ```tsx
 * function BatchDeleteButton({ wordIds }: { wordIds: string[] }) {
 *   const { mutate, isPending } = useBatchDelete({
 *     onSuccess: (result) => {
 *       toast.success(`成功删除 ${result.deleted} 个单词`);
 *     },
 *   });
 *
 *   return (
 *     <button
 *       onClick={() => mutate({ wordIds })}
 *       disabled={isPending}
 *     >
 *       批量删除
 *     </button>
 *   );
 * }
 * ```
 */
export function useBatchDelete(options?: {
  onSuccess?: (result: BatchDeleteResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BatchOperationProgress) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchDeleteParams): Promise<BatchDeleteResult> => {
      const { wordIds, batchSize = 50 } = params;

      options?.onProgress?.({
        progress: 10,
        stage: '提交批量删除请求',
        processed: 0,
        total: wordIds.length,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      if (wordIds.length === 0) {
        options?.onProgress?.({
          progress: 100,
          stage: '完成',
          processed: 0,
          total: 0,
          succeeded: 0,
          failed: 0,
          errors: [],
        });
        return { deleted: 0, failed: 0, errors: [] };
      }

      const errors: Array<{ wordId: string; message: string }> = [];
      let deleted = 0;

      for (let i = 0; i < wordIds.length; i += batchSize) {
        const batch = wordIds.slice(i, Math.min(i + batchSize, wordIds.length));

        const results = await Promise.allSettled(
          batch.map((wordId) => wordClient.deleteWord(wordId)),
        );

        results.forEach((res, idx) => {
          const wordId = batch[idx];
          if (res.status === 'fulfilled') {
            deleted += 1;
            return;
          }
          errors.push({
            wordId,
            message: res.reason instanceof Error ? res.reason.message : '未知错误',
          });
        });

        options?.onProgress?.({
          progress: Math.round(((i + batch.length) / wordIds.length) * 100),
          stage: `删除中 ${Math.min(i + batch.length, wordIds.length)}/${wordIds.length}`,
          processed: Math.min(i + batch.length, wordIds.length),
          total: wordIds.length,
          succeeded: deleted,
          failed: errors.length,
          errors: errors.map((e, idx) => ({ index: idx, message: e.message })),
        });
      }

      options?.onProgress?.({
        progress: 100,
        stage: '完成',
        processed: wordIds.length,
        total: wordIds.length,
        succeeded: deleted,
        failed: errors.length,
        errors: errors.map((e, idx) => ({ index: idx, message: e.message })),
      });

      return {
        deleted,
        failed: errors.length,
        errors,
      };
    },
    onSuccess: (result) => {
      // 使单词列表缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.all });

      options?.onSuccess?.(result);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 批量创建学习记录的 Mutation Hook
 *
 * @example
 * ```tsx
 * function SyncButton() {
 *   const { mutate, isPending } = useBatchCreateRecords({
 *     onSuccess: (result) => {
 *       toast.success(`同步了 ${result.created} 条记录`);
 *     },
 *   });
 *
 *   return (
 *     <button
 *       onClick={() => mutate({ records: localRecords })}
 *       disabled={isPending}
 *     >
 *       同步记录
 *     </button>
 *   );
 * }
 * ```
 */
export function useBatchCreateRecords(options?: {
  onSuccess?: (result: BatchCreateRecordsResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BatchOperationProgress) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchCreateRecordsParams): Promise<BatchCreateRecordsResult> => {
      const { records, batchSize = 100 } = params;

      const { results, errors } = await processBatches(
        records,
        batchSize,
        async (batch) => {
          // 使用后端的批量创建API
          const created = await learningClient.batchCreateRecords(batch);
          return created;
        },
        options?.onProgress,
      );

      return {
        created: results.length,
        failed: errors.length,
        errors: errors.map((e) => e.message),
        recordIds: results.map((r) => r.id),
      };
    },
    onSuccess: (result) => {
      // 使学习记录缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.learningRecords.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });

      options?.onSuccess?.(result);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 组合 Hook - 提供所有批量操作
 *
 * @example
 * ```tsx
 * function BatchOperationsPanel() {
 *   const {
 *     batchImport,
 *     batchDelete,
 *     batchCreateRecords,
 *     isAnyPending,
 *   } = useBatchOperations({
 *     onImportSuccess: (result) => console.log('Imported:', result),
 *     onDeleteSuccess: (result) => console.log('Deleted:', result),
 *     onError: (error) => console.error('Error:', error),
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useBatchOperations(options?: {
  onImportSuccess?: (result: BatchImportResult) => void;
  onDeleteSuccess?: (result: BatchDeleteResult) => void;
  onCreateRecordsSuccess?: (result: BatchCreateRecordsResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BatchOperationProgress) => void;
}) {
  const importMutation = useBatchImport({
    onSuccess: options?.onImportSuccess,
    onError: options?.onError,
    onProgress: options?.onProgress,
  });

  const deleteMutation = useBatchDelete({
    onSuccess: options?.onDeleteSuccess,
    onError: options?.onError,
    onProgress: options?.onProgress,
  });

  const createRecordsMutation = useBatchCreateRecords({
    onSuccess: options?.onCreateRecordsSuccess,
    onError: options?.onError,
    onProgress: options?.onProgress,
  });

  return {
    // 批量导入
    batchImport: importMutation.mutate,
    batchImportAsync: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
    importError: importMutation.error,

    // 批量删除
    batchDelete: deleteMutation.mutate,
    batchDeleteAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,

    // 批量创建记录
    batchCreateRecords: createRecordsMutation.mutate,
    batchCreateRecordsAsync: createRecordsMutation.mutateAsync,
    isCreatingRecords: createRecordsMutation.isPending,
    createRecordsError: createRecordsMutation.error,

    // 全局状态
    isAnyPending:
      importMutation.isPending || deleteMutation.isPending || createRecordsMutation.isPending,
  };
}
