/**
 * AMAS Policies Layer - Word Selector Interface
 * 单词选择器接口定义
 *
 * 职责:
 * - 定义统一的单词选择策略接口
 * - 支持多种选词策略（碎片时间、集中学习、复习优先等）
 * - 提供策略切换和组合的基础
 */

// ==================== 类型定义 ====================

/**
 * 单词候选项（输入）
 */
export interface WordCandidate {
  /** 单词ID */
  wordId: string;
  /** 单词长度（字符数） */
  length?: number;
  /** 难度等级 */
  difficulty?: 'easy' | 'mid' | 'hard';
  /** 遗忘风险 [0,1]，越高越容易遗忘 */
  forgettingRisk?: number;
  /** 最后复习时间（毫秒时间戳） */
  lastReviewTime?: number;
  /** 复习次数 */
  reviewCount?: number;
  /** 记忆强度 [0,1] */
  memoryStrength?: number;
  /** 优先级分数（可选，用于预先计算的优先级） */
  priorityScore?: number;
}

/**
 * 选词上下文（环境信息）
 */
export interface SelectionContext {
  /** 用户ID */
  userId: string;
  /** 可用时间（分钟） */
  availableTimeMinutes?: number;
  /** 是否为碎片时间场景 */
  isMicroSession?: boolean;
  /** 目标单词数量 */
  targetCount?: number;
  /** 当前时间戳 */
  timestamp?: number;
  /** 用户当前疲劳度 [0,1] */
  fatigue?: number;
  /** 用户当前注意力 [0,1] */
  attention?: number;
}

/**
 * 选词结果
 */
export interface SelectionResult {
  /** 选中的单词ID列表（按优先级排序） */
  selectedWordIds: string[];
  /** 选词理由说明 */
  reason?: string;
  /** 每个单词的优先级分数（可选） */
  scores?: Map<string, number>;
}

// ==================== 接口定义 ====================

/**
 * 单词选择器接口
 *
 * 所有选词策略都应该实现此接口
 */
export interface IWordSelector {
  /**
   * 选择单词
   *
   * @param candidates 候选单词列表
   * @param context 选词上下文
   * @returns 选词结果
   */
  selectWords(
    candidates: WordCandidate[],
    context: SelectionContext,
  ): Promise<SelectionResult> | SelectionResult;

  /**
   * 策略名称（用于日志和调试）
   */
  getName(): string;
}

/**
 * 基础选择器抽象类（可选，提供通用功能）
 */
export abstract class BaseWordSelector implements IWordSelector {
  constructor(protected readonly name: string) {}

  abstract selectWords(
    candidates: WordCandidate[],
    context: SelectionContext,
  ): Promise<SelectionResult> | SelectionResult;

  getName(): string {
    return this.name;
  }

  /**
   * 计算遗忘风险分数（通用辅助方法）
   * 如果候选项没有提供 forgettingRisk，基于时间计算
   */
  protected calculateForgettingRisk(candidate: WordCandidate, now: number): number {
    if (candidate.forgettingRisk !== undefined) {
      return candidate.forgettingRisk;
    }

    if (!candidate.lastReviewTime) {
      return 1; // 未学习过，风险最高
    }

    const daysSinceReview = (now - candidate.lastReviewTime) / (1000 * 60 * 60 * 24);
    const reviewBonus = Math.min((candidate.reviewCount ?? 0) * 0.1, 0.5);

    // 简化的遗忘曲线: 风险随时间指数增长
    const baseRisk = 1 - Math.exp(-daysSinceReview / 3);
    return Math.max(0, Math.min(1, baseRisk - reviewBonus));
  }

  /**
   * 过滤并限制结果数量
   */
  protected limitResults(wordIds: string[], maxCount: number): string[] {
    return wordIds.slice(0, maxCount);
  }
}
