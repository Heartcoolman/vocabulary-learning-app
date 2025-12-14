/**
 * 管理后台操作的 React Query Mutation Hooks
 *
 * 提供管理后台的各种操作功能，包括：
 * - 系统词库管理
 * - 批量操作
 * - 数据导出
 * - 系统配置
 *
 * 所有操作会自动触发相关查询的 invalidation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { adminClient } from '../../services/client';
import type { WordBook, Word } from '../../types/models';

/**
 * 创建系统词库的参数
 */
export interface CreateSystemWordBookParams {
  name: string;
  description?: string;
  coverImage?: string;
}

/**
 * 更新系统词库的参数
 */
export interface UpdateSystemWordBookParams {
  id: string;
  name?: string;
  description?: string;
  coverImage?: string;
}

/**
 * 批量添加单词的参数
 */
export interface BatchAddWordsParams {
  wordBookId: string;
  words: Array<{
    spelling: string;
    phonetic: string;
    meanings: string[];
    examples: string[];
    audioUrl?: string;
  }>;
}

/**
 * 创建系统词库
 *
 * 成功后会自动刷新：
 * - 词库列表
 * - 系统统计
 *
 * @example
 * ```tsx
 * const createMutation = useCreateSystemWordBook();
 *
 * const handleCreate = async () => {
 *   try {
 *     const wordBook = await createMutation.mutateAsync({
 *       name: 'CET-4',
 *       description: '大学英语四级词汇',
 *     });
 *     toast.success('创建成功');
 *   } catch (error) {
 *     toast.error('创建失败');
 *   }
 * };
 * ```
 */
export function useCreateSystemWordBook() {
  const queryClient = useQueryClient();

  return useMutation<WordBook, Error, CreateSystemWordBookParams>({
    mutationFn: async (params) => {
      return await adminClient.createSystemWordBook(params);
    },
    onSuccess: () => {
      // 刷新词库列表
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.lists() });
      // 刷新系统统计
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.statistics.overview() });
    },
  });
}

/**
 * 更新系统词库
 *
 * 成功后会自动刷新：
 * - 词库列表
 * - 词库详情
 *
 * @example
 * ```tsx
 * const updateMutation = useUpdateSystemWordBook();
 *
 * const handleUpdate = async (id: string) => {
 *   await updateMutation.mutateAsync({
 *     id,
 *     name: '新名称',
 *     description: '新描述',
 *   });
 * };
 * ```
 */
export function useUpdateSystemWordBook() {
  const queryClient = useQueryClient();

  return useMutation<WordBook, Error, UpdateSystemWordBookParams>({
    mutationFn: async ({ id, ...data }) => {
      return await adminClient.updateSystemWordBook(id, data);
    },
    onSuccess: (data) => {
      // 刷新词库列表
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.lists() });
      // 刷新词库详情
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.detail(data.id) });
    },
  });
}

/**
 * 删除系统词库
 *
 * 成功后会自动刷新：
 * - 词库列表
 * - 系统统计
 *
 * @example
 * ```tsx
 * const deleteMutation = useDeleteSystemWordBook();
 *
 * const handleDelete = async (id: string) => {
 *   if (confirm('确定要删除这个词库吗？')) {
 *     await deleteMutation.mutateAsync(id);
 *   }
 * };
 * ```
 */
export function useDeleteSystemWordBook() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await adminClient.deleteSystemWordBook(id);
    },
    onSuccess: () => {
      // 刷新词库列表
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbooks.lists() });
      // 刷新系统统计
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.statistics.overview() });
    },
  });
}

/**
 * 批量添加单词到系统词库
 *
 * 成功后会自动刷新：
 * - 词库详情
 * - 单词列表
 * - 系统统计
 *
 * @example
 * ```tsx
 * const batchAddMutation = useBatchAddWords();
 *
 * const handleImport = async (words: Word[]) => {
 *   const result = await batchAddMutation.mutateAsync({
 *     wordBookId: 'xxx',
 *     words,
 *   });
 *   console.log(`成功添加 ${result.count} 个单词`);
 * };
 * ```
 */
export function useBatchAddWords() {
  const queryClient = useQueryClient();

  return useMutation<{ count: number; words: Word[] }, Error, BatchAddWordsParams>({
    mutationFn: async ({ wordBookId, words }) => {
      const result = await adminClient.batchAddWordsToSystemWordBook(wordBookId, words);
      return { count: result.length, words: result };
    },
    onSuccess: (_, variables) => {
      // 刷新词库详情
      queryClient.invalidateQueries({
        queryKey: queryKeys.wordbooks.detail(variables.wordBookId),
      });
      // 刷新单词列表
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      // 刷新系统统计
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.statistics.overview() });
    },
  });
}

