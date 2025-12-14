/**
 * AMAS Evaluation Layer - Word Mastery Evaluator
 * 单词掌握度评估器
 *
 * 职责:
 * - 融合多源数据评估单词掌握度
 * - 支持单词和批量评估
 * - 提供可配置的评分权重
 *
 * 融合数据源:
 * - SRS系统: masteryLevel, consecutiveCorrect
 * - ACT-R模型: recallProbability
 * - WordScore: recentAccuracy
 * - AMAS Engine: userState.fatigue
 */

import type { WordLearningState, WordScore } from '@prisma/client';
import { ACTRMemoryModel, ReviewTrace } from '../models/cognitive';
import { WordMemoryTracker, WordMemoryState } from '../tracking/word-memory-tracker';
import prisma from '../../config/database';

// ==================== 类型定义 ====================

/**
 * 评估器配置
 */
export interface EvaluatorConfig {
  weights: {
    /** SRS掌握等级权重（默认0.3） */
    srs: number;
    /** ACT-R预测权重（默认0.5） */
    actr: number;
    /** 近期正确率权重（默认0.2） */
    recent: number;
  };
  /** 学会阈值（默认0.7） */
  threshold: number;
  /** 疲劳度影响系数（默认0.3） */
  fatigueImpact: number;
}

/**
 * 掌握度评估结果
 */
export interface MasteryEvaluation {
  /** 单词ID */
  wordId: string;
  /** 是否学会 */
  isLearned: boolean;
  /** 综合评分 [0, 1] */
  score: number;
  /** 置信度 [0, 1] - 表示评估结果的可信程度，不影响 isLearned 判断 */
  confidence: number;
  /** 各因子详情 */
  factors: {
    /** SRS掌握等级 [0, 5] */
    srsLevel: number;
    /** ACT-R预测提取概率 [0, 1] */
    actrRecall: number;
    /** 近期正确率 [0, 1] */
    recentAccuracy: number;
    /** 用户疲劳度 [0, 1] */
    userFatigue: number;
  };
  /** 建议文本 */
  suggestion?: string;
  /** 疲劳度警告（当疲劳度较高时提示置信度可能不足） */
  fatigueWarning?: string;
}

/**
 * 用户状态（简化版，用于获取疲劳度）
 */
interface UserFatigueState {
  fatigue: number;
}

// ==================== 常量 ====================

/** 默认配置 */
const DEFAULT_CONFIG: EvaluatorConfig = {
  weights: {
    srs: 0.3,
    actr: 0.5,
    recent: 0.2,
  },
  threshold: 0.7,
  fatigueImpact: 0.3,
};

/** SRS最高掌握等级 */
const MAX_MASTERY_LEVEL = 5;

// ==================== 实现 ====================

/**
 * 单词掌握度评估器
 *
 * 融合多源数据，智能判断用户是否真正学会了单词
 */
export class WordMasteryEvaluator {
  private config: EvaluatorConfig;
  private actrModel: ACTRMemoryModel;
  private memoryTracker: WordMemoryTracker;

