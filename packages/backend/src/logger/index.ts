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
import { Writable } from 'stream';

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
  '*.apiKey',
  '*.apikey',
  '*.privateKey',
  '*.privatekey',
  '*.creditCard',
  '*.creditcard',
  'req.query.token',
  'req.query.apiKey',
  '*.credentials',
  '*.sessionId',
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
 * 构建日志传输
 */
function buildTransport(): DestinationStream | undefined {
  // 测试环境不使用特殊传输
  if (IS_TEST) {
    return undefined;
  }

  const targets: pino.TransportTargetOptions[] = [];

  // 开发环境添加 pino-pretty 美化输出
  if (!IS_PRODUCTION) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: false,
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    });
  } else {
    // 生产环境输出到 stdout
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    });
  }

  try {
    return pino.transport({ targets });
  } catch (err) {
    console.warn('[Logger] Failed to create transport, falling back to JSON output:', err);
    return undefined;
  }
}

// ==================== PostgreSQL 日志写入 ====================

/** Pino 级别数字到 LogLevel 枚举的映射 */
const PINO_LEVEL_TO_LOG_LEVEL: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

/** 延迟加载的日志存储服务 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _logStorageService: any = null;

async function getLogStorageService() {
  if (!_logStorageService) {
    try {
      const module = await import('../services/log-storage.service');
      _logStorageService = module.logStorageService;
    } catch {
      // 服务未就绪时静默忽略
    }
  }
  return _logStorageService;
}

/**
 * 创建 PostgreSQL 日志写入流
 * 将 Pino JSON 日志解析并写入数据库
 */
function createPgWriteStream(): Writable {
  return new Writable({
    objectMode: false,
    write(chunk: Buffer, _encoding, callback) {
      try {
        const line = chunk.toString().trim();
        if (!line) {
          callback();
          return;
        }

        const entry = JSON.parse(line);
        const level = PINO_LEVEL_TO_LOG_LEVEL[entry.level] || 'INFO';

        // 异步写入数据库，不阻塞日志流
        getLogStorageService().then(service => {
          if (service) {
            service.writeLog({
              level,
              message: entry.msg || '',
              module: entry.module,
              source: 'BACKEND',
              context: entry,
              error: entry.err,
              requestId: entry.requestId,
              userId: entry.userId,
              app: entry.app || APP_NAME,
              env: entry.env || NODE_ENV,
              timestamp: entry.time ? new Date(entry.time) : new Date(),
            });
          }
        }).catch(() => {
          // 写入失败时静默忽略
        });

        callback();
      } catch {
        // 解析失败时静默忽略
        callback();
      }
    },
  });
}

// ==================== 创建日志器实例 ====================

/** 基线日志器 */
const transport = buildTransport();
const pgStream = IS_TEST ? undefined : createPgWriteStream();

// 创建多目标写入（控制台 + PostgreSQL）
let destination: DestinationStream | undefined;
if (transport && pgStream) {
  // 使用 pino.multistream 同时写入多个目标
  destination = pino.multistream([
    { stream: transport },
    { stream: pgStream },
  ]);
} else {
  destination = transport;
}

export const logger: Logger = pino(buildLoggerOptions(), destination);

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

/** 启动流程日志器 */
export const startupLogger = createChildLogger({ module: 'startup' });

/** CLI/脚本日志器 */
export const cliLogger = createChildLogger({ module: 'cli' });

/** 监控模块日志器 */
export const monitorLogger = createChildLogger({ module: 'monitor' });

/** 路由模块日志器 */
export const routeLogger = createChildLogger({ module: 'route' });

/** 服务层日志器 */
export const serviceLogger = createChildLogger({ module: 'service' });

/** Worker 日志器 */
export const workerLogger = createChildLogger({ module: 'worker' });

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
