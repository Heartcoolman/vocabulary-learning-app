/**
 * HTTP 请求日志中间件
 *
 * 功能:
 * - 为每个请求分配唯一 requestId
 * - 从认证中间件提取 userId
 * - 记录请求/响应元数据
 * - 健康检查等路径静默处理
 * - 根据状态码自动选择日志级别
 */

import { RequestHandler, Request } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import pinoHttp, { HttpLogger, Options } from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { logger, serializers } from './index';

// ==================== 配置常量 ====================

/** 不记录日志的路径（健康检查等） */
const SILENT_PATHS = ['/health', '/favicon.ico', '/robots.txt'];

/** 静态资源路径前缀 */
const STATIC_PREFIXES = ['/static/', '/assets/'];

// ==================== 辅助函数 ====================

/**
 * 检查路径是否应该静默处理
 */
function shouldSilence(path: string): boolean {
  if (SILENT_PATHS.includes(path)) {
    return true;
  }
  return STATIC_PREFIXES.some(prefix => path.startsWith(prefix));
}

/**
 * 根据响应状态码确定日志级别
 */
function determineLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  err?: Error
): 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'fatal' | 'silent' {
  if (err) {
    return 'error';
  }

  const statusCode = res.statusCode;

  if (statusCode >= 500) {
    return 'error';
  }
  if (statusCode >= 400) {
    return 'warn';
  }
  if (statusCode >= 300) {
    return 'info';
  }

  return 'info';
}

/**
 * 生成或提取请求 ID
 * 优先使用上游传递的 X-Request-ID
 */
function generateRequestId(req: IncomingMessage): string {
  const existingId = req.headers['x-request-id'];
  if (typeof existingId === 'string' && existingId.length > 0) {
    return existingId;
  }
  return uuidv4();
}

// ==================== 中间件配置 ====================

/**
 * 构建 pino-http 配置
 */
function buildHttpLoggerOptions(): Options {
  return {
    logger,
    serializers,

    // 请求 ID 生成 - 复用已存在的 req.id（由 requestIdMiddleware 预先注入）
    genReqId: (req: IncomingMessage) => {
      const expressReq = req as IncomingMessage & { id?: string };
      // 如果已有 id 则复用，避免重复生成导致不一致
      return expressReq.id ?? generateRequestId(req);
    },

    // 自定义属性注入
    customProps: (req: IncomingMessage) => {
      // 类型断言访问 Express 扩展属性
      const expressReq = req as IncomingMessage & { id?: string; user?: { id: string } };
      return {
        requestId: expressReq.id,
        userId: expressReq.user?.id ?? null,
      };
    },

    // 自动日志配置
    autoLogging: {
      ignore: (req: IncomingMessage) => shouldSilence(req.url || ''),
    },

    // 日志级别选择
    customLogLevel: determineLogLevel,

    // 成功响应消息格式
    customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
      return `${req.method} ${req.url} ${res.statusCode}`;
    },

    // 错误响应消息格式
    customErrorMessage: (req: IncomingMessage, res: ServerResponse, err: Error) => {
      return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
    },

    // 自定义属性名
    customAttributeKeys: {
      req: 'request',
      res: 'response',
      err: 'error',
      responseTime: 'duration',
    },
  };
}

// ==================== 导出中间件 ====================

/** HTTP 日志器实例 */
let httpLoggerInstance: HttpLogger | null = null;

/**
 * 获取 HTTP 日志中间件
 * 使用单例模式避免重复创建
 */
export function getHttpLogger(): HttpLogger {
  if (!httpLoggerInstance) {
    httpLoggerInstance = pinoHttp(buildHttpLoggerOptions());
  }
  return httpLoggerInstance;
}

/**
 * 请求 ID 注入中间件
 * 在 pino-http 之前运行，确保 requestId 可用于后续中间件
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = generateRequestId(req);

  // 注入到请求对象
  req.id = requestId;

  // 设置响应头，方便客户端追踪
  res.setHeader('X-Request-ID', requestId);

  next();
};

/**
 * 组合的日志中间件
 * 包含 requestId 注入和 HTTP 日志记录
 */
export const httpLoggerMiddleware: RequestHandler = (req, res, next) => {
  requestIdMiddleware(req, res, (err) => {
    if (err) {
      return next(err);
    }
    getHttpLogger()(req, res, next);
  });
};

// ==================== 请求级日志器工具 ====================

/**
 * 从请求对象获取绑定了上下文的日志器
 * 用于在路由处理器中记录日志
 *
 * @example
 * ```typescript
 * app.get('/api/users', (req, res) => {
 *   const log = getRequestLogger(req);
 *   log.info({ action: 'list_users' }, '获取用户列表');
 * });
 * ```
 */
export function getRequestLogger(req: Request) {
  // pino-http 会在 req 上注入 log 属性
  return req.log ?? logger;
}
