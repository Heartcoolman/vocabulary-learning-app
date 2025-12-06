/**
 * Redis Cache Service Unit Tests
 * Tests for the actual RedisCacheService API using ioredis
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock ioredis Redis client
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  scan: vi.fn(),
  on: vi.fn(),
  connect: vi.fn()
};

vi.mock('../../../src/config/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
  connectRedis: vi.fn().mockResolvedValue(true),
  disconnectRedis: vi.fn().mockResolvedValue(undefined)
}));

describe('RedisCacheService', () => {
  let redisCacheService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.setex.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.keys.mockResolvedValue([]);
    mockRedisClient.scan.mockResolvedValue(['0', []]);

    vi.resetModules();
    const module = await import('../../../src/services/redis-cache.service');
    redisCacheService = module.redisCacheService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('get', () => {
    it('should return null for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await redisCacheService.get('non-existent');

      expect(result).toBeNull();
    });

    it('should return parsed JSON value', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

      const result = await redisCacheService.get('test-key');

      expect(result).toEqual({ foo: 'bar' });
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json{');

      const result = await redisCacheService.get('test-key');

      // Should return null on parse error
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      await redisCacheService.set('key', { data: 'value' });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'key',
        300, // default TTL
        JSON.stringify({ data: 'value' })
      );
    });

    it('should set value with custom TTL', async () => {
      await redisCacheService.set('key', { data: 'value' }, 3600);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'key',
        3600,
        JSON.stringify({ data: 'value' })
      );
    });

    it('should return true on success', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await redisCacheService.set('key', 'value');

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      const result = await redisCacheService.set('key', 'value');

      expect(result).toBe(false);
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await redisCacheService.del('key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('key');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      const result = await redisCacheService.del('key');

      expect(result).toBe(false);
    });
  });

  describe('delByPrefix', () => {
    it('should delete keys matching prefix using SCAN', async () => {
      // Mock scan to return keys in first iteration, then '0' cursor to end
      mockRedisClient.scan.mockResolvedValue(['0', ['key1', 'key2', 'key3']]);
      mockRedisClient.del.mockResolvedValue(3);

      const result = await redisCacheService.delByPrefix('key');

      // 验证使用了 scan 而不是 keys
      expect(mockRedisClient.scan).toHaveBeenCalledWith('0', 'MATCH', 'key*', 'COUNT', 100);
      expect(result).toBe(3);
    });

    it('should return 0 when no matching keys', async () => {
      mockRedisClient.scan.mockResolvedValue(['0', []]);

      const result = await redisCacheService.delByPrefix('nonexistent');

      expect(result).toBe(0);
    });
  });

  describe('user state operations', () => {
    it('should get user state', async () => {
      const mockState = { avgErrorRate: 0.1, avgResponseTimeMs: 2500 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockState));

      const result = await redisCacheService.getUserState('user-1');

      expect(result).toEqual(mockState);
    });

    it('should set user state', async () => {
      const mockState = { avgErrorRate: 0.1, avgResponseTimeMs: 2500 };

      await redisCacheService.setUserState('user-1', mockState);

      expect(mockRedisClient.setex).toHaveBeenCalled();
    });

    it('should delete user state', async () => {
      await redisCacheService.delUserState('user-1');

      expect(mockRedisClient.del).toHaveBeenCalled();
    });
  });

  describe('user model operations', () => {
    it('should get user model', async () => {
      const mockModel = { weights: [0.1, 0.2], features: [] };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockModel));

      const result = await redisCacheService.getUserModel('user-1');

      expect(result).toEqual(mockModel);
    });

    it('should set user model', async () => {
      const mockModel = { weights: [0.1, 0.2], features: [] };

      await redisCacheService.setUserModel('user-1', mockModel);

      expect(mockRedisClient.setex).toHaveBeenCalled();
    });
  });

  describe('word state operations', () => {
    it('should get word state', async () => {
      const mockState = { mastered: false, reviewCount: 3 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockState));

      const result = await redisCacheService.getWordState('user-1', 'word-1');

      expect(result).toEqual(mockState);
    });

    it('should set word state', async () => {
      const mockState = { mastered: false, reviewCount: 3 };

      await redisCacheService.setWordState('user-1', 'word-1', mockState);

      expect(mockRedisClient.setex).toHaveBeenCalled();
    });
  });

  describe('enable/disable', () => {
    it('should return null when disabled', async () => {
      redisCacheService.disable();

      const result = await redisCacheService.get('key');

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();

      redisCacheService.enable();
    });

    it('should work after re-enabling', async () => {
      redisCacheService.disable();
      redisCacheService.enable();
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ data: 'test' }));

      const result = await redisCacheService.get('key');

      expect(result).toEqual({ data: 'test' });
    });
  });

  describe('exports', () => {
    it('should export redisCacheService singleton', async () => {
      const module = await import('../../../src/services/redis-cache.service');
      expect(module.redisCacheService).toBeDefined();
    });

    it('should export REDIS_CACHE_KEYS', async () => {
      const module = await import('../../../src/services/redis-cache.service');
      expect(module.REDIS_CACHE_KEYS).toBeDefined();
      expect(module.REDIS_CACHE_KEYS.USER_STATE).toBeDefined();
    });
  });

  // ==================== 缓存防护策略测试 ====================

  describe('getOrSet - 缓存穿透防护', () => {
    it('should return cached value when exists', async () => {
      const cachedData = { id: 1, name: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));
      const fetcher = vi.fn().mockResolvedValue({ id: 2, name: 'new' });

      const result = await redisCacheService.getOrSet('test-key', fetcher, 300);

      expect(result).toEqual(cachedData);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call fetcher and cache result when cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const fetchedData = { id: 1, name: 'fetched' };
      const fetcher = vi.fn().mockResolvedValue(fetchedData);

      const result = await redisCacheService.getOrSet('test-key', fetcher, 300);

      expect(result).toEqual(fetchedData);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test-key',
        300,
        JSON.stringify(fetchedData)
      );
    });

    it('should cache null marker when fetcher returns null (防穿透)', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue(null);

      const result = await redisCacheService.getOrSet('non-existent-key', fetcher, 300);

      expect(result).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
      // 验证空值被缓存为 __NULL__ 标记，TTL 为 60 秒
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'non-existent-key',
        60,
        JSON.stringify('__NULL__')
      );
    });

    it('should return null immediately when null marker is cached (防穿透命中)', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify('__NULL__'));
      const fetcher = vi.fn().mockResolvedValue({ id: 1 });

      const result = await redisCacheService.getOrSet('test-key', fetcher, 300);

      expect(result).toBeNull();
      expect(fetcher).not.toHaveBeenCalled(); // 不应调用 fetcher
    });

    it('should fallback to fetcher when service is disabled', async () => {
      redisCacheService.disable();
      const fetchedData = { id: 1 };
      const fetcher = vi.fn().mockResolvedValue(fetchedData);

      const result = await redisCacheService.getOrSet('test-key', fetcher, 300);

      expect(result).toEqual(fetchedData);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.get).not.toHaveBeenCalled();

      redisCacheService.enable();
    });

    it('should fallback to fetcher on error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      const fetchedData = { id: 1 };
      const fetcher = vi.fn().mockResolvedValue(fetchedData);

      const result = await redisCacheService.getOrSet('test-key', fetcher, 300);

      expect(result).toEqual(fetchedData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOrSetWithLock - 缓存击穿防护', () => {
    it('should return cached value without acquiring lock', async () => {
      const cachedData = { id: 1, name: 'cached' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));
      const fetcher = vi.fn().mockResolvedValue({ id: 2 });

      const result = await redisCacheService.getOrSetWithLock('test-key', fetcher, 300);

      expect(result).toEqual(cachedData);
      expect(fetcher).not.toHaveBeenCalled();
      expect(mockRedisClient.set).not.toHaveBeenCalled(); // 不应尝试获取锁
    });

    it('should acquire lock and fetch data on cache miss', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValue('OK'); // 获取锁成功
      const fetchedData = { id: 1, name: 'fetched' };
      const fetcher = vi.fn().mockResolvedValue(fetchedData);

      const result = await redisCacheService.getOrSetWithLock('test-key', fetcher, 300);

      expect(result).toEqual(fetchedData);
      expect(fetcher).toHaveBeenCalledTimes(1);
      // 验证获取锁
      expect(mockRedisClient.set).toHaveBeenCalledWith('lock:test-key', '1', 'PX', 5000, 'NX');
      // 验证释放锁
      expect(mockRedisClient.del).toHaveBeenCalledWith('lock:test-key');
    });

    it('should use double-check after acquiring lock', async () => {
      const doubleCheckData = { id: 1, name: 'double-check' };
      mockRedisClient.get
        .mockResolvedValueOnce(null) // 首次检查：缓存未命中
        .mockResolvedValueOnce(JSON.stringify(doubleCheckData)); // 双重检查：已有值
      mockRedisClient.set.mockResolvedValue('OK');
      const fetcher = vi.fn().mockResolvedValue({ id: 2 });

      const result = await redisCacheService.getOrSetWithLock('test-key', fetcher, 300);

      expect(result).toEqual(doubleCheckData);
      expect(fetcher).not.toHaveBeenCalled(); // 双重检查命中，不应调用 fetcher
    });

    it('should retry when lock acquisition fails', async () => {
      const fetchedData = { id: 1, name: 'fetched' };
      mockRedisClient.get
        .mockResolvedValueOnce(null) // 第一次：缓存未命中
        .mockResolvedValueOnce(JSON.stringify(fetchedData)); // 重试后：缓存命中
      mockRedisClient.set.mockResolvedValueOnce(null); // 第一次：获取锁失败

      const fetcher = vi.fn().mockResolvedValue({ id: 2 });

      const result = await redisCacheService.getOrSetWithLock('test-key', fetcher, 300);

      expect(result).toEqual(fetchedData);
      expect(fetcher).not.toHaveBeenCalled(); // 重试后缓存命中
    });

    it('should release lock even when fetcher throws', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValue('OK');
      const fetcher = vi.fn().mockRejectedValue(new Error('Fetcher error'));

      // 由于 fetcher 抛错，getOrSetWithLock 应该 fallback 到 fetcher
      await expect(redisCacheService.getOrSetWithLock('test-key', fetcher, 300)).rejects.toThrow();

      // 验证锁被释放
      expect(mockRedisClient.del).toHaveBeenCalledWith('lock:test-key');
    });

    it('should fallback to fetcher when service is disabled', async () => {
      redisCacheService.disable();
      const fetchedData = { id: 1 };
      const fetcher = vi.fn().mockResolvedValue(fetchedData);

      const result = await redisCacheService.getOrSetWithLock('test-key', fetcher, 300);

      expect(result).toEqual(fetchedData);
      expect(fetcher).toHaveBeenCalledTimes(1);

      redisCacheService.enable();
    });
  });

  describe('setWithJitter - 缓存雪崩防护', () => {
    it('should set value with TTL jitter', async () => {
      const baseTtl = 300;
      const jitterPercent = 0.1;

      await redisCacheService.setWithJitter('test-key', { data: 'value' }, baseTtl, jitterPercent);

      expect(mockRedisClient.setex).toHaveBeenCalled();
      const [, actualTtl] = mockRedisClient.setex.mock.calls[0];

      // TTL 应在 [270, 330] 范围内 (300 ± 10%)
      expect(actualTtl).toBeGreaterThanOrEqual(270);
      expect(actualTtl).toBeLessThanOrEqual(330);
    });

    it('should use default jitter percent of 10%', async () => {
      await redisCacheService.setWithJitter('test-key', { data: 'value' }, 1000);

      expect(mockRedisClient.setex).toHaveBeenCalled();
      const [, actualTtl] = mockRedisClient.setex.mock.calls[0];

      // TTL 应在 [900, 1100] 范围内 (1000 ± 10%)
      expect(actualTtl).toBeGreaterThanOrEqual(900);
      expect(actualTtl).toBeLessThanOrEqual(1100);
    });

    it('should ensure TTL is at least 1', async () => {
      // 使用非常小的 baseTtl
      await redisCacheService.setWithJitter('test-key', { data: 'value' }, 1, 0.9);

      expect(mockRedisClient.setex).toHaveBeenCalled();
      const [, actualTtl] = mockRedisClient.setex.mock.calls[0];

      expect(actualTtl).toBeGreaterThanOrEqual(1);
    });

    it('should return boolean indicating success', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await redisCacheService.setWithJitter('key', 'value', 100);

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      const result = await redisCacheService.setWithJitter('key', 'value', 100);

      expect(result).toBe(false);
    });
  });
});
