/**
 * SQLite 适配器
 *
 * 使用 better-sqlite3 实现 DatabaseAdapter 接口
 * 作为 PostgreSQL 的热备数据库
 */

import { randomUUID } from 'crypto';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import {
  DatabaseAdapter,
  DatabaseType as DbType,
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
  SQLiteConfig,
} from './types';
import {
  prismaValueToSqlite,
  sqliteValueToPrisma,
  formatSqliteValue,
  TableSchema,
} from '../schema';
import { PRISMA_TO_SQLITE_TYPE_MAP } from '../schema/type-mapper';
import {
  schemaRegistry,
  getTableNameForModel,
  generateCreateTableSQL,
  generateFullSchemaSQL,
} from '../schema/schema-generator';

type SqliteTableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

type PrismaDefaultFunction = {
  name: string;
  args?: unknown[];
};

function resolveDefaultValueForField(
  field: Pick<
    TableSchema['fields'][number],
    'prismaType' | 'hasDefault' | 'defaultValue' | 'isUpdatedAt'
  >,
): unknown | undefined {
  if (!field.hasDefault && !field.isUpdatedAt) {
    return undefined;
  }

  // Prisma @updatedAt：无 defaultValue，但需要在 create/update 时补齐当前时间
  if (field.isUpdatedAt && field.prismaType === 'DateTime') {
    return new Date();
  }

  const defaultValue = field.defaultValue;

  if (defaultValue === undefined) {
    // Prisma now(): DateTime
    if (field.prismaType === 'DateTime') {
      return new Date();
    }
    return undefined;
  }

  // Prisma 函数默认值：{ name: 'now' | 'uuid(4)' | ... }
  if (typeof defaultValue === 'object' && defaultValue !== null && 'name' in defaultValue) {
    const func = defaultValue as PrismaDefaultFunction;
    if (typeof func.name === 'string') {
      if (func.name === 'now') {
        return new Date();
      }
      if (func.name.startsWith('uuid')) {
        return randomUUID();
      }
      if (func.name.startsWith('cuid')) {
        // cuid 在离线热备场景下只需“足够唯一”，使用 UUID 兜底
        return randomUUID();
      }
    }
    return undefined;
  }

  // 常量默认值（string/number/boolean/...）
  return defaultValue;
}

function getSqliteTypeForField(
  field: Pick<TableSchema['fields'][number], 'prismaType' | 'isArray'>,
): string {
  if (field.isArray || field.prismaType.endsWith('[]')) {
    return 'TEXT';
  }
  return PRISMA_TO_SQLITE_TYPE_MAP[field.prismaType] || 'TEXT';
}

function inferLegacyRequiredValue(
  tableName: string,
  columnName: string,
  columnType: string,
  row: Record<string, unknown>,
): unknown {
  // reward_queue 历史表结构兼容：scheduledAt/actionType 仍可能存在且为 NOT NULL
  if (tableName === 'reward_queue') {
    if (columnName === 'scheduledAt') {
      const dueTs = row['dueTs'];
      if (dueTs !== undefined && dueTs !== null) {
        return dueTs;
      }
      return new Date();
    }
    if (columnName === 'actionType') {
      return 'REWARD';
    }
  }

  const upperType = columnType.toUpperCase();
  if (upperType.includes('INT')) return 0;
  if (upperType.includes('REAL') || upperType.includes('FLOA') || upperType.includes('DOUB'))
    return 0;
  if (upperType.includes('BLOB')) return Buffer.alloc(0);

  const lowerName = columnName.toLowerCase();
  if (lowerName.includes('time') || lowerName.includes('date') || lowerName.endsWith('at')) {
    return new Date();
  }

  return '';
}

// ============================================
// Prisma 查询转 SQL
// ============================================

/**
 * 构建 WHERE 子句
 */
function buildWhereClause(
  where: Record<string, unknown> | undefined,
  schema: TableSchema,
): { clause: string; params: unknown[] } {
  if (!where || Object.keys(where).length === 0) {
    return { clause: '', params: [] };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(where)) {
    // Prisma 语义：where 中的 undefined 等价于“不设置该条件”
    // 常见写法：{ id: ids.length > 0 ? { notIn: ids } : undefined }
    // 如果不跳过，会被错误翻译为 IS NULL，导致结果集为空
    if (value === undefined) {
      continue;
    }

    // 处理逻辑操作符
    if (key === 'AND' && Array.isArray(value)) {
      const subConditions: string[] = [];
      for (const subWhere of value) {
        const sub = buildWhereClause(subWhere as Record<string, unknown>, schema);
        if (sub.clause) {
          subConditions.push(`(${sub.clause})`);
          params.push(...sub.params);
        }
      }
      if (subConditions.length > 0) {
        conditions.push(`(${subConditions.join(' AND ')})`);
      }
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      const subConditions: string[] = [];
      for (const subWhere of value) {
        const sub = buildWhereClause(subWhere as Record<string, unknown>, schema);
        if (sub.clause) {
          subConditions.push(`(${sub.clause})`);
          params.push(...sub.params);
        }
      }
      if (subConditions.length > 0) {
        conditions.push(`(${subConditions.join(' OR ')})`);
      }
      continue;
    }

    if (key === 'NOT') {
      const sub = buildWhereClause(value as Record<string, unknown>, schema);
      if (sub.clause) {
        conditions.push(`NOT (${sub.clause})`);
        params.push(...sub.params);
      }
      continue;
    }

    const field = schema.fields.find((f) => f.name === key);

    // Prisma 复合唯一/复合主键 where 兼容：
    // e.g. { unique_user_word: { userId, wordId } }
    if (
      !field &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      const nested = value as Record<string, unknown>;
      const nestedKeys = Object.keys(nested);
      if (
        nestedKeys.length > 0 &&
        nestedKeys.every((nestedKey) => schema.fields.some((f) => f.name === nestedKey))
      ) {
        const sub = buildWhereClause(nested, schema);
        if (sub.clause) {
          conditions.push(`(${sub.clause})`);
          params.push(...sub.params);
        }
        continue;
      }
    }

    // 处理 Prisma 操作符
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      const ops = value as Record<string, unknown>;

      for (const [op, opValue] of Object.entries(ops)) {
        // Prisma 语义：操作符中的 undefined 也应忽略
        if (opValue === undefined) {
          continue;
        }

        // 即使找不到字段定义，也要调用 prismaValueToSqlite 进行兜底转换
        const sqliteValue = prismaValueToSqlite(opValue, field?.prismaType || 'Unknown');

        switch (op) {
          case 'equals':
            conditions.push(`"${key}" = ?`);
            params.push(sqliteValue);
            break;
          case 'not':
            if (sqliteValue === null) {
              conditions.push(`"${key}" IS NOT NULL`);
            } else {
              conditions.push(`"${key}" != ?`);
              params.push(sqliteValue);
            }
            break;
          case 'in':
            if (Array.isArray(opValue)) {
              // Prisma 语义：in: [] 应返回空结果集
              if (opValue.length === 0) {
                conditions.push('1 = 0');
                break;
              }
              const values = opValue.map((item) =>
                prismaValueToSqlite(item, field?.prismaType || 'Unknown'),
              );
              const placeholders = values.map(() => '?').join(', ');
              conditions.push(`"${key}" IN (${placeholders})`);
              params.push(...values);
            }
            break;
          case 'notIn':
            if (Array.isArray(opValue) && opValue.length > 0) {
              const values = opValue.map((item) =>
                prismaValueToSqlite(item, field?.prismaType || 'Unknown'),
              );
              const placeholders = values.map(() => '?').join(', ');
              conditions.push(`"${key}" NOT IN (${placeholders})`);
              params.push(...values);
            }
            break;
          case 'lt':
            conditions.push(`"${key}" < ?`);
            params.push(sqliteValue);
            break;
          case 'lte':
            conditions.push(`"${key}" <= ?`);
            params.push(sqliteValue);
            break;
          case 'gt':
            conditions.push(`"${key}" > ?`);
            params.push(sqliteValue);
            break;
          case 'gte':
            conditions.push(`"${key}" >= ?`);
            params.push(sqliteValue);
            break;
          case 'contains':
            conditions.push(`"${key}" LIKE ?`);
            params.push(`%${sqliteValue}%`);
            break;
          case 'startsWith':
            conditions.push(`"${key}" LIKE ?`);
            params.push(`${sqliteValue}%`);
            break;
          case 'endsWith':
            conditions.push(`"${key}" LIKE ?`);
            params.push(`%${sqliteValue}`);
            break;
          case 'mode':
            // insensitive 模式，SQLite 默认 LIKE 不区分大小写
            break;
          default:
            // 未知操作符，忽略
            break;
        }
      }
    } else {
      // 直接值比较
      const sqliteValue = prismaValueToSqlite(value, field?.prismaType || 'Unknown');

      if (sqliteValue === null) {
        conditions.push(`"${key}" IS NULL`);
      } else {
        conditions.push(`"${key}" = ?`);
        params.push(sqliteValue);
      }
    }
  }

  return {
    clause: conditions.join(' AND '),
    params,
  };
}

/**
 * 构建 ORDER BY 子句
 */
function buildOrderByClause(orderBy: QueryArgs['orderBy']): string {
  if (!orderBy) return '';

  const clauses: string[] = [];

  if (Array.isArray(orderBy)) {
    for (const item of orderBy) {
      for (const [col, dir] of Object.entries(item)) {
        clauses.push(`"${col}" ${dir.toUpperCase()}`);
      }
    }
  } else {
    for (const [col, dir] of Object.entries(orderBy)) {
      clauses.push(`"${col}" ${(dir as string).toUpperCase()}`);
    }
  }

  return clauses.length > 0 ? `ORDER BY ${clauses.join(', ')}` : '';
}

