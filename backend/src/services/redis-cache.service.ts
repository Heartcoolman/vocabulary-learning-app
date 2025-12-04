/**
 * Redis 缓存服务
 * 提供分布式缓存操作（跨进程/跨实例）
 */

import { getRedisClient } from '../config/redis';
import { cacheLogger } from '../logger';

const DEFAULT_TTL = 300; // 5分钟默认过期

// 缓存键前缀
export const REDIS_CACHE_KEYS = {
  USER_STATE: 'amas:state:',      // AMAS 用户状态
  USER_MODEL: 'amas:model:',      // LinUCB 模型
  WORD_STATE: 'word:state:',      // 单词学习状态
  WORD_SCORE: 'word:score:',      // 单词得分
  USER_CONFIG: 'user:config:',    // 用户配置
} as const;

class RedisCacheService {
  private enabled = true;

  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const redis = getRedisClient();
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      cacheLogger.warn({ key, error: (error as Error).message }, 'Redis get 操作失败');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number = DEFAULT_TTL): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const redis = getRedisClient();
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      cacheLogger.warn({ key, ttl, error: (error as Error).message }, 'Redis set 操作失败');
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const redis = getRedisClient();
      await redis.del(key);
      return true;
    } catch (error) {
      cacheLogger.warn({ key, error: (error as Error).message }, 'Redis del 操作失败');
      return false;
    }
  }

  async delByPrefix(prefix: string): Promise<number> {
    if (!this.enabled) return 0;
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return keys.length;
    } catch (error) {
      cacheLogger.warn({ prefix, error: (error as Error).message }, 'Redis delByPrefix 操作失败');
      return 0;
    }
  }

  // AMAS 用户状态
  async getUserState<T>(userId: string): Promise<T | null> {
    return this.get<T>(`${REDIS_CACHE_KEYS.USER_STATE}${userId}`);
  }

  async setUserState<T>(userId: string, state: T, ttl = 60): Promise<boolean> {
    return this.set(`${REDIS_CACHE_KEYS.USER_STATE}${userId}`, state, ttl);
  }

  async delUserState(userId: string): Promise<boolean> {
    return this.del(`${REDIS_CACHE_KEYS.USER_STATE}${userId}`);
  }

  // LinUCB 模型
  async getUserModel<T>(userId: string): Promise<T | null> {
    return this.get<T>(`${REDIS_CACHE_KEYS.USER_MODEL}${userId}`);
  }

  async setUserModel<T>(userId: string, model: T, ttl = 300): Promise<boolean> {
    return this.set(`${REDIS_CACHE_KEYS.USER_MODEL}${userId}`, model, ttl);
  }

  async delUserModel(userId: string): Promise<boolean> {
    return this.del(`${REDIS_CACHE_KEYS.USER_MODEL}${userId}`);
  }

  // 单词学习状态
  async getWordState<T>(userId: string, wordId: string): Promise<T | null> {
    return this.get<T>(`${REDIS_CACHE_KEYS.WORD_STATE}${userId}:${wordId}`);
  }

  async setWordState<T>(userId: string, wordId: string, state: T, ttl = 120): Promise<boolean> {
    return this.set(`${REDIS_CACHE_KEYS.WORD_STATE}${userId}:${wordId}`, state, ttl);
  }

  async delWordState(userId: string, wordId: string): Promise<boolean> {
    return this.del(`${REDIS_CACHE_KEYS.WORD_STATE}${userId}:${wordId}`);
  }

  // 单词得分
  async getWordScore<T>(userId: string, wordId: string): Promise<T | null> {
    return this.get<T>(`${REDIS_CACHE_KEYS.WORD_SCORE}${userId}:${wordId}`);
  }

  async setWordScore<T>(userId: string, wordId: string, score: T, ttl = 120): Promise<boolean> {
    return this.set(`${REDIS_CACHE_KEYS.WORD_SCORE}${userId}:${wordId}`, score, ttl);
  }

  async delWordScore(userId: string, wordId: string): Promise<boolean> {
    return this.del(`${REDIS_CACHE_KEYS.WORD_SCORE}${userId}:${wordId}`);
  }
}

export const redisCacheService = new RedisCacheService();
export default redisCacheService;
