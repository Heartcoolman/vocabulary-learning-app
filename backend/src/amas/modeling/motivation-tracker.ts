/**
 * AMAS Modeling Layer - Motivation Tracker
 * 情绪/动机追踪模型
 *
 * 定义: 用户的学习动机和情绪状态
 * 范围: M ∈ [-1,1], -1=极度受挫, 1=高度积极
 */

import { DEFAULT_MOTIVATION_PARAMS } from '../config/action-space';

// ==================== 类型定义 ====================

/**
 * 动机事件
 */
export interface MotivationEvent {
  /** 成功次数 */
  successes?: number;
  /** 失败次数 */
  failures?: number;
  /** 退出/放弃次数 */
  quits?: number;
}

// ==================== 工具函数 ====================

/**
 * 截断到[-1, 1]范围
 */
function clipMotivation(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

// ==================== 动机追踪模型 ====================

/**
 * 动机追踪模型
 *
 * 数学模型:
 * M_t = clip(ρ·M_{t-1} + κ·succ - λ·fail - μ·quit, -1, 1)
 */
export class MotivationTracker {
  private M: number;
  private lowMotivationCount: number;

  // 模型参数
  private rho: number;
  private kappa: number;
  private lambda: number;
  private mu: number;

  constructor(
    params = DEFAULT_MOTIVATION_PARAMS,
    initialMotivation: number = 0
  ) {
    this.rho = params.rho;
    this.kappa = params.kappa;
    this.lambda = params.lambda;
    this.mu = params.mu;

    this.M = clipMotivation(initialMotivation);
    this.lowMotivationCount = 0;
  }

  /**
   * 更新动机状态
   * @param event 动机事件
   * @returns 更新后的动机值 [-1,1]
   */
  update(event: MotivationEvent): number {
    const succ = event.successes ?? 0;
    const fail = event.failures ?? 0;
    const quit = event.quits ?? 0;

    // 指数打分
    const nextM =
      this.rho * this.M +
      this.kappa * succ -
      this.lambda * fail -
      this.mu * quit;

    this.M = clipMotivation(nextM);

    // 追踪低动机持续时长
    if (this.M < 0) {
      this.lowMotivationCount++;
    } else {
      this.lowMotivationCount = 0;
    }

    return this.M;
  }

  /**
   * 简化更新接口 - 基于单次事件
   */
  updateFromEvent(
    isCorrect: boolean,
    isQuit: boolean = false,
    retryCount: number = 0
  ): number {
    return this.update({
      successes: isCorrect ? 1 : 0,
      failures: isCorrect ? 0 : 1 + Math.min(retryCount, 2),
      quits: isQuit ? 1 : 0
    });
  }

  /**
   * 获取当前动机值
   */
  get(): number {
    return this.M;
  }

  /**
   * 重置模型状态
   */
  reset(value: number = 0): void {
    this.M = clipMotivation(value);
    this.lowMotivationCount = 0;
  }

  /**
   * 检查是否长期低动机
   * 定义: M持续<0超过10次交互
   */
  isLongTermLowMotivation(): boolean {
    return this.lowMotivationCount > 10;
  }

  /**
   * 检查是否处于挫折状态
   */
  isFrustrated(): boolean {
    return this.M < -0.3;
  }

  /**
   * 检查是否高动机状态
   */
  isHighlyMotivated(): boolean {
    return this.M > 0.5;
  }

  /**
   * 获取低动机持续次数
   */
  getLowMotivationCount(): number {
    return this.lowMotivationCount;
  }

  /**
   * 设置参数
   */
  setParams(params: Partial<typeof DEFAULT_MOTIVATION_PARAMS>): void {
    if (params.rho !== undefined) this.rho = params.rho;
    if (params.kappa !== undefined) this.kappa = params.kappa;
    if (params.lambda !== undefined) this.lambda = params.lambda;
    if (params.mu !== undefined) this.mu = params.mu;
  }

  /**
   * 获取模型状态(用于持久化)
   */
  getState(): {
    M: number;
    lowMotivationCount: number;
  } {
    return {
      M: this.M,
      lowMotivationCount: this.lowMotivationCount
    };
  }

  /**
   * 恢复模型状态
   */
  setState(state: {
    M: number;
    lowMotivationCount: number;
  }): void {
    this.M = clipMotivation(state.M);
    this.lowMotivationCount = Math.max(0, state.lowMotivationCount);
  }
}

// ==================== 导出默认实例 ====================

export const defaultMotivationTracker = new MotivationTracker();
