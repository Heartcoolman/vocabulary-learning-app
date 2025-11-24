/**
 * 单词得分服务
 * 管理单词的综合得分，支持缓存和批量操作
 */

import { WordScore, Prisma, WordBookType } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';


export class WordScoreService {
  /**
   * 获取单词得分（带缓存）
   */
  async getWordScore(userId: string, wordId: string): Promise<WordScore | null> {
    const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordScore>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const score = await prisma.wordScore.findUnique({
      where: {
        unique_user_word_score: {
          userId,
          wordId
        }
      }
    });

    // 存入缓存
    if (score) {
      cacheService.set(cacheKey, score, CacheTTL.WORD_SCORE);
    }

    return score;
  }

  /**
   * 批量获取单词得分（带缓存）
   */
  async batchGetWordScores(userId: string, wordIds: string[]): Promise<Map<string, WordScore>> {
    const result = new Map<string, WordScore>();
    const uncachedWordIds: string[] = [];

    // 先从缓存获取
    for (const wordId of wordIds) {
      const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);
      const cached = cacheService.get<WordScore>(cacheKey);

      if (cached) {
        result.set(wordId, cached);
      } else {
        uncachedWordIds.push(wordId);
      }
    }

    // 批量查询未缓存的数据
    if (uncachedWordIds.length > 0) {
      const scores = await prisma.wordScore.findMany({
        where: {
          userId,
          wordId: { in: uncachedWordIds }
        }
      });

      // 存入缓存和结果
      for (const score of scores) {
        const cacheKey = CacheKeys.WORD_SCORE(userId, score.wordId);
        cacheService.set(cacheKey, score, CacheTTL.WORD_SCORE);
        result.set(score.wordId, score);
      }
    }

    return result;
  }

  /**
   * 获取用户所有单词得分（带缓存）
   */
  async getUserWordScores(userId: string): Promise<WordScore[]> {
    const cacheKey = CacheKeys.WORD_SCORES(userId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordScore[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const scores = await prisma.wordScore.findMany({
      where: { userId },
      orderBy: { totalScore: 'desc' }
    });

    // 存入缓存
    cacheService.set(cacheKey, scores, CacheTTL.WORD_SCORE);

    return scores;
  }

  /**
   * 获取低分单词（需要重点学习）
   */
  async getLowScoreWords(userId: string, threshold: number = 40): Promise<WordScore[]> {
    return await prisma.wordScore.findMany({
      where: {
        userId,
        totalScore: {
          lt: threshold
        }
      },
      orderBy: { totalScore: 'asc' }
    });
  }

  /**
   * 获取高分单词（已熟练掌握）
   */
  async getHighScoreWords(userId: string, threshold: number = 80): Promise<WordScore[]> {
    return await prisma.wordScore.findMany({
      where: {
        userId,
        totalScore: {
          gt: threshold
        }
      },
      orderBy: { totalScore: 'desc' }
    });
  }

  /**
   * 获取指定得分范围内的单词得分
   */
  async getWordsByScoreRange(
    userId: string,
    minScore: number,
    maxScore: number
  ): Promise<WordScore[]> {
    return await prisma.wordScore.findMany({
      where: {
        userId,
        totalScore: {
          gte: minScore,
          lte: maxScore
        }
      },
      orderBy: { totalScore: 'desc' }
    });
  }

  /**
   * 创建或更新单词得分
   */
  async upsertWordScore(
    userId: string,
    wordId: string,
    data: Partial<WordScore>
  ): Promise<WordScore> {
    await this.assertWordAccessible(userId, wordId);

    // 过滤掉userId和wordId，防止被data覆盖
    const { userId: _, wordId: __, ...safeData } = data as any;

    const score = await prisma.wordScore.upsert({
      where: {
        unique_user_word_score: {
          userId,
          wordId
        }
      },
      create: {
        userId,
        wordId,
        ...safeData
      } as any,
      update: safeData
    });

    // 清除相关缓存
    this.invalidateUserCache(userId, wordId);

    return score;
  }

  /**
   * 批量更新单词得分
   */
  async batchUpdateWordScores(
    userId: string,
    updates: Array<{ wordId: string; data: Partial<WordScore> }>
  ): Promise<void> {
    // 先验证所有单词的访问权限
    await Promise.all(updates.map(({ wordId }) => this.assertWordAccessible(userId, wordId)));

    // 使用事务批量更新
    await prisma.$transaction(
      updates.map(({ wordId, data }) => {
        // 过滤掉userId和wordId，防止被data覆盖
        const { userId: _, wordId: __, ...safeData } = data as any;

        return prisma.wordScore.upsert({
          where: {
            unique_user_word_score: {
              userId,
              wordId
            }
          },
          create: {
            userId,
            wordId,
            ...safeData
          } as any,
          update: safeData
        });
      })
    );

    // 清除用户缓存
    this.invalidateUserCache(userId);
  }

  /**
   * 删除单词得分
   */
  async deleteWordScore(userId: string, wordId: string): Promise<void> {
    await prisma.wordScore.delete({
      where: {
        unique_user_word_score: {
          userId,
          wordId
        }
      }
    });

    // 清除缓存
    this.invalidateUserCache(userId, wordId);
  }

  /**
   * 获取用户得分统计
   */
  async getUserScoreStats(userId: string) {
    const scores = await this.getUserWordScores(userId);

    if (scores.length === 0) {
      return {
        averageScore: 0,
        highScoreCount: 0,
        mediumScoreCount: 0,
        lowScoreCount: 0
      };
    }

    const totalScore = scores.reduce((sum, s) => sum + s.totalScore, 0);
    const averageScore = totalScore / scores.length;

    const highScoreCount = scores.filter(s => s.totalScore > 80).length;
    const mediumScoreCount = scores.filter(s => s.totalScore >= 40 && s.totalScore <= 80).length;
    const lowScoreCount = scores.filter(s => s.totalScore < 40).length;

    return {
      averageScore,
      highScoreCount,
      mediumScoreCount,
      lowScoreCount
    };
  }

  /**
   * 清除用户缓存
   */
  private invalidateUserCache(userId: string, wordId?: string): void {
    if (wordId) {
      const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);
      cacheService.delete(cacheKey);
    }

    // 清除用户相关的所有缓存
    cacheService.delete(CacheKeys.WORD_SCORES(userId));
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    cacheService.deletePattern('word_score*');
  }

  /**
   * 验证用户是否有权访问该单词
   */
  private async assertWordAccessible(userId: string, wordId: string): Promise<void> {
    const word = await prisma.word.findUnique({
      where: { id: wordId },
      select: {
        wordBook: { select: { type: true, userId: true } }
      }
    });

    if (!word?.wordBook) {
      throw new Error('单词不存在');
    }

    if (word.wordBook.type === WordBookType.USER && word.wordBook.userId !== userId) {
      throw new Error('无权访问该单词');
    }
  }
}

export const wordScoreService = new WordScoreService();
