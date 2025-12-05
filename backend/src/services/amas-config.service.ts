/**
 * AMAS 配置服务
 * 管理 AMAS 系统的动态配置参数
 *
 * 支持的配置类型：
 * - param_bound: 用户超参数边界 (alpha, fatigueK, motivationRho, optimalDifficulty)
 * - threshold: 调整阈值
 * - reward_weight: 奖励函数权重
 * - safety_threshold: 安全阈值
 */

import prisma from '../config/database';
import { amasLogger } from '../logger';

// ==================== 类型定义 ====================

/**
 * 配置类型
 */
export type AMASConfigType =
  | 'param_bound'
  | 'threshold'
  | 'reward_weight'
  | 'safety_threshold';

/**
 * 参数边界配置
 */
export interface ParamBoundConfig {
  alpha: { min: number; max: number };
  fatigueK: { min: number; max: number };
  motivationRho: { min: number; max: number };
  optimalDifficulty: { min: number; max: number };
}

/**
 * 调整阈值配置
 */
export interface ThresholdConfig {
  highAccuracy: number;
  lowAccuracy: number;
  lowFatigue: number;
  highFatigue: number;
  fastRecoverySlope: number;
  slowRecoverySlope: number;
  motivationImprove: number;
  motivationWorsen: number;
}

/**
 * 奖励权重配置
 */
export interface RewardWeightConfig {
  correct: number;
  fatigue: number;
  speed: number;
  frustration: number;
  engagement: number;
}

/**
 * 安全阈值配置
 */
export interface SafetyThresholdConfig {
  minAttention: number;
  midAttention: number;
  highFatigue: number;
  criticalFatigue: number;
  lowMotivation: number;
  criticalMotivation: number;
  highMotivation: number;
}

/**
 * 完整的 AMAS 配置
 */
export interface AMASConfig {
  paramBounds: ParamBoundConfig;
  thresholds: ThresholdConfig;
  rewardWeights: RewardWeightConfig;
  safetyThresholds: SafetyThresholdConfig;
  version: string;
  updatedAt: Date;
  updatedBy: string;
}

/**
 * 配置更新记录
 */
export interface ConfigUpdateRecord {
  id: string;
  configType: AMASConfigType;
  target: string;
  previousValue: number;
  newValue: number;
  changedBy: string;
  changeReason: string;
  suggestionId?: string;
  createdAt: Date;
}

// ==================== 默认配置 ====================

/** 默认参数边界 */
const DEFAULT_PARAM_BOUNDS: ParamBoundConfig = {
  alpha: { min: 0.3, max: 2.0 },
  fatigueK: { min: 0.02, max: 0.2 },
  motivationRho: { min: 0.6, max: 0.95 },
  optimalDifficulty: { min: 0.2, max: 0.8 }
};

/** 默认调整阈值 */
const DEFAULT_THRESHOLDS: ThresholdConfig = {
  highAccuracy: 0.85,
  lowAccuracy: 0.6,
  lowFatigue: 0.4,
  highFatigue: 0.7,
  fastRecoverySlope: -0.1,
  slowRecoverySlope: 0.1,
  motivationImprove: 0.2,
  motivationWorsen: -0.2
};

/** 默认奖励权重 */
const DEFAULT_REWARD_WEIGHTS: RewardWeightConfig = {
  correct: 1.0,
  fatigue: 0.6,
  speed: 0.4,
  frustration: 0.8,
  engagement: 0.3
};

/** 默认安全阈值 */
const DEFAULT_SAFETY_THRESHOLDS: SafetyThresholdConfig = {
  minAttention: 0.3,
  midAttention: 0.5,
  highFatigue: 0.6,
  criticalFatigue: 0.8,
  lowMotivation: -0.3,
  criticalMotivation: -0.5,
  highMotivation: 0.5
};

// ==================== 配置服务类 ====================

/**
 * AMAS 配置服务
 */
export class AMASConfigService {
  private static instance: AMASConfigService | null = null;

  /** 内存缓存的配置 */
  private cachedConfig: AMASConfig | null = null;

  /** 缓存有效期（毫秒） */
  private readonly cacheTTL = 5 * 60 * 1000; // 5 分钟

