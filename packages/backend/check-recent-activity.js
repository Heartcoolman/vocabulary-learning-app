/**
 * 检查最近的学习活动
 * 用于排查为什么特征向量没有生成
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentActivity() {
  console.log('\n========================================');
  console.log('🔍 最近学习活动检查');
  console.log('========================================\n');

  try {
    // 1. 检查最近的答题记录
    const recentAnswers = await prisma.answerRecord.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        id: true,
        userId: true,
        wordId: true,
        isCorrect: true,
        timestamp: true
      }
    });

    console.log(`📝 最近10条答题记录:`);
    if (recentAnswers.length === 0) {
      console.log('   ❌ 无答题记录\n');
    } else {
      console.log(`   ✅ 找到 ${recentAnswers.length} 条记录\n`);

      recentAnswers.slice(0, 3).forEach((record, idx) => {
        const date = new Date(record.timestamp);
        const timeAgo = Math.floor((Date.now() - record.timestamp) / 1000 / 60);
        console.log(`   ${idx + 1}. ${record.isCorrect ? '✅' : '❌'} ${timeAgo}分钟前`);
        console.log(`      用户: ${record.userId.slice(0, 8)}...`);
        console.log(`      单词: ${record.wordId.slice(0, 8)}...`);
        console.log(`      时间: ${date.toISOString()}\n`);
      });
    }

    // 2. 检查AMAS状态
    const amasStates = await prisma.amasUserState.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        userId: true,
        attention: true,
        fatigue: true,
        interactionCount: true,
        updatedAt: true
      }
    });

    console.log(`🧠 AMAS用户状态:`);
    if (amasStates.length === 0) {
      console.log('   ❌ 无AMAS状态记录\n');
    } else {
      console.log(`   ✅ 找到 ${amasStates.length} 个用户状态\n`);

      amasStates.slice(0, 3).forEach((state, idx) => {
        const timeAgo = Math.floor((Date.now() - state.updatedAt.getTime()) / 1000 / 60);
        console.log(`   ${idx + 1}. 用户 ${state.userId.slice(0, 8)}...`);
        console.log(`      交互次数: ${state.interactionCount || 0}`);
        console.log(`      注意力: ${(state.attention || 0).toFixed(2)}`);
        console.log(`      疲劳度: ${(state.fatigue || 0).toFixed(2)}`);
        console.log(`      更新于: ${timeAgo}分钟前\n`);
      });
    }

    // 3. 检查学习会话
    const sessions = await prisma.learningSession.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        userId: true,
        startedAt: true,
        endedAt: true
      }
    });

    console.log(`📚 学习会话:`);
    if (sessions.length === 0) {
      console.log('   ❌ 无学习会话记录\n');
    } else {
      console.log(`   ✅ 找到 ${sessions.length} 个会话\n`);

      sessions.forEach((session, idx) => {
        const timeAgo = Math.floor((Date.now() - session.startedAt.getTime()) / 1000 / 60);
        console.log(`   ${idx + 1}. 会话 ${session.id.slice(0, 8)}...`);
        console.log(`      用户: ${session.userId.slice(0, 8)}...`);
        console.log(`      开始于: ${timeAgo}分钟前`);
        console.log(`      状态: ${session.endedAt ? '已结束' : '进行中'}\n`);
      });
    }

    // 4. 检查特征向量（再确认一次）
    const vectors = await prisma.featureVector.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        sessionId: true,
        featureVersion: true,
        createdAt: true
      }
    });

    console.log(`🎯 特征向量:`);
    if (vectors.length === 0) {
      console.log('   ❌ 无特征向量记录\n');
    } else {
      console.log(`   ✅ 找到 ${vectors.length} 条记录\n`);

      vectors.forEach((vec, idx) => {
        const timeAgo = Math.floor((Date.now() - vec.createdAt.getTime()) / 1000 / 60);
        console.log(`   ${idx + 1}. v${vec.featureVersion} - ${timeAgo}分钟前`);
        console.log(`      会话: ${vec.sessionId.slice(0, 8)}...\n`);
      });
    }

    // 5. 分析结论
    console.log('========================================');
    console.log('📋 问题分析:');
    console.log('========================================\n');

    if (recentAnswers.length === 0) {
      console.log('❌ 未检测到任何学习活动');
      console.log('   可能原因:');
      console.log('   1. 前端答题后没有保存到数据库');
      console.log('   2. 使用了测试账号或未登录');
      console.log('   3. 答题功能本身有问题\n');
    } else if (amasStates.length === 0) {
      console.log('⚠️  有答题记录，但AMAS状态未初始化');
      console.log('   可能原因:');
      console.log('   1. 前端没有调用AMAS API');
      console.log('   2. AMAS API调用失败（检查网络/日志）');
      console.log('   3. 答题流程未集成AMAS\n');
    } else if (vectors.length === 0 && sessions.length === 0) {
      console.log('⚠️  AMAS运行中，但特征向量和会话未创建');
      console.log('   可能原因:');
      console.log('   1. 后端服务使用旧代码（未重启）');
      console.log('   2. processLearningEvent未传递sessionId');
      console.log('   3. 特征向量保存失败（检查日志）\n');
      console.log('🔧 解决方法:');
      console.log('   cd backend && (先Ctrl+C停止服务) && npm run dev\n');
    } else {
      console.log('✅ 系统正常，数据生成中');
    }

    // 6. 时间线对比
    if (recentAnswers.length > 0 && amasStates.length > 0) {
      const latestAnswer = recentAnswers[0];
      const latestState = amasStates[0];

      console.log('⏰ 时间线对比:');
      console.log(`   最后答题: ${new Date(latestAnswer.timestamp).toISOString()}`);
      console.log(`   AMAS更新: ${latestState.updatedAt.toISOString()}`);

      const timeDiff = latestState.updatedAt.getTime() - latestAnswer.timestamp;
      if (Math.abs(timeDiff) < 5000) {
        console.log('   ✅ 时间同步（答题触发了AMAS更新）\n');
      } else {
        console.log(`   ⚠️  时间不同步（相差 ${Math.abs(timeDiff / 1000).toFixed(1)}秒）\n`);
      }
    }

  } catch (error) {
    console.error('\n❌ 检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行检查
checkRecentActivity()
  .then(() => {
    console.log('✅ 检查完成\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 检查异常:', error);
    process.exit(1);
  });
