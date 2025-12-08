/**
 * useMasteryLearningV2 - 掌握模式学习 Hook (使用新的 mutation hooks)
 *
 * 改进：
 * 1. 使用 useSubmitAnswer 进行乐观更新
 * 2. 更好的错误处理和状态管理
 * 3. 保持与原有接口兼容
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WordItem, QueueProgress, CompletionReason } from '../services/learning/WordQueueManager';
import { useAuth } from '../contexts/AuthContext';
import { AmasProcessResult } from '../types/amas';
import {
  useWordQueue,
  useMasterySync,
  getMasteryStudyWords,
  createMasterySession,
  endHabitSession,
} from './mastery';
import { useSubmitAnswer, extractAmasState } from './mutations';
import { learningLogger } from '../utils/logger';

export interface UseMasteryLearningOptions {
  targetMasteryCount?: number;
  sessionId?: string;
  getDialogPausedTime?: () => number;
  resetDialogPausedTime?: () => void;
}

export interface UseMasteryLearningReturn {
  currentWord: WordItem | null;
  isLoading: boolean;
  isCompleted: boolean;
  completionReason?: CompletionReason;
  progress: QueueProgress;
  submitAnswer: (isCorrect: boolean, responseTime: number) => Promise<void>;
  advanceToNext: () => void;
  skipWord: () => void;
  resetSession: () => Promise<void>;
  hasRestoredSession: boolean;
  allWords: WordItem[];
  error: string | null;
  latestAmasResult: AmasProcessResult | null;
  isSubmitting: boolean; // 新增：提交状态
}

/**
 * 掌握模式学习 Hook V2
 *
 * 使用新的 useSubmitAnswer mutation hook，提供：
 * - 乐观更新
 * - 自动重试
 * - 错误回滚
 */
