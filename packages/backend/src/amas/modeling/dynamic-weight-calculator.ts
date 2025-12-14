/**
 * 动态权重计算器
 *
 * 根据视觉数据置信度、新鲜度、场景和用户历史
 * 动态调整视觉/行为/时间疲劳的融合权重
 *
 * 核心算法：
 * 1. 基于置信度调整: visualWeight *= sqrt(confidence * freshness)
 * 2. 基于历史可靠性调整: visualWeight *= historyReliability
 * 3. 场景适配: 高疲劳场景提升视觉权重
 * 4. 失去的视觉权重按 70%/30% 分配给行为/时间
 */

import type { DynamicWeights, ProcessedVisualFatigueData } from '@danci/shared';

// ==================== 类型定义 ====================

/**
 * 用户视觉历史数据
 */
export interface UserVisualHistory {
  /** 视觉预测与行为的相关性 [0-1] */
  correlationScore: number;
  /** 视觉数据可用率 [0-1] */
  availabilityRate: number;
  /** 历史样本数 */
  sampleCount: number;
  /** 最近 N 次视觉疲劳值 */
  recentScores: number[];
  /** 最近 N 次行为疲劳值 */
  recentBehaviorScores: number[];
}

/**
 * 场景上下文
 */
export interface SceneContext {
  /** 当前行为疲劳 [0-1] */
  behaviorFatigue: number;
  /** 当前视觉疲劳 [0-1] */
  visualFatigue: number;
  /** 学习时长 (分钟) */
  studyDurationMinutes: number;
  /** 当前小时 (0-23) */
  hourOfDay: number;
}

/**
 * 动态权重计算器配置
 */
export interface DynamicWeightConfig {
  /** 基础视觉权重，默认 0.4 */
  baseVisualWeight: number;
  /** 基础行为权重，默认 0.4 */
  baseBehaviorWeight: number;
  /** 基础时间权重，默认 0.2 */
  baseTemporalWeight: number;
  /** 最低置信度阈值，低于此值视觉权重为0 */
  minConfidenceThreshold: number;
  /** 视觉权重转移给行为的比例，默认 0.7 */
  behaviorRedistributionRatio: number;
  /** 高疲劳场景的视觉权重增益，默认 1.3 */
  highFatigueVisualBoost: number;
  /** 冲突场景的视觉权重增益，默认 1.5 */
  conflictVisualBoost: number;
}

/**
 * 默认配置
 */
export const DEFAULT_DYNAMIC_WEIGHT_CONFIG: DynamicWeightConfig = {
  baseVisualWeight: 0.4,
  baseBehaviorWeight: 0.4,
  baseTemporalWeight: 0.2,
  minConfidenceThreshold: 0.2,
  behaviorRedistributionRatio: 0.7,
  highFatigueVisualBoost: 1.3,
  conflictVisualBoost: 1.5,
};

// ==================== 动态权重计算器类 ====================

/**
 * 动态权重计算器
 */
export class DynamicWeightCalculator {
  private config: DynamicWeightConfig;
  private userHistories: Map<string, UserVisualHistory> = new Map();

  constructor(config: Partial<DynamicWeightConfig> = {}) {
    this.config = { ...DEFAULT_DYNAMIC_WEIGHT_CONFIG, ...config };
  }

  /**
   * 计算动态权重
   *
   * @param visualData 视觉疲劳数据
   * @param userId 用户ID (用于历史查询)
   * @param context 场景上下文
   * @returns 动态权重
   */
  calculate(
    visualData: ProcessedVisualFatigueData | undefined,
    userId?: string,
    context?: SceneContext,
  ): DynamicWeights {
    const now = Date.now();

    // 如果没有视觉数据或数据无效，返回降级权重
    if (!visualData || !visualData.isValid) {
      return this.createDegradedWeights(now);
    }

    // 1. 计算置信度因子
    const confidenceFactor = this.calculateConfidenceFactor(
      visualData.confidence,
      visualData.freshness,
    );

    // 2. 获取历史可靠性因子
    const historyReliability = this.getHistoryReliability(userId);

    // 3. 计算综合可信度
    const visualTrustworthiness = confidenceFactor * historyReliability;

    // 4. 计算基础权重
    let rawWeights = this.calculateBaseWeights(visualTrustworthiness);

    // 5. 应用场景适配
    if (context) {
      rawWeights = this.applySceneAdaptation(rawWeights, visualData, context);
    }

    // 6. 归一化权重
    const normalizedWeights = this.normalizeWeights(rawWeights);

    return {
      ...normalizedWeights,
      calculatedAt: now,
    };
  }

  /**
   * 更新用户历史数据
   */
  updateHistory(userId: string, visualScore: number, behaviorScore: number): void {
    let history = this.userHistories.get(userId);

    if (!history) {
      history = {
        correlationScore: 0.5, // 默认中等相关性
        availabilityRate: 1.0,
        sampleCount: 0,
        recentScores: [],
        recentBehaviorScores: [],
      };
    }

    // 更新最近分数 (保留最近 20 个)
    history.recentScores.push(visualScore);
    history.recentBehaviorScores.push(behaviorScore);
    if (history.recentScores.length > 20) {
      history.recentScores.shift();
      history.recentBehaviorScores.shift();
    }

    history.sampleCount++;

    // 计算相关性 (简化的皮尔逊相关系数)
    if (history.recentScores.length >= 5) {
      history.correlationScore = this.calculateCorrelation(
        history.recentScores,
        history.recentBehaviorScores,
      );
    }

    this.userHistories.set(userId, history);
  }

  /**
   * 获取用户历史数据
   */
  getHistory(userId: string): UserVisualHistory | undefined {
    return this.userHistories.get(userId);
  }

