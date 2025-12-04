import prisma from '../config/database';
import { CreateWordDto, UpdateWordDto } from '../types';

/**
 * WordService - 单词服务（已废弃，使用 WordBookService 代替）
 * 保留此文件以维持向后兼容性
 */
export class WordService {
  /**
   * @deprecated 使用 WordBookService.getWordBookWords() 代替
   * 通过用户ID获取单词 - 只返回用户选择学习的词书中的单词
   */
  async getWordsByUserId(userId: string) {
    // 获取用户的学习配置，查看选择了哪些词书
    const studyConfig = await prisma.userStudyConfig.findUnique({
      where: { userId },
      select: { selectedWordBookIds: true },
    });

    // 如果用户没有配置或没有选择任何词书，返回空数组
    if (!studyConfig || studyConfig.selectedWordBookIds.length === 0) {
      return [];
    }

    // 只返回用户选择的词书中的单词
    return await prisma.word.findMany({
      where: {
        wordBookId: {
          in: studyConfig.selectedWordBookIds,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 简单列表获取（用于测试兼容）
   */
  async getWords(userId?: string) {
    if (userId) {
      return this.getWordsByUserId(userId);
    }
    return await prisma.word.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 获取用户学过的单词（有学习状态记录的）
   * 用于掌握度分析页面，只显示用户真正学习过的单词
   */
  async getLearnedWordsByUserId(userId: string) {
    // 查询有学习状态记录的单词
    const learningStates = await prisma.wordLearningState.findMany({
      where: { userId },
      select: {
        wordId: true,
        word: {
          select: {
            id: true,
            spelling: true,
            phonetic: true,
            meanings: true,
            examples: true,
            audioUrl: true,
            wordBookId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // 提取单词信息
    return learningStates.map((state) => state.word);
  }

  /**
   * @deprecated 使用 WordBookService 中的方法代替
   */
  async getWordById(wordId: string, userId?: string) {
    const word = await prisma.word.findFirst({
      where: { id: wordId },
      include: { wordBook: true },
    });

    if (!word) {
      return null;
    }

    // 如果提供了userId，检查权限
    if (userId) {
      if (
        word.wordBook.type === 'USER' &&
        word.wordBook.userId !== userId
      ) {
        throw new Error('无权访问此单词');
      }
    }

    return word;
  }

  /**
   * @deprecated 使用 WordBookService.addWordToWordBook() 代替
   * 注意：此方法需要指定 wordBookId
   * 支持两种调用方式：createWord(data) 或 createWord(userId, data)
   */
  async createWord(
    userIdOrData: string | (CreateWordDto & { wordBookId?: string; userId?: string }),
    dataOrUndefined?: CreateWordDto & { wordBookId?: string; userId?: string }
  ) {
    let userId: string;
    let data: CreateWordDto & { wordBookId?: string; userId?: string };

    if (typeof userIdOrData === 'string') {
      userId = userIdOrData;
      data = dataOrUndefined!;
    } else {
      data = userIdOrData;
      userId = (userIdOrData as any).userId || '';
    }
    // 如果没有指定词书ID，创建一个默认词书或使用第一个用户词书
    let wordBookId = data.wordBookId || (data as any).wordbookId;

    if (!wordBookId && userId) {
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

    if (!wordBookId) {
      throw new Error('wordBookId is required to create a word');
    }

    const word = await prisma.word.create({
      data: {
        wordBook: { connect: { id: wordBookId } },
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
   * 支持两种调用方式：updateWord(id, data) 或 updateWord(id, userId, data)
   */
  async updateWord(
    wordId: string,
    userIdOrData: string | UpdateWordDto,
    dataOrUndefined?: UpdateWordDto
  ) {
    let data: UpdateWordDto;
    let userId: string | undefined;

    if (typeof userIdOrData === 'string') {
      userId = userIdOrData;
      data = dataOrUndefined!;
      await this.getWordById(wordId, userId);
    } else {
      data = userIdOrData;
    }

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
   * userId参数为可选，用于权限检查
   */
  async deleteWord(wordId: string, userId?: string) {
    const word = await prisma.word.findUnique({
      where: { id: wordId },
    });

    if (!word) {
      return;
    }

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
            wordBook: {
              connect: { id: word.wordBookId || defaultWordBook!.id },
            },
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
