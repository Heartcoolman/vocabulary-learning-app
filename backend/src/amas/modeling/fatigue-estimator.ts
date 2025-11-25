/**
 * AMAS Modeling Layer - Fatigue Estimator
 * 疲劳度评估模型
 *
 * 定义: 用户当前的疲劳程度
 * 范围: F ∈ [0,1], 0=精力充沛, 1=极度疲劳
 */

import { DEFAULT_FATIGUE_PARAMS } from '../config/action-space';

// ==================== 类型定义 ====================

/**
 * 疲劳特征输入
 */
export interface FatigueFeatures {
  /** 错误率趋势(上升为正) */
  error_rate_trend: number;
  /** 反应时上升率 */
  rt_increase_rate: number;
  /** 重复错误次数 */
  repeat_errors: number;
  /** 休息时长(分钟) - 可选，不提供则自动计算 */
  breakMinutes?: number;
  /** 当前时间戳(ms) - 可选 */
  currentTime?: number;
}

// ==================== 工具函数 ====================

/**
 * 截断到[0.05, 1.0]范围
 */
function clipFatigue(value: number): number {
  return Math.max(0.05, Math.min(1.0, value));
}

// ==================== 疲劳度评估模型 ====================

/**
 * 疲劳度评估模型
 *
 * 数学模型:
 * F_accumulate = β·Δerr + γ·Δrt + δ·repeat
 * F_decay = F_t · exp(-k · Δt_minutes)
 * F_{t+1} = max(F_accumulate, F_decay)
 */
export class FatigueEstimator {
  private F: number;
  private lastUpdateTime: number;

  // 模型参数
  private beta: number;
  private gamma: number;
  private delta: number;
  private k: number;
  private longBreakThreshold: number;

  constructor(
    params = DEFAULT_FATIGUE_PARAMS,
    initialFatigue: number = 0.1
  ) {
    this.beta = params.beta;
    this.gamma = params.gamma;
    this.delta = params.delta;
    this.k = params.k;
    this.longBreakThreshold = params.longBreakThreshold;

    this.F = clipFatigue(initialFatigue);
    this.lastUpdateTime = Date.now();
  }

  /**
   * 更新疲劳度状态
   * @param features 疲劳特征
   * @returns 更新后的疲劳度 [0,1]
   */
  update(features: FatigueFeatures): number {
    const now = features.currentTime ?? Date.now();

    // 计算休息时长(分钟)
    const breakMinutes = features.breakMinutes ??
      Math.max(0, (now - this.lastUpdateTime) / 60000);

    // 指数衰减 (休息时恢复)
    const F_decay = this.F * Math.exp(-this.k * breakMinutes);

    // 非线性累积 (学习时增加)
    const F_accumulate =
      this.beta * features.error_rate_trend +
      this.gamma * features.rt_increase_rate +
      this.delta * features.repeat_errors;

    // 取最大值 (体现累积效应)
    let nextF = Math.max(F_accumulate, F_decay);

    // 长休息重置
    if (breakMinutes > this.longBreakThreshold) {
      nextF = 0.1;
    }

    // 限幅
    this.F = clipFatigue(nextF);
    this.lastUpdateTime = now;

    return this.F;
  }

  /**
   * 简化更新接口 - 基于单次事件
   */
  updateFromEvent(
    isCorrect: boolean,
    responseTime: number,
    baselineRT: number = 3200,
    isRepeatError: boolean = false
  ): number {
    const error_rate_trend = isCorrect ? 0 : 0.5;
    const rt_increase_rate = Math.max(0, (responseTime - baselineRT) / baselineRT);
    const repeat_errors = isRepeatError ? 1 : 0;

    return this.update({
      error_rate_trend,
      rt_increase_rate,
      repeat_errors
    });
  }

  /**
   * 获取当前疲劳度
   */
  get(): number {
    return this.F;
  }

  /**
   * 重置模型状态
   */
  reset(value: number = 0.1): void {
    this.F = clipFatigue(value);
    this.lastUpdateTime = Date.now();
  }

  /**
   * 检查是否需要休息提示
   */
  needsBreak(): boolean {
    return this.F > 0.6;
  }

  /**
   * 检查是否需要强制休息
   */
  needsForcedBreak(): boolean {
    return this.F > 0.8;
  }

  /**
   * 设置参数
   */
  setParams(params: Partial<typeof DEFAULT_FATIGUE_PARAMS>): void {
    if (params.beta !== undefined) this.beta = params.beta;
    if (params.gamma !== undefined) this.gamma = params.gamma;
    if (params.delta !== undefined) this.delta = params.delta;
    if (params.k !== undefined) this.k = params.k;
    if (params.longBreakThreshold !== undefined) {
      this.longBreakThreshold = params.longBreakThreshold;
    }
  }

  /**
   * 获取模型状态(用于持久化)
   */
  getState(): { F: number; lastUpdateTime: number } {
    return {
      F: this.F,
      lastUpdateTime: this.lastUpdateTime
    };
  }

  /**
   * 恢复模型状态
   */
  setState(state: { F: number; lastUpdateTime: number }): void {
    this.F = clipFatigue(state.F);
    this.lastUpdateTime = state.lastUpdateTime;
  }
}

// ==================== 导出默认实例 ====================

export const defaultFatigueEstimator = new FatigueEstimator();
