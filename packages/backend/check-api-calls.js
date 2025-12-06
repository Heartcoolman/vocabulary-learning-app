/**
 * 检查最近的API调用情况
 * 分析答题和AMAS状态的时间线
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAPICalls() {
  console.log('\n========================================');
  console.log('🔍 API调用情况分析');
  console.log('========================================\n');

  try {
    // 1. 获取最近5条答题记录
    const recentAnswers = await prisma.answerRecord.findMany({
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: {
        id: true,
        userId: true,
        wordId: true,
        isCorrect: true,
        timestamp: true
      }
    });

    console.log('📝 最近5次答题:');
    if (recentAnswers.length === 0) {
      console.log('   无记录\n');
    } else {
      recentAnswers.forEach((record, idx) => {
        const time = new Date(record.timestamp);
        const ago = Math.floor((Date.now() - record.timestamp) / 1000);
        console.log(`   ${idx + 1}. ${record.isCorrect ? '✅' : '❌'} ${ago}秒前`);
        console.log(`      用户: ${record.userId}`);
        console.log(`      时间: ${time.toLocaleString('zh-CN')}\n`);
      });
    }

    // 2. 获取AMAS状态更新记录
    const amasStates = await prisma.amasUserState.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        userId: true,
        attention: true,
        fatigue: true,
        updatedAt: true
      }
    });

    console.log('🧠 AMAS状态更新:');
    if (amasStates.length === 0) {
      console.log('   无记录\n');
    } else {
      amasStates.forEach((state, idx) => {
        const time = new Date(state.updatedAt);
        const ago = Math.floor((Date.now() - time.getTime()) / 1000);
        console.log(`   ${idx + 1}. ${ago}秒前`);
        console.log(`      用户: ${state.userId}`);
        console.log(`      时间: ${time.toLocaleString('zh-CN')}\n`);
      });
    }

    // 3. 对比最新的答题和AMAS更新
    if (recentAnswers.length > 0 && amasStates.length > 0) {
      const latestAnswer = recentAnswers[0];
      const latestAmasUpdate = amasStates[0];

      console.log('⏰ 时间对比:');
      console.log(`   最后答题: ${new Date(latestAnswer.timestamp).toLocaleString('zh-CN')}`);
      console.log(`   AMAS更新: ${new Date(latestAmasUpdate.updatedAt).toLocaleString('zh-CN')}`);

      const timeDiff = latestAmasUpdate.updatedAt.getTime() - latestAnswer.timestamp;
      const diffMinutes = Math.floor(Math.abs(timeDiff) / 1000 / 60);

      if (timeDiff < 0) {
        console.log(`   ❌ AMAS更新时间早于答题时间 ${diffMinutes}分钟`);
        console.log('   说明：最近的答题没有触发AMAS更新\n');
      } else if (Math.abs(timeDiff) < 5000) {
        console.log(`   ✅ 时间同步（相差${Math.abs(timeDiff)/1000}秒）`);
        console.log('   说明：答题正确触发了AMAS更新\n');
      } else {
        console.log(`   ⚠️  时间差距较大（${diffMinutes}分钟）`);
        console.log('   说明：最近的答题可能没有调用AMAS API\n');
      }
    }

    // 4. 诊断结论
    console.log('========================================');
    console.log('📋 诊断结论:');
    console.log('========================================\n');

    const answerCount = await prisma.answerRecord.count();
    const amasCount = await prisma.amasUserState.count();

    console.log(`总答题次数: ${answerCount}`);
    console.log(`AMAS状态记录: ${amasCount}`);

    if (answerCount > 0 && amasCount === 0) {
      console.log('\n❌ 问题：从未调用过AMAS API');
      console.log('可能原因:');
      console.log('1. 前端代码中AMAS调用被注释或删除');
      console.log('2. 前端AMAS调用有条件判断，不满足条件');
      console.log('3. API调用失败但被catch忽略\n');
    } else if (recentAnswers.length > 0 && amasStates.length > 0) {
      const latestAnswer = recentAnswers[0];
      const latestAmasUpdate = amasStates[0];
      const timeDiff = latestAmasUpdate.updatedAt.getTime() - latestAnswer.timestamp;

      if (timeDiff < -60000) { // AMAS更新时间早于最新答题1分钟以上
        console.log('\n❌ 问题：最近的答题没有调用AMAS API');
        console.log('可能原因:');
        console.log('1. 前端代码最近有修改，AMAS调用被移除');
        console.log('2. 答题流程改变，不再触发AMAS');
        console.log('3. AMAS API调用失败但被忽略\n');
        console.log('💡 建议操作:');
        console.log('1. 打开浏览器开发者工具（F12）');
        console.log('2. 切换到Console标签');
        console.log('3. 学习一个单词');
        console.log('4. 查看是否有 "AMAS处理失败" 的错误日志\n');
      } else {
        console.log('\n✅ AMAS API正在被调用');
        console.log('但特征向量未保存，可能原因:');
        console.log('1. 后端代码未重启，使用的还是旧代码');
        console.log('2. 特征向量保存逻辑有bug');
        console.log('3. 数据库写入失败\n');
        console.log('💡 建议操作:');
        console.log('1. 确认后端服务已完全重启');
        console.log('2. 学习一个单词后查看后端日志');
        console.log('3. 查找包含 "[AMAS]" 的日志行\n');
      }
    }

  } catch (error) {
    console.error('\n❌ 检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAPICalls()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
