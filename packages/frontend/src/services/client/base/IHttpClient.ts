/**
 * HTTP 客户端接口定义
 *
 * 提供统一的 HTTP 请求抽象，支持不同运行环境的实现：
 * - Web 环境：使用原生 fetch API
 * - Tauri 环境：使用 @tauri-apps/plugin-http
 *
 * 设计原则：
 * 1. 接口统一：所有实现遵循相同的 API 规范
 * 2. 类型安全：完整的 TypeScript 类型定义
 * 3. 异步优先：Token 操作支持异步存储（如 Tauri Store）
 */

// ===================== 类型定义 =====================

/**
 * HTTP 请求方法类型
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * 请求配置选项
 */
export interface RequestOptions {
  /** HTTP 方法 */
  method?: HttpMethod;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体 */
  body?: unknown;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否携带凭证 */
  credentials?: RequestCredentials;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * HTTP 响应结构
 */
export interface HttpResponse<T> {
  /** 响应数据 */
  data: T;
  /** HTTP 状态码 */
  status: number;
  /** 响应头 */
  headers: Record<string, string>;
}

/**
 * HTTP 错误类型
 */
export class HttpError extends Error {
  /** HTTP 状态码 */
  public readonly status: number;
  /** 错误代码 */
  public readonly code: string;
  /** 原始响应数据 */
  public readonly responseData?: unknown;

  constructor(message: string, status: number, code?: string, responseData?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code || 'HTTP_ERROR';
    this.responseData = responseData;
  }

  /**
   * 检查是否为未授权错误 (401)
   */
  isUnauthorized(): boolean {
    return this.status === 401;
  }

  /**
   * 检查是否为禁止访问错误 (403)
   */
  isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * 检查是否为未找到错误 (404)
   */
  isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * 检查是否为服务器错误 (5xx)
   */
  isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }
}

// ===================== 接口定义 =====================

/**
 * HTTP 客户端接口
 *
 * 定义统一的 HTTP 请求 API，所有实现必须遵循此接口。
 * Token 操作采用异步方法以支持 Tauri Store 等异步存储方案。
 *
 * @example
 * ```typescript
 * const client: IHttpClient = new TauriHttpClient('https://api.example.com');
 *
 * // GET 请求
 * const users = await client.get<User[]>('/users');
 *
 * // POST 请求
 * const newUser = await client.post<User>('/users', { name: 'John' });
 *
 * // 带认证的请求
 * await client.setToken('jwt-token');
 * const profile = await client.get<UserProfile>('/profile');
 * ```
 */
export interface IHttpClient {
  /**
   * 发送 HTTP 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL（相对路径或绝对路径）
   * @param options 请求选项
   * @returns Promise<T> 响应数据
   * @throws {HttpError} 当请求失败时抛出
   */
  request<T>(url: string, options?: RequestOptions): Promise<T>;

  /**
   * 发送 GET 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  get<T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;

  /**
   * 发送 POST 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param body 请求体数据
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  post<T>(
    url: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;

  /**
   * 发送 PUT 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param body 请求体数据
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  put<T>(
    url: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;

  /**
   * 发送 DELETE 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  delete<T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;

  /**
   * 发送 PATCH 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param body 请求体数据
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  patch<T>(
    url: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;

  /**
   * 获取当前存储的认证令牌
   *
   * @returns Promise 解析为令牌字符串，如果未设置则返回 null
   */
  getToken(): Promise<string | null>;

  /**
   * 设置认证令牌
   *
   * 设置后，所有请求将自动携带 Authorization: Bearer <token> 头
   *
   * @param token JWT 或其他认证令牌
   */
  setToken(token: string): Promise<void>;

  /**
   * 清除认证令牌
   *
   * 清除后，请求将不再携带 Authorization 头
   */
  clearToken(): Promise<void>;

  /**
   * 设置 401 未授权回调
   *
   * 当收到 401 响应时，会自动清除令牌并调用此回调
   *
   * @param callback 回调函数，传入 null 可取消回调
   */
  setOnUnauthorized?(callback: (() => void) | null): void;
}

// ===================== 常量定义 =====================

/**
 * Token 存储键名
 */
export const TOKEN_STORAGE_KEY = 'auth_token';

/**
 * 默认超时时间（毫秒）
 */
export const DEFAULT_TIMEOUT = 30000;
