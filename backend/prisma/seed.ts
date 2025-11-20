import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('开始数据库种子...');

  // 创建测试用户
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash,
      username: '测试用户',
    },
  });

  console.log('✅ 创建测试用户:', user.email);

  // 创建示例单词
  const words = [
    {
      spelling: 'hello',
      phonetic: 'həˈloʊ',
      meanings: ['你好', '问候'],
      examples: ['Hello, how are you?', 'Say hello to everyone.'],
    },
    {
      spelling: 'world',
      phonetic: 'wɜːrld',
      meanings: ['世界'],
      examples: ['Hello world!', 'The world is beautiful.'],
    },
    {
      spelling: 'learn',
      phonetic: 'lɜːrn',
      meanings: ['学习', '学会'],
      examples: ['I learn English every day.', 'Learn from mistakes.'],
    },
    {
      spelling: 'vocabulary',
      phonetic: 'vəˈkæbjəleri',
      meanings: ['词汇', '词汇量'],
      examples: ['Expand your vocabulary.', 'English vocabulary is important.'],
    },
    {
      spelling: 'practice',
      phonetic: 'ˈpræktɪs',
      meanings: ['练习', '实践'],
      examples: ['Practice makes perfect.', 'Daily practice is essential.'],
    },
  ];

  for (const wordData of words) {
    const word = await prisma.word.create({
      data: {
        userId: user.id,
        ...wordData,
      },
    });
    console.log('✅ 创建单词:', word.spelling);
  }

  console.log('✅ 数据库种子完成！');
}

main()
  .catch((e) => {
    console.error('❌ 种子失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
