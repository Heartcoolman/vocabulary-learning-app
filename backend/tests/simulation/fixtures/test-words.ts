/**
 * 测试单词数据
 * 用于模拟学习测试
 */

import { faker } from '@faker-js/faker';
import type { PrismaClient } from '@prisma/client';

/**
 * 测试单词数据结构
 */
export interface TestWordData {
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
}

/**
 * 预定义的测试单词
 * 包含常见英语单词，确保测试数据的一致性
 */
export const PREDEFINED_WORDS: TestWordData[] = [
  { spelling: 'abandon', phonetic: '/əˈbændən/', meanings: ['放弃', '抛弃'], examples: ['They had to abandon the project.'] },
  { spelling: 'ability', phonetic: '/əˈbɪləti/', meanings: ['能力', '才能'], examples: ['She has the ability to learn quickly.'] },
  { spelling: 'achieve', phonetic: '/əˈtʃiːv/', meanings: ['实现', '达到'], examples: ['He achieved his goal.'] },
  { spelling: 'acquire', phonetic: '/əˈkwaɪər/', meanings: ['获得', '习得'], examples: ['She acquired new skills.'] },
  { spelling: 'adequate', phonetic: '/ˈædɪkwət/', meanings: ['足够的', '适当的'], examples: ['The resources are adequate.'] },
  { spelling: 'analyze', phonetic: '/ˈænəlaɪz/', meanings: ['分析'], examples: ['We need to analyze the data.'] },
  { spelling: 'approach', phonetic: '/əˈprəʊtʃ/', meanings: ['方法', '接近'], examples: ['This approach is effective.'] },
  { spelling: 'assume', phonetic: '/əˈsjuːm/', meanings: ['假设', '承担'], examples: ['I assume you are ready.'] },
  { spelling: 'benefit', phonetic: '/ˈbenɪfɪt/', meanings: ['利益', '好处'], examples: ['This will benefit everyone.'] },
  { spelling: 'concept', phonetic: '/ˈkɒnsept/', meanings: ['概念', '观念'], examples: ['The concept is simple.'] },
  { spelling: 'consist', phonetic: '/kənˈsɪst/', meanings: ['组成', '在于'], examples: ['The team consists of five people.'] },
  { spelling: 'context', phonetic: '/ˈkɒntekst/', meanings: ['上下文', '背景'], examples: ['Consider the context.'] },
  { spelling: 'create', phonetic: '/kriˈeɪt/', meanings: ['创造', '创建'], examples: ['Let us create something new.'] },
  { spelling: 'define', phonetic: '/dɪˈfaɪn/', meanings: ['定义', '规定'], examples: ['Please define the term.'] },
  { spelling: 'derive', phonetic: '/dɪˈraɪv/', meanings: ['源自', '获得'], examples: ['The word derives from Latin.'] },
  { spelling: 'distribute', phonetic: '/dɪˈstrɪbjuːt/', meanings: ['分配', '分发'], examples: ['Distribute the materials evenly.'] },
  { spelling: 'economy', phonetic: '/ɪˈkɒnəmi/', meanings: ['经济', '节约'], examples: ['The economy is improving.'] },
  { spelling: 'environment', phonetic: '/ɪnˈvaɪrənmənt/', meanings: ['环境'], examples: ['Protect the environment.'] },
  { spelling: 'establish', phonetic: '/ɪˈstæblɪʃ/', meanings: ['建立', '设立'], examples: ['They established a new company.'] },
  { spelling: 'estimate', phonetic: '/ˈestɪmeɪt/', meanings: ['估计', '评估'], examples: ['Can you estimate the cost?'] },
  { spelling: 'evidence', phonetic: '/ˈevɪdəns/', meanings: ['证据', '证明'], examples: ['There is no evidence.'] },
  { spelling: 'export', phonetic: '/ˈekspɔːt/', meanings: ['出口', '输出'], examples: ['We export goods worldwide.'] },
  { spelling: 'factor', phonetic: '/ˈfæktər/', meanings: ['因素', '要素'], examples: ['Time is an important factor.'] },
  { spelling: 'finance', phonetic: '/ˈfaɪnæns/', meanings: ['金融', '财务'], examples: ['Study finance at university.'] },
  { spelling: 'formula', phonetic: '/ˈfɔːmjələ/', meanings: ['公式', '配方'], examples: ['Use this formula.'] },
  { spelling: 'function', phonetic: '/ˈfʌŋkʃən/', meanings: ['功能', '函数'], examples: ['What is its function?'] },
  { spelling: 'identify', phonetic: '/aɪˈdentɪfaɪ/', meanings: ['识别', '确认'], examples: ['Can you identify the problem?'] },
  { spelling: 'income', phonetic: '/ˈɪnkʌm/', meanings: ['收入', '收益'], examples: ['Her income increased.'] },
  { spelling: 'indicate', phonetic: '/ˈɪndɪkeɪt/', meanings: ['表明', '指示'], examples: ['The results indicate success.'] },
  { spelling: 'individual', phonetic: '/ˌɪndɪˈvɪdʒuəl/', meanings: ['个人', '个体'], examples: ['Each individual is unique.'] },
  { spelling: 'interpret', phonetic: '/ɪnˈtɜːprɪt/', meanings: ['解释', '口译'], examples: ['How do you interpret this?'] },
  { spelling: 'involve', phonetic: '/ɪnˈvɒlv/', meanings: ['涉及', '包含'], examples: ['This involves a lot of work.'] },
  { spelling: 'issue', phonetic: '/ˈɪʃuː/', meanings: ['问题', '议题'], examples: ['This is an important issue.'] },
  { spelling: 'labor', phonetic: '/ˈleɪbər/', meanings: ['劳动', '劳工'], examples: ['Manual labor is hard work.'] },
  { spelling: 'legal', phonetic: '/ˈliːɡəl/', meanings: ['法律的', '合法的'], examples: ['Is this legal?'] },
  { spelling: 'legislate', phonetic: '/ˈledʒɪsleɪt/', meanings: ['立法'], examples: ['Parliament will legislate on this.'] },
  { spelling: 'major', phonetic: '/ˈmeɪdʒər/', meanings: ['主要的', '专业'], examples: ['This is a major problem.'] },
  { spelling: 'method', phonetic: '/ˈmeθəd/', meanings: ['方法', '方式'], examples: ['Use this method.'] },
  { spelling: 'occur', phonetic: '/əˈkɜːr/', meanings: ['发生', '出现'], examples: ['Problems may occur.'] },
  { spelling: 'percent', phonetic: '/pərˈsent/', meanings: ['百分比'], examples: ['Fifty percent agreed.'] },
  { spelling: 'period', phonetic: '/ˈpɪəriəd/', meanings: ['时期', '周期'], examples: ['During this period.'] },
  { spelling: 'policy', phonetic: '/ˈpɒləsi/', meanings: ['政策', '方针'], examples: ['The new policy is effective.'] },
  { spelling: 'principle', phonetic: '/ˈprɪnsəpəl/', meanings: ['原则', '原理'], examples: ['Follow this principle.'] },
  { spelling: 'proceed', phonetic: '/prəˈsiːd/', meanings: ['继续', '进行'], examples: ['Please proceed.'] },
  { spelling: 'process', phonetic: '/ˈprəʊses/', meanings: ['过程', '处理'], examples: ['The process takes time.'] },
  { spelling: 'require', phonetic: '/rɪˈkwaɪər/', meanings: ['需要', '要求'], examples: ['This requires attention.'] },
  { spelling: 'research', phonetic: '/rɪˈsɜːtʃ/', meanings: ['研究', '调查'], examples: ['Conduct research.'] },
  { spelling: 'respond', phonetic: '/rɪˈspɒnd/', meanings: ['回应', '响应'], examples: ['Please respond quickly.'] },
  { spelling: 'section', phonetic: '/ˈsekʃən/', meanings: ['部分', '章节'], examples: ['Read this section.'] },
  { spelling: 'significant', phonetic: '/sɪɡˈnɪfɪkənt/', meanings: ['重要的', '显著的'], examples: ['This is significant.'] },
];

