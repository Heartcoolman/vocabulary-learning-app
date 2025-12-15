/**
 * 学习状态统一管理服务（重构版）
 *
 * 职责：
 * - 整合单词学习状态、分数、掌握度评估的统一接口
 * - 提供高层次的学习状态管理功能
 * - 通过 EventBus 发布领域事件
 * - 直接实现所有核心功能，不再依赖外部服务
 *
 * 整合的服务：
 * - WordStateService: 单词学习状态管理 [已整合]
 * - WordScoreService: 单词得分管理 [已整合]
 * - WordMasteryService: 掌握度评估 [已整合]
 *
 * 重构说明：
 * - 将三个独立服务的功能合并到此服务中
 * - 保留所有现有API接口，确保向后兼容
 * - 优化缓存和批量操作性能
 * - 通过事件总线解耦服务间通信
 */

import { WordLearningState, WordScore, WordState, Prisma, WordBookType } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from './decision-events.service';
import type { WordMasteredPayload, ForgettingRiskPayload } from '../core/event-bus';
import type { MasteryEvaluation, EvaluatorConfig } from '../amas/rewards/evaluators';
import { WordMasteryEvaluator } from '../amas/rewards/evaluators';
import {
  WordMemoryTracker,
  ReviewEvent,
  WordMemoryState,
} from '../amas/tracking/word-memory-tracker';
import { ReviewTrace, IntervalPrediction, ACTRMemoryModel } from '../amas/models/cognitive';
import { serviceLogger } from '../logger';

const logger = serviceLogger.child({ service: 'learning-state' });

// ==================== 类型定义 ====================

/**
 * 完整的单词学习状态（包含状态、分数、掌握度）
 */
export interface CompleteWordState {
  /** 学习状态 */
  learningState: WordLearningState | null;
  /** 得分信息 */
  score: WordScore | null;
  /** 掌握度评估 */
  mastery: MasteryEvaluation | null;
}

/**
 * 用户学习统计数据接口（来自 WordStateService）
 */
export interface UserStats {
  totalWords: number;
  newWords: number;
  learningWords: number;
  reviewingWords: number;
  masteredWords: number;
}

/**
 * 用户掌握度统计（来自 WordMasteryService）
 */
export interface UserMasteryStats {
  /** 总单词数 */
  totalWords: number;
  /** 已学会单词数 */
  masteredWords: number;
  /** 学习中单词数 */
  learningWords: number;
  /** 未学习单词数 */
  newWords: number;
  /** 平均掌握度评分 */
  averageScore: number;
  /** 平均ACT-R提取概率 */
  averageRecall: number;
  /** 需要复习的单词数 */
  needReviewCount: number;
}

/**
 * 学习状态更新数据
 */
export interface WordStateUpdateData {
  /** 学习状态 */
  state?: WordState;
  /** 掌握度等级 */
  masteryLevel?: number;
  /** 难度因子 */
  easeFactor?: number;
  /** 复习次数 */
  reviewCount?: number;
  /** 上次复习时间 */
  lastReviewDate?: Date | null;
  /** 下次复习时间 */
  nextReviewDate?: Date | null;
}

/**
 * 用户综合学习统计
 */
export interface UserLearningStats {
  /** 单词状态统计 */
  stateStats: {
    totalWords: number;
    newWords: number;
    learningWords: number;
    reviewingWords: number;
    masteredWords: number;
  };
  /** 得分统计 */
  scoreStats: {
    averageScore: number;
    highScoreCount: number;
    mediumScoreCount: number;
    lowScoreCount: number;
  };
  /** 掌握度统计 */
  masteryStats: UserMasteryStats;
}

/**
 * 复习轨迹事件（内部使用）
 */
export interface ReviewEventData {
  timestamp: Date;
  isCorrect: boolean;
  responseTime: number;
}

/**
 * 复习轨迹事件（API 使用）
 * 与 ReviewEvent 兼容，timestamp 为毫秒
 */
export interface ReviewEventInput {
  timestamp: number;
  isCorrect: boolean;
  responseTime: number;
}

/**
 * 复习轨迹记录（带元数据）
 */
export interface ReviewTraceRecord {
  /** 记录ID */
  id: string;
  /** 时间戳 */
  timestamp: Date;
  /** 是否正确 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 距今秒数 */
  secondsAgo: number;
}

// ==================== 辅助函数 ====================

/** 时间戳有效范围：过去1年到未来1小时 */
const TIMESTAMP_PAST_LIMIT_MS = 365 * 24 * 60 * 60 * 1000;
const TIMESTAMP_FUTURE_LIMIT_MS = 60 * 60 * 1000;

/**
 * 验证并转换时间戳
 * 对于学习状态，允许更长的历史时间（1年），因为可能需要同步历史数据
 * @param timestamp 时间戳（毫秒）或0（表示null）
 * @returns Date对象或null
 */
