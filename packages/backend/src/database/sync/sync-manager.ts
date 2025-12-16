/**
 * 同步管理器
 *
 * 负责在 PostgreSQL 恢复后将 SQLite 变更回灌到 PG
 * 实现批量同步、断点续传、错误重试
 *
 * 关键特性：
 * - 按全局时间戳顺序同步（保证外键依赖正确）
 * - manual 冲突策略下不自动标记为已同步
 */

import { EventEmitter } from 'events';
import {
  DatabaseAdapter,
  ChangeLogEntry,
  SyncResult,
  SyncStatus,
  SyncConfig,
} from '../adapters/types';
import { SQLiteChangeLogManager } from './change-log';
import { ConflictResolver, ConflictResolutionResult } from './conflict-resolver';
import { schemaRegistry } from '../schema/schema-generator';
import { sqliteValueToPrisma } from '../schema/type-mapper';

// ============================================
// SQL注入防护
// ============================================

/**
 * 验证标识符（表名、列名）是否安全
 * 只允许字母、数字、下划线，且必须以字母或下划线开头
 */
function isValidIdentifier(name: string): boolean {
  // PostgreSQL 标识符规则：以字母或下划线开头，后续可以是字母、数字、下划线
  // 最大长度 63 字节
  const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return identifierRegex.test(name) && name.length <= 63;
}

/**
 * 验证表名是否在已注册的 schema 白名单中
 */
function validateTableName(tableName: string): void {
  // 首先检查基本格式
  if (!isValidIdentifier(tableName)) {
    throw new Error(`Invalid table name format: ${tableName}`);
  }

  // 然后检查是否在 schema registry 的白名单中
  const schema = schemaRegistry.getByTableName(tableName);
  if (!schema) {
    throw new Error(`Table name not in whitelist: ${tableName}`);
  }
}

/**
 * 验证列名是否在指定表的 schema 白名单中
 */
function validateColumnName(tableName: string, columnName: string): void {
  // 首先检查基本格式
  if (!isValidIdentifier(columnName)) {
    throw new Error(`Invalid column name format: ${columnName}`);
  }

  // 然后检查是否在表的 schema 白名单中
  const schema = schemaRegistry.getByTableName(tableName);
  if (!schema) {
    throw new Error(`Table name not in whitelist: ${tableName}`);
  }

  const validColumns = schema.fields.map((f) => f.name);
  if (!validColumns.includes(columnName)) {
    throw new Error(`Column name "${columnName}" not in whitelist for table "${tableName}"`);
  }
}

/**
 * 验证多个列名
 */
function validateColumnNames(tableName: string, columnNames: string[]): void {
  for (const columnName of columnNames) {
    validateColumnName(tableName, columnName);
  }
}

/**
 * 安全地转义SQL字符串值
 * 使用参数化查询的转义规则
 */
