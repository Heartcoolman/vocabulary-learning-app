/**
 * 学习单词队列调整 Mutation Hook
 *
 * 根据用户状态和表现动态调整学习队列
 */

import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { learningClient } from '../../services/client';
import { AdjustWordsParams, AdjustWordsResponse } from '../../types/amas';

/**
 * 队列调整回调参数
 */
export interface AdjustWordsCallbacks {
  /** 成功回调 - 提供调整结果 */
  onSuccess?: (data: AdjustWordsResponse) => void;
  /** 失败回调 */
  onError?: (error: Error) => void;
  /** 调整前回调 - 可用于保存当前状态 */
  onMutate?: (params: AdjustWordsParams) => void | Promise<unknown>;
  /** 调整后回调 - 无论成功失败都会调用 */
  onSettled?: (
    data: AdjustWordsResponse | undefined,
    error: Error | null,
    params: AdjustWordsParams,
  ) => void;
}

/**
 * 动态调整学习单词队列
 *
 * 此 hook 用于根据用户的学习状态（疲劳度、注意力、动机）和近期表现
 * （正确率、响应时间、连续错误数）动态调整当前学习的单词队列。
 *
 * 调整策略由 AMAS 算法决定，可能包括：
 * - 移除过难的单词
 * - 添加更容易的单词
 * - 调整新词/复习词比例
 * - 改变单词难度分布
 *
 * @param options - React Query mutation 配置
 *
 * @example
 * 基础用法：
 * ```tsx
 * const adjustWords = useAdjustWords({
 *   onSuccess: (result) => {
 *     console.log('队列已调整:', result);
 *     // 应用调整结果到本地队列
 *     applyAdjustments(result.adjustments);
 *   }
 * });
 *
 * // 当用户表现不佳时触发调整
 * const handleAdjust = () => {
 *   adjustWords.mutate({
 *     sessionId: 'session-123',
 *     currentWordIds: ['word1', 'word2', 'word3'],
 *     masteredWordIds: ['word4'],
 *     userState: {
 *       fatigue: 0.8,
 *       attention: 0.4,
 *       motivation: 0.5
 *     },
 *     recentPerformance: {
 *       accuracy: 0.4,
 *       avgResponseTime: 8000,
 *       consecutiveWrong: 3
 *     },
 *     adjustReason: 'struggling'
 *   });
 * };
 * ```
 *
 * @example
 * 集成到学习流程中：
 * ```tsx
 * const { queueManager } = useWordQueue();
 * const adjustWords = useAdjustWords({
 *   onSuccess: (result) => {
 *     // 自动应用调整到队列管理器
 *     queueManager.applyAdjustments(result.adjustments);
 *   }
 * });
 *
 * // 根据AMAS建议自动调整
 * useEffect(() => {
 *   if (amasResult?.shouldAdjustQueue) {
 *     adjustWords.mutate({
 *       sessionId,
 *       currentWordIds: queueManager.getCurrentWordIds(),
 *       masteredWordIds: queueManager.getMasteredWordIds(),
 *       recentPerformance: {
 *         accuracy: calculateAccuracy(),
 *         avgResponseTime: calculateAvgTime(),
 *         consecutiveWrong: getConsecutiveWrong()
 *       },
 *       adjustReason: 'periodic'
 *     });
 *   }
 * }, [amasResult]);
 * ```
 *
 * @example
 * 不同场景的调整原因：
 * ```tsx
 * const adjustWords = useAdjustWords();
 *
 * // 用户疲劳时
 * if (fatigue > 0.7) {
 *   adjustWords.mutate({
 *     ...params,
 *     adjustReason: 'fatigue'
 *   });
 * }
 *
 * // 用户表现不佳时
 * if (accuracy < 0.5 || consecutiveWrong >= 3) {
 *   adjustWords.mutate({
 *     ...params,
 *     adjustReason: 'struggling'
 *   });
 * }
 *
 * // 用户表现优秀时
 * if (accuracy > 0.9 && avgResponseTime < 3000) {
 *   adjustWords.mutate({
 *     ...params,
 *     adjustReason: 'excelling'
 *   });
 * }
 *
 * // 定期调整
 * if (questionCount % 10 === 0) {
 *   adjustWords.mutate({
 *     ...params,
 *     adjustReason: 'periodic'
 *   });
 * }
 * ```
 *
 * @example
 * 处理调整结果：
 * ```tsx
 * const adjustWords = useAdjustWords({
 *   onSuccess: (result) => {
 *     const { adjustments, targetDifficulty, reason } = result;
 *
 *     console.log('调整原因:', reason);
 *     console.log('目标难度范围:', targetDifficulty);
 *
 *     // 移除单词
 *     adjustments.remove.forEach(wordId => {
 *       removeFromQueue(wordId);
 *     });
 *
 *     // 添加新单词
 *     adjustments.add.forEach(word => {
 *       addToQueue(word);
 *     });
 *
 *     // 显示提示
 *     if (adjustments.add.length > 0) {
 *       toast.info(`已为您调整学习内容，添加了 ${adjustments.add.length} 个单词`);
 *     }
 *   }
 * });
 * ```
 */
