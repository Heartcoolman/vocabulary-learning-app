import { useRef, useCallback } from 'react';
import { WordQueueManager, WordItem } from '../../services/learning/WordQueueManager';
import { useRetryQueue, RetryQueueItem } from './useRetryQueue';
import { useSessionCache, CachedSession } from './useSessionCache';
import * as masteryApi from './useMasteryApi';
import { AmasProcessResult, AdjustReason } from '../../types/amas';
import { learningLogger } from '../../utils/logger';

/**
 * 本地掌握判定结果
 */
export interface LocalMasteryDecision {
  isMastered: boolean;
  confidence: number;
  suggestedRepeats: number;
}

/**
 * useMasterySync 配置选项
 */
export interface UseMasterySyncOptions {
  /** 同步间隔（每多少次答题同步一次），默认 5 */
  syncInterval?: number;
  /** 获取当前 sessionId */
  getSessionId: () => string;
  /** 获取当前用户 ID */
  getUserId: () => string | null | undefined;
  /** 获取队列管理器 */
  getQueueManager: () => WordQueueManager | null;
  /** 保存会话缓存的回调 */
  onSaveCache?: (cache: CachedSession) => void;
  /** AMAS 结果更新回调 */
  onAmasResult?: (result: AmasProcessResult) => void;
  /** 队列调整回调 */
  onQueueAdjusted?: (adjustments: { remove: string[]; add: WordItem[] }) => void;
}

/**
 * 答题提交参数
 */
export interface SubmitAnswerParams {
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  pausedTimeMs?: number;
  latestAmasState?: {
    fatigue: number;
    attention: number;
    motivation: number;
  };
  recentPerformance?: {
    accuracy: number;
    avgResponseTime: number;
    consecutiveWrong: number;
  };
}

/**
 * useMasterySync 返回值
 */
export interface UseMasterySyncReturn {
  /** 提交答案（乐观更新） */
  submitAnswerOptimistic: (params: SubmitAnswerParams) => LocalMasteryDecision;
  /** 异步同步答案到服务器 */
  syncAnswerToServer: (params: SubmitAnswerParams, localDecision: LocalMasteryDecision) => void;
  /** 手动触发进度同步 */
  syncProgressNow: () => Promise<void>;
  /** 触发队列调整 */
  triggerQueueAdjustment: (
    reason: AdjustReason,
    recentPerformance?: {
      accuracy: number;
      avgResponseTime: number;
      consecutiveWrong: number;
    }
  ) => void;
  /** 按需获取更多单词 */
  fetchMoreWordsIfNeeded: (activeCount: number, pendingCount: number, isCompleted: boolean) => Promise<WordItem[]>;
  /** 重试队列相关 */
  retryQueue: {
    enqueue: (item: Omit<RetryQueueItem, 'retryCount'>) => void;
    getQueueLength: () => number;
    clearQueue: () => void;
  };
  /** 会话缓存相关 */
  sessionCache: {
    saveSessionToCache: (session: CachedSession) => boolean;
    loadSessionFromCache: (currentUserId?: string | null, currentSessionId?: string) => CachedSession | null;
    clearSessionCache: () => boolean;
  };
  /** 重置同步计数器 */
  resetSyncCounter: () => void;
}

const DEFAULT_SYNC_INTERVAL = 5;

/**
 * 计算本地掌握判定
 *
 * @param isCorrect 是否正确
 * @param responseTime 响应时间（毫秒）
 * @returns LocalMasteryDecision
 */
export function calculateLocalMasteryDecision(
  isCorrect: boolean,
  responseTime: number
): LocalMasteryDecision {
  return {
    isMastered: isCorrect && responseTime < 3000, // 快速正确响应视为掌握信号
    confidence: isCorrect ? 0.6 : 0.3,
    suggestedRepeats: isCorrect ? 1 : 3
  };
}

/**
 * 掌握学习同步 Hook
 *
 * 结合 useRetryQueue 和 useSessionCache，处理乐观更新和服务器同步
 */
