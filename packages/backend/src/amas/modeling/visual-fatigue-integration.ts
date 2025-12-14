/**
 * 视觉疲劳集成入口
 *
 * 统一协调所有视觉疲劳相关组件：
 * - DynamicWeightCalculator: 动态权重计算
 * - FatigueFusionEngine: 疲劳融合引擎
 * - CognitiveVisualFusion: 认知视觉融合
 * - ThresholdLearner: 个性化阈值学习
 *
 * 提供简洁的集成 API，简化 AMAS 主流程的集成工作
 */

import type { ProcessedVisualFatigueData, FusedFatigueResult, FusionConfig } from '@danci/shared';
import { FatigueFusionEngine, type FusionInput, type FusionResult } from './fatigue-fusion-engine';
import { DynamicWeightCalculator, type DynamicWeightConfig } from './dynamic-weight-calculator';
import {
  CognitiveVisualFusion,
  type CognitiveVisualFusionConfig,
  type CognitiveFusionResult,
} from './cognitive-visual-fusion';
import {
  ThresholdLearner,
  type ThresholdLearnerConfig,
  type ThresholdObservation,
} from './threshold-learner';

// ==================== 类型定义 ====================

/**
 * 集成配置
 */
export interface VisualFatigueIntegrationConfig {
  /** 是否启用动态权重 */
  enableDynamicWeights: boolean;
  /** 是否启用认知融合 */
  enableCognitiveFusion: boolean;
  /** 是否启用阈值学习 */
  enableThresholdLearning: boolean;
  /** 融合引擎配置 */
  fusionConfig?: Partial<FusionConfig>;
  /** 动态权重配置 */
  weightConfig?: Partial<DynamicWeightConfig>;
  /** 认知融合配置 */
  cognitiveConfig?: Partial<CognitiveVisualFusionConfig>;
  /** 阈值学习配置 */
  thresholdConfig?: Partial<ThresholdLearnerConfig>;
}

/**
 * 默认配置
 */
export const DEFAULT_INTEGRATION_CONFIG: VisualFatigueIntegrationConfig = {
  enableDynamicWeights: true,
  enableCognitiveFusion: true,
  enableThresholdLearning: true,
};

/**
 * 集成处理结果
 */
export interface IntegrationResult {
  /** 融合疲劳度 */
  fusedFatigue: number;
  /** 融合详情 */
  fusionResult: FusionResult;
  /** 认知融合结果 (如果启用) */
  cognitiveFusion?: CognitiveFusionResult;
  /** 是否应用了视觉融合 */
  visualFusionApplied: boolean;
  /** 诊断信息 */
  diagnostics: {
    /** 使用的权重 */
    weights: { visual: number; behavior: number; temporal: number };
    /** 数据置信度 */
    confidence: number;
    /** 数据新鲜度 */
    freshness: number;
    /** 是否有信号冲突 */
    hasConflict: boolean;
    /** 疲劳等级 */
    fatigueLevel: 'alert' | 'mild' | 'moderate' | 'severe';
  };
}

/**
 * 处理输入
 */
export interface IntegrationInput {
  /** 用户ID */
  userId: string;
  /** 行为疲劳度 [0-1] */
  behaviorFatigue: number;
  /** 行为注意力 [0-1] */
  behaviorAttention: number;
  /** 视觉疲劳数据 */
  visualData?: ProcessedVisualFatigueData;
  /** 学习时长 (分钟) */
  studyDurationMinutes: number;
  /** 时间戳 */
  timestamp?: number;
  /** 行为指标 (用于阈值学习) */
  behaviorMetrics?: {
    errorRate: number;
    responseTimeIncrease: number;
    fatigueScore: number;
  };
}

// ==================== 集成类 ====================

/**
 * 视觉疲劳集成入口
 */
export class VisualFatigueIntegration {
  private config: VisualFatigueIntegrationConfig;
  private fusionEngine: FatigueFusionEngine;
  private weightCalculator: DynamicWeightCalculator;
  private cognitiveFusion: CognitiveVisualFusion;
  private thresholdLearner: ThresholdLearner;

