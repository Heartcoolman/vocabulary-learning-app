import { useCallback } from 'react';
import { QueueState } from '../../services/learning/WordQueueManager';
import { learningLogger } from '../../utils/logger';

/**
 * 缓存的会话数据结构
 */
export interface CachedSession {
  sessionId: string;
  targetMasteryCount: number;
  masteryThreshold: number;
  maxTotalQuestions: number;
  queueState: QueueState;
  timestamp: number;
  userId?: string | null;
}

/**
 * useSessionCache 配置选项
 */
export interface UseSessionCacheOptions {
  /** localStorage 存储键，默认 'mastery_learning_session' */
  storageKey?: string;
  /** 过期时间（毫秒），默认 24小时 */
  expiryTime?: number;
}

/**
 * useSessionCache 返回值
 */
export interface UseSessionCacheReturn {
  /** 保存会话到缓存 */
  saveSessionToCache: (session: CachedSession) => boolean;
  /** 从缓存加载会话 */
  loadSessionFromCache: (currentUserId?: string | null, currentSessionId?: string) => CachedSession | null;
  /** 清除会话缓存 */
  clearSessionCache: () => boolean;
  /** 检查缓存是否存在且有效 */
  hasCachedSession: (currentUserId?: string | null, currentSessionId?: string) => boolean;
}

const DEFAULT_STORAGE_KEY = 'mastery_learning_session';
const DEFAULT_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24小时

/**
 * 会话缓存 Hook
 *
 * 用于管理学习会话的 localStorage 缓存
 * - 存储键: 'mastery_learning_session'
 * - 24小时过期
 * - 支持用户隔离（不同用户的缓存互不影响）
 */
export function useSessionCache(options: UseSessionCacheOptions = {}): UseSessionCacheReturn {
  const {
    storageKey = DEFAULT_STORAGE_KEY,
    expiryTime = DEFAULT_EXPIRY_TIME
  } = options;

  /**
   * 保存会话到缓存
   */
  const saveSessionToCache = useCallback((session: CachedSession): boolean => {
    try {
      const cacheData: CachedSession = {
        ...session,
        timestamp: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(cacheData));
      return true;
    } catch (e) {
      learningLogger.error({ err: e }, '保存会话缓存失败');
      return false;
    }
  }, [storageKey]);

  /**
   * 从缓存加载会话
   *
   * @param currentUserId 当前用户 ID，用于验证缓存所属用户
   * @param currentSessionId 当前会话 ID，用于验证是否为同一会话
   * @returns 有效的缓存数据，或 null
   */
  const loadSessionFromCache = useCallback((
    currentUserId?: string | null,
    currentSessionId?: string
  ): CachedSession | null => {
    try {
      const cachedData = localStorage.getItem(storageKey);
      if (!cachedData) return null;

      const cache: CachedSession = JSON.parse(cachedData);
      const cacheUserId = cache.userId ?? null;
      const normalizedCurrentUserId = currentUserId ?? null;

      // 检查用户是否匹配（防止跨账户泄漏）
      const isUserMismatch = cacheUserId !== normalizedCurrentUserId;
      if (isUserMismatch) {
        learningLogger.info('用户不匹配，缓存无效');
        clearSessionCacheInternal();
        return null;
      }

      // 检查是否过期
      const isExpired = Date.now() - cache.timestamp > expiryTime;
      if (isExpired) {
        learningLogger.info('会话缓存已过期');
        clearSessionCacheInternal();
        return null;
      }

      // 检查会话 ID 是否匹配（如果提供了 currentSessionId）
      const isSameSession = !currentSessionId || cache.sessionId === currentSessionId;
      if (!isSameSession) {
        learningLogger.info('会话 ID 不匹配');
        clearSessionCacheInternal();
        return null;
      }

      // 检查队列状态是否有效
      if (!cache.queueState?.words?.length) {
        learningLogger.info('缓存队列为空');
        clearSessionCacheInternal();
        return null;
      }

      return cache;
    } catch (e) {
      learningLogger.error({ err: e }, '解析缓存失败');
      clearSessionCacheInternal();
      return null;
    }
  }, [storageKey, expiryTime]);

  /**
   * 内部清除缓存函数（不使用 useCallback 的依赖）
   */
  const clearSessionCacheInternal = (): boolean => {
    try {
      localStorage.removeItem(storageKey);
      return true;
    } catch (e) {
      learningLogger.warn({ err: e }, '清除会话缓存失败');
      return false;
    }
  };

  /**
   * 清除会话缓存
   */
  const clearSessionCache = useCallback((): boolean => {
    return clearSessionCacheInternal();
  }, [storageKey]);

  /**
   * 检查缓存是否存在且有效
   */
  const hasCachedSession = useCallback((
    currentUserId?: string | null,
    currentSessionId?: string
  ): boolean => {
    const cache = loadSessionFromCache(currentUserId, currentSessionId);
    return cache !== null;
  }, [loadSessionFromCache]);

  return {
    saveSessionToCache,
    loadSessionFromCache,
    clearSessionCache,
    hasCachedSession
  };
}

// 导出常量供外部使用
export const SESSION_CACHE_STORAGE_KEY = DEFAULT_STORAGE_KEY;
export const SESSION_CACHE_EXPIRY_TIME = DEFAULT_EXPIRY_TIME;
