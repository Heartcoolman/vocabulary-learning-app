/**
 * AMAS Modeling Layer - Cognitive Profiler
 * 认知能力评估模型
 *
 * 定义: 用户的学习能力画像
 * 维度: mem(记忆力), speed(速度), stability(稳定性)
 */

import { CognitiveProfile } from '../types';
import {
  COGNITIVE_LONG_TERM_BETA,
  COGNITIVE_FUSION_K0
} from '../config/action-space';

// ==================== 类型定义 ====================

/**
 * 近期统计数据
 */
export interface RecentStats {
  /** 正确率 [0,1] */
  accuracy: number;
  /** 平均反应时间(ms) */
  avgResponseTime: number;
  /** 错误率方差 */
  errorVariance: number;
}

// ==================== 工具函数 ====================

/**
 * 截断到[0,1]范围
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ==================== 认知能力评估模型 ====================

/**
 * 认知能力评估模型
 *
 * 数学模型:
 * C_short = stats(window_k)
 * C_long = β · C_long + (1 - β) · new_value
 * C = λ · C_long + (1 - λ) · C_short
 * λ = 1 - exp(-n / k0)
 */
export class CognitiveProfiler {
  private C_long: CognitiveProfile;
  private sampleCount: number;

  // 模型参数
  private beta: number;
  private k0: number;

  // 归一化参数
  private referenceRT: number = 5000;
  private minRT: number = 1000;
  private referenceVariance: number = 0.25;

  constructor(
    beta: number = COGNITIVE_LONG_TERM_BETA,
    k0: number = COGNITIVE_FUSION_K0,
    initialProfile?: CognitiveProfile
  ) {
    this.beta = beta;
    this.k0 = k0;
    this.sampleCount = 0;

    this.C_long = initialProfile ?? {
      mem: 0.5,
      speed: 0.5,
      stability: 0.5
    };
  }

  /**
   * 更新认知能力画像
   * @param stats 近期统计数据
   * @returns 更新后的认知能力画像
   */
  update(stats: RecentStats): CognitiveProfile {
    // 计算短期能力
    const C_short: CognitiveProfile = {
      mem: clamp01(stats.accuracy),
      speed: this.normalizeSpeed(stats.avgResponseTime),
      stability: 1 - this.normalizeVariance(stats.errorVariance)
    };

    // 更新长期能力 (EMA)
    this.C_long = {
      mem: this.beta * this.C_long.mem + (1 - this.beta) * C_short.mem,
      speed: this.beta * this.C_long.speed + (1 - this.beta) * C_short.speed,
      stability: this.beta * this.C_long.stability + (1 - this.beta) * C_short.stability
    };

    // 自适应融合系数
    this.sampleCount++;
    const lambda = 1 - Math.exp(-this.sampleCount / this.k0);

    // 融合长短期能力
    const C: CognitiveProfile = {
      mem: clamp01(lambda * this.C_long.mem + (1 - lambda) * C_short.mem),
      speed: clamp01(lambda * this.C_long.speed + (1 - lambda) * C_short.speed),
      stability: clamp01(lambda * this.C_long.stability + (1 - lambda) * C_short.stability)
    };

    return C;
  }

  /**
   * 简化更新接口 - 基于单次事件
   */
  updateFromEvent(
    isCorrect: boolean,
    responseTime: number,
    recentErrorRate: number = 0
  ): CognitiveProfile {
    return this.update({
      accuracy: isCorrect ? 1 : 0,
      avgResponseTime: responseTime,
      errorVariance: recentErrorRate * (1 - recentErrorRate)
    });
  }

  /**
   * 获取当前融合的认知能力画像
   */
  get(): CognitiveProfile {
    const lambda = 1 - Math.exp(-this.sampleCount / this.k0);
    return {
      mem: clamp01(lambda * this.C_long.mem + (1 - lambda) * 0.5),
      speed: clamp01(lambda * this.C_long.speed + (1 - lambda) * 0.5),
      stability: clamp01(lambda * this.C_long.stability + (1 - lambda) * 0.5)
    };
  }

  /**
   * 获取长期能力画像
   */
  getLongTerm(): CognitiveProfile {
    return { ...this.C_long };
  }

  /**
   * 重置模型状态
   */
  reset(profile?: CognitiveProfile): void {
    this.C_long = profile ?? {
      mem: 0.5,
      speed: 0.5,
      stability: 0.5
    };
    this.sampleCount = 0;
  }

  /**
   * 获取样本数量
   */
  getSampleCount(): number {
    return this.sampleCount;
  }

  /**
   * 获取当前融合系数lambda
   */
  getLambda(): number {
    return 1 - Math.exp(-this.sampleCount / this.k0);
  }

  /**
   * 设置归一化参数
   */
  setNormalizationParams(params: {
    referenceRT?: number;
    minRT?: number;
    referenceVariance?: number;
  }): void {
    if (params.referenceRT !== undefined) this.referenceRT = params.referenceRT;
    if (params.minRT !== undefined) this.minRT = params.minRT;
    if (params.referenceVariance !== undefined) {
      this.referenceVariance = params.referenceVariance;
    }
  }

  /**
   * 获取模型状态(用于持久化)
   */
  getState(): {
    C_long: CognitiveProfile;
    sampleCount: number;
  } {
    return {
      C_long: { ...this.C_long },
      sampleCount: this.sampleCount
    };
  }

  /**
   * 恢复模型状态
   */
  setState(state: {
    C_long: CognitiveProfile;
    sampleCount: number;
  }): void {
    this.C_long = {
      mem: clamp01(state.C_long.mem),
      speed: clamp01(state.C_long.speed),
      stability: clamp01(state.C_long.stability)
    };
    this.sampleCount = Math.max(0, state.sampleCount);
  }

  // ==================== 私有方法 ====================

  /**
   * 归一化速度
   * 速度越快分数越高
   */
  private normalizeSpeed(rtMs: number): number {
    const rt = Math.max(rtMs, this.minRT);
    const value = this.referenceRT / rt;
    return clamp01(value);
  }

  /**
   * 归一化方差
   */
  private normalizeVariance(variance: number): number {
    const value = variance / this.referenceVariance;
    return clamp01(value);
  }
}

// ==================== 导出默认实例 ====================

export const defaultCognitiveProfiler = new CognitiveProfiler();
