import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import authService from '../services/auth.service';

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const user = await authService.verifyToken(token);
    req.user = user;

    next();
  } catch (error) {
    // 仅记录内部错误，不向客户端泄露详细信息
    if (process.env.NODE_ENV !== 'production') {
      console.error('Auth error:', error instanceof Error ? error.message : error);
    }
    return res.status(401).json({
      success: false,
      error: '认证失败，请重新登录',
      code: 'UNAUTHORIZED',
    });
  }
}
