/**
 * 算法配置服务
 * 管理学习算法的配置参数，支持缓存
 */

import { AlgorithmConfig, ConfigHistory, Prisma } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';

/**
 * 配置历史记录创建数据类型
 */
interface ConfigHistoryCreateData {
  configId: string;
  changedBy: string;
  changeReason?: string;
  previousValue: Prisma.InputJsonValue;
  newValue: Prisma.InputJsonValue;
}

/**
 * 扩展的配置历史记录类型（支持可能的字段名变体）
 * 用于处理不同数据库 schema 版本可能存在的字段名差异
 */
interface ExtendedConfigHistory extends ConfigHistory {
  configID?: string; // 可能的旧版字段名
  config?: Prisma.JsonValue; // 可能的旧版字段名
}

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
      where: { isDefault: true },
    });

    // 如果没有默认配置，返回第一个配置
    if (!config) {
      config = await prisma.algorithmConfig.findFirst({
        orderBy: { createdAt: 'asc' },
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
  async getConfig(configId?: string): Promise<AlgorithmConfig | null> {
    // 未提供ID时返回默认/最新配置（兼容测试）
    if (!configId) {
      const latest = await prisma.algorithmConfig.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      return latest;
    }

    const cacheKey = `${CacheKeys.ALGORITHM_CONFIG}:${configId}`;

    // 尝试从缓存获取
    const cached = cacheService.get<AlgorithmConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const config = await prisma.algorithmConfig.findUnique({
      where: { id: configId },
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
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 创建配置
   */
  async createConfig(data: Prisma.AlgorithmConfigCreateInput): Promise<AlgorithmConfig> {
    const config = await prisma.algorithmConfig.create({
      data,
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
    configId: string | Prisma.AlgorithmConfigUpdateInput,
    data?: Prisma.AlgorithmConfigUpdateInput,
    changedBy: string = 'system',
    changeReason?: string,
  ): Promise<AlgorithmConfig> {
    // 兼容省略 configId 的调用：第一个参数即为 data
    if (typeof configId !== 'string') {
      changeReason = changedBy;
      changedBy = 'system';
      data = configId;
      const latest = await prisma.algorithmConfig.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) {
        throw new Error('配置不存在');
      }
      configId = latest.id;
    }

    // 获取旧配置
    const oldConfig = await prisma.algorithmConfig.findUnique({
      where: { id: configId },
    });

    if (!oldConfig) {
      throw new Error('配置不存在');
    }

    if (!data) {
      throw new Error('更新配置数据不能为空');
    }

    // 更新配置
    const updatedConfig = await prisma.algorithmConfig.update({
      where: { id: configId },
      data,
    });

    // 记录配置历史
    const historyData: ConfigHistoryCreateData = {
      configId,
      changedBy,
      changeReason,
      previousValue: oldConfig as unknown as Prisma.InputJsonValue,
      newValue: updatedConfig as unknown as Prisma.InputJsonValue,
    };
    await prisma.configHistory.create({
      data: historyData,
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
      where: { id: configId },
    });

    // 清除缓存
    this.invalidateConfigCache(configId);
  }

  /**
   * 获取配置历史
   */
  async getConfigHistory(configId?: string, limit: number = 50): Promise<ConfigHistory[]> {
    return await prisma.configHistory.findMany({
      where: configId ? { configId } : undefined,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * 回滚到指定历史配置
   */
  async rollbackConfig(historyId: string): Promise<AlgorithmConfig> {
    const history = await prisma.configHistory.findUnique({
      where: { id: historyId },
    });

    if (!history) {
      throw new Error('历史记录不存在');
    }

    // 使用扩展类型处理可能的字段名变体（兼容旧版 schema）
    const extendedHistory = history as ExtendedConfigHistory;
    const configId = history.configId || extendedHistory.configID || historyId;
    const previousValue = history.previousValue || extendedHistory.config;

    const updated = await prisma.algorithmConfig.update({
      where: { id: configId },
      data: previousValue as Prisma.AlgorithmConfigUpdateInput,
    });

    this.invalidateConfigCache(configId);
    return updated;
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
      errors,
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
      where: { id: configId },
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
        // masteryThresholds 需要从 JsonValue 转换为 InputJsonValue
        // JsonValue 可能为 null，但 masteryThresholds 在数据库中不允许为 null
        masteryThresholds: defaultConfig.masteryThresholds as Prisma.InputJsonValue,
      },
    });

    // 记录配置历史
    const resetHistoryData: ConfigHistoryCreateData = {
      configId,
      changedBy,
      changeReason: '重置为默认配置',
      previousValue: oldConfig as unknown as Prisma.InputJsonValue,
      newValue: updatedConfig as unknown as Prisma.InputJsonValue,
    };
    await prisma.configHistory.create({
      data: resetHistoryData,
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
export default algorithmConfigService;
