/**
 * 检查学习状态的创建时间
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLearningStates(email) {
  console.log(`=== 检查学习状态创建时间: ${email} ===\n`);

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('❌ 用户不存在');
      return;
    }

    console.log(`✅ 用户: ${user.username}\n`);

    // 获取所有学习状态，按词书分组
    const states = await prisma.wordLearningState.findMany({
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
      orderBy: { createdAt: 'asc' }
    });

    console.log(`📊 总学习状态: ${states.length}个\n`);

    if (states.length === 0) {
      console.log('⚠️  没有任何学习状态\n');
      return;
    }

    // 按词书分组
    const byWordBook = {};
    for (const state of states) {
      const bookName = state.word.wordBook.name;
      if (!byWordBook[bookName]) {
        byWordBook[bookName] = [];
      }
      byWordBook[bookName].push(state);
    }

    // 显示每个词书的统计
    for (const [bookName, bookStates] of Object.entries(byWordBook)) {
      console.log(`📖 ${bookName}: ${bookStates.length}个单词`);

      const earliest = new Date(bookStates[0].createdAt);
      const latest = new Date(bookStates[bookStates.length - 1].createdAt);

      console.log(`   最早创建: ${earliest.toLocaleString('zh-CN')}`);
      console.log(`   最晚创建: ${latest.toLocaleString('zh-CN')}`);

      // 状态分布
      const stateGroups = {};
      bookStates.forEach(s => {
        stateGroups[s.state] = (stateGroups[s.state] || 0) + 1;
      });
      console.log('   状态分布:', stateGroups);

      console.log();
    }

    // 显示最早的5个状态
    console.log('🕐 最早创建的5个学习状态:');
    for (let i = 0; i < Math.min(5, states.length); i++) {
      const s = states[i];
      const time = new Date(s.createdAt).toLocaleString('zh-CN');
      console.log(`   ${s.word.spelling} (${s.word.wordBook.name}) - ${time} - ${s.state}`);
    }

  } catch (error) {
    console.error('检查出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'lijiccc@gmail.com';
checkLearningStates(email);
