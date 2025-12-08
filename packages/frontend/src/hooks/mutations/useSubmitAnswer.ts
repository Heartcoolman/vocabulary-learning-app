/**
 * useSubmitAnswer - 答题提交的Mutation Hook
 *
 * 功能：
 * 1. 乐观更新本地进度状态
 * 2. 错误回滚机制
 * 3. 集成AMAS事件处理
 * 4. 重试策略
 * 5. 智能缓存管理
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { processLearningEvent } from '../mastery';
import type { LearningEventInput, AmasProcessResult } from '../../types/amas';
import { learningLogger } from '../../utils/logger';

// ==================== 类型定义 ====================

/**
 * 答题提交参数
 */
export interface SubmitAnswerParams {
  /** 单词ID */
  wordId: string;
  /** 是否正确 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 学习会话ID */
  sessionId: string;
  /** 暂停时间（毫秒） */
  pausedTimeMs?: number;
  /** 最新的AMAS状态（用于优化决策） */
  latestAmasState?: {
    fatigue: number;
    attention: number;
    motivation: number;
  };
}

/**
 * 乐观更新的上下文数据
 * 用于错误回滚
 */
interface OptimisticContext {
  /** 之前的AMAS结果 */
  previousAmasResult?: AmasProcessResult;
  /** 之前的本地决策 */
  previousLocalDecision?: LocalWordDecision;
  /** 提交的参数（用于重试） */
  submitParams: SubmitAnswerParams;
}

/**
 * 本地单词决策（乐观更新）
 */
export interface LocalWordDecision {
  /** 单词ID */
  wordId: string;
  /** 是否应继续练习 */
  shouldContinue: boolean;
  /** 是否已掌握 */
  isMastered: boolean;
  /** 建议重复次数 */
  suggestedRepeats: number;
  /** 正确次数 */
  correctCount: number;
  /** 错误次数 */
  incorrectCount: number;
}

/**
 * Hook 配置选项
 */
export interface UseSubmitAnswerOptions {
  /** 乐观更新本地决策的回调函数 */
  onOptimisticUpdate?: (decision: LocalWordDecision) => void;
  /** AMAS结果更新的回调函数 */
  onAmasResult?: (result: AmasProcessResult) => void;
  /** 错误处理回调 */
  onError?: (error: Error) => void;
  /** 成功处理回调 */
  onSuccess?: (result: AmasProcessResult) => void;
  /** 是否启用乐观更新（默认：true） */
  enableOptimisticUpdate?: boolean;
  /** 重试次数（默认：3） */
  retryCount?: number;
  /** 重试延迟（毫秒，默认：1000） */
  retryDelay?: number;
}

// ==================== Hook 实现 ====================

/**
 * 答题提交的Mutation Hook
 *
 * @example
 * ```tsx
 * const { mutate: submitAnswer, isPending } = useSubmitAnswer({
 *   onOptimisticUpdate: (decision) => {
 *     // 立即更新UI
 *     updateLocalProgress(decision);
 *   },
 *   onAmasResult: (result) => {
 *     // 更新AMAS状态
 *     setAmasState(result.state);
 *   },
 * });
 *
 * // 提交答题
 * submitAnswer({
 *   wordId: 'word-123',
 *   isCorrect: true,
 *   responseTime: 2500,
 *   sessionId: 'session-456',
 * });
 * ```
 */
