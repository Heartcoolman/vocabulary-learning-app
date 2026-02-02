/**
 * Mastery Learning Hooks and API Functions
 *
 * 提供掌握模式学习相关的 hooks 和 API 调用函数
 */

import { useState, useCallback, useRef } from 'react';
import { learningClient, amasClient } from '../services/client';
import {
  WordItem,
  QueueProgress,
  WordQueueManager,
  CompletionReason,
  NextWordResult,
} from '../services/learning/WordQueueManager';
import { AmasProcessResult, LearningEventInput, AdjustWordsParams } from '../types/amas';
import { learningLogger } from '../utils/logger';

// ==================== API Functions ====================

/**
 * 获取掌握模式的学习单词
 */
export async function getMasteryStudyWords(targetCount?: number) {
  return learningClient.getMasteryStudyWords(targetCount);
}

/**
 * 创建掌握学习会话
 */
export async function createMasterySession(targetMasteryCount: number) {
  return learningClient.createMasterySession(targetMasteryCount);
}

/**
 * 结束学习会话并持久化习惯画像
 */
export async function endHabitSession(sessionId: string) {
  return amasClient.endHabitSession(sessionId);
}

/**
 * 同步学习进度
 */
export async function syncMasteryProgress(data: {
  sessionId: string;
  actualMasteryCount: number;
  totalQuestions: number;
}) {
  return learningClient.syncMasteryProgress(data);
}

/**
 * 动态获取下一批学习单词
 */
export async function getNextWords(params: {
  currentWordIds: string[];
  masteredWordIds: string[];
  sessionId: string;
  count?: number;
}) {
  return learningClient.getNextWords(params);
}

/**
 * 动态调整学习单词队列
 */
export async function adjustLearningWords(params: AdjustWordsParams) {
  return learningClient.adjustLearningWords(params);
}

/**
 * 处理学习事件
 */
export async function processLearningEvent(eventData: LearningEventInput) {
  return amasClient.processLearningEvent(eventData);
}

/**
 * 发送会话中止（quit）事件
 * 用于通知 AMAS 引擎用户主动退出会话，触发 MDS 动机动力学更新
 */
export async function sendQuitEvent(sessionId: string, lastWordId?: string) {
  // Use nil UUID if no word ID available (user quit before answering)
  const wordId = lastWordId || '00000000-0000-0000-0000-000000000000';
  return amasClient.processLearningEvent({
    wordId,
    isCorrect: false,
    responseTime: 0,
    sessionId,
    isQuit: true,
  });
}

// ==================== Session Cache ====================

interface SessionCacheData {
  sessionId: string;
  targetMasteryCount: number;
  masteryThreshold: number;
  maxTotalQuestions: number;
  queueState: {
    words: WordItem[];
    currentIndex: number;
    progress: QueueProgress;
    // 用于会话恢复的额外信息
    masteredWordIds?: string[];
    totalQuestions?: number;
  };
  timestamp: number;
  userId: string | null;
  // AMAS 策略参数（用于跨会话恢复）
  amasStrategy?: {
    batchSize?: number;
    difficulty?: string;
    hintLevel?: number;
    intervalScale?: number;
  };
}

const SESSION_CACHE_KEY = 'mastery_session_cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 小时

/**
 * Session Cache Hook
 */
export function useSessionCache() {
  const saveSessionToCache = useCallback((data: SessionCacheData) => {
    try {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      learningLogger.warn({ err: e }, '[SessionCache] Failed to save session to cache');
    }
  }, []);

  const loadSessionFromCache = useCallback(
    (userId?: string, sessionId?: string): SessionCacheData | null => {
      try {
        const cached = localStorage.getItem(SESSION_CACHE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached) as SessionCacheData;

        // 检查缓存是否过期
        if (Date.now() - data.timestamp > CACHE_MAX_AGE_MS) {
          localStorage.removeItem(SESSION_CACHE_KEY);
          return null;
        }

        // 检查用户是否匹配
        if (userId && data.userId && data.userId !== userId) {
          return null;
        }

        // 检查会话 ID 是否匹配
        if (sessionId && data.sessionId !== sessionId) {
          return null;
        }

        return data;
      } catch (e) {
        learningLogger.warn({ err: e }, '[SessionCache] Failed to load session from cache');
        return null;
      }
    },
    [],
  );

  const clearSessionCache = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_CACHE_KEY);
    } catch (e) {
      learningLogger.warn({ err: e }, '[SessionCache] Failed to clear session cache');
    }
  }, []);

  return {
    saveSessionToCache,
    loadSessionFromCache,
    clearSessionCache,
  };
}

// ==================== Retry Queue ====================

interface RetryItem {
  id: string;
  action: () => Promise<void>;
  retryCount: number;
  maxRetries: number;
}

