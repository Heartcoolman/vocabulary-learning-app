import { PrismaClient, UserRole, WordBookType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始数据库种子...');

  // 创建管理员用户
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      role: UserRole.ADMIN,
    },
    create: {
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      username: '管理员',
      role: UserRole.ADMIN,
    },
  });
  console.log('✅ 创建管理员用户:', admin.email);

  // 创建测试用户
  const userPasswordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {
      role: UserRole.USER,
    },
    create: {
      email: 'test@example.com',
      passwordHash: userPasswordHash,
      username: '测试用户',
      role: UserRole.USER,
    },
  });
  console.log('✅ 创建测试用户:', user.email);

  //创建系统词库 - CET-4 核心词汇
  const cet4WordBook = await prisma.wordBook.create({
    data: {
      name: 'CET-4 核心词汇',
      description: '大学英语四级考试核心词汇，适合英语四级备考使用',
      type: WordBookType.SYSTEM,
      userId: null,
      isPublic: true,
      coverImage: null,
    },
  });
  console.log('✅ 创建系统词库:', cet4WordBook.name);

  // 为CET-4词库添加示例单词
  const cet4Words = [
    {
      spelling: 'abandon',
      phonetic: 'əˈbændən',
      meanings: ['放弃', '抛弃', '遗弃'],
      examples: [
        'We had to abandon the car and walk.',
        'They abandoned the project due to lack of funds.',
      ],
    },
    {
      spelling: 'ability',
      phonetic: 'əˈbɪləti',
      meanings: ['能力', '才能'],
      examples: [
        'She has the ability to speak three languages.',
        'His ability in mathematics is outstanding.',
      ],
    },
    {
      spelling: 'abroad',
      phonetic: 'əˈbrɔːd',
      meanings: ['在国外', '到国外'],
      examples: [
        'She has been living abroad for five years.',
        'Many students go abroad to study.',
      ],
    },
    {
      spelling: 'academic',
      phonetic: 'ˌækəˈdemɪk',
      meanings: ['学术的', '学业的'],
      examples: [
        'He achieved academic excellence.',
        'This is a purely academic question.',
      ],
    },
    {
      spelling: 'accomplish',
      phonetic: 'əˈkʌmplɪʃ',
      meanings: ['完成', '达到', '实现'],
      examples: [
        'We need to accomplish this task by Friday.',
        'She has accomplished a lot in her career.',
      ],
    },
  ];

  for (const wordData of cet4Words) {
    await prisma.word.create({
      data: {
        wordBookId: cet4WordBook.id,
        ...wordData,
      },
    });
  }

  // 更新词书的单词数量
  await prisma.wordBook.update({
    where: { id: cet4WordBook.id },
    data: { wordCount: cet4Words.length },
  });
  console.log(`✅ 添加 ${cet4Words.length} 个单词到 CET-4 词库`);

  // 创建系统词库 - 日常英语
  const dailyWordBook = await prisma.wordBook.create({
    data: {
      name: '日常英语口语',
      description: '日常生活中常用的英语口语表达，适合日常交流使用',
      type: WordBookType.SYSTEM,
      userId: null,
      isPublic: true,
      coverImage: null,
    },
  });
  console.log('✅ 创建系统词库:', dailyWordBook.name);

  const dailyWords = [
    {
      spelling: 'hello',
      phonetic: 'həˈloʊ',
      meanings: ['你好', '问候'],
      examples: ['Hello, how are you?', 'Say hello to everyone.'],
    },
    {
      spelling: 'goodbye',
      phonetic: 'ɡʊdˈbaɪ',
      meanings: ['再见'],
      examples: [
        'Goodbye, see you tomorrow!',
        'It is time to say goodbye.',
      ],
    },
    {
      spelling: 'thanks',
      phonetic: 'θæŋks',
      meanings: ['谢谢', '感谢'],
      examples: ['Thanks for your help!', 'Many thanks for the gift.'],
    },
  ];

  for (const wordData of dailyWords) {
    await prisma.word.create({
      data: {
        wordBookId: dailyWordBook.id,
        ...wordData,
      },
    });
  }

  await prisma.wordBook.update({
    where: { id: dailyWordBook.id },
    data: { wordCount: dailyWords.length },
  });
  console.log(`✅ 添加 ${dailyWords.length} 个单词到日常英语词库`);

  // 为测试用户创建默认词书
  const userWordBook = await prisma.wordBook.create({
    data: {
      name: '我的单词本',
      description: '个人收藏的单词',
      type: WordBookType.USER,
      userId: user.id,
      isPublic: false,
    },
  });
  console.log('✅ 创建用户词库:', userWordBook.name);

  // 为用户词库添加几个示例单词
  const userWords = [
    {
      spelling: 'learn',
      phonetic: 'lɜːrn',
      meanings: ['学习', '学会'],
      examples: [
        'I learn English every day.',
        'Learn from mistakes.',
      ],
    },
    {
      spelling: 'vocabulary',
      phonetic: 'vəˈkæbjəleri',
      meanings: ['词汇', '词汇量'],
      examples: [
        'Expand your vocabulary.',
        'English vocabulary is important.',
      ],
    },
  ];

  for (const wordData of userWords) {
    await prisma.word.create({
      data: {
        wordBookId: userWordBook.id,
        ...wordData,
      },
    });
  }

  await prisma.wordBook.update({
    where: { id: userWordBook.id },
    data: { wordCount: userWords.length },
  });
  console.log(`✅ 添加 ${userWords.length} 个单词到用户词库`);

  // 为测试用户创建学习配置
  const studyConfig = await prisma.userStudyConfig.create({
    data: {
      userId: user.id,
      selectedWordBookIds: [cet4WordBook.id, userWordBook.id],
      dailyWordCount: 20,
      studyMode: 'sequential',
    },
  });
  console.log('✅ 创建用户学习配置');

  console.log('\n🎉 数据库种子完成！');
  console.log('\n📊 数据统计:');
  console.log(`- 用户数: ${await prisma.user.count()}`);
  console.log(`- 词库数: ${await prisma.wordBook.count()}`);
  console.log(`- 单词数: ${await prisma.word.count()}`);
  console.log(`- 学习配置: ${await prisma.userStudyConfig.count()}`);
}

main()
  .catch((e) => {
    console.error('❌ 种子失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
