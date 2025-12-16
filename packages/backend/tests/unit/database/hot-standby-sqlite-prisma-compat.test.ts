/**
 * SQLite 热备 Prisma 语义兼容测试（最小子集）
 *
 * 目标：确保降级模式下常见 Prisma 写法不至于直接写崩：
 * - 复合唯一 where（e.g. unique_user_word_score: { userId, wordId }）
 * - relation.connect 写法（e.g. user: { connect: { id } }）展开为 userId/wordId
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

describe('Hot-standby SQLite Prisma compatibility', () => {
  beforeAll(() => {
    schemaRegistry.register([
      {
        tableName: 'word_scores',
        modelName: 'WordScore',
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
            name: 'wordId',
            prismaType: 'String',
            isArray: false,
            isOptional: false,
            hasDefault: false,
          },
          {
            name: 'totalScore',
            prismaType: 'Float',
            isArray: false,
            isOptional: false,
            hasDefault: true,
            defaultValue: 0,
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
        uniqueKeys: [['userId', 'wordId']],
      },
    ]);
  });

  it('upsert: 支持复合唯一 where + relation.connect 展开', async () => {
    const adapter = createInMemorySqlite();

    adapter.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS "word_scores" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "wordId" TEXT NOT NULL,
        "totalScore" REAL NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        UNIQUE ("userId", "wordId")
      );
    `);

    const model = adapter.getModel<Record<string, unknown>>('WordScore');

    const created = await model.upsert({
      where: {
        unique_user_word_score: {
          userId: 'user-1',
          wordId: 'word-1',
        },
      },
      create: {
        user: { connect: { id: 'user-1' } },
        word: { connect: { id: 'word-1' } },
        totalScore: 10,
      },
      update: { totalScore: 10 },
    });

    expect(created.userId).toBe('user-1');
    expect(created.wordId).toBe('word-1');
    expect(created.totalScore).toBe(10);

    const updated = await model.upsert({
      where: {
        unique_user_word_score: {
          userId: 'user-1',
          wordId: 'word-1',
        },
      },
      create: {
        user: { connect: { id: 'user-1' } },
        word: { connect: { id: 'word-1' } },
        totalScore: 20,
      },
      update: { totalScore: 20 },
    });

    expect(updated.userId).toBe('user-1');
    expect(updated.wordId).toBe('word-1');
    expect(updated.totalScore).toBe(20);
    expect(updated.updatedAt instanceof Date).toBe(true);
  });

  it('where: 忽略 undefined 条件（避免被错误翻译为 IS NULL）', async () => {
    const adapter = createInMemorySqlite();

    adapter.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS "word_scores" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "wordId" TEXT NOT NULL,
        "totalScore" REAL NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        UNIQUE ("userId", "wordId")
      );
    `);

    const model = adapter.getModel<Record<string, unknown>>('WordScore');

    await model.create({ data: { userId: 'user-1', wordId: 'word-1', totalScore: 10 } });
    await model.create({ data: { userId: 'user-1', wordId: 'word-2', totalScore: 20 } });
    await model.create({ data: { userId: 'user-2', wordId: 'word-3', totalScore: 30 } });

    const rows = await model.findMany({
      where: {
        userId: 'user-1',
        // Prisma 常见写法：条件不满足时给 undefined；SQLite 侧必须忽略，而不是转成 IS NULL
        wordId: undefined,
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === 'user-1')).toBe(true);
  });

  it('where: in/notIn 支持数组值', async () => {
    const adapter = createInMemorySqlite();

    adapter.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS "word_scores" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "wordId" TEXT NOT NULL,
        "totalScore" REAL NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        UNIQUE ("userId", "wordId")
      );
    `);

    const model = adapter.getModel<Record<string, unknown>>('WordScore');

    await model.create({ data: { userId: 'user-1', wordId: 'word-1', totalScore: 10 } });
    await model.create({ data: { userId: 'user-1', wordId: 'word-2', totalScore: 20 } });
    await model.create({ data: { userId: 'user-2', wordId: 'word-3', totalScore: 30 } });

    const inRows = await model.findMany({
      where: {
        userId: { in: ['user-1'] },
      },
    });
    expect(inRows).toHaveLength(2);

    const notInRows = await model.findMany({
      where: {
        userId: { notIn: ['user-1'] },
      },
    });
    expect(notInRows).toHaveLength(1);
    expect(notInRows[0].userId).toBe('user-2');

    const emptyInRows = await model.findMany({
      where: {
        userId: { in: [] },
      },
    });
    expect(emptyInRows).toHaveLength(0);
  });
});
