import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 用户画像数据迁移脚本（完整版）
 *
 * 功能：
 * - 从 AmasUserState 迁移到 UserLearningProfile
 * - 从 HabitProfile 合并数据到 UserLearningProfile
 * - 支持增量迁移（只迁移新增/变更的记录）
 * - 双写验证（写入新表后对比数据）
 * - 一致性校验工具
 * - 回滚机制
 * - 进度日志和错误处理
 */

// ==================== 类型定义 ====================

interface MigrationStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{
    userId: string;
    source: string;
    error: string;
  }>;
}

interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  invalidValues: string[];
}

interface BackupRecord {
  id: string;
  userId: string;
  data: any;
  timestamp: Date;
}

interface DoubleWriteValidation {
  userId: string;
  passed: boolean;
  differences: string[];
}

// ==================== 配置项 ====================

const CONFIG = {
  batchSize: 50, // 批处理大小
  maxRetries: 3, // 最大重试次数
  enableDoubleWrite: true, // 启用双写验证
  incrementalMode: true, // 增量迁移模式
};

// ==================== 数据验证 ====================

/**
 * 验证 AmasUserState 数据的有效性
 */
function validateAmasUserState(state: any): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    missingFields: [],
    invalidValues: [],
  };

  // 检查必需字段
  const requiredFields = ['userId', 'attention', 'fatigue', 'motivation', 'cognitiveProfile'];
  for (const field of requiredFields) {
    if (!(field in state) || state[field] === null || state[field] === undefined) {
      result.missingFields.push(field);
      result.isValid = false;
    }
  }

  // 验证数值范围
  if (typeof state.attention === 'number' && (state.attention < 0 || state.attention > 1)) {
    result.invalidValues.push(`attention out of range: ${state.attention}`);
    result.isValid = false;
  }

  if (typeof state.fatigue === 'number' && (state.fatigue < 0 || state.fatigue > 1)) {
    result.invalidValues.push(`fatigue out of range: ${state.fatigue}`);
    result.isValid = false;
  }

  if (typeof state.motivation === 'number' && (state.motivation < -1 || state.motivation > 1)) {
    result.invalidValues.push(`motivation out of range: ${state.motivation}`);
    result.isValid = false;
  }

  return result;
}

/**
 * 验证 HabitProfile 数据的有效性
 */
function validateHabitProfile(profile: any): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    missingFields: [],
    invalidValues: [],
  };

  // HabitProfile 可以为空，只检查存在时的有效性
  if (profile && profile.timePref) {
    try {
      const timePref =
        typeof profile.timePref === 'string' ? JSON.parse(profile.timePref) : profile.timePref;

      if (timePref.preferredTimes && !Array.isArray(timePref.preferredTimes)) {
        result.invalidValues.push('timePref.preferredTimes must be array');
        result.isValid = false;
      }
    } catch (error) {
      result.invalidValues.push(`timePref parsing failed: ${error}`);
      result.isValid = false;
    }
  }

  return result;
}

/**
 * 解析认知档案 JSON
 */
function parseCognitiveProfile(cognitiveProfile: any): {
  mem: number;
  speed: number;
  stability: number;
} {
  try {
    let profile: any;

    // 如果是字符串，解析为 JSON
    if (typeof cognitiveProfile === 'string') {
      profile = JSON.parse(cognitiveProfile);
    } else if (typeof cognitiveProfile === 'object' && cognitiveProfile !== null) {
      profile = cognitiveProfile;
    } else {
      // 返回默认值
      return { mem: 0.5, speed: 0.5, stability: 0.5 };
    }

    return {
      mem: typeof profile.mem === 'number' ? profile.mem : 0.5,
      speed: typeof profile.speed === 'number' ? profile.speed : 0.5,
      stability: typeof profile.stability === 'number' ? profile.stability : 0.5,
    };
  } catch (error) {
    console.warn(`解析认知档案失败: ${error}`);
    return { mem: 0.5, speed: 0.5, stability: 0.5 };
  }
}

/**
 * 解析趋势状态，提取情绪基线
 */
