/**
 * Word Mastery Service
 * 单词掌握度服务
 *
 * 提供单词复习轨迹记录和掌握度评估功能
 * 包装 AMAS 层的 WordMemoryTracker 和 WordMasteryEvaluator
 */

import {
  WordMemoryTracker,
  ReviewEvent,
  WordMemoryState,
} from '../amas/tracking/word-memory-tracker';
import {
  WordMasteryEvaluator,
  MasteryEvaluation,
  EvaluatorConfig,
} from '../amas/evaluation/word-mastery-evaluator';
import { serviceLogger } from '../logger';

/**
 * 单词掌握度服务类
 */
class WordMasteryService {
  private memoryTracker: WordMemoryTracker;
  private masteryEvaluator: WordMasteryEvaluator;

  constructor() {
    this.memoryTracker = new WordMemoryTracker();
    this.masteryEvaluator = new WordMasteryEvaluator();
  }

  /**
   * 记录单词复习事件
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param event 复习事件
   */
  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    try {
      await this.memoryTracker.recordReview(userId, wordId, event);
    } catch (error) {
      serviceLogger.warn({ err: error, userId, wordId }, '记录复习事件失败');
      throw error;
    }
  }

  /**
   * 批量记录单词复习事件
   *
   * @param userId 用户ID
   * @param reviews 复习事件数组
   */
  async batchRecordReview(
    userId: string,
    reviews: Array<{ wordId: string; event: ReviewEvent }>,
  ): Promise<void> {
    try {
      await this.memoryTracker.batchRecordReview(userId, reviews);
    } catch (error) {
      serviceLogger.warn({ err: error, userId, count: reviews.length }, '批量记录复习事件失败');
      throw error;
    }
  }

  /**
   * 获取单词的复习轨迹
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param limit 返回数量限制
   */
  async getReviewTrace(
    userId: string,
    wordId: string,
    limit?: number,
  ): Promise<Array<{ secondsAgo: number; isCorrect?: boolean }>> {
    return this.memoryTracker.getReviewTrace(userId, wordId, limit);
  }

  /**
   * 获取单词的记忆状态
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   */
  async getMemoryState(userId: string, wordId: string): Promise<WordMemoryState | null> {
    const result = await this.memoryTracker.batchGetMemoryState(userId, [wordId]);
    return result.get(wordId) ?? null;
  }

  /**
   * 批量获取单词记忆状态
   *
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   */
  async batchGetMemoryState(
    userId: string,
    wordIds: string[],
  ): Promise<Map<string, WordMemoryState>> {
    return this.memoryTracker.batchGetMemoryState(userId, wordIds);
  }

  /**
   * 评估单词掌握度
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param userFatigue 用户疲劳度（可选）
   */
  async evaluate(userId: string, wordId: string, userFatigue?: number): Promise<MasteryEvaluation> {
    return this.masteryEvaluator.evaluate(userId, wordId, userFatigue);
  }

  /**
   * 批量评估单词掌握度
   *
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @param userFatigue 用户疲劳度（可选）
   */
  async batchEvaluate(
    userId: string,
    wordIds: string[],
    userFatigue?: number,
  ): Promise<MasteryEvaluation[]> {
    return this.masteryEvaluator.batchEvaluate(userId, wordIds, userFatigue);
  }

  /**
   * 更新评估器配置
   *
   * @param config 部分配置
   */
  updateEvaluatorConfig(config: Partial<EvaluatorConfig>): void {
    this.masteryEvaluator.updateConfig(config);
  }

  /**
   * 获取评估器配置
   */
  getEvaluatorConfig(): EvaluatorConfig {
    return this.masteryEvaluator.getConfig();
  }
}

export const wordMasteryService = new WordMasteryService();
