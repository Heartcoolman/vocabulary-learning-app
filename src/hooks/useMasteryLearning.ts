import { useState, useEffect, useCallback, useRef } from 'react';
import { WordQueueManager, WordItem, QueueProgress, CompletionReason, QueueState } from '../services/learning/WordQueueManager';
import { AdaptiveQueueManager } from '../services/learning/AdaptiveQueueManager';
import apiClient from '../services/ApiClient';
import { useAuth } from '../contexts/AuthContext';
import { AmasProcessResult, AdjustReason } from '../types/amas';

export interface UseMasteryLearningOptions {
  targetMasteryCount?: number;
  sessionId?: string;
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

interface CachedSession {
  sessionId: string;
  targetMasteryCount: number;
  masteryThreshold: number;
  maxTotalQuestions: number;
  queueState: QueueState;
  timestamp: number;
  userId?: string | null;
}

const SYNC_INTERVAL = 5;
const STORAGE_KEY = 'mastery_learning_session';
const EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24小时

export function useMasteryLearning(options: UseMasteryLearningOptions = {}): UseMasteryLearningReturn {
  const { targetMasteryCount: initialTargetCount = 20, sessionId } = options;
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<CompletionReason>();
  const [currentWord, setCurrentWord] = useState<WordItem | null>(null);
  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetMasteryCount, setTargetMasteryCount] = useState(initialTargetCount);
  const [progress, setProgress] = useState<QueueProgress>({
    masteredCount: 0,
    targetCount: initialTargetCount,
    totalQuestions: 0,
    activeCount: 0,
    pendingCount: 0
  });
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);

  const queueManagerRef = useRef<WordQueueManager | null>(null);
  const adaptiveManagerRef = useRef<AdaptiveQueueManager | null>(null);
  const syncCounterRef = useRef(0);
  const currentSessionIdRef = useRef<string>(sessionId || '');
  const sessionStartTimeRef = useRef<number>(0);
  const configRef = useRef<{ masteryThreshold: number; maxTotalQuestions: number }>({
    masteryThreshold: 2,
    maxTotalQuestions: 100
  });
  const isMountedRef = useRef(true);

  const updateStateFromManager = useCallback((options: { consume?: boolean } = {}) => {
    const { consume = false } = options;
    if (!queueManagerRef.current) return;

    // 使用peek预览（不增加计数），只有consume时才真正消费
    const result = consume
      ? queueManagerRef.current.getNextWordWithReason()
      : queueManagerRef.current.peekNextWordWithReason();

    // 消费后重新获取progress，确保题数同步
    const newProgress = queueManagerRef.current.getProgress();
    setProgress(newProgress);
    setCurrentWord(result.word);

    if (result.isCompleted) {
      setIsCompleted(true);
      setCompletionReason(result.completionReason);

      // 结束习惯追踪会话
      if (currentSessionIdRef.current && sessionStartTimeRef.current > 0) {
        apiClient.endHabitSession(currentSessionIdRef.current)
          .then(() => {
            console.log('[useMasteryLearning] 习惯追踪会话已结束');
          })
          .catch(error => {
            console.warn('[useMasteryLearning] 结束习惯追踪失败:', error);
          });

        sessionStartTimeRef.current = 0;
      }
    }
  }, []);

  const saveSessionToCache = useCallback(() => {
    if (!queueManagerRef.current) return;

    const cache: CachedSession = {
      sessionId: currentSessionIdRef.current,
      targetMasteryCount,
      masteryThreshold: configRef.current.masteryThreshold,
      maxTotalQuestions: configRef.current.maxTotalQuestions,
      queueState: queueManagerRef.current.getState(),
      timestamp: Date.now(),
      userId: user?.id ?? null
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('[useMasteryLearning] 保存会话缓存失败:', e);
    }
  }, [targetMasteryCount, user?.id]);

  const syncProgress = useCallback(async () => {
    if (!queueManagerRef.current) return;

    try {
      const currentProgress = queueManagerRef.current.getProgress();
      await apiClient.syncMasteryProgress({
        sessionId: currentSessionIdRef.current,
        actualMasteryCount: currentProgress.masteredCount,
        totalQuestions: currentProgress.totalQuestions
      });
    } catch (error) {
      console.error('[useMasteryLearning] 同步进度失败:', error);
    }
  }, []);

  const triggerQueueAdjustment = useCallback((reason: AdjustReason) => {
    if (!currentSessionIdRef.current || !queueManagerRef.current || !adaptiveManagerRef.current) return;

    const params = {
      sessionId: currentSessionIdRef.current,
      currentWordIds: queueManagerRef.current.getCurrentWordIds(),
      masteredWordIds: queueManagerRef.current.getMasteredWordIds(),
      userState: latestAmasResult?.state ? {
        fatigue: latestAmasResult.state.fatigue,
        attention: latestAmasResult.state.attention,
        motivation: latestAmasResult.state.motivation
      } : undefined,
      recentPerformance: adaptiveManagerRef.current.getRecentPerformance(),
      adjustReason: reason
    };

    // Fire and forget - 不阻塞答题流程
    apiClient.adjustLearningWords(params)
      .then(response => {
        if (queueManagerRef.current && adaptiveManagerRef.current && isMountedRef.current) {
          queueManagerRef.current.applyAdjustments(response.adjustments);
          saveSessionToCache();
          adaptiveManagerRef.current.resetCounter();
          console.log(`[useMasteryLearning] 队列已调整: ${reason}, 原因: ${response.reason}`);
        }
      })
      .catch(err => {
        console.warn('[useMasteryLearning] 队列调整失败:', err);
      });
  }, [latestAmasResult, saveSessionToCache]);

  // 按需加载：当队列剩余单词 <= 2 时补充
  const isFetchingRef = useRef(false);
  const fetchMoreWords = useCallback(async () => {
    if (!currentSessionIdRef.current || !queueManagerRef.current || isFetchingRef.current) return;
    if (isCompleted) return;

    const activeCount = progress.activeCount + progress.pendingCount;
    if (activeCount > 2) return;

    isFetchingRef.current = true;
    try {
      const result = await apiClient.getNextWords({
        currentWordIds: queueManagerRef.current.getCurrentWordIds(),
        masteredWordIds: queueManagerRef.current.getMasteredWordIds(),
        sessionId: currentSessionIdRef.current,
        count: 3
      });

      if (!isMountedRef.current || !queueManagerRef.current) return;

      if (result.words.length > 0) {
        // 将新单词添加到队列
        queueManagerRef.current.applyAdjustments({
          remove: [],
          add: result.words.map(w => ({
            ...w,
            audioUrl: w.audioUrl || undefined
          }))
        });
        setAllWords(prev => [...prev, ...result.words.map(w => ({
          ...w,
          audioUrl: w.audioUrl || undefined
        }))]);
        saveSessionToCache();
        console.log(`[useMasteryLearning] 按需补充${result.words.length}个单词: ${result.reason}`);
      }
    } catch (err) {
      console.warn('[useMasteryLearning] 按需加载单词失败:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [progress.activeCount, progress.pendingCount, isCompleted, saveSessionToCache]);

  useEffect(() => {
    // 重新挂载时重置为 true（修复组件重新挂载后初始化失效的问题）
    isMountedRef.current = true;

    const initSession = async () => {
      setIsLoading(true);
      setError(null); // 清除之前的错误
      try {
        const cachedData = localStorage.getItem(STORAGE_KEY);
        let restored = false;

        if (cachedData) {
          try {
            const cache: CachedSession = JSON.parse(cachedData);
            const cacheUserId = cache.userId ?? null;
            const currentUserId = user?.id ?? null;

            // 检查用户是否匹配（防止跨账户泄漏）
            const isUserMismatch = cacheUserId !== currentUserId;
            const isExpired = Date.now() - cache.timestamp > EXPIRY_TIME;
            const isSameSession = !sessionId || cache.sessionId === sessionId;

            if (isUserMismatch) {
              // 用户不匹配，清除缓存
              console.log('[useMasteryLearning] 用户不匹配，清除缓存');
              localStorage.removeItem(STORAGE_KEY);
            } else if (!isExpired && isSameSession && cache.queueState?.words?.length > 0) {
              configRef.current = {
                masteryThreshold: cache.masteryThreshold || 2,
                maxTotalQuestions: cache.maxTotalQuestions || 100
              };

              const manager = new WordQueueManager(cache.queueState.words, {
                targetMasteryCount: cache.targetMasteryCount,
                masteryThreshold: configRef.current.masteryThreshold,
                maxTotalQuestions: configRef.current.maxTotalQuestions
              });

              manager.restoreState(cache.queueState);

              queueManagerRef.current = manager;
              adaptiveManagerRef.current = new AdaptiveQueueManager();
              currentSessionIdRef.current = cache.sessionId;
              setAllWords(cache.queueState.words);
              setHasRestoredSession(true);
              restored = true;

              console.log('[useMasteryLearning] 成功恢复会话:', cache.sessionId);
            } else if (isExpired || !isSameSession) {
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch (e) {
            console.error('[useMasteryLearning] 解析缓存失败:', e);
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        if (!restored) {
          const wordsResponse = await apiClient.getMasteryStudyWords(initialTargetCount);

          if (!isMountedRef.current) return;

          // 使用后端返回的targetCount，确保前后端一致
          const serverTargetCount = wordsResponse.meta.targetCount;
          if (serverTargetCount !== initialTargetCount) {
            console.log(
              `[useMasteryLearning] 使用服务端targetCount: ${serverTargetCount} (前端传入: ${initialTargetCount})`
            );
            setTargetMasteryCount(serverTargetCount);
          }

          const sessionResponse = await apiClient.createMasterySession(serverTargetCount);

          if (!isMountedRef.current) return;

          if (sessionResponse?.sessionId) {
            currentSessionIdRef.current = sessionResponse.sessionId;
            sessionStartTimeRef.current = Date.now();
          }

          configRef.current = {
            masteryThreshold: wordsResponse.meta.masteryThreshold,
            maxTotalQuestions: wordsResponse.meta.maxQuestions
          };

          setAllWords(wordsResponse.words);

          queueManagerRef.current = new WordQueueManager(wordsResponse.words, {
            targetMasteryCount: serverTargetCount,
            masteryThreshold: configRef.current.masteryThreshold,
            maxTotalQuestions: configRef.current.maxTotalQuestions
          });

          adaptiveManagerRef.current = new AdaptiveQueueManager();

          console.log(
            `[useMasteryLearning] 创建新会话: ${currentSessionIdRef.current}, ` +
            `获取${wordsResponse.words.length}个单词, 目标=${serverTargetCount}`
          );
        }

        if (isMountedRef.current) {
          // 恢复会话用peek（已有计数），新会话用consume（首题计数）
          updateStateFromManager({ consume: !restored });
        }

      } catch (error) {
        console.error('[useMasteryLearning] 初始化失败:', error);
        if (isMountedRef.current) {
          setError(error instanceof Error ? error.message : '初始化失败，请刷新重试');
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initSession();

    return () => {
      isMountedRef.current = false;
    };
  }, [initialTargetCount, sessionId, updateStateFromManager, user?.id]);

  // 按需加载触发器：当队列剩余单词 <= 2 时自动补充
  useEffect(() => {
    if (isLoading || isCompleted) return;

    const activeCount = progress.activeCount + progress.pendingCount;
    if (activeCount <= 2) {
      fetchMoreWords();
    }
  }, [progress.activeCount, progress.pendingCount, isLoading, isCompleted, fetchMoreWords]);

  const submitAnswer = useCallback(async (isCorrect: boolean, responseTime: number) => {
    if (!queueManagerRef.current || !currentWord) return;

    try {
      setError(null); // 清除之前的错误
      try {
        const amasResult = await apiClient.processLearningEvent({
          wordId: currentWord.id,
          isCorrect,
          responseTime,
          sessionId: currentSessionIdRef.current,
          timestamp: Date.now()
        });

        if (!isMountedRef.current) return;

        setLatestAmasResult(amasResult);

        queueManagerRef.current.recordAnswer(
          currentWord.id,
          isCorrect,
          responseTime,
          amasResult.wordMasteryDecision
        );
      } catch (e) {
        console.warn('[useMasteryLearning] AMAS调用失败,使用本地判定:', e);

        if (!isMountedRef.current) return;

        setLatestAmasResult(null);
        queueManagerRef.current.recordAnswer(
          currentWord.id,
          isCorrect,
          responseTime,
          undefined
        );
      }

      // 自适应队列检查
      if (adaptiveManagerRef.current) {
        const { should, reason } = adaptiveManagerRef.current.onAnswerSubmitted(
          isCorrect,
          responseTime,
          latestAmasResult?.state ? {
            fatigue: latestAmasResult.state.fatigue,
            attention: latestAmasResult.state.attention,
            motivation: latestAmasResult.state.motivation
          } : undefined
        );

        if (should && reason) {
          triggerQueueAdjustment(reason);
        }
      }

      // 不立即更新到下一题，等待用户点击"下一题"按钮
      saveSessionToCache();

      syncCounterRef.current += 1;
      if (syncCounterRef.current >= SYNC_INTERVAL) {
        syncProgress();
        syncCounterRef.current = 0;
      }

    } catch (error) {
      console.error('[useMasteryLearning] 提交答案失败:', error);
      if (isMountedRef.current) {
        setError(error instanceof Error ? error.message : '提交答案失败，请重试');
      }
    }
  }, [currentWord, saveSessionToCache, syncProgress, latestAmasResult, triggerQueueAdjustment]);

  const advanceToNext = useCallback(() => {
    updateStateFromManager({ consume: true });
  }, [updateStateFromManager]);

  const skipWord = useCallback(() => {
    if (!queueManagerRef.current || !currentWord) return;

    queueManagerRef.current.skipWord(currentWord.id);
    updateStateFromManager();
    saveSessionToCache();
  }, [currentWord, updateStateFromManager, saveSessionToCache]);

  const resetSession = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    setHasRestoredSession(false);
    setIsCompleted(false);
    syncCounterRef.current = 0;

    queueManagerRef.current = null;
    setIsLoading(true);

    window.location.reload();
  }, []);

  return {
    currentWord,
    isLoading,
    isCompleted,
    completionReason,
    progress,
    submitAnswer,
    advanceToNext,
    skipWord,
    resetSession,
    hasRestoredSession,
    allWords,
    error,
    latestAmasResult
  };
}
