/**
 * 变更日志系统
 *
 * 在降级模式下记录所有写入操作
 * 用于 PostgreSQL 恢复后的数据同步
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import { ChangeLogEntry, ChangeOperation, ChangeLogManager } from '../adapters/types';

// ============================================
// 变更日志管理器实现
// ============================================

/**
 * SQLite 变更日志管理器
 */
export class SQLiteChangeLogManager implements ChangeLogManager {
  private db: DatabaseType;
  private insertStmt!: ReturnType<DatabaseType['prepare']>;
  private selectUnsyncedStmt!: ReturnType<DatabaseType['prepare']>;
  private markSyncedStmt!: ReturnType<DatabaseType['prepare']>;
  private cleanupStmt!: ReturnType<DatabaseType['prepare']>;
  private countUnsyncedStmt!: ReturnType<DatabaseType['prepare']>;

  constructor(db: DatabaseType) {
    this.db = db;
    this.ensureTable();
    this.prepareStatements();
  }

  /**
   * 确保变更日志表存在
   */
  private ensureTable(): void {
    this.db.exec(`
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
    `);
  }

  /**
   * 预编译语句
   */
  private prepareStatements(): void {
    this.insertStmt = this.db.prepare(`
      INSERT INTO "_changelog" (
        "operation", "table_name", "row_id", "old_data", "new_data",
        "timestamp", "idempotency_key", "tx_id", "tx_seq", "tx_committed"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectUnsyncedStmt = this.db.prepare(`
      SELECT * FROM "_changelog"
      WHERE "synced" = 0
      ORDER BY "timestamp" ASC, "id" ASC
      LIMIT ?
    `);

    this.markSyncedStmt = this.db.prepare(`
      UPDATE "_changelog" SET "synced" = 1 WHERE "id" = ?
    `);

    this.cleanupStmt = this.db.prepare(`
      DELETE FROM "_changelog"
      WHERE "synced" = 1 AND "timestamp" < ?
    `);

    this.countUnsyncedStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM "_changelog" WHERE "synced" = 0
    `);
  }

