/**
 * 单词选择服务
 * Word Selection Service
 *
 * 职责：
 * - 统一的单词选择服务接口
 * - 合并 mastery-learning.service.ts 的选词功能
 * - 集成 IWordSelector 接口和策略系统
 * - 根据会话类型自动选择策略
 */

import prisma from '../config/database';
import studyConfigService from './study-config.service';
import { amasService } from './amas.service';
import { calculateForgettingFactor } from '../amas/models/forgetting-curve';
import difficultyCacheService from './difficulty-cache.service';
import { logger } from '../logger';
import { StrategyParams } from '../amas';
import {
  IWordSelector,
  WordCandidate,
  SelectionContext,
  SelectionResult,
} from '../amas/policies/word-selector.interface';
import { MicroSessionPolicy } from '../amas/policies/micro-session-policy';

// ========== 类型定义 ==========

/**
 * 会话类型
 */
export type SessionType = 'normal' | 'review' | 'micro';

/**
 * 单词项（统一格式）
 */
export interface WordItem {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl: string | null;
  difficulty: number;
  isNew: boolean;
}

/**
 * 选词请求参数
 */
export interface SelectWordsRequest {
  userId: string;
  count: number;
  excludeIds?: string[];
  sessionType?: SessionType;
  availableTimeMinutes?: number;
}

/**
 * 选词响应
 */
export interface SelectWordsResponse {
  words: WordItem[];
  strategy?: StrategyParams;
  reason: string;
  sessionType: SessionType;
}

/**
 * 复习选词请求
 */
export interface SelectReviewWordsRequest {
  userId: string;
  count: number;
  excludeIds?: string[];
  priorityMode?: 'urgency' | 'difficulty' | 'balanced';
}

/**
 * 碎片时间选词请求
 */
export interface SelectMicroSessionWordsRequest {
  userId: string;
  availableTimeMinutes?: number;
  maxWords?: number;
  excludeIds?: string[];
}

// ========== 内部类型 ==========

type DifficultyRange = { min: number; max: number };

type WordWithDifficulty = {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl: string | null;
  difficulty: number;
  isNew: boolean;
};

type WordWithPriority = WordWithDifficulty & {
  priority: number;
};

// ========== 服务类 ==========

class WordSelectionService {
  // 默认批次大小
  private static readonly DEFAULT_BATCH_SIZE = 5;

  // 碎片时间策略实例
  private microSessionPolicy: MicroSessionPolicy;

  constructor() {
    this.microSessionPolicy = new MicroSessionPolicy(5);
  }

  /**
   * 为会话选词（主入口）
   * 根据会话类型自动选择合适的策略
   */
  async selectWordsForSession(params: SelectWordsRequest): Promise<SelectWordsResponse> {
    const { userId, count, excludeIds = [], sessionType = 'normal' } = params;

    logger.debug(
      `[WordSelection] 选词请求: userId=${userId}, count=${count}, ` +
        `sessionType=${sessionType}, excludeCount=${excludeIds.length}`,
    );

    // 根据会话类型选择策略
    switch (sessionType) {
      case 'review':
        return await this.selectForReview(userId, count, excludeIds);
      case 'micro':
        return await this.selectForMicroSession(
          userId,
          params.availableTimeMinutes,
          count,
          excludeIds,
        );
      case 'normal':
      default:
        return await this.selectForNormalSession(userId, count, excludeIds);
    }
  }

  /**
   * 为复习选词
   * 专注于到期和高优先级的复习词
   */
  async selectWordsForReview(params: SelectReviewWordsRequest): Promise<SelectWordsResponse> {
    const { userId, count, excludeIds = [], priorityMode = 'balanced' } = params;

    logger.debug(
      `[WordSelection] 复习选词: userId=${userId}, count=${count}, ` +
        `priorityMode=${priorityMode}`,
    );

    // 获取到期复习词并计算优先级
    const dueWords = await this.getDueWordsWithPriority(userId, excludeIds);

    // 根据优先级模式排序
    const sortedWords = this.sortByPriorityMode(dueWords, priorityMode);

    // 选择前 N 个
    const selectedWords = sortedWords.slice(0, count);

    // 如果复习词不足，用新词补充（保持学习连贯性）
    let finalWords: WordWithDifficulty[] = selectedWords;
    if (selectedWords.length < count) {
      const newWordsNeeded = count - selectedWords.length;
      const strategy =
        (await amasService.getCurrentStrategy(userId)) ?? amasService.getDefaultStrategy();
      const difficultyRange = this.mapDifficultyLevel(strategy.difficulty);

      const newWords = await this.fetchNewWordsInRange(userId, newWordsNeeded, difficultyRange, [
        ...excludeIds,
        ...selectedWords.map((w) => w.id),
      ]);

      finalWords = [...selectedWords, ...newWords];
    }

    const reason = this.generateReviewReason(finalWords, priorityMode);

    return {
      words: finalWords,
      reason,
      sessionType: 'review',
    };
  }

