import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

/**
 * 结构化应用错误类
 * 用于区分可预期的业务错误和系统错误，避免泄露内部实现细节
 */
export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = 'BAD_REQUEST',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // 常用错误工厂方法
  static notFound(message: string = '资源不存在'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static unauthorized(message: string = '未授权'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string = '权限不足'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static conflict(message: string = '资源冲突'): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  static badRequest(message: string = '请求参数错误'): AppError {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  static internal(message: string = '服务器内部错误'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR', false);
  }
}

/**
 * 根据错误消息推断错误类型（兼容旧代码）
 * 用于处理服务层直接 throw new Error() 的情况
 */
function inferAppError(message: string): AppError {
  if (message.includes('不存在')) {
    return AppError.notFound(message);
  }
  if (message.includes('已被注册') || message.includes('已存在')) {
    return AppError.conflict(message);
  }
  if (message.includes('无权') || message.includes('令牌') || message.includes('密码错误')) {
    return AppError.unauthorized(message);
  }
  return AppError.badRequest(message);
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // 优先使用 req.log（pino-http 注入的带上下文日志器），fallback 到全局 logger
  const log = req.log ?? logger;
  const logContext = {
    err,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
  };

  // Zod 验证错误 - 业务级别警告
  if (err instanceof ZodError) {
    log.warn(logContext, `参数验证错误: ${err.errors[0]?.message}`);
    return res.status(400).json({
      success: false,
      error: err.errors[0]?.message || '请求参数不合法',
      code: 'VALIDATION_ERROR',
    });
  }

  // 结构化应用错误 - 根据 isOperational 区分日志级别
  if (err instanceof AppError) {
    if (err.isOperational) {
      log.warn(logContext, `业务错误: ${err.message}`);
    } else {
      log.error(logContext, `系统错误: ${err.message}`);
    }
    return res.status(err.statusCode).json({
      success: false,
      error: err.isOperational ? err.message : '服务器内部错误',
      code: err.code,
    });
  }

  // 未知错误 - 统一返回 500，不泄露内部实现细节
  // 仅记录完整错误信息到日志，对外使用通用文案
  log.error(logContext, `未处理错误: ${err.message}`);
  return res.status(500).json({
    success: false,
    error: '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
}