  constructor(config: Partial<VisualFatigueIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...config };

    // 初始化各组件
    this.fusionEngine = new FatigueFusionEngine(this.config.fusionConfig, this.config.weightConfig);
    this.weightCalculator = new DynamicWeightCalculator(this.config.weightConfig);
    this.cognitiveFusion = new CognitiveVisualFusion(this.config.cognitiveConfig);
    this.thresholdLearner = new ThresholdLearner(this.config.thresholdConfig);
  }

  /**
   * 处理视觉疲劳数据并返回融合结果
   *
   * 这是主要的集成入口，协调所有组件
   */
  process(input: IntegrationInput): IntegrationResult {
    const {
      userId,
      behaviorFatigue,
      behaviorAttention,
      visualData,
      studyDurationMinutes,
      timestamp = Date.now(),
      behaviorMetrics,
    } = input;

    // 1. 执行疲劳融合
    const fusionInput: FusionInput = {
      userId,
      behaviorFatigue,
      visualData,
      studyDurationMinutes,
      timestamp,
      useDynamicWeights: this.config.enableDynamicWeights,
    };

    const fusionResult = this.fusionEngine.fuse(fusionInput);

    // 2. 执行认知融合 (如果启用)
    let cognitiveFusion: CognitiveFusionResult | undefined;
    if (this.config.enableCognitiveFusion && visualData?.isValid) {
      cognitiveFusion = this.cognitiveFusion.fuse(
        userId,
        behaviorAttention,
        fusionResult.fusedFatigue,
        visualData,
      );
    }

    // 3. 更新阈值学习器 (如果启用)
    if (this.config.enableThresholdLearning && visualData?.isValid && behaviorMetrics) {
      const observation: ThresholdObservation = {
        visual: {
          perclos: visualData.metrics?.perclos ?? 0,
          blinkRate: visualData.metrics?.blinkRate ?? 0,
          fatigueScore: visualData.score,
        },
        behavior: behaviorMetrics,
        timestamp,
      };
      this.thresholdLearner.observe(userId, observation);
    }

    // 构建结果
    const visualFusionApplied = visualData?.isValid ?? false;

    return {
      fusedFatigue: fusionResult.fusedFatigue,
      fusionResult,
      cognitiveFusion,
      visualFusionApplied,
      diagnostics: {
        weights: {
          visual: fusionResult.visualWeight,
          behavior: fusionResult.behaviorWeight,
          temporal: fusionResult.temporalWeight,
        },
        confidence: visualData?.confidence ?? 0,
        freshness: visualData?.freshness ?? 0,
        hasConflict: fusionResult.hasConflict,
        fatigueLevel: fusionResult.fatigueLevel,
      },
    };
  }

  /**
   * 快速处理 - 仅执行疲劳融合
   *
   * 用于不需要认知融合和阈值学习的场景
   */
  quickProcess(
    userId: string,
    behaviorFatigue: number,
    visualData?: ProcessedVisualFatigueData,
    studyDurationMinutes: number = 0,
  ): FusionResult {
    return this.fusionEngine.fuse({
      userId,
      behaviorFatigue,
      visualData,
      studyDurationMinutes,
      useDynamicWeights: this.config.enableDynamicWeights,
    });
  }

  /**
   * 获取用户的个性化阈值
   */
  getPersonalizedThresholds(userId: string) {
    return this.thresholdLearner.getThresholds(userId);
  }

  /**
   * 获取用户的疲劳趋势
   */
  getFatigueTrend(userId: string): number {
    return this.fusionEngine.getTrend(userId);
  }

  /**
   * 获取最新融合结果
   */
  getLatestFusionResult(userId: string): FusionResult | null {
    return this.fusionEngine.getLatest(userId);
  }

  /**
   * 重置用户状态
   */
  resetUser(userId: string): void {
    this.fusionEngine.resetUser(userId);
    this.cognitiveFusion.resetUser(userId);
    this.thresholdLearner.resetUser(userId);
    this.weightCalculator.resetHistory(userId);
  }

  /**
   * 获取组件引用 (高级用法)
   */
  getComponents() {
    return {
      fusionEngine: this.fusionEngine,
      weightCalculator: this.weightCalculator,
      cognitiveFusion: this.cognitiveFusion,
      thresholdLearner: this.thresholdLearner,
    };
  }

  /**
   * 获取用户学习状态统计
   */
  getUserStats(userId: string) {
    const thresholdStatus = this.thresholdLearner.getLearningStatus(userId);
    const visualHistory = this.fusionEngine.getUserVisualHistory(userId);
    const cognitiveState = this.cognitiveFusion.getUserState(userId);

    return {
      thresholdLearning: thresholdStatus,
      visualHistory: visualHistory
        ? {
            sampleCount: visualHistory.sampleCount,
            correlationScore: visualHistory.correlationScore,
            availabilityRate: visualHistory.availabilityRate,
          }
        : null,
      cognitiveState: cognitiveState
        ? {
            fatigueHistoryLength: cognitiveState.fatigueHistory.length,
            estimatedRecoveryRate: cognitiveState.estimatedRecoveryRate,
          }
        : null,
    };
  }

  /**
   * 检查视觉数据是否应该触发保护
   *
   * 使用个性化阈值判断
   */
  shouldTriggerProtection(
    userId: string,
    visualData?: ProcessedVisualFatigueData,
  ): { shouldProtect: boolean; reason?: string; severity: 'low' | 'medium' | 'high' } {
    if (!visualData || !visualData.isValid) {
      return { shouldProtect: false, severity: 'low' };
    }

    const thresholds = this.thresholdLearner.getThresholds(userId);
    const reasons: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    // 检查 PERCLOS
    if (visualData.metrics?.perclos && visualData.metrics.perclos > thresholds.perclos.mean) {
      reasons.push('PERCLOS 过高');
      severity = 'medium';
    }

    // 检查眨眼频率
    if (
      visualData.metrics?.blinkRate &&
      visualData.metrics.blinkRate > thresholds.blinkRate.mean * 1.5
    ) {
      reasons.push('眨眼频率异常');
      if (severity === 'medium') severity = 'high';
      else severity = 'medium';
    }

    // 检查疲劳评分
    if (visualData.score > thresholds.fatigueScore.mean) {
      reasons.push('视觉疲劳评分过高');
      severity = 'high';
    }

    // 检查趋势
    if (visualData.trend > 0.15) {
      reasons.push('疲劳趋势上升');
      if (severity === 'low') severity = 'medium';
    }

    return {
      shouldProtect: reasons.length > 0,
      reason: reasons.length > 0 ? reasons.join(', ') : undefined,
      severity,
    };
  }
}

// ==================== 导出 ====================

/**
 * 创建视觉疲劳集成实例
 */
export function createVisualFatigueIntegration(
  config?: Partial<VisualFatigueIntegrationConfig>,
): VisualFatigueIntegration {
  return new VisualFatigueIntegration(config);
}

/**
 * 默认实例
 */
export const defaultVisualFatigueIntegration = new VisualFatigueIntegration();

// ==================== 便捷函数 ====================

/**
 * 快速融合疲劳数据
 *
 * 使用默认配置执行疲劳融合
 */
export function quickFuseFatigue(
  userId: string,
  behaviorFatigue: number,
  visualData?: ProcessedVisualFatigueData,
  studyDurationMinutes: number = 0,
): FusionResult {
  return defaultVisualFatigueIntegration.quickProcess(
    userId,
    behaviorFatigue,
    visualData,
    studyDurationMinutes,
  );
}

/**
 * 检查是否需要休息
 */
export function shouldSuggestBreak(fusedFatigue: number, threshold: number = 0.6): boolean {
  return fusedFatigue > threshold;
}

/**
 * 检查是否需要强制休息
 */
export function shouldForceBreak(fusedFatigue: number, threshold: number = 0.75): boolean {
  return fusedFatigue > threshold;
}