/**
 * Retry Queue Hook
 */
export function useRetryQueue() {
  const queueRef = useRef<RetryItem[]>([]);
  const isProcessingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;

    isProcessingRef.current = true;

    while (queueRef.current.length > 0) {
      const item = queueRef.current[0];

      try {
        await item.action();
        queueRef.current.shift();
      } catch {
        item.retryCount++;
        if (item.retryCount >= item.maxRetries) {
          learningLogger.warn({ itemId: item.id }, '[RetryQueue] Max retries reached');
          queueRef.current.shift();
        } else {
          // 指数退避
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, item.retryCount) * 1000));
        }
      }
    }

    isProcessingRef.current = false;
  }, []);

  const addToQueue = useCallback(
    (item: Omit<RetryItem, 'retryCount'>) => {
      queueRef.current.push({ ...item, retryCount: 0 });
      processQueue();
    },
    [processQueue],
  );

  const clearQueue = useCallback(() => {
    queueRef.current = [];
  }, []);

  return {
    addToQueue,
    clearQueue,
    getQueueLength: () => queueRef.current.length,
  };
}

// ==================== Word Queue Hook ====================

interface WordQueueConfig {
  masteryThreshold: number;
  maxTotalQuestions: number;
}

interface UseWordQueueOptions {
  targetMasteryCount?: number;
}

/**
 * Word Queue Hook
 * 管理学习单词队列
 */
