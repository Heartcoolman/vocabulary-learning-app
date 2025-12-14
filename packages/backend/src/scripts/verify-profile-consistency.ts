import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 用户画像数据一致性校验工具
 *
 * 功能：
 * - 检查 AmasUserState、HabitProfile 和 UserLearningProfile 之间的数据一致性
 * - 识别数据不一致、缺失或异常的记录
 * - 生成详细的校验报告
 * - 提供修复建议
 */

// ==================== 类型定义 ====================

interface ConsistencyReport {
  summary: {
    totalUsers: number;
    consistentUsers: number;
    inconsistentUsers: number;
    missingProfiles: number;
    dataErrors: number;
  };
  issues: ConsistencyIssue[];
  recommendations: string[];
}

interface ConsistencyIssue {
  userId: string;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  description: string;
  details?: any;
}

interface ProfileComparison {
  userId: string;
  hasAmasState: boolean;
  hasHabitProfile: boolean;
  hasLearningProfile: boolean;
  issues: ConsistencyIssue[];
}

// ==================== 数据校验函数 ====================

/**
 * 检查数值范围
 */
function checkNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string,
): ConsistencyIssue | null {
  if (value < min || value > max) {
    return {
      userId: '',
      severity: 'warning',
      type: 'VALUE_OUT_OF_RANGE',
      description: `${fieldName} 值超出范围`,
      details: {
        field: fieldName,
        value,
        expectedRange: `[${min}, ${max}]`,
      },
    };
  }
  return null;
}

/**
 * 检查 AmasUserState 数据质量
 */
