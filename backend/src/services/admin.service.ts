import prisma from '../config/database';
import { UserRole, WordBookType } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

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
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            prisma.user.count({ where }),
        ]);

        // 为每个用户获取统计数据
        const usersWithStats = await Promise.all(
            users.map(async (user) => {
                const [learnedWords, scoreAvg, totalRecords, correctRecords, lastRecord] = await Promise.all([
                    prisma.answerRecord.groupBy({
                        by: ['wordId'],
                        where: { userId: user.id },
                    }),
                    prisma.wordScore.aggregate({
                        where: { userId: user.id },
                        _avg: { totalScore: true },
                    }),
                    prisma.answerRecord.count({ where: { userId: user.id } }),
                    prisma.answerRecord.count({ where: { userId: user.id, isCorrect: true } }),
                    prisma.answerRecord.findFirst({
                        where: { userId: user.id },
                        orderBy: { timestamp: 'desc' },
                        select: { timestamp: true },
                    }),
                ]);

                const accuracy = totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;

                return {
                    ...user,
                    totalWordsLearned: learnedWords.length,
                    averageScore: scoreAvg._avg.totalScore ?? 0,
                    accuracy,
                    lastLearningTime: lastRecord?.timestamp.toISOString() ?? null,
                };
            })
        );

        return {
            users: usersWithStats,
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

    /**
     * 获取用户详细统计数据
     */
    async getUserDetailedStatistics(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new Error('用户不存在');
        }

        const [
            totalRecords,
            correctRecords,
            learnedWordsCount,
            scoreAggregate,
            masteryGroups,
            timeRecords,
        ] = await Promise.all([
            prisma.answerRecord.count({ where: { userId } }),
            prisma.answerRecord.count({ where: { userId, isCorrect: true } }),
            prisma.answerRecord.groupBy({
                by: ['wordId'],
                where: { userId },
            }),
            prisma.wordScore.aggregate({
                where: { userId },
                _avg: { totalScore: true },
            }),
            prisma.wordLearningState.groupBy({
                by: ['masteryLevel'],
                where: { userId },
                _count: true,
            }),
            prisma.answerRecord.findMany({
                where: { userId },
                select: { timestamp: true, responseTime: true, dwellTime: true },
            }),
        ]);

        const accuracy = totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;
        const averageScore = scoreAggregate._avg.totalScore ?? 0;

        const masteryDistribution: Record<string, number> = {
            level0: 0,
            level1: 0,
            level2: 0,
            level3: 0,
            level4: 0,
            level5: 0,
        };
        masteryGroups.forEach((item) => {
            const key = `level${item.masteryLevel}`;
            if (key in masteryDistribution) {
                masteryDistribution[key] = item._count;
            }
        });

        const dateStrings = timeRecords.map((r) => r.timestamp.toISOString().split('T')[0]);
        const uniqueDates = new Set(dateStrings);
        const studyDays = uniqueDates.size;

        // 计算连续学习天数（从今天开始往前连续的自然日）
        let consecutiveDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 0; ; i++) {
            const check = new Date(today);
            check.setDate(today.getDate() - i);
            const key = check.toISOString().split('T')[0];
            if (uniqueDates.has(key)) {
                consecutiveDays += 1;
            } else {
                break;
            }
        }

        const totalStudyTimeMs = timeRecords.reduce((sum, r) => {
            return sum + (r.responseTime || 0) + (r.dwellTime || 0);
        }, 0);
        const totalStudyTime = Math.round(totalStudyTimeMs / 60000);

        return {
            user,
            masteryDistribution,
            studyDays,
            consecutiveDays,
            totalStudyTime,
            totalWordsLearned: learnedWordsCount.length,
            averageScore,
            accuracy,
        };
    }

    /**
     * 导出用户单词数据
     */
    async exportUserWords(userId: string, format: 'csv' | 'excel' = 'csv') {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true },
        });

        if (!user) {
            throw new Error('用户不存在');
        }

        // 获取用户的所有单词及学习状态
        const learningStates = await prisma.wordLearningState.findMany({
            where: { userId },
            include: {
                word: {
                    select: {
                        spelling: true,
                        phonetic: true,
                        meanings: true,
                        examples: true,
                    },
                },
            },
        });

        // 准备导出数据
        const exportData = learningStates.map((state) => ({
            spelling: state.word.spelling,
            phonetic: state.word.phonetic,
            meanings: state.word.meanings.join('; '),
            examples: state.word.examples.join('; '),
            masteryLevel: state.masteryLevel,
            state: state.state,
            reviewCount: state.reviewCount,
            lastReviewDate: state.lastReviewDate?.toISOString() || '',
            nextReviewDate: state.nextReviewDate?.toISOString() || '',
        }));

        if (format === 'csv') {
            const csv = stringify(exportData, {
                header: true,
                columns: {
                    spelling: 'Spelling',
                    phonetic: 'Phonetic',
                    meanings: 'Meanings',
                    examples: 'Examples',
                    masteryLevel: 'Mastery Level',
                    state: 'State',
                    reviewCount: 'Review Count',
                    lastReviewDate: 'Last Review Date',
                    nextReviewDate: 'Next Review Date',
                },
            });

            return {
                data: csv,
                filename: `${user.username}_words_${new Date().toISOString().split('T')[0]}.csv`,
                contentType: 'text/csv',
            };
        } else {
            // Excel 格式
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Words');

            worksheet.columns = [
                { header: 'Spelling', key: 'spelling', width: 20 },
                { header: 'Phonetic', key: 'phonetic', width: 20 },
                { header: 'Meanings', key: 'meanings', width: 40 },
                { header: 'Examples', key: 'examples', width: 50 },
                { header: 'Mastery Level', key: 'masteryLevel', width: 15 },
                { header: 'State', key: 'state', width: 15 },
                { header: 'Review Count', key: 'reviewCount', width: 15 },
                { header: 'Last Review Date', key: 'lastReviewDate', width: 20 },
                { header: 'Next Review Date', key: 'nextReviewDate', width: 20 },
            ];

            exportData.forEach((row) => {
                worksheet.addRow(row);
            });

            const buffer = await workbook.xlsx.writeBuffer();

            return {
                data: buffer,
                filename: `${user.username}_words_${new Date().toISOString().split('T')[0]}.xlsx`,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
        }
    }

    /**
     * 获取用户单词列表（支持分页、排序、筛选）
     */
    async getUserWords(
        userId: string,
        params: {
            page?: number;
            pageSize?: number;
            sortBy?: string;
            sortOrder?: 'asc' | 'desc';
            state?: string;
            search?: string;
            scoreRange?: 'low' | 'medium' | 'high';
            masteryLevel?: number;
            minAccuracy?: number;
        }
    ) {
        const page = params.page || 1;
        const pageSize = Math.min(params.pageSize || 20, 200); // 限制最大分页大小
        const skip = (page - 1) * pageSize;
        const sortOrder = params.sortOrder || 'desc';

        const needsScore = params.scoreRange || params.minAccuracy !== undefined ||
                          params.sortBy === 'score' || params.sortBy === 'accuracy';

        // 当需要按score/accuracy筛选或排序时，先在word_scores表上操作
        if (needsScore) {
            const scoreWhere: any = { userId };

            // 按得分范围筛选
            if (params.scoreRange === 'low') {
                scoreWhere.totalScore = { lt: 40 };
            } else if (params.scoreRange === 'medium') {
                scoreWhere.totalScore = { gte: 40, lt: 70 };
            } else if (params.scoreRange === 'high') {
                scoreWhere.totalScore = { gte: 70 };
            }

            // 按准确率筛选
            if (params.minAccuracy !== undefined) {
                scoreWhere.recentAccuracy = { gte: params.minAccuracy / 100 };
            }

            // 确定排序字段
            const orderBy = params.sortBy === 'accuracy'
                ? { recentAccuracy: sortOrder }
                : { totalScore: sortOrder };

            // 在word_scores表上进行筛选、排序和分页
            const [scoreRows, total] = await Promise.all([
                prisma.wordScore.findMany({
                    where: scoreWhere,
                    orderBy,
                    skip,
                    take: pageSize,
                    select: {
                        wordId: true,
                        totalScore: true,
                        recentAccuracy: true,
                        totalAttempts: true,
                        correctAttempts: true,
                    },
                }),
                prisma.wordScore.count({ where: scoreWhere }),
            ]);

            if (scoreRows.length === 0) {
                return {
                    words: [],
                    pagination: { page, pageSize, total: 0, totalPages: 0 },
                };
            }

            const wordIds = scoreRows.map((s) => s.wordId);

            // 回查对应的学习状态
            const stateWhere: any = { userId, wordId: { in: wordIds } };
            if (params.state) {
                stateWhere.state = params.state.toUpperCase();
            }
            if (params.masteryLevel !== undefined) {
                stateWhere.masteryLevel = params.masteryLevel;
            }

            const states = await prisma.wordLearningState.findMany({
                where: stateWhere,
                include: {
                    word: {
                        select: {
                            id: true,
                            spelling: true,
                            phonetic: true,
                            meanings: true,
                            examples: true,
                        },
                    },
                },
            });

            const stateMap = new Map(states.map((s) => [s.wordId, s]));

            // 按照scoreRows的顺序组装结果
            const words = scoreRows.map((score) => {
                const state = stateMap.get(score.wordId);
                const accuracy = score.recentAccuracy != null
                    ? score.recentAccuracy * 100
                    : score.totalAttempts > 0
                        ? (score.correctAttempts / score.totalAttempts) * 100
                        : 0;

                return {
                    word: state?.word,
                    score: score.totalScore ?? 0,
                    masteryLevel: state?.masteryLevel ?? 0,
                    accuracy,
                    reviewCount: state?.reviewCount ?? 0,
                    lastReviewDate: state?.lastReviewDate ?? null,
                    nextReviewDate: state?.nextReviewDate ?? null,
                    state: state?.state ?? 'NEW',
                };
            });

            return {
                words,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize),
                },
            };
        }

        // 非score/accuracy情况：以word_learning_state为主
        const whereState: any = { userId };
        if (params.state) {
            whereState.state = params.state.toUpperCase();
        }
        if (params.masteryLevel !== undefined) {
            whereState.masteryLevel = params.masteryLevel;
        }
        if (params.search) {
            whereState.word = {
                spelling: { contains: params.search, mode: 'insensitive' },
            };
        }

        const orderBy: any = {};
        switch (params.sortBy) {
            case 'reviewCount':
                orderBy.reviewCount = sortOrder;
                break;
            case 'lastReview':
                orderBy.lastReviewDate = sortOrder;
                break;
            case 'spelling':
                orderBy.word = { spelling: sortOrder };
                break;
            case 'masteryLevel':
                orderBy.masteryLevel = sortOrder;
                break;
            default:
                orderBy.updatedAt = sortOrder;
        }

        const [learningStates, total] = await Promise.all([
            prisma.wordLearningState.findMany({
                where: whereState,
                include: {
                    word: {
                        select: {
                            id: true,
                            spelling: true,
                            phonetic: true,
                            meanings: true,
                            examples: true,
                        },
                    },
                },
                orderBy,
                skip,
                take: pageSize,
            }),
            prisma.wordLearningState.count({ where: whereState }),
        ]);

        // 批量获取这一页单词的得分数据
        const wordIds = learningStates.map((s) => s.wordId);
        const scores = wordIds.length > 0 ? await prisma.wordScore.findMany({
            where: { userId, wordId: { in: wordIds } },
            select: {
                wordId: true,
                totalScore: true,
                recentAccuracy: true,
                totalAttempts: true,
                correctAttempts: true,
            },
        }) : [];

        const scoreMap = new Map(scores.map(s => [s.wordId, s]));

        const words = learningStates.map((state) => {
            const score = scoreMap.get(state.wordId);
            const accuracy = score?.recentAccuracy !== null && score?.recentAccuracy !== undefined
                ? score.recentAccuracy * 100
                : score && score.totalAttempts > 0
                    ? (score.correctAttempts / score.totalAttempts) * 100
                    : 0;

            return {
                word: state.word,
                score: score?.totalScore ?? 0,
                masteryLevel: state.masteryLevel,
                accuracy,
                reviewCount: state.reviewCount,
                lastReviewDate: state.lastReviewDate,
                nextReviewDate: state.nextReviewDate,
                state: state.state,
            };
        });

        return {
            words,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    }

    /**
     * 获取单词的完整学习历史
     */
    async getWordLearningHistory(
        userId: string,
        wordId: string,
        options?: { limit?: number }
    ) {
        const limit = options?.limit || 100;

        const [word, wordState, wordScore, records] = await Promise.all([
            prisma.word.findUnique({
                where: { id: wordId },
                select: {
                    id: true,
                    spelling: true,
                    phonetic: true,
                    meanings: true,
                    examples: true,
                },
            }),
            prisma.wordLearningState.findUnique({
                where: {
                    unique_user_word: { userId, wordId },
                },
                select: {
                    masteryLevel: true,
                    easeFactor: true,
                    reviewCount: true,
                    lastReviewDate: true,
                    nextReviewDate: true,
                    state: true,
                },
            }),
            prisma.wordScore.findUnique({
                where: {
                    unique_user_word_score: { userId, wordId },
                },
                select: {
                    totalScore: true,
                    accuracyScore: true,
                    speedScore: true,
                    stabilityScore: true,
                    proficiencyScore: true,
                    updatedAt: true,
                },
            }),
            prisma.answerRecord.findMany({
                where: { userId, wordId },
                select: {
                    id: true,
                    timestamp: true,
                    selectedAnswer: true,
                    correctAnswer: true,
                    isCorrect: true,
                    responseTime: true,
                    dwellTime: true,
                    masteryLevelBefore: true,
                    masteryLevelAfter: true,
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
            }),
        ]);

        return {
            word,
            wordState,
            wordScore: wordScore ? { ...wordScore, lastCalculated: wordScore.updatedAt } : null,
            records,
        };
    }

    /**
     * 获取单词得分的历史变化
     */
    async getWordScoreHistory(userId: string, wordId: string) {
        // 获取当前得分
        const currentScore = await prisma.wordScore.findUnique({
            where: {
                unique_user_word_score: {
                    userId,
                    wordId,
                },
            },
        });

        // 获取学习记录，用于构建历史得分趋势
        const records = await prisma.answerRecord.findMany({
            where: {
                userId,
                wordId,
            },
            orderBy: { timestamp: 'asc' },
        });

        // 构建历史得分数据（基于学习记录）
        const scoreHistory = records.map((record, index) => {
            const correctCount = records.slice(0, index + 1).filter((r) => r.isCorrect).length;
            const totalCount = index + 1;
            const accuracy = correctCount / totalCount;

            return {
                timestamp: record.timestamp.toISOString(),
                score: accuracy * 100,
                masteryLevel: record.masteryLevelAfter,
                isCorrect: record.isCorrect,
            };
        });

        return {
            currentScore: currentScore?.totalScore || 0,
            scoreHistory,
        };
    }

    /**
     * 获取用户学习热力图数据
     */
    async getUserLearningHeatmap(userId: string, options?: { days?: number }) {
        const days = options?.days || 90;

        // 计算起始日期
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // 获取指定时间范围内的学习记录
        const records = await prisma.answerRecord.findMany({
            where: {
                userId,
                timestamp: { gte: startDate },
            },
            select: {
                timestamp: true,
                wordId: true,
                isCorrect: true,
                responseTime: true,
                dwellTime: true,
            },
        });

        // 按日期聚合数据
        const dailyData = new Map<string, {
            recordCount: number;
            correctCount: number;
            totalTime: number;
            wordIds: Set<string>;
        }>();

        records.forEach((record) => {
            const date = record.timestamp.toISOString().split('T')[0];
            const existing = dailyData.get(date) || {
                recordCount: 0,
                correctCount: 0,
                totalTime: 0,
                wordIds: new Set<string>(),
            };

            existing.recordCount++;
            if (record.isCorrect) {
                existing.correctCount++;
            }
            existing.totalTime += (record.responseTime || 0) + (record.dwellTime || 0);
            existing.wordIds.add(record.wordId);

            dailyData.set(date, existing);
        });

        // 生成完整的日期范围（包括没有记录的日期）
        const heatmapData = [];
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const data = dailyData.get(dateStr);

            const recordCount = data?.recordCount || 0;
            const correctCount = data?.correctCount || 0;
            const uniqueWords = data?.wordIds.size || 0;

            heatmapData.push({
                date: dateStr,
                activityLevel: recordCount,
                accuracy: recordCount > 0 ? (correctCount / recordCount) : 0,
                averageScore: recordCount > 0 ? (correctCount / recordCount) * 100 : 0,
                uniqueWords,
            });
        }

        // 按日期排序（从旧到新）
        heatmapData.sort((a, b) => a.date.localeCompare(b.date));

        return heatmapData;
    }

    /**
     * 标记异常学习记录
     */
    async flagAnomalyRecord(data: {
        userId: string;
        wordId: string;
        flaggedBy: string;
        reason: string;
    }) {
        // 使用 upsert 创建或更新异常标记
        const flag = await prisma.anomalyFlag.upsert({
            where: {
                userId_wordId: {
                    userId: data.userId,
                    wordId: data.wordId,
                },
            },
            create: {
                userId: data.userId,
                wordId: data.wordId,
                flaggedBy: data.flaggedBy,
                reason: data.reason,
            },
            update: {
                flaggedBy: data.flaggedBy,
                reason: data.reason,
                flaggedAt: new Date(),
                resolved: false,
                resolvedAt: null,
                resolvedBy: null,
            },
        });

        return flag;
    }

    /**
     * 获取异常标记列表
     */
    async getAnomalyFlags(userId: string, wordId?: string) {
        const where: any = { userId };

        if (wordId) {
            where.wordId = wordId;
        }

        const flags = await prisma.anomalyFlag.findMany({
            where,
            orderBy: { flaggedAt: 'desc' },
        });

        return flags;
    }
}

export default new AdminService();
