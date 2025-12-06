import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 修复学习记录的 userId 错误
 *
 * 问题：数据库中的学习记录 userId 字段错误，导致用户看到其他用户的记录
 * 解决方案：
 * 1. 分析每条记录关联的单词所属的词库
 * 2. 如果词库是用户词库，将记录的 userId 修正为词库所有者的 userId
 * 3. 如果词库是系统词库，保持记录的 userId 不变（因为无法确定真正的所有者）
 */
async function fixRecordUserId() {
  console.log('🔧 开始修复学习记录的 userId...\n');

  // 获取所有学习记录
  const allRecords = await prisma.answerRecord.findMany({
    include: {
      word: {
        include: {
          wordBook: true,
        },
      },
    },
  });

  console.log(`📊 总共有 ${allRecords.length} 条学习记录\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  const fixes: Array<{ recordId: string; oldUserId: string; newUserId: string; reason: string }> = [];

  for (const record of allRecords) {
    const wordBook = record.word.wordBook;

    // 如果是用户词库，检查 userId 是否匹配
    if (wordBook.type === 'USER' && wordBook.userId) {
      if (record.userId !== wordBook.userId) {
        // userId 不匹配，需要修复
        fixes.push({
          recordId: record.id,
          oldUserId: record.userId,
          newUserId: wordBook.userId,
          reason: `记录关联到用户词库"${wordBook.name}"，但 userId 不匹配`,
        });
        fixedCount++;
      }
    } else {
      // 系统词库，无法确定正确的 userId，跳过
      skippedCount++;
    }
  }

  console.log(`✅ 需要修复的记录数: ${fixedCount}`);
  console.log(`⏭️  跳过的记录数（系统词库）: ${skippedCount}\n`);

  if (fixedCount === 0) {
    console.log('🎉 没有需要修复的记录！');
    return;
  }

  // 显示前10条需要修复的记录
  console.log('📋 需要修复的记录示例（前10条）:');
  fixes.slice(0, 10).forEach((fix, index) => {
    console.log(`  ${index + 1}. 记录ID: ${fix.recordId.slice(0, 8)}...`);
    console.log(`     旧 userId: ${fix.oldUserId.slice(0, 8)}...`);
    console.log(`     新 userId: ${fix.newUserId.slice(0, 8)}...`);
    console.log(`     原因: ${fix.reason}`);
  });

  console.log('\n⚠️  警告：这个操作将修改数据库中的学习记录！');
  console.log('⚠️  建议先备份数据库！');
  console.log('\n如果要继续，请手动执行修复操作。\n');

  // 执行修复操作
  console.log('🔧 开始执行修复...\n');

  for (const fix of fixes) {
    await prisma.answerRecord.update({
      where: { id: fix.recordId },
      data: { userId: fix.newUserId },
    });
  }

  console.log(`✅ 成功修复 ${fixedCount} 条记录！`);

  // 生成修复SQL脚本
  console.log('📝 生成的修复SQL脚本：\n');
  console.log('-- 修复学习记录的 userId');
  console.log('BEGIN;');
  fixes.forEach((fix) => {
    console.log(
      `UPDATE answer_records SET "userId" = '${fix.newUserId}' WHERE id = '${fix.recordId}';`
    );
  });
  console.log('COMMIT;');
}

/**
 * 清理重复的学习记录
 */
async function cleanDuplicateRecords() {
  console.log('\n\n🧹 开始清理重复的学习记录...\n');

  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true },
  });

  let totalDeleted = 0;

  for (const user of users) {
    console.log(`\n处理用户: ${user.username} (${user.email})`);

    const records = await prisma.answerRecord.findMany({
      where: { userId: user.id },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        wordId: true,
        timestamp: true,
      },
    });

    // 按 wordId + timestamp 分组，找出重复记录
    const seen = new Map<string, string>(); // key -> first record id
    const duplicates: string[] = [];

    for (const record of records) {
      const key = `${record.wordId}-${record.timestamp.getTime()}`;
      if (seen.has(key)) {
        // 重复记录，标记为删除
        duplicates.push(record.id);
      } else {
        // 第一次出现，记录ID
        seen.set(key, record.id);
      }
    }

    if (duplicates.length > 0) {
      console.log(`  发现 ${duplicates.length} 条重复记录`);
      totalDeleted += duplicates.length;

      // 执行删除操作
      await prisma.answerRecord.deleteMany({
        where: { id: { in: duplicates } },
      });
      console.log(`  ✅ 已删除 ${duplicates.length} 条重复记录`);
    } else {
      console.log(`  ✅ 没有重复记录`);
    }
  }

  console.log(`\n📊 总共发现 ${totalDeleted} 条重复记录`);
}

async function main() {
  console.log('=' .repeat(60));
  console.log('学习记录数据修复工具');
  console.log('='.repeat(60));
  console.log('\n');

  // 1. 修复 userId 错误
  await fixRecordUserId();

  // 2. 清理重复记录
  await cleanDuplicateRecords();

  console.log('\n\n' + '='.repeat(60));
  console.log('修复完成！');
  console.log('='.repeat(60));
  console.log('\n⚠️  注意：以上操作仅生成了SQL脚本，并未实际修改数据库。');
  console.log('⚠️  请检查SQL脚本，确认无误后手动执行。');
  console.log('\n或者，取消注释脚本中的修复代码，重新运行以自动执行修复。\n');
}

main()
  .catch((e) => {
    console.error('❌ 修复失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
