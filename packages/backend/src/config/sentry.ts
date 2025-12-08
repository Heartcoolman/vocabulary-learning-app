/**
 * Sentry 错误追踪服务配置（后端）
 *
 * 用于后端错误监控和性能追踪
 * 仅在配置了 SENTRY_DSN 时启用
 */

import * as Sentry from '@sentry/node';
import { Express, Request, Response, NextFunction } from 'express';
import { startupLogger } from '../logger';
import { env } from './env';

let isInitialized = false;

/**
 * 初始化 Sentry
 * @returns 是否成功初始化
 */
export function initSentry(): boolean {
  const dsn = env.SENTRY_DSN;

  // 未配置 DSN 时跳过初始化
  if (!dsn) {
    startupLogger.info('[Sentry] DSN not configured, skipping initialization');
    return false;
  }

  const environment = env.NODE_ENV;
  const release = env.APP_VERSION || 'unknown';

  try {
    Sentry.init({
      dsn,
      environment,
      release: `danci-backend@${release}`,

      // 性能监控配置
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 生产环境采样 10%

      // 集成配置
      integrations: [
        // HTTP 追踪集成
        Sentry.httpIntegration(),
        // Express 集成
        Sentry.expressIntegration(),
        // 数据库追踪（Prisma）
        Sentry.prismaIntegration(),
      ],

      // 错误过滤
      beforeSend(event, hint) {
        const error = hint.originalException;

        // 过滤 401 未授权错误（正常业务流程）
        if (error instanceof Error && error.message.includes('认证失败')) {
          return null;
        }

        // 过滤 404 错误
        if (error instanceof Error && error.message.includes('接口不存在')) {
          return null;
        }

        // 过滤限流错误（429）
        if (error instanceof Error && error.message.includes('请求过于频繁')) {
          return null;
        }

        return event;
      },

      // 敏感信息脱敏
      beforeBreadcrumb(breadcrumb) {
        // 过滤敏感请求数据
        if (breadcrumb.category === 'http') {
          const url = breadcrumb.data?.url;
          if (url && (url.includes('/auth/') || url.includes('password'))) {
            breadcrumb.data = {
              ...breadcrumb.data,
              body: '[REDACTED]',
            };
          }
        }
        return breadcrumb;
      },

      // 启用调试模式（开发环境）
      debug: environment === 'development',
    });

    isInitialized = true;
    startupLogger.info(
      `[Sentry] Initialized successfully (env: ${environment}, release: ${release})`,
    );
    return true;
  } catch (error) {
    startupLogger.error({ err: error }, '[Sentry] Failed to initialize');
    return false;
  }
}

/**
 * 检查 Sentry 是否已初始化
 */
export function isSentryInitialized(): boolean {
  return isInitialized;
}

/**
 * 设置 Express 错误处理器
 * 应该在所有路由之后调用
 */
export function setupExpressErrorHandler(app: Express): void {
  if (!isInitialized) {
    return;
  }
  Sentry.setupExpressErrorHandler(app);
}

/**
 * 设置用户上下文
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  if (!isInitialized) return;

  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * 添加额外上下文
 */
export function setContext(name: string, context: Record<string, unknown>): void {
  if (!isInitialized) return;
  Sentry.setContext(name, context);
}

/**
 * 添加面包屑
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void {
  if (!isInitialized) return;
  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'custom',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
  });
}

/**
 * 手动捕获错误
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>,
): string | undefined {
  if (!isInitialized) return undefined;
  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * 手动捕获消息
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
): string | undefined {
  if (!isInitialized) return undefined;
  return Sentry.captureMessage(message, level);
}

/**
 * 创建性能 Span
 */
export function startSpan<T>(name: string, op: string, callback: () => T): T {
  if (!isInitialized) {
    return callback();
  }
  return Sentry.startSpan({ name, op }, callback);
}

/**
 * 确保所有事件已发送（用于优雅关闭）
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  if (!isInitialized) return true;
  return Sentry.flush(timeout);
}

/**
 * 关闭 Sentry 客户端
 */
export async function close(timeout: number = 2000): Promise<boolean> {
  if (!isInitialized) return true;
  return Sentry.close(timeout);
}

/**
 * 导出 Sentry SDK 以便直接使用
 */
export { Sentry };
