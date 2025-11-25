/**
 * AMAS Decision Layer - Safety Guardrails
 * 安全约束和保护机制
 */

import { StrategyParams, UserState } from '../types';
import {
  MIN_ATTENTION,
  HIGH_FATIGUE,
  CRITICAL_FATIGUE,
  LOW_MOTIVATION,
  CRITICAL_MOTIVATION
} from '../config/action-space';

// ==================== 安全约束函数 ====================

/**
 * 应用所有安全约束
 *
 * @param state 用户状态
 * @param params 原始策略参数
 * @returns 约束后的策略参数
 */
export function applyGuardrails(
  state: UserState,
  params: StrategyParams
): StrategyParams {
  let result = { ...params };

  // 应用各项保护
  result = applyFatigueProtection(state, result);
  result = applyMotivationProtection(state, result);
  result = applyAttentionProtection(state, result);
  result = applyTrendProtection(state, result);

  return result;
}

/**
 * 疲劳度保护
 */
export function applyFatigueProtection(
  state: UserState,
  params: StrategyParams
): StrategyParams {
  const result = { ...params };

  // 高疲劳保护
  if (state.F > HIGH_FATIGUE) {
    result.interval_scale = Math.max(result.interval_scale, 1.0);
    result.new_ratio = Math.min(result.new_ratio, 0.2);
    result.batch_size = Math.min(result.batch_size, 8);
  }

  // 极高疲劳强制保护
  if (state.F > CRITICAL_FATIGUE) {
    result.difficulty = 'easy';
    result.hint_level = Math.max(result.hint_level, 1);
    result.new_ratio = Math.min(result.new_ratio, 0.1);
    result.batch_size = Math.min(result.batch_size, 5);
  }

  return result;
}

/**
 * 动机保护
 */
export function applyMotivationProtection(
  state: UserState,
  params: StrategyParams
): StrategyParams {
  const result = { ...params };

  // 低动机保护
  if (state.M < LOW_MOTIVATION) {
    result.difficulty = 'easy';
    result.hint_level = Math.max(result.hint_level, 1);
    result.new_ratio = Math.min(result.new_ratio, 0.2);
  }

  // 极低动机强制保护
  if (state.M < CRITICAL_MOTIVATION) {
    result.hint_level = 2;
    result.new_ratio = Math.min(result.new_ratio, 0.1);
    result.batch_size = Math.min(result.batch_size, 5);
  }

  return result;
}

/**
 * 注意力保护
 */
export function applyAttentionProtection(
  state: UserState,
  params: StrategyParams
): StrategyParams {
  const result = { ...params };

  // 低注意力保护
  if (state.A < MIN_ATTENTION) {
    result.new_ratio = Math.min(result.new_ratio, 0.15);
    result.batch_size = Math.min(result.batch_size, 6);
    result.hint_level = Math.max(result.hint_level, 1);
  }

  return result;
}

/**
 * 趋势保护 (扩展版功能)
 */
export function applyTrendProtection(
  state: UserState,
  params: StrategyParams
): StrategyParams {
  const result = { ...params };

  if (state.T === 'down') {
    result.new_ratio = Math.min(result.new_ratio, 0.1);
    result.difficulty = 'easy';
    result.interval_scale = Math.max(result.interval_scale, 0.8);
  }

  if (state.T === 'stuck') {
    result.new_ratio = Math.min(result.new_ratio, 0.15);
  }

  return result;
}

// ==================== 检查函数 ====================

/**
 * 检查是否需要休息提示
 */
export function shouldSuggestBreak(state: UserState): boolean {
  return state.F > HIGH_FATIGUE;
}

/**
 * 检查是否需要强制休息
 */
export function shouldForceBreak(state: UserState): boolean {
  return state.F > CRITICAL_FATIGUE;
}

/**
 * 检查是否处于危险状态
 */
export function isInDangerZone(state: UserState): boolean {
  return (
    state.F > CRITICAL_FATIGUE ||
    state.M < CRITICAL_MOTIVATION ||
    state.A < MIN_ATTENTION
  );
}

/**
 * 获取当前触发的保护类型
 */
export function getActiveProtections(state: UserState): string[] {
  const protections: string[] = [];

  if (state.F > HIGH_FATIGUE) protections.push('fatigue');
  if (state.M < LOW_MOTIVATION) protections.push('motivation');
  if (state.A < MIN_ATTENTION) protections.push('attention');
  if (state.T === 'down' || state.T === 'stuck') protections.push('trend');

  return protections;
}
