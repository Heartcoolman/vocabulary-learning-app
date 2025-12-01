import { useState, useEffect, useCallback, useRef } from 'react';
import { WordQueueManager, WordItem, QueueProgress, CompletionReason, QueueState } from '../services/learning/WordQueueManager';
import apiClient from '../services/ApiClient';
import { useAuth } from '../contexts/AuthContext';

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

  const queueManagerRef = useRef<WordQueueManager | null>(null);
  const syncCounterRef = useRef(0);
  const currentSessionIdRef = useRef<string>(sessionId || '');
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

        queueManagerRef.current.recordAnswer(
          currentWord.id,
          isCorrect,
          responseTime,
          amasResult.wordMasteryDecision
        );
      } catch (e) {
        console.warn('[useMasteryLearning] AMAS调用失败,使用本地判定:', e);
        queueManagerRef.current.recordAnswer(
          currentWord.id,
          isCorrect,
          responseTime,
          undefined
        );
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
      setError(error instanceof Error ? error.message : '提交答案失败，请重试');
    }
  }, [currentWord, saveSessionToCache, syncProgress]);

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
    error
  };
}
