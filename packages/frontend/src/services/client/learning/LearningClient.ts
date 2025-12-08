import { BaseClient, ApiError } from '../base/BaseClient';
import { AnswerRecord, WordLearningState, WordScore, WordState } from '../../../types/models';
import type { CreateRecordDto } from '@danci/shared';
import { apiLogger } from '../../../utils/logger';

/**
 * API 响应中的 WordLearningState 类型（日期字段为字符串）
 */
interface ApiWordLearningState {
  id: string;
  userId: string;
  wordId: string;
  state: string;
  masteryLevel: number;
  easeFactor: number;
  reviewCount: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  currentInterval: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * API 响应中的 WordScore 类型（日期字段为字符串）
 */
interface ApiWordScore {
  id: string;
  userId: string;
  wordId: string;
  totalScore: number;
  accuracyScore: number;
  speedScore: number;
  stabilityScore: number;
  proficiencyScore: number;
  totalAttempts: number;
  correctAttempts: number;
  averageResponseTime: number;
  averageDwellTime: number;
  recentAccuracy: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 转换WordLearningState的日期字段为时间戳
 */
function convertLearningStateDates(state: ApiWordLearningState): WordLearningState {
  return {
    ...state,
    state: state.state as WordState,
    lastReviewDate: state.lastReviewDate ? new Date(state.lastReviewDate).getTime() : null,
    nextReviewDate: state.nextReviewDate ? new Date(state.nextReviewDate).getTime() : null,
    createdAt: new Date(state.createdAt).getTime(),
    updatedAt: new Date(state.updatedAt).getTime(),
  };
}

/**
 * 转换WordScore的日期字段为时间戳
 */
function convertWordScoreDates(score: ApiWordScore): WordScore {
  return {
    ...score,
    createdAt: new Date(score.createdAt).getTime(),
    updatedAt: new Date(score.updatedAt).getTime(),
  };
}

/**
 * LearningClient - 学习记录和学习状态管理相关API
 *
 * 职责：
 * - 学习记录的CRUD操作
 * - 单词学习状态管理
 * - 单词得分管理
 * - 到期单词查询
 */
export class LearningClient extends BaseClient {
  /**
   * 获取学习记录（支持分页）
   * @param options 分页选项
   */
  async getRecords(options?: { page?: number; pageSize?: number }): Promise<{
    records: AnswerRecord[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const queryParams = new URLSearchParams();
    if (options?.page) queryParams.append('page', options.page.toString());
    if (options?.pageSize) queryParams.append('pageSize', options.pageSize.toString());

    const query = queryParams.toString();
    const endpoint = `/api/records${query ? `?${query}` : ''}`;

    const body = await this.requestFull<{
      data?: Array<{
        id: string;
        wordId: string;
        timestamp: string | number;
        selectedAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
        responseTime?: number;
        dwellTime?: number;
      }>;
      pagination?: { page: number; pageSize: number; total: number; totalPages: number };
    }>(endpoint);

    const records = (body.data || []).map((record) => ({
      ...record,
      timestamp:
        typeof record.timestamp === 'string'
          ? new Date(record.timestamp).getTime()
          : record.timestamp,
    })) as AnswerRecord[];

    const DEFAULT_PAGE_SIZE = 20;
    const defaultPagination = {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? Math.max(records.length, DEFAULT_PAGE_SIZE),
      total: records.length,
      totalPages: 1,
    };

    return {
      records,
      pagination: body.pagination || defaultPagination,
    };
  }

  /**
   * 保存答题记录
   */
  async createRecord(recordData: CreateRecordDto): Promise<AnswerRecord> {
    return this.request<AnswerRecord>('/api/records', {
      method: 'POST',
      body: JSON.stringify(recordData),
    });
  }

  /**
   * 批量创建学习记录
   */
  async batchCreateRecords(records: CreateRecordDto[]): Promise<AnswerRecord[]> {
    return this.request<AnswerRecord[]>('/api/records/batch', {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
  }

  /**
   * 获取单词学习状态
   * 返回null表示数据不存在（404）
   */
  async getWordLearningState(wordId: string): Promise<WordLearningState | null> {
    try {
      const state = await this.request<ApiWordLearningState>(`/api/word-states/${wordId}`);
      return state ? convertLearningStateDates(state) : null;
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      apiLogger.error({ err: error, wordId }, '获取单词学习状态失败');
      throw error;
    }
  }

  /**
   * 批量获取单词学习状态
   */
  async getWordLearningStates(wordIds: string[]): Promise<WordLearningState[]> {
    if (!wordIds || wordIds.length === 0) {
      return [];
    }
    try {
      const response = await this.request<
        Array<{ wordId: string; state: ApiWordLearningState | null }>
      >('/api/word-states/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds }),
      });
      return response
        .filter(
          (item): item is { wordId: string; state: ApiWordLearningState } => item.state !== null,
        )
        .map((item) => convertLearningStateDates(item.state));
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return [];
      }
      apiLogger.error({ err: error }, '批量获取单词学习状态失败');
      throw error;
    }
  }

  /**
   * 保存单词学习状态
   */
  async saveWordLearningState(state: WordLearningState): Promise<void> {
    try {
      const {
        state: stateValue,
        masteryLevel,
        easeFactor,
        reviewCount,
        lastReviewDate,
        nextReviewDate,
        currentInterval,
        consecutiveCorrect,
        consecutiveWrong,
      } = state;

      const body = {
        state: stateValue,
        masteryLevel,
        easeFactor,
        reviewCount,
        lastReviewDate: lastReviewDate ? new Date(lastReviewDate).toISOString() : undefined,
        nextReviewDate: nextReviewDate ? new Date(nextReviewDate).toISOString() : undefined,
        currentInterval,
        consecutiveCorrect,
        consecutiveWrong,
      };

      await this.request<void>(`/api/word-states/${state.wordId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    } catch (error) {
      apiLogger.error({ err: error }, '保存单词学习状态失败');
      throw error;
    }
  }

  /**
   * 删除单词学习状态
   */
  async deleteWordLearningState(wordId: string): Promise<void> {
    try {
      await this.request<void>(`/api/word-states/${wordId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      apiLogger.error({ err: error }, '删除单词学习状态失败');
      throw error;
    }
  }

  /**
   * 获取到期需要复习的单词
   */
  async getDueWords(): Promise<WordLearningState[]> {
    try {
      const states = await this.request<ApiWordLearningState[]>('/api/word-states/due/list');
      return states.map(convertLearningStateDates);
    } catch (error) {
      apiLogger.error({ err: error }, '获取到期单词失败');
      return [];
    }
  }

  /**
   * 按状态获取单词
   */
  async getWordsByState(state: WordState): Promise<WordLearningState[]> {
    try {
      const states = await this.request<ApiWordLearningState[]>(
        `/api/word-states/by-state/${state}`,
      );
      return states.map(convertLearningStateDates);
    } catch (error) {
      apiLogger.error({ err: error }, '按状态获取单词失败');
      return [];
    }
  }

  /**
   * 获取单词得分
   */
  async getWordScore(wordId: string): Promise<WordScore | null> {
    try {
      const score = await this.request<ApiWordScore>(`/api/word-scores/${wordId}`);
      return score ? convertWordScoreDates(score) : null;
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词得分失败');
      return null;
    }
  }

  /**
   * 批量获取单词得分
   */
  async getWordScores(wordIds: string[]): Promise<WordScore[]> {
    try {
      const scores = await this.request<ApiWordScore[]>('/api/word-scores/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds }),
      });
      return scores.map(convertWordScoreDates);
    } catch (error) {
      apiLogger.error({ err: error }, '批量获取单词得分失败');
      return [];
    }
  }

  /**
   * 保存单词得分
   */
  async saveWordScore(score: WordScore): Promise<void> {
    try {
      const { id, userId, wordId, createdAt, updatedAt, ...allowedFields } = score;
      await this.request<void>(`/api/word-scores/${score.wordId}`, {
        method: 'PUT',
        body: JSON.stringify(allowedFields),
      });
    } catch (error) {
      apiLogger.error({ err: error }, '保存单词得分失败');
      throw error;
    }
  }

  /**
   * 按得分范围获取单词得分
   */
  async getWordsByScoreRange(minScore: number, maxScore: number): Promise<WordScore[]> {
    try {
      const scores = await this.request<ApiWordScore[]>(
        `/api/word-scores/range?minScore=${minScore}&maxScore=${maxScore}`,
      );
      return scores.map(convertWordScoreDates);
    } catch (error) {
      apiLogger.error({ err: error }, '按得分范围获取单词失败');
      throw error;
    }
  }

  /**
   * 获取掌握模式的学习单词
   */
  async getMasteryStudyWords(targetCount?: number): Promise<{
    words: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      isNew: boolean;
    }>;
    meta: {
      mode: string;
      targetCount: number;
      fetchCount: number;
      masteryThreshold: number;
      maxQuestions: number;
    };
  }> {
    const query = targetCount ? `?targetCount=${targetCount}` : '';
    return this.request(`/api/learning/study-words${query}`);
  }

  /**
   * 动态获取下一批学习单词（AMAS驱动的按需加载）
   */
  async getNextWords(params: {
    currentWordIds: string[];
    masteredWordIds: string[];
    sessionId: string;
    count?: number;
  }): Promise<{
    words: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      difficulty: number;
      isNew: boolean;
    }>;
    strategy: {
      new_ratio: number;
      difficulty: 'easy' | 'mid' | 'hard';
      batch_size: number;
      session_length: number;
      review_ratio: number;
    };
    reason: string;
  }> {
    return this.request('/api/learning/next-words', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * 创建掌握学习会话
   */
  async createMasterySession(targetMasteryCount: number): Promise<{ sessionId: string }> {
    return this.request('/api/learning/session', {
      method: 'POST',
      body: JSON.stringify({ targetMasteryCount }),
    });
  }

  /**
   * 同步学习进度
   */
  async syncMasteryProgress(data: {
    sessionId: string;
    actualMasteryCount: number;
    totalQuestions: number;
  }): Promise<void> {
    return this.request('/api/learning/sync-progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * 动态调整学习单词队列
   */
  async adjustLearningWords(
    params: import('../../../types/amas').AdjustWordsParams,
  ): Promise<import('../../../types/amas').AdjustWordsResponse> {
    return this.request<import('../../../types/amas').AdjustWordsResponse>(
      '/api/learning/adjust-words',
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
    );
  }
}
