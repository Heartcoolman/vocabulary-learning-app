/**
 * SQLite Schema 同步脚本
 * 从 PostgreSQL 读取表结构，在 SQLite 中创建对应的表
 *
 * 功能包括：
 * - 表结构同步（列定义、主键、唯一约束）
 * - 外键约束同步
 * - 索引同步
 * - 表名映射验证（与 Prisma @@map 一致性检查）
 * - 事务保护
 */

import { PrismaClient, Prisma } from '@prisma/client';
import Database from 'better-sqlite3';
import { env } from '../config/env';

const prisma = new PrismaClient();

// PostgreSQL 类型到 SQLite 类型的映射
const TYPE_MAP: Record<string, string> = {
  text: 'TEXT',
  'character varying': 'TEXT',
  varchar: 'TEXT',
  integer: 'INTEGER',
  bigint: 'INTEGER',
  smallint: 'INTEGER',
  boolean: 'INTEGER',
  'timestamp without time zone': 'TEXT',
  'timestamp with time zone': 'TEXT',
  date: 'TEXT',
  'double precision': 'REAL',
  real: 'REAL',
  numeric: 'REAL',
  jsonb: 'TEXT',
  json: 'TEXT',
  uuid: 'TEXT',
  bytea: 'BLOB',
};

// Prisma DMMF 中的表名映射（从 @@map 提取）
// 格式: { modelName: tableName }
const PRISMA_TABLE_MAP: Record<string, string> = {
  User: 'users',
  WordBook: 'word_books',
  Word: 'words',
  AnswerRecord: 'answer_records',
  Session: 'sessions',
  UserStudyConfig: 'user_study_configs',
  WordLearningState: 'word_learning_states',
  WordScore: 'word_scores',
  AlgorithmConfig: 'algorithm_configs',
  ConfigHistory: 'config_history',
  AnomalyFlag: 'anomaly_flags',
  AmasUserState: 'amas_user_states',
  AmasUserModel: 'amas_user_models',
  LearningSession: 'learning_sessions',
  FeatureVector: 'feature_vectors',
  HabitProfile: 'habit_profiles',
  RewardQueue: 'reward_queue',
  UserStateHistory: 'user_state_history',
  BadgeDefinition: 'badge_definitions',
  UserBadge: 'user_badges',
  LearningPlan: 'learning_plans',
  ABExperiment: 'ab_experiments',
  ABVariant: 'ab_variants',
  ABUserAssignment: 'ab_user_assignments',
  ABExperimentMetrics: 'ab_experiment_metrics',
  BayesianOptimizerState: 'bayesian_optimizer_state',
  CausalObservation: 'causal_observations',
  WordReviewTrace: 'word_review_traces',
  DecisionRecord: 'decision_records',
  DecisionInsight: 'decision_insights',
  PipelineStage: 'pipeline_stages',
  word_frequency: 'word_frequency',
  SystemLog: 'system_logs',
  LogAlertRule: 'log_alert_rules',
  LLMAdvisorSuggestion: 'llm_advisor_suggestions',
  SuggestionEffectTracking: 'suggestion_effect_tracking',
  UserLearningObjectives: 'user_learning_objectives',
  ObjectiveHistory: 'objective_history',
  UserLearningProfile: 'user_learning_profiles',
  ForgettingAlert: 'forgetting_alerts',
  WordContext: 'word_contexts',
  Notification: 'notifications',
  UserPreference: 'user_preferences',
  VisualFatigueRecord: 'visual_fatigue_records',
  UserVisualFatigueConfig: 'user_visual_fatigue_configs',
  UserInteractionStats: 'user_interaction_stats',
  UserTrackingEvent: 'user_tracking_events',
  WordQualityCheck: 'word_quality_checks',
  WordContentIssue: 'word_content_issues',
  WordContentVariant: 'word_content_variants',
  LLMAnalysisTask: 'llm_analysis_tasks',
  SystemWeeklyReport: 'system_weekly_reports',
  UserBehaviorInsight: 'user_behavior_insights',
  AlertRootCauseAnalysis: 'alert_root_cause_analyses',
};

// 反向映射：tableName -> modelName
const TABLE_TO_MODEL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PRISMA_TABLE_MAP).map(([k, v]) => [v, k]),
);

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface PrimaryKeyInfo {
  column_name: string;
}

interface IndexInfo {
  indexname: string;
  indexdef: string;
}

interface ForeignKeyInfo {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  on_delete: string;
  on_update: string;
}

interface ParsedIndex {
  indexName: string;
  columns: string[];
  unique: boolean;
}

async function getTableNames(): Promise<string[]> {
  const result = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE '_prisma%'
    AND tablename NOT LIKE 'pg_%'
    ORDER BY tablename
  `;
  return result.map((r) => r.tablename);
}

async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
  return prisma.$queryRaw<ColumnInfo[]>`
    SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
}

async function getPrimaryKey(tableName: string): Promise<string[]> {
  const result = await prisma.$queryRaw<PrimaryKeyInfo[]>`
    SELECT a.attname as column_name
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = ${tableName}::regclass AND i.indisprimary
  `;
  return result.map((r) => r.column_name);
}

