import prisma from '../config/database';
import { StudyConfigDto } from '../types';
import { amasService } from './amas.service';
import type { DifficultyLevel } from '../amas/types';

export class StudyConfigService {
  // ==================== AMAS 策略辅助方法 ====================

  /**
   * 映射 AMAS 难度级别到数值范围
   */
  private mapDifficultyLevel(level: DifficultyLevel): { min: number; max: number } {
    switch (level) {
      case 'easy':
        return { min: 0, max: 0.4 };
      case 'mid':
        return { min: 0.2, max: 0.7 };
      case 'hard':
        return { min: 0.5, max: 1.0 };
      default:
        return { min: 0.2, max: 0.7 }; // 默认中等难度
    }
  }

  /**
   * 计算新词难度（基于词长和释义数）
   */
  private computeNewWordDifficulty(word: { spelling: string; meanings: string[] }): number {
    const lengthFactor = Math.min(1, word.spelling.length / 15);
    const meaningFactor = Math.min(1, word.meanings.length / 5);
    return lengthFactor * 0.6 + meaningFactor * 0.4;
  }

  /**
   * 根据得分计算学习词难度
   * 修复：无得分时使用较低默认值（0.3），避免被 easy 策略过滤
   */
  private computeWordDifficultyFromScore(
    score: { totalScore: number; correctAttempts: number; totalAttempts: number } | undefined,
    errorRate: number,
  ): number {
    // 无得分时返回较低难度（0.3），确保在 easy 范围内（0-0.4）
    if (!score || score.totalAttempts === 0) return 0.3;
    const scoreFactor = (100 - score.totalScore) / 100;
    return Math.min(1, Math.max(0, errorRate * 0.6 + scoreFactor * 0.4));
  }

  /**
   * 计算难度与目标范围中心的距离
   * 用于降级补充时按距离排序
   */
  private computeDifficultyDistance(
    difficulty: number,
    range: { min: number; max: number },
  ): number {
    const center = (range.min + range.max) / 2;
    return Math.abs(difficulty - center);
  }
  /**
   * 获取用户学习配置
   */
  async getUserStudyConfig(userId: string) {
    let config = await prisma.userStudyConfig.findUnique({
      where: { userId },
    });

    // 如果不存在，创建默认配置
    if (!config) {
      config = await prisma.userStudyConfig.create({
        data: {
          userId,
          selectedWordBookIds: [],
          dailyWordCount: 20,
          studyMode: 'sequential',
        },
      });
    }

    return config;
  }

  /**
   * 更新学习配置
   */
  async updateStudyConfig(userId: string, data: StudyConfigDto) {
    // 安全校验：验证所有选中的词书是否为当前用户可访问的（系统词书或用户自己的）
    if (data.selectedWordBookIds.length > 0) {
      const accessibleWordBooks = await prisma.wordBook.findMany({
        where: {
          id: { in: data.selectedWordBookIds },
          OR: [{ type: 'SYSTEM' }, { type: 'USER', userId: userId }],
        },
        select: { id: true },
      });

      const accessibleIds = new Set(accessibleWordBooks.map((wb) => wb.id));
      const unauthorizedIds = data.selectedWordBookIds.filter((id) => !accessibleIds.has(id));

      if (unauthorizedIds.length > 0) {
        throw new Error(`无权访问以下词书: ${unauthorizedIds.join(', ')}`);
      }
    }

    return await prisma.userStudyConfig.upsert({
      where: { userId },
      update: {
        selectedWordBookIds: data.selectedWordBookIds,
        dailyWordCount: data.dailyWordCount,
        studyMode: data.studyMode || 'sequential',
      },
      create: {
        userId,
        selectedWordBookIds: data.selectedWordBookIds,
        dailyWordCount: data.dailyWordCount,
        studyMode: data.studyMode || 'sequential',
      },
    });
  }

