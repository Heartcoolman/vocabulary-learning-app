/**
 * CSRF 防护中间件
 *
 * 实现双重 Cookie 提交模式防护 CSRF 攻击
 * 原理：
 * 1. 服务器设置一个 CSRF token cookie（非 HttpOnly，前端可读）
 * 2. 前端在发送状态修改请求时，将 token 放入请求头
 * 3. 服务器验证 cookie 中的 token 和 header 中的 token 是否匹配
 *
 * 配合 SameSite Cookie 提供双重防护
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../logger';

const csrfLogger = logger.child({ module: 'csrf' });

// ==================== 配置 ====================

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

// 豁免 CSRF 验证的路径前缀
const CSRF_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/health',
  '/metrics',
];

// ==================== 工具函数 ====================

/**
 * 生成 CSRF Token
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * 安全比较两个字符串（防止时序攻击）
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * 检查路径是否豁免 CSRF 验证
 */
function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATHS.some((exempt) => path.startsWith(exempt));
}

// ==================== 中间件 ====================

/**
 * CSRF Token 设置中间件
 * 为每个响应设置 CSRF cookie（如果不存在）
 */
export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // 如果已有 CSRF token，跳过
    if (req.cookies?.[CSRF_COOKIE_NAME]) {
      next();
      return;
    }

    // 生成新的 CSRF token
    const token = generateCsrfToken();

    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // 前端需要读取
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 小时
      path: '/',
    });

    next();
  } catch (error) {
    csrfLogger.error({ error }, 'Failed to set CSRF token');
    next();
  }
}

/**
 * CSRF 验证中间件
 * 验证状态修改请求的 CSRF token
 */
export function csrfValidationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 只验证状态修改请求（POST, PUT, DELETE, PATCH）
  const shouldValidate = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);

  if (!shouldValidate) {
    next();
    return;
  }

  // 检查豁免路径
  if (isExemptPath(req.path)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  // 验证 token 存在且匹配
  if (!cookieToken || !headerToken) {
    csrfLogger.warn(
      {
        path: req.path,
        method: req.method,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken,
        ip: req.ip,
      },
      'CSRF token missing',
    );

    res.status(403).json({
      success: false,
      error: 'CSRF token 验证失败',
      code: 'CSRF_TOKEN_MISSING',
    });
    return;
  }

  if (!secureCompare(cookieToken, headerToken)) {
    csrfLogger.warn(
      {
        path: req.path,
        method: req.method,
        ip: req.ip,
      },
      'CSRF token mismatch',
    );

    res.status(403).json({
      success: false,
      error: 'CSRF token 验证失败',
      code: 'CSRF_TOKEN_MISMATCH',
    });
    return;
  }

  next();
}

/**
 * 获取当前请求的 CSRF token（用于返回给前端）
 */
export function getCsrfToken(req: Request): string | null {
  return req.cookies?.[CSRF_COOKIE_NAME] ?? null;
}

/**
 * 刷新 CSRF token
 * 在敏感操作后调用，强制生成新的 token
 */
export function refreshCsrfToken(res: Response): string {
  const token = generateCsrfToken();

  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  return token;
}

// ==================== 导出 ====================

export default {
  csrfTokenMiddleware,
  csrfValidationMiddleware,
  getCsrfToken,
  refreshCsrfToken,
};
