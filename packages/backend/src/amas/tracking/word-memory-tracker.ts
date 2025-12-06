/**
 * AMAS Tracking Layer - Word Memory Tracker
 * 单词记忆轨迹追踪器
 *
 * 职责:
 * - 记录用户对单词的每次复习事件
 * - 提供复习历史查询接口
 * - 支持批量查询以优化性能
 */

import prisma from '../../config/database';
import { ReviewTrace } from '../modeling/actr-memory';

// ==================== 类型定义 ====================

/**
 * 复习事件输入
 */
export interface ReviewEvent {
  /** 事件时间戳（毫秒） */
  timestamp: number;
  /** 是否回答正确 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime: number;
}

/**
 * 单词记忆状态
 */
export interface WordMemoryState {
  /** 单词ID */
  wordId: string;
  /** 复习次数 */
  reviewCount: number;
  /** 最后复习时间戳（毫秒） */
  lastReviewTs: number;
  /** 复习轨迹（已转换为ACT-R格式） */
  trace: ReviewTrace[];
}

// ==================== 常量 ====================

/** 默认查询限制 */
const DEFAULT_TRACE_LIMIT = 50;

/** 最大查询限制 */
const MAX_TRACE_LIMIT = 100;

// ==================== 实现 ====================

/**
 * 单词记忆轨迹追踪器
 *
 * 管理单词的复习历史记录，为ACT-R模型提供数据支持
 */
export class WordMemoryTracker {
  /**
   * 记录复习事件
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param event 复习事件
   */
  async recordReview(
    userId: string,
    wordId: string,
    event: ReviewEvent
  ): Promise<void> {
    await prisma.wordReviewTrace.create({
      data: {
        userId,
        wordId,
        timestamp: new Date(event.timestamp),
        isCorrect: event.isCorrect,
        responseTime: event.responseTime
      }
    });
  }

  /**
   * 批量记录复习事件
   *
   * @param userId 用户ID
   * @param events 复习事件列表
   */
  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEvent }>
  ): Promise<void> {
    await prisma.wordReviewTrace.createMany({
      data: events.map(({ wordId, event }) => ({
        userId,
        wordId,
        timestamp: new Date(event.timestamp),
        isCorrect: event.isCorrect,
        responseTime: event.responseTime
      }))
    });
  }

  /**
   * 获取复习历史轨迹
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param limit 返回数量限制（默认50条）
   * @returns ReviewTrace[] 按时间倒序排列，secondsAgo已计算
   */
  async getReviewTrace(
    userId: string,
    wordId: string,
    limit: number = DEFAULT_TRACE_LIMIT
  ): Promise<ReviewTrace[]> {
    const safeLimit = Math.min(Math.max(1, limit), MAX_TRACE_LIMIT);
    const now = Date.now();

    const records = await prisma.wordReviewTrace.findMany({
      where: {
        userId,
        wordId
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: safeLimit,
      select: {
        timestamp: true,
        isCorrect: true
      }
    });

    return records.map(record => ({
      secondsAgo: Math.floor((now - record.timestamp.getTime()) / 1000),
      isCorrect: record.isCorrect
    }));
  }

  /**
   * 批量获取单词记忆状态
   *
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @returns Map<wordId, WordMemoryState>
   */
  async batchGetMemoryState(
    userId: string,
    wordIds: string[]
  ): Promise<Map<string, WordMemoryState>> {
    const result = new Map<string, WordMemoryState>();
    const now = Date.now();

    if (wordIds.length === 0) {
      return result;
    }

    // 批量查询所有记录
    const records = await prisma.wordReviewTrace.findMany({
      where: {
        userId,
        wordId: { in: wordIds }
      },
      orderBy: {
        timestamp: 'desc'
      },
      select: {
        wordId: true,
        timestamp: true,
        isCorrect: true
      }
    });

    // 按wordId分组
    const groupedRecords = new Map<string, Array<{ timestamp: Date; isCorrect: boolean }>>();
    for (const record of records) {
      const existing = groupedRecords.get(record.wordId) ?? [];
      existing.push({ timestamp: record.timestamp, isCorrect: record.isCorrect });
      groupedRecords.set(record.wordId, existing);
    }

    // 转换为WordMemoryState
    for (const wordId of wordIds) {
      const wordRecords = groupedRecords.get(wordId) ?? [];
      
      // 限制每个单词最多MAX_TRACE_LIMIT条记录
      const limitedRecords = wordRecords.slice(0, MAX_TRACE_LIMIT);
      
      const trace: ReviewTrace[] = limitedRecords.map(r => ({
        secondsAgo: Math.floor((now - r.timestamp.getTime()) / 1000),
        isCorrect: r.isCorrect
      }));

      const lastReviewTs = limitedRecords.length > 0
        ? limitedRecords[0].timestamp.getTime()
        : 0;

      result.set(wordId, {
        wordId,
        reviewCount: wordRecords.length,
        lastReviewTs,
        trace
      });
    }

    return result;
  }

  /**
   * 获取用户所有单词的复习统计
   *
   * @param userId 用户ID
   * @returns 统计信息
   */
  async getUserReviewStats(userId: string): Promise<{
    totalReviews: number;
    uniqueWords: number;
    correctCount: number;
    incorrectCount: number;
    averageResponseTime: number;
  }> {
    const stats = await prisma.wordReviewTrace.aggregate({
      where: { userId },
      _count: { id: true },
      _avg: { responseTime: true }
    });

    const correctCount = await prisma.wordReviewTrace.count({
      where: { userId, isCorrect: true }
    });

    const uniqueWords = await prisma.wordReviewTrace.groupBy({
      by: ['wordId'],
      where: { userId },
      _count: true
    });

    return {
      totalReviews: stats._count.id,
      uniqueWords: uniqueWords.length,
      correctCount,
      incorrectCount: stats._count.id - correctCount,
      averageResponseTime: stats._avg.responseTime ?? 0
    };
  }

  /**
   * 删除过期的复习记录
   *
   * @param userId 用户ID
   * @param olderThanMs 删除早于此时间的记录（毫秒）
   * @returns 删除的记录数
   */
  async cleanupOldRecords(userId: string, olderThanMs: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanMs);

    const result = await prisma.wordReviewTrace.deleteMany({
      where: {
        userId,
        timestamp: { lt: cutoffDate }
      }
    });

    return result.count;
  }

  /**
   * 限制每个单词的记录数量
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param maxRecords 最大保留记录数
   * @returns 删除的记录数
   */
  async trimWordRecords(
    userId: string,
    wordId: string,
    maxRecords: number = MAX_TRACE_LIMIT
  ): Promise<number> {
    // 获取需要保留的记录ID
    const keepRecords = await prisma.wordReviewTrace.findMany({
      where: { userId, wordId },
      orderBy: { timestamp: 'desc' },
      take: maxRecords,
      select: { id: true }
    });

    const keepIds = keepRecords.map(r => r.id);

    if (keepIds.length === 0) {
      return 0;
    }

    // 删除不在保留列表中的记录
    const result = await prisma.wordReviewTrace.deleteMany({
      where: {
        userId,
        wordId,
        id: { notIn: keepIds }
      }
    });

    return result.count;
  }
}

// ==================== 导出单例 ====================

export const wordMemoryTracker = new WordMemoryTracker();
