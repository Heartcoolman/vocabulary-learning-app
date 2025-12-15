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
  CRITICAL_MOTIVATION,
} from '../config/action-space';

// ==================== 融合疲劳阈值 ====================

/** 高融合疲劳阈值 */
export const HIGH_FUSED_FATIGUE = 0.6;
/** 极高融合疲劳阈值 */
export const CRITICAL_FUSED_FATIGUE = 0.75;
/** 高视觉疲劳阈值 */
export const HIGH_VISUAL_FATIGUE = 0.7;
/** 中度视觉疲劳阈值 */
export const MODERATE_VISUAL_FATIGUE = 0.5;
/** 视觉置信度阈值（低于此值不应用视觉保护） */
export const MIN_VISUAL_CONFIDENCE = 0.6;
/** 疲劳趋势上升阈值 */
export const FATIGUE_TREND_THRESHOLD = 0.1;

// ==================== 安全约束函数 ====================

/**
 * 应用所有安全约束
 *
 * @param state 用户状态
 * @param params 原始策略参数
 * @returns 约束后的策略参数
 */
export function applyGuardrails(state: UserState, params: StrategyParams): StrategyParams {
  let result = { ...params };

  // 疲劳保护：优先使用融合疲劳，否则回退到行为疲劳
  // 这避免了两套保护机制的冲突
  if (state.fusedFatigue !== undefined) {
    result = applyFusedFatigueProtection(state, result);
  } else {
    result = applyFatigueProtection(state, result);
  }

  // 其他保护
  result = applyMotivationProtection(state, result);
  result = applyAttentionProtection(state, result);
  result = applyTrendProtection(state, result);
  result = applyHabitProfileProtection(state, result);

  return result;
}

/**
 * 疲劳度保护（基于行为疲劳 F）
 */
