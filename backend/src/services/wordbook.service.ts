import prisma from '../config/database';
import { CreateWordBookDto, UpdateWordBookDto } from '../types';
import { WordBookType } from '@prisma/client';

export class WordBookService {
    /**
     * 获取用户的词书列表
     */
    async getUserWordBooks(userId: string) {
        return await prisma.wordBook.findMany({
            where: {
                type: WordBookType.USER,
                userId: userId,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * 获取系统词书列表
     */
    async getSystemWordBooks() {
        return await prisma.wordBook.findMany({
            where: {
                type: WordBookType.SYSTEM,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * 获取所有可用词书（系统词书 + 用户自己的词书）
     */
    async getAllAvailableWordBooks(userId: string) {
        return await prisma.wordBook.findMany({
            where: {
                OR: [
                    { type: WordBookType.SYSTEM },
                    { type: WordBookType.USER, userId: userId },
                ],
            },
            orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
        });
    }

    /**
     * 获取词书详情（带权限检查）
     */
    async getWordBookById(id: string, userId?: string) {
        const wordBook = await prisma.wordBook.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { words: true },
                },
            },
        });

        if (!wordBook) {
            throw new Error('词书不存在');
        }

        // 检查权限：系统词书所有人可见，用户词书只能本人查看
        if (wordBook.type === WordBookType.USER && wordBook.userId !== userId) {
            throw new Error('无权访问此词书');
        }

        return {
            ...wordBook,
            wordCount: wordBook._count.words,
        };
    }

    /**
     * 创建用户词书
     */
    async createWordBook(userId: string, data: CreateWordBookDto) {
        return await prisma.wordBook.create({
            data: {
                name: data.name,
                description: data.description,
                coverImage: data.coverImage,
                type: WordBookType.USER,
                userId: userId,
                isPublic: false,
                wordCount: 0,
            },
        });
    }

    /**
     * 更新词书（仅用户词书）
     */
    async updateWordBook(id: string, userId: string, data: UpdateWordBookDto) {
        // 验证词书所有权
        const wordBook = await this.getWordBookById(id, userId);

        if (wordBook.type === WordBookType.SYSTEM) {
            throw new Error('无法修改系统词书');
        }

        if (wordBook.userId !== userId) {
            throw new Error('无权修改此词书');
        }

        return await prisma.wordBook.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                coverImage: data.coverImage,
            },
        });
    }

    /**
     * 删除词书（仅用户词书）
     */
    async deleteWordBook(id: string, userId: string) {
        // 验证词书所有权
        const wordBook = await this.getWordBookById(id, userId);

        if (wordBook.type === WordBookType.SYSTEM) {
            throw new Error('无法删除系统词书');
        }

        if (wordBook.userId !== userId) {
            throw new Error('无权删除此词书');
        }

        await prisma.wordBook.delete({
            where: { id },
        });
    }

    /**
     * 获取词书中的单词列表
     */
    async getWordBookWords(wordBookId: string, userId?: string) {
        // 先验证权限
        await this.getWordBookById(wordBookId, userId);

        return await prisma.word.findMany({
            where: { wordBookId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * 向词书添加单词（需要权限检查）
     */
    async addWordToWordBook(
        wordBookId: string,
        userId: string,
        wordData: {
            spelling: string;
            phonetic: string;
            meanings: string[];
            examples: string[];
            audioUrl?: string;
        }
    ) {
        // 验证词书所有权
        const wordBook = await this.getWordBookById(wordBookId, userId);

        if (wordBook.type === WordBookType.SYSTEM) {
            throw new Error('无法向系统词书添加单词');
        }

        if (wordBook.userId !== userId) {
            throw new Error('无权向此词书添加单词');
        }

        // 使用事务确保创建单词和更新计数的原子性
        const [word] = await prisma.$transaction([
            prisma.word.create({
                data: {
                    wordBookId,
                    spelling: wordData.spelling,
                    phonetic: wordData.phonetic,
                    meanings: wordData.meanings,
                    examples: wordData.examples,
                    audioUrl: wordData.audioUrl,
                },
            }),
            prisma.wordBook.update({
                where: { id: wordBookId },
                data: {
                    wordCount: {
                        increment: 1,
                    },
                },
            }),
        ]);

        return word;
    }

    /**
     * 从词书删除单词（需要权限检查）
     */
    async removeWordFromWordBook(
        wordBookId: string,
        wordId: string,
        userId: string
    ) {
        // 验证词书所有权
        const wordBook = await this.getWordBookById(wordBookId, userId);

        if (wordBook.type === WordBookType.SYSTEM) {
            throw new Error('无法从系统词书删除单词');
        }

        if (wordBook.userId !== userId) {
            throw new Error('无权从此词书删除单词');
        }

        // 验证单词属于该词书
        const word = await prisma.word.findFirst({
            where: { id: wordId, wordBookId },
        });

        if (!word) {
            throw new Error('单词不存在或不属于此词书');
        }

        // 使用事务确保删除单词和更新计数的原子性
        await prisma.$transaction([
            prisma.word.delete({
                where: { id: wordId },
            }),
            prisma.wordBook.update({
                where: { id: wordBookId },
                data: {
                    wordCount: {
                        decrement: 1,
                    },
                },
            }),
        ]);
    }

    /**
     * 批量导入单词到词书（主要用于管理员导入系统词书）
     */
    async batchImportWords(
        wordBookId: string,
        words: Array<{
            spelling: string;
            phonetic: string;
            meanings: string[];
            examples: string[];
            audioUrl?: string;
        }>
    ) {
        // 使用事务确保批量创建单词和更新计数的原子性
        const result = await prisma.$transaction(async (tx) => {
            // 批量创建单词
            const createdWords = await Promise.all(
                words.map((word) =>
                    tx.word.create({
                        data: {
                            wordBookId,
                            ...word,
                        },
                    })
                )
            );

            // 更新词书的单词数量
            await tx.wordBook.update({
                where: { id: wordBookId },
                data: {
                    wordCount: {
                        increment: words.length,
                    },
                },
            });

            return createdWords;
        });

        return result;
    }
}

export default new WordBookService();
