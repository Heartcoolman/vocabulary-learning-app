/**
 * 冲突解决器
 *
 * 处理 SQLite 和 PostgreSQL 之间的数据冲突
 * 支持多种冲突解决策略
 */

import { ConflictRecord, SyncConfig } from '../adapters/types';

// ============================================
// 类型定义
// ============================================

/**
 * 冲突解决策略
 */
export type ConflictStrategy = 'sqlite_wins' | 'postgres_wins' | 'manual' | 'version_based';

/**
 * 冲突检测结果
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: 'concurrent_update' | 'version_mismatch' | 'data_divergence';
  sqliteVersion?: number;
  postgresVersion?: number;
  sqliteUpdatedAt?: Date;
  postgresUpdatedAt?: Date;
}

/**
 * 冲突解决结果
 */
export interface ConflictResolutionResult {
  resolved: boolean;
  winner: 'sqlite' | 'postgres' | 'merged' | 'manual';
  finalData: Record<string, unknown>;
  conflictRecord?: ConflictRecord;
}

// ============================================
// 冲突解决器
// ============================================

/**
 * 冲突解决器
 */
export class ConflictResolver {
  private strategy: ConflictStrategy;
  private conflictRecords: Map<string, ConflictRecord> = new Map();

  constructor(strategy: ConflictStrategy = 'sqlite_wins') {
    this.strategy = strategy;
  }

  /**
   * 设置冲突解决策略
   */
  setStrategy(strategy: ConflictStrategy): void {
    this.strategy = strategy;
  }

  /**
   * 获取当前策略
   */
  getStrategy(): ConflictStrategy {
    return this.strategy;
  }

  /**
   * 检测冲突
   */
  detectConflict(
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown> | null,
  ): ConflictDetectionResult {
    // 如果 PG 中不存在数据，没有冲突
    if (!postgresData) {
      return { hasConflict: false };
    }

    // 检查版本号冲突
    const sqliteVersion = sqliteData.version as number | undefined;
    const postgresVersion = postgresData.version as number | undefined;

    if (sqliteVersion !== undefined && postgresVersion !== undefined) {
      if (sqliteVersion !== postgresVersion) {
        return {
          hasConflict: true,
          conflictType: 'version_mismatch',
          sqliteVersion,
          postgresVersion,
        };
      }
    }

    // 检查更新时间冲突
    const sqliteUpdatedAt = sqliteData.updatedAt as Date | string | undefined;
    const postgresUpdatedAt = postgresData.updatedAt as Date | string | undefined;

    if (sqliteUpdatedAt && postgresUpdatedAt) {
      const sqliteTime = new Date(sqliteUpdatedAt).getTime();
      const postgresTime = new Date(postgresUpdatedAt).getTime();

      // 如果 PG 的数据比 SQLite 新，说明 PG 恢复后有新写入
      if (postgresTime > sqliteTime) {
        return {
          hasConflict: true,
          conflictType: 'concurrent_update',
          sqliteUpdatedAt: new Date(sqliteUpdatedAt),
          postgresUpdatedAt: new Date(postgresUpdatedAt),
        };
      }
    }

    // 检查数据实际差异
    const hasDataDivergence = this.hasDataDivergence(sqliteData, postgresData);
    if (hasDataDivergence) {
      return {
        hasConflict: true,
        conflictType: 'data_divergence',
      };
    }

    return { hasConflict: false };
  }