  /**
   * 获取今日学习单词列表
   * 集成 AMAS 策略：使用 difficulty 过滤难度，使用 new_ratio 控制新词比例
   */
  async getTodayWords(userId: string) {
    // 获取用户配置
    const config = await this.getUserStudyConfig(userId);

    // 获取 AMAS 策略（无策略时使用默认策略）
    const strategy =
      (await amasService.getCurrentStrategy(userId)) ?? amasService.getDefaultStrategy();
    const difficultyRange = this.mapDifficultyLevel(strategy.difficulty);

    if (config.selectedWordBookIds.length === 0) {
      return {
        words: [],
        progress: {
          todayStudied: 0,
          todayTarget: config.dailyWordCount,
          totalStudied: 0,
          correctRate: 0,
        },
        strategy: {
          difficulty: strategy.difficulty,
          newRatio: strategy.new_ratio,
        },
      };
    }

    // 安全校验：再次验证词书权限（防止配置被篡改）
    const accessibleWordBooks = await prisma.wordBook.findMany({
      where: {
        id: { in: config.selectedWordBookIds },
        OR: [{ type: 'SYSTEM' }, { type: 'USER', userId: userId }],
      },
      select: { id: true },
    });

    const accessibleIds = accessibleWordBooks.map((wb) => wb.id);

    if (accessibleIds.length === 0) {
      return {
        words: [],
        progress: {
          todayStudied: 0,
          todayTarget: config.dailyWordCount,
          totalStudied: 0,
          correctRate: 0,
        },
        strategy: {
          difficulty: strategy.difficulty,
          newRatio: strategy.new_ratio,
        },
      };
    }

    // 获取用户所有已有学习状态的单词ID（用于排除）
    const allLearnedStates = await prisma.wordLearningState.findMany({
      where: {
        userId,
        word: { wordBookId: { in: accessibleIds } },
      },
      include: { word: true },
    });
    const learnedWordIds = allLearnedStates.map((s) => s.wordId);

    // 获取所有单词的得分信息
    const wordScores = await prisma.wordScore.findMany({
      where: {
        userId,
        wordId: { in: learnedWordIds },
      },
    });
    const scoreMap = new Map(wordScores.map((s) => [s.wordId, s]));

    // 1. 获取到期需要复习的单词（带优先级和难度计算）
    // 修复：纳入已学习过的NEW状态单词（reviewCount > 0 表示已经学习过）
    const now = new Date();
    const allDueStates = allLearnedStates
      .filter(
        (s) =>
          s.nextReviewDate &&
          s.nextReviewDate <= now &&
          (['LEARNING', 'REVIEWING'].includes(s.state) || (s.state === 'NEW' && s.reviewCount > 0)),
      )
      .map((state) => {
        const score = scoreMap.get(state.wordId);
        const overdueDays =
          (now.getTime() - state.nextReviewDate!.getTime()) / (24 * 60 * 60 * 1000);
        const errorRate =
          score && score.totalAttempts > 0 ? 1 - score.correctAttempts / score.totalAttempts : 0;

        // 计算优先级：逾期时间 + 错误率 + 低分
        let priority = 0;
        priority += Math.min(40, overdueDays * 5); // 逾期越久优先级越高
        priority += errorRate > 0.5 ? 30 : errorRate * 60; // 错误率高优先
        priority += score ? (100 - score.totalScore) * 0.3 : 30; // 得分低优先

        // 【AMAS】计算单词难度
        const difficulty = this.computeWordDifficultyFromScore(score, errorRate);

        return { state, word: state.word, priority, difficulty };
      })
      .sort((a, b) => b.priority - a.priority); // 优先级高的排前面

    // 【AMAS】按难度范围过滤复习词
    const filteredDueStates = allDueStates.filter(
      (d) => d.difficulty >= difficultyRange.min && d.difficulty <= difficultyRange.max,
    );

    // 2. 补充新词（使用 AMAS 策略的 new_ratio）
    let newWords: any[] = [];

    // 【AMAS】使用 new_ratio 计算新词/复习词目标数量
    const targetReviewCount = Math.ceil(config.dailyWordCount * (1 - strategy.new_ratio));
    const targetNewCount = config.dailyWordCount - targetReviewCount;

    // 【修复】复习词降级补充：如果难度过滤后不足，按优先级回填区间外的复习词
    let dueStates = filteredDueStates;
    if (filteredDueStates.length < targetReviewCount) {
      const filteredIds = new Set(filteredDueStates.map((d) => d.word.id));
      // 区间外的复习词按难度距离排序，优先选择更接近目标范围的
      const remainingDue = allDueStates
        .filter((d) => !filteredIds.has(d.word.id))
        .sort((a, b) => {
          const distA = this.computeDifficultyDistance(a.difficulty, difficultyRange);
          const distB = this.computeDifficultyDistance(b.difficulty, difficultyRange);
          // 距离相同时按优先级排序
          return distA !== distB ? distA - distB : b.priority - a.priority;
        });
      const needed = targetReviewCount - filteredDueStates.length;
      dueStates = [...filteredDueStates, ...remainingDue.slice(0, needed)];
    }

    // 实际可用的复习词数量
    const actualReviewCount = Math.min(dueStates.length, targetReviewCount);
    // 实际需要的新词数量（复习词不足时用新词补充）
    const actualNewCount = Math.max(targetNewCount, config.dailyWordCount - actualReviewCount);

    if (actualNewCount > 0) {
      // 获取更多候选新词用于难度筛选
      const candidateCount = actualNewCount * 2;

      let candidateNewWords: Array<{
        id: string;
        spelling: string;
        phonetic: string;
        meanings: string[];
        examples: string[];
        audioUrl: string | null;
        wordBookId: string;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      if (config.studyMode === 'random') {
        // 随机模式：使用 PostgreSQL 原生随机排序
        candidateNewWords = await prisma.$queryRaw<typeof candidateNewWords>`
                    SELECT * FROM "words"
                    WHERE "wordBookId" = ANY(${accessibleIds})
                      AND id NOT IN (SELECT unnest(${learnedWordIds}::text[]))
                    ORDER BY RANDOM()
                    LIMIT ${candidateCount}
                `;
      } else {
        // 顺序模式：按创建时间排序
        candidateNewWords = await prisma.word.findMany({
          where: {
            wordBookId: { in: accessibleIds },
            id: { notIn: learnedWordIds },
          },
          orderBy: { createdAt: 'asc' },
          take: candidateCount,
        });
      }

      // 【AMAS】计算难度并筛选
      const wordsWithDifficulty = candidateNewWords.map((w) => ({
        ...w,
        difficulty: this.computeNewWordDifficulty(w),
      }));

      // 按难度范围筛选
      const filteredNewWords = wordsWithDifficulty.filter(
        (w) => w.difficulty >= difficultyRange.min && w.difficulty <= difficultyRange.max,
      );

      // 如果筛选后不足，用其他单词补充（降级处理）
      // 【修复】按难度距离排序，优先选择更接近目标范围的单词
      if (filteredNewWords.length < actualNewCount) {
        const filteredIds = new Set(filteredNewWords.map((w) => w.id));
        const remaining = wordsWithDifficulty
          .filter((w) => !filteredIds.has(w.id))
          .sort((a, b) => {
            const distA = this.computeDifficultyDistance(a.difficulty, difficultyRange);
            const distB = this.computeDifficultyDistance(b.difficulty, difficultyRange);
            return distA - distB; // 距离越小越优先
          });
        newWords = [
          ...filteredNewWords,
          ...remaining.slice(0, actualNewCount - filteredNewWords.length),
        ];
      } else {
        newWords = filteredNewWords.slice(0, actualNewCount);
      }
    }

    // 3. 合并：到期复习词 + 新词，并添加 isNew 标记
    const dueWords = dueStates.slice(0, actualReviewCount).map((d) => ({
      ...d.word,
      isNew: false, // 复习词不是新词
    }));
    const newWordsWithFlag = newWords.map((w) => ({
      ...w,
      isNew: true, // 新词
    }));
    const words = [...dueWords, ...newWordsWithFlag];

    // 计算学习进度
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 今日已学习的单词数
    const todayRecords = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: {
        userId,
        timestamp: { gte: today },
        word: {
          wordBookId: { in: accessibleIds },
        },
      },
    });

