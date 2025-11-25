import { PrismaClient, WordBookType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📚 小学词汇 - 完整单词列表\n');
  console.log('='.repeat(80));

  // 查询小学词汇词书
  const primaryWordBook = await prisma.wordBook.findFirst({
    where: {
      name: '小学词汇',
      type: WordBookType.SYSTEM,
    },
  });

  if (!primaryWordBook) {
    console.log('❌ 未找到小学词汇词书');
    return;
  }

  // 查询所有单词
  const words = await prisma.word.findMany({
    where: { wordBookId: primaryWordBook.id },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n共 ${words.length} 个单词\n`);

  words.forEach((word, index) => {
    console.log(`${(index + 1).toString().padStart(2, '0')}. ${word.spelling.padEnd(15)} [${word.phonetic}]`);
    console.log(`    释义: ${word.meanings.join(', ')}`);
    console.log(`    例句: ${word.examples[0]}`);
    if (index < words.length - 1) {
      console.log('');
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ 小学词汇词书创建成功！');
}

main()
  .catch((e) => {
    console.error('❌ 查询失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
