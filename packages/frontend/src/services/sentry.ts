/**
 * Sentry 错误追踪服务配置
 *
 * 用于前端错误监控和性能追踪
 * 仅在生产环境且配置了 SENTRY_DSN 时启用
 */

import * as Sentry from '@sentry/react';

/**
 * 初始化 Sentry
 * @returns 是否成功初始化
 */
export function initSentry(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  // 未配置 DSN 时跳过初始化
  if (!dsn) {
    console.info('[Sentry] DSN not configured, skipping initialization');
    return false;
  }

  const environment = import.meta.env.MODE || 'development';
  const release = import.meta.env.VITE_APP_VERSION || 'unknown';

  try {
    Sentry.init({
      dsn,
      environment,
      release: `danci-frontend@${release}`,

      // 性能监控配置
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 生产环境采样 10%
      tracePropagationTargets: [
        'localhost',
        /^https:\/\/[^/]*\.danci\.app/,
        /^https:\/\/api\.danci\.app/,
      ],

      // 会话重放配置（可选）
      replaysSessionSampleRate: 0, // 默认关闭会话重放
      replaysOnErrorSampleRate: environment === 'production' ? 0.5 : 0, // 错误时录制 50%

      // 集成配置
      integrations: [
        // 浏览器追踪集成
        Sentry.browserTracingIntegration(),
        // 会话重放集成（仅在生产环境）
        ...(environment === 'production'
          ? [
              Sentry.replayIntegration({
                maskAllText: true,
                blockAllMedia: true,
              }),
            ]
          : []),
      ],

      // 错误过滤
      beforeSend(event, hint) {
        const error = hint.originalException;

        // 过滤网络错误（如断网）
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          return null;
        }

        // 过滤 ResizeObserver 错误（常见的无害错误）
        if (
          error instanceof Error &&
          error.message.includes('ResizeObserver loop')
        ) {
          return null;
        }

        // 过滤取消的请求
        if (error instanceof DOMException && error.name === 'AbortError') {
          return null;
        }

        return event;
      },

      // 敏感信息脱敏
      beforeBreadcrumb(breadcrumb) {
        // 过滤敏感请求数据
        if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
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

    console.info(
      `[Sentry] Initialized successfully (env: ${environment}, release: ${release})`
    );
    return true;
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
    return false;
  }
}

/**
 * 设置用户上下文
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
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
  context?: Record<string, unknown>
): string {
  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * 手动捕获消息
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
): string {
  return Sentry.captureMessage(message, level);
}

/**
 * 创建性能事务
 */
export function startTransaction(name: string, op: string): Sentry.Span | undefined {
  return Sentry.startInactiveSpan({ name, op });
}

/**
 * 错误边界组件
 */
export const ErrorBoundary = Sentry.ErrorBoundary;

/**
 * 导出 Sentry SDK 以便直接使用
 */
export { Sentry };