    // 总学习单词数
    const totalStudiedRecords = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: {
        userId,
        word: {
          wordBookId: { in: accessibleIds },
        },
      },
    });

    // 总答题记录统计（计算正确率）- 优化为聚合查询
    const [totalCount, correctAnswerCount] = await Promise.all([
      prisma.answerRecord.count({
        where: { userId, word: { wordBookId: { in: accessibleIds } } },
      }),
      prisma.answerRecord.count({
        where: { userId, word: { wordBookId: { in: accessibleIds } }, isCorrect: true },
      }),
    ]);

    const correctRate = totalCount > 0 ? Math.round((correctAnswerCount / totalCount) * 100) : 0;

    return {
      words,
      progress: {
        todayStudied: todayRecords.length,
        todayTarget: config.dailyWordCount,
        totalStudied: totalStudiedRecords.length,
        correctRate,
      },
      // 【AMAS】返回当前使用的策略信息
      strategy: {
        difficulty: strategy.difficulty,
        newRatio: strategy.new_ratio,
      },
    };
  }

  /**
   * 获取学习进度
   */
  async getStudyProgress(userId: string) {
    const config = await this.getUserStudyConfig(userId);

    const emptyProgress = {
      todayStudied: 0,
      todayTarget: config.dailyWordCount,
      totalStudied: 0,
      correctRate: 0,
      weeklyTrend: [0, 0, 0, 0, 0, 0, 0],
    };

    if (config.selectedWordBookIds.length === 0) {
      return emptyProgress;
    }

    // 安全校验：验证词书权限
    const accessibleWordBooks = await prisma.wordBook.findMany({
      where: {
        id: { in: config.selectedWordBookIds },
        OR: [{ type: 'SYSTEM' }, { type: 'USER', userId: userId }],
      },
      select: { id: true },
    });

    const accessibleIds = accessibleWordBooks.map((wb) => wb.id);

    if (accessibleIds.length === 0) {
      return emptyProgress;
    }

    // 计算今日学习进度
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: {
        userId,
        timestamp: { gte: today },
        word: {
          wordBookId: { in: accessibleIds },
        },
      },
    });

    // 总学习单词数
    const totalStudiedRecords = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: {
        userId,
        word: {
          wordBookId: { in: accessibleIds },
        },
      },
    });

    // 总答题记录统计（计算正确率）- 优化为聚合查询
    const [totalRecordCount, correctRecordCount] = await Promise.all([
      prisma.answerRecord.count({
        where: { userId, word: { wordBookId: { in: accessibleIds } } },
      }),
      prisma.answerRecord.count({
        where: { userId, word: { wordBookId: { in: accessibleIds } }, isCorrect: true },
      }),
    ]);

    const correctRate =
      totalRecordCount > 0 ? Math.round((correctRecordCount / totalRecordCount) * 100) : 0;

    // 计算 7 日趋势数据
    const weeklyTrend = await this.getWeeklyTrend(userId, accessibleIds);

    return {
      todayStudied: todayRecords.length,
      todayTarget: config.dailyWordCount,
      totalStudied: totalStudiedRecords.length,
      correctRate,
      weeklyTrend,
    };
  }

  /**
   * 获取最近 7 天每日学习单词数
   * 优化：使用单次原生 SQL 聚合查询替代 7 次循环查询
   */
  private async getWeeklyTrend(userId: string, accessibleIds: string[]): Promise<number[]> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // 边界检查：无可访问词书时返回空趋势
    if (accessibleIds.length === 0) {
      return [0, 0, 0, 0, 0, 0, 0];
    }

    // 单次查询获取7天数据
    // 注意：PostgreSQL DATE() 返回的类型可能是 Date 或 string，需兼容处理
    const dailyCounts = await prisma.$queryRaw<Array<{ day: Date | string; count: bigint }>>`
            SELECT DATE("timestamp") as day, COUNT(DISTINCT "wordId") as count
            FROM "answer_records"
            WHERE "userId" = ${userId}
              AND "timestamp" >= ${weekStart}
              AND "wordId" IN (
                  SELECT id FROM "words" WHERE "wordBookId" = ANY(${accessibleIds})
              )
            GROUP BY DATE("timestamp")
            ORDER BY day ASC
        `;

    // 填充7天数据（无数据的天补0）
    const trend: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - i);
      const dateStr = targetDate.toISOString().split('T')[0];

      const found = dailyCounts.find((r) => {
        // 兼容 Date 或 string 类型
        const dayStr =
          r.day instanceof Date ? r.day.toISOString().split('T')[0] : String(r.day).split('T')[0];
        return dayStr === dateStr;
      });
      trend.push(found ? Number(found.count) : 0);
    }
    return trend;
  }
}

export default new StudyConfigService();