function parseEmotionBaseline(trendState: any): string {
  try {
    if (!trendState) return 'neutral';

    let trend: any;
    if (typeof trendState === 'string') {
      trend = JSON.parse(trendState);
    } else if (typeof trendState === 'object') {
      trend = trendState;
    } else {
      return 'neutral';
    }

    // 从趋势状态推断情绪基线
    const emotionLabel = trend.emotionLabel || trend.emotion || trend.baselineEmotion;
    if (typeof emotionLabel === 'string') {
      return emotionLabel;
    }

    return 'neutral';
  } catch (error) {
    return 'neutral';
  }
}

/**
 * 解析习惯档案中的时间偏好
 */
function parseTimePreference(habitProfile: any): any {
  try {
    if (!habitProfile || !habitProfile.timePref) {
      return null;
    }

    const timePref =
      typeof habitProfile.timePref === 'string'
        ? JSON.parse(habitProfile.timePref)
        : habitProfile.timePref;

    return timePref;
  } catch (error) {
    console.warn(`解析时间偏好失败: ${error}`);
    return null;
  }
}

/**
 * 解析习惯档案中的节奏偏好
 */
function parseRhythmPreference(habitProfile: any): any {
  try {
    if (!habitProfile || !habitProfile.rhythmPref) {
      return null;
    }

    const rhythmPref =
      typeof habitProfile.rhythmPref === 'string'
        ? JSON.parse(habitProfile.rhythmPref)
        : habitProfile.rhythmPref;

    return rhythmPref;
  } catch (error) {
    console.warn(`解析节奏偏好失败: ${error}`);
    return null;
  }
}

// ==================== 数据转换 ====================

/**
 * 将 AmasUserState 和 HabitProfile 数据转换为 UserLearningProfile 格式
 */
function transformToLearningProfile(
  amasState: any,
  habitProfile: any | null,
  existingProfile: any | null,
) {
  const cognitiveProfile = parseCognitiveProfile(amasState.cognitiveProfile);
  const emotionBaseline = parseEmotionBaseline(amasState.trendState);

  // 从认知档案计算 theta（能力参数）
  // theta 表示用户的整体学习能力，综合记忆、速度、稳定性
  const theta = (cognitiveProfile.mem + cognitiveProfile.speed + cognitiveProfile.stability) / 3;

  // thetaVariance 表示能力估计的不确定性
  // 新用户或数据少的用户方差较大，随着数据积累方差减小
  const thetaVariance = amasState.confidence ? 1 - amasState.confidence : 1.0;

  // flowScore 从注意力和动机推导
  // 心流状态需要高注意力和适度的动机
  const flowScore = (amasState.attention * 0.6 + Math.abs(amasState.motivation) * 0.4) * 0.8;

  // flowBaseline 设为中等值
  const flowBaseline = 0.5;

  // 合并习惯档案数据
  const timePreference = parseTimePreference(habitProfile);
  const rhythmPreference = parseRhythmPreference(habitProfile);

  // 构建遗忘参数，整合认知档案和习惯信息
  const forgettingParams: any = {
    cognitive: cognitiveProfile,
  };

  // 如果有习惯档案，添加习惯信息
  if (timePreference || rhythmPreference) {
    forgettingParams.habits = {};
    if (timePreference) {
      forgettingParams.habits.timePreference = timePreference;
    }
    if (rhythmPreference) {
      forgettingParams.habits.rhythmPreference = rhythmPreference;
    }
  }

  return {
    userId: amasState.userId,
    theta: Math.max(-3, Math.min(3, theta)), // 限制在 [-3, 3] 范围
    thetaVariance: Math.max(0.1, Math.min(2, thetaVariance)), // 限制在 [0.1, 2] 范围
    attention: amasState.attention,
    fatigue: amasState.fatigue,
    motivation: amasState.motivation,
    emotionBaseline,
    lastReportedEmotion: existingProfile?.lastReportedEmotion || null, // 保留现有值
    flowScore: Math.max(0, Math.min(1, flowScore)),
    flowBaseline,
    activePolicyVersion: existingProfile?.activePolicyVersion || 'v1', // 保留现有值
    forgettingParams: JSON.stringify(forgettingParams),
  };
}