  /**
   * 检查数据是否有实质性差异
   */
  private hasDataDivergence(
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown>,
  ): boolean {
    // 忽略元数据字段
    const ignoreFields = ['createdAt', 'updatedAt', 'version'];

    for (const [key, sqliteValue] of Object.entries(sqliteData)) {
      if (ignoreFields.includes(key)) continue;

      const postgresValue = postgresData[key];

      // 深度比较
      if (!this.deepEqual(sqliteValue, postgresValue)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 深度相等比较
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (a === null || b === null) return a === b;
    if (a === undefined || b === undefined) return a === b;

    // 处理 Date
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    if (a instanceof Date || b instanceof Date) {
      const aTime = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
      const bTime = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
      return aTime === bTime;
    }

    // 处理数组
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    // 处理对象
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object);
      const bKeys = Object.keys(b as object);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (
          !this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
        ) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * 解决冲突
   */
  resolveConflict(
    tableName: string,
    rowId: string,
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown>,
  ): ConflictResolutionResult {
    const detection = this.detectConflict(sqliteData, postgresData);

    if (!detection.hasConflict) {
      return {
        resolved: true,
        winner: 'sqlite',
        finalData: sqliteData,
      };
    }

    switch (this.strategy) {
      case 'sqlite_wins':
        return this.resolveSqliteWins(tableName, rowId, sqliteData, postgresData);

      case 'postgres_wins':
        return this.resolvePostgresWins(tableName, rowId, sqliteData, postgresData);

      case 'version_based':
        return this.resolveVersionBased(tableName, rowId, sqliteData, postgresData);

      case 'manual':
        return this.resolveManual(tableName, rowId, sqliteData, postgresData);

      default:
        return this.resolveSqliteWins(tableName, rowId, sqliteData, postgresData);
    }
  }

  /**
   * SQLite 优先策略
   */
  private resolveSqliteWins(
    tableName: string,
    rowId: string,
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown>,
  ): ConflictResolutionResult {
    // SQLite 数据覆盖 PG
    // 但保留 PG 的 createdAt（如果存在）
    const finalData = { ...sqliteData };
    if (postgresData.createdAt && !sqliteData.createdAt) {
      finalData.createdAt = postgresData.createdAt;
    }

    // 递增版本号
    if (typeof finalData.version === 'number') {
      finalData.version = Math.max(finalData.version, (postgresData.version as number) || 0) + 1;
    }

    return {
      resolved: true,
      winner: 'sqlite',
      finalData,
    };
  }

  /**
   * PostgreSQL 优先策略
   */
  private resolvePostgresWins(
    tableName: string,
    rowId: string,
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown>,
  ): ConflictResolutionResult {
    // 记录被覆盖的 SQLite 数据
    const conflictRecord: ConflictRecord = {
      id: `${tableName}:${rowId}:${Date.now()}`,
      tableName,
      rowId,
      sqliteData,
      postgresData,
      resolvedAt: Date.now(),
      resolution: 'postgres_wins',
    };

    this.conflictRecords.set(conflictRecord.id, conflictRecord);

    return {
      resolved: true,
      winner: 'postgres',
      finalData: postgresData,
      conflictRecord,
    };
  }

  /**
   * 版本号策略
   */
  private resolveVersionBased(
    tableName: string,
    rowId: string,
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown>,
  ): ConflictResolutionResult {
    const sqliteVersion = (sqliteData.version as number) || 0;
    const postgresVersion = (postgresData.version as number) || 0;

    if (sqliteVersion >= postgresVersion) {
      return this.resolveSqliteWins(tableName, rowId, sqliteData, postgresData);
    } else {
      return this.resolvePostgresWins(tableName, rowId, sqliteData, postgresData);
    }
  }

  /**
   * 手动策略（记录冲突，不自动解决）
   */
  private resolveManual(
    tableName: string,
    rowId: string,
    sqliteData: Record<string, unknown>,
    postgresData: Record<string, unknown>,
  ): ConflictResolutionResult {
    const conflictRecord: ConflictRecord = {
      id: `${tableName}:${rowId}:${Date.now()}`,
      tableName,
      rowId,
      sqliteData,
      postgresData,
      resolvedAt: null,
      resolution: null,
    };

    this.conflictRecords.set(conflictRecord.id, conflictRecord);

    return {
      resolved: false,
      winner: 'manual',
      finalData: sqliteData, // 临时使用 SQLite 数据
      conflictRecord,
    };
  }

  /**
   * 获取未解决的冲突
   */
  getUnresolvedConflicts(): ConflictRecord[] {
    return Array.from(this.conflictRecords.values()).filter((record) => record.resolvedAt === null);
  }

  /**
   * 获取所有冲突记录
   */
  getAllConflicts(): ConflictRecord[] {
    return Array.from(this.conflictRecords.values());
  }

  /**
   * 手动解决冲突
   */
  manualResolve(
    conflictId: string,
    resolution: 'sqlite_wins' | 'postgres_wins',
    customData?: Record<string, unknown>,
  ): ConflictResolutionResult | null {
    const conflict = this.conflictRecords.get(conflictId);
    if (!conflict) {
      return null;
    }

    conflict.resolvedAt = Date.now();
    conflict.resolution = resolution;

    let finalData: Record<string, unknown>;

    if (customData) {
      finalData = customData;
    } else if (resolution === 'sqlite_wins') {
      finalData = conflict.sqliteData;
    } else {
      finalData = conflict.postgresData;
    }

    return {
      resolved: true,
      winner: resolution === 'sqlite_wins' ? 'sqlite' : 'postgres',
      finalData,
      conflictRecord: conflict,
    };
  }

  /**
   * 清除已解决的冲突记录
   */
  clearResolvedConflicts(): number {
    let cleared = 0;
    for (const [id, record] of this.conflictRecords.entries()) {
      if (record.resolvedAt !== null) {
        this.conflictRecords.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * 获取冲突统计
   */
  getStats(): {
    totalConflicts: number;
    unresolvedConflicts: number;
    resolvedConflicts: number;
    conflictsByTable: Record<string, number>;
    conflictsByResolution: Record<string, number>;
  } {
    const conflicts = Array.from(this.conflictRecords.values());

    const conflictsByTable: Record<string, number> = {};
    const conflictsByResolution: Record<string, number> = {
      sqlite_wins: 0,
      postgres_wins: 0,
      manual: 0,
      pending: 0,
    };

    for (const conflict of conflicts) {
      conflictsByTable[conflict.tableName] = (conflictsByTable[conflict.tableName] || 0) + 1;

      if (conflict.resolution) {
        conflictsByResolution[conflict.resolution]++;
      } else {
        conflictsByResolution.pending++;
      }
    }

    return {
      totalConflicts: conflicts.length,
      unresolvedConflicts: conflicts.filter((c) => c.resolvedAt === null).length,
      resolvedConflicts: conflicts.filter((c) => c.resolvedAt !== null).length,
      conflictsByTable,
      conflictsByResolution,
    };
  }
}

/**
 * 创建冲突解决器
 */
export function createConflictResolver(
  strategy: ConflictStrategy = 'sqlite_wins',
): ConflictResolver {
  return new ConflictResolver(strategy);
}
