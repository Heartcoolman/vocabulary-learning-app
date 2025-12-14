/**
 * API 废弃路由中间件
 *
 * 用于标记已废弃的 API 版本，向客户端发出警告并记录使用情况
 *
 * 功能特性：
 * - 添加标准的 Deprecation HTTP 响应头
 * - 记录废弃 API 的访问日志（包括用户 ID、路径、时间戳）
 * - 支持不同的废弃级别（warning、sunset）
 * - 可配置废弃时间和替代 API 路径
 * - 支持自定义警告消息
 *
 * @example
 * ```typescript
 * // 标记 API 为已废弃（警告级别）
 * router.get('/old-endpoint',
 *   deprecationMiddleware({
 *     level: 'warning',
 *     deprecatedAt: new Date('2024-01-01'),
 *     sunset: new Date('2024-06-01'),
 *     alternative: '/api/v2/new-endpoint',
 *     message: '请迁移到新版 API'
 *   }),
 *   handler
 * );
 *
 * // 标记 API 即将下线（sunset 级别）
 * router.get('/legacy-endpoint',
 *   deprecationMiddleware({
 *     level: 'sunset',
 *     sunset: new Date('2024-03-01'),
 *     alternative: '/api/v2/replacement'
 *   }),
 *   handler
 * );
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { AuthRequest } from '../types';

/**
 * 废弃级别
 * - warning: 警告级别，API 仍可正常使用，建议迁移
 * - sunset: 日落级别，API 即将下线，强烈建议迁移
 */
export type DeprecationLevel = 'warning' | 'sunset';

/**
 * 废弃配置选项
 */
export interface DeprecationOptions {
  /**
   * 废弃级别
   * @default 'warning'
   */
  level?: DeprecationLevel;

  /**
   * API 废弃的时间点（RFC 7231 格式）
   * 该时间点标识 API 正式被标记为废弃
   */
  deprecatedAt?: Date;

  /**
   * API 下线时间（RFC 7231 格式）
   * 该时间点之后 API 将不再可用
   * 对应标准的 Sunset HTTP 响应头
   */
  sunset?: Date;

  /**
   * 替代 API 的路径
   * 推荐客户端迁移到的新版本 API
   * 对应标准的 Link HTTP 响应头
   */
  alternative?: string;

  /**
   * 自定义警告消息
   * 如果不提供，将使用默认消息
   */
  message?: string;

  /**
   * 是否记录到日志
   * @default true
   */
  enableLogging?: boolean;
}

/**
 * 废弃日志条目
 */
interface DeprecationLogEntry {
  /** 废弃级别 */
  level: DeprecationLevel;
  /** HTTP 方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 用户 ID（如果已认证） */
  userId?: string;
  /** 访问时间 */
  timestamp: string;
  /** 客户端 IP */
  clientIp?: string;
  /** User-Agent */
  userAgent?: string;
  /** 替代 API */
  alternative?: string;
  /** 下线时间 */
  sunset?: string;
}

/**
 * 将日期转换为 RFC 7231 格式（HTTP-date）
 * 示例: "Sun, 06 Nov 1994 08:49:37 GMT"
 */
function toHttpDate(date: Date): string {
  return date.toUTCString();
}

function containsInvalidHeaderChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const charCode = value.charCodeAt(i);

    // 允许 HTAB（\t）
    if (charCode === 0x09) continue;

    // 允许可见 ASCII 与空格（SP）
    if (charCode >= 0x20 && charCode <= 0x7e) continue;

    // 允许 obs-text（0x80-0xFF），与 Node.js 的 header 校验规则一致
    if (charCode >= 0x80 && charCode <= 0xff) continue;

    return true;
  }

  return false;
}

function toSafeHeaderValue(value: string): { value: string; encoded: boolean } {
  if (!containsInvalidHeaderChar(value)) {
    return { value, encoded: false };
  }

  return { value: encodeURI(value), encoded: true };
}

/**
 * 生成默认的废弃警告消息
 */
function generateDefaultMessage(options: DeprecationOptions): string {
  const { level, deprecatedAt, sunset, alternative } = options;

  const parts: string[] = [];

  if (level === 'sunset') {
    parts.push('此 API 即将下线');
  } else {
    parts.push('此 API 已废弃');
  }

  if (deprecatedAt) {
    const dateStr = toHttpDate(deprecatedAt);
    parts.push(`（废弃于 ${dateStr}）`);
  }

  if (sunset) {
    const dateStr = toHttpDate(sunset);
    if (level === 'sunset') {
      parts.push(`，将于 ${dateStr} 下线`);
    } else {
      parts.push(`，计划于 ${dateStr} 下线`);
    }
  }

  if (alternative) {
    parts.push(`，请迁移至 ${alternative}`);
  } else {
    parts.push('，请联系开发团队获取迁移指引');
  }

  return parts.join('');
}

/**
 * 记录废弃 API 访问日志
 */
function logDeprecationUsage(req: Request | AuthRequest, options: DeprecationOptions): void {
  const logEntry: DeprecationLogEntry = {
    level: options.level || 'warning',
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
    clientIp: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    alternative: options.alternative,
    sunset: options.sunset ? toHttpDate(options.sunset) : undefined,
  };

  // 尝试获取用户 ID（如果请求经过了认证中间件）
  const authReq = req as AuthRequest;
  if (authReq.user?.id) {
    logEntry.userId = authReq.user.id;
  }

  // 根据级别选择不同的日志级别
  if (options.level === 'sunset') {
    logger.warn(
      {
        deprecation: logEntry,
        module: 'deprecation',
      },
      `[Deprecation] Sunset API 被访问: ${req.method} ${req.path}`,
    );
  } else {
    logger.info(
      {
        deprecation: logEntry,
        module: 'deprecation',
      },
      `[Deprecation] 已废弃 API 被访问: ${req.method} ${req.path}`,
    );
  }
}

