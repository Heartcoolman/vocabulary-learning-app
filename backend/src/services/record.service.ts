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
    // 验证所有记录都包含时间戳（幂等性要求）
    const recordsWithoutTimestamp = records.filter(r => !r.timestamp);
    if (recordsWithoutTimestamp.length > 0) {
      throw new Error(`${recordsWithoutTimestamp.length} 条记录缺少时间戳，无法保证幂等性。请确保客户端提供时间戳。`);
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

    // 获取已存在的记录（通过单词ID+timestamp匹配）
    const existingRecords = await prisma.answerRecord.findMany({
      where: {
        userId,
      },
      select: {
        wordId: true,
        timestamp: true,
      },
    });

    // 创建已存在记录的标识集合（单词ID-时间戳）
    const existingRecordKeys = new Set(
      existingRecords.map(r => `${r.wordId}-${r.timestamp.getTime()}`)
    );

    console.log(`云端已有 ${existingRecords.length} 条记录`);
    console.log(`本地上传 ${validRecords.length} 条记录`);

    // 输出前5个云端记录key
    const sampleKeys = Array.from(existingRecordKeys).slice(0, 5);
    console.log(`云端记录示例:`, sampleKeys);

    // 过滤出未存在的记录（使用 wordId-timestamp 作为唯一标识）
    const newRecords = validRecords.filter(record => {
      // 此时 record.timestamp 已确保存在
      const key = `${record.wordId}-${record.timestamp}`;
      console.log(`检查记录: ${key}`);
      const exists = existingRecordKeys.has(key);
      if (exists) {
        console.log(`  → 跳过重复`);
      } else {
        console.log(`  → 新记录`);
      }
      return !exists;
    });

    if (newRecords.length === 0) {
      console.log('所有记录已存在，跳过创建');
      return { count: 0 };
    }

    console.log(`创建 ${newRecords.length} 条新记录，跳过 ${validRecords.length - newRecords.length} 条重复记录`);

    return await prisma.answerRecord.createMany({
      data: newRecords.map(record => ({
        userId,
        wordId: record.wordId,
        selectedAnswer: record.selectedAnswer ?? '',
        correctAnswer: record.correctAnswer ?? '',
        isCorrect: record.isCorrect,
        timestamp: new Date(record.timestamp!), // 使用非空断言，因为已验证
      })),
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
