/**
 * 遗忘曲线计算模块 - 基于 ACT-R 认知架构 + 个性化半衰期
 *
 * ACT-R (Adaptive Control of Thought-Rational) 记忆模型使用指数衰减函数
 * 来模拟人类记忆强度随时间的衰减过程
 *
 * 个性化扩展:
 * - 每个单词-用户对维护独立的半衰期
 * - 基于答题结果动态调整半衰期
 * - 支持认知能力因子调整
 */

const MS_PER_DAY = 86_400_000;
const BASE_HALF_LIFE_DAYS = 1;
const MIN_HALF_LIFE_DAYS = 0.1;
const MAX_HALF_LIFE_DAYS = 90;

export interface MemoryTrace {
  wordId: string;
  lastReviewTime: Date | string;
  reviewCount: number;
  averageAccuracy: number;
  memoryStrength?: number;
  /** 个性化半衰期（天），如果提供则优先使用 */
  personalHalfLife?: number;
}

export interface HalfLifeUpdate {
  newHalfLife: number;
  change: number;
  isSignificant: boolean;
}

export interface CognitiveConfig {
  memory?: number;
  speed?: number;
  stability?: number;
}

/**
 * 计算遗忘因子（0-1范围）
 */
export function calculateForgettingFactor(trace: MemoryTrace): number {
  const lastReviewMs =
    typeof trace.lastReviewTime === 'string'
      ? new Date(trace.lastReviewTime).getTime()
      : trace.lastReviewTime.getTime();

  const daysSinceReview = Math.max(0, (Date.now() - lastReviewMs) / MS_PER_DAY);

  let halfLife: number;
  if (trace.personalHalfLife !== undefined && trace.personalHalfLife > 0) {
    halfLife = trace.personalHalfLife;
  } else {
    const reviewMultiplier = 1 + trace.reviewCount * 0.2;
    const accuracy = Math.max(0.1, Math.min(1, trace.averageAccuracy));
    const strength = trace.memoryStrength ?? 1;
    halfLife = BASE_HALF_LIFE_DAYS * reviewMultiplier * accuracy * strength;
  }

  halfLife = clamp(halfLife, MIN_HALF_LIFE_DAYS, MAX_HALF_LIFE_DAYS);
  return Math.exp(-daysSinceReview / halfLife);
}

/**
 * 批量计算多个单词的遗忘因子
 */
export function batchCalculateForgettingFactors(traces: MemoryTrace[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const trace of traces) {
    result.set(trace.wordId, calculateForgettingFactor(trace));
  }
  return result;
}

/**
 * 更新个性化半衰期（基于答题反馈）
 */
export function updateHalfLife(
  currentHalfLife: number,
  wasCorrect: boolean,
  responseTime: number,
  cogConfig?: CognitiveConfig,
): HalfLifeUpdate {
  let timeFactor: number;
  if (responseTime < 1500) {
    timeFactor = 1.3;
  } else if (responseTime < 2500) {
    timeFactor = 1.1;
  } else if (responseTime < 4000) {
    timeFactor = 1.0;
  } else {
    timeFactor = 0.9;
  }

  const correctFactor = wasCorrect ? 1.4 : 0.65;

  let cogFactor = 1.0;
  if (cogConfig) {
    if (cogConfig.memory !== undefined) {
      cogFactor *= 1 + (cogConfig.memory - 0.5) * 0.4;
    }
    if (cogConfig.speed !== undefined && !wasCorrect && responseTime < 2000) {
      cogFactor *= 1.1;
    }
    if (cogConfig.stability !== undefined) {
      const dampingFactor = 0.3 + cogConfig.stability * 0.7;
      cogFactor = 1 + (cogFactor - 1) * (1 - dampingFactor * 0.5);
    }
  }

  const rawNewHalfLife = currentHalfLife * correctFactor * timeFactor * cogFactor;
  const newHalfLife = clamp(rawNewHalfLife, MIN_HALF_LIFE_DAYS, MAX_HALF_LIFE_DAYS);
  const change = newHalfLife - currentHalfLife;
  const relativeChange = Math.abs(change) / currentHalfLife;

  return {
    newHalfLife,
    change,
    isSignificant: relativeChange > 0.1,
  };
}

/**
 * 计算最优复习间隔（基于目标保持率）
 */
export function computeOptimalInterval(halfLife: number, targetRetention = 0.8): number {
  const interval = -halfLife * Math.log(targetRetention);
  return clamp(interval, 0.1, 365);
}

/**
 * 估计在给定时间后的保持率
 */
export function estimateRetention(halfLife: number, daysElapsed: number): number {
  return Math.exp(-daysElapsed / halfLife);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ==================== 接口封装 (T1a.3) ====================

/**
 * 遗忘曲线适配器 - 为决策策略提供统一接口
 *
 * 此类封装现有的函数式接口，提供面向对象的访问方式，
 * 便于在决策策略中使用遗忘曲线计算能力
 */
export class ForgettingCurveAdapter {
  /**
   * 计算记忆保持率
   *
   * @param trace - 记忆轨迹
   * @returns 保持率 [0,1]，1表示完全记住，0表示完全遗忘
   */
  calculateRetention(trace: MemoryTrace): number {
    return calculateForgettingFactor(trace);
  }

  /**
   * 预测下次复习时间
   *
   * @param halfLife - 当前半衰期（天）
   * @param targetRetention - 目标保持率 [0,1]，默认0.8
   * @returns 建议的复习间隔（天）
   */
  predictNextReview(halfLife: number, targetRetention = 0.8): number {
    return computeOptimalInterval(halfLife, targetRetention);
  }

  /**
   * 根据答题反馈更新半衰期
   *
   * @param currentHalfLife - 当前半衰期（天）
   * @param wasCorrect - 是否答对
   * @param responseTime - 反应时间（毫秒）
   * @param cogConfig - 认知能力配置（可选）
   * @returns 半衰期更新结果
   */
  updateHalfLife(
    currentHalfLife: number,
    wasCorrect: boolean,
    responseTime: number,
    cogConfig?: CognitiveConfig,
  ): HalfLifeUpdate {
    return updateHalfLife(currentHalfLife, wasCorrect, responseTime, cogConfig);
  }

  /**
   * 估计在指定天数后的保持率
   *
   * @param halfLife - 半衰期（天）
   * @param daysElapsed - 已过天数
   * @returns 预期保持率 [0,1]
   */
  estimateRetention(halfLife: number, daysElapsed: number): number {
    return estimateRetention(halfLife, daysElapsed);
  }

  /**
   * 批量计算多个单词的保持率
   *
   * @param traces - 记忆轨迹数组
   * @returns 单词ID到保持率的映射
   */
  batchCalculateRetention(traces: MemoryTrace[]): Map<string, number> {
    return batchCalculateForgettingFactors(traces);
  }
}
