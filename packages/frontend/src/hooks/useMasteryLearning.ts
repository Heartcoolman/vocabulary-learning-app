import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';

import type {
  WordItem,
  QueueProgress,
  CompletionReason,
} from '../services/learning/WordQueueManager';
import type { AmasProcessResult } from '../types/amas';

import {
  useWordQueue,
  useMasterySync,
  getMasteryStudyWords,
  createMasterySession,
  endHabitSession,
} from './mastery';
import { useSubmitAnswer, extractAmasState, useSyncProgress, syncProgress } from './mutations';
import { learningLogger } from '../utils/logger';
import { STORAGE_KEYS } from '../constants/storageKeys';

const END_SESSION_ENDPOINT = '/api/habit-profile/end-session';

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
  isSubmitting: boolean; // 提交状态（来自 React Query mutation）
}

export function useMasteryLearning(
  options: UseMasteryLearningOptions = {},
): UseMasteryLearningReturn {
  const {
    targetMasteryCount: initialTargetCount = 20,
    sessionId,
    getDialogPausedTime,
    resetDialogPausedTime,
  } = options;
  const { user } = useAuth();
  const location = useLocation();

  // 状态
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);

  // Refs
  const currentSessionIdRef = useRef(sessionId || '');
  const sessionStartTimeRef = useRef(0);
  const sessionEndedRef = useRef(false);
  const isMountedRef = useRef(true);
  const prevUserIdRef = useRef(user?.id);
  const endSessionRef = useRef<(mode: 'async' | 'beacon') => void>(() => {});
  const lastSyncCountRef = useRef(0);

  // 子 hooks
  const wordQueue = useWordQueue({ targetMasteryCount: initialTargetCount });

  // 使用 ref 存储稳定的函数引用 - 必须在使用它们的 useCallback 之前定义
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
    onAmasResult: (result) => {
      setLatestAmasResult(result);
      // 应用 AMAS 策略到队列
      if (result.strategy) {
        wordQueueRef.current.applyStrategy({
          batchSize: result.strategy.batch_size,
          difficulty: result.strategy.difficulty,
          hintLevel: result.strategy.hint_level,
          intervalScale: result.strategy.interval_scale,
        });
      }
      // 同步后端掌握判定
      if (result.wordMasteryDecision?.wordId !== undefined) {
        wordQueueRef.current.updateMasteryFromBackend(
          result.wordMasteryDecision.wordId,
          result.wordMasteryDecision.isMastered,
        );
      }
    },
    onQueueAdjusted: () => {
      saveCacheRef.current();
      wordQueueRef.current.resetAdaptiveCounter();
    },
  });
  syncRef.current = sync;

  // 进度同步 mutation
  const syncProgressMutation = useSyncProgress();

  endSessionRef.current = (mode) => {
    const sid = currentSessionIdRef.current;
    if (!sid || sessionStartTimeRef.current <= 0 || sessionEndedRef.current) return;

    sessionEndedRef.current = true;
    sessionStartTimeRef.current = 0;

    if (mode === 'beacon' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      const payload = JSON.stringify({ sessionId: sid, authToken: token });
      const blob = new Blob([payload], { type: 'application/json' });
      const url = `${import.meta.env.VITE_API_URL || ''}${END_SESSION_ENDPOINT}`;
      if (navigator.sendBeacon(url, blob)) return;
    }

    endHabitSession(sid).catch(() => {});
  };

  // 使用 React Query mutation hook 进行答案提交
  // 提供乐观更新、自动重试和错误回滚
  const submitAnswerMutation = useSubmitAnswer({
    onOptimisticUpdate: (decision) => {
      learningLogger.debug({ decision }, '[useMasteryLearning] Optimistic update');
    },
    onAmasResult: (result) => {
      setLatestAmasResult(result);
      // 应用 AMAS 策略到队列
      if (result.strategy) {
        wordQueueRef.current.applyStrategy({
          batchSize: result.strategy.batch_size,
          difficulty: result.strategy.difficulty,
          hintLevel: result.strategy.hint_level,
          intervalScale: result.strategy.interval_scale,
        });
      }
      // 同步后端掌握判定
      if (result.wordMasteryDecision?.wordId !== undefined) {
        wordQueueRef.current.updateMasteryFromBackend(
          result.wordMasteryDecision.wordId,
          result.wordMasteryDecision.isMastered,
        );
      }
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
        // 尝试从缓存恢复进度信息（不恢复单词列表）
        let cachedProgress: {
          masteredWordIds: string[];
          totalQuestions: number;
          sessionId: string;
          masteryThreshold: number;
          maxTotalQuestions: number;
        } | null = null;

        if (!isReset && syncRef.current) {
          const cache = syncRef.current.sessionCache.loadSessionFromCache(user?.id, sessionId);
          if (cache?.queueState?.masteredWordIds?.length || cache?.queueState?.totalQuestions) {
            // 只提取进度信息，不使用缓存的单词列表
            cachedProgress = {
              masteredWordIds: cache.queueState.masteredWordIds || [],
              totalQuestions: cache.queueState.totalQuestions || 0,
              sessionId: cache.sessionId,
              masteryThreshold: cache.masteryThreshold,
              maxTotalQuestions: cache.maxTotalQuestions,
            };
          }
        }

        // 总是从服务端获取最新单词列表（后端会自动排除已学习的单词）
        const words = await getMasteryStudyWords(initialTargetCount);
        if (!isMountedRef.current) return;

        // 如果有缓存的进度，过滤掉已掌握的单词
        let filteredWords = words.words;
        if (cachedProgress && cachedProgress.masteredWordIds.length > 0) {
          const masteredSet = new Set(cachedProgress.masteredWordIds);
          filteredWords = words.words.filter((w) => !masteredSet.has(w.id));
        }

        // 创建或恢复会话
        if (cachedProgress) {
          currentSessionIdRef.current = cachedProgress.sessionId;
          sessionStartTimeRef.current = Date.now();
          sessionEndedRef.current = false;
          // 初始化队列，然后恢复进度
          wordQueueRef.current.initializeQueue(filteredWords, {
            masteryThreshold: cachedProgress.masteryThreshold,
            maxTotalQuestions: cachedProgress.maxTotalQuestions,
            targetMasteryCount: words.meta.targetCount,
          });
          // 恢复已掌握的单词计数（通过标记）
          if (cachedProgress.masteredWordIds.length > 0) {
            wordQueueRef.current.restoreMasteredCount(
              cachedProgress.masteredWordIds.length,
              cachedProgress.totalQuestions,
            );
          }
          setHasRestoredSession(true);
        } else {
          const session = await createMasterySession(words.meta.targetCount);
          if (!isMountedRef.current) return;
          currentSessionIdRef.current = session?.sessionId ?? '';
          sessionStartTimeRef.current = Date.now();
          sessionEndedRef.current = false;
          wordQueueRef.current.initializeQueue(words.words, {
            masteryThreshold: words.meta.masteryThreshold,
            maxTotalQuestions: words.meta.maxQuestions,
            targetMasteryCount: words.meta.targetCount,
          });
        }

        if (isMountedRef.current)
          wordQueueRef.current.updateFromManager({ consume: !cachedProgress });
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

  // 初始化 effect - 在组件挂载时和导航返回时执行
  const initSessionRef = useRef(initSession);
  initSessionRef.current = initSession;
  useEffect(() => {
    isMountedRef.current = true;
    initSessionRef.current();
    return () => {
      isMountedRef.current = false;
    };
  }, [location.key]);

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
    if (!wordQueue.isCompleted || sessionEndedRef.current) return;

    // 会话完成时同步最终进度
    if (currentSessionIdRef.current) {
      syncProgressMutation.mutate({
        sessionId: currentSessionIdRef.current,
        actualMasteryCount: wordQueue.progress.masteredCount,
        totalQuestions: wordQueue.progress.totalQuestions,
      });
    }

    endSessionRef.current('async');
  }, [wordQueue.isCompleted, wordQueue.progress, syncProgressMutation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = () => {
      endSessionRef.current('beacon');
    };
    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      endSessionRef.current('beacon');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    return () => {
      // 组件卸载时同步进度（仅在会话未结束时）
      if (!sessionEndedRef.current && currentSessionIdRef.current) {
        const queueState = wordQueueRef.current.queueManagerRef.current?.getState();
        if (queueState && queueState.totalQuestions > 0) {
          syncProgress({
            sessionId: currentSessionIdRef.current,
            actualMasteryCount: queueState.masteredWordIds?.length ?? 0,
            totalQuestions: queueState.totalQuestions,
          }).catch(() => {});
        }
      }
      endSessionRef.current('async');
    };
  }, []);

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
        if (should && reason) {
          sync.triggerQueueAdjustment(
            reason as 'fatigue' | 'struggling' | 'excelling' | 'periodic',
            adaptive.getRecentPerformance(),
          );
        }
      }

      // 获取暂停时间
      const pausedTimeMs = getDialogPausedTime?.() ?? 0;
      if (pausedTimeMs > 0) resetDialogPausedTime?.();

      // 使用 React Query mutation hook 提交到服务器
      // 提供自动重试和错误回滚
      await submitAnswerMutation.mutateAsync({
        wordId: word.id,
        isCorrect,
        responseTime,
        sessionId: currentSessionIdRef.current,
        pausedTimeMs,
        latestAmasState: amasState,
      });

      // 每 5 次答题同步一次进度到服务器
      const currentTotal = wordQueue.progress.totalQuestions;
      if (currentTotal > 0 && currentTotal % 5 === 0 && currentTotal !== lastSyncCountRef.current) {
        lastSyncCountRef.current = currentTotal;
        syncProgressMutation.mutate({
          sessionId: currentSessionIdRef.current,
          actualMasteryCount: wordQueue.progress.masteredCount,
          totalQuestions: currentTotal,
        });
      }
    },
    [
      wordQueue,
      latestAmasResult,
      sync,
      saveCache,
      getDialogPausedTime,
      resetDialogPausedTime,
      submitAnswerMutation,
      syncProgressMutation,
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
    isSubmitting: submitAnswerMutation.isPending, // 提交状态
  };
}
