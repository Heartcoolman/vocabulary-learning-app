import prisma from '../config/database';
import { CreateRecordDto } from '../types';

export class RecordService {
  async getRecordsByUserId(userId: string) {
    return await prisma.answerRecord.findMany({
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
    });
  }

  async createRecord(userId: string, data: CreateRecordDto) {
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
    if (typeof data.timestamp === 'number') {
      createData.timestamp = new Date(data.timestamp);
    }

    return await prisma.answerRecord.create({
      data: createData,
    });
  }

  async batchCreateRecords(userId: string, records: CreateRecordDto[]) {
    // 检查是否有记录缺少时间戳，如果有则警告但不阻止
    const recordsWithoutTimestamp = records.filter(r => !r.timestamp);
    if (recordsWithoutTimestamp.length > 0) {
      console.warn(`警告：${recordsWithoutTimestamp.length} 条记录缺少时间戳，将使用服务端时间。建议客户端提供时间戳以保证跨端一致性和幂等性。`);
    }

    // 验证所有单词都存在且用户有权限访问
    const wordIds = records.map(r => r.wordId);
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
      console.warn(`跳过了 ${skippedCount} 条无权访问的学习记录`);
    }

    console.log(`准备创建 ${validRecords.length} 条学习记录（数据库自动跳过重复）`);

    // 使用数据库的 skipDuplicates 选项，依赖唯一约束自动去重
    // 这样避免了将所有记录加载到内存中进行去重，大幅提升性能
    return await prisma.answerRecord.createMany({
      data: validRecords.map(record => ({
        userId,
        wordId: record.wordId,
        selectedAnswer: record.selectedAnswer ?? '',
        correctAnswer: record.correctAnswer ?? '',
        isCorrect: record.isCorrect,
        // 如果有客户端时间戳则使用，否则使用服务端当前时间
        timestamp: record.timestamp ? new Date(record.timestamp) : new Date(),
        responseTime: record.responseTime,
        dwellTime: record.dwellTime,
        sessionId: record.sessionId,
        masteryLevelBefore: record.masteryLevelBefore,
        masteryLevelAfter: record.masteryLevelAfter,
      })),

      skipDuplicates: true, // 数据库层面跳过重复记录，基于 unique_user_word_timestamp 唯一约束
    });
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
}

export default new RecordService();
