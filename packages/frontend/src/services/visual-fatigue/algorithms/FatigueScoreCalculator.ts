/**
 * 视觉疲劳评分计算器
 *
 * 综合多种视觉疲劳指标计算最终疲劳评分：
 * - PERCLOS (眼睛闭合百分比)
 * - 眨眼频率和持续时间
 * - 打哈欠频率
 * - 头部姿态稳定性
 * - Blendshape 表情分析
 *
 * 疲劳评分公式：
 * VF = w1*PERCLOS + w2*blinkScore + w3*yawnScore + w4*headScore + w5*expressionScore
 */

import type { VisualFatigueMetrics } from '@danci/shared';

/**
 * 疲劳评分权重配置
 */
export interface FatigueScoreWeights {
  /** PERCLOS 权重，默认 0.30 */
  perclos: number;
  /** 眨眼评分权重，默认 0.20 */
  blink: number;
  /** 打哈欠评分权重，默认 0.20 */
  yawn: number;
  /** 头部姿态评分权重，默认 0.15 */
  headPose: number;
  /** 表情评分权重，默认 0.15 */
  expression: number;
}

/**
 * 疲劳评分配置
 */
export interface FatigueScoreConfig {
  /** 权重配置 */
  weights: FatigueScoreWeights;
  /** 平滑因子，默认 0.3 */
  smoothingFactor: number;
  /** 正常眨眼频率（次/分钟），默认 15 */
  normalBlinkRate: number;
  /** 疲劳眨眼频率阈值（次/分钟），默认 25 */
  fatigueBlinkRate: number;
  /** 正常眨眼持续时间（ms），默认 200 */
  normalBlinkDuration: number;
  /** 疲劳眨眼持续时间阈值（ms），默认 400 */
  fatigueBlinkDuration: number;
  /** 打哈欠疲劳阈值（次/5分钟），默认 3 */
  yawnFatigueThreshold: number;
  /** 头部下垂阈值（归一化值），默认 0.3 */
  headDropThreshold: number;
}

/**
 * 默认疲劳评分配置
 */
export const DEFAULT_FATIGUE_SCORE_CONFIG: FatigueScoreConfig = {
  weights: {
    perclos: 0.3,
    blink: 0.2,
    yawn: 0.2,
    headPose: 0.15,
    expression: 0.15,
  },
  smoothingFactor: 0.3,
  normalBlinkRate: 15,
  fatigueBlinkRate: 25,
  normalBlinkDuration: 200,
  fatigueBlinkDuration: 400,
  yawnFatigueThreshold: 3,
  headDropThreshold: 0.3,
};

/**
 * 各项疲劳分数详情
 */
export interface FatigueScoreBreakdown {
  /** PERCLOS 分数 [0-1] */
  perclosScore: number;
  /** 眨眼分数 [0-1] */
  blinkScore: number;
  /** 打哈欠分数 [0-1] */
  yawnScore: number;
  /** 头部姿态分数 [0-1] */
  headPoseScore: number;
  /** 表情分数 [0-1] */
  expressionScore: number;
  /** 综合加权分数 [0-1] */
  totalScore: number;
  /** 置信度 [0-1] */
  confidence: number;
}

/**
 * 输入指标数据
 */
export interface FatigueInputMetrics {
  /** PERCLOS 值 [0-1] */
  perclos: number;
  /** 眨眼频率（次/分钟） */
  blinkRate: number;
  /** 平均眨眼持续时间（ms） */
  avgBlinkDuration: number;
  /** 窗口内打哈欠次数 */
  yawnCount: number;
  /** 头部俯仰角（归一化 [-1,1]） */
  headPitch: number;
  /** 头部稳定性 [0-1] */
  headStability: number;
  /** 是否头部下垂 */
  isHeadDropping: boolean;
  /** 表情疲劳分数 [0-1] */
  expressionFatigueScore: number;
  /** 眯眼强度 [0-1] */
  squintIntensity: number;
  /** 各指标有效性 */
  validity: {
    perclos: boolean;
    blink: boolean;
    yawn: boolean;
    headPose: boolean;
    expression: boolean;
  };
}

/**
 * 视觉疲劳评分计算器类
 */
export class FatigueScoreCalculator {
  private config: FatigueScoreConfig;
  private lastScore: number = 0;
  private scoreHistory: number[] = [];