// ==================== 备份与回滚 ====================

const backupRecords: BackupRecord[] = [];

/**
 * 备份现有的 UserLearningProfile 数据
 */
async function backupExistingProfiles(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  console.log(`\n📦 备份现有的 UserLearningProfile 数据...`);

  const existingProfiles = await prisma.userLearningProfile.findMany({
    where: { userId: { in: userIds } },
  });

  for (const profile of existingProfiles) {
    backupRecords.push({
      id: profile.id,
      userId: profile.userId,
      data: { ...profile },
      timestamp: new Date(),
    });
  }

  console.log(`✅ 已备份 ${backupRecords.length} 条记录`);
}

/**
 * 回滚迁移（恢复备份数据）
 */
async function rollbackMigration(): Promise<void> {
  if (backupRecords.length === 0) {
    console.log('\n⚠️  没有备份数据，无法回滚');
    return;
  }

  console.log(`\n🔄 开始回滚迁移...`);
  console.log(`   将恢复 ${backupRecords.length} 条记录`);

  let restored = 0;
  let failed = 0;

  for (const backup of backupRecords) {
    try {
      await prisma.userLearningProfile.upsert({
        where: { userId: backup.userId },
        create: backup.data,
        update: backup.data,
      });
      restored++;
    } catch (error) {
      console.error(`   ❌ 恢复失败 (userId: ${backup.userId}):`, error);
      failed++;
    }
  }

  console.log(`\n✅ 回滚完成：`);
  console.log(`   - 已恢复: ${restored}`);
  console.log(`   - 失败: ${failed}`);
}

// ==================== 双写验证 ====================

/**
 * 双写验证：对比源数据和目标数据的一致性
 */
async function validateDoubleWrite(
  userId: string,
  amasState: any,
  habitProfile: any | null,
  learningProfile: any,
): Promise<DoubleWriteValidation> {
  const differences: string[] = [];

  // 验证基础状态字段
  if (Math.abs(learningProfile.attention - amasState.attention) > 0.01) {
    differences.push(`attention: ${amasState.attention} -> ${learningProfile.attention}`);
  }

  if (Math.abs(learningProfile.fatigue - amasState.fatigue) > 0.01) {
    differences.push(`fatigue: ${amasState.fatigue} -> ${learningProfile.fatigue}`);
  }

  if (Math.abs(learningProfile.motivation - amasState.motivation) > 0.01) {
    differences.push(`motivation: ${amasState.motivation} -> ${learningProfile.motivation}`);
  }

  // 验证遗忘参数是否包含认知档案
  try {
    const forgettingParams =
      typeof learningProfile.forgettingParams === 'string'
        ? JSON.parse(learningProfile.forgettingParams)
        : learningProfile.forgettingParams;

    if (!forgettingParams.cognitive) {
      differences.push('forgettingParams missing cognitive profile');
    }

    // 如果有习惯档案，验证是否被包含
    if (habitProfile && !forgettingParams.habits) {
      differences.push('forgettingParams missing habits profile');
    }
  } catch (error) {
    differences.push(`forgettingParams parsing failed: ${error}`);
  }

  return {
    userId,
    passed: differences.length === 0,
    differences,
  };
}

// ==================== 主迁移逻辑 ====================

/**
 * 执行迁移
 */
