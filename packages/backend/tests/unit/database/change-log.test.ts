/**
 * 变更日志管理器单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import {
  SQLiteChangeLogManager,
  createChangeLogManager,
} from '../../../src/database/sync/change-log';

describe('SQLiteChangeLogManager', () => {
  let db: DatabaseType;
  let manager: SQLiteChangeLogManager;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    manager = createChangeLogManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('初始化', () => {
    it('应该创建变更日志表', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_changelog'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('应该创建索引', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_changelog%'")
        .all();
      expect(indexes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('记录变更', () => {
    it('应该记录 INSERT 操作', async () => {
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1', name: 'test' }),
        timestamp: Date.now(),
        idempotencyKey: 'users:INSERT:1',
      });

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(1);
    });

    it('应该记录 UPDATE 操作', async () => {
      await manager.logChange({
        operation: 'UPDATE',
        tableName: 'users',
        rowId: '1',
        oldData: JSON.stringify({ id: '1', name: 'old' }),
        newData: JSON.stringify({ id: '1', name: 'new' }),
        timestamp: Date.now(),
        idempotencyKey: 'users:UPDATE:1',
      });

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(1);
    });

    it('应该记录 DELETE 操作', async () => {
      await manager.logChange({
        operation: 'DELETE',
        tableName: 'users',
        rowId: '1',
        oldData: JSON.stringify({ id: '1', name: 'test' }),
        newData: null,
        timestamp: Date.now(),
        idempotencyKey: 'users:DELETE:1',
      });

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(1);
    });

    it('重复的幂等键应该被忽略', async () => {
      const entry = {
        operation: 'INSERT' as const,
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now(),
        idempotencyKey: 'unique-key',
      };

      await manager.logChange(entry);
      await manager.logChange(entry); // 重复插入

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(1);
    });
  });

  describe('获取未同步变更', () => {
    beforeEach(async () => {
      // 插入多条测试数据
      for (let i = 1; i <= 5; i++) {
        await manager.logChange({
          operation: 'INSERT',
          tableName: 'users',
          rowId: String(i),
          oldData: null,
          newData: JSON.stringify({ id: i }),
          timestamp: Date.now() + i, // 确保时间戳不同
          idempotencyKey: `users:INSERT:${i}`,
        });
      }
    });

    it('应该返回未同步的变更', async () => {
      const changes = await manager.getUnsyncedChanges();
      expect(changes).toHaveLength(5);
    });

    it('应该按时间戳排序', async () => {
      const changes = await manager.getUnsyncedChanges();
      for (let i = 0; i < changes.length - 1; i++) {
        expect(changes[i].timestamp).toBeLessThanOrEqual(changes[i + 1].timestamp);
      }
    });

    it('应该支持限制返回数量', async () => {
      const changes = await manager.getUnsyncedChanges(3);
      expect(changes).toHaveLength(3);
    });

    it('应该正确映射字段', async () => {
      const changes = await manager.getUnsyncedChanges(1);
      const change = changes[0];

      expect(change.operation).toBe('INSERT');
      expect(change.tableName).toBe('users');
      expect(change.rowId).toBe('1');
      expect(change.synced).toBe(false);
      expect(change.idempotencyKey).toBeDefined();
    });
  });

  describe('标记为已同步', () => {
    it('应该标记变更为已同步', async () => {
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now(),
        idempotencyKey: 'users:INSERT:1',
      });

      const changes = await manager.getUnsyncedChanges();
      await manager.markAsSynced([changes[0].id!]);

      const unsyncedCount = await manager.getUnsyncedCount();
      expect(unsyncedCount).toBe(0);
    });

    it('应该支持批量标记', async () => {
      for (let i = 1; i <= 3; i++) {
        await manager.logChange({
          operation: 'INSERT',
          tableName: 'users',
          rowId: String(i),
          oldData: null,
          newData: JSON.stringify({ id: i }),
          timestamp: Date.now(),
          idempotencyKey: `users:INSERT:${i}`,
        });
      }

      const changes = await manager.getUnsyncedChanges();
      const ids = changes.map((c) => c.id!);
      await manager.markAsSynced(ids);

      const unsyncedCount = await manager.getUnsyncedCount();
      expect(unsyncedCount).toBe(0);
    });
  });

  describe('清理已同步变更', () => {
    it('应该清理指定时间之前的已同步变更', async () => {
      const oldTimestamp = Date.now() - 1000 * 60 * 60; // 1 小时前
      const newTimestamp = Date.now();

      // 旧的已同步变更
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: oldTimestamp,
        idempotencyKey: 'old-key',
      });

      // 新的未同步变更
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '2',
        oldData: null,
        newData: JSON.stringify({ id: '2' }),
        timestamp: newTimestamp,
        idempotencyKey: 'new-key',
      });

      // 标记旧的为已同步
      const changes = await manager.getUnsyncedChanges();
      const oldChange = changes.find((c) => c.rowId === '1');
      if (oldChange) {
        await manager.markAsSynced([oldChange.id!]);
      }

      // 清理 30 分钟前的已同步变更
      const cleaned = await manager.cleanupSyncedChanges(1000 * 60 * 30);

      expect(cleaned).toBe(1);
    });

    it('不应该清理未同步的变更', async () => {
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now() - 1000 * 60 * 60,
        idempotencyKey: 'test-key',
      });

      const cleaned = await manager.cleanupSyncedChanges(0);
      expect(cleaned).toBe(0);

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(1);
    });
  });

  describe('批量记录变更', () => {
    it('应该支持批量记录', async () => {
      const entries = [
        {
          operation: 'INSERT' as const,
          tableName: 'users',
          rowId: '1',
          oldData: null,
          newData: JSON.stringify({ id: '1' }),
          timestamp: Date.now(),
          idempotencyKey: 'batch-1',
        },
        {
          operation: 'INSERT' as const,
          tableName: 'users',
          rowId: '2',
          oldData: null,
          newData: JSON.stringify({ id: '2' }),
          timestamp: Date.now(),
          idempotencyKey: 'batch-2',
        },
        {
          operation: 'INSERT' as const,
          tableName: 'users',
          rowId: '3',
          oldData: null,
          newData: JSON.stringify({ id: '3' }),
          timestamp: Date.now(),
          idempotencyKey: 'batch-3',
        },
      ];

      await manager.logChangeBatch(entries);

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(3);
    });

    it('批量记录时重复的幂等键应该被跳过', async () => {
      const entries = [
        {
          operation: 'INSERT' as const,
          tableName: 'users',
          rowId: '1',
          oldData: null,
          newData: JSON.stringify({ id: '1' }),
          timestamp: Date.now(),
          idempotencyKey: 'same-key',
        },
        {
          operation: 'INSERT' as const,
          tableName: 'users',
          rowId: '2',
          oldData: null,
          newData: JSON.stringify({ id: '2' }),
          timestamp: Date.now(),
          idempotencyKey: 'same-key', // 重复
        },
      ];

      await manager.logChangeBatch(entries);

      const count = await manager.getUnsyncedCount();
      expect(count).toBe(1);
    });
  });

  describe('按表名获取变更', () => {
    beforeEach(async () => {
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now(),
        idempotencyKey: 'users:1',
      });

      await manager.logChange({
        operation: 'INSERT',
        tableName: 'orders',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now(),
        idempotencyKey: 'orders:1',
      });
    });

    it('应该只返回指定表的变更', async () => {
      const userChanges = await manager.getUnsyncedChangesByTable('users');
      expect(userChanges).toHaveLength(1);
      expect(userChanges[0].tableName).toBe('users');
    });
  });

  describe('统计信息', () => {
    beforeEach(async () => {
      // 创建混合数据
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now(),
        idempotencyKey: 'users:INSERT:1',
      });

      await manager.logChange({
        operation: 'UPDATE',
        tableName: 'users',
        rowId: '1',
        oldData: JSON.stringify({ id: '1' }),
        newData: JSON.stringify({ id: '1', updated: true }),
        timestamp: Date.now(),
        idempotencyKey: 'users:UPDATE:1',
      });

      await manager.logChange({
        operation: 'DELETE',
        tableName: 'orders',
        rowId: '1',
        oldData: JSON.stringify({ id: '1' }),
        newData: null,
        timestamp: Date.now(),
        idempotencyKey: 'orders:DELETE:1',
      });

      // 标记一条为已同步
      const changes = await manager.getUnsyncedChanges(1);
      await manager.markAsSynced([changes[0].id!]);
    });

    it('应该返回正确的统计数据', async () => {
      const stats = await manager.getStats();

      expect(stats.totalChanges).toBe(3);
      expect(stats.unsyncedChanges).toBe(2);
      expect(stats.syncedChanges).toBe(1);
    });

    it('应该按表名统计未同步变更', async () => {
      const stats = await manager.getStats();

      expect(stats.changesByTable.users).toBe(1);
      expect(stats.changesByTable.orders).toBe(1);
    });

    it('应该按操作类型统计未同步变更', async () => {
      const stats = await manager.getStats();

      // 第一条 INSERT 已同步，所以 INSERT = 0
      expect(stats.changesByOperation.UPDATE).toBe(1);
      expect(stats.changesByOperation.DELETE).toBe(1);
    });
  });

  describe('事务支持', () => {
    it('应该正确记录事务 ID', async () => {
      await manager.logChange({
        operation: 'INSERT',
        tableName: 'users',
        rowId: '1',
        oldData: null,
        newData: JSON.stringify({ id: '1' }),
        timestamp: Date.now(),
        idempotencyKey: 'tx-test',
        txId: 'tx-123',
        txSeq: 1,
        txCommitted: true,
      });

      const changes = await manager.getUnsyncedChanges();
      expect(changes[0].txId).toBe('tx-123');
      expect(changes[0].txSeq).toBe(1);
      expect(changes[0].txCommitted).toBe(true);
    });
  });
});
