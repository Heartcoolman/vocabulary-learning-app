/**
 * LearningState API适配器
 * 封装学习状态相关的API调用
 */

import type { ApiResponse, RequestOptions } from '../types/common';
import type {
  WordLearningState,
  WordScore,
  MasteryEvaluation,
  CompleteWordState,
  UserStats,
  UserScoreStats,
  UserMasteryStats,
  UserLearningStats,
  WordStateUpdateData,
  ReviewEventInput,
  ReviewTraceRecord,
  WordMemoryState,
  IntervalPrediction,
  WordState,
} from '../types/learning-state';
import { ApiClient } from './base-client';

/**
 * LearningState API适配器类
 */
export class LearningStateAdapter {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  // ==================== 单词学习状态管理 ====================

  /**
   * 获取单词学习状态
   */
  async getWordState(
    userId: string,
    wordId: string,
    includeMastery: boolean = false,
    options?: RequestOptions,
  ): Promise<CompleteWordState> {
    const response = await this.client.get<CompleteWordState>(`/word-state/${userId}/${wordId}`, {
      ...options,
      params: { includeMastery, ...options?.params },
    });
    return response.data!;
  }

  /**
   * 批量获取单词学习状态
   */
  async batchGetWordStates(
    userId: string,
    wordIds: string[],
    includeMastery: boolean = false,
    options?: RequestOptions,
  ): Promise<Record<string, CompleteWordState>> {
    const response = await this.client.post<Record<string, CompleteWordState>>(
      `/word-state/${userId}/batch`,
      { wordIds, includeMastery },
      options,
    );
    return response.data!;
  }

  /**
   * 获取需要复习的单词
   */
  async getDueWords(userId: string, options?: RequestOptions): Promise<WordLearningState[]> {
    const response = await this.client.get<WordLearningState[]>(
      `/word-state/${userId}/due`,
      options,
    );
    return response.data!;
  }

  /**
   * 获取特定状态的单词
   */
  async getWordsByState(
    userId: string,
    state: WordState,
    options?: RequestOptions,
  ): Promise<WordLearningState[]> {
    const response = await this.client.get<WordLearningState[]>(
      `/word-state/${userId}/by-state/${state}`,
      options,
    );
    return response.data!;
  }

  /**
   * 更新单词学习状态
   */
  async updateWordState(
    userId: string,
    wordId: string,
    data: WordStateUpdateData,
    options?: RequestOptions,
  ): Promise<WordLearningState> {
    const response = await this.client.put<WordLearningState>(
      `/word-state/${userId}/${wordId}`,
      data,
      options,
    );
    return response.data!;
  }

  /**
   * 批量更新单词学习状态
   */
  async batchUpdateWordStates(
    userId: string,
    updates: Array<{ wordId: string; data: WordStateUpdateData }>,
    options?: RequestOptions,
  ): Promise<void> {
    await this.client.post(`/word-state/${userId}/batch-update`, { updates }, options);
  }

  /**
   * 删除单词学习状态
   */
  async deleteWordState(userId: string, wordId: string, options?: RequestOptions): Promise<void> {
    await this.client.delete(`/word-state/${userId}/${wordId}`, options);
  }

  /**
   * 获取用户学习统计
   */
  async getUserStats(userId: string, options?: RequestOptions): Promise<UserStats> {
    const response = await this.client.get<UserStats>(`/word-state/${userId}/stats`, options);
    return response.data!;
  }

  // ==================== 单词得分管理 ====================

  /**
   * 获取单词得分
   */
  async getWordScore(
    userId: string,
    wordId: string,
    options?: RequestOptions,
  ): Promise<WordScore | null> {
    const response = await this.client.get<WordScore | null>(
      `/word-score/${userId}/${wordId}`,
      options,
    );
    return response.data!;
  }

  /**
   * 批量获取单词得分
   */
  async batchGetWordScores(
    userId: string,
    wordIds: string[],
    options?: RequestOptions,
  ): Promise<Record<string, WordScore>> {
    const response = await this.client.post<Record<string, WordScore>>(
      `/word-score/${userId}/batch`,
      { wordIds },
      options,
    );
    return response.data!;
  }

  /**
   * 更新单词得分
   */
  async updateWordScore(
    userId: string,
    wordId: string,
    result: { isCorrect: boolean; responseTime?: number },
    options?: RequestOptions,
  ): Promise<WordScore> {
    const response = await this.client.post<WordScore>(
      `/word-score/${userId}/${wordId}/update`,
      result,
      options,
    );
    return response.data!;
  }

  /**
   * 获取低分单词
   */
  async getLowScoreWords(
    userId: string,
    threshold: number = 40,
    options?: RequestOptions,
  ): Promise<WordScore[]> {
    const response = await this.client.get<WordScore[]>(`/word-score/${userId}/low-score`, {
      ...options,
      params: { threshold, ...options?.params },
    });
    return response.data!;
  }

