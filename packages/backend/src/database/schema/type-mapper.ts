/**
 * PostgreSQL 和 SQLite 类型映射器
 *
 * 处理两种数据库之间的数据类型转换
 * 确保数据在 PostgreSQL 和 SQLite 之间无损转换
 */

// ============================================
// 类型映射表
// ============================================

/**
 * PostgreSQL 到 SQLite 类型映射
 */
export const PG_TO_SQLITE_TYPE_MAP: Record<string, string> = {
  // 字符串类型
  text: 'TEXT',
  varchar: 'TEXT',
  char: 'TEXT',
  uuid: 'TEXT',

  // 数字类型
  integer: 'INTEGER',
  int: 'INTEGER',
  int4: 'INTEGER',
  smallint: 'INTEGER',
  int2: 'INTEGER',
  bigint: 'INTEGER',
  int8: 'INTEGER',
  serial: 'INTEGER',
  bigserial: 'INTEGER',
  smallserial: 'INTEGER',

  // 浮点类型
  real: 'REAL',
  float4: 'REAL',
  'double precision': 'REAL',
  float8: 'REAL',
  numeric: 'REAL',
  decimal: 'REAL',

  // 布尔类型
  boolean: 'INTEGER',
  bool: 'INTEGER',

  // 日期时间类型
  timestamp: 'TEXT',
  timestamptz: 'TEXT',
  'timestamp with time zone': 'TEXT',
  'timestamp without time zone': 'TEXT',
  date: 'TEXT',
  time: 'TEXT',
  timetz: 'TEXT',

  // JSON 类型
  json: 'TEXT',
  jsonb: 'TEXT',

  // 数组类型（存储为 JSON）
  'text[]': 'TEXT',
  'varchar[]': 'TEXT',
  'integer[]': 'TEXT',
  'int[]': 'TEXT',
  'bigint[]': 'TEXT',
  'boolean[]': 'TEXT',
  'uuid[]': 'TEXT',

  // 二进制类型
  bytea: 'BLOB',

  // 枚举类型（存储为 TEXT）
  enum: 'TEXT',
};

/**
 * Prisma 到 SQLite 类型映射
 */
export const PRISMA_TO_SQLITE_TYPE_MAP: Record<string, string> = {
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'REAL',
  Boolean: 'INTEGER',
  DateTime: 'TEXT',
  Json: 'TEXT',
  BigInt: 'INTEGER',
  Decimal: 'REAL',
  Bytes: 'BLOB',
};

// ============================================
// 值转换函数
// ============================================

/**
 * PostgreSQL 值转换为 SQLite 值
 */
export function pgValueToSqlite(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedType = pgType.toLowerCase();

  // 布尔类型转换为 0/1
  if (normalizedType === 'boolean' || normalizedType === 'bool') {
    return value ? 1 : 0;
  }

  // 日期时间类型转换为 ISO 8601 字符串
  if (
    normalizedType.includes('timestamp') ||
    normalizedType === 'date' ||
    normalizedType.includes('time')
  ) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    // 如果已经是字符串，确保格式正确
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    return value;
  }

  // JSON/JSONB 类型转换为 JSON 字符串
  if (normalizedType === 'json' || normalizedType === 'jsonb') {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  // 数组类型转换为 JSON 字符串
  if (normalizedType.endsWith('[]')) {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return value;
  }

  // UUID 转换为小写字符串
  if (normalizedType === 'uuid') {
    return typeof value === 'string' ? value.toLowerCase() : String(value);
  }

  // BigInt 转换
  if (normalizedType === 'bigint' || normalizedType === 'int8') {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value;
  }

  // Decimal/Numeric 转换为浮点数
  if (normalizedType === 'numeric' || normalizedType === 'decimal') {
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    return value;
  }

  return value;
}

/**
 * SQLite 值转换为 PostgreSQL 值
 */
export function sqliteValueToPg(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedType = pgType.toLowerCase();

  // 布尔类型：0/1 转换为 true/false
  if (normalizedType === 'boolean' || normalizedType === 'bool') {
    return value === 1 || value === true || value === '1' || value === 'true';
  }

  // 日期时间类型：ISO 8601 字符串转换为 Date
  if (
    normalizedType.includes('timestamp') ||
    normalizedType === 'date' ||
    normalizedType.includes('time')
  ) {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }

  // JSON/JSONB 类型：JSON 字符串解析为对象
  if (normalizedType === 'json' || normalizedType === 'jsonb') {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  // 数组类型：JSON 字符串解析为数组
  if (normalizedType.endsWith('[]')) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  }

  // BigInt 转换
  if (normalizedType === 'bigint' || normalizedType === 'int8') {
    if (typeof value === 'number') {
      return BigInt(value);
    }
    if (typeof value === 'string') {
      return BigInt(value);
    }
    return value;
  }

  return value;
}

