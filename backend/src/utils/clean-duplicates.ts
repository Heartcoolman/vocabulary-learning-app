/**
 * 清理重复的答题记录
 * 在添加唯一约束之前运行此脚本清理重复数据
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDuplicateRecords() {
    console.log('开始清理重复的答题记录...');

    try {
        // 1. 查找所有重复的记录（相同 userId, wordId, timestamp）
        const duplicates = await prisma.$queryRaw<
            Array<{
                userId: string;
                wordId: string;
                timestamp: Date;
                count: bigint;
            }>
        >`
            SELECT "userId", "wordId", "timestamp", COUNT(*) as count
            FROM answer_records
            GROUP BY "userId", "wordId", "timestamp"
            HAVING COUNT(*) > 1
        `;

        console.log(`找到 ${duplicates.length} 组重复记录`);

        if (duplicates.length === 0) {
            console.log('没有重复记录，无需清理');
            return;
        }

        // 2. 对每组重复记录，保留最早创建的一条，删除其余的
        let totalDeleted = 0;

        for (const dup of duplicates) {
            // 获取这组重复记录中的所有记录，按创建时间排序
            const records = await prisma.answerRecord.findMany({
                where: {
                    userId: dup.userId,
                    wordId: dup.wordId,
                    timestamp: dup.timestamp,
                },
                orderBy: {
                    id: 'asc', // 按ID排序，保留最早的
                },
            });

            // 保留第一条，删除其余的
            const idsToDelete = records.slice(1).map(r => r.id);

            if (idsToDelete.length > 0) {
                const result = await prisma.answerRecord.deleteMany({
                    where: {
                        id: {
                            in: idsToDelete,
                        },
                    },
                });

                totalDeleted += result.count;
                console.log(
                    `清理记录: userId=${dup.userId.substring(0, 8)}..., wordId=${dup.wordId.substring(0, 8)}..., ` +
                    `timestamp=${dup.timestamp.toISOString()}, 删除 ${result.count} 条重复记录`
                );
            }
        }

        console.log(`\n清理完成！共删除 ${totalDeleted} 条重复记录`);
    } catch (error) {
        console.error('清理失败:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// 运行清理脚本
cleanDuplicateRecords()
    .then(() => {
        console.log('\n清理脚本执行成功，现在可以运行 prisma migrate dev 了');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n清理脚本执行失败:', error);
        process.exit(1);
    });