/**
 * 创建测试词书和单词
 */
export async function createTestWordbook(
  prisma: PrismaClient,
  options: {
    wordCount?: number;
    wordbookName?: string;
  } = {}
): Promise<{ wordbookId: string; wordIds: string[] }> {
  const wordCount = options.wordCount || 50;
  const wordbookName = options.wordbookName || `[SIMULATION] Test Wordbook ${Date.now()}`;

  // 创建词书
  const wordbook = await prisma.wordBook.create({
    data: {
      name: wordbookName,
      description: '模拟学习测试专用词书',
      type: 'SYSTEM',
      wordCount: wordCount,
      isPublic: true,
    },
  });

  // 创建单词
  const wordIds: string[] = [];
  const wordsToCreate = wordCount <= PREDEFINED_WORDS.length
    ? PREDEFINED_WORDS.slice(0, wordCount)
    : [...PREDEFINED_WORDS, ...generateRandomWords(wordCount - PREDEFINED_WORDS.length)];

  for (const wordData of wordsToCreate) {
    const word = await prisma.word.create({
      data: {
        spelling: wordData.spelling,
        phonetic: wordData.phonetic,
        meanings: wordData.meanings,
        examples: wordData.examples,
        wordBookId: wordbook.id,
      },
    });
    wordIds.push(word.id);
  }

  return {
    wordbookId: wordbook.id,
    wordIds,
  };
}

