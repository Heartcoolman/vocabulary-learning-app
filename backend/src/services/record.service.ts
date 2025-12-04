import prisma from '../config/database';
import { CreateRecordDto } from '../types';
import { wordMasteryService } from './word-mastery.service';
import { serviceLogger } from '../logger';

/** 最大批量操作大小 */
const MAX_BATCH_SIZE = 1000;

/** 时间戳有效范围（毫秒）：过去24小时到未来1小时 */
const TIMESTAMP_PAST_LIMIT_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP_FUTURE_LIMIT_MS = 60 * 60 * 1000;

/**
 * 验证时间戳的合理性
 * @param timestamp 时间戳（毫秒）
 * @throws 如果时间戳不合理则抛出错误
 */
function validateTimestamp(timestamp: number): Date {
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

  // 不允许早于过去24小时
  if (timestamp < now - TIMESTAMP_PAST_LIMIT_MS) {
    throw new Error('时间戳不能早于24小时前');
  }

  return date;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class RecordService {
  /**
   * 获取用户的学习记录（带分页）
   * @param userId 用户ID
   * @param options 分页选项，默认第1页，每页50条，最大100条
   */
  async getRecordsByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      prisma.answerRecord.findMany({
        where: { userId },
        include: {
          word: {
            select: {
              spelling: true,
              phonetic: true,
              meanings: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.answerRecord.count({ where: { userId } }),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createRecord(userId: string, data: CreateRecordDto) {
    // 如果提供了 sessionId，确保对应的 LearningSession 存在
    if (data.sessionId) {
      await this.ensureLearningSession(data.sessionId, userId);
    }

    // 验证单词存在且属于用户可访问的词书
    const word = await prisma.word.findUnique({
      where: { id: data.wordId },
      include: {
        wordBook: {
          select: {
            type: true,
            userId: true,
          },
        },
      },
    });

    if (!word) {
      throw new Error('单词不存在');
    }

    // 权限校验：单词必须属于系统词书或用户自己的词书
    if (word.wordBook.type === 'USER' && word.wordBook.userId !== userId) {
      throw new Error('无权访问该单词');
    }

    const createData: Parameters<typeof prisma.answerRecord.create>[0]['data'] = {
      userId,
      wordId: data.wordId,
      selectedAnswer: data.selectedAnswer ?? '',
      correctAnswer: data.correctAnswer ?? '',
      isCorrect: data.isCorrect,
      responseTime: data.responseTime,
      dwellTime: data.dwellTime,
      sessionId: data.sessionId,
      masteryLevelBefore: data.masteryLevelBefore,
      masteryLevelAfter: data.masteryLevelAfter,
    };


    // 使用客户端时间戳以保证与本地记录一致，从而实现可靠去重
    // 验证时间戳的合理性，防止恶意提交无效时间戳
    if (typeof data.timestamp === 'number') {
      createData.timestamp = validateTimestamp(data.timestamp);
    }

    const record = await prisma.answerRecord.create({
      data: createData,
    });

    // 同步记录到 WordReviewTrace 用于掌握度评估
    try {
      await wordMasteryService.recordReview(userId, data.wordId, {
        timestamp: data.timestamp ?? Date.now(),
        isCorrect: data.isCorrect,
        responseTime: data.responseTime ?? 0
      });
    } catch (error) {
      // 记录失败不阻断主流程，仅警告
      serviceLogger.warn({ userId, wordId: data.wordId, error }, '同步复习轨迹失败');
    }

    return record;
  }

  async batchCreateRecords(userId: string, records: CreateRecordDto[]) {
    // 检查批量大小限制
    if (records.length > MAX_BATCH_SIZE) {
      throw new Error(
        `批量操作上限为 ${MAX_BATCH_SIZE} 条，当前 ${records.length} 条。请分批提交。`
      );
    }

    // 检查是否有记录缺少时间戳，如果有则警告但不阻止
    const recordsWithoutTimestamp = records.filter(r => !r.timestamp);
    if (recordsWithoutTimestamp.length > 0) {
      serviceLogger.warn(
        { count: recordsWithoutTimestamp.length },
        '部分记录缺少时间戳，将使用服务端时间。建议客户端提供时间戳以保证跨端一致性和幂等性'
      );
    }

    // 验证所有时间戳的合理性并缓存验证后的日期对象
    const validatedTimestamps = new Map<number, Date>();
    for (const record of records) {
      if (record.timestamp) {
        try {
          const validatedDate = validateTimestamp(record.timestamp);
          validatedTimestamps.set(record.timestamp, validatedDate);
        } catch (error) {
          throw new Error(`记录时间戳无效 (wordId=${record.wordId}): ${(error as Error).message}`);
        }
      }
    }

    // 验证所有单词都存在且用户有权限访问（先去重提高查询效率）
    const wordIds = Array.from(new Set(records.map(r => r.wordId)));
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: {
        id: true,
        spelling: true,
        wordBook: {
          select: {
            type: true,
            userId: true,
          },
        },
      },
    });

    // 获取用户有权限访问的单词ID集合（系统词书或用户自己的词书）
    const accessibleWordIds = new Set(
      words
        .filter(w => w.wordBook.type === 'SYSTEM' || w.wordBook.userId === userId)
        .map(w => w.id)
    );

    // 只保留用户有权限访问的单词记录
    const validRecords = records.filter(record => accessibleWordIds.has(record.wordId));

    if (validRecords.length === 0) {
      throw new Error('所有单词都不存在或无权访问');
    }

    // 如果有部分记录因权限被跳过，记录警告
    const skippedCount = records.length - validRecords.length;
    if (skippedCount > 0) {
      serviceLogger.warn({ skippedCount }, '跳过了部分无权访问的学习记录');
    }

    serviceLogger.info({ count: validRecords.length }, '准备创建学习记录（数据库自动跳过重复）');

    // 收集所有有效的 sessionId 并确保对应的 LearningSession 存在
    const sessionIds = [...new Set(validRecords.map(r => r.sessionId).filter((id): id is string => !!id))];
    for (const sessionId of sessionIds) {
      await this.ensureLearningSession(sessionId, userId);
    }

    // 使用数据库的 skipDuplicates 选项，依赖唯一约束自动去重
    // 这样避免了将所有记录加载到内存中进行去重，大幅提升性能
    const result = await prisma.answerRecord.createMany({
      data: validRecords.map(record => ({
        userId,
        wordId: record.wordId,
        selectedAnswer: record.selectedAnswer ?? '',
        correctAnswer: record.correctAnswer ?? '',
        isCorrect: record.isCorrect,
        // 复用已验证的时间戳，避免二次创建Date对象产生不一致
        timestamp: record.timestamp
          ? (validatedTimestamps.get(record.timestamp) ?? new Date(record.timestamp))
          : new Date(),
        responseTime: record.responseTime,
        dwellTime: record.dwellTime,
        sessionId: record.sessionId,
        masteryLevelBefore: record.masteryLevelBefore,
        masteryLevelAfter: record.masteryLevelAfter,
      })),

      skipDuplicates: true, // 数据库层面跳过重复记录，基于 unique_user_word_timestamp 唯一约束
    });

    // 批量同步到 WordReviewTrace 用于掌握度评估
    try {
      const reviewEvents = validRecords.map(record => ({
        wordId: record.wordId,
        event: {
          timestamp: record.timestamp ?? Date.now(),
          isCorrect: record.isCorrect,
          responseTime: record.responseTime ?? 0
        }
      }));
      await wordMasteryService.batchRecordReview(userId, reviewEvents);
    } catch (error) {
      // 记录失败不阻断主流程，仅警告
      serviceLogger.warn({ userId, error }, '批量同步复习轨迹失败');
    }

    return result;
  }

  async getStatistics(userId: string) {
    // 获取用户可访问的所有词书（系统词库 + 用户自己的词库）
    const userWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: userId },
        ],
      },
      select: { id: true },
    });

    const wordBookIds = userWordBooks.map((wb) => wb.id);

    const [totalWords, totalRecords, correctRecords, recentRecords] = await Promise.all([
      prisma.word.count({
        where: {
          wordBookId: {
            in: wordBookIds,
          },
        },
      }),
      prisma.answerRecord.count({ where: { userId } }),
      prisma.answerRecord.count({ where: { userId, isCorrect: true } }),
      prisma.answerRecord.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
          word: {
            select: {
              spelling: true,
              phonetic: true,
            },
          },
        },
      }),
    ]);

    const correctRate = totalRecords > 0 ? correctRecords / totalRecords : 0;

    return {
      totalWords,
      totalRecords,
      correctRate,
      recentRecords,
    };
  }

  /**
   * 确保学习会话存在
   * 使用事务+锁定查询避免 TOCTOU 竞态条件
   * @param sessionId 学习会话ID
   * @param userId 用户ID
   */
  private async ensureLearningSession(sessionId: string, userId: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // 先尝试查询现有会话
        const existing = await tx.learningSession.findUnique({
          where: { id: sessionId }
        });

        if (existing) {
          // 会话已存在，校验用户归属
          if (existing.userId !== userId) {
            serviceLogger.warn(
              { sessionId, expectedUserId: userId, actualUserId: existing.userId },
              '学习会话用户不匹配'
            );
            throw new Error(`Session ${sessionId} belongs to different user`);
          }
          // 用户匹配，无需操作
          return;
        }

        // 会话不存在，创建新会话
        await tx.learningSession.create({
          data: {
            id: sessionId,
            userId
          }
        });
      });
    } catch (error) {
      // 如果是用户不匹配错误，重新抛出
      if (error instanceof Error && error.message.includes('belongs to different user')) {
        throw error;
      }
      // 处理并发创建时的唯一约束冲突
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        // 再次检查会话归属
        const session = await prisma.learningSession.findUnique({
          where: { id: sessionId }
        });
        if (session && session.userId !== userId) {
          throw new Error(`Session ${sessionId} belongs to different user`);
        }
        // 如果是同一用户的并发请求，忽略错误
        return;
      }
      // 其他错误仅记录，不阻断主流程
      serviceLogger.warn({ sessionId, error }, '确保学习会话失败');
    }
  }
}

export default new RecordService();
