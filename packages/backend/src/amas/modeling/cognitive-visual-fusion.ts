/**
 * 认知视觉融合器
 *
 * 将视觉疲劳信号融合到 AMAS 的 A/F/M/C 状态建模中
 *
 * 融合维度：
 * - A (注意力): 头部稳定性、眯眼强度、视线离屏
 * - F (疲劳): 由 FatigueFusionEngine 处理
 * - M (动机): 皱眉、嘴角下垂、疲劳表情
 * - C.stability: 疲劳波动性、恢复速率
 */

import type { VisualCognitiveSignals, ProcessedVisualFatigueData } from '@danci/shared';

// ==================== 类型定义 ====================

/**
 * 注意力融合配置
 */
export interface AttentionFusionConfig {
  /** 基础权重（行为） */
  baseBehaviorWeight: number;
  /** 基础权重（视觉） */
  baseVisualWeight: number;
  /** 最低视觉置信度阈值 */
  minConfidence: number;
  /** 头部稳定性权重 */
  headPoseWeight: number;
  /** 眯眼权重 */
  squintWeight: number;
  /** 视线离屏权重 */
  gazeWeight: number;
}

/**
 * 动机融合配置
 */
export interface MotivationFusionConfig {
  /** 皱眉对动机的影响系数 */
  browDownImpact: number;
  /** 嘴角下垂对动机的影响系数 */
  mouthCornerDownImpact: number;
  /** 衰减上限 */
  maxDecay: number;
  /** 最低置信度阈值 */
  minConfidence: number;
}

/**
 * 稳定性融合配置
 */
export interface StabilityFusionConfig {
  /** 疲劳波动性影响系数 */
  variabilityImpact: number;
  /** 恢复速率学习率 */
  recoveryLearningRate: number;
  /** 最大历史长度 */
  maxHistoryLength: number;
}

/**
 * 认知视觉融合器配置
 */
export interface CognitiveVisualFusionConfig {
  attention: AttentionFusionConfig;
  motivation: MotivationFusionConfig;
  stability: StabilityFusionConfig;
}

/**
 * 默认配置
 */
export const DEFAULT_COGNITIVE_VISUAL_FUSION_CONFIG: CognitiveVisualFusionConfig = {
  attention: {
    baseBehaviorWeight: 0.6,
    baseVisualWeight: 0.4,
    minConfidence: 0.4,
    headPoseWeight: 0.4,
    squintWeight: 0.3,
    gazeWeight: 0.3,
  },
  motivation: {
    browDownImpact: 0.15,
    mouthCornerDownImpact: 0.1,
    maxDecay: 0.3,
    minConfidence: 0.5,
  },
  stability: {
    variabilityImpact: 0.2,
    recoveryLearningRate: 0.05,
    maxHistoryLength: 20,
  },
};

/**
 * 融合结果
 */
export interface CognitiveFusionResult {
  /** 融合后的注意力 */
  attention: number;
  /** 动机惩罚项 */
  motivationPenalty: number;
  /** 稳定性衰减因子 */
  stabilityDecay: number;
  /** 是否应用了视觉融合 */
  visualFusionApplied: boolean;
  /** 诊断信息 */
  diagnostics: {
    visualAttentionContribution: number;
    behaviorAttentionContribution: number;
    effectiveConfidence: number;
  };
}

/**
 * 用户融合状态
 */
interface UserFusionState {
  /** 疲劳历史 (用于计算波动性) */
  fatigueHistory: number[];
  /** 恢复速率估计 */
  estimatedRecoveryRate: number;
  /** 上次更新时间 */
  lastUpdateTime: number;
}

// ==================== 认知视觉融合器类 ====================

/**
 * 认知视觉融合器
 */
export class CognitiveVisualFusion {
  private config: CognitiveVisualFusionConfig;
  private userStates: Map<string, UserFusionState> = new Map();

  constructor(config: Partial<CognitiveVisualFusionConfig> = {}) {
    this.config = {
      ...DEFAULT_COGNITIVE_VISUAL_FUSION_CONFIG,
      ...config,
      attention: {
        ...DEFAULT_COGNITIVE_VISUAL_FUSION_CONFIG.attention,
        ...config.attention,
      },
      motivation: {
        ...DEFAULT_COGNITIVE_VISUAL_FUSION_CONFIG.motivation,
        ...config.motivation,
      },
      stability: {
        ...DEFAULT_COGNITIVE_VISUAL_FUSION_CONFIG.stability,
        ...config.stability,
      },
    };
  }

