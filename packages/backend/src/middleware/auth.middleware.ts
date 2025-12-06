import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import authService from '../services/auth.service';
import { logger } from '../logger';

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn({ path: req.path, hasAuth: !!authHeader }, '[Auth] 未提供认证令牌');
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.replace('Bearer ', '');
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
    const authHeader = req.headers.authorization;

    // 没有 token，允许继续但不设置 user
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.debug({ path: req.path }, '[Auth] 可选认证：未提供 token，继续处理');
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
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
