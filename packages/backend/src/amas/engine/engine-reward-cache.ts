/**
 * AMAS Engine - 奖励配置缓存管理模块
 *
 * 负责管理用户奖励配置的内存缓存，避免每次请求都查询数据库
 * - 支持 TTL 过期机制
 * - 支持缓存统计（命中率）
 * - 支持手动失效
 */

import { Logger } from './engine-types';

/**
 * 奖励配置缓存项
 */
export interface RewardProfileCacheItem {
  /** 用户配置的 profile ID（可为 null 表示使用默认） */
  profileId: string | null;
  /** 缓存时间戳 */
  cachedAt: number;
}

/**
 * 缓存统计信息
 */
export interface RewardCacheStats {
  /** 缓存大小 */
  size: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 [0, 1] */
  hitRate: number;
}

/**
 * 奖励缓存管理器接口
 */
export interface RewardCacheManager {
  /**
   * 获取缓存的用户奖励配置
   * @param userId 用户 ID
   * @returns 奖励配置（缓存命中时返回，否则返回 null）
   */
  getCachedProfileId(userId: string): string | null | undefined;

  /**
   * 设置用户奖励配置缓存
   * @param userId 用户 ID
   * @param profileId 配置 ID（null 表示使用默认）
   */
  setCachedProfileId(userId: string, profileId: string | null): void;

  /**
   * 使指定用户的缓存失效
   * @param userId 用户 ID
   */
  invalidateCache(userId: string): void;

  /**
   * 清空所有缓存
   */
  clearAll(): void;

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): RewardCacheStats;

  /**
   * 获取当前缓存大小
   */
  getCacheSize(): number;

  /**
   * 清理过期缓存
   */
  cleanup(): void;
}

/**
 * 奖励缓存管理器配置
 */
export interface RewardCacheConfig {
  /** 缓存 TTL（毫秒，默认 5 分钟） */
  ttlMs?: number;
  /** 最大缓存数量（默认 10000） */
  maxSize?: number;
  /** 日志记录器 */
  logger?: Logger;
}

/**
 * 默认奖励缓存管理器实现
 *
 * 特性：
 * - 使用 Map 作为内存缓存
 * - 支持 TTL 过期机制
 * - 支持 LRU 风格的大小限制（达到上限时清理过期项）
 * - 跟踪命中/未命中统计
 */
export class DefaultRewardCacheManager implements RewardCacheManager {
  private cache = new Map<string, RewardProfileCacheItem>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly logger?: Logger;

  // 统计信息
  private hits = 0;
  private misses = 0;

  constructor(config: RewardCacheConfig = {}) {
    this.ttlMs = config.ttlMs ?? 5 * 60 * 1000; // 默认 5 分钟
    this.maxSize = config.maxSize ?? 10000;
    this.logger = config.logger;
  }

  /**
   * 获取缓存的 profile ID
   * @returns profileId（命中时）, undefined（未命中或过期）
   */
  getCachedProfileId(userId: string): string | null | undefined {
    const entry = this.cache.get(userId);
    const now = Date.now();

    if (entry && (now - entry.cachedAt) < this.ttlMs) {
      this.hits++;
      return entry.profileId;
    }

    // 过期或不存在
    if (entry) {
      // 过期项，删除它
      this.cache.delete(userId);
    }
    this.misses++;
    return undefined;
  }

  /**
   * 设置缓存
   */
  setCachedProfileId(userId: string, profileId: string | null): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
      // 如果清理后仍然超过限制，删除最旧的条目
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    this.cache.set(userId, {
      profileId,
      cachedAt: Date.now()
    });
  }

  /**
   * 使指定用户的缓存失效
   */
  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * 清空所有缓存
   */
  clearAll(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): RewardCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * 获取当前缓存大小
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [userId, item] of this.cache) {
      if (now - item.cachedAt > this.ttlMs) {
        expiredKeys.push(userId);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger?.info('Cleaned up expired reward profile cache entries', {
        count: expiredKeys.length,
        remaining: this.cache.size
      });
    }
  }
}

/**
 * 空操作缓存管理器（用于测试或禁用缓存场景）
 */
export class NoopRewardCacheManager implements RewardCacheManager {
  getCachedProfileId(_userId: string): string | null | undefined {
    return undefined; // 始终返回未命中
  }

  setCachedProfileId(_userId: string, _profileId: string | null): void {
    // 不做任何操作
  }

  invalidateCache(_userId: string): void {
    // 不做任何操作
  }

  clearAll(): void {
    // 不做任何操作
  }

  getCacheStats(): RewardCacheStats {
    return { size: 0, hits: 0, misses: 0, hitRate: 0 };
  }

  getCacheSize(): number {
    return 0;
  }

  cleanup(): void {
    // 不做任何操作
  }
}

/**
 * 创建奖励缓存管理器
 *
 * @param config 配置选项
 * @returns 缓存管理器实例
 */
export function createRewardCacheManager(config?: RewardCacheConfig): RewardCacheManager {
  return new DefaultRewardCacheManager(config);
}
