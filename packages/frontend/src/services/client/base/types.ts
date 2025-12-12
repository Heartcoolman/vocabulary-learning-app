/**
 * API 客户端共享类型定义
 * 此文件定义了 BaseClient 和 HttpClient 共享的类型，避免循环依赖
 */

/**
 * API 响应格式
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * API 请求错误类型
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

/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions extends RequestInit {
  /** 请求超时时间（毫秒） */
  timeout?: number;
}

/**
 * HTTP 客户端接口
 * 定义 HTTP 请求的抽象层，支持依赖注入和测试模拟
 */
export interface IHttpClient {
  /**
   * 发送 HTTP 请求
   * @param endpoint API 端点（相对路径）
   * @param options 请求选项
   * @returns Promise 返回响应数据
   */
  request<T>(endpoint: string, options?: HttpRequestOptions): Promise<T>;

  /**
   * 发送 HTTP 请求，返回完整响应体
   * @param endpoint API 端点（相对路径）
   * @param options 请求选项
   * @returns Promise 返回完整响应体
   */
  requestFull<T>(endpoint: string, options?: HttpRequestOptions): Promise<T>;

  /**
   * 设置 401 未授权回调
   * @param callback 回调函数
   */
  setOnUnauthorized(callback: (() => void) | null): void;

  /**
   * 获取基础 URL
   */
  getBaseUrl(): string;
}
