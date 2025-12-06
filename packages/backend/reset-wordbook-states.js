/**
 * 重置指定词书的学习状态
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetWordbookStates(email, wordbookName) {
  console.log(`=== 重置词书学习状态 ===\n`);

  try {
    // 1. 查找用户
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('❌ 用户不存在:', email);
      return;
    }

    console.log(`✅ 用户: ${user.username} (${email})\n`);

    // 2. 查找词书
    const wordBook = await prisma.wordBook.findFirst({
      where: {
        name: { contains: wordbookName }
      },
      include: {
        _count: {
          select: { words: true }
        }
      }
    });

    if (!wordBook) {
      console.log(`❌ 找不到词书: ${wordbookName}\n`);
      return;
    }

    console.log(`✅ 找到词书: ${wordBook.name}`);
    console.log(`   单词数: ${wordBook._count.words}个\n`);

    // 3. 查找该词书下用户的所有学习状态
    const states = await prisma.wordLearningState.findMany({
      where: {
        userId: user.id,
        word: {
          wordBookId: wordBook.id
        }
      },
      include: {
        word: {
          select: {
            spelling: true
          }
        }
      }
    });

    if (states.length === 0) {
      console.log('ℹ️  该词书没有学习状态，无需重置\n');
      return;
    }

    console.log(`📊 找到 ${states.length} 个学习状态:`);
    for (const state of states) {
      console.log(`   - ${state.word.spelling}: ${state.state}, 掌握度${state.masteryLevel}`);
    }

    // 4. 删除学习状态
    const deleted = await prisma.wordLearningState.deleteMany({
      where: {
        userId: user.id,
        word: {
          wordBookId: wordBook.id
        }
      }
    });

    console.log(`\n✅ 已删除 ${deleted.count} 个学习状态\n`);

    // 5. 删除该词书的答题记录
    const recordsDeleted = await prisma.answerRecord.deleteMany({
      where: {
        userId: user.id,
        word: {
          wordBookId: wordBook.id
        }
      }
    });

    console.log(`✅ 已删除 ${recordsDeleted.count} 条答题记录\n`);

    // 6. 删除单词得分
    const scoresDeleted = await prisma.wordScore.deleteMany({
      where: {
        userId: user.id,
        word: {
          wordBookId: wordBook.id
        }
      }
    });

    console.log(`✅ 已删除 ${scoresDeleted.count} 个单词得分记录\n`);

    console.log('🎉 重置完成！该词书的单词现在可以重新学习了\n');

  } catch (error) {
    console.error('操作出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const wordbookName = process.argv[3];

if (!email || !wordbookName) {
  console.log('使用方法: node backend/reset-wordbook-states.js <用户邮箱> <词书名称>');
  console.log('\n例如:');
  console.log('  node backend/reset-wordbook-states.js lijiccc@gmail.com "CET-4"');
  console.log('  node backend/reset-wordbook-states.js lijiccc@gmail.com "小学词汇"');
  console.log('\n⚠️  警告：这将删除该词书的所有学习记录和进度！');
  process.exit(1);
}

resetWordbookStates(email, wordbookName);
