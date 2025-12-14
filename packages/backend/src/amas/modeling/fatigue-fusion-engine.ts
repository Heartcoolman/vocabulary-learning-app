/**
 * 疲劳融合引擎
 *
 * 多信号融合：
 * - 行为疲劳（错误率、响应时间）
 * - 视觉疲劳（PERCLOS、眨眼、打哈欠）
 * - 时间疲劳（学习时长）
 *
 * 融合公式：
 * F_fused = α*F_behavior + β*F_visual + γ*F_temporal
 * 权重通过 DynamicWeightCalculator 动态计算
 */

import type { FusionConfig, FusedFatigueResult, ProcessedVisualFatigueData } from '@danci/shared';
import { VisualFatigueProcessor, type ProcessedVisualFatigue } from './visual-fatigue-processor';
import {
  DynamicWeightCalculator,
  type SceneContext,
  type DynamicWeightConfig,
} from './dynamic-weight-calculator';

/**
 * 扩展融合配置（含卡尔曼滤波参数）
 */
export interface ExtendedFusionConfig extends FusionConfig {
  /** 卡尔曼滤波过程噪声 Q，默认 0.01 */
  kalmanQ?: number;
  /** 卡尔曼滤波测量噪声 R，默认 0.1 */
  kalmanR?: number;
}

/**
 * 默认卡尔曼滤波参数
 */
const DEFAULT_KALMAN_Q = 0.01;
const DEFAULT_KALMAN_R = 0.1;

/**
 * 默认融合配置
 */
export const DEFAULT_FUSION_CONFIG: ExtendedFusionConfig = {
  weights: {
    visual: 0.4,
    behavior: 0.4,
    temporal: 0.2,
  },
  minConfidence: 0.2,
  conflictThreshold: 0.4,
  smoothingFactor: 0.3,
  useKalmanFilter: true,
  ageDecayRate: 0.01,
  maxDataAge: 30000,
  kalmanQ: DEFAULT_KALMAN_Q,
  kalmanR: DEFAULT_KALMAN_R,
};

/**
 * 融合输入数据
 */
export interface FusionInput {
  /** 用户ID */
  userId: string;
  /** 行为疲劳（来自 FatigueEstimator） */
  behaviorFatigue?: number;
  /** 视觉疲劳数据（来自 VisualFatigueProcessor 或前端上报） */
  visualData?: ProcessedVisualFatigue | ProcessedVisualFatigueData;
  /** 学习时长（分钟） */
  studyDurationMinutes?: number;
  /** 时间戳 */
  timestamp?: number;
  /** 是否使用动态权重（默认 true） */
  useDynamicWeights?: boolean;
}

/**
 * 融合结果（扩展）
 */
export interface FusionResult extends FusedFatigueResult {
  /** 时间疲劳 */
  temporalFatigue: number;
  /** 时间疲劳权重 */
  temporalWeight: number;
  /** 是否存在信号冲突 */
  hasConflict: boolean;
  /** 冲突描述 */
  conflictDescription?: string;
  /** 建议 */
  recommendations: string[];
  /** 疲劳等级 */
  fatigueLevel: 'alert' | 'mild' | 'moderate' | 'severe';
}

/**
 * 卡尔曼滤波器状态
 */
interface KalmanState {
  x: number; // 状态估计
  p: number; // 误差协方差
}

/**
 * 用户融合状态
 */
interface UserFusionState {
  /** 上次融合结果 */
  lastResult: FusionResult | null;
  /** 卡尔曼滤波器状态 */
  kalman: KalmanState;
  /** 历史融合分数 */
  history: number[];
  /** 最后更新时间 */
  lastUpdateTime: number;
}

/**
 * 疲劳融合引擎类
 */
export class FatigueFusionEngine {
  private config: ExtendedFusionConfig;
  private userStates: Map<string, UserFusionState> = new Map();
  private dynamicWeightCalculator: DynamicWeightCalculator;

  // 卡尔曼滤波参数（从配置读取）
  private Q: number;
  private R: number;

