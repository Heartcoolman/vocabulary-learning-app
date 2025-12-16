/**
 * PostgreSQL 适配器
 *
 * 包装 PrismaClient 实现 DatabaseAdapter 接口
 * 作为主数据库适配器使用
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  DatabaseAdapter,
  DatabaseType,
  ModelAdapter,
  TransactionClient,
  QueryArgs,
  CreateArgs,
  CreateManyArgs,
  UpdateArgs,
  UpdateManyArgs,
  UpsertArgs,
  DeleteArgs,
  DeleteManyArgs,
  AggregateArgs,
  GroupByArgs,
} from './types';
import { getTableNameForModel, HARDCODED_MODEL_TABLE_MAP } from '../schema';

// ============================================
// PostgreSQL 模型适配器
// ============================================

/**
 * PostgreSQL 模型适配器
 * 直接代理 PrismaClient 的模型操作
 */
class PostgresModelAdapter<T = unknown> implements ModelAdapter<T> {
  constructor(
    private prismaModel: unknown,
    private modelName: string,
  ) {}

  async findUnique(args: {
    where: Record<string, unknown>;
    select?: Record<string, boolean | object>;
    include?: Record<string, boolean | object>;
  }): Promise<T | null> {
    const model = this.prismaModel as { findUnique: (args: unknown) => Promise<T | null> };
    return model.findUnique(args);
  }

  async findFirst(args?: QueryArgs): Promise<T | null> {
    const model = this.prismaModel as { findFirst: (args?: unknown) => Promise<T | null> };
    return model.findFirst(args);
  }

  async findMany(args?: QueryArgs): Promise<T[]> {
    const model = this.prismaModel as { findMany: (args?: unknown) => Promise<T[]> };
    return model.findMany(args);
  }

  async create(args: CreateArgs): Promise<T> {
    const model = this.prismaModel as { create: (args: unknown) => Promise<T> };
    return model.create(args);
  }

  async createMany(args: CreateManyArgs): Promise<{ count: number }> {
    const model = this.prismaModel as { createMany: (args: unknown) => Promise<{ count: number }> };
    return model.createMany(args);
  }

  async update(args: UpdateArgs): Promise<T> {
    const model = this.prismaModel as { update: (args: unknown) => Promise<T> };
    return model.update(args);
  }

  async updateMany(args: UpdateManyArgs): Promise<{ count: number }> {
    const model = this.prismaModel as { updateMany: (args: unknown) => Promise<{ count: number }> };
    return model.updateMany(args);
  }

  async upsert(args: UpsertArgs): Promise<T> {
    const model = this.prismaModel as { upsert: (args: unknown) => Promise<T> };
    return model.upsert(args);
  }

  async delete(args: DeleteArgs): Promise<T> {
    const model = this.prismaModel as { delete: (args: unknown) => Promise<T> };
    return model.delete(args);
  }

  async deleteMany(args?: DeleteManyArgs): Promise<{ count: number }> {
    const model = this.prismaModel as {
      deleteMany: (args?: unknown) => Promise<{ count: number }>;
    };
    return model.deleteMany(args);
  }

  async count(args?: { where?: Record<string, unknown> }): Promise<number> {
    const model = this.prismaModel as { count: (args?: unknown) => Promise<number> };
    return model.count(args);
  }

  async aggregate(args: AggregateArgs): Promise<Record<string, unknown>> {
    const model = this.prismaModel as {
      aggregate: (args: unknown) => Promise<Record<string, unknown>>;
    };
    return model.aggregate(args);
  }

  async groupBy(args: GroupByArgs): Promise<Array<Record<string, unknown>>> {
    const model = this.prismaModel as {
      groupBy: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    };
    return model.groupBy(args);
  }
}

// ============================================
// PostgreSQL 事务客户端
// ============================================

/**
 * PostgreSQL 事务客户端
 * 提供与 Prisma 事务客户端兼容的 API，包括模型属性访问器
 */
