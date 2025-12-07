import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import authService from '../services/auth.service';
import { logger } from '../logger';

/**
 * 从请求中提取认证 token
 * 优先从 HttpOnly Cookie 读取，回退到 Authorization Header
 */
function extractToken(req: AuthRequest): string | null {
  // 优先从 Cookie 读取 (HttpOnly Cookie 更安全)
  const cookieToken = req.cookies?.auth_token;
  if (cookieToken) {
    return cookieToken;
  }

  // 回退到 Authorization Header (保持向后兼容)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);

    if (!token) {
      logger.warn({ path: req.path }, '[Auth] 未提供认证令牌');
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌',
        code: 'UNAUTHORIZED',
      });
    }

    logger.debug({ path: req.path, tokenLength: token.length }, '[Auth] 验证 token');

    const user = await authService.verifyToken(token);
    req.user = user;
    logger.debug({ path: req.path, userId: user.id }, '[Auth] 验证成功');

    next();
  } catch (error) {
    // 记录详细错误信息用于调试
    logger.error(
      {
        err: error,
        path: req.path,
        message: error instanceof Error ? error.message : String(error)
      },
      '[Auth] 认证失败'
    );
    return res.status(401).json({
      success: false,
      error: '认证失败，请重新登录',
      code: 'UNAUTHORIZED',
    });
  }
}

/**
 * 可选认证中间件
 * 如果有 token 就验证并设置 req.user，如果没有 token 也允许继续（但 req.user 为 undefined）
 */
export async function optionalAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);

    // 没有 token，允许继续但不设置 user
    if (!token) {
      logger.debug({ path: req.path }, '[Auth] 可选认证：未提供 token，继续处理');
      return next();
    }

    logger.debug({ path: req.path, tokenLength: token.length }, '[Auth] 可选认证：验证 token');

    const user = await authService.verifyToken(token);
    req.user = user;
    logger.debug({ path: req.path, userId: user.id }, '[Auth] 可选认证：验证成功');

    next();
  } catch (error) {
    // token 无效时，记录警告但仍允许继续（不设置 user）
    logger.warn(
      {
        err: error,
        path: req.path,
        message: error instanceof Error ? error.message : String(error)
      },
      '[Auth] 可选认证：token 验证失败，继续处理'
    );
    next();
  }
}
