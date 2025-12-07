/**
 * CachedRepository Tests
 *
 * 测试 AMAS 缓存仓库装饰器：
 * 1. CachedStateRepository - 带缓存的用户状态仓库
 * 2. CachedModelRepository - 带缓存的模型仓库
 *
 * 测试覆盖：
 * - Cache-Aside Pattern 的读写逻辑
 * - 缓存命中/未命中场景
 * - 缓存失效处理
 * - 降级策略
 * - 版本号机制防止竞态条件
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CachedStateRepository, CachedModelRepository } from '../../../../src/amas/repositories/cached-repository';
import { DatabaseStateRepository, DatabaseModelRepository } from '../../../../src/amas/repositories/database-repository';
import { UserState, BanditModel } from '../../../../src/amas/types';
import { redisCacheService, REDIS_CACHE_KEYS } from '../../../../src/services/redis-cache.service';

// Mock 依赖
vi.mock('../../../../src/services/redis-cache.service', () => ({
  redisCacheService: {
    getUserState: vi.fn(),
    setUserState: vi.fn(),
    delUserState: vi.fn(),
    getUserModel: vi.fn(),
    setUserModel: vi.fn(),
    delUserModel: vi.fn(),
  },
  REDIS_CACHE_KEYS: {
    USER_STATE: 'amas:state:',
    USER_MODEL: 'amas:model:',
  },
}));

vi.mock('../../../../src/config/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    eval: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock DatabaseStateRepository
const mockDbStateRepo = {
  loadState: vi.fn(),
  saveState: vi.fn(),
} as unknown as DatabaseStateRepository;

// Mock DatabaseModelRepository
const mockDbModelRepo = {
  loadModel: vi.fn(),
  saveModel: vi.fn(),
} as unknown as DatabaseModelRepository;

// 测试数据
const createMockUserState = (overrides?: Partial<UserState>): UserState => ({
  A: 0.8,
  F: 0.2,
  M: 0.6,
  C: { mem: 0.7, speed: 0.8, stability: 0.75 },
  conf: 0.85,
  ts: Date.now(),
  ...overrides,
});

const createMockBanditModel = (d: number = 4): BanditModel => ({
  A: new Float32Array(d * d).fill(1),
  b: new Float32Array(d).fill(0),
  L: new Float32Array(d * d).fill(0),
  d,
  lambda: 1.0,
  alpha: 1.0,
  updateCount: 10,
});

describe('CachedStateRepository', () => {
  let cachedRepo: CachedStateRepository;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    cachedRepo = new CachedStateRepository(mockDbStateRepo, true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadState', () => {
    it('should return cached state when cache hit', async () => {
      const mockState = createMockUserState();
      const versionedData = { data: mockState, version: Date.now() };
      vi.mocked(redisCacheService.getUserState).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadState(testUserId);

      expect(result).toEqual(mockState);
      expect(redisCacheService.getUserState).toHaveBeenCalledWith(testUserId);
      expect(mockDbStateRepo.loadState).not.toHaveBeenCalled();
    });

    it('should fetch from database when cache miss', async () => {
      const mockState = createMockUserState();
      vi.mocked(redisCacheService.getUserState).mockResolvedValue(null);
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(mockState);
      vi.mocked(redisCacheService.setUserState).mockResolvedValue(true);

      const result = await cachedRepo.loadState(testUserId);

      expect(result).toEqual(mockState);
      expect(redisCacheService.getUserState).toHaveBeenCalledWith(testUserId);
      expect(mockDbStateRepo.loadState).toHaveBeenCalledWith(testUserId);
      expect(redisCacheService.setUserState).toHaveBeenCalled();
    });

    it('should not cache null state from database', async () => {
      vi.mocked(redisCacheService.getUserState).mockResolvedValue(null);
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(null);

      const result = await cachedRepo.loadState(testUserId);

      expect(result).toBeNull();
      expect(redisCacheService.setUserState).not.toHaveBeenCalled();
    });

    it('should fallback to database when cache operation fails', async () => {
      const mockState = createMockUserState();
      vi.mocked(redisCacheService.getUserState).mockRejectedValue(new Error('Redis error'));
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(mockState);

      const result = await cachedRepo.loadState(testUserId);

      expect(result).toEqual(mockState);
      expect(mockDbStateRepo.loadState).toHaveBeenCalledWith(testUserId);
    });

    it('should bypass cache when cache is disabled', async () => {
      const disabledCacheRepo = new CachedStateRepository(mockDbStateRepo, false);
      const mockState = createMockUserState();
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(mockState);

      const result = await disabledCacheRepo.loadState(testUserId);

      expect(result).toEqual(mockState);
      expect(redisCacheService.getUserState).not.toHaveBeenCalled();
    });

    it('should handle versioned cache data correctly', async () => {
      const mockState = createMockUserState();
      const versionedData = {
        data: mockState,
        version: Date.now() - 10000, // Old version
      };
      vi.mocked(redisCacheService.getUserState).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadState(testUserId);

      expect(result).toEqual(mockState);
    });

    it('should return null when versioned data has no data field', async () => {
      vi.mocked(redisCacheService.getUserState).mockResolvedValue({ version: Date.now() } as any);
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(null);

      const result = await cachedRepo.loadState(testUserId);

      expect(result).toBeNull();
      expect(mockDbStateRepo.loadState).toHaveBeenCalled();
    });
  });

  describe('saveState', () => {
    it('should delete cache then save to database', async () => {
      const mockState = createMockUserState();
      vi.mocked(redisCacheService.delUserState).mockResolvedValue(true);
      vi.mocked(mockDbStateRepo.saveState).mockResolvedValue(undefined);

      await cachedRepo.saveState(testUserId, mockState);

      expect(redisCacheService.delUserState).toHaveBeenCalledWith(testUserId);
      expect(mockDbStateRepo.saveState).toHaveBeenCalledWith(testUserId, mockState);
    });

    it('should continue database save even if cache delete fails', async () => {
      const mockState = createMockUserState();
      vi.mocked(redisCacheService.delUserState).mockRejectedValue(new Error('Redis error'));
      vi.mocked(mockDbStateRepo.saveState).mockResolvedValue(undefined);

      await cachedRepo.saveState(testUserId, mockState);

      expect(mockDbStateRepo.saveState).toHaveBeenCalledWith(testUserId, mockState);
    });

    it('should not delete cache when cache is disabled', async () => {
      const disabledCacheRepo = new CachedStateRepository(mockDbStateRepo, false);
      const mockState = createMockUserState();
      vi.mocked(mockDbStateRepo.saveState).mockResolvedValue(undefined);

      await disabledCacheRepo.saveState(testUserId, mockState);

      expect(redisCacheService.delUserState).not.toHaveBeenCalled();
      expect(mockDbStateRepo.saveState).toHaveBeenCalledWith(testUserId, mockState);
    });

    it('should propagate database save errors', async () => {
      const mockState = createMockUserState();
      vi.mocked(redisCacheService.delUserState).mockResolvedValue(true);
      vi.mocked(mockDbStateRepo.saveState).mockRejectedValue(new Error('DB error'));

      await expect(cachedRepo.saveState(testUserId, mockState)).rejects.toThrow('DB error');
    });
  });

  describe('invalidateCache', () => {
    it('should delete user state from cache', async () => {
      vi.mocked(redisCacheService.delUserState).mockResolvedValue(true);

      await cachedRepo.invalidateCache(testUserId);

      expect(redisCacheService.delUserState).toHaveBeenCalledWith(testUserId);
    });

    it('should handle cache delete failure gracefully', async () => {
      vi.mocked(redisCacheService.delUserState).mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cachedRepo.invalidateCache(testUserId)).resolves.toBeUndefined();
    });
  });
});

describe('CachedModelRepository', () => {
  let cachedRepo: CachedModelRepository;
  const testUserId = 'test-user-model-123';

  beforeEach(() => {
    vi.clearAllMocks();
    cachedRepo = new CachedModelRepository(mockDbModelRepo, true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadModel', () => {
    it('should return cached model when cache hit', async () => {
      const mockModel = createMockBanditModel();
      const serializedModel = {
        A: Array.from(mockModel.A),
        b: Array.from(mockModel.b),
        L: Array.from(mockModel.L),
        d: mockModel.d,
        lambda: mockModel.lambda,
        alpha: mockModel.alpha,
        updateCount: mockModel.updateCount,
      };
      const versionedData = { data: serializedModel, version: Date.now() };
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.d).toBe(mockModel.d);
      expect(result?.lambda).toBe(mockModel.lambda);
      expect(redisCacheService.getUserModel).toHaveBeenCalledWith(testUserId);
      expect(mockDbModelRepo.loadModel).not.toHaveBeenCalled();
    });

    it('should fetch from database when cache miss', async () => {
      const mockModel = createMockBanditModel();
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(null);
      vi.mocked(mockDbModelRepo.loadModel).mockResolvedValue(mockModel);
      vi.mocked(redisCacheService.setUserModel).mockResolvedValue(true);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).toEqual(mockModel);
      expect(redisCacheService.getUserModel).toHaveBeenCalledWith(testUserId);
      expect(mockDbModelRepo.loadModel).toHaveBeenCalledWith(testUserId);
      expect(redisCacheService.setUserModel).toHaveBeenCalled();
    });

    it('should not cache null model from database', async () => {
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(null);
      vi.mocked(mockDbModelRepo.loadModel).mockResolvedValue(null);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).toBeNull();
      expect(redisCacheService.setUserModel).not.toHaveBeenCalled();
    });

    it('should fallback to database when cache operation fails', async () => {
      const mockModel = createMockBanditModel();
      vi.mocked(redisCacheService.getUserModel).mockRejectedValue(new Error('Redis error'));
      vi.mocked(mockDbModelRepo.loadModel).mockResolvedValue(mockModel);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).toEqual(mockModel);
      expect(mockDbModelRepo.loadModel).toHaveBeenCalledWith(testUserId);
    });

    it('should bypass cache when cache is disabled', async () => {
      const disabledCacheRepo = new CachedModelRepository(mockDbModelRepo, false);
      const mockModel = createMockBanditModel();
      vi.mocked(mockDbModelRepo.loadModel).mockResolvedValue(mockModel);

      const result = await disabledCacheRepo.loadModel(testUserId);

      expect(result).toEqual(mockModel);
      expect(redisCacheService.getUserModel).not.toHaveBeenCalled();
    });

    it('should deserialize model correctly with L matrix', async () => {
      const d = 4;
      const serializedModel = {
        A: Array(d * d).fill(1),
        b: Array(d).fill(0.5),
        L: Array(d * d).fill(0.1),
        d,
        lambda: 2.0,
        alpha: 0.5,
        updateCount: 20,
      };
      const versionedData = { data: serializedModel, version: Date.now() };
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.d).toBe(d);
      expect(result?.lambda).toBe(2.0);
      expect(result?.alpha).toBe(0.5);
      expect(result?.updateCount).toBe(20);
      expect(result?.A).toBeInstanceOf(Float32Array);
      expect(result?.b).toBeInstanceOf(Float32Array);
      expect(result?.L).toBeInstanceOf(Float32Array);
    });

    it('should compute Cholesky decomposition when L is missing', async () => {
      const d = 4;
      const A = new Float32Array(d * d);
      // Create a valid positive definite matrix (identity)
      for (let i = 0; i < d; i++) {
        A[i * d + i] = 2.0;
      }

      const serializedModel = {
        A: Array.from(A),
        b: Array(d).fill(0),
        // L is missing
        d,
        lambda: 1.0,
        alpha: 1.0,
        updateCount: 5,
      };
      const versionedData = { data: serializedModel, version: Date.now() };
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.L).toBeInstanceOf(Float32Array);
      expect(result?.L.length).toBe(d * d);
    });

    it('should handle missing optional fields with defaults', async () => {
      const d = 4;
      const serializedModel = {
        A: Array(d * d).fill(1),
        b: Array(d).fill(0),
        d,
        // lambda, alpha, updateCount are missing
      };
      const versionedData = { data: serializedModel, version: Date.now() };
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.lambda).toBe(1.0);
      expect(result?.alpha).toBe(1.0);
      expect(result?.updateCount).toBe(0);
    });
  });

  describe('saveModel', () => {
    it('should delete cache then save to database', async () => {
      const mockModel = createMockBanditModel();
      vi.mocked(redisCacheService.delUserModel).mockResolvedValue(true);
      vi.mocked(mockDbModelRepo.saveModel).mockResolvedValue(undefined);

      await cachedRepo.saveModel(testUserId, mockModel);

      expect(redisCacheService.delUserModel).toHaveBeenCalledWith(testUserId);
      expect(mockDbModelRepo.saveModel).toHaveBeenCalledWith(testUserId, mockModel);
    });

    it('should continue database save even if cache delete fails', async () => {
      const mockModel = createMockBanditModel();
      vi.mocked(redisCacheService.delUserModel).mockRejectedValue(new Error('Redis error'));
      vi.mocked(mockDbModelRepo.saveModel).mockResolvedValue(undefined);

      await cachedRepo.saveModel(testUserId, mockModel);

      expect(mockDbModelRepo.saveModel).toHaveBeenCalledWith(testUserId, mockModel);
    });

    it('should not delete cache when cache is disabled', async () => {
      const disabledCacheRepo = new CachedModelRepository(mockDbModelRepo, false);
      const mockModel = createMockBanditModel();
      vi.mocked(mockDbModelRepo.saveModel).mockResolvedValue(undefined);

      await disabledCacheRepo.saveModel(testUserId, mockModel);

      expect(redisCacheService.delUserModel).not.toHaveBeenCalled();
      expect(mockDbModelRepo.saveModel).toHaveBeenCalledWith(testUserId, mockModel);
    });

    it('should propagate database save errors', async () => {
      const mockModel = createMockBanditModel();
      vi.mocked(redisCacheService.delUserModel).mockResolvedValue(true);
      vi.mocked(mockDbModelRepo.saveModel).mockRejectedValue(new Error('DB error'));

      await expect(cachedRepo.saveModel(testUserId, mockModel)).rejects.toThrow('DB error');
    });
  });

  describe('invalidateCache', () => {
    it('should delete user model from cache', async () => {
      vi.mocked(redisCacheService.delUserModel).mockResolvedValue(true);

      await cachedRepo.invalidateCache(testUserId);

      expect(redisCacheService.delUserModel).toHaveBeenCalledWith(testUserId);
    });

    it('should handle cache delete failure gracefully', async () => {
      vi.mocked(redisCacheService.delUserModel).mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cachedRepo.invalidateCache(testUserId)).resolves.toBeUndefined();
    });
  });

  describe('serialization/deserialization', () => {
    it('should correctly serialize Float32Array to number[]', async () => {
      const mockModel = createMockBanditModel(3);
      mockModel.A.set([1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9]);
      mockModel.b.set([0.1, 0.2, 0.3]);

      vi.mocked(redisCacheService.delUserModel).mockResolvedValue(true);
      vi.mocked(mockDbModelRepo.saveModel).mockResolvedValue(undefined);

      await cachedRepo.saveModel(testUserId, mockModel);

      expect(mockDbModelRepo.saveModel).toHaveBeenCalledWith(testUserId, mockModel);
    });

    it('should handle L matrix with wrong length by recomputing', async () => {
      const d = 4;
      const serializedModel = {
        A: Array(d * d).fill(1),
        b: Array(d).fill(0),
        L: [1, 2, 3], // Wrong length
        d,
        lambda: 1.0,
      };
      const versionedData = { data: serializedModel, version: Date.now() };
      vi.mocked(redisCacheService.getUserModel).mockResolvedValue(versionedData);

      const result = await cachedRepo.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.L.length).toBe(d * d);
    });
  });
});

describe('Cache Integration Scenarios', () => {
  let stateRepo: CachedStateRepository;
  let modelRepo: CachedModelRepository;
  const testUserId = 'integration-test-user';

  beforeEach(() => {
    vi.clearAllMocks();
    stateRepo = new CachedStateRepository(mockDbStateRepo, true);
    modelRepo = new CachedModelRepository(mockDbModelRepo, true);
  });

  describe('cache consistency', () => {
    it('should handle concurrent read operations', async () => {
      const mockState = createMockUserState();
      let callCount = 0;

      vi.mocked(redisCacheService.getUserState).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return null; // First call: cache miss
        return { data: mockState, version: Date.now() }; // Subsequent calls: cache hit
      });
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(mockState);
      vi.mocked(redisCacheService.setUserState).mockResolvedValue(true);

      const results = await Promise.all([
        stateRepo.loadState(testUserId),
        stateRepo.loadState(testUserId),
        stateRepo.loadState(testUserId),
      ]);

      results.forEach(result => {
        expect(result).toEqual(mockState);
      });
    });

    it('should handle write-then-read pattern', async () => {
      const initialState = createMockUserState({ A: 0.5 });
      const updatedState = createMockUserState({ A: 0.9 });

      vi.mocked(redisCacheService.delUserState).mockResolvedValue(true);
      vi.mocked(mockDbStateRepo.saveState).mockResolvedValue(undefined);
      vi.mocked(redisCacheService.getUserState).mockResolvedValue(null);
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(updatedState);
      vi.mocked(redisCacheService.setUserState).mockResolvedValue(true);

      await stateRepo.saveState(testUserId, updatedState);
      const result = await stateRepo.loadState(testUserId);

      expect(result).toEqual(updatedState);
    });
  });

  describe('degradation scenarios', () => {
    it('should handle complete Redis failure gracefully', async () => {
      const mockState = createMockUserState();
      const mockModel = createMockBanditModel();

      // Redis completely fails
      vi.mocked(redisCacheService.getUserState).mockRejectedValue(new Error('Connection refused'));
      vi.mocked(redisCacheService.getUserModel).mockRejectedValue(new Error('Connection refused'));
      vi.mocked(redisCacheService.delUserState).mockRejectedValue(new Error('Connection refused'));
      vi.mocked(redisCacheService.delUserModel).mockRejectedValue(new Error('Connection refused'));

      // DB works fine
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(mockState);
      vi.mocked(mockDbStateRepo.saveState).mockResolvedValue(undefined);
      vi.mocked(mockDbModelRepo.loadModel).mockResolvedValue(mockModel);
      vi.mocked(mockDbModelRepo.saveModel).mockResolvedValue(undefined);

      // All operations should still work
      const loadedState = await stateRepo.loadState(testUserId);
      const loadedModel = await modelRepo.loadModel(testUserId);
      await stateRepo.saveState(testUserId, mockState);
      await modelRepo.saveModel(testUserId, mockModel);

      expect(loadedState).toEqual(mockState);
      expect(loadedModel).toEqual(mockModel);
    });

    it('should handle partial cache data', async () => {
      // Versioned data with empty data field
      vi.mocked(redisCacheService.getUserState).mockResolvedValue({ data: null, version: Date.now() });
      vi.mocked(mockDbStateRepo.loadState).mockResolvedValue(createMockUserState());

      const result = await stateRepo.loadState(testUserId);

      expect(result).not.toBeNull();
      expect(mockDbStateRepo.loadState).toHaveBeenCalled();
    });
  });
});