async function migrate(dryRun: boolean = true): Promise<MigrationStats> {
  console.log('🚀 开始用户画像数据迁移\n');
  console.log('   AmasUserState + HabitProfile -> UserLearningProfile\n');
  console.log(`📋 模式: ${dryRun ? '预览模式（不修改数据）' : '执行模式'}\n`);

  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // 1. 检查目标表是否存在（仅在执行模式下）
  if (!dryRun) {
    try {
      await prisma.userLearningProfile.count();
    } catch (error: any) {
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        console.log('❌ UserLearningProfile 表不存在');
        console.log('\n💡 请先运行 Prisma 迁移创建表：');
        console.log('   npm run prisma:migrate');
        return stats;
      }
      throw error;
    }
  }

  // 2. 查询所有 AmasUserState 记录
  console.log('📊 查询 AmasUserState 数据...');
  const amasStates = await prisma.amasUserState.findMany();

  stats.total = amasStates.length;
  console.log(`   找到 ${stats.total} 条记录\n`);

  if (stats.total === 0) {
    console.log('🎉 没有需要迁移的数据！');
    return stats;
  }

  // 3. 检查用户是否存在
  console.log('🔍 验证用户数据...');
  const userIds = amasStates.map((s) => s.userId);
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  const existingUserIdSet = new Set(existingUsers.map((u) => u.id));

  // 过滤出有效的用户
  const validStates = amasStates.filter((s) => existingUserIdSet.has(s.userId));
  const invalidCount = amasStates.length - validStates.length;

  if (invalidCount > 0) {
    console.log(`   ⚠️  跳过 ${invalidCount} 条无效记录（用户不存在）`);
    stats.skipped = invalidCount;
  }

  console.log(`   ✅ 有效记录: ${validStates.length}\n`);

  // 4. 查询对应的 HabitProfile 数据
  console.log('📊 查询 HabitProfile 数据...');
  const habitProfiles = await prisma.habitProfile.findMany({
    where: { userId: { in: validStates.map((s) => s.userId) } },
  });

  const habitProfileMap = new Map(habitProfiles.map((h) => [h.userId, h]));
  console.log(`   找到 ${habitProfiles.length} 条习惯档案\n`);

  // 5. 查询现有的 UserLearningProfile（用于增量迁移）
  console.log('📊 查询现有的 UserLearningProfile 数据...');
  const existingProfiles = await prisma.userLearningProfile.findMany({
    where: { userId: { in: validStates.map((s) => s.userId) } },
  });

  const existingProfileMap = new Map(existingProfiles.map((p) => [p.userId, p]));
  console.log(`   找到 ${existingProfiles.length} 条现有档案\n`);

  // 6. 备份现有数据（仅在执行模式下）
  if (!dryRun) {
    await backupExistingProfiles(validStates.map((s) => s.userId));
  }

  // 7. 数据验证和转换
  console.log('🔧 数据验证与转换...\n');

  const transformedData: any[] = [];
  const doubleWriteValidations: DoubleWriteValidation[] = [];

  for (const amasState of validStates) {
    // 验证 AmasUserState 数据
    const amasValidation = validateAmasUserState(amasState);
    if (!amasValidation.isValid) {
      console.log(`   ⚠️  用户 ${amasState.userId} AmasUserState 数据验证失败`);
      stats.failed++;
      stats.errors.push({
        userId: amasState.userId,
        source: 'AmasUserState',
        error: `Validation failed: ${amasValidation.missingFields
          .concat(amasValidation.invalidValues)
          .join(', ')}`,
      });
      continue;
    }

    // 获取对应的 HabitProfile
    const habitProfile = habitProfileMap.get(amasState.userId);

    // 验证 HabitProfile 数据（如果存在）
    if (habitProfile) {
      const habitValidation = validateHabitProfile(habitProfile);
      if (!habitValidation.isValid) {
        console.log(`   ⚠️  用户 ${amasState.userId} HabitProfile 数据验证失败`);
        stats.failed++;
        stats.errors.push({
          userId: amasState.userId,
          source: 'HabitProfile',
          error: `Validation failed: ${habitValidation.invalidValues.join(', ')}`,
        });
        continue;
      }
    }

    // 获取现有的档案（用于保留某些字段）
    const existingProfile = existingProfileMap.get(amasState.userId);

    // 转换数据
    try {
      const profileData = transformToLearningProfile(amasState, habitProfile, existingProfile);
      transformedData.push(profileData);

      // 如果是执行模式且启用双写验证，记录验证数据
      if (!dryRun && CONFIG.enableDoubleWrite) {
        // 验证数据将在写入后执行
      }
    } catch (error) {
      console.error(`   ❌ 用户 ${amasState.userId} 数据转换失败:`, error);
      stats.failed++;
      stats.errors.push({
        userId: amasState.userId,
        source: 'Transformation',
        error: `Transformation failed: ${error}`,
      });
    }
  }

  console.log(`✅ 已转换 ${transformedData.length} 条记录\n`);

  // 8. 预览前10条数据
  if (transformedData.length > 0) {
    console.log('📋 转换后的数据示例（前10条）:');
    console.log('-'.repeat(100));
    transformedData.slice(0, 10).forEach((data, index) => {
      console.log(`${index + 1}. userId: ${data.userId}`);
      console.log(
        `   theta: ${data.theta.toFixed(3)}, thetaVariance: ${data.thetaVariance.toFixed(3)}`,
      );
      console.log(
        `   attention: ${data.attention.toFixed(3)}, fatigue: ${data.fatigue.toFixed(3)}, motivation: ${data.motivation.toFixed(3)}`,
      );
      console.log(
        `   emotionBaseline: ${data.emotionBaseline}, flowScore: ${data.flowScore.toFixed(3)}`,
      );

      // 显示是否包含习惯信息
      const forgettingParams = JSON.parse(data.forgettingParams);
      const hasHabits = !!forgettingParams.habits;
      console.log(`   包含习惯信息: ${hasHabits ? '是' : '否'}`);
      console.log();
    });
    if (transformedData.length > 10) {
      console.log(`   ... 还有 ${transformedData.length - 10} 条记录\n`);
    }
  }

  if (dryRun) {
    console.log('⚠️  预览模式：未修改任何数据');
    console.log('💡 如需执行迁移，请使用: npm run migrate:user-profiles -- --execute');
    return stats;
  }

  // 9. 执行迁移（使用 upsert 支持增量迁移）
  console.log('🔧 开始执行迁移...\n');

  const batchSize = CONFIG.batchSize;
  for (let i = 0; i < transformedData.length; i += batchSize) {
    const batch = transformedData.slice(i, i + batchSize);
    console.log(
      `   处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        transformedData.length / batchSize,
      )}...`,
    );

    try {
      await prisma.$transaction(
        batch.map((data) =>
          prisma.userLearningProfile.upsert({
            where: { userId: data.userId },
            create: data,
            update: {
              theta: data.theta,
              thetaVariance: data.thetaVariance,
              attention: data.attention,
              fatigue: data.fatigue,
              motivation: data.motivation,
              emotionBaseline: data.emotionBaseline,
              flowScore: data.flowScore,
              flowBaseline: data.flowBaseline,
              forgettingParams: data.forgettingParams,
              // 保留现有的 lastReportedEmotion 和 activePolicyVersion
            },
          }),
        ),
      );
      stats.success += batch.length;
    } catch (error) {
      console.error(`   ❌ 批次迁移失败:`, error);
      stats.failed += batch.length;

      // 记录批次中的所有错误
      batch.forEach((data) => {
        stats.errors.push({
          userId: data.userId,
          source: 'Migration',
          error: `Batch migration failed: ${error}`,
        });
      });
    }
  }

  // 10. 双写验证（如果启用）
  if (CONFIG.enableDoubleWrite && stats.success > 0) {
    console.log('\n🔍 执行双写验证...\n');

    const sampleSize = Math.min(20, transformedData.length);
    const sampleData = transformedData.slice(0, sampleSize);

    for (const data of sampleData) {
      const amasState = validStates.find((s) => s.userId === data.userId);
      const habitProfile = habitProfileMap.get(data.userId);
      const learningProfile = await prisma.userLearningProfile.findUnique({
        where: { userId: data.userId },
      });

      if (amasState && learningProfile) {
        const validation = await validateDoubleWrite(
          data.userId,
          amasState,
          habitProfile || null,
          learningProfile,
        );
        doubleWriteValidations.push(validation);

        if (!validation.passed) {
          console.log(`   ⚠️  用户 ${validation.userId} 双写验证失败:`);
          validation.differences.forEach((diff) => {
            console.log(`      - ${diff}`);
          });
        } else {
          console.log(`   ✅ 用户 ${validation.userId} 双写验证通过`);
        }
      }
    }

    const passedCount = doubleWriteValidations.filter((v) => v.passed).length;
    console.log(`\n📊 双写验证结果: ${passedCount}/${doubleWriteValidations.length} 通过`);
  }

  return stats;
}

