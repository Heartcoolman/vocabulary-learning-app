/**
 * AMAS扩展版综合诊断脚本
 * 一键检查所有扩展版功能是否正常运行
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnoseAMASExtended() {
  console.log('\n========================================');
  console.log('🔬 AMAS扩展版综合诊断');
  console.log('========================================\n');

  const results = {
    database: { status: 'unknown', issues: [] },
    featureVectors: { status: 'unknown', issues: [] },
    delayedReward: { status: 'unknown', issues: [] },
    habitProfiles: { status: 'unknown', issues: [] },
    learningSessions: { status: 'unknown', issues: [] }
  };

  try {
    // ==================== 1. 数据库连接检查 ====================
    console.log('1️⃣  数据库连接检查...');
    try {
      await prisma.$connect();
      console.log('   ✅ 数据库连接成功\n');
      results.database.status = 'ok';
    } catch (error) {
      console.log(`   ❌ 数据库连接失败: ${error.message}\n`);
      results.database.status = 'error';
      results.database.issues.push('数据库连接失败');
      return results;
    }

    // ==================== 2. 扩展版数据表检查 ====================
    console.log('2️⃣  扩展版数据表检查...');
    const tables = ['learning_sessions', 'feature_vectors', 'habit_profiles', 'reward_queue'];
    let allTablesExist = true;

    for (const table of tables) {
      try {
        const count = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) as count FROM ${table} LIMIT 1`
        );
        console.log(`   ✅ ${table} 表存在`);
      } catch (error) {
        console.log(`   ❌ ${table} 表不存在或无法访问`);
        allTablesExist = false;
        results.database.issues.push(`${table}表缺失`);
      }
    }

    if (allTablesExist) {
      console.log('   ✅ 所有扩展版数据表已创建\n');
      results.database.status = 'ok';
    } else {
      console.log('   ❌ 部分数据表缺失，请运行数据库迁移\n');
      results.database.status = 'error';
    }

    // ==================== 3. 特征向量检查 ====================
    console.log('3️⃣  特征向量检查...');

    const totalVectors = await prisma.featureVector.count();
    console.log(`   📊 总数: ${totalVectors}`);

    if (totalVectors === 0) {
      console.log('   ⚠️  暂无特征向量数据\n');
      results.featureVectors.status = 'warning';
      results.featureVectors.issues.push('无数据');
    } else {
      const v1Count = await prisma.featureVector.count({ where: { featureVersion: 1 } });
      const v2Count = await prisma.featureVector.count({ where: { featureVersion: 2 } });

      console.log(`   📈 v1 (12维): ${v1Count}`);
      console.log(`   📈 v2 (22维): ${v2Count}`);

      // 检查最新的特征向量
      const latestVector = await prisma.featureVector.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { features: true, featureVersion: true }
      });

      if (latestVector) {
        let actualDim = 0;
        try {
          const features = latestVector.features;
          if (Array.isArray(features)) {
            actualDim = features.length;
          } else if (features?.values) {
            actualDim = features.values.length;
          }
        } catch (err) {
          console.log(`   ⚠️  特征向量格式解析失败`);
        }

        console.log(`   🔍 最新特征向量: v${latestVector.featureVersion}, 实际维度: ${actualDim}`);

        if (actualDim === 22) {
          console.log('   ✅ 扩展版（22维）特征向量已生效\n');
          results.featureVectors.status = 'ok';
        } else if (actualDim === 12) {
          console.log('   ⚠️  当前仍使用MVP版（12维），扩展版未激活\n');
          results.featureVectors.status = 'warning';
          results.featureVectors.issues.push('仅有12维特征向量');
        } else {
          console.log('   ❌ 特征向量维度异常\n');
          results.featureVectors.status = 'error';
          results.featureVectors.issues.push(`异常维度: ${actualDim}`);
        }
      }
    }

    // ==================== 4. 延迟奖励Worker检查 ====================
    console.log('4️⃣  延迟奖励Worker检查...');

    const totalRewards = await prisma.rewardQueue.count();
    console.log(`   📊 队列总数: ${totalRewards}`);

    if (totalRewards === 0) {
      console.log('   ℹ️  延迟奖励队列为空（正常，如果刚部署）\n');
      results.delayedReward.status = 'ok';
    } else {
      const statusCounts = await prisma.rewardQueue.groupBy({
        by: ['status'],
        _count: true
      });

      statusCounts.forEach(stat => {
        const icon = stat.status === 'DONE' ? '✅' : stat.status === 'FAILED' ? '❌' : '⏳';
        console.log(`   ${icon} ${stat.status}: ${stat._count}`);
      });

      // 检查是否有已到期但未处理的任务
      const now = new Date();
      const overdueCount = await prisma.rewardQueue.count({
        where: {
          status: 'PENDING',
          dueTs: { lte: now }
        }
      });

      // 检查最近5分钟内是否有任务完成
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentCompletedCount = await prisma.rewardQueue.count({
        where: {
          status: 'DONE',
          updatedAt: { gte: fiveMinutesAgo }
        }
      });

      if (overdueCount > 0 && recentCompletedCount === 0) {
        console.log(`   ⚠️  有 ${overdueCount} 个任务已到期但未处理`);
        console.log('   Worker可能未运行\n');
        results.delayedReward.status = 'warning';
        results.delayedReward.issues.push(`${overdueCount}个任务过期未处理`);
      } else if (recentCompletedCount > 0) {
        console.log(`   ✅ Worker正在运行（最近5分钟处理了${recentCompletedCount}个任务）\n`);
        results.delayedReward.status = 'ok';
      } else {
        console.log('   ✅ 队列状态正常\n');
        results.delayedReward.status = 'ok';
      }
    }

    // ==================== 5. 习惯画像检查 ====================
    console.log('5️⃣  习惯画像检查...');

    const habitCount = await prisma.habitProfile.count();
    console.log(`   📊 总数: ${habitCount}`);

    if (habitCount === 0) {
      console.log('   ℹ️  暂无习惯画像数据（正常，需要累积学习数据）\n');
      results.habitProfiles.status = 'ok';
    } else {
      const latestHabit = await prisma.habitProfile.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: {
          userId: true,
          timePref: true,
          rhythmPref: true,
          updatedAt: true
        }
      });

      if (latestHabit) {
        const hasTimePref = latestHabit.timePref !== null;
        const hasRhythmPref = latestHabit.rhythmPref !== null;

        console.log(`   🔍 最新习惯画像:`);
        console.log(`      用户: ${latestHabit.userId.slice(0, 8)}...`);
        console.log(`      时间偏好: ${hasTimePref ? '✅ 有' : '❌ 无'}`);
        console.log(`      节奏偏好: ${hasRhythmPref ? '✅ 有' : '❌ 无'}`);
        console.log(`      更新时间: ${latestHabit.updatedAt.toISOString()}`);
        console.log('   ✅ 习惯模型功能正常\n');
        results.habitProfiles.status = 'ok';
      }
    }

    // ==================== 6. 学习会话检查 ====================
    console.log('6️⃣  学习会话检查...');

    const sessionCount = await prisma.learningSession.count();
    console.log(`   📊 总数: ${sessionCount}`);

    if (sessionCount === 0) {
      console.log('   ℹ️  暂无学习会话数据\n');
      results.learningSessions.status = 'ok';
    } else {
      const latestSession = await prisma.learningSession.findFirst({
        orderBy: { startedAt: 'desc' },
        include: {
          featureVectors: true,
          rewardQueues: true
        }
      });

      if (latestSession) {
        console.log(`   🔍 最新学习会话:`);
        console.log(`      ID: ${latestSession.id.slice(0, 8)}...`);
        console.log(`      用户: ${latestSession.userId.slice(0, 8)}...`);
        console.log(`      开始: ${latestSession.startedAt.toISOString()}`);
        console.log(`      结束: ${latestSession.endedAt ? latestSession.endedAt.toISOString() : '进行中'}`);
        console.log(`      关联特征向量: ${latestSession.featureVectors.length} 个`);
        console.log(`      关联延迟奖励: ${latestSession.rewardQueues.length} 个`);
        console.log('   ✅ 学习会话功能正常\n');
        results.learningSessions.status = 'ok';
      }
    }

    // ==================== 7. 综合结论 ====================
    console.log('========================================');
    console.log('📋 综合诊断结论');
    console.log('========================================\n');

    const allOk = Object.values(results).every(r => r.status === 'ok');
    const hasWarnings = Object.values(results).some(r => r.status === 'warning');
    const hasErrors = Object.values(results).some(r => r.status === 'error');

    if (allOk) {
      console.log('✅ AMAS扩展版运行状态：优秀');
      console.log('   所有组件均正常工作\n');
    } else if (hasErrors) {
      console.log('❌ AMAS扩展版运行状态：存在问题');
      console.log('\n⚠️  发现的问题:');
      Object.entries(results).forEach(([module, result]) => {
        if (result.status === 'error') {
          console.log(`   - ${module}: ${result.issues.join(', ')}`);
        }
      });
      console.log('\n建议: 检查数据库迁移和服务配置\n');
    } else if (hasWarnings) {
      console.log('⚠️  AMAS扩展版运行状态：需要关注');
      console.log('\n⚠️  需要关注的项目:');
      Object.entries(results).forEach(([module, result]) => {
        if (result.status === 'warning') {
          console.log(`   - ${module}: ${result.issues.join(', ')}`);
        }
      });
      console.log('\n建议: 进行学习活动以生成扩展版数据\n');
    }

    // 8. 快速修复建议
    if (hasErrors || hasWarnings) {
      console.log('🔧 快速修复建议:\n');

      if (results.database.status === 'error') {
        console.log('   1. 运行数据库迁移:');
        console.log('      cd backend && npx prisma migrate deploy\n');
      }

      if (results.featureVectors.issues.includes('无数据') ||
          results.featureVectors.issues.includes('仅有12维特征向量')) {
        console.log('   2. 启动后端服务:');
        console.log('      cd backend && npm run dev\n');
        console.log('   3. 进行学习活动，生成扩展版数据\n');
      }

      if (results.delayedReward.issues.length > 0) {
        console.log('   4. 检查后端服务日志，确认Worker是否启动:');
        console.log('      应该看到: "Delayed reward worker started"\n');
      }
    }

    return results;

  } catch (error) {
    console.error('\n❌ 诊断过程出错:', error);
    return results;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行诊断
diagnoseAMASExtended()
  .then(() => {
    console.log('✅ 诊断完成\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 诊断异常:', error);
    process.exit(1);
  });
