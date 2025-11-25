import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

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
  // 仅在开发环境打印完整错误堆栈
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', err);
  } else {
    console.error('Error:', err.message);
  }

  // Zod 验证错误
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: err.errors[0]?.message || '请求参数不合法',
      code: 'VALIDATION_ERROR',
    });
  }

  // 结构化应用错误
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.isOperational ? err.message : '服务器内部错误',
      code: err.code,
    });
  }

  // 兼容旧代码：根据错误消息推断错误类型
  if (err.message) {
    const appError = inferAppError(err.message);
    return res.status(appError.statusCode).json({
      success: false,
      error: appError.message,
      code: appError.code,
    });
  }

  // 未知错误，返回通用错误信息（不泄露内部细节）
  return res.status(500).json({
    success: false,
    error: '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
}