  /**
   * 记录变更
   */
  async logChange(entry: Omit<ChangeLogEntry, 'id' | 'synced'>): Promise<void> {
    try {
      (this.insertStmt.run as (...args: unknown[]) => unknown)(
        entry.operation,
        entry.tableName,
        entry.rowId,
        entry.oldData,
        entry.newData,
        entry.timestamp,
        entry.idempotencyKey,
        entry.txId || null,
        entry.txSeq || null,
        entry.txCommitted ? 1 : 0,
      );
    } catch (error) {
      // 如果是重复的幂等键，忽略错误
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return;
      }
      throw error;
    }
  }

  /**
   * 获取未同步的变更
   */
  async getUnsyncedChanges(limit: number = 100): Promise<ChangeLogEntry[]> {
    const rows = this.selectUnsyncedStmt.all(limit) as Array<{
      id: number;
      operation: string;
      table_name: string;
      row_id: string;
      old_data: string | null;
      new_data: string | null;
      timestamp: number;
      synced: number;
      idempotency_key: string;
      tx_id: string | null;
      tx_seq: number | null;
      tx_committed: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      operation: row.operation as ChangeOperation,
      tableName: row.table_name,
      rowId: row.row_id,
      oldData: row.old_data,
      newData: row.new_data,
      timestamp: row.timestamp,
      synced: row.synced === 1,
      idempotencyKey: row.idempotency_key,
      txId: row.tx_id || undefined,
      txSeq: row.tx_seq || undefined,
      txCommitted: row.tx_committed === 1,
    }));
  }

  /**
   * 标记变更为已同步
   */
  async markAsSynced(ids: number[]): Promise<void> {
    const transaction = this.db.transaction((idList: number[]) => {
      for (const id of idList) {
        this.markSyncedStmt.run(id);
      }
    });

    transaction(ids);
  }

  /**
   * 清理已同步的旧变更
   */
  async cleanupSyncedChanges(olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;
    const result = this.cleanupStmt.run(cutoffTime);
    return result.changes;
  }

  /**
   * 获取未同步变更计数
   */
  async getUnsyncedCount(): Promise<number> {
    const result = (this.countUnsyncedStmt.get as () => { count: number })();
    return result.count;
  }

  /**
   * 批量记录变更（事务内）
   */
  async logChangeBatch(entries: Array<Omit<ChangeLogEntry, 'id' | 'synced'>>): Promise<void> {
    const transaction = this.db.transaction(
      (items: Array<Omit<ChangeLogEntry, 'id' | 'synced'>>) => {
        for (const entry of items) {
          try {
            (this.insertStmt.run as (...args: unknown[]) => unknown)(
              entry.operation,
              entry.tableName,
              entry.rowId,
              entry.oldData,
              entry.newData,
              entry.timestamp,
              entry.idempotencyKey,
              entry.txId || null,
              entry.txSeq || null,
              entry.txCommitted ? 1 : 0,
            );
          } catch (error) {
            if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
              continue;
            }
            throw error;
          }
        }
      },
    );

    transaction(entries);
  }

  /**
   * 获取特定表的未同步变更
   */
  async getUnsyncedChangesByTable(
    tableName: string,
    limit: number = 100,
  ): Promise<ChangeLogEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM "_changelog"
      WHERE "synced" = 0 AND "table_name" = ?
      ORDER BY "timestamp" ASC, "id" ASC
      LIMIT ?
    `);

    const rows = stmt.all(tableName, limit) as Array<{
      id: number;
      operation: string;
      table_name: string;
      row_id: string;
      old_data: string | null;
      new_data: string | null;
      timestamp: number;
      synced: number;
      idempotency_key: string;
      tx_id: string | null;
      tx_seq: number | null;
      tx_committed: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      operation: row.operation as ChangeOperation,
      tableName: row.table_name,
      rowId: row.row_id,
      oldData: row.old_data,
      newData: row.new_data,
      timestamp: row.timestamp,
      synced: row.synced === 1,
      idempotencyKey: row.idempotency_key,
      txId: row.tx_id || undefined,
      txSeq: row.tx_seq || undefined,
      txCommitted: row.tx_committed === 1,
    }));
  }

  /**
   * 获取变更统计
   */
  async getStats(): Promise<{
    totalChanges: number;
    unsyncedChanges: number;
    syncedChanges: number;
    changesByTable: Record<string, number>;
    changesByOperation: Record<ChangeOperation, number>;
  }> {
    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM "_changelog"').get() as {
      count: number;
    };
    const unsyncedResult = this.db
      .prepare('SELECT COUNT(*) as count FROM "_changelog" WHERE "synced" = 0')
      .get() as { count: number };

    const byTableResult = this.db
      .prepare(
        `
      SELECT "table_name", COUNT(*) as count
      FROM "_changelog"
      WHERE "synced" = 0
      GROUP BY "table_name"
    `,
      )
      .all() as Array<{ table_name: string; count: number }>;

    const byOpResult = this.db
      .prepare(
        `
      SELECT "operation", COUNT(*) as count
      FROM "_changelog"
      WHERE "synced" = 0
      GROUP BY "operation"
    `,
      )
      .all() as Array<{ operation: string; count: number }>;

    const changesByTable: Record<string, number> = {};
    for (const row of byTableResult) {
      changesByTable[row.table_name] = row.count;
    }

    const changesByOperation: Record<ChangeOperation, number> = {
      INSERT: 0,
      UPDATE: 0,
      DELETE: 0,
    };
    for (const row of byOpResult) {
      changesByOperation[row.operation as ChangeOperation] = row.count;
    }

    return {
      totalChanges: totalResult.count,
      unsyncedChanges: unsyncedResult.count,
      syncedChanges: totalResult.count - unsyncedResult.count,
      changesByTable,
      changesByOperation,
    };
  }
}

/**
 * 创建变更日志管理器
 */
export function createChangeLogManager(db: DatabaseType): SQLiteChangeLogManager {
  return new SQLiteChangeLogManager(db);
}
