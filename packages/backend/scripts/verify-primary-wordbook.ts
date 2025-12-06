import { PrismaClient, WordBookType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📚 查询小学词汇词书...\n');

  // 查询小学词汇词书
  const primaryWordBook = await prisma.wordBook.findFirst({
    where: {
      name: '小学词汇',
      type: WordBookType.SYSTEM,
    },
    include: {
      _count: {
        select: { words: true },
      },
    },
  });

  if (!primaryWordBook) {
    console.log('❌ 未找到小学词汇词书');
    return;
  }

  console.log('✅ 词书信息:');
  console.log(`   ID: ${primaryWordBook.id}`);
  console.log(`   名称: ${primaryWordBook.name}`);
  console.log(`   描述: ${primaryWordBook.description}`);
  console.log(`   类型: ${primaryWordBook.type}`);
  console.log(`   单词数量: ${primaryWordBook.wordCount}`);
  console.log(`   实际单词数: ${primaryWordBook._count.words}`);
  console.log(`   创建时间: ${primaryWordBook.createdAt}`);

  // 查询前10个单词
  console.log('\n📝 前10个单词:');
  const words = await prisma.word.findMany({
    where: { wordBookId: primaryWordBook.id },
    take: 10,
    orderBy: { createdAt: 'asc' },
  });

  words.forEach((word, index) => {
    console.log(`\n${index + 1}. ${word.spelling} [${word.phonetic}]`);
    console.log(`   释义: ${word.meanings.join(', ')}`);
    console.log(`   例句: ${word.examples[0]}`);
  });

  // 统计所有系统词书
  console.log('\n\n📊 所有系统词书:');
  const systemWordBooks = await prisma.wordBook.findMany({
    where: { type: WordBookType.SYSTEM },
    include: {
      _count: {
        select: { words: true },
      },
    },
  });

  systemWordBooks.forEach((wb) => {
    console.log(`\n- ${wb.name}`);
    console.log(`  描述: ${wb.description}`);
    console.log(`  单词数: ${wb.wordCount}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ 查询失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
