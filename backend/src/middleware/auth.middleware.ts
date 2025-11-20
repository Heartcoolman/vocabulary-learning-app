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
    return res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : '无效的认证令牌',
      code: 'UNAUTHORIZED',
    });
  }
}
