import { useCallback, useRef } from 'react';
import { WordQueueManager, WordItem } from '../../services/learning/WordQueueManager';
import { AdaptiveQueueManager } from '../../services/learning/AdaptiveQueueManager';
import { LocalMasteryDecision, calculateLocalMasteryDecision } from './useMasterySync';
import * as masteryApi from './useMasteryApi';
import { AmasProcessResult, AdjustReason } from '../../types/amas';
import { learningLogger } from '../../utils/logger';

/**
 * useMasteryActions 配置选项
 */
export interface UseMasteryActionsOptions {
  /** 获取队列管理器 */
  getQueueManager: () => WordQueueManager | null;
  /** 获取自适应管理器 */
  getAdaptiveManager?: () => AdaptiveQueueManager | null;
  /** 获取当前 sessionId */
  getSessionId: () => string;
  /** 获取对话框暂停时间（用于疲劳度计算） */
  getDialogPausedTime?: () => number;
  /** 重置对话框暂停时间 */
  resetDialogPausedTime?: () => void;
  /** 状态更新回调 */
  onStateUpdate: (options?: { consume?: boolean }) => void;
  /** AMAS 结果更新回调 */
  onAmasResult?: (result: AmasProcessResult) => void;
  /** 同步进度回调 */
  syncProgress: () => Promise<void>;
  /** 触发队列调整 */
  triggerQueueAdjustment: (reason: AdjustReason) => void;
  /** 保存会话缓存回调 */
  onSaveCache?: () => void;
  /** 重置回调 - 用于重置外部状态，接收新会话数据 */
  onReset?: (newSessionData?: {
    sessionId: string;
    words: WordItem[];
    meta: { targetCount: number; masteryThreshold: number; maxQuestions: number };
  }) => void;
  /** 获取最新 AMAS 状态 */
  getLatestAmasState?: () => { fatigue: number; attention: number; motivation: number } | null;
  /** 同步间隔（每多少次答题同步一次），默认 5 */
  syncInterval?: number;
  /** 初始目标掌握数 */
  initialTargetCount?: number;
  /** 入队重试的回调 */
  enqueueRetry?: (item: {
    wordId: string;
    isCorrect: boolean;
    responseTime: number;
    timestamp: number;
    pausedTimeMs?: number;
  }) => void;
}

/**
 * useMasteryActions 返回值
 */
export interface UseMasteryActionsReturn {
  /** 提交答案（包含乐观更新和服务端同步） */
  submitAnswer: (
    wordId: string,
    selectedAnswer: string,
    isCorrect: boolean,
    responseTime: number
  ) => Promise<LocalMasteryDecision>;
  /** 进入下一题 */
  advanceToNext: () => void;
  /** 跳过当前单词 */
  skipWord: (wordId: string) => void;
  /** 重置学习会话 */
  resetSession: () => Promise<void>;
}

const DEFAULT_SYNC_INTERVAL = 5;

/**
 * 掌握学习用户动作 Hook
 *
 * 封装 useMasteryLearning 中的所有用户动作处理，包括：
 * - 提交答案（乐观更新 + 异步服务端同步）
 * - 进入下一题
 * - 跳过单词
 * - 重置会话
 */
