/**
 * Pino PostgreSQL Transport
 *
 * 将 Pino 日志写入 PostgreSQL 的 system_logs 表
 *
 * 功能：
 * - 异步批量写入，避免阻塞主线程
 * - 自动解析 Pino 日志格式
 * - 支持错误堆栈和上下文信息
 * - 延迟导入避免循环依赖
 */

import build from 'pino-abstract-transport';

// Pino 级别映射到 SystemLog.LogLevel 枚举
const LEVEL_MAP: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

/**
 * Transport 配置选项
 */
interface TransportOptions {
  /** 批量写入大小（默认：10） */
  batchSize?: number;
  /** 批量写入间隔（毫秒，默认：1000） */
  flushInterval?: number;
  /** 是否忽略写入错误（默认：true，避免影响主应用） */
  ignoreErrors?: boolean;
}

/**
 * Pino 日志条目接口
 */
interface PinoLogEntry {
  level: number;
  time: number;
  msg: string;
  app?: string;
  env?: string;
  module?: string;
  requestId?: string;
  userId?: string | null;
  err?: {
    type?: string;
    message?: string;
    stack?: string;
    code?: string;
  };
  req?: unknown;
  res?: unknown;
  [key: string]: unknown;
}

/**
 * SystemLog 数据库记录
 */
interface SystemLogRecord {
  level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  module?: string;
  source: 'BACKEND' | 'FRONTEND';
  context?: Record<string, unknown>;
  error?: {
    message?: string;
    stack?: string;
    name?: string;
    code?: string;
  };
  requestId?: string;
  userId?: string | null;
  app: string;
  env: string;
  timestamp: Date;
}

/**
 * 日志存储服务（延迟导入）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logStorageService: any = null;

/**
 * 延迟导入日志存储服务
 * 避免循环依赖问题
 */
async function getLogStorageService(): Promise<{ writeLog: (log: SystemLogRecord) => void } | null> {
  if (!logStorageService) {
    try {
      // 动态导入，避免在模块加载时就引入依赖
      const module = await import('../services/log-storage.service');
      logStorageService = module.logStorageService;
    } catch (error) {
      // 如果服务不存在，返回 null
      console.warn('[PG Transport] Log storage service not available, logs will be dropped:', error);
      return null;
    }
  }
  return logStorageService;
}

/**
 * 解析 Pino 日志条目为 SystemLog 记录
 */
function parseLogEntry(entry: PinoLogEntry): SystemLogRecord {
  const level = LEVEL_MAP[entry.level] as SystemLogRecord['level'] || 'INFO';
  const message = entry.msg || '';

  // 提取模块名称
  const module = entry.module as string | undefined;

  // 提取请求和用户信息
  const requestId = entry.requestId as string | undefined;
  const userId = entry.userId as string | null | undefined;

  // 提取应用和环境信息
  const app = (entry.app as string) || 'danci';
  const env = (entry.env as string) || process.env.NODE_ENV || 'production';

  // 构建上下文对象（排除已提取的标准字段）
  const context: Record<string, unknown> = {};
  const excludedKeys = new Set([
    'level', 'time', 'msg', 'app', 'env', 'module',
    'requestId', 'userId', 'err', 'pid', 'hostname'
  ]);

  for (const [key, value] of Object.entries(entry)) {
    if (!excludedKeys.has(key) && value !== undefined) {
      context[key] = value;
    }
  }

  // 提取错误信息
  let error: SystemLogRecord['error'] | undefined;
  if (entry.err) {
    error = {
      message: entry.err.message,
      stack: entry.err.stack,
      name: entry.err.type,
      code: entry.err.code,
    };
  }

  // 构建时间戳
  const timestamp = entry.time ? new Date(entry.time) : new Date();

  return {
    level,
    message,
    module,
    source: 'BACKEND',
    context: Object.keys(context).length > 0 ? context : undefined,
    error,
    requestId,
    userId: userId || undefined,
    app,
    env,
    timestamp,
  };
}

/**
 * 批量日志写入器
 */
class BatchLogWriter {
  private buffer: SystemLogRecord[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly ignoreErrors: boolean;

  constructor(options: TransportOptions = {}) {
    this.batchSize = options.batchSize || 10;
    this.flushInterval = options.flushInterval || 1000;
    this.ignoreErrors = options.ignoreErrors !== false;
  }

  /**
   * 添加日志到缓冲区
   */
  async add(log: SystemLogRecord): Promise<void> {
    this.buffer.push(log);

    // 如果达到批量大小，立即刷新
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    } else {
      // 否则启动定时器
      this.startTimer();
    }
  }

  /**
   * 启动刷新定时器
   */
  private startTimer(): void {
    if (this.timer) return;

    this.timer = setTimeout(async () => {
      this.timer = null;
      await this.flush();
    }, this.flushInterval);

    // 允许进程退出时不等待定时器
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * 刷新缓冲区到数据库
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.batchSize);

    try {
      const service = await getLogStorageService();

      // 批量写入
      if (service) {
        for (const log of batch) {
          service.writeLog(log);
        }
      }
    } catch (error) {
      if (!this.ignoreErrors) {
        console.error('[PG Transport] Failed to write logs to database:', error);
      }
      // 生产环境下不抛出错误，避免影响主应用
    }
  }

  /**
   * 清理资源
   */
  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}

/**
 * 导出 Pino Transport 工厂函数
 *
 * @example
 * ```typescript
 * // 在 pino.transport() 中使用
 * const transport = pino.transport({
 *   targets: [
 *     {
 *       target: './logger/pg-transport',
 *       options: {
 *         batchSize: 20,
 *         flushInterval: 2000,
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export default async function (options: TransportOptions = {}) {
  const writer = new BatchLogWriter(options);

  // 使用 pino-abstract-transport 简化实现
  return build(
    async function (source) {
      for await (const obj of source) {
        try {
          const entry = obj as PinoLogEntry;
          const record = parseLogEntry(entry);
          await writer.add(record);
        } catch (error) {
          // 解析错误不应影响日志流
          console.error('[PG Transport] Failed to parse log entry:', error);
        }
      }
    },
    {
      // 清理时刷新剩余日志
      async close() {
        await writer.close();
      },
    }
  );
}
