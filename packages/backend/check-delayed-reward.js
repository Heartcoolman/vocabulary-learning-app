/**
 * 延迟奖励Worker检查脚本
 * 验证延迟奖励机制是否正常运行
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDelayedRewardWorker() {
  console.log('\n========================================');
  console.log('⏰ AMAS延迟奖励Worker检查');
  console.log('========================================\n');

  try {
    // 1. 检查奖励队列表
    const totalRewards = await prisma.rewardQueue.count();
    console.log(`📊 奖励队列总数: ${totalRewards}`);

    if (totalRewards === 0) {
      console.log('⚠️  警告: 奖励队列为空');
      console.log('   这可能表示:');
      console.log('   - 系统刚刚部署，尚未产生延迟奖励任务');
      console.log('   - 所有任务已处理完成');
      console.log('   - 延迟奖励功能未被触发\n');
    } else {
      // 2. 按状态统计
      const statusStats = await prisma.rewardQueue.groupBy({
        by: ['status'],
        _count: true
      });

      console.log('\n📈 队列状态分布:');
      statusStats.forEach(stat => {
        const icon =
          stat.status === 'DONE' ? '✅' :
          stat.status === 'PENDING' ? '⏳' :
          stat.status === 'PROCESSING' ? '🔄' :
          stat.status === 'FAILED' ? '❌' : '❓';

        console.log(`   ${icon} ${stat.status}: ${stat._count} 条`);
      });

      // 3. 检查待处理任务
      const pendingCount = await prisma.rewardQueue.count({
        where: { status: 'PENDING' }
      });

      const now = new Date();
      const dueCount = await prisma.rewardQueue.count({
        where: {
          status: 'PENDING',
          dueTs: { lte: now }
        }
      });

      console.log(`\n⏳ 待处理任务:`);
      console.log(`   总数: ${pendingCount}`);
      console.log(`   已到期: ${dueCount} ${dueCount > 0 ? '⚠️ 需要Worker处理' : '✅'}`);

      // 4. 检查最近的任务
      const recentTasks = await prisma.rewardQueue.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          userId: true,
          sessionId: true,
          reward: true,
          status: true,
          dueTs: true,
          lastError: true,
          createdAt: true,
          updatedAt: true
        }
      });

      console.log(`\n🔎 最近的 ${recentTasks.length} 个任务:\n`);

      recentTasks.forEach((task, idx) => {
        const statusIcon =
          task.status === 'DONE' ? '✅' :
          task.status === 'PENDING' ? '⏳' :
          task.status === 'PROCESSING' ? '🔄' :
          task.status === 'FAILED' ? '❌' : '❓';

        const isDue = task.status === 'PENDING' && task.dueTs <= now;
        const dueStatus = isDue ? '⚠️ 已到期' : '⏰ 未到期';

        console.log(`${idx + 1}. ${statusIcon} 任务 ${task.id.slice(0, 8)}...`);
        console.log(`   用户: ${task.userId.slice(0, 8)}... | 会话: ${task.sessionId?.slice(0, 8) || '无'}...`);
        console.log(`   奖励值: ${task.reward.toFixed(3)} | 状态: ${task.status}`);
        console.log(`   到期时间: ${task.dueTs.toISOString()} ${task.status === 'PENDING' ? dueStatus : ''}`);
        console.log(`   创建时间: ${task.createdAt.toISOString()}`);
        console.log(`   更新时间: ${task.updatedAt.toISOString()}`);

        if (task.lastError) {
          console.log(`   ❌ 错误信息: ${task.lastError}`);
        }
        console.log('');
      });

      // 5. 检查失败任务
      const failedTasks = await prisma.rewardQueue.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 5
      });

      if (failedTasks.length > 0) {
        console.log(`\n❌ 失败任务 (最近${failedTasks.length}个):\n`);

        failedTasks.forEach((task, idx) => {
          console.log(`${idx + 1}. 任务 ${task.id.slice(0, 8)}...`);
          console.log(`   用户: ${task.userId}`);
          console.log(`   错误: ${task.lastError || '未知'}\n`);
        });
      }

      // 6. Worker运行状态推断
      console.log('========================================');
      console.log('🔍 Worker运行状态分析:');
      console.log('========================================\n');

      // 检查最近5分钟内是否有任务从PENDING变为DONE
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentCompletedCount = await prisma.rewardQueue.count({
        where: {
          status: 'DONE',
          updatedAt: { gte: fiveMinutesAgo }
        }
      });

      console.log(`最近5分钟完成的任务: ${recentCompletedCount} 个`);

      if (recentCompletedCount > 0) {
        console.log('✅ Worker正在正常运行');
        console.log(`   最近5分钟已处理 ${recentCompletedCount} 个任务`);
      } else if (dueCount > 0) {
        console.log('⚠️  Worker可能未运行或处理缓慢');
        console.log(`   有 ${dueCount} 个任务已到期但未处理`);
        console.log('   建议检查:');
        console.log('   1. 后端服务是否启动');
        console.log('   2. 查看日志中是否有 "Delayed reward worker started"');
        console.log('   3. 查看日志中是否有Worker错误信息');
      } else if (pendingCount > 0) {
        console.log('⏳ Worker状态正常');
        console.log(`   有 ${pendingCount} 个待处理任务，但尚未到期`);
      } else {
        console.log('✅ 所有任务已处理完成');
        console.log('   队列中无待处理任务');
      }

      // 7. 处理效率统计
      const completedTasks = await prisma.rewardQueue.findMany({
        where: { status: 'DONE' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          createdAt: true,
          updatedAt: true
        }
      });

      if (completedTasks.length > 0) {
        const delays = completedTasks.map(task =>
          (task.updatedAt.getTime() - task.createdAt.getTime()) / 1000
        );
        const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
        const minDelay = Math.min(...delays);
        const maxDelay = Math.max(...delays);

        console.log(`\n📊 处理效率统计 (最近${completedTasks.length}个任务):`);
        console.log(`   平均延迟: ${avgDelay.toFixed(1)}秒`);
        console.log(`   最小延迟: ${minDelay.toFixed(1)}秒`);
        console.log(`   最大延迟: ${maxDelay.toFixed(1)}秒`);
      }
    }

    // 8. 幂等性检查
    const duplicateKeys = await prisma.$queryRaw`
      SELECT "idempotencyKey", COUNT(*) as count
      FROM "reward_queue"
      GROUP BY "idempotencyKey"
      HAVING COUNT(*) > 1
      LIMIT 5
    `;

    if (duplicateKeys.length > 0) {
      console.log('\n⚠️  发现重复的幂等键:');
      duplicateKeys.forEach(dup => {
        console.log(`   幂等键: ${dup.idempotencyKey}, 重复: ${dup.count} 次`);
      });
    } else if (totalRewards > 0) {
      console.log('\n✅ 幂等性检查通过，无重复任务');
    }

  } catch (error) {
    console.error('\n❌ 检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行检查
checkDelayedRewardWorker()
  .then(() => {
    console.log('\n✅ 检查完成\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 检查异常:', error);
    process.exit(1);
  });
