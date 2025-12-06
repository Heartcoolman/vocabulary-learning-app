/**
 * AlgorithmConfigService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlgorithmConfigService, ConfigValidationResult } from '../AlgorithmConfigService';
import { AlgorithmConfig, ConfigHistory } from '../../../types/models';

// Mock StorageService
vi.mock('../../StorageService', () => ({
  default: {
    getAlgorithmConfig: vi.fn(),
    updateAlgorithmConfig: vi.fn(),
    resetAlgorithmConfig: vi.fn(),
    getConfigHistory: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  learningLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import StorageService from '../../StorageService';

// 创建有效的模拟配置
const createValidMockConfig = (): AlgorithmConfig => ({
  id: 'config-1',
  name: 'Test Config',
  description: 'Test configuration',
  reviewIntervals: [1, 3, 7, 15, 30],
  consecutiveCorrectThreshold: 5,
  consecutiveWrongThreshold: 3,
  difficultyAdjustmentInterval: 1,
  priorityWeights: {
    newWord: 40,
    errorRate: 30,
    overdueTime: 20,
    wordScore: 10,
  },
  masteryThresholds: [
    { level: 1, requiredCorrectStreak: 1, minAccuracy: 0.5, minScore: 30 },
    { level: 2, requiredCorrectStreak: 2, minAccuracy: 0.6, minScore: 50 },
    { level: 3, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 60 },
    { level: 4, requiredCorrectStreak: 4, minAccuracy: 0.8, minScore: 75 },
    { level: 5, requiredCorrectStreak: 5, minAccuracy: 0.9, minScore: 90 },
  ],
  scoreWeights: {
    accuracy: 40,
    speed: 30,
    stability: 20,
    proficiency: 10,
  },
  speedThresholds: {
    excellent: 3000,
    good: 5000,
    average: 10000,
    slow: 15000,
  },
  newWordRatio: {
    default: 0.3,
    highAccuracy: 0.5,
    lowAccuracy: 0.1,
    highAccuracyThreshold: 0.85,
    lowAccuracyThreshold: 0.65,
  },
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('AlgorithmConfigService', () => {
  let service: AlgorithmConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AlgorithmConfigService();
  });

  describe('loadConfig', () => {
    it('should load config from StorageService', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);

      const config = await service.loadConfig();

      expect(StorageService.getAlgorithmConfig).toHaveBeenCalled();
      expect(config).toEqual(mockConfig);
    });

    it('should return default config when StorageService returns null', async () => {
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(null);

      const config = await service.loadConfig();

      expect(config.name).toBe('默认配置');
      expect(config.isDefault).toBe(true);
    });

    it('should return default config when StorageService throws error', async () => {
      vi.mocked(StorageService.getAlgorithmConfig).mockRejectedValue(new Error('Network error'));

      const config = await service.loadConfig();

      expect(config.name).toBe('默认配置');
    });

    it('should cache the loaded config', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);

      await service.loadConfig();
      await service.getConfig();

      // 第二次获取应该使用缓存
      expect(StorageService.getAlgorithmConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConfig', () => {
    it('should return cached config if available', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);

      await service.loadConfig();
      const config = await service.getConfig();

      expect(config).toEqual(mockConfig);
      expect(StorageService.getAlgorithmConfig).toHaveBeenCalledTimes(1);
    });

    it('should load config if not cached', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);

      const config = await service.getConfig();

      expect(StorageService.getAlgorithmConfig).toHaveBeenCalled();
      expect(config).toEqual(mockConfig);
    });
  });

  describe('updateConfig', () => {
    it('should update config with valid changes', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);
      vi.mocked(StorageService.updateAlgorithmConfig).mockResolvedValue(undefined);

      const updates = { consecutiveCorrectThreshold: 6 };
      const updatedConfig = await service.updateConfig(updates, 'Test update');

      expect(updatedConfig.consecutiveCorrectThreshold).toBe(6);
      expect(StorageService.updateAlgorithmConfig).toHaveBeenCalledWith(
        mockConfig.id,
        updates,
        'Test update'
      );
    });

    it('should throw error for invalid config', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);

      const invalidUpdates = { consecutiveCorrectThreshold: 15 }; // 超出范围 3-10

      await expect(service.updateConfig(invalidUpdates)).rejects.toThrow('配置验证失败');
    });

    it('should throw error when StorageService fails', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);
      vi.mocked(StorageService.updateAlgorithmConfig).mockRejectedValue(new Error('Save failed'));

      const updates = { consecutiveCorrectThreshold: 6 };

      await expect(service.updateConfig(updates)).rejects.toThrow('Save failed');
    });

    it('should update timestamp on successful update', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const mockConfig = createValidMockConfig();
      mockConfig.updatedAt = now - 10000;
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);
      vi.mocked(StorageService.updateAlgorithmConfig).mockResolvedValue(undefined);

      const updatedConfig = await service.updateConfig({ consecutiveCorrectThreshold: 6 });

      expect(updatedConfig.updatedAt).toBe(now);

      vi.useRealTimers();
    });
  });

  describe('resetToDefault', () => {
    it('should reset config to default values', async () => {
      const mockConfig = createValidMockConfig();
      mockConfig.consecutiveCorrectThreshold = 10;
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);
      vi.mocked(StorageService.resetAlgorithmConfig).mockResolvedValue(undefined);

      const resetConfig = await service.resetToDefault();

      expect(resetConfig.name).toBe('默认配置');
      expect(resetConfig.consecutiveCorrectThreshold).toBe(5);
      expect(StorageService.resetAlgorithmConfig).toHaveBeenCalledWith(mockConfig.id);
    });

    it('should preserve config id after reset', async () => {
      const mockConfig = createValidMockConfig();
      mockConfig.id = 'custom-id';
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);
      vi.mocked(StorageService.resetAlgorithmConfig).mockResolvedValue(undefined);

      const resetConfig = await service.resetToDefault();

      expect(resetConfig.id).toBe('custom-id');
    });

    it('should throw error when StorageService fails', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);
      vi.mocked(StorageService.resetAlgorithmConfig).mockRejectedValue(new Error('Reset failed'));

      await expect(service.resetToDefault()).rejects.toThrow('Reset failed');
    });
  });

  describe('getConfigHistory', () => {
    it('should return config history from StorageService', async () => {
      const mockHistory: ConfigHistory[] = [
        {
          id: 'history-1',
          configId: 'config-1',
          changes: { consecutiveCorrectThreshold: 6 },
          changeReason: 'Test change',
          timestamp: Date.now(),
        },
      ];
      vi.mocked(StorageService.getConfigHistory).mockResolvedValue(mockHistory);

      const history = await service.getConfigHistory();

      expect(history).toEqual(mockHistory);
    });

    it('should respect limit parameter', async () => {
      const mockHistory: ConfigHistory[] = [];
      vi.mocked(StorageService.getConfigHistory).mockResolvedValue(mockHistory);

      await service.getConfigHistory(5);

      expect(StorageService.getConfigHistory).toHaveBeenCalledWith(5);
    });

    it('should return cached history on StorageService failure', async () => {
      // 先成功加载历史
      const mockHistory: ConfigHistory[] = [
        {
          id: 'history-1',
          configId: 'config-1',
          changes: { consecutiveCorrectThreshold: 6 },
          changeReason: 'Test change',
          timestamp: Date.now(),
        },
      ];
      vi.mocked(StorageService.getConfigHistory).mockResolvedValueOnce(mockHistory);
      await service.getConfigHistory();

      // 然后模拟失败
      vi.mocked(StorageService.getConfigHistory).mockRejectedValueOnce(new Error('Network error'));

      const history = await service.getConfigHistory();

      expect(history.length).toBe(1);
    });
  });

  describe('validateConfig', () => {
    it('should validate a correct config', () => {
      const config = createValidMockConfig();
      const result = service.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject config with incorrect priority weights sum', () => {
      const config = createValidMockConfig();
      config.priorityWeights.newWord = 50; // 总和变为 110

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('优先级权重总和'))).toBe(true);
    });

    it('should reject config with incorrect score weights sum', () => {
      const config = createValidMockConfig();
      config.scoreWeights.accuracy = 50; // 总和变为 110

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('单词得分权重总和'))).toBe(true);
    });

    it('should reject config with empty review intervals', () => {
      const config = createValidMockConfig();
      config.reviewIntervals = [];

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('复习间隔序列不能为空'))).toBe(true);
    });

    it('should reject config with non-increasing review intervals', () => {
      const config = createValidMockConfig();
      config.reviewIntervals = [1, 3, 2, 7, 15]; // 3 > 2

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('复习间隔序列必须递增'))).toBe(true);
    });

    it('should reject config with negative review intervals', () => {
      const config = createValidMockConfig();
      config.reviewIntervals = [-1, 3, 7, 15, 30];

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('复习间隔必须为正数'))).toBe(true);
    });

    it('should reject config with consecutive correct threshold out of range', () => {
      const config = createValidMockConfig();
      config.consecutiveCorrectThreshold = 2; // < 3

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('连续答对阈值必须在3-10之间'))).toBe(true);
    });

    it('should reject config with consecutive wrong threshold out of range', () => {
      const config = createValidMockConfig();
      config.consecutiveWrongThreshold = 1; // < 2

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('连续答错阈值必须在2-5之间'))).toBe(true);
    });

    it('should reject config with invalid difficulty adjustment interval', () => {
      const config = createValidMockConfig();
      config.difficultyAdjustmentInterval = 0;

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('难度调整间隔必须至少为1'))).toBe(true);
    });

    it('should reject config with empty mastery thresholds', () => {
      const config = createValidMockConfig();
      config.masteryThresholds = [];

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('掌握程度阈值不能为空'))).toBe(true);
    });

    it('should reject config with non-continuous mastery levels', () => {
      const config = createValidMockConfig();
      config.masteryThresholds = [
        { level: 1, requiredCorrectStreak: 1, minAccuracy: 0.5, minScore: 30 },
        { level: 3, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 60 }, // 跳过 level 2
      ];

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('掌握程度级别必须从1开始连续'))).toBe(true);
    });

    it('should reject config with invalid mastery threshold values', () => {
      const config = createValidMockConfig();
      config.masteryThresholds[0].requiredCorrectStreak = 0;
      config.masteryThresholds[1].minAccuracy = 1.5;
      config.masteryThresholds[2].minScore = -10;

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('连续答对次数必须至少为1'))).toBe(true);
      expect(result.errors.some(e => e.includes('最低正确率必须在0-1之间'))).toBe(true);
      expect(result.errors.some(e => e.includes('最低得分必须在0-100之间'))).toBe(true);
    });

    it('should reject config with invalid speed thresholds order', () => {
      const config = createValidMockConfig();
      config.speedThresholds = {
        excellent: 5000,
        good: 3000, // < excellent
        average: 10000,
        slow: 15000,
      };

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('速度阈值必须递增'))).toBe(true);
    });

    it('should reject config with new word ratio out of range', () => {
      const config = createValidMockConfig();
      config.newWordRatio.default = 1.5;

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('默认新单词比例必须在0-1之间'))).toBe(true);
    });

    it('should reject config with low accuracy threshold >= high accuracy threshold', () => {
      const config = createValidMockConfig();
      config.newWordRatio.lowAccuracyThreshold = 0.9;
      config.newWordRatio.highAccuracyThreshold = 0.85;

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('低正确率阈值必须小于高正确率阈值'))).toBe(true);
    });

    it('should collect multiple errors', () => {
      const config = createValidMockConfig();
      config.priorityWeights.newWord = 50; // 总和错误
      config.consecutiveCorrectThreshold = 15; // 超出范围
      config.difficultyAdjustmentInterval = 0; // 无效

      const result = service.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default config with all required fields', () => {
      const config = service.getDefaultConfig();

      expect(config.id).toBe('default');
      expect(config.name).toBe('默认配置');
      expect(config.reviewIntervals).toEqual([1, 3, 7, 15, 30]);
      expect(config.consecutiveCorrectThreshold).toBe(5);
      expect(config.consecutiveWrongThreshold).toBe(3);
      expect(config.isDefault).toBe(true);
    });

    it('should return a valid config', () => {
      const config = service.getDefaultConfig();
      const result = service.validateConfig(config);

      expect(result.isValid).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear cached config', async () => {
      const mockConfig = createValidMockConfig();
      vi.mocked(StorageService.getAlgorithmConfig).mockResolvedValue(mockConfig);

      await service.loadConfig();
      service.clearCache();
      await service.getConfig();

      // 应该重新加载
      expect(StorageService.getAlgorithmConfig).toHaveBeenCalledTimes(2);
    });
  });
});