export function useWordQueue(options: UseWordQueueOptions = {}) {
  const { targetMasteryCount = 20 } = options;

  const [currentWord, setCurrentWord] = useState<WordItem | null>(null);
  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<CompletionReason | undefined>();
  const [progress, setProgress] = useState<QueueProgress>({
    masteredCount: 0,
    activeCount: 0,
    pendingCount: 0,
    totalQuestions: 0,
    targetCount: targetMasteryCount,
  });

  const queueManagerRef = useRef<WordQueueManager | null>(null);
  const configRef = useRef<WordQueueConfig>({
    masteryThreshold: 2,
    maxTotalQuestions: 100,
  });

  const initializeQueue = useCallback(
    (words: WordItem[], config?: Partial<WordQueueConfig & { targetMasteryCount?: number }>) => {
      if (config) {
        const { targetMasteryCount: configTargetCount, ...restConfig } = config;
        configRef.current = { ...configRef.current, ...restConfig };
        // 如果服务端提供了 targetMasteryCount，更新 progress 中的 targetCount
        if (configTargetCount !== undefined) {
          setProgress((prev) => ({ ...prev, targetCount: configTargetCount }));
        }
      }

      // 使用配置中的 targetMasteryCount（如果有），否则使用默认值
      const effectiveTargetCount = config?.targetMasteryCount ?? targetMasteryCount;

      queueManagerRef.current = new WordQueueManager(words, {
        masteryThreshold: configRef.current.masteryThreshold,
        maxTotalQuestions: configRef.current.maxTotalQuestions,
        targetMasteryCount: effectiveTargetCount,
      });

      setAllWords(words);
      setIsCompleted(false);
      setCompletionReason(undefined);
    },
    [targetMasteryCount],
  );

  const restoreQueue = useCallback(
    (words: WordItem[], state: { progress: QueueProgress }, config?: Partial<WordQueueConfig>) => {
      if (config) {
        configRef.current = { ...configRef.current, ...config };
      }

      queueManagerRef.current = new WordQueueManager(words, {
        masteryThreshold: configRef.current.masteryThreshold,
        maxTotalQuestions: configRef.current.maxTotalQuestions,
        targetMasteryCount,
      });

      setAllWords(words);
      setProgress(state.progress);
      setIsCompleted(false);
      setCompletionReason(undefined);
    },
    [targetMasteryCount],
  );

  const updateFromManager = useCallback((options?: { consume?: boolean }) => {
    const manager = queueManagerRef.current;
    if (!manager) return;

    // 使用 getNextWordWithReason 来获取下一个单词和完成状态
    const result: NextWordResult = options?.consume
      ? manager.getNextWordWithReason({ consume: true })
      : manager.peekNextWordWithReason();

    const prog = manager.getProgress();

    setCurrentWord(result.word);
    setProgress(prog);
    setIsCompleted(result.isCompleted);
    setCompletionReason(result.completionReason);
  }, []);

  const getCurrentWord = useCallback(() => {
    const manager = queueManagerRef.current;
    if (!manager) return null;
    // 使用 peek 模式预览下一个单词，不消费
    return manager.peekNextWordWithReason().word;
  }, []);

  const getQueueState = useCallback(() => {
    const manager = queueManagerRef.current;
    if (!manager) return null;

    const fullState = manager.getState();
    return {
      words: allWords,
      currentIndex: 0,
      progress: manager.getProgress(),
      // 额外的恢复信息
      masteredWordIds: fullState.masteredWordIds,
      totalQuestions: fullState.totalQuestions,
    };
  }, [allWords]);

  const addWords = useCallback((words: WordItem[]) => {
    const manager = queueManagerRef.current;
    if (!manager) return;

    // 使用 applyAdjustments 来添加新单词
    manager.applyAdjustments({ remove: [], add: words });
    setAllWords((prev) => [...prev, ...words]);
  }, []);

  const skipWord = useCallback((wordId: string) => {
    const manager = queueManagerRef.current;
    if (!manager) return;

    manager.skipWord(wordId);
  }, []);

  const resetQueue = useCallback(() => {
    queueManagerRef.current = null;
    setCurrentWord(null);
    setAllWords([]);
    setIsCompleted(false);
    setCompletionReason(undefined);
    setProgress({
      masteredCount: 0,
      activeCount: 0,
      pendingCount: 0,
      totalQuestions: 0,
      targetCount: targetMasteryCount,
    });
  }, [targetMasteryCount]);

  /**
   * 恢复会话进度（用于页面刷新/返回时恢复进度）
   * - 写入 WordQueueManager 的 masteredWords/totalQuestions
   * - 同步更新前端 progress 显示
   */
  const restoreProgressSnapshot = useCallback(
    (masteredWordIds: string[], totalQuestions: number) => {
      const manager = queueManagerRef.current;
      if (manager) {
        manager.restoreProgressSnapshot(masteredWordIds, totalQuestions);
        setProgress(manager.getProgress());
        return;
      }

      setProgress((prev) => ({
        ...prev,
        masteredCount: masteredWordIds.length,
        totalQuestions,
      }));
    },
    [],
  );

  const applyStrategy = useCallback(
    (strategy: {
      batchSize?: number;
      difficulty?: string;
      hintLevel?: number;
      intervalScale?: number;
    }) => {
      const manager = queueManagerRef.current;
      if (!manager) return;
      manager.applyStrategy(strategy);
    },
    [],
  );

  const updateMasteryFromBackend = useCallback((wordId: string, isMastered: boolean) => {
    const manager = queueManagerRef.current;
    if (!manager) return;
    manager.updateMasteryFromBackend(wordId, isMastered);
    // 更新本地进度状态
    setProgress(manager.getProgress());
  }, []);

  /**
   * 实时更新目标掌握数量
   * @param newCount 新的目标数量
   * @returns 是否因新目标导致会话完成
   */
  const updateTargetMasteryCount = useCallback((newCount: number) => {
    const manager = queueManagerRef.current;
    if (!manager) {
      // 队列未初始化时，只更新 progress 状态
      setProgress((prev) => ({ ...prev, targetCount: newCount }));
      return false;
    }

    const shouldComplete = manager.updateTargetMasteryCount(newCount);
    const prog = manager.getProgress();
    setProgress(prog);

    if (shouldComplete) {
      setIsCompleted(true);
      setCompletionReason('mastery_achieved');
    }

    return shouldComplete;
  }, []);

  return {
    currentWord,
    allWords,
    isCompleted,
    completionReason,
    progress,
    queueManagerRef,
    configRef,
    initializeQueue,
    restoreQueue,
    updateFromManager,
    getCurrentWord,
    getQueueState,
    addWords,
    skipWord,
    resetQueue,
    restoreProgressSnapshot,
    applyStrategy,
    updateMasteryFromBackend,
    updateTargetMasteryCount,
  };
}

// ==================== Mastery Sync Hook ====================

interface UseMasterySyncOptions {
  getSessionId: () => string;
  getUserId: () => string | undefined;
  getQueueManager: () => WordQueueManager | null;
  onAmasResult?: (result: AmasProcessResult) => void;
  onQueueAdjusted?: () => void;
}

interface SubmitAnswerParams {
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  latestAmasState?: {
    fatigue: number;
    attention: number;
    motivation: number;
  };
}

/**
 * Mastery Sync Hook
 * 处理与服务器的同步逻辑
 */