/**
 * Prisma 值转换为 SQLite 值
 */
export function prismaValueToSqlite(value: unknown, prismaType: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  switch (prismaType) {
    case 'Boolean':
      return value ? 1 : 0;

    case 'DateTime':
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'string') {
        return new Date(value).toISOString();
      }
      return value;

    case 'Json':
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);

    case 'BigInt':
      if (typeof value === 'bigint') {
        return Number(value);
      }
      return value;

    case 'Decimal':
      if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber();
      }
      if (typeof value === 'string') {
        return parseFloat(value);
      }
      return value;

    case 'Bytes':
      if (value instanceof Buffer) {
        return value;
      }
      return value;

    default:
      // 处理数组类型（如 String[]）
      if (prismaType.endsWith('[]')) {
        if (Array.isArray(value)) {
          return JSON.stringify(value);
        }
      }

      // 兜底处理：确保所有类型都转换为 SQLite 兼容格式
      // SQLite3 只能绑定: numbers, strings, bigints, buffers, null
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      if (typeof value === 'bigint') {
        return Number(value);
      }
      if (Buffer.isBuffer(value)) {
        return value;
      }
      if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        return JSON.stringify(value);
      }

      return value;
  }
}

/**
 * SQLite 值转换为 Prisma 值
 */
export function sqliteValueToPrisma(value: unknown, prismaType: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  switch (prismaType) {
    case 'Boolean':
      return value === 1 || value === true || value === '1' || value === 'true';

    case 'DateTime':
      if (typeof value === 'string') {
        return new Date(value);
      }
      return value;

    case 'Json':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;

    case 'BigInt':
      if (typeof value === 'number') {
        return BigInt(value);
      }
      if (typeof value === 'string') {
        return BigInt(value);
      }
      return value;

    case 'Int':
      if (typeof value === 'string') {
        return parseInt(value, 10);
      }
      return value;

    case 'Float':
    case 'Decimal':
      if (typeof value === 'string') {
        return parseFloat(value);
      }
      return value;

    default:
      // 处理数组类型（如 String[]）
      if (prismaType.endsWith('[]')) {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        }
      }
      return value;
  }
}

// ============================================
// 行转换函数
// ============================================

/**
 * 表字段类型信息
 */
export interface FieldTypeInfo {
  name: string;
  prismaType: string;
  pgType?: string;
  isArray: boolean;
  isOptional: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  isUpdatedAt?: boolean;
}

/**
 * 表 Schema 信息
 */
export interface TableSchema {
  tableName: string;
  modelName: string;
  fields: FieldTypeInfo[];
  primaryKey: string[];
  uniqueKeys: string[][];
}

/**
 * 将 PostgreSQL 行数据转换为 SQLite 格式
 */
export function convertRowPgToSqlite(
  row: Record<string, unknown>,
  schema: TableSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const value = row[field.name];
    result[field.name] = prismaValueToSqlite(value, field.prismaType);
  }

  return result;
}

/**
 * 将 SQLite 行数据转换为 PostgreSQL 格式
 */
export function convertRowSqliteToPg(
  row: Record<string, unknown>,
  schema: TableSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const value = row[field.name];
    result[field.name] = sqliteValueToPrisma(value, field.prismaType);
  }

  return result;
}

// ============================================
// SQL 值格式化
// ============================================

/**
 * 格式化 SQLite SQL 值
 */
export function formatSqliteValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return 'NULL';
    }
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'string') {
    // 转义单引号
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }

  if (typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value) || typeof value === 'object') {
    const jsonStr = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 转换 Prisma where 条件中的值为 SQLite 兼容格式
 */
export function convertWhereValues(
  where: Record<string, unknown>,
  schema: TableSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(where)) {
    const field = schema.fields.find((f) => f.name === key);

    if (!field) {
      // 可能是复合条件（AND, OR, NOT）
      if (key === 'AND' || key === 'OR') {
        if (Array.isArray(value)) {
          result[key] = value.map((v) => convertWhereValues(v as Record<string, unknown>, schema));
        }
        continue;
      }
      if (key === 'NOT') {
        result[key] = convertWhereValues(value as Record<string, unknown>, schema);
        continue;
      }
      result[key] = value;
      continue;
    }

    // 处理 Prisma 操作符
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      const converted: Record<string, unknown> = {};
      for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
        converted[op] = prismaValueToSqlite(opValue, field.prismaType);
      }
      result[key] = converted;
    } else {
      result[key] = prismaValueToSqlite(value, field.prismaType);
    }
  }

  return result;
}
