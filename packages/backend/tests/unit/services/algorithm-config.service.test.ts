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
      delete: vi.fn(),
    },
    configHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn(),
  },
  CacheKeys: {
    ALGORITHM_CONFIG: 'algorithm_config',
    ALGORITHM_CONFIG_DEFAULT: 'algorithm_config:default',
  },
  CacheTTL: {
    ALGORITHM_CONFIG: 3600,
  },
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
        orderBy: { createdAt: 'desc' },
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

      await expect(service.updateConfig('non-existent', { name: 'new' })).rejects.toThrow(
        '配置不存在',
      );
    });
  });

  describe('deleteConfig', () => {
    it('should delete config and clear cache', async () => {
      prisma.algorithmConfig.delete.mockResolvedValue({});

      await service.deleteConfig('config-1');

      expect(prisma.algorithmConfig.delete).toHaveBeenCalledWith({
        where: { id: 'config-1' },
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
        priorityWeightWordScore: 25,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if priority weights do not sum to 100', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: 30,
        priorityWeightErrorRate: 30,
        priorityWeightOverdueTime: 30,
        priorityWeightWordScore: 30,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('优先级权重总和必须为100%');
    });

    it('should validate consecutive correct threshold range', () => {
      const result = service.validateConfig({
        consecutiveCorrectThreshold: 15,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('连续答对阈值必须在3-10之间');
    });

    it('should validate consecutive wrong threshold range', () => {
      const result = service.validateConfig({
        consecutiveWrongThreshold: 1,
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

  // =============================================
  // 边界条件和错误处理测试
  // =============================================

  describe('getActiveConfig - 边界条件', () => {
    it('should return null when no configs exist in database', async () => {
      cacheService.get.mockReturnValue(null);
      prisma.algorithmConfig.findFirst
        .mockResolvedValueOnce(null) // 没有默认配置
        .mockResolvedValueOnce(null); // 也没有任何配置

      const result = await service.getActiveConfig();

      expect(result).toBeNull();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should not cache null result', async () => {
      cacheService.get.mockReturnValue(null);
      prisma.algorithmConfig.findFirst.mockResolvedValue(null);

      await service.getActiveConfig();

      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('getConfig - 边界条件', () => {
    it('should return null when no latest config exists for empty configId', async () => {
      prisma.algorithmConfig.findFirst.mockResolvedValue(null);

      const result = await service.getConfig();

      expect(result).toBeNull();
    });

    it('should return null when specific config not found', async () => {
      cacheService.get.mockReturnValue(null);
      prisma.algorithmConfig.findUnique.mockResolvedValue(null);

      const result = await service.getConfig('non-existent-id');

      expect(result).toBeNull();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should handle empty string configId', async () => {
      prisma.algorithmConfig.findFirst.mockResolvedValue({ id: 'latest' });

      const result = await service.getConfig('');

      expect(result).toEqual({ id: 'latest' });
    });
  });

  describe('getAllConfigs - 边界条件', () => {
    it('should return empty array when no configs exist', async () => {
      prisma.algorithmConfig.findMany.mockResolvedValue([]);

      const result = await service.getAllConfigs();

      expect(result).toEqual([]);
    });
  });

  describe('updateConfig - 边界条件和错误处理', () => {
    it('should throw error when data is empty', async () => {
      const oldConfig = { id: 'config-1', name: 'old' };
      prisma.algorithmConfig.findUnique.mockResolvedValue(oldConfig);

      await expect(service.updateConfig('config-1', undefined, 'admin')).rejects.toThrow(
        '更新配置数据不能为空',
      );
    });

    it('should throw error when data is null', async () => {
      const oldConfig = { id: 'config-1', name: 'old' };
      prisma.algorithmConfig.findUnique.mockResolvedValue(oldConfig);

      await expect(service.updateConfig('config-1', null as any, 'admin')).rejects.toThrow(
        '更新配置数据不能为空',
      );
    });

    it('should handle updateConfig with object as first parameter (legacy API)', async () => {
      const existingConfig = { id: 'latest-id', name: 'existing' };
      const updatedConfig = { id: 'latest-id', name: 'updated', isDefault: false };

      prisma.algorithmConfig.findFirst.mockResolvedValue(existingConfig);
      prisma.algorithmConfig.findUnique.mockResolvedValue(existingConfig);
      prisma.algorithmConfig.update.mockResolvedValue(updatedConfig);
      prisma.configHistory.create.mockResolvedValue({});

      const result = await service.updateConfig({ name: 'updated' } as any);

      expect(result).toEqual(updatedConfig);
    });

    it('should throw error when no config exists for legacy API call', async () => {
      prisma.algorithmConfig.findFirst.mockResolvedValue(null);

      await expect(service.updateConfig({ name: 'updated' } as any)).rejects.toThrow('配置不存在');
    });

    it('should clear default config cache when updating default config', async () => {
      const oldConfig = { id: 'config-1', name: 'old', isDefault: true };
      const updatedConfig = { id: 'config-1', name: 'new', isDefault: true };
      prisma.algorithmConfig.findUnique.mockResolvedValue(oldConfig);
      prisma.algorithmConfig.update.mockResolvedValue(updatedConfig);
      prisma.configHistory.create.mockResolvedValue({});

      await service.updateConfig('config-1', { name: 'new' }, 'admin');

      expect(cacheService.delete).toHaveBeenCalledWith('algorithm_config:default');
    });
  });

  describe('deleteConfig - 错误处理', () => {
    it('should handle database error during delete', async () => {
      prisma.algorithmConfig.delete.mockRejectedValue(new Error('Database error'));

      await expect(service.deleteConfig('config-1')).rejects.toThrow('Database error');
    });

    it('should handle delete of non-existent config', async () => {
      prisma.algorithmConfig.delete.mockRejectedValue(new Error('Record not found'));

      await expect(service.deleteConfig('non-existent')).rejects.toThrow('Record not found');
    });
  });

  describe('getConfigHistory - 边界条件', () => {
    it('should return empty array when no history exists', async () => {
      prisma.configHistory.findMany.mockResolvedValue([]);

      const result = await service.getConfigHistory('config-1');

      expect(result).toEqual([]);
    });

    it('should use default limit when not provided', async () => {
      prisma.configHistory.findMany.mockResolvedValue([]);

      await service.getConfigHistory('config-1');

      expect(prisma.configHistory.findMany).toHaveBeenCalledWith({
        where: { configId: 'config-1' },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });
    });

    it('should return all history when configId is undefined', async () => {
      prisma.configHistory.findMany.mockResolvedValue([]);

      await service.getConfigHistory(undefined, 10);

      expect(prisma.configHistory.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { timestamp: 'desc' },
        take: 10,
      });
    });

    it('should respect custom limit parameter', async () => {
      prisma.configHistory.findMany.mockResolvedValue([]);

      await service.getConfigHistory('config-1', 100);

      expect(prisma.configHistory.findMany).toHaveBeenCalledWith({
        where: { configId: 'config-1' },
        orderBy: { timestamp: 'desc' },
        take: 100,
      });
    });
  });

  describe('rollbackConfig - 边界条件和错误处理', () => {
    it('should throw error when history record not found', async () => {
      prisma.configHistory.findUnique.mockResolvedValue(null);

      await expect(service.rollbackConfig('non-existent-history')).rejects.toThrow(
        '历史记录不存在',
      );
    });

    it('should handle rollback with valid history record', async () => {
      const history = {
        id: 'history-1',
        configId: 'config-1',
        previousValue: { name: 'old-value', reviewIntervals: [1, 3, 7] },
      };
      const rolledBackConfig = { id: 'config-1', name: 'old-value' };

      prisma.configHistory.findUnique.mockResolvedValue(history);
      prisma.algorithmConfig.update.mockResolvedValue(rolledBackConfig);

      const result = await service.rollbackConfig('history-1');

      expect(result).toEqual(rolledBackConfig);
      expect(cacheService.delete).toHaveBeenCalled();
    });
  });

  describe('resetToDefault - 边界条件和错误处理', () => {
    it('should throw error when default config not found', async () => {
      cacheService.get.mockReturnValue(null);
      prisma.algorithmConfig.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(service.resetToDefault('config-1', 'admin')).rejects.toThrow('默认配置不存在');
    });

    it('should throw error when target config not found', async () => {
      const defaultConfig = { id: 'default', name: 'default' };
      cacheService.get.mockReturnValue(defaultConfig);
      prisma.algorithmConfig.findUnique.mockResolvedValue(null);

      await expect(service.resetToDefault('non-existent', 'admin')).rejects.toThrow('配置不存在');
    });
  });

  describe('validateConfig - 边界条件', () => {
    it('should pass validation for empty config', () => {
      const result = service.validateConfig({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation for exactly 100% priority weights', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: 10,
        priorityWeightErrorRate: 20,
        priorityWeightOverdueTime: 30,
        priorityWeightWordScore: 40,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail validation for priority weights less than 100', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: 10,
        priorityWeightErrorRate: 10,
        priorityWeightOverdueTime: 10,
        priorityWeightWordScore: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('优先级权重总和必须为100%');
    });

    it('should validate score weights sum to 100', () => {
      const result = service.validateConfig({
        scoreWeightAccuracy: 25,
        scoreWeightSpeed: 25,
        scoreWeightStability: 25,
        scoreWeightProficiency: 25,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail when score weights do not sum to 100', () => {
      const result = service.validateConfig({
        scoreWeightAccuracy: 50,
        scoreWeightSpeed: 50,
        scoreWeightStability: 50,
        scoreWeightProficiency: 50,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('单词得分权重总和必须为100%');
    });

    it('should validate consecutiveCorrectThreshold at lower boundary (3)', () => {
      const result = service.validateConfig({
        consecutiveCorrectThreshold: 3,
      });

      expect(result.valid).toBe(true);
    });

    it('should validate consecutiveCorrectThreshold at upper boundary (10)', () => {
      const result = service.validateConfig({
        consecutiveCorrectThreshold: 10,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail for consecutiveCorrectThreshold below minimum (2)', () => {
      const result = service.validateConfig({
        consecutiveCorrectThreshold: 2,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('连续答对阈值必须在3-10之间');
    });

    it('should fail for consecutiveCorrectThreshold above maximum (11)', () => {
      const result = service.validateConfig({
        consecutiveCorrectThreshold: 11,
      });

      expect(result.valid).toBe(false);
    });

    it('should validate consecutiveWrongThreshold at lower boundary (2)', () => {
      const result = service.validateConfig({
        consecutiveWrongThreshold: 2,
      });

      expect(result.valid).toBe(true);
    });

    it('should validate consecutiveWrongThreshold at upper boundary (5)', () => {
      const result = service.validateConfig({
        consecutiveWrongThreshold: 5,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail for consecutiveWrongThreshold above maximum (6)', () => {
      const result = service.validateConfig({
        consecutiveWrongThreshold: 6,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('连续答错阈值必须在2-5之间');
    });

    it('should validate non-empty reviewIntervals array', () => {
      const result = service.validateConfig({
        reviewIntervals: [1, 3, 7, 14],
      });

      expect(result.valid).toBe(true);
    });

    it('should fail for empty reviewIntervals array', () => {
      const result = service.validateConfig({
        reviewIntervals: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('复习间隔必须是非空数组');
    });

    it('should fail for non-array reviewIntervals', () => {
      const result = service.validateConfig({
        reviewIntervals: 'invalid' as any,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('复习间隔必须是非空数组');
    });

    it('should collect multiple validation errors', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: 10,
        priorityWeightErrorRate: 10,
        priorityWeightOverdueTime: 10,
        priorityWeightWordScore: 10,
        consecutiveCorrectThreshold: 1,
        consecutiveWrongThreshold: 10,
        reviewIntervals: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle null values in config gracefully', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: null as any,
        priorityWeightErrorRate: 50,
        priorityWeightOverdueTime: 25,
        priorityWeightWordScore: 25,
      });

      // null || 0 会被转换为0，所以总和是100，验证通过
      expect(result.valid).toBe(true);
    });

    it('should handle undefined values in partial config', () => {
      const result = service.validateConfig({
        priorityWeightNewWord: undefined,
        consecutiveCorrectThreshold: 5,
      });

      // undefined的字段不会触发验证
      expect(result.valid).toBe(true);
    });
  });

  describe('createConfig - 边界条件', () => {
    it('should handle database error during creation', async () => {
      prisma.algorithmConfig.create.mockRejectedValue(new Error('Database constraint violation'));

      await expect(service.createConfig({ name: 'test' })).rejects.toThrow(
        'Database constraint violation',
      );
    });

    it('should create config with minimal data', async () => {
      const newConfig = { id: 'new', isDefault: false };
      prisma.algorithmConfig.create.mockResolvedValue(newConfig);

      const result = await service.createConfig({} as any);

      expect(result).toEqual(newConfig);
    });
  });
});
