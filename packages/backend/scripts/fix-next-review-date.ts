import { PrismaClient, WordLearningState } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 修复 WordLearningState 表中 nextReviewDate 为 null 的记录
 *
 * 问题：某些历史记录的 nextReviewDate 字段为 null，导致前端显示"未知"
 * 解决方案：根据现有数据计算合理的 nextReviewDate 值
 *
 * 计算逻辑：
 * 1. 如果有 lastReviewDate 和 currentInterval：nextReviewDate = lastReviewDate + currentInterval * easeFactor
 * 2. 如果只有 lastReviewDate：使用默认复习间隔
 * 3. 如果没有 lastReviewDate：设为当前时间（立即可复习）
 */

// 默认复习间隔（天），按复习次数递增
const DEFAULT_REVIEW_INTERVALS = [1, 3, 7, 15, 30];

/**
 * 计算下次复习时间
 */
function calculateNextReviewDate(state: WordLearningState): Date {
  const now = new Date();

  // 如果没有上次复习时间，设为当前时间（立即可复习）
  if (!state.lastReviewDate) {
    return now;
  }

  const lastReviewTime = state.lastReviewDate.getTime();

  // 获取间隔天数
  let intervalDays: number;
  if (state.currentInterval && state.currentInterval > 0) {
    intervalDays = state.currentInterval;
  } else {
    // 根据复习次数获取默认间隔
    const reviewCount = state.reviewCount || 0;
    const intervalIndex = Math.min(reviewCount, DEFAULT_REVIEW_INTERVALS.length - 1);
    intervalDays = DEFAULT_REVIEW_INTERVALS[intervalIndex];
  }

  // 应用难度因子（早期复习不放大间隔）
  const easeFactor = state.easeFactor || 2.5;
  const applyEaseFactor = (state.reviewCount || 0) > 2;
  const effectiveEase = applyEaseFactor ? easeFactor : 1;

  // 计算调整后的间隔（至少1天）
  const adjustedIntervalDays = Math.max(1, Math.round(intervalDays * effectiveEase));

  // 计算下次复习时间
  const intervalMs = adjustedIntervalDays * 24 * 60 * 60 * 1000;
  const nextReviewDate = new Date(lastReviewTime + intervalMs);

  // 如果计算出的时间已经过去，设为当前时间（立即可复习）
  if (nextReviewDate < now) {
    return now;
  }

  return nextReviewDate;
}

/**
 * 分析并修复 nextReviewDate 为 null 的记录
 */
