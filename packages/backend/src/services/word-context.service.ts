/**
 * Word Context Service
 * 单词语境服务
 *
 * 职责：
 * - 管理单词的多样化语境
 * - 支持例句、对话、文章、媒体等多种类型
 * - 为单词选择提供语境强化
 * - 追踪语境的使用效果
 */

import prisma from '../config/database';
import { logger } from '../logger';
import type { ContextType } from '@prisma/client';

// ==================== 类型定义 ====================

/**
 * 语境元数据
 */
export interface ContextMetadata {
  source?: string; // 来源（例如：教材、电影、新闻）
  difficulty?: 'easy' | 'medium' | 'hard'; // 难度
  tags?: string[]; // 标签
  audioUrl?: string; // 音频 URL（对话、媒体类型）
  imageUrl?: string; // 图片 URL（文章、媒体类型）
  author?: string; // 作者
  publishDate?: string; // 发布日期
  viewCount?: number; // 浏览次数
  usageCount?: number; // 使用次数
  effectivenessScore?: number; // 效果评分（0-1）
}

/**
 * 语境数据
 */
export interface WordContextData {
  id: string;
  wordId: string;
  contextType: ContextType;
  content: string;
  metadata: ContextMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建语境请求
 */
export interface CreateContextRequest {
  wordId: string;
  contextType: ContextType;
  content: string;
  metadata?: ContextMetadata;
}

/**
 * 更新语境元数据请求
 */
export interface UpdateContextMetadataRequest {
  source?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  audioUrl?: string;
  imageUrl?: string;
  author?: string;
  publishDate?: string;
  viewCount?: number;
  usageCount?: number;
  effectivenessScore?: number;
}

/**
 * 语境查询选项
 */
export interface GetContextsOptions {
  type?: ContextType;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'usageCount' | 'effectivenessScore';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 语境统计
 */
export interface ContextStats {
  wordId: string;
  total: number;
  byType: Record<ContextType, number>;
  mostUsed: WordContextData | null;
  mostEffective: WordContextData | null;
}

// ==================== 服务类 ====================

export class WordContextService {
  private async assertWordAccessible(
    wordId: string,
    userId: string,
  ): Promise<{ id: string; spelling: string }> {
    const word = await prisma.word.findFirst({
      where: {
        id: wordId,
        wordBook: {
          OR: [{ type: 'SYSTEM' }, { type: 'USER', userId }],
        },
      },
      select: { id: true, spelling: true },
    });

    if (!word) {
      throw new Error('单词不存在或无权访问');
    }

    return word;
  }

  private async assertContextAccessible(
    contextId: string,
    userId: string,
  ): Promise<{ id: string; wordId: string; contextType: ContextType }> {
    const context = await prisma.wordContext.findFirst({
      where: {
        id: contextId,
        word: {
          wordBook: {
            OR: [{ type: 'SYSTEM' }, { type: 'USER', userId }],
          },
        },
      },
      select: { id: true, wordId: true, contextType: true },
    });

    if (!context) {
      throw new Error('语境不存在或无权访问');
    }

    return context;
  }

  // ==================== 语境管理 ====================

  /**
   * 添加语境
   */
  async addContext(userId: string, request: CreateContextRequest): Promise<WordContextData> {
    const { wordId, contextType, content, metadata } = request;

    logger.debug(
      {
        wordId,
        contextType,
        contentLength: content.length,
      },
      '[WordContext] 添加语境',
    );

    const word = await this.assertWordAccessible(wordId, userId);

    // 创建语境记录
    const context = await prisma.wordContext.create({
      data: {
        wordId,
        contextType,
        content,
        metadata: metadata ? (metadata as any) : null,
      },
    });

    logger.info(
      {
        contextId: context.id,
        wordId,
        contextType,
        spelling: word.spelling,
      },
      '[WordContext] 语境已添加',
    );

    return this.mapContextData(context);
  }

  /**
   * 批量添加语境
   */
  async addContexts(userId: string, requests: CreateContextRequest[]): Promise<WordContextData[]> {
    logger.debug({ count: requests.length }, '[WordContext] 批量添加语境');

    // 校验所有 wordId 权限（避免批量接口写入越权数据）
    const uniqueWordIds = Array.from(new Set(requests.map((r) => r.wordId)));
    const accessibleWords = await prisma.word.findMany({
      where: {
        id: { in: uniqueWordIds },
        wordBook: {
          OR: [{ type: 'SYSTEM' }, { type: 'USER', userId }],
        },
      },
      select: { id: true },
    });
    if (accessibleWords.length !== uniqueWordIds.length) {
      throw new Error('批量语境包含不存在或无权访问的单词');
    }

    const contexts = await prisma.$transaction(
      requests.map((request) =>
        prisma.wordContext.create({
          data: {
            wordId: request.wordId,
            contextType: request.contextType,
            content: request.content,
            metadata: request.metadata ? (request.metadata as any) : null,
          },
        }),
      ),
    );

    logger.info({ count: contexts.length }, '[WordContext] 批量语境已添加');

    return contexts.map((context) => this.mapContextData(context));
  }

