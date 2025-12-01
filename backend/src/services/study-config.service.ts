import prisma from '../config/database';
import { StudyConfigDto } from '../types';

export class StudyConfigService {
    /**
     * 获取用户学习配置
     */
    async getUserStudyConfig(userId: string) {
        let config = await prisma.userStudyConfig.findUnique({
            where: { userId },
        });

        // 如果不存在，创建默认配置
        if (!config) {
            config = await prisma.userStudyConfig.create({
                data: {
                    userId,
                    selectedWordBookIds: [],
                    dailyWordCount: 20,
                    studyMode: 'sequential',
                },
            });
        }

        return config;
    }

    /**
     * 更新学习配置
     */
    async updateStudyConfig(userId: string, data: StudyConfigDto) {
        // 安全校验：验证所有选中的词书是否为当前用户可访问的（系统词书或用户自己的）
        if (data.selectedWordBookIds.length > 0) {
            const accessibleWordBooks = await prisma.wordBook.findMany({
                where: {
                    id: { in: data.selectedWordBookIds },
                    OR: [
                        { type: 'SYSTEM' },
                        { type: 'USER', userId: userId },
                    ],
                },
                select: { id: true },
            });

            const accessibleIds = new Set(accessibleWordBooks.map(wb => wb.id));
            const unauthorizedIds = data.selectedWordBookIds.filter(id => !accessibleIds.has(id));

            if (unauthorizedIds.length > 0) {
                throw new Error(`无权访问以下词书: ${unauthorizedIds.join(', ')}`);
            }
        }

        return await prisma.userStudyConfig.upsert({
            where: { userId },
            update: {
                selectedWordBookIds: data.selectedWordBookIds,
                dailyWordCount: data.dailyWordCount,
                studyMode: data.studyMode || 'sequential',
            },
            create: {
                userId,
                selectedWordBookIds: data.selectedWordBookIds,
                dailyWordCount: data.dailyWordCount,
                studyMode: data.studyMode || 'sequential',
            },
        });
    }

    /**
     * 获取今日学习单词列表
     */
    async getTodayWords(userId: string) {
        // 获取用户配置
        const config = await this.getUserStudyConfig(userId);

        if (config.selectedWordBookIds.length === 0) {
            return {
                words: [],
                progress: {
                    todayStudied: 0,
                    todayTarget: config.dailyWordCount,
                    totalStudied: 0,
                    correctRate: 0,
                },
            };
        }

        // 安全校验：再次验证词书权限（防止配置被篡改）
        const accessibleWordBooks = await prisma.wordBook.findMany({
            where: {
                id: { in: config.selectedWordBookIds },
                OR: [
                    { type: 'SYSTEM' },
                    { type: 'USER', userId: userId },
                ],
            },
            select: { id: true },
        });

        const accessibleIds = accessibleWordBooks.map(wb => wb.id);

        if (accessibleIds.length === 0) {
            return {
                words: [],
                progress: {
                    todayStudied: 0,
                    todayTarget: config.dailyWordCount,
                    totalStudied: 0,
                    correctRate: 0,
                },
            };
        }

        // 获取用户所有已有学习状态的单词ID（用于排除）
        const allLearnedStates = await prisma.wordLearningState.findMany({
            where: {
                userId,
                word: { wordBookId: { in: accessibleIds } }
            },
            include: { word: true },
        });
        const learnedWordIds = allLearnedStates.map(s => s.wordId);

        // 获取所有单词的得分信息
        const wordScores = await prisma.wordScore.findMany({
            where: {
                userId,
                wordId: { in: learnedWordIds }
            },
        });
        const scoreMap = new Map(wordScores.map(s => [s.wordId, s]));

        // 1. 获取到期需要复习的单词（带优先级计算）
        // 修复：纳入已学习过的NEW状态单词（reviewCount > 0 表示已经学习过）
        const now = new Date();
        const dueStates = allLearnedStates
            .filter(s =>
                s.nextReviewDate &&
                s.nextReviewDate <= now &&
                (['LEARNING', 'REVIEWING'].includes(s.state) || s.state === 'NEW')
            )
            .map(state => {
                const score = scoreMap.get(state.wordId);
                const overdueDays = (now.getTime() - state.nextReviewDate!.getTime()) / (24 * 60 * 60 * 1000);
                const errorRate = score && score.totalAttempts > 0
                    ? 1 - (score.correctAttempts / score.totalAttempts)
                    : 0;

                // 计算优先级：逾期时间 + 错误率 + 低分
                let priority = 0;
                priority += Math.min(40, overdueDays * 5); // 逾期越久优先级越高
                priority += errorRate > 0.5 ? 30 : errorRate * 60; // 错误率高优先
                priority += score ? (100 - score.totalScore) * 0.3 : 30; // 得分低优先

                return { state, word: state.word, priority };
            })
            .sort((a, b) => b.priority - a.priority); // 优先级高的排前面

        // 2. 补充新词（排除已有学习状态的单词）
        let newWords: any[] = [];
        const dueCount = Math.min(dueStates.length, config.dailyWordCount);
        const needNewCount = config.dailyWordCount - dueCount;

        if (needNewCount > 0) {
            if (config.studyMode === 'random') {
                // 随机模式：使用 PostgreSQL 原生随机排序
                newWords = await prisma.$queryRaw<Array<{
                    id: string;
                    spelling: string;
                    phonetic: string;
                    meanings: string[];
                    examples: string[];
                    audioUrl: string | null;
                    wordBookId: string;
                    createdAt: Date;
                    updatedAt: Date;
                }>>`
                    SELECT * FROM "Word"
                    WHERE "wordBookId" = ANY(${accessibleIds})
                      AND id NOT IN (SELECT unnest(${learnedWordIds}::text[]))
                    ORDER BY RANDOM()
                    LIMIT ${needNewCount}
                `;
            } else {
                // 顺序模式：按创建时间排序
                newWords = await prisma.word.findMany({
                    where: {
                        wordBookId: { in: accessibleIds },
                        id: { notIn: learnedWordIds }
                    },
                    orderBy: { createdAt: 'asc' },
                    take: needNewCount,
                });
            }
        }

        // 3. 合并：到期复习词 + 新词，并添加 isNew 标记
        const dueWords = dueStates.slice(0, dueCount).map(d => ({
            ...d.word,
            isNew: false  // 复习词不是新词
        }));
        const newWordsWithFlag = newWords.map(w => ({
            ...w,
            isNew: true  // 新词
        }));
        const words = [...dueWords, ...newWordsWithFlag];

        // 计算学习进度
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 今日已学习的单词数
        const todayRecords = await prisma.answerRecord.groupBy({
            by: ['wordId'],
            where: {
                userId,
                timestamp: { gte: today },
                word: {
                    wordBookId: { in: accessibleIds },
                },
            },
        });

        // 总学习单词数
        const totalStudiedRecords = await prisma.answerRecord.groupBy({
            by: ['wordId'],
            where: {
                userId,
                word: {
                    wordBookId: { in: accessibleIds },
                },
            },
        });

        // 总答题记录统计（计算正确率）
        const allRecords = await prisma.answerRecord.findMany({
            where: {
                userId,
                word: {
                    wordBookId: { in: accessibleIds },
                },
            },
            select: {
                isCorrect: true,
            },
        });

        const correctCount = allRecords.filter(r => r.isCorrect).length;
        const correctRate = allRecords.length > 0 ? Math.round((correctCount / allRecords.length) * 100) : 0;

        return {
            words,
            progress: {
                todayStudied: todayRecords.length,
                todayTarget: config.dailyWordCount,
                totalStudied: totalStudiedRecords.length,
                correctRate,
            },
        };
    }

