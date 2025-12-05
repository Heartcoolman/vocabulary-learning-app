/**
 * 单词学习状态服务
 * 管理单词的学习状态，支持缓存和批量操作
 */

import { WordLearningState, WordState, Prisma, WordBookType } from '@prisma/client';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import prisma from '../config/database';

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


export class WordStateService {
  // 空值标记，用于缓存穿透防护
  private static readonly NULL_MARKER = '__NULL__';

  /**
   * 获取单词学习状态（带缓存）
   * 修复问题#19: 添加空值缓存防止缓存穿透
   */
  async getWordState(userId: string, wordId: string): Promise<WordLearningState | null> {
    const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);

    // 尝试从缓存获取
    const cached = cacheService.get<WordLearningState | typeof WordStateService.NULL_MARKER>(cacheKey);
    if (cached !== null) {
      // 如果是空值标记，返回null
      if (cached === WordStateService.NULL_MARKER) {
        return null;
      }
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

    // 存入缓存（包括空值）
    if (state) {
      cacheService.set(cacheKey, state, CacheTTL.LEARNING_STATE);
    } else {
      // 缓存空值，使用较短的TTL防止数据长期不一致
      cacheService.set(cacheKey, WordStateService.NULL_MARKER, CacheTTL.NULL_CACHE);
    }

    return state;
  }

