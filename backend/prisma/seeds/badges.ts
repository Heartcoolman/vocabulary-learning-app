/**
 * 徽章种子数据
 * 定义系统中所有可获得的徽章
 * Requirements: 3.1, 3.4
 */

import { PrismaClient, BadgeCategory } from '@prisma/client';

/**
 * 徽章条件类型
 */
interface BadgeCondition {
  type: 'streak' | 'accuracy' | 'words_learned' | 'cognitive_improvement' | 'total_sessions';
  value: number;
  params?: Record<string, unknown>;
}

/**
 * 徽章定义数据
 */
interface BadgeData {
  name: string;
  description: string;
  iconUrl: string;
  category: BadgeCategory;
  tier: number;
  condition: BadgeCondition;
}

/**
 * 连续学习徽章 (STREAK)
 */
const streakBadges: BadgeData[] = [
  {
    name: '初学者',
    description: '连续学习3天',
    iconUrl: '/badges/streak-3.svg',
    category: 'STREAK',
    tier: 1,
    condition: { type: 'streak', value: 3 },
  },
  {
    name: '坚持者',
    description: '连续学习7天',
    iconUrl: '/badges/streak-7.svg',
    category: 'STREAK',
    tier: 2,
    condition: { type: 'streak', value: 7 },
  },
  {
    name: '习惯养成',
    description: '连续学习14天',
    iconUrl: '/badges/streak-14.svg',
    category: 'STREAK',
    tier: 3,
    condition: { type: 'streak', value: 14 },
  },
  {
    name: '学习达人',
    description: '连续学习30天',
    iconUrl: '/badges/streak-30.svg',
    category: 'STREAK',
    tier: 4,
    condition: { type: 'streak', value: 30 },
  },
  {
    name: '学习大师',
    description: '连续学习100天',
    iconUrl: '/badges/streak-100.svg',
    category: 'STREAK',
    tier: 5,
    condition: { type: 'streak', value: 100 },
  },
];

/**
 * 正确率徽章 (ACCURACY)
 */
const accuracyBadges: BadgeData[] = [
  {
    name: '准确新手',
    description: '单次学习正确率达到70%',
    iconUrl: '/badges/accuracy-70.svg',
    category: 'ACCURACY',
    tier: 1,
    condition: { type: 'accuracy', value: 0.7 },
  },
  {
    name: '准确能手',
    description: '单次学习正确率达到80%',
    iconUrl: '/badges/accuracy-80.svg',
    category: 'ACCURACY',
    tier: 2,
    condition: { type: 'accuracy', value: 0.8 },
  },
  {
    name: '准确高手',
    description: '单次学习正确率达到90%',
    iconUrl: '/badges/accuracy-90.svg',
    category: 'ACCURACY',
    tier: 3,
    condition: { type: 'accuracy', value: 0.9 },
  },
  {
    name: '准确大师',
    description: '单次学习正确率达到95%',
    iconUrl: '/badges/accuracy-95.svg',
    category: 'ACCURACY',
    tier: 4,
    condition: { type: 'accuracy', value: 0.95 },
  },
  {
    name: '完美学习',
    description: '单次学习正确率达到100%（至少10个单词）',
    iconUrl: '/badges/accuracy-100.svg',
    category: 'ACCURACY',
    tier: 5,
    condition: { type: 'accuracy', value: 1.0, params: { minWords: 10 } },
  },
];

/**
 * 认知提升徽章 (COGNITIVE)
 */
const cognitiveBadges: BadgeData[] = [
  {
    name: '记忆力提升',
    description: '记忆力指标提升10%',
    iconUrl: '/badges/cognitive-memory.svg',
    category: 'COGNITIVE',
    tier: 1,
    condition: { type: 'cognitive_improvement', value: 0.1, params: { metric: 'memory' } },
  },
  {
    name: '反应加速',
    description: '反应速度指标提升10%',
    iconUrl: '/badges/cognitive-speed.svg',
    category: 'COGNITIVE',
    tier: 2,
    condition: { type: 'cognitive_improvement', value: 0.1, params: { metric: 'speed' } },
  },
  {
    name: '稳定进步',
    description: '稳定性指标提升10%',
    iconUrl: '/badges/cognitive-stability.svg',
    category: 'COGNITIVE',
    tier: 3,
    condition: { type: 'cognitive_improvement', value: 0.1, params: { metric: 'stability' } },
  },
  {
    name: '全面提升',
    description: '所有认知指标均提升5%',
    iconUrl: '/badges/cognitive-all.svg',
    category: 'COGNITIVE',
    tier: 4,
    condition: { type: 'cognitive_improvement', value: 0.05, params: { metric: 'all' } },
  },
  {
    name: '认知大师',
    description: '所有认知指标均提升15%',
    iconUrl: '/badges/cognitive-master.svg',
    category: 'COGNITIVE',
    tier: 5,
    condition: { type: 'cognitive_improvement', value: 0.15, params: { metric: 'all' } },
  },
];