  constructor(
    config: Partial<ExtendedFusionConfig> = {},
    weightConfig?: Partial<DynamicWeightConfig>,
  ) {
    this.config = {
      ...DEFAULT_FUSION_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_FUSION_CONFIG.weights,
        ...config.weights,
      },
    };
    // 从配置初始化卡尔曼参数
    this.Q = this.config.kalmanQ ?? DEFAULT_KALMAN_Q;
    this.R = this.config.kalmanR ?? DEFAULT_KALMAN_R;
    this.dynamicWeightCalculator = new DynamicWeightCalculator(weightConfig);
  }

  /**
   * 融合疲劳信号
   */
  fuse(input: FusionInput): FusionResult {
    const {
      userId,
      behaviorFatigue = 0,
      visualData,
      studyDurationMinutes = 0,
      timestamp = Date.now(),
      useDynamicWeights = true,
    } = input;

    // 获取用户状态
    const state = this.getOrCreateUserState(userId);

    // 计算各项疲劳
    const visualFatigue = this.processVisualFatigue(visualData);
    const temporalFatigue = this.calculateTemporalFatigue(studyDurationMinutes);

    // 计算权重 (使用动态权重计算器或旧逻辑)
    let weights: { behavior: number; visual: number; temporal: number };

    if (useDynamicWeights) {
      // 转换为 ProcessedVisualFatigueData 格式
      const processedData = this.toProcessedVisualFatigueData(visualData);

      // 构建场景上下文
      const context: SceneContext = {
        behaviorFatigue,
        visualFatigue,
        studyDurationMinutes,
        hourOfDay: new Date(timestamp).getHours(),
      };

      // 使用动态权重计算器
      const dynamicWeights = this.dynamicWeightCalculator.calculate(processedData, userId, context);
      weights = {
        visual: dynamicWeights.visual,
        behavior: dynamicWeights.behavior,
        temporal: dynamicWeights.temporal,
      };

      // 更新历史记录（用于相关性学习）
      if (processedData && processedData.isValid) {
        this.dynamicWeightCalculator.updateHistory(userId, visualFatigue, behaviorFatigue);
      }
    } else {
      // 使用旧的固定权重逻辑
      weights = this.calculateStaticWeights(
        behaviorFatigue,
        visualFatigue,
        visualData?.confidence ?? 0,
      );
    }

    // 权重归一化校验：确保权重和为 1
    const totalWeight = weights.behavior + weights.visual + weights.temporal;
    if (Math.abs(totalWeight - 1) > 0.001) {
      weights.behavior /= totalWeight;
      weights.visual /= totalWeight;
      weights.temporal /= totalWeight;
    }

    // 加权融合
    let fusedFatigue =
      weights.behavior * behaviorFatigue +
      weights.visual * visualFatigue +
      weights.temporal * temporalFatigue;

    // 应用卡尔曼滤波
    if (this.config.useKalmanFilter) {
      fusedFatigue = this.applyKalmanFilter(state, fusedFatigue);
    }

    // 应用平滑
    fusedFatigue = this.smoothFatigue(state, fusedFatigue);

    // 检测冲突
    const { hasConflict, conflictDescription } = this.detectConflict(
      behaviorFatigue,
      visualFatigue,
    );

    // 生成建议
    const recommendations = this.generateRecommendations(
      fusedFatigue,
      visualFatigue,
      behaviorFatigue,
      studyDurationMinutes,
    );

    // 确定疲劳等级
    const fatigueLevel = this.determineFatigueLevel(fusedFatigue);

    // 确定主导信号源
    let dominantSource: 'visual' | 'behavior' | 'temporal' = 'behavior';
    if (visualFatigue * weights.visual > behaviorFatigue * weights.behavior) {
      dominantSource = 'visual';
    }
    if (
      temporalFatigue * weights.temporal >
      Math.max(visualFatigue * weights.visual, behaviorFatigue * weights.behavior)
    ) {
      dominantSource = 'temporal';
    }

    // 计算融合置信度
    const fusedConfidence = visualData?.confidence ?? 0.5;

    // 构建结果
    const result: FusionResult = {
      behaviorFatigue,
      visualFatigue,
      fusedFatigue,
      behaviorWeight: weights.behavior,
      visualWeight: weights.visual,
      visualConfidence: visualData?.confidence ?? 0,
      temporalFatigue,
      temporalWeight: weights.temporal,
      dominantSource,
      fusedConfidence,
      breakdown: {
        visual: visualFatigue,
        behavior: behaviorFatigue,
        temporal: temporalFatigue,
      },
      hasConflict,
      conflictDescription,
      recommendations,
      fatigueLevel,
    };

    // 更新用户状态
    this.updateUserState(state, result, timestamp);

    return result;
  }

  /**
   * 获取用户最新融合结果
   */
  getLatest(userId: string): FusionResult | null {
    const state = this.userStates.get(userId);
    if (!state) return null;

    // 检查数据是否过期
    const age = Date.now() - state.lastUpdateTime;
    if (age > this.config.maxDataAge) {
      return null;
    }

    return state.lastResult;
  }

  /**
   * 获取疲劳趋势
   */
  getTrend(userId: string): number {
    const state = this.userStates.get(userId);
    if (!state || state.history.length < 10) {
      return 0;
    }

    const recent = state.history.slice(-5);
    const earlier = state.history.slice(-10, -5);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    return recentAvg - earlierAvg;
  }

  /**
   * 重置用户状态
   */
  resetUser(userId: string): void {
    this.userStates.delete(userId);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ExtendedFusionConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      weights: {
        ...this.config.weights,
        ...config.weights,
      },
    };
    // 更新卡尔曼参数
    if (config.kalmanQ !== undefined) {
      this.Q = config.kalmanQ;
    }
    if (config.kalmanR !== undefined) {
      this.R = config.kalmanR;
    }
  }

  /**
   * 获取动态权重计算器（用于高级访问）
   */
  getDynamicWeightCalculator(): DynamicWeightCalculator {
    return this.dynamicWeightCalculator;
  }

  /**
   * 获取用户视觉历史（用于调试/监控）
   */
  getUserVisualHistory(userId: string) {
    return this.dynamicWeightCalculator.getHistory(userId);
  }

  /**
   * 处理视觉疲劳数据
   */
  private processVisualFatigue(data?: ProcessedVisualFatigue | ProcessedVisualFatigueData): number {
    if (!data || !data.isValid) {
      return 0;
    }

    // 应用新鲜度衰减
    return data.score * data.freshness;
  }

  /**
   * 计算时间疲劳
   * 基于学习时长的疲劳累积
   */
  private calculateTemporalFatigue(durationMinutes: number): number {
    // 疲劳累积曲线：30分钟后开始显著增加
    // F_temporal = 1 - exp(-k * max(0, t - 30) / 60)
    const k = 0.05;
    const threshold = 30;
    const effectiveDuration = Math.max(0, durationMinutes - threshold);

    return 1 - Math.exp(-k * effectiveDuration);
  }

  /**
   * 计算静态权重（旧逻辑，保留兼容）
   * 根据数据可用性和置信度调整
   */
  private calculateStaticWeights(
    behaviorFatigue: number,
    visualFatigue: number,
    visualConfidence: number,
  ): { behavior: number; visual: number; temporal: number } {
    const baseWeights = this.config.weights;

    // 如果视觉数据置信度低，降低视觉权重
    let visualWeight = baseWeights.visual;
    let behaviorWeight = baseWeights.behavior;

    if (visualConfidence < this.config.minConfidence) {
      // 视觉数据不可用，权重转移到行为
      visualWeight = 0;
      behaviorWeight += baseWeights.visual;
    } else {
      // 根据置信度调整
      visualWeight *= visualConfidence;
      behaviorWeight += baseWeights.visual * (1 - visualConfidence);
    }

    // 归一化
    const total = behaviorWeight + visualWeight + baseWeights.temporal;

    return {
      behavior: behaviorWeight / total,
      visual: visualWeight / total,
      temporal: baseWeights.temporal / total,
    };
  }

  /**
   * 转换视觉数据为标准格式
   */
  private toProcessedVisualFatigueData(
    data?: ProcessedVisualFatigue | ProcessedVisualFatigueData,
  ): ProcessedVisualFatigueData | undefined {
    if (!data) return undefined;

    // 检查是否已经是 ProcessedVisualFatigueData 格式
    if ('cognitiveSignals' in data || 'metrics' in data) {
      return data as ProcessedVisualFatigueData;
    }

    // 从 ProcessedVisualFatigue 转换
    const processed = data as ProcessedVisualFatigue;
    return {
      score: processed.score,
      confidence: processed.confidence,
      freshness: processed.freshness,
      isValid: processed.isValid,
      trend: 0, // ProcessedVisualFatigue 没有 trend 字段
      timestamp: Date.now(),
    };
  }

  /**
   * 应用卡尔曼滤波
   */
  private applyKalmanFilter(state: UserFusionState, measurement: number): number {
    // 预测步骤
    const xPrior = state.kalman.x;
    const pPrior = state.kalman.p + this.Q;

    // 更新步骤
    const K = pPrior / (pPrior + this.R); // 卡尔曼增益
    state.kalman.x = xPrior + K * (measurement - xPrior);
    state.kalman.p = (1 - K) * pPrior;

    return state.kalman.x;
  }

  /**
   * 应用指数平滑
   */
  private smoothFatigue(state: UserFusionState, fatigue: number): number {
    if (state.lastResult === null) {
      return fatigue;
    }

    const alpha = this.config.smoothingFactor;
    return alpha * fatigue + (1 - alpha) * state.lastResult.fusedFatigue;
  }

  /**
   * 检测信号冲突
   */
  private detectConflict(
    behaviorFatigue: number,
    visualFatigue: number,
  ): { hasConflict: boolean; conflictDescription?: string } {
    const diff = Math.abs(behaviorFatigue - visualFatigue);

    if (diff > this.config.conflictThreshold) {
      let description: string;
      if (behaviorFatigue > visualFatigue) {
        description = '行为指标显示疲劳，但视觉指标正常（可能是专注状态）';
      } else {
        description = '视觉指标显示疲劳，但行为表现正常（可能是生理疲劳）';
      }

      return { hasConflict: true, conflictDescription: description };
    }

    return { hasConflict: false };
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    fusedFatigue: number,
    visualFatigue: number,
    behaviorFatigue: number,
    studyDuration: number,
  ): string[] {
    const recommendations: string[] = [];

    // 基于融合疲劳等级
    if (fusedFatigue > 0.8) {
      recommendations.push('建议立即休息 15-20 分钟');
      recommendations.push('可以做一些眼保健操');
    } else if (fusedFatigue > 0.6) {
      recommendations.push('建议休息 5-10 分钟');
      recommendations.push('可以远眺放松眼睛');
    } else if (fusedFatigue > 0.4) {
      recommendations.push('可以继续学习，但注意适当休息');
    }

    // 基于视觉疲劳
    if (visualFatigue > 0.5 && visualFatigue > behaviorFatigue + 0.2) {
      recommendations.push('眼睛疲劳明显，建议闭眼休息');
    }

    // 基于学习时长
    if (studyDuration > 45) {
      recommendations.push('已连续学习较长时间，建议站起来活动一下');
    }

    // 基于行为疲劳
    if (behaviorFatigue > 0.5 && behaviorFatigue > visualFatigue + 0.2) {
      recommendations.push('注意力下降，可以换一种学习方式');
    }

    return recommendations;
  }

  /**
   * 确定疲劳等级
   */
  private determineFatigueLevel(fatigue: number): 'alert' | 'mild' | 'moderate' | 'severe' {
    if (fatigue < 0.25) return 'alert';
    if (fatigue < 0.5) return 'mild';
    if (fatigue < 0.75) return 'moderate';
    return 'severe';
  }

  /**
   * 获取或创建用户状态
   */
  private getOrCreateUserState(userId: string): UserFusionState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        lastResult: null,
        kalman: { x: 0.1, p: 1 },
        history: [],
        lastUpdateTime: 0,
      };
      this.userStates.set(userId, state);
    }
    return state;
  }

  /**
   * 更新用户状态
   */
  private updateUserState(state: UserFusionState, result: FusionResult, timestamp: number): void {
    state.lastResult = result;
    state.lastUpdateTime = timestamp;

    // 更新历史
    state.history.push(result.fusedFatigue);
    if (state.history.length > 100) {
      state.history.shift();
    }
  }
}

/**
 * 创建疲劳融合引擎实例
 */
export function createFatigueFusionEngine(config?: Partial<FusionConfig>): FatigueFusionEngine {
  return new FatigueFusionEngine(config);
}

/**
 * 默认融合引擎实例
 *
 * @warning 此实例仅用于单用户测试或无状态查询。
 * 生产环境多用户场景应为每个用户创建独立实例，
 * 避免用户状态污染导致的疲劳计算错误。
 */
export const defaultFatigueFusionEngine = new FatigueFusionEngine();