  /**
   * 批量获取单词学习状态（带缓存）
   * 修复：正确处理空值标记，与getWordState方法保持一致
   */
  async batchGetWordStates(userId: string, wordIds: string[]): Promise<Map<string, WordLearningState>> {
    const result = new Map<string, WordLearningState>();
    const uncachedWordIds: string[] = [];
    const nullCachedWordIds: string[] = []; // 已知为空的单词ID（命中空值缓存）

    // 先从缓存获取
    for (const wordId of wordIds) {
      const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);
      const cached = cacheService.get<WordLearningState | typeof WordStateService.NULL_MARKER>(cacheKey);

      if (cached !== null) {
        // 检查是否为空值标记
        if (cached === WordStateService.NULL_MARKER) {
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
      const states = await prisma.wordLearningState.findMany({
        where: {
          userId,
          wordId: { in: uncachedWordIds }
        }
      });

      // 构建查询结果的wordId集合
      const foundWordIds = new Set(states.map(s => s.wordId));

      // 存入缓存和结果
      for (const state of states) {
        const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, state.wordId);
        cacheService.set(cacheKey, state, CacheTTL.LEARNING_STATE);
        result.set(state.wordId, state);
      }

      // 为未找到的单词缓存空值标记，防止缓存穿透
      for (const wordId of uncachedWordIds) {
        if (!foundWordIds.has(wordId)) {
          const cacheKey = CacheKeys.USER_LEARNING_STATE(userId, wordId);
          cacheService.set(cacheKey, WordStateService.NULL_MARKER, CacheTTL.NULL_CACHE);
        }
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
   * 获取需要复习的单词（不缓存）
   *
   * 修复 Bug #37: getDueWords 缓存过期问题
   * 原因：缓存期间（即使只有1分钟）新到期的单词不会出现在列表中，
   * 导致用户在学习时可能看到的到期单词列表不够及时。
   *
   * 解决方案：此查询不使用缓存，每次直接查询数据库。
   * 由于 nextReviewDate 索引存在，查询性能可接受（通常 < 10ms）。
   *
   * 替代方案参考：
   * - 如果性能成为问题，可考虑使用极短TTL（5秒）
   * - 或使用"预取+过滤"策略：缓存稍大范围，查询时再过滤
   */
  async getDueWords(userId: string): Promise<WordLearningState[]> {
    // 直接从数据库查询，不使用缓存，确保获取最新的到期单词
    // 返回所有到期的单词：LEARNING、REVIEWING 状态，以及 NEW 状态（包括未学习的新词）
    const now = new Date();
    // Bug Fix: NEW状态单词的nextReviewDate为null，不会被lte条件匹配
    // 添加OR条件包含nextReviewDate为null且state为NEW的单词
    const dueWords = await prisma.wordLearningState.findMany({
      where: {
        userId,
        OR: [
          // 条件1: 已到复习时间的单词（LEARNING、REVIEWING状态）
          {
            nextReviewDate: { lte: now },
            state: { in: [WordState.LEARNING, WordState.REVIEWING] }
          },
          // 条件2: NEW状态单词（nextReviewDate可能为null或已到期）
          {
            state: WordState.NEW,
            OR: [
              { nextReviewDate: null },
              { nextReviewDate: { lte: now } }
            ]
          }
        ]
      },
      orderBy: { nextReviewDate: 'asc' }
    });

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

    // 转换并验证时间戳为Date对象
    const convertedData: any = { ...safeData };
    if (typeof convertedData.lastReviewDate === 'number') {
      convertedData.lastReviewDate = validateAndConvertTimestamp(convertedData.lastReviewDate);
    }
    if (typeof convertedData.nextReviewDate === 'number') {
      convertedData.nextReviewDate = validateAndConvertTimestamp(convertedData.nextReviewDate);
    }
    if (typeof convertedData.createdAt === 'number') {
      convertedData.createdAt = validateAndConvertTimestamp(convertedData.createdAt);
    }
    if (typeof convertedData.updatedAt === 'number') {
      convertedData.updatedAt = validateAndConvertTimestamp(convertedData.updatedAt);
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
   * 优化：使用单次查询校验所有单词的访问权限，避免 N+1 查询
   */
  async batchUpdateWordStates(
    userId: string,
    updates: Array<{ wordId: string; data: Partial<WordLearningState> }>
  ): Promise<void> {
    // 获取去重后的单词ID列表
    const uniqueWordIds = Array.from(new Set(updates.map(({ wordId }) => wordId)));
    
    // 单次查询校验所有单词的访问权限
    const accessibleWordIds = await this.getAccessibleWordIds(userId, uniqueWordIds);
    
    // 检查是否所有单词都可访问
    const inaccessibleWordIds = uniqueWordIds.filter(id => !accessibleWordIds.has(id));
    if (inaccessibleWordIds.length > 0) {
      throw new Error(`无权访问以下单词: ${inaccessibleWordIds.join(', ')}`);
    }

    // 修复：事务外预先校验所有时间戳，避免单条记录无效导致整个批量操作失败
    // 同时预处理数据，避免在事务内部进行可能抛异常的操作
    const invalidTimestampErrors: string[] = [];
    const preparedUpdates = updates.map(({ wordId, data }, index) => {
      // 过滤掉userId和wordId，防止被data覆盖
      const { userId: _, wordId: __, ...safeData } = data as any;

      // 转换时间戳为Date对象，使用统一的校验逻辑
      const convertedData: any = { ...safeData };
      const timestampFields = ['lastReviewDate', 'nextReviewDate', 'createdAt', 'updatedAt'] as const;

      for (const field of timestampFields) {
        if (typeof convertedData[field] === 'number') {
          try {
            convertedData[field] = validateAndConvertTimestamp(convertedData[field]);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            invalidTimestampErrors.push(`记录[${index}] wordId=${wordId} ${field}: ${errorMsg}`);
          }
        }
      }

      return { wordId, convertedData };
    });

    // 如果有时间戳校验错误，提前抛出，避免进入事务
    if (invalidTimestampErrors.length > 0) {
      throw new Error(`时间戳校验失败:\n${invalidTimestampErrors.join('\n')}`);
    }

    // 使用事务批量更新（数据已预处理，不会在事务内抛异常）
    await prisma.$transaction(
      preparedUpdates.map(({ wordId, convertedData }) => {
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
            ...convertedData
          } as any,
          update: convertedData
        });
      })
    );

    // 清除用户缓存
    this.invalidateUserCache(userId);
  }

  /**
   * 批量获取用户可访问的单词ID集合
   * 单次查询，避免 N+1 问题
   */
  private async getAccessibleWordIds(userId: string, wordIds: string[]): Promise<Set<string>> {
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: {
        id: true,
        wordBook: { select: { type: true, userId: true } }
      }
    });

    const accessibleIds = new Set<string>();
    for (const word of words) {
      // 系统词书所有人可访问，用户词书只能本人访问
      if (word.wordBook.type === WordBookType.SYSTEM || word.wordBook.userId === userId) {
        accessibleIds.add(word.id);
      }
    }
    return accessibleIds;
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