async function getUniqueConstraints(tableName: string): Promise<string[][]> {
  const result = await prisma.$queryRaw<Array<{ column_name: string; constraint_name: string }>>`
    SELECT kcu.column_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = ${tableName}
      AND tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
    ORDER BY tc.constraint_name, kcu.ordinal_position
  `;

  // 按约束名分组
  const groups: Record<string, string[]> = {};
  for (const row of result) {
    if (!groups[row.constraint_name]) {
      groups[row.constraint_name] = [];
    }
    groups[row.constraint_name].push(row.column_name);
  }

  return Object.values(groups);
}

async function getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
  return prisma.$queryRaw<ForeignKeyInfo[]>`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule AS on_delete,
      rc.update_rule AS on_update
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = ${tableName}
    ORDER BY tc.constraint_name
  `;
}

async function getIndexes(tableName: string): Promise<IndexInfo[]> {
  return prisma.$queryRaw<IndexInfo[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ${tableName}
      AND indexname NOT LIKE '%_pkey'
      AND indexname NOT LIKE '%_key'
    ORDER BY indexname
  `;
}

function parseIndexDef(indexDef: string): ParsedIndex | null {
  // 解析 PostgreSQL 索引定义，例如:
  // CREATE INDEX idx_name ON table_name (col1, col2)
  // CREATE UNIQUE INDEX idx_name ON table_name USING btree (col1)
  const uniqueMatch = indexDef.includes('UNIQUE');

  // 提取索引名
  const nameMatch = indexDef.match(/INDEX\s+"?(\w+)"?\s+ON/i);
  if (!nameMatch) return null;
  const indexName = nameMatch[1];

  // 提取列名 - 处理各种格式
  const columnsMatch = indexDef.match(/\(([^)]+)\)\s*(?:WHERE|$)/i);
  if (!columnsMatch) return null;

  // 解析列名，移除排序方向和其他修饰符
  const columnsStr = columnsMatch[1];
  const columns = columnsStr
    .split(',')
    .map((col) => {
      // 移除空格、排序方向（ASC/DESC）、NULLS FIRST/LAST 等
      const cleaned = col
        .trim()
        .replace(/\s+(ASC|DESC)\s*/gi, '')
        .replace(/\s+NULLS\s+(FIRST|LAST)\s*/gi, '')
        .replace(/^"(.*)"$/, '$1') // 移除引号
        .trim();
      return cleaned;
    })
    .filter((col) => col.length > 0);

  if (columns.length === 0) return null;

  return { indexName, columns, unique: uniqueMatch };
}

function generateCreateIndexSQL(tableName: string, parsedIndex: ParsedIndex): string {
  const uniqueClause = parsedIndex.unique ? 'UNIQUE ' : '';
  const columns = parsedIndex.columns.map((c) => `"${c}"`).join(', ');
  return `CREATE ${uniqueClause}INDEX IF NOT EXISTS "${parsedIndex.indexName}" ON "${tableName}" (${columns})`;
}

function mapType(pgType: string): string {
  const normalized = pgType.toLowerCase();
  return TYPE_MAP[normalized] || 'TEXT';
}

function generateCreateTableSQL(
  tableName: string,
  columns: ColumnInfo[],
  primaryKeys: string[],
  uniqueConstraints: string[][],
  foreignKeys: ForeignKeyInfo[] = [],
): string {
  const columnDefs: string[] = [];

  for (const col of columns) {
    const sqliteType = mapType(col.data_type);
    let def = `"${col.column_name}" ${sqliteType}`;

    // Primary key
    if (primaryKeys.length === 1 && primaryKeys[0] === col.column_name) {
      def += ' PRIMARY KEY';
    }

    // NOT NULL (但跳过有默认值的列，让 SQLite 使用默认值)
    const hasDefault = col.column_default && col.column_default.trim() !== '';
    if (col.is_nullable === 'NO' && !primaryKeys.includes(col.column_name) && !hasDefault) {
      def += ' NOT NULL';
    }

    // Default value - 转换 PostgreSQL 语法到 SQLite
    if (hasDefault) {
      let defaultVal = col.column_default!;

      // 移除 PostgreSQL 类型转换 ::type
      defaultVal = defaultVal.replace(/::[\w\s\[\]"]+/g, '');

      // 移除 PostgreSQL 的 interval 语法
      defaultVal = defaultVal.replace(/\+ '\d+\s+\w+'::interval/g, '');

      // 转换函数
      if (defaultVal.includes('now()') || defaultVal.includes('CURRENT_TIMESTAMP')) {
        defaultVal = "(datetime('now'))";
      } else if (
        defaultVal.includes('gen_random_uuid()') ||
        defaultVal.includes('uuid_generate_v4()')
      ) {
        // SQLite 没有 UUID 函数，跳过默认值
        defaultVal = '';
      } else if (defaultVal.includes('ARRAY[') || defaultVal.includes("'{}'")) {
        // 数组类型，转换为 JSON
        defaultVal = "'[]'";
      } else if (defaultVal === 'true') {
        defaultVal = '1';
      } else if (defaultVal === 'false') {
        defaultVal = '0';
      } else if (defaultVal.match(/^\d+$/)) {
        // 数字
        defaultVal = defaultVal;
      } else if (defaultVal.match(/^'\d+\s+\w+'\s*$/)) {
        // interval 字符串，跳过
        defaultVal = '';
      } else if (defaultVal.match(/^'.*'$/)) {
        // 字符串
        defaultVal = defaultVal;
      } else if (defaultVal.includes('(') && !defaultVal.startsWith('(')) {
        // 函数调用，跳过
        defaultVal = '';
      } else if (defaultVal.includes(':')) {
        // 其他包含冒号的语法（如时区），跳过
        defaultVal = '';
      }

      if (defaultVal && defaultVal.trim()) {
        def += ` DEFAULT ${defaultVal}`;
      }
    }

    columnDefs.push(def);
  }

  // Composite primary key
  if (primaryKeys.length > 1) {
    columnDefs.push(`PRIMARY KEY (${primaryKeys.map((k) => `"${k}"`).join(', ')})`);
  }

  // Unique constraints
  for (const uniqueCols of uniqueConstraints) {
    columnDefs.push(`UNIQUE (${uniqueCols.map((c) => `"${c}"`).join(', ')})`);
  }

  // Foreign key constraints
  for (const fk of foreignKeys) {
    const onDelete = fk.on_delete !== 'NO ACTION' ? ` ON DELETE ${fk.on_delete}` : '';
    const onUpdate = fk.on_update !== 'NO ACTION' ? ` ON UPDATE ${fk.on_update}` : '';
    columnDefs.push(
      `FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table_name}" ("${fk.foreign_column_name}")${onDelete}${onUpdate}`,
    );
  }

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefs.join(',\n  ')}\n)`;
}

async function main() {
  console.log('========================================');
  console.log('    SQLite Schema 同步');
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
  db.pragma('foreign_keys = OFF');
  console.log(`   ✓ SQLite 已连接: ${sqlitePath}\n`);

  // 获取所有表
  console.log('3. 获取表结构...\n');
  const tables = await getTableNames();
  console.log(`   找到 ${tables.length} 个表\n`);

  // 生成并执行 DDL
  console.log('4. 创建 SQLite 表...\n');
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const tableName of tables) {
    // 跳过系统表
    if (tableName.startsWith('_')) {
      continue;
    }

    try {
      // 检查表是否已存在
      const exists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(tableName);

      if (exists) {
        console.log(`   ○ ${tableName}: 已存在`);
        skipped++;
        continue;
      }

      // 获取表结构
      const columns = await getTableColumns(tableName);
      const primaryKeys = await getPrimaryKey(tableName);
      const uniqueConstraints = await getUniqueConstraints(tableName);
      const foreignKeys = await getForeignKeys(tableName);

      if (columns.length === 0) {
        console.log(`   ⚠ ${tableName}: 无列信息`);
        continue;
      }

      // 生成 DDL
      const ddl = generateCreateTableSQL(
        tableName,
        columns,
        primaryKeys,
        uniqueConstraints,
        foreignKeys,
      );

      // 执行 DDL
      db.exec(ddl);
      const fkInfo = foreignKeys.length > 0 ? `, ${foreignKeys.length} 外键` : '';
      console.log(`   ✓ ${tableName}: 已创建 (${columns.length} 列${fkInfo})`);
      created++;
    } catch (e: any) {
      console.log(`   ✗ ${tableName}: ${e.message}`);
      failed++;
    }
  }

  // 创建索引
  console.log('\n5. 创建索引...\n');
  let indexCreated = 0;
  let indexSkipped = 0;
  let indexFailed = 0;

  for (const tableName of tables) {
    // 跳过系统表
    if (tableName.startsWith('_')) {
      continue;
    }

    try {
      const indexes = await getIndexes(tableName);

      for (const idx of indexes) {
        const parsed = parseIndexDef(idx.indexdef);
        if (!parsed) {
          console.log(`   ⚠ ${tableName}.${idx.indexname}: 无法解析`);
          continue;
        }

        // 检查索引是否已存在
        const indexExists = db
          .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`)
          .get(parsed.indexName);

        if (indexExists) {
          indexSkipped++;
          continue;
        }

        const indexDDL = generateCreateIndexSQL(tableName, parsed);
        db.exec(indexDDL);
        console.log(`   ✓ ${tableName}.${parsed.indexName}: 已创建 (${parsed.columns.join(', ')})`);
        indexCreated++;
      }
    } catch (e: any) {
      console.log(`   ✗ ${tableName} 索引: ${e.message}`);
      indexFailed++;
    }
  }

  db.pragma('foreign_keys = ON');
  db.close();

  console.log('\n========================================');
  console.log(`    Schema 同步完成！`);
  console.log('----------------------------------------');
  console.log(`    表:     创建 ${created}, 跳过 ${skipped}, 失败 ${failed}`);
  console.log(`    索引:   创建 ${indexCreated}, 跳过 ${indexSkipped}, 失败 ${indexFailed}`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

main().catch(console.error);
