/**
 * Prisma Schema 到 SQLite DDL 转换器
 *
 * 从 Prisma Schema 生成 SQLite 兼容的 DDL 语句
 * 支持所有表、索引、约束的转换
 */

import { Prisma } from '@prisma/client';
import { PRISMA_TO_SQLITE_TYPE_MAP, TableSchema, FieldTypeInfo } from './type-mapper';

// ============================================
// Prisma DMMF 类型（简化）
// ============================================

interface PrismaField {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  isGenerated?: boolean;
  isUpdatedAt?: boolean;
}

interface PrismaModel {
  name: string;
  dbName: string | null;
  fields: PrismaField[];
  primaryKey: { name: string | null; fields: string[] } | null;
  uniqueFields: string[][];
  uniqueIndexes: Array<{ name: string | null; fields: string[] }>;
}

interface PrismaEnum {
  name: string;
  values: Array<{ name: string; dbName: string | null }>;
}

// ============================================
// Schema 解析
// ============================================

/**
 * 从 Prisma DMMF 提取表 Schema
 */
export function extractTableSchemas(models: PrismaModel[], enums: PrismaEnum[]): TableSchema[] {
  const schemas: TableSchema[] = [];
  const enumNames = new Set(enums.map((e) => e.name));

  for (const model of models) {
    const fields: FieldTypeInfo[] = [];
    const primaryKey: string[] = [];
    const uniqueKeys: string[][] = [];

    // 处理字段
    for (const field of model.fields) {
      // 跳过关系字段
      if (field.kind === 'object') {
        continue;
      }

      let prismaType = field.type;

      // 枚举类型映射为 String
      if (field.kind === 'enum' || enumNames.has(field.type)) {
        prismaType = 'String';
      }

      // 数组类型
      if (field.isList) {
        prismaType = `${prismaType}[]`;
      }

      fields.push({
        name: field.name,
        prismaType,
        isArray: field.isList,
        isOptional: !field.isRequired,
        hasDefault: field.hasDefaultValue || field.isUpdatedAt === true,
        defaultValue: field.default,
        isUpdatedAt: field.isUpdatedAt ?? false,
      });

      // 收集主键
      if (field.isId) {
        primaryKey.push(field.name);
      }

      // 收集唯一约束
      if (field.isUnique) {
        uniqueKeys.push([field.name]);
      }
    }

    // 处理复合主键
    if (model.primaryKey && model.primaryKey.fields.length > 0) {
      primaryKey.length = 0;
      primaryKey.push(...model.primaryKey.fields);
    }

    // 处理复合唯一约束
    for (const uniqueIndex of model.uniqueIndexes) {
      if (uniqueIndex.fields.length > 0) {
        uniqueKeys.push(uniqueIndex.fields);
      }
    }
    for (const uniqueField of model.uniqueFields) {
      if (uniqueField.length > 0) {
        uniqueKeys.push(uniqueField);
      }
    }

    schemas.push({
      tableName: model.dbName || toSnakeCase(model.name),
      modelName: model.name,
      fields,
      primaryKey,
      uniqueKeys,
    });
  }

  return schemas;
}

/**
 * 转换为 snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

// ============================================
// DDL 生成
// ============================================

/**
 * 生成 SQLite 列定义
 */
function generateColumnDef(field: FieldTypeInfo, isPrimaryKey: boolean): string {
  let sqliteType: string;

  // 处理数组类型
  if (field.isArray) {
    sqliteType = 'TEXT'; // 数组存储为 JSON
  } else {
    sqliteType = PRISMA_TO_SQLITE_TYPE_MAP[field.prismaType] || 'TEXT';
  }

  let def = `"${field.name}" ${sqliteType}`;

  // 主键
  if (isPrimaryKey) {
    def += ' PRIMARY KEY';
  }

  // NOT NULL 约束
  if (!field.isOptional && !isPrimaryKey) {
    def += ' NOT NULL';
  }

  return def;
}

/**
 * 生成 CREATE TABLE 语句
 */
export function generateCreateTableSQL(schema: TableSchema): string {
  const columns: string[] = [];
  const constraints: string[] = [];

  // 列定义
  for (const field of schema.fields) {
    const isPrimaryKey = schema.primaryKey.length === 1 && schema.primaryKey[0] === field.name;
    columns.push(generateColumnDef(field, isPrimaryKey));
  }

  // 复合主键
  if (schema.primaryKey.length > 1) {
    const pkCols = schema.primaryKey.map((c) => `"${c}"`).join(', ');
    constraints.push(`PRIMARY KEY (${pkCols})`);
  }

  // 唯一约束
  for (const uniqueKey of schema.uniqueKeys) {
    if (uniqueKey.length === 1) {
      // 单列唯一约束已在列定义中处理
      const field = schema.fields.find((f) => f.name === uniqueKey[0]);
      if (field) {
        const idx = columns.findIndex((c) => c.startsWith(`"${uniqueKey[0]}"`));
        if (idx >= 0 && !columns[idx].includes('PRIMARY KEY')) {
          columns[idx] += ' UNIQUE';
        }
      }
    } else {
      // 复合唯一约束
      const ukCols = uniqueKey.map((c) => `"${c}"`).join(', ');
      constraints.push(`UNIQUE (${ukCols})`);
    }
  }

  const allDefs = [...columns, ...constraints];
  return `CREATE TABLE IF NOT EXISTS "${schema.tableName}" (\n  ${allDefs.join(',\n  ')}\n)`;
}

/**
 * 生成索引语句
 */
