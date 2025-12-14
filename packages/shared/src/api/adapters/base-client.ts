/**
 * API客户端基类
 * 提供通用的HTTP请求方法、错误处理、重试机制等
 */

import type {
  ApiResponse,
  ApiError,
  ApiClientConfig,
  RequestOptions,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from '../types/common';

import {
  createAbortController,
  delay,
  exponentialBackoff,
  buildQueryString,
  mergeConfig,
  shouldRetry,
  parseApiError,
  getAuthToken,
  logger,
} from '../utils/helpers';

/**
 * API客户端基类
 */
export class ApiClient {
  private config: Required<ApiClientConfig>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseURL: config.baseURL || '/api',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      enableLog: config.enableLog ?? process.env.NODE_ENV === 'development',
      headers: config.headers || {},
      token: config.token || '',
      getToken: config.getToken || getAuthToken,
    };
  }

  /**
   * 添加请求拦截器
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * 添加错误拦截器
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ApiClientConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * 获取完整URL
   */
  private getFullUrl(url: string, params?: Record<string, any>): string {
    const baseURL = this.config.baseURL;
    const fullUrl = url.startsWith('http') ? url : `${baseURL}${url}`;
    const queryString = buildQueryString(params);
    return `${fullUrl}${queryString}`;
  }

  /**
   * 获取请求头
   */
  private async getHeaders(
    additionalHeaders?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...additionalHeaders,
    };

    // 添加认证Token
    const token = this.config.token || (await this.config.getToken());
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * 应用请求拦截器
   */
  private async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let result = config;

    for (const interceptor of this.requestInterceptors) {
      result = await interceptor(result);
    }

    return result;
  }

  /**
   * 应用响应拦截器
   */
  private async applyResponseInterceptors<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> {
    let result = response;

    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }

    return result;
  }

  /**
   * 应用错误拦截器
   */
  private async applyErrorInterceptors(error: ApiError): Promise<ApiError> {
    let result = error;

    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }

    return result;
  }

  /**
   * 发起HTTP请求
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: string,
    options: RequestOptions & { data?: any } = {},
  ): Promise<ApiResponse<T>> {
    const {
      signal,
      timeout = this.config.timeout,
      retry = true,
      retries = this.config.retries,
      headers: optionHeaders,
      params,
      data,
    } = options;

    let attempt = 0;
    let lastError: ApiError | null = null;

    while (attempt <= retries) {
      try {
        // 创建请求配置
        let requestConfig: RequestConfig = {
          url,
          method,
          data,
          params,
          headers: optionHeaders,
          signal,
          timeout,
        };

        // 应用请求拦截器
        requestConfig = await this.applyRequestInterceptors(requestConfig);

        // 创建AbortController
        const controller = signal ? undefined : createAbortController(timeout);
        const abortSignal = signal || controller?.signal;

        // 获取完整URL和请求头
        const fullUrl = this.getFullUrl(requestConfig.url, requestConfig.params);
        const headers = await this.getHeaders(requestConfig.headers);

        if (this.config.enableLog) {
          logger.debug(`${method} ${fullUrl}`, data);
        }

        // 发起请求
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: abortSignal,
        };

        if (data && method !== 'GET') {
          fetchOptions.body = JSON.stringify(data);
        }

        const response = await fetch(fullUrl, fetchOptions);

        // 解析响应
        let result: ApiResponse<T>;
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          result = await response.json();
        } else {
          const text = await response.text();
          result = {
            success: response.ok,
            data: text as any,
          };
        }

        // 检查HTTP状态
        if (!response.ok) {
          throw parseApiError({
            response: {
              status: response.status,
              data: result,
            },
          });
        }

        // 应用响应拦截器
        result = await this.applyResponseInterceptors(result);

        if (this.config.enableLog) {
          logger.debug(`${method} ${fullUrl} - Success`, result);
        }

        return result;
      } catch (error: any) {
        lastError = parseApiError(error);

        // 应用错误拦截器
        lastError = await this.applyErrorInterceptors(lastError);

        // 判断是否需要重试
        if (!retry || !shouldRetry(lastError, attempt, retries)) {
          if (this.config.enableLog) {
            logger.error(`${method} ${url} - Error`, lastError);
          }
          throw lastError;
        }

        attempt++;
        const retryDelay = exponentialBackoff(attempt, this.config.retryDelay);

        if (this.config.enableLog) {
          logger.warn(
            `${method} ${url} - Retry ${attempt}/${retries} after ${retryDelay}ms`,
            lastError,
          );
        }

        await delay(retryDelay);
      }
    }

    throw lastError!;
  }

  /**
   * GET请求
   */
  async get<T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', url, options);
  }

  /**
   * POST请求
   */
  async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', url, { ...options, data });
  }

  /**
   * PUT请求
   */
  async put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', url, { ...options, data });
  }

  /**
   * DELETE请求
   */
  async delete<T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', url, options);
  }

  /**
   * PATCH请求
   */
  async patch<T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', url, { ...options, data });
  }
}

/**
 * 创建API客户端实例
 */
export function createApiClient(config?: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
