import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWordBookData() {
  console.log('🔍 检查词库数据一致性...\n');

  // 1. 检查所有词库
  const allWordBooks = await prisma.wordBook.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      userId: true,
      wordCount: true,
    },
  });

  console.log('📚 所有词库列表:');
  allWordBooks.forEach((wb) => {
    console.log(`  - ${wb.name} (${wb.type})`);
    console.log(`    ID: ${wb.id}`);
    console.log(`    userId: ${wb.userId || 'null (系统词库)'}`);
    console.log(`    wordCount: ${wb.wordCount}`);
  });

  // 2. 检查用户词库的 userId 是否正确
  const userWordBooks = await prisma.wordBook.findMany({
    where: { type: 'USER' },
    select: {
      id: true,
      name: true,
      userId: true,
      user: {
        select: {
          email: true,
          username: true,
        },
      },
    },
  });

  console.log('\n👤 用户词库详情:');
  if (userWordBooks.length === 0) {
    console.log('  ⚠️ 没有找到任何用户词库');
  } else {
    userWordBooks.forEach((wb) => {
      console.log(`  - ${wb.name}`);
      console.log(`    ID: ${wb.id}`);
      console.log(`    userId: ${wb.userId || '⚠️ NULL (这是问题所在!)'}`);
      if (wb.user) {
        console.log(`    所属用户: ${wb.user.username} (${wb.user.email})`);
      } else {
        console.log(`    ⚠️ 警告: 用户词库没有关联用户!`);
      }
    });
  }

  // 3. 检查是否有 userId 为 null 的用户词库
  const orphanedUserWordBooks = await prisma.wordBook.count({
    where: {
      type: 'USER',
      userId: null,
    },
  });

  if (orphanedUserWordBooks > 0) {
    console.log(`\n❌ 发现 ${orphanedUserWordBooks} 个用户词库的 userId 为 null!`);
    console.log('   这会导致所有用户都能看到这些词库。');
  } else {
    console.log('\n✅ 所有用户词库都正确关联了用户');
  }

  // 4. 检查每个用户能看到的词库
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  console.log('\n👥 每个用户可见的词库:');
  for (const user of users) {
    const visibleWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: user.id },
        ],
      },
      select: {
        name: true,
        type: true,
      },
    });

    console.log(`\n  ${user.username} (${user.email}):`);
    visibleWordBooks.forEach((wb) => {
      console.log(`    - ${wb.name} (${wb.type})`);
    });
  }

  // 5. 检查学习记录统计
  console.log('\n📊 学习记录统计:');
  for (const user of users) {
    const userWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: user.id },
        ],
      },
      select: { id: true },
    });

    const wordBookIds = userWordBooks.map((wb) => wb.id);

    const [totalWords, totalRecords] = await Promise.all([
      prisma.word.count({
        where: {
          wordBookId: {
            in: wordBookIds,
          },
        },
      }),
      prisma.answerRecord.count({ where: { userId: user.id } }),
    ]);

    console.log(`\n  ${user.username} (${user.email}):`);
    console.log(`    可访问词库数: ${userWordBooks.length}`);
    console.log(`    可访问单词数: ${totalWords}`);
    console.log(`    学习记录数: ${totalRecords}`);
  }
}

checkWordBookData()
  .catch((e) => {
    console.error('❌ 检查失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
