/**
 * 缓存服务
 * 实现内存缓存，支持TTL（生存时间）和自动失效
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 每分钟清理一次过期缓存
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
    // 使用 unref() 防止定时器阻止进程退出（测试/脚本场景）
    this.cleanupInterval.unref();
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttlSeconds TTL（秒），默认3600秒
   */
  set<T>(key: string, value: T, ttlSeconds = 3600): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值，如果不存在或已过期则返回 null
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 删除缓存（别名，用于测试兼容）
   * @param key 缓存键
   */
  del(key: string): void {
    this.delete(key);
  }

  /**
   * 删除匹配模式的所有缓存
   * @param pattern 键的模式（支持通配符 *）
   */
  deletePattern(pattern: string): void {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清空所有缓存（别名，用于测试兼容）
   */
  flush(): void {
    this.clear();
  }

  /**
   * 获取或设置缓存（用于测试兼容）
   * @param key 缓存键
   * @param factory 工厂函数，当缓存不存在时调用
   * @param ttlSeconds TTL（秒）
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttlSeconds = 3600
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * 销毁缓存服务
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// 导出单例
export const cacheService = new CacheService();

// 默认导出（用于测试兼容）
export default cacheService;

// 缓存键前缀
export const CacheKeys = {
  // 算法配置缓存（TTL: 1小时）
  ALGORITHM_CONFIG: 'algorithm_config',
  ALGORITHM_CONFIG_DEFAULT: 'algorithm_config:default',
  
  // 用户学习状态缓存（TTL: 5分钟）
  USER_LEARNING_STATE: (userId: string, wordId: string) => `learning_state:${userId}:${wordId}`,
  USER_LEARNING_STATES: (userId: string) => `learning_states:${userId}`,
  USER_DUE_WORDS: (userId: string) => `due_words:${userId}`,
  
  // 单词得分缓存（TTL: 10分钟）
  WORD_SCORE: (userId: string, wordId: string) => `word_score:${userId}:${wordId}`,
  WORD_SCORES: (userId: string) => `word_scores:${userId}`,
  
  // 用户统计缓存（TTL: 5分钟）
  USER_STATS: (userId: string) => `user_stats:${userId}`,
  
  // 单词列表缓存（TTL: 10分钟）
  WORDBOOK_WORDS: (wordbookId: string) => `wordbook_words:${wordbookId}`,

  // AMAS缓存（TTL: 15分钟）
  USER_STRATEGY: 'amas_strategy',
  AMAS_STATE: (userId: string) => `amas_state:${userId}`,
  DECISION_INSIGHT: (decisionId: string) => `decision_insight:${decisionId}`,
};

// 缓存TTL（秒）
export const CacheTTL = {
  ALGORITHM_CONFIG: 60 * 60, // 1小时
  LEARNING_STATE: 5 * 60, // 5分钟
  WORD_SCORE: 10 * 60, // 10分钟
  USER_STATS: 5 * 60, // 5分钟
  WORDBOOK_WORDS: 10 * 60, // 10分钟
  USER_STRATEGY: 15 * 60, // 15分钟
  AMAS_STATE: 15 * 60, // 15分钟
};