  /** 缓存更新时间 */
  private cacheUpdatedAt = 0;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): AMASConfigService {
    if (!AMASConfigService.instance) {
      AMASConfigService.instance = new AMASConfigService();
    }
    return AMASConfigService.instance;
  }

  // ==================== 配置获取 ====================

  /**
   * 获取完整配置（带缓存）
   */
  async getConfig(): Promise<AMASConfig> {
    // 检查缓存是否有效
    if (this.cachedConfig && Date.now() - this.cacheUpdatedAt < this.cacheTTL) {
      return this.cachedConfig;
    }

    // 从数据库加载
    const config = await this.loadConfigFromDB();
    this.cachedConfig = config;
    this.cacheUpdatedAt = Date.now();

    return config;
  }

  /**
   * 获取参数边界
   */
  async getParamBounds(): Promise<ParamBoundConfig> {
    const config = await this.getConfig();
    return config.paramBounds;
  }

  /**
   * 获取调整阈值
   */
  async getThresholds(): Promise<ThresholdConfig> {
    const config = await this.getConfig();
    return config.thresholds;
  }

  /**
   * 获取奖励权重
   */
  async getRewardWeights(): Promise<RewardWeightConfig> {
    const config = await this.getConfig();
    return config.rewardWeights;
  }

  /**
   * 获取安全阈值
   */
  async getSafetyThresholds(): Promise<SafetyThresholdConfig> {
    const config = await this.getConfig();
    return config.safetyThresholds;
  }

  // ==================== 配置更新 ====================

  /**
   * 更新参数边界
   *
   * @param target 参数名称 (alpha, fatigueK, etc.)
   * @param boundType 边界类型 (min/max)
   * @param newValue 新值
   * @param changedBy 变更人
   * @param changeReason 变更原因
   * @param suggestionId 关联的建议ID
   */
  async updateParamBound(
    target: string,
    boundType: 'min' | 'max',
    newValue: number,
    changedBy: string,
    changeReason: string,
    suggestionId?: string
  ): Promise<void> {
    const config = await this.getConfig();
    const fullTarget = `${target}.${boundType}`;

    // 验证参数名称
    if (!(target in config.paramBounds)) {
      throw new Error(`无效的参数边界目标: ${target}`);
    }

    const paramConfig = config.paramBounds[target as keyof ParamBoundConfig];
    const previousValue = paramConfig[boundType];

    // 验证边界合理性
    if (boundType === 'min' && newValue >= paramConfig.max) {
      throw new Error(`最小值 ${newValue} 必须小于最大值 ${paramConfig.max}`);
    }
    if (boundType === 'max' && newValue <= paramConfig.min) {
      throw new Error(`最大值 ${newValue} 必须大于最小值 ${paramConfig.min}`);
    }

    // 更新配置
    const updatedBounds = {
      ...config.paramBounds,
      [target]: {
        ...paramConfig,
        [boundType]: newValue
      }
    };

    await this.saveConfigToDB(
      'param_bound',
      fullTarget,
      previousValue,
      newValue,
      { paramBounds: updatedBounds },
      changedBy,
      changeReason,
      suggestionId
    );

    amasLogger.info({
      type: 'param_bound',
      target: fullTarget,
      previousValue,
      newValue,
      changedBy
    }, '[AMASConfigService] 更新参数边界');
  }

  /**
   * 更新调整阈值
   */
  async updateThreshold(
    target: string,
    newValue: number,
    changedBy: string,
    changeReason: string,
    suggestionId?: string
  ): Promise<void> {
    const config = await this.getConfig();

    // 验证参数名称
    if (!(target in config.thresholds)) {
      throw new Error(`无效的阈值目标: ${target}`);
    }

    const previousValue = config.thresholds[target as keyof ThresholdConfig];

    // 更新配置
    const updatedThresholds = {
      ...config.thresholds,
      [target]: newValue
    };

    await this.saveConfigToDB(
      'threshold',
      target,
      previousValue,
      newValue,
      { thresholds: updatedThresholds },
      changedBy,
      changeReason,
      suggestionId
    );

    amasLogger.info({
      type: 'threshold',
      target,
      previousValue,
      newValue,
      changedBy
    }, '[AMASConfigService] 更新调整阈值');
  }

  /**
   * 更新奖励权重
   */
  async updateRewardWeight(
    target: string,
    newValue: number,
    changedBy: string,
    changeReason: string,
    suggestionId?: string
  ): Promise<void> {
    const config = await this.getConfig();

    // 验证参数名称
    if (!(target in config.rewardWeights)) {
      throw new Error(`无效的奖励权重目标: ${target}`);
    }

    const previousValue = config.rewardWeights[target as keyof RewardWeightConfig];

    // 验证权重范围
    if (newValue < 0 || newValue > 2) {
      throw new Error(`奖励权重 ${newValue} 超出有效范围 [0, 2]`);
    }

    // 更新配置
    const updatedWeights = {
      ...config.rewardWeights,
      [target]: newValue
    };

    await this.saveConfigToDB(
      'reward_weight',
      target,
      previousValue,
      newValue,
      { rewardWeights: updatedWeights },
      changedBy,
      changeReason,
      suggestionId
    );

    amasLogger.info({
      type: 'reward_weight',
      target,
      previousValue,
      newValue,
      changedBy
    }, '[AMASConfigService] 更新奖励权重');
  }

  /**
   * 更新安全阈值
   */
  async updateSafetyThreshold(
    target: string,
    newValue: number,
    changedBy: string,
    changeReason: string,
    suggestionId?: string
  ): Promise<void> {
    const config = await this.getConfig();

    // 验证参数名称
    if (!(target in config.safetyThresholds)) {
      throw new Error(`无效的安全阈值目标: ${target}`);
    }

    const previousValue = config.safetyThresholds[target as keyof SafetyThresholdConfig];

    // 更新配置
    const updatedSafetyThresholds = {
      ...config.safetyThresholds,
      [target]: newValue
    };

    await this.saveConfigToDB(
      'safety_threshold',
      target,
      previousValue,
      newValue,
      { safetyThresholds: updatedSafetyThresholds },
      changedBy,
      changeReason,
      suggestionId
    );

    amasLogger.info({
      type: 'safety_threshold',
      target,
      previousValue,
      newValue,
      changedBy
    }, '[AMASConfigService] 更新安全阈值');
  }

  // ==================== 历史记录 ====================

  /**
   * 获取配置变更历史
   */
  async getConfigHistory(options?: {
    configType?: AMASConfigType;
    limit?: number;
    offset?: number;
  }): Promise<ConfigUpdateRecord[]> {
    const where: Record<string, unknown> = {};

    if (options?.configType) {
      where['configType'] = options.configType;
    }

    const records = await prisma.configHistory.findMany({
      where: where as any,
      orderBy: { timestamp: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0
    });

    return records.map(r => ({
      id: r.id,
      configType: (r.previousValue as any)?.configType ?? 'unknown',
      target: (r.previousValue as any)?.target ?? '',
      previousValue: (r.previousValue as any)?.value ?? 0,
      newValue: (r.newValue as any)?.value ?? 0,
      changedBy: r.changedBy,
      changeReason: r.changeReason ?? '',
      suggestionId: (r.previousValue as any)?.suggestionId,
      createdAt: r.timestamp
    }));
  }

  // ==================== 内部方法 ====================

  /**
   * 从数据库加载配置
   */
  private async loadConfigFromDB(): Promise<AMASConfig> {
    try {
      // 尝试从 AlgorithmConfig 加载 AMAS 相关配置
      const dbConfig = await prisma.algorithmConfig.findFirst({
        where: { name: 'amas_config' },
        orderBy: { createdAt: 'desc' }
      });

      if (dbConfig) {
        // 从数据库中解析 AMAS 配置
        const amasSettings = (dbConfig as any).masteryThresholds as any;

        if (amasSettings?.amasConfig) {
          return {
            paramBounds: amasSettings.amasConfig.paramBounds ?? DEFAULT_PARAM_BOUNDS,
            thresholds: amasSettings.amasConfig.thresholds ?? DEFAULT_THRESHOLDS,
            rewardWeights: amasSettings.amasConfig.rewardWeights ?? DEFAULT_REWARD_WEIGHTS,
            safetyThresholds: amasSettings.amasConfig.safetyThresholds ?? DEFAULT_SAFETY_THRESHOLDS,
            version: amasSettings.amasConfig.version ?? '1.0.0',
            updatedAt: dbConfig.updatedAt,
            updatedBy: dbConfig.createdBy ?? 'system'
          };
        }
      }
    } catch (error) {
      amasLogger.warn({ error }, '[AMASConfigService] 从数据库加载配置失败，使用默认配置');
    }

    // 返回默认配置
    return this.getDefaultConfig();
  }

  /**
   * 保存配置到数据库
   */
  private async saveConfigToDB(
    configType: AMASConfigType,
    target: string,
    previousValue: number,
    newValue: number,
    updates: Partial<AMASConfig>,
    changedBy: string,
    changeReason: string,
    suggestionId?: string
  ): Promise<void> {
    const currentConfig = await this.getConfig();

    // 合并更新
    const newConfig: AMASConfig = {
      ...currentConfig,
      ...updates,
      version: this.incrementVersion(currentConfig.version),
      updatedAt: new Date(),
      updatedBy: changedBy
    };

    // 尝试保存到数据库
    try {
      // 先尝试查找现有的 AMAS 配置
      const existing = await prisma.algorithmConfig.findFirst({
        where: { name: 'amas_config' }
      });

      const amasConfigData = {
        amasConfig: {
          paramBounds: newConfig.paramBounds,
          thresholds: newConfig.thresholds,
          rewardWeights: newConfig.rewardWeights,
          safetyThresholds: newConfig.safetyThresholds,
          version: newConfig.version
        }
      };

      if (existing) {
        // 更新现有配置
        await prisma.algorithmConfig.update({
          where: { id: existing.id },
          data: {
            masteryThresholds: amasConfigData as any
          }
        });

        // 记录配置历史
        await prisma.configHistory.create({
          data: {
            configId: existing.id,
            changedBy,
            changeReason,
            previousValue: {
              configType,
              target,
              value: previousValue,
              suggestionId
            } as any,
            newValue: {
              configType,
              target,
              value: newValue,
              suggestionId
            } as any
          }
        });
      } else {
        // 创建新的 AMAS 配置记录
        const created = await prisma.algorithmConfig.create({
          data: {
            name: 'amas_config',
            description: 'AMAS 系统动态配置',
            reviewIntervals: [1, 3, 7, 14, 30, 60, 90],
            masteryThresholds: amasConfigData as any,
            isDefault: false,
            createdBy: changedBy
          }
        });

        // 记录配置历史
        await prisma.configHistory.create({
          data: {
            configId: created.id,
            changedBy,
            changeReason,
            previousValue: {
              configType,
              target,
              value: previousValue,
              suggestionId
            } as any,
            newValue: {
              configType,
              target,
              value: newValue,
              suggestionId
            } as any
          }
        });
      }
    } catch (error) {
      amasLogger.error({ error }, '[AMASConfigService] 保存配置到数据库失败');
      throw error;
    }

    // 清除缓存
    this.invalidateCache();
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): AMASConfig {
    return {
      paramBounds: { ...DEFAULT_PARAM_BOUNDS },
      thresholds: { ...DEFAULT_THRESHOLDS },
      rewardWeights: { ...DEFAULT_REWARD_WEIGHTS },
      safetyThresholds: { ...DEFAULT_SAFETY_THRESHOLDS },
      version: '1.0.0',
      updatedAt: new Date(),
      updatedBy: 'system'
    };
  }

  /**
   * 增加版本号
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  /**
   * 清除缓存
   */
  private invalidateCache(): void {
    this.cachedConfig = null;
    this.cacheUpdatedAt = 0;
  }

  /**
   * 重置为默认配置
   */
  async resetToDefaults(changedBy: string): Promise<void> {
    const currentConfig = await this.getConfig();

    await this.saveConfigToDB(
      'param_bound',
      'all',
      0,
      0,
      this.getDefaultConfig(),
      changedBy,
      '重置为默认配置'
    );

    amasLogger.info({
      changedBy,
      previousVersion: currentConfig.version
    }, '[AMASConfigService] 配置已重置为默认值');
  }
}

// ==================== 导出 ====================

export const amasConfigService = AMASConfigService.getInstance();
export default amasConfigService;
