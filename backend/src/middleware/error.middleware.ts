import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  // Zod验证错误
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: err.errors[0].message,
      code: 'VALIDATION_ERROR',
    });
  }

  // 自定义错误消息
  if (err.message) {
    const statusCode = getStatusCodeFromMessage(err.message);
    return res.status(statusCode).json({
      success: false,
      error: err.message,
      code: getErrorCode(err.message),
    });
  }

  // 默认服务器错误
  return res.status(500).json({
    success: false,
    error: '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
}

function getStatusCodeFromMessage(message: string): number {
  if (message.includes('不存在')) return 404;
  if (message.includes('已被注册') || message.includes('已存在')) return 409;
  if (message.includes('无权') || message.includes('令牌') || message.includes('密码错误')) return 401;
  return 400;
}

function getErrorCode(message: string): string {
  if (message.includes('不存在')) return 'NOT_FOUND';
  if (message.includes('已被注册') || message.includes('已存在')) return 'CONFLICT';
  if (message.includes('无权') || message.includes('令牌')) return 'UNAUTHORIZED';
  if (message.includes('密码')) return 'INVALID_CREDENTIALS';
  return 'BAD_REQUEST';
}
