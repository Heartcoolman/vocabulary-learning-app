import prisma from '../config/database';
import { CreateWordDto, UpdateWordDto } from '../types';

export class WordService {
  async getWordsByUserId(userId: string) {
    return await prisma.word.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWordById(wordId: string, userId: string) {
    const word = await prisma.word.findFirst({
      where: { id: wordId, userId },
    });

    if (!word) {
      throw new Error('单词不存在');
    }

    return word;
  }

  async createWord(userId: string, data: CreateWordDto) {
    return await prisma.word.create({
      data: {
        userId,
        spelling: data.spelling,
        phonetic: data.phonetic ?? '',
        meanings: data.meanings,
        examples: data.examples,
        audioUrl: data.audioUrl ?? undefined,
      },
    });
  }

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

  async deleteWord(wordId: string, userId: string) {
    // 验证单词所有权
    await this.getWordById(wordId, userId);

    await prisma.word.delete({
      where: { id: wordId },
    });
  }

  async batchCreateWords(userId: string, words: CreateWordDto[]) {
    // 使用事务批量创建并返回创建的单词
    const createdWords = await prisma.$transaction(
      words.map(word =>
        prisma.word.create({
          data: {
            userId,
            spelling: word.spelling,
            phonetic: word.phonetic ?? '',
            meanings: word.meanings,
            examples: word.examples,
            audioUrl: word.audioUrl ?? undefined,
          },
        })
      )
    );

    return createdWords;
  }
}

export default new WordService();
