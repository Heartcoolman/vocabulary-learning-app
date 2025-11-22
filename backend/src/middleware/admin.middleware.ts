import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { UserRole } from '@prisma/client';

/**
 * 管理员权限中间件
 * 验证用户是否为管理员
 */
export const adminMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: '未登录',
                code: 'UNAUTHORIZED',
            });
        }

        // 检查用户角色
        // Note: AuthUser 接口需要添加 role 字段
        const userRole = (req.user as any).role;

        if (userRole !== UserRole.ADMIN && userRole !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                error: '权限不足，需要管理员权限',
                code: 'FORBIDDEN',
            });
        }

        next();
    } catch (error) {
        next(error);
    }
};
