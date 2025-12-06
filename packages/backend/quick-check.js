const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function quickCheck() {
  const [answers, amasStates, sessions, vectors] = await Promise.all([
    prisma.answerRecord.count(),
    prisma.amasUserState.count(),
    prisma.learningSession.count(),
    prisma.featureVector.count()
  ]);

  console.log('\n快速统计:');
  console.log(`答题记录: ${answers}`);
  console.log(`AMAS状态: ${amasStates}`);
  console.log(`学习会话: ${sessions}`);
  console.log(`特征向量: ${vectors}\n`);

  if (answers > 0 && amasStates === 0) {
    console.log('❌ 问题：有答题但AMAS未运行');
    console.log('说明：前端答题后没有调用AMAS API\n');
  }

  await prisma.$disconnect();
}

quickCheck().catch(console.error);