  /**
   * 融合注意力
   *
   * 公式：A_fused = λ * A_behavior + (1-λ) * A_visual
   * 其中 λ 根据视觉置信度动态调整
   *
   * @param behaviorAttention 行为注意力 [0-1]
   * @param visualData 视觉疲劳数据
   * @returns 融合后的注意力 [0-1]
   */
  fuseAttention(
    behaviorAttention: number,
    visualData?: ProcessedVisualFatigueData,
  ): { attention: number; contribution: { behavior: number; visual: number } } {
    // 无视觉数据时直接返回行为注意力
    if (!visualData || !visualData.isValid || !visualData.cognitiveSignals) {
      return {
        attention: behaviorAttention,
        contribution: { behavior: 1, visual: 0 },
      };
    }

    const { cognitiveSignals } = visualData;
    const { attentionSignals, confidence } = cognitiveSignals;
    const cfg = this.config.attention;

    // 置信度不足时降低视觉权重
    if (confidence < cfg.minConfidence) {
      const reducedWeight = cfg.baseVisualWeight * (confidence / cfg.minConfidence);
      const behaviorWeight = 1 - reducedWeight;
      const visualAttention = this.calculateVisualAttention(attentionSignals);

      return {
        attention: this.clamp01(
          behaviorWeight * behaviorAttention + reducedWeight * visualAttention,
        ),
        contribution: { behavior: behaviorWeight, visual: reducedWeight },
      };
    }

    // 计算视觉注意力
    const visualAttention = this.calculateVisualAttention(attentionSignals);

    // 动态权重：高置信度时增加视觉权重
    const confidenceBoost = Math.min(1, confidence / 0.8);
    const effectiveVisualWeight = cfg.baseVisualWeight * confidenceBoost;
    const behaviorWeight = 1 - effectiveVisualWeight;

    // 加权融合
    const fusedAttention =
      behaviorWeight * behaviorAttention + effectiveVisualWeight * visualAttention;

    return {
      attention: this.clamp01(fusedAttention),
      contribution: { behavior: behaviorWeight, visual: effectiveVisualWeight },
    };
  }

  /**
   * 计算动机惩罚
   *
   * 皱眉和嘴角下垂表情会降低动机
   *
   * @param visualData 视觉疲劳数据
   * @returns 动机惩罚项 [0, maxDecay]
   */
  calculateMotivationPenalty(visualData?: ProcessedVisualFatigueData): number {
    if (!visualData || !visualData.isValid || !visualData.cognitiveSignals) {
      return 0;
    }

    const { cognitiveSignals } = visualData;
    const { motivationSignals, confidence } = cognitiveSignals;
    const cfg = this.config.motivation;

    // 置信度不足时不应用惩罚
    if (confidence < cfg.minConfidence) {
      return 0;
    }

    // 计算惩罚
    const browPenalty = motivationSignals.browDown * cfg.browDownImpact;
    const mouthPenalty = motivationSignals.mouthCornerDown * cfg.mouthCornerDownImpact;

    // 总惩罚，限制上限
    const totalPenalty = Math.min(browPenalty + mouthPenalty, cfg.maxDecay);

    // 根据置信度调整
    return totalPenalty * confidence;
  }

  /**
   * 计算稳定性衰减因子
   *
   * 基于疲劳波动性计算认知稳定性衰减
   *
   * @param userId 用户ID
   * @param currentFatigue 当前融合疲劳度
   * @returns 稳定性衰减因子 [0-1], 1=无衰减
   */
  calculateStabilityDecay(userId: string, currentFatigue: number): number {
    const state = this.getOrCreateUserState(userId);
    const cfg = this.config.stability;

    // 更新疲劳历史
    state.fatigueHistory.push(currentFatigue);
    if (state.fatigueHistory.length > cfg.maxHistoryLength) {
      state.fatigueHistory.shift();
    }

    // 计算波动性 (标准差)
    if (state.fatigueHistory.length < 3) {
      return 1; // 数据不足，不衰减
    }

    const variability = this.calculateStandardDeviation(state.fatigueHistory);

    // 波动性越高，稳定性衰减越大
    const decay = 1 - Math.min(variability * cfg.variabilityImpact, 0.5);

    state.lastUpdateTime = Date.now();

    return decay;
  }

