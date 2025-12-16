/**
 * 数据库适配器接口定义
 *
 * 提供 PostgreSQL 和 SQLite 的统一抽象层
 * 支持热备切换时的无缝数据库操作
 */

import { Prisma, PrismaClient } from '@prisma/client';

/**
 * PrismaClient 的模型属性名称列表
 * 用于从 PrismaClient 中提取模型类型
 */
type PrismaModelNames =
  | 'user'
  | 'wordBook'
  | 'word'
  | 'answerRecord'
  | 'session'
  | 'userStudyConfig'
  | 'wordLearningState'
  | 'wordScore'
  | 'algorithmConfig'
  | 'configHistory'
  | 'anomalyFlag'
  | 'amasUserState'
  | 'amasUserModel'
  | 'learningSession'
  | 'featureVector'
  | 'habitProfile'
  | 'rewardQueue'
  | 'userStateHistory'
  | 'badgeDefinition'
  | 'userBadge'
  | 'learningPlan'
  | 'aBExperiment'
  | 'aBVariant'
  | 'aBUserAssignment'
  | 'aBExperimentMetrics'
  | 'bayesianOptimizerState'
  | 'causalObservation'
  | 'wordReviewTrace'
  | 'decisionRecord'
  | 'decisionInsight'
  | 'pipelineStage'
  | 'word_frequency'
  | 'systemLog'
  | 'logAlertRule'
  | 'lLMAdvisorSuggestion'
  | 'suggestionEffectTracking'
  | 'userLearningObjectives'
  | 'objectiveHistory'
  | 'userLearningProfile'
  | 'forgettingAlert'
  | 'wordContext'
  | 'notification'
  | 'userPreference'
  | 'visualFatigueRecord'
  | 'userVisualFatigueConfig'
  | 'userInteractionStats'
  | 'userTrackingEvent'
  | 'wordQualityCheck'
  | 'wordContentIssue'
  | 'wordContentVariant'
  | 'lLMAnalysisTask'
  | 'systemWeeklyReport'
  | 'userBehaviorInsight'
  | 'alertRootCauseAnalysis';

/**
 * DatabaseProxy 扩展方法接口
 * 包含 DatabaseProxy 特有的方法
 */
export interface DatabaseProxyExtensions {
  getState(): DatabaseState;
  getHealthStatus(): DatabaseHealthStatus;
  getMetrics(): DatabaseMetrics;
  getPrimaryAdapter(): DatabaseAdapter;
  getFallbackAdapter(): DatabaseAdapter;
  initialize(): Promise<void>;
  close(): Promise<void>;
  triggerSync(): Promise<SyncResult>;
  tryReconnectPrimary(): Promise<{ success: boolean; error?: string }>;
  forceRecoveryCheck(): Promise<{ recovered: boolean; syncResult?: SyncResult; error?: string }>;
  getPendingSyncCount(): Promise<number>;
  isInitialized(): boolean;
}

/**
 * DatabaseProxy 接口
 * 继承 PrismaClient 的模型类型以保持类型推断
 */
export interface DatabaseProxyInterface
  extends
    Pick<
      PrismaClient,
      | PrismaModelNames
      | '$connect'
      | '$disconnect'
      | '$transaction'
      | '$queryRaw'
      | '$queryRawUnsafe'
      | '$executeRaw'
      | '$executeRawUnsafe'
      | '$on'
      | '$use'
      | '$extends'
    >,
    DatabaseProxyExtensions {}

/**
 * 数据库客户端类型
 * 支持 PrismaClient 和 DatabaseProxy 的联合类型
 * 由于 DatabaseProxyInterface 继承了 PrismaClient 的模型类型，类型推断将正常工作
 */
export type DatabaseClient = PrismaClient | DatabaseProxyInterface;

// ============================================
// 数据库状态
// ============================================

/**
 * 数据库运行状态
 *
 * - NORMAL: 正常模式，使用 PostgreSQL 主库
 * - DEGRADED: 降级模式，主库故障，使用 SQLite 备库
 * - SYNCING: 同步模式，主库恢复，正在从 SQLite 同步数据
 * - UNAVAILABLE: 不可用模式，主备库都无法使用（极端情况）
 */
export type DatabaseState = 'NORMAL' | 'DEGRADED' | 'SYNCING' | 'UNAVAILABLE';

/**
 * 数据库类型
 */
export type DatabaseType = 'postgresql' | 'sqlite';

// ============================================
// 查询参数类型
// ============================================

/**
 * 通用查询参数
 */
export interface QueryArgs {
  where?: Record<string, unknown>;
  select?: Record<string, boolean | object>;
  include?: Record<string, boolean | object>;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  take?: number;
  skip?: number;
  cursor?: Record<string, unknown>;
  distinct?: string[];
}

/**
 * 创建参数
 */
export interface CreateArgs<T = Record<string, unknown>> {
  data: T;
  select?: Record<string, boolean | object>;
  include?: Record<string, boolean | object>;
}

/**
 * 更新参数
 */
