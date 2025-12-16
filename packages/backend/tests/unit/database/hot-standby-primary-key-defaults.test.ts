/**
 * 热备主键默认值一致性测试
 *
 * 目标：
 * - 主库写入时补齐主键默认值（uuid / now），确保 PostgreSQL 与 SQLite 主键一致
 * - 降级模式（SQLite）下不要求业务层显式提供 id，也能正常写入并记录变更
 *
 * 这类能力是“主库离线 → 备库顶上 → 主库恢复 → 回切同步”的基础，否则：
 * - SQLite 侧写入会因缺失主键而失败（TEXT PRIMARY KEY 无默认）
 * - 或主备主键不一致，回切同步会产生重复/冲突数据
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { DatabaseAdapter } from '../../../src/database/adapters/types';
import { createSQLiteAdapter } from '../../../src/database/adapters/sqlite-adapter';
import { createDualWriteManager } from '../../../src/database/proxy/dual-write-manager';
import { schemaRegistry } from '../../../src/database/schema/schema-generator';

function createSqliteFallback(): ReturnType<typeof createSQLiteAdapter> {
  const adapter = createSQLiteAdapter({
    path: ':memory:',
    journalMode: 'WAL',
    synchronous: 'NORMAL',
    busyTimeout: 5000,
    cacheSize: -64000,
    foreignKeys: true,
  });
  adapter.connectSync();
  adapter.initializeSchemaSync();
  return adapter;
}

function createPrimaryAdapterMock(): DatabaseAdapter {
  const model = {
    create: vi.fn(async (args: unknown) => (args as { data: Record<string, unknown> }).data),
  };

  return {
    type: 'postgresql',
    isConnected: () => true,
    connect: async () => undefined,
    disconnect: async () => undefined,
    healthCheck: async () => ({ healthy: true, latency: 1 }),
    getModel: () => model,
    $transaction: async () => {
      throw new Error('Not used in this test');
    },
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    bulkInsert: async () => 0,
    bulkUpsert: async () => 0,
    getTableData: async () => [],
    getTableRowCount: async () => 0,
    getAllTableNames: async () => [],
  } as unknown as DatabaseAdapter;
}

describe('Hot-standby primary key defaults', () => {
  beforeAll(() => {
    // 最小 schema：只注册本测试用到的模型
    // 注意：schemaRegistry 是全局单例，避免在单测中 clear() 以降低并发测试互相影响的风险。
    schemaRegistry.register([
      {
        tableName: 'users',
        modelName: 'User',
        fields: [
          { name: 'id', prismaType: 'String', isArray: false, isOptional: false, hasDefault: true },
          {
            name: 'email',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'passwordHash',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'username',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
        ],
        primaryKey: ['id'],
        uniqueKeys: [['email']],
      },
      {
        tableName: 'answer_records',
        modelName: 'AnswerRecord',
        fields: [
          { name: 'id', prismaType: 'String', isArray: false, isOptional: false, hasDefault: true },
          {
            name: 'timestamp',
            prismaType: 'DateTime',
            isArray: false,
            isOptional: false,
            hasDefault: true,
          },
          {
            name: 'userId',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'wordId',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'selectedAnswer',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'correctAnswer',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'isCorrect',
            prismaType: 'Boolean',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
        ],
        primaryKey: ['id', 'timestamp'],
        uniqueKeys: [['userId', 'wordId', 'timestamp']],
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('NORMAL:create 缺失 id 时，应该补齐并同步写入 SQLite', async () => {
    const primary = createPrimaryAdapterMock();
    const fallback = createSqliteFallback();

    const manager = createDualWriteManager(primary, fallback, undefined, {
      syncWriteToFallback: true,
    });

    const result = await manager.write<{ id: string; email: string; username: string }>({
      type: 'create',
      model: 'User',
      args: {
        data: {
          email: 'a@b.com',
          passwordHash: 'hash',
          username: 'alice',
        },
      },
      operationId: manager.generateOperationId(),
    });

    expect(result.success).toBe(true);
    expect(result.writtenTo).toBe('both');
    expect(typeof result.data?.id).toBe('string');
    expect(result.data?.id.length).toBeGreaterThan(10);

    const row = await fallback
      .getModel<{ id: string; email: string; username: string }>('User')
      .findUnique({
        where: { id: result.data!.id },
      });
    expect(row).not.toBeNull();
    expect(row?.email).toBe('a@b.com');
    expect(row?.username).toBe('alice');
  });

  it('NORMAL:create 复合主键缺失 timestamp 时，应该补齐并保持主备一致', async () => {
    const primary = createPrimaryAdapterMock();
    const fallback = createSqliteFallback();

    const manager = createDualWriteManager(primary, fallback, undefined, {
      syncWriteToFallback: true,
    });

    const result = await manager.write<{ id: string; timestamp: Date; userId: string }>({
      type: 'create',
      model: 'AnswerRecord',
      args: {
        data: {
          userId: 'user-1',
          wordId: 'word-1',
          selectedAnswer: 'A',
          correctAnswer: 'A',
          isCorrect: true,
        },
      },
      operationId: manager.generateOperationId(),
    });

    expect(result.success).toBe(true);
    expect(result.writtenTo).toBe('both');
    expect(typeof result.data?.id).toBe('string');
    expect(result.data?.timestamp instanceof Date).toBe(true);

    const row = await fallback
      .getModel<{ id: string; timestamp: Date }>('AnswerRecord')
      .findUnique({
        where: { id: result.data!.id, timestamp: result.data!.timestamp },
      });

    expect(row).not.toBeNull();
    expect(row?.timestamp instanceof Date).toBe(true);
    expect(row!.timestamp.getTime()).toBe(result.data!.timestamp.getTime());
  });
});