  /**
   * 获取单词的语境列表
   */
  async getContexts(
    userId: string,
    wordId: string,
    options: GetContextsOptions = {},
  ): Promise<WordContextData[]> {
    const {
      type,
      difficulty,
      tags,
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    logger.debug({ wordId, options }, '[WordContext] 获取语境列表');

    await this.assertWordAccessible(wordId, userId);

    // 构建查询条件
    const where: any = { wordId };

    if (type) {
      where.contextType = type;
    }

    // 元数据过滤（使用 JSON 过滤）
    // 注意：difficulty 与 tags 需要可组合过滤，不能互相覆盖
    const metadataFilters: any[] = [];
    if (difficulty) {
      metadataFilters.push({
        metadata: {
          path: ['difficulty'],
          equals: difficulty,
        },
      });
    }
    if (tags && tags.length > 0) {
      // 注意：Prisma 的 JSON 过滤依赖数据库原生支持
      metadataFilters.push({
        metadata: {
          path: ['tags'],
          array_contains: tags,
        },
      });
    }
    if (metadataFilters.length > 0) {
      where.AND = metadataFilters;
    }

    // 排序
    const orderBy: any = {};
    if (sortBy === 'createdAt') {
      orderBy.createdAt = sortOrder;
    } else if (sortBy === 'usageCount' || sortBy === 'effectivenessScore') {
      // 对于元数据字段，需要使用数据库原生排序
      // 这里简化为按创建时间排序
      orderBy.createdAt = sortOrder;
    }

    const needsInMemorySort = sortBy === 'usageCount' || sortBy === 'effectivenessScore';

    // 对于元数据字段排序：先取更大的候选集，再在内存中排序并做分页，
    // 避免 “先分页再排序” 导致推荐结果失真（尤其是 recommendContextsForWords 的 top-N 场景）。
    if (needsInMemorySort) {
      const MAX_CANDIDATES = 1000;
      const CANDIDATE_BUFFER = 200;
      const candidateTake = Math.min(MAX_CANDIDATES, limit + offset + CANDIDATE_BUFFER);

      const contexts = await prisma.wordContext.findMany({
        where,
        orderBy,
        take: candidateTake,
      });

      const sorted = this.sortByMetadata(contexts, sortBy, sortOrder);
      const paged = sorted.slice(offset, offset + limit);
      return paged.map((context) => this.mapContextData(context));
    }

    const contexts = await prisma.wordContext.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    });

    return contexts.map((context) => this.mapContextData(context));
  }

  /**
   * 获取随机语境
   */
  async getRandomContext(
    userId: string,
    wordId: string,
    options: { type?: ContextType; difficulty?: 'easy' | 'medium' | 'hard' } = {},
  ): Promise<WordContextData | null> {
    logger.debug({ wordId, options }, '[WordContext] 获取随机语境');

    await this.assertWordAccessible(wordId, userId);

    const { type, difficulty } = options;

    // 构建查询条件
    const where: any = { wordId };

    if (type) {
      where.contextType = type;
    }

    if (difficulty) {
      where.metadata = {
        path: ['difficulty'],
        equals: difficulty,
      };
    }

    // 获取符合条件的语境总数
    const count = await prisma.wordContext.count({ where });

    if (count === 0) {
      return null;
    }

    // 随机选择一个索引
    const randomIndex = Math.floor(Math.random() * count);

    // 获取随机语境
    const contexts = await prisma.wordContext.findMany({
      where,
      take: 1,
      skip: randomIndex,
    });

    if (contexts.length === 0) {
      return null;
    }

    return this.mapContextData(contexts[0]);
  }

  /**
   * 更新语境内容
   */
  async updateContext(
    userId: string,
    contextId: string,
    content: string,
  ): Promise<WordContextData> {
    logger.debug({ contextId, contentLength: content.length }, '[WordContext] 更新语境内容');

    await this.assertContextAccessible(contextId, userId);

    const context = await prisma.wordContext.update({
      where: { id: contextId },
      data: { content },
    });

    logger.info({ contextId }, '[WordContext] 语境内容已更新');

    return this.mapContextData(context);
  }