function validateAmasUserState(userId: string, state: any): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 检查必需字段
  const requiredFields = ['attention', 'fatigue', 'motivation', 'cognitiveProfile'];
  for (const field of requiredFields) {
    if (state[field] === null || state[field] === undefined) {
      issues.push({
        userId,
        severity: 'critical',
        type: 'MISSING_FIELD',
        description: `AmasUserState 缺少必需字段: ${field}`,
        details: { field },
      });
    }
  }

  // 检查数值范围
  if (state.attention !== null && state.attention !== undefined) {
    const issue = checkNumericRange(state.attention, 0, 1, 'attention');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (state.fatigue !== null && state.fatigue !== undefined) {
    const issue = checkNumericRange(state.fatigue, 0, 1, 'fatigue');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (state.motivation !== null && state.motivation !== undefined) {
    const issue = checkNumericRange(state.motivation, -1, 1, 'motivation');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  // 检查 cognitiveProfile 格式
  try {
    let profile: any;
    if (typeof state.cognitiveProfile === 'string') {
      profile = JSON.parse(state.cognitiveProfile);
    } else if (typeof state.cognitiveProfile === 'object') {
      profile = state.cognitiveProfile;
    } else {
      issues.push({
        userId,
        severity: 'critical',
        type: 'INVALID_FORMAT',
        description: 'cognitiveProfile 格式无效',
        details: { value: state.cognitiveProfile },
      });
      return issues;
    }

    // 检查必需的认知档案字段
    const cognitiveFields = ['mem', 'speed', 'stability'];
    for (const field of cognitiveFields) {
      if (typeof profile[field] !== 'number') {
        issues.push({
          userId,
          severity: 'warning',
          type: 'MISSING_COGNITIVE_FIELD',
          description: `cognitiveProfile 缺少或无效字段: ${field}`,
          details: { field, value: profile[field] },
        });
      }
    }
  } catch (error) {
    issues.push({
      userId,
      severity: 'critical',
      type: 'PARSE_ERROR',
      description: `cognitiveProfile 解析失败: ${error}`,
    });
  }

  return issues;
}

/**
 * 检查 HabitProfile 数据质量
 */
function validateHabitProfile(userId: string, profile: any): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // HabitProfile 是可选的，但如果存在应该有效
  if (!profile) {
    return issues;
  }

  // 检查 timePref 格式
  if (profile.timePref) {
    try {
      const timePref =
        typeof profile.timePref === 'string' ? JSON.parse(profile.timePref) : profile.timePref;

      if (timePref.preferredTimes && !Array.isArray(timePref.preferredTimes)) {
        issues.push({
          userId,
          severity: 'warning',
          type: 'INVALID_FORMAT',
          description: 'timePref.preferredTimes 应该是数组',
          details: { value: timePref.preferredTimes },
        });
      }

      if (Array.isArray(timePref.preferredTimes)) {
        if (timePref.preferredTimes.length !== 24) {
          issues.push({
            userId,
            severity: 'warning',
            type: 'INVALID_LENGTH',
            description: 'timePref.preferredTimes 长度应为24（24小时）',
            details: { length: timePref.preferredTimes.length },
          });
        }
      }
    } catch (error) {
      issues.push({
        userId,
        severity: 'warning',
        type: 'PARSE_ERROR',
        description: `timePref 解析失败: ${error}`,
      });
    }
  }

  // 检查 rhythmPref 格式
  if (profile.rhythmPref) {
    try {
      const rhythmPref =
        typeof profile.rhythmPref === 'string'
          ? JSON.parse(profile.rhythmPref)
          : profile.rhythmPref;

      const requiredFields = ['sessionMedianMinutes', 'batchMedian'];
      for (const field of requiredFields) {
        if (typeof rhythmPref[field] !== 'number') {
          issues.push({
            userId,
            severity: 'warning',
            type: 'MISSING_FIELD',
            description: `rhythmPref 缺少或无效字段: ${field}`,
            details: { field, value: rhythmPref[field] },
          });
        }
      }
    } catch (error) {
      issues.push({
        userId,
        severity: 'warning',
        type: 'PARSE_ERROR',
        description: `rhythmPref 解析失败: ${error}`,
      });
    }
  }

  return issues;
}

/**
 * 检查 UserLearningProfile 数据质量
 */
function validateUserLearningProfile(userId: string, profile: any): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 检查必需字段
  const requiredFields = [
    'theta',
    'thetaVariance',
    'attention',
    'fatigue',
    'motivation',
    'emotionBaseline',
    'flowScore',
    'flowBaseline',
  ];

  for (const field of requiredFields) {
    if (profile[field] === null || profile[field] === undefined) {
      issues.push({
        userId,
        severity: 'critical',
        type: 'MISSING_FIELD',
        description: `UserLearningProfile 缺少必需字段: ${field}`,
        details: { field },
      });
    }
  }

  // 检查数值范围
  if (profile.theta !== null && profile.theta !== undefined) {
    const issue = checkNumericRange(profile.theta, -3, 3, 'theta');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (profile.thetaVariance !== null && profile.thetaVariance !== undefined) {
    const issue = checkNumericRange(profile.thetaVariance, 0.1, 2, 'thetaVariance');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (profile.attention !== null && profile.attention !== undefined) {
    const issue = checkNumericRange(profile.attention, 0, 1, 'attention');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (profile.fatigue !== null && profile.fatigue !== undefined) {
    const issue = checkNumericRange(profile.fatigue, 0, 1, 'fatigue');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (profile.motivation !== null && profile.motivation !== undefined) {
    const issue = checkNumericRange(profile.motivation, -1, 1, 'motivation');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (profile.flowScore !== null && profile.flowScore !== undefined) {
    const issue = checkNumericRange(profile.flowScore, 0, 1, 'flowScore');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  if (profile.flowBaseline !== null && profile.flowBaseline !== undefined) {
    const issue = checkNumericRange(profile.flowBaseline, 0, 1, 'flowBaseline');
    if (issue) {
      issue.userId = userId;
      issues.push(issue);
    }
  }

  // 检查 forgettingParams 格式
  if (profile.forgettingParams) {
    try {
      const params =
        typeof profile.forgettingParams === 'string'
          ? JSON.parse(profile.forgettingParams)
          : profile.forgettingParams;

      // 应该包含 cognitive 字段
      if (!params.cognitive) {
        issues.push({
          userId,
          severity: 'warning',
          type: 'MISSING_FIELD',
          description: 'forgettingParams 缺少 cognitive 字段',
        });
      }
    } catch (error) {
      issues.push({
        userId,
        severity: 'critical',
        type: 'PARSE_ERROR',
        description: `forgettingParams 解析失败: ${error}`,
      });
    }
  }

  return issues;
}

/**
 * 检查数据一致性
 */
function checkDataConsistency(
  userId: string,
  amasState: any,
  habitProfile: any | null,
  learningProfile: any,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  if (!amasState || !learningProfile) {
    return issues;
  }

  // 1. 检查基础状态字段的一致性
  const tolerance = 0.01; // 允许的浮点数误差

  if (Math.abs(learningProfile.attention - amasState.attention) > tolerance) {
    issues.push({
      userId,
      severity: 'warning',
      type: 'DATA_MISMATCH',
      description: 'attention 字段不一致',
      details: {
        field: 'attention',
        amasValue: amasState.attention,
        learningProfileValue: learningProfile.attention,
        difference: Math.abs(learningProfile.attention - amasState.attention),
      },
    });
  }

  if (Math.abs(learningProfile.fatigue - amasState.fatigue) > tolerance) {
    issues.push({
      userId,
      severity: 'warning',
      type: 'DATA_MISMATCH',
      description: 'fatigue 字段不一致',
      details: {
        field: 'fatigue',
        amasValue: amasState.fatigue,
        learningProfileValue: learningProfile.fatigue,
        difference: Math.abs(learningProfile.fatigue - amasState.fatigue),
      },
    });
  }

  if (Math.abs(learningProfile.motivation - amasState.motivation) > tolerance) {
    issues.push({
      userId,
      severity: 'warning',
      type: 'DATA_MISMATCH',
      description: 'motivation 字段不一致',
      details: {
        field: 'motivation',
        amasValue: amasState.motivation,
        learningProfileValue: learningProfile.motivation,
        difference: Math.abs(learningProfile.motivation - amasState.motivation),
      },
    });
  }

  // 2. 检查认知档案是否被正确转换
  try {
    const forgettingParams =
      typeof learningProfile.forgettingParams === 'string'
        ? JSON.parse(learningProfile.forgettingParams)
        : learningProfile.forgettingParams;

    const amasCognitive =
      typeof amasState.cognitiveProfile === 'string'
        ? JSON.parse(amasState.cognitiveProfile)
        : amasState.cognitiveProfile;

    if (forgettingParams.cognitive) {
      const cogFields = ['mem', 'speed', 'stability'];
      for (const field of cogFields) {
        if (
          Math.abs((forgettingParams.cognitive[field] || 0) - (amasCognitive[field] || 0)) >
          tolerance
        ) {
          issues.push({
            userId,
            severity: 'warning',
            type: 'DATA_MISMATCH',
            description: `认知档案 ${field} 字段不一致`,
            details: {
              field: `cognitive.${field}`,
              amasValue: amasCognitive[field],
              learningProfileValue: forgettingParams.cognitive[field],
            },
          });
        }
      }
    } else {
      issues.push({
        userId,
        severity: 'warning',
        type: 'MISSING_FIELD',
        description: 'UserLearningProfile 的 forgettingParams 缺少认知档案数据',
      });
    }
  } catch (error) {
    issues.push({
      userId,
      severity: 'critical',
      type: 'PARSE_ERROR',
      description: `数据一致性检查失败: ${error}`,
    });
  }

  // 3. 检查习惯信息是否被正确合并
  if (habitProfile) {
    try {
      const forgettingParams =
        typeof learningProfile.forgettingParams === 'string'
          ? JSON.parse(learningProfile.forgettingParams)
          : learningProfile.forgettingParams;

      if (!forgettingParams.habits) {
        issues.push({
          userId,
          severity: 'info',
          type: 'MISSING_MERGE',
          description: '有 HabitProfile 但 UserLearningProfile 未合并习惯信息',
        });
      }
    } catch (error) {
      // 已在之前的检查中报告
    }
  }

  return issues;
}

/**
 * 比较单个用户的画像数据
 */
async function compareUserProfile(userId: string): Promise<ProfileComparison> {
  const comparison: ProfileComparison = {
    userId,
    hasAmasState: false,
    hasHabitProfile: false,
    hasLearningProfile: false,
    issues: [],
  };

  // 查询各个表的数据
  const [amasState, habitProfile, learningProfile] = await Promise.all([
    prisma.amasUserState.findUnique({ where: { userId } }),
    prisma.habitProfile.findUnique({ where: { userId } }),
    prisma.userLearningProfile.findUnique({ where: { userId } }),
  ]);

  comparison.hasAmasState = !!amasState;
  comparison.hasHabitProfile = !!habitProfile;
  comparison.hasLearningProfile = !!learningProfile;

  // 检查数据完整性
  if (amasState && !learningProfile) {
    comparison.issues.push({
      userId,
      severity: 'critical',
      type: 'MISSING_PROFILE',
      description: '有 AmasUserState 但缺少 UserLearningProfile',
    });
  }

  if (learningProfile && !amasState) {
    comparison.issues.push({
      userId,
      severity: 'info',
      type: 'ORPHANED_PROFILE',
      description: '有 UserLearningProfile 但缺少 AmasUserState',
    });
  }

  // 验证各个表的数据质量
  if (amasState) {
    comparison.issues.push(...validateAmasUserState(userId, amasState));
  }

  if (habitProfile) {
    comparison.issues.push(...validateHabitProfile(userId, habitProfile));
  }

  if (learningProfile) {
    comparison.issues.push(...validateUserLearningProfile(userId, learningProfile));
  }

  // 检查数据一致性
  if (amasState && learningProfile) {
    comparison.issues.push(
      ...checkDataConsistency(userId, amasState, habitProfile, learningProfile),
    );
  }

  return comparison;
}

/**
 * 生成一致性报告
 */
async function generateConsistencyReport(sampleSize: number = 100): Promise<ConsistencyReport> {
  console.log('🔍 开始一致性校验...\n');

  const report: ConsistencyReport = {
    summary: {
      totalUsers: 0,
      consistentUsers: 0,
      inconsistentUsers: 0,
      missingProfiles: 0,
      dataErrors: 0,
    },
    issues: [],
    recommendations: [],
  };

  // 1. 统计总体数据
  console.log('📊 统计数据...');
  const [userCount, amasCount, habitCount, learningProfileCount] = await Promise.all([
    prisma.user.count(),
    prisma.amasUserState.count(),
    prisma.habitProfile.count(),
    prisma.userLearningProfile.count(),
  ]);

  console.log(`   - 总用户数: ${userCount}`);
  console.log(`   - AmasUserState: ${amasCount}`);
  console.log(`   - HabitProfile: ${habitCount}`);
  console.log(`   - UserLearningProfile: ${learningProfileCount}\n`);

  // 2. 检查覆盖率
  console.log('📈 检查覆盖率...');

  const usersWithAmas = await prisma.amasUserState.findMany({
    select: { userId: true },
  });
  const amasUserIds = new Set(usersWithAmas.map((u) => u.userId));

  const usersWithProfile = await prisma.userLearningProfile.findMany({
    select: { userId: true },
  });
  const profileUserIds = new Set(usersWithProfile.map((u) => u.userId));

  const missingProfiles = Array.from(amasUserIds).filter((id) => !profileUserIds.has(id));
  const orphanedProfiles = Array.from(profileUserIds).filter((id) => !amasUserIds.has(id));

  report.summary.missingProfiles = missingProfiles.length;

  console.log(`   - 缺少 UserLearningProfile 的用户: ${missingProfiles.length}`);
  console.log(`   - 孤立的 UserLearningProfile: ${orphanedProfiles.length}\n`);

  if (missingProfiles.length > 0) {
    report.recommendations.push(
      `发现 ${missingProfiles.length} 个用户有 AmasUserState 但缺少 UserLearningProfile，建议运行迁移脚本`,
    );
  }

  // 3. 抽样检查数据一致性
  console.log(`🔬 抽样检查数据一致性（样本量: ${sampleSize}）...\n`);

  const sampleUserIds = Array.from(amasUserIds).slice(0, Math.min(sampleSize, amasUserIds.size));

  report.summary.totalUsers = sampleUserIds.length;

  let processedCount = 0;
  for (const userId of sampleUserIds) {
    const comparison = await compareUserProfile(userId);

    if (comparison.issues.length === 0) {
      report.summary.consistentUsers++;
    } else {
      report.summary.inconsistentUsers++;

      // 收集所有问题
      report.issues.push(...comparison.issues);

      // 统计数据错误
      const criticalIssues = comparison.issues.filter((i) => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        report.summary.dataErrors++;
      }
    }

    processedCount++;
    if (processedCount % 10 === 0) {
      process.stdout.write(`   处理进度: ${processedCount}/${sampleUserIds.length}\r`);
    }
  }

  console.log(`   处理完成: ${processedCount}/${sampleUserIds.length}\n`);

  // 4. 分析问题并生成建议
  const issueTypes = new Map<string, number>();
  for (const issue of report.issues) {
    issueTypes.set(issue.type, (issueTypes.get(issue.type) || 0) + 1);
  }

  // 根据问题类型生成建议
  if (issueTypes.get('MISSING_PROFILE') || 0 > 0) {
    report.recommendations.push(
      '部分用户缺少 UserLearningProfile，运行迁移脚本: npm run migrate:user-profiles:execute',
    );
  }

  if (issueTypes.get('DATA_MISMATCH') || 0 > 0) {
    report.recommendations.push('发现数据不一致问题，建议重新运行迁移以同步最新数据');
  }

  if (issueTypes.get('INVALID_FORMAT') || 0 > 0) {
    report.recommendations.push('发现数据格式错误，建议检查并修复源数据');
  }

  if (issueTypes.get('VALUE_OUT_OF_RANGE') || 0 > 0) {
    report.recommendations.push('发现数值超出合理范围，建议检查数据采集逻辑');
  }

  if (issueTypes.get('MISSING_MERGE') || 0 > 0) {
    report.recommendations.push('部分习惯信息未合并到 UserLearningProfile，重新运行迁移以合并数据');
  }

  return report;
}

/**
 * 打印一致性报告
 */
function printReport(report: ConsistencyReport): void {
  console.log('='.repeat(80));
  console.log('📋 一致性校验报告');
  console.log('='.repeat(80));
  console.log('\n');

  // 1. 总体统计
  console.log('📊 总体统计:');
  console.log(`   - 检查用户数: ${report.summary.totalUsers}`);
  console.log(`   - 一致的用户: ${report.summary.consistentUsers}`);
  console.log(`   - 不一致的用户: ${report.summary.inconsistentUsers}`);
  console.log(`   - 缺少档案: ${report.summary.missingProfiles}`);
  console.log(`   - 数据错误: ${report.summary.dataErrors}`);

  const consistencyRate =
    report.summary.totalUsers > 0
      ? (report.summary.consistentUsers / report.summary.totalUsers) * 100
      : 0;
  console.log(`\n   一致性率: ${consistencyRate.toFixed(1)}%\n`);

  // 2. 问题统计（按类型）
  if (report.issues.length > 0) {
    console.log('⚠️  问题统计（按类型）:');

    const issueTypeCount = new Map<string, number>();
    const issueTypeSeverity = new Map<string, string>();

    for (const issue of report.issues) {
      issueTypeCount.set(issue.type, (issueTypeCount.get(issue.type) || 0) + 1);
      if (!issueTypeSeverity.has(issue.type)) {
        issueTypeSeverity.set(issue.type, issue.severity);
      }
    }

    const sortedIssueTypes = Array.from(issueTypeCount.entries()).sort((a, b) => b[1] - a[1]);

    for (const [type, count] of sortedIssueTypes) {
      const severity = issueTypeSeverity.get(type);
      const icon = severity === 'critical' ? '🔴' : severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`   ${icon} ${type}: ${count}`);
    }
    console.log();

    // 3. 问题详情（显示前20条）
    console.log('❌ 问题详情（前20条）:');
    console.log('-'.repeat(80));

    const issuesToShow = report.issues.slice(0, 20);
    issuesToShow.forEach((issue, index) => {
      const icon =
        issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`${index + 1}. ${icon} [${issue.severity.toUpperCase()}] ${issue.type}`);
      console.log(`   用户: ${issue.userId}`);
      console.log(`   描述: ${issue.description}`);
      if (issue.details) {
        console.log(`   详情: ${JSON.stringify(issue.details, null, 2)}`);
      }
      console.log();
    });

    if (report.issues.length > 20) {
      console.log(`   ... 还有 ${report.issues.length - 20} 个问题\n`);
    }
  } else {
    console.log('✅ 未发现数据一致性问题！\n');
  }

  // 4. 修复建议
  if (report.recommendations.length > 0) {
    console.log('💡 修复建议:');
    report.recommendations.forEach((recommendation, index) => {
      console.log(`   ${index + 1}. ${recommendation}`);
    });
    console.log();
  }

  // 5. 健康度评级
  console.log('🏥 数据健康度:');
  if (consistencyRate >= 99 && report.summary.dataErrors === 0) {
    console.log('   🎉 优秀 - 数据质量非常好');
  } else if (consistencyRate >= 95 && report.summary.dataErrors <= 5) {
    console.log('   ✅ 良好 - 数据质量较好，有少量问题');
  } else if (consistencyRate >= 90 && report.summary.dataErrors <= 10) {
    console.log('   ⚠️  一般 - 数据质量一般，建议修复');
  } else {
    console.log('   ❌ 较差 - 数据质量较差，需要立即修复');
  }

  console.log();
}

/**
 * 导出详细报告到文件
 */
async function exportDetailedReport(report: ConsistencyReport, filename: string): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const reportPath = path.join(process.cwd(), filename);

  const reportContent = {
    timestamp: new Date().toISOString(),
    summary: report.summary,
    consistencyRate:
      report.summary.totalUsers > 0
        ? (report.summary.consistentUsers / report.summary.totalUsers) * 100
        : 0,
    issues: report.issues,
    recommendations: report.recommendations,
  };

  await fs.writeFile(reportPath, JSON.stringify(reportContent, null, 2), 'utf-8');

  console.log(`📄 详细报告已导出到: ${reportPath}\n`);
}

// ==================== 命令行入口 ====================

async function main() {
  console.log('='.repeat(80));
  console.log('用户画像数据一致性校验工具');
  console.log('='.repeat(80));
  console.log('\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const sampleSizeArg = args.find((arg) => arg.startsWith('--sample='));
  const exportArg = args.find((arg) => arg.startsWith('--export='));

  const sampleSize = sampleSizeArg ? parseInt(sampleSizeArg.split('=')[1], 10) : 100;

  try {
    // 生成一致性报告
    const report = await generateConsistencyReport(sampleSize);

    // 打印报告
    printReport(report);

    // 导出详细报告（如果指定）
    if (exportArg) {
      const filename = exportArg.split('=')[1];
      await exportDetailedReport(report, filename);
    }

    console.log('='.repeat(80));
    console.log('✅ 校验完成！');
    console.log('='.repeat(80));

    // 根据健康度设置退出码
    const consistencyRate =
      report.summary.totalUsers > 0
        ? (report.summary.consistentUsers / report.summary.totalUsers) * 100
        : 100;

    if (consistencyRate < 90 || report.summary.dataErrors > 10) {
      process.exit(1); // 数据质量较差，返回错误码
    }
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