/**
 * 生成随机单词数据
 */
function generateRandomWords(count: number): TestWordData[] {
  const words: TestWordData[] = [];

  for (let i = 0; i < count; i++) {
    words.push({
      spelling: `sim_word_${faker.string.alphanumeric(6)}`,
      phonetic: `/${faker.lorem.word()}/`,
      meanings: [faker.lorem.sentence(3)],
      examples: [faker.lorem.sentence()],
    });
  }

  return words;
}

/**
 * 清理测试词书和单词
 */
export async function cleanupTestWordbook(
  prisma: PrismaClient,
  wordbookId: string
): Promise<void> {
  // 先删除单词
  await prisma.word.deleteMany({
    where: { wordBookId: wordbookId },
  });

  // 再删除词书
  await prisma.wordBook.delete({
    where: { id: wordbookId },
  });
}

/**
 * 清理所有模拟测试数据
 */
export async function cleanupAllSimulationData(prisma: PrismaClient): Promise<{
  usersDeleted: number;
  wordbooksDeleted: number;
}> {
  // 查找所有模拟测试词书
  const simWordbooks = await prisma.wordBook.findMany({
    where: { name: { startsWith: '[SIMULATION]' } },
    select: { id: true },
  });

  // 删除相关单词
  for (const wb of simWordbooks) {
    await prisma.word.deleteMany({
      where: { wordBookId: wb.id },
    });
  }

  // 删除词书
  await prisma.wordBook.deleteMany({
    where: { name: { startsWith: '[SIMULATION]' } },
  });

  // 查找所有模拟测试用户
  const simUsers = await prisma.user.findMany({
    where: { username: { startsWith: 'sim_test_' } },
    select: { id: true },
  });

  // 删除用户相关数据
  for (const user of simUsers) {
    await prisma.answerRecord.deleteMany({ where: { userId: user.id } });
    await prisma.userStateHistory.deleteMany({ where: { userId: user.id } });
    await prisma.wordLearningState.deleteMany({ where: { userId: user.id } });
    await prisma.learningSession.deleteMany({ where: { userId: user.id } });
    await prisma.habitProfile.deleteMany({ where: { userId: user.id } });
  }

  // 删除用户
  await prisma.user.deleteMany({
    where: { username: { startsWith: 'sim_test_' } },
  });

  return {
    usersDeleted: simUsers.length,
    wordbooksDeleted: simWordbooks.length,
  };
}