  /**
   * 更新语境元数据
   */
  async updateContextMetadata(
    userId: string,
    contextId: string,
    metadata: UpdateContextMetadataRequest,
  ): Promise<WordContextData> {
    logger.debug({ contextId, metadata }, '[WordContext] 更新语境元数据');

    await this.assertContextAccessible(contextId, userId);

    // 获取现有元数据
    const existingContext = await prisma.wordContext.findUnique({
      where: { id: contextId },
      select: { metadata: true },
    });

    if (!existingContext) {
      throw new Error(`语境不存在: ${contextId}`);
    }

    // 合并元数据
    const existingMetadata = (existingContext.metadata as ContextMetadata) || {};
    const updatedMetadata = { ...existingMetadata, ...metadata };

    // 更新数据库
    const context = await prisma.wordContext.update({
      where: { id: contextId },
      data: { metadata: updatedMetadata as any },
    });

    logger.info({ contextId }, '[WordContext] 语境元数据已更新');

    return this.mapContextData(context);
  }

  /**
   * 删除语境
   */
  async deleteContext(userId: string, contextId: string): Promise<void> {
    logger.debug({ contextId }, '[WordContext] 删除语境');

    await this.assertContextAccessible(contextId, userId);

    await prisma.wordContext.delete({
      where: { id: contextId },
    });

    logger.info({ contextId }, '[WordContext] 语境已删除');
  }

  /**
   * 批量删除语境
   */
  async deleteContexts(userId: string, contextIds: string[]): Promise<number> {
    logger.debug({ count: contextIds.length }, '[WordContext] 批量删除语境');

    const accessibleCount = await prisma.wordContext.count({
      where: {
        id: { in: contextIds },
        word: {
          wordBook: {
            OR: [{ type: 'SYSTEM' }, { type: 'USER', userId }],
          },
        },
      },
    });
    if (accessibleCount !== contextIds.length) {
      throw new Error('批量删除包含不存在或无权访问的语境');
    }

    const result = await prisma.wordContext.deleteMany({
      where: { id: { in: contextIds } },
    });

    logger.info({ count: result.count }, '[WordContext] 批量语境已删除');

    return result.count;
  }

  // ==================== 语境统计和分析 ====================

  /**
   * 获取单词的语境统计
   */
  async getContextStats(userId: string, wordId: string): Promise<ContextStats> {
    logger.debug({ wordId }, '[WordContext] 获取语境统计');

    await this.assertWordAccessible(wordId, userId);

    const contexts = await prisma.wordContext.findMany({
      where: { wordId },
    });

    // 统计各类型数量
    const byType: Record<string, number> = {
      SENTENCE: 0,
      CONVERSATION: 0,
      ARTICLE: 0,
      MEDIA: 0,
    };

    for (const context of contexts) {
      byType[context.contextType] = (byType[context.contextType] || 0) + 1;
    }

    // 找出最常用和最有效的语境
    let mostUsed: WordContextData | null = null;
    let mostEffective: WordContextData | null = null;
    let maxUsageCount = 0;
    let maxEffectiveness = 0;

    for (const context of contexts) {
      const metadata = context.metadata as ContextMetadata | null;

      if (metadata?.usageCount && metadata.usageCount > maxUsageCount) {
        maxUsageCount = metadata.usageCount;
        mostUsed = this.mapContextData(context);
      }

      if (metadata?.effectivenessScore && metadata.effectivenessScore > maxEffectiveness) {
        maxEffectiveness = metadata.effectivenessScore;
        mostEffective = this.mapContextData(context);
      }
    }

    return {
      wordId,
      total: contexts.length,
      byType: byType as Record<ContextType, number>,
      mostUsed,
      mostEffective,
    };
  }

  /**
   * 记录语境使用
   */
  async recordContextUsage(userId: string, contextId: string): Promise<void> {
    logger.debug({ contextId }, '[WordContext] 记录语境使用');

    await this.assertContextAccessible(contextId, userId);

    // 获取现有元数据
    const context = await prisma.wordContext.findUnique({
      where: { id: contextId },
      select: { metadata: true },
    });

    if (!context) {
      throw new Error(`语境不存在: ${contextId}`);
    }

    const metadata = (context.metadata as ContextMetadata) || {};
    const usageCount = (metadata.usageCount || 0) + 1;
    const viewCount = (metadata.viewCount || 0) + 1;

    // 更新元数据
    await prisma.wordContext.update({
      where: { id: contextId },
      data: {
        metadata: {
          ...metadata,
          usageCount,
          viewCount,
        } as any,
      },
    });

    logger.debug({ contextId, usageCount }, '[WordContext] 语境使用已记录');
  }