export function applyFatigueProtection(state: UserState, params: StrategyParams): StrategyParams {
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
 * 融合疲劳保护（基于融合疲劳度 fusedFatigue）
 *
 * 使用融合后的疲劳度进行保护决策，而非双阈值判断
 * 这避免了视觉/行为疲劳冲突时的不一致保护
 */
export function applyFusedFatigueProtection(
  state: UserState,
  params: StrategyParams,
): StrategyParams {
  const result = { ...params };

  // 如果没有融合疲劳数据，跳过此保护
  if (state.fusedFatigue === undefined) {
    return result;
  }

  const fusedFatigue = state.fusedFatigue;

  // 中度融合疲劳保护 (0.5 - 0.6)
  if (fusedFatigue > 0.5 && fusedFatigue <= HIGH_FUSED_FATIGUE) {
    result.new_ratio = Math.min(result.new_ratio, 0.25);
    result.batch_size = Math.min(result.batch_size, 10);
  }

  // 高融合疲劳保护 (0.6 - 0.75)
  if (fusedFatigue > HIGH_FUSED_FATIGUE && fusedFatigue <= CRITICAL_FUSED_FATIGUE) {
    result.interval_scale = Math.max(result.interval_scale, 1.1);
    result.new_ratio = Math.min(result.new_ratio, 0.2);
    result.batch_size = Math.min(result.batch_size, 8);
    result.hint_level = Math.max(result.hint_level, 1);
  }

  // 极高融合疲劳强制保护 (> 0.75)
  if (fusedFatigue > CRITICAL_FUSED_FATIGUE) {
    result.interval_scale = Math.max(result.interval_scale, 1.2);
    result.new_ratio = Math.min(result.new_ratio, 0.15);
    result.difficulty = 'easy';
    result.batch_size = Math.min(result.batch_size, 5);
    result.hint_level = Math.max(result.hint_level, 1);
  }

  // 视觉疲劳保护（需要满足置信度门控）
  if (state.visualFatigue && state.visualFatigue.confidence >= MIN_VISUAL_CONFIDENCE) {
    // 高视觉疲劳保护 (score > 0.7)
    // 按计划: interval_scale ≥ 1.2, new_ratio ≤ 0.15, difficulty = easy, batch_size ≤ 5, hint_level ≥ 1
    if (state.visualFatigue.score > HIGH_VISUAL_FATIGUE) {
      result.interval_scale = Math.max(result.interval_scale, 1.2);
      result.new_ratio = Math.min(result.new_ratio, 0.15);
      result.difficulty = 'easy';
      result.batch_size = Math.min(result.batch_size, 5);
      result.hint_level = Math.max(result.hint_level, 1);
    }
    // 中度视觉疲劳保护 (score > 0.5)
    // 按计划: new_ratio ≤ 0.25, batch_size ≤ 8
    else if (state.visualFatigue.score > MODERATE_VISUAL_FATIGUE) {
      result.new_ratio = Math.min(result.new_ratio, 0.25);
      result.batch_size = Math.min(result.batch_size, 8);
    }

    // 疲劳趋势上升保护 (trend > 0.1)
    // 按计划: interval_scale *= 1.1
    if (state.visualFatigue.trend > FATIGUE_TREND_THRESHOLD) {
      result.interval_scale = result.interval_scale * 1.1;
    }
  }

  return result;
}

/**
 * 动机保护
 */
export function applyMotivationProtection(
  state: UserState,
  params: StrategyParams,
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
export function applyAttentionProtection(state: UserState, params: StrategyParams): StrategyParams {
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
 *
 * 基于长期学习趋势调整策略参数:
 * - 'up': 表现上升 - 保持当前策略（避免过度激进）
 * - 'flat': 表现稳定 - 保持当前策略
 * - 'stuck': 停滞 - 减少新词，保持复习
 * - 'down': 表现下降 - 保护模式，降低难度
 *
 * 注意: state.T 可能为 undefined（如旧版状态数据或首次使用）
 * 当 T 未定义时，不应用任何趋势保护
 */
export function applyTrendProtection(state: UserState, params: StrategyParams): StrategyParams {
  const result = { ...params };

  // 保护: state.T 为 undefined 时跳过趋势保护
  if (state.T === undefined || state.T === null) {
    return result;
  }

  // 上升/稳定趋势 - 不修改策略（仅用于监测与可解释性）
  if (state.T === 'up' || state.T === 'flat') {
    return result;
  }

  // 下降趋势 - 保护模式
  if (state.T === 'down') {
    result.new_ratio = Math.min(result.new_ratio, 0.1);
    result.difficulty = 'easy';
    // 趋势下降时应该缩短复习间隔（更频繁复习），而不是延长
    result.interval_scale = Math.min(result.interval_scale, 0.7);
    // 表现下降时提供更多提示帮助用户恢复信心
    result.hint_level = Math.max(result.hint_level, 1);
    // 减少批量大小以降低压力
    result.batch_size = Math.min(result.batch_size, 8);
  }

  // 停滞趋势 - 稳定策略，减少新词专注复习
  if (state.T === 'stuck') {
    result.new_ratio = Math.min(result.new_ratio, 0.15);
  }

  return result;
}

// ==================== 检查函数 ====================

/**
 * 检查是否需要休息提示
 * 优先使用融合疲劳度，否则使用行为疲劳度
 */
export function shouldSuggestBreak(state: UserState): boolean {
  // 优先检查融合疲劳
  if (state.fusedFatigue !== undefined) {
    return state.fusedFatigue > HIGH_FUSED_FATIGUE;
  }
  return state.F > HIGH_FATIGUE;
}

/**
 * 检查是否需要强制休息
 * 优先使用融合疲劳度，否则使用行为疲劳度
 */
export function shouldForceBreak(state: UserState): boolean {
  // 优先检查融合疲劳
  if (state.fusedFatigue !== undefined) {
    return state.fusedFatigue > CRITICAL_FUSED_FATIGUE;
  }
  return state.F > CRITICAL_FATIGUE;
}

/**
 * 检查是否处于危险状态
 */
export function isInDangerZone(state: UserState): boolean {
  const isFatigueHigh =
    state.fusedFatigue !== undefined
      ? state.fusedFatigue > CRITICAL_FUSED_FATIGUE
      : state.F > CRITICAL_FATIGUE;

  return isFatigueHigh || state.M < CRITICAL_MOTIVATION || state.A < MIN_ATTENTION;
}

/**
 * 获取当前触发的保护类型
 */
export function getActiveProtections(state: UserState): string[] {
  const protections: string[] = [];

  if (state.F > HIGH_FATIGUE) protections.push('fatigue');
  if (state.fusedFatigue !== undefined && state.fusedFatigue > HIGH_FUSED_FATIGUE) {
    protections.push('fused_fatigue');
  }
  if (state.visualFatigue && state.visualFatigue.confidence >= MIN_VISUAL_CONFIDENCE) {
    if (state.visualFatigue.score > HIGH_VISUAL_FATIGUE) {
      protections.push('visual_fatigue_high');
    } else if (state.visualFatigue.score > MODERATE_VISUAL_FATIGUE) {
      protections.push('visual_fatigue_moderate');
    }
    if (state.visualFatigue.trend > FATIGUE_TREND_THRESHOLD) {
      protections.push('visual_fatigue_trend');
    }
  }
  if (state.M < LOW_MOTIVATION) protections.push('motivation');
  if (state.A < MIN_ATTENTION) protections.push('attention');
  // 保护: state.T 可能为 undefined
  if (state.T && (state.T === 'down' || state.T === 'stuck')) protections.push('trend');
  // 习惯画像保护
  if (state.H) protections.push('habit_profile');

  return protections;
}

// ==================== 习惯画像保护 ====================

/** 习惯画像最小会话数阈值（需要至少3次会话才应用习惯适配） */
const MIN_HABIT_SESSIONS = 3;

/**
 * 习惯画像保护
 *
 * 根据用户学习习惯调整策略参数：
 * - 调整批量大小以匹配用户偏好
 * - 根据最佳学习时段调整难度
 *
 * @param state 用户状态
 * @param params 原始策略参数
 * @returns 约束后的策略参数
 */
export function applyHabitProfileProtection(
  state: UserState,
  params: StrategyParams,
): StrategyParams {
  const result = { ...params };

  // 如果没有习惯画像数据，跳过
  if (!state.H) {
    return result;
  }

  const habit = state.H;

  // 批量大小适配：使用用户偏好的批量大小（如果有足够数据）
  // 使用 rhythmPref.batchMedian 作为用户偏好的批量大小
  // 使用 samples.batches 检查数据充足性
  if (habit.rhythmPref.batchMedian > 0 && habit.samples.batches >= MIN_HABIT_SESSIONS) {
    // 以用户习惯为基准，允许+3的浮动上限
    const preferredBatch = Math.round(habit.rhythmPref.batchMedian);
    // 限制批量大小不超过用户习惯的批量+3，但至少为5
    result.batch_size = Math.max(5, Math.min(result.batch_size, preferredBatch + 3));
  }

  // 时段适配：如果当前不是用户的最佳学习时段，适当降低挑战
  // 使用 preferredTimeSlots 数组和 samples.timeEvents 检查数据充足性
  if (habit.preferredTimeSlots.length > 0 && habit.samples.timeEvents >= MIN_HABIT_SESSIONS) {
    const currentHour = new Date().getHours();
    // 时段分桶：早(0: 0-11) / 午(1: 12-17) / 晚(2: 18-23)
    const currentSlot = currentHour < 12 ? 0 : currentHour < 18 ? 1 : 2;

    // 检查用户偏好的时间段是否与当前时段匹配
    // preferredTimeSlots 是小时数组，需要转换为时段
    const preferredSlots = new Set(
      habit.preferredTimeSlots.map((hour) => (hour < 12 ? 0 : hour < 18 ? 1 : 2)),
    );

    if (!preferredSlots.has(currentSlot)) {
      // 非最佳时段，略微降低新词比例
      result.new_ratio = Math.min(result.new_ratio, 0.25);
    }
  }

  return result;
}