export function useAdjustWords(
  options?: Omit<UseMutationOptions<AdjustWordsResponse, Error, AdjustWordsParams>, 'mutationFn'>,
) {
  return useMutation<AdjustWordsResponse, Error, AdjustWordsParams>({
    mutationFn: async (params: AdjustWordsParams) => {
      return await learningClient.adjustLearningWords(params);
    },
    onSuccess: (data, variables, context) => {
      // 可选：使相关查询失效，强制重新获取
      // queryClient.invalidateQueries({ queryKey: ['nextWords'] });

      // 调用用户提供的回调（React Query v5 的 onSuccess 签名）
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    // 失败时重试一次
    retry: 1,
    // 重试延迟2秒
    retryDelay: 2000,
    ...options,
  });
}

/**
 * 手动调整队列（不使用 React Query）
 *
 * 这是一个简化的 API，直接返回 Promise，适用于不需要状态管理的场景。
 *
 * @param params - 调整参数
 * @returns Promise<AdjustWordsResponse>
 *
 * @example
 * ```tsx
 * import { adjustWords } from './useAdjustWords';
 *
 * async function handleAdjust() {
 *   try {
 *     const result = await adjustWords({
 *       sessionId: 'session-123',
 *       currentWordIds: ['word1', 'word2'],
 *       masteredWordIds: ['word3'],
 *       userState: {
 *         fatigue: 0.6,
 *         attention: 0.7,
 *         motivation: 0.8
 *       },
 *       recentPerformance: {
 *         accuracy: 0.85,
 *         avgResponseTime: 4000,
 *         consecutiveWrong: 0
 *       },
 *       adjustReason: 'excelling'
 *     });
 *
 *     console.log('调整成功:', result);
 *     return result;
 *   } catch (error) {
 *     console.error('调整失败:', error);
 *     throw error;
 *   }
 * }
 * ```
 */
export async function adjustWords(params: AdjustWordsParams): Promise<AdjustWordsResponse> {
  return await learningClient.adjustLearningWords(params);
}

/**
 * 辅助函数：判断是否需要调整队列
 *
 * 根据用户状态和表现判断是否需要调整队列
 *
 * @param userState - 用户状态
 * @param recentPerformance - 近期表现
 * @returns 是否需要调整及原因
 *
 * @example
 * ```tsx
 * import { shouldAdjustQueue } from './useAdjustWords';
 *
 * const { shouldAdjust, reason } = shouldAdjustQueue(
 *   { fatigue: 0.8, attention: 0.4, motivation: 0.5 },
 *   { accuracy: 0.4, avgResponseTime: 8000, consecutiveWrong: 3 }
 * );
 *
 * if (shouldAdjust) {
 *   adjustWords.mutate({
 *     ...params,
 *     adjustReason: reason
 *   });
 * }
 * ```
 */
export function shouldAdjustQueue(
  userState?: { fatigue: number; attention: number; motivation: number },
  recentPerformance?: {
    accuracy: number;
    avgResponseTime: number;
    consecutiveWrong: number;
  },
): { shouldAdjust: boolean; reason?: AdjustWordsParams['adjustReason'] } {
  // 检查疲劳度
  if (userState && userState.fatigue > 0.7) {
    return { shouldAdjust: true, reason: 'fatigue' };
  }

  // 检查表现不佳
  if (recentPerformance) {
    if (
      recentPerformance.accuracy < 0.5 ||
      recentPerformance.consecutiveWrong >= 3 ||
      recentPerformance.avgResponseTime > 10000
    ) {
      return { shouldAdjust: true, reason: 'struggling' };
    }

    // 检查表现优秀
    if (recentPerformance.accuracy > 0.9 && recentPerformance.avgResponseTime < 3000) {
      return { shouldAdjust: true, reason: 'excelling' };
    }
  }

  return { shouldAdjust: false };
}