/**
 * 构建 SELECT 子句
 */
function buildSelectClause(
  select: Record<string, boolean | object> | undefined,
  schema: TableSchema,
): string {
  if (!select) {
    return '*';
  }

  const columns: string[] = [];
  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      columns.push(`"${key}"`);
    }
  }

  return columns.length > 0 ? columns.join(', ') : '*';
}

/**
 * 根据字段名和值自动推断并转换类型
 * 当 schema 中没有字段定义时使用
 */
function inferAndConvertValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // 根据字段名推断日期类型
  const dateFieldPatterns = [
    'At',
    'Date',
    'Time',
    'timestamp',
    'created',
    'updated',
    'expires',
    'scheduled',
    'processed',
  ];
  const isDateField = dateFieldPatterns.some((p) => key.toLowerCase().includes(p.toLowerCase()));

  if (isDateField && typeof value === 'string') {
    // 尝试解析为 Date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // 根据字段名推断布尔类型
  const boolFieldPatterns = [
    'is',
    'has',
    'enable',
    'enabled',
    'active',
    'visible',
    'synced',
    'committed',
  ];
  const isBoolField = boolFieldPatterns.some((p) => key.toLowerCase().startsWith(p.toLowerCase()));

  if (isBoolField && (value === 0 || value === 1)) {
    return value === 1;
  }

  // 尝试解析 JSON 字符串（数组或对象）
  if (typeof value === 'string') {
    if (
      (value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))
    ) {
      try {
        return JSON.parse(value);
      } catch {
        // 解析失败，返回原值
      }
    }
  }

  return value;
}

/**
 * 转换 SQLite 行数据为 Prisma 格式
 */
function convertRowToPrisma(
  row: Record<string, unknown>,
  schema: TableSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const field = schema.fields.find((f) => f.name === key);
    if (field) {
      result[key] = sqliteValueToPrisma(value, field.prismaType);
    } else {
      // 当 schema 中没有字段定义时，使用智能推断
      result[key] = inferAndConvertValue(key, value);
    }
  }

  return result;
}

// ============================================
// SQLite 模型适配器
// ============================================

/**
 * SQLite 模型适配器
 */
class SQLiteModelAdapter<T = unknown> implements ModelAdapter<T> {
  private tableName: string;
  private schema: TableSchema;
  private tableInfoCache: {
    columns: Set<string>;
    requiredNoDefault: SqliteTableInfoRow[];
    typeByName: Map<string, string>;
  } | null = null;

  constructor(
    private db: DatabaseType,
    private modelName: string,
  ) {
    this.tableName = getTableNameForModel(modelName);
    const schema =
      schemaRegistry.getByModelName(modelName) || schemaRegistry.getByTableName(this.tableName);

    if (!schema) {
      // 创建最小 schema
      this.schema = {
        tableName: this.tableName,
        modelName: this.modelName,
        fields: [],
        primaryKey: ['id'],
        uniqueKeys: [],
      };
    } else {
      this.schema = schema;
    }
  }

  private getTableInfo(): {
    columns: Set<string>;
    requiredNoDefault: SqliteTableInfoRow[];
    typeByName: Map<string, string>;
  } {
    if (this.tableInfoCache) {
      return this.tableInfoCache;
    }

    try {
      const rows = this.db
        .prepare(`PRAGMA table_info("${this.tableName}")`)
        .all() as SqliteTableInfoRow[];
      const columns = new Set(rows.map((r) => r.name));
      const typeByName = new Map(rows.map((r) => [r.name, r.type]));
      const requiredNoDefault = rows.filter(
        (r) =>
          r.notnull === 1 && (r.dflt_value === null || r.dflt_value === undefined) && r.pk === 0,
      );
      this.tableInfoCache = { columns, requiredNoDefault, typeByName };
      return this.tableInfoCache;
    } catch {
      const empty = {
        columns: new Set<string>(),
        requiredNoDefault: [] as SqliteTableInfoRow[],
        typeByName: new Map<string, string>(),
      };
      this.tableInfoCache = empty;
      return empty;
    }
  }

  /**
   * Prisma 关系写入兼容（最小子集）：
   * - 支持 data 中的 { relation: { connect: { id } } } 写法
   * - 将其展开到 { relationId: id }（若 relationId 列存在且未显式提供）
   */
  private applyRelationConnectShorthand(data: Record<string, unknown>): void {
    const tableInfo = this.getTableInfo();

    for (const [key, value] of Object.entries(data)) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) {
        continue;
      }

      const connect = (value as { connect?: unknown }).connect;
      if (
        !connect ||
        typeof connect !== 'object' ||
        Array.isArray(connect) ||
        connect instanceof Date
      ) {
        continue;
      }

      const candidateFk = `${key}Id`;
      if (!tableInfo.columns.has(candidateFk)) {
        continue;
      }

      if (data[candidateFk] !== undefined && data[candidateFk] !== null) {
        continue;
      }

      const connectObj = connect as Record<string, unknown>;

      if (connectObj.id !== undefined) {
        data[candidateFk] = connectObj.id;
        continue;
      }