class PostgresTransactionClient implements TransactionClient {
  constructor(private tx: Prisma.TransactionClient) {}

  getModel<T = unknown>(modelName: string): ModelAdapter<T> {
    const lowerName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const model = (this.tx as Record<string, unknown>)[lowerName];

    if (!model) {
      throw new Error(`Model ${modelName} not found in transaction client`);
    }

    return new PostgresModelAdapter<T>(model, modelName);
  }

  async $queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T> {
    // 使用 Prisma.sql 构建带参数的查询
    const template = { raw: query, values: params } as unknown as TemplateStringsArray;
    return (this.tx as unknown as { $queryRaw: (q: TemplateStringsArray) => Promise<T> }).$queryRaw(
      template,
    );
  }

  async $executeRaw(query: string, ...params: unknown[]): Promise<number> {
    const template = { raw: query, values: params } as unknown as TemplateStringsArray;
    return (
      this.tx as unknown as { $executeRaw: (q: TemplateStringsArray) => Promise<number> }
    ).$executeRaw(template);
  }

  // Prisma 模型属性访问器 - 直接代理到底层事务客户端
  get user() {
    return (this.tx as Record<string, unknown>).user;
  }
  get wordBook() {
    return (this.tx as Record<string, unknown>).wordBook;
  }
  get word() {
    return (this.tx as Record<string, unknown>).word;
  }
  get answerRecord() {
    return (this.tx as Record<string, unknown>).answerRecord;
  }
  get session() {
    return (this.tx as Record<string, unknown>).session;
  }
  get userStudyConfig() {
    return (this.tx as Record<string, unknown>).userStudyConfig;
  }
  get wordLearningState() {
    return (this.tx as Record<string, unknown>).wordLearningState;
  }
  get wordScore() {
    return (this.tx as Record<string, unknown>).wordScore;
  }
  get algorithmConfig() {
    return (this.tx as Record<string, unknown>).algorithmConfig;
  }
  get configHistory() {
    return (this.tx as Record<string, unknown>).configHistory;
  }
  get anomalyFlag() {
    return (this.tx as Record<string, unknown>).anomalyFlag;
  }
  get amasUserState() {
    return (this.tx as Record<string, unknown>).amasUserState;
  }
  get amasUserModel() {
    return (this.tx as Record<string, unknown>).amasUserModel;
  }
  get learningSession() {
    return (this.tx as Record<string, unknown>).learningSession;
  }
  get featureVector() {
    return (this.tx as Record<string, unknown>).featureVector;
  }
  get habitProfile() {
    return (this.tx as Record<string, unknown>).habitProfile;
  }
  get rewardQueue() {
    return (this.tx as Record<string, unknown>).rewardQueue;
  }
  get userStateHistory() {
    return (this.tx as Record<string, unknown>).userStateHistory;
  }
  get badgeDefinition() {
    return (this.tx as Record<string, unknown>).badgeDefinition;
  }
  get userBadge() {
    return (this.tx as Record<string, unknown>).userBadge;
  }
  get learningPlan() {
    return (this.tx as Record<string, unknown>).learningPlan;
  }
  get aBExperiment() {
    return (this.tx as Record<string, unknown>).aBExperiment;
  }
  get aBVariant() {
    return (this.tx as Record<string, unknown>).aBVariant;
  }
  get aBUserAssignment() {
    return (this.tx as Record<string, unknown>).aBUserAssignment;
  }
  get aBExperimentMetrics() {
    return (this.tx as Record<string, unknown>).aBExperimentMetrics;
  }
  get bayesianOptimizerState() {
    return (this.tx as Record<string, unknown>).bayesianOptimizerState;
  }
  get causalObservation() {
    return (this.tx as Record<string, unknown>).causalObservation;
  }
  get wordReviewTrace() {
    return (this.tx as Record<string, unknown>).wordReviewTrace;
  }
  get decisionRecord() {
    return (this.tx as Record<string, unknown>).decisionRecord;
  }
  get decisionInsight() {
    return (this.tx as Record<string, unknown>).decisionInsight;
  }
  get pipelineStage() {
    return (this.tx as Record<string, unknown>).pipelineStage;
  }
  get word_frequency() {
    return (this.tx as Record<string, unknown>).word_frequency;
  }
  get systemLog() {
    return (this.tx as Record<string, unknown>).systemLog;
  }
  get logAlertRule() {
    return (this.tx as Record<string, unknown>).logAlertRule;
  }
  get lLMAdvisorSuggestion() {
    return (this.tx as Record<string, unknown>).lLMAdvisorSuggestion;
  }
  get suggestionEffectTracking() {
    return (this.tx as Record<string, unknown>).suggestionEffectTracking;
  }
  get userLearningObjectives() {
    return (this.tx as Record<string, unknown>).userLearningObjectives;
  }
  get objectiveHistory() {
    return (this.tx as Record<string, unknown>).objectiveHistory;
  }
  get userLearningProfile() {
    return (this.tx as Record<string, unknown>).userLearningProfile;
  }
  get forgettingAlert() {
    return (this.tx as Record<string, unknown>).forgettingAlert;
  }
  get wordContext() {
    return (this.tx as Record<string, unknown>).wordContext;
  }
  get notification() {
    return (this.tx as Record<string, unknown>).notification;
  }
  get userPreference() {
    return (this.tx as Record<string, unknown>).userPreference;
  }
  get visualFatigueRecord() {
    return (this.tx as Record<string, unknown>).visualFatigueRecord;
  }
  get userVisualFatigueConfig() {
    return (this.tx as Record<string, unknown>).userVisualFatigueConfig;
  }
  get userInteractionStats() {
    return (this.tx as Record<string, unknown>).userInteractionStats;
  }
  get userTrackingEvent() {
    return (this.tx as Record<string, unknown>).userTrackingEvent;
  }
  get wordQualityCheck() {
    return (this.tx as Record<string, unknown>).wordQualityCheck;
  }
  get wordContentIssue() {
    return (this.tx as Record<string, unknown>).wordContentIssue;
  }
  get wordContentVariant() {
    return (this.tx as Record<string, unknown>).wordContentVariant;
  }
  get lLMAnalysisTask() {
    return (this.tx as Record<string, unknown>).lLMAnalysisTask;
  }
  get systemWeeklyReport() {
    return (this.tx as Record<string, unknown>).systemWeeklyReport;
  }
  get userBehaviorInsight() {
    return (this.tx as Record<string, unknown>).userBehaviorInsight;
  }
  get alertRootCauseAnalysis() {
    return (this.tx as Record<string, unknown>).alertRootCauseAnalysis;
  }

