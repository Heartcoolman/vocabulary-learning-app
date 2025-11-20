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
    // 验证单词存在且属于该用户
    const word = await prisma.word.findFirst({
      where: { id: data.wordId, userId },
    });

    if (!word) {
      throw new Error('单词不存在或无权访问');
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
    // 验证所有单词都属于该用户
    const wordIds = records.map(r => r.wordId);
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds }, userId },
      select: { id: true, spelling: true },
    });

    // 获取存在的单词ID集合
    const existingWordIds = new Set(words.map(w => w.id));
    
    // 只保留引用存在单词的记录
    const validRecords = records.filter(record => existingWordIds.has(record.wordId));
    
    if (validRecords.length === 0) {
      throw new Error('所有单词都不存在或无权访问');
    }

    // 如果有部分记录被跳过，记录警告
    if (validRecords.length < records.length) {
      console.warn(`跳过了 ${records.length - validRecords.length} 条引用不存在单词的学习记录`);
    }

    // 获取已存在的记录（通过单词拼写+timestamp匹配）
    const existingRecords = await prisma.answerRecord.findMany({
      where: {
        userId,
      },
      select: {
        timestamp: true,
        word: {
          select: {
            spelling: true,
          },
        },
      },
    });

    // 创建已存在记录的标识集合（单词拼写-时间戳）
    const existingRecordKeys = new Set(
      existingRecords.map(r => `${r.word.spelling.toLowerCase()}-${r.timestamp.getTime()}`)
    );

    console.log(`云端已有 ${existingRecords.length} 条记录`);
    console.log(`本地上传 ${validRecords.length} 条记录`);
    
    // 输出前5个云端记录key
    const sampleKeys = Array.from(existingRecordKeys).slice(0, 5);
    console.log(`云端记录示例:`, sampleKeys);
    
    // 需要获取本地记录对应的单词拼写
    const localWordMap = new Map(
      words.map(w => [w.id, w])
    );
    
    // 过滤出未存在的记录
    const newRecords = validRecords.filter(record => {
      const word = localWordMap.get(record.wordId);
      if (!word) {
        console.log(`找不到单词: ${record.wordId}`);
        return false;
      }
      
      const timestamp = record.timestamp || Date.now();
      const key = `${word.spelling.toLowerCase()}-${timestamp}`;
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
        timestamp: record.timestamp ? new Date(record.timestamp) : new Date(),
      })),
    });
  }

  async getStatistics(userId: string) {
    const [totalWords, totalRecords, correctRecords, recentRecords] = await Promise.all([
      prisma.word.count({ where: { userId } }),
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