  /**
   * 为碎片时间选词
   * 使用 MicroSessionPolicy 策略
   */
  async selectWordsForMicroSession(
    params: SelectMicroSessionWordsRequest,
  ): Promise<SelectWordsResponse> {
    const { userId, availableTimeMinutes = 5, maxWords = 5, excludeIds = [] } = params;

    logger.debug(
      `[WordSelection] 碎片时间选词: userId=${userId}, availableTime=${availableTimeMinutes}min, ` +
        `maxWords=${maxWords}`,
    );

    // 获取候选单词
    const candidates = await this.getCandidatesForMicroSession(userId, excludeIds);

    // 转换为 WordCandidate 格式
    const wordCandidates: WordCandidate[] = await this.toWordCandidates(userId, candidates);

    // 使用碎片时间策略选词
    const selectionContext: SelectionContext = {
      userId,
      availableTimeMinutes,
      isMicroSession: true,
      targetCount: maxWords,
      timestamp: Date.now(),
    };

    const selectionResult = this.microSessionPolicy.selectWords(wordCandidates, selectionContext);

    // 根据选中的 ID 提取完整的单词信息
    const selectedWords = this.extractSelectedWords(candidates, selectionResult.selectedWordIds);

    return {
      words: selectedWords,
      reason: selectionResult.reason || '碎片时间学习：短词 + 高优先级',
      sessionType: 'micro',
    };
  }

  /**
   * 普通会话选词
   * 使用 AMAS 策略平衡新词和复习词
   */
  private async selectForNormalSession(
    userId: string,
    count: number,
    excludeIds: string[],
  ): Promise<SelectWordsResponse> {
    // 获取 AMAS 策略
    const strategy =
      (await amasService.getCurrentStrategy(userId)) ?? amasService.getDefaultStrategy();

    // 使用策略选词
    const words = await this.fetchWordsWithStrategy(userId, count, strategy, excludeIds);

    // 生成选词说明
    const reason = this.explainWordSelection(strategy, words);

    return {
      words,
      strategy,
      reason,
      sessionType: 'normal',
    };
  }

  /**
   * 复习会话选词
   */
  private async selectForReview(
    userId: string,
    count: number,
    excludeIds: string[],
  ): Promise<SelectWordsResponse> {
    return await this.selectWordsForReview({
      userId,
      count,
      excludeIds,
      priorityMode: 'urgency',
    });
  }

  /**
   * 碎片时间会话选词
   */
  private async selectForMicroSession(
    userId: string,
    availableTimeMinutes: number | undefined,
    count: number,
    excludeIds: string[],
  ): Promise<SelectWordsResponse> {
    return await this.selectWordsForMicroSession({
      userId,
      availableTimeMinutes,
      maxWords: count,
      excludeIds,
    });
  }

  // ========== 策略相关方法 ==========

  /**
   * 根据 AMAS 策略选词
   */
  private async fetchWordsWithStrategy(
    userId: string,
    count: number,
    strategy: StrategyParams,
    excludeIds: string[],
  ): Promise<WordWithDifficulty[]> {
    // 1. 获取所有到期复习词，计算优先级
    const dueWords = await this.getDueWordsWithPriority(userId, excludeIds);

    // 2. 根据 AMAS difficulty 过滤
    const difficultyRange = this.mapDifficultyLevel(strategy.difficulty);
    const filteredDueWords = dueWords.filter(
      (w) => w.difficulty >= difficultyRange.min && w.difficulty <= difficultyRange.max,
    );

    // 3. 按优先级排序
    const sortedDueWords = filteredDueWords.sort((a, b) => b.priority - a.priority);

    // 4. 根据 new_ratio 决定新词/复习词比例
    const reviewCount = Math.ceil(count * (1 - strategy.new_ratio));
    const newCount = count - reviewCount;

    const reviewWords = sortedDueWords.slice(0, reviewCount);

    // 5. 如果复习词不足，用新词补充
    const actualNewCount = Math.max(newCount, count - reviewWords.length);
    const newWords = await this.fetchNewWordsInRange(userId, actualNewCount, difficultyRange, [
      ...excludeIds,
      ...reviewWords.map((w) => w.id),
    ]);

    logger.debug(
      `[WordSelection] 策略选词结果: 复习词=${reviewWords.length}, 新词=${newWords.length}, ` +
        `难度范围=[${difficultyRange.min.toFixed(2)}, ${difficultyRange.max.toFixed(2)}]`,
    );

    return [...reviewWords, ...newWords];
  }

