import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = 500;
const MAX_RANK = 60000;
const DEFAULT_CORPUS_SOURCE = 'Custom';

function computeFrequencyScore(rank: number): Prisma.Decimal {
  if (rank <= 0) rank = MAX_RANK;
  if (rank > MAX_RANK) rank = MAX_RANK;
  const score = 1 - Math.log10(rank) / 5;
  return new Prisma.Decimal(Math.max(0, Math.min(1, score)).toFixed(4));
}

async function main() {
  console.log('📊 开始计算单词词频数据...\n');

  const wordUsageStats = await prisma.answerRecord.groupBy({
    by: ['wordId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log(`找到 ${wordUsageStats.length} 个单词的使用记录\n`);

  const totalWords = wordUsageStats.length;
  let processedCount = 0;

  for (let i = 0; i < totalWords; i += BATCH_SIZE) {
    const batch = wordUsageStats.slice(i, i + BATCH_SIZE);
    const upsertPromises = batch.map((stat, batchIndex) => {
      const rank = i + batchIndex + 1;
      const frequencyScore = computeFrequencyScore(rank);

      return prisma.wordFrequency.upsert({
        where: { wordId: stat.wordId },
        create: {
          wordId: stat.wordId,
          frequencyRank: rank,
          frequencyScore,
          corpusSource: DEFAULT_CORPUS_SOURCE,
        },
        update: {
          frequencyRank: rank,
          frequencyScore,
          corpusSource: DEFAULT_CORPUS_SOURCE,
        },
      });
    });

    await prisma.$transaction(upsertPromises);
    processedCount += batch.length;
    console.log(`✓ 已处理: ${processedCount}/${totalWords} (${((processedCount / totalWords) * 100).toFixed(1)}%)`);
  }

  console.log('\n✅ 词频数据计算完成！');
}

main()
  .catch((error) => {
    console.error('❌ 计算失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
