/**
 * AMAS Modeling Layer - Attention Monitor
 * 注意力监测模型
 *
 * 定义: 用户当前的专注程度
 * 范围: A ∈ [0,1], 0=完全分心, 1=高度专注
 */

import { DEFAULT_ATTENTION_WEIGHTS, ATTENTION_SMOOTHING } from '../config/action-space';
import type { ProcessedVisualFatigueData } from '@danci/shared';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 注意力特征输入
 */
export interface AttentionFeatures {
  /** 反应时间均值(标准化) */
  z_rt_mean: number;
  /** 反应时间变异系数 */
  z_rt_cv: number;
  /** 答题节奏变异系数 */
  z_pace_cv: number;
  /** 暂停次数(标准化) */
  z_pause: number;
  /** 切屏次数(标准化) */
  z_switch: number;
  /** 速度漂移(最近vs基线) */
  z_drift: number;
  /** 微交互密度 */
  interaction_density: number;
  /** 失焦累计时长 */
  focus_loss_duration: number;
}

/**
 * 视觉注意力信号
 */
export interface VisualAttentionSignals {
  /** 头部姿态稳定性 [0-1] */
  headPoseStability: number;
  /** 眯眼强度 [0-1] */
  eyeSquint: number;
  /** 视线离屏比例 [0-1] */
  gazeOffScreen: number;
  /** 信号置信度 [0-1] */
  confidence: number;
}

/**
 * 视觉融合配置
 */
export interface VisualFusionConfig {
  /** 基础视觉权重 [0-1] */
  baseVisualWeight: number;
  /** 最低置信度阈值 */
  minConfidence: number;
  /** 头部稳定性权重 */
  headPoseWeight: number;
  /** 眯眼权重 */
  squintWeight: number;
  /** 视线离屏权重 */
  gazeWeight: number;
}

/**
 * 默认视觉融合配置
 */
export const DEFAULT_VISUAL_FUSION_CONFIG: VisualFusionConfig = {
  baseVisualWeight: 0.3,
  minConfidence: 0.4,
  headPoseWeight: 0.4,
  squintWeight: 0.3,
  gazeWeight: 0.3,
};

// ==================== 工具函数 ====================

/**
 * Sigmoid激活函数
 */