function validateAndConvertTimestamp(timestamp: number): Date | null {
  // 0 表示 null
  if (timestamp === 0) {
    return null;
  }

  const now = Date.now();
  const date = new Date(timestamp);

  // 检查是否为有效日期
  if (isNaN(date.getTime())) {
    throw new Error('无效的时间戳格式');
  }

  // 不允许超过未来1小时
  if (timestamp > now + TIMESTAMP_FUTURE_LIMIT_MS) {
    throw new Error('时间戳不能超过当前时间1小时');
  }

  // 不允许早于过去1年
  if (timestamp < now - TIMESTAMP_PAST_LIMIT_MS) {
    throw new Error('时间戳不能早于1年前');
  }

  return date;
}

// ==================== 服务实现 ====================

export class LearningStateService {
  // 空值标记，用于缓存穿透防护
  private static readonly NULL_MARKER = '__NULL__';

  // 掌握度评估相关组件（来自 WordMasteryService）
  private evaluator: WordMasteryEvaluator;
  private tracker: WordMemoryTracker;
  private actrModel: ACTRMemoryModel;

  constructor() {
    this.tracker = new WordMemoryTracker();
    this.actrModel = new ACTRMemoryModel();
    this.evaluator = new WordMasteryEvaluator({}, this.actrModel, this.tracker);
  }

  /**
   * 获取事件总线实例
   */
  private get eventBus() {
    return getEventBus(decisionEventsService);
  }

  // ==================== 单词学习状态管理 (来自 WordStateService) ====================

  /**
   * 获取单词学习状态（带缓存）
   * 修复问题#19: 添加空值缓存防止缓存穿透
   */
  private async getWordLearningStateInternal(
    userId: string,
    wordId: string,
  ): Promise<WordLearningState | null> {
    const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordLearningState | typeof LearningStateService.NULL_MARKER>(
      cacheKey,
    );
    if (cached !== null) {
      if (cached === LearningStateService.NULL_MARKER) {
        return null;
      }
      return cached;
    }

    // 从数据库查询
    const state = await prisma.wordLearningState.findUnique({
      where: {
        unique_user_word: { userId, wordId },
      },
    });

    // 存入缓存（包括空值）
    if (state) {
      cacheService.set(cacheKey, state, CacheTTL.LEARNING_STATE);
    } else {
      cacheService.set(cacheKey, LearningStateService.NULL_MARKER, CacheTTL.NULL_CACHE);
    }

    return state;
  }

  /**
   * 批量获取单词学习状态（带缓存）
   */
  async batchGetWordStates(
    userId: string,
    wordIds: string[],
  ): Promise<Map<string, WordLearningState>> {
    const result = new Map<string, WordLearningState>();
    const uncachedWordIds: string[] = [];

    // 先从缓存获取
    for (const wordId of wordIds) {
      const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);
      const cached = cacheService.get<WordLearningState | typeof LearningStateService.NULL_MARKER>(
        cacheKey,
      );

      if (cached !== null) {
        if (cached !== LearningStateService.NULL_MARKER) {
          result.set(wordId, cached);
        }
      } else {
        uncachedWordIds.push(wordId);
      }
    }

    // 批量查询未缓存的数据
    if (uncachedWordIds.length > 0) {
      const states = await prisma.wordLearningState.findMany({
        where: {
          userId,
          wordId: { in: uncachedWordIds },
        },
      });

      const foundWordIds = new Set(states.map((s) => s.wordId));

      // 存入缓存和结果
      for (const state of states) {
        const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, state.wordId);
        cacheService.set(cacheKey, state, CacheTTL.LEARNING_STATE);
        result.set(state.wordId, state);
      }

