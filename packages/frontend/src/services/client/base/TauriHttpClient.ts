/**
 * Tauri 环境 HTTP 客户端实现
 *
 * 使用 Tauri HTTP 插件和 Store 插件实现 IHttpClient 接口
 * 适用于 Tauri 桌面和移动端环境
 *
 * 特性：
 * - 使用 @tauri-apps/plugin-http 进行网络请求
 * - 使用 @tauri-apps/plugin-store 持久化存储 Token
 * - 自动添加 Authorization 头
 * - 内置超时和错误处理
 * - 支持 401 未授权回调
 */

import type { IHttpClient, RequestOptions } from './IHttpClient';
import { HttpError, TOKEN_STORAGE_KEY, DEFAULT_TIMEOUT } from './IHttpClient';

// ===================== 类型定义 =====================

/**
 * Tauri HTTP fetch 函数类型
 */
type TauriFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Tauri Store 实例类型
 */
interface TauriStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  save(): Promise<void>;
}

/**
 * API 响应格式（与后端保持一致）
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ===================== 实现类 =====================

/**
 * Tauri 环境 HTTP 客户端
 *
 * 特点：
 * - 使用 Tauri HTTP 插件（@tauri-apps/plugin-http）进行网络请求
 * - 使用 Tauri Store 插件（@tauri-apps/plugin-store）持久化存储 Token
 * - 绕过浏览器 CORS 限制
 * - 统一错误处理
 *
 * @example
 * ```typescript
 * const client = new TauriHttpClient('https://api.example.com');
 *
 * // 设置令牌
 * await client.setToken('jwt-token');
 *
 * // 发送请求
 * const users = await client.get<User[]>('/users');
 * ```
 */
export class TauriHttpClient implements IHttpClient {
  /** 基础 URL */
  private baseUrl: string;

  /** 默认超时时间 */
  private defaultTimeout: number = DEFAULT_TIMEOUT;

  /** Tauri fetch 函数（延迟加载） */
  private fetchFn: TauriFetch | null = null;

  /** Tauri Store 实例（延迟加载） */
  private store: TauriStore | null = null;

  /** 内存缓存的 Token（减少异步读取） */
  private cachedToken: string | null = null;

  /** Token 是否已从 Store 加载 */
  private tokenLoaded: boolean = false;

  /** Token 加载 Promise（防止并发加载） */
  private tokenLoadPromise: Promise<void> | null = null;

  /** 401 未授权回调 */
  private onUnauthorizedCallback: (() => void) | null = null;

  /** Store 文件名 */
  private readonly storeName = 'auth.json';

  /**
   * 创建 TauriHttpClient 实例
   *
   * @param baseUrl 基础 URL，所有请求相对于此 URL
   * @param defaultTimeout 默认超时时间（毫秒），默认 30000
   */
  constructor(baseUrl: string, defaultTimeout: number = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // 移除尾部斜杠
    this.defaultTimeout = defaultTimeout;
  }

  // ===================== Tauri API 加载 =====================

  /**
   * 延迟加载 Tauri HTTP fetch 函数
   */
  private async getFetch(): Promise<TauriFetch> {
    if (this.fetchFn) {
      return this.fetchFn;
    }

    try {
      // 使用动态导入并忽略类型检查，因为模块只在 Tauri 环境中可用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const httpModule = (await import(/* @vite-ignore */ '@tauri-apps/plugin-http')) as any;
      this.fetchFn = httpModule.fetch as TauriFetch;
      if (!this.fetchFn) {
        throw new Error('fetch function not found in module');
      }
      return this.fetchFn;
    } catch (error) {
      console.error('[TauriHttpClient] 无法加载 @tauri-apps/plugin-http:', error);
      throw new HttpError(
        'Tauri HTTP 插件不可用，请确保在 Tauri 环境中运行',
        0,
        'TAURI_HTTP_NOT_AVAILABLE',
      );
    }
  }

  /**
   * 延迟加载 Tauri Store 实例
   */
  private async getStore(): Promise<TauriStore> {
    if (this.store) {
      return this.store;
    }

    try {
      // 使用动态导入并忽略类型检查，因为模块只在 Tauri 环境中可用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeModule = (await import(/* @vite-ignore */ '@tauri-apps/plugin-store')) as any;
      // Tauri Store v2 使用 load 方法创建或加载 Store
      this.store = (await storeModule.load(this.storeName, { autoSave: true })) as TauriStore;
      if (!this.store) {
        throw new Error('store not created');
      }
      return this.store;
    } catch (error) {
      console.error('[TauriHttpClient] 无法加载 @tauri-apps/plugin-store:', error);
      throw new HttpError(
        'Tauri Store 插件不可用，请确保在 Tauri 环境中运行',
        0,
        'TAURI_STORE_NOT_AVAILABLE',
      );
    }
  }

  // ===================== Token 管理 =====================

