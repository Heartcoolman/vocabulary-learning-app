/**
 * 全量同步脚本
 * 将 PostgreSQL 中的所有数据同步到 SQLite
 */

import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { env } from '../config/env';

const prisma = new PrismaClient();

// 表映射：Prisma 模型名 -> SQLite 表名
const TABLE_MAP: Record<string, string> = {
  user: 'users',
  wordBook: 'word_books',
  word: 'words',
  answerRecord: 'answer_records',
  session: 'sessions',
  userStudyConfig: 'user_study_configs',
  wordLearningState: 'word_learning_states',
  wordScore: 'word_scores',
  algorithmConfig: 'algorithm_configs',
  configHistory: 'config_history',
  anomalyFlag: 'anomaly_flags',
  amasUserState: 'amas_user_states',
  amasUserModel: 'amas_user_models',
  learningSession: 'learning_sessions',
  featureVector: 'feature_vectors',
  habitProfile: 'habit_profiles',
  rewardQueue: 'reward_queue',
  userStateHistory: 'user_state_history',
  badgeDefinition: 'badge_definitions',
  userBadge: 'user_badges',
  learningPlan: 'learning_plans',
  aBExperiment: 'ab_experiments',
  aBVariant: 'ab_variants',
  aBUserAssignment: 'ab_user_assignments',
  aBExperimentMetrics: 'ab_experiment_metrics',
  bayesianOptimizerState: 'bayesian_optimizer_state',
  causalObservation: 'causal_observations',
  wordReviewTrace: 'word_review_traces',
  decisionRecord: 'decision_records',
  decisionInsight: 'decision_insights',
  pipelineStage: 'pipeline_stages',
  systemLog: 'system_logs',
  logAlertRule: 'log_alert_rules',
  lLMAdvisorSuggestion: 'llm_advisor_suggestions',
  suggestionEffectTracking: 'suggestion_effect_tracking',
  userLearningObjectives: 'user_learning_objectives',
  objectiveHistory: 'objective_history',
  userLearningProfile: 'user_learning_profiles',
  forgettingAlert: 'forgetting_alerts',
  wordContext: 'word_contexts',
  notification: 'notifications',
  userPreference: 'user_preferences',
  visualFatigueRecord: 'visual_fatigue_records',
  userVisualFatigueConfig: 'user_visual_fatigue_configs',
  userInteractionStats: 'user_interaction_stats',
  userTrackingEvent: 'user_tracking_events',
  wordQualityCheck: 'word_quality_checks',
  wordContentIssue: 'word_content_issues',
  wordContentVariant: 'word_content_variants',
  lLMAnalysisTask: 'llm_analysis_tasks',
  systemWeeklyReport: 'system_weekly_reports',
  userBehaviorInsight: 'user_behavior_insights',
  alertRootCauseAnalysis: 'alert_root_cause_analyses',
};

// 同步优先级（按依赖关系排序）
const SYNC_ORDER = [
  'user',
  'wordBook',
  'word',
  'userStudyConfig',
  'userPreference',
  'userLearningProfile',
  'userLearningObjectives',
  'algorithmConfig',
  'badgeDefinition',
  'aBExperiment',
  'aBVariant',
  'session',
  'learningSession',
  'wordLearningState',
  'wordScore',
  'answerRecord',
  'wordReviewTrace',
  'amasUserState',
  'amasUserModel',
  'featureVector',
  'habitProfile',
  'rewardQueue',
  'userStateHistory',
  'userBadge',
  'learningPlan',
  'aBUserAssignment',
  'aBExperimentMetrics',
  'bayesianOptimizerState',
  'causalObservation',
  'decisionRecord',
  'decisionInsight',
  'pipelineStage',
  'configHistory',
  'anomalyFlag',
  'systemLog',
  'logAlertRule',
  'lLMAdvisorSuggestion',
  'suggestionEffectTracking',
  'objectiveHistory',
  'forgettingAlert',
  'wordContext',
  'notification',
  'visualFatigueRecord',
  'userVisualFatigueConfig',
  'userInteractionStats',
  'userTrackingEvent',
  'wordQualityCheck',
  'wordContentIssue',
  'wordContentVariant',
  'lLMAnalysisTask',
  'systemWeeklyReport',
  'userBehaviorInsight',
  'alertRootCauseAnalysis',
];