/**
 * 导出用户单词数据的参数
 */
export interface ExportUserWordsParams {
  userId: string;
  format: 'csv' | 'excel';
}

/**
 * 导出用户单词数据
 *
 * 返回一个可下载的文件
 *
 * @example
 * ```tsx
 * const exportMutation = useExportUserWords();
 *
 * const handleExport = async (userId: string) => {
 *   const blob = await exportMutation.mutateAsync({
 *     userId,
 *     format: 'excel',
 *   });
 *   // 下载文件
 *   const url = window.URL.createObjectURL(blob);
 *   const a = document.createElement('a');
 *   a.href = url;
 *   a.download = `user-words-${userId}.xlsx`;
 *   a.click();
 * };
 * ```
 */
export function useExportUserWords() {
  return useMutation<Blob, Error, ExportUserWordsParams>({
    mutationFn: async ({ userId, format }) => {
      // 直接使用 AdminClient 的导出能力（包含下载逻辑）
      await adminClient.exportUserWords(userId, format);
      // 为了兼容调用方期望的返回值，返回空 Blob 占位
      return new Blob();
    },
  });
}

/**
 * 标记异常记录的参数
 */
export interface FlagAnomalyParams {
  userId: string;
  wordId: string;
  recordId?: string;
  reason: string;
  notes?: string;
}

/**
 * 标记异常单词或学习记录
 *
 * 用于管理员标记可疑的学习记录
 *
 * @example
 * ```tsx
 * const flagMutation = useFlagAnomaly();
 *
 * const handleFlag = async () => {
 *   await flagMutation.mutateAsync({
 *     userId: 'user-1',
 *     wordId: 'word-1',
 *     reason: '准确率异常',
 *     notes: '该用户此单词准确率100%但学习次数很少',
 *   });
 * };
 * ```
 */
export function useFlagAnomaly() {
  const queryClient = useQueryClient();

  return useMutation<any, Error, FlagAnomalyParams>({
    mutationFn: async ({ userId, wordId, ...data }) => {
      return await adminClient.flagAnomalyRecord(userId, wordId, data);
    },
    onSuccess: (_, variables) => {
      // 刷新异常标记列表
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.userWords.detail(variables.userId, variables.wordId),
      });
    },
  });
}

/**
 * 批量操作结果
 */
export interface BatchOperationResult {
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * 批量删除用户
 *
 * @example
 * ```tsx
 * const batchDeleteMutation = useBatchDeleteUsers();
 *
 * const handleBatchDelete = async (userIds: string[]) => {
 *   const result = await batchDeleteMutation.mutateAsync(userIds);
 *   console.log(`成功删除 ${result.success} 个用户`);
 * };
 * ```
 */
export function useBatchDeleteUsers() {
  const queryClient = useQueryClient();

  return useMutation<BatchOperationResult, Error, string[]>({
    mutationFn: async (userIds: string[]) => {
      const results = await Promise.allSettled(userIds.map((id) => adminClient.deleteUser(id)));

      const success = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      const errors = results
        .map((r, i) =>
          r.status === 'rejected'
            ? { id: userIds[i], error: r.reason?.message || '未知错误' }
            : null,
        )
        .filter((e): e is { id: string; error: string } => e !== null);

      return { success, failed, errors };
    },
    onSuccess: () => {
      // 刷新用户列表
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.lists() });
      // 刷新系统统计
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.statistics.overview() });
    },
  });
}

/**
 * 批量更新用户角色
 *
 * @example
 * ```tsx
 * const batchUpdateMutation = useBatchUpdateUserRoles();
 *
 * const handleBatchUpdate = async () => {
 *   const result = await batchUpdateMutation.mutateAsync([
 *     { userId: 'user-1', role: 'ADMIN' },
 *     { userId: 'user-2', role: 'ADMIN' },
 *   ]);
 * };
 * ```
 */
export function useBatchUpdateUserRoles() {
  const queryClient = useQueryClient();

  return useMutation<
    BatchOperationResult,
    Error,
    Array<{ userId: string; role: 'USER' | 'ADMIN' }>
  >({
    mutationFn: async (operations) => {
      const results = await Promise.allSettled(
        operations.map((op) => adminClient.updateUserRole(op.userId, op.role)),
      );

      const success = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      const errors = results
        .map((r, i) =>
          r.status === 'rejected'
            ? { id: operations[i].userId, error: r.reason?.message || '未知错误' }
            : null,
        )
        .filter((e): e is { id: string; error: string } => e !== null);

      return { success, failed, errors };
    },
    onSuccess: () => {
      // 刷新用户列表
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.lists() });
    },
  });
}
