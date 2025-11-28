/**
 * 模拟测试数据清理脚本
 *
 * 用法:
 *   npx ts-node tests/simulation/cleanup-simulation-data.ts
 *
 * 或通过 npm 脚本:
 *   npm run test:simulation:cleanup
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// 加载环境变量
config({ path: resolve(__dirname, '../../.env.test') });
config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CleanupStats {
  usersDeleted: number;
  wordbooksDeleted: number;
  wordsDeleted: number;
  answerRecordsDeleted: number;
  stateHistoryDeleted: number;
  wordLearningStatesDeleted: number;
  learningSessionsDeleted: number;
  habitProfilesDeleted: number;
}

async function cleanupSimulationData(): Promise<CleanupStats> {
  console.log('开始清理模拟测试数据...\n');

  const stats: CleanupStats = {
    usersDeleted: 0,
    wordbooksDeleted: 0,
    wordsDeleted: 0,
    answerRecordsDeleted: 0,
    stateHistoryDeleted: 0,
    wordLearningStatesDeleted: 0,
    learningSessionsDeleted: 0,
    habitProfilesDeleted: 0,
  };

  try {
    // 1. 查找所有模拟测试用户
    const simUsers = await prisma.user.findMany({
      where: { username: { startsWith: 'sim_test_' } },
      select: { id: true, username: true },
    });

    console.log(`找到 ${simUsers.length} 个模拟测试用户`);

    // 2. 删除用户相关数据
    for (const user of simUsers) {
      // 删除答题记录
      const answerResult = await prisma.answerRecord.deleteMany({
        where: { userId: user.id },
      });
      stats.answerRecordsDeleted += answerResult.count;

      // 删除状态历史
      const stateHistoryResult = await prisma.userStateHistory.deleteMany({
        where: { userId: user.id },
      });
      stats.stateHistoryDeleted += stateHistoryResult.count;

      // 删除单词学习状态
      const wordStateResult = await prisma.wordLearningState.deleteMany({
        where: { userId: user.id },
      });
      stats.wordLearningStatesDeleted += wordStateResult.count;

      // 删除学习会话
      const sessionResult = await prisma.learningSession.deleteMany({
        where: { userId: user.id },
      });
      stats.learningSessionsDeleted += sessionResult.count;

      // 删除习惯画像
      const habitResult = await prisma.habitProfile.deleteMany({
        where: { userId: user.id },
      });
      stats.habitProfilesDeleted += habitResult.count;

      console.log(`  清理用户 ${user.username} 的数据`);
    }

    // 3. 删除模拟测试用户
    const userResult = await prisma.user.deleteMany({
      where: { username: { startsWith: 'sim_test_' } },
    });
    stats.usersDeleted = userResult.count;

    // 4. 查找并删除模拟测试词书
    const simWordbooks = await prisma.wordBook.findMany({
      where: { name: { startsWith: '[SIMULATION]' } },
      select: { id: true, name: true },
    });

    console.log(`\n找到 ${simWordbooks.length} 个模拟测试词书`);

    for (const wordbook of simWordbooks) {
      // 删除词书中的单词
      const wordResult = await prisma.word.deleteMany({
        where: { wordBookId: wordbook.id },
      });
      stats.wordsDeleted += wordResult.count;
      console.log(`  清理词书 "${wordbook.name}" 中的 ${wordResult.count} 个单词`);
    }

    // 删除词书
    const wordbookResult = await prisma.wordBook.deleteMany({
      where: { name: { startsWith: '[SIMULATION]' } },
    });
    stats.wordbooksDeleted = wordbookResult.count;

    return stats;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('AMAS 模拟测试数据清理工具');
  console.log('='.repeat(50));
  console.log();

  try {
    const stats = await cleanupSimulationData();

    console.log('\n' + '='.repeat(50));
    console.log('清理完成！统计信息:');
    console.log('='.repeat(50));
    console.log(`  用户删除: ${stats.usersDeleted}`);
    console.log(`  词书删除: ${stats.wordbooksDeleted}`);
    console.log(`  单词删除: ${stats.wordsDeleted}`);
    console.log(`  答题记录删除: ${stats.answerRecordsDeleted}`);
    console.log(`  状态历史删除: ${stats.stateHistoryDeleted}`);
    console.log(`  学习状态删除: ${stats.wordLearningStatesDeleted}`);
    console.log(`  学习会话删除: ${stats.learningSessionsDeleted}`);
    console.log(`  习惯画像删除: ${stats.habitProfilesDeleted}`);
    console.log();

    process.exit(0);
  } catch (error) {
    console.error('\n清理失败:', error);
    process.exit(1);
  }
}

main();
