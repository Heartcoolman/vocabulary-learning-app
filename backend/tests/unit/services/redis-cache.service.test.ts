/**
 * Redis Cache Service Tests
 * Redis缓存服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Redis
const mockRedisClient = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  isOpen: true
};

vi.mock('../../../src/config/redis', () => ({
  getRedisClient: () => mockRedisClient
}));

import redisCacheService from '../../../src/services/redis-cache.service';

describe('RedisCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisCacheService.enable(); // 确保服务启用
  });

  describe('get', () => {
    it('应该从Redis获取值并解析JSON', async () => {
      const key = 'test-key';
      const value = { foo: 'bar', count: 42 };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(value));

      const result = await redisCacheService.get(key);

      expect(result).toEqual(value);
      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
    });

    it('应该返回null当键不存在', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await redisCacheService.get('non-existent');

      expect(result).toBeNull();
    });

    it('应该返回null当Redis错误', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection error'));

      const result = await redisCacheService.get('test-key');

      expect(result).toBeNull();
    });

    it('应该返回null当服务禁用', async () => {
      redisCacheService.disable();

      const result = await redisCacheService.get('test-key');

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('应该设置值到Redis', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      const ttl = 300;

      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await redisCacheService.set(key, value, ttl);

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        key,
        ttl,
        JSON.stringify(value)
      );
    });

    it('应该使用默认TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await redisCacheService.set('test-key', { data: 'test' });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test-key',
        300, // 默认TTL
        expect.any(String)
      );
    });

    it('应该返回false当Redis错误', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      const result = await redisCacheService.set('test-key', { data: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('del', () => {
    it('应该删除Redis键', async () => {
      const key = 'test-key';
      mockRedisClient.del.mockResolvedValue(1);

      const result = await redisCacheService.del(key);

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });

    it('应该返回false当删除失败', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      const result = await redisCacheService.del('test-key');

      expect(result).toBe(false);
    });
  });

  describe('delByPrefix', () => {
    it('应该删除匹配前缀的所有键', async () => {
      const prefix = 'user:';
      const matchingKeys = ['user:1', 'user:2', 'user:3'];

      mockRedisClient.keys.mockResolvedValue(matchingKeys);
      mockRedisClient.del.mockResolvedValue(3);

      const count = await redisCacheService.delByPrefix(prefix);

      expect(count).toBe(3);
      expect(mockRedisClient.keys).toHaveBeenCalledWith(`${prefix}*`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(...matchingKeys);
    });

    it('应该返回0当没有匹配的键', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const count = await redisCacheService.delByPrefix('non-existent:');

      expect(count).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('应该返回0当发生错误', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

      const count = await redisCacheService.delByPrefix('test:');

      expect(count).toBe(0);
    });
  });

  describe('用户状态缓存', () => {
    it('应该获取用户状态', async () => {
      const userId = 'user-123';
      const state = { attention: 0.8, fatigue: 0.2 };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(state));

      const result = await redisCacheService.getUserState(userId);

      expect(result).toEqual(state);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`amas:state:${userId}`);
    });

    it('应该设置用户状态', async () => {
      const userId = 'user-123';
      const state = { attention: 0.8, fatigue: 0.2 };

      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await redisCacheService.setUserState(userId, state);

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `amas:state:${userId}`,
        60,
        JSON.stringify(state)
      );
    });

    it('应该删除用户状态', async () => {
      const userId = 'user-123';

      mockRedisClient.del.mockResolvedValue(1);

      const result = await redisCacheService.delUserState(userId);

      expect(result).toBe(true);
    });
  });

  describe('单词状态缓存', () => {
    it('应该获取单词状态', async () => {
      const userId = 'user-123';
      const wordId = 'word-456';
      const state = { masteryLevel: 3, reviewCount: 5 };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(state));

      const result = await redisCacheService.getWordState(userId, wordId);

      expect(result).toEqual(state);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`word:state:${userId}:${wordId}`);
    });

    it('应该设置单词状态', async () => {
      const userId = 'user-123';
      const wordId = 'word-456';
      const state = { masteryLevel: 3 };

      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await redisCacheService.setWordState(userId, wordId, state);

      expect(result).toBe(true);
    });
  });

  describe('启用/禁用', () => {
    it('应该支持禁用和启用', async () => {
      redisCacheService.disable();
      
      const result1 = await redisCacheService.get('test');
      expect(result1).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();

      redisCacheService.enable();
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ test: true }));
      
      const result2 = await redisCacheService.get('test');
      expect(result2).toEqual({ test: true });
    });
  });
});