function sigmoid(x: number): number {
  // 防止数值溢出
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

/**
 * 截断到[0,1]范围
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ==================== 注意力监测模型 ====================

/**
 * 注意力监测模型
 *
 * 数学模型:
 * A_raw = sigmoid(-w · f_attention)
 * A_t = β · A_{t-1} + (1 - β) · A_raw
 */
export class AttentionMonitor {
  private weights: Float32Array;
  private beta: number;
  private prevAttention: number;

  constructor(
    weights: Float32Array = new Float32Array([
      DEFAULT_ATTENTION_WEIGHTS.rt_mean,
      DEFAULT_ATTENTION_WEIGHTS.rt_cv,
      DEFAULT_ATTENTION_WEIGHTS.pace_cv,
      DEFAULT_ATTENTION_WEIGHTS.pause,
      DEFAULT_ATTENTION_WEIGHTS.switch,
      DEFAULT_ATTENTION_WEIGHTS.drift,
      DEFAULT_ATTENTION_WEIGHTS.interaction,
      DEFAULT_ATTENTION_WEIGHTS.focus_loss,
    ]),
    beta: number = ATTENTION_SMOOTHING,
    initialAttention: number = 0.7,
  ) {
    this.weights = weights;
    this.beta = beta;
    this.prevAttention = initialAttention;
  }

  /**
   * 更新注意力状态
   * @param features 注意力特征
   * @returns 更新后的注意力值 [0,1]
   */
  update(features: AttentionFeatures): number {
    // 构建特征向量
    const featureVector = [
      features.z_rt_mean,
      features.z_rt_cv,
      features.z_pace_cv,
      features.z_pause,
      features.z_switch,
      features.z_drift,
      features.interaction_density,
      features.focus_loss_duration,
    ];

    // 维度检查：确保特征向量长度与权重数组长度匹配
    if (featureVector.length < this.weights.length) {
      amasLogger.warn(
        { expected: this.weights.length, actual: featureVector.length },
        '[AttentionMonitor] 特征向量维度不匹配，跳过更新',
      );
      return this.prevAttention;
    }

    // 计算加权和（使用 Math.min 防止越界访问）
    const loopLength = Math.min(this.weights.length, featureVector.length);
    let weightedSum = 0;
    for (let i = 0; i < loopLength; i++) {
      const weight = this.weights[i];
      const feature = featureVector[i];
      // 检查 NaN 值
      if (Number.isNaN(weight) || Number.isNaN(feature)) {
        amasLogger.warn(
          { index: i, weight, feature },
          '[AttentionMonitor] 检测到 NaN 值，使用 0 替代',
        );
        continue;
      }
      weightedSum += weight * feature;
    }

    // Sigmoid激活 (注意负号)
    const A_raw = sigmoid(-weightedSum);

    // EMA平滑
    const A_t = this.beta * this.prevAttention + (1 - this.beta) * A_raw;

    // 更新状态
    this.prevAttention = clamp01(A_t);

    return this.prevAttention;
  }

  /**
   * 从Float32Array特征更新
   */
  updateFromArray(features: Float32Array): number {
    if (features.length < 8) {
      throw new Error('Attention features array must have at least 8 elements');
    }

    return this.update({
      z_rt_mean: features[0],
      z_rt_cv: features[1],
      z_pace_cv: features[2],
      z_pause: features[3],
      z_switch: features[4],
      z_drift: features[5],
      interaction_density: features[6],
      focus_loss_duration: features[7],
    });
  }

  /**
   * 获取当前注意力值
   */
  get(): number {
    return this.prevAttention;
  }

  /**
   * 兼容别名
   */
  getAttention(): number {
    return this.get();
  }

  /**
   * 重置模型状态
   */
  reset(value: number = 0.7): void {
    this.prevAttention = clamp01(value);
  }

  /**
   * 设置EMA平滑系数
   */
  setBeta(beta: number): void {
    this.beta = clamp01(beta);
  }

  /**
   * 设置权重
   */
  setWeights(weights: Float32Array): void {
    if (weights.length !== 8) {
      throw new Error('Weights array must have exactly 8 elements');
    }
    this.weights = weights;
  }

  /**
   * 获取模型状态(用于持久化)
   */
  getState(): { prevAttention: number; beta: number } {
    return {
      prevAttention: this.prevAttention,
      beta: this.beta,
    };
  }

  /**
   * 恢复模型状态
   */
  setState(state: { prevAttention: number; beta?: number }): void {
    this.prevAttention = clamp01(state.prevAttention);
    if (state.beta !== undefined) {
      this.beta = clamp01(state.beta);
    }
  }

  /**
   * 更新并融合视觉信号
   *
   * 当有视觉数据时，将行为注意力与视觉注意力融合
   *
   * @param features 行为特征
   * @param visualData 视觉疲劳数据 (可选)
   * @param fusionConfig 融合配置 (可选)
   * @returns 融合后的注意力值 [0-1]
   */
  updateWithVisualFusion(
    features: AttentionFeatures,
    visualData?: ProcessedVisualFatigueData,
    fusionConfig: VisualFusionConfig = DEFAULT_VISUAL_FUSION_CONFIG,
  ): number {
    // 首先计算行为注意力
    const behaviorAttention = this.update(features);

    // 如果没有有效的视觉数据，直接返回行为注意力
    if (!visualData || !visualData.isValid || !visualData.cognitiveSignals) {
      return behaviorAttention;
    }

    const { cognitiveSignals } = visualData;
    const { attentionSignals, confidence } = cognitiveSignals;

    // 置信度不足时降低视觉权重
    if (confidence < fusionConfig.minConfidence) {
      return behaviorAttention;
    }

    // 计算视觉注意力
    const visualAttention = this.calculateVisualAttention(attentionSignals, fusionConfig);

    // 计算有效视觉权重 (根据置信度调整)
    const confidenceBoost = Math.min(1, confidence / 0.8);
    const effectiveVisualWeight = fusionConfig.baseVisualWeight * confidenceBoost;
    const behaviorWeight = 1 - effectiveVisualWeight;

    // 加权融合
    const fusedAttention =
      behaviorWeight * behaviorAttention + effectiveVisualWeight * visualAttention;

    // 更新内部状态
    this.prevAttention = clamp01(fusedAttention);

    return this.prevAttention;
  }

  /**
   * 仅融合视觉信号 (不更新行为注意力)
   *
   * 用于在已有行为注意力的基础上融合视觉信号
   *
   * @param visualData 视觉疲劳数据
   * @param fusionConfig 融合配置
   * @returns 融合后的注意力值 [0-1]
   */
  fuseWithVisualSignals(
    visualData?: ProcessedVisualFatigueData,
    fusionConfig: VisualFusionConfig = DEFAULT_VISUAL_FUSION_CONFIG,
  ): number {
    const behaviorAttention = this.prevAttention;

    if (!visualData || !visualData.isValid || !visualData.cognitiveSignals) {
      return behaviorAttention;
    }

    const { cognitiveSignals } = visualData;
    const { attentionSignals, confidence } = cognitiveSignals;

    if (confidence < fusionConfig.minConfidence) {
      return behaviorAttention;
    }

    const visualAttention = this.calculateVisualAttention(attentionSignals, fusionConfig);
    const confidenceBoost = Math.min(1, confidence / 0.8);
    const effectiveVisualWeight = fusionConfig.baseVisualWeight * confidenceBoost;
    const behaviorWeight = 1 - effectiveVisualWeight;

    const fusedAttention =
      behaviorWeight * behaviorAttention + effectiveVisualWeight * visualAttention;
    this.prevAttention = clamp01(fusedAttention);

    return this.prevAttention;
  }

  /**
   * 从视觉注意力信号计算视觉注意力值
   */
  private calculateVisualAttention(
    signals: { headPoseStability: number; eyeSquint: number; gazeOffScreen: number },
    config: VisualFusionConfig,
  ): number {
    // 头部稳定性正向影响注意力
    const headPoseContribution = signals.headPoseStability * config.headPoseWeight;

    // 眯眼负向影响注意力 (眯眼可能表示困倦)
    const squintContribution = (1 - signals.eyeSquint) * config.squintWeight;

    // 视线离屏负向影响注意力
    const gazeContribution = (1 - signals.gazeOffScreen) * config.gazeWeight;

    // 归一化
    const totalWeight = config.headPoseWeight + config.squintWeight + config.gazeWeight;
    const visualAttention =
      (headPoseContribution + squintContribution + gazeContribution) / totalWeight;

    return clamp01(visualAttention);
  }
}

// ==================== 导出默认实例 ====================

export const defaultAttentionMonitor = new AttentionMonitor();
