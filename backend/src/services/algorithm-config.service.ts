/**
 * 算法配置服务
 * 管理学习算法的配置参数，支持缓存
 */

import { AlgorithmConfig, Prisma } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';


export class AlgorithmConfigService {
  /**
   * 获取当前激活的配置（带缓存）
   * 优先返回默认配置，如果没有则返回第一个配置
   */
  async getActiveConfig(): Promise<AlgorithmConfig | null> {
    // 尝试从缓存获取
    const cached = cacheService.get<AlgorithmConfig>(CacheKeys.ALGORITHM_CONFIG_DEFAULT);
    if (cached) {
      return cached;
    }

    // 从数据库查询默认配置
    let config = await prisma.algorithmConfig.findFirst({
      where: { isDefault: true }
    });

    // 如果没有默认配置，返回第一个配置
    if (!config) {
      config = await prisma.algorithmConfig.findFirst({
        orderBy: { createdAt: 'asc' }
      });
    }

    // 存入缓存
    if (config) {
      cacheService.set(CacheKeys.ALGORITHM_CONFIG_DEFAULT, config, CacheTTL.ALGORITHM_CONFIG);
    }

    return config;
  }

  /**
   * 获取默认配置（带缓存）
   */
  async getDefaultConfig(): Promise<AlgorithmConfig | null> {
    return this.getActiveConfig();
  }

  /**
   * 获取指定配置（带缓存）
   */
  async getConfig(configId: string): Promise<AlgorithmConfig | null> {
    const cacheKey = `${CacheKeys.ALGORITHM_CONFIG}:${configId}`;
    
    // 尝试从缓存获取
    const cached = cacheService.get<AlgorithmConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const config = await prisma.algorithmConfig.findUnique({
      where: { id: configId }
    });

    // 存入缓存
    if (config) {
      cacheService.set(cacheKey, config, CacheTTL.ALGORITHM_CONFIG);
    }

    return config;
  }

