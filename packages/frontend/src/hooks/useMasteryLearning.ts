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
const MAX_RETRY_QUEUE_SIZE = 20; // 重试队列最大大小

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

  // 请求序列号，用于确保响应顺序处理
  const requestSequenceRef = useRef(0);
  const lastProcessedSequenceRef = useRef(0);

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

  // 跟踪上一次的userId，用于检测用户切换
  const prevUserIdRef = useRef<string | null | undefined>(user?.id);

  // 用户变化时清除缓存（分离到单独useEffect，避免触发完整重新初始化）
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current ?? null;

    if (prevUserId !== null && currentUserId !== null && prevUserId !== currentUserId) {
      // 用户切换，清除缓存
      learningLogger.info({ prevUserId, currentUserId }, '用户切换，清除会话缓存');
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        learningLogger.warn({ err: e }, '清除会话缓存失败');
      }
      // 重置状态以触发重新初始化
      queueManagerRef.current = null;
      adaptiveManagerRef.current = null;
      setHasRestoredSession(false);
    }

    prevUserIdRef.current = currentUserId;
  }, [user?.id]);

  useEffect(() => {
    // 重新挂载时重置为 true（修复组件重新挂载后初始化失效的问题）
    isMountedRef.current = true;

    const initSession = async () => {
      setIsLoading(true);
      setError(null); // 清除之前的错误
      try {
        let cachedData: string | null = null;
        try {
          cachedData = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
          learningLogger.warn({ err: e }, '读取localStorage失败');
        }

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
              try {
                localStorage.removeItem(STORAGE_KEY);
              } catch (e) {
                learningLogger.warn({ err: e }, '删除localStorage失败');
              }
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
              try {
                localStorage.removeItem(STORAGE_KEY);
              } catch (e) {
                learningLogger.warn({ err: e }, '删除过期localStorage失败');
              }
            }
          } catch (e) {
            learningLogger.error({ err: e }, '解析缓存失败');
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch (removeErr) {
              learningLogger.warn({ err: removeErr }, '删除损坏的localStorage失败');
            }
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
  }, [initialTargetCount, sessionId, updateStateFromManager]);

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

  // 处理重试队列的函数（使用ref存储最新引用，避免interval重复创建）
  const processRetryQueueRef = useRef<() => Promise<void>>();
  processRetryQueueRef.current = async () => {
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
  };

  // 定期处理重试队列（空依赖数组确保只创建一次interval）
  useEffect(() => {
    const interval = setInterval(() => {
      if (retryQueueRef.current.length > 0 && processRetryQueueRef.current) {
        processRetryQueueRef.current();
      }
    }, 5000); // 每5秒重试一次

    return () => clearInterval(interval);
  }, []); // 空依赖数组，只在挂载时创建一次interval

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

    // 分配请求序列号，用于确保响应顺序处理
    const currentSequence = ++requestSequenceRef.current;

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

        // 只处理比上次处理的序号更大的响应（防止乱序）
        if (currentSequence <= lastProcessedSequenceRef.current) {
          learningLogger.debug(
            { currentSequence, lastProcessed: lastProcessedSequenceRef.current },
            '跳过过期的AMAS响应'
          );
          return;
        }
        lastProcessedSequenceRef.current = currentSequence;

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

        // 入队重试，但检查队列大小限制
        if (retryQueueRef.current.length >= MAX_RETRY_QUEUE_SIZE) {
          // 移除最旧的重试项
          const removed = retryQueueRef.current.shift();
          learningLogger.warn({ removedWordId: removed?.wordId }, '重试队列已满，移除最旧项');
        }

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
    // 清除本地存储的会话
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      learningLogger.warn({ err: e }, '重置时清除localStorage失败');
    }

    // 重置所有状态
    setHasRestoredSession(false);
    setIsCompleted(false);
    setCompletionReason(undefined);
    setCurrentWord(null);
    setAllWords([]);
    setError(null);
    setLatestAmasResult(null);
    setProgress({
      masteredCount: 0,
      targetCount: initialTargetCount,
      totalQuestions: 0,
      activeCount: 0,
      pendingCount: 0
    });

    // 重置引用
    syncCounterRef.current = 0;
    queueManagerRef.current = null;
    adaptiveManagerRef.current = null;
    currentSessionIdRef.current = '';
    sessionStartTimeRef.current = 0;
    retryQueueRef.current = [];
    isFetchingRef.current = false;
    requestSequenceRef.current = 0;
    lastProcessedSequenceRef.current = 0;

    // 重新初始化会话
    setIsLoading(true);
    try {
      const wordsResponse = await apiClient.getMasteryStudyWords(initialTargetCount);

      if (!isMountedRef.current) return;

      const serverTargetCount = wordsResponse.meta.targetCount;
      if (serverTargetCount !== initialTargetCount) {
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
        '重置后创建新会话'
      );

      if (isMountedRef.current) {
        updateStateFromManager({ consume: true });
      }
    } catch (error) {
      learningLogger.error({ err: error }, '重置会话失败');
      if (isMountedRef.current) {
        setError(error instanceof Error ? error.message : '重置会话失败，请重试');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [initialTargetCount, updateStateFromManager]);

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
