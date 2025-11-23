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
