import { env } from '../../../config/env';
import TokenManager from './TokenManager';

/**
 * API响应格式
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * API请求错误类型
 * 用于区分"数据不存在"和"请求失败"
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isNotFound: boolean;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || 'UNKNOWN_ERROR';
    this.isNotFound = statusCode === 404;
  }
}

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
 * BaseClient - 所有API客户端的基类
 *
 * 职责：
 * - 提供统一的HTTP请求方法
 * - 处理认证令牌
 * - 处理请求超时
 * - 统一错误处理
 * - 管理401未授权回调
 */
export abstract class BaseClient {
  protected baseUrl: string;
  protected tokenManager: TokenManager;
  protected onUnauthorizedCallback: (() => void) | null = null;
  protected defaultTimeout: number = DEFAULT_TIMEOUT;

  constructor(baseUrl: string = env.apiUrl) {
    this.baseUrl = baseUrl;
    this.tokenManager = TokenManager.getInstance();
  }

  /**
   * 设置401未授权回调
   * 当请求返回401时，会调用此回调通知外部（如AuthContext）更新登录状态
   */
  setOnUnauthorized(callback: (() => void) | null): void {
    this.onUnauthorizedCallback = callback;
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
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout,
  ): Promise<T> {
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
   */
  protected async requestFull<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout,
  ): Promise<T> {
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
