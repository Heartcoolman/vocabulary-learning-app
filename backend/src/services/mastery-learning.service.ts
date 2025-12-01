/**
 * 掌握度学习服务
 * Mastery-Based Learning Service
 */

import prisma from '../config/database';
import studyConfigService from './study-config.service';

class MasteryLearningService {
  /**
   * 获取掌握模式的学习单词
   * 返回目标数量的2倍,留有余量
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

    // 获取2倍数量的单词(留有冗余)
    const fetchCount = Math.max(target, 1) * 2;

    console.log(
      `[MasteryLearning] 获取掌握模式单词: userId=${userId}, ` +
      `target=${target}, fetchCount=${fetchCount}`
    );

    // 复用现有的getTodayWords逻辑获取单词
    // 但需要扩展数量
    const todayWords = await studyConfigService.getTodayWords(userId);

    // 如果单词数量不够,需要额外获取
    if (todayWords.words.length < fetchCount) {
      console.log(
        `[MasteryLearning] 当前单词数${todayWords.words.length}不足${fetchCount}, ` +
        `需要补充新词`
      );

      // 获取额外的新词
      const additionalWords = await this.fetchAdditionalWords(
        userId,
        fetchCount - todayWords.words.length,
        todayWords.words.map(w => w.id)
      );

      // 补充的单词都是新词，添加 isNew 标记
      const additionalWordsWithFlag = additionalWords.map(w => ({
        ...w,
        isNew: true
      }));
      todayWords.words.push(...additionalWordsWithFlag);
    }

    // 限制到fetchCount数量
    const words = todayWords.words.slice(0, fetchCount);

    return {
      words,
      meta: {
        mode: 'mastery',
        targetCount: target,
        fetchCount: words.length,
        masteryThreshold: 2,  // 默认连续2次正确(实际由AMAS决定)
        maxQuestions: 100     // 单次会话最大题数
      }
    };
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
      console.log(`[MasteryLearning] 补充了${additionalWords.length}个新词（顺序模式）`);
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
        SELECT w.* FROM "Word" w
        WHERE w."wordBookId" = ANY(${config.selectedWordBookIds})
          AND w.id NOT IN (SELECT unnest(${excludeWordIds}::text[]))
          AND NOT EXISTS (
            SELECT 1 FROM "LearningState" ls
            WHERE ls."wordId" = w.id AND ls."userId" = ${userId}
          )
        ORDER BY RANDOM()
        LIMIT ${count}
      `;
      console.log(`[MasteryLearning] 补充了${additionalWords.length}个新词（随机模式）`);
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
    console.log(
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

      console.log(`[MasteryLearning] 会话进度同步成功: sessionId=${sessionId}`);
    } catch (error) {
      console.error(
        `[MasteryLearning] 会话进度同步失败: sessionId=${sessionId}`,
        error
      );
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

    console.log(
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
}

// 导出单例
export const masteryLearningService = new MasteryLearningService();