      const keys = Object.keys(connectObj);
      if (keys.length === 1) {
        data[candidateFk] = connectObj[keys[0]];
      }
    }
  }

  private normalizeCreateData(data: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = { ...data };

    // 0) 先展开 relation.connect 写法，补齐外键字段
    this.applyRelationConnectShorthand(next);

    // 1) 补齐 Prisma 层默认值（now/uuid/enum常量/数字/布尔/JSON 等）
    for (const field of this.schema.fields) {
      if (next[field.name] !== undefined) continue;
      const resolved = resolveDefaultValueForField(field);
      if (resolved !== undefined) {
        next[field.name] = resolved;
      }
    }

    // 2) 兼容历史 SQLite 表结构：对“表中存在但 Prisma schema 已移除”的 NOT NULL 列提供兜底值
    const schemaFieldNames = new Set(this.schema.fields.map((f) => f.name));
    const tableInfo = this.getTableInfo();

    for (const col of tableInfo.requiredNoDefault) {
      if (schemaFieldNames.has(col.name)) continue;
      if (next[col.name] !== undefined) continue;
      next[col.name] = inferLegacyRequiredValue(this.tableName, col.name, col.type, next);
    }

    return next;
  }

  private normalizeUpdateData(data: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = { ...data };

    // Prisma relation.connect -> 外键字段（用于 update/upsert 的 update 分支）
    this.applyRelationConnectShorthand(next);

    // Prisma @updatedAt：SQLite 侧不一定有触发器/默认值，更新时自动补齐
    if (next.updatedAt === undefined) {
      const tableInfo = this.getTableInfo();
      if (tableInfo.columns.has('updatedAt')) {
        next.updatedAt = new Date();
      }
    }

    return next;
  }

  async findUnique(args: {
    where: Record<string, unknown>;
    select?: Record<string, boolean | object>;
    include?: Record<string, boolean | object>;
  }): Promise<T | null> {
    const selectClause = buildSelectClause(args.select, this.schema);
    const { clause: whereClause, params } = buildWhereClause(args.where, this.schema);

    const sql = `SELECT ${selectClause} FROM "${this.tableName}" WHERE ${whereClause} LIMIT 1`;

    try {
      const row = this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      if (!row) return null;
      return convertRowToPrisma(row, this.schema) as T;
    } catch (error) {
      throw new Error(
        `SQLite findUnique failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async findFirst(args?: QueryArgs): Promise<T | null> {
    const selectClause = buildSelectClause(args?.select, this.schema);
    const { clause: whereClause, params } = buildWhereClause(args?.where, this.schema);
    const orderByClause = buildOrderByClause(args?.orderBy);

    let sql = `SELECT ${selectClause} FROM "${this.tableName}"`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (orderByClause) sql += ` ${orderByClause}`;
    sql += ' LIMIT 1';

    if (args?.skip) {
      sql += ` OFFSET ${args.skip}`;
    }

    try {
      const row = this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      if (!row) return null;
      return convertRowToPrisma(row, this.schema) as T;
    } catch (error) {
      throw new Error(
        `SQLite findFirst failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async findMany(args?: QueryArgs): Promise<T[]> {
    const selectClause = buildSelectClause(args?.select, this.schema);
    const { clause: whereClause, params } = buildWhereClause(args?.where, this.schema);
    const orderByClause = buildOrderByClause(args?.orderBy);

    let sql = `SELECT ${selectClause} FROM "${this.tableName}"`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (orderByClause) sql += ` ${orderByClause}`;
    if (args?.take) sql += ` LIMIT ${args.take}`;
    if (args?.skip) sql += ` OFFSET ${args.skip}`;

    try {
      const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
      return rows.map((row) => convertRowToPrisma(row, this.schema) as T);
    } catch (error) {
      throw new Error(
        `SQLite findMany failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async create(args: CreateArgs): Promise<T> {
    const rawData = args.data as Record<string, unknown>;

    // 保护性检查：确保数据不为空
    if (!rawData || Object.keys(rawData).length === 0) {
      throw new Error(`SQLite create failed: empty data provided for ${this.tableName}`);
    }

    const data = this.normalizeCreateData(rawData);
    const tableInfo = this.getTableInfo();

    const columns: string[] = [];
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      // 跳过 undefined 值（Prisma 可能传入 undefined 表示不设置）
      if (value === undefined) {
        continue;
      }
      // 兼容 schema 漂移：跳过 SQLite 表中不存在的列，避免 "no column named ..."
      if (!tableInfo.columns.has(key)) {
        continue;
      }
      const field = this.schema.fields.find((f) => f.name === key);
      columns.push(`"${key}"`);
      // 即使找不到字段定义，也要调用 prismaValueToSqlite 进行兜底转换
      values.push(prismaValueToSqlite(value, field?.prismaType || 'Unknown'));
      placeholders.push('?');
    }

    // 再次检查：过滤 undefined 后确保还有数据
    if (columns.length === 0) {
      throw new Error(
        `SQLite create failed: no valid columns after filtering undefined values for ${this.tableName}`,
      );
    }

    const sql = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

    try {
      this.db.prepare(sql).run(...values);
    } catch (prepareError) {
      // 输出详细的调试信息
      console.error('[SQLiteModelAdapter] create failed:', {
        tableName: this.tableName,
        modelName: this.modelName,
        sql,
        columns,
        values: values.map((v) => ({ type: typeof v, value: v })),
        error: prepareError instanceof Error ? prepareError.message : String(prepareError),
      });
      throw new Error(
        `SQLite create failed: ${prepareError instanceof Error ? prepareError.message : String(prepareError)}`,
      );
    }

    try {
      // 返回创建的记录
      const pkWhere = this.buildPrimaryKeyWhere(data);

      // 如果没有主键，尝试用 rowid 获取刚插入的记录
      if (Object.keys(pkWhere).length === 0) {
        const lastRowSql = `SELECT * FROM "${this.tableName}" WHERE rowid = last_insert_rowid()`;
        const row = this.db.prepare(lastRowSql).get() as Record<string, unknown>;
        if (row) {
          return convertRowToPrisma(row, this.schema) as T;
        }
        // 如果还是拿不到，返回原始数据
        return data as T;
      }

      const { clause: whereClause, params: whereParams } = buildWhereClause(pkWhere, this.schema);

      // 确保 whereClause 不为空
      if (!whereClause) {
        const lastRowSql = `SELECT * FROM "${this.tableName}" WHERE rowid = last_insert_rowid()`;
        const row = this.db.prepare(lastRowSql).get() as Record<string, unknown>;
        if (row) {
          return convertRowToPrisma(row, this.schema) as T;
        }
        return data as T;
      }

      const selectSql = `SELECT * FROM "${this.tableName}" WHERE ${whereClause}`;
      const row = this.db.prepare(selectSql).get(...whereParams) as Record<string, unknown>;
      return convertRowToPrisma(row, this.schema) as T;
    } catch (error) {
      throw new Error(
        `SQLite create failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async createMany(args: CreateManyArgs): Promise<{ count: number }> {
    const dataList = args.data as Record<string, unknown>[];
    if (dataList.length === 0) return { count: 0 };

    const tableInfo = this.getTableInfo();
    let count = 0;

    const transaction = this.db.transaction((items: Record<string, unknown>[]) => {
      for (const item of items) {
        const normalized = this.normalizeCreateData(item);

        const columns: string[] = [];
        const values: unknown[] = [];
        const placeholders: string[] = [];

        for (const [key, value] of Object.entries(normalized)) {
          if (value === undefined) continue;
          if (!tableInfo.columns.has(key)) continue;
          const field = this.schema.fields.find((f) => f.name === key);
          columns.push(`"${key}"`);
          values.push(prismaValueToSqlite(value, field?.prismaType || 'Unknown'));
          placeholders.push('?');
        }

        if (columns.length === 0) {
          continue;
        }

        const sql = args.skipDuplicates
          ? `INSERT OR IGNORE INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`
          : `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

        const result = this.db.prepare(sql).run(...values);
        count += result.changes;
      }
    });

    try {
      transaction(dataList);
      return { count };
    } catch (error) {
      throw new Error(
        `SQLite createMany failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async update(args: UpdateArgs): Promise<T> {
    const rawData = args.data as Record<string, unknown>;
    const data = this.normalizeUpdateData(rawData);
    const tableInfo = this.getTableInfo();
    const setClauses: string[] = [];
    const setValues: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      // Prisma 语义：undefined 表示“不更新该字段”
      if (value === undefined) {
        continue;
      }
      // 兼容 schema 漂移：跳过 SQLite 表中不存在的列
      if (!tableInfo.columns.has(key)) {
        continue;
      }
      const field = this.schema.fields.find((f) => f.name === key);
      setClauses.push(`"${key}" = ?`);
      // 即使找不到字段定义，也要调用 prismaValueToSqlite 进行兜底转换
      setValues.push(prismaValueToSqlite(value, field?.prismaType || 'Unknown'));
    }

    if (setClauses.length === 0) {
      throw new Error(`SQLite update failed: no valid update fields for ${this.tableName}`);
    }

    const { clause: whereClause, params: whereParams } = buildWhereClause(args.where, this.schema);
    const sql = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')} WHERE ${whereClause}`;

    try {
      this.db.prepare(sql).run(...setValues, ...whereParams);

      // 返回更新后的记录
      const selectSql = `SELECT * FROM "${this.tableName}" WHERE ${whereClause}`;
      const row = this.db.prepare(selectSql).get(...whereParams) as Record<string, unknown>;
      return convertRowToPrisma(row, this.schema) as T;
    } catch (error) {
      throw new Error(
        `SQLite update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async updateMany(args: UpdateManyArgs): Promise<{ count: number }> {
    const rawData = args.data as Record<string, unknown>;
    const data = this.normalizeUpdateData(rawData);
    const tableInfo = this.getTableInfo();
    const setClauses: string[] = [];
    const setValues: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        continue;
      }
      if (!tableInfo.columns.has(key)) {
        continue;
      }
      const field = this.schema.fields.find((f) => f.name === key);
      setClauses.push(`"${key}" = ?`);
      // 即使找不到字段定义，也要调用 prismaValueToSqlite 进行兜底转换
      setValues.push(prismaValueToSqlite(value, field?.prismaType || 'Unknown'));
    }

    if (setClauses.length === 0) {
      return { count: 0 };
    }

    const { clause: whereClause, params: whereParams } = buildWhereClause(args.where, this.schema);

    let sql = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;

    try {
      const result = this.db.prepare(sql).run(...setValues, ...whereParams);
      return { count: result.changes };
    } catch (error) {
      throw new Error(
        `SQLite updateMany failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async upsert(args: UpsertArgs): Promise<T> {
    const { clause: whereClause, params: whereParams } = buildWhereClause(args.where, this.schema);

    // 先尝试查找
    const selectSql = `SELECT * FROM "${this.tableName}" WHERE ${whereClause} LIMIT 1`;
    const existing = this.db.prepare(selectSql).get(...whereParams) as
      | Record<string, unknown>
      | undefined;

    if (existing) {
      // 更新
      return this.update({ where: args.where, data: args.update });
    } else {
      // 创建
      return this.create({ data: args.create });
    }
  }

  async delete(args: DeleteArgs): Promise<T> {
    const { clause: whereClause, params: whereParams } = buildWhereClause(args.where, this.schema);

    // 先获取要删除的记录
    const selectSql = `SELECT * FROM "${this.tableName}" WHERE ${whereClause} LIMIT 1`;
    const row = this.db.prepare(selectSql).get(...whereParams) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      throw new Error(`Record not found for delete in ${this.tableName}`);
    }

    const sql = `DELETE FROM "${this.tableName}" WHERE ${whereClause}`;

    try {
      this.db.prepare(sql).run(...whereParams);
      return convertRowToPrisma(row, this.schema) as T;
    } catch (error) {
      throw new Error(
        `SQLite delete failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async deleteMany(args?: DeleteManyArgs): Promise<{ count: number }> {
    let sql = `DELETE FROM "${this.tableName}"`;
    let params: unknown[] = [];

    if (args?.where) {
      const { clause: whereClause, params: whereParams } = buildWhereClause(
        args.where,
        this.schema,
      );
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
        params = whereParams;
      }
    }

    try {
      const result = this.db.prepare(sql).run(...params);
      return { count: result.changes };
    } catch (error) {
      throw new Error(
        `SQLite deleteMany failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async count(args?: { where?: Record<string, unknown> }): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
    let params: unknown[] = [];

    if (args?.where) {
      const { clause: whereClause, params: whereParams } = buildWhereClause(
        args.where,
        this.schema,
      );
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
        params = whereParams;
      }
    }

    try {
      const result = this.db.prepare(sql).get(...params) as { count: number };
      return result.count;
    } catch (error) {
      throw new Error(
        `SQLite count failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async aggregate(args: AggregateArgs): Promise<Record<string, unknown>> {
    const aggregations: string[] = [];
    const result: Record<string, unknown> = {};

    if (args._count) {
      aggregations.push('COUNT(*) as _count');
    }

    // 构建聚合查询
    let sql = `SELECT ${aggregations.length > 0 ? aggregations.join(', ') : '1'} FROM "${this.tableName}"`;
    let params: unknown[] = [];

    if (args.where) {
      const { clause: whereClause, params: whereParams } = buildWhereClause(
        args.where,
        this.schema,
      );
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
        params = whereParams;
      }
    }

    try {
      const row = this.db.prepare(sql).get(...params) as Record<string, unknown>;

      if (args._count) {
        result._count = row._count;
      }

      return result;
    } catch (error) {
      throw new Error(
        `SQLite aggregate failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async groupBy(args: GroupByArgs): Promise<Array<Record<string, unknown>>> {
    const selectParts = args.by.map((col) => `"${col}"`);

    if (args._count) {
      selectParts.push('COUNT(*) as _count');
    }

    let sql = `SELECT ${selectParts.join(', ')} FROM "${this.tableName}"`;
    let params: unknown[] = [];

    if (args.where) {
      const { clause: whereClause, params: whereParams } = buildWhereClause(
        args.where,
        this.schema,
      );
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
        params = whereParams;
      }
    }

    sql += ` GROUP BY ${args.by.map((col) => `"${col}"`).join(', ')}`;

    if (args.orderBy) {
      const orderByClause = buildOrderByClause(args.orderBy);
      if (orderByClause) sql += ` ${orderByClause}`;
    }

    if (args.take) sql += ` LIMIT ${args.take}`;
    if (args.skip) sql += ` OFFSET ${args.skip}`;

    try {
      return this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    } catch (error) {
      throw new Error(
        `SQLite groupBy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildPrimaryKeyWhere(data: Record<string, unknown>): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    for (const pk of this.schema.primaryKey) {
      if (data[pk] !== undefined) {
        where[pk] = data[pk];
      }
    }
    return where;
  }
}

// ============================================
// SQLite 事务客户端
// ============================================

/**
 * SQLite 事务客户端
 * 提供与 Prisma 事务客户端兼容的 API，包括模型属性访问器
 */
class SQLiteTransactionClient implements TransactionClient {
  private modelProxies: Map<string, SQLiteModelAdapter> = new Map();

  constructor(private db: DatabaseType) {}

  getModel<T = unknown>(modelName: string): ModelAdapter<T> {
    if (!this.modelProxies.has(modelName)) {
      this.modelProxies.set(modelName, new SQLiteModelAdapter<T>(this.db, modelName));
    }
    return this.modelProxies.get(modelName) as ModelAdapter<T>;
  }

  async $queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T> {
    try {
      const result = this.db.prepare(query).all(...params);
      return result as T;
    } catch (error) {
      throw new Error(
        `SQLite queryRaw failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async $executeRaw(query: string, ...params: unknown[]): Promise<number> {
    try {
      const result = this.db.prepare(query).run(...params);
      return result.changes;
    } catch (error) {
      throw new Error(
        `SQLite executeRaw failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Prisma 模型属性访问器 - 提供与 Prisma 事务客户端兼容的 API
  get user() {
    return this.getModel('User');
  }
  get wordBook() {
    return this.getModel('WordBook');
  }
  get word() {
    return this.getModel('Word');
  }
  get answerRecord() {
    return this.getModel('AnswerRecord');
  }
  get session() {
    return this.getModel('Session');
  }
  get userStudyConfig() {
    return this.getModel('UserStudyConfig');
  }
  get wordLearningState() {
    return this.getModel('WordLearningState');
  }
  get wordScore() {
    return this.getModel('WordScore');
  }
  get algorithmConfig() {
    return this.getModel('AlgorithmConfig');
  }
  get configHistory() {
    return this.getModel('ConfigHistory');
  }
  get anomalyFlag() {
    return this.getModel('AnomalyFlag');
  }
  get amasUserState() {
    return this.getModel('AmasUserState');
  }
  get amasUserModel() {
    return this.getModel('AmasUserModel');
  }
  get learningSession() {
    return this.getModel('LearningSession');
  }
  get featureVector() {
    return this.getModel('FeatureVector');
  }
  get habitProfile() {
    return this.getModel('HabitProfile');
  }
  get rewardQueue() {
    return this.getModel('RewardQueue');
  }
  get userStateHistory() {
    return this.getModel('UserStateHistory');
  }
  get badgeDefinition() {
    return this.getModel('BadgeDefinition');
  }
  get userBadge() {
    return this.getModel('UserBadge');
  }
  get learningPlan() {
    return this.getModel('LearningPlan');
  }
  get aBExperiment() {
    return this.getModel('ABExperiment');
  }
  get aBVariant() {
    return this.getModel('ABVariant');
  }
  get aBUserAssignment() {
    return this.getModel('ABUserAssignment');
  }
  get aBExperimentMetrics() {
    return this.getModel('ABExperimentMetrics');
  }
  get bayesianOptimizerState() {
    return this.getModel('BayesianOptimizerState');
  }
  get causalObservation() {
    return this.getModel('CausalObservation');
  }
  get wordReviewTrace() {
    return this.getModel('WordReviewTrace');
  }
  get decisionRecord() {
    return this.getModel('DecisionRecord');
  }
  get decisionInsight() {
    return this.getModel('DecisionInsight');
  }
  get pipelineStage() {
    return this.getModel('PipelineStage');
  }
  get word_frequency() {
    return this.getModel('word_frequency');
  }
  get systemLog() {
    return this.getModel('SystemLog');
  }
  get logAlertRule() {
    return this.getModel('LogAlertRule');
  }
  get lLMAdvisorSuggestion() {
    return this.getModel('LLMAdvisorSuggestion');
  }
  get suggestionEffectTracking() {
    return this.getModel('SuggestionEffectTracking');
  }
  get userLearningObjectives() {
    return this.getModel('UserLearningObjectives');
  }
  get objectiveHistory() {
    return this.getModel('ObjectiveHistory');
  }
  get userLearningProfile() {
    return this.getModel('UserLearningProfile');
  }
  get forgettingAlert() {
    return this.getModel('ForgettingAlert');
  }
  get wordContext() {
    return this.getModel('WordContext');
  }
  get notification() {
    return this.getModel('Notification');
  }
  get userPreference() {
    return this.getModel('UserPreference');
  }
  get visualFatigueRecord() {
    return this.getModel('VisualFatigueRecord');
  }
  get userVisualFatigueConfig() {
    return this.getModel('UserVisualFatigueConfig');
  }
  get userInteractionStats() {
    return this.getModel('UserInteractionStats');
  }
  get userTrackingEvent() {
    return this.getModel('UserTrackingEvent');
  }
  get wordQualityCheck() {
    return this.getModel('WordQualityCheck');
  }
  get wordContentIssue() {
    return this.getModel('WordContentIssue');
  }
  get wordContentVariant() {
    return this.getModel('WordContentVariant');
  }
  get lLMAnalysisTask() {
    return this.getModel('LLMAnalysisTask');
  }
  get systemWeeklyReport() {
    return this.getModel('SystemWeeklyReport');
  }
  get userBehaviorInsight() {
    return this.getModel('UserBehaviorInsight');
  }
  get alertRootCauseAnalysis() {
    return this.getModel('AlertRootCauseAnalysis');
  }

  // 支持动态模型访问
  [key: string]: unknown;
}

// ============================================
// SQLite 适配器
// ============================================

/**
 * SQLite 数据库适配器
 */
export class SQLiteAdapter implements DatabaseAdapter {
  readonly type: DbType = 'sqlite';
  private db: DatabaseType | null = null;
  private config: SQLiteConfig;

  constructor(config: SQLiteConfig) {
    this.config = {
      journalMode: 'WAL',
      synchronous: 'FULL',
      busyTimeout: 5000,
      cacheSize: -64000, // 64MB
      foreignKeys: true,
      ...config,
    };
  }

  /**
   * 获取原始 better-sqlite3 数据库实例
   */
  getDatabase(): DatabaseType {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }
    return this.db;
  }

  isConnected(): boolean {
    return this.db !== null && this.db.open;
  }

  /**
   * 同步连接数据库
   * 用于在模块加载时立即连接，不需要 await
   */
  connectSync(): void {
    if (this.db) {
      return;
    }

    this.db = new Database(this.config.path);

    // 设置 PRAGMA
    if (this.config.journalMode) {
      this.db.pragma(`journal_mode = ${this.config.journalMode}`);
    }
    if (this.config.synchronous) {
      this.db.pragma(`synchronous = ${this.config.synchronous}`);
    }
    if (this.config.busyTimeout) {
      this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
    }
    if (this.config.cacheSize) {
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);
    }
    if (this.config.foreignKeys) {
      this.db.pragma('foreign_keys = ON');
    }
  }

  /**
   * 同步初始化基础 schema
   * 使用硬编码的 DDL，不依赖 schemaRegistry
   * 用于在代理构造时创建必要的表
   *
   * 包含所有业务表的完整 DDL（与 PostgreSQL schema 对应）
   */
  initializeSchemaSync(): void {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }

    // 完整表结构的硬编码 DDL（与 Prisma schema 对应）
    const fullSchemaDDL = `
-- ============================================
-- 系统内部表
-- ============================================

-- 元数据表
CREATE TABLE IF NOT EXISTS "_db_metadata" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 待同步写入操作表
CREATE TABLE IF NOT EXISTS "_pending_writes" (
  "operation_id" TEXT PRIMARY KEY,
  "operation_data" TEXT NOT NULL,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 变更日志表
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

-- 冲突记录表（P1修复：持久化冲突记录）
CREATE TABLE IF NOT EXISTS "_sync_conflicts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "change_id" INTEGER NOT NULL,
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "local_data" TEXT,
  "remote_data" TEXT,
  "resolution" TEXT,
  "resolved_at" TEXT,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_sync_conflicts_table" ON "_sync_conflicts" ("table_name");
CREATE INDEX IF NOT EXISTS "idx_sync_conflicts_resolved" ON "_sync_conflicts" ("resolved_at");

-- ============================================
-- 用户与认证
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "role" TEXT DEFAULT 'USER',
  "rewardProfile" TEXT DEFAULT 'standard',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_users_rewardProfile" ON "users" ("rewardProfile");

-- 会话表（认证必需）
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_sessions_userId" ON "sessions" ("userId");
CREATE INDEX IF NOT EXISTS "idx_sessions_token" ON "sessions" ("token");
CREATE INDEX IF NOT EXISTS "idx_sessions_expiresAt" ON "sessions" ("expiresAt");

-- ============================================
-- 词库与单词
-- ============================================

-- 词书表
CREATE TABLE IF NOT EXISTS "word_books" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "userId" TEXT,
  "isPublic" INTEGER DEFAULT 0,
  "wordCount" INTEGER DEFAULT 0,
  "coverImage" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_books_userId" ON "word_books" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_books_type" ON "word_books" ("type");

-- 单词表
CREATE TABLE IF NOT EXISTS "words" (
  "id" TEXT PRIMARY KEY,
  "spelling" TEXT NOT NULL,
  "phonetic" TEXT NOT NULL,
  "meanings" TEXT NOT NULL,
  "examples" TEXT NOT NULL,
  "audioUrl" TEXT,
  "wordBookId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("wordBookId", "spelling")
);

CREATE INDEX IF NOT EXISTS "idx_words_wordBookId" ON "words" ("wordBookId");
CREATE INDEX IF NOT EXISTS "idx_words_spelling" ON "words" ("spelling");
CREATE INDEX IF NOT EXISTS "idx_words_wordBookId_createdAt" ON "words" ("wordBookId", "createdAt");

-- 词频表
CREATE TABLE IF NOT EXISTS "word_frequency" (
  "word_id" TEXT PRIMARY KEY,
  "frequency_rank" INTEGER NOT NULL,
  "frequency_score" REAL NOT NULL,
  "corpus_source" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_word_frequency_rank" ON "word_frequency" ("frequency_rank");
CREATE INDEX IF NOT EXISTS "idx_word_frequency_source" ON "word_frequency" ("corpus_source");

-- ============================================
-- 学习记录
-- ============================================

-- 答题记录表
CREATE TABLE IF NOT EXISTS "answer_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "selectedAnswer" TEXT NOT NULL,
  "correctAnswer" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now')),
  "dwellTime" INTEGER,
  "masteryLevelAfter" INTEGER,
  "masteryLevelBefore" INTEGER,
  "responseTime" INTEGER,
  "sessionId" TEXT,
  PRIMARY KEY ("id", "timestamp"),
  UNIQUE("userId", "wordId", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_answer_records_wordId_timestamp" ON "answer_records" ("wordId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_answer_records_userId_isCorrect" ON "answer_records" ("userId", "isCorrect");
CREATE INDEX IF NOT EXISTS "idx_answer_records_sessionId_timestamp" ON "answer_records" ("sessionId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_answer_records_timestamp" ON "answer_records" ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_answer_records_userId_timestamp" ON "answer_records" ("userId", "timestamp");

-- 用户学习配置表
CREATE TABLE IF NOT EXISTS "user_study_configs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "selectedWordBookIds" TEXT NOT NULL,
  "dailyWordCount" INTEGER DEFAULT 20,
  "studyMode" TEXT DEFAULT 'sequential',
  "dailyMasteryTarget" INTEGER DEFAULT 20,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 单词学习状态表
CREATE TABLE IF NOT EXISTS "word_learning_states" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "state" TEXT DEFAULT 'NEW',
  "masteryLevel" INTEGER DEFAULT 0,
  "easeFactor" REAL DEFAULT 2.5,
  "reviewCount" INTEGER DEFAULT 0,
  "lastReviewDate" TEXT,
  "nextReviewDate" TEXT,
  "currentInterval" INTEGER DEFAULT 1,
  "consecutiveCorrect" INTEGER DEFAULT 0,
  "consecutiveWrong" INTEGER DEFAULT 0,
  "halfLife" REAL DEFAULT 1.0,
  "version" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId" ON "word_learning_states" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_wordId" ON "word_learning_states" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_state" ON "word_learning_states" ("state");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_nextReviewDate" ON "word_learning_states" ("nextReviewDate");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId_state" ON "word_learning_states" ("userId", "state");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId_masteryLevel" ON "word_learning_states" ("userId", "masteryLevel");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId_nextReviewDate" ON "word_learning_states" ("userId", "nextReviewDate");

-- 单词分数表
CREATE TABLE IF NOT EXISTS "word_scores" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "totalScore" REAL DEFAULT 0,
  "accuracyScore" REAL DEFAULT 0,
  "speedScore" REAL DEFAULT 0,
  "stabilityScore" REAL DEFAULT 0,
  "proficiencyScore" REAL DEFAULT 0,
  "totalAttempts" INTEGER DEFAULT 0,
  "correctAttempts" INTEGER DEFAULT 0,
  "averageResponseTime" REAL DEFAULT 0,
  "averageDwellTime" REAL DEFAULT 0,
  "recentAccuracy" REAL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_word_scores_userId" ON "word_scores" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_scores_wordId" ON "word_scores" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_scores_totalScore" ON "word_scores" ("totalScore");
CREATE INDEX IF NOT EXISTS "idx_word_scores_userId_totalScore" ON "word_scores" ("userId", "totalScore");

-- 单词复习轨迹表
CREATE TABLE IF NOT EXISTS "word_review_traces" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "responseTime" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_word_review_traces_userId_wordId" ON "word_review_traces" ("userId", "wordId");
CREATE INDEX IF NOT EXISTS "idx_word_review_traces_userId_wordId_timestamp" ON "word_review_traces" ("userId", "wordId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_word_review_traces_timestamp" ON "word_review_traces" ("timestamp" DESC);

-- ============================================
-- 学习会话与行为
-- ============================================

-- 学习会话表
CREATE TABLE IF NOT EXISTS "learning_sessions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "startedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "endedAt" TEXT,
  "actualMasteryCount" INTEGER,
  "targetMasteryCount" INTEGER,
  "totalQuestions" INTEGER,
  "sessionType" TEXT DEFAULT 'NORMAL',
  "flowPeakScore" REAL,
  "avgCognitiveLoad" REAL,
  "contextShifts" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_learning_sessions_userId_startedAt" ON "learning_sessions" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "idx_learning_sessions_sessionType" ON "learning_sessions" ("sessionType");

-- 特征向量表
CREATE TABLE IF NOT EXISTS "feature_vectors" (
  "sessionId" TEXT NOT NULL,
  "featureVersion" INTEGER NOT NULL,
  "features" TEXT NOT NULL,
  "normMethod" TEXT,
  "answerRecordId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("sessionId", "featureVersion"),
  UNIQUE("answerRecordId", "featureVersion")
);

CREATE INDEX IF NOT EXISTS "idx_feature_vectors_version_createdAt" ON "feature_vectors" ("featureVersion", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_feature_vectors_answerRecordId" ON "feature_vectors" ("answerRecordId");

-- 用户状态历史表
CREATE TABLE IF NOT EXISTS "user_state_history" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "attention" REAL NOT NULL,
  "fatigue" REAL NOT NULL,
  "motivation" REAL NOT NULL,
  "memory" REAL NOT NULL,
  "speed" REAL NOT NULL,
  "stability" REAL NOT NULL,
  "trendState" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "date")
);

-- 习惯档案表
CREATE TABLE IF NOT EXISTS "habit_profiles" (
  "userId" TEXT PRIMARY KEY,
  "timePref" TEXT,
  "rhythmPref" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- AMAS 自适应学习
-- ============================================

-- AMAS 用户状态表
CREATE TABLE IF NOT EXISTS "amas_user_states" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "attention" REAL DEFAULT 0.7,
  "fatigue" REAL DEFAULT 0,
  "motivation" REAL DEFAULT 0,
  "confidence" REAL DEFAULT 0.5,
  "cognitiveProfile" TEXT DEFAULT '{"mem": 0.5, "speed": 0.5, "stability": 0.5}',
  "habitProfile" TEXT,
  "trendState" TEXT,
  "coldStartState" TEXT,
  "lastUpdateTs" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_amas_user_states_userId" ON "amas_user_states" ("userId");
CREATE INDEX IF NOT EXISTS "idx_amas_user_states_lastUpdateTs" ON "amas_user_states" ("lastUpdateTs");

-- AMAS 用户模型表
CREATE TABLE IF NOT EXISTS "amas_user_models" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "modelData" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_amas_user_models_userId" ON "amas_user_models" ("userId");

-- 用户学习档案表
CREATE TABLE IF NOT EXISTS "user_learning_profiles" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "theta" REAL DEFAULT 0,
  "thetaVariance" REAL DEFAULT 1,
  "attention" REAL DEFAULT 0.7,
  "fatigue" REAL DEFAULT 0,
  "motivation" REAL DEFAULT 0.5,
  "emotionBaseline" TEXT DEFAULT 'neutral',
  "lastReportedEmotion" TEXT,
  "flowScore" REAL DEFAULT 0,
  "flowBaseline" REAL DEFAULT 0.5,
  "activePolicyVersion" TEXT DEFAULT 'v1',
  "forgettingParams" TEXT DEFAULT '{}',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_learning_profiles_userId" ON "user_learning_profiles" ("userId");

-- ============================================
-- 算法配置与历史
-- ============================================

-- 算法配置表
CREATE TABLE IF NOT EXISTS "algorithm_configs" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT UNIQUE NOT NULL,
  "description" TEXT,
  "reviewIntervals" TEXT NOT NULL,
  "consecutiveCorrectThreshold" INTEGER DEFAULT 5,
  "consecutiveWrongThreshold" INTEGER DEFAULT 3,
  "difficultyAdjustmentInterval" INTEGER DEFAULT 1,
  "priorityWeightNewWord" INTEGER DEFAULT 40,
  "priorityWeightErrorRate" INTEGER DEFAULT 30,
  "priorityWeightOverdueTime" INTEGER DEFAULT 20,
  "priorityWeightWordScore" INTEGER DEFAULT 10,
  "scoreWeightAccuracy" INTEGER DEFAULT 40,
  "scoreWeightSpeed" INTEGER DEFAULT 30,
  "scoreWeightStability" INTEGER DEFAULT 20,
  "scoreWeightProficiency" INTEGER DEFAULT 10,
  "speedThresholdExcellent" INTEGER DEFAULT 3000,
  "speedThresholdGood" INTEGER DEFAULT 5000,
  "speedThresholdAverage" INTEGER DEFAULT 10000,
  "speedThresholdSlow" INTEGER DEFAULT 10000,
  "newWordRatioDefault" REAL DEFAULT 0.3,
  "newWordRatioHighAccuracy" REAL DEFAULT 0.5,
  "newWordRatioLowAccuracy" REAL DEFAULT 0.1,
  "newWordRatioHighAccuracyThreshold" REAL DEFAULT 0.85,
  "newWordRatioLowAccuracyThreshold" REAL DEFAULT 0.65,
  "masteryThresholds" TEXT NOT NULL,
  "isDefault" INTEGER DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 配置历史表
CREATE TABLE IF NOT EXISTS "config_history" (
  "id" TEXT PRIMARY KEY,
  "configId" TEXT NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changeReason" TEXT,
  "previousValue" TEXT NOT NULL,
  "newValue" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_config_history_configId" ON "config_history" ("configId");
CREATE INDEX IF NOT EXISTS "idx_config_history_changedBy" ON "config_history" ("changedBy");
CREATE INDEX IF NOT EXISTS "idx_config_history_timestamp" ON "config_history" ("timestamp");

-- ============================================
-- A/B 测试与贝叶斯优化
-- ============================================

-- A/B 实验表
CREATE TABLE IF NOT EXISTS "ab_experiments" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trafficAllocation" TEXT DEFAULT 'WEIGHTED',
  "minSampleSize" INTEGER DEFAULT 100,
  "significanceLevel" REAL DEFAULT 0.05,
  "minimumDetectableEffect" REAL DEFAULT 0.05,
  "autoDecision" INTEGER DEFAULT 0,
  "status" TEXT DEFAULT 'DRAFT',
  "startedAt" TEXT,
  "endedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_ab_experiments_status" ON "ab_experiments" ("status");
CREATE INDEX IF NOT EXISTS "idx_ab_experiments_startedAt" ON "ab_experiments" ("startedAt");

-- A/B 变体表
CREATE TABLE IF NOT EXISTS "ab_variants" (
  "id" TEXT PRIMARY KEY,
  "experimentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weight" REAL DEFAULT 0.5,
  "isControl" INTEGER DEFAULT 0,
  "parameters" TEXT DEFAULT '{}',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_ab_variants_experimentId" ON "ab_variants" ("experimentId");

-- A/B 用户分配表
CREATE TABLE IF NOT EXISTS "ab_user_assignments" (
  "userId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "assignedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("userId", "experimentId")
);

CREATE INDEX IF NOT EXISTS "idx_ab_user_assignments_variantId" ON "ab_user_assignments" ("variantId");

-- A/B 实验指标表
CREATE TABLE IF NOT EXISTS "ab_experiment_metrics" (
  "id" TEXT PRIMARY KEY,
  "experimentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "sampleCount" INTEGER DEFAULT 0,
  "primaryMetric" REAL DEFAULT 0,
  "averageReward" REAL DEFAULT 0,
  "stdDev" REAL DEFAULT 0,
  "m2" REAL DEFAULT 0,
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("experimentId", "variantId")
);

-- 贝叶斯优化器状态表
CREATE TABLE IF NOT EXISTS "bayesian_optimizer_state" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "observations" TEXT DEFAULT '[]',
  "bestParams" TEXT,
  "bestValue" REAL,
  "evaluationCount" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 因果推断观测表
CREATE TABLE IF NOT EXISTS "causal_observations" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "features" TEXT NOT NULL,
  "treatment" INTEGER NOT NULL,
  "outcome" REAL NOT NULL,
  "timestamp" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_causal_observations_treatment" ON "causal_observations" ("treatment");
CREATE INDEX IF NOT EXISTS "idx_causal_observations_timestamp" ON "causal_observations" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_causal_observations_userId" ON "causal_observations" ("userId");

-- ============================================
-- 决策记录与洞察
-- ============================================

-- 决策记录表
CREATE TABLE IF NOT EXISTS "decision_records" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "answerRecordId" TEXT,
  "sessionId" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now')),
  "decisionSource" TEXT NOT NULL,
  "coldstartPhase" TEXT,
  "weightsSnapshot" TEXT,
  "memberVotes" TEXT,
  "selectedAction" TEXT NOT NULL,
  "confidence" REAL DEFAULT 0,
  "reward" REAL,
  "traceVersion" INTEGER DEFAULT 1,
  "ingestionStatus" TEXT DEFAULT 'PENDING',
  "totalDurationMs" INTEGER,
  "isSimulation" INTEGER DEFAULT 0,
  "emotionLabel" TEXT,
  "flowScore" REAL,
  "actionRationale" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id", "timestamp"),
  UNIQUE("decisionId", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_decision_records_answerRecordId" ON "decision_records" ("answerRecordId");
CREATE INDEX IF NOT EXISTS "idx_decision_records_decisionSource" ON "decision_records" ("decisionSource");
CREATE INDEX IF NOT EXISTS "idx_decision_records_timestamp" ON "decision_records" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_decision_records_sessionId" ON "decision_records" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_decision_records_isSimulation" ON "decision_records" ("isSimulation");

-- 决策洞察表
CREATE TABLE IF NOT EXISTS "decision_insights" (
  "id" TEXT PRIMARY KEY,
  "decision_id" TEXT UNIQUE NOT NULL,
  "user_id" TEXT NOT NULL,
  "state_snapshot" TEXT NOT NULL,
  "difficulty_factors" TEXT NOT NULL,
  "triggers" TEXT DEFAULT '[]',
  "feature_vector_hash" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_decision_insights_userId_decisionId" ON "decision_insights" ("user_id", "decision_id");
CREATE INDEX IF NOT EXISTS "idx_decision_insights_featureVectorHash" ON "decision_insights" ("feature_vector_hash");
CREATE INDEX IF NOT EXISTS "idx_decision_insights_createdAt" ON "decision_insights" ("created_at");

-- 流水线阶段表
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
  "id" TEXT PRIMARY KEY,
  "decisionRecordId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "stageName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TEXT NOT NULL,
  "endedAt" TEXT,
  "durationMs" INTEGER,
  "inputSummary" TEXT,
  "outputSummary" TEXT,
  "metadata" TEXT,
  "errorMessage" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_decisionRecordId_stage" ON "pipeline_stages" ("decisionRecordId", "stage");
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_stage" ON "pipeline_stages" ("stage");
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_status" ON "pipeline_stages" ("status");

-- ============================================
-- 奖励与成就
-- ============================================

-- 奖励队列表
CREATE TABLE IF NOT EXISTS "reward_queue" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT,
  "userId" TEXT NOT NULL,
  "dueTs" TEXT NOT NULL,
  "reward" REAL NOT NULL,
  "status" TEXT DEFAULT 'PENDING',
  "idempotencyKey" TEXT UNIQUE NOT NULL,
  "lastError" TEXT,
  "answerRecordId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_reward_queue_dueTs_status" ON "reward_queue" ("dueTs", "status");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_userId" ON "reward_queue" ("userId");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_sessionId" ON "reward_queue" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_userId_status_dueTs" ON "reward_queue" ("userId", "status", "dueTs");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_answerRecordId" ON "reward_queue" ("answerRecordId");

-- 徽章定义表
CREATE TABLE IF NOT EXISTS "badge_definitions" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "iconUrl" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tier" INTEGER DEFAULT 1,
  "condition" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("name", "tier")
);

-- 用户徽章表
CREATE TABLE IF NOT EXISTS "user_badges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "tier" INTEGER DEFAULT 1,
  "unlockedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "badgeId", "tier")
);

CREATE INDEX IF NOT EXISTS "idx_user_badges_userId" ON "user_badges" ("userId");
CREATE INDEX IF NOT EXISTS "idx_user_badges_badgeId" ON "user_badges" ("badgeId");

-- 学习计划表
CREATE TABLE IF NOT EXISTS "learning_plans" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "dailyTarget" INTEGER NOT NULL,
  "estimatedCompletionDate" TEXT NOT NULL,
  "wordbookDistribution" TEXT NOT NULL,
  "weeklyMilestones" TEXT NOT NULL,
  "isActive" INTEGER DEFAULT 1,
  "totalWords" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 异常与预警
-- ============================================

-- 异常标记表
CREATE TABLE IF NOT EXISTS "anomaly_flags" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "flaggedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "flaggedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "resolved" INTEGER DEFAULT 0,
  "resolvedAt" TEXT,
  "resolvedBy" TEXT,
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_userId" ON "anomaly_flags" ("userId");
CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_wordId" ON "anomaly_flags" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_flaggedAt" ON "anomaly_flags" ("flaggedAt");

-- 遗忘预警表
CREATE TABLE IF NOT EXISTS "forgetting_alerts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "predictedForgetAt" TEXT NOT NULL,
  "recallProbability" REAL NOT NULL,
  "status" TEXT DEFAULT 'ACTIVE',
  "reviewedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_forgetting_alerts_userId_status" ON "forgetting_alerts" ("userId", "status");
CREATE INDEX IF NOT EXISTS "idx_forgetting_alerts_predictedForgetAt" ON "forgetting_alerts" ("predictedForgetAt");

-- ============================================
-- 通知与偏好
-- ============================================

-- 通知表
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT DEFAULT 'UNREAD',
  "priority" TEXT DEFAULT 'NORMAL',
  "metadata" TEXT,
  "readAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_notifications_userId_status" ON "notifications" ("userId", "status");
CREATE INDEX IF NOT EXISTS "idx_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_notifications_type" ON "notifications" ("type");
CREATE INDEX IF NOT EXISTS "idx_notifications_priority_status" ON "notifications" ("priority", "status");

-- 用户偏好表
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "preferredStudyTimeStart" TEXT DEFAULT '09:00',
  "preferredStudyTimeEnd" TEXT DEFAULT '21:00',
  "preferredDifficulty" TEXT DEFAULT 'adaptive',
  "dailyGoalEnabled" INTEGER DEFAULT 1,
  "dailyGoalWords" INTEGER DEFAULT 20,
  "enableForgettingAlerts" INTEGER DEFAULT 1,
  "enableAchievements" INTEGER DEFAULT 1,
  "enableReminders" INTEGER DEFAULT 1,
  "enableSystemNotif" INTEGER DEFAULT 1,
  "reminderFrequency" TEXT DEFAULT 'daily',
  "quietHoursStart" TEXT DEFAULT '22:00',
  "quietHoursEnd" TEXT DEFAULT '08:00',
  "theme" TEXT DEFAULT 'light',
  "language" TEXT DEFAULT 'zh-CN',
  "soundEnabled" INTEGER DEFAULT 1,
  "animationEnabled" INTEGER DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 用户学习目标表
CREATE TABLE IF NOT EXISTS "user_learning_objectives" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "mode" TEXT DEFAULT 'daily',
  "primaryObjective" TEXT DEFAULT 'accuracy',
  "minAccuracy" REAL,
  "maxDailyTime" INTEGER,
  "targetRetention" REAL,
  "weightShortTerm" REAL DEFAULT 0.4,
  "weightLongTerm" REAL DEFAULT 0.4,
  "weightEfficiency" REAL DEFAULT 0.2,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_learning_objectives_userId" ON "user_learning_objectives" ("userId");

-- 学习目标历史表
CREATE TABLE IF NOT EXISTS "objective_history" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "objectiveId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "beforeMetrics" TEXT NOT NULL,
  "afterMetrics" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_objective_history_userId" ON "objective_history" ("userId");
CREATE INDEX IF NOT EXISTS "idx_objective_history_objectiveId" ON "objective_history" ("objectiveId");
CREATE INDEX IF NOT EXISTS "idx_objective_history_timestamp" ON "objective_history" ("timestamp");

-- ============================================
-- 视觉疲劳与交互追踪
-- ============================================

-- 视觉疲劳记录表
CREATE TABLE IF NOT EXISTS "visual_fatigue_records" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "score" REAL NOT NULL,
  "fusedScore" REAL NOT NULL,
  "perclos" REAL NOT NULL,
  "blinkRate" REAL NOT NULL,
  "yawnCount" INTEGER DEFAULT 0,
  "headPitch" REAL,
  "headYaw" REAL,
  "confidence" REAL NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_userId_createdAt" ON "visual_fatigue_records" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_createdAt" ON "visual_fatigue_records" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_userId" ON "visual_fatigue_records" ("userId");

-- 用户视觉疲劳配置表
CREATE TABLE IF NOT EXISTS "user_visual_fatigue_configs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "enabled" INTEGER DEFAULT 0,
  "detectionFps" INTEGER DEFAULT 5,
  "uploadIntervalMs" INTEGER DEFAULT 5000,
  "vlmAnalysisEnabled" INTEGER DEFAULT 0,
  "personalBaselineData" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_visual_fatigue_configs_userId" ON "user_visual_fatigue_configs" ("userId");

-- 用户交互统计表
CREATE TABLE IF NOT EXISTS "user_interaction_stats" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "pronunciationClicks" INTEGER DEFAULT 0,
  "pauseCount" INTEGER DEFAULT 0,
  "pageSwitchCount" INTEGER DEFAULT 0,
  "totalInteractions" INTEGER DEFAULT 0,
  "totalSessionDuration" INTEGER DEFAULT 0,
  "lastActivityTime" TEXT NOT NULL DEFAULT (datetime('now')),
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_interaction_stats_userId" ON "user_interaction_stats" ("userId");

-- 用户追踪事件表
CREATE TABLE IF NOT EXISTS "user_tracking_events" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventData" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_tracking_events_userId_timestamp" ON "user_tracking_events" ("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_user_tracking_events_sessionId" ON "user_tracking_events" ("sessionId");

-- ============================================
-- 系统日志与告警
-- ============================================

-- 系统日志表
CREATE TABLE IF NOT EXISTS "system_logs" (
  "id" TEXT PRIMARY KEY,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "module" TEXT,
  "source" TEXT DEFAULT 'BACKEND',
  "context" TEXT,
  "error" TEXT,
  "requestId" TEXT,
  "userId" TEXT,
  "clientIp" TEXT,
  "userAgent" TEXT,
  "app" TEXT,
  "env" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_system_logs_timestamp" ON "system_logs" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_system_logs_level" ON "system_logs" ("level");
CREATE INDEX IF NOT EXISTS "idx_system_logs_module" ON "system_logs" ("module");
CREATE INDEX IF NOT EXISTS "idx_system_logs_source" ON "system_logs" ("source");
CREATE INDEX IF NOT EXISTS "idx_system_logs_userId" ON "system_logs" ("userId");
CREATE INDEX IF NOT EXISTS "idx_system_logs_requestId" ON "system_logs" ("requestId");

-- 日志告警规则表
CREATE TABLE IF NOT EXISTS "log_alert_rules" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" INTEGER DEFAULT 1,
  "levels" TEXT NOT NULL,
  "module" TEXT,
  "messagePattern" TEXT,
  "threshold" INTEGER NOT NULL,
  "windowMinutes" INTEGER NOT NULL,
  "webhookUrl" TEXT,
  "cooldownMinutes" INTEGER DEFAULT 30,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_log_alert_rules_enabled" ON "log_alert_rules" ("enabled");

-- ============================================
-- LLM 增强与建议
-- ============================================

-- LLM 顾问建议表
CREATE TABLE IF NOT EXISTS "llm_advisor_suggestions" (
  "id" TEXT PRIMARY KEY,
  "weekStart" TEXT NOT NULL,
  "weekEnd" TEXT NOT NULL,
  "statsSnapshot" TEXT NOT NULL,
  "rawResponse" TEXT NOT NULL,
  "parsedSuggestion" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" TEXT,
  "reviewNotes" TEXT,
  "appliedItems" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_llm_advisor_suggestions_status" ON "llm_advisor_suggestions" ("status");
CREATE INDEX IF NOT EXISTS "idx_llm_advisor_suggestions_createdAt" ON "llm_advisor_suggestions" ("createdAt");

-- 建议效果追踪表
CREATE TABLE IF NOT EXISTS "suggestion_effect_tracking" (
  "id" TEXT PRIMARY KEY,
  "suggestionId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "targetParam" TEXT NOT NULL,
  "oldValue" REAL NOT NULL,
  "newValue" REAL NOT NULL,
  "appliedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "metricsBeforeApply" TEXT NOT NULL,
  "metricsAfterApply" TEXT,
  "effectEvaluated" INTEGER DEFAULT 0,
  "effectScore" REAL,
  "effectAnalysis" TEXT,
  "evaluatedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_suggestion_effect_tracking_suggestionId" ON "suggestion_effect_tracking" ("suggestionId");
CREATE INDEX IF NOT EXISTS "idx_suggestion_effect_tracking_appliedAt" ON "suggestion_effect_tracking" ("appliedAt");
CREATE INDEX IF NOT EXISTS "idx_suggestion_effect_tracking_effectEvaluated" ON "suggestion_effect_tracking" ("effectEvaluated");

-- 词库质量检查表
CREATE TABLE IF NOT EXISTS "word_quality_checks" (
  "id" TEXT PRIMARY KEY,
  "wordBookId" TEXT NOT NULL,
  "checkType" TEXT NOT NULL,
  "totalWords" INTEGER NOT NULL,
  "checkedWords" INTEGER DEFAULT 0,
  "issuesFound" INTEGER DEFAULT 0,
  "issueDetails" TEXT DEFAULT '[]',
  "status" TEXT DEFAULT 'pending',
  "taskId" TEXT,
  "createdBy" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_quality_checks_wordBookId" ON "word_quality_checks" ("wordBookId");
CREATE INDEX IF NOT EXISTS "idx_word_quality_checks_status" ON "word_quality_checks" ("status");

-- 词库内容问题表
CREATE TABLE IF NOT EXISTS "word_content_issues" (
  "id" TEXT PRIMARY KEY,
  "wordId" TEXT NOT NULL,
  "checkId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "suggestion" TEXT,
  "status" TEXT DEFAULT 'open',
  "fixedBy" TEXT,
  "fixedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_content_issues_wordId" ON "word_content_issues" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_content_issues_checkId" ON "word_content_issues" ("checkId");
CREATE INDEX IF NOT EXISTS "idx_word_content_issues_status" ON "word_content_issues" ("status");

-- 词库内容增强版本表
CREATE TABLE IF NOT EXISTS "word_content_variants" (
  "id" TEXT PRIMARY KEY,
  "wordId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "originalValue" TEXT,
  "generatedValue" TEXT NOT NULL,
  "confidence" REAL DEFAULT 0.8,
  "taskId" TEXT,
  "status" TEXT DEFAULT 'pending',
  "approvedBy" TEXT,
  "approvedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_content_variants_wordId" ON "word_content_variants" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_content_variants_status" ON "word_content_variants" ("status");

-- LLM 分析任务表
CREATE TABLE IF NOT EXISTS "llm_analysis_tasks" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "priority" INTEGER DEFAULT 5,
  "input" TEXT NOT NULL,
  "output" TEXT,
  "tokensUsed" INTEGER,
  "error" TEXT,
  "retryCount" INTEGER DEFAULT 0,
  "createdBy" TEXT,
  "startedAt" TEXT,
  "completedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_llm_analysis_tasks_status_priority" ON "llm_analysis_tasks" ("status", "priority");
CREATE INDEX IF NOT EXISTS "idx_llm_analysis_tasks_type_status" ON "llm_analysis_tasks" ("type", "status");

-- 系统周报表
CREATE TABLE IF NOT EXISTS "system_weekly_reports" (
  "id" TEXT PRIMARY KEY,
  "weekStart" TEXT NOT NULL,
  "weekEnd" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "healthScore" REAL NOT NULL,
  "keyMetrics" TEXT NOT NULL,
  "highlights" TEXT NOT NULL,
  "concerns" TEXT NOT NULL,
  "recommendations" TEXT NOT NULL,
  "userMetrics" TEXT NOT NULL,
  "learningMetrics" TEXT NOT NULL,
  "systemMetrics" TEXT NOT NULL,
  "rawLLMResponse" TEXT,
  "tokensUsed" INTEGER,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("weekStart", "weekEnd")
);

-- 用户行为洞察表
CREATE TABLE IF NOT EXISTS "user_behavior_insights" (
  "id" TEXT PRIMARY KEY,
  "analysisDate" TEXT NOT NULL,
  "userSegment" TEXT NOT NULL,
  "patterns" TEXT NOT NULL,
  "insights" TEXT NOT NULL,
  "recommendations" TEXT NOT NULL,
  "userCount" INTEGER NOT NULL,
  "dataPoints" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("analysisDate", "userSegment")
);

-- 告警根因分析表
CREATE TABLE IF NOT EXISTS "alert_root_cause_analyses" (
  "id" TEXT PRIMARY KEY,
  "alertRuleId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "rootCause" TEXT NOT NULL,
  "suggestedFixes" TEXT NOT NULL,
  "relatedMetrics" TEXT NOT NULL,
  "confidence" REAL NOT NULL,
  "status" TEXT DEFAULT 'open',
  "resolvedBy" TEXT,
  "resolvedAt" TEXT,
  "resolution" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_alert_root_cause_analyses_alertRuleId" ON "alert_root_cause_analyses" ("alertRuleId");
CREATE INDEX IF NOT EXISTS "idx_alert_root_cause_analyses_status" ON "alert_root_cause_analyses" ("status");

-- 语境强化表
CREATE TABLE IF NOT EXISTS "word_contexts" (
  "id" TEXT PRIMARY KEY,
  "wordId" TEXT NOT NULL,
  "contextType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_contexts_wordId" ON "word_contexts" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_contexts_contextType" ON "word_contexts" ("contextType");
    `.trim();

    // 分割并执行每个语句
    const statements = fullSchemaDDL.split(';').filter((s) => s.trim());
    for (const stmt of statements) {
      try {
        this.db.exec(stmt);
      } catch (error) {
        // 忽略 "table already exists" 错误
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already exists')) {
          console.warn('[SQLiteAdapter] Schema statement failed:', message);
        }
      }
    }
  }

  async connect(): Promise<void> {
    // 使用同步方法实现
    this.connectSync();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async healthCheck(
    timeoutMs = 5000,
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      if (!this.db || !this.db.open) {
        return { healthy: false, error: 'Database not connected' };
      }

      // 执行简单查询
      this.db.prepare('SELECT 1').get();

      return {
        healthy: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getModel<T = unknown>(modelName: string): ModelAdapter<T> {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }
    return new SQLiteModelAdapter<T>(this.db, modelName);
  }

  async $transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }

    const client = new SQLiteTransactionClient(this.db);

    // better-sqlite3 的 transaction() 需要同步函数，无法直接使用 async
    // 使用手动事务控制：BEGIN IMMEDIATE -> 执行 -> COMMIT/ROLLBACK
    try {
      this.db.exec('BEGIN IMMEDIATE');

      try {
        const result = await fn(client);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      // 如果 BEGIN 失败（例如数据库锁定），直接抛出
      throw new Error(
        `SQLite transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async $queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T> {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }

    try {
      const result = this.db.prepare(query).all(...params);
      return result as T;
    } catch (error) {
      throw new Error(
        `SQLite queryRaw failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async $executeRaw(query: string, ...params: unknown[]): Promise<number> {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }

    try {
      const result = this.db.prepare(query).run(...params);
      return result.changes;
    } catch (error) {
      throw new Error(
        `SQLite executeRaw failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 转换值为 SQLite 兼容格式
   */
  private convertValueForSQLite(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'bigint') return Number(value);
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  async bulkInsert(tableName: string, rows: Record<string, unknown>[]): Promise<number> {
    if (!this.db || rows.length === 0) return 0;

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR IGNORE INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    const stmt = this.db.prepare(sql);
    let count = 0;

    const transaction = this.db.transaction((items: Record<string, unknown>[]) => {
      for (const item of items) {
        const values = columns.map((col) => this.convertValueForSQLite(item[col]));
        try {
          const result = stmt.run(...values);
          count += result.changes;
        } catch (e) {
          // 忽略单条记录错误，继续处理
          console.warn(
            `[SQLiteAdapter] bulkInsert row failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    });

    transaction(rows);
    return count;
  }

  async bulkUpsert(
    tableName: string,
    rows: Record<string, unknown>[],
    conflictKeys: string[],
  ): Promise<number> {
    if (!this.db || rows.length === 0) return 0;

    const columns = Object.keys(rows[0]);
    const updateColumns = columns.filter((c) => !conflictKeys.includes(c));
    const placeholders = columns.map(() => '?').join(', ');

    let sql: string;
    if (updateColumns.length > 0) {
      const updateClause = updateColumns.map((c) => `"${c}" = excluded."${c}"`).join(', ');
      sql = `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
             VALUES (${placeholders})
             ON CONFLICT (${conflictKeys.map((k) => `"${k}"`).join(', ')})
             DO UPDATE SET ${updateClause}`;
    } else {
      sql = `INSERT OR IGNORE INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
    }

    const stmt = this.db.prepare(sql);
    let count = 0;

    const transaction = this.db.transaction((items: Record<string, unknown>[]) => {
      for (const item of items) {
        const values = columns.map((col) => this.convertValueForSQLite(item[col]));
        try {
          const result = stmt.run(...values);
          count += result.changes;
        } catch (e) {
          // 忽略单条记录错误，继续处理
          console.warn(
            `[SQLiteAdapter] bulkUpsert row failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    });

    transaction(rows);
    return count;
  }

  async getTableData(
    tableName: string,
    options?: { batchSize?: number; offset?: number },
  ): Promise<Record<string, unknown>[]> {
    if (!this.db) return [];

    const batchSize = options?.batchSize || 1000;
    const offset = options?.offset || 0;

    const sql = `SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`;
    return this.db.prepare(sql).all(batchSize, offset) as Record<string, unknown>[];
  }

  async getTableRowCount(tableName: string): Promise<number> {
    if (!this.db) return 0;

    const result = this.db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as {
      count: number;
    };
    return result.count;
  }

  async getAllTableNames(): Promise<string[]> {
    if (!this.db) return [];

    const result = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'`,
      )
      .all() as Array<{ name: string }>;

    return result.map((r) => r.name);
  }

  /**
   * 运行时 schema 自愈：
   * - 确保 Prisma schema 中的表存在
   * - 对已存在表补齐缺失列（ALTER TABLE ADD COLUMN）
   *
   * 说明：
   * - 只做“增量补齐”，不做破坏性重建（避免离线数据丢失）
   * - 历史表结构里多出来的 NOT NULL 列由写入层兼容（见 SQLiteModelAdapter.normalizeCreateData）
   */
  async ensureSchemaCompatible(): Promise<void> {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }

    const schemas = schemaRegistry.getAllSchemas();
    if (schemas.length === 0) {
      return;
    }

    for (const schema of schemas) {
      // 1) 确保表存在（使用 schemaRegistry 动态生成的 CREATE TABLE IF NOT EXISTS）
      try {
        this.db.exec(generateCreateTableSQL(schema));
      } catch (error) {
        console.warn(
          `[SQLiteAdapter] ensureSchemaCompatible: create table failed for "${schema.tableName}":`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }

      // 2) 补齐缺失列
      let columnsInfo: SqliteTableInfoRow[] = [];
      try {
        columnsInfo = this.db
          .prepare(`PRAGMA table_info("${schema.tableName}")`)
          .all() as SqliteTableInfoRow[];
      } catch (error) {
        console.warn(
          `[SQLiteAdapter] ensureSchemaCompatible: table_info failed for "${schema.tableName}":`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }

      const existingColumns = new Set(columnsInfo.map((c) => c.name));

      for (const field of schema.fields) {
        if (existingColumns.has(field.name)) {
          continue;
        }

        const sqliteType = getSqliteTypeForField(field);
        try {
          this.db.exec(
            `ALTER TABLE "${schema.tableName}" ADD COLUMN "${field.name}" ${sqliteType}`,
          );
        } catch (error) {
          // 兜底：不中断启动，避免单表迁移失败导致整个热备不可用
          console.warn(
            `[SQLiteAdapter] ensureSchemaCompatible: add column failed for "${schema.tableName}"."${field.name}":`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  }

  async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('SQLite database not connected');
    }

    const schemas = schemaRegistry.getAllSchemas();
    const ddl = generateFullSchemaSQL(schemas);

    // 分割并执行每个语句
    const statements = ddl.split(';').filter((s) => s.trim());
    for (const stmt of statements) {
      this.db.exec(stmt);
    }

    await this.ensureSchemaCompatible();
  }
}

/**
 * 创建 SQLite 适配器
 */
export function createSQLiteAdapter(config: SQLiteConfig): SQLiteAdapter {
  return new SQLiteAdapter(config);
}