  /**
   * 获取到期复习词并计算优先级
   */
  private async getDueWordsWithPriority(
    userId: string,
    excludeIds: string[],
  ): Promise<WordWithPriority[]> {
    const now = new Date();

    // 查询到期的学习状态
    const dueStates = await prisma.wordLearningState.findMany({
      where: {
        userId,
        wordId: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
        nextReviewDate: { lte: now },
        state: { in: ['LEARNING', 'REVIEWING', 'NEW'] },
      },
      include: { word: true },
    });

    if (dueStates.length === 0) {
      return [];
    }

    // 批量获取得分
    const wordIds = dueStates.map((s) => s.wordId);
    const scores = await prisma.wordScore.findMany({
      where: { userId, wordId: { in: wordIds } },
    });
    const scoreMap = new Map(scores.map((s) => [s.wordId, s]));

    // 计算每个单词的优先级和难度
    return dueStates.map((state) => {
      const score = scoreMap.get(state.wordId);
      const overdueDays = state.nextReviewDate
        ? (now.getTime() - state.nextReviewDate.getTime()) / 86400000
        : 0;
      const errorRate =
        score && score.totalAttempts > 0 ? 1 - score.correctAttempts / score.totalAttempts : 0;

      // 优先级计算：逾期天数×5 + 错误率权重 + (100-得分)×0.3
      const priority =
        Math.min(40, Math.max(0, overdueDays) * 5) +
        (errorRate > 0.5 ? 30 : errorRate * 60) +
        (score ? (100 - score.totalScore) * 0.3 : 30);

      // 难度计算
      const difficulty = this.computeWordDifficultyFromScore(score, errorRate);

      return {
        id: state.word.id,
        spelling: state.word.spelling,
        phonetic: state.word.phonetic,
        meanings: state.word.meanings,
        examples: state.word.examples,
        audioUrl: state.word.audioUrl,
        difficulty,
        isNew: false,
        priority,
      };
    });
  }

  /**
   * 在指定难度范围内获取新词
   */
  private async fetchNewWordsInRange(
    userId: string,
    count: number,
    difficultyRange: DifficultyRange,
    excludeIds: string[],
  ): Promise<WordWithDifficulty[]> {
    if (count <= 0) return [];

    const config = await studyConfigService.getUserStudyConfig(userId);
    if (config.selectedWordBookIds.length === 0) {
      return [];
    }

    // 获取未学习过的单词
    let newWords: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl: string | null;
    }>;

    if (config.studyMode === 'sequential') {
      newWords = await prisma.word.findMany({
        where: {
          wordBookId: { in: config.selectedWordBookIds },
          id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
          learningStates: { none: { userId } },
        },
        take: count * 2,
        orderBy: { createdAt: 'asc' },
      });
    } else {
      // 随机模式
      const candidates = await prisma.word.findMany({
        where: {
          wordBookId: { in: config.selectedWordBookIds },
          id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
          learningStates: { none: { userId } },
        },
        take: count * 5,
      });
      // Fisher-Yates 随机打乱
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      newWords = candidates.slice(0, count * 2);
    }

    // 计算难度并筛选
    const wordsWithDifficulty = newWords.map((w) => ({
      id: w.id,
      spelling: w.spelling,
      phonetic: w.phonetic,
      meanings: w.meanings,
      examples: w.examples,
      audioUrl: w.audioUrl,
      difficulty: this.computeNewWordDifficulty(w),
      isNew: true,
    }));

    // 按难度范围筛选
    const filtered = wordsWithDifficulty.filter(
      (w) => w.difficulty >= difficultyRange.min && w.difficulty <= difficultyRange.max,
    );