export function useMasterySync(options: UseMasterySyncOptions) {
  const { getSessionId, getQueueManager, onAmasResult, onQueueAdjusted } = options;

  const sessionCache = useSessionCache();
  const retryQueue = useRetryQueue();
  const syncCounterRef = useRef(0);
  const lastSyncTimeRef = useRef(0);

  const submitAnswerOptimistic = useCallback(
    (params: SubmitAnswerParams) => {
      const manager = getQueueManager();
      if (!manager) return null;

      // 乐观更新本地状态（AMAS 判定由后端确认，这里默认不掌握）
      const decision = manager.recordAnswer(params.wordId, params.isCorrect, params.responseTime, {
        isMastered: false,
        confidence: 0,
        suggestedRepeats: 1,
      });
      return decision;
    },
    [getQueueManager],
  );

  const syncAnswerToServer = useCallback(
    async (
      params: SubmitAnswerParams & { pausedTimeMs: number },
      _localDecision: ReturnType<WordQueueManager['recordAnswer']> | null,
    ) => {
      const sessionId = getSessionId();
      if (!sessionId) return;

      try {
        const eventData: LearningEventInput = {
          wordId: params.wordId,
          isCorrect: params.isCorrect,
          responseTime: params.responseTime,
          sessionId,
          pausedTimeMs: params.pausedTimeMs,
        };

        const result = await processLearningEvent(eventData);
        onAmasResult?.(result);
        syncCounterRef.current++;
        lastSyncTimeRef.current = Date.now();
      } catch (e) {
        learningLogger.error({ err: e }, '[MasterySync] Failed to sync answer to server');
        // 添加到重试队列
        retryQueue.addToQueue({
          id: `answer_${params.wordId}_${Date.now()}`,
          action: async () => {
            const result = await processLearningEvent({
              wordId: params.wordId,
              isCorrect: params.isCorrect,
              responseTime: params.responseTime,
              sessionId: getSessionId(),
              pausedTimeMs: params.pausedTimeMs,
            });
            onAmasResult?.(result);
          },
          maxRetries: 3,
        });
      }
    },
    [getSessionId, onAmasResult, retryQueue],
  );

  const fetchMoreWordsIfNeeded = useCallback(
    async (
      activeCount: number,
      pendingCount: number,
      isCompleted: boolean,
    ): Promise<WordItem[]> => {
      if (isCompleted) return [];

      const manager = getQueueManager();
      const desiredPoolSize = Math.min(Math.max(manager?.getConfig?.().maxActiveWords ?? 6, 3), 20);
      const threshold = Math.max(3, desiredPoolSize - 2);
      const totalAvailable = activeCount + pendingCount;
      if (totalAvailable >= threshold) return [];

      const sessionId = getSessionId();
      if (!sessionId) return [];

      try {
        const currentWordIds = manager?.getCurrentWordIds() ?? [];
        const masteredWordIds = manager?.getMasteredWordIds() ?? [];
        const fetchCount = Math.min(Math.max(desiredPoolSize - totalAvailable, 1), 20);

        const result = await getNextWords({
          currentWordIds,
          masteredWordIds,
          sessionId,
          count: fetchCount,
        });

        return result.words.map((w) => ({
          id: w.id,
          spelling: w.spelling,
          phonetic: w.phonetic,
          meanings: w.meanings,
          examples: w.examples,
          audioUrl: w.audioUrl,
          isNew: w.isNew,
          distractors: w.distractors,
        }));
      } catch (e) {
        learningLogger.error({ err: e }, '[MasterySync] Failed to fetch more words');
        return [];
      }
    },
    [getSessionId, getQueueManager],
  );

  const triggerQueueAdjustment = useCallback(
    async (
      reason: 'fatigue' | 'struggling' | 'excelling' | 'periodic',
      recentPerformance: { accuracy: number; avgResponseTime: number; consecutiveWrong?: number },
      userState?: { fatigue: number; attention: number; motivation: number },
    ) => {
      const sessionId = getSessionId();
      if (!sessionId) return;

      try {
        const manager = getQueueManager();
        const currentWordIds = manager?.getCurrentWordIds() ?? [];
        const masteredWordIds = manager?.getMasteredWordIds() ?? [];

        await adjustLearningWords({
          sessionId,
          currentWordIds,
          masteredWordIds,
          adjustReason: reason,
          userState,
          recentPerformance: {
            accuracy: recentPerformance.accuracy,
            avgResponseTime: recentPerformance.avgResponseTime,
            consecutiveWrong: recentPerformance.consecutiveWrong ?? 0,
          },
        });

        onQueueAdjusted?.();
      } catch (e) {
        learningLogger.error({ err: e }, '[MasterySync] Failed to adjust queue');
      }
    },
    [getSessionId, getQueueManager, onQueueAdjusted],
  );

  const resetSyncCounter = useCallback(() => {
    syncCounterRef.current = 0;
  }, []);

  return {
    sessionCache,
    retryQueue,
    submitAnswerOptimistic,
    syncAnswerToServer,
    fetchMoreWordsIfNeeded,
    triggerQueueAdjustment,
    resetSyncCounter,
    getSyncCounter: () => syncCounterRef.current,
  };
}

// ==================== Exports ====================

export type { SessionCacheData, WordQueueConfig, UseWordQueueOptions, UseMasterySyncOptions };

// Re-export WordItem for test compatibility
export type { WordItem } from '../services/learning/WordQueueManager';