  /**
   * 重置用户历史
   */
  resetHistory(userId: string): void {
    this.userHistories.delete(userId);
  }

  // ==================== 私有方法 ====================

  /**
   * 创建降级权重 (视觉不可用时)
   */
  private createDegradedWeights(timestamp: number): DynamicWeights {
    const { baseBehaviorWeight, baseVisualWeight, baseTemporalWeight } = this.config;

    // 视觉权重转移给行为和时间
    const behaviorShare = baseVisualWeight * this.config.behaviorRedistributionRatio;
    const temporalShare = baseVisualWeight * (1 - this.config.behaviorRedistributionRatio);

    const total = baseBehaviorWeight + behaviorShare + baseTemporalWeight + temporalShare;

    return {
      visual: 0,
      behavior: (baseBehaviorWeight + behaviorShare) / total,
      temporal: (baseTemporalWeight + temporalShare) / total,
      calculatedAt: timestamp,
    };
  }

  /**
   * 计算置信度因子
   */
  private calculateConfidenceFactor(confidence: number, freshness: number): number {
    // 使用几何平均数，对低值更敏感
    return Math.sqrt(confidence * freshness);
  }

  /**
   * 获取历史可靠性因子
   */
  private getHistoryReliability(userId?: string): number {
    if (!userId) return 0.5; // 无用户ID时使用默认值

    const history = this.userHistories.get(userId);
    if (!history || history.sampleCount < 5) {
      return 0.5; // 样本不足时使用默认值
    }

    // 相关性越高，可靠性越高
    // 将相关性 [0,1] 映射到 [0.3, 1.0]
    return 0.3 + history.correlationScore * 0.7;
  }

  /**
   * 计算基础权重
   */
  private calculateBaseWeights(visualTrustworthiness: number): {
    visual: number;
    behavior: number;
    temporal: number;
  } {
    const { baseVisualWeight, baseBehaviorWeight, baseTemporalWeight, minConfidenceThreshold } =
      this.config;

    // 如果可信度太低，完全禁用视觉
    if (visualTrustworthiness < minConfidenceThreshold) {
      const behaviorShare = baseVisualWeight * this.config.behaviorRedistributionRatio;
      const temporalShare = baseVisualWeight * (1 - this.config.behaviorRedistributionRatio);

      return {
        visual: 0,
        behavior: baseBehaviorWeight + behaviorShare,
        temporal: baseTemporalWeight + temporalShare,
      };
    }

    // 按可信度比例分配权重
    const effectiveVisualWeight = baseVisualWeight * visualTrustworthiness;
    const redistributedWeight = baseVisualWeight * (1 - visualTrustworthiness);

    const behaviorShare = redistributedWeight * this.config.behaviorRedistributionRatio;
    const temporalShare = redistributedWeight * (1 - this.config.behaviorRedistributionRatio);

    return {
      visual: effectiveVisualWeight,
      behavior: baseBehaviorWeight + behaviorShare,
      temporal: baseTemporalWeight + temporalShare,
    };
  }

  /**
   * 应用场景适配
   */
  private applySceneAdaptation(
    weights: { visual: number; behavior: number; temporal: number },
    visualData: ProcessedVisualFatigueData,
    context: SceneContext,
  ): { visual: number; behavior: number; temporal: number } {
    const result = { ...weights };

    // 场景1: 高疲劳场景 - 视觉信号更可靠
    if (visualData.score > 0.6 && visualData.confidence > 0.7) {
      result.visual *= this.config.highFatigueVisualBoost;
    }

    // 场景2: 冲突场景 - 行为好但视觉差 (可能是生理疲劳)
    if (context.behaviorFatigue < 0.3 && visualData.score > 0.6) {
      result.visual *= this.config.conflictVisualBoost;
    }

    // 场景3: 长时间学习 - 提升时间疲劳权重
    if (context.studyDurationMinutes > 45) {
      result.temporal *= 1.2;
    }

    // 场景4: 夜间学习 - 提升视觉权重 (夜间视觉疲劳更准确)
    if (context.hourOfDay >= 22 || context.hourOfDay < 6) {
      result.visual *= 1.1;
    }

    // 场景5: 疲劳上升趋势 - 提升视觉权重
    if (visualData.trend > 0.1) {
      result.visual *= 1.1;
    }

    return result;
  }

  /**
   * 归一化权重
   */
  private normalizeWeights(weights: { visual: number; behavior: number; temporal: number }): {
    visual: number;
    behavior: number;
    temporal: number;
  } {
    const total = weights.visual + weights.behavior + weights.temporal;

    if (total === 0) {
      // 异常情况，返回默认权重
      return {
        visual: this.config.baseVisualWeight,
        behavior: this.config.baseBehaviorWeight,
        temporal: this.config.baseTemporalWeight,
      };
    }

    return {
      visual: weights.visual / total,
      behavior: weights.behavior / total,
      temporal: weights.temporal / total,
    };
  }

  /**
   * 计算皮尔逊相关系数
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (denominator === 0) return 0;

    // 返回绝对值，因为我们关心的是相关程度而非方向
    const correlation = Math.abs(numerator / denominator);

    // 限制在 [0, 1] 范围
    return Math.max(0, Math.min(1, correlation));
  }
}

// ==================== 导出默认实例 ====================

/**
 * 默认动态权重计算器实例
 */
export const defaultDynamicWeightCalculator = new DynamicWeightCalculator();

/**
 * 创建动态权重计算器
 */
export function createDynamicWeightCalculator(
  config?: Partial<DynamicWeightConfig>,
): DynamicWeightCalculator {
  return new DynamicWeightCalculator(config);
}
