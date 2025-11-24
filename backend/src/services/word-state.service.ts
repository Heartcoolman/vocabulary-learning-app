/**
 * 单词学习状态服务
 * 管理单词的学习状态，支持缓存和批量操作
 */

import { WordLearningState, WordState, Prisma, WordBookType } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';


export class WordStateService {
  /**
   * 获取单词学习状态（带缓存）
   */
  async getWordState(userId: string, wordId: string): Promise<WordLearningState | null> {
    const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordLearningState>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const state = await prisma.wordLearningState.findUnique({
      where: {
        unique_user_word: {
          userId,
          wordId
        }
      }
    });

    // 存入缓存
    if (state) {
      cacheService.set(cacheKey, state, CacheTTL.LEARNING_STATE);
    }

    return state;
  }

  /**
   * 批量获取单词学习状态（带缓存）
   */
  async batchGetWordStates(userId: string, wordIds: string[]): Promise<Map<string, WordLearningState>> {
    const result = new Map<string, WordLearningState>();
    const uncachedWordIds: string[] = [];

    // 先从缓存获取
    for (const wordId of wordIds) {
      const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);
      const cached = cacheService.get<WordLearningState>(cacheKey);

      if (cached) {
        result.set(wordId, cached);
      } else {
        uncachedWordIds.push(wordId);
      }
    }

    // 批量查询未缓存的数据
    if (uncachedWordIds.length > 0) {
      const states = await prisma.wordLearningState.findMany({
        where: {
          userId,
          wordId: { in: uncachedWordIds }
        }
      });

      // 存入缓存和结果
      for (const state of states) {
        const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, state.wordId);
        cacheService.set(cacheKey, state, CacheTTL.LEARNING_STATE);
        result.set(state.wordId, state);
      }
    }

    return result;
  }

  /**
   * 获取用户所有学习状态（带缓存）
   */
  async getUserStates(userId: string): Promise<WordLearningState[]> {
    const cacheKey = CacheKeys.USER_LEARNING_STATES(userId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordLearningState[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const states = await prisma.wordLearningState.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });

    // 存入缓存
    cacheService.set(cacheKey, states, CacheTTL.LEARNING_STATE);

    return states;
  }

  /**
   * 获取需要复习的单词（带缓存）
   */
  async getDueWords(userId: string): Promise<WordLearningState[]> {
    const cacheKey = CacheKeys.USER_DUE_WORDS(userId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordLearningState[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const now = new Date();
    const dueWords = await prisma.wordLearningState.findMany({
      where: {
        userId,
        nextReviewDate: {
          lte: now
        },
        state: {
          in: [WordState.LEARNING, WordState.REVIEWING]
        }
      },
      orderBy: { nextReviewDate: 'asc' }
    });

    // 存入缓存（较短的TTL，因为这个数据变化较快）
    cacheService.set(cacheKey, dueWords, 60); // 1分钟

    return dueWords;
  }

  /**
   * 获取特定状态的单词
   */
  async getWordsByState(userId: string, state: WordState): Promise<WordLearningState[]> {
    return await prisma.wordLearningState.findMany({
      where: {
        userId,
        state
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * 创建或更新单词学习状态
   */
  async upsertWordState(
    userId: string,
    wordId: string,
    data: Partial<WordLearningState>
  ): Promise<WordLearningState> {
    await this.assertWordAccessible(userId, wordId);

    // 过滤掉userId和wordId，防止被data覆盖
    const { userId: _, wordId: __, ...safeData } = data as any;

    // 转换时间戳为Date对象
    const convertedData: any = { ...safeData };
    if (typeof convertedData.lastReviewDate === 'number') {
      convertedData.lastReviewDate = convertedData.lastReviewDate === 0 ? null : new Date(convertedData.lastReviewDate);
    }
    if (typeof convertedData.nextReviewDate === 'number') {
      convertedData.nextReviewDate = new Date(convertedData.nextReviewDate);
    }
    if (typeof convertedData.createdAt === 'number') {
      convertedData.createdAt = new Date(convertedData.createdAt);
    }
    if (typeof convertedData.updatedAt === 'number') {
      convertedData.updatedAt = new Date(convertedData.updatedAt);
    }

    const state = await prisma.wordLearningState.upsert({
      where: {
        unique_user_word: {
          userId,
          wordId
        }
      },
      create: {
        userId,
        wordId,
        ...convertedData
      } as any,
      update: convertedData
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
    updates: Array<{ wordId: string; data: Partial<WordLearningState> }>
  ): Promise<void> {
    // 先验证所有单词的访问权限
    await Promise.all(updates.map(({ wordId }) => this.assertWordAccessible(userId, wordId)));

    // 使用事务批量更新
    await prisma.$transaction(
      updates.map(({ wordId, data }) => {
        // 过滤掉userId和wordId，防止被data覆盖
        const { userId: _, wordId: __, ...safeData } = data as any;

        return prisma.wordLearningState.upsert({
          where: {
            unique_user_word: {
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
   * 删除单词学习状态
   */
  async deleteWordState(userId: string, wordId: string): Promise<void> {
    await prisma.wordLearningState.delete({
      where: {
        unique_user_word: {
          userId,
          wordId
        }
      }
    });

    // 清除缓存
    this.invalidateUserCache(userId, wordId);
  }

  /**
   * 获取用户学习统计
   */
  async getUserStats(userId: string) {
    const cacheKey = CacheKeys.USER_STATS(userId);

    // 尝试从缓存获取
    const cached = cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const [
      totalWords,
      newWords,
      learningWords,
      reviewingWords,
      masteredWords
    ] = await Promise.all([
      prisma.wordLearningState.count({ where: { userId } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.NEW } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.LEARNING } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.REVIEWING } }),
      prisma.wordLearningState.count({ where: { userId, state: WordState.MASTERED } })
    ]);

    const stats = {
      totalWords,
      newWords,
      learningWords,
      reviewingWords,
      masteredWords
    };

    // 存入缓存
    cacheService.set(cacheKey, stats, CacheTTL.USER_STATS);

    return stats;
  }

  /**
   * 清除用户缓存
   */
  private invalidateUserCache(userId: string, wordId?: string): void {
    if (wordId) {
      const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);
      cacheService.delete(cacheKey);
    }

    // 清除用户相关的所有缓存
    cacheService.delete(CacheKeys.USER_LEARNING_STATES(userId));
    cacheService.delete(CacheKeys.USER_DUE_WORDS(userId));
    cacheService.delete(CacheKeys.USER_STATS(userId));
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    cacheService.deletePattern('learning_state*');
    cacheService.deletePattern('due_words*');
    cacheService.deletePattern('user_stats*');
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

export const wordStateService = new WordStateService();
