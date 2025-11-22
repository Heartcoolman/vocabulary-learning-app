import prisma from '../config/database';
import { CreateWordDto, UpdateWordDto } from '../types';

/**
 * WordService - 单词服务（已废弃，使用 WordBookService 代替）
 * 保留此文件以维持向后兼容性
 */
export class WordService {
  /**
   * @deprecated 使用 WordBookService.getWordBookWords() 代替
   * 通过用户ID获取单词 - 现在返回用户所有词书的单词
   */
  async getWordsByUserId(userId: string) {
    // 获取用户的所有词书
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

    // 返回这些词书中的所有单词
    return await prisma.word.findMany({
      where: {
        wordBookId: {
          in: wordBookIds,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * @deprecated 使用 WordBookService 中的方法代替
   */
  async getWordById(wordId: string, userId: string) {
    const word = await prisma.word.findFirst({
      where: { id: wordId },
      include: { wordBook: true },
    });

    if (!word) {
      throw new Error('单词不存在');
    }

    // 检查权限：系统词书所有人可见，用户词书只能本人查看
    if (
      word.wordBook.type === 'USER' &&
      word.wordBook.userId !== userId
    ) {
      throw new Error('无权访问此单词');
    }

    return word;
  }

  /**
   * @deprecated 使用 WordBookService.addWordToWordBook() 代替
   * 注意：此方法需要指定 wordBookId
   */
  async createWord(userId: string, data: CreateWordDto & { wordBookId?: string }) {
    // 如果没有指定词书ID，创建一个默认词书或使用第一个用户词书
    let wordBookId = data.wordBookId;

    if (!wordBookId) {
      const defaultWordBook = await prisma.wordBook.findFirst({
        where: { userId, type: 'USER' },
      });

      if (!defaultWordBook) {
        // 创建默认词书
        const newWordBook = await prisma.wordBook.create({
          data: {
            name: '我的单词本',
            type: 'USER',
            userId,
            isPublic: false,
            wordCount: 0,
          },
        });
        wordBookId = newWordBook.id;
      } else {
        wordBookId = defaultWordBook.id;
      }
    }

    const word = await prisma.word.create({
      data: {
        wordBookId,
        spelling: data.spelling,
        phonetic: data.phonetic ?? '',
        meanings: data.meanings,
        examples: data.examples,
        audioUrl: data.audioUrl ?? undefined,
      },
    });

    // 更新词书单词计数
    await prisma.wordBook.update({
      where: { id: wordBookId },
      data: { wordCount: { increment: 1 } },
    });

    return word;
  }

  /**
   * @deprecated 使用 WordBookService 中的方法代替
   */
  async updateWord(wordId: string, userId: string, data: UpdateWordDto) {
    // 验证单词所有权
    await this.getWordById(wordId, userId);

    return await prisma.word.update({
      where: { id: wordId },
      data: {
        spelling: data.spelling,
        phonetic: data.phonetic ?? undefined,
        meanings: data.meanings,
        examples: data.examples,
        audioUrl: data.audioUrl ?? undefined,
      },
    });
  }

  /**
   * @deprecated 使用 WordBookService.removeWordFromWordBook() 代替
   */
  async deleteWord(wordId: string, userId: string) {
    // 验证单词所有权
    const word = await this.getWordById(wordId, userId);

    // 使用事务确保删除单词和更新计数的原子性
    await prisma.$transaction([
      prisma.word.delete({
        where: { id: wordId },
      }),
      prisma.wordBook.update({
        where: { id: word.wordBookId },
        data: { wordCount: { decrement: 1 } },
      }),
    ]);
  }

  /**
   * @deprecated 使用 WordBookService.batchImportWords() 代替
   */
  async batchCreateWords(
    userId: string,
    words: (CreateWordDto & { wordBookId?: string })[]
  ) {
    // 获取或创建默认词书
    let defaultWordBook = await prisma.wordBook.findFirst({
      where: { userId, type: 'USER' },
    });

    if (!defaultWordBook) {
      defaultWordBook = await prisma.wordBook.create({
        data: {
          name: '我的单词本',
          type: 'USER',
          userId,
          isPublic: false,
          wordCount: 0,
        },
      });
    }

    const createdWords = await prisma.$transaction(
      words.map((word) =>
        prisma.word.create({
          data: {
            wordBookId: word.wordBookId || defaultWordBook!.id,
            spelling: word.spelling,
            phonetic: word.phonetic ?? '',
            meanings: word.meanings,
            examples: word.examples,
            audioUrl: word.audioUrl ?? undefined,
          },
        })
      )
    );

    // 更新词书单词计数
    await prisma.wordBook.update({
      where: { id: defaultWordBook.id },
      data: { wordCount: { increment: words.length } },
    });

    return createdWords;
  }
}

export default new WordService();
