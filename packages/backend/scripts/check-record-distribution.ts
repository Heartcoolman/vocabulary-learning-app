import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecordDistribution() {
  console.log('📊 学习记录分布统计\n');
  console.log('='.repeat(60));

  // 获取所有用户
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true },
  });

  console.log('\n👥 用户列表:');
  users.forEach((user) => {
    console.log(`  - ${user.username} (${user.email})`);
    console.log(`    ID: ${user.id}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('📝 学习记录按 userId 统计:\n');

  let totalRecords = 0;

  for (const user of users) {
    const count = await prisma.answerRecord.count({
      where: { userId: user.id },
    });

    console.log(`  ${user.username}:`);
    console.log(`    userId: ${user.id}`);
    console.log(`    记录数: ${count}条`);
    console.log('');

    totalRecords += count;
  }

  console.log(`  总计: ${totalRecords}条记录`);

  console.log('\n' + '='.repeat(60));
  console.log('🔍 详细分析:\n');

  for (const user of users) {
    console.log(`\n${user.username} 的学习记录详情:`);

    // 按词库统计
    const recordsByBook = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: { userId: user.id },
      _count: true,
    });

    // 获取词库信息
    const wordIds = recordsByBook.map((r) => r.wordId);
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: {
        id: true,
        spelling: true,
        wordBook: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    const wordMap = new Map(words.map((w) => [w.id, w]));

    // 按词库分组统计
    const bookStats = new Map<string, number>();
    recordsByBook.forEach((r) => {
      const word = wordMap.get(r.wordId);
      if (word) {
        const bookName = word.wordBook.name;
        bookStats.set(bookName, (bookStats.get(bookName) || 0) + r._count);
      }
    });

    console.log('  按词库分布:');
    bookStats.forEach((count, bookName) => {
      console.log(`    - ${bookName}: ${count}条`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 统计完成！\n');
}

checkRecordDistribution()
  .catch((e) => {
    console.error('❌ 统计失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
