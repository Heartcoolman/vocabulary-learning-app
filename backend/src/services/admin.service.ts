import prisma from '../config/database';
import { UserRole, WordBookType } from '@prisma/client';

export class AdminService {
    /**
     * 获取所有用户列表
     */
    async getAllUsers(options?: {
        page?: number;
        pageSize?: number;
        search?: string;
    }) {
        const page = options?.page || 1;
        const pageSize = options?.pageSize || 20;
        const skip = (page - 1) * pageSize;

        const where = options?.search
            ? {
                OR: [
                    { email: { contains: options.search, mode: 'insensitive' as const } },
                    { username: { contains: options.search, mode: 'insensitive' as const } },
                ],
            }
            : {};

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    username: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            prisma.user.count({ where }),
        ]);

        return {
            users,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    }

    /**
     * 获取用户详情
     */
    async getUserById(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        wordBooks: true,
                        records: true,
                    },
                },
            },
        });

        if (!user) {
            throw new Error('用户不存在');
        }

        return user;
    }

    /**
     * 修改用户角色
     */
    async updateUserRole(userId: string, role: UserRole) {
        return await prisma.user.update({
            where: { id: userId },
            data: { role },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                updatedAt: true,
            },
        });
    }

    /**
     * 删除用户
     */
    async deleteUser(userId: string) {
        // 检查是否为管理员
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });

        if (user?.role === UserRole.ADMIN) {
            throw new Error('不能删除管理员账户');
        }

        await prisma.user.delete({
            where: { id: userId },
        });
    }

    /**
     * 创建系统词库
     */
    async createSystemWordBook(data: {
        name: string;
        description?: string;
        coverImage?: string;
    }) {
        return await prisma.wordBook.create({
            data: {
                name: data.name,
                description: data.description,
                coverImage: data.coverImage,
                type: WordBookType.SYSTEM,
                userId: null,
                isPublic: true,
                wordCount: 0,
            },
        });
    }

    /**
     * 更新系统词库
     */
    async updateSystemWordBook(
        id: string,
        data: {
            name?: string;
            description?: string;
            coverImage?: string;
        }
    ) {
        const wordBook = await prisma.wordBook.findUnique({
            where: { id },
        });

        if (!wordBook) {
            throw new Error('词库不存在');
        }

        if (wordBook.type !== WordBookType.SYSTEM) {
            throw new Error('只能修改系统词库');
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
     * 删除系统词库
     */
    async deleteSystemWordBook(id: string) {
        const wordBook = await prisma.wordBook.findUnique({
            where: { id },
        });

        if (!wordBook) {
            throw new Error('词库不存在');
        }

        if (wordBook.type !== WordBookType.SYSTEM) {
            throw new Error('只能删除系统词库');
        }

        // 清理所有用户学习配置中对该词库的引用
        const studyConfigs = await prisma.userStudyConfig.findMany({
            where: {
                selectedWordBookIds: {
                    has: id,
                },
            },
        });

        // 从每个学习配置中移除该词库ID
        for (const config of studyConfigs) {
            const updatedIds = config.selectedWordBookIds.filter(
                (bookId) => bookId !== id
            );
            await prisma.userStudyConfig.update({
                where: { id: config.id },
                data: { selectedWordBookIds: updatedIds },
            });
        }

        // 删除词库（会级联删除所有相关单词和学习记录）
        await prisma.wordBook.delete({
            where: { id },
        });
    }

    /**
     * 批量添加单词到系统词库
     */
    async batchAddWordsToSystemWordBook(
        wordBookId: string,
        words: Array<{
            spelling: string;
            phonetic: string;
            meanings: string[];
            examples: string[];
            audioUrl?: string;
        }>
    ) {
        const wordBook = await prisma.wordBook.findUnique({
            where: { id: wordBookId },
        });

        if (!wordBook) {
            throw new Error('词库不存在');
        }

        if (wordBook.type !== WordBookType.SYSTEM) {
            throw new Error('只能向系统词库批量添加单词');
        }

        // 使用事务批量创建
        const createdWords = await prisma.$transaction(
            words.map((word) =>
                prisma.word.create({
                    data: {
                        wordBookId,
                        ...word,
                    },
                })
            )
        );

        // 更新词库的单词数量
        await prisma.wordBook.update({
            where: { id: wordBookId },
            data: {
                wordCount: {
                    increment: words.length,
                },
            },
        });

        return createdWords;
    }

    /**
     * 获取系统统计数据
     */
    async getStatistics() {
        const [
            totalUsers,
            totalWordBooks,
            totalWords,
            totalRecords,
            systemWordBooks,
            userWordBooks,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.wordBook.count(),
            prisma.word.count(),
            prisma.answerRecord.count(),
            prisma.wordBook.count({ where: { type: WordBookType.SYSTEM } }),
            prisma.wordBook.count({ where: { type: WordBookType.USER } }),
        ]);

        // 获取最近7天活跃用户
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activeUsers = await prisma.user.count({
            where: {
                records: {
                    some: {
                        timestamp: {
                            gte: sevenDaysAgo,
                        },
                    },
                },
            },
        });

        return {
            totalUsers,
            activeUsers,
            totalWordBooks,
            systemWordBooks,
            userWordBooks,
            totalWords,
            totalRecords,
        };
    }

    /**
     * 获取用户学习数据详情
     */
    async getUserLearningData(userId: string, options?: { limit?: number }) {
        const limit = options?.limit || 50;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
            },
        });

        if (!user) {
            throw new Error('用户不存在');
        }

        // 获取学习记录
        const records = await prisma.answerRecord.findMany({
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
            take: limit,
        });

        // 统计数据
        const totalRecords = await prisma.answerRecord.count({
            where: { userId },
        });

        const correctRecords = await prisma.answerRecord.count({
            where: { userId, isCorrect: true },
        });

        const averageAccuracy =
            totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;

        // 获取学习的单词数（去重）
        const learnedWordsCount = await prisma.answerRecord.groupBy({
            by: ['wordId'],
            where: { userId },
        });

        return {
            user,
            totalRecords,
            correctRecords,
            averageAccuracy: Math.round(averageAccuracy * 100) / 100,
            totalWordsLearned: learnedWordsCount.length,
            recentRecords: records,
        };
    }
}

export default new AdminService();
