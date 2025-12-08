/**
 * BaseClient 单元测试
 * 测试 API 客户端基类的核心功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseClient, ApiError, ApiResponse } from '../base/BaseClient';
import TokenManager from '../base/TokenManager';

// 创建一个具体的测试类继承 BaseClient
class TestClient extends BaseClient {
  constructor(baseUrl?: string) {
    super(baseUrl);
  }

  // 暴露 protected 方法供测试
  public async testRequest<T>(
    endpoint: string,
    options?: RequestInit,
    timeout?: number,
  ): Promise<T> {
    return this.request<T>(endpoint, options, timeout);
  }

  public async testRequestFull<T>(
    endpoint: string,
    options?: RequestInit,
    timeout?: number,
  ): Promise<T> {
    return this.requestFull<T>(endpoint, options, timeout);
  }
}

describe('BaseClient', () => {
  let client: TestClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Mock TokenManager
    vi.spyOn(TokenManager, 'getInstance').mockReturnValue({
      getToken: vi.fn().mockReturnValue('mock-token'),
      setToken: vi.fn(),
      clearToken: vi.fn(),
      hasValidToken: vi.fn().mockReturnValue(true),
    } as unknown as TokenManager);

    client = new TestClient('http://localhost:3000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request method', () => {
    it('should make a successful GET request', async () => {
      const mockData = { id: '1', name: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: true, data: mockData }),
      });

      const result = await client.testRequest('/api/test');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-token',
          }),
          credentials: 'include',
        }),
      );
    });

    it('should make a successful POST request with body', async () => {
      const requestBody = { email: 'test@example.com', password: 'password' };
      const mockData = { token: 'new-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: true, data: mockData }),
      });

      const result = await client.testRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
        }),
      );
    });

    it('should handle 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ 'content-length': '0' }),
      });

      const result = await client.testRequest('/api/resource');

      expect(result).toBeUndefined();
    });

    it('should handle 401 Unauthorized and call onUnauthorized callback', async () => {
      const onUnauthorizedMock = vi.fn();
      client.setOnUnauthorized(onUnauthorizedMock);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        bodyUsed: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ error: '认证失败' })),
      });

      await expect(client.testRequest('/api/protected')).rejects.toThrow(ApiError);
      expect(onUnauthorizedMock).toHaveBeenCalled();
    });

    it('should throw ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: false, error: 'Bad Request', code: 'BAD_REQUEST' }),
      });

      await expect(client.testRequest('/api/test')).rejects.toThrow(ApiError);
    });

    it('should throw ApiError with code when response success is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR' }),
      });

      try {
        await client.testRequest('/api/test');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle timeout', async () => {
      // 创建一个正确的 AbortError（在 Node.js 环境中 DOMException 可能不是 Error 的实例）
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(abortError);
      });

      await expect(client.testRequest('/api/slow', {}, 50)).rejects.toThrow(
        '请求超时，请检查网络连接',
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.testRequest('/api/test')).rejects.toThrow('Network error');
    });

    it('should handle non-JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const result = await client.testRequest('/api/text');

      expect(result).toBeUndefined();
    });

    it('should make request without token when not authenticated', async () => {
      vi.spyOn(TokenManager, 'getInstance').mockReturnValue({
        getToken: vi.fn().mockReturnValue(null),
        setToken: vi.fn(),
        clearToken: vi.fn(),
        hasValidToken: vi.fn().mockReturnValue(false),
      } as unknown as TokenManager);

      const newClient = new TestClient('http://localhost:3000');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: true, data: {} }),
      });

      await newClient.testRequest('/api/public');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('requestFull method', () => {
    it('should return full response body', async () => {
      const fullResponse = {
        success: true,
        data: [{ id: '1' }],
        pagination: { page: 1, total: 100 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(fullResponse),
      });

      const result = await client.testRequestFull('/api/list');

      expect(result).toEqual(fullResponse);
    });

    it('should handle 401 in requestFull', async () => {
      const onUnauthorizedMock = vi.fn();
      client.setOnUnauthorized(onUnauthorizedMock);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        bodyUsed: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ error: '未授权' })),
      });

      await expect(client.testRequestFull('/api/protected')).rejects.toThrow(ApiError);
      expect(onUnauthorizedMock).toHaveBeenCalled();
    });

    it('should throw error when requestFull response success is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: false, error: 'Failed' }),
      });

      await expect(client.testRequestFull('/api/test')).rejects.toThrow('Failed');
    });
  });

  describe('setOnUnauthorized', () => {
    it('should set and clear unauthorized callback', () => {
      const callback = vi.fn();

      client.setOnUnauthorized(callback);
      // The callback is stored internally

      client.setOnUnauthorized(null);
      // Now callback should not be called on 401
    });
  });
});

describe('ApiError', () => {
  it('should create ApiError with statusCode and code', () => {
    const error = new ApiError('Not Found', 404, 'NOT_FOUND');

    expect(error.message).toBe('Not Found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.isNotFound).toBe(true);
    expect(error.name).toBe('ApiError');
  });

  it('should set isNotFound to false for non-404 errors', () => {
    const error = new ApiError('Bad Request', 400, 'BAD_REQUEST');

    expect(error.isNotFound).toBe(false);
  });

  it('should use default code when not provided', () => {
    const error = new ApiError('Server Error', 500);

    expect(error.code).toBe('UNKNOWN_ERROR');
  });
});
