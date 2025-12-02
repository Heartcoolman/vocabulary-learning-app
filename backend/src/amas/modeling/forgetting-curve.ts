/**
 * 遗忘曲线计算模块 - 基于 ACT-R 认知架构
 *
 * ACT-R (Adaptive Control of Thought-Rational) 记忆模型使用指数衰减函数
 * 来模拟人类记忆强度随时间的衰减过程
 */

const MS_PER_DAY = 86_400_000;
const BASE_HALF_LIFE_DAYS = 1;
const MIN_HALF_LIFE_DAYS = 0.1;

export interface MemoryTrace {
  wordId: string;
  lastReviewTime: Date | string;
  reviewCount: number;
  averageAccuracy: number;
  memoryStrength?: number;
}

/**
 * 计算遗忘因子（0-1范围）
 *
 * @param trace - 记忆轨迹数据
 * @returns 遗忘因子，1表示记忆清晰，0表示完全遗忘
 */
export function calculateForgettingFactor(trace: MemoryTrace): number {
  const lastReviewMs = typeof trace.lastReviewTime === 'string'
    ? new Date(trace.lastReviewTime).getTime()
    : trace.lastReviewTime.getTime();

  const daysSinceReview = Math.max(0, (Date.now() - lastReviewMs) / MS_PER_DAY);

  const reviewMultiplier = 1 + trace.reviewCount * 0.2;
  const accuracy = Math.max(0.1, Math.min(1, trace.averageAccuracy));
  const strength = trace.memoryStrength ?? 1;

  let halfLife = BASE_HALF_LIFE_DAYS * reviewMultiplier * accuracy * strength;
  halfLife = Math.max(MIN_HALF_LIFE_DAYS, halfLife);

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