      // 为未找到的单词缓存空值标记
      for (const wordId of uncachedWordIds) {
        if (!foundWordIds.has(wordId)) {
          const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);
          cacheService.set(cacheKey, LearningStateService.NULL_MARKER, CacheTTL.NULL_CACHE);
        }
      }
    }

    return result;
  }

  /**
   * 获取需要复习的单词（不缓存）
   * 修复 Bug #37: getDueWords 缓存过期问题
   */
  async getDueWords(userId: string): Promise<WordLearningState[]> {
    const now = new Date();
    const dueWords = await prisma.wordLearningState.findMany({
      where: {
        userId,
        OR: [
          // 条件1: 已到复习时间的单词（LEARNING、REVIEWING状态）
          {
            nextReviewDate: { lte: now },
            state: { in: [WordState.LEARNING, WordState.REVIEWING] },
          },
          // 条件2: NEW状态单词
          {
            state: WordState.NEW,
            OR: [{ nextReviewDate: null }, { nextReviewDate: { lte: now } }],
          },
        ],
      },
      orderBy: { nextReviewDate: 'asc' },
    });

    return dueWords;
  }

  /**
   * 获取特定状态的单词
   */
  async getWordsByState(userId: string, state: WordState): Promise<WordLearningState[]> {
    return await prisma.wordLearningState.findMany({
      where: { userId, state },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * 创建或更新单词学习状态
   */
  async upsertWordState(
    userId: string,
    wordId: string,
    data: Partial<WordLearningState>,
  ): Promise<WordLearningState> {
    await this.assertWordAccessible(userId, wordId);

    // 过滤掉userId和wordId
    const {
      userId: _,
      wordId: __,
      ...safeData
    } = data as Partial<WordLearningState> & { userId?: string; wordId?: string };

    // 转换时间戳
    type ConvertedWordStateData = Omit<
      typeof safeData,
      'lastReviewDate' | 'nextReviewDate' | 'createdAt' | 'updatedAt'
    > & {
      lastReviewDate?: Date | null;
      nextReviewDate?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    };
    const convertedData: ConvertedWordStateData = { ...safeData };
    if (typeof convertedData.lastReviewDate === 'number') {
      convertedData.lastReviewDate = validateAndConvertTimestamp(convertedData.lastReviewDate);
    }
    if (typeof convertedData.nextReviewDate === 'number') {
      convertedData.nextReviewDate = validateAndConvertTimestamp(convertedData.nextReviewDate);
    }
    if (typeof convertedData.createdAt === 'number') {
      const createdAtDate = validateAndConvertTimestamp(convertedData.createdAt);
      if (createdAtDate) {
        convertedData.createdAt = createdAtDate;
      } else {
        delete convertedData.createdAt;
      }
    }
    if (typeof convertedData.updatedAt === 'number') {
      const updatedAtDate = validateAndConvertTimestamp(convertedData.updatedAt);
      if (updatedAtDate) {
        convertedData.updatedAt = updatedAtDate;
      } else {
        delete convertedData.updatedAt;
      }
    }

    const state = await prisma.wordLearningState.upsert({
      where: {
        unique_user_word: { userId, wordId },
      },
      create: {
        userId,
        wordId,
        ...convertedData,
      } as Prisma.WordLearningStateUncheckedCreateInput,
      update: convertedData,
    });

    // 清除相关缓存
    this.invalidateUserCache(userId, wordId);

    return state;
  }

  /**
   * 批量更新单词学习状态
   */
  async batchUpdateWordStates(
    userId: string,
    updates: Array<{ wordId: string; data: Partial<WordLearningState> }>,
  ): Promise<void> {
    const uniqueWordIds = Array.from(new Set(updates.map(({ wordId }) => wordId)));
    const accessibleWordIds = await this.getAccessibleWordIds(userId, uniqueWordIds);

    const inaccessibleWordIds = uniqueWordIds.filter((id) => !accessibleWordIds.has(id));
    if (inaccessibleWordIds.length > 0) {
      throw new Error(`无权访问以下单词: ${inaccessibleWordIds.join(', ')}`);
    }

    // 预处理和验证
    const invalidTimestampErrors: string[] = [];
    type ConvertedWordStateData = Omit<
      Partial<WordLearningState>,
      'lastReviewDate' | 'nextReviewDate' | 'createdAt' | 'updatedAt' | 'userId' | 'wordId'
    > & {
      lastReviewDate?: Date | null;
      nextReviewDate?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    };

    const preparedUpdates = updates.map(({ wordId, data }, index) => {
      const {
        userId: _,
        wordId: __,
        ...safeData
      } = data as Partial<WordLearningState> & { userId?: string; wordId?: string };

      const convertedData: ConvertedWordStateData = { ...safeData };

      const nullableTimestampFields = ['lastReviewDate', 'nextReviewDate'] as const;
      for (const field of nullableTimestampFields) {
        if (typeof convertedData[field] === 'number') {
          try {
            convertedData[field] = validateAndConvertTimestamp(convertedData[field] as number);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            invalidTimestampErrors.push(`记录[${index}] wordId=${wordId} ${field}: ${errorMsg}`);
          }
        }
      }

      const nonNullableTimestampFields = ['createdAt', 'updatedAt'] as const;
      for (const field of nonNullableTimestampFields) {
        if (typeof convertedData[field] === 'number') {
          try {
            const dateValue = validateAndConvertTimestamp(convertedData[field] as number);
            if (dateValue) {
              convertedData[field] = dateValue;
            } else {
              delete convertedData[field];
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            invalidTimestampErrors.push(`记录[${index}] wordId=${wordId} ${field}: ${errorMsg}`);
          }
        }
      }

      return { wordId, convertedData };
    });

    if (invalidTimestampErrors.length > 0) {
      throw new Error(`时间戳校验失败:\n${invalidTimestampErrors.join('\n')}`);
    }

    // 使用事务批量更新
    await prisma.$transaction(
      preparedUpdates.map(({ wordId, convertedData }) => {
        return prisma.wordLearningState.upsert({
          where: {
            unique_user_word: { userId, wordId },
          },
          create: {
            userId,
            wordId,
            ...convertedData,
          } as Prisma.WordLearningStateUncheckedCreateInput,
          update: convertedData,
        });
      }),
    );

    // 清除用户缓存
    this.invalidateUserCache(userId);
  }

  /**
   * 删除单词学习状态
   */
  async deleteWordState(userId: string, wordId: string): Promise<void> {
    await prisma.wordLearningState.delete({
      where: {
        unique_user_word: { userId, wordId },
      },
    });

    this.invalidateUserCache(userId, wordId);
  }

  /**
   * 获取用户学习统计
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const cacheKey = CacheKeys.USER_STATS(userId);

    const cached = cacheService.get<UserStats>(cacheKey);
    if (cached) {
      return cached;
    }

    const [totalWords, newWords, learningWords, reviewingWords, masteredWords] = await Promise.all([
      prisma.wordLearningState.count({ where: { userId } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.NEW } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.LEARNING } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.REVIEWING } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.MASTERED } }),
    ]);

    const stats = {
      totalWords,
      newWords,
      learningWords,
      reviewingWords,
      masteredWords,
    };

    cacheService.set(cacheKey, stats, CacheTTL.USER_STATS);
    return stats;
  }

  // ==================== 单词得分管理 (来自 WordScoreService) ====================

  /**
   * 计算单词得分（轻量级）
   */
  private async calculateScore(
    userId: string,
    wordId: string,
  ): Promise<{
    userId: string;
    wordId: string;
    totalScore: number;
    accuracyScore: number;
    speedScore: number;
    totalAttempts: number;
    correctAttempts: number;
    averageResponseTime: number;
    recentAccuracy: number;
  }> {
    const records = await prisma.answerRecord.findMany({
      where: { userId, wordId },
      select: { isCorrect: true, responseTime: true },
    });

    if (records.length === 0) {
      return {
        userId,
        wordId,
        totalScore: 0,
        accuracyScore: 0,
        speedScore: 0,
        totalAttempts: 0,
        correctAttempts: 0,
        averageResponseTime: 0,
        recentAccuracy: 0,
      };
    }

    const totalAttempts = records.length;
    const correctAttempts = records.filter((r) => r.isCorrect).length;
    const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

    const responseTimes = records
      .map((r) => r.responseTime)
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0);
    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : 5000;

    // 简化版速度得分：<= 0ms 视作最快，>= 5000ms 视作最慢
    const timeScore01 = Math.max(0, Math.min(1, 1 - averageResponseTime / 5000));

    const accuracyScore = Math.round(accuracy * 100);
    const speedScore = Math.round(timeScore01 * 100);
    const totalScore = Math.round(
      Math.max(0, Math.min(1, 0.7 * accuracy + 0.3 * timeScore01)) * 100,
    );

    return {
      userId,
      wordId,
      totalScore,
      accuracyScore,
      speedScore,
      totalAttempts,
      correctAttempts,
      averageResponseTime,
      recentAccuracy: accuracyScore,
    };
  }

  /**
   * 获取单词得分（带缓存）
   * 内部方法
   */
  private async getWordScoreInternal(userId: string, wordId: string): Promise<WordScore | null> {
    const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);

    const cached = cacheService.get<WordScore | typeof LearningStateService.NULL_MARKER>(cacheKey);
    if (cached !== null) {
      if (cached === LearningStateService.NULL_MARKER) {
        return null;
      }
      return cached;
    }

    const score = await prisma.wordScore.findUnique({
      where: {
        unique_user_word_score: { userId, wordId },
      },
    });

    if (score) {
      cacheService.set(cacheKey, score, CacheTTL.WORD_SCORE);
    } else {
      cacheService.set(cacheKey, LearningStateService.NULL_MARKER, CacheTTL.NULL_CACHE);
    }

    return score;
  }

  /**
   * 获取单词得分（公开API）
   */
  async getWordScore(userId: string, wordId: string): Promise<WordScore | null> {
    return this.getWordScoreInternal(userId, wordId);
  }

  /**
   * 批量获取单词得分
   */
  async batchGetWordScores(userId: string, wordIds: string[]): Promise<Map<string, WordScore>> {
    const result = new Map<string, WordScore>();
    const uncachedWordIds: string[] = [];

    for (const wordId of wordIds) {
      const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);
      const cached = cacheService.get<WordScore | typeof LearningStateService.NULL_MARKER>(
        cacheKey,
      );

      if (cached !== null) {
        if (cached !== LearningStateService.NULL_MARKER) {
          result.set(wordId, cached);
        }
      } else {
        uncachedWordIds.push(wordId);
      }
    }

    if (uncachedWordIds.length > 0) {
      const scores = await prisma.wordScore.findMany({
        where: {
          userId,
          wordId: { in: uncachedWordIds },
        },
      });

      const foundWordIds = new Set(scores.map((s) => s.wordId));

      for (const score of scores) {
        const cacheKey = CacheKeys.WORD_SCORE(userId, score.wordId);
        cacheService.set(cacheKey, score, CacheTTL.WORD_SCORE);
        result.set(score.wordId, score);
      }

      for (const wordId of uncachedWordIds) {
        if (!foundWordIds.has(wordId)) {
          const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);
          cacheService.set(cacheKey, LearningStateService.NULL_MARKER, CacheTTL.NULL_CACHE);
        }
      }
    }

    return result;
  }

  /**
   * 更新单词得分（根据答题结果）
   */
  async updateWordScore(
    userId: string,
    wordId: string,
    result: { isCorrect: boolean; responseTime?: number },
  ): Promise<WordScore> {
    void result;

    const computed = await this.calculateScore(userId, wordId);
    const payload: Prisma.WordScoreCreateInput = {
      user: { connect: { id: userId } },
      word: { connect: { id: wordId } },
      totalScore: computed.totalScore,
      accuracyScore: computed.accuracyScore,
      speedScore: computed.speedScore,
      totalAttempts: computed.totalAttempts,
      correctAttempts: computed.correctAttempts,
      averageResponseTime: computed.averageResponseTime,
      recentAccuracy: computed.recentAccuracy,
    };

    const wordScore = await prisma.wordScore.upsert({
      where: { unique_user_word_score: { userId, wordId } },
      create: payload,
      update: {
        totalScore: computed.totalScore,
        accuracyScore: computed.accuracyScore,
        speedScore: computed.speedScore,
        totalAttempts: computed.totalAttempts,
        correctAttempts: computed.correctAttempts,
        averageResponseTime: computed.averageResponseTime,
        recentAccuracy: computed.recentAccuracy,
      },
    });

    // 清除缓存
    this.invalidateUserCache(userId, wordId);

    return wordScore;
  }

  /**
   * 获取低分单词
   */
  async getLowScoreWords(userId: string, threshold: number = 40): Promise<WordScore[]> {
    return await prisma.wordScore.findMany({
      where: {
        userId,
        totalScore: { lt: threshold },
      },
      orderBy: { totalScore: 'asc' },
    });
  }

  /**
   * 获取高分单词
   */
  async getHighScoreWords(userId: string, threshold: number = 80): Promise<WordScore[]> {
    return await prisma.wordScore.findMany({
      where: {
        userId,
        totalScore: { gt: threshold },
      },
      orderBy: { totalScore: 'desc' },
    });
  }

  /**
   * 获取指定得分范围内的单词得分
   */
  async getWordsByScoreRange(
    userId: string,
    minScore: number,
    maxScore: number,
  ): Promise<WordScore[]> {
    return await prisma.wordScore.findMany({
      where: {
        userId,
        totalScore: {
          gte: minScore,
          lte: maxScore,
        },
      },
      orderBy: { totalScore: 'desc' },
    });
  }

  /**
   * 创建或更新单词得分
   */
  async upsertWordScore(
    userId: string,
    wordId: string,
    data: Partial<WordScore>,
  ): Promise<WordScore> {
    await this.assertWordAccessible(userId, wordId);

    // 过滤掉不应被外部覆盖的系统字段
    const {
      userId: _userId,
      wordId: _wordId,
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...safeData
    } = data;

    const score = await prisma.wordScore.upsert({
      where: {
        unique_user_word_score: { userId, wordId },
      },
      create: {
        user: { connect: { id: userId } },
        word: { connect: { id: wordId } },
        ...safeData,
      },
      update: safeData,
    });

    // 清除相关缓存
    this.invalidateUserCache(userId, wordId);

    return score;
  }

  /**
   * 获取用户得分统计（公开API）
   */
  async getUserScoreStats(userId: string) {
    const scores = await prisma.wordScore.findMany({
      where: { userId },
      select: { totalScore: true },
    });

    if (scores.length === 0) {
      return {
        averageScore: 0,
        highScoreCount: 0,
        mediumScoreCount: 0,
        lowScoreCount: 0,
      };
    }

    const totalScore = scores.reduce((sum, s) => sum + s.totalScore, 0);
    const averageScore = totalScore / scores.length;

    const highScoreCount = scores.filter((s) => s.totalScore > 80).length;
    const mediumScoreCount = scores.filter((s) => s.totalScore >= 40 && s.totalScore <= 80).length;
    const lowScoreCount = scores.filter((s) => s.totalScore < 40).length;

    return {
      averageScore,
      highScoreCount,
      mediumScoreCount,
      lowScoreCount,
    };
  }

  // ==================== 掌握度评估管理 (来自 WordMasteryService) ====================

  /**
   * 获取用户疲劳度
   */
  private async getUserFatigue(userId: string): Promise<number> {
    const amasState = await prisma.amasUserState.findUnique({
      where: { userId },
      select: { fatigue: true },
    });
    return amasState?.fatigue ?? 0;
  }

  /**
   * 评估单词掌握度（内部方法）
   */
  private async evaluateWordInternal(
    userId: string,
    wordId: string,
    userFatigue?: number,
  ): Promise<MasteryEvaluation> {
    const fatigue = userFatigue ?? (await this.getUserFatigue(userId));
    return this.evaluator.evaluate(userId, wordId, fatigue);
  }

  /**
   * 检查单词掌握度（公开API）
   */
  async checkMastery(
    userId: string,
    wordId: string,
    userFatigue?: number,
  ): Promise<MasteryEvaluation> {
    return this.evaluateWordInternal(userId, wordId, userFatigue);
  }

  /**
   * 评估单词掌握度（公开API，别名）
   */
  async evaluateWord(
    userId: string,
    wordId: string,
    userFatigue?: number,
  ): Promise<MasteryEvaluation> {
    return this.evaluateWordInternal(userId, wordId, userFatigue);
  }

  /**
   * 批量检查单词掌握度
   */
  async batchCheckMastery(
    userId: string,
    wordIds: string[],
    userFatigue?: number,
  ): Promise<MasteryEvaluation[]> {
    const fatigue = userFatigue ?? (await this.getUserFatigue(userId));
    return this.evaluator.batchEvaluate(userId, wordIds, fatigue);
  }

  /**
   * 批量评估单词掌握度（别名）
   */
  async batchEvaluateWords(
    userId: string,
    wordIds: string[],
    userFatigue?: number,
  ): Promise<MasteryEvaluation[]> {
    return this.batchCheckMastery(userId, wordIds, userFatigue);
  }

  /**
   * 获取用户掌握度统计（公开API）
   */
  async getUserMasteryStats(userId: string): Promise<UserMasteryStats> {
    return this.getUserMasteryStatsInternal(userId);
  }

  /**
   * 记录复习事件
   */
  async recordReview(userId: string, wordId: string, event: ReviewEventInput): Promise<void> {
    await this.tracker.recordReview(userId, wordId, event);
  }

  /**
   * 批量记录复习事件
   */
  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEventInput }>,
  ): Promise<void> {
    if (events.length === 0) return;
    await this.tracker.batchRecordReview(userId, events);
  }

  /**
   * 获取单词复习轨迹
   */
  async getMemoryTrace(
    userId: string,
    wordId: string,
    limit: number = 50,
  ): Promise<ReviewTraceRecord[]> {
    const now = Date.now();

    const records = await prisma.wordReviewTrace.findMany({
      where: { userId, wordId },
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        timestamp: true,
        isCorrect: true,
        responseTime: true,
      },
    });

    return records.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      isCorrect: r.isCorrect,
      responseTime: r.responseTime,
      secondsAgo: Math.floor((now - r.timestamp.getTime()) / 1000),
    }));
  }

  /**
   * 获取单词记忆状态
   */
  async getWordMemoryState(userId: string, wordId: string): Promise<WordMemoryState | null> {
    const states = await this.tracker.batchGetMemoryState(userId, [wordId]);
    return states.get(wordId) ?? null;
  }

  /**
   * 预测单词最佳复习间隔
   */
  async predictInterval(
    userId: string,
    wordId: string,
    targetRecall: number = 0.9,
  ): Promise<IntervalPrediction> {
    const trace = await this.tracker.getReviewTrace(userId, wordId);
    return this.actrModel.predictOptimalInterval(trace, targetRecall);
  }

  /**
   * 获取用户掌握度统计（内部实现）
   */
  private async getUserMasteryStatsInternal(userId: string): Promise<UserMasteryStats> {
    const learningStates = await prisma.wordLearningState.findMany({
      where: { userId },
      select: { wordId: true, state: true, masteryLevel: true },
    });

    if (learningStates.length === 0) {
      return {
        totalWords: 0,
        masteredWords: 0,
        learningWords: 0,
        newWords: 0,
        averageScore: 0,
        averageRecall: 0,
        needReviewCount: 0,
      };
    }

    const wordIds = learningStates.map((s) => s.wordId);
    const fatigue = await this.getUserFatigue(userId);
    const evaluations = await this.evaluator.batchEvaluate(userId, wordIds, fatigue);

    const masteredWords = evaluations.filter((e) => e.isLearned).length;
    const learningWords = learningStates.filter(
      (s) => s.state === 'LEARNING' || s.state === 'REVIEWING',
    ).length;
    const newWords = learningStates.filter((s) => s.state === 'NEW').length;

    const totalScore = evaluations.reduce((sum, e) => sum + e.score, 0);
    const totalRecall = evaluations.reduce((sum, e) => sum + e.factors.actrRecall, 0);
    const needReviewCount = evaluations.filter(
      (e) => e.factors.actrRecall < 0.7 && !e.isLearned,
    ).length;

    return {
      totalWords: learningStates.length,
      masteredWords,
      learningWords,
      newWords,
      averageScore: learningStates.length > 0 ? totalScore / learningStates.length : 0,
      averageRecall: learningStates.length > 0 ? totalRecall / learningStates.length : 0,
      needReviewCount,
    };
  }

  /**
   * 更新评估器配置
   */
  updateEvaluatorConfig(config: Partial<EvaluatorConfig>): void {
    this.evaluator.updateConfig(config);
  }

  /**
   * 获取当前评估器配置
   */
  getEvaluatorConfig(): EvaluatorConfig {
    return this.evaluator.getConfig();
  }

  // ==================== 统一查询接口 ====================

  /**
   * 获取单词的完整学习状态
   */
  async getWordState(
    userId: string,
    wordId: string,
    includeMastery: boolean = false,
  ): Promise<CompleteWordState> {
    const [learningState, score] = await Promise.all([
      this.getWordLearningStateInternal(userId, wordId),
      this.getWordScoreInternal(userId, wordId),
    ]);

    let mastery: MasteryEvaluation | null = null;
    if (includeMastery) {
      try {
        mastery = await this.evaluateWordInternal(userId, wordId);
      } catch (error) {
        logger.error({ error, userId, wordId }, '获取掌握度评估失败');
      }
    }

    return {
      learningState,
      score,
      mastery,
    };
  }

  /**
   * 批量获取单词的完整学习状态
   */
  async batchGetWordStates_Complete(
    userId: string,
    wordIds: string[],
    includeMastery: boolean = false,
  ): Promise<Map<string, CompleteWordState>> {
    const [learningStates, scores, masteryEvals] = await Promise.all([
      this.batchGetWordStates(userId, wordIds),
      this.batchGetWordScores(userId, wordIds),
      includeMastery
        ? this.batchCheckMastery(userId, wordIds).catch((err) => {
            logger.error({ error: err, userId }, '批量获取掌握度评估失败');
            return [];
          })
        : Promise.resolve([]),
    ]);

    const masteryMap = new Map<string, MasteryEvaluation>();
    if (includeMastery && Array.isArray(masteryEvals)) {
      for (const evaluation of masteryEvals) {
        masteryMap.set(evaluation.wordId, evaluation);
      }
    }

    const result = new Map<string, CompleteWordState>();
    for (const wordId of wordIds) {
      result.set(wordId, {
        learningState: learningStates.get(wordId) || null,
        score: scores.get(wordId) || null,
        mastery: masteryMap.get(wordId) || null,
      });
    }

    return result;
  }

  /**
   * 更新单词学习状态
   */
  async updateWordState(
    userId: string,
    wordId: string,
    data: WordStateUpdateData,
  ): Promise<WordLearningState> {
    const oldState = await this.getWordLearningStateInternal(userId, wordId);

    const newState = await this.upsertWordState(userId, wordId, data);

    // 异步发布事件
    await this.checkAndPublishMasteryEvent(userId, wordId, oldState, newState);
    await this.checkAndPublishForgettingRisk(userId, wordId, newState);

    return newState;
  }

  /**
   * 批量更新单词学习状态
   */
  async batchUpdateWordStates_WithEvents(
    userId: string,
    updates: Array<{ wordId: string; data: WordStateUpdateData }>,
  ): Promise<void> {
    const wordIds = updates.map((u) => u.wordId);
    const oldStates = await this.batchGetWordStates(userId, wordIds);

    await this.batchUpdateWordStates(
      userId,
      updates.map(({ wordId, data }) => ({
        wordId,
        data: data as Partial<WordLearningState>,
      })),
    );

    const newStates = await this.batchGetWordStates(userId, wordIds);

    // 异步检查并发布事件
    Promise.all(
      wordIds.map(async (wordId) => {
        const oldState = oldStates.get(wordId) || null;
        const newState = newStates.get(wordId) || null;
        if (newState) {
          await this.checkAndPublishMasteryEvent(userId, wordId, oldState, newState);
          await this.checkAndPublishForgettingRisk(userId, wordId, newState);
        }
      }),
    ).catch((err) => {
      logger.error({ error: err, userId }, '批量检查事件发布失败');
    });
  }

  /**
   * 获取用户综合学习统计
   */
  async getUserLearningStats(userId: string): Promise<UserLearningStats> {
    const [stateStats, scoreStats, masteryStats] = await Promise.all([
      this.getUserStats(userId),
      this.getUserScoreStats(userId),
      this.getUserMasteryStatsInternal(userId),
    ]);

    return {
      stateStats,
      scoreStats,
      masteryStats,
    };
  }

  // ==================== 事件发布 ====================

  /**
   * 检查并发布单词掌握事件
   */
  private async checkAndPublishMasteryEvent(
    userId: string,
    wordId: string,
    oldState: WordLearningState | null,
    newState: WordLearningState,
  ): Promise<void> {
    const isNewlyMastered =
      oldState?.state !== WordState.MASTERED && newState.state === WordState.MASTERED;

    const masteryThreshold = 5;
    const reachedMasteryLevel =
      (oldState?.masteryLevel || 0) < masteryThreshold && newState.masteryLevel >= masteryThreshold;

    if (isNewlyMastered || reachedMasteryLevel) {
      try {
        const evaluation = await this.evaluateWordInternal(userId, wordId);

        const payload: WordMasteredPayload = {
          userId,
          wordId,
          masteryLevel: newState.masteryLevel,
          evaluationScore: evaluation.score,
          confidence: evaluation.confidence,
          timestamp: new Date(),
        };

        await this.eventBus.publish({
          type: 'WORD_MASTERED',
          payload,
        });

        logger.info({ userId, wordId, masteryLevel: newState.masteryLevel }, '发布单词掌握事件');
      } catch (error) {
        logger.error({ error, userId, wordId }, '发布单词掌握事件失败');
      }
    }
  }

  /**
   * 检查并发布遗忘风险警告事件
   */
  private async checkAndPublishForgettingRisk(
    userId: string,
    wordId: string,
    state: WordLearningState,
  ): Promise<void> {
    if (state.state !== WordState.REVIEWING && state.state !== WordState.MASTERED) {
      return;
    }

    try {
      const evaluation = await this.evaluateWordInternal(userId, wordId);
      const recallProbability = evaluation.factors.actrRecall;

      if (recallProbability < 0.7) {
        const prediction = await this.predictInterval(userId, wordId, 0.9);

        let riskLevel: 'high' | 'medium' | 'low';
        if (recallProbability < 0.4) {
          riskLevel = 'high';
        } else if (recallProbability < 0.6) {
          riskLevel = 'medium';
        } else {
          riskLevel = 'low';
        }

        const payload: ForgettingRiskPayload = {
          userId,
          wordId,
          recallProbability,
          riskLevel,
          lastReviewDate: state.lastReviewDate || undefined,
          suggestedReviewDate: new Date(Date.now() + prediction.optimalSeconds * 1000),
          timestamp: new Date(),
        };

        await this.eventBus.publish({
          type: 'FORGETTING_RISK_HIGH',
          payload,
        });

        logger.info({ userId, wordId, riskLevel, recallProbability }, '发布遗忘风险警告事件');
      }
    } catch (error) {
      logger.error({ error, userId, wordId }, '检查遗忘风险失败');
    }
  }

  // ==================== 缓存管理 ====================

  /**
   * 清除用户缓存
   */
  private invalidateUserCache(userId: string, wordId?: string): void {
    if (wordId) {
      cacheService.delete(CacheKeys.USER_LEARNING_STATE(userId, wordId));
      cacheService.delete(CacheKeys.WORD_SCORE(userId, wordId));
    }

    cacheService.delete(CacheKeys.USER_LEARNING_STATES(userId));
    cacheService.delete(CacheKeys.USER_DUE_WORDS(userId));
    cacheService.delete(CacheKeys.USER_STATS(userId));
    cacheService.delete(CacheKeys.WORD_SCORES(userId));
  }

  /**
   * 清除用户的所有学习状态缓存
   */
  clearUserCache(userId: string): void {
    this.invalidateUserCache(userId);
  }

  /**
   * 清除指定单词的缓存
   */
  clearWordCache(userId: string, wordId: string): void {
    this.invalidateUserCache(userId, wordId);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    cacheService.deletePattern('learning_state*');
    cacheService.deletePattern('due_words*');
    cacheService.deletePattern('user_stats*');
    cacheService.deletePattern('word_score*');
  }

  // ==================== 权限验证 ====================

  /**
   * 批量获取用户可访问的单词ID集合
   */
  private async getAccessibleWordIds(userId: string, wordIds: string[]): Promise<Set<string>> {
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: {
        id: true,
        wordBook: { select: { type: true, userId: true } },
      },
    });

    const accessibleIds = new Set<string>();
    for (const word of words) {
      if (word.wordBook.type === WordBookType.SYSTEM || word.wordBook.userId === userId) {
        accessibleIds.add(word.id);
      }
    }
    return accessibleIds;
  }

  /**
   * 验证用户是否有权访问该单词
   */
  private async assertWordAccessible(userId: string, wordId: string): Promise<void> {
    const word = await prisma.word.findUnique({
      where: { id: wordId },
      select: {
        wordBook: { select: { type: true, userId: true } },
      },
    });

    if (!word?.wordBook) {
      throw new Error('单词不存在');
    }

    if (word.wordBook.type === WordBookType.USER && word.wordBook.userId !== userId) {
      throw new Error('无权访问该单词');
    }
  }
}

// ==================== 导出单例 ====================

export const learningStateService = new LearningStateService();