  /**
   * 获取高分单词
   */
  async getHighScoreWords(
    userId: string,
    threshold: number = 80,
    options?: RequestOptions,
  ): Promise<WordScore[]> {
    const response = await this.client.get<WordScore[]>(`/word-score/${userId}/high-score`, {
      ...options,
      params: { threshold, ...options?.params },
    });
    return response.data!;
  }

  /**
   * 获取用户得分统计
   */
  async getUserScoreStats(userId: string, options?: RequestOptions): Promise<UserScoreStats> {
    const response = await this.client.get<UserScoreStats>(`/word-score/${userId}/stats`, options);
    return response.data!;
  }

  // ==================== 掌握度评估管理 ====================

  /**
   * 评估单词掌握度
   */
  async evaluateWord(
    userId: string,
    wordId: string,
    userFatigue?: number,
    options?: RequestOptions,
  ): Promise<MasteryEvaluation> {
    const response = await this.client.post<MasteryEvaluation>(
      `/word-mastery/${userId}/${wordId}/evaluate`,
      { userFatigue },
      options,
    );
    return response.data!;
  }

  /**
   * 批量评估单词掌握度
   */
  async batchEvaluateWords(
    userId: string,
    wordIds: string[],
    userFatigue?: number,
    options?: RequestOptions,
  ): Promise<MasteryEvaluation[]> {
    const response = await this.client.post<MasteryEvaluation[]>(
      `/word-mastery/${userId}/batch-evaluate`,
      { wordIds, userFatigue },
      options,
    );
    return response.data!;
  }

  /**
   * 获取用户掌握度统计
   */
  async getUserMasteryStats(userId: string, options?: RequestOptions): Promise<UserMasteryStats> {
    const response = await this.client.get<UserMasteryStats>(
      `/word-mastery/${userId}/stats`,
      options,
    );
    return response.data!;
  }

  /**
   * 记录复习事件
   */
  async recordReview(
    userId: string,
    wordId: string,
    event: ReviewEventInput,
    options?: RequestOptions,
  ): Promise<void> {
    await this.client.post(`/word-mastery/${userId}/${wordId}/review`, event, options);
  }

  /**
   * 批量记录复习事件
   */
  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEventInput }>,
    options?: RequestOptions,
  ): Promise<void> {
    await this.client.post(`/word-mastery/${userId}/batch-review`, { events }, options);
  }

  /**
   * 获取单词复习轨迹
   */
  async getMemoryTrace(
    userId: string,
    wordId: string,
    limit: number = 50,
    options?: RequestOptions,
  ): Promise<ReviewTraceRecord[]> {
    const response = await this.client.get<ReviewTraceRecord[]>(
      `/word-mastery/${userId}/${wordId}/trace`,
      {
        ...options,
        params: { limit, ...options?.params },
      },
    );
    return response.data!;
  }

  /**
   * 获取单词记忆状态
   */
  async getWordMemoryState(
    userId: string,
    wordId: string,
    options?: RequestOptions,
  ): Promise<WordMemoryState | null> {
    const response = await this.client.get<WordMemoryState | null>(
      `/word-mastery/${userId}/${wordId}/memory-state`,
      options,
    );
    return response.data!;
  }

  /**
   * 预测单词最佳复习间隔
   */
  async predictInterval(
    userId: string,
    wordId: string,
    targetRecall: number = 0.9,
    options?: RequestOptions,
  ): Promise<IntervalPrediction> {
    const response = await this.client.post<IntervalPrediction>(
      `/word-mastery/${userId}/${wordId}/predict-interval`,
      { targetRecall },
      options,
    );
    return response.data!;
  }

  // ==================== 统一查询接口 ====================

  /**
   * 获取用户综合学习统计
   */
  async getUserLearningStats(userId: string, options?: RequestOptions): Promise<UserLearningStats> {
    const response = await this.client.get<UserLearningStats>(
      `/learning-state/${userId}/stats`,
      options,
    );
    return response.data!;
  }

  /**
   * 清除用户缓存
   */
  async clearUserCache(userId: string, options?: RequestOptions): Promise<void> {
    await this.client.post(`/learning-state/${userId}/clear-cache`, {}, options);
  }

  /**
   * 清除单词缓存
   */
  async clearWordCache(userId: string, wordId: string, options?: RequestOptions): Promise<void> {
    await this.client.post(`/learning-state/${userId}/${wordId}/clear-cache`, {}, options);
  }
}

/**
 * 创建LearningState适配器
 */
export function createLearningStateAdapter(client: ApiClient): LearningStateAdapter {
  return new LearningStateAdapter(client);
}
