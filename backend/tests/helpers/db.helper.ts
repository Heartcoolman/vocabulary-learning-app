import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * 安全删除表数据，忽略不存在的表
 */
async function safeDeleteMany(model: any): Promise<void> {
  try {
    await model.deleteMany();
  } catch (error: any) {
    // 忽略表不存在的错误
    if (!error.message?.includes('does not exist')) {
      throw error;
    }
  }
}

/**
 * 清理测试数据库
 * 按照外键依赖顺序删除所有表数据
 *
 * 删除顺序原则：先删除依赖表，再删除被依赖的表
 */
export async function cleanDatabase() {
  // 第一层：删除最底层依赖表（无其他表依赖这些表）
  await safeDeleteMany(prisma.featureVector);
  await safeDeleteMany(prisma.rewardQueue);
  await safeDeleteMany(prisma.userStateHistory);
  await safeDeleteMany(prisma.userBadge);
  await safeDeleteMany(prisma.learningPlan);
  await safeDeleteMany(prisma.habitProfile);
  await safeDeleteMany(prisma.amasUserState);
  await safeDeleteMany(prisma.amasUserModel);
  await safeDeleteMany(prisma.pipelineStage);
  await safeDeleteMany(prisma.decisionInsight);
  await safeDeleteMany(prisma.decisionRecord);
  await safeDeleteMany(prisma.causalObservation);
  await safeDeleteMany(prisma.abExperimentMetric);
  await safeDeleteMany(prisma.abUserAssignment);
  await safeDeleteMany(prisma.abVariant);
  await safeDeleteMany(prisma.abExperiment);
  await safeDeleteMany(prisma.bayesianOptimizerState);

  // 第二层：删除中间层表
  await safeDeleteMany(prisma.anomalyFlag);
  await safeDeleteMany(prisma.configHistory);
  await safeDeleteMany(prisma.wordScore);
  await safeDeleteMany(prisma.wordLearningState);
  await safeDeleteMany(prisma.wordReviewTrace);
  await safeDeleteMany(prisma.answerRecord);
  await safeDeleteMany(prisma.learningSession);

  // 第三层：删除配置和会话表
  await safeDeleteMany(prisma.algorithmConfig);
  await safeDeleteMany(prisma.userStudyConfig);
  await safeDeleteMany(prisma.session);
  await safeDeleteMany(prisma.badgeDefinition);

  // 第四层：删除单词表（依赖词书）
  await safeDeleteMany(prisma.word);
  await safeDeleteMany(prisma.wordFrequency);

  // 第五层：删除词书表（依赖用户）
  await safeDeleteMany(prisma.wordBook);

  // 第六层：删除用户表（最顶层被依赖表）
  await safeDeleteMany(prisma.user);
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
