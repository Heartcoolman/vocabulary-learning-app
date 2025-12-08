/**
 * 学习进度同步 Mutation Hook
 *
 * 用于同步学习进度到服务器
 */

import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { learningClient } from '../../services/client';

/**
 * 进度同步参数
 */
export interface SyncProgressParams {
  /** 学习会话ID */
  sessionId: string;
  /** 实际掌握的单词数 */
  actualMasteryCount: number;
  /** 总答题数 */
  totalQuestions: number;
}

/**
 * 同步学习进度到服务器
 *
 * 此 hook 用于在学习过程中定期同步进度，或在学习结束时上报最终成绩。
 * 进度同步有助于服务端追踪学习状态，为后续的学习推荐提供数据基础。
 *
 * @param options - React Query mutation 配置
 *
 * @example
 * 基础用法：
 * ```tsx
 * const syncProgress = useSyncProgress();
 *
 * // 学习结束时同步进度
 * const handleFinish = async () => {
 *   try {
 *     await syncProgress.mutateAsync({
 *       sessionId: 'session-123',
 *       actualMasteryCount: 15,
 *       totalQuestions: 45
 *     });
 *     console.log('进度已同步');
 *   } catch (error) {
 *     console.error('同步失败:', error);
 *   }
 * };
 * ```
 *
 * @example
 * 带回调的用法：
 * ```tsx
 * const syncProgress = useSyncProgress({
 *   onSuccess: () => {
 *     toast.success('学习进度已保存');
 *   },
 *   onError: (error) => {
 *     toast.error(`同步失败: ${error.message}`);
 *   }
 * });
 *
 * const handleSync = () => {
 *   syncProgress.mutate({
 *     sessionId,
 *     actualMasteryCount: masteredWords.length,
 *     totalQuestions: questionCount
 *   });
 * };
 * ```
 *
 * @example
 * 定期自动同步：
 * ```tsx
 * const syncProgress = useSyncProgress();
 *
 * // 每回答5个问题自动同步一次
 * useEffect(() => {
 *   if (questionCount > 0 && questionCount % 5 === 0) {
 *     syncProgress.mutate({
 *       sessionId,
 *       actualMasteryCount: masteredWords.length,
 *       totalQuestions: questionCount
 *     });
 *   }
 * }, [questionCount]);
 * ```
 *
 * @example
 * 组件卸载时同步：
 * ```tsx
 * const syncProgress = useSyncProgress();
 *
 * useEffect(() => {
 *   return () => {
 *     // 组件卸载时同步最后的进度
 *     if (sessionId) {
 *       syncProgress.mutate({
 *         sessionId,
 *         actualMasteryCount: masteredWords.length,
 *         totalQuestions: questionCount
 *       });
 *     }
 *   };
 * }, []);
 * ```
 */
export function useSyncProgress(
  options?: Omit<UseMutationOptions<void, Error, SyncProgressParams>, 'mutationFn'>,
) {
  return useMutation<void, Error, SyncProgressParams>({
    mutationFn: async (params: SyncProgressParams) => {
      await learningClient.syncMasteryProgress(params);
    },
    // 失败时重试一次
    retry: 1,
    // 重试延迟1秒
    retryDelay: 1000,
    ...options,
  });
}

/**
 * 手动同步进度（不使用 React Query）
 *
 * 这是一个简化的 API，直接返回 Promise，适用于不需要状态管理的场景。
 *
 * @param params - 同步参数
 * @returns Promise<void>
 *
 * @example
 * ```tsx
 * import { syncProgress } from './useSyncProgress';
 *
 * async function handleSync() {
 *   try {
 *     await syncProgress({
 *       sessionId: 'session-123',
 *       actualMasteryCount: 15,
 *       totalQuestions: 45
 *     });
 *     console.log('同步成功');
 *   } catch (error) {
 *     console.error('同步失败:', error);
 *   }
 * }
 * ```
 */
export async function syncProgress(params: SyncProgressParams): Promise<void> {
  await learningClient.syncMasteryProgress(params);
}
