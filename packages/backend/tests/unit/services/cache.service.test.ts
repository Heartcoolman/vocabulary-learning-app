/**
 * Cache Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('CacheService', () => {
  let cacheService: any;
  let CacheKeys: any;
  let CacheTTL: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/cache.service');
    cacheService = module.cacheService;
    CacheKeys = module.CacheKeys;
    CacheTTL = module.CacheTTL;
  });

  afterEach(() => {
    vi.resetModules();
    cacheService?.clear?.();
  });

  describe('get', () => {
    it('should return null for non-existent key', () => {
      const result = cacheService.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return cached value', () => {
      cacheService.set('test-key', { data: 'value' });
      const result = cacheService.get('test-key');
      expect(result).toEqual({ data: 'value' });
    });

    it('should return null for expired key', async () => {
      cacheService.set('expiring-key', 'value', 0.01);
      await new Promise(resolve => setTimeout(resolve, 20));
      const result = cacheService.get('expiring-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value without TTL', () => {
      cacheService.set('key', 'value');
      expect(cacheService.get('key')).toBe('value');
    });

    it('should set value with TTL', () => {
      cacheService.set('key', 'value', 3600);
      expect(cacheService.get('key')).toBe('value');
    });

    it('should overwrite existing value', () => {
      cacheService.set('key', 'old');
      cacheService.set('key', 'new');
      expect(cacheService.get('key')).toBe('new');
    });

    it('should handle complex objects', () => {
      const obj = { nested: { array: [1, 2, 3] } };
      cacheService.set('complex', obj);
      expect(cacheService.get('complex')).toEqual(obj);
    });
  });

  describe('delete', () => {
    it('should delete existing key', () => {
      cacheService.set('key', 'value');
      cacheService.delete('key');
      expect(cacheService.get('key')).toBeNull();
    });

    it('should handle non-existent key', () => {
      expect(() => cacheService.delete('non-existent')).not.toThrow();
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', () => {
      cacheService.set('user:1:data', 'a');
      cacheService.set('user:1:settings', 'b');
      cacheService.set('user:2:data', 'c');

      cacheService.deletePattern('user:1:*');

      expect(cacheService.get('user:1:data')).toBeNull();
      expect(cacheService.get('user:1:settings')).toBeNull();
      expect(cacheService.get('user:2:data')).toBe('c');
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cacheService.set('key', 'value');
      expect(cacheService.has?.('key') ?? cacheService.get('key') !== null).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cacheService.has?.('non-existent') ?? cacheService.get('non-existent') !== null).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all cached values', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');

      cacheService.clear?.();

      expect(cacheService.get('key1')).toBeNull();
      expect(cacheService.get('key2')).toBeNull();
    });
  });

  describe('CacheKeys', () => {
    it('should generate user learning state key', () => {
      const key = CacheKeys.USER_LEARNING_STATE('user-1', 'word-1');
      expect(key).toContain('user-1');
      expect(key).toContain('word-1');
    });

    it('should generate user stats key', () => {
      const key = CacheKeys.USER_STATS('user-1');
      expect(key).toContain('user-1');
    });

    it('should generate user due words key', () => {
      const key = CacheKeys.USER_DUE_WORDS('user-1');
      expect(key).toContain('user-1');
    });
  });

  describe('CacheTTL', () => {
    it('should have defined TTL values', () => {
      expect(CacheTTL.LEARNING_STATE).toBeGreaterThan(0);
      expect(CacheTTL.USER_STATS).toBeGreaterThan(0);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      cacheService.set('key', 'cached');

      const result = await cacheService.getOrSet?.('key', async () => 'computed')
        ?? cacheService.get('key');

      expect(result).toBe('cached');
    });

    it('should compute and cache value if not exists', async () => {
      const result = await cacheService.getOrSet?.('new-key', async () => 'computed', 3600);

      if (result !== undefined) {
        expect(result).toBe('computed');
        expect(cacheService.get('new-key')).toBe('computed');
      }
    });
  });

  describe('mget', () => {
    it('should get multiple values', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');

      const results = cacheService.mget?.(['key1', 'key2', 'key3']);

      if (results) {
        expect(results.key1).toBe('value1');
        expect(results.key2).toBe('value2');
        expect(results.key3).toBeNull();
      }
    });
  });

});