/**
 * 创建废弃中间件
 *
 * @param options - 废弃配置选项
 * @returns Express 中间件函数
 *
 * @example
 * ```typescript
 * const deprecationWarning = deprecationMiddleware({
 *   level: 'warning',
 *   deprecatedAt: new Date('2024-01-01'),
 *   sunset: new Date('2024-06-01'),
 *   alternative: '/api/v2/users'
 * });
 *
 * router.get('/api/v1/users', deprecationWarning, getUsersHandler);
 * ```
 */
export function deprecationMiddleware(
  options: DeprecationOptions = {},
): (req: Request, res: Response, next: NextFunction) => void {
  // 合并默认选项
  const config: Required<DeprecationOptions> = {
    level: options.level || 'warning',
    deprecatedAt: options.deprecatedAt || new Date(),
    sunset: options.sunset || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 默认 180 天后
    alternative: options.alternative || '',
    message: options.message || '',
    enableLogging: options.enableLogging !== false,
  };

  // 如果没有自定义消息，生成默认消息
  if (!config.message) {
    config.message = generateDefaultMessage(config);
  }

  return function deprecationHandler(req: Request, res: Response, next: NextFunction): void {
    // 1. 添加 Deprecation 响应头（草案标准）
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header
    res.setHeader('Deprecation', toHttpDate(config.deprecatedAt));

    // 2. 添加 Sunset 响应头（RFC 8594）
    // https://datatracker.ietf.org/doc/html/rfc8594
    if (config.sunset) {
      res.setHeader('Sunset', toHttpDate(config.sunset));
    }

    // 3. 添加 Link 响应头指向替代 API（RFC 8288）
    // https://datatracker.ietf.org/doc/html/rfc8288
    if (config.alternative) {
      res.setHeader('Link', `<${config.alternative}>; rel="successor-version"`);
    }

    // 4. 添加自定义警告响应头（便于客户端解析）
    const safeMessage = toSafeHeaderValue(config.message);
    res.setHeader('X-API-Deprecation-Message', safeMessage.value);
    if (safeMessage.encoded) {
      res.setHeader('X-API-Deprecation-Message-Encoding', 'utf-8,percent-encoded');
    }
    res.setHeader('X-API-Deprecation-Level', config.level);

    // 5. 记录访问日志
    if (config.enableLogging) {
      logDeprecationUsage(req, config);
    }

    // 6. 继续处理请求
    next();
  };
}

/**
 * 预定义的废弃中间件工厂函数
 */

/**
 * 创建警告级别的废弃中间件
 * API 仍可正常使用，建议客户端迁移
 *
 * @param alternative - 替代 API 路径
 * @param sunset - 下线时间（可选）
 */
export function createDeprecationWarning(
  alternative: string,
  sunset?: Date,
): ReturnType<typeof deprecationMiddleware> {
  return deprecationMiddleware({
    level: 'warning',
    alternative,
    sunset: sunset || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 默认 6 个月后
  });
}

/**
 * 创建日落级别的废弃中间件
 * API 即将下线，强烈建议客户端立即迁移
 *
 * @param sunset - 下线时间（必需）
 * @param alternative - 替代 API 路径（必需）
 */
export function createSunsetWarning(
  sunset: Date,
  alternative: string,
): ReturnType<typeof deprecationMiddleware> {
  return deprecationMiddleware({
    level: 'sunset',
    sunset,
    alternative,
  });
}

/**
 * 立即废弃中间件
 * 用于已经到达下线时间的 API，返回 410 Gone
 *
 * @param alternative - 替代 API 路径
 * @param message - 自定义错误消息
 */
export function immediateDeprecation(
  alternative: string,
  message?: string,
): (req: Request, res: Response) => void {
  return function immediateDeprecationHandler(req: Request, res: Response): void {
    // 记录尝试访问已下线的 API
    logger.warn(
      {
        method: req.method,
        path: req.path,
        clientIp: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
        userId: (req as AuthRequest).user?.id,
        module: 'deprecation',
      },
      `[Deprecation] 已下线的 API 被访问: ${req.method} ${req.path}`,
    );

    // 添加响应头
    res.setHeader('Link', `<${alternative}>; rel="successor-version"`);

    // 返回 410 Gone
    res.status(410).json({
      success: false,
      error: message || '此 API 已下线，请使用新版 API',
      code: 'API_GONE',
      alternative,
    });
  };
}

/**
 * 批量应用废弃中间件的辅助函数
 *
 * @example
 * ```typescript
 * // 为整个路由器应用废弃警告
 * const router = express.Router();
 * applyDeprecationToRouter(router, {
 *   level: 'warning',
 *   alternative: '/api/v2',
 *   sunset: new Date('2024-12-31')
 * });
 * ```
 */
export function applyDeprecationToRouter(
  router: { use: (middleware: (req: Request, res: Response, next: NextFunction) => void) => void },
  options: DeprecationOptions,
): void {
  router.use(deprecationMiddleware(options));
}