export function generateIndexSQL(
  tableName: string,
  indexName: string,
  columns: string[],
  unique: boolean = false,
): string {
  const uniqueStr = unique ? 'UNIQUE ' : '';
  const cols = columns.map((c) => `"${c}"`).join(', ');
  return `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" (${cols})`;
}

/**
 * 生成变更日志表 DDL
 */
export function generateChangeLogTableSQL(): string {
  return `
CREATE TABLE IF NOT EXISTS "_changelog" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('INSERT', 'UPDATE', 'DELETE')),
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "old_data" TEXT,
  "new_data" TEXT,
  "timestamp" INTEGER NOT NULL,
  "synced" INTEGER DEFAULT 0,
  "idempotency_key" TEXT UNIQUE,
  "tx_id" TEXT,
  "tx_seq" INTEGER,
  "tx_committed" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_changelog_synced" ON "_changelog" ("synced", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_changelog_table" ON "_changelog" ("table_name", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_changelog_tx" ON "_changelog" ("tx_id", "tx_seq");
`.trim();
}

/**
 * 生成元数据表 DDL
 */
export function generateMetadataTableSQL(): string {
  return `
CREATE TABLE IF NOT EXISTS "_db_metadata" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);
`.trim();
}

/**
 * 从 Prisma Client 动态获取 Schema 并生成完整的 SQLite DDL
 */
export function generateFullSchemaSQL(schemas: TableSchema[]): string {
  const statements: string[] = [];

  // 启用外键约束
  statements.push('PRAGMA foreign_keys = ON;');

  // 元数据表
  statements.push(generateMetadataTableSQL());

  // 变更日志表
  statements.push(generateChangeLogTableSQL());

  // 业务表
  for (const schema of schemas) {
    // 重要：必须以分号分隔多个 CREATE 语句，否则 SQLite 会在第二个 CREATE 处报错
    statements.push(`${generateCreateTableSQL(schema)};`);
  }

  return statements.join('\n\n');
}

// ============================================
// Schema 信息存储
// ============================================

/**
 * Schema 注册表（运行时缓存）
 */
class SchemaRegistry {
  private schemas: Map<string, TableSchema> = new Map();
  private modelToTable: Map<string, string> = new Map();
  private tableToModel: Map<string, string> = new Map();

  /**
   * 注册 Schema
   */
  register(schemas: TableSchema[]): void {
    for (const schema of schemas) {
      this.schemas.set(schema.tableName, schema);
      this.modelToTable.set(schema.modelName, schema.tableName);
      this.tableToModel.set(schema.tableName, schema.modelName);
    }
  }

  /**
   * 获取表 Schema
   */
  getByTableName(tableName: string): TableSchema | undefined {
    return this.schemas.get(tableName);
  }

  /**
   * 通过模型名获取表 Schema
   */
  getByModelName(modelName: string): TableSchema | undefined {
    const tableName = this.modelToTable.get(modelName);
    return tableName ? this.schemas.get(tableName) : undefined;
  }

  /**
   * 获取表名
   */
  getTableName(modelName: string): string | undefined {
    return this.modelToTable.get(modelName);
  }

  /**
   * 获取模型名
   */
  getModelName(tableName: string): string | undefined {
    return this.tableToModel.get(tableName);
  }

  /**
   * 获取所有表 Schema
   */
  getAllSchemas(): TableSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * 获取所有表名
   */
  getAllTableNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.schemas.clear();
    this.modelToTable.clear();
    this.tableToModel.clear();
  }
}

// 导出单例
export const schemaRegistry = new SchemaRegistry();

// ============================================
// Prisma DMMF 提取辅助
// ============================================

/**
 * 从 PrismaClient 提取 DMMF 并注册 Schema
 * 需要在应用启动时调用
 */
export async function initializeSchemaRegistry(prismaClient: unknown): Promise<TableSchema[]> {
  // 类型断言获取内部 _dmmf
  const client = prismaClient as {
    _dmmf?: {
      datamodel: {
        models: PrismaModel[];
        enums: PrismaEnum[];
      };
    };
    _baseDmmf?: {
      datamodel: {
        models: PrismaModel[];
        enums: PrismaEnum[];
      };
    };
  };

  // Prisma 5+ 默认不再暴露 instance._dmmf/_baseDmmf，改为 Prisma.dmmf
  const dmmf = client._dmmf || client._baseDmmf || (Prisma as unknown as { dmmf?: unknown }).dmmf;

  if (!dmmf || typeof dmmf !== 'object' || !('datamodel' in dmmf)) {
    throw new Error('无法从 PrismaClient/Prisma.dmmf 获取 DMMF 信息');
  }

  const { models, enums } = (dmmf as { datamodel: { models: PrismaModel[]; enums: PrismaEnum[] } })
    .datamodel;
  const schemas = extractTableSchemas(models, enums);

  schemaRegistry.register(schemas);

  return schemas;
}

/**
 * 硬编码的表映射（备用方案）
 * 当无法从 DMMF 获取时使用
 */
export const HARDCODED_MODEL_TABLE_MAP: Record<string, string> = {
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

/**
 * 获取模型对应的表名
 */
export function getTableNameForModel(modelName: string): string {
  // 优先从注册表获取
  const tableName = schemaRegistry.getTableName(modelName);
  if (tableName) {
    return tableName;
  }

  // 回退到硬编码映射
  if (HARDCODED_MODEL_TABLE_MAP[modelName]) {
    return HARDCODED_MODEL_TABLE_MAP[modelName];
  }

  // 最后回退到 snake_case 转换
  return toSnakeCase(modelName);
}
