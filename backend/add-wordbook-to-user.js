/**
 * 为用户添加词书到学习计划
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addWordBookToUser(email, wordbookName) {
  console.log(`=== 为用户添加词书 ===\n`);

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
        name: { contains: wordbookName },
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: user.id }
        ]
      },
      include: {
        _count: {
          select: { words: true }
        }
      }
    });

    if (!wordBook) {
      console.log(`❌ 找不到词书: ${wordbookName}`);
      console.log('\n可用词书:');

      const allWordBooks = await prisma.wordBook.findMany({
        where: {
          OR: [
            { type: 'SYSTEM' },
            { type: 'USER', userId: user.id }
          ]
        },
        include: {
          _count: {
            select: { words: true }
          }
        }
      });

      for (const wb of allWordBooks) {
        console.log(`   - ${wb.name} (${wb._count.words}个单词)`);
      }

      return;
    }

    console.log(`✅ 找到词书: ${wordBook.name}`);
    console.log(`   单词数: ${wordBook._count.words}个\n`);

    // 3. 获取当前配置
    let config = await prisma.userStudyConfig.findUnique({
      where: { userId: user.id }
    });

    if (!config) {
      // 如果没有配置，创建一个
      config = await prisma.userStudyConfig.create({
        data: {
          userId: user.id,
          selectedWordBookIds: [wordBook.id],
          dailyWordCount: 20,
          studyMode: 'sequential'
        }
      });

      console.log('✅ 已创建新的学习配置并添加词书');
    } else {
      // 检查是否已经添加过
      if (config.selectedWordBookIds.includes(wordBook.id)) {
        console.log('⚠️  该词书已在学习计划中');
        return;
      }

      // 添加到配置
      await prisma.userStudyConfig.update({
        where: { userId: user.id },
        data: {
          selectedWordBookIds: [...config.selectedWordBookIds, wordBook.id]
        }
      });

      console.log('✅ 已将词书添加到学习计划');
    }

    // 4. 显示更新后的配置
    const updatedConfig = await prisma.userStudyConfig.findUnique({
      where: { userId: user.id }
    });

    console.log('\n📚 当前学习计划:');
    console.log(`   每日单词数: ${updatedConfig.dailyWordCount}`);

    const selectedWordBooks = await prisma.wordBook.findMany({
      where: {
        id: { in: updatedConfig.selectedWordBookIds }
      },
      include: {
        _count: {
          select: { words: true }
        }
      }
    });

    console.log(`   选择的词书 (${selectedWordBooks.length}个):`);
    for (const wb of selectedWordBooks) {
      console.log(`   - ${wb.name} (${wb._count.words}个单词)`);
    }

    const totalWords = selectedWordBooks.reduce((sum, wb) => sum + wb._count.words, 0);
    console.log(`   总单词数: ${totalWords}个\n`);

    console.log('✅ 完成！现在可以开始学习了\n');

  } catch (error) {
    console.error('操作出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const wordbookName = process.argv[3];

if (!email || !wordbookName) {
  console.log('使用方法: node backend/add-wordbook-to-user.js <用户邮箱> <词书名称>');
  console.log('\n例如:');
  console.log('  node backend/add-wordbook-to-user.js lijiccc@gmail.com "CET-4"');
  console.log('  node backend/add-wordbook-to-user.js lijiccc@gmail.com "日常"');
  process.exit(1);
}

addWordBookToUser(email, wordbookName);
