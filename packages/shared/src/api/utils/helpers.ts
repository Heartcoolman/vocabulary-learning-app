/**
 * API工具函数
 */

import type { ApiError, RequestConfig } from '../types/common';

/**
 * 创建AbortController用于请求取消
 */
export function createAbortController(timeout?: number): AbortController {
  const controller = new AbortController();

  if (timeout) {
    setTimeout(() => {
      controller.abort();
    }, timeout);
  }

  return controller;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数退避重试延迟
 */
export function exponentialBackoff(attempt: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000);
}

/**
 * 构建查询字符串
 */
export function buildQueryString(params?: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        searchParams.append(key, value.join(','));
      } else {
        searchParams.append(key, String(value));
      }
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

/**
 * 合并请求配置
 */
export function mergeConfig(
  baseConfig: Partial<RequestConfig>,
  requestConfig: Partial<RequestConfig>,
): RequestConfig {
  return {
    ...baseConfig,
    ...requestConfig,
    headers: {
      ...baseConfig.headers,
      ...requestConfig.headers,
    },
    params: {
      ...baseConfig.params,
      ...requestConfig.params,
    },
  } as RequestConfig;
}

/**
 * 判断是否需要重试
 */
export function shouldRetry(error: ApiError, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) {
    return false;
  }

  // 网络错误或超时错误可以重试
  if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
    return true;
  }

  // 5xx 服务器错误可以重试
  if (error.status && error.status >= 500 && error.status < 600) {
    return true;
  }

  // 429 Too Many Requests 可以重试
  if (error.status === 429) {
    return true;
  }

  return false;
}

/**
 * 解析API错误
 */
export function parseApiError(error: any): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error.name === 'AbortError') {
    return new ApiError('请求已取消', 'REQUEST_CANCELLED', 0);
  }

  if (error.response) {
    const { status, data } = error.response;
    const message = data?.error || data?.message || '请求失败';
    const code = data?.code || 'UNKNOWN_ERROR';
    return new ApiError(message, code, status, data);
  }

  if (error.request) {
    return new ApiError('网络错误，请检查网络连接', 'NETWORK_ERROR', 0);
  }

  return new ApiError(error.message || '未知错误', 'UNKNOWN_ERROR', 0);
}

/**
 * 格式化日期为ISO字符串
 */
export function formatDate(date: Date | string | number): string {
  if (typeof date === 'string') {
    return date;
  }

  if (typeof date === 'number') {
    return new Date(date).toISOString();
  }

  return date.toISOString();
}

/**
 * 安全的JSON解析
 */
export function safeJsonParse<T = any>(json: string, defaultValue?: T): T | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

/**
 * 获取认证Token
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

/**
 * 设置认证Token
 */
export function setAuthToken(token: string, remember: boolean = true): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (remember) {
    localStorage.setItem('auth_token', token);
  } else {
    sessionStorage.setItem('auth_token', token);
  }
}

/**
 * 清除认证Token
 */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
}

/**
 * 日志工具
 */
export const logger = {
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[API Debug]', ...args);
    }
  },
  info: (...args: any[]) => {
    console.info('[API Info]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[API Warn]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[API Error]', ...args);
  },
};
