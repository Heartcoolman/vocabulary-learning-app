/**
 * 修复用户的复习日期
 * 将过长的 nextReviewDate 调整为合理值
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixUserReviewDates(email) {
  console.log(`=== 修复用户复习日期: ${email} ===\n`);

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

    const now = new Date();
    // 设置为5分钟前，确保立即可复习
    const immediateReview = new Date(now.getTime() - 5 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 2. 获取所有学习状态
    const states = await prisma.wordLearningState.findMany({
      where: { userId: user.id }
    });

    console.log(`📊 总学习状态: ${states.length}个\n`);

    // 3. 分析需要修复的记录
    const needsFix = states.filter(s => {
      if (!s.nextReviewDate) return false;
      // 修复条件：复习时间还没到期（nextReviewDate > now）
      return s.nextReviewDate > now;
    });

    console.log(`⚠️  需要修复的记录: ${needsFix.length}个 (nextReviewDate > 3天后)\n`);

    if (needsFix.length === 0) {
      console.log('✅ 无需修复');
      return;
    }

    // 4. 修复记录
    // 根据 reviewCount 设置合理的 nextReviewDate
    // reviewCount=1 → 1天后, reviewCount=2 → 3天后
    let fixed = 0;
    for (const state of needsFix) {
      // 统一设置为立即可复习
      const newNextReviewDate = immediateReview;

      // 计算新的 currentInterval
      const newInterval = Math.round((newNextReviewDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      await prisma.wordLearningState.update({
        where: { id: state.id },
        data: {
          nextReviewDate: newNextReviewDate,
          currentInterval: newInterval
        }
      });

      fixed++;
    }

    console.log(`✅ 已修复 ${fixed} 个记录\n`);

    // 5. 验证修复结果
    const updatedStates = await prisma.wordLearningState.findMany({
      where: { userId: user.id },
      orderBy: { nextReviewDate: 'asc' },
      take: 10
    });

    console.log('📅 修复后的前10个复习时间:');
    updatedStates.forEach((s, i) => {
      const isDue = s.nextReviewDate && s.nextReviewDate <= now;
      console.log(`${i+1}. state=${s.state}, nextReviewDate=${s.nextReviewDate?.toISOString() || 'null'} ${isDue ? '✓到期' : ''}`);
    });

    // 6. 计算今天可以复习的单词数
    const dueForReview = updatedStates.filter(s =>
      s.nextReviewDate &&
      s.nextReviewDate <= now &&
      (['LEARNING', 'REVIEWING'].includes(s.state) || s.state === 'NEW')
    );

    console.log(`\n⏰ 今日可复习: ${dueForReview.length}个单词`);

  } catch (error) {
    console.error('修复出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'lijiccc@gmail.com';
fixUserReviewDates(email);