export function useMasterySync(options: UseMasterySyncOptions): UseMasterySyncReturn {
  const {
    syncInterval = DEFAULT_SYNC_INTERVAL,
    getSessionId,
    // getUserId - 保留用于未来的用户相关功能
    getQueueManager,
    // onSaveCache - 保留用于外部缓存回调
    onAmasResult,
    onQueueAdjusted
  } = options;

  // 同步计数器
  const syncCounterRef = useRef(0);
  // 请求序列号，用于确保响应顺序处理
  const requestSequenceRef = useRef(0);
  const lastProcessedSequenceRef = useRef(0);
  // 是否正在获取单词
  const isFetchingRef = useRef(false);
  // 组件是否已挂载
  const isMountedRef = useRef(true);

  // 使用子 hooks
  const { enqueue, getQueueLength, clearQueue } = useRetryQueue({
    getSessionId,
    maxQueueSize: 20,
    retryInterval: 5000,
    maxRetryCount: 3
  });

  const { saveSessionToCache, loadSessionFromCache, clearSessionCache } = useSessionCache();

  /**
   * 乐观更新：立即更新本地状态
   */
  const submitAnswerOptimistic = useCallback((params: SubmitAnswerParams): LocalMasteryDecision => {
    const queueManager = getQueueManager();
    if (!queueManager) {
      return { isMastered: false, confidence: 0, suggestedRepeats: 3 };
    }

    // 计算本地掌握判定
    const localDecision = calculateLocalMasteryDecision(params.isCorrect, params.responseTime);

    // 立即更新队列状态（乐观）
    queueManager.recordAnswer(
      params.wordId,
      params.isCorrect,
      params.responseTime,
      localDecision
    );

    return localDecision;
  }, [getQueueManager]);

  /**
   * 异步同步答案到服务器
   */
  const syncAnswerToServer = useCallback((
    params: SubmitAnswerParams,
    localDecision: LocalMasteryDecision
  ) => {
    const timestamp = Date.now();
    const sessionId = getSessionId();

    // 分配请求序列号
    const currentSequence = ++requestSequenceRef.current;

    masteryApi.processLearningEvent({
      wordId: params.wordId,
      isCorrect: params.isCorrect,
      responseTime: params.responseTime,
      sessionId,
      timestamp,
      pausedTimeMs: params.pausedTimeMs
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
        learningLogger.warn({ err: e }, 'AMAS异步调用失败，已入队重试');

        if (!isMountedRef.current) return;

        // 入队重试
        enqueue({
          wordId: params.wordId,
          isCorrect: params.isCorrect,
          responseTime: params.responseTime,
          timestamp,
          pausedTimeMs: params.pausedTimeMs
        });
      });

    // 同步计数
    syncCounterRef.current += 1;
    if (syncCounterRef.current >= syncInterval) {
      syncProgressNow();
      syncCounterRef.current = 0;
    }
  }, [getSessionId, syncInterval, onAmasResult, enqueue]);

  /**
   * 手动触发进度同步
   */
  const syncProgressNow = useCallback(async () => {
    const queueManager = getQueueManager();
    if (!queueManager) return;

    try {
      const progress = queueManager.getProgress();
      await masteryApi.syncMasteryProgress({
        sessionId: getSessionId(),
        actualMasteryCount: progress.masteredCount,
        totalQuestions: progress.totalQuestions
      });
    } catch (error) {
      learningLogger.error({ err: error }, '同步进度失败');
    }
  }, [getQueueManager, getSessionId]);

  /**
   * 触发队列调整
   */
  const triggerQueueAdjustment = useCallback((
    reason: AdjustReason,
    recentPerformance?: {
      accuracy: number;
      avgResponseTime: number;
      consecutiveWrong: number;
    }
  ) => {
    const sessionId = getSessionId();
    const queueManager = getQueueManager();
    if (!sessionId || !queueManager) return;

    // 如果没有提供 recentPerformance，使用默认值
    const performance = recentPerformance ?? {
      accuracy: 0.5,
      avgResponseTime: 2000,
      consecutiveWrong: 0
    };

    masteryApi.adjustLearningWords({
      sessionId,
      currentWordIds: queueManager.getCurrentWordIds(),
      masteredWordIds: queueManager.getMasteredWordIds(),
      recentPerformance: performance,
      adjustReason: reason
    })
      .then(response => {
        if (!isMountedRef.current || !queueManager) return;

        queueManager.applyAdjustments(response.adjustments);
        onQueueAdjusted?.(response.adjustments);
        learningLogger.info({ reason, responseReason: response.reason }, '队列已调整');
      })
      .catch(err => {
        learningLogger.warn({ err }, '队列调整失败');
      });
  }, [getSessionId, getQueueManager, onQueueAdjusted]);

  /**
   * 按需获取更多单词
   */
  const fetchMoreWordsIfNeeded = useCallback(async (
    activeCount: number,
    pendingCount: number,
    isCompleted: boolean
  ): Promise<WordItem[]> => {
    const sessionId = getSessionId();
    const queueManager = getQueueManager();

    if (!sessionId || !queueManager || isFetchingRef.current || isCompleted) {
      return [];
    }

    const totalActive = activeCount + pendingCount;
    if (totalActive > 2) {
      return [];
    }

    isFetchingRef.current = true;
    try {
      const result = await masteryApi.fetchMoreWords({
        sessionId,
        currentWordIds: queueManager.getCurrentWordIds(),
        masteredWordIds: queueManager.getMasteredWordIds(),
        count: 3
      });

      if (!isMountedRef.current || !queueManager) return [];

      if (result.words.length > 0) {
        queueManager.applyAdjustments({
          remove: [],
          add: result.words
        });
        learningLogger.info({ count: result.words.length, reason: result.reason }, '按需补充单词');
      }

      return result.words;
    } catch (err) {
      learningLogger.warn({ err }, '按需加载单词失败');
      return [];
    } finally {
      isFetchingRef.current = false;
    }
  }, [getSessionId, getQueueManager]);

  /**
   * 重置同步计数器
   */
  const resetSyncCounter = useCallback(() => {
    syncCounterRef.current = 0;
    requestSequenceRef.current = 0;
    lastProcessedSequenceRef.current = 0;
    isFetchingRef.current = false;
  }, []);

  return {
    submitAnswerOptimistic,
    syncAnswerToServer,
    syncProgressNow,
    triggerQueueAdjustment,
    fetchMoreWordsIfNeeded,
    retryQueue: {
      enqueue,
      getQueueLength,
      clearQueue
    },
    sessionCache: {
      saveSessionToCache,
      loadSessionFromCache,
      clearSessionCache
    },
    resetSyncCounter
  };
}
