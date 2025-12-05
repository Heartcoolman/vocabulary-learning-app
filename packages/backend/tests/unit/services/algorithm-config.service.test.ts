/**
 * Algorithm Config Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    algorithmConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    configHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn()
    }
  }
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn()
  },
  CacheKeys: {
    ALGORITHM_CONFIG: 'algorithm_config',
    ALGORITHM_CONFIG_DEFAULT: 'algorithm_config:default'
  },
  CacheTTL: {
    ALGORITHM_CONFIG: 3600
  }
}));

describe('AlgorithmConfigService', () => {
  let service: any;
  let prisma: any;
  let cacheService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = (await import('../../../src/config/database')).default;
    cacheService = (await import('../../../src/services/cache.service')).cacheService;

    const module = await import('../../../src/services/algorithm-config.service');
    service = module.algorithmConfigService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getActiveConfig', () => {
    it('should return cached config if available', async () => {
      const cachedConfig = { id: 'config-1', isDefault: true };
      cacheService.get.mockReturnValue(cachedConfig);

      const result = await service.getActiveConfig();

      expect(result).toEqual(cachedConfig);
      expect(prisma.algorithmConfig.findFirst).not.toHaveBeenCalled();
    });

    it('should query database if not cached', async () => {
      cacheService.get.mockReturnValue(null);
      const dbConfig = { id: 'config-1', isDefault: true };
      prisma.algorithmConfig.findFirst.mockResolvedValue(dbConfig);

      const result = await service.getActiveConfig();

      expect(result).toEqual(dbConfig);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should return first config if no default exists', async () => {
      cacheService.get.mockReturnValue(null);
      prisma.algorithmConfig.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'config-first' });

      const result = await service.getActiveConfig();

      expect(result).toEqual({ id: 'config-first' });
    });
  });

  describe('getConfig', () => {
    it('should return latest config when no ID provided', async () => {
      const latestConfig = { id: 'latest' };
      prisma.algorithmConfig.findFirst.mockResolvedValue(latestConfig);

      const result = await service.getConfig();

      expect(result).toEqual(latestConfig);
    });

    it('should return cached config by ID', async () => {
      const cachedConfig = { id: 'config-1' };
      cacheService.get.mockReturnValue(cachedConfig);

      const result = await service.getConfig('config-1');

      expect(result).toEqual(cachedConfig);
    });

    it('should query database for specific config', async () => {
      cacheService.get.mockReturnValue(null);
      const dbConfig = { id: 'config-1' };
      prisma.algorithmConfig.findUnique.mockResolvedValue(dbConfig);

      const result = await service.getConfig('config-1');

      expect(result).toEqual(dbConfig);
    });
  });

  describe('getAllConfigs', () => {
    it('should return all configs ordered by createdAt', async () => {
      const configs = [{ id: '1' }, { id: '2' }];
      prisma.algorithmConfig.findMany.mockResolvedValue(configs);

      const result = await service.getAllConfigs();

      expect(result).toEqual(configs);
      expect(prisma.algorithmConfig.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('createConfig', () => {
    it('should create config and clear cache if default', async () => {
      const newConfig = { id: 'new', isDefault: true };
      prisma.algorithmConfig.create.mockResolvedValue(newConfig);

      const result = await service.createConfig({ name: 'test', isDefault: true });

      expect(result).toEqual(newConfig);
      expect(cacheService.delete).toHaveBeenCalled();
    });

    it('should create non-default config without clearing cache', async () => {
      const newConfig = { id: 'new', isDefault: false };
      prisma.algorithmConfig.create.mockResolvedValue(newConfig);

      await service.createConfig({ name: 'test', isDefault: false });

      expect(cacheService.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    it('should update config and record history', async () => {
      const oldConfig = { id: 'config-1', name: 'old' };
      const updatedConfig = { id: 'config-1', name: 'new', isDefault: false };
      prisma.algorithmConfig.findUnique.mockResolvedValue(oldConfig);
      prisma.algorithmConfig.update.mockResolvedValue(updatedConfig);
      prisma.configHistory.create.mockResolvedValue({});

      const result = await service.updateConfig('config-1', { name: 'new' }, 'admin');

      expect(result).toEqual(updatedConfig);
      expect(prisma.configHistory.create).toHaveBeenCalled();
    });

    it('should throw error if config not found', async () => {
      prisma.algorithmConfig.findUnique.mockResolvedValue(null);

      await expect(service.updateConfig('non-existent', { name: 'new' }))
        .rejects.toThrow('配置不存在');
    });
  });

  describe('deleteConfig', () => {
    it('should delete config and clear cache', async () => {
      prisma.algorithmConfig.delete.mockResolvedValue({});

      await service.deleteConfig('config-1');

      expect(prisma.algorithmConfig.delete).toHaveBeenCalledWith({
        where: { id: 'config-1' }
      });
      expect(cacheService.delete).toHaveBeenCalled();
    });
  });

  describe('validateConfig', () => {
    it('should validate priority weights sum to 100', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: 25,
        priorityWeightErrorRate: 25,
        priorityWeightOverdueTime: 25,
        priorityWeightWordScore: 25
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if priority weights do not sum to 100', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: 30,
        priorityWeightErrorRate: 30,
        priorityWeightOverdueTime: 30,
        priorityWeightWordScore: 30
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('优先级权重总和必须为100%');
    });

    it('should validate consecutive correct threshold range', () => {
      const result = service.validateConfig({
        consecutiveCorrectThreshold: 15
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('连续答对阈值必须在3-10之间');
    });

    it('should validate consecutive wrong threshold range', () => {
      const result = service.validateConfig({
        consecutiveWrongThreshold: 1
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('连续答错阈值必须在2-5之间');
    });
  });

  describe('clearAllCache', () => {
    it('should clear all algorithm config cache', () => {
      service.clearAllCache();

      expect(cacheService.deletePattern).toHaveBeenCalledWith('algorithm_config*');
    });
  });
});
