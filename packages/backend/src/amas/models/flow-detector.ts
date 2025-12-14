/**
 * AMAS Models Layer - Flow Detector
 * 心流检测器
 *
 * 职责:
 * - 根据用户状态和学习事件检测心流状态
 * - 计算成功率并评估其与目标区间的关系
 * - 提供策略调整建议
 *
 * 心流理论基础:
 * - 目标成功率: 65%-80%（最佳挑战区间）
 * - 过高（>80%）→ 无聊
 * - 过低（<65%）→ 焦虑
 * - 适中且反应时间稳定 → 心流
 */

import { UserState, RawEvent } from '../types';

// ==================== 类型定义 ====================

/**
 * 心流状态
 */
export interface FlowState {
  /** 心流分数 [0,1] - 越高越接近心流状态 */
  score: number;
  /** 状态分类 */
  state: 'flow' | 'anxiety' | 'boredom' | 'normal';
  /** 策略调整建议 */
  recommendation: string;
}

// ==================== 常量配置 ====================

/** 目标成功率区间 */
const TARGET_SUCCESS_RATE = {
  min: 0.65,
  max: 0.8,
};

/** 心流分数阈值 */
const FLOW_THRESHOLDS = {
  /** 高心流状态（>0.7） */
  high: 0.7,
  /** 中等心流状态（>0.4） */
  medium: 0.4,
  /** 低心流状态（>0.2） */
  low: 0.2,
};

/** 最小样本数（需要至少这么多事件才能可靠检测） */
const MIN_SAMPLE_SIZE = 5;

/** 反应时间稳定性阈值（变异系数） */
const RT_STABILITY_THRESHOLD = 0.3;

// ==================== 工具函数 ====================

/**
 * 计算标准差
 */
function calculateStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * 截断到[0,1]范围
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ==================== 心流检测器 ====================

/**
 * 心流检测器
 *
 * 检测逻辑:
 * 1. 成功率因子: 越接近目标区间得分越高
 * 2. 稳定性因子: 反应时间越稳定得分越高
 * 3. 状态因子: 注意力和动机越高得分越高
 *
 * 心流分数 = 成功率因子 × 稳定性因子 × 状态因子
 */
export class FlowDetector {
  // 使用拷贝，避免 setTargetSuccessRate / setFlowThresholds 影响其他实例/测试
  private readonly targetSuccessRate = { ...TARGET_SUCCESS_RATE };
  private readonly flowThresholds = { ...FLOW_THRESHOLDS };

  /**
   * 检测心流状态
   *
   * @param state 用户状态
   * @param recentEvents 最近的学习事件（建议10-20个）
   * @returns 心流状态评估结果
   */
  detectFlow(state: UserState, recentEvents: RawEvent[]): FlowState {
    // 样本不足，返回默认状态
    if (recentEvents.length < MIN_SAMPLE_SIZE) {
      return {
        score: 0.5,
        state: 'normal',
        recommendation: '数据不足，继续学习以获得更准确的评估',
      };
    }

    // 1. 计算成功率因子
    const successRate = this.calculateSuccessRate(recentEvents);
    const successFactor = this.successRateFactor(successRate);

    // 2. 计算稳定性因子
    const stabilityFactor = this.calculateRTStability(recentEvents);

    // 3. 计算状态因子（注意力和动机的组合）
    // 注意力 A ∈ [0,1], 动机 M ∈ [-1,1]
    // 归一化动机到 [0,1]: (M + 1) / 2
    const normalizedMotivation = (state.M + 1) / 2;
    const stateFactor = state.A * 0.6 + normalizedMotivation * 0.4;

    // 4. 综合计算心流分数
    const flowScore = clamp01(successFactor * stabilityFactor * stateFactor);

    // 5. 确定状态分类
    const flowState = this.classifyState(flowScore, successRate);

    // 6. 生成建议
    const recommendation = this.getRecommendation(flowState, successRate);

    return {
      score: flowScore,
      state: flowState,
      recommendation,
    };
  }

  /**
   * 计算成功率
   * @private
   */
  private calculateSuccessRate(events: RawEvent[]): number {
    if (events.length === 0) return 0;
    const correctCount = events.filter((e) => e.isCorrect).length;
    return correctCount / events.length;
  }

