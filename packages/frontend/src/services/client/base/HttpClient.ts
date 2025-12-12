import { env } from '../../../config/env';
import TokenManager from './TokenManager';
import { ApiError, ApiResponse, IHttpClient, HttpRequestOptions } from './types';

// 重新导出类型，方便外部使用
export type { IHttpClient, HttpRequestOptions, ApiResponse } from './types';
export { ApiError } from './types';

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

/** CSRF Cookie 名称 */
const CSRF_COOKIE_NAME = 'csrf_token';

/** CSRF Header 名称 */
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** 需要 CSRF Token 的 HTTP 方法 */
const CSRF_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

/**
 * 从 Cookie 中获取 CSRF Token
 */
function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * 默认 HTTP 客户端实现
 * 基于 Fetch API 实现的 HTTP 客户端
 */
export class FetchHttpClient implements IHttpClient {
  private baseUrl: string;
  private tokenManager: TokenManager;
  private onUnauthorizedCallback: (() => void) | null = null;
  private defaultTimeout: number = DEFAULT_TIMEOUT;

  constructor(baseUrl: string = env.apiUrl) {
    this.baseUrl = baseUrl;
    this.tokenManager = TokenManager.getInstance();
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setOnUnauthorized(callback: (() => void) | null): void {
    this.onUnauthorizedCallback = callback;
  }

  /**
   * 从响应体中提取错误信息
   */
  private async extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
    try {
      if (response.bodyUsed) {
        return fallbackMessage;
      }

      const text = await response.text();
      if (!text || !text.trim()) {
        return fallbackMessage;
      }

      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        const errorMessage = parsed.error || parsed.message;
        if (typeof errorMessage === 'string' && errorMessage.trim()) {
          return errorMessage.trim();
        }
      } catch {
        if (text.trim().startsWith('<')) {
          return fallbackMessage;
        }
        return text.trim().substring(0, 200);
      }

      return fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  /**
   * 构建请求头
   */
  private buildHeaders(options: HttpRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    const token = this.tokenManager.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 对于状态修改请求，添加 CSRF Token
    const method = (options.method || 'GET').toUpperCase();
    if (CSRF_METHODS.includes(method)) {
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    return headers;
  }

  /**
   * 创建带超时的 AbortController
   */
  private createTimeoutController(
    timeout: number,
    externalSignal?: AbortSignal | null,
  ): {
    controller: AbortController;
    timeoutId: ReturnType<typeof setTimeout>;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let abortHandler: (() => void) | null = null;
    if (externalSignal) {
      abortHandler = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', abortHandler);
    }

    return {
      controller,
      timeoutId,
      cleanup: () => {
        clearTimeout(timeoutId);
        if (externalSignal && abortHandler) {
          externalSignal.removeEventListener('abort', abortHandler);
        }
      },
    };
  }

  /**
   * 处理 401 错误
   */
  private async handle401Error(response: Response): Promise<never> {
    this.tokenManager.clearToken();
    if (this.onUnauthorizedCallback) {
      this.onUnauthorizedCallback();
    }
    const errorMessage = await this.extractErrorMessage(response, '认证失败，请重新登录');
    throw new ApiError(errorMessage, 401, 'UNAUTHORIZED');
  }

  async request<T>(endpoint: string, options: HttpRequestOptions = {}): Promise<T> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const headers = this.buildHeaders(options);
    const { controller, cleanup } = this.createTimeoutController(timeout, options.signal);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      // 处理 401 错误
      if (response.status === 401) {
        return this.handle401Error(response);
      }

      // 处理空响应
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        if (!response.ok) {
          throw new ApiError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      // 检查响应类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new ApiError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      const data: ApiResponse<T> = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.error || `请求失败: ${response.status}`,
          response.status,
          data.code,
        );
      }

      if (!data.success) {
        throw new ApiError(data.error || '请求失败', response.status, data.code);
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接');
        }
        throw error;
      }
      throw new Error('网络请求失败');
    } finally {
      cleanup();
    }
  }

  async requestFull<T>(endpoint: string, options: HttpRequestOptions = {}): Promise<T> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const headers = this.buildHeaders(options);
    const { controller, cleanup } = this.createTimeoutController(timeout, options.signal);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      // 处理 401 错误
      if (response.status === 401) {
        return this.handle401Error(response);
      }

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const body = await response.json();

      if (!body.success) {
        throw new Error(body.error || '请求失败');
      }

      return body as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接');
        }
        throw error;
      }
      throw new Error('网络请求失败');
    } finally {
      cleanup();
    }
  }
}

/**
 * 创建 HTTP 客户端实例
 * @param baseUrl 基础 URL，默认使用环境变量中的 API URL
 * @returns IHttpClient 实例
 */
export function createHttpClient(baseUrl?: string): IHttpClient {
  return new FetchHttpClient(baseUrl);
}

/**
 * 默认的 HTTP 客户端单例
 */
export const defaultHttpClient = createHttpClient();