    /**
     * 获取学习进度
     */
    async getStudyProgress(userId: string) {
        const config = await this.getUserStudyConfig(userId);

        if (config.selectedWordBookIds.length === 0) {
            return {
                todayStudied: 0,
                todayTarget: config.dailyWordCount,
                totalStudied: 0,
                correctRate: 0,
            };
        }

        // 安全校验：验证词书权限
        const accessibleWordBooks = await prisma.wordBook.findMany({
            where: {
                id: { in: config.selectedWordBookIds },
                OR: [
                    { type: 'SYSTEM' },
                    { type: 'USER', userId: userId },
                ],
            },
            select: { id: true },
        });

        const accessibleIds = accessibleWordBooks.map(wb => wb.id);

        if (accessibleIds.length === 0) {
            return {
                todayStudied: 0,
                todayTarget: config.dailyWordCount,
                totalStudied: 0,
                correctRate: 0,
            };
        }

        // 计算今日学习进度
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayRecords = await prisma.answerRecord.groupBy({
            by: ['wordId'],
            where: {
                userId,
                timestamp: { gte: today },
                word: {
                    wordBookId: { in: accessibleIds },
                },
            },
        });

        // 总学习单词数
        const totalStudiedRecords = await prisma.answerRecord.groupBy({
            by: ['wordId'],
            where: {
                userId,
                word: {
                    wordBookId: { in: accessibleIds },
                },
            },
        });

        // 总答题记录统计（计算正确率）
        const allRecords = await prisma.answerRecord.findMany({
            where: {
                userId,
                word: {
                    wordBookId: { in: accessibleIds },
                },
            },
            select: {
                isCorrect: true,
            },
        });

        const correctCount = allRecords.filter(r => r.isCorrect).length;
        const correctRate = allRecords.length > 0 ? Math.round((correctCount / allRecords.length) * 100) : 0;

        return {
            todayStudied: todayRecords.length,
            todayTarget: config.dailyWordCount,
            totalStudied: totalStudiedRecords.length,
            correctRate,
        };
    }
}

export default new StudyConfigService();
