/**
 * 前端统一日志系统
 *
 * 功能:
 * - 与后端日志格式兼容（Pino 风格）
 * - 支持结构化日志
 * - 开发环境美化输出
 * - 生产环境 JSON 格式
 * - warn+ 级别批量上报后端
 * - 敏感信息自动脱敏
 * - 全局错误捕获
 */

// ==================== 类型定义 ====================

/** 日志级别 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** 日志级别数值映射 */
const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/** 日志条目 */
interface LogEntry {
  level: LogLevel;
  msg: string;
  time: string;
  app: string;
  env: string;
  module?: string;
  context?: Record<string, unknown>;
  err?: {
    message: string;
    stack?: string;
    name: string;
  };
}

/** 日志器配置 */
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  remoteEndpoint: string;
  redactPaths: string[];
  appName: string;
  environment: string;
  batchInterval: number;
  maxBatchSize: number;
}

// ==================== 配置 ====================

const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

const DEFAULT_CONFIG: LoggerConfig = {
  level: isDev ? 'debug' : 'info',
  enableConsole: true,
  enableRemote: isProd,
  remoteEndpoint: '/api/logs',
  redactPaths: ['password', 'token', 'authorization', 'cookie', 'secret', 'apikey', 'accesstoken', 'refreshtoken'],
  appName: 'danci-frontend',
  environment: import.meta.env.MODE,
  batchInterval: 5000,
  maxBatchSize: 50,
};

// ==================== 工具函数 ====================

/**
 * 敏感信息脱敏
 */
function redact(obj: unknown, paths: string[]): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();
    const record = redacted as Record<string, unknown>;

    if (paths.some((p) => lowerKey.includes(p.toLowerCase()))) {
      record[key] = '[REDACTED]';
    } else if (typeof record[key] === 'object' && record[key] !== null) {
      record[key] = redact(record[key], paths);
    }
  }

  return redacted;
}

/**
 * 序列化错误对象
 */
function serializeError(err: unknown): LogEntry['err'] | undefined {
  if (!err) return undefined;

  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }

  if (typeof err === 'string') {
    return {
      message: err,
      name: 'Error',
    };
  }

  return {
    message: String(err),
    name: 'UnknownError',
  };
}

// ==================== 日志队列 ====================

let logQueue: LogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

/**
 * 批量发送日志到后端
 */
async function flushLogs(config: LoggerConfig): Promise<void> {
  if (logQueue.length === 0 || !config.enableRemote || isFlushing) return;

  isFlushing = true;
  const logsToSend = logQueue.splice(0, config.maxBatchSize);

  try {
    const response = await fetch(config.remoteEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: logsToSend }),
      keepalive: true,
    });

    if (!response.ok) {
      // 发送失败，将日志放回队列头部（最多保留 maxBatchSize 条）
      logQueue = [...logsToSend, ...logQueue].slice(0, config.maxBatchSize * 2);
    }
  } catch {
    // 网络错误，将日志放回队列头部
    logQueue = [...logsToSend, ...logQueue].slice(0, config.maxBatchSize * 2);
  } finally {
    isFlushing = false;
  }

  // 如果还有剩余日志，继续发送
  if (logQueue.length > 0) {
    scheduleFlush(config);
  }
}

/**
 * 调度日志刷新
 */
function scheduleFlush(config: LoggerConfig): void {
  if (flushTimeout) return;

  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushLogs(config);
  }, config.batchInterval);
}

// ==================== 控制台格式化 ====================

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: 'color: #808080',
  debug: 'color: #00bcd4',
  info: 'color: #4caf50',
  warn: 'color: #ff9800',
  error: 'color: #f44336',
  fatal: 'color: #f44336; font-weight: bold',
};

const LEVEL_EMOJI: Record<LogLevel, string> = {
  trace: '🔍',
  debug: '🐛',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  fatal: '💀',
};

/**
 * 开发环境美化输出
 */
function formatConsoleOutput(entry: LogEntry): void {
  const time = new Date(entry.time).toLocaleTimeString();
  const module = entry.module ? `[${entry.module}]` : '';
  const prefix = `${LEVEL_EMOJI[entry.level]} %c[${time}] [${entry.level.toUpperCase()}]${module}`;

  if (entry.context || entry.err) {
    console.groupCollapsed(prefix, LEVEL_COLORS[entry.level], entry.msg);
    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log('Context:', entry.context);
    }
    if (entry.err) {
      console.error('Error:', entry.err);
    }
    console.groupEnd();
  } else {
    console.log(prefix, LEVEL_COLORS[entry.level], entry.msg);
  }
}

/**
 * 生产环境 JSON 输出
 */
function formatJsonOutput(entry: LogEntry): void {
  const method = entry.level === 'fatal' ? 'error' : entry.level;
  const consoleFn = console[method as keyof Console] as (...args: unknown[]) => void;
  if (typeof consoleFn === 'function') {
    consoleFn(JSON.stringify(entry));
  }
}