  /**
   * 成功率因子函数
   * 在目标区间内得分最高，偏离越多得分越低
   * @private
   */
  private successRateFactor(rate: number): number {
    const { min, max } = this.targetSuccessRate;
    const center = (min + max) / 2;

    if (rate >= min && rate <= max) {
      // 在目标区间内，根据距离中心的距离打分
      // 中心点得1分，边界得0.8分
      const distanceFromCenter = Math.abs(rate - center);
      const maxDistance = (max - min) / 2;
      return 1 - (distanceFromCenter / maxDistance) * 0.2;
    } else if (rate < min) {
      // 低于目标区间（焦虑区）
      // 线性衰减: rate=0时得0分，rate=min时得0.8分
      return 0.8 * (rate / min);
    } else {
      // 高于目标区间（无聊区）
      // 线性衰减: rate=max时得0.8分，rate=1时得0.5分
      const excess = rate - max;
      const maxExcess = 1 - max;
      return 0.8 - (excess / maxExcess) * 0.3;
    }
  }

  /**
   * 计算反应时间稳定性因子
   * 变异系数越小越稳定，得分越高
   * @private
   */
  private calculateRTStability(events: RawEvent[]): number {
    if (events.length === 0) return 0;

    const responseTimes = events.map((e) => e.responseTime);
    const mean = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;

    if (mean === 0) return 0;

    const std = calculateStd(responseTimes);
    const cv = std / mean; // 变异系数

    // CV越小越稳定
    // CV < 0.3: 高稳定性，得1分
    // CV = 0.6: 中等稳定性，得0.5分
    // CV > 1.0: 低稳定性，得0.3分
    if (cv < RT_STABILITY_THRESHOLD) {
      return 1;
    } else if (cv < 0.6) {
      return 1 - ((cv - RT_STABILITY_THRESHOLD) / 0.3) * 0.5;
    } else if (cv < 1.0) {
      return 0.5 - ((cv - 0.6) / 0.4) * 0.2;
    } else {
      return Math.max(0.3, 0.5 - (cv - 1.0) * 0.1);
    }
  }

  /**
   * 状态分类
   * @private
   */
  private classifyState(score: number, successRate: number): FlowState['state'] {
    if (score >= this.flowThresholds.high) {
      return 'flow';
    }

    // 低分情况下，根据成功率判断是焦虑还是无聊
    if (successRate < this.targetSuccessRate.min) {
      return 'anxiety';
    } else if (successRate > this.targetSuccessRate.max) {
      return 'boredom';
    }

    return 'normal';
  }

  /**
   * 生成策略调整建议
   * @private
   */
  private getRecommendation(state: FlowState['state'], successRate: number): string {
    switch (state) {
      case 'flow':
        return '保持当前难度，你正处于最佳学习状态';

      case 'anxiety':
        if (successRate < 0.5) {
          return '难度过高，建议降低难度或增加提示';
        }
        return '略有挑战，建议适当降低难度或放慢节奏';

      case 'boredom':
        if (successRate > 0.9) {
          return '难度过低，建议增加难度或减少提示';
        }
        return '略显简单，建议适当增加难度';

      case 'normal':
      default:
        const { min, max } = this.targetSuccessRate;
        if (successRate < min) {
          return '继续努力，可考虑略微降低难度';
        } else if (successRate > max) {
          return '表现不错，可考虑略微增加难度';
        }
        return '保持当前学习节奏';
    }
  }

  /**
   * 设置自定义目标成功率
   */
  setTargetSuccessRate(min: number, max: number): void {
    if (min < 0 || max > 1 || min >= max) {
      throw new Error('Invalid success rate range');
    }
    (this.targetSuccessRate as { min: number; max: number }).min = min;
    (this.targetSuccessRate as { min: number; max: number }).max = max;
  }

  /**
   * 设置自定义心流阈值
   */
  setFlowThresholds(high: number, medium: number, low: number): void {
    if (high <= medium || medium <= low || low < 0 || high > 1) {
      throw new Error('Invalid flow thresholds');
    }
    (this.flowThresholds as { high: number; medium: number; low: number }).high = high;
    (this.flowThresholds as { high: number; medium: number; low: number }).medium = medium;
    (this.flowThresholds as { high: number; medium: number; low: number }).low = low;
  }

  /**
   * 批量检测多个时间窗口的心流状态
   * 用于分析心流状态的时间序列变化
   */
  detectFlowTimeSeries(
    state: UserState,
    allEvents: RawEvent[],
    windowSize: number = 10,
  ): FlowState[] {
    if (allEvents.length < windowSize) {
      return [this.detectFlow(state, allEvents)];
    }

    const results: FlowState[] = [];
    for (let i = 0; i <= allEvents.length - windowSize; i += windowSize) {
      const window = allEvents.slice(i, i + windowSize);
      results.push(this.detectFlow(state, window));
    }

    return results;
  }
}

// ==================== 导出默认实例 ====================

export const defaultFlowDetector = new FlowDetector();