  constructor(
    config: Partial<EvaluatorConfig> = {},
    actrModel?: ACTRMemoryModel,
    memoryTracker?: WordMemoryTracker,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.weights) {
      this.config.weights = { ...DEFAULT_CONFIG.weights, ...config.weights };
    }
    // 校验并归一化权重
    this.normalizeWeights();
    this.actrModel = actrModel ?? new ACTRMemoryModel();
    this.memoryTracker = memoryTracker ?? new WordMemoryTracker();
  }

  /**
   * 归一化权重，确保权重和为1
   */
  private normalizeWeights(): void {
    const { srs, actr, recent } = this.config.weights;
    const sum = srs + actr + recent;

    if (Math.abs(sum - 1.0) > 0.001) {
      // 权重和不为1时进行归一化
      if (sum > 0) {
        this.config.weights = {
          srs: srs / sum,
          actr: actr / sum,
          recent: recent / sum,
        };
      } else {
        // 所有权重为0时使用默认值
        this.config.weights = { ...DEFAULT_CONFIG.weights };
      }
    }
  }

  /**
   * 评估单词掌握度
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param userFatigue 用户疲劳度（可选，默认0）
   * @returns MasteryEvaluation
   */
  async evaluate(
    userId: string,
    wordId: string,
    userFatigue: number = 0,
  ): Promise<MasteryEvaluation> {
    const [wordState, wordScore, trace] = await Promise.all([
      prisma.wordLearningState.findUnique({
        where: { unique_user_word: { userId, wordId } },
      }),
      prisma.wordScore.findUnique({
        where: { unique_user_word_score: { userId, wordId } },
      }),
      this.memoryTracker.getReviewTrace(userId, wordId),
    ]);

    return this.computeEvaluation(wordId, wordState, wordScore, trace, userFatigue);
  }

  /**
   * 批量评估单词掌握度
   *
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @param userFatigue 用户疲劳度（可选，默认0）
   * @returns MasteryEvaluation[]
   */
  async batchEvaluate(
    userId: string,
    wordIds: string[],
    userFatigue: number = 0,
  ): Promise<MasteryEvaluation[]> {
    if (wordIds.length === 0) {
      return [];
    }

    const [wordStateRows, wordScoreRows, memoryStates] = await Promise.all([
      prisma.wordLearningState.findMany({
        where: { userId, wordId: { in: wordIds } },
      }),
      prisma.wordScore.findMany({
        where: { userId, wordId: { in: wordIds } },
      }),
      this.memoryTracker.batchGetMemoryState(userId, wordIds),
    ]);

    const wordStates = new Map<string, WordLearningState>();
    for (const row of wordStateRows) {
      wordStates.set(row.wordId, row);
    }

    const wordScores = new Map<string, WordScore>();
    for (const row of wordScoreRows) {
      wordScores.set(row.wordId, row);
    }

    // 计算每个单词的评估结果
    return wordIds.map((wordId) => {
      const wordState = wordStates.get(wordId) ?? null;
      const wordScore = wordScores.get(wordId) ?? null;
      const memoryState = memoryStates.get(wordId);
      const trace = memoryState?.trace ?? [];

      return this.computeEvaluation(wordId, wordState, wordScore, trace, userFatigue);
    });
  }

  /**
   * 更新评估器配置
   *
   * @param config 部分配置
   */
  updateConfig(config: Partial<EvaluatorConfig>): void {
    if (config.weights) {
      this.config.weights = { ...this.config.weights, ...config.weights };
      // 更新权重后重新归一化
      this.normalizeWeights();
    }
    if (config.threshold !== undefined) {
      this.config.threshold = config.threshold;
    }
    if (config.fatigueImpact !== undefined) {
      this.config.fatigueImpact = config.fatigueImpact;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): EvaluatorConfig {
    return { ...this.config };
  }

  // ==================== 私有方法 ====================

  /**
   * 计算掌握度评估结果
   *
   * 修复: 置信度作为返回值的一部分，不再直接影响 isLearned 判断
   * - isLearned 仅基于原始评分与阈值的比较
   * - confidence 反映评估结果的可信程度，供调用方参考
   * - 疲劳度高时添加警告信息，而非错误地降低分数
   */
  private computeEvaluation(
    wordId: string,
    wordState: WordLearningState | null,
    wordScore: WordScore | null,
    trace: ReviewTrace[],
    userFatigue: number,
  ): MasteryEvaluation {
    // 提取各因子值
    const srsLevel = wordState?.masteryLevel ?? 0;
    const recentAccuracy = wordScore?.recentAccuracy ?? 0;

    // 计算ACT-R提取概率
    const recallPrediction = this.actrModel.retrievalProbability(trace);
    const actrRecall = recallPrediction.recallProbability;

    // 计算融合评分（权重已在构造函数中归一化，无需再次检查）
    const { weights, threshold, fatigueImpact } = this.config;
    const normalizedSrs = srsLevel / MAX_MASTERY_LEVEL;

    const rawScore =
      weights.srs * normalizedSrs + weights.actr * actrRecall + weights.recent * recentAccuracy;

    // 确保评分在 [0, 1] 范围内
    const score = this.clamp(rawScore, 0, 1);

    // 计算置信度：疲劳度影响评估结果的可信程度，但不影响判断结果
    const safeFatigue = this.clamp(userFatigue, 0, 1);
    const confidence = 1 - safeFatigue * fatigueImpact;

    // isLearned 仅基于原始评分判断，置信度不参与判断
    // 这样避免了疲劳时高分被错误判断为未学会的问题
    const isLearned = score >= threshold;

    // 生成建议
    const suggestion = this.generateSuggestion(actrRecall, srsLevel, isLearned);

    // 当疲劳度较高时，添加警告信息
    let fatigueWarning: string | undefined;
    if (safeFatigue > 0.6) {
      fatigueWarning = '当前疲劳度较高，评估结果的置信度可能不足，建议休息后再测试';
    } else if (safeFatigue > 0.4) {
      fatigueWarning = '疲劳度适中，评估结果仅供参考';
    }

    return {
      wordId,
      isLearned,
      score,
      confidence,
      factors: {
        srsLevel,
        actrRecall,
        recentAccuracy,
        userFatigue: safeFatigue,
      },
      suggestion,
      fatigueWarning,
    };
  }

  /**
   * 生成学习建议
   */
  private generateSuggestion(
    actrRecall: number,
    srsLevel: number,
    isLearned: boolean,
  ): string | undefined {
    if (isLearned) {
      return undefined;
    }

    if (actrRecall < 0.3) {
      return '这个单词快要忘记了，建议立即复习';
    }

    if (actrRecall < 0.6) {
      return '记忆有所衰退，建议今天内复习';
    }

    if (srsLevel < 2) {
      return '单词还不够熟练，需要更多练习';
    }

    return '继续保持复习以巩固记忆';
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ==================== 导出单例 ====================

export const wordMasteryEvaluator = new WordMasteryEvaluator();
