/**
 * AMAS Decision Layer - Action Mapper
 * 动作→策略映射器
 */

import { Action, StrategyParams } from '../types';
import { STRATEGY_SMOOTHING, ACTION_SPACE } from '../config/action-space';

// ==================== 工具函数 ====================

/**
 * 平滑过渡函数
 */
function smooth(prev: number, target: number, tau: number): number {
  return tau * prev + (1 - tau) * target;
}

/**
 * 数值截断
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ==================== 映射函数 ====================

/**
 * 将动作映射为策略参数
 * 使用平滑过渡避免突变
 *
 * @param action Bandit选择的动作
 * @param current 当前策略参数
 * @param tau 平滑系数 (0=立即切换, 1=不变)
 */
export function mapActionToStrategy(
  action: Action,
  current: StrategyParams,
  tau: number = STRATEGY_SMOOTHING
): StrategyParams {
  const next: StrategyParams = {
    // 连续值平滑过渡
    interval_scale: smooth(current.interval_scale, action.interval_scale, tau),
    new_ratio: smooth(current.new_ratio, action.new_ratio, tau),

    // 离散值直接切换
    difficulty: action.difficulty,

    // 整数值平滑后取整
    batch_size: Math.round(smooth(current.batch_size, action.batch_size, tau)),
    hint_level: Math.round(smooth(current.hint_level, action.hint_level, tau))
  };

  // 应用范围约束
  next.interval_scale = clamp(next.interval_scale, 0.5, 1.5);
  next.new_ratio = clamp(next.new_ratio, 0.05, 0.5);
  next.batch_size = clamp(next.batch_size, 5, 20);
  next.hint_level = clamp(next.hint_level, 0, 2);

  return next;
}

/**
 * 直接映射（无平滑）
 */
export function mapActionDirect(action: Action): StrategyParams {
  return {
    interval_scale: clamp(action.interval_scale, 0.5, 1.5),
    new_ratio: clamp(action.new_ratio, 0.05, 0.5),
    difficulty: action.difficulty,
    batch_size: clamp(action.batch_size, 5, 20),
    hint_level: clamp(action.hint_level, 0, 2)
  };
}

/**
 * 计算策略变化幅度
 */
export function computeStrategyDelta(
  oldParams: StrategyParams,
  newParams: StrategyParams
): number {
  const delta =
    Math.abs(newParams.interval_scale - oldParams.interval_scale) +
    Math.abs(newParams.new_ratio - oldParams.new_ratio) * 10 +
    Math.abs(newParams.batch_size - oldParams.batch_size) / 5 +
    Math.abs(newParams.hint_level - oldParams.hint_level);

  return delta;
}

/**
 * 策略是否发生显著变化
 */
export function hasSignificantChange(
  oldParams: StrategyParams,
  newParams: StrategyParams,
  threshold: number = 0.5
): boolean {
  return computeStrategyDelta(oldParams, newParams) > threshold;
}

/**
 * Critical Fix #3: 逆向映射 - 根据最终策略重建动作
 * Optimization #2: 对齐到ACTION_SPACE，确保返回的action在预定义的动作空间中
 * 用于Guardrail修改策略后，确保action与strategy保持一致
 *
 * @param strategy 最终策略参数（经过guardrail调整后）
 * @param preferredAction 可选的原始动作（平局时优先选择）
 * @returns 与strategy最接近的action（对齐到ACTION_SPACE）
 */
export function mapStrategyToAction(
  strategy: StrategyParams,
  preferredAction?: Action
): Action {
  // Optimization #2: 从ACTION_SPACE中查找最接近的action

  // 计算策略与每个action的距离
  let bestAction: Action = ACTION_SPACE[0];
  let minDistance = Infinity;

  for (const candidate of ACTION_SPACE) {
    // 计算加权欧氏距离
    const distance =
      Math.pow(candidate.interval_scale - strategy.interval_scale, 2) +
      Math.pow((candidate.new_ratio - strategy.new_ratio) * 10, 2) + // new_ratio权重更高
      Math.pow((candidate.batch_size - strategy.batch_size) / 5, 2) + // 归一化batch_size
      Math.pow(candidate.hint_level - strategy.hint_level, 2) +
      (candidate.difficulty === strategy.difficulty ? 0 : 1); // difficulty不匹配额外惩罚

    // 如果距离相同且是preferredAction，优先选择
    if (distance < minDistance || (distance === minDistance && preferredAction &&
        candidate.interval_scale === preferredAction.interval_scale &&
        candidate.new_ratio === preferredAction.new_ratio &&
        candidate.difficulty === preferredAction.difficulty &&
        candidate.batch_size === preferredAction.batch_size &&
        candidate.hint_level === preferredAction.hint_level)) {
      minDistance = distance;
      bestAction = candidate;
    }
  }

  return bestAction;
}
