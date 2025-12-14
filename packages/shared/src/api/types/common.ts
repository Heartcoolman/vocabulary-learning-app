/**
 * 通用API类型定义
 */

/**
 * API响应基础类型
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * API错误类型
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public response?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API客户端配置
 */
export interface ApiClientConfig {
  /** 基础URL */
  baseURL?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 是否启用日志 */
  enableLog?: boolean;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 认证Token */
  token?: string;
  /** Token获取函数 */
  getToken?: () => string | null | Promise<string | null>;
}

/**
 * 请求选项
 */
export interface RequestOptions {
  /** 取消令牌 */
  signal?: AbortSignal;
  /** 超时时间 */
  timeout?: number;
  /** 是否重试 */
  retry?: boolean;
  /** 重试次数 */
  retries?: number;
  /** 额外的请求头 */
  headers?: Record<string, string>;
  /** 查询参数 */
  params?: Record<string, any>;
}

/**
 * 请求拦截器
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;

/**
 * 响应拦截器
 */
export type ResponseInterceptor<T = any> = (
  response: ApiResponse<T>,
) => ApiResponse<T> | Promise<ApiResponse<T>>;

/**
 * 错误拦截器
 */
export type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;

/**
 * 请求配置
 */
export interface RequestConfig extends RequestOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  baseURL?: string;
}

/**
 * API版本信息
 */
export interface ApiVersionInfo {
  version: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  migrationGuide?: string;
}
