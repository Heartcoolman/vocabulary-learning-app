import { PrismaClient, UserRole, WordBookType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedBadges } from './seeds/badges';

const prisma = new PrismaClient();

async function main() {
  // 生产环境保护
  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ 生产环境禁止运行种子数据脚本！请使用专门的数据迁移工具。');
  }

  // 从环境变量获取密码
  const adminPassword = process.env.ADMIN_PASSWORD;
  const testUserPassword = process.env.TEST_USER_PASSWORD;

  // 开发环境允许使用默认密码，但需要显式设置 ALLOW_DEFAULT_PASSWORDS=true
  const allowDefaultPasswords = process.env.ALLOW_DEFAULT_PASSWORDS === 'true';

  if (!adminPassword || !testUserPassword) {
    if (allowDefaultPasswords) {
      console.log('⚠️  警告：使用默认测试密码（ALLOW_DEFAULT_PASSWORDS=true）');
    } else {
      throw new Error(
        '❌ 必须设置 ADMIN_PASSWORD 和 TEST_USER_PASSWORD 环境变量。\n' +
        '   如需在开发环境使用默认密码，请设置 ALLOW_DEFAULT_PASSWORDS=true'
      );
    }
  }

  // 使用环境变量或默认值（仅在显式允许时）
  const finalAdminPassword = adminPassword || 'admin123';
  const finalTestUserPassword = testUserPassword || 'password123';

  console.log('🌱 开始数据库种子...');

  // 创建管理员用户
  const adminPasswordHash = await bcrypt.hash(finalAdminPassword, 10);
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
  const userPasswordHash = await bcrypt.hash(finalTestUserPassword, 10);
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

  // 创建系统词库 - 小学词汇
  const primaryWordBook = await prisma.wordBook.create({
    data: {
      name: '小学词汇',
      description: '小学阶段必备英语单词，适合小学生学习使用',
      type: WordBookType.SYSTEM,
      userId: null,
      isPublic: true,
      coverImage: null,
    },
  });
  console.log('✅ 创建系统词库:', primaryWordBook.name);

  const primaryWords = [
    {
      spelling: 'apple',
      phonetic: 'ˈæpl',
      meanings: ['苹果'],
      examples: ['I like to eat apples.', 'An apple a day keeps the doctor away.'],
    },
    {
      spelling: 'book',
      phonetic: 'bʊk',
      meanings: ['书', '书本'],
      examples: ['This is my favorite book.', 'I read a book every week.'],
    },
    {
      spelling: 'cat',
      phonetic: 'kæt',
      meanings: ['猫'],
      examples: ['I have a cute cat.', 'The cat is sleeping.'],
    },
    {
      spelling: 'dog',
      phonetic: 'dɔːɡ',
      meanings: ['狗'],
      examples: ['My dog is very friendly.', 'Dogs are loyal animals.'],
    },
    {
      spelling: 'egg',
      phonetic: 'eɡ',
      meanings: ['鸡蛋', '蛋'],
      examples: ['I eat an egg for breakfast.', 'The hen laid an egg.'],
    },
    {
      spelling: 'fish',
      phonetic: 'fɪʃ',
      meanings: ['鱼'],
      examples: ['I like to eat fish.', 'There are many fish in the sea.'],
    },
    {
      spelling: 'girl',
      phonetic: 'ɡɜːrl',
      meanings: ['女孩'],
      examples: ['She is a smart girl.', 'The girl is playing.'],
    },
    {
      spelling: 'hand',
      phonetic: 'hænd',
      meanings: ['手'],
      examples: ['Wash your hands before eating.', 'Raise your hand if you know the answer.'],
    },
    {
      spelling: 'ice',
      phonetic: 'aɪs',
      meanings: ['冰'],
      examples: ['The ice is very cold.', 'I like ice cream.'],
    },
    {
      spelling: 'juice',
      phonetic: 'dʒuːs',
      meanings: ['果汁'],
      examples: ['I drink orange juice every morning.', 'This juice is delicious.'],
    },
    {
      spelling: 'kite',
      phonetic: 'kaɪt',
      meanings: ['风筝'],
      examples: ['Let\'s fly a kite.', 'The kite is flying high.'],
    },
    {
      spelling: 'lion',
      phonetic: 'ˈlaɪən',
      meanings: ['狮子'],
      examples: ['The lion is the king of animals.', 'I saw a lion at the zoo.'],
    },
    {
      spelling: 'milk',
      phonetic: 'mɪlk',
      meanings: ['牛奶'],
      examples: ['I drink milk every day.', 'Milk is good for your health.'],
    },
    {
      spelling: 'nose',
      phonetic: 'noʊz',
      meanings: ['鼻子'],
      examples: ['My nose is small.', 'The dog has a wet nose.'],
    },
    {
      spelling: 'orange',
      phonetic: 'ˈɔːrɪndʒ',
      meanings: ['橙子', '橙色'],
      examples: ['I like oranges.', 'Orange is my favorite color.'],
    },
    {
      spelling: 'pen',
      phonetic: 'pen',
      meanings: ['钢笔', '笔'],
      examples: ['I write with a pen.', 'This is a blue pen.'],
    },
    {
      spelling: 'queen',
      phonetic: 'kwiːn',
      meanings: ['女王', '王后'],
      examples: ['The queen is very kind.', 'She looks like a queen.'],
    },
    {
      spelling: 'rabbit',
      phonetic: 'ˈræbɪt',
      meanings: ['兔子'],
      examples: ['The rabbit is eating carrots.', 'I have a white rabbit.'],
    },
    {
      spelling: 'sun',
      phonetic: 'sʌn',
      meanings: ['太阳'],
      examples: ['The sun is shining.', 'The sun rises in the east.'],
    },
    {
      spelling: 'tree',
      phonetic: 'triː',
      meanings: ['树'],
      examples: ['There is a big tree in the garden.', 'Birds live in trees.'],
    },
    {
      spelling: 'umbrella',
      phonetic: 'ʌmˈbrelə',
      meanings: ['雨伞'],
      examples: ['Take an umbrella, it\'s raining.', 'My umbrella is red.'],
    },
    {
      spelling: 'van',
      phonetic: 'væn',
      meanings: ['货车', '面包车'],
      examples: ['The van is very big.', 'We travel in a van.'],
    },
    {
      spelling: 'water',
      phonetic: 'ˈwɔːtər',
      meanings: ['水'],
      examples: ['I drink water every day.', 'Water is important for life.'],
    },
    {
      spelling: 'box',
      phonetic: 'bɑːks',
      meanings: ['盒子', '箱子'],
      examples: ['Put the toys in the box.', 'This is a big box.'],
    },
    {
      spelling: 'yellow',
      phonetic: 'ˈjeloʊ',
      meanings: ['黄色'],
      examples: ['The banana is yellow.', 'Yellow is a bright color.'],
    },
    {
      spelling: 'zoo',
      phonetic: 'zuː',
      meanings: ['动物园'],
      examples: ['We went to the zoo yesterday.', 'There are many animals in the zoo.'],
    },
    {
      spelling: 'ball',
      phonetic: 'bɔːl',
      meanings: ['球'],
      examples: ['Let\'s play with the ball.', 'The ball is round.'],
    },
    {
      spelling: 'car',
      phonetic: 'kɑːr',
      meanings: ['汽车', '小汽车'],
      examples: ['My father has a new car.', 'The car is fast.'],
    },
    {
      spelling: 'desk',
      phonetic: 'desk',
      meanings: ['书桌', '课桌'],
      examples: ['My desk is clean.', 'Put the book on the desk.'],
    },
    {
      spelling: 'eye',
      phonetic: 'aɪ',
      meanings: ['眼睛'],
      examples: ['I have two eyes.', 'Her eyes are beautiful.'],
    },
    {
      spelling: 'face',
      phonetic: 'feɪs',
      meanings: ['脸', '面孔'],
      examples: ['Wash your face.', 'She has a round face.'],
    },
    {
      spelling: 'green',
      phonetic: 'ɡriːn',
      meanings: ['绿色'],
      examples: ['The grass is green.', 'I like green apples.'],
    },
    {
      spelling: 'house',
      phonetic: 'haʊs',
      meanings: ['房子', '住宅'],
      examples: ['This is my house.', 'The house is big.'],
    },
    {
      spelling: 'ink',
      phonetic: 'ɪŋk',
      meanings: ['墨水'],
      examples: ['The pen has blue ink.', 'I need some ink.'],
    },
    {
      spelling: 'jam',
      phonetic: 'dʒæm',
      meanings: ['果酱'],
      examples: ['I like strawberry jam.', 'Put jam on the bread.'],
    },
    {
      spelling: 'key',
      phonetic: 'kiː',
      meanings: ['钥匙'],
      examples: ['Where is my key?', 'Use the key to open the door.'],
    },
    {
      spelling: 'leg',
      phonetic: 'leɡ',
      meanings: ['腿'],
      examples: ['I have two legs.', 'My leg hurts.'],
    },
    {
      spelling: 'map',
      phonetic: 'mæp',
      meanings: ['地图'],
      examples: ['Look at the map.', 'I need a map of the city.'],
    },
    {
      spelling: 'name',
      phonetic: 'neɪm',
      meanings: ['名字', '姓名'],
      examples: ['What is your name?', 'My name is Tom.'],
    },
    {
      spelling: 'one',
      phonetic: 'wʌn',
      meanings: ['一', '一个'],
      examples: ['I have one brother.', 'One plus one equals two.'],
    },
    {
      spelling: 'pig',
      phonetic: 'pɪɡ',
      meanings: ['猪'],
      examples: ['The pig is pink.', 'Pigs like to eat.'],
    },
    {
      spelling: 'red',
      phonetic: 'red',
      meanings: ['红色'],
      examples: ['The apple is red.', 'I like red roses.'],
    },
    {
      spelling: 'star',
      phonetic: 'stɑːr',
      meanings: ['星星'],
      examples: ['I can see many stars at night.', 'The star is shining.'],
    },
    {
      spelling: 'table',
      phonetic: 'ˈteɪbl',
      meanings: ['桌子'],
      examples: ['Put the cup on the table.', 'We eat at the table.'],
    },
    {
      spelling: 'up',
      phonetic: 'ʌp',
      meanings: ['向上', '在上面'],
      examples: ['Look up at the sky.', 'The bird flew up.'],
    },
    {
      spelling: 'vest',
      phonetic: 'vest',
      meanings: ['背心', '马甲'],
      examples: ['I wear a vest in winter.', 'The vest is warm.'],
    },
    {
      spelling: 'window',
      phonetic: 'ˈwɪndoʊ',
      meanings: ['窗户'],
      examples: ['Open the window, please.', 'I can see the garden through the window.'],
    },
    {
      spelling: 'yes',
      phonetic: 'jes',
      meanings: ['是的', '对'],
      examples: ['Yes, I agree.', 'Yes, that is correct.'],
    },
    {
      spelling: 'zero',
      phonetic: 'ˈzɪroʊ',
      meanings: ['零'],
      examples: ['Zero is a number.', 'The temperature is zero degrees.'],
    },
    {
      spelling: 'blue',
      phonetic: 'bluː',
      meanings: ['蓝色'],
      examples: ['The sky is blue.', 'I have a blue shirt.'],
    },
  ];

  for (const wordData of primaryWords) {
    await prisma.word.create({
      data: {
        wordBookId: primaryWordBook.id,
        ...wordData,
      },
    });
  }

  await prisma.wordBook.update({
    where: { id: primaryWordBook.id },
    data: { wordCount: primaryWords.length },
  });
  console.log(`✅ 添加 ${primaryWords.length} 个单词到小学词汇词库`);

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
  await prisma.userStudyConfig.create({
    data: {
      userId: user.id,
      selectedWordBookIds: [cet4WordBook.id, userWordBook.id],
      dailyWordCount: 20,
      studyMode: 'sequential',
    },
  });
  console.log('✅ 创建用户学习配置');

  // 种子徽章数据（传递 prisma 实例以复用连接）
  await seedBadges(prisma);

  console.log('\n🎉 数据库种子完成！');
  console.log('\n📊 数据统计:');
  console.log(`- 用户数: ${await prisma.user.count()}`);
  console.log(`- 词库数: ${await prisma.wordBook.count()}`);
  console.log(`- 单词数: ${await prisma.word.count()}`);
  console.log(`- 学习配置: ${await prisma.userStudyConfig.count()}`);
  console.log(`- 徽章定义: ${await prisma.badgeDefinition.count()}`);
}

main()
  .catch((e) => {
    console.error('❌ 种子失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
