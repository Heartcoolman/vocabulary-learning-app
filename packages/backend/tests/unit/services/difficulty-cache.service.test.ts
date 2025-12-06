/**
 * Difficulty Cache Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  mget: vi.fn(),
  setex: vi.fn(),
  keys: vi.fn(),
  del: vi.fn()
};

vi.mock('../../../src/config/redis', () => ({
  getRedisClient: () => mockRedisClient
}));

describe('DifficultyCacheService', () => {
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/difficulty-cache.service');
    service = module.difficultyCacheService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getCached', () => {
    it('should return cached difficulty value', async () => {
      mockRedisClient.get.mockResolvedValue('0.75');

      const result = await service.getCached('word-1', 'user-1');

      expect(result).toBe(0.75);
      // 服务直接调用 getRedisClient().get()，不再单独调用 connect
      expect(mockRedisClient.get).toHaveBeenCalled();
    });

    it('should return null when not cached', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getCached('word-1', 'user-1');

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Connection failed'));

      const result = await service.getCached('word-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('getCachedBatch', () => {
    it('should return empty object for empty wordIds', async () => {
      const result = await service.getCachedBatch('user-1', []);

      expect(result).toEqual({});
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
    });

    it('should return cached values for multiple words', async () => {
      mockRedisClient.mget.mockResolvedValue(['0.5', '0.8', null]);

      const result = await service.getCachedBatch('user-1', ['w1', 'w2', 'w3']);

      expect(result).toEqual({
        w1: 0.5,
        w2: 0.8
      });
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.mget.mockRejectedValue(new Error('Connection failed'));

      const result = await service.getCachedBatch('user-1', ['w1', 'w2']);

      expect(result).toEqual({});
    });
  });

  describe('setCached', () => {
    it('should set difficulty with TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await service.setCached('word-1', 'user-1', 0.75);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        expect.stringContaining('word_difficulty'),
        3600,
        '0.750000'
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Connection failed'));

      await expect(service.setCached('word-1', 'user-1', 0.5)).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should delete all keys for a word', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'word_difficulty:user-1:word-1',
        'word_difficulty:user-2:word-1'
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      await service.invalidate('word-1');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('word_difficulty:*:word-1');
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should not call del when no keys found', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await service.invalidate('word-1');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Connection failed'));

      await expect(service.invalidate('word-1')).resolves.not.toThrow();
    });
  });
});
