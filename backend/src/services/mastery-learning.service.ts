/**
 * 掌握度学习服务
 * Mastery-Based Learning Service
 */

import prisma from '../config/database';
import studyConfigService from './study-config.service';
import { calculateForgettingFactor } from '../amas/modeling/forgetting-curve';
import difficultyCacheService from './difficulty-cache.service';
import { recordDifficultyComputationTime, recordQueueAdjustmentDuration } from './metrics.service';
import { amasService } from './amas.service';
import { StrategyParams } from '../amas';
import { logger } from '../logger';

// ========== 队列调整相关类型 ==========

export interface AdjustWordsRequest {
  userId: string;
  sessionId: string;
  currentWordIds: string[];
  masteredWordIds: string[];
  userState?: { fatigue: number; attention: number; motivation: number };
  recentPerformance: { accuracy: number; avgResponseTime: number; consecutiveWrong: number };
  adjustReason: 'fatigue' | 'struggling' | 'excelling' | 'periodic';
}

export interface AdjustWordsResponse {
  adjustments: {
    remove: string[];
    add: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      isNew: boolean;
      difficulty: number;
    }>;
  };
  targetDifficulty: { min: number; max: number };
  reason: string;
  adjustmentReason: AdjustWordsRequest['adjustReason'];
  triggerConditions: {
    performance: { accuracy: number; avgResponseTime: number; consecutiveWrong: number };
    userState?: { fatigue?: number; attention?: number; motivation?: number } | null;
    targetDifficulty: DifficultyRange;
  };
  nextCheckIn: number;
}

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

// 带优先级的复习词
type WordWithPriority = WordWithDifficulty & {
  priority: number;
};

// 动态获取下一批单词的请求参数
export interface GetNextWordsRequest {
  currentWordIds: string[];
  masteredWordIds: string[];
  sessionId: string;
  count?: number;
}

// 动态获取下一批单词的响应
export interface GetNextWordsResponse {
  words: WordWithDifficulty[];
  strategy: StrategyParams;
  reason: string;
}

class MasteryLearningService {
  // 初始获取单词数量（小批量启动）
  private static readonly INITIAL_BATCH_SIZE = 5;
  // 动态补充时默认获取数量
  private static readonly DEFAULT_NEXT_BATCH_SIZE = 3;

  /**
   * 获取掌握模式的学习单词
   * 初始只获取少量单词，后续通过 getNextWords 按需补充
   *
   * @param userId 用户ID
   * @param targetCount 目标掌握数量
   * @returns 单词列表和元数据
   */
  async getWordsForMasteryMode(userId: string, targetCount?: number) {
    // 获取用户配置
    const config = await studyConfigService.getUserStudyConfig(userId);

    // 确定目标数量
    const target = targetCount ?? config.dailyMasteryTarget ?? config.dailyWordCount ?? 20;

    // 获取 AMAS 策略
    const strategy = await amasService.getCurrentStrategy(userId)
      ?? amasService.getDefaultStrategy();

    // 初始只获取少量单词（按需加载模式）
    const initialBatchSize = MasteryLearningService.INITIAL_BATCH_SIZE;

    logger.debug(
      `[MasteryLearning] 获取掌握模式单词: userId=${userId}, ` +
      `target=${target}, initialBatch=${initialBatchSize}, ` +
      `strategy=${JSON.stringify({ new_ratio: strategy.new_ratio, difficulty: strategy.difficulty })}`
    );

    // 使用 AMAS 策略获取初始单词
    const words = await this.fetchWordsWithStrategy(userId, initialBatchSize, strategy, []);

    return {
      words,
      meta: {
        mode: 'mastery',
        targetCount: target,
        fetchCount: words.length,
        masteryThreshold: 2,  // 默认连续2次正确(实际由AMAS决定)
        maxQuestions: 100,    // 单次会话最大题数
        strategy              // 返回当前策略供前端参考
      }
    };
  }

