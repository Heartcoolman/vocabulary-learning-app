/**
 * AuthClient 单元测试
 * 测试认证相关 API 客户端功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthClient, User } from '../auth/AuthClient';
import TokenManager from '../base/TokenManager';

describe('AuthClient', () => {
  let client: AuthClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockTokenManager: {
    getToken: ReturnType<typeof vi.fn>;
    setToken: ReturnType<typeof vi.fn>;
    clearToken: ReturnType<typeof vi.fn>;
    hasValidToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Mock TokenManager
    mockTokenManager = {
      getToken: vi.fn().mockReturnValue('mock-token'),
      setToken: vi.fn(),
      clearToken: vi.fn(),
      hasValidToken: vi.fn().mockReturnValue(true),
    };

    vi.spyOn(TokenManager, 'getInstance').mockReturnValue(
      mockTokenManager as unknown as TokenManager,
    );

    client = new AuthClient('http://localhost:3000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: mockUser, token: 'new-token' },
          }),
      });

      const result = await client.register('test@example.com', 'password123', 'testuser');

      expect(result.user).toEqual(mockUser);
      expect(result.token).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
            username: 'testuser',
          }),
        }),
      );
    });

    it('should handle registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: false,
            error: '邮箱已被注册',
            code: 'EMAIL_EXISTS',
          }),
      });

      await expect(
        client.register('existing@example.com', 'password123', 'testuser'),
      ).rejects.toThrow('邮箱已被注册');
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: mockUser, token: 'login-token' },
          }),
      });

      const result = await client.login('test@example.com', 'password123');

      expect(result.user).toEqual(mockUser);
      expect(result.token).toBe('login-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        }),
      );
    });

    it('should handle invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        bodyUsed: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ error: '邮箱或密码错误' })),
      });

      await expect(client.login('wrong@example.com', 'wrongpassword')).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ 'content-length': '0' }),
      });

      await expect(client.logout()).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user successfully', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockUser,
          }),
      });

      const result = await client.getCurrentUser();

      expect(result).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        }),
      );
    });

    it('should handle unauthorized access', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        bodyUsed: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ error: '未授权' })),
      });

      await expect(client.getCurrentUser()).rejects.toThrow();
    });
  });

  describe('updatePassword', () => {
    it('should update password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: undefined,
          }),
      });

      await expect(client.updatePassword('oldPass123', 'newPass456')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/me/password',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            oldPassword: 'oldPass123',
            newPassword: 'newPass456',
          }),
        }),
      );
    });

    it('should handle wrong old password', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: false,
            error: '原密码错误',
          }),
      });

      await expect(client.updatePassword('wrongOld', 'newPass')).rejects.toThrow('原密码错误');
    });
  });

  describe('getUserStatistics', () => {
    it('should get user statistics successfully', async () => {
      const mockStats = {
        totalWords: 100,
        totalRecords: 500,
        correctRate: 0.85,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockStats,
          }),
      });

      const result = await client.getUserStatistics();

      expect(result).toEqual(mockStats);
    });
  });

  describe('token management', () => {
    it('should set token via setToken', () => {
      client.setToken('new-token');

      expect(mockTokenManager.setToken).toHaveBeenCalledWith('new-token');
    });

    it('should clear token via clearToken', () => {
      client.clearToken();

      expect(mockTokenManager.clearToken).toHaveBeenCalled();
    });

    it('should get token via getToken', () => {
      const token = client.getToken();

      expect(token).toBe('mock-token');
      expect(mockTokenManager.getToken).toHaveBeenCalled();
    });
  });
});
