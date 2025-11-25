/**
 * Fallback Strategies - 降级策略
 * 用于模型不可用、异常或熔断时的安全降级
 */

import { UserState, StrategyParams, DifficultyLevel } from '../types';

/**
 * 降级原因
 */
export type FallbackReason =
  | 'circuit_open' // 熔断器打开
  | 'timeout' // 超时
  | 'exception' // 异常
  | 'missing_features' // 特征缺失
  | 'model_unavailable' // 模型不可用
  | 'degraded_state'; // 状态异常

/**
 * 降级结果
 */
export interface FallbackResult {
  /** 策略参数 */
  strategy: StrategyParams;
  /** 降级标记 */
  degraded: true;
  /** 降级原因 */
  reason: FallbackReason;
  /** 说明文本 */
  explanation: string;
}

/**
 * 安全默认策略
 * 特点: 中等负荷、中等难度、中等时长,避免过度挑战或疲劳
 *
 * @param reason 降级原因
 * @returns 降级结果
 */
export function safeDefaultStrategy(reason: FallbackReason): FallbackResult {
  return {
    strategy: {
      interval_scale: 1.0, // 标准间隔
      new_ratio: 0.2, // 20%新词(保守)
      difficulty: 'mid', // 中等难度
      batch_size: 8, // 中等批量
      hint_level: 1 // 中等提示
    },
    degraded: true,
    reason,
    explanation: '系统使用安全默认策略,确保学习体验稳定。'
  };
}

/**
 * 基于状态的规则引擎降级策略
 * 当模型不可用时,根据用户状态应用简单规则
 *
 * @param state 用户状态
 * @param reason 降级原因
 * @returns 降级结果
 */
export function rulesBasedFallback(
  state: UserState | null,
  reason: FallbackReason
): FallbackResult {
  // 如果没有状态,使用安全默认
  if (!state) {
    return safeDefaultStrategy(reason);
  }

  const { A, F, M, C } = state;

  // 规则1: 高疲劳保护
  if (F > 0.6) {
    return {
      strategy: {
        interval_scale: 1.2, // 延长间隔
        new_ratio: 0.1, // 减少新词
        difficulty: 'easy', // 降低难度
        batch_size: 5, // 减少批量
        hint_level: 2 // 增加提示
      },
      degraded: true,
      reason,
      explanation: '检测到疲劳度较高,已调整为轻负荷策略,建议适当休息。'
    };
  }

  // 规则2: 低动机保护
  if (M < -0.3) {
    return {
      strategy: {
        interval_scale: 1.0,
        new_ratio: 0.15, // 减少挑战
        difficulty: 'easy', // 降低难度
        batch_size: 6,
        hint_level: 2 // 增加鼓励
      },
      degraded: true,
      reason,
      explanation: '检测到学习动机偏低,已调整为鼓励性策略,让我们轻松开始吧!'
    };
  }

  // 规则3: 低注意力保护
  if (A < 0.4) {
    return {
      strategy: {
        interval_scale: 0.8, // 缩短间隔,增加互动频率
        new_ratio: 0.1, // 减少新词
        difficulty: 'mid',
        batch_size: 5, // 减少批量
        hint_level: 1
      },
      degraded: true,
      reason,
      explanation: '检测到注意力不集中,已调整为短批次策略,帮助保持专注。'
    };
  }

  // 规则4: 低记忆力补偿
  if (C.mem < 0.6) {
    return {
      strategy: {
        interval_scale: 0.8, // 缩短间隔,增加复习
        new_ratio: 0.1, // 减少新词
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      },
      degraded: true,
      reason,
      explanation: '根据当前学习状态,已调整为巩固策略,专注复习和强化记忆。'
    };
  }

  // 规则5: 高能力状态
  if (C.mem > 0.75 && A > 0.6 && F < 0.4 && M > 0.3) {
    return {
      strategy: {
        interval_scale: 1.2, // 延长间隔
        new_ratio: 0.3, // 增加挑战
        difficulty: 'mid',
        batch_size: 12,
        hint_level: 0 // 减少提示
      },
      degraded: true,
      reason,
      explanation: '检测到良好的学习状态,已调整为挑战性策略,加油!'
    };
  }

  // 默认: 标准策略
  return {
    strategy: {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1
    },
    degraded: true,
    reason,
    explanation: '系统使用基于规则的策略,确保学习体验连续。'
  };
}

/**
 * 时间敏感的降级策略
 * 考虑当前时间段,应用习惯化策略
 *
 * @param state 用户状态
 * @param reason 降级原因
 * @param hour 当前小时(0-23)
 * @returns 降级结果
 */
export function timeAwareFallback(
  state: UserState | null,
  reason: FallbackReason,
  hour?: number
): FallbackResult {
  const currentHour = hour ?? new Date().getHours();

  // 早晨时段(6-9): 温和启动
  if (currentHour >= 6 && currentHour < 9) {
    return {
      strategy: {
        interval_scale: 1.0,
        new_ratio: 0.15,
        difficulty: 'easy',
        batch_size: 6,
        hint_level: 1
      },
      degraded: true,
      reason,
      explanation: '早晨时段,使用温和策略开启新的一天。'
    };
  }

  // 午休后(13-15): 中等挑战
  if (currentHour >= 13 && currentHour < 15) {
    return {
      strategy: {
        interval_scale: 1.0,
        new_ratio: 0.25,
        difficulty: 'mid',
        batch_size: 10,
        hint_level: 1
      },
      degraded: true,
      reason,
      explanation: '午后时段,精力恢复,使用标准策略。'
    };
  }

  // 晚间(19-22): 回顾巩固
  if (currentHour >= 19 && currentHour < 22) {
    return {
      strategy: {
        interval_scale: 1.2,
        new_ratio: 0.15,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      },
      degraded: true,
      reason,
      explanation: '晚间时段,使用巩固策略,复习今日所学。'
    };
  }

  // 深夜(22-6): 轻负荷
  if (currentHour >= 22 || currentHour < 6) {
    return {
      strategy: {
        interval_scale: 1.0,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 2
      },
      degraded: true,
      reason,
      explanation: '深夜时段,使用轻负荷策略,注意休息。'
    };
  }

  // 其他时段: 基于状态的规则
  return rulesBasedFallback(state, reason);
}

/**
 * 智能降级策略选择器
 * 根据状态和上下文选择最合适的降级策略
 *
 * @param state 用户状态
 * @param reason 降级原因
 * @param context 上下文信息
 * @returns 降级结果
 */
export function intelligentFallback(
  state: UserState | null,
  reason: FallbackReason,
  context?: {
    /** 交互次数 */
    interactionCount?: number;
    /** 最近错误率 */
    recentErrorRate?: number;
    /** 当前小时 */
    hour?: number;
  }
): FallbackResult {
  // 冷启动阶段(交互次数<20): 使用安全默认
  if (context?.interactionCount && context.interactionCount < 20) {
    return safeDefaultStrategy(reason);
  }

  // 最近错误率过高: 降低难度
  if (context?.recentErrorRate && context.recentErrorRate > 0.5) {
    return {
      strategy: {
        interval_scale: 0.8,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 6,
        hint_level: 2
      },
      degraded: true,
      reason,
      explanation: '检测到近期错误率较高,已调整为轻松策略,加强基础。'
    };
  }

  // 如果有时间上下文,优先使用时间敏感策略
  if (context?.hour !== undefined) {
    return timeAwareFallback(state, reason, context.hour);
  }

  // 默认: 基于状态的规则
  return rulesBasedFallback(state, reason);
}