export function useMasteryActions(options: UseMasteryActionsOptions): UseMasteryActionsReturn {
  const {
    getQueueManager,
    getAdaptiveManager,
    getSessionId,
    getDialogPausedTime,
    resetDialogPausedTime,
    onStateUpdate,
    onAmasResult,
    syncProgress,
    triggerQueueAdjustment,
    onSaveCache,
    onReset,
    getLatestAmasState,
    syncInterval = DEFAULT_SYNC_INTERVAL,
    initialTargetCount = 20,
    enqueueRetry
  } = options;

  // 同步计数器
  const syncCounterRef = useRef(0);
  // 请求序列号，用于确保响应顺序处理
  const requestSequenceRef = useRef(0);
  const lastProcessedSequenceRef = useRef(0);
  // 组件是否已挂载
  const isMountedRef = useRef(true);

  /**
   * 提交答案
   * 1. 乐观更新本地状态
   * 2. 异步同步到服务器
   * 3. 检查自适应队列调整
   */
  const submitAnswer = useCallback(async (
    wordId: string,
    _selectedAnswer: string,
    isCorrect: boolean,
    responseTime: number
  ): Promise<LocalMasteryDecision> => {
    const queueManager = getQueueManager();
    if (!queueManager) {
      learningLogger.warn('提交答案时队列管理器不存在');
      return { isMastered: false, confidence: 0, suggestedRepeats: 3 };
    }

    const timestamp = Date.now();

    // ============ 乐观更新：立即更新本地状态 ============
    const localDecision = calculateLocalMasteryDecision(isCorrect, responseTime);

    // 立即更新队列状态（乐观）
    queueManager.recordAnswer(wordId, isCorrect, responseTime, localDecision);

    // 立即保存缓存
    onSaveCache?.();

    // 自适应队列检查
    const adaptiveManager = getAdaptiveManager?.();
    if (adaptiveManager) {
      const amasState = getLatestAmasState?.();
      const { should, reason } = adaptiveManager.onAnswerSubmitted(
        isCorrect,
        responseTime,
        amasState ?? undefined
      );

      if (should && reason) {
        triggerQueueAdjustment(reason);
      }
    }

    // 同步计数
    syncCounterRef.current += 1;
    if (syncCounterRef.current >= syncInterval) {
      syncProgress();
      syncCounterRef.current = 0;
    }

    // ============ 异步同步到服务器（不阻塞UI） ============
    const pausedTimeMs = getDialogPausedTime?.() ?? 0;
    if (pausedTimeMs > 0) {
      resetDialogPausedTime?.();
    }

    // 分配请求序列号
    const currentSequence = ++requestSequenceRef.current;
    const sessionId = getSessionId();

    masteryApi.processLearningEvent({
      wordId,
      isCorrect,
      responseTime,
      sessionId,
      timestamp,
      pausedTimeMs
    })
      .then(amasResult => {
        if (!isMountedRef.current) return;

        // 只处理比上次处理的序号更大的响应（防止乱序）
        if (currentSequence <= lastProcessedSequenceRef.current) {
          learningLogger.debug(
            { currentSequence, lastProcessed: lastProcessedSequenceRef.current },
            '跳过过期的AMAS响应'
          );
          return;
        }
        lastProcessedSequenceRef.current = currentSequence;

        // 更新 AMAS 结果
        onAmasResult?.(amasResult);

        // 记录服务端与本地判定差异
        if (amasResult.wordMasteryDecision?.isMastered !== localDecision.isMastered) {
          learningLogger.debug(
            {
              local: localDecision.isMastered,
              server: amasResult.wordMasteryDecision?.isMastered
            },
            '服务端判定与本地不同'
          );
        }
      })
      .catch(e => {
        learningLogger.warn({ err: e }, 'AMAS异步调用失败');

        if (!isMountedRef.current) return;

        // 入队重试
        enqueueRetry?.({
          wordId,
          isCorrect,
          responseTime,
          timestamp,
          pausedTimeMs
        });
      });

    return localDecision;
  }, [
    getQueueManager,
    getAdaptiveManager,
    getSessionId,
    getDialogPausedTime,
    resetDialogPausedTime,
    onSaveCache,
    getLatestAmasState,
    triggerQueueAdjustment,
    syncInterval,
    syncProgress,
    onAmasResult,
    enqueueRetry
  ]);

  /**
   * 进入下一题
   */
  const advanceToNext = useCallback(() => {
    onStateUpdate({ consume: true });
  }, [onStateUpdate]);

  /**
   * 跳过当前单词
   */
  const skipWord = useCallback((wordId: string) => {
    const queueManager = getQueueManager();
    if (!queueManager) {
      learningLogger.warn('跳过单词时队列管理器不存在');
      return;
    }

    queueManager.skipWord(wordId);
    onStateUpdate();
    onSaveCache?.();
  }, [getQueueManager, onStateUpdate, onSaveCache]);

  /**
   * 重置学习会话
   */
  const resetSession = useCallback(async (): Promise<void> => {
    // 重置内部计数器
    syncCounterRef.current = 0;
    requestSequenceRef.current = 0;
    lastProcessedSequenceRef.current = 0;

    try {
      // 获取新的学习单词
      const wordsResponse = await masteryApi.getMasteryStudyWords(initialTargetCount);

      if (!isMountedRef.current) return;

      const serverTargetCount = wordsResponse.meta.targetCount;

      // 创建新会话
      const sessionResponse = await masteryApi.createMasterySession(serverTargetCount);

      if (!isMountedRef.current) return;

      learningLogger.info(
        {
          sessionId: sessionResponse?.sessionId,
          wordCount: wordsResponse.words.length,
          target: serverTargetCount
        },
        '重置后创建新会话'
      );

      // 通知外部进行状态重置，并传递新会话数据
      onReset?.({
        sessionId: sessionResponse?.sessionId ?? '',
        words: wordsResponse.words,
        meta: wordsResponse.meta
      });
    } catch (error) {
      learningLogger.error({ err: error }, '重置会话失败');
      // 仍然通知外部重置（无数据）
      onReset?.();
      throw error;
    }
  }, [initialTargetCount, onReset]);

  return {
    submitAnswer,
    advanceToNext,
    skipWord,
    resetSession
  };
}

// 导出类型
export type { LocalMasteryDecision };