/**
 * 将 snake_case 转换为 camelCase
 * 例如: user_id -> userId, created_at -> createdAt
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function syncTable(
  db: Database.Database,
  modelName: string,
  tableName: string,
): Promise<number> {
  const model = (prisma as any)[modelName];
  if (!model) {
    console.log(`  ⚠️  跳过 ${modelName}: 模型不存在`);
    return 0;
  }

  try {
    // 检查表是否存在
    const tableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName);

    if (!tableExists) {
      console.log(`  ⚠️  跳过 ${modelName}: 表 ${tableName} 不存在`);
      return 0;
    }

    // 获取 PostgreSQL 数据
    const data = await model.findMany();
    if (data.length === 0) {
      console.log(`  ✓ ${modelName}: 0 条记录（空表）`);
      return 0;
    }

    // 获取 SQLite 表结构
    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      name: string;
      type: string;
    }>;
    const columnNames = columns.map((c) => c.name);

    // 构建 INSERT 语句
    const placeholders = columnNames.map(() => '?').join(', ');
    const insertSql = `INSERT OR REPLACE INTO "${tableName}" (${columnNames.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
    const stmt = db.prepare(insertSql);

    // 构建列名映射：SQLite snake_case -> Prisma camelCase
    const columnToPrismaKey = new Map<string, string>();
    for (const col of columnNames) {
      const camelKey = snakeToCamel(col);
      columnToPrismaKey.set(col, camelKey);
    }

    // 批量插入
    let inserted = 0;
    const transaction = db.transaction((items: any[]) => {
      for (const item of items) {
        // 使用转换后的 camelCase 属性名访问 Prisma 数据
        const values = columnNames.map((col) => {
          const prismaKey = columnToPrismaKey.get(col) || col;
          return convertValue(item[prismaKey]);
        });
        try {
          stmt.run(...values);
          inserted++;
        } catch (e: any) {
          // 忽略单条记录错误，继续处理
          if (!e.message.includes('UNIQUE constraint')) {
            console.log(`    ⚠️  插入失败: ${e.message}`);
          }
        }
      }
    });

    transaction(data);
    console.log(`  ✓ ${modelName}: ${inserted}/${data.length} 条记录已同步`);
    return inserted;
  } catch (e: any) {
    console.log(`  ✗ ${modelName}: ${e.message}`);
    return 0;
  }
}

async function main() {
  console.log('========================================');
  console.log('    PostgreSQL → SQLite 全量同步');
  console.log('========================================\n');

  // 连接 PostgreSQL
  console.log('1. 连接 PostgreSQL...');
  try {
    await prisma.$connect();
    console.log('   ✓ PostgreSQL 已连接\n');
  } catch (e: any) {
    console.error('   ✗ PostgreSQL 连接失败:', e.message);
    process.exit(1);
  }

  // 连接 SQLite
  console.log('2. 连接 SQLite...');
  const sqlitePath = env.SQLITE_FALLBACK_PATH || './data/fallback.db';
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // 暂时禁用外键约束
  console.log(`   ✓ SQLite 已连接: ${sqlitePath}\n`);

  // 同步数据
  console.log('3. 开始同步数据...\n');
  let totalSynced = 0;
  const startTime = Date.now();

  for (const modelName of SYNC_ORDER) {
    const tableName = TABLE_MAP[modelName];
    if (!tableName) continue;

    const count = await syncTable(db, modelName, tableName);
    totalSynced += count;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // 重新启用外键约束
  db.pragma('foreign_keys = ON');
  db.close();

  console.log('\n========================================');
  console.log(`    同步完成！`);
  console.log(`    总计: ${totalSynced} 条记录`);
  console.log(`    耗时: ${duration} 秒`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

main().catch(console.error);
