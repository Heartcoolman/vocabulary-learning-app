import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * 清理测试数据库
 * 按照外键依赖顺序删除所有表数据
 *
 * 删除顺序原则：先删除依赖表，再删除被依赖的表
 */
export async function cleanDatabase() {
  // 第一层：删除最底层依赖表（无其他表依赖这些表）
  await prisma.featureVector.deleteMany();
  await prisma.rewardQueue.deleteMany();
  await prisma.userStateHistory.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.learningPlan.deleteMany();
  await prisma.habitProfile.deleteMany();
  await prisma.amasUserState.deleteMany();
  await prisma.amasUserModel.deleteMany();

  // 第二层：删除中间层表
  await prisma.anomalyFlag.deleteMany();
  await prisma.configHistory.deleteMany();
  await prisma.wordScore.deleteMany();
  await prisma.wordLearningState.deleteMany();
  await prisma.answerRecord.deleteMany();
  await prisma.learningSession.deleteMany();

  // 第三层：删除配置和会话表
  await prisma.algorithmConfig.deleteMany();
  await prisma.userStudyConfig.deleteMany();
  await prisma.session.deleteMany();
  await prisma.badgeDefinition.deleteMany();

  // 第四层：删除单词表（依赖词书）
  await prisma.word.deleteMany();

  // 第五层：删除词书表（依赖用户）
  await prisma.wordBook.deleteMany();

  // 第六层：删除用户表（最顶层被依赖表）
  await prisma.user.deleteMany();
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
