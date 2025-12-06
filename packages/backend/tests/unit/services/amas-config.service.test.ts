/**
 * AMAS Config Service Unit Tests
 * AMAS 配置服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
const mockAlgorithmConfigFindFirst = vi.fn();
const mockAlgorithmConfigCreate = vi.fn();
const mockAlgorithmConfigUpdate = vi.fn();
const mockConfigHistoryCreate = vi.fn();
const mockConfigHistoryFindMany = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    algorithmConfig: {
      findFirst: (...args: any[]) => mockAlgorithmConfigFindFirst(...args),
      create: (...args: any[]) => mockAlgorithmConfigCreate(...args),
      update: (...args: any[]) => mockAlgorithmConfigUpdate(...args)
    },
    configHistory: {
      create: (...args: any[]) => mockConfigHistoryCreate(...args),
      findMany: (...args: any[]) => mockConfigHistoryFindMany(...args)
    }
  }
}));

vi.mock('../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('AMASConfigService', () => {
  let AMASConfigService: any;
  let amasConfigService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const module = await import('../../../src/services/amas-config.service');
    AMASConfigService = module.AMASConfigService;
    // 每次测试创建新实例避免单例状态共享
    amasConfigService = AMASConfigService.getInstance();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getInstance', () => {
    it('should return singleton instance', async () => {
      const module = await import('../../../src/services/amas-config.service');
      const instance1 = module.AMASConfigService.getInstance();
      const instance2 = module.AMASConfigService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('getConfig', () => {
    it('should return default config when database is empty', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);

      const config = await amasConfigService.getConfig();

      expect(config).toBeDefined();
      expect(config.paramBounds).toBeDefined();
      expect(config.thresholds).toBeDefined();
      expect(config.rewardWeights).toBeDefined();
      expect(config.safetyThresholds).toBeDefined();
      expect(config.version).toBe('1.0.0');
    });

    it('should return config from database when available', async () => {
      const mockDbConfig = {
        id: 'config-1',
        name: 'amas_config',
        masteryThresholds: {
          amasConfig: {
            paramBounds: {
              alpha: { min: 0.5, max: 1.5 },
              fatigueK: { min: 0.03, max: 0.15 },
              motivationRho: { min: 0.7, max: 0.9 },
              optimalDifficulty: { min: 0.3, max: 0.7 }
            },
            thresholds: {
              highAccuracy: 0.9,
              lowAccuracy: 0.5,
              lowFatigue: 0.3,
              highFatigue: 0.8,
              fastRecoverySlope: -0.15,
              slowRecoverySlope: 0.15,
              motivationImprove: 0.25,
              motivationWorsen: -0.25
            },
            rewardWeights: {
              correct: 1.0,
              fatigue: 0.5,
              speed: 0.3,
              frustration: 0.7,
              engagement: 0.4
            },
            safetyThresholds: {
              minAttention: 0.25,
              midAttention: 0.45,
              highFatigue: 0.65,
              criticalFatigue: 0.85,
              lowMotivation: -0.35,
              criticalMotivation: -0.55,
              highMotivation: 0.55
            },
            version: '1.2.3'
          }
        },
        updatedAt: new Date(),
        createdBy: 'admin'
      };

      mockAlgorithmConfigFindFirst.mockResolvedValue(mockDbConfig);

      const config = await amasConfigService.getConfig();

      expect(config.paramBounds.alpha.min).toBe(0.5);
      expect(config.thresholds.highAccuracy).toBe(0.9);
      expect(config.rewardWeights.correct).toBe(1.0);
      expect(config.safetyThresholds.minAttention).toBe(0.25);
      expect(config.version).toBe('1.2.3');
    });

    it('should use cache for subsequent calls', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);

      await amasConfigService.getConfig();
      await amasConfigService.getConfig();

      // 由于缓存，只应调用一次数据库查询
      expect(mockAlgorithmConfigFindFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('getParamBounds', () => {
    it('should return param bounds from config', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);

      const bounds = await amasConfigService.getParamBounds();

      expect(bounds.alpha).toBeDefined();
      expect(bounds.alpha.min).toBeDefined();
      expect(bounds.alpha.max).toBeDefined();
      expect(bounds.fatigueK).toBeDefined();
      expect(bounds.motivationRho).toBeDefined();
      expect(bounds.optimalDifficulty).toBeDefined();
    });
  });

  describe('getThresholds', () => {
    it('should return thresholds from config', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);

      const thresholds = await amasConfigService.getThresholds();

      expect(thresholds.highAccuracy).toBeDefined();
      expect(thresholds.lowAccuracy).toBeDefined();
      expect(thresholds.lowFatigue).toBeDefined();
      expect(thresholds.highFatigue).toBeDefined();
    });
  });

  describe('getRewardWeights', () => {
    it('should return reward weights from config', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);

      const weights = await amasConfigService.getRewardWeights();

      expect(weights.correct).toBeDefined();
      expect(weights.fatigue).toBeDefined();
      expect(weights.speed).toBeDefined();
      expect(weights.frustration).toBeDefined();
      expect(weights.engagement).toBeDefined();
    });
  });

  describe('getSafetyThresholds', () => {
    it('should return safety thresholds from config', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);

      const thresholds = await amasConfigService.getSafetyThresholds();

      expect(thresholds.minAttention).toBeDefined();
      expect(thresholds.midAttention).toBeDefined();
      expect(thresholds.highFatigue).toBeDefined();
      expect(thresholds.criticalFatigue).toBeDefined();
    });
  });

  describe('updateParamBound', () => {
    beforeEach(() => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);
    });

    it('should update param bound min value', async () => {
      mockAlgorithmConfigCreate.mockResolvedValue({ id: 'config-new' });
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateParamBound(
        'alpha',
        'min',
        0.4,
        'admin',
        'Test update'
      );

      expect(mockAlgorithmConfigCreate).toHaveBeenCalled();
      expect(mockConfigHistoryCreate).toHaveBeenCalled();
    });

    it('should update param bound max value', async () => {
      mockAlgorithmConfigFindFirst
        .mockResolvedValueOnce(null) // First call for getConfig
        .mockResolvedValueOnce(null); // Second call for saveConfigToDB
      mockAlgorithmConfigCreate.mockResolvedValue({ id: 'config-new' });
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateParamBound(
        'alpha',
        'max',
        1.8,
        'admin',
        'Test update'
      );

      expect(mockAlgorithmConfigCreate).toHaveBeenCalled();
    });

    it('should reject invalid param name', async () => {
      await expect(
        amasConfigService.updateParamBound(
          'invalidParam',
          'min',
          0.5,
          'admin',
          'Test'
        )
      ).rejects.toThrow('无效的参数边界目标');
    });

    it('should reject min value >= max value', async () => {
      await expect(
        amasConfigService.updateParamBound(
          'alpha',
          'min',
          3.0, // Default max is 2.0
          'admin',
          'Test'
        )
      ).rejects.toThrow('最小值');
    });

    it('should reject max value <= min value', async () => {
      await expect(
        amasConfigService.updateParamBound(
          'alpha',
          'max',
          0.1, // Default min is 0.3
          'admin',
          'Test'
        )
      ).rejects.toThrow('最大值');
    });
  });

  describe('updateThreshold', () => {
    beforeEach(() => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);
    });

    it('should update threshold value', async () => {
      mockAlgorithmConfigCreate.mockResolvedValue({ id: 'config-new' });
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateThreshold(
        'highAccuracy',
        0.9,
        'admin',
        'Test update'
      );

      expect(mockAlgorithmConfigCreate).toHaveBeenCalled();
      expect(mockConfigHistoryCreate).toHaveBeenCalled();
    });

    it('should reject invalid threshold name', async () => {
      await expect(
        amasConfigService.updateThreshold(
          'invalidThreshold',
          0.5,
          'admin',
          'Test'
        )
      ).rejects.toThrow('无效的阈值目标');
    });
  });

  describe('updateRewardWeight', () => {
    beforeEach(() => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);
    });

    it('should update reward weight value', async () => {
      mockAlgorithmConfigCreate.mockResolvedValue({ id: 'config-new' });
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateRewardWeight(
        'correct',
        1.2,
        'admin',
        'Test update'
      );

      expect(mockAlgorithmConfigCreate).toHaveBeenCalled();
      expect(mockConfigHistoryCreate).toHaveBeenCalled();
    });

    it('should reject invalid reward weight name', async () => {
      await expect(
        amasConfigService.updateRewardWeight(
          'invalidWeight',
          0.5,
          'admin',
          'Test'
        )
      ).rejects.toThrow('无效的奖励权重目标');
    });

    it('should reject weight out of range (< 0)', async () => {
      await expect(
        amasConfigService.updateRewardWeight(
          'correct',
          -0.5,
          'admin',
          'Test'
        )
      ).rejects.toThrow('奖励权重');
    });

    it('should reject weight out of range (> 2)', async () => {
      await expect(
        amasConfigService.updateRewardWeight(
          'correct',
          2.5,
          'admin',
          'Test'
        )
      ).rejects.toThrow('奖励权重');
    });
  });

  describe('updateSafetyThreshold', () => {
    beforeEach(() => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);
    });

    it('should update safety threshold value', async () => {
      mockAlgorithmConfigCreate.mockResolvedValue({ id: 'config-new' });
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateSafetyThreshold(
        'minAttention',
        0.35,
        'admin',
        'Test update'
      );

      expect(mockAlgorithmConfigCreate).toHaveBeenCalled();
      expect(mockConfigHistoryCreate).toHaveBeenCalled();
    });

    it('should reject invalid safety threshold name', async () => {
      await expect(
        amasConfigService.updateSafetyThreshold(
          'invalidSafetyThreshold',
          0.5,
          'admin',
          'Test'
        )
      ).rejects.toThrow('无效的安全阈值目标');
    });
  });

  describe('getConfigHistory', () => {
    it('should return config change history', async () => {
      const mockHistory = [
        {
          id: 'hist-1',
          previousValue: { configType: 'threshold', target: 'highAccuracy', value: 0.8 },
          newValue: { configType: 'threshold', target: 'highAccuracy', value: 0.9 },
          changedBy: 'admin',
          changeReason: 'Test change',
          timestamp: new Date()
        }
      ];

      mockConfigHistoryFindMany.mockResolvedValue(mockHistory);

      const result = await amasConfigService.getConfigHistory();

      expect(result).toHaveLength(1);
      expect(mockConfigHistoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
          take: 50,
          skip: 0
        })
      );
    });

    it('should filter history by config type', async () => {
      mockConfigHistoryFindMany.mockResolvedValue([]);

      await amasConfigService.getConfigHistory({ configType: 'threshold' });

      expect(mockConfigHistoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { configType: 'threshold' }
        })
      );
    });

    it('should support pagination', async () => {
      mockConfigHistoryFindMany.mockResolvedValue([]);

      await amasConfigService.getConfigHistory({ limit: 10, offset: 20 });

      expect(mockConfigHistoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20
        })
      );
    });
  });

  describe('resetToDefaults', () => {
    it('should reset config to default values', async () => {
      mockAlgorithmConfigFindFirst.mockResolvedValue(null);
      mockAlgorithmConfigCreate.mockResolvedValue({ id: 'config-new' });
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.resetToDefaults('admin');

      expect(mockAlgorithmConfigCreate).toHaveBeenCalled();
      expect(mockConfigHistoryCreate).toHaveBeenCalled();
    });
  });

  describe('config update with existing record', () => {
    it('should update existing config record', async () => {
      // First call for getConfig returns null (default config)
      // Second call for saveConfigToDB check finds existing record
      mockAlgorithmConfigFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-config-id' });
      mockAlgorithmConfigUpdate.mockResolvedValue({});
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateThreshold(
        'highAccuracy',
        0.9,
        'admin',
        'Test update'
      );

      expect(mockAlgorithmConfigUpdate).toHaveBeenCalledWith({
        where: { id: 'existing-config-id' },
        data: expect.objectContaining({
          masteryThresholds: expect.any(Object)
        })
      });
    });
  });

  describe('version incrementing', () => {
    it('should increment patch version on updates', async () => {
      const mockDbConfig = {
        id: 'config-1',
        name: 'amas_config',
        masteryThresholds: {
          amasConfig: {
            paramBounds: {
              alpha: { min: 0.3, max: 2.0 },
              fatigueK: { min: 0.02, max: 0.2 },
              motivationRho: { min: 0.6, max: 0.95 },
              optimalDifficulty: { min: 0.2, max: 0.8 }
            },
            thresholds: {
              highAccuracy: 0.85,
              lowAccuracy: 0.6,
              lowFatigue: 0.4,
              highFatigue: 0.7,
              fastRecoverySlope: -0.1,
              slowRecoverySlope: 0.1,
              motivationImprove: 0.2,
              motivationWorsen: -0.2
            },
            rewardWeights: {
              correct: 1.0,
              fatigue: 0.6,
              speed: 0.4,
              frustration: 0.8,
              engagement: 0.3
            },
            safetyThresholds: {
              minAttention: 0.3,
              midAttention: 0.5,
              highFatigue: 0.6,
              criticalFatigue: 0.8,
              lowMotivation: -0.3,
              criticalMotivation: -0.5,
              highMotivation: 0.5
            },
            version: '1.2.3'
          }
        },
        updatedAt: new Date(),
        createdBy: 'admin'
      };

      mockAlgorithmConfigFindFirst
        .mockResolvedValueOnce(mockDbConfig)
        .mockResolvedValueOnce({ id: 'existing-config-id' });
      mockAlgorithmConfigUpdate.mockResolvedValue({});
      mockConfigHistoryCreate.mockResolvedValue({});

      await amasConfigService.updateThreshold(
        'highAccuracy',
        0.9,
        'admin',
        'Test update'
      );

      // 验证版本号递增
      expect(mockAlgorithmConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            masteryThresholds: expect.objectContaining({
              amasConfig: expect.objectContaining({
                version: '1.2.4'
              })
            })
          })
        })
      );
    });
  });
});