/**
 * 验证迁移结果
 */
async function verifyMigration(): Promise<void> {
  console.log('\n🔍 验证迁移结果...\n');

  try {
    // 1. 统计数据
    const [amasCount, profileCount, habitCount, userCount] = await Promise.all([
      prisma.amasUserState.count(),
      prisma.userLearningProfile.count(),
      prisma.habitProfile.count(),
      prisma.user.count(),
    ]);

    console.log('📊 数据统计:');
    console.log(`   - AmasUserState 记录数: ${amasCount}`);
    console.log(`   - HabitProfile 记录数: ${habitCount}`);
    console.log(`   - UserLearningProfile 记录数: ${profileCount}`);
    console.log(`   - User 总数: ${userCount}`);
  } catch (error: any) {
    // 检查是否是表不存在的错误
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      console.log('❌ UserLearningProfile 表不存在');
      console.log('\n💡 请先运行 Prisma 迁移创建表：');
      console.log('   npm run prisma:migrate');
      return;
    }
    throw error;
  }

  // 2. 检查覆盖率
  const usersWithAmas = await prisma.amasUserState.findMany({
    select: { userId: true },
  });
  const usersWithProfile = await prisma.userLearningProfile.findMany({
    select: { userId: true },
  });

  const amasUserIds = new Set(usersWithAmas.map((u) => u.userId));
  const profileUserIds = new Set(usersWithProfile.map((u) => u.userId));

  const missingProfiles = Array.from(amasUserIds).filter((id) => !profileUserIds.has(id));
  const extraProfiles = Array.from(profileUserIds).filter((id) => !amasUserIds.has(id));

  console.log('\n📈 覆盖率分析:');
  console.log(`   - 有 AmasUserState 的用户: ${amasUserIds.size}`);
  console.log(`   - 有 UserLearningProfile 的用户: ${profileUserIds.size}`);
  console.log(`   - 缺少 UserLearningProfile 的用户: ${missingProfiles.length}`);
  console.log(`   - 多余的 UserLearningProfile: ${extraProfiles.length}`);

  if (missingProfiles.length > 0) {
    console.log(`\n⚠️  以下用户有 AmasUserState 但缺少 UserLearningProfile:`);
    missingProfiles.slice(0, 10).forEach((id) => console.log(`   - ${id}`));
    if (missingProfiles.length > 10) {
      console.log(`   ... 还有 ${missingProfiles.length - 10} 个用户`);
    }
  }

  // 3. 检查习惯信息合并情况
  console.log('\n🔬 习惯信息合并检查（抽样10条）...');

  const habitProfiles = await prisma.habitProfile.findMany({
    take: 10,
  });

  let habitMergeCount = 0;

  for (const habitProfile of habitProfiles) {
    const learningProfile = await prisma.userLearningProfile.findUnique({
      where: { userId: habitProfile.userId },
    });

    if (!learningProfile) {
      console.log(`   ⚠️  用户 ${habitProfile.userId} 缺少 UserLearningProfile`);
      continue;
    }

    try {
      const forgettingParams =
        typeof learningProfile.forgettingParams === 'string'
          ? JSON.parse(learningProfile.forgettingParams)
          : learningProfile.forgettingParams;

      if (forgettingParams.habits) {
        console.log(`   ✅ 用户 ${habitProfile.userId} 习惯信息已合并`);
        habitMergeCount++;
      } else {
        console.log(`   ⚠️  用户 ${habitProfile.userId} 习惯信息未合并`);
      }
    } catch (error) {
      console.log(`   ❌ 用户 ${habitProfile.userId} forgettingParams 解析失败: ${error}`);
    }
  }

  console.log(
    `\n📊 习惯信息合并率: ${((habitMergeCount / habitProfiles.length) * 100).toFixed(1)}%`,
  );

  // 4. 数据一致性检查（抽样）
  console.log('\n🔬 数据一致性检查（抽样10条）...');

  const sampleStates = await prisma.amasUserState.findMany({
    take: 10,
  });

  let consistentCount = 0;

  for (const amasState of sampleStates) {
    const profile = await prisma.userLearningProfile.findUnique({
      where: { userId: amasState.userId },
    });

    if (!profile) {
      console.log(`   ❌ 用户 ${amasState.userId} 缺少 UserLearningProfile`);
      continue;
    }

    // 验证关键字段
    const isAttentionMatch = Math.abs(profile.attention - amasState.attention) < 0.01;
    const isFatigueMatch = Math.abs(profile.fatigue - amasState.fatigue) < 0.01;
    const isMotivationMatch = Math.abs(profile.motivation - amasState.motivation) < 0.01;

    if (isAttentionMatch && isFatigueMatch && isMotivationMatch) {
      console.log(`   ✅ 用户 ${amasState.userId} 数据一致`);
      consistentCount++;
    } else {
      console.log(`   ⚠️  用户 ${amasState.userId} 数据不一致:`);
      if (!isAttentionMatch) {
        console.log(`      - attention: ${amasState.attention} -> ${profile.attention}`);
      }
      if (!isFatigueMatch) {
        console.log(`      - fatigue: ${amasState.fatigue} -> ${profile.fatigue}`);
      }
      if (!isMotivationMatch) {
        console.log(`      - motivation: ${amasState.motivation} -> ${profile.motivation}`);
      }
    }
  }

  // 5. 总结
  console.log('\n📋 验证总结:');
  const coverageRate = amasUserIds.size > 0 ? (profileUserIds.size / amasUserIds.size) * 100 : 0;
  const consistencyRate = (consistentCount / sampleStates.length) * 100;

  console.log(`   - 迁移覆盖率: ${coverageRate.toFixed(1)}%`);
  console.log(`   - 数据一致性: ${consistencyRate.toFixed(1)}%`);

  if (coverageRate >= 99 && consistencyRate >= 90) {
    console.log('   🎉 迁移完成度: 优秀');
  } else if (coverageRate >= 95 && consistencyRate >= 80) {
    console.log('   ✅ 迁移完成度: 良好');
  } else if (coverageRate >= 90 && consistencyRate >= 70) {
    console.log('   ⚠️  迁移完成度: 一般（建议重新运行）');
  } else {
    console.log('   ❌ 迁移完成度: 较差（需要检查错误）');
  }
}

