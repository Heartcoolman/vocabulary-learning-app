/**
 * Redis 缓存服务
 * 提供分布式缓存操作（跨进程/跨实例）
 */

import { getRedisClient } from '../config/redis';
import { cacheLogger } from '../logger';
import crypto from 'crypto';

const DEFAULT_TTL = 300; // 5分钟默认过期
const NULL_CACHE_TTL = 60; // 空值缓存 60 秒
const NULL_MARKER = '__NULL__'; // 空值标记

// 缓存键前缀
export const REDIS_CACHE_KEYS = {
  USER_STATE: 'amas:state:', // AMAS 用户状态
  USER_MODEL: 'amas:model:', // LinUCB 模型
  WORD_STATE: 'word:state:', // 单词学习状态
  WORD_SCORE: 'word:score:', // 单词得分
  USER_CONFIG: 'user:config:', // 用户配置
  SYSTEM_WORDBOOKS: 'wordbooks:system', // 系统词书列表
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
      cacheLogger.warn(
        { key, error: (error as Error).message },
        'Redis get 操作失败，降级为无缓存模式',
      );
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
      cacheLogger.warn(
        { key, ttl, error: (error as Error).message },
        'Redis set 操作失败，降级为无缓存模式',
      );
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
      cacheLogger.warn(
        { key, error: (error as Error).message },
        'Redis del 操作失败，降级为无缓存模式',
      );
      return false;
    }
  }

  async delByPrefix(prefix: string): Promise<number> {
    if (!this.enabled) return 0;
    try {
      const redis = getRedisClient();
      let cursor = '0';
      let deletedCount = 0;

      // 使用 SCAN 命令代替 KEYS，避免在大 key 空间下阻塞 Redis
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      return deletedCount;
    } catch (error) {
      cacheLogger.warn(
        { prefix, error: (error as Error).message },
        'Redis delByPrefix 操作失败，降级为无缓存模式',
      );
      return 0;
    }
  }

  // ==================== 缓存防护策略 ====================

  /**
   * 缓存穿透防护 - 空值缓存
   * 当数据源返回 null 时，缓存一个特殊标记防止重复查询
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T | null>,
    ttl: number = DEFAULT_TTL,
  ): Promise<T | null> {
    if (!this.enabled) {
      return fetcher();
    }

    try {
      const cached = await this.get<T | string>(key);

      // 命中空值缓存，直接返回 null
      if (cached === NULL_MARKER) {
        cacheLogger.debug({ key }, '命中空值缓存');
        return null;
      }

      // 命中有效缓存
      if (cached !== null) {
        return cached as T;
      }

      // 缓存未命中，执行 fetcher
      const value = await fetcher();

      if (value === null) {
        // 缓存空值，防止穿透
        await this.set(key, NULL_MARKER, NULL_CACHE_TTL);
        cacheLogger.debug({ key, ttl: NULL_CACHE_TTL }, '缓存空值防止穿透');
        return null;
      }

      await this.set(key, value, ttl);
      return value;
    } catch (error) {
      cacheLogger.warn(
        { key, error: (error as Error).message },
        'getOrSet 操作失败，直接执行 fetcher',
      );
      return fetcher();
    }
  }

  /**
   * 缓存击穿防护 - 互斥锁
   * 使用分布式锁防止热点 key 失效时大量请求击穿缓存
   */
  async getOrSetWithLock<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = DEFAULT_TTL,
    lockTimeout: number = 5000,
  ): Promise<T> {
    if (!this.enabled) {
      return fetcher();
    }

    const lockKey = `lock:${key}`;
    const redis = getRedisClient();
    const lockValue = crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex');
    const start = Date.now();
    const maxWaitMs = Math.max(1, lockTimeout);

    // 使用 token 校验释放锁，避免锁过期后误删他人新锁
    const RELEASE_LOCK_LUA = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;

    try {
      // 先检查缓存
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;

      let delayMs = 50;
      while (Date.now() - start <= maxWaitMs) {
        // 尝试获取锁 (SET key value PX timeout NX)
        const acquired = await redis.set(lockKey, lockValue, 'PX', lockTimeout, 'NX');
        if (acquired) {
          try {
            // 双重检查：获取锁后再次检查缓存（可能其他进程已经填充）
            const doubleCheck = await this.get<T>(key);
            if (doubleCheck !== null) return doubleCheck;

            const value = await fetcher();
            await this.set(key, value, ttl);
            cacheLogger.debug({ key }, '获取锁成功，更新缓存');
            return value;
          } finally {
            try {
              await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue);
            } catch (releaseError) {
              cacheLogger.warn(
                { key, err: releaseError instanceof Error ? releaseError.message : releaseError },
                '释放缓存锁失败',
              );
            }
          }
        }

        // 获取锁失败：等待前再检查一次缓存（可能已经被其他实例填充）
        const afterWaitCheck = await this.get<T>(key);
        if (afterWaitCheck !== null) return afterWaitCheck;

        // 带抖动的退避等待，避免自旋/热点抖动
        const jitter = Math.floor(Math.random() * 25);
        await this.sleep(delayMs + jitter);
        delayMs = Math.min(500, Math.floor(delayMs * 1.5));
      }

      // 超时兜底：避免请求无限等待
      cacheLogger.warn({ key, lockTimeout, maxWaitMs }, '缓存锁等待超时，直接执行 fetcher');
      const value = await fetcher();
      void this.set(key, value, ttl);
      return value;
    } catch (error) {
      cacheLogger.warn(
        { key, error: error instanceof Error ? error.message : error },
        'getOrSetWithLock 操作失败，直接执行 fetcher',
      );
      return fetcher();
    }
  }

  /**
   * 缓存雪崩防护 - TTL 随机抖动
   * 在基础 TTL 上增加随机抖动，避免大量 key 同时过期
   */
  async setWithJitter(
    key: string,
    value: unknown,
    baseTtl: number,
    jitterPercent: number = 0.1,
  ): Promise<boolean> {
    // 计算抖动范围：baseTtl * jitterPercent * [-1, 1]
    const jitter = baseTtl * jitterPercent * (Math.random() * 2 - 1);
    const ttl = Math.max(1, Math.round(baseTtl + jitter)); // 确保 TTL 至少为 1
    cacheLogger.debug({ key, baseTtl, actualTtl: ttl, jitterPercent }, 'TTL 抖动设置');
    return this.set(key, value, ttl);
  }

  /**
   * 辅助方法：睡眠指定毫秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