function escapeSqlString(value: string): string {
  // 替换所有可能导致SQL注入的字符
  return value
    .replace(/\\/g, '\\\\') // 反斜杠
    .replace(/'/g, "''") // 单引号
    .replace(/\x00/g, '\\0') // NULL字节
    .replace(/\n/g, '\\n') // 换行
    .replace(/\r/g, '\\r') // 回车
    .replace(/\x1a/g, '\\Z'); // Ctrl+Z
}

// ============================================
// 类型定义
// ============================================

/**
 * 同步事件
 */
export interface SyncManagerEvents {
  'sync-started': () => void;
  'sync-progress': (progress: { processed: number; total: number; table: string }) => void;
  'sync-completed': (result: SyncResult) => void;
  'sync-failed': (error: Error) => void;
  'conflict-detected': (conflict: ConflictResolutionResult) => void;
  'conflict-pending': (conflict: { changeId: number; tableName: string; rowId: string }) => void;
  'batch-completed': (batchSize: number, table: string) => void;
}

/**
 * 同步进度
 */
export interface SyncProgress {
  startTime: number;
  processedCount: number;
  totalCount: number;
  currentTable: string | null;
  errors: Array<{ changeId: number; error: string }>;
  conflicts: number;
  pendingConflicts: number;
}

// ============================================
// 同步管理器
// ============================================

/**
 * 同步管理器
 */
export class SyncManager extends EventEmitter {
  private primaryAdapter: DatabaseAdapter;
  private fallbackAdapter: DatabaseAdapter;
  private changeLogManager: SQLiteChangeLogManager;
  private conflictResolver: ConflictResolver;
  private config: SyncConfig;

  private syncInProgress = false;
  private lastSyncTime: number | null = null;
  private lastError: string | null = null;
  private currentProgress: SyncProgress | null = null;

  // 未解决的冲突列表
  private pendingConflicts: Set<number> = new Set();

  constructor(
    primaryAdapter: DatabaseAdapter,
    fallbackAdapter: DatabaseAdapter,
    changeLogManager: SQLiteChangeLogManager,
    conflictResolver: ConflictResolver,
    config: SyncConfig,
  ) {
    super();
    this.primaryAdapter = primaryAdapter;
    this.fallbackAdapter = fallbackAdapter;
    this.changeLogManager = changeLogManager;
    this.conflictResolver = conflictResolver;
    this.config = config;
  }

  /**
   * 执行同步
   * 按全局时间戳顺序处理变更（保证外键依赖正确）
   */
  async sync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        syncedCount: 0,
        conflictCount: 0,
        errors: [{ changeId: 0, error: 'Sync already in progress' }],
        duration: 0,
      };
    }

    this.syncInProgress = true;
    this.emit('sync-started');

    const startTime = Date.now();
    const errors: Array<{ changeId: number; error: string }> = [];
    let syncedCount = 0;
    let conflictCount = 0;
    let pendingConflictCount = 0;

    this.currentProgress = {
      startTime,
      processedCount: 0,
      totalCount: await this.changeLogManager.getUnsyncedCount(),
      currentTable: null,
      errors: [],
      conflicts: 0,
      pendingConflicts: 0,
    };

    try {
      // 按批次处理变更，保持全局时间戳顺序
      while (true) {
        const changes = await this.changeLogManager.getUnsyncedChanges(this.config.batchSize);

        if (changes.length === 0) {
          break;
        }

        // 按时间戳顺序处理（getUnsyncedChanges 已经排序）
        const result = await this.syncChangesInOrder(changes);
        syncedCount += result.synced;
        conflictCount += result.conflicts;
        pendingConflictCount += result.pendingConflicts;
        errors.push(...result.errors);

        this.currentProgress.processedCount += changes.length;
        this.currentProgress.errors = errors;
        this.currentProgress.conflicts = conflictCount;
        this.currentProgress.pendingConflicts = pendingConflictCount;

        this.emit('sync-progress', {
          processed: this.currentProgress.processedCount,
          total: this.currentProgress.totalCount,
          table: 'mixed',
        });

        this.emit('batch-completed', changes.length, 'mixed');
      }

      this.lastSyncTime = Date.now();
      this.lastError = null;

      const result: SyncResult = {
        success: errors.length === 0 && pendingConflictCount === 0,
        syncedCount,
        conflictCount,
        errors,
        duration: Date.now() - startTime,
      };

      this.emit('sync-completed', result);
      return result;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit('sync-failed', error as Error);

      return {
        success: false,
        syncedCount,
        conflictCount,
        errors: [...errors, { changeId: 0, error: this.lastError }],
        duration: Date.now() - startTime,
      };
    } finally {
      this.syncInProgress = false;
      this.currentProgress = null;
    }
  }

  /**
   * 按时间戳顺序同步变更
   */
  private async syncChangesInOrder(
    changes: ChangeLogEntry[],
  ): Promise<{
    synced: number;
    conflicts: number;
    pendingConflicts: number;
    errors: Array<{ changeId: number; error: string }>;
  }> {
    const errors: Array<{ changeId: number; error: string }> = [];
    const syncedIds: number[] = [];
    let conflicts = 0;
    let pendingConflicts = 0;

    // 按时间戳顺序处理每个变更
    for (const change of changes) {
      // 跳过已经是未解决冲突的变更
      if (change.id !== undefined && this.pendingConflicts.has(change.id)) {
        continue;
      }

      let retryCount = 0;
      let success = false;
      let shouldMarkSynced = true;

      while (retryCount < this.config.retryCount && !success) {
        try {
          this.currentProgress!.currentTable = change.tableName;
          const result = await this.applyChange(change.tableName, change);

          if (result.conflict) {
            conflicts++;
            this.emit('conflict-detected', result.conflictResult!);

            // 检查是否是未解决的 manual 冲突
            if (result.conflictResult && !result.conflictResult.resolved) {
              pendingConflicts++;
              shouldMarkSynced = false;

              // 记录未解决的冲突
              if (change.id !== undefined) {
                this.pendingConflicts.add(change.id);
              }

              this.emit('conflict-pending', {
                changeId: change.id || 0,
                tableName: change.tableName,
                rowId: change.rowId,
              });
            }
          }

          // 只有成功同步或已解决冲突时才标记为已同步
          if (shouldMarkSynced && change.id !== undefined) {
            syncedIds.push(change.id);
          }
          success = true;
        } catch (error) {
          retryCount++;

          if (retryCount >= this.config.retryCount) {
            errors.push({
              changeId: change.id || 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    // 批量标记为已同步
    if (syncedIds.length > 0) {
      await this.changeLogManager.markAsSynced(syncedIds);
    }

    return {
      synced: syncedIds.length,
      conflicts,
      pendingConflicts,
      errors,
    };
  }

  /**
   * 按表分组变更（保留用于向后兼容）
   * @deprecated 使用 syncChangesInOrder 代替
   */
  private groupChangesByTable(changes: ChangeLogEntry[]): Record<string, ChangeLogEntry[]> {
    const grouped: Record<string, ChangeLogEntry[]> = {};

    for (const change of changes) {
      if (!grouped[change.tableName]) {
        grouped[change.tableName] = [];
      }
      grouped[change.tableName].push(change);
    }

    return grouped;
  }

  /**
   * 应用单个变更
   */
  private async applyChange(
    tableName: string,
    change: ChangeLogEntry,
  ): Promise<{ success: boolean; conflict: boolean; conflictResult?: ConflictResolutionResult }> {
    const rowId = JSON.parse(change.rowId) as Record<string, unknown>;

    // 检查是否是批量操作的汇总条目
    if (rowId._batch === true) {
      return this.applyBatchChange(tableName, change, rowId);
    }

    const schema = schemaRegistry.getByTableName(tableName);

    switch (change.operation) {
      case 'INSERT':
        return this.applyInsert(tableName, change, rowId, schema);

      case 'UPDATE':
        return this.applyUpdate(tableName, change, rowId, schema);

      case 'DELETE':
        return this.applyDelete(tableName, rowId);

      default:
        throw new Error(`Unknown operation: ${change.operation}`);
    }
  }

  /**
   * 应用批量变更（汇总条目）
   */
  private async applyBatchChange(
    tableName: string,
    change: ChangeLogEntry,
    rowId: Record<string, unknown>,
  ): Promise<{ success: boolean; conflict: boolean }> {
    // SQL注入防护：验证表名
    validateTableName(tableName);

    const where = rowId.where as Record<string, unknown>;
    const schema = schemaRegistry.getByTableName(tableName);

    // SQL注入防护：验证 where 条件中的列名
    const whereColumnNames = Object.keys(where);
    validateColumnNames(tableName, whereColumnNames);

    if (change.operation === 'UPDATE' && change.newData) {
      const batchData = JSON.parse(change.newData) as {
        _batch: boolean;
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      const updateData = this.convertToPgFormat(batchData.data, schema);

      // SQL注入防护：验证 update 数据中的列名
      const updateColumnNames = Object.keys(updateData);
      validateColumnNames(tableName, updateColumnNames);

      // 使用 updateMany 等效操作
      const whereClause = Object.entries(where)
        .map(([key, value]) => `"${key}" = ${this.formatValue(value)}`)
        .join(' AND ');

      const setClause = Object.entries(updateData)
        .map(([key, value]) => `"${key}" = ${this.formatValue(value)}`)
        .join(', ');

      await this.primaryAdapter.$executeRaw(
        `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`,
      );
    } else if (change.operation === 'DELETE') {
      const whereClause = Object.entries(where)
        .map(([key, value]) => `"${key}" = ${this.formatValue(value)}`)
        .join(' AND ');

      await this.primaryAdapter.$executeRaw(`DELETE FROM "${tableName}" WHERE ${whereClause}`);
    }

    return { success: true, conflict: false };
  }

  /**
   * 应用 INSERT 变更
   */
  private async applyInsert(
    tableName: string,
    change: ChangeLogEntry,
    rowId: Record<string, unknown>,
    schema: ReturnType<typeof schemaRegistry.getByTableName>,
  ): Promise<{ success: boolean; conflict: boolean; conflictResult?: ConflictResolutionResult }> {
    if (!change.newData) {
      throw new Error('INSERT change missing newData');
    }

    const newData = JSON.parse(change.newData) as Record<string, unknown>;

    // 转换 SQLite 数据为 PG 格式
    const pgData = this.convertToPgFormat(newData, schema);

    // 检查是否已存在
    const existing = await this.findExistingRow(tableName, rowId);

    if (existing) {
      // 已存在，检测冲突
      const conflictResult = this.conflictResolver.resolveConflict(
        tableName,
        JSON.stringify(rowId),
        newData,
        existing,
      );

      if (!conflictResult.resolved) {
        return { success: true, conflict: true, conflictResult };
      }

      // 使用解决后的数据更新
      await this.primaryAdapter.bulkUpsert(
        tableName,
        [this.convertToPgFormat(conflictResult.finalData, schema)],
        Object.keys(rowId),
      );

      return { success: true, conflict: true, conflictResult };
    }

    // 不存在，直接插入
    await this.primaryAdapter.bulkInsert(tableName, [pgData]);
    return { success: true, conflict: false };
  }

  /**
   * 应用 UPDATE 变更
   */
  private async applyUpdate(
    tableName: string,
    change: ChangeLogEntry,
    rowId: Record<string, unknown>,
    schema: ReturnType<typeof schemaRegistry.getByTableName>,
  ): Promise<{ success: boolean; conflict: boolean; conflictResult?: ConflictResolutionResult }> {
    if (!change.newData) {
      throw new Error('UPDATE change missing newData');
    }

    const newData = JSON.parse(change.newData) as Record<string, unknown>;

    // 获取 PG 中的当前数据
    const existing = await this.findExistingRow(tableName, rowId);

    if (existing) {
      // 检测冲突
      const conflictResult = this.conflictResolver.resolveConflict(
        tableName,
        JSON.stringify(rowId),
        newData,
        existing,
      );

      if (!conflictResult.resolved) {
        return { success: true, conflict: true, conflictResult };
      }

      // 使用解决后的数据更新
      await this.primaryAdapter.bulkUpsert(
        tableName,
        [this.convertToPgFormat(conflictResult.finalData, schema)],
        Object.keys(rowId),
      );

      return {
        success: true,
        conflict: conflictResult.winner !== 'sqlite',
        conflictResult: conflictResult.winner !== 'sqlite' ? conflictResult : undefined,
      };
    }

    // 不存在，作为 INSERT 处理
    await this.primaryAdapter.bulkInsert(tableName, [this.convertToPgFormat(newData, schema)]);
    return { success: true, conflict: false };
  }

  /**
   * 应用 DELETE 变更
   */
  private async applyDelete(
    tableName: string,
    rowId: Record<string, unknown>,
  ): Promise<{ success: boolean; conflict: boolean }> {
    // SQL注入防护：验证表名和列名
    validateTableName(tableName);
    const columnNames = Object.keys(rowId);
    validateColumnNames(tableName, columnNames);

    // 构建删除条件
    const whereClause = Object.entries(rowId)
      .map(([key, value]) => `"${key}" = ${this.formatValue(value)}`)
      .join(' AND ');

    await this.primaryAdapter.$executeRaw(`DELETE FROM "${tableName}" WHERE ${whereClause}`);

    return { success: true, conflict: false };
  }

  /**
   * 查找现有行
   */
  private async findExistingRow(
    tableName: string,
    rowId: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    // SQL注入防护：验证表名和列名
    validateTableName(tableName);
    const columnNames = Object.keys(rowId);
    validateColumnNames(tableName, columnNames);

    const whereClause = Object.entries(rowId)
      .map(([key, value]) => `"${key}" = ${this.formatValue(value)}`)
      .join(' AND ');

    const result = await this.primaryAdapter.$queryRaw<Array<Record<string, unknown>>>(
      `SELECT * FROM "${tableName}" WHERE ${whereClause} LIMIT 1`,
    );

    return result.length > 0 ? result[0] : null;
  }

  /**
   * 格式化 SQL 值（使用安全的转义方法）
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      // 验证数字是有效的，防止 NaN 或 Infinity
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid numeric value: ${value}`);
      }
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'string') {
      // 使用更安全的转义函数
      return `'${escapeSqlString(value)}'`;
    }
    if (value instanceof Date) {
      // Date.toISOString() 是安全的，不包含可注入字符
      return `'${value.toISOString()}'`;
    }
    // 对于其他类型（如对象），转换为 JSON 并转义
    return `'${escapeSqlString(JSON.stringify(value))}'`;
  }

  /**
   * 转换为 PG 格式
   */
  private convertToPgFormat(
    data: Record<string, unknown>,
    schema: ReturnType<typeof schemaRegistry.getByTableName>,
  ): Record<string, unknown> {
    if (!schema) {
      return data;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const field = schema.fields.find((f) => f.name === key);
      if (field) {
        result[key] = sqliteValueToPrisma(value, field.prismaType);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return {
      lastSyncTime: this.lastSyncTime,
      pendingChanges: this.pendingConflicts.size,
      syncInProgress: this.syncInProgress,
      lastError: this.lastError,
    };
  }

  /**
   * 获取同步进度
   */
  getProgress(): SyncProgress | null {
    return this.currentProgress;
  }

  /**
   * 获取未解决的冲突数量
   */
  getPendingConflictCount(): number {
    return this.pendingConflicts.size;
  }

  /**
   * 标记冲突已手动解决
   */
  markConflictResolved(changeId: number): void {
    this.pendingConflicts.delete(changeId);
  }

  /**
   * 清除所有未解决的冲突标记
   */
  clearPendingConflicts(): void {
    this.pendingConflicts.clear();
  }

  /**
   * 检查是否有待同步的变更
   */
  async hasPendingChanges(): Promise<boolean> {
    const count = await this.changeLogManager.getUnsyncedCount();
    return count > 0;
  }

  /**
   * 获取待同步变更计数
   */
  async getPendingCount(): Promise<number> {
    return this.changeLogManager.getUnsyncedCount();
  }

  /**
   * 清理已同步的旧变更日志
   */
  async cleanupOldChanges(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    return this.changeLogManager.cleanupSyncedChanges(olderThanMs);
  }

  /**
   * 是否正在同步
   */
  isSyncing(): boolean {
    return this.syncInProgress;
  }
}

/**
 * 创建同步管理器
 */
export function createSyncManager(
  primaryAdapter: DatabaseAdapter,
  fallbackAdapter: DatabaseAdapter,
  changeLogManager: SQLiteChangeLogManager,
  conflictResolver: ConflictResolver,
  config: SyncConfig,
): SyncManager {
  return new SyncManager(
    primaryAdapter,
    fallbackAdapter,
    changeLogManager,
    conflictResolver,
    config,
  );
}