  /**
   * 获取所有配置
   */
  async getAllConfigs(): Promise<AlgorithmConfig[]> {
    return await prisma.algorithmConfig.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 创建配置
   */
  async createConfig(data: Prisma.AlgorithmConfigCreateInput): Promise<AlgorithmConfig> {
    const config = await prisma.algorithmConfig.create({
      data
    });

    // 如果是默认配置，清除默认配置缓存
    if (config.isDefault) {
      cacheService.delete(CacheKeys.ALGORITHM_CONFIG_DEFAULT);
    }

    return config;
  }

  /**
   * 更新配置
   */
  async updateConfig(
    configId: string,
    data: Prisma.AlgorithmConfigUpdateInput,
    changedBy: string,
    changeReason?: string
  ): Promise<AlgorithmConfig> {
    // 获取旧配置
    const oldConfig = await prisma.algorithmConfig.findUnique({
      where: { id: configId }
    });

    if (!oldConfig) {
      throw new Error('配置不存在');
    }

    // 更新配置
    const updatedConfig = await prisma.algorithmConfig.update({
      where: { id: configId },
      data
    });

    // 记录配置历史
    await prisma.configHistory.create({
      data: {
        configId,
        changedBy,
        changeReason,
        previousValue: oldConfig as any,
        newValue: updatedConfig as any
      }
    });

    // 清除缓存
    this.invalidateConfigCache(configId);
    if (updatedConfig.isDefault) {
      cacheService.delete(CacheKeys.ALGORITHM_CONFIG_DEFAULT);
    }

    return updatedConfig;
  }

  /**
   * 删除配置
   */
  async deleteConfig(configId: string): Promise<void> {
    await prisma.algorithmConfig.delete({
      where: { id: configId }
    });

    // 清除缓存
    this.invalidateConfigCache(configId);
  }

  /**
   * 获取配置历史
   */
  async getConfigHistory(configId?: string, limit: number = 50) {
    return await prisma.configHistory.findMany({
      where: configId ? { configId } : undefined,
      orderBy: { timestamp: 'desc' },
      take: limit
    });
  }

  /**
   * 验证配置
   */
  validateConfig(config: Partial<AlgorithmConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证权重总和
    if (config.priorityWeightNewWord !== undefined) {
      const prioritySum = 
        (config.priorityWeightNewWord || 0) +
        (config.priorityWeightErrorRate || 0) +
        (config.priorityWeightOverdueTime || 0) +
        (config.priorityWeightWordScore || 0);
      
      if (prioritySum !== 100) {
        errors.push('优先级权重总和必须为100%');
      }
    }

    if (config.scoreWeightAccuracy !== undefined) {
      const scoreSum = 
        (config.scoreWeightAccuracy || 0) +
        (config.scoreWeightSpeed || 0) +
        (config.scoreWeightStability || 0) +
        (config.scoreWeightProficiency || 0);
      
      if (scoreSum !== 100) {
        errors.push('单词得分权重总和必须为100%');
      }
    }

    // 验证阈值范围
    if (config.consecutiveCorrectThreshold !== undefined) {
      if (config.consecutiveCorrectThreshold < 3 || config.consecutiveCorrectThreshold > 10) {
        errors.push('连续答对阈值必须在3-10之间');
      }
    }

    if (config.consecutiveWrongThreshold !== undefined) {
      if (config.consecutiveWrongThreshold < 2 || config.consecutiveWrongThreshold > 5) {
        errors.push('连续答错阈值必须在2-5之间');
      }
    }

    // 验证复习间隔
    if (config.reviewIntervals !== undefined) {
      if (!Array.isArray(config.reviewIntervals) || config.reviewIntervals.length === 0) {
        errors.push('复习间隔必须是非空数组');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 重置为默认配置
   */
  async resetToDefault(configId: string, changedBy: string): Promise<AlgorithmConfig> {
    const defaultConfig = await this.getDefaultConfig();
    
    if (!defaultConfig) {
      throw new Error('默认配置不存在');
    }

    // 获取旧配置用于历史记录
    const oldConfig = await prisma.algorithmConfig.findUnique({
      where: { id: configId }
    });

    if (!oldConfig) {
      throw new Error('配置不存在');
    }

    const updatedConfig = await prisma.algorithmConfig.update({
      where: { id: configId },
      data: {
        reviewIntervals: defaultConfig.reviewIntervals,
        consecutiveCorrectThreshold: defaultConfig.consecutiveCorrectThreshold,
        consecutiveWrongThreshold: defaultConfig.consecutiveWrongThreshold,
        difficultyAdjustmentInterval: defaultConfig.difficultyAdjustmentInterval,
        priorityWeightNewWord: defaultConfig.priorityWeightNewWord,
        priorityWeightErrorRate: defaultConfig.priorityWeightErrorRate,
        priorityWeightOverdueTime: defaultConfig.priorityWeightOverdueTime,
        priorityWeightWordScore: defaultConfig.priorityWeightWordScore,
        scoreWeightAccuracy: defaultConfig.scoreWeightAccuracy,
        scoreWeightSpeed: defaultConfig.scoreWeightSpeed,
        scoreWeightStability: defaultConfig.scoreWeightStability,
        scoreWeightProficiency: defaultConfig.scoreWeightProficiency,
        speedThresholdExcellent: defaultConfig.speedThresholdExcellent,
        speedThresholdGood: defaultConfig.speedThresholdGood,
        speedThresholdAverage: defaultConfig.speedThresholdAverage,
        speedThresholdSlow: defaultConfig.speedThresholdSlow,
        newWordRatioDefault: defaultConfig.newWordRatioDefault,
        newWordRatioHighAccuracy: defaultConfig.newWordRatioHighAccuracy,
        newWordRatioLowAccuracy: defaultConfig.newWordRatioLowAccuracy,
        newWordRatioHighAccuracyThreshold: defaultConfig.newWordRatioHighAccuracyThreshold,
        newWordRatioLowAccuracyThreshold: defaultConfig.newWordRatioLowAccuracyThreshold,
        masteryThresholds: defaultConfig.masteryThresholds as any,
      }
    });

    // 记录配置历史
    await prisma.configHistory.create({
      data: {
        configId,
        changedBy,
        changeReason: '重置为默认配置',
        previousValue: oldConfig as any,
        newValue: updatedConfig as any
      }
    });

    // 清除缓存
    this.invalidateConfigCache(configId);

    return updatedConfig;
  }

  /**
   * 清除配置缓存
   */
  private invalidateConfigCache(configId: string): void {
    const cacheKey = `${CacheKeys.ALGORITHM_CONFIG}:${configId}`;
    cacheService.delete(cacheKey);
  }

  /**
   * 清除所有配置缓存
   */
  clearAllCache(): void {
    cacheService.deletePattern(`${CacheKeys.ALGORITHM_CONFIG}*`);
  }
}

export const algorithmConfigService = new AlgorithmConfigService();
