/**
 * 单词掌握度评估服务
 * 对外提供统一的掌握度评估接口
 */

import prisma from '../config/database';
import {
  WordMasteryEvaluator,
  MasteryEvaluation,
  EvaluatorConfig
} from '../amas/evaluation/word-mastery-evaluator';
import {
  WordMemoryTracker,
  ReviewEvent,
  WordMemoryState
} from '../amas/tracking/word-memory-tracker';
import { ReviewTrace, IntervalPrediction, ACTRMemoryModel } from '../amas/modeling/actr-memory';

// ==================== 类型定义 ====================

/**
 * 用户掌握度统计
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

// ==================== 服务实现 ====================

export class WordMasteryService {
  private evaluator: WordMasteryEvaluator;
  private tracker: WordMemoryTracker;
  private actrModel: ACTRMemoryModel;

  constructor() {
    this.tracker = new WordMemoryTracker();
    this.actrModel = new ACTRMemoryModel();
    this.evaluator = new WordMasteryEvaluator({}, this.actrModel, this.tracker);
  }

  // ==================== 评估接口 ====================

  /**
   * 评估单词掌握度
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param userFatigue 用户疲劳度（可选）
   */
  async evaluateWord(
    userId: string,
    wordId: string,
    userFatigue?: number
  ): Promise<MasteryEvaluation> {
    // 获取用户疲劳度（如果未提供）
    const fatigue = userFatigue ?? await this.getUserFatigue(userId);
    return this.evaluator.evaluate(userId, wordId, fatigue);
  }

  /**
   * 批量评估单词掌握度
   *
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @param userFatigue 用户疲劳度（可选）
   */
  async batchEvaluateWords(
    userId: string,
    wordIds: string[],
    userFatigue?: number
  ): Promise<MasteryEvaluation[]> {
    const fatigue = userFatigue ?? await this.getUserFatigue(userId);
    return this.evaluator.batchEvaluate(userId, wordIds, fatigue);
  }

  /**
   * 获取用户掌握度统计
   *
   * @param userId 用户ID
   */
  async getUserMasteryStats(userId: string): Promise<UserMasteryStats> {
    // 获取用户所有学习状态
    const learningStates = await prisma.wordLearningState.findMany({
      where: { userId },
      select: { wordId: true, state: true, masteryLevel: true }
    });

    if (learningStates.length === 0) {
      return {
        totalWords: 0,
        masteredWords: 0,
        learningWords: 0,
        newWords: 0,
        averageScore: 0,
        averageRecall: 0,
        needReviewCount: 0
      };
    }

    const wordIds = learningStates.map(s => s.wordId);
    const fatigue = await this.getUserFatigue(userId);

    // 批量评估所有单词
    const evaluations = await this.evaluator.batchEvaluate(userId, wordIds, fatigue);

    // 计算统计数据
    const masteredWords = evaluations.filter(e => e.isLearned).length;
    const learningWords = learningStates.filter(
      s => s.state === 'LEARNING' || s.state === 'REVIEWING'
    ).length;
    const newWords = learningStates.filter(s => s.state === 'NEW').length;

    const totalScore = evaluations.reduce((sum, e) => sum + e.score, 0);
    const totalRecall = evaluations.reduce((sum, e) => sum + e.factors.actrRecall, 0);

    // 需要复习的单词：ACT-R提取概率低于0.7且未完全掌握
    const needReviewCount = evaluations.filter(
      e => e.factors.actrRecall < 0.7 && !e.isLearned
    ).length;

    return {
      totalWords: learningStates.length,
      masteredWords,
      learningWords,
      newWords,
      averageScore: learningStates.length > 0 ? totalScore / learningStates.length : 0,
      averageRecall: learningStates.length > 0 ? totalRecall / learningStates.length : 0,
      needReviewCount
    };
  }

  // ==================== 复习轨迹接口 ====================

  /**
   * 记录复习事件
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param event 复习事件
   */
  async recordReview(
    userId: string,
    wordId: string,
    event: ReviewEvent
  ): Promise<void> {
    await this.tracker.recordReview(userId, wordId, event);
  }

  /**
   * 批量记录复习事件
   *
   * @param userId 用户ID
   * @param events 复习事件列表
   */
  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEvent }>
  ): Promise<void> {
    if (events.length === 0) return;
    await this.tracker.batchRecordReview(userId, events);
  }

  /**
   * 获取单词复习轨迹
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param limit 返回数量限制
   */
  async getMemoryTrace(
    userId: string,
    wordId: string,
    limit: number = 50
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
        responseTime: true
      }
    });

    return records.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      isCorrect: r.isCorrect,
      responseTime: r.responseTime,
      secondsAgo: Math.floor((now - r.timestamp.getTime()) / 1000)
    }));
  }

  /**
   * 获取单词记忆状态
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   */
  async getWordMemoryState(
    userId: string,
    wordId: string
  ): Promise<WordMemoryState | null> {
    const states = await this.tracker.batchGetMemoryState(userId, [wordId]);
    return states.get(wordId) ?? null;
  }

  // ==================== 间隔预测接口 ====================

  /**
   * 预测单词最佳复习间隔
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param targetRecall 目标提取概率（默认0.9）
   */
  async predictInterval(
    userId: string,
    wordId: string,
    targetRecall: number = 0.9
  ): Promise<IntervalPrediction> {
    const trace = await this.tracker.getReviewTrace(userId, wordId);
    return this.actrModel.predictOptimalInterval(trace, targetRecall);
  }

  // ==================== 配置接口 ====================

  /**
   * 更新评估器配置
   *
   * @param config 部分配置
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

  // ==================== 私有方法 ====================

  /**
   * 获取用户疲劳度
   */
  private async getUserFatigue(userId: string): Promise<number> {
    const amasState = await prisma.amasUserState.findUnique({
      where: { userId },
      select: { fatigue: true }
    });
    return amasState?.fatigue ?? 0;
  }
}

// ==================== 导出单例 ====================

export const wordMasteryService = new WordMasteryService();
