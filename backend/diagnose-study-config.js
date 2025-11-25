/**
 * 诊断学习配置问题
 * 使用方法: node backend/diagnose-study-config.js <用户邮箱>
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose(userEmail) {
  console.log('=== 学习配置诊断工具 ===\n');

  try {
    // 1. 查找用户
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      console.log('❌ 用户不存在:', userEmail);
      return;
    }

    console.log('✅ 用户信息:');
    console.log(`   ID: ${user.id}`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   邮箱: ${user.email}\n`);

    // 2. 检查学习配置
    const config = await prisma.userStudyConfig.findUnique({
      where: { userId: user.id }
    });

    if (!config) {
      console.log('❌ 学习配置不存在（将自动创建默认配置）\n');
    } else {
      console.log('✅ 学习配置:');
      console.log(`   每日单词数: ${config.dailyWordCount}`);
      console.log(`   学习模式: ${config.studyMode}`);
      console.log(`   选择的词书ID: ${JSON.stringify(config.selectedWordBookIds)}\n`);

      if (config.selectedWordBookIds.length === 0) {
        console.log('⚠️  问题：未选择任何词书！');
        console.log('   解决方案：请在"学习设置"页面选择至少一个词书\n');
      }

      // 3. 检查选择的词书
      if (config.selectedWordBookIds.length > 0) {
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

        console.log(`✅ 选择的词书 (${wordBooks.length}个):`);
        for (const wb of wordBooks) {
          console.log(`   - ${wb.name} (ID: ${wb.id})`);
          console.log(`     类型: ${wb.type}`);
          console.log(`     单词数: ${wb._count.words}个`);

          if (wb._count.words === 0) {
            console.log(`     ⚠️  警告：该词书没有单词！`);
          }
        }
        console.log();

        // 4. 检查是否有可学习的单词
        const totalWords = wordBooks.reduce((sum, wb) => sum + wb._count.words, 0);
        console.log(`📊 总单词数: ${totalWords}个\n`);

        if (totalWords === 0) {
          console.log('❌ 问题：选择的词书中没有单词！');
          console.log('   解决方案：');
          console.log('   1. 选择其他有单词的词书');
          console.log('   2. 或者在词库管理中为词书添加单词\n');
        }

        // 5. 检查学习状态
        const learnedStates = await prisma.wordLearningState.findMany({
          where: {
            userId: user.id,
            word: {
              wordBookId: { in: config.selectedWordBookIds }
            }
          }
        });

        console.log(`📚 已学习状态: ${learnedStates.length}个单词`);

        if (totalWords > 0 && learnedStates.length >= totalWords) {
          console.log('⚠️  注意：所有单词都已学习过');

          // 检查是否有需要复习的
          const now = new Date();
          const dueForReview = learnedStates.filter(s =>
            s.nextReviewDate && s.nextReviewDate <= now &&
            ['LEARNING', 'REVIEWING'].includes(s.state)
          );

          console.log(`   需要复习: ${dueForReview.length}个单词`);

          if (dueForReview.length === 0) {
            console.log('   ℹ️  今天没有需要复习的单词\n');
          }
        }
      }
    }

    // 6. 列出所有可用词书
    console.log('\n=== 可用词书列表 ===');
    const allWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: user.id }
        ]
      },
      include: {
        _count: {
          select: { words: true }
        }
      },
      orderBy: { type: 'asc' }
    });

    console.log(`共 ${allWordBooks.length} 个可用词书:\n`);
    for (const wb of allWordBooks) {
      const selected = config?.selectedWordBookIds.includes(wb.id) ? '✓' : ' ';
      console.log(`[${selected}] ${wb.name}`);
      console.log(`    ID: ${wb.id}`);
      console.log(`    类型: ${wb.type}`);
      console.log(`    单词数: ${wb._count.words}个`);
      if (wb.description) {
        console.log(`    描述: ${wb.description}`);
      }
      console.log();
    }

  } catch (error) {
    console.error('诊断出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 从命令行参数获取用户邮箱
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('使用方法: node backend/diagnose-study-config.js <用户邮箱>');
  console.log('例如: node backend/diagnose-study-config.js user@example.com');
  process.exit(1);
}

diagnose(userEmail);
