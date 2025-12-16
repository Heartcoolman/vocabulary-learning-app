/**
 * Fencing 机制
 *
 * 防止 Split Brain 场景
 * 使用 Redis 分布式锁 + 续租 + Fencing Token
 *
 * 注意：
 * - 如果 failOnRedisUnavailable=true（严格模式），Redis 不可用时将拒绝获取锁
 * - 如果 failOnRedisUnavailable=false（宽松模式，默认），Redis 不可用时将回退到单实例模式
 *
 * 生产环境多实例部署时强烈建议启用严格模式（DB_FENCING_FAIL_ON_REDIS_UNAVAILABLE=true）
 */

import { EventEmitter } from 'events';
import { FencingConfig } from '../adapters/types';
import { createClient, RedisClientType } from 'redis';

// ============================================
// 类型定义
// ============================================

/**
 * Fencing 状态
 */
export interface FencingStatus {
  enabled: boolean;
  hasLock: boolean;
  fencingToken: number;
  instanceId: string;
  lockKey: string;
  lastRenewalTime: number | null;
  redisConnected: boolean;
}

/**
 * Fencing 事件
 */
export interface FencingEvents {
  'lock-acquired': (token: number) => void;
  'lock-lost': (reason: string) => void;
  'lock-renewed': () => void;
  'token-mismatch': (expected: number, actual: number) => void;
  'redis-disconnected': () => void;
  'redis-reconnected': () => void;
  'redis-unavailable-lock-denied': (reason: string) => void;
}

// ============================================
// Fencing Manager
// ============================================

/**
 * Fencing 管理器
 *
 * 负责：
 * 1. 获取和维护分布式写入锁
 * 2. 管理 Fencing Token
 * 3. 在切换时递增 Token 确保旧写入被拒绝
 */
export class FencingManager extends EventEmitter {
  private config: FencingConfig;
  private redis: RedisClientType | null = null;
  private instanceId: string;
  private hasLock = false;
  private currentToken = 0;
  private renewTimer: NodeJS.Timeout | null = null;
  private lastRenewalTime: number | null = null;
  private redisConnected = false;

  constructor(config: FencingConfig, redisUrl?: string) {
    super();
    this.config = config;
    this.instanceId = this.generateInstanceId();

    if (config.enabled && redisUrl) {
      this.initRedis(redisUrl);
    }
  }

  /**
   * 生成唯一实例 ID
   */
  private generateInstanceId(): string {
    const hostname = process.env.HOSTNAME || 'localhost';
    const pid = process.pid;
    const random = Math.random().toString(36).substring(2, 8);
    return `${hostname}-${pid}-${random}`;
  }

  /**
   * 初始化 Redis 连接
   */
  private async initRedis(redisUrl: string): Promise<void> {
    try {
      this.redis = createClient({ url: redisUrl }) as RedisClientType;

      this.redis.on('error', (err) => {
        console.error('[Fencing] Redis error:', err.message);
        this.redisConnected = false;
        this.emit('redis-disconnected');
      });

      this.redis.on('connect', () => {
        this.redisConnected = true;
        this.emit('redis-reconnected');
      });

      await this.redis.connect();
      this.redisConnected = true;
    } catch (error) {
      console.error('[Fencing] Failed to connect to Redis:', error);
      this.redis = null;
      this.redisConnected = false;
    }
  }