    // 如果筛选后不足，用其他单词补充
    if (filtered.length < count) {
      const filteredIds = new Set(filtered.map((w) => w.id));
      const remaining = wordsWithDifficulty.filter((w) => !filteredIds.has(w.id));
      const needCount = count - filtered.length;
      return [...filtered, ...remaining.slice(0, needCount)];
    }

    return filtered.slice(0, count);
  }

  /**
   * 获取碎片时间候选单词
   */
  private async getCandidatesForMicroSession(
    userId: string,
    excludeIds: string[],
  ): Promise<WordWithDifficulty[]> {
    // 优先获取到期复习词
    const dueWords = await this.getDueWordsWithPriority(userId, excludeIds);

    // 如果复习词不足，补充一些新词
    if (dueWords.length < 15) {
      const config = await studyConfigService.getUserStudyConfig(userId);
      if (config.selectedWordBookIds.length > 0) {
        const newWords = await prisma.word.findMany({
          where: {
            wordBookId: { in: config.selectedWordBookIds },
            id: { notIn: [...excludeIds, ...dueWords.map((w) => w.id)] },
            learningStates: { none: { userId } },
          },
          take: 15 - dueWords.length,
          orderBy: config.studyMode === 'sequential' ? { createdAt: 'asc' } : undefined,
        });

        const newWordsWithDifficulty = newWords.map((w) => ({
          id: w.id,
          spelling: w.spelling,
          phonetic: w.phonetic,
          meanings: w.meanings,
          examples: w.examples,
          audioUrl: w.audioUrl,
          difficulty: this.computeNewWordDifficulty(w),
          isNew: true,
        }));

        return [...dueWords, ...newWordsWithDifficulty];
      }
    }

    return dueWords;
  }

  /**
   * 转换为 WordCandidate 格式
   */
  private async toWordCandidates(
    userId: string,
    words: WordWithDifficulty[],
  ): Promise<WordCandidate[]> {
    if (words.length === 0) return [];

    // 获取学习状态
    const wordIds = words.map((w) => w.id);
    const learningStates = await prisma.wordLearningState.findMany({
      where: { userId, wordId: { in: wordIds } },
    });

    const stateMap = new Map(learningStates.map((s) => [s.wordId, s]));

    return words.map((word) => {
      const state = stateMap.get(word.id);
      const letterCount = word.spelling.replace(/[^A-Za-z]/g, '').length;

      return {
        wordId: word.id,
        length: letterCount,
        difficulty: this.mapDifficultyToLevel(word.difficulty),
        lastReviewTime: state?.lastReviewDate?.getTime(),
        reviewCount: state?.reviewCount ?? 0,
        forgettingRisk: this.calculateForgettingRisk(word, state),
        memoryStrength: state ? this.calculateMemoryStrength(state) : 0,
      };
    });
  }

  /**
   * 提取选中的单词
   */
  private extractSelectedWords(
    candidates: WordWithDifficulty[],
    selectedIds: string[],
  ): WordItem[] {
    const wordMap = new Map(candidates.map((w) => [w.id, w]));
    return selectedIds.map((id) => wordMap.get(id)!).filter((w) => w !== undefined);
  }

  // ========== 辅助方法 ==========

  /**
   * 根据优先级模式排序
   */
  private sortByPriorityMode(
    words: WordWithPriority[],
    mode: 'urgency' | 'difficulty' | 'balanced',
  ): WordWithPriority[] {
    const sorted = [...words];

    switch (mode) {
      case 'urgency':
        // 按逾期时间排序
        sorted.sort((a, b) => b.priority - a.priority);
        break;
      case 'difficulty':
        // 按难度排序
        sorted.sort((a, b) => b.difficulty - a.difficulty);
        break;
      case 'balanced':
      default:
        // 平衡排序：优先级和难度综合
        sorted.sort((a, b) => {
          const scoreA = a.priority * 0.6 + a.difficulty * 40;
          const scoreB = b.priority * 0.6 + b.difficulty * 40;
          return scoreB - scoreA;
        });
        break;
    }

    return sorted;
  }

  /**
   * 生成复习选词说明
   */
  private generateReviewReason(words: WordItem[], mode: string): string {
    const reviewCount = words.filter((w) => !w.isNew).length;
    const newCount = words.filter((w) => w.isNew).length;

    if (reviewCount === 0) {
      return '暂无到期复习词，推送新词保持学习连贯性';
    }

    const modeText =
      {
        urgency: '按紧急程度',
        difficulty: '按难度优先',
        balanced: '综合优先级',
      }[mode] || '综合优先级';

    if (newCount > 0) {
      return `${modeText}：${reviewCount}个复习词 + ${newCount}个新词`;
    }

    return `${modeText}：${reviewCount}个复习词`;
  }

  /**
   * 映射 AMAS 难度级别到数值范围
   */
  private mapDifficultyLevel(level: 'easy' | 'mid' | 'hard'): DifficultyRange {
    switch (level) {
      case 'easy':
        return { min: 0, max: 0.4 };
      case 'mid':
        return { min: 0.2, max: 0.7 };
      case 'hard':
        return { min: 0.5, max: 1.0 };
      default:
        return { min: 0.2, max: 0.7 };
    }
  }

  /**
   * 映射数值难度到级别
   */
  private mapDifficultyToLevel(difficulty: number): 'easy' | 'mid' | 'hard' {
    if (difficulty < 0.4) return 'easy';
    if (difficulty < 0.7) return 'mid';
    return 'hard';
  }

  /**
   * 根据得分计算单词难度
   */
  private computeWordDifficultyFromScore(
    score: { totalScore: number; correctAttempts: number; totalAttempts: number } | undefined,
    errorRate: number,
  ): number {
    if (!score) return 0.5;
    const scoreFactor = (100 - score.totalScore) / 100;
    return Math.min(1, Math.max(0, errorRate * 0.6 + scoreFactor * 0.4));
  }

  /**
   * 计算新词难度
   */
  private computeNewWordDifficulty(word: { spelling: string; meanings: string[] }): number {
    const lengthFactor = Math.min(1, word.spelling.length / 15);
    const meaningFactor = Math.min(1, word.meanings.length / 5);
    return lengthFactor * 0.6 + meaningFactor * 0.4;
  }

  /**
   * 计算遗忘风险
   */
  private calculateForgettingRisk(
    word: WordWithDifficulty,
    state:
      | {
          lastReviewDate: Date | null;
          reviewCount: number;
          currentInterval: number;
        }
      | undefined,
  ): number {
    if (!state || !state.lastReviewDate) {
      return 1; // 未学习过，风险最高
    }

    const daysSinceReview = (Date.now() - state.lastReviewDate.getTime()) / (1000 * 60 * 60 * 24);
    const reviewBonus = Math.min(state.reviewCount * 0.1, 0.5);

    // 基于遗忘曲线
    const retention = calculateForgettingFactor({
      wordId: word.id,
      lastReviewTime: state.lastReviewDate,
      reviewCount: state.reviewCount,
      averageAccuracy: 1 - word.difficulty, // 用难度估算正确率
    });

    const baseRisk = 1 - retention;
    return Math.max(0, Math.min(1, baseRisk - reviewBonus));
  }

  /**
   * 计算记忆强度
   */
  private calculateMemoryStrength(state: {
    reviewCount: number;
    currentInterval: number;
    lastReviewDate: Date | null;
  }): number {
    // 基于复习次数和间隔计算记忆强度
    const reviewFactor = Math.min(1, state.reviewCount / 10);
    const intervalFactor = Math.min(1, state.currentInterval / 30);

    return reviewFactor * 0.6 + intervalFactor * 0.4;
  }

  /**
   * 生成选词说明
   */
  private explainWordSelection(strategy: StrategyParams, words: WordWithDifficulty[]): string {
    const reviewCount = words.filter((w) => !w.isNew).length;
    const newCount = words.filter((w) => w.isNew).length;

    const difficultyText =
      {
        easy: '简单',
        mid: '中等',
        hard: '较难',
      }[strategy.difficulty] || '中等';

    if (strategy.new_ratio <= 0.1) {
      return `当前状态建议巩固复习，推送${reviewCount}个${difficultyText}复习词`;
    } else if (strategy.new_ratio >= 0.4) {
      return `状态良好，推送${newCount}个新词和${reviewCount}个复习词`;
    } else {
      return `推送${reviewCount}个复习词和${newCount}个新词，难度${difficultyText}`;
    }
  }

  /**
   * 设置碎片时间策略的最大单词数
   */
  setMicroSessionMaxWords(maxWords: number): void {
    this.microSessionPolicy.setMaxWords(maxWords);
  }

  /**
   * 获取碎片时间策略配置
   */
  getMicroSessionConfig() {
    return this.microSessionPolicy.getConfig();
  }
}

// 导出单例
export const wordSelectionService = new WordSelectionService();
export default wordSelectionService;
