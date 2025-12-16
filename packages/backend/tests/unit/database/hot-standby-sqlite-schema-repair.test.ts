/**
 * SQLite 热备 schema 漂移自愈测试
 *
 * 覆盖两类线上典型故障：
 * 1) 历史表缺失新列（例如 reward_queue 缺 dueTs/answerRecordId/idempotencyKey）
 * 2) 历史表存在“已移除字段”的 NOT NULL 约束（例如 reward_queue.actionType/scheduledAt）
 * 3) @updatedAt 列在历史表中缺失 DEFAULT，导致 create 触发 NOT NULL 失败（user_learning_objectives.updatedAt）
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createSQLiteAdapter } from '../../../src/database/adapters/sqlite-adapter';
import { schemaRegistry } from '../../../src/database/schema/schema-generator';

function createInMemorySqlite() {
  const adapter = createSQLiteAdapter({
    path: ':memory:',
    journalMode: 'WAL',
    synchronous: 'NORMAL',
    busyTimeout: 5000,
    cacheSize: -64000,
    foreignKeys: true,
  });
  adapter.connectSync();
  return adapter;
}

describe('Hot-standby SQLite schema repair', () => {
  beforeAll(() => {
    // 只注册本测试涉及的模型，避免引入 Prisma.dmmf 依赖
    schemaRegistry.register([
      {
        tableName: 'reward_queue',
        modelName: 'RewardQueue',
        fields: [
          {
            name: 'id',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: { name: 'uuid(4)', args: [] },
          },
          {
            name: 'sessionId',
            prismaType: 'String',
            isArray: false,
            isOptional: true,
            hasDefault: false,
          },
          {
            name: 'userId',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'dueTs',
            prismaType: 'DateTime',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'reward',
            prismaType: 'Float',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'status',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 'PENDING',
          },
          {
            name: 'idempotencyKey',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'lastError',
            prismaType: 'String',
            isArray: false,
            isOptional: true,
            hasDefault: false,
          },
          {
            name: 'answerRecordId',
            prismaType: 'String',
            isArray: false,
            isOptional: true,
            hasDefault: false,
          },
          {
            name: 'createdAt',
            prismaType: 'DateTime',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: { name: 'now', args: [] },
          },
          {
            name: 'updatedAt',
            prismaType: 'DateTime',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            isUpdatedAt: true,
          },
        ],
        primaryKey: ['id'],
        uniqueKeys: [['idempotencyKey']],
      },
      {
        tableName: 'user_learning_objectives',
        modelName: 'UserLearningObjectives',
        fields: [
          {
            name: 'id',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: { name: 'uuid(4)', args: [] },
          },
          {
            name: 'userId',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'mode',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 'daily',
          },
          {
            name: 'primaryObjective',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 'accuracy',
          },
          {
            name: 'minAccuracy',
            prismaType: 'Float',
            isArray: false,
            isOptional: true,
            hasDefault: false,
          },
          {
            name: 'weightShortTerm',
            prismaType: 'Float',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 0.4,
          },
          {
            name: 'weightLongTerm',
            prismaType: 'Float',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 0.4,
          },
          {
            name: 'weightEfficiency',
            prismaType: 'Float',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 0.2,
          },
          {
            name: 'createdAt',
            prismaType: 'DateTime',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: { name: 'now', args: [] },
          },
          {
            name: 'updatedAt',
            prismaType: 'DateTime',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            isUpdatedAt: true,
          },
        ],
        primaryKey: ['id'],
        uniqueKeys: [['userId']],
      },
    ]);
  });

  it('ensureSchemaCompatible: 应补齐 reward_queue 缺失列，并兼容旧 NOT NULL 列', async () => {
    const adapter = createInMemorySqlite();

    // 模拟旧表结构（与用户线上 fallback.db 一致）
    adapter.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS "reward_queue" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "wordId" TEXT,
        "sessionId" TEXT,
        "actionType" TEXT NOT NULL,
        "payload" TEXT,
        "status" TEXT DEFAULT 'pending',
        "scheduledAt" TEXT NOT NULL,
        "processedAt" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    await adapter.ensureSchemaCompatible();

    const columns = await adapter.$queryRaw<Array<{ name: string }>>(
      'PRAGMA table_info("reward_queue")',
    );
    const columnNames = new Set(columns.map((c) => c.name));

    // 新 schema 必需列存在
    expect(columnNames.has('dueTs')).toBe(true);
    expect(columnNames.has('reward')).toBe(true);
    expect(columnNames.has('idempotencyKey')).toBe(true);
    expect(columnNames.has('updatedAt')).toBe(true);
    expect(columnNames.has('answerRecordId')).toBe(true);

    // 写入新字段（不提供旧字段 actionType/scheduledAt），应由适配层自动补齐并成功写入
    const dueTs = new Date('2025-12-16T15:04:15.720Z');
    const row = await adapter.getModel<Record<string, unknown>>('RewardQueue').create({
      data: {
        userId: 'user-1',
        sessionId: 'sess-1',
        dueTs,
        reward: 0.777225,
        status: 'PENDING',
        idempotencyKey: 'user-1:sess-1:1765811055720',
        answerRecordId: 'ar-1',
      },
    });

    expect(typeof row.id).toBe('string');

    const stored = await adapter.$queryRaw<
      Array<{ actionType: string; scheduledAt: string; dueTs: string; updatedAt: string }>
    >(
      'SELECT "actionType", "scheduledAt", "dueTs", "updatedAt" FROM "reward_queue" WHERE "idempotencyKey" = ?',
      'user-1:sess-1:1765811055720',
    );
    expect(stored.length).toBe(1);
    expect(stored[0].actionType).toBe('REWARD');
    expect(typeof stored[0].scheduledAt).toBe('string');
    expect(typeof stored[0].dueTs).toBe('string');
    expect(typeof stored[0].updatedAt).toBe('string');
  });

  it('create: user_learning_objectives.updatedAt NOT NULL 无默认时，应自动补齐', async () => {
    const adapter = createInMemorySqlite();

    // 模拟旧表结构：updatedAt NOT NULL 无 DEFAULT
    adapter.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS "user_learning_objectives" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mode" TEXT DEFAULT 'daily',
        "primaryObjective" TEXT DEFAULT 'accuracy',
        "minAccuracy" REAL,
        "weightShortTerm" REAL DEFAULT 0.4,
        "weightLongTerm" REAL DEFAULT 0.4,
        "weightEfficiency" REAL DEFAULT 0.2,
        "createdAt" TEXT DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL
      );
    `);

    const created = await adapter
      .getModel<Record<string, unknown>>('UserLearningObjectives')
      .create({
        data: {
          userId: 'user-1',
          mode: 'exam',
          primaryObjective: 'accuracy',
          minAccuracy: 0.85,
          weightShortTerm: 0.6,
          weightLongTerm: 0.3,
          weightEfficiency: 0.1,
        },
      });

    expect(typeof created.id).toBe('string');
    expect(created.updatedAt instanceof Date).toBe(true);
  });
});
