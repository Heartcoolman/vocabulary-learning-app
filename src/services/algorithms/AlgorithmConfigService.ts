import { AlgorithmConfig, ConfigHistory } from '../../types/models';
import StorageService from '../StorageService';

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * 算法配置服务
 * 管理算法参数的获取、更新、验证和历史记录
 */
export class AlgorithmConfigService {
  private currentConfig: AlgorithmConfig | null = null;
  private configHistory: ConfigHistory[] = [];

  /**
   * 加载配置（从 StorageService）
   * 如果后端没有配置，则使用默认配置
   * 
   * @returns 当前配置
   */
  async loadConfig(): Promise<AlgorithmConfig> {
    try {
      // 从 StorageService 加载配置
      const config = await StorageService.getAlgorithmConfig();
      
      if (config) {
        this.currentConfig = config;
        return config;
      }
      
      // 如果没有配置，使用默认配置
      this.currentConfig = this.getDefaultConfig();
      return this.currentConfig;
    } catch (error) {
      console.error('加载配置失败，使用默认配置:', error);
      this.currentConfig = this.getDefaultConfig();
      return this.currentConfig;
    }
  }

  /**
   * 获取当前算法配置
   * 
   * @returns 当前配置
   */
  async getConfig(): Promise<AlgorithmConfig> {
    if (this.currentConfig) {
      return this.currentConfig;
    }

    // 从存储加载配置
    return await this.loadConfig();
  }

  /**
   * 更新算法配置
   *
   * @param updates 要更新的配置字段
   * @param changeReason 修改原因
   * @returns 更新后的配置
   */
  async updateConfig(
    updates: Partial<AlgorithmConfig>,
    changeReason?: string
  ): Promise<AlgorithmConfig> {
    // 获取当前配置
    const currentConfig = await this.getConfig();

    // 验证新配置
    const newConfig = { ...currentConfig, ...updates, updatedAt: Date.now() };
    const validation = this.validateConfig(newConfig);

    if (!validation.isValid) {
      throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
    }

    // 保存新配置到后端
    try {
      await StorageService.updateAlgorithmConfig(currentConfig.id, updates, changeReason);
      this.currentConfig = newConfig;
      console.log(`配置已更新: 原因=${changeReason || '无'}, 时间=${new Date().toLocaleString()}`);
      return newConfig;
    } catch (error) {
      console.error('保存配置到后端失败:', error);
      throw error;
    }
  }

  /**
   * 重置配置为默认值
   *
   * @returns 默认配置
   */
  async resetToDefault(): Promise<AlgorithmConfig> {
    const currentConfig = await this.getConfig();
    const defaultConfig = this.getDefaultConfig();

    // 保存默认配置到后端
    try {
      await StorageService.resetAlgorithmConfig(currentConfig.id);
      this.currentConfig = { ...defaultConfig, id: currentConfig.id };
      console.log(`配置已重置为默认值, 时间=${new Date().toLocaleString()}`);
      return this.currentConfig;
    } catch (error) {
      console.error('重置配置到后端失败:', error);
      throw error;
    }
  }

  /**
   * 获取配置历史记录
   * 
   * @param limit 返回的记录数量限制
   * @returns 配置历史记录列表
   */
  async getConfigHistory(limit?: number): Promise<ConfigHistory[]> {
    try {
      // 从 StorageService 加载历史记录
      const history = await StorageService.getConfigHistory(limit);
      
      // 更新本地缓存
      this.configHistory = history;
      
      return history;
    } catch (error) {
      console.error('获取配置历史失败:', error);
      
      // 如果从后端加载失败，返回本地缓存
      const sortedHistory = [...this.configHistory].sort((a, b) => b.timestamp - a.timestamp);
      
      if (limit && limit > 0) {
        return sortedHistory.slice(0, limit);
      }
      
      return sortedHistory;
    }
  }