// ==================== Logger 类 ====================

/**
 * 日志器类
 */
class Logger {
  private config: LoggerConfig;
  private bindings: Record<string, unknown>;

  constructor(config: Partial<LoggerConfig> = {}, bindings: Record<string, unknown> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bindings = bindings;
  }

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, msgOrObj: string | Record<string, unknown>, msg?: string): void {
    // 级别过滤
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;

    const isObj = typeof msgOrObj === 'object';
    const message = isObj ? msg || '' : msgOrObj;
    const context = isObj ? (msgOrObj as Record<string, unknown>) : undefined;

    // 处理 context 中的 err 字段
    let errInfo: LogEntry['err'] | undefined;
    let cleanContext: Record<string, unknown> | undefined;

    if (context) {
      const { err, ...rest } = context;
      errInfo = serializeError(err);
      cleanContext =
        Object.keys(rest).length > 0
          ? (redact({ ...this.bindings, ...rest }, this.config.redactPaths) as Record<string, unknown>)
          : undefined;
    } else if (Object.keys(this.bindings).length > 0) {
      cleanContext = this.bindings as Record<string, unknown>;
    }

    const entry: LogEntry = {
      level,
      msg: message,
      time: new Date().toISOString(),
      app: this.config.appName,
      env: this.config.environment,
      module: (this.bindings.module as string) || undefined,
      context: cleanContext,
      err: errInfo,
    };

    // 控制台输出
    if (this.config.enableConsole) {
      if (isDev) {
        formatConsoleOutput(entry);
      } else {
        formatJsonOutput(entry);
      }
    }

    // 远程上报 (warn 及以上级别)
    if (this.config.enableRemote && LOG_LEVELS[level] >= LOG_LEVELS.warn) {
      logQueue.push(entry);
      if (logQueue.length >= this.config.maxBatchSize) {
        // 达到批量大小，立即发送
        if (flushTimeout) {
          clearTimeout(flushTimeout);
          flushTimeout = null;
        }
        flushLogs(this.config);
      } else {
        scheduleFlush(this.config);
      }
    }
  }

  // 日志级别方法
  trace(msgOrObj: string | Record<string, unknown>, msg?: string): void {
    this.log('trace', msgOrObj, msg);
  }

  debug(msgOrObj: string | Record<string, unknown>, msg?: string): void {
    this.log('debug', msgOrObj, msg);
  }

  info(msgOrObj: string | Record<string, unknown>, msg?: string): void {
    this.log('info', msgOrObj, msg);
  }

  warn(msgOrObj: string | Record<string, unknown>, msg?: string): void {
    this.log('warn', msgOrObj, msg);
  }

  error(msgOrObj: string | Record<string, unknown>, msg?: string): void {
    this.log('error', msgOrObj, msg);
  }

  fatal(msgOrObj: string | Record<string, unknown>, msg?: string): void {
    this.log('fatal', msgOrObj, msg);
  }

  /**
   * 创建子日志器
   */
  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.config, { ...this.bindings, ...bindings });
  }

  /**
   * 手动刷新日志队列
   */
  flush(): void {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    flushLogs(this.config);
  }

  /**
   * 更新配置
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ==================== 导出实例 ====================

/** 全局日志器 */
export const logger = new Logger();

/** 认证模块日志器 */
export const authLogger = logger.child({ module: 'auth' });

/** API 模块日志器 */
export const apiLogger = logger.child({ module: 'api' });

/** AMAS 模块日志器 */
export const amasLogger = logger.child({ module: 'amas' });

/** 学习模块日志器 */
export const learningLogger = logger.child({ module: 'learning' });

/** 存储模块日志器 */
export const storageLogger = logger.child({ module: 'storage' });

/** UI 模块日志器 */
export const uiLogger = logger.child({ module: 'ui' });

/** 管理后台日志器 */
export const adminLogger = logger.child({ module: 'admin' });

/** 埋点追踪日志器 */
export const trackingLogger = logger.child({ module: 'tracking' });

// ==================== 全局错误捕获 ====================

if (typeof window !== 'undefined') {
  // 页面卸载时刷新日志
  window.addEventListener('beforeunload', () => logger.flush());
  window.addEventListener('pagehide', () => logger.flush());

  // 全局未捕获错误
  window.addEventListener('error', (event) => {
    logger.error(
      {
        err: {
          message: event.message,
          name: 'UncaughtError',
          stack: `at ${event.filename}:${event.lineno}:${event.colno}`,
        },
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      '未捕获的 JavaScript 错误'
    );
  });

  // 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logger.error(
      {
        err: reason instanceof Error ? reason : { message: String(reason), name: 'UnhandledRejection' },
      },
      '未处理的 Promise 拒绝'
    );
  });
}

// ==================== 导出类型和工具函数 ====================

export type { LogEntry, LoggerConfig };
export { Logger };

/**
 * 创建子日志器的便捷方法
 */
export function createLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
