/**
 * 检查用户的答题记录
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAnswerRecords(email) {
  console.log(`=== 检查用户答题记录: ${email} ===\n`);

  try {
    // 1. 查找用户
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('❌ 用户不存在');
      return;
    }

    console.log(`✅ 用户: ${user.username} (ID: ${user.id})\n`);

    // 2. 统计总答题记录数
    const totalRecords = await prisma.answerRecord.count({
      where: { userId: user.id }
    });

    console.log(`📊 总答题记录: ${totalRecords}条\n`);

    if (totalRecords === 0) {
      console.log('⚠️  没有任何答题记录\n');
      return;
    }

    // 3. 简单统计今天和总体
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = await prisma.answerRecord.count({
      where: {
        userId: user.id,
        timestamp: { gte: today }
      }
    });

    const allRecords = await prisma.answerRecord.findMany({
      where: { userId: user.id },
      select: {
        isCorrect: true,
        timestamp: true
      },
      orderBy: { timestamp: 'desc' }
    });

    console.log(`📅 今日答题记录: ${todayRecords}条`);

    if (allRecords.length > 0) {
      const oldest = new Date(allRecords[allRecords.length - 1].timestamp).toLocaleDateString('zh-CN');
      const newest = new Date(allRecords[0].timestamp).toLocaleDateString('zh-CN');
      console.log(`   最早记录: ${oldest}`);
      console.log(`   最新记录: ${newest}`);
    }

    // 4. 统计不同单词的学习次数
    const wordStats = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: { userId: user.id },
      _count: { wordId: true }
    });

    console.log(`\n📚 学习过的不同单词: ${wordStats.length}个`);

    // 5. 最近5条记录
    const recentRecords = await prisma.answerRecord.findMany({
      where: { userId: user.id },
      include: {
        word: {
          select: {
            spelling: true,
            wordBook: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 5
    });

    console.log('\n🕐 最近5条答题记录:');
    for (const record of recentRecords) {
      const time = new Date(record.timestamp).toLocaleString('zh-CN');
      const result = record.isCorrect ? '✓' : '✗';
      console.log(`   ${result} ${record.word.spelling} (${record.word.wordBook.name}) - ${time}`);
    }

  } catch (error) {
    console.error('检查出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'lijiccc@gmail.com';
checkAnswerRecords(email);
