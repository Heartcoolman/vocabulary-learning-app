import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function cleanDatabase() {
  await prisma.anomalyFlag.deleteMany();
  await prisma.configHistory.deleteMany();
  await prisma.algorithmConfig.deleteMany();
  await prisma.wordScore.deleteMany();
  await prisma.wordLearningState.deleteMany();
  await prisma.answerRecord.deleteMany();
  await prisma.userStudyConfig.deleteMany();
  await prisma.session.deleteMany();
  await prisma.word.deleteMany();
  await prisma.wordBook.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
