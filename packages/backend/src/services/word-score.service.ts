/**
 * 单词得分服务
 * 管理单词的综合得分，支持缓存和批量操作
 */

import { WordScore, Prisma, WordBookType } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';


export class WordScoreService {
  // 空值标记，用于缓存穿透防护
  private static readonly NULL_MARKER = '__NULL__';

  /**
   * Compute a lightweight score used by unit tests.
   */
  async calculateScore(
    userId: string,
    wordId: string
  ): Promise<{ userId: string; wordId: string; score: number }> {
    const records = await prisma.answerRecord.findMany({
      where: { userId, wordId }
    });

    if (records.length === 0) {
      return { userId, wordId, score: 0 };
    }

    const correct = records.filter((r: any) => r.isCorrect).length;
    const accuracy = correct / records.length;
    const avgTime =
      records.reduce((sum: number, r: any) => sum + (r.responseTime ?? 0), 0) /
      Math.max(records.length, 1);
    const timeScore = Math.max(0, Math.min(1, 1 - avgTime / 5000));
    const score = Math.max(0, Math.min(1, 0.7 * accuracy + 0.3 * timeScore));

    return { userId, wordId, score };
  }

  /**
   * Fetch multiple scores at once.
   */
  async getWordScores(
    userId: string,
    wordIds: string[]
  ): Promise<Array<{ userId: string; wordId: string; score?: number }>> {
    if (!wordIds?.length) return [];
    return prisma.wordScore.findMany({
      where: { userId, wordId: { in: wordIds } }
    });
  }

  /**
   * Update a single word score after a review.
   */
  async updateScore(
    userId: string,
    wordId: string,
    _result: { isCorrect: boolean; responseTime?: number }
  ): Promise<any> {
    const { score } = await this.calculateScore(userId, wordId);
    const payload = { userId, wordId, score, totalScore: score } as any;

    return prisma.wordScore.upsert({
      where: { unique_user_word_score: { userId, wordId } },
      create: payload,
      update: payload
    });
  }

  /**
   * 获取单词得分（带缓存）
   * 修复问题: 添加空值缓存防止缓存穿透
   */
  async getWordScore(userId: string, wordId: string): Promise<WordScore | null> {
    const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordScore | typeof WordScoreService.NULL_MARKER>(cacheKey);
    if (cached !== null) {
      // 如果是空值标记，返回null
      if (cached === WordScoreService.NULL_MARKER) {
        return null;
      }
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

    // 存入缓存（包括空值）
    if (score) {
      cacheService.set(cacheKey, score, CacheTTL.WORD_SCORE);
    } else {
      // 缓存空值，使用较短的TTL防止数据长期不一致
      cacheService.set(cacheKey, WordScoreService.NULL_MARKER, CacheTTL.NULL_CACHE);
    }

    return score;
  }

  /**
   * 批量获取单词得分（带缓存）
   * 修复: 正确处理空值标记，与getWordScore方法保持一致
   */
  async batchGetWordScores(userId: string, wordIds: string[]): Promise<Map<string, WordScore>> {
    const result = new Map<string, WordScore>();
    const uncachedWordIds: string[] = [];
    const nullCachedWordIds: string[] = []; // 已知为空的单词ID（命中空值缓存）

    // 先从缓存获取
    for (const wordId of wordIds) {
      const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);
      const cached = cacheService.get<WordScore | typeof WordScoreService.NULL_MARKER>(cacheKey);

      if (cached !== null) {
        // 检查是否为空值标记
        if (cached === WordScoreService.NULL_MARKER) {
          // 空值缓存命中，不需要查询数据库，也不添加到结果
          nullCachedWordIds.push(wordId);
        } else {
          result.set(wordId, cached);
        }
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

      // 构建查询结果的wordId集合
      const foundWordIds = new Set(scores.map(s => s.wordId));

      // 存入缓存和结果
      for (const score of scores) {
        const cacheKey = CacheKeys.WORD_SCORE(userId, score.wordId);
        cacheService.set(cacheKey, score, CacheTTL.WORD_SCORE);
        result.set(score.wordId, score);
      }

      // 为未找到的单词缓存空值标记，防止缓存穿透
      for (const wordId of uncachedWordIds) {
        if (!foundWordIds.has(wordId)) {
          const cacheKey = CacheKeys.WORD_SCORE(userId, wordId);
          cacheService.set(cacheKey, WordScoreService.NULL_MARKER, CacheTTL.NULL_CACHE);
        }
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
    const wordIds = [...new Set(updates.map(u => u.wordId))];

    // 批量验证权限（单次查询替代N次查询）
    const accessibleIds = await this.getAccessibleWordIds(userId, wordIds);

    const inaccessibleWords = wordIds.filter(id => !accessibleIds.has(id));
    if (inaccessibleWords.length > 0) {
      throw new Error(`无权访问以下单词: ${inaccessibleWords.join(', ')}`);
    }

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
   * 批量检查用户可访问的单词ID（用于解决N+1查询问题）
   */
  private async getAccessibleWordIds(userId: string, wordIds: string[]): Promise<Set<string>> {
    const words = await prisma.word.findMany({
      where: {
        id: { in: wordIds },
        wordBook: {
          OR: [
            { type: 'SYSTEM' },
            { userId: userId }
          ]
        }
      },
      select: { id: true }
    });
    return new Set(words.map(w => w.id));
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
export default wordScoreService;