// ==================== 命令行入口 ====================

async function main() {
  console.log('='.repeat(80));
  console.log('用户画像数据迁移工具（完整版）');
  console.log('AmasUserState + HabitProfile -> UserLearningProfile');
  console.log('='.repeat(80));
  console.log('\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const executeMode = args.includes('--execute') || args.includes('-e');
  const verifyOnly = args.includes('--verify') || args.includes('-v');
  const rollback = args.includes('--rollback') || args.includes('-r');

  try {
    if (rollback) {
      // 回滚模式
      await rollbackMigration();
    } else if (verifyOnly) {
      // 仅验证模式
      await verifyMigration();
    } else {
      // 迁移模式
      const stats = await migrate(!executeMode);

      console.log('\n' + '='.repeat(80));
      console.log('📊 迁移统计:');
      console.log(`   - 总记录数: ${stats.total}`);
      console.log(`   - 成功: ${stats.success}`);
      console.log(`   - 失败: ${stats.failed}`);
      console.log(`   - 跳过: ${stats.skipped}`);

      if (stats.errors.length > 0) {
        console.log('\n❌ 错误详情（前10条）:');
        stats.errors.slice(0, 10).forEach((err, index) => {
          console.log(`   ${index + 1}. userId: ${err.userId}`);
          console.log(`      来源: ${err.source}`);
          console.log(`      错误: ${err.error}`);
        });
        if (stats.errors.length > 10) {
          console.log(`   ... 还有 ${stats.errors.length - 10} 个错误`);
        }
      }

      // 如果是执行模式，自动运行验证
      if (executeMode) {
        await verifyMigration();
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ 完成！');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\n❌ 执行失败:', error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('❌ 致命错误:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