export function useSubmitAnswer(options: UseSubmitAnswerOptions = {}) {
  const {
    onOptimisticUpdate,
    onAmasResult,
    onError,
    onSuccess,
    enableOptimisticUpdate = true,
    retryCount = 3,
    retryDelay = 1000,
  } = options;

  const queryClient = useQueryClient();

  // 使用 ref 避免闭包陷阱
  const callbacksRef = useRef({ onOptimisticUpdate, onAmasResult, onError, onSuccess });
  callbacksRef.current = { onOptimisticUpdate, onAmasResult, onError, onSuccess };

  /**
   * 执行乐观更新
   * 立即更新本地状态，不等待服务器响应
   */
  const performOptimisticUpdate = useCallback((params: SubmitAnswerParams): LocalWordDecision => {
    // 简单的本地决策逻辑（实际会被服务器结果覆盖）
    // 这里只是为了提供即时反馈
    const decision: LocalWordDecision = {
      wordId: params.wordId,
      shouldContinue: !params.isCorrect, // 错误则继续，正确可能结束
      isMastered: params.isCorrect, // 简化判断，实际由服务器决定
      suggestedRepeats: params.isCorrect ? 0 : 1,
      correctCount: params.isCorrect ? 1 : 0,
      incorrectCount: params.isCorrect ? 0 : 1,
    };

    // 触发乐观更新回调
    callbacksRef.current.onOptimisticUpdate?.(decision);

    return decision;
  }, []);

  /**
   * 构建完整的学习事件数据
   */
  const buildLearningEvent = useCallback((params: SubmitAnswerParams): LearningEventInput => {
    const now = Date.now();

    return {
      wordId: params.wordId,
      isCorrect: params.isCorrect,
      responseTime: params.responseTime,
      sessionId: params.sessionId,
      pausedTimeMs: params.pausedTimeMs,
      // 提供默认值以满足后端要求
      dwellTime: params.responseTime, // 停留时长默认等于响应时间
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 1,
      timestamp: now,
    };
  }, []);

  /**
   * 主 Mutation
   */
  const mutation = useMutation<AmasProcessResult, Error, SubmitAnswerParams, OptimisticContext>({
    // Mutation 函数：提交答题到服务器
    mutationFn: async (params: SubmitAnswerParams) => {
      const eventData = buildLearningEvent(params);
      const result = await processLearningEvent(eventData);
      return result;
    },

    // 乐观更新：在请求发送前立即更新本地状态
    onMutate: async (params: SubmitAnswerParams) => {
      if (!enableOptimisticUpdate) {
        return { submitParams: params };
      }

      // 取消正在进行的查询，避免覆盖乐观更新
      // await queryClient.cancelQueries({ queryKey: ['amas', params.sessionId] });

      // 保存之前的状态（用于回滚）
      const previousAmasResult = queryClient.getQueryData<AmasProcessResult>([
        'amas',
        params.sessionId,
      ]);

      // 执行乐观更新
      const localDecision = performOptimisticUpdate(params);

      // 返回上下文数据（用于错误回滚）
      return {
        previousAmasResult,
        previousLocalDecision: localDecision,
        submitParams: params,
      };
    },

    // 成功：更新缓存并触发回调
    onSuccess: (result) => {
      // 更新AMAS结果缓存
      queryClient.setQueryData(['amas', result.sessionId], result);

      // 触发AMAS结果回调
      callbacksRef.current.onAmasResult?.(result);
      callbacksRef.current.onSuccess?.(result);
    },

    // 错误：回滚乐观更新
    onError: (error, _params, context) => {
      learningLogger.error({ err: error }, '[useSubmitAnswer] Error');

      if (context?.previousAmasResult) {
        // 回滚到之前的状态
        queryClient.setQueryData(
          ['amas', context.submitParams.sessionId],
          context.previousAmasResult,
        );
      }

      // 触发错误回调
      callbacksRef.current.onError?.(error);
    },

    // 重试策略
    retry: retryCount,
    retryDelay: (attemptIndex) => {
      // 指数退避：1s, 2s, 4s...
      return Math.min(retryDelay * Math.pow(2, attemptIndex), 10000);
    },
  });

  return mutation;
}

// ==================== 辅助函数 ====================

/**
 * 提取AMAS状态为简化格式
 */
export function extractAmasState(
  result: AmasProcessResult | null,
): { fatigue: number; attention: number; motivation: number } | undefined {
  if (!result?.state) return undefined;

  return {
    fatigue: result.state.fatigue,
    attention: result.state.attention,
    motivation: result.state.motivation,
  };
}

/**
 * 判断是否需要休息
 */
export function shouldTakeBreak(result: AmasProcessResult | null): boolean {
  if (!result) return false;

  // 显式的休息建议
  if (result.shouldBreak) return true;

  // 高疲劳度
  if (result.state.fatigue > 0.8) return true;

  // 低注意力
  if (result.state.attention < 0.3) return true;

  return false;
}
