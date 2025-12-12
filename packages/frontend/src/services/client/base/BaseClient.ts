import { env } from '../../../config/env';
import TokenManager from './TokenManager';
import { ApiError, ApiResponse, IHttpClient, HttpRequestOptions } from './types';

// 重新导出类型，保持向后兼容
export { ApiError } from './types';
export type { ApiResponse } from './types';

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
 * BaseClient 构造选项
 */
export interface BaseClientOptions {
  /** 基础 URL */
  baseUrl?: string;
  /** HTTP 客户端实例（用于依赖注入） */
  httpClient?: IHttpClient;
}

/**
 * BaseClient - 所有API客户端的基类
 *
 * 职责：
 * - 提供统一的HTTP请求方法
 * - 处理认证令牌
 * - 处理请求超时
 * - 统一错误处理
 * - 管理401未授权回调
 *
 * 支持两种使用方式：
 * 1. 传统方式：直接使用内置的请求方法
 * 2. 依赖注入方式：通过构造函数注入 IHttpClient
 */
export abstract class BaseClient {
  protected baseUrl: string;
  protected tokenManager: TokenManager;
  protected onUnauthorizedCallback: (() => void) | null = null;
  protected defaultTimeout: number = DEFAULT_TIMEOUT;

  /** 注入的 HTTP 客户端（可选） */
  protected httpClient: IHttpClient | null = null;

  /**
   * 构造函数
   * @param baseUrlOrOptions 基础 URL 字符串或配置选项对象
   *
   * 支持两种调用方式（向后兼容）：
   * - new Client('http://api.example.com') - 传统方式
   * - new Client({ baseUrl: '...', httpClient: ... }) - 依赖注入方式
   */
  constructor(baseUrlOrOptions?: string | BaseClientOptions) {
    // 处理向后兼容：支持字符串参数或配置对象
    if (typeof baseUrlOrOptions === 'string') {
      this.baseUrl = baseUrlOrOptions;
      this.httpClient = null;
    } else if (baseUrlOrOptions) {
      this.baseUrl = baseUrlOrOptions.baseUrl ?? env.apiUrl;
      this.httpClient = baseUrlOrOptions.httpClient ?? null;
    } else {
      this.baseUrl = env.apiUrl;
      this.httpClient = null;
    }

    this.tokenManager = TokenManager.getInstance();

    // 如果提供了 httpClient，同步 onUnauthorized 回调
    if (this.httpClient) {
      this.httpClient.setOnUnauthorized(this.onUnauthorizedCallback);
    }
  }

  /**
   * 设置401未授权回调
   * 当请求返回401时，会调用此回调通知外部（如AuthContext）更新登录状态
   */
  setOnUnauthorized(callback: (() => void) | null): void {
    this.onUnauthorizedCallback = callback;
    // 同步到注入的 httpClient
    if (this.httpClient) {
      this.httpClient.setOnUnauthorized(callback);
    }
  }

  /**
   * 从响应体中提取错误信息
   * 优先提取 JSON 格式的 error/message 字段，失败则回退到默认信息
   */
  private async extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
    try {
      // 检查响应体是否已被读取
      if (response.bodyUsed) {
        return fallbackMessage;
      }

      // 读取响应文本
      const text = await response.text();
      if (!text || !text.trim()) {
        return fallbackMessage;
      }

      // 尝试解析 JSON
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        const errorMessage = parsed.error || parsed.message;
        if (typeof errorMessage === 'string' && errorMessage.trim()) {
          return errorMessage.trim();
        }
      } catch {
        // 非 JSON 响应，检查是否为 HTML
        if (text.trim().startsWith('<')) {
          return fallbackMessage;
        }
        // 返回纯文本（截取前 200 字符避免过长）
        return text.trim().substring(0, 200);
      }

      return fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  /**
   * 通用请求方法
   * @param endpoint API 端点
   * @param options 请求选项
   * @param timeout 超时时间（毫秒），默认 30 秒
   *
   * 如果注入了 httpClient，则委托给 httpClient 处理；
   * 否则使用内置的 fetch 实现（向后兼容）
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout,
  ): Promise<T> {
    // 如果注入了 httpClient，委托给它处理
    if (this.httpClient) {
      return this.httpClient.request<T>(endpoint, { ...options, timeout });
    }

    // 向后兼容：使用内置实现
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    const token = this.tokenManager.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 对于状态修改请求（POST, PUT, DELETE, PATCH），添加 CSRF Token
    const method = (options.method || 'GET').toUpperCase();
    if (CSRF_METHODS.includes(method)) {
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 如果外部传入了 signal，监听其 abort 事件并联动
    const abortHandler = () => controller.abort(options.signal!.reason);
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include', // 启用 HttpOnly Cookie 认证
        signal: controller.signal,
      });

      // 处理 401 错误，清除令牌并触发回调
      if (response.status === 401) {
        this.tokenManager.clearToken();
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        const errorMessage = await this.extractErrorMessage(response, '认证失败，请重新登录');
        throw new ApiError(errorMessage, 401, 'UNAUTHORIZED');
      }

      // 处理空响应（204 No Content 或其他无内容响应）
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        if (!response.ok) {
          throw new ApiError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      // 检查响应类型是否为 JSON
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
        // 处理超时错误
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接');
        }
        throw error;
      }
      throw new Error('网络请求失败');
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * 通用请求方法 - 返回完整响应体（包含 data 和其他字段如 pagination）
   * 用于需要访问响应体中除 data 外其他字段的场景
   *
   * 如果注入了 httpClient，则委托给 httpClient 处理；
   * 否则使用内置的 fetch 实现（向后兼容）
   */
  protected async requestFull<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout,
  ): Promise<T> {
    // 如果注入了 httpClient，委托给它处理
    if (this.httpClient) {
      return this.httpClient.requestFull<T>(endpoint, { ...options, timeout });
    }

    // 向后兼容：使用内置实现
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    const token = this.tokenManager.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const abortHandler = () => controller.abort(options.signal!.reason);
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      if (response.status === 401) {
        this.tokenManager.clearToken();
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        const errorMessage = await this.extractErrorMessage(response, '认证失败，请重新登录');
        throw new ApiError(errorMessage, 401, 'UNAUTHORIZED');
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
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
