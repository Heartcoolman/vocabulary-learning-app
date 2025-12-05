import { useRef, useEffect, useCallback } from 'react';
import apiClient from '../../services/ApiClient';
import { learningLogger } from '../../utils/logger';

/**
 * 重试队列项
 */
export interface RetryQueueItem {
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  timestamp: number;
  retryCount: number;
  pausedTimeMs?: number;
}

/**
 * useRetryQueue 配置选项
 */
export interface UseRetryQueueOptions {
  /** 最大队列大小，默认 20 */
  maxQueueSize?: number;
  /** 重试间隔（毫秒），默认 5000 */
  retryInterval?: number;
  /** 最大重试次数，默认 3 */
  maxRetryCount?: number;
  /** 获取当前 sessionId 的函数 */
  getSessionId: () => string;
}

/**
 * useRetryQueue 返回值
 */
export interface UseRetryQueueReturn {
  /** 将失败请求加入重试队列 */
  enqueue: (item: Omit<RetryQueueItem, 'retryCount'>) => void;
  /** 获取当前队列长度 */
  getQueueLength: () => number;
  /** 清空重试队列 */
  clearQueue: () => void;
  /** 队列引用（供外部访问） */
  queueRef: React.MutableRefObject<RetryQueueItem[]>;
}

const DEFAULT_MAX_QUEUE_SIZE = 20;
const DEFAULT_RETRY_INTERVAL = 5000; // 5秒
const DEFAULT_MAX_RETRY_COUNT = 3;

/**
 * 重试队列 Hook
 *
 * 用于管理失败的 AMAS 请求重试
 * - 最大 20 条
 * - 每 5 秒重试一次
 * - 最多重试 3 次
 */
export function useRetryQueue(options: UseRetryQueueOptions): UseRetryQueueReturn {
  const {
    maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
    retryInterval = DEFAULT_RETRY_INTERVAL,
    maxRetryCount = DEFAULT_MAX_RETRY_COUNT,
    getSessionId
  } = options;

  const retryQueueRef = useRef<RetryQueueItem[]>([]);
  const isMountedRef = useRef(true);

  // 处理重试队列的函数
  const processRetryQueueRef = useRef<() => Promise<void>>();

  processRetryQueueRef.current = async () => {
    if (retryQueueRef.current.length === 0) return;

    const item = retryQueueRef.current[0];

    // 超过重试次数，丢弃
    if (item.retryCount >= maxRetryCount) {
      retryQueueRef.current.shift();
      learningLogger.warn({ wordId: item.wordId }, 'AMAS请求重试次数超限，已丢弃');
      return;
    }

    try {
      await apiClient.processLearningEvent({
        wordId: item.wordId,
        isCorrect: item.isCorrect,
        responseTime: item.responseTime,
        sessionId: getSessionId(),
        timestamp: item.timestamp,
        pausedTimeMs: item.pausedTimeMs
      });
      // 成功，移除队列
      retryQueueRef.current.shift();
      learningLogger.debug({ wordId: item.wordId }, 'AMAS重试成功');
    } catch {
      // 失败，增加重试次数
      item.retryCount += 1;
      learningLogger.debug({ wordId: item.wordId, retryCount: item.retryCount }, 'AMAS重试失败');
    }
  };

  // 定期处理重试队列
  useEffect(() => {
    isMountedRef.current = true;

    const interval = setInterval(() => {
      if (retryQueueRef.current.length > 0 && processRetryQueueRef.current) {
        processRetryQueueRef.current();
      }
    }, retryInterval);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [retryInterval]);

  // 入队函数
  const enqueue = useCallback((item: Omit<RetryQueueItem, 'retryCount'>) => {
    if (!isMountedRef.current) return;

    // 检查队列大小限制
    if (retryQueueRef.current.length >= maxQueueSize) {
      // 移除最旧的重试项
      const removed = retryQueueRef.current.shift();
      learningLogger.warn({ removedWordId: removed?.wordId }, '重试队列已满，移除最旧项');
    }

    retryQueueRef.current.push({
      ...item,
      retryCount: 0
    });

    learningLogger.debug({ wordId: item.wordId }, 'AMAS请求已入队重试');
  }, [maxQueueSize]);

  // 获取队列长度
  const getQueueLength = useCallback(() => {
    return retryQueueRef.current.length;
  }, []);

  // 清空队列
  const clearQueue = useCallback(() => {
    retryQueueRef.current = [];
  }, []);

  return {
    enqueue,
    getQueueLength,
    clearQueue,
    queueRef: retryQueueRef
  };
}
