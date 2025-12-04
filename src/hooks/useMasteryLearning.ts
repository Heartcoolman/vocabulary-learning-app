import { useState, useEffect, useCallback, useRef } from 'react';
import { WordQueueManager, WordItem, QueueProgress, CompletionReason, QueueState } from '../services/learning/WordQueueManager';
import { AdaptiveQueueManager } from '../services/learning/AdaptiveQueueManager';
import apiClient from '../services/ApiClient';
import { useAuth } from '../contexts/AuthContext';
import { AmasProcessResult, AdjustReason } from '../types/amas';
import { learningLogger } from '../utils/logger';

export interface UseMasteryLearningOptions {
  targetMasteryCount?: number;
  sessionId?: string;
  /** 获取当前对话框暂停时间的函数（毫秒） */
  getDialogPausedTime?: () => number;
  /** 重置对话框暂停时间的函数 */
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
  const {
    targetMasteryCount: initialTargetCount = 20,
    sessionId,
    getDialogPausedTime,
    resetDialogPausedTime
  } = options;
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
            learningLogger.info('习惯追踪会话已结束');
          })
          .catch(error => {
            learningLogger.warn({ err: error }, '结束习惯追踪失败');
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
      learningLogger.error({ err: e }, '保存会话缓存失败');
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
      learningLogger.error({ err: error }, '同步进度失败');
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
          learningLogger.info({ reason, responseReason: response.reason }, '队列已调整');
        }
      })
      .catch(err => {
        learningLogger.warn({ err }, '队列调整失败');
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
        learningLogger.info({ count: result.words.length, reason: result.reason }, '按需补充单词');
      }
    } catch (err) {
      learningLogger.warn({ err }, '按需加载单词失败');
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
              learningLogger.info('用户不匹配，清除缓存');
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

              learningLogger.info({ sessionId: cache.sessionId }, '成功恢复会话');
            } else if (isExpired || !isSameSession) {
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch (e) {
            learningLogger.error({ err: e }, '解析缓存失败');
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        if (!restored) {
          const wordsResponse = await apiClient.getMasteryStudyWords(initialTargetCount);

          if (!isMountedRef.current) return;

          // 使用后端返回的targetCount，确保前后端一致
          const serverTargetCount = wordsResponse.meta.targetCount;
          if (serverTargetCount !== initialTargetCount) {
            learningLogger.info(
              { serverTargetCount, clientTargetCount: initialTargetCount },
              '使用服务端targetCount'
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

          learningLogger.info(
            {
              sessionId: currentSessionIdRef.current,
              wordCount: wordsResponse.words.length,
              target: serverTargetCount
            },
            '创建新会话'
          );
        }

        if (isMountedRef.current) {
          // 恢复会话用peek（已有计数），新会话用consume（首题计数）
          updateStateFromManager({ consume: !restored });
        }

      } catch (error) {
        learningLogger.error({ err: error }, '初始化失败');
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

  // 重试队列：存储失败的AMAS请求
  const retryQueueRef = useRef<Array<{
    wordId: string;
    isCorrect: boolean;
    responseTime: number;
    timestamp: number;
    retryCount: number;
  }>>([]);

  // 处理重试队列
  const processRetryQueue = useCallback(async () => {
    if (retryQueueRef.current.length === 0) return;

    const item = retryQueueRef.current[0];
    if (item.retryCount >= 3) {
      // 超过重试次数，丢弃
      retryQueueRef.current.shift();
      learningLogger.warn({ wordId: item.wordId }, 'AMAS请求重试次数超限，已丢弃');
      return;
    }

    try {
      await apiClient.processLearningEvent({
        wordId: item.wordId,
        isCorrect: item.isCorrect,
        responseTime: item.responseTime,
        sessionId: currentSessionIdRef.current,
        timestamp: item.timestamp
      });
      // 成功，移除队列
      retryQueueRef.current.shift();
    } catch {
      // 失败，增加重试次数
      item.retryCount += 1;
    }
  }, []);

  // 定期处理重试队列
  useEffect(() => {
    const interval = setInterval(() => {
      if (retryQueueRef.current.length > 0) {
        processRetryQueue();
      }
    }, 5000); // 每5秒重试一次

    return () => clearInterval(interval);
  }, [processRetryQueue]);

  const submitAnswer = useCallback(async (isCorrect: boolean, responseTime: number) => {
    if (!queueManagerRef.current || !currentWord) return;

    setError(null);
    const timestamp = Date.now();
    const wordId = currentWord.id;

    // ============ 乐观更新：立即更新本地状态 ============
    // 使用本地判定逻辑快速响应用户
    const localMasteryDecision = {
      isMastered: isCorrect && responseTime < 3000, // 快速正确响应视为掌握信号
      confidence: isCorrect ? 0.6 : 0.3,
      suggestedRepeats: isCorrect ? 1 : 3
    };

    // 立即更新队列状态（乐观）
    queueManagerRef.current.recordAnswer(
      wordId,
      isCorrect,
      responseTime,
      localMasteryDecision
    );

    // 立即更新UI显示
    const newProgress = queueManagerRef.current.getProgress();
    setProgress(newProgress);

    // 立即保存缓存
    saveSessionToCache();

    // 自适应队列检查（使用上一次的AMAS状态，如果有的话）
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

    // 同步计数
    syncCounterRef.current += 1;
    if (syncCounterRef.current >= SYNC_INTERVAL) {
      syncProgress();
      syncCounterRef.current = 0;
    }

    // ============ 异步同步到服务器（不阻塞UI） ============
    // 获取对话框暂停时间并重置（用于AMAS疲劳度计算）
    const pausedTimeMs = getDialogPausedTime?.() ?? 0;
    if (pausedTimeMs > 0 && resetDialogPausedTime) {
      resetDialogPausedTime();
    }

    apiClient.processLearningEvent({
      wordId,
      isCorrect,
      responseTime,
      sessionId: currentSessionIdRef.current,
      timestamp,
      pausedTimeMs // 传递暂停时间给后端
    })
      .then(amasResult => {
        if (!isMountedRef.current) return;

        // 更新AMAS结果供后续使用
        setLatestAmasResult(amasResult);

        // 如果服务端判定与本地不同，可选择更新
        // 这里我们保持乐观更新的结果，但记录差异
        if (amasResult.wordMasteryDecision?.isMastered !== localMasteryDecision.isMastered) {
          learningLogger.debug(
            {
              local: localMasteryDecision.isMastered,
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
        retryQueueRef.current.push({
          wordId,
          isCorrect,
          responseTime,
          timestamp,
          retryCount: 0
        });
      });

  }, [currentWord, saveSessionToCache, syncProgress, latestAmasResult, triggerQueueAdjustment, getDialogPausedTime, resetDialogPausedTime]);

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
