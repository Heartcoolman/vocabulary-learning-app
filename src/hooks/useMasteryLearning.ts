import { useState, useEffect, useCallback, useRef } from 'react';
import { WordItem, QueueProgress, CompletionReason } from '../services/learning/WordQueueManager';
import { useAuth } from '../contexts/AuthContext';
import { AmasProcessResult } from '../types/amas';
import {
  useWordQueue,
  useMasterySync,
  getMasteryStudyWords,
  createMasterySession,
  endHabitSession
} from './mastery';

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
}

// 辅助函数：提取 AMAS 状态
const extractAmasState = (result: AmasProcessResult | null) =>
  result?.state ? { fatigue: result.state.fatigue, attention: result.state.attention, motivation: result.state.motivation } : undefined;

export function useMasteryLearning(options: UseMasteryLearningOptions = {}): UseMasteryLearningReturn {
  const { targetMasteryCount: initialTargetCount = 20, sessionId, getDialogPausedTime, resetDialogPausedTime } = options;
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
  const sync = useMasterySync({
    getSessionId: () => currentSessionIdRef.current,
    getUserId: () => user?.id,
    getQueueManager: () => wordQueue.queueManagerRef.current,
    onAmasResult: setLatestAmasResult,
    onQueueAdjusted: () => { saveCache(); wordQueue.resetAdaptiveCounter(); }
  });

  // 保存缓存
  const saveCache = useCallback(() => {
    const state = wordQueue.getQueueState();
    if (!state) return;
    sync.sessionCache.saveSessionToCache({
      sessionId: currentSessionIdRef.current,
      targetMasteryCount: initialTargetCount,
      masteryThreshold: wordQueue.configRef.current.masteryThreshold,
      maxTotalQuestions: wordQueue.configRef.current.maxTotalQuestions,
      queueState: state,
      timestamp: Date.now(),
      userId: user?.id ?? null
    });
  }, [initialTargetCount, user?.id, sync.sessionCache, wordQueue]);

  // 初始化会话
  const initSession = useCallback(async (isReset = false) => {
    setIsLoading(true);
    setError(null);
    try {
      let restored = false;
      if (!isReset) {
        const cache = sync.sessionCache.loadSessionFromCache(user?.id, sessionId);
        if (cache?.queueState?.words?.length) {
          wordQueue.restoreQueue(cache.queueState.words, cache.queueState, { masteryThreshold: cache.masteryThreshold, maxTotalQuestions: cache.maxTotalQuestions });
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
        wordQueue.initializeQueue(words.words, { masteryThreshold: words.meta.masteryThreshold, maxTotalQuestions: words.meta.maxQuestions });
      }
      if (isMountedRef.current) wordQueue.updateFromManager({ consume: !restored });
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '初始化失败');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [initialTargetCount, sessionId, user?.id, sync.sessionCache, wordQueue]);

  // Effects
  useEffect(() => {
    const curr = user?.id ?? null, prev = prevUserIdRef.current ?? null;
    if (prev !== null && curr !== null && prev !== curr) {
      sync.sessionCache.clearSessionCache();
      wordQueue.resetQueue();
      setHasRestoredSession(false);
    }
    prevUserIdRef.current = curr ?? undefined;
  }, [user?.id, sync.sessionCache, wordQueue]);

  useEffect(() => { isMountedRef.current = true; initSession(); return () => { isMountedRef.current = false; }; }, [initSession]);

  useEffect(() => {
    if (isLoading || wordQueue.isCompleted) return;
    sync.fetchMoreWordsIfNeeded(wordQueue.progress.activeCount, wordQueue.progress.pendingCount, wordQueue.isCompleted)
      .then(words => { if (words.length) { wordQueue.addWords(words); saveCache(); } });
  }, [wordQueue.progress.activeCount, wordQueue.progress.pendingCount, isLoading, wordQueue.isCompleted, sync, saveCache, wordQueue]);

  useEffect(() => {
    if (wordQueue.isCompleted && currentSessionIdRef.current && sessionStartTimeRef.current > 0) {
      endHabitSession(currentSessionIdRef.current).catch(() => {});
      sessionStartTimeRef.current = 0;
    }
  }, [wordQueue.isCompleted]);

  // Actions
  const submitAnswer = useCallback(async (isCorrect: boolean, responseTime: number) => {
    const word = wordQueue.getCurrentWord();
    if (!wordQueue.queueManagerRef.current || !word) return;
    setError(null);
    const amasState = extractAmasState(latestAmasResult);
    const localDecision = sync.submitAnswerOptimistic({ wordId: word.id, isCorrect, responseTime, latestAmasState: amasState });
    saveCache();
    const adaptive = wordQueue.adaptiveManagerRef.current;
    if (adaptive) {
      const { should, reason } = adaptive.onAnswerSubmitted(isCorrect, responseTime, amasState);
      if (should && reason) sync.triggerQueueAdjustment(reason, adaptive.getRecentPerformance());
    }
    const pausedTimeMs = getDialogPausedTime?.() ?? 0;
    if (pausedTimeMs > 0) resetDialogPausedTime?.();
    sync.syncAnswerToServer({ wordId: word.id, isCorrect, responseTime, pausedTimeMs, latestAmasState: amasState }, localDecision);
  }, [wordQueue, latestAmasResult, sync, saveCache, getDialogPausedTime, resetDialogPausedTime]);

  const advanceToNext = useCallback(() => wordQueue.updateFromManager({ consume: true }), [wordQueue]);

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
    latestAmasResult
  };
}