  /**
   * 验证配置的合法性
   * 
   * @param config 要验证的配置
   * @returns 验证结果
   */
  validateConfig(config: AlgorithmConfig): ConfigValidationResult {
    const errors: string[] = [];

    // 验证优先级权重总和为100
    const priorityWeightsSum = 
      config.priorityWeights.newWord +
      config.priorityWeights.errorRate +
      config.priorityWeights.overdueTime +
      config.priorityWeights.wordScore;

    if (Math.abs(priorityWeightsSum - 100) > 0.01) {
      errors.push(`优先级权重总和必须为100，当前为${priorityWeightsSum}`);
    }

    // 验证单词得分权重总和为100
    const scoreWeightsSum = 
      config.scoreWeights.accuracy +
      config.scoreWeights.speed +
      config.scoreWeights.stability +
      config.scoreWeights.proficiency;

    if (Math.abs(scoreWeightsSum - 100) > 0.01) {
      errors.push(`单词得分权重总和必须为100，当前为${scoreWeightsSum}`);
    }

    // 验证复习间隔序列
    if (!config.reviewIntervals || config.reviewIntervals.length === 0) {
      errors.push('复习间隔序列不能为空');
    } else {
      // 检查间隔是否递增
      for (let i = 1; i < config.reviewIntervals.length; i++) {
        if (config.reviewIntervals[i] <= config.reviewIntervals[i - 1]) {
          errors.push('复习间隔序列必须递增');
          break;
        }
      }

      // 检查间隔是否为正数
      if (config.reviewIntervals.some(interval => interval <= 0)) {
        errors.push('复习间隔必须为正数');
      }
    }

    // 验证连续答对阈值范围（3-10）
    if (config.consecutiveCorrectThreshold < 3 || config.consecutiveCorrectThreshold > 10) {
      errors.push('连续答对阈值必须在3-10之间');
    }

    // 验证连续答错阈值范围（2-5）
    if (config.consecutiveWrongThreshold < 2 || config.consecutiveWrongThreshold > 5) {
      errors.push('连续答错阈值必须在2-5之间');
    }

    // 验证难度调整间隔
    if (config.difficultyAdjustmentInterval < 1) {
      errors.push('难度调整间隔必须至少为1个会话');
    }

    // 验证掌握程度阈值
    if (!config.masteryThresholds || config.masteryThresholds.length === 0) {
      errors.push('掌握程度阈值不能为空');
    } else {
      // 检查级别是否连续
      const levels = config.masteryThresholds.map(t => t.level).sort((a, b) => a - b);
      for (let i = 0; i < levels.length; i++) {
        if (levels[i] !== i + 1) {
          errors.push('掌握程度级别必须从1开始连续');
          break;
        }
      }

      // 检查阈值是否合理
      for (const threshold of config.masteryThresholds) {
        if (threshold.requiredCorrectStreak < 1) {
          errors.push(`级别${threshold.level}的连续答对次数必须至少为1`);
        }
        if (threshold.minAccuracy < 0 || threshold.minAccuracy > 1) {
          errors.push(`级别${threshold.level}的最低正确率必须在0-1之间`);
        }
        if (threshold.minScore < 0 || threshold.minScore > 100) {
          errors.push(`级别${threshold.level}的最低得分必须在0-100之间`);
        }
      }
    }

    // 验证速度阈值
    if (config.speedThresholds.excellent <= 0 ||
        config.speedThresholds.good <= config.speedThresholds.excellent ||
        config.speedThresholds.average <= config.speedThresholds.good ||
        config.speedThresholds.slow <= config.speedThresholds.average) {
      errors.push('速度阈值必须递增：优秀 < 良好 < 一般 < 较慢');
    }

    // 验证新单词比例
    if (config.newWordRatio.default < 0 || config.newWordRatio.default > 1) {
      errors.push('默认新单词比例必须在0-1之间');
    }
    if (config.newWordRatio.highAccuracy < 0 || config.newWordRatio.highAccuracy > 1) {
      errors.push('高正确率新单词比例必须在0-1之间');
    }
    if (config.newWordRatio.lowAccuracy < 0 || config.newWordRatio.lowAccuracy > 1) {
      errors.push('低正确率新单词比例必须在0-1之间');
    }
    if (config.newWordRatio.highAccuracyThreshold < 0 || config.newWordRatio.highAccuracyThreshold > 1) {
      errors.push('高正确率阈值必须在0-1之间');
    }
    if (config.newWordRatio.lowAccuracyThreshold < 0 || config.newWordRatio.lowAccuracyThreshold > 1) {
      errors.push('低正确率阈值必须在0-1之间');
    }
    if (config.newWordRatio.lowAccuracyThreshold >= config.newWordRatio.highAccuracyThreshold) {
      errors.push('低正确率阈值必须小于高正确率阈值');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取默认配置
   *
   * @returns 默认算法配置
   */
  getDefaultConfig(): AlgorithmConfig {
    return {
      id: 'default',
      name: '默认配置',
      description: '系统默认的算法配置',
      reviewIntervals: [1, 3, 7, 15, 30],
      consecutiveCorrectThreshold: 5,
      consecutiveWrongThreshold: 3,
      difficultyAdjustmentInterval: 1,
      priorityWeights: {
        newWord: 40,
        errorRate: 30,
        overdueTime: 20,
        wordScore: 10
      },
      masteryThresholds: [
        { level: 1, requiredCorrectStreak: 2, minAccuracy: 0.6, minScore: 40 },
        { level: 2, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 50 },
        { level: 3, requiredCorrectStreak: 4, minAccuracy: 0.75, minScore: 60 },
        { level: 4, requiredCorrectStreak: 5, minAccuracy: 0.8, minScore: 70 },
        { level: 5, requiredCorrectStreak: 6, minAccuracy: 0.85, minScore: 80 }
      ],
      scoreWeights: {
        accuracy: 40,
        speed: 30,
        stability: 20,
        proficiency: 10
      },
      speedThresholds: {
        excellent: 3000,
        good: 5000,
        average: 10000,
        slow: 15000
      },
      newWordRatio: {
        default: 0.3,
        highAccuracy: 0.5,
        lowAccuracy: 0.1,
        highAccuracyThreshold: 0.85,
        lowAccuracyThreshold: 0.65
      },
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 清除配置缓存
   */
  clearCache(): void {
    this.currentConfig = null;
  }
}