/**
 * 里程碑徽章 (MILESTONE)
 */
const milestoneBadges: BadgeData[] = [
  {
    name: '词汇起步',
    description: '累计学习50个单词',
    iconUrl: '/badges/milestone-50.svg',
    category: 'MILESTONE',
    tier: 1,
    condition: { type: 'words_learned', value: 50 },
  },
  {
    name: '词汇积累',
    description: '累计学习100个单词',
    iconUrl: '/badges/milestone-100.svg',
    category: 'MILESTONE',
    tier: 2,
    condition: { type: 'words_learned', value: 100 },
  },
  {
    name: '词汇丰富',
    description: '累计学习500个单词',
    iconUrl: '/badges/milestone-500.svg',
    category: 'MILESTONE',
    tier: 3,
    condition: { type: 'words_learned', value: 500 },
  },
  {
    name: '词汇达人',
    description: '累计学习1000个单词',
    iconUrl: '/badges/milestone-1000.svg',
    category: 'MILESTONE',
    tier: 4,
    condition: { type: 'words_learned', value: 1000 },
  },
  {
    name: '词汇大师',
    description: '累计学习5000个单词',
    iconUrl: '/badges/milestone-5000.svg',
    category: 'MILESTONE',
    tier: 5,
    condition: { type: 'words_learned', value: 5000 },
  },
  {
    name: '学习新手',
    description: '完成10次学习会话',
    iconUrl: '/badges/sessions-10.svg',
    category: 'MILESTONE',
    tier: 1,
    condition: { type: 'total_sessions', value: 10 },
  },
  {
    name: '学习常客',
    description: '完成50次学习会话',
    iconUrl: '/badges/sessions-50.svg',
    category: 'MILESTONE',
    tier: 2,
    condition: { type: 'total_sessions', value: 50 },
  },
  {
    name: '学习专家',
    description: '完成100次学习会话',
    iconUrl: '/badges/sessions-100.svg',
    category: 'MILESTONE',
    tier: 3,
    condition: { type: 'total_sessions', value: 100 },
  },
];

/**
 * 所有徽章数据
 */
const allBadges: BadgeData[] = [
  ...streakBadges,
  ...accuracyBadges,
  ...cognitiveBadges,
  ...milestoneBadges,
];

/**
 * 种子徽章数据到数据库
 * @param prisma PrismaClient 实例（可选，不传则创建新实例）
 */
export async function seedBadges(prisma?: PrismaClient): Promise<void> {
  const client = prisma || new PrismaClient();
  const shouldDisconnect = !prisma; // 只有自己创建的实例才需要断开

  console.log('🏅 开始种子徽章数据...');

  let created = 0;
  let skipped = 0;

  try {
    for (const badge of allBadges) {
      // 检查是否已存在相同名称和等级的徽章
      const existing = await client.badgeDefinition.findFirst({
        where: {
          name: badge.name,
          tier: badge.tier,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await client.badgeDefinition.create({
        data: {
          name: badge.name,
          description: badge.description,
          iconUrl: badge.iconUrl,
          category: badge.category,
          tier: badge.tier,
          condition: badge.condition as object,
        },
      });
      created++;
    }

    console.log(`✅ 徽章种子完成: 创建 ${created} 个, 跳过 ${skipped} 个已存在的`);
  } finally {
    if (shouldDisconnect) {
      await client.$disconnect();
    }
  }
}

/**
 * 独立运行时执行种子
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedBadges(prisma);
    console.log('\n🎉 徽章种子数据完成！');
    console.log(`📊 总徽章数: ${await prisma.badgeDefinition.count()}`);
  } catch (error) {
    console.error('❌ 徽章种子失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

export { allBadges, BadgeData, BadgeCondition };