  /**
   * 确保 Token 已从 Store 加载到内存
   * 使用单例 Promise 防止并发加载
   */
  private async ensureTokenLoaded(): Promise<void> {
    if (this.tokenLoaded) {
      return;
    }

    if (this.tokenLoadPromise) {
      return this.tokenLoadPromise;
    }

    this.tokenLoadPromise = (async () => {
      try {
        const store = await this.getStore();
        this.cachedToken = await store.get<string>(TOKEN_STORAGE_KEY);
        this.tokenLoaded = true;
      } catch (error) {
        console.warn('[TauriHttpClient] 加载 Token 失败:', error);
        this.tokenLoaded = true; // 即使失败也标记为已加载，避免重复尝试
      } finally {
        this.tokenLoadPromise = null;
      }
    })();

    return this.tokenLoadPromise;
  }

  /**
   * 获取当前存储的认证令牌
   *
   * @returns Promise 解析为令牌字符串，如果未设置则返回 null
   */
  async getToken(): Promise<string | null> {
    await this.ensureTokenLoaded();
    return this.cachedToken;
  }

  /**
   * 设置认证令牌
   *
   * 设置后，所有请求将自动携带 Authorization: Bearer <token> 头
   *
   * @param token JWT 或其他认证令牌
   */
  async setToken(token: string): Promise<void> {
    try {
      const store = await this.getStore();
      await store.set(TOKEN_STORAGE_KEY, token);
      await store.save();
      this.cachedToken = token;
      this.tokenLoaded = true;
    } catch (error) {
      console.error('[TauriHttpClient] 保存 Token 失败:', error);
      // 即使持久化失败，也在内存中保存以支持当前会话
      this.cachedToken = token;
      this.tokenLoaded = true;
    }
  }

  /**
   * 清除认证令牌
   *
   * 清除后，请求将不再携带 Authorization 头
   */
  async clearToken(): Promise<void> {
    try {
      const store = await this.getStore();
      await store.delete(TOKEN_STORAGE_KEY);
      await store.save();
    } catch (error) {
      console.warn('[TauriHttpClient] 删除 Token 失败:', error);
    } finally {
      this.cachedToken = null;
    }
  }

  /**
   * 设置 401 未授权回调
   *
   * 当收到 401 响应时，会自动清除令牌并调用此回调
   *
   * @param callback 回调函数，传入 null 可取消回调
   */
  setOnUnauthorized(callback: (() => void) | null): void {
    this.onUnauthorizedCallback = callback;
  }

  // ===================== HTTP 请求方法 =====================

  /**
   * 发送 HTTP 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL（相对路径或绝对路径）
   * @param options 请求选项
   * @returns Promise<T> 响应数据
   * @throws {HttpError} 当请求失败时抛出
   */
  async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const tauriFetch = await this.getFetch();
    await this.ensureTokenLoaded();

    const { method = 'GET', headers = {}, body, timeout = this.defaultTimeout, signal } = options;

    // 构建完整 URL
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

    // 构建请求头
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // 添加 Authorization 头
    if (this.cachedToken) {
      requestHeaders['Authorization'] = `Bearer ${this.cachedToken}`;
    }

    // 创建超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 监听外部取消信号
    const abortHandler = () => controller.abort(signal?.reason);
    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    try {
      // 构建请求配置
      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal,
      };

      // 添加请求体（GET 请求不能有 body）
      if (body !== undefined && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      // 发送请求
      const response = await tauriFetch(fullUrl, fetchOptions);

      // 处理 401 未授权
      if (response.status === 401) {
        await this.clearToken();
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        const errorMessage = await this.extractErrorMessage(response, '认证失败，请重新登录');
        throw new HttpError(errorMessage, 401, 'UNAUTHORIZED');
      }

      // 处理空响应
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        if (!response.ok) {
          throw new HttpError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      // 检查响应类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new HttpError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      // 解析响应
      const data: ApiResponse<T> = await response.json();

      // 处理非成功响应
      if (!response.ok) {
        throw new HttpError(
          data.error || `请求失败: ${response.status}`,
          response.status,
          data.code,
          data,
        );
      }

      // 检查业务成功状态
      if (!data.success) {
        throw new HttpError(data.error || '请求失败', response.status, data.code, data);
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error) {
        // 处理超时错误
        if (error.name === 'AbortError') {
          throw new HttpError('请求超时，请检查网络连接', 0, 'TIMEOUT');
        }
        throw new HttpError(error.message, 0, 'NETWORK_ERROR');
      }

      throw new HttpError('网络请求失败', 0, 'UNKNOWN_ERROR');
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
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
   * 发送 GET 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  async get<T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * 发送 POST 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param body 请求体数据
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  async post<T>(
    url: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(url, { ...options, method: 'POST', body });
  }

  /**
   * 发送 PUT 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param body 请求体数据
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  async put<T>(
    url: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PUT', body });
  }

  /**
   * 发送 DELETE 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  async delete<T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  /**
   * 发送 PATCH 请求
   *
   * @template T 响应数据类型
   * @param url 请求 URL
   * @param body 请求体数据
   * @param options 请求选项（不包含 method 和 body）
   * @returns Promise<T> 响应数据
   */
  async patch<T>(
    url: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PATCH', body });
  }
}

// ===================== 导出 =====================

export default TauriHttpClient;