  // 支持动态模型访问
  [key: string]: unknown;
}

// ============================================
// PostgreSQL 适配器
// ============================================

/**
 * PostgreSQL 数据库适配器
 */
export class PostgresAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = 'postgresql';
  private connected = false;

  constructor(private prisma: PrismaClient) {}

  /**
   * 获取原始 PrismaClient
   */
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    this.connected = false;
  }

  async healthCheck(
    timeoutMs = 5000,
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    // 如果明确知道未连接，直接返回失败，避免触发 Prisma 连接错误日志
    if (!this.connected) {
      // 尝试快速连接测试
      try {
        await this.prisma.$connect();
        this.connected = true;
      } catch {
        return {
          healthy: false,
          latency: Date.now() - startTime,
          error: 'Database not connected',
        };
      }
    }

    try {
      // 使用 resolve('timeout') 而不是 reject，确保超时逻辑正确
      const result = await Promise.race([
        this.prisma.$queryRaw`SELECT 1`.then(() => 'success' as const),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
      ]);

      if (result === 'timeout') {
        return {
          healthy: false,
          latency: Date.now() - startTime,
          error: 'Health check timeout',
        };
      }

      return {
        healthy: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      // 连接失败，标记为未连接
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  getModel<T = unknown>(modelName: string): ModelAdapter<T> {
    const lowerName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const model = (this.prisma as unknown as Record<string, unknown>)[lowerName];

    if (!model) {
      throw new Error(`Model ${modelName} not found in PrismaClient`);
    }

    return new PostgresModelAdapter<T>(model, modelName);
  }

  async $transaction<T>(
    fn: (client: TransactionClient) => Promise<T>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = new PostgresTransactionClient(tx);
      return fn(client);
    }, options);
  }

  async $queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T> {
    // 构建 Prisma.sql 模板
    if (params.length === 0) {
      return this.prisma.$queryRawUnsafe<T>(query);
    }
    return this.prisma.$queryRawUnsafe<T>(query, ...params);
  }

  async $executeRaw(query: string, ...params: unknown[]): Promise<number> {
    if (params.length === 0) {
      return this.prisma.$executeRawUnsafe(query);
    }
    return this.prisma.$executeRawUnsafe(query, ...params);
  }

  async bulkInsert(tableName: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;

    // 使用 PrismaClient 的 createMany
    const modelName = this.getModelNameForTable(tableName);
    if (modelName) {
      const model = this.getModel(modelName);
      const result = await model.createMany({ data: rows, skipDuplicates: true });
      return result.count;
    }

    // 回退到原始 SQL
    const columns = Object.keys(rows[0]);
    const placeholders = rows
      .map(
        (_, rowIdx) =>
          `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`,
      )
      .join(', ');

    const values = rows.flatMap((row) => columns.map((col) => row[col]));
    const sql = `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;

    return this.$executeRaw(sql, ...values);
  }

  async bulkUpsert(
    tableName: string,
    rows: Record<string, unknown>[],
    conflictKeys: string[],
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const columns = Object.keys(rows[0]);
    const updateColumns = columns.filter((c) => !conflictKeys.includes(c));

    let totalAffected = 0;

    // PostgreSQL 支持批量 UPSERT，但为了简化，逐行处理
    for (const row of rows) {
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const values = columns.map((c) => row[c]);
      const conflictClause = conflictKeys.map((k) => `"${k}"`).join(', ');
      const updateClause = updateColumns
        .map((c, i) => `"${c}" = $${columns.length + i + 1}`)
        .join(', ');

      let sql: string;
      let params: unknown[];

      if (updateColumns.length > 0) {
        sql = `
          INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictClause}) DO UPDATE SET ${updateClause}
        `;
        params = [...values, ...updateColumns.map((c) => row[c])];
      } else {
        sql = `
          INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictClause}) DO NOTHING
        `;
        params = values;
      }

      const affected = await this.$executeRaw(sql, ...params);
      totalAffected += affected;
    }

    return totalAffected;
  }

  async getTableData(
    tableName: string,
    options?: { batchSize?: number; offset?: number },
  ): Promise<Record<string, unknown>[]> {
    const batchSize = options?.batchSize || 1000;
    const offset = options?.offset || 0;

    const sql = `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`;
    return this.$queryRaw<Record<string, unknown>[]>(sql, batchSize, offset);
  }

  async getTableRowCount(tableName: string): Promise<number> {
    const result = await this.$queryRaw<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM "${tableName}"`,
    );
    return Number(result[0]?.count || 0);
  }

  async getAllTableNames(): Promise<string[]> {
    const result = await this.$queryRaw<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    return result.map((r) => r.tablename).filter((t) => !t.startsWith('_'));
  }

  /**
   * 获取表对应的模型名
   */
  private getModelNameForTable(tableName: string): string | null {
    for (const [model, table] of Object.entries(HARDCODED_MODEL_TABLE_MAP)) {
      if (table === tableName) {
        return model;
      }
    }
    return null;
  }
}

/**
 * 创建 PostgreSQL 适配器
 */
export function createPostgresAdapter(prisma: PrismaClient): PostgresAdapter {
  return new PostgresAdapter(prisma);
}