  /**
   * 动态获取下一批单词
   * 由 AMAS 根据用户当前状态决定选词策略
   */
  async getNextWords(userId: string, params: GetNextWordsRequest): Promise<GetNextWordsResponse> {
    const { currentWordIds, masteredWordIds, sessionId, count } = params;
    const batchSize = count ?? MasteryLearningService.DEFAULT_NEXT_BATCH_SIZE;

    // 从 AMAS 获取最新策略
    const strategy = await amasService.getCurrentStrategy(userId)
      ?? amasService.getDefaultStrategy();

    const excludeIds = [...new Set([...currentWordIds, ...masteredWordIds])];

    logger.debug(
      `[MasteryLearning] 动态获取下一批单词: userId=${userId}, sessionId=${sessionId}, ` +
      `count=${batchSize}, excludeCount=${excludeIds.length}, ` +
      `strategy=${JSON.stringify({ new_ratio: strategy.new_ratio, difficulty: strategy.difficulty })}`
    );

    // 根据策略选词
    const words = await this.fetchWordsWithStrategy(userId, batchSize, strategy, excludeIds);

    // 生成选词说明
    const reason = this.explainWordSelection(strategy, words);

    return { words, strategy, reason };
  }

  /**
   * 根据 AMAS 策略选词
   * 结合复习优先级和策略参数
   */
  private async fetchWordsWithStrategy(
    userId: string,
    count: number,
    strategy: StrategyParams,
    excludeIds: string[]
  ): Promise<WordWithDifficulty[]> {
    // 1. 获取所有到期复习词，计算优先级
    const dueWords = await this.getDueWordsWithPriority(userId, excludeIds);

    // 2. 根据 AMAS difficulty 过滤
    const difficultyRange = this.mapDifficultyLevel(strategy.difficulty);
    const filteredDueWords = dueWords.filter(w =>
      w.difficulty >= difficultyRange.min &&
      w.difficulty <= difficultyRange.max
    );

    // 3. 按优先级排序
    const sortedDueWords = filteredDueWords.sort((a, b) => b.priority - a.priority);

    // 4. 根据 new_ratio 决定新词/复习词比例
    const reviewCount = Math.ceil(count * (1 - strategy.new_ratio));
    const newCount = count - reviewCount;

    const reviewWords = sortedDueWords.slice(0, reviewCount);

    // 5. 如果复习词不足，用新词补充
    const actualNewCount = Math.max(newCount, count - reviewWords.length);
    const newWords = await this.fetchNewWordsInRange(
      userId,
      actualNewCount,
      difficultyRange,
      [...excludeIds, ...reviewWords.map(w => w.id)]
    );

    logger.debug(
      `[MasteryLearning] 选词结果: 复习词=${reviewWords.length}, 新词=${newWords.length}, ` +
      `难度范围=[${difficultyRange.min.toFixed(2)}, ${difficultyRange.max.toFixed(2)}]`
    );

    return [...reviewWords, ...newWords];
  }