export interface UpdateArgs<T = Record<string, unknown>> {
  where: Record<string, unknown>;
  data: T;
  select?: Record<string, boolean | object>;
  include?: Record<string, boolean | object>;
}

/**
 * Upsert 参数
 */
export interface UpsertArgs<T = Record<string, unknown>> {
  where: Record<string, unknown>;
  create: T;
  update: T;
  select?: Record<string, boolean | object>;
  include?: Record<string, boolean | object>;
}

/**
 * 删除参数
 */
export interface DeleteArgs {
  where: Record<string, unknown>;
  select?: Record<string, boolean | object>;
  include?: Record<string, boolean | object>;
}

/**
 * 批量创建参数
 */
export interface CreateManyArgs<T = Record<string, unknown>> {
  data: T[];
  skipDuplicates?: boolean;
}

/**
 * 批量更新参数
 */
export interface UpdateManyArgs<T = Record<string, unknown>> {
  where: Record<string, unknown>;
  data: T;
}

/**
 * 批量删除参数
 */
export interface DeleteManyArgs {
  where?: Record<string, unknown>;
}

/**
 * 聚合参数
 */
export interface AggregateArgs {
  where?: Record<string, unknown>;
  _count?: boolean | Record<string, boolean>;
  _sum?: Record<string, boolean>;
  _avg?: Record<string, boolean>;
  _min?: Record<string, boolean>;
  _max?: Record<string, boolean>;
}

/**
 * 分组参数
 */
export interface GroupByArgs {
  by: string[];
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>[];
  having?: Record<string, unknown>;
  take?: number;
  skip?: number;
  _count?: boolean | Record<string, boolean>;
  _sum?: Record<string, boolean>;
  _avg?: Record<string, boolean>;
  _min?: Record<string, boolean>;
  _max?: Record<string, boolean>;
}

// ============================================
// 模型适配器接口
// ============================================

/**
 * Prisma 模型适配器接口
 * 提供与 PrismaClient 兼容的数据库操作方法
 */
export interface ModelAdapter<T = unknown> {
  /**
   * 查找唯一记录
   */
  findUnique(args: {
    where: Record<string, unknown>;
    select?: Record<string, boolean | object>;
    include?: Record<string, boolean | object>;
  }): Promise<T | null>;

  /**
   * 查找第一条匹配记录
   */
  findFirst(args?: QueryArgs): Promise<T | null>;

  /**
   * 查找所有匹配记录
   */
  findMany(args?: QueryArgs): Promise<T[]>;

  /**
   * 创建记录
   */
  create(args: CreateArgs): Promise<T>;

  /**
   * 批量创建记录
   */
  createMany(args: CreateManyArgs): Promise<{ count: number }>;

  /**
   * 更新记录
   */
  update(args: UpdateArgs): Promise<T>;

  /**
   * 批量更新记录
   */
  updateMany(args: UpdateManyArgs): Promise<{ count: number }>;

  /**
   * 创建或更新记录
   */
  upsert(args: UpsertArgs): Promise<T>;

  /**
   * 删除记录
   */
  delete(args: DeleteArgs): Promise<T>;

  /**
   * 批量删除记录
   */
  deleteMany(args?: DeleteManyArgs): Promise<{ count: number }>;

  /**
   * 计数
   */
  count(args?: { where?: Record<string, unknown> }): Promise<number>;

  /**
   * 聚合查询
   */
  aggregate(args: AggregateArgs): Promise<Record<string, unknown>>;

  /**
   * 分组查询
   */
  groupBy(args: GroupByArgs): Promise<Array<Record<string, unknown>>>;
}

// ============================================
// 数据库适配器接口
// ============================================

/**
 * 事务客户端接口
 */
export interface TransactionClient {
  /**
   * 获取模型适配器
   */
  getModel<T = unknown>(modelName: string): ModelAdapter<T>;

  /**
   * 执行原始 SQL 查询
   */
  $queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T>;

  /**
   * 执行原始 SQL 命令
   */
  $executeRaw(query: string, ...params: unknown[]): Promise<number>;
}

/**
 * 数据库适配器接口
 * 定义 PostgreSQL 和 SQLite 适配器必须实现的方法
 */
export interface DatabaseAdapter {
  /**
   * 数据库类型
   */
  readonly type: DatabaseType;

  /**
   * 是否已连接
   */
  isConnected(): boolean;

  /**
   * 连接数据库
   */
  connect(): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 健康检查
   */
  healthCheck(timeoutMs?: number): Promise<{ healthy: boolean; latency?: number; error?: string }>;

  /**
   * 获取模型适配器
   */
  getModel<T = unknown>(modelName: string): ModelAdapter<T>;