export function useMasteryLearningV2(
  options: UseMasteryLearningOptions = {},
): UseMasteryLearningReturn {
  const {
    targetMasteryCount: initialTargetCount = 20,
    sessionId,
    getDialogPausedTime,
    resetDialogPausedTime,
  } = options;
  const { user } = useAuth();

  // 状态
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);

  // Refs
  const currentSessionIdRef = useRef(sessionId || '');
  const sessionStartTimeRef = useRef(0);
  const isMountedRef = useRef(true);
  const prevUserIdRef = useRef(user?.id);

  // 子 hooks
  const wordQueue = useWordQueue({ targetMasteryCount: initialTargetCount });

  // 使用 ref 存储稳定的函数引用
  const wordQueueRef = useRef(wordQueue);
  const syncRef = useRef<ReturnType<typeof useMasterySync> | null>(null);
  wordQueueRef.current = wordQueue;

  // 保存缓存 - 使用 ref 避免依赖循环
  const saveCacheRef = useRef<() => void>(() => {});
  const saveCache = useCallback(() => {
    const state = wordQueueRef.current.getQueueState();
    if (!state || !syncRef.current) return;
    syncRef.current.sessionCache.saveSessionToCache({
      sessionId: currentSessionIdRef.current,
      targetMasteryCount: initialTargetCount,
      masteryThreshold: wordQueueRef.current.configRef.current.masteryThreshold,
      maxTotalQuestions: wordQueueRef.current.configRef.current.maxTotalQuestions,
      queueState: state,
      timestamp: Date.now(),
      userId: user?.id ?? null,
    });
  }, [initialTargetCount, user?.id]);
  saveCacheRef.current = saveCache;

  const sync = useMasterySync({
    getSessionId: () => currentSessionIdRef.current,
    getUserId: () => user?.id,
    getQueueManager: () => wordQueueRef.current.queueManagerRef.current,
    onAmasResult: setLatestAmasResult,
    onQueueAdjusted: () => {
      saveCacheRef.current();
      wordQueueRef.current.resetAdaptiveCounter();
    },
  });
  syncRef.current = sync;

  // 新的 mutation hook
  const submitAnswerMutation = useSubmitAnswer({
    onOptimisticUpdate: (decision) => {
      // 乐观更新本地队列状态
      learningLogger.debug({ decision }, '[useMasteryLearningV2] Optimistic update');
    },
    onAmasResult: (result) => {
      // 更新最新的AMAS结果
      setLatestAmasResult(result);
    },
    onError: (err) => {
      setError(err.message);
    },
    onSuccess: () => {
      setError(null);
    },
    enableOptimisticUpdate: true,
    retryCount: 3,
    retryDelay: 1000,
  });

  // 初始化会话
  const initSession = useCallback(
    async (isReset = false) => {
      setIsLoading(true);
      setError(null);
      try {
        let restored = false;
        if (!isReset && syncRef.current) {
          const cache = syncRef.current.sessionCache.loadSessionFromCache(user?.id, sessionId);
          if (cache?.queueState?.words?.length) {
            wordQueueRef.current.restoreQueue(cache.queueState.words, cache.queueState, {
              masteryThreshold: cache.masteryThreshold,
              maxTotalQuestions: cache.maxTotalQuestions,
            });
            currentSessionIdRef.current = cache.sessionId;
            setHasRestoredSession(true);
            restored = true;
          }
        }
        if (!restored) {
          const words = await getMasteryStudyWords(initialTargetCount);
          if (!isMountedRef.current) return;
          const session = await createMasterySession(words.meta.targetCount);
          if (!isMountedRef.current) return;
          currentSessionIdRef.current = session?.sessionId ?? '';
          sessionStartTimeRef.current = Date.now();
          wordQueueRef.current.initializeQueue(words.words, {
            masteryThreshold: words.meta.masteryThreshold,
            maxTotalQuestions: words.meta.maxQuestions,
            targetMasteryCount: words.meta.targetCount,
          });
        }
        if (isMountedRef.current) wordQueueRef.current.updateFromManager({ consume: !restored });
      } catch (err) {
        if (isMountedRef.current) setError(err instanceof Error ? err.message : '初始化失败');
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [initialTargetCount, sessionId, user?.id],
  );

  // Effects
  useEffect(() => {
    const curr = user?.id ?? null,
      prev = prevUserIdRef.current ?? null;
    if (prev !== null && curr !== null && prev !== curr && syncRef.current) {
      syncRef.current.sessionCache.clearSessionCache();
      wordQueueRef.current.resetQueue();
      setHasRestoredSession(false);
    }
    prevUserIdRef.current = curr ?? undefined;
  }, [user?.id]);

  // 初始化 effect - 只在组件挂载时执行一次
  const initSessionRef = useRef(initSession);
  initSessionRef.current = initSession;
  useEffect(() => {
    isMountedRef.current = true;
    initSessionRef.current();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || wordQueue.isCompleted || !syncRef.current) return;
    syncRef.current
      .fetchMoreWordsIfNeeded(
        wordQueue.progress.activeCount,
        wordQueue.progress.pendingCount,
        wordQueue.isCompleted,
      )
      .then((words) => {
        if (words.length) {
          wordQueueRef.current.addWords(words);
          saveCache();
        }
      });
  }, [
    wordQueue.progress.activeCount,
    wordQueue.progress.pendingCount,
    isLoading,
    wordQueue.isCompleted,
    saveCache,
  ]);

  useEffect(() => {
    if (wordQueue.isCompleted && currentSessionIdRef.current && sessionStartTimeRef.current > 0) {
      endHabitSession(currentSessionIdRef.current).catch(() => {});
      sessionStartTimeRef.current = 0;
    }
  }, [wordQueue.isCompleted]);

  // Actions
  const submitAnswer = useCallback(
    async (isCorrect: boolean, responseTime: number) => {
      const word = wordQueue.getCurrentWord();
      if (!wordQueue.queueManagerRef.current || !word) return;

      setError(null);

      // 先执行本地乐观更新
      const amasState = extractAmasState(latestAmasResult);
      const localDecision = sync.submitAnswerOptimistic({
        wordId: word.id,
        isCorrect,
        responseTime,
        latestAmasState: amasState,
      });
      saveCache();

      // 检查自适应调整
      const adaptive = wordQueue.adaptiveManagerRef.current;
      if (adaptive) {
        const { should, reason } = adaptive.onAnswerSubmitted(isCorrect, responseTime, amasState);
        if (should && reason)
          sync.triggerQueueAdjustment(
            reason as 'fatigue' | 'struggling' | 'excelling' | 'periodic',
            adaptive.getRecentPerformance(),
          );
      }

      // 获取暂停时间
      const pausedTimeMs = getDialogPausedTime?.() ?? 0;
      if (pausedTimeMs > 0) resetDialogPausedTime?.();

      // 使用新的 mutation hook 提交到服务器
      submitAnswerMutation.mutate({
        wordId: word.id,
        isCorrect,
        responseTime,
        sessionId: currentSessionIdRef.current,
        pausedTimeMs,
        latestAmasState: amasState,
      });
    },
    [
      wordQueue,
      latestAmasResult,
      sync,
      saveCache,
      getDialogPausedTime,
      resetDialogPausedTime,
      submitAnswerMutation,
    ],
  );

  const advanceToNext = useCallback(
    () => wordQueue.updateFromManager({ consume: true }),
    [wordQueue],
  );

  const skipWord = useCallback(() => {
    const word = wordQueue.getCurrentWord();
    if (!word) return;
    wordQueue.skipWord(word.id);
    wordQueue.updateFromManager();
    saveCache();
  }, [wordQueue, saveCache]);

  const resetSession = useCallback(async () => {
    sync.sessionCache.clearSessionCache();
    sync.retryQueue.clearQueue();
    sync.resetSyncCounter();
    wordQueue.resetQueue();
    setHasRestoredSession(false);
    setLatestAmasResult(null);
    currentSessionIdRef.current = '';
    sessionStartTimeRef.current = 0;
    await initSession(true);
  }, [sync, wordQueue, initSession]);

  return {
    currentWord: wordQueue.currentWord,
    isLoading,
    isCompleted: wordQueue.isCompleted,
    completionReason: wordQueue.completionReason,
    progress: wordQueue.progress,
    submitAnswer,
    advanceToNext,
    skipWord,
    resetSession,
    hasRestoredSession,
    allWords: wordQueue.allWords,
    error,
    latestAmasResult,
    isSubmitting: submitAnswerMutation.isPending, // 新增：提交状态
  };
}
