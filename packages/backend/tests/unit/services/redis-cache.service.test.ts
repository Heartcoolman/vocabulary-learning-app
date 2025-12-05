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
    it('should delete keys matching prefix', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedisClient.del.mockResolvedValue(3);

      const result = await redisCacheService.delByPrefix('key');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('key*');
      expect(result).toBe(3);
    });

    it('should return 0 when no matching keys', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

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
});
