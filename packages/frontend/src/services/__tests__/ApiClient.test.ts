/**
 * ApiClient Tests
 * 测试 ApiClient 的核心功能：请求方法、错误处理、Token 管理
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

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { VITE_API_URL: '' } } });

// Mock apiLogger
vi.mock('../../utils/logger', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ApiClient', () => {
  let ApiClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.store = {};
    vi.resetModules();

    // 动态导入以确保每个测试使用新实例
    const module = await import('../ApiClient');
    ApiClient = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET 请求', () => {
    it('should make GET request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 'word-1',
                spelling: 'test',
                phonetic: '/test/',
                meanings: ['测试'],
                examples: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      const result = await ApiClient.getWords();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/words'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should include Authorization header when token is set', async () => {
      // 设置 token
      ApiClient.setToken('test-jwt-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      await ApiClient.getWords();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
        }),
      );
    });

    it('should handle query params correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            success: true,
            data: [],
            pagination: { page: 2, pageSize: 10, total: 100, totalPages: 10 },
          }),
      });

      await ApiClient.getRecords({ page: 2, pageSize: 10 });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pageSize=10'),
        expect.any(Object),
      );
    });
  });

  describe('POST 请求', () => {
    it('should make POST request with method POST', async () => {
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

      await ApiClient.login('test@example.com', 'password123');

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

      await ApiClient.login('test@example.com', 'password123');

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

  describe('PUT 请求', () => {
    it('should make PUT request with method PUT', async () => {
      ApiClient.setToken('test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              id: 'config-1',
              selectedWordBookIds: ['wb-1'],
              dailyWordCount: 50,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      await ApiClient.updateStudyConfig({
        selectedWordBookIds: ['wb-1'],
        dailyWordCount: 50,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/study-config'),
        expect.objectContaining({
          method: 'PUT',
        }),
      );
    });
  });

  describe('DELETE 请求', () => {
    it('should make DELETE request with method DELETE', async () => {
      ApiClient.setToken('test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Map([['content-length', '0']]),
      });

      await ApiClient.deleteWord('word-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/words/word-123'),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });
  });

  describe('错误处理', () => {
    it('should handle 401 error and clear token', async () => {
      ApiClient.setToken('expired-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        bodyUsed: false,
        text: () => Promise.resolve(JSON.stringify({ error: '认证失败' })),
        headers: new Map([['content-type', 'application/json']]),
      });

      await expect(ApiClient.getCurrentUser()).rejects.toThrow();
      expect(ApiClient.getToken()).toBeNull();
    });

    it('should handle 404 error', async () => {
      ApiClient.setToken('valid-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ success: false, error: '资源不存在' }),
      });

      const result = await ApiClient.getWordLearningState('non-existent-word');
      expect(result).toBeNull();
    });

    it('should handle 500 server error', async () => {
      ApiClient.setToken('valid-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ success: false, error: '服务器内部错误' }),
      });

      await expect(ApiClient.getWords()).rejects.toThrow('服务器内部错误');
    });

    it('should handle network error', async () => {
      ApiClient.setToken('valid-token');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(ApiClient.getWords()).rejects.toThrow('Network error');
    });
  });

  describe('Token 管理', () => {
    it('should store token in localStorage when setToken is called', () => {
      ApiClient.setToken('new-jwt-token');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'new-jwt-token');
      expect(ApiClient.getToken()).toBe('new-jwt-token');
    });

    it('should retrieve token correctly', () => {
      ApiClient.setToken('stored-token');
      expect(ApiClient.getToken()).toBe('stored-token');
    });

    it('should clear token from localStorage when clearToken is called', () => {
      ApiClient.setToken('token-to-clear');
      ApiClient.clearToken();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
      expect(ApiClient.getToken()).toBeNull();
    });
  });

  describe('请求超时处理', () => {
    it('should abort request when timeout is reached', async () => {
      ApiClient.setToken('valid-token');

      // 模拟一个会超时的请求
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            setTimeout(() => reject(error), 100);
          }),
      );

      await expect(ApiClient.getWords()).rejects.toThrow('请求超时');
    });
  });

  describe('401 回调机制', () => {
    it('should call onUnauthorized callback when 401 response is received', async () => {
      const onUnauthorizedCallback = vi.fn();
      ApiClient.setOnUnauthorized(onUnauthorizedCallback);
      ApiClient.setToken('expired-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        bodyUsed: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Token expired' })),
        headers: new Map([['content-type', 'application/json']]),
      });

      await expect(ApiClient.getCurrentUser()).rejects.toThrow();
      expect(onUnauthorizedCallback).toHaveBeenCalled();
    });
  });

  describe('响应数据转换', () => {
    it('should convert API date strings to timestamps for Word', async () => {
      const isoDate = '2024-01-01T12:00:00.000Z';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 'word-1',
                spelling: 'test',
                phonetic: '/test/',
                meanings: ['测试'],
                examples: ['This is a test.'],
                createdAt: isoDate,
                updatedAt: isoDate,
              },
            ],
          }),
      });

      const words = await ApiClient.getWords();

      expect(words[0].createdAt).toBe(new Date(isoDate).getTime());
      expect(words[0].updatedAt).toBe(new Date(isoDate).getTime());
    });
  });

  describe('空响应处理', () => {
    it('should handle 204 No Content response', async () => {
      ApiClient.setToken('valid-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Map([['content-length', '0']]),
      });

      const result = await ApiClient.logout();
      expect(result).toBeUndefined();
    });
  });

  describe('ApiError 类', () => {
    it('should export ApiError class with correct properties', async () => {
      const { ApiError } = await import('../ApiClient');
      const error = new ApiError('测试错误', 404, 'NOT_FOUND');

      expect(error.message).toBe('测试错误');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.isNotFound).toBe(true);
    });
  });

  describe('批量操作', () => {
    it('should handle batch GET word learning states', async () => {
      ApiClient.setToken('valid-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                wordId: 'word-1',
                state: {
                  id: 'state-1',
                  userId: 'user-1',
                  wordId: 'word-1',
                  state: 'learning',
                  masteryLevel: 2,
                  easeFactor: 2.5,
                  reviewCount: 3,
                  lastReviewDate: '2024-01-01T00:00:00.000Z',
                  nextReviewDate: '2024-01-08T00:00:00.000Z',
                  currentInterval: 7,
                  consecutiveCorrect: 2,
                  consecutiveWrong: 0,
                  createdAt: '2024-01-01T00:00:00.000Z',
                  updatedAt: '2024-01-01T00:00:00.000Z',
                },
              },
              { wordId: 'word-2', state: null },
            ],
          }),
      });

      const states = await ApiClient.getWordLearningStates(['word-1', 'word-2']);

      expect(states).toHaveLength(1);
      expect(states[0].wordId).toBe('word-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/word-states/batch'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ wordIds: ['word-1', 'word-2'] }),
        }),
      );
    });

    it('should return empty array for empty wordIds input', async () => {
      const states = await ApiClient.getWordLearningStates([]);
      expect(states).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