async function fixNextReviewDate(dryRun: boolean = true) {
  console.log('🔧 开始修复 WordLearningState 的 nextReviewDate 字段...\n');
  console.log(`📋 模式: ${dryRun ? '预览模式（不修改数据）' : '执行模式'}\n`);

  // 查询所有 nextReviewDate 为 null 的记录
  const nullRecords = await prisma.wordLearningState.findMany({
    where: { nextReviewDate: null },
    include: {
      user: { select: { username: true, email: true } },
      word: { select: { spelling: true } },
    },
  });

  console.log(`📊 找到 ${nullRecords.length} 条 nextReviewDate 为 null 的记录\n`);

  if (nullRecords.length === 0) {
    console.log('🎉 没有需要修复的记录！');
    return;
  }

  // 统计信息
  const stats = {
    total: nullRecords.length,
    withLastReview: 0,
    withoutLastReview: 0,
    byState: {} as Record<string, number>,
  };

  // 准备修复数据
  const fixes: Array<{
    id: string;
    userId: string;
    wordId: string;
    username: string;
    wordSpelling: string;
    state: string;
    masteryLevel: number;
    reviewCount: number;
    lastReviewDate: Date | null;
    currentInterval: number;
    calculatedNextReview: Date;
  }> = [];

  for (const record of nullRecords) {
    const nextReviewDate = calculateNextReviewDate(record);

    // 统计
    if (record.lastReviewDate) {
      stats.withLastReview++;
    } else {
      stats.withoutLastReview++;
    }
    stats.byState[record.state] = (stats.byState[record.state] || 0) + 1;

    fixes.push({
      id: record.id,
      userId: record.userId,
      wordId: record.wordId,
      username: record.user.username,
      wordSpelling: record.word.spelling,
      state: record.state,
      masteryLevel: record.masteryLevel,
      reviewCount: record.reviewCount,
      lastReviewDate: record.lastReviewDate,
      currentInterval: record.currentInterval,
      calculatedNextReview: nextReviewDate,
    });
  }

  // 输出统计信息
  console.log('📈 统计信息:');
  console.log(`   - 有上次复习时间: ${stats.withLastReview}`);
  console.log(`   - 无上次复习时间: ${stats.withoutLastReview}`);
  console.log('   - 按状态分布:');
  Object.entries(stats.byState).forEach(([state, count]) => {
    console.log(`     · ${state}: ${count}`);
  });

  // 显示前10条记录
  console.log('\n📋 需要修复的记录示例（前10条）:');
  console.log('-'.repeat(100));
  fixes.slice(0, 10).forEach((fix, index) => {
    console.log(
      `${index + 1}. 用户: ${fix.username.padEnd(15)} ` +
        `单词: ${fix.wordSpelling.padEnd(15)} ` +
        `状态: ${fix.state.padEnd(10)} ` +
        `掌握度: ${fix.masteryLevel} ` +
        `复习次数: ${fix.reviewCount}`
    );
    console.log(
      `   上次复习: ${fix.lastReviewDate?.toISOString() || '无'} ` +
        `-> 下次复习: ${fix.calculatedNextReview.toISOString()}`
    );
  });

  if (fixes.length > 10) {
    console.log(`   ... 还有 ${fixes.length - 10} 条记录`);
  }

  if (dryRun) {
    console.log('\n⚠️  预览模式：未修改任何数据');
    console.log('💡 如需执行修复，请使用: npx tsx scripts/fix-next-review-date.ts --execute');

    // 生成SQL脚本供参考
    console.log('\n📝 生成的修复SQL脚本（前10条）：\n');
    console.log('-- 修复 word_learning_states 表的 nextReviewDate 字段');
    console.log('BEGIN;');
    fixes.slice(0, 10).forEach((fix) => {
      console.log(
        `UPDATE word_learning_states SET "nextReviewDate" = '${fix.calculatedNextReview.toISOString()}' WHERE id = '${fix.id}';`
      );
    });
    if (fixes.length > 10) {
      console.log(`-- ... 还有 ${fixes.length - 10} 条更新语句`);
    }
    console.log('COMMIT;');
    return;
  }

  // 执行修复
  console.log('\n🔧 开始执行修复...\n');

  let successCount = 0;
  let errorCount = 0;

  // 使用事务批量更新
  const batchSize = 100;
  for (let i = 0; i < fixes.length; i += batchSize) {
    const batch = fixes.slice(i, i + batchSize);
    console.log(`   处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(fixes.length / batchSize)}...`);

    try {
      await prisma.$transaction(
        batch.map((fix) =>
          prisma.wordLearningState.update({
            where: { id: fix.id },
            data: { nextReviewDate: fix.calculatedNextReview },
          })
        )
      );
      successCount += batch.length;
    } catch (error) {
      console.error(`   ❌ 批次更新失败:`, error);
      errorCount += batch.length;
    }
  }

  console.log(`\n✅ 修复完成！`);
  console.log(`   - 成功: ${successCount}`);
  console.log(`   - 失败: ${errorCount}`);
}

/**
 * 验证修复结果
 */
async function verifyFix() {
  console.log('\n🔍 验证修复结果...\n');

  const nullCount = await prisma.wordLearningState.count({
    where: { nextReviewDate: null },
  });

  const totalCount = await prisma.wordLearningState.count();

  console.log(`📊 WordLearningState 表统计:`);
  console.log(`   - 总记录数: ${totalCount}`);
  console.log(`   - nextReviewDate 为 null: ${nullCount}`);
  console.log(`   - nextReviewDate 有值: ${totalCount - nullCount}`);

  if (nullCount === 0) {
    console.log('\n🎉 所有记录的 nextReviewDate 都已正确设置！');
  } else {
    console.log(`\n⚠️  还有 ${nullCount} 条记录的 nextReviewDate 为 null`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('WordLearningState nextReviewDate 修复工具');
  console.log('='.repeat(60));
  console.log('\n');

  // 检查命令行参数
  const args = process.argv.slice(2);
  const executeMode = args.includes('--execute') || args.includes('-e');
  const verifyOnly = args.includes('--verify') || args.includes('-v');

  if (verifyOnly) {
    await verifyFix();
  } else {
    await fixNextReviewDate(!executeMode);
    if (executeMode) {
      await verifyFix();
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('完成！');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ 执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
