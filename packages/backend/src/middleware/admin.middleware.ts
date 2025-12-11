/**
 * 管理员权限中间件
 *
 * 功能：
 * 1. 验证用户是否为管理员
 * 2. 记录管理员访问审计日志
 * 3. 记录权限拒绝事件
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { UserRole } from '@prisma/client';
import { logger } from '../logger';

// 创建专门的审计日志记录器
const adminAuditLogger = logger.child({ module: 'admin-audit' });

/**
 * 管理员权限中间件（带审计日志）
 * 验证用户是否为管理员，并记录访问尝试
 */
export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      // 记录未授权访问尝试
      adminAuditLogger.warn(
        {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
        },
        'Unauthorized admin access attempt - no user',
      );

      return res.status(401).json({
        success: false,
        error: '未登录',
        code: 'UNAUTHORIZED',
      });
    }

    // 检查用户角色（类型安全）
    const userRole = req.user.role;

    if (userRole !== UserRole.ADMIN) {
      // 记录权限不足的访问尝试
      adminAuditLogger.warn(
        {
          userId: req.user.id,
          username: req.user.username,
          role: userRole,
          ip: req.ip,
          path: req.path,
          method: req.method,
        },
        'Forbidden admin access attempt - insufficient privileges',
      );

      return res.status(403).json({
        success: false,
        error: '权限不足，需要管理员权限',
        code: 'FORBIDDEN',
      });
    }

    // 记录成功的管理员访问
    adminAuditLogger.info(
      {
        userId: req.user.id,
        username: req.user.username,
        ip: req.ip,
        path: req.path,
        method: req.method,
        query: req.query,
        // 注意：不记录 body 以避免敏感数据泄露
      },
      'Admin access granted',
    );

    next();
  } catch (error) {
    adminAuditLogger.error({ err: error }, 'Admin middleware error');
    next(error);
  }
};

/**
 * 管理员操作后置审计中间件
 * 用于记录管理员操作的结果
 *
 * 使用方式：在 adminMiddleware 之后、路由处理函数之前添加
 */
export const adminAuditMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // 保存原始 json 方法
  const originalJson = res.json.bind(res);

  // 重写 json 方法以记录响应
  res.json = (body: unknown) => {
    // 记录操作结果
    const success = (body as { success?: boolean })?.success ?? res.statusCode < 400;

    adminAuditLogger.info(
      {
        userId: req.user?.id,
        username: req.user?.username,
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        success,
      },
      'Admin operation completed',
    );

    return originalJson(body);
  };

  next();
};

/**
 * 敏感操作审计记录器
 * 用于记录特定的敏感管理员操作
 */
export function logAdminAction(
  userId: string,
  username: string,
  action: string,
  details: Record<string, unknown>,
): void {
  adminAuditLogger.info(
    {
      userId,
      username,
      action,
      ...details,
      timestamp: new Date().toISOString(),
    },
    `Admin action: ${action}`,
  );
}

/**
 * 记录管理员操作失败
 */
export function logAdminActionFailed(
  userId: string,
  username: string,
  action: string,
  error: unknown,
): void {
  adminAuditLogger.error(
    {
      userId,
      username,
      action,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    },
    `Admin action failed: ${action}`,
  );
}
