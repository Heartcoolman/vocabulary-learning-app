/**
 * BaseClient 和 TokenManager Tests
 * 测试新的模块化 Client 架构的核心功能：请求方法、错误处理、Token 管理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger module
const mockLoggerFn = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => mockLoggerFn),
  flush: vi.fn(),
  configure: vi.fn(),
};

vi.mock('../../utils/logger', () => ({
  logger: mockLoggerFn,
  apiLogger: mockLoggerFn,
  authLogger: mockLoggerFn,
  amasLogger: mockLoggerFn,
  learningLogger: mockLoggerFn,
  storageLogger: mockLoggerFn,
  uiLogger: mockLoggerFn,
  adminLogger: mockLoggerFn,
  trackingLogger: mockLoggerFn,
  createLogger: vi.fn(() => mockLoggerFn),
}));

describe('新的模块化 Client 架构', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.store = {};
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TokenManager', () => {
    it('should be a singleton', async () => {
      const { default: TokenManager } = await import('../client/base/TokenManager');

      const instance1 = TokenManager.getInstance();
      const instance2 = TokenManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should store token in localStorage when setToken is called', async () => {
      vi.resetModules();
      const { default: TokenManager } = await import('../client/base/TokenManager');

      const tokenManager = TokenManager.getInstance();
      tokenManager.setToken('new-jwt-token');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'new-jwt-token');
      expect(tokenManager.getToken()).toBe('new-jwt-token');
    });

    it('should clear token from localStorage when clearToken is called', async () => {
      vi.resetModules();
      const { default: TokenManager } = await import('../client/base/TokenManager');

      const tokenManager = TokenManager.getInstance();
      tokenManager.setToken('token-to-clear');
      tokenManager.clearToken();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
      expect(tokenManager.getToken()).toBeNull();
    });

    it('should retrieve token correctly', async () => {
      vi.resetModules();
      const { default: TokenManager } = await import('../client/base/TokenManager');

      const tokenManager = TokenManager.getInstance();
      tokenManager.setToken('stored-token');
      expect(tokenManager.getToken()).toBe('stored-token');
    });
  });

  describe('ApiError', () => {
    it('should export ApiError class with correct properties', async () => {
      const { ApiError } = await import('../client/base/BaseClient');
      const error = new ApiError('测试错误', 404, 'NOT_FOUND');

      expect(error.message).toBe('测试错误');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.isNotFound).toBe(true);
    });

    it('should set isNotFound to false for non-404 errors', async () => {
      const { ApiError } = await import('../client/base/BaseClient');
      const error = new ApiError('服务器错误', 500, 'SERVER_ERROR');

      expect(error.isNotFound).toBe(false);
    });

    it('should use default code when not provided', async () => {
      const { ApiError } = await import('../client/base/BaseClient');
      const error = new ApiError('错误', 400);

      expect(error.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('AuthClient', () => {
    let AuthClient: any;
    let authClient: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('../client/auth/AuthClient');
      AuthClient = module.AuthClient;
      authClient = new AuthClient();
    });

    describe('POST 请求', () => {
      it('should make POST request with method POST for login', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: '1' }, token: 'jwt' },
            }),
        });

        await authClient.login('test@example.com', 'password123');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/auth/login'),
          expect.objectContaining({
            method: 'POST',
          }),
        );
      });

      it('should send JSON body with correct Content-Type', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: '1' }, token: 'jwt' },
            }),
        });

        await authClient.login('test@example.com', 'password123');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'password123',
            }),
          }),
        );
      });
    });

    describe('Token 管理', () => {
      it('should include Authorization header when token is set', async () => {
        authClient.setToken('test-jwt-token');

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () =>
            Promise.resolve({
              success: true,
              data: { id: '1', email: 'test@example.com', username: 'test', role: 'USER' },
            }),
        });

        await authClient.getCurrentUser();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-jwt-token',
            }),
          }),
        );
      });

      it('should store token via setToken', () => {
        authClient.setToken('new-jwt-token');
        expect(authClient.getToken()).toBe('new-jwt-token');
      });

      it('should clear token via clearToken', () => {
        authClient.setToken('token-to-clear');
        authClient.clearToken();
        expect(authClient.getToken()).toBeNull();
      });
    });

    describe('错误处理', () => {
      it('should handle 401 error and clear token', async () => {
        authClient.setToken('expired-token');

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          bodyUsed: false,
          text: () => Promise.resolve(JSON.stringify({ error: '认证失败' })),
          headers: new Map([['content-type', 'application/json']]),
        });

        await expect(authClient.getCurrentUser()).rejects.toThrow();
        expect(authClient.getToken()).toBeNull();
      });

      it('should handle 500 server error', async () => {
        authClient.setToken('valid-token');

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({ success: false, error: '服务器内部错误' }),
        });

        await expect(authClient.getCurrentUser()).rejects.toThrow('服务器内部错误');
      });

      it('should handle network error', async () => {
        authClient.setToken('valid-token');

        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(authClient.getCurrentUser()).rejects.toThrow('Network error');
      });
    });

    describe('401 回调机制', () => {
      it('should call onUnauthorized callback when 401 response is received', async () => {
        const onUnauthorizedCallback = vi.fn();
        authClient.setOnUnauthorized(onUnauthorizedCallback);
        authClient.setToken('expired-token');

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          bodyUsed: false,
          text: () => Promise.resolve(JSON.stringify({ error: 'Token expired' })),
          headers: new Map([['content-type', 'application/json']]),
        });

        await expect(authClient.getCurrentUser()).rejects.toThrow();
        expect(onUnauthorizedCallback).toHaveBeenCalled();
      });
    });

    describe('空响应处理', () => {
      it('should handle 204 No Content response', async () => {
        authClient.setToken('valid-token');

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 204,
          headers: new Map([['content-length', '0']]),
        });

        const result = await authClient.logout();
        expect(result).toBeUndefined();
      });
    });

    describe('请求超时处理', () => {
      it('should abort request when timeout is reached', async () => {
        authClient.setToken('valid-token');

        // 模拟一个会超时的请求
        mockFetch.mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              setTimeout(() => reject(error), 100);
            }),
        );

        await expect(authClient.getCurrentUser()).rejects.toThrow('请求超时');
      });
    });
  });

  describe('新 API Client 结构导出', () => {
    it('should export all client instances', async () => {
      const module = await import('../client');

      expect(module.authClient).toBeDefined();
      expect(module.wordClient).toBeDefined();
      expect(module.wordBookClient).toBeDefined();
      expect(module.learningClient).toBeDefined();
      expect(module.amasClient).toBeDefined();
      expect(module.adminClient).toBeDefined();
      expect(module.llmAdvisorClient).toBeDefined();
    });

    it('should export ApiClient object with all clients', async () => {
      const module = await import('../client');

      expect(module.ApiClient.auth).toBeDefined();
      expect(module.ApiClient.word).toBeDefined();
      expect(module.ApiClient.wordBook).toBeDefined();
      expect(module.ApiClient.learning).toBeDefined();
      expect(module.ApiClient.amas).toBeDefined();
      expect(module.ApiClient.admin).toBeDefined();
      expect(module.ApiClient.llmAdvisor).toBeDefined();
    });

    it('should provide setOnUnauthorized method on ApiClient', async () => {
      const module = await import('../client');

      expect(typeof module.ApiClient.setOnUnauthorized).toBe('function');
    });

    it('should export BaseClient and ApiError', async () => {
      const module = await import('../client');

      expect(module.BaseClient).toBeDefined();
      expect(module.ApiError).toBeDefined();
    });

    it('should export TokenManager', async () => {
      const module = await import('../client');

      expect(module.TokenManager).toBeDefined();
    });
  });
});
