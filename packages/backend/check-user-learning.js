/**
 * 检查特定用户的学习状态
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserLearning(email) {
  console.log(`=== 检查用户学习状态: ${email} ===\n`);

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

    // 2. 获取学习配置
    const config = await prisma.userStudyConfig.findUnique({
      where: { userId: user.id }
    });

    if (!config) {
      console.log('❌ 未配置学习计划\n');
      return;
    }

    console.log('📚 学习配置:');
    console.log(`   每日单词数: ${config.dailyWordCount}`);
    console.log(`   选择的词书: ${config.selectedWordBookIds.length}个\n`);

    if (config.selectedWordBookIds.length === 0) {
      console.log('❌ 未选择任何词书\n');
      return;
    }

    // 3. 获取词书信息
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

    console.log('📖 选择的词书:');
    for (const wb of wordBooks) {
      console.log(`   - ${wb.name}: ${wb._count.words}个单词`);
    }

    const totalWords = wordBooks.reduce((sum, wb) => sum + wb._count.words, 0);
    console.log(`   总计: ${totalWords}个单词\n`);

    // 4. 获取学习状态
    const learnedStates = await prisma.wordLearningState.findMany({
      where: {
        userId: user.id,
        word: {
          wordBookId: { in: config.selectedWordBookIds }
        }
      }
    });

    console.log(`📊 学习状态:`);
    console.log(`   已学习单词: ${learnedStates.length}个 / ${totalWords}个`);

    if (learnedStates.length > 0) {
      const stateGroups = {};
      learnedStates.forEach(s => {
        stateGroups[s.state] = (stateGroups[s.state] || 0) + 1;
      });
      console.log('   状态分布:');
      for (const [state, count] of Object.entries(stateGroups)) {
        console.log(`   - ${state}: ${count}个`);
      }
    }

    // 5. 检查今天需要复习的单词
    // 修复：纳入设置了 nextReviewDate 的 NEW 状态单词
    const now = new Date();
    const dueForReview = learnedStates.filter(s =>
      s.nextReviewDate &&
      s.nextReviewDate <= now &&
      (['LEARNING', 'REVIEWING'].includes(s.state) || s.state === 'NEW')
    );

    console.log(`\n⏰ 今日需要复习: ${dueForReview.length}个单词`);

    // 6. 计算今天可以学习的单词数
    const newWordsNeeded = config.dailyWordCount - Math.min(dueForReview.length, config.dailyWordCount);
    const availableNewWords = totalWords - learnedStates.length;

    console.log(`\n🎯 今日学习计划:`);
    console.log(`   需要复习: ${Math.min(dueForReview.length, config.dailyWordCount)}个`);
    console.log(`   需要新词: ${newWordsNeeded}个`);
    console.log(`   可用新词: ${availableNewWords}个`);

    const todayTotal = Math.min(dueForReview.length, config.dailyWordCount) + Math.min(newWordsNeeded, availableNewWords);
    console.log(`   今日总计: ${todayTotal}个单词\n`);

    if (todayTotal === 0) {
      console.log('⚠️  问题：今天没有可学习的单词！');
      console.log('   原因分析:');
      if (availableNewWords === 0 && dueForReview.length === 0) {
        console.log('   ✓ 所有单词都已学习完成');
        console.log('   ✓ 今天没有需要复习的单词');
        console.log('\n   建议：');
        console.log('   1. 等待明天或后续日期的复习任务');
        console.log('   2. 或者添加更多词书');
      }
    } else {
      console.log('✅ 今天有 ${todayTotal} 个单词可以学习');
    }

    // 7. 获取今日已学习记录
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: {
        userId: user.id,
        timestamp: { gte: today },
        word: {
          wordBookId: { in: config.selectedWordBookIds }
        }
      }
    });

    console.log(`\n📝 今日学习记录: ${todayRecords.length}个单词已完成\n`);

  } catch (error) {
    console.error('检查出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'lijiccc@gmail.com';
checkUserLearning(email);