  /**
   * 尝试获取写入锁
   */
  async acquireLock(): Promise<boolean> {
    if (!this.config.enabled) {
      // Fencing 未启用，直接返回成功
      this.hasLock = true;
      return true;
    }

    if (!this.redis || !this.redisConnected) {
      // Redis 不可用
      const reason = !this.redis ? 'Redis client not initialized' : 'Redis not connected';

      if (this.config.failOnRedisUnavailable) {
        // 严格模式：拒绝获取锁，防止 Split-Brain
        console.error(
          `[Fencing] Redis not available (${reason}), refusing to acquire lock in strict mode`,
        );
        console.error('[Fencing] This prevents Split-Brain in multi-instance deployments');
        this.emit('redis-unavailable-lock-denied', reason);
        return false;
      }

      // 宽松模式：回退到单实例模式（保持向后兼容）
      console.warn(
        `[Fencing] Redis not available (${reason}), falling back to single-instance mode`,
      );
      console.warn('[Fencing] WARNING: This may cause Split-Brain in multi-instance deployments!');
      console.warn('[Fencing] Set DB_FENCING_FAIL_ON_REDIS_UNAVAILABLE=true for strict mode');
      this.hasLock = true;
      return true;
    }

    try {
      // 使用 SET NX PX 原子操作获取锁
      const result = await this.redis.set(this.config.lockKey, this.instanceId, {
        NX: true,
        PX: this.config.lockTtlMs,
      });

      if (result === 'OK') {
        this.hasLock = true;
        this.currentToken = await this.incrementToken();
        this.startRenewal();
        this.emit('lock-acquired', this.currentToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[Fencing] Failed to acquire lock:', error);
      return false;
    }
  }

  /**
   * 释放写入锁
   */
  async releaseLock(): Promise<void> {
    this.stopRenewal();

    if (!this.hasLock) {
      return;
    }

    this.hasLock = false;

    if (!this.redis || !this.redisConnected) {
      return;
    }

    try {
      // 使用 Lua 脚本确保只删除自己持有的锁
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(script, {
        keys: [this.config.lockKey],
        arguments: [this.instanceId],
      });
    } catch (error) {
      console.error('[Fencing] Failed to release lock:', error);
    }
  }

  /**
   * 递增并获取新的 Fencing Token
   */
  private async incrementToken(): Promise<number> {
    if (!this.redis || !this.redisConnected) {
      return ++this.currentToken;
    }

    try {
      const tokenKey = `${this.config.lockKey}:token`;
      const newToken = await this.redis.incr(tokenKey);
      this.currentToken = newToken;
      return newToken;
    } catch (error) {
      console.error('[Fencing] Failed to increment token:', error);
      return ++this.currentToken;
    }
  }

  /**
   * 获取当前 Fencing Token
   */
  async getCurrentToken(): Promise<number> {
    if (!this.redis || !this.redisConnected) {
      return this.currentToken;
    }

    try {
      const tokenKey = `${this.config.lockKey}:token`;
      const token = await this.redis.get(tokenKey);
      return token ? parseInt(token, 10) : 0;
    } catch {
      return this.currentToken;
    }
  }

  /**
   * 验证 Fencing Token
   * 用于拒绝过期的写入请求
   */
  async validateToken(token: number): Promise<boolean> {
    if (!this.config.enabled) {
      return true;
    }

    const currentToken = await this.getCurrentToken();

    if (token !== currentToken) {
      this.emit('token-mismatch', currentToken, token);
      return false;
    }

    return true;
  }

  /**
   * 检查是否持有锁
   */
  hasWriteLock(): boolean {
    return this.hasLock;
  }

  /**
   * 获取当前持有的 Token
   */
  getHeldToken(): number {
    return this.currentToken;
  }

  /**
   * 启动锁续租
   */
  private startRenewal(): void {
    if (this.renewTimer) {
      return;
    }

    const renewIntervalMs = this.config.renewIntervalMs || Math.floor(this.config.lockTtlMs / 3);

    this.renewTimer = setInterval(async () => {
      await this.renewLock();
    }, renewIntervalMs);

    if (this.renewTimer.unref) {
      this.renewTimer.unref();
    }
  }

  /**
   * 停止锁续租
   */
  private stopRenewal(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }

  /**
   * 续租锁
   */
  private async renewLock(): Promise<void> {
    if (!this.hasLock || !this.redis || !this.redisConnected) {
      return;
    }

    try {
      // 使用 Lua 脚本确保只更新自己持有的锁
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, {
        keys: [this.config.lockKey],
        arguments: [this.instanceId, String(this.config.lockTtlMs)],
      });

      if (result === 1) {
        this.lastRenewalTime = Date.now();
        this.emit('lock-renewed');
      } else {
        // 锁已被其他实例获取
        this.hasLock = false;
        this.stopRenewal();
        this.emit('lock-lost', 'Lock was taken by another instance');
      }
    } catch (error) {
      console.error('[Fencing] Failed to renew lock:', error);
      // 续租失败，标记为丢失锁
      this.hasLock = false;
      this.stopRenewal();
      this.emit(
        'lock-lost',
        `Renewal failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 获取 Fencing 状态
   */
  getStatus(): FencingStatus {
    return {
      enabled: this.config.enabled,
      hasLock: this.hasLock,
      fencingToken: this.currentToken,
      instanceId: this.instanceId,
      lockKey: this.config.lockKey,
      lastRenewalTime: this.lastRenewalTime,
      redisConnected: this.redisConnected,
    };
  }

  /**
   * 关闭 Fencing Manager
   */
  async close(): Promise<void> {
    await this.releaseLock();

    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // 忽略关闭错误
      }
      this.redis = null;
    }
  }
}

/**
 * 创建 Fencing Manager
 */
export function createFencingManager(config: FencingConfig, redisUrl?: string): FencingManager {
  return new FencingManager(config, redisUrl);
}

/**
 * 创建禁用的 Fencing Manager（用于测试或单实例部署）
 */
export function createDisabledFencingManager(): FencingManager {
  return new FencingManager({
    enabled: false,
    lockKey: '',
    lockTtlMs: 0,
    renewIntervalMs: 0,
  });
}