  /**
   * 执行事务
   */
  $transaction<T>(
    fn: (client: TransactionClient) => Promise<T>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;

  /**
   * 执行原始 SQL 查询
   */
  $queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T>;

  /**
   * 执行原始 SQL 命令
   */
  $executeRaw(query: string, ...params: unknown[]): Promise<number>;

  /**
   * 批量插入数据（用于同步）
   */
  bulkInsert(tableName: string, rows: Record<string, unknown>[]): Promise<number>;

  /**
   * 批量更新数据（用于同步）
   */
  bulkUpsert(
    tableName: string,
    rows: Record<string, unknown>[],
    conflictKeys: string[],
  ): Promise<number>;

  /**
   * 获取表的所有数据（用于同步）
   */
  getTableData(
    tableName: string,
    options?: { batchSize?: number; offset?: number },
  ): Promise<Record<string, unknown>[]>;

  /**
   * 获取表的行数
   */
  getTableRowCount(tableName: string): Promise<number>;

  /**
   * 获取所有表名
   */
  getAllTableNames(): Promise<string[]>;

  /**
   * 初始化 Schema（仅 SQLite 需要）
   */
  initializeSchema?(): Promise<void>;
}

// ============================================
// 变更日志类型
// ============================================

/**
 * 变更操作类型
 */
export type ChangeOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * 变更日志记录
 */
export interface ChangeLogEntry {
  id?: number;
  operation: ChangeOperation;
  tableName: string;
  rowId: string; // JSON 字符串，支持复合主键
  oldData: string | null; // JSON 字符串
  newData: string | null; // JSON 字符串
  timestamp: number;
  synced: boolean;
  idempotencyKey: string;
  txId?: string; // 事务 ID
  txSeq?: number; // 事务内序号
  txCommitted?: boolean; // 事务是否已提交
}

/**
 * 变更日志管理器接口
 */
export interface ChangeLogManager {
  /**
   * 记录变更
   */
  logChange(entry: Omit<ChangeLogEntry, 'id' | 'synced'>): Promise<void>;

  /**
   * 获取未同步的变更
   */
  getUnsyncedChanges(limit?: number): Promise<ChangeLogEntry[]>;

  /**
   * 标记变更为已同步
   */
  markAsSynced(ids: number[]): Promise<void>;

  /**
   * 清理已同步的旧变更
   */
  cleanupSyncedChanges(olderThanMs: number): Promise<number>;

  /**
   * 获取未同步变更计数
   */
  getUnsyncedCount(): Promise<number>;
}

// ============================================
// 同步相关类型
// ============================================

/**
 * 同步状态
 */
export interface SyncStatus {
  lastSyncTime: number | null;
  pendingChanges: number;
  syncInProgress: boolean;
  lastError: string | null;
}

/**
 * 冲突记录
 */
export interface ConflictRecord {
  id: string;
  tableName: string;
  rowId: string;
  sqliteData: Record<string, unknown>;
  postgresData: Record<string, unknown>;
  resolvedAt: number | null;
  resolution: 'sqlite_wins' | 'postgres_wins' | 'manual' | null;
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  syncedCount: number;
  conflictCount: number;
  errors: Array<{ changeId: number; error: string }>;
  duration: number;
}

// ============================================
// 健康检查相关类型
// ============================================

/**
 * 数据库健康状态
 */
export interface DatabaseHealthStatus {
  state: DatabaseState;
  primary: {
    type: 'postgresql';
    healthy: boolean;
    latency?: number;
    consecutiveFailures: number;
  };
  fallback: {
    type: 'sqlite';
    healthy: boolean;
    latency?: number;
    syncStatus: SyncStatus;
  };
  lastStateChange: number;
  uptime: number;
}

/**
 * 数据库指标
 */
export interface DatabaseMetrics {
  state: DatabaseState;
  primaryHealthy: boolean;
  fallbackHealthy: boolean;
  pendingSyncChanges: number;
  totalQueries: number;
  failedQueries: number;
  averageLatency: number;
  stateChanges: number;
  lastStateChangeTime: number | null;
}

// ============================================
// 配置类型
// ============================================

/**
 * SQLite 配置
 */
export interface SQLiteConfig {
  path: string;
  journalMode?: 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF';
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  busyTimeout?: number;
  cacheSize?: number;
  foreignKeys?: boolean;
}

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  intervalMs: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  minRecoveryIntervalMs: number;
}

/**
 * 同步配置
 */
export interface SyncConfig {
  batchSize: number;
  retryCount: number;
  conflictStrategy: 'sqlite_wins' | 'postgres_wins' | 'manual';
  syncOnStartup: boolean;
}

/**
 * Fencing 配置
 */
export interface FencingConfig {
  enabled: boolean;
  lockKey: string;
  lockTtlMs: number;
  renewIntervalMs: number;
  /**
   * 当 Redis 不可用时是否拒绝获取锁
   *
   * - true: 严格模式，Redis 不可用时拒绝获取锁（防止 Split-Brain）
   * - false: 宽松模式，Redis 不可用时回退到单实例模式（默认行为，兼容旧版本）
   *
   * 生产环境多实例部署时强烈建议设置为 true
   */
  failOnRedisUnavailable?: boolean;
}

/**
 * 数据库代理配置
 */
export interface DatabaseProxyConfig {
  sqlite: SQLiteConfig;
  healthCheck: HealthCheckConfig;
  sync: SyncConfig;
  fencing: FencingConfig;
}