  /**
   * 获取到期复习词并计算优先级
   */
  private async getDueWordsWithPriority(
    userId: string,
    excludeIds: string[]
  ): Promise<WordWithPriority[]> {
    const now = new Date();

    // 查询到期的学习状态
    const dueStates = await prisma.wordLearningState.findMany({
      where: {
        userId,
        wordId: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
        nextReviewDate: { lte: now },
        state: { in: ['LEARNING', 'REVIEWING', 'NEW'] }
      },
      include: { word: true }
    });

    if (dueStates.length === 0) {
      return [];
    }

    // 批量获取得分
    const wordIds = dueStates.map(s => s.wordId);
    const scores = await prisma.wordScore.findMany({
      where: { userId, wordId: { in: wordIds } }
    });
    const scoreMap = new Map(scores.map(s => [s.wordId, s]));

    // 计算每个单词的优先级和难度
    return dueStates.map(state => {
      const score = scoreMap.get(state.wordId);
      const overdueDays = state.nextReviewDate
        ? (now.getTime() - state.nextReviewDate.getTime()) / 86400000
        : 0;
      const errorRate = score && score.totalAttempts > 0
        ? 1 - (score.correctAttempts / score.totalAttempts)
        : 0;

      // 优先级计算：逾期天数×5 + 错误率权重 + (100-得分)×0.3
      const priority =
        Math.min(40, Math.max(0, overdueDays) * 5) +
        (errorRate > 0.5 ? 30 : errorRate * 60) +
        (score ? (100 - score.totalScore) * 0.3 : 30);

      // 难度计算：基于错误率和得分
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
        priority
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
    excludeIds: string[]
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
          learningStates: { none: { userId } }
        },
        take: count * 2,
        orderBy: { createdAt: 'asc' }
      });
    } else {
      // 随机模式使用 Prisma ORM 查询 + 应用层随机排序
      const candidates = await prisma.word.findMany({
        where: {
          wordBookId: { in: config.selectedWordBookIds },
          id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
          learningStates: { none: { userId } }
        },
        take: count * 5 // 多取一些用于随机
      });
      // Fisher-Yates 随机打乱
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      newWords = candidates.slice(0, count * 2);
    }

    // 计算难度并筛选
    const wordsWithDifficulty = newWords.map(w => ({
      id: w.id,
      spelling: w.spelling,
      phonetic: w.phonetic,
      meanings: w.meanings,
      examples: w.examples,
      audioUrl: w.audioUrl,
      difficulty: this.computeNewWordDifficulty(w),
      isNew: true
    }));

    // 按难度范围筛选
    const filtered = wordsWithDifficulty.filter(
      w => w.difficulty >= difficultyRange.min && w.difficulty <= difficultyRange.max
    );

    // 如果筛选后不足，放宽条件
    if (filtered.length < count) {
      return wordsWithDifficulty.slice(0, count);
    }

    return filtered.slice(0, count);
  }

  /**
   * 映射 AMAS 难度级别到数值范围
   */
  private mapDifficultyLevel(level: 'easy' | 'mid' | 'hard'): DifficultyRange {
    switch (level) {
      case 'easy': return { min: 0, max: 0.4 };
      case 'mid': return { min: 0.2, max: 0.7 };
      case 'hard': return { min: 0.5, max: 1.0 };
      default: return { min: 0.2, max: 0.7 };
    }
  }

  /**
   * 根据得分计算单词难度
   */
  private computeWordDifficultyFromScore(
    score: { totalScore: number; correctAttempts: number; totalAttempts: number } | undefined,
    errorRate: number
  ): number {
    if (!score) return 0.5;
    // 错误率高 + 得分低 = 难度高
    const scoreFactor = (100 - score.totalScore) / 100;
    return Math.min(1, Math.max(0, errorRate * 0.6 + scoreFactor * 0.4));
  }

  /**
   * 计算新词难度（基于词长和词频）
   */
  private computeNewWordDifficulty(word: { spelling: string; meanings: string[] }): number {
    // 简单的难度估算：词长越长越难，释义越多可能越复杂
    const lengthFactor = Math.min(1, word.spelling.length / 15);
    const meaningFactor = Math.min(1, word.meanings.length / 5);
    return lengthFactor * 0.6 + meaningFactor * 0.4;
  }

  /**
   * 生成选词说明
   */
  private explainWordSelection(strategy: StrategyParams, words: WordWithDifficulty[]): string {
    const reviewCount = words.filter(w => !w.isNew).length;
    const newCount = words.filter(w => w.isNew).length;

    const difficultyText = {
      'easy': '简单',
      'mid': '中等',
      'hard': '较难'
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
   * 补充额外单词
   * 从词书中获取未学习过的单词
   */
  private async fetchAdditionalWords(
    userId: string,
    count: number,
    excludeWordIds: string[]
  ) {
    const config = await studyConfigService.getUserStudyConfig(userId);

    if (config.selectedWordBookIds.length === 0) {
      return [];
    }

    // 获取未学习过的单词
    if (config.studyMode === 'sequential') {
      // 顺序模式：按创建时间排序
      const additionalWords = await prisma.word.findMany({
        where: {
          wordBookId: { in: config.selectedWordBookIds },
          id: { notIn: excludeWordIds },
          learningStates: {
            none: { userId }  // 从未学习过的单词
          }
        },
        take: count,
        orderBy: { createdAt: 'asc' }
      });
      logger.debug(`[MasteryLearning] 补充了${additionalWords.length}个新词（顺序模式）`);
      return additionalWords;
    } else {
      // 随机模式：获取更多单词后随机选取
      // 使用 PostgreSQL 原生随机排序，保证真正随机
      const additionalWords = await prisma.$queryRaw<Array<{
        id: string;
        spelling: string;
        phonetic: string;
        meanings: string[];
        examples: string[];
        audioUrl: string | null;
        wordBookId: string;
        createdAt: Date;
        updatedAt: Date;
      }>>`
        SELECT w.* FROM "words" w
        WHERE w."wordBookId" = ANY(${config.selectedWordBookIds})
          AND w.id NOT IN (SELECT unnest(${excludeWordIds}::text[]))
          AND NOT EXISTS (
            SELECT 1 FROM "word_learning_states" ls
            WHERE ls."wordId" = w.id AND ls."userId" = ${userId}
          )
        ORDER BY RANDOM()
        LIMIT ${count}
      `;
      logger.debug(`[MasteryLearning] 补充了${additionalWords.length}个新词（随机模式）`);
      return additionalWords;
    }
  }

  /**
   * 同步学习会话进度
   *
   * @param sessionId 会话ID
   * @param userId 用户ID
   * @param progress 进度数据
   */
  async syncSessionProgress(
    sessionId: string,
    userId: string,
    progress: {
      actualMasteryCount: number;
      totalQuestions: number;
    }
  ) {
    logger.debug(
      `[MasteryLearning] 同步会话进度: sessionId=${sessionId}, ` +
      `mastered=${progress.actualMasteryCount}, questions=${progress.totalQuestions}`
    );

    try {
      await prisma.learningSession.updateMany({
        where: {
          id: sessionId,
          userId
        },
        data: {
          actualMasteryCount: progress.actualMasteryCount,
          totalQuestions: progress.totalQuestions
        }
      });

      logger.debug(`[MasteryLearning] 会话进度同步成功: sessionId=${sessionId}`);
    } catch (error) {
      logger.error({ err: error, sessionId }, '[MasteryLearning] 会话进度同步失败');
      throw error;
    }
  }

  /**
   * 创建或获取学习会话
   *
   * @param sessionId 会话ID(可选)
   * @param userId 用户ID
   * @param targetMasteryCount 目标掌握数
   * @returns 会话ID
   */
  async ensureLearningSession(
    userId: string,
    targetMasteryCount: number,
    sessionId?: string
  ): Promise<string> {
    // 服务层双重校验
    if (targetMasteryCount <= 0 || targetMasteryCount > 100) {
      throw new Error(`Invalid targetMasteryCount: ${targetMasteryCount}, must be 1-100`);
    }

    if (sessionId) {
      // 先检查会话是否存在
      const existing = await prisma.learningSession.findUnique({
        where: { id: sessionId }
      });

      if (existing) {
        // 会话存在,验证归属
        if (existing.userId !== userId) {
          throw new Error(`Session ${sessionId} belongs to another user`);
        }

        // 会话属于当前用户,更新目标数
        await prisma.learningSession.update({
          where: { id: sessionId },
          data: { targetMasteryCount }
        });

        return sessionId;
      }
      // 会话不存在,忽略客户端提供的ID,创建新会话
    }

    // 创建新会话
    const session = await prisma.learningSession.create({
      data: {
        userId,
        targetMasteryCount,
        actualMasteryCount: 0,
        totalQuestions: 0
      }
    });

    logger.debug(
      `[MasteryLearning] 创建新会话: sessionId=${session.id}, ` +
      `target=${targetMasteryCount}`
    );

    return session.id;
  }

  /**
   * 获取会话进度
   *
   * @param sessionId 会话ID
   * @param userId 用户ID（用于权限校验）
   * @returns 会话进度
   */
  async getSessionProgress(sessionId: string, userId: string) {
    const session = await prisma.learningSession.findFirst({
      where: {
        id: sessionId,
        userId: userId
      },
      select: {
        targetMasteryCount: true,
        actualMasteryCount: true,
        totalQuestions: true,
        startedAt: true,
        endedAt: true
      }
    });

    if (!session) {
      throw new Error(`Session not found or access denied: ${sessionId}`);
    }

    return {
      targetMasteryCount: session.targetMasteryCount ?? 0,
      actualMasteryCount: session.actualMasteryCount ?? 0,
      totalQuestions: session.totalQuestions ?? 0,
      isCompleted: (session.actualMasteryCount ?? 0) >= (session.targetMasteryCount ?? 0),
      startedAt: session.startedAt,
      endedAt: session.endedAt
    };
  }

  // ========== 队列动态调整方法 ==========

  /**
   * 根据用户状态动态调整学习队列
   */
  async adjustWordsForUser(req: AdjustWordsRequest): Promise<AdjustWordsResponse> {
    const adjustStarted = process.hrtime.bigint();

    const {
      userId,
      sessionId,
      currentWordIds,
      masteredWordIds,
      userState,
      recentPerformance,
      adjustReason
    } = req;

    logger.debug(
      `[MasteryLearning] 调整队列: userId=${userId}, sessionId=${sessionId}, ` +
      `reason=${adjustReason}, currentWords=${currentWordIds.length}`
    );

    // 1. 计算目标难度范围
    const targetDifficulty = this.computeTargetDifficulty(
      userState ?? { fatigue: 0, attention: 1, motivation: 0.6 },
      recentPerformance,
      adjustReason
    );

    const nextCheckIn = this.computeNextCheckIn(recentPerformance, userState);
    const triggerConditions = {
      performance: recentPerformance,
      userState: userState ?? null,
      targetDifficulty
    };

    logger.debug(
      `[MasteryLearning] 目标难度范围: [${targetDifficulty.min.toFixed(2)}, ${targetDifficulty.max.toFixed(2)}]`
    );

    // 2. 批量计算当前队列单词的难度
    const difficultyMap = await this.batchComputeDifficulty(userId, currentWordIds);

    // 3. 确定要移除的单词（已掌握或难度不在范围内）
    const remove = currentWordIds.filter(id => {
      if (masteredWordIds.includes(id)) return true;
      const difficulty = difficultyMap[id] ?? 0.5;
      return difficulty > targetDifficulty.max || difficulty < targetDifficulty.min;
    });

    // 4. 获取候选新词
    const desiredAddCount = Math.max(remove.length, Math.ceil(currentWordIds.length * 0.3), 2);
    const excludeIds = [...new Set([...currentWordIds, ...masteredWordIds])];

    let candidates = await this.fetchWordsInDifficultyRange(
      userId,
      targetDifficulty,
      excludeIds,
      desiredAddCount
    );

    // 5. 降级处理：如果候选词不足，扩大难度范围
    if (candidates.length < desiredAddCount) {
      logger.debug(
        `[MasteryLearning] 候选词不足(${candidates.length}/${desiredAddCount})，扩大难度范围`
      );
      const expandedRange = { min: 0, max: 1 };
      candidates = await this.fetchWordsInDifficultyRange(
        userId,
        expandedRange,
        excludeIds,
        desiredAddCount
      );
    }

    const reasonText = this.getAdjustReasonText(adjustReason, userState, recentPerformance);

    logger.debug(
      `[MasteryLearning] 调整结果: remove=${remove.length}, add=${candidates.length}`
    );

    const elapsedSeconds = Number(process.hrtime.bigint() - adjustStarted) / 1e9;
    recordQueueAdjustmentDuration(elapsedSeconds);

    return {
      adjustments: {
        remove,
        add: candidates.map(w => ({
          id: w.id,
          spelling: w.spelling,
          phonetic: w.phonetic,
          meanings: w.meanings,
          examples: w.examples,
          audioUrl: w.audioUrl ?? undefined,
          isNew: w.isNew,
          difficulty: w.difficulty
        }))
      },
      targetDifficulty,
      reason: reasonText,
      adjustmentReason: adjustReason,
      triggerConditions,
      nextCheckIn
    };
  }

  /**
   * 计算目标难度区间
   */
  private computeTargetDifficulty(
    userState: { fatigue: number; attention: number; motivation: number },
    performance: { accuracy: number; avgResponseTime: number; consecutiveWrong: number },
    reason: AdjustWordsRequest['adjustReason']
  ): DifficultyRange {
    const { fatigue = 0, attention = 1, motivation = 0.5 } = userState ?? {};
    const { accuracy = 0.7, consecutiveWrong = 0 } = performance ?? {};

    // 按优先级检查条件
    if (fatigue > 0.7) {
      return { min: 0, max: 0.4 };
    }
    if (consecutiveWrong >= 3) {
      return { min: 0, max: 0.3 };
    }
    if (accuracy < 0.5 && (reason === 'struggling' || consecutiveWrong >= 2)) {
      return { min: 0.1, max: 0.5 };
    }
    if (attention < 0.5) {
      return { min: 0.2, max: 0.6 };
    }
    if (accuracy > 0.85 && motivation > 0.5) {
      return { min: 0.4, max: 0.9 };
    }
    return { min: 0.2, max: 0.7 };
  }

  /**
   * 计算下一次检查间隔（题数）
   */
  private computeNextCheckIn(
    performance: { accuracy: number; avgResponseTime: number; consecutiveWrong: number },
    userState?: { fatigue?: number; attention?: number; motivation?: number }
  ): number {
    if (performance.consecutiveWrong >= 2 || performance.accuracy < 0.4) {
      return 1;
    }
    if (userState && (userState.fatigue ?? 0) > 0.6) {
      return 2;
    }
    if (userState && (userState.attention ?? 1) < 0.4) {
      return 2;
    }
    if (performance.accuracy > 0.9 && performance.avgResponseTime < 2000) {
      return 5;
    }
    return 3;
  }

  /**
   * 批量计算单词难度（整合四因子）
   * 公式: difficulty = 0.2 * lengthFactor + 0.4 * (1 - userAccuracy) + 0.2 * frequencyFactor + 0.2 * forgettingFactor
   */
  async batchComputeDifficulty(userId: string, wordIds: string[]): Promise<Record<string, number>> {
    if (wordIds.length === 0) return {};

    const started = process.hrtime.bigint();

    // 尝试从缓存获取
    const cached = await difficultyCacheService.getCachedBatch(userId, wordIds);
    const pendingIds = wordIds.filter(id => cached[id] === undefined);
    const cacheHits = wordIds.length - pendingIds.length;

    if (pendingIds.length === 0) {
      const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      recordDifficultyComputationTime(elapsedSeconds);
      logger.debug(
        `[MasteryLearning] batchComputeDifficulty cache-only total=${wordIds.length}, ` +
        `duration=${(elapsedSeconds * 1000).toFixed(1)}ms`
      );
      return cached;
    }

    const [words, scores, frequencies, learningStates] = await Promise.all([
      prisma.word.findMany({
        where: { id: { in: pendingIds } },
        select: { id: true, spelling: true }
      }),
      prisma.wordScore.findMany({
        where: { userId, wordId: { in: pendingIds } },
        select: { wordId: true, totalAttempts: true, correctAttempts: true }
      }),
      prisma.wordFrequency.findMany({
        where: { wordId: { in: pendingIds } },
        select: { wordId: true, frequencyScore: true }
      }),
      prisma.wordLearningState.findMany({
        where: { userId, wordId: { in: pendingIds } },
        select: { wordId: true, lastReviewDate: true, reviewCount: true }
      })
    ]);

    const scoreMap = new Map(scores.map(s => [s.wordId, s]));
    const freqMap = new Map(frequencies.map(f => [f.wordId, Number(f.frequencyScore)]));
    const stateMap = new Map(learningStates.map(ls => [ls.wordId, ls]));

    const computed: Record<string, number> = {};
    for (const word of words) {
      const score = scoreMap.get(word.id);
      const accuracy = score && score.totalAttempts > 0
        ? score.correctAttempts / score.totalAttempts
        : 0.5;

      const letterCount = (word.spelling || '').replace(/[^A-Za-z]/g, '').length;
      const lengthFactor = Math.min(1, Math.max(0, (letterCount - 3) / 12));

      const frequencyScore = freqMap.get(word.id) ?? 0.5;
      const frequencyFactor = Math.min(1, Math.max(0, 1 - frequencyScore));

      const state = stateMap.get(word.id);
      let forgettingFactor = 0.5;
      if (state?.lastReviewDate && state.reviewCount > 0) {
        const retention = calculateForgettingFactor({
          wordId: word.id,
          lastReviewTime: state.lastReviewDate,
          reviewCount: state.reviewCount,
          averageAccuracy: accuracy
        });
        forgettingFactor = Math.min(1, Math.max(0, 1 - retention));
      }

      const difficulty = Math.min(1, Math.max(0,
        0.2 * lengthFactor + 0.4 * (1 - accuracy) + 0.2 * frequencyFactor + 0.2 * forgettingFactor
      ));

      computed[word.id] = difficulty;
    }

    // 异步写入缓存（不阻塞）
    Promise.all(
      Object.entries(computed).map(([wordId, difficulty]) =>
        difficultyCacheService.setCached(wordId, userId, difficulty)
      )
    ).catch(err => logger.warn('[MasteryLearning] Cache write failed:', err.message));

    const finalResult = { ...cached, ...computed };
    const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    recordDifficultyComputationTime(elapsedSeconds);
    logger.debug(
      `[MasteryLearning] batchComputeDifficulty total=${wordIds.length}, ` +
      `cacheHits=${cacheHits}, computed=${pendingIds.length}, ` +
      `duration=${(elapsedSeconds * 1000).toFixed(1)}ms`
    );

    return finalResult;
  }

  /**
   * 获取指定难度区间的候选单词
   */
  private async fetchWordsInDifficultyRange(
    userId: string,
    range: DifficultyRange,
    excludeIds: string[],
    count: number
  ): Promise<WordWithDifficulty[]> {
    const config = await studyConfigService.getUserStudyConfig(userId);

    if (!config.selectedWordBookIds?.length) {
      return [];
    }

    const fetchLimit = Math.max(count * 3, 15);

    // 获取候选单词
    let candidateWords: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl: string | null;
    }>;

    if (config.studyMode === 'random') {
      candidateWords = await prisma.$queryRaw<typeof candidateWords>`
        SELECT w.id, w.spelling, w.phonetic, w.meanings, w.examples, w."audioUrl"
        FROM "words" w
        WHERE w."wordBookId" = ANY(${config.selectedWordBookIds})
          AND w.id NOT IN (SELECT unnest(${excludeIds}::text[]))
        ORDER BY RANDOM()
        LIMIT ${fetchLimit}
      `;
    } else {
      candidateWords = await prisma.word.findMany({
        where: {
          wordBookId: { in: config.selectedWordBookIds },
          id: { notIn: excludeIds }
        },
        select: {
          id: true, spelling: true, phonetic: true,
          meanings: true, examples: true, audioUrl: true
        },
        take: fetchLimit,
        orderBy: { createdAt: 'asc' }
      });
    }

    if (candidateWords.length === 0) return [];

    // 查询学习状态，判断是否新词
    const candidateIds = candidateWords.map(w => w.id);
    const learnedStates = await prisma.wordLearningState.findMany({
      where: { userId, wordId: { in: candidateIds } },
      select: { wordId: true }
    });
    const learnedSet = new Set(learnedStates.map(s => s.wordId));

    // 计算难度
    const difficulties = await this.batchComputeDifficulty(userId, candidateIds);

    // 过滤出符合难度范围的单词
    return candidateWords
      .map(word => ({
        ...word,
        difficulty: difficulties[word.id] ?? 0.5,
        isNew: !learnedSet.has(word.id)
      }))
      .filter(w => w.difficulty >= range.min && w.difficulty <= range.max)
      .slice(0, count);
  }

  /**
   * 生成调整原因描述
   */
  private getAdjustReasonText(
    reason: AdjustWordsRequest['adjustReason'],
    userState?: { fatigue: number; attention: number; motivation: number },
    performance?: { accuracy: number; consecutiveWrong: number }
  ): string {
    switch (reason) {
      case 'fatigue':
        return `检测到疲劳度较高(${((userState?.fatigue ?? 0) * 100).toFixed(0)}%)，已切换为简单词汇`;
      case 'struggling':
        return `连续${performance?.consecutiveWrong ?? 0}次错误，已降低难度`;
      case 'excelling':
        return `表现优秀(正确率${((performance?.accuracy ?? 0) * 100).toFixed(0)}%)，已提升难度`;
      case 'periodic':
      default:
        return '定期调整学习队列';
    }
  }
}

// 导出单例
export const masteryLearningService = new MasteryLearningService();
