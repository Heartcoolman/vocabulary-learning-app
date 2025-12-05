/**
 * 疲劳恢复模型
 *
 * 基于时间的疲劳恢复建模，支持预测休息后的疲劳值
 */

export interface FatigueRecoveryState {
  lastSessionEnd: number | null;  // 上次会话结束时间戳（ms）
  accumulatedFatigue: number;      // 累积疲劳值
}

export class FatigueRecoveryModel {
  private lastSessionEnd: Date | null = null;
  private accumulatedFatigue: number = 0;

  // 恢复参数
  private readonly recoveryRate = 0.3;  // 每小时恢复30%
  private readonly minRecoveryTime = 300; // 最小有效休息时间：5分钟（秒）

  /**
   * 计算恢复后的疲劳值
   *
   * 使用指数恢复模型：F_recovered = F * exp(-k * restHours)
   *
   * 当使用会话结束时记录的累积疲劳值时，可以更准确地计算恢复后的状态
   *
   * @param currentFatigue 当前疲劳值 [0, 1]，如果未提供则使用会话结束时记录的累积疲劳值
   * @param now 当前时间
   * @returns 恢复后的疲劳值
   */
  computeRecoveredFatigue(currentFatigue?: number, now: Date = new Date()): number {
    // 如果没有上次会话记录，返回当前疲劳值或0
    if (!this.lastSessionEnd) {
      return currentFatigue ?? 0;
    }

    // 使用累积疲劳值（如果未提供当前疲劳值）
    const fatigueToRecover = currentFatigue ?? this.accumulatedFatigue;

    const restDuration = now.getTime() - this.lastSessionEnd.getTime();
    const restSeconds = restDuration / 1000;

    // 休息时间过短，不应用恢复
    if (restSeconds < this.minRecoveryTime) {
      return fatigueToRecover;
    }

    const restHours = restSeconds / 3600;

    // 指数恢复模型
    const recovered = fatigueToRecover * Math.exp(-this.recoveryRate * restHours);

    // 确保在有效范围
    return Math.max(0, Math.min(1, recovered));
  }

  /**
   * 标记会话结束
   *
   * @param fatigue 当前疲劳值
   */
  markSessionEnd(fatigue: number): void {
    this.lastSessionEnd = new Date();
    this.accumulatedFatigue = fatigue;
  }

  /**
   * 获取会话结束时记录的累积疲劳值
   *
   * @returns 累积疲劳值，如果没有记录则返回 0
   */
  getAccumulatedFatigue(): number {
    return this.accumulatedFatigue;
  }

  /**
   * 获取上次会话结束时间
   *
   * @returns 上次会话结束时间，如果没有记录则返回 null
   */
  getLastSessionEnd(): Date | null {
    return this.lastSessionEnd;
  }

  /**
   * 预测休息后的疲劳值
   *
   * @param currentFatigue 当前疲劳值
   * @param breakMinutes 休息时长（分钟）
   * @returns 预测的疲劳值
   */
  predictFatigueAfterBreak(currentFatigue: number, breakMinutes: number): number {
    if (breakMinutes < this.minRecoveryTime / 60) {
      return currentFatigue;
    }

    const breakHours = breakMinutes / 60;
    const predicted = currentFatigue * Math.exp(-this.recoveryRate * breakHours);

    return Math.max(0, Math.min(1, predicted));
  }

  /**
   * 计算达到目标疲劳值所需的休息时间
   *
   * @param currentFatigue 当前疲劳值
   * @param targetFatigue 目标疲劳值
   * @returns 所需休息时间（分钟），如果已低于目标则返回0
   */
  computeRequiredBreakTime(currentFatigue: number, targetFatigue: number): number {
    if (currentFatigue <= targetFatigue) {
      return 0;
    }

    // 根据指数恢复模型反推时间：t = -ln(F_target / F_current) / k
    // 防止 log(0)，当 targetFatigue 为 0 时使用极小值
    const safeTargetFatigue = Math.max(targetFatigue, 1e-10);
    const requiredHours = -Math.log(safeTargetFatigue / currentFatigue) / this.recoveryRate;
    const requiredMinutes = Math.ceil(requiredHours * 60);

    return Math.max(this.minRecoveryTime / 60, requiredMinutes);
  }

  /**
   * 获取状态（用于序列化）
   */
  getState(): FatigueRecoveryState {
    return {
      lastSessionEnd: this.lastSessionEnd?.getTime() || null,
      accumulatedFatigue: this.accumulatedFatigue
    };
  }

  /**
   * 设置状态（用于反序列化）
   */
  setState(state: FatigueRecoveryState): void {
    this.lastSessionEnd = state.lastSessionEnd ? new Date(state.lastSessionEnd) : null;
    this.accumulatedFatigue = state.accumulatedFatigue;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.lastSessionEnd = null;
    this.accumulatedFatigue = 0;
  }
}
