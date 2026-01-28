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
import { useSubmitAnswer, extractAmasState } from './mutations';
import { learningLogger } from '../utils/logger';
import { STORAGE_KEYS } from '../constants/storageKeys';

const END_SESSION_ENDPOINT = '/api/habit-profile/end-session';

export interface UseMasteryLearningOptions {
  targetMasteryCount?: number;
  sessionId?: string;
  seedWords?: WordItem[];
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
    seedWords,
    getDialogPausedTime,
    resetDialogPausedTime,
  } = options;
  const { user } = useAuth();
  const location = useLocation();
  const isSeedSession = Array.isArray(seedWords) && seedWords.length > 0;

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

  // 子 hooks
  const wordQueue = useWordQueue({ targetMasteryCount: initialTargetCount });

  // 使用 ref 存储稳定的函数引用 - 必须在使用它们的 useCallback 之前定义
  const wordQueueRef = useRef(wordQueue);
  const syncRef = useRef<ReturnType<typeof useMasterySync> | null>(null);
  wordQueueRef.current = wordQueue;

  // 保存缓存 - 使用 ref 避免依赖循环
  const saveCacheRef = useRef<() => void>(() => {});
  const latestAmasResultRef = useRef<AmasProcessResult | null>(null);
  const saveCache = useCallback(() => {
    if (isSeedSession) return;
    const state = wordQueueRef.current.getQueueState();
    if (!state || !syncRef.current) return;
    const amasResult = latestAmasResultRef.current;
    syncRef.current.sessionCache.saveSessionToCache({
      sessionId: currentSessionIdRef.current,
      targetMasteryCount: initialTargetCount,
      masteryThreshold: wordQueueRef.current.configRef.current.masteryThreshold,
      maxTotalQuestions: wordQueueRef.current.configRef.current.maxTotalQuestions,
      queueState: state,
      timestamp: Date.now(),
      userId: user?.id ?? null,
      amasStrategy: amasResult?.strategy
        ? {
            batchSize: amasResult.strategy.batch_size,
            difficulty: amasResult.strategy.difficulty,
            hintLevel: amasResult.strategy.hint_level,
            intervalScale: amasResult.strategy.interval_scale,
          }
        : undefined,
    });
  }, [initialTargetCount, user?.id, isSeedSession]);
  saveCacheRef.current = saveCache;

  const sync = useMasterySync({
    getSessionId: () => currentSessionIdRef.current,
    getUserId: () => user?.id,
    getQueueManager: () => wordQueueRef.current.queueManagerRef.current,
    onAmasResult: (result) => {
      setLatestAmasResult(result);
      latestAmasResultRef.current = result;
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

  endSessionRef.current = (mode) => {
    const sid = currentSessionIdRef.current;
    if (!sid || sessionStartTimeRef.current <= 0 || sessionEndedRef.current) return;

    sessionEndedRef.current = true;
    sessionStartTimeRef.current = 0;

    if (mode === 'beacon') {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      const payload = JSON.stringify({ sessionId: sid, authToken: token });
      const url = `${import.meta.env.VITE_API_URL || ''}${END_SESSION_ENDPOINT}`;

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }

      try {
        void fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        });
        return;
      } catch {
        // Fall back to async call below
      }
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
      wordQueueRef.current.queueManagerRef.current?.clearSnapshot();
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
    onQueueRollback: () => {
      wordQueueRef.current.queueManagerRef.current?.rollbackState();
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
          amasStrategy?: {
            batchSize?: number;
            difficulty?: string;
            hintLevel?: number;
            intervalScale?: number;
          };
        } | null = null;

        if (!isReset && syncRef.current && !isSeedSession) {
          const cache = syncRef.current.sessionCache.loadSessionFromCache(user?.id, sessionId);
          if (cache?.queueState?.masteredWordIds?.length || cache?.queueState?.totalQuestions) {
            // 只提取进度信息，不使用缓存的单词列表
            cachedProgress = {
              masteredWordIds: cache.queueState.masteredWordIds || [],
              totalQuestions: cache.queueState.totalQuestions || 0,
              sessionId: cache.sessionId,
              masteryThreshold: cache.masteryThreshold,
              maxTotalQuestions: cache.maxTotalQuestions,
              amasStrategy: cache.amasStrategy,
            };
          }
        }

        const seedCount = seedWords?.length ?? 0;
        const words = isSeedSession
          ? {
              words: seedWords ?? [],
              meta: {
                mode: 'custom',
                targetCount: seedCount,
                fetchCount: seedCount,
                masteryThreshold: wordQueueRef.current.configRef.current.masteryThreshold,
                maxQuestions: Math.max(
                  wordQueueRef.current.configRef.current.maxTotalQuestions,
                  seedCount * 3,
                ),
              },
            }
          : await getMasteryStudyWords(initialTargetCount);
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
          // 优先使用服务器返回的最新策略，而非缓存的旧策略
          if (words.meta.strategy) {
            wordQueueRef.current.applyStrategy({
              batchSize: words.meta.strategy.batchSize ?? words.meta.strategy.batch_size,
              difficulty: words.meta.strategy.difficulty,
              hintLevel: words.meta.strategy.hintLevel ?? words.meta.strategy.hint_level,
              intervalScale:
                words.meta.strategy.intervalScale ?? words.meta.strategy.interval_scale,
            });
          } else if (cachedProgress.amasStrategy) {
            wordQueueRef.current.applyStrategy(cachedProgress.amasStrategy);
          }
          // 恢复会话进度（mastered/totalQuestions），用于完成条件与进度展示一致
          if (cachedProgress.masteredWordIds.length > 0 || cachedProgress.totalQuestions > 0) {
            wordQueueRef.current.restoreProgressSnapshot(
              cachedProgress.masteredWordIds,
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
          if (words.meta.strategy) {
            wordQueueRef.current.applyStrategy({
              batchSize: words.meta.strategy.batchSize ?? words.meta.strategy.batch_size,
              difficulty: words.meta.strategy.difficulty,
              hintLevel: words.meta.strategy.hintLevel ?? words.meta.strategy.hint_level,
              intervalScale:
                words.meta.strategy.intervalScale ?? words.meta.strategy.interval_scale,
            });
          }
        }

        if (isMountedRef.current)
          wordQueueRef.current.updateFromManager({ consume: !cachedProgress });
      } catch (err) {
        if (isMountedRef.current) setError(err instanceof Error ? err.message : '初始化失败');
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [initialTargetCount, sessionId, user?.id, seedWords, isSeedSession],
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
    if (isSeedSession || isLoading || wordQueue.isCompleted || !syncRef.current) return;
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
    isSeedSession,
  ]);

  useEffect(() => {
    if (!wordQueue.isCompleted || sessionEndedRef.current) return;

    endSessionRef.current('async');
  }, [wordQueue.isCompleted]);

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
      endSessionRef.current('async');
    };
  }, []);

  // Actions
  const submitAnswer = useCallback(
    async (isCorrect: boolean, responseTime: number) => {
      const word = wordQueue.currentWord;
      if (!wordQueue.queueManagerRef.current || !word) return;

      setError(null);

      // 创建状态快照用于错误回滚
      wordQueue.queueManagerRef.current.snapshotState();

      // 先执行本地乐观更新
      const amasState = extractAmasState(latestAmasResult);
      sync.submitAnswerOptimistic({
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
            amasState,
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

  const advanceToNext = useCallback(() => {
    wordQueue.updateFromManager({ consume: true });
    saveCacheRef.current();
  }, [wordQueue]);

  const skipWord = useCallback(() => {
    const word = wordQueue.getCurrentWord();
    if (!word) return;
    wordQueue.skipWord(word.id);
    wordQueue.updateFromManager();
    saveCache();
  }, [wordQueue, saveCache]);

  const resetSession = useCallback(async () => {
    if (!isSeedSession) {
      sync.sessionCache.clearSessionCache();
    }
    sync.retryQueue.clearQueue();
    sync.resetSyncCounter();
    wordQueue.resetQueue();
    setHasRestoredSession(false);
    setLatestAmasResult(null);
    currentSessionIdRef.current = '';
    sessionStartTimeRef.current = 0;
    await initSession(true);
  }, [sync, wordQueue, initSession, isSeedSession]);

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
