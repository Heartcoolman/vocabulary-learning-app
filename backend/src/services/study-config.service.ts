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
                config,
                message: '请先选择学习词书',
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
            throw new Error('配置的词书已不可访问，请重新配置学习计划');
        }

        // 只从有权限的词书中获取单词
        const words = await prisma.word.findMany({
            where: {
                wordBookId: {
                    in: accessibleIds,
                },
            },
            take: config.dailyWordCount,
            orderBy:
                config.studyMode === 'random'
                    ? { createdAt: 'desc' } // TODO: 实现真正的随机
                    : { createdAt: 'asc' },
        });

        return {
            words,
            config,
            totalAvailable: await prisma.word.count({
                where: {
                    wordBookId: {
                        in: accessibleIds,
                    },
                },
            }),
        };
    }

    /**
     * 获取学习进度
     */
    async getStudyProgress(userId: string) {
        const config = await this.getUserStudyConfig(userId);

        if (config.selectedWordBookIds.length === 0) {
            return {
                totalWords: 0,
                learnedWords: 0,
                progress: 0,
            };
        }

        // 总单词数
        const totalWords = await prisma.word.count({
            where: {
                wordBookId: {
                    in: config.selectedWordBookIds,
                },
            },
        });

        // 已学习的单词数（有答题记录的）
        const learnedWordsCount = await prisma.answerRecord.groupBy({
            by: ['wordId'],
            where: {
                userId,
                word: {
                    wordBookId: {
                        in: config.selectedWordBookIds,
                    },
                },
            },
        });

        const learnedWords = learnedWordsCount.length;

        return {
            totalWords,
            learnedWords,
            progress: totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0,
        };
    }
}

export default new StudyConfigService();
