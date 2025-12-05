import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 调试 nextReviewDate 显示问题
 * 检查数据库中的实际值和可能的问题
 */
async function debugNextReviewDate() {
  console.log('🔍 调试 nextReviewDate 显示问题...\n');

  // 1. 统计 nextReviewDate 的各种情况
  const allStates = await prisma.wordLearningState.findMany({
    include: {
      user: { select: { username: true } },
      word: { select: { spelling: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  console.log(`📊 最近 50 条 WordLearningState 记录:\n`);

  // 分类统计
  const stats = {
    nullNextReview: 0,
    validNextReview: 0,
    pastNextReview: 0,
    futureNextReview: 0,
    nullLastReview: 0,
  };

  const now = new Date();

  console.log('用户'.padEnd(15) + '单词'.padEnd(15) + '状态'.padEnd(12) + 'lastReviewDate'.padEnd(25) + 'nextReviewDate'.padEnd(25) + '备注');
  console.log('-'.repeat(120));

  for (const state of allStates) {
    let note = '';

    if (state.nextReviewDate === null) {
      stats.nullNextReview++;
      note = '❌ nextReviewDate 为 null';
    } else {
      stats.validNextReview++;
      if (state.nextReviewDate < now) {
        stats.pastNextReview++;
        note = '⏰ 已过期（需要复习）';
      } else {
        stats.futureNextReview++;
        note = '✅ 未来日期';
      }
    }

    if (state.lastReviewDate === null) {
      stats.nullLastReview++;
      note += ' | lastReviewDate 为 null';
    }

    console.log(
      state.user.username.padEnd(15) +
      state.word.spelling.padEnd(15) +
      state.state.padEnd(12) +
      (state.lastReviewDate?.toISOString() || 'null').padEnd(25) +
      (state.nextReviewDate?.toISOString() || 'null').padEnd(25) +
      note
    );
  }

  console.log('\n📈 统计:');
  console.log(`   - nextReviewDate 为 null: ${stats.nullNextReview}`);
  console.log(`   - nextReviewDate 有值: ${stats.validNextReview}`);
  console.log(`     · 已过期: ${stats.pastNextReview}`);
  console.log(`     · 未来: ${stats.futureNextReview}`);
  console.log(`   - lastReviewDate 为 null: ${stats.nullLastReview}`);

  // 2. 检查 "orange" 单词的状态
  console.log('\n\n🔍 查找 "orange" 单词的学习状态:');
  const orangeStates = await prisma.wordLearningState.findMany({
    where: {
      word: { spelling: 'orange' }
    },
    include: {
      user: { select: { id: true, username: true, email: true } },
      word: { select: { id: true, spelling: true } },
    },
  });

  if (orangeStates.length === 0) {
    console.log('   未找到 "orange" 单词的学习状态');
  } else {
    for (const state of orangeStates) {
      console.log(`\n   用户: ${state.user.username} (${state.user.email})`);
      console.log(`   单词ID: ${state.wordId}`);
      console.log(`   状态: ${state.state}`);
      console.log(`   掌握程度: ${state.masteryLevel}`);
      console.log(`   复习次数: ${state.reviewCount}`);
      console.log(`   lastReviewDate: ${state.lastReviewDate?.toISOString() || 'null'}`);
      console.log(`   nextReviewDate: ${state.nextReviewDate?.toISOString() || 'null'}`);
      console.log(`   currentInterval: ${state.currentInterval}`);
      console.log(`   easeFactor: ${state.easeFactor}`);
      console.log(`   updatedAt: ${state.updatedAt.toISOString()}`);

      // 检查对应的 WordScore
      const score = await prisma.wordScore.findUnique({
        where: {
          unique_user_word_score: {
            userId: state.userId,
            wordId: state.wordId,
          }
        }
      });
      if (score) {
        console.log(`   📊 WordScore: totalScore=${score.totalScore}, totalAttempts=${score.totalAttempts}`);
      } else {
        console.log(`   📊 WordScore: 无记录`);
      }
    }
  }

  // 3. 检查所有有 WordScore 但没有 WordLearningState 的情况
  console.log('\n\n🔍 检查数据一致性: 有 WordScore 但没有 WordLearningState 的记录:');
  const scoresWithoutState = await prisma.$queryRaw`
    SELECT ws.*, w.spelling, u.username
    FROM word_scores ws
    LEFT JOIN word_learning_states wls ON ws."userId" = wls."userId" AND ws."wordId" = wls."wordId"
    LEFT JOIN words w ON ws."wordId" = w.id
    LEFT JOIN users u ON ws."userId" = u.id
    WHERE wls.id IS NULL
    LIMIT 10
  ` as any[];

  if (scoresWithoutState.length === 0) {
    console.log('   ✅ 没有数据不一致的情况');
  } else {
    console.log(`   ⚠️ 发现 ${scoresWithoutState.length} 条不一致记录:`);
    for (const score of scoresWithoutState) {
      console.log(`   - 用户: ${score.username}, 单词: ${score.spelling}, 得分: ${score.totalScore}`);
    }
  }

  // 4. 检查 WordLearningState 中 nextReviewDate 的类型分布
  console.log('\n\n🔍 检查 nextReviewDate 字段值类型分布:');
  const allLearningStates = await prisma.wordLearningState.findMany({
    take: 100,
    select: {
      id: true,
      nextReviewDate: true,
      lastReviewDate: true,
      reviewCount: true,
    },
  });

  const typeStats = {
    null: 0,
    validDate: 0,
    pastDate: 0,
    futureDate: 0,
    zeroReviewCount: 0,
  };

  const now = new Date();
  for (const state of allLearningStates) {
    if (state.nextReviewDate === null) {
      typeStats.null++;
    } else {
      typeStats.validDate++;
      if (state.nextReviewDate < now) {
        typeStats.pastDate++;
      } else {
        typeStats.futureDate++;
      }
    }
    if (state.reviewCount === 0) {
      typeStats.zeroReviewCount++;
    }
  }

  console.log(`   总记录数: ${allLearningStates.length}`);
  console.log(`   - nextReviewDate 为 null: ${typeStats.null}`);
  console.log(`   - nextReviewDate 有值: ${typeStats.validDate}`);
  console.log(`     · 已过期: ${typeStats.pastDate}`);
  console.log(`     · 未来日期: ${typeStats.futureDate}`);
  console.log(`   - reviewCount 为 0: ${typeStats.zeroReviewCount}`);

  // 5. 直接检查 API 会返回什么
  console.log('\n\n🔍 模拟 API 响应 (前5条记录):');
  const sampleStates = await prisma.wordLearningState.findMany({
    take: 5,
    include: {
      word: { select: { spelling: true } },
    },
  });

  for (const state of sampleStates) {
    console.log(`\n   单词: ${state.word.spelling}`);
    console.log(`   nextReviewDate 原始值: ${state.nextReviewDate}`);
    console.log(`   nextReviewDate 类型: ${typeof state.nextReviewDate}`);
    console.log(`   nextReviewDate instanceof Date: ${state.nextReviewDate instanceof Date}`);
    if (state.nextReviewDate) {
      console.log(`   nextReviewDate.toISOString(): ${state.nextReviewDate.toISOString()}`);
      console.log(`   nextReviewDate.getTime(): ${state.nextReviewDate.getTime()}`);
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('nextReviewDate 调试工具');
  console.log('='.repeat(60));
  console.log('\n');

  await debugNextReviewDate();

  console.log('\n' + '='.repeat(60));
  console.log('调试完成！');
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
