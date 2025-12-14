/**
 * AMAS Policies Layer - Micro Session Policy
 * 碎片时间适配策略
 *
 * 职责:
 * - 为碎片时间场景（5-10分钟）选择最合适的单词
 * - 优先短词：减少认知负担，提高学习效率
 * - 优先高遗忘风险词：最大化学习效果
 * - 限制数量：通常不超过5个词
 *
 * 适用场景:
 * - 通勤路上
 * - 排队等待
 * - 课间休息
 * - 其他碎片时间
 */

import {
  IWordSelector,
  BaseWordSelector,
  WordCandidate,
  SelectionContext,
  SelectionResult,
} from './word-selector.interface';

// ==================== 常量配置 ====================

/** 默认最大单词数量 */
const DEFAULT_MAX_WORDS = 5;

/** 短词定义：字母数量 <= 8 */
const SHORT_WORD_LENGTH = 8;

/** 权重配置 */
const WEIGHTS = {
  /** 遗忘风险权重 */
  forgettingRisk: 0.5,
  /** 短词偏好权重 */
  shortWord: 0.3,
  /** 记忆强度权重（越弱越优先） */
  memoryWeakness: 0.2,
};

// ==================== 碎片时间适配策略 ====================

/**
 * 碎片时间单词选择策略
 *
 * 评分公式:
 * score = forgettingRisk × 0.5 + shortWordBonus × 0.3 + memoryWeakness × 0.2
 *
 * 其中:
 * - forgettingRisk: [0,1] 遗忘风险，越高越优先
 * - shortWordBonus: [0,1] 短词奖励，length <= 8 得1分，否则线性递减
 * - memoryWeakness: [0,1] 记忆薄弱度，即 1 - memoryStrength
 */
export class MicroSessionPolicy extends BaseWordSelector implements IWordSelector {
  private maxWords: number;

  constructor(maxWords: number = DEFAULT_MAX_WORDS) {
    super('MicroSessionPolicy');
    this.maxWords = Math.max(1, Math.min(maxWords, 10)); // 限制在1-10之间
  }

  /**
   * 选择适合碎片时间学习的单词
   */
  selectWords(candidates: WordCandidate[], context: SelectionContext): SelectionResult {
    // 如果没有候选词，直接返回
    if (candidates.length === 0) {
      return {
        selectedWordIds: [],
        reason: '无可用单词',
      };
    }

    // 确定目标数量
    const targetCount = context.targetCount ?? this.maxWords;
    const effectiveMaxWords = Math.min(targetCount, this.maxWords);

    // 如果候选词数量不超过目标数量，直接返回全部
    if (candidates.length <= effectiveMaxWords) {
      return {
        selectedWordIds: candidates.map((c) => c.wordId),
        reason: `候选词数量(${candidates.length})不超过目标数量(${effectiveMaxWords})，返回全部`,
      };
    }

    // 计算每个候选词的优先级分数
    const now = context.timestamp ?? Date.now();
    const scoredCandidates = candidates.map((candidate) => ({
      wordId: candidate.wordId,
      score: this.calculatePriorityScore(candidate, now),
    }));

    // 按分数降序排序
    scoredCandidates.sort((a, b) => b.score - a.score);

    // 选择前 N 个
    const selectedWordIds = scoredCandidates.slice(0, effectiveMaxWords).map((c) => c.wordId);

    // 构建分数映射
    const scores = new Map<string, number>();
    scoredCandidates.forEach((c) => scores.set(c.wordId, c.score));

    return {
      selectedWordIds,
      reason: `碎片时间策略：选择了${selectedWordIds.length}个短词且高遗忘风险的单词`,
      scores,
    };
  }

  /**
   * 计算单词的优先级分数
   * @private
   */
  private calculatePriorityScore(candidate: WordCandidate, now: number): number {
    // 1. 遗忘风险分数
    const forgettingRisk = this.calculateForgettingRisk(candidate, now);

    // 2. 短词奖励分数
    const shortWordBonus = this.calculateShortWordBonus(candidate);

    // 3. 记忆薄弱度分数（记忆强度越低越优先）
    const memoryWeakness = this.calculateMemoryWeakness(candidate);

    // 4. 综合评分
    const score =
      forgettingRisk * WEIGHTS.forgettingRisk +
      shortWordBonus * WEIGHTS.shortWord +
      memoryWeakness * WEIGHTS.memoryWeakness;

    return score;
  }

  /**
   * 计算短词奖励分数
   * @private
   */
  private calculateShortWordBonus(candidate: WordCandidate): number {
    if (!candidate.length) {
      // 如果没有长度信息，默认给中等分数
      return 0.5;
    }

    if (candidate.length <= SHORT_WORD_LENGTH) {
      // 短词：满分
      return 1.0;
    } else if (candidate.length <= 12) {
      // 中等长度：线性递减
      // length=9: 0.75, length=12: 0.25
      return 1.0 - ((candidate.length - SHORT_WORD_LENGTH) / 4) * 0.75;
    } else {
      // 长词：低分
      return Math.max(0, 0.25 - (candidate.length - 12) * 0.05);
    }
  }

  /**
   * 计算记忆薄弱度分数
   * @private
   */
  private calculateMemoryWeakness(candidate: WordCandidate): number {
    if (candidate.memoryStrength !== undefined) {
      // 直接使用提供的记忆强度
      return 1 - candidate.memoryStrength;
    }

    if (!candidate.reviewCount) {
      // 未学习过，薄弱度最高
      return 1.0;
    }

    // 基于复习次数估算：复习次数越多，记忆越强
    // reviewCount=0: weakness=1.0
    // reviewCount=5: weakness=0.5
    // reviewCount=10+: weakness=0.2
    const weakness = 1.0 / (1 + candidate.reviewCount * 0.15);
    return Math.max(0.2, weakness);
  }

  /**
   * 设置最大单词数量
   */
  setMaxWords(maxWords: number): void {
    this.maxWords = Math.max(1, Math.min(maxWords, 10));
  }

  /**
   * 获取当前配置
   */
  getConfig(): {
    maxWords: number;
    weights: typeof WEIGHTS;
    shortWordLength: number;
  } {
    return {
      maxWords: this.maxWords,
      weights: WEIGHTS,
      shortWordLength: SHORT_WORD_LENGTH,
    };
  }

  /**
   * 批量评分（用于调试和分析）
   */
  scoreAll(
    candidates: WordCandidate[],
    context: SelectionContext,
  ): Array<{ wordId: string; score: number; details: any }> {
    const now = context.timestamp ?? Date.now();

    return candidates.map((candidate) => {
      const forgettingRisk = this.calculateForgettingRisk(candidate, now);
      const shortWordBonus = this.calculateShortWordBonus(candidate);
      const memoryWeakness = this.calculateMemoryWeakness(candidate);
      const score = this.calculatePriorityScore(candidate, now);

      return {
        wordId: candidate.wordId,
        score,
        details: {
          forgettingRisk,
          shortWordBonus,
          memoryWeakness,
          length: candidate.length,
          reviewCount: candidate.reviewCount,
        },
      };
    });
  }
}

// ==================== 导出默认实例 ====================

export const defaultMicroSessionPolicy = new MicroSessionPolicy();

// ==================== 工厂函数 ====================

/**
 * 创建碎片时间策略实例
 *
 * @param maxWords 最大单词数量（默认5）
 * @returns MicroSessionPolicy实例
 */
export function createMicroSessionPolicy(maxWords?: number): MicroSessionPolicy {
  return new MicroSessionPolicy(maxWords);
}
