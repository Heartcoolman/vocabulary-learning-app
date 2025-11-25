/**
 * 统一日志系统 - 基线配置
 *
 * 功能:
 * - 结构化 JSON 日志输出（生产环境）
 * - 美化控制台输出（开发环境）
 * - 敏感信息自动脱敏
 * - 支持子日志器创建
 * - 统一的日志级别控制
 */

import pino, { Logger, LoggerOptions, DestinationStream } from 'pino';

// ==================== 配置常量 ====================

/** 默认日志级别 */
const DEFAULT_LOG_LEVEL = 'info';

/** 应用名称 */
const APP_NAME = 'danci-backend';

/** 需要脱敏的字段路径 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.oldPassword',
  'req.body.newPassword',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
];

// ==================== 环境检测 ====================

const LOG_LEVEL = process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_TEST = NODE_ENV === 'test';

// ==================== 序列化器 ====================

/**
 * 请求序列化器 - 脱敏敏感信息
 *
 * 注意：必须创建 headers 的浅拷贝后再修改，
 * 否则会污染原始请求对象导致认证中间件无法读取真实 token
 */
function reqSerializer(req: unknown): pino.SerializedRequest {
  const serialized = pino.stdSerializers.req(req as Parameters<typeof pino.stdSerializers.req>[0]);

  // 脱敏请求头中的敏感信息 - 必须先创建副本，避免修改原始请求
  if (serialized?.headers) {
    // 创建 headers 的浅拷贝，避免修改原始请求对象
    serialized.headers = { ...serialized.headers };
    const headers = serialized.headers as Record<string, unknown>;
    if (headers.authorization) {
      headers.authorization = '[REDACTED]';
    }
    if (headers.cookie) {
      headers.cookie = '[REDACTED]';
    }
  }

  return serialized;
}

/**
 * 响应序列化器
 */
function resSerializer(res: unknown): pino.SerializedResponse {
  return pino.stdSerializers.res(res as Parameters<typeof pino.stdSerializers.res>[0]);
}

/**
 * 错误序列化器 - 保留完整堆栈
 */
function errSerializer(err: Error): pino.SerializedError {
  const serialized = pino.stdSerializers.err(err);

  // 确保包含错误代码（如果存在）
  if ('code' in err && serialized) {
    (serialized as pino.SerializedError & { code?: string }).code = (err as Error & { code?: string }).code;
  }

  return serialized;
}

/** 序列化器集合 */
export const serializers = {
  req: reqSerializer,
  res: resSerializer,
  err: errSerializer,
};

// ==================== 日志器配置 ====================

/**
 * 构建日志器配置
 */
function buildLoggerOptions(): LoggerOptions {
  return {
    level: LOG_LEVEL,

    // 基础字段 - 每条日志都包含
    base: {
      app: APP_NAME,
      env: NODE_ENV,
    },

    // 序列化器
    serializers,

    // 敏感字段脱敏
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },

    // 格式化器
    formatters: {
      // 将日志级别转换为字符串标签
      level(label: string) {
        return { level: label };
      },
      // 绑定信息处理
      bindings(bindings) {
        // 生产环境保留 pid/hostname 用于多实例定位
        // 开发环境移除以减少噪音
        if (IS_PRODUCTION) {
          return bindings;
        }
        return {
          ...bindings,
          pid: undefined,
          hostname: undefined,
        };
      },
    },

    // 时间戳格式
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/**
 * 构建开发环境的美化传输
 */
function buildDevTransport(): DestinationStream | undefined {
  // 生产环境和测试环境不使用美化输出
  if (IS_PRODUCTION || IS_TEST) {
    return undefined;
  }

  // 开发环境使用 pino-pretty 美化输出
  try {
    return pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: false,
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    });
  } catch {
    // 如果 pino-pretty 不可用，回退到标准输出
    console.warn('[Logger] pino-pretty not available, falling back to JSON output');
    return undefined;
  }
}

// ==================== 创建日志器实例 ====================

/** 基线日志器 */
export const logger: Logger = pino(buildLoggerOptions(), buildDevTransport());

// ==================== 子日志器工厂 ====================

/**
 * 子日志器绑定字段类型
 */
export interface LoggerBindings {
  /** 模块名称 */
  module?: string;
  /** 功能名称 */
  feature?: string;
  /** 请求ID */
  requestId?: string;
  /** 用户ID */
  userId?: string | null;
  /** 其他自定义字段 */
  [key: string]: unknown;
}

/**
 * 创建子日志器
 * 用于为特定模块或上下文创建带有预设绑定的日志器
 *
 * @param bindings - 绑定字段
 * @returns 子日志器实例
 *
 * @example
 * ```typescript
 * const amasLogger = createChildLogger({ module: 'amas' });
 * amasLogger.info({ event: 'process_start' }, '开始处理学习事件');
 * ```
 */
export function createChildLogger(bindings: LoggerBindings = {}): Logger {
  return logger.child(bindings);
}

/**
 * 创建请求级别的日志器
 * 用于在请求处理过程中创建带有 requestId 和 userId 的日志器
 *
 * @param requestId - 请求ID
 * @param userId - 用户ID（可选）
 * @returns 请求级别的日志器实例
 *
 * @example
 * ```typescript
 * const reqLogger = createRequestLogger('req-123', 'user-456');
 * reqLogger.info('处理用户请求');
 * ```
 */
export function createRequestLogger(requestId: string, userId?: string | null): Logger {
  return logger.child({ requestId, userId });
}

// ==================== 预置模块日志器 ====================

/** AMAS 模块日志器 */
export const amasLogger = createChildLogger({ module: 'amas' });

/** 认证模块日志器 */
export const authLogger = createChildLogger({ module: 'auth' });

/** 数据库模块日志器 */
export const dbLogger = createChildLogger({ module: 'database' });

/** 缓存模块日志器 */
export const cacheLogger = createChildLogger({ module: 'cache' });

// ==================== 日志级别快捷方法 ====================

/**
 * 记录致命错误并退出进程
 *
 * @warning 仅在启动阶段或不可恢复的致命错误时使用
 * 不要在请求处理路径中调用此函数，否则会导致进程立即终止
 *
 * 使用场景：
 * - 数据库连接初始化失败
 * - 配置文件加载失败
 * - 必需环境变量缺失
 */
export function logFatal(err: Error, message?: string): never {
  logger.fatal({ err }, message || err.message);
  // 使用 setImmediate 确保日志写入完成后再退出
  setImmediate(() => process.exit(1));
  // TypeScript 需要这行来满足 never 返回类型
  throw err;
}

/**
 * 检查当前日志级别是否启用
 */
export function isLevelEnabled(level: pino.Level): boolean {
  return logger.isLevelEnabled(level);
}

// ==================== 导出类型 ====================

export type { Logger } from 'pino';