  /**
   * 完整融合
   *
   * @param userId 用户ID
   * @param behaviorAttention 行为注意力
   * @param currentFatigue 当前融合疲劳度
   * @param visualData 视觉疲劳数据
   */
  fuse(
    userId: string,
    behaviorAttention: number,
    currentFatigue: number,
    visualData?: ProcessedVisualFatigueData,
  ): CognitiveFusionResult {
    // 融合注意力
    const { attention, contribution } = this.fuseAttention(behaviorAttention, visualData);

    // 计算动机惩罚
    const motivationPenalty = this.calculateMotivationPenalty(visualData);

    // 计算稳定性衰减
    const stabilityDecay = this.calculateStabilityDecay(userId, currentFatigue);

    const visualFusionApplied = Boolean(
      visualData?.isValid && visualData?.cognitiveSignals !== undefined,
    );

    return {
      attention,
      motivationPenalty,
      stabilityDecay,
      visualFusionApplied,
      diagnostics: {
        visualAttentionContribution: contribution.visual,
        behaviorAttentionContribution: contribution.behavior,
        effectiveConfidence: visualData?.cognitiveSignals?.confidence ?? 0,
      },
    };
  }

  /**
   * 应用动机惩罚
   *
   * @param currentMotivation 当前动机值
   * @param penalty 惩罚值
   * @returns 调整后的动机值
   */
  applyMotivationPenalty(currentMotivation: number, penalty: number): number {
    return this.clamp01(currentMotivation - penalty);
  }

  /**
   * 应用稳定性衰减
   *
   * @param currentStability 当前稳定性
   * @param decay 衰减因子
   * @returns 调整后的稳定性
   */
  applyStabilityDecay(currentStability: number, decay: number): number {
    return this.clamp01(currentStability * decay);
  }

  /**
   * 重置用户状态
   */
  resetUser(userId: string): void {
    this.userStates.delete(userId);
  }

  /**
   * 获取用户融合状态
   */
  getUserState(userId: string): UserFusionState | undefined {
    return this.userStates.get(userId);
  }

  // ==================== 私有方法 ====================

  /**
   * 从注意力信号计算视觉注意力
   */
  private calculateVisualAttention(signals: {
    headPoseStability: number;
    eyeSquint: number;
    gazeOffScreen: number;
  }): number {
    const cfg = this.config.attention;

    // 头部稳定性正向影响注意力
    const headPoseContribution = signals.headPoseStability * cfg.headPoseWeight;

    // 眯眼负向影响注意力 (眯眼可能表示困倦或专注，这里假设是困倦)
    const squintContribution = (1 - signals.eyeSquint) * cfg.squintWeight;

    // 视线离屏负向影响注意力
    const gazeContribution = (1 - signals.gazeOffScreen) * cfg.gazeWeight;

    // 归一化
    const totalWeight = cfg.headPoseWeight + cfg.squintWeight + cfg.gazeWeight;
    const visualAttention =
      (headPoseContribution + squintContribution + gazeContribution) / totalWeight;

    return this.clamp01(visualAttention);
  }

  /**
   * 计算标准差
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * 获取或创建用户状态
   */
  private getOrCreateUserState(userId: string): UserFusionState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        fatigueHistory: [],
        estimatedRecoveryRate: 0.5,
        lastUpdateTime: Date.now(),
      };
      this.userStates.set(userId, state);
    }
    return state;
  }

  /**
   * 截断到 [0, 1]
   */
  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}

// ==================== 导出 ====================

/**
 * 创建认知视觉融合器
 */
export function createCognitiveVisualFusion(
  config?: Partial<CognitiveVisualFusionConfig>,
): CognitiveVisualFusion {
  return new CognitiveVisualFusion(config);
}

/**
 * 默认实例
 */
export const defaultCognitiveVisualFusion = new CognitiveVisualFusion();
