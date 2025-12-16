/**
 * 冲突解决器单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConflictResolver,
  createConflictResolver,
  ConflictStrategy,
} from '../../../src/database/sync/conflict-resolver';

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = createConflictResolver('sqlite_wins');
  });

  describe('策略管理', () => {
    it('应该使用默认策略 sqlite_wins', () => {
      expect(resolver.getStrategy()).toBe('sqlite_wins');
    });

    it('应该允许更改策略', () => {
      resolver.setStrategy('postgres_wins');
      expect(resolver.getStrategy()).toBe('postgres_wins');
    });

    it.each<ConflictStrategy>(['sqlite_wins', 'postgres_wins', 'version_based', 'manual'])(
      '应该支持策略: %s',
      (strategy) => {
        resolver.setStrategy(strategy);
        expect(resolver.getStrategy()).toBe(strategy);
      },
    );
  });

  describe('冲突检测', () => {
    it('PG 数据不存在时不应该检测到冲突', () => {
      const sqliteData = { id: '1', name: 'test' };
      const result = resolver.detectConflict(sqliteData, null);
      expect(result.hasConflict).toBe(false);
    });

    it('版本号不同时应该检测到冲突', () => {
      const sqliteData = { id: '1', name: 'test', version: 2 };
      const postgresData = { id: '1', name: 'test', version: 1 };

      const result = resolver.detectConflict(sqliteData, postgresData);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('version_mismatch');
      expect(result.sqliteVersion).toBe(2);
      expect(result.postgresVersion).toBe(1);
    });

    it('PG 更新时间较新时应该检测到并发更新冲突', () => {
      const now = Date.now();
      const sqliteData = {
        id: '1',
        name: 'test',
        updatedAt: new Date(now - 1000),
      };
      const postgresData = {
        id: '1',
        name: 'test',
        updatedAt: new Date(now),
      };

      const result = resolver.detectConflict(sqliteData, postgresData);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('concurrent_update');
    });

    it('数据字段不同时应该检测到数据分歧', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const result = resolver.detectConflict(sqliteData, postgresData);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('data_divergence');
    });

    it('数据完全相同时不应该检测到冲突', () => {
      const sqliteData = { id: '1', name: 'test', value: 100 };
      const postgresData = { id: '1', name: 'test', value: 100 };

      const result = resolver.detectConflict(sqliteData, postgresData);

      expect(result.hasConflict).toBe(false);
    });

    it('元数据字段差异不应该检测为冲突', () => {
      const sqliteData = {
        id: '1',
        name: 'test',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };
      const postgresData = {
        id: '1',
        name: 'test',
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-01'),
      };

      const result = resolver.detectConflict(sqliteData, postgresData);

      expect(result.hasConflict).toBe(false);
    });
  });

  describe('SQLite 优先策略', () => {
    beforeEach(() => {
      resolver.setStrategy('sqlite_wins');
    });

    it('应该使用 SQLite 数据作为最终结果', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('sqlite');
      expect(result.finalData.name).toBe('sqlite_name');
    });

    it('应该保留 PG 的 createdAt（当存在数据分歧时）', () => {
      const pgCreatedAt = new Date('2024-01-01');
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name', createdAt: pgCreatedAt };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.finalData.createdAt).toEqual(pgCreatedAt);
    });

    it('应该递增版本号', () => {
      const sqliteData = { id: '1', name: 'test', version: 3 };
      const postgresData = { id: '1', name: 'test', version: 5 };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.finalData.version).toBe(6); // max(3, 5) + 1
    });
  });

  describe('PostgreSQL 优先策略', () => {
    beforeEach(() => {
      resolver.setStrategy('postgres_wins');
    });

    it('应该使用 PG 数据作为最终结果', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('postgres');
      expect(result.finalData.name).toBe('postgres_name');
    });

    it('应该记录被覆盖的 SQLite 数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.conflictRecord).toBeDefined();
      expect(result.conflictRecord?.sqliteData).toEqual(sqliteData);
      expect(result.conflictRecord?.resolution).toBe('postgres_wins');
    });
  });

  describe('版本号策略', () => {
    beforeEach(() => {
      resolver.setStrategy('version_based');
    });

    it('SQLite 版本号较高时应该使用 SQLite 数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name', version: 5 };
      const postgresData = { id: '1', name: 'postgres_name', version: 3 };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.winner).toBe('sqlite');
      expect(result.finalData.name).toBe('sqlite_name');
    });

    it('PG 版本号较高时应该使用 PG 数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name', version: 2 };
      const postgresData = { id: '1', name: 'postgres_name', version: 5 };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.winner).toBe('postgres');
      expect(result.finalData.name).toBe('postgres_name');
    });

    it('版本号相同时应该使用 SQLite 数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name', version: 3 };
      const postgresData = { id: '1', name: 'postgres_name', version: 3 };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.winner).toBe('sqlite');
    });
  });

  describe('手动策略', () => {
    beforeEach(() => {
      resolver.setStrategy('manual');
    });

    it('应该记录冲突但不自动解决', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const result = resolver.resolveConflict('users', '1', sqliteData, postgresData);

      expect(result.resolved).toBe(false);
      expect(result.winner).toBe('manual');
      expect(result.conflictRecord?.resolvedAt).toBeNull();
    });

    it('应该将冲突添加到未解决列表', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      resolver.resolveConflict('users', '1', sqliteData, postgresData);

      const unresolved = resolver.getUnresolvedConflicts();
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].tableName).toBe('users');
    });
  });

  describe('手动解决冲突', () => {
    beforeEach(() => {
      resolver.setStrategy('manual');
    });

    it('应该允许手动选择 SQLite 数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const conflictResult = resolver.resolveConflict('users', '1', sqliteData, postgresData);
      const conflictId = conflictResult.conflictRecord!.id;

      const resolveResult = resolver.manualResolve(conflictId, 'sqlite_wins');

      expect(resolveResult?.resolved).toBe(true);
      expect(resolveResult?.winner).toBe('sqlite');
      expect(resolveResult?.finalData.name).toBe('sqlite_name');
    });

    it('应该允许手动选择 PG 数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const conflictResult = resolver.resolveConflict('users', '1', sqliteData, postgresData);
      const conflictId = conflictResult.conflictRecord!.id;

      const resolveResult = resolver.manualResolve(conflictId, 'postgres_wins');

      expect(resolveResult?.resolved).toBe(true);
      expect(resolveResult?.winner).toBe('postgres');
      expect(resolveResult?.finalData.name).toBe('postgres_name');
    });

    it('应该允许使用自定义数据', () => {
      const sqliteData = { id: '1', name: 'sqlite_name' };
      const postgresData = { id: '1', name: 'postgres_name' };

      const conflictResult = resolver.resolveConflict('users', '1', sqliteData, postgresData);
      const conflictId = conflictResult.conflictRecord!.id;

      const customData = { id: '1', name: 'merged_name' };
      const resolveResult = resolver.manualResolve(conflictId, 'sqlite_wins', customData);

      expect(resolveResult?.finalData.name).toBe('merged_name');
    });

    it('对于不存在的冲突 ID 应该返回 null', () => {
      const result = resolver.manualResolve('non-existent-id', 'sqlite_wins');
      expect(result).toBeNull();
    });
  });

  describe('冲突记录管理', () => {
    it('getAllConflicts 应该返回所有冲突', () => {
      resolver.setStrategy('manual');

      // 确保数据存在差异以触发冲突
      resolver.resolveConflict('users', '1', { id: '1', name: 'a' }, { id: '1', name: 'b' });
      resolver.resolveConflict('orders', '2', { id: '2', value: 100 }, { id: '2', value: 200 });

      const all = resolver.getAllConflicts();
      expect(all).toHaveLength(2);
    });

    it('clearResolvedConflicts 应该清除已解决的冲突', () => {
      resolver.setStrategy('manual');

      // 确保数据存在差异以触发冲突
      const result = resolver.resolveConflict(
        'users',
        '1',
        { id: '1', name: 'a' },
        { id: '1', name: 'b' },
      );
      expect(result.conflictRecord).toBeDefined();
      resolver.manualResolve(result.conflictRecord!.id, 'sqlite_wins');

      const cleared = resolver.clearResolvedConflicts();
      expect(cleared).toBe(1);
      expect(resolver.getAllConflicts()).toHaveLength(0);
    });
  });

  describe('统计信息', () => {
    beforeEach(() => {
      resolver.setStrategy('manual');
    });

    it('应该正确统计冲突数量', () => {
      // 确保数据存在实际差异以触发冲突
      resolver.resolveConflict('users', '1', { id: '1', name: 'a' }, { id: '1', name: 'b' });
      resolver.resolveConflict('users', '2', { id: '2', value: 1 }, { id: '2', value: 2 });
      resolver.resolveConflict(
        'orders',
        '3',
        { id: '3', status: 'pending' },
        { id: '3', status: 'done' },
      );

      const stats = resolver.getStats();

      expect(stats.totalConflicts).toBe(3);
      expect(stats.unresolvedConflicts).toBe(3);
      expect(stats.resolvedConflicts).toBe(0);
    });

    it('应该按表名统计冲突', () => {
      // 确保数据存在实际差异以触发冲突
      resolver.resolveConflict('users', '1', { id: '1', name: 'a' }, { id: '1', name: 'b' });
      resolver.resolveConflict('users', '2', { id: '2', value: 1 }, { id: '2', value: 2 });
      resolver.resolveConflict(
        'orders',
        '3',
        { id: '3', status: 'pending' },
        { id: '3', status: 'done' },
      );

      const stats = resolver.getStats();

      expect(stats.conflictsByTable.users).toBe(2);
      expect(stats.conflictsByTable.orders).toBe(1);
    });

    it('应该按解决方式统计冲突', () => {
      // 确保数据存在实际差异以触发冲突
      const result1 = resolver.resolveConflict(
        'users',
        '1',
        { id: '1', name: 'a' },
        { id: '1', name: 'b' },
      );
      const result2 = resolver.resolveConflict(
        'users',
        '2',
        { id: '2', value: 1 },
        { id: '2', value: 2 },
      );
      resolver.resolveConflict(
        'orders',
        '3',
        { id: '3', status: 'pending' },
        { id: '3', status: 'done' },
      );

      expect(result1.conflictRecord).toBeDefined();
      expect(result2.conflictRecord).toBeDefined();

      resolver.manualResolve(result1.conflictRecord!.id, 'sqlite_wins');
      resolver.manualResolve(result2.conflictRecord!.id, 'postgres_wins');

      const stats = resolver.getStats();

      expect(stats.conflictsByResolution.sqlite_wins).toBe(1);
      expect(stats.conflictsByResolution.postgres_wins).toBe(1);
      expect(stats.conflictsByResolution.pending).toBe(1);
    });
  });

  describe('无冲突情况', () => {
    it('数据相同时应该直接返回 SQLite 数据', () => {
      const data = { id: '1', name: 'test' };

      const result = resolver.resolveConflict('users', '1', data, data);

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('sqlite');
      expect(result.finalData).toEqual(data);
    });
  });
});