  /**
   * 更新语境效果评分
   */
  async updateEffectivenessScore(userId: string, contextId: string, score: number): Promise<void> {
    if (score < 0 || score > 1) {
      throw new Error(`无效的效果评分: ${score}（应在 0-1 之间）`);
    }

    logger.debug({ contextId, score }, '[WordContext] 更新效果评分');

    await this.assertContextAccessible(contextId, userId);

    // 获取现有元数据
    const context = await prisma.wordContext.findUnique({
      where: { id: contextId },
      select: { metadata: true },
    });

    if (!context) {
      throw new Error(`语境不存在: ${contextId}`);
    }

    const metadata = (context.metadata as ContextMetadata) || {};

    // 更新元数据
    await prisma.wordContext.update({
      where: { id: contextId },
      data: {
        metadata: {
          ...metadata,
          effectivenessScore: score,
        } as any,
      },
    });

    logger.info({ contextId, score }, '[WordContext] 效果评分已更新');
  }

  // ==================== 集成到选词逻辑 ====================

  /**
   * 为选定的单词推荐语境
   * 用于在选词后提供语境强化
   */
  async recommendContextsForWords(
    userId: string,
    wordIds: string[],
    options: {
      contextType?: ContextType;
      difficulty?: 'easy' | 'medium' | 'hard';
      maxPerWord?: number;
    } = {},
  ): Promise<Record<string, WordContextData[]>> {
    const { contextType, difficulty, maxPerWord = 3 } = options;

    logger.debug({ wordCount: wordIds.length, options }, '[WordContext] 为单词推荐语境');

    const result: Record<string, WordContextData[]> = {};

    for (const wordId of wordIds) {
      // 无权限访问的单词直接返回空数组，避免数据泄露
      try {
        await this.assertWordAccessible(wordId, userId);
      } catch {
        result[wordId] = [];
        continue;
      }

      const contexts = await this.getContexts(userId, wordId, {
        type: contextType,
        difficulty,
        limit: maxPerWord,
        sortBy: 'effectivenessScore',
        sortOrder: 'desc',
      });

      result[wordId] = contexts;
    }

    return result;
  }

  /**
   * 获取单词的最佳语境（用于学习展示）
   */
  async getBestContext(
    userId: string,
    wordId: string,
    options: {
      preferredType?: ContextType;
      userLevel?: 'beginner' | 'intermediate' | 'advanced';
    } = {},
  ): Promise<WordContextData | null> {
    const { preferredType, userLevel } = options;

    logger.debug({ wordId, options }, '[WordContext] 获取最佳语境');

    // 映射用户级别到难度
    const difficulty = userLevel
      ? { beginner: 'easy', intermediate: 'medium', advanced: 'hard' }[userLevel]
      : undefined;

    // 优先获取指定类型和难度的语境
    if (preferredType && difficulty) {
      const context = await this.getRandomContext(userId, wordId, {
        type: preferredType,
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
      });
      if (context) return context;
    }

    // 退化：获取任意类型但符合难度的语境
    if (difficulty) {
      const context = await this.getRandomContext(userId, wordId, {
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
      });
      if (context) return context;
    }

    // 再退化：获取任意语境
    return await this.getRandomContext(userId, wordId);
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 映射数据库模型到服务类型
   */
  private mapContextData(context: {
    id: string;
    wordId: string;
    contextType: ContextType;
    content: string;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
  }): WordContextData {
    return {
      id: context.id,
      wordId: context.wordId,
      contextType: context.contextType,
      content: context.content,
      metadata: context.metadata as ContextMetadata | null,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
    };
  }

  /**
   * 按元数据字段排序（内存排序）
   */
  private sortByMetadata(
    contexts: Array<{
      id: string;
      wordId: string;
      contextType: ContextType;
      content: string;
      metadata: any;
      createdAt: Date;
      updatedAt: Date;
    }>,
    field: 'usageCount' | 'effectivenessScore',
    order: 'asc' | 'desc',
  ): Array<{
    id: string;
    wordId: string;
    contextType: ContextType;
    content: string;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
  }> {
    return contexts.sort((a, b) => {
      const metadataA = a.metadata as ContextMetadata | null;
      const metadataB = b.metadata as ContextMetadata | null;

      const valueA = metadataA?.[field] ?? 0;
      const valueB = metadataB?.[field] ?? 0;

      return order === 'asc' ? valueA - valueB : valueB - valueA;
    });
  }
}

// ==================== 导出单例 ====================

export const wordContextService = new WordContextService();
export default wordContextService;