  constructor(config: Partial<FatigueScoreConfig> = {}) {
    this.config = {
      ...DEFAULT_FATIGUE_SCORE_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_FATIGUE_SCORE_CONFIG.weights,
        ...config.weights,
      },
    };
  }

  /**
   * 计算综合疲劳评分
   * @param metrics 输入指标数据
   */
  calculate(metrics: FatigueInputMetrics): FatigueScoreBreakdown {
    const { weights } = this.config;

    // 计算各项分数
    const perclosScore = this.calculatePerclosScore(metrics.perclos, metrics.validity.perclos);
    const blinkScore = this.calculateBlinkScore(
      metrics.blinkRate,
      metrics.avgBlinkDuration,
      metrics.validity.blink,
    );
    const yawnScore = this.calculateYawnScore(metrics.yawnCount, metrics.validity.yawn);
    const headPoseScore = this.calculateHeadPoseScore(
      metrics.headPitch,
      metrics.headStability,
      metrics.isHeadDropping,
      metrics.validity.headPose,
    );
    const expressionScore = this.calculateExpressionScore(
      metrics.expressionFatigueScore,
      metrics.squintIntensity,
      metrics.validity.expression,
    );

    // 计算置信度（基于有效指标数量）
    const validCount = Object.values(metrics.validity).filter(Boolean).length;
    const confidence = validCount / 5;

    // 加权求和
    let totalScore = 0;
    let totalWeight = 0;

    if (metrics.validity.perclos) {
      totalScore += perclosScore * weights.perclos;
      totalWeight += weights.perclos;
    }
    if (metrics.validity.blink) {
      totalScore += blinkScore * weights.blink;
      totalWeight += weights.blink;
    }
    if (metrics.validity.yawn) {
      totalScore += yawnScore * weights.yawn;
      totalWeight += weights.yawn;
    }
    if (metrics.validity.headPose) {
      totalScore += headPoseScore * weights.headPose;
      totalWeight += weights.headPose;
    }
    if (metrics.validity.expression) {
      totalScore += expressionScore * weights.expression;
      totalWeight += weights.expression;
    }

    // 归一化
    if (totalWeight > 0) {
      totalScore = totalScore / totalWeight;
    }

    // 应用平滑
    const smoothedScore = this.smoothScore(totalScore);

    // 更新历史
    this.addToHistory(smoothedScore);

    return {
      perclosScore,
      blinkScore,
      yawnScore,
      headPoseScore,
      expressionScore,
      totalScore: smoothedScore,
      confidence,
    };
  }

  /**
   * 计算 PERCLOS 分数
   * PERCLOS 0.00-0.10 → 分数 0.0-0.2 (清醒)
   * PERCLOS 0.10-0.15 → 分数 0.2-0.5 (轻度疲劳)
   * PERCLOS 0.15-0.25 → 分数 0.5-0.8 (中度疲劳)
   * PERCLOS 0.25-1.00 → 分数 0.8-1.0 (重度疲劳)
   */
  private calculatePerclosScore(perclos: number, isValid: boolean): number {
    if (!isValid || perclos < 0) return 0;

    if (perclos < 0.1) {
      return (perclos / 0.1) * 0.2;
    } else if (perclos < 0.15) {
      return 0.2 + ((perclos - 0.1) / 0.05) * 0.3;
    } else if (perclos < 0.25) {
      return 0.5 + ((perclos - 0.15) / 0.1) * 0.3;
    } else {
      return Math.min(1, 0.8 + ((perclos - 0.25) / 0.75) * 0.2);
    }
  }

  /**
   * 计算眨眼分数
   * 结合眨眼频率和持续时间
   */
  private calculateBlinkScore(blinkRate: number, avgDuration: number, isValid: boolean): number {
    if (!isValid) return 0;

    const { normalBlinkRate, fatigueBlinkRate, normalBlinkDuration, fatigueBlinkDuration } =
      this.config;

    // 眨眼频率分数
    // 正常: 15次/分钟, 疲劳: >25次/分钟
    let rateScore = 0;
    if (blinkRate <= normalBlinkRate) {
      rateScore = 0;
    } else if (blinkRate >= fatigueBlinkRate) {
      rateScore = 1;
    } else {
      rateScore = (blinkRate - normalBlinkRate) / (fatigueBlinkRate - normalBlinkRate);
    }

    // 眨眼持续时间分数
    // 正常: ~200ms, 疲劳: >400ms
    let durationScore = 0;
    if (avgDuration <= normalBlinkDuration) {
      durationScore = 0;
    } else if (avgDuration >= fatigueBlinkDuration) {
      durationScore = 1;
    } else {
      durationScore =
        (avgDuration - normalBlinkDuration) / (fatigueBlinkDuration - normalBlinkDuration);
    }

    // 综合（频率权重略高）
    return rateScore * 0.6 + durationScore * 0.4;
  }

  /**
   * 计算打哈欠分数
   * 5分钟内打哈欠次数
   */
  private calculateYawnScore(yawnCount: number, isValid: boolean): number {
    if (!isValid) return 0;

    const threshold = this.config.yawnFatigueThreshold;

    if (yawnCount === 0) {
      return 0;
    } else if (yawnCount >= threshold) {
      return 1;
    } else {
      return yawnCount / threshold;
    }
  }

  /**
   * 计算头部姿态分数
   * 结合头部下垂和稳定性
   */
  private calculateHeadPoseScore(
    pitch: number,
    stability: number,
    isDropping: boolean,
    isValid: boolean,
  ): number {
    if (!isValid) return 0;

    // 头部下垂分数（pitch > 0 表示低头）
    let dropScore = 0;
    const threshold = this.config.headDropThreshold;
    if (pitch > 0) {
      dropScore = Math.min(1, pitch / threshold);
    }

    // 如果检测到头部下垂，直接给高分
    if (isDropping) {
      dropScore = Math.max(dropScore, 0.8);
    }

    // 不稳定性分数（1 - stability）
    const instabilityScore = 1 - stability;

    // 综合（下垂权重更高）
    return dropScore * 0.7 + instabilityScore * 0.3;
  }

  /**
   * 计算表情分数
   */
  private calculateExpressionScore(
    fatigueScore: number,
    squintIntensity: number,
    isValid: boolean,
  ): number {
    if (!isValid) return 0;

    // 眯眼是疲劳的重要信号
    const squintScore = Math.min(1, squintIntensity * 2);

    // 综合
    return fatigueScore * 0.6 + squintScore * 0.4;
  }

  /**
   * 应用指数平滑
   */
  private smoothScore(score: number): number {
    const alpha = this.config.smoothingFactor;
    const smoothed = alpha * score + (1 - alpha) * this.lastScore;
    this.lastScore = smoothed;
    return smoothed;
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(score: number): void {
    this.scoreHistory.push(score);
    if (this.scoreHistory.length > 60) {
      this.scoreHistory.shift();
    }
  }

  /**
   * 获取疲劳等级
   */
  getFatigueLevel(score: number): 'alert' | 'mild' | 'moderate' | 'severe' {
    if (score < 0.25) return 'alert';
    if (score < 0.5) return 'mild';
    if (score < 0.75) return 'moderate';
    return 'severe';
  }

  /**
   * 获取疲劳趋势
   * 返回正值表示疲劳加重，负值表示恢复
   */
  getFatigueTrend(): number {
    if (this.scoreHistory.length < 10) {
      return 0;
    }

    // 比较最近 10 个和之前 10 个的平均值
    const recent = this.scoreHistory.slice(-10);
    const earlier = this.scoreHistory.slice(-20, -10);

    if (earlier.length < 10) {
      return 0;
    }

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    return recentAvg - earlierAvg;
  }

  /**
   * 获取当前疲劳评分
   */
  getCurrentScore(): number {
    return this.lastScore;
  }

  /**
   * 更新权重配置
   */
  setWeights(weights: Partial<FatigueScoreWeights>): void {
    this.config.weights = { ...this.config.weights, ...weights };
  }

  /**
   * 重置计算器
   */
  reset(): void {
    this.lastScore = 0;
    this.scoreHistory = [];
  }

  /**
   * 从 VisualFatigueMetrics 构建输入
   */
  static buildInputFromMetrics(metrics: Partial<VisualFatigueMetrics>): FatigueInputMetrics {
    // 判断表情数据是否有效
    const hasExpressionData =
      (metrics.expressionFatigueScore !== undefined && metrics.expressionFatigueScore > 0) ||
      (metrics.squintIntensity !== undefined && metrics.squintIntensity > 0) ||
      (metrics.blendshapeAnalysis !== undefined && metrics.blendshapeAnalysis.confidence > 0);

    return {
      perclos: metrics.perclos ?? 0,
      blinkRate: metrics.blinkRate ?? 0,
      avgBlinkDuration: metrics.avgBlinkDuration ?? 0,
      yawnCount: metrics.yawnCount ?? 0,
      headPitch: metrics.headPose?.pitch ?? 0,
      headStability: 1, // 默认稳定
      isHeadDropping: (metrics.headPose?.pitch ?? 0) > 0.3,
      expressionFatigueScore:
        metrics.expressionFatigueScore ?? metrics.blendshapeAnalysis?.fatigueScore ?? 0,
      squintIntensity: metrics.squintIntensity ?? metrics.blendshapeAnalysis?.eyeSquint ?? 0,
      validity: {
        perclos: metrics.perclos !== undefined && metrics.perclos >= 0,
        blink: metrics.blinkRate !== undefined && metrics.blinkRate >= 0,
        yawn: metrics.yawnCount !== undefined,
        headPose: metrics.headPose !== undefined,
        expression: hasExpressionData,
      },
    };
  }
}

/**
 * 创建疲劳评分计算器实例
 */
export function createFatigueScoreCalculator(
  config?: Partial<FatigueScoreConfig>,
): FatigueScoreCalculator {
  return new FatigueScoreCalculator(config);
}
