/**
 * 列出所有用户的学习配置
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listConfigs() {
  console.log('=== 所有用户学习配置 ===\n');

  try {
    const configs = await prisma.userStudyConfig.findMany({
      include: {
        user: {
          select: {
            username: true,
            email: true
          }
        }
      }
    });

    if (configs.length === 0) {
      console.log('📝 还没有用户创建学习配置\n');
      return;
    }

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      console.log(`${i + 1}. 用户: ${config.user.username} (${config.user.email})`);
      console.log(`   每日单词数: ${config.dailyWordCount}`);
      console.log(`   学习模式: ${config.studyMode}`);
      console.log(`   选择的词书: ${config.selectedWordBookIds.length}个`);

      if (config.selectedWordBookIds.length === 0) {
        console.log(`   ⚠️  未选择词书！`);
      } else {
        // 查询词书详情
        const wordBooks = await prisma.wordBook.findMany({
          where: {
            id: { in: config.selectedWordBookIds }
          },
          include: {
            _count: {
              select: { words: true }
            }
          }
        });

        for (const wb of wordBooks) {
          console.log(`   - ${wb.name} (${wb._count.words}个单词)`);
        }

        const totalWords = wordBooks.reduce((sum, wb) => sum + wb._count.words, 0);
        if (totalWords === 0) {
          console.log(`   ❌ 问题：选择的词书中没有单词！`);
        }
      }
      console.log();
    }

    // 列出所有系统词书
    console.log('=== 可用系统词书 ===\n');
    const systemWordBooks = await prisma.wordBook.findMany({
      where: {
        type: 'SYSTEM'
      },
      include: {
        _count: {
          select: { words: true }
        }
      }
    });

    if (systemWordBooks.length === 0) {
      console.log('📝 还没有系统词书\n');
    } else {
      for (const wb of systemWordBooks) {
        console.log(`- ${wb.name}`);
        console.log(`  ID: ${wb.id}`);
        console.log(`  单词数: ${wb._count.words}个`);
        if (wb.description) {
          console.log(`  描述: ${wb.description}`);
        }
        console.log();
      }
    }

  } catch (error) {
    console.error('查询出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listConfigs();
