import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseRecordIssue() {
  console.log('🔍 诊断学习记录叠加问题...\n');

  // 获取所有用户
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  console.log('👥 用户列表:');
  users.forEach((user) => {
    console.log(`  - ${user.username} (${user.email}) [ID: ${user.id}]`);
  });

  console.log('\n📊 详细统计分析:\n');

  for (const user of users) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`用户: ${user.username} (${user.email})`);
    console.log(`${'='.repeat(60)}`);

    // 1. 获取用户可访问的词库
    const userWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: user.id },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        wordCount: true,
      },
    });

    console.log(`\n📚 可访问的词库 (${userWordBooks.length}个):`);
    userWordBooks.forEach((wb) => {
      console.log(`  - ${wb.name} (${wb.type}) - ${wb.wordCount}个单词`);
    });

    const wordBookIds = userWordBooks.map((wb) => wb.id);

    // 2. 统计可访问的单词数
    const totalWords = await prisma.word.count({
      where: {
        wordBookId: {
          in: wordBookIds,
        },
      },
    });

    console.log(`\n📖 可访问的单词总数: ${totalWords}`);

    // 3. 统计学习记录数（按userId过滤）
    const totalRecords = await prisma.answerRecord.count({
      where: { userId: user.id },
    });

    console.log(`📝 学习记录总数: ${totalRecords}`);

    // 4. 检查学习记录是否正确关联到用户
    const recordsWithWrongUser = await prisma.answerRecord.count({
      where: {
        userId: { not: user.id },
      },
    });

    if (recordsWithWrongUser > 0) {
      console.log(`⚠️ 警告: 发现 ${recordsWithWrongUser} 条不属于该用户的记录`);
    }

    // 5. 检查学习记录关联的单词是否在用户可访问的词库中
    const records = await prisma.answerRecord.findMany({
      where: { userId: user.id },
      include: {
        word: {
          select: {
            id: true,
            spelling: true,
            wordBookId: true,
            wordBook: {
              select: {
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    // 统计记录关联的词库
    const recordWordBookMap = new Map<string, number>();
    records.forEach((record) => {
      const bookName = record.word.wordBook.name;
      recordWordBookMap.set(bookName, (recordWordBookMap.get(bookName) || 0) + 1);
    });

    console.log(`\n📊 学习记录按词库分布:`);
    recordWordBookMap.forEach((count, bookName) => {
      console.log(`  - ${bookName}: ${count}条记录`);
    });

    // 6. 检查是否有记录关联到用户无权访问的词库
    const inaccessibleRecords = records.filter(
      (record) => !wordBookIds.includes(record.word.wordBookId)
    );

    if (inaccessibleRecords.length > 0) {
      console.log(
        `\n❌ 发现 ${inaccessibleRecords.length} 条记录关联到用户无权访问的词库!`
      );
      console.log('   这些记录的词库:');
      const inaccessibleBooks = new Set(
        inaccessibleRecords.map((r) => r.word.wordBook.name)
      );
      inaccessibleBooks.forEach((bookName) => {
        console.log(`     - ${bookName}`);
      });
    } else {
      console.log(`\n✅ 所有学习记录都关联到用户可访问的词库`);
    }

    // 7. 正确率统计
    const correctRecords = await prisma.answerRecord.count({
      where: { userId: user.id, isCorrect: true },
    });

    const correctRate =
      totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;

    console.log(`\n📈 学习统计:`);
    console.log(`  - 总记录数: ${totalRecords}`);
    console.log(`  - 正确记录数: ${correctRecords}`);
    console.log(`  - 正确率: ${correctRate.toFixed(2)}%`);
  }

  // 8. 全局检查：是否有记录的userId不存在
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('🔍 全局数据一致性检查');
  console.log(`${'='.repeat(60)}\n`);

  const allRecords = await prisma.answerRecord.findMany({
    select: {
      id: true,
      userId: true,
      wordId: true,
    },
  });

  const userIds = new Set(users.map((u) => u.id));
  const orphanedRecords = allRecords.filter((r) => !userIds.has(r.userId));

  if (orphanedRecords.length > 0) {
    console.log(`❌ 发现 ${orphanedRecords.length} 条孤立记录（userId不存在）`);
  } else {
    console.log(`✅ 所有学习记录都正确关联到有效用户`);
  }

  // 9. 检查是否有重复的记录
  console.log(`\n🔍 检查重复记录...\n`);

  for (const user of users) {
    const records = await prisma.answerRecord.findMany({
      where: { userId: user.id },
      select: {
        wordId: true,
        timestamp: true,
        isCorrect: true,
      },
    });

    // 创建记录指纹（wordId + timestamp）
    const recordFingerprints = new Map<string, number>();
    records.forEach((record) => {
      const fingerprint = `${record.wordId}-${new Date(
        record.timestamp
      ).getTime()}`;
      recordFingerprints.set(
        fingerprint,
        (recordFingerprints.get(fingerprint) || 0) + 1
      );
    });

    const duplicates = Array.from(recordFingerprints.entries()).filter(
      ([_, count]) => count > 1
    );

    if (duplicates.length > 0) {
      console.log(`⚠️ ${user.username} 有 ${duplicates.length} 组重复记录:`);
      duplicates.slice(0, 5).forEach(([fingerprint, count]) => {
        console.log(`  - ${fingerprint}: ${count}条`);
      });
    } else {
      console.log(`✅ ${user.username} 没有重复记录`);
    }
  }

  console.log('\n\n🎯 问题总结:');
  console.log('='.repeat(60));
  console.log(
    '根据以上分析，学习记录叠加问题的可能原因是:'
  );
  console.log('1. 前端本地存储（IndexedDB）与云端数据不同步');
  console.log('2. 用户切换时，前端可能显示了缓存的统计数据');
  console.log('3. 统计API可能没有正确过滤用户ID');
  console.log('='.repeat(60));
}

diagnoseRecordIssue()
  .catch((e) => {
    console.error('❌ 诊断失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
